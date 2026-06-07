const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const cors = require("cors")({ origin: true });
const admin = require("firebase-admin");
const functions = require("firebase-functions");
const sharp = require("sharp");
const ImageTracer = require("imagetracerjs");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { v4: uuidv4 } = require("uuid");

let db = null;
let app = null;

function getDb() {
  if (!db) {
    const { initializeApp } = require("firebase-admin/app");
    const { getFirestore } = require("firebase-admin/firestore");
    app = initializeApp();
    db = getFirestore();
  }
  return db;
}

// ============================================================================
// RATE LIMITING & USAGE TRACKING
// ============================================================================

const RATE_LIMITS = {
  GEMINI_VISION: 100, // requests per hour
  GEMINI_TEXT: 200, // requests per hour
  BIM_ANALYSIS: 50, // requests per hour
  OPENAI: 200, // requests per hour
  ANTHROPIC: 200, // requests per hour
  DEEPSEEK: 200, // requests per hour
  CONVERT_TO_CAD: 50, // requests per hour
};

async function checkRateLimit(uid, endpoint) {
  const now = Date.now();
  const hourAgo = now - 3600000;
  
  const database = getDb();
  const usageRef = database.collection("usage").doc(uid);
  const usageDoc = await usageRef.get();
  const usage = usageDoc.data() || { requests: {} };
  
  const endpointRequests = usage.requests[endpoint] || [];
  const recentRequests = endpointRequests.filter((t) => t > hourAgo);
  
  const limit = RATE_LIMITS[endpoint] || 100;
  if (recentRequests.length >= limit) {
    throw new HttpsError(
      "resource-exhausted",
      `Rate limit exceeded for ${endpoint}. Maximum ${limit} requests per hour.`
    );
  }
  
  // Update usage
  recentRequests.push(now);
  usage.requests[endpoint] = recentRequests;
  usage.lastUpdated = now;
  
  await usageRef.set(usage, { merge: true });
}

async function logUsage(uid, endpoint, cost = 0) {
  const today = new Date().toISOString().split("T")[0];
  const database = getDb();
  const dailyRef = database.collection("daily_usage").doc(`${uid}_${today}`);
  
  await dailyRef.set({
    uid,
    date: today,
    requests: FieldValue.increment(1),
    cost: FieldValue.increment(cost),
    lastUpdated: new Date(),
  }, { merge: true });
}

const { FieldValue } = require("firebase-admin/firestore");

// ============================================================================
// AUTH MIDDLEWARE
// ============================================================================

function requireAuth(request) {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "You must be signed in.");
  }
  return request.auth.uid;
}

async function requirePaidUser(uid) {
  const database = getDb();
  const userDoc = await database.collection("users").doc(uid).get();
  const userData = userDoc.data() || {};
  
  if (!userData.isPaid && !userData.isAdmin) {
    if (!userData.subscription || userData.subscription.status !== "active") {
      throw new HttpsError(
        "permission-denied",
        "Active subscription required. Please upgrade to access AI features."
      );
    }
    
    if (userData.subscription.expiresAt && userData.subscription.expiresAt.toMillis() < Date.now()) {
      throw new HttpsError(
        "permission-denied",
        "Your subscription has expired. Please renew to continue using AI features."
      );
    }
  }
  
  return userData;
}

// ============================================================================
// GEMINI VISION - PDF ANNOTATION
// ============================================================================

exports.geminiAnnotate = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    const uid = requireAuth(request);
    await requirePaidUser(uid);
    await checkRateLimit(uid, "GEMINI_VISION");
    
    const { imageBase64, prompt, pageWidth, pageHeight } = request.data;
    
    if (!imageBase64 || !prompt) {
      throw new HttpsError("invalid-argument", "imageBase64 and prompt are required.");
    }
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: "image/jpeg",
                      data: imageBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 2048,
            },
          }),
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      await logUsage(uid, "GEMINI_VISION", 0.001);
      
      return { success: true, result: rawText };
    } catch (error) {
      console.error("Gemini annotate error:", error);
      throw new HttpsError("internal", "Failed to analyze with Gemini: " + error.message);
    }
  }
);

// ============================================================================
// GEMINI VISION - BIM ANALYSIS
// ============================================================================

exports.geminiBimAnalyze = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    const uid = requireAuth(request);
    await requirePaidUser(uid);
    await checkRateLimit(uid, "BIM_ANALYSIS");
    
    const { imageBase64, bimType } = request.data;
    
    if (!imageBase64 || !bimType) {
      throw new HttpsError("invalid-argument", "imageBase64 and bimType are required.");
    }
    
    const prompts = {
      door: `Analyze this image of a door and extract the following information in JSON format:
{
  "doorType": "one of: Single, Double, Sliding, Folding, Revolving",
  "doorWidth": "width as string, e.g., '36 inches' or '3 ft'",
  "doorHeight": "height as string, e.g., '80 inches' or '6'8\\"",
  "doorMaterial": "material, e.g., Wood, Steel, Glass",
  "doorFireRating": "fire rating if visible, e.g., '30 min', '60 min'",
  "doorManufacturer": "manufacturer name if visible",
  "notes": "any other observations about the door"
}
Only return the JSON object, no markdown, no explanation. If a field cannot be determined, set it to null or empty string.`,

      wall: `Analyze this image of a wall and extract the following information in JSON format:
{
  "wallType": "one of: Load-bearing, Partition, Curtain, Shear, Retaining",
  "wallThickness": "thickness as string, e.g., '4 inches' or '6 inches'",
  "wallHeight": "height as string, e.g., '8 ft' or '10 ft'",
  "wallMaterial": "material, e.g., Concrete, Brick, Drywall",
  "wallInsulation": "insulation type if visible, e.g., 'R-13', 'R-19'",
  "wallFireRating": "fire rating if visible, e.g., '1-hour', '2-hour'",
  "notes": "any other observations about the wall"
}
Only return the JSON object, no markdown, no explanation. If a field cannot be determined, set it to null or empty string.`,

      supplier: `Analyze this image and extract supplier information in JSON format:
{
  "supplierName": "company name",
  "supplierContact": "phone, email, or website",
  "supplierCategory": "product category, e.g., HVAC, Electrical, Plumbing",
  "notes": "any other observations about the supplier"
}
Only return the JSON object, no markdown, no explanation. If a field cannot be determined, set it to null or empty string.`,

      "fire-rating": `Analyze this image for fire rating information and extract in JSON format:
{
  "fireRatingValue": "fire rating, e.g., '1-hour', '2-hour', '3-hour'",
  "assemblyType": "one of: Wall, Floor, Ceiling, Roof",
  "testedAssembly": "tested assembly designation if visible, e.g., 'UL Design U301'",
  "notes": "any other observations about the fire rating"
}
Only return the JSON object, no markdown, no explanation. If a field cannot be determined, set it to null or empty string.`,
    };
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompts[bimType] },
                  {
                    inline_data: {
                      mime_type: "image/jpeg",
                      data: imageBase64,
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.2,
              maxOutputTokens: 1024,
            },
          }),
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || "{}";
      
      // Extract JSON from response
      let jsonStr = rawText.trim();
      if (jsonStr.startsWith("```")) {
        jsonStr = jsonStr.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "");
      }
      
      let result;
      try {
        result = JSON.parse(jsonStr);
      } catch {
        result = {};
      }
      
      await logUsage(uid, "BIM_ANALYSIS", 0.001);
      
      return { success: true, data: result };
    } catch (error) {
      console.error("BIM analysis error:", error);
      throw new HttpsError("internal", "Failed to analyze BIM image: " + error.message);
    }
  }
);

// ============================================================================
// GEMINI TEXT - PDF SUMMARY
// ============================================================================

exports.geminiSummarize = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    const uid = requireAuth(request);
    await requirePaidUser(uid);
    await checkRateLimit(uid, "GEMINI_TEXT");
    
    const { text, documentName } = request.data;
    
    if (!text) {
      throw new HttpsError("invalid-argument", "text is required.");
    }
    
    const truncated = text.slice(0, 100000);
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  {
                    text: `Analyze this PDF document ("${documentName}") and provide a comprehensive summary with key points, section details, and action items. Format as readable markdown with headings.\n\nDocument text:\n${truncated}`,
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.3,
              maxOutputTokens: 8192,
            },
          }),
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      const summary = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      await logUsage(uid, "GEMINI_TEXT", 0.002);
      
      return { success: true, summary };
    } catch (error) {
      console.error("Summary error:", error);
      throw new HttpsError("internal", "Failed to summarize: " + error.message);
    }
  }
);

// ============================================================================
// GEMINI TEXT - ENGINEERING PARAMETERS
// ============================================================================

exports.geminiEngParams = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    const uid = requireAuth(request);
    await requirePaidUser(uid);
    await checkRateLimit(uid, "GEMINI_TEXT");
    
    const { text, documentName } = request.data;
    
    if (!text) {
      throw new HttpsError("invalid-argument", "text is required.");
    }
    
    const truncated = text.slice(0, 120000);
    
    const prompt = `You are an expert structural/civil/mechanical/architectural engineer. Analyze this document ("${documentName}") and extract ALL engineering and architectural parameters you can find.

Return a JSON object with two keys (NO markdown, NO code fences):
{
  "parameters": [
    {
      "category": "<one of: Structural, Architectural, Mechanical, Electrical, Plumbing, Geotechnical, Environmental, Fire Safety, Seismic, Wind, General>",
      "parameter": "<name of parameter>",
      "value": "<numeric or descriptive value>",
      "unit": "<unit of measurement>",
      "page": "<page number if identifiable, or 'N/A'>",
      "notes": "<any context or conditions>"
    }
  ],
  "notes": "<A comprehensive plain-text summary of all engineering/architectural specifications found, organized by discipline. Include code references, design criteria, material specs, loading conditions, dimensions, setbacks, FAR, safety factors, reinforcement schedules, etc. Format as readable engineering notes.>"
}

Document text:
${truncated}`;
    
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{ parts: [{ text: prompt }] }],
            generationConfig: { temperature: 0.2, maxOutputTokens: 8192 },
          }),
        }
      );
      
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini API error: ${response.status} - ${errorText}`);
      }
      
      const data = await response.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";
      
      try {
        const jsonMatch = raw.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0]);
          await logUsage(uid, "GEMINI_TEXT", 0.003);
          return { success: true, data: parsed };
        }
      } catch {}
      
      await logUsage(uid, "GEMINI_TEXT", 0.002);
      return { success: true, data: { parameters: [], notes: raw } };
    } catch (error) {
      console.error("Engineering params error:", error);
      throw new HttpsError("internal", "Failed to extract parameters: " + error.message);
    }
  }
);

// ============================================================================
// EXISTING FUNCTIONS (kept for compatibility)
// ============================================================================

/**
 * Securely returns the Gemini API key to authenticated paid users.
 * DEPRECATED: Use the specific AI functions instead.
 */
exports.getApiKey = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    const uid = requireAuth(request);
    await requirePaidUser(uid);
    
    return {
      apiKey: process.env.GEMINI_API_KEY,
      expiresIn: 3600,
    };
  }
);

/**
 * Securely returns the OpenAI API key to authenticated paid users.
 */
exports.getOpenAiKey = onCall(
  { secrets: ["OPENAI_API_KEY"], cors: true },
  async (request) => {
    const uid = requireAuth(request);
    await requirePaidUser(uid);
    
    return {
      apiKey: process.env.OPENAI_API_KEY,
      expiresIn: 3600,
    };
  }
);

/**
 * Securely returns the Anthropic API key to authenticated paid users.
 */
exports.getAnthropicKey = onCall(
  { secrets: ["ANTHROPIC_API_KEY"], cors: true },
  async (request) => {
    const uid = requireAuth(request);
    await requirePaidUser(uid);
    
    return {
      apiKey: process.env.ANTHROPIC_API_KEY,
      expiresIn: 3600,
    };
  }
);

/**
 * Securely returns the DeepSeek API key to authenticated paid users.
 */
exports.getDeepSeekKey = onCall(
  { secrets: ["DEEPSEEK_API_KEY"], cors: true },
  async (request) => {
    const uid = requireAuth(request);
    await requirePaidUser(uid);
    
    return {
      apiKey: process.env.DEEPSEEK_API_KEY,
      expiresIn: 3600,
    };
  }
);

/**
 * Grant a license to a user (called by admin or payment webhook).
 */
exports.grantLicense = onCall(
  { cors: true },
  async (request) => {
    const uid = requireAuth(request);
    const database = getDb();
    
    const callerDoc = await database.collection("users").doc(uid).get();
    const callerData = callerDoc.data() || {};
    if (!callerData.isAdmin) {
      throw new HttpsError("permission-denied", "Admin access required.");
    }

    const { targetUid, plan, durationDays } = request.data;
    if (!targetUid) {
      throw new HttpsError("invalid-argument", "targetUid is required.");
    }

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (durationDays || 30));

    await database.collection("users").doc(targetUid).set(
      {
        isPaid: true,
        subscription: {
          plan: plan || "pro",
          status: "active",
          grantedAt: new Date(),
          expiresAt,
          grantedBy: uid,
        },
      },
      { merge: true }
    );

    return { success: true, expiresAt: expiresAt.toISOString() };
  }
);

/**
 * Validate a license key (for extension users who bought via external payment).
 */
exports.redeemLicenseKey = onCall(
  { cors: true },
  async (request) => {
    const uid = requireAuth(request);
    const database = getDb();

    const { licenseKey } = request.data;
    if (!licenseKey || typeof licenseKey !== "string") {
      throw new HttpsError("invalid-argument", "License key is required.");
    }

    const keyDoc = await database.collection("licenseKeys").doc(licenseKey.trim()).get();
    if (!keyDoc.exists) {
      throw new HttpsError("not-found", "Invalid license key.");
    }

    const keyData = keyDoc.data();
    if (keyData.redeemedBy) {
      throw new HttpsError("already-exists", "This license key has already been used.");
    }

    await database.collection("licenseKeys").doc(licenseKey.trim()).update({
      redeemedBy: uid,
      redeemedAt: new Date(),
    });

    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + (keyData.durationDays || 365));

    await database.collection("users").doc(uid).set(
      {
        isPaid: true,
        subscription: {
          plan: keyData.plan || "pro",
          status: "active",
          grantedAt: new Date(),
          expiresAt,
          licenseKey: licenseKey.trim(),
        },
      },
      { merge: true }
    );

    return {
      success: true,
      plan: keyData.plan || "pro",
      expiresAt: expiresAt.toISOString(),
    };
  }
);

// ============================================================================
// CONVERT TO CAD
// ============================================================================

exports.convertToCad = onCall(
  {
    maxInstances: 10,
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "2GiB",
  },
  async (request) => {
    const { uid } = request.auth;
    const { imageData, options, pageWidth, pageHeight } = request.data;

    if (!imageData) {
      throw new HttpsError("invalid-argument", "Image data is required");
    }

    // Check rate limit
    await checkRateLimit(uid, "CONVERT_TO_CAD");
    await logUsage(uid, "CONVERT_TO_CAD");

    try {
      // Convert base64 image to buffer
      const imageBuffer = Buffer.from(imageData.split(',')[1], 'base64');

      // Stage 1 & 2: Pre-process and Vectorize (now handled together in memory)
      console.log("Starting vectorization with imagetracerjs...");
      const svgString = await vectorizeWithImageTracer(imageBuffer);
      console.log("Vectorization complete, SVG length:", svgString.length);

      // Stage 3: Use Gemini Vision (on the IMAGE) for text and arcs
      console.log("Sending original image to Gemini for text and arcs...");
      const prompt = `You are an expert CAD digitizer. Analyze this architectural blueprint.
Image Dimensions: ${pageWidth} pixels wide by ${pageHeight} pixels high. 
Origin (0,0) is the top-left corner.

TASK:
1. Read all handwritten and printed TEXT on the blueprint (dimensions, room names, notes, title blocks).
2. For every piece of text, estimate the EXACT pixel coordinates (x, y) of its bottom-left starting point.
3. Identify any ARCS or CIRCLES and their center coordinates.

STRICT FORMAT (Plain text, no markdown):
ARCS: cx,cy,r,startAngle,endAngle|...
CIRCLES: cx,cy,r|...
TEXT: x,y;content;height|...

RULES FOR TEXT:
- Use semicolon (;) to separate x, y, content, and height. 
- Do NOT use commas in the text content itself.
- Guess the text height in pixels based on the image size (e.g., 12, 24, 36).
- Example: TEXT: 450,120;MASTER BEDROOM;24|800,950;SCALE 1/4"=1'-0";16`;

      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [
              {
                parts: [
                  { text: prompt },
                  {
                    inline_data: {
                      mime_type: "image/jpeg", 
                      // Use the original image data, NOT the SVG string!
                      data: imageData.split(',')[1],
                    },
                  },
                ],
              },
            ],
            generationConfig: {
              temperature: 0.1,
              maxOutputTokens: 8192,
            },
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Gemini error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      const raw = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

      // Parse SVG paths for lines from imagetracerjs output
      const geometry = {
        lines: [],
        arcs: [],
        circles: [],
        rectangles: [],
        text: [],
      };

      // Parse SVG paths to extract line segments
      const pathRegex = /<path[^>]*d="([^"]*)"[^>]*>/g;
      let pathMatch;
      
      while ((pathMatch = pathRegex.exec(svgString)) !== null) {
        const pathData = pathMatch[1];
        const commands = parsePathData(pathData);
        
        // Convert path commands to line segments
        let currentX = 0, currentY = 0;
        for (const cmd of commands) {
          if (cmd.type === 'M') {
            currentX = cmd.x;
            currentY = cmd.y;
          } else if (cmd.type === 'L') {
            geometry.lines.push({
              x1: currentX,
              y1: currentY,
              x2: cmd.x,
              y2: cmd.y,
              type: 'solid',
            });
            currentX = cmd.x;
            currentY = cmd.y;
          }
        }
      }

      // Parse Gemini response for arcs, circles, and text
      const lines = raw.trim().split('\n');
      
      for (const line of lines) {
        const trimmed = line.trim();
        if (trimmed.startsWith('ARCS:')) {
          const values = trimmed.substring(5).trim();
          if (values) {
            const elements = values.split('|');
            for (const elem of elements) {
              const parts = elem.trim().split(',').map(s => s.trim());
              if (parts.length >= 5) {
                geometry.arcs.push({
                  cx: parseFloat(parts[0]) || 0,
                  cy: parseFloat(parts[1]) || 0,
                  r: parseFloat(parts[2]) || 0,
                  startAngle: parseFloat(parts[3]) || 0,
                  endAngle: parseFloat(parts[4]) || 0,
                });
              }
            }
          }
        } else if (trimmed.startsWith('CIRCLES:')) {
          const values = trimmed.substring(8).trim();
          if (values) {
            const elements = values.split('|');
            for (const elem of elements) {
              const parts = elem.trim().split(',').map(s => s.trim());
              if (parts.length >= 3) {
                geometry.circles.push({
                  cx: parseFloat(parts[0]) || 0,
                  cy: parseFloat(parts[1]) || 0,
                  r: parseFloat(parts[2]) || 0,
                });
              }
            }
          }
        } else if (trimmed.startsWith('TEXT:')) {
          const values = trimmed.substring(5).trim();
          if (values) {
            const elements = values.split('|');
            for (const elem of elements) {
              const parts = elem.trim().split(';');
              if (parts.length >= 3) {
                const x = parseFloat(parts[0].trim()) || 0;
                const y = parseFloat(parts[1].trim()) || 0;
                const height = parseFloat(parts[parts.length - 1].trim()) || 12;
                const content = parts.slice(2, parts.length - 1).join(';').trim();
                geometry.text.push({
                  x, y, content, height,
                });
              }
            }
          }
        }
      }

      // Generate DXF content
      let dxfContent = "";
      if (options.outputFormat === "dxf" || options.outputFormat === "both") {
        dxfContent = generateDxf(geometry, options, pageWidth, pageHeight);
      }

      // Generate SVG content
      let svgContent = "";
      if (options.outputFormat === "svg" || options.outputFormat === "both") {
        svgContent = generateSvg(geometry, options, pageWidth, pageHeight);
      }

      return {
        result: {
          dxf: dxfContent || undefined,
          svg: svgContent || undefined,
        },
      };
    } catch (error) {
      console.error("Convert to CAD error:", error);
      throw new HttpsError(
        "internal",
        `Failed to convert to CAD: ${error.message}`
      );
    }
  }
);

function parsePathData(pathData) {
  const commands = [];
  const regex = /([MmLlHhVvCcSsQqTtAaZz])([^MmLlHhVvCcSsQqTtAaZz]*)/g;
  let match;
  
  while ((match = regex.exec(pathData)) !== null) {
    const type = match[1];
    const args = match[2].trim().split(/[\s,]+/).filter(Boolean).map(Number);
    
    if (type === 'M' || type === 'm') {
      for (let i = 0; i < args.length; i += 2) {
        commands.push({ type: 'M', x: args[i], y: args[i + 1] });
      }
    } else if (type === 'L' || type === 'l') {
      for (let i = 0; i < args.length; i += 2) {
        const prevCmd = commands[commands.length - 1];
        if (prevCmd) {
          const dx = args[i] - prevCmd.x;
          const dy = args[i + 1] - (prevCmd.y || 0); 
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          // Relaxed filter: Only ignore microscopic glitches, keep architectural details
          if (distance > 2) {
             commands.push({ type: 'L', x: args[i], y: args[i + 1] });
          }
        }
      }
    } 
  }
  return commands;
}

async function vectorizeWithImageTracer(imageBuffer) {
  // 1. Force sharp to output a strict 4-channel RGBA buffer
  const { data, info } = await sharp(imageBuffer)
    .ensureAlpha() // Guarantees RGBA format
    .raw()
    .toBuffer({ resolveWithObject: true });

  // 2. Instantly map to the typed array (Zero-Copy)
  const imgData = {
    width: info.width,
    height: info.height,
    data: new Uint8ClampedArray(data)
  };

  // 3. Configure tracer. 'pathomit' handles the noise reduction now.
  const options = {
    ltres: 0.5,       // Relaxed slightly to capture more detail
    qtres: 1.0,       
    pathomit: 16,     // This tells the algorithm to ignore tiny specs natively!
    colorsampling: 0, // Forces Black & White tracing
    numberofcolors: 2,
    mincolorratio: 0,
    colorquantcycles: 1,
    scale: 1,
    strokewidth: 0.5,
    linefilter: true
  };

  const svgString = ImageTracer.imagedataToSVG(imgData, options);
  
  if (!svgString) {
    throw new Error("Failed to generate SVG");
  }
  
  return svgString;
}

function generateDxf(geometry, options, pageWidth, pageHeight) {
  const scale = options.scale || 1.0;
  const lineWidth = options.lineWidth || 0.5;

  // Snap coordinates to nearest 0.1 for cleaner DXF
  const snap = (val) => Math.round(val * 10) / 10;

  let dxf = `0
SECTION
2
HEADER
9
$ACADVER
1
AC1009
0
ENDSEC
0
SECTION
2
TABLES
0
TABLE
2
LTYPE
70
1
0
LTYPE
2
CONTINUOUS
70
0
3
Solid line
72
65
73
0
40
0.0
0
ENDTAB
0
ENDSEC
0
SECTION
2
ENTITIES
`;

  // Add lines
  if (geometry.lines) {
    geometry.lines.forEach((line) => {
      dxf += `0
LINE
8
0
10
${snap(line.x1 * scale)}
20
${snap(pageHeight - line.y1 * scale)}
11
${snap(line.x2 * scale)}
21
${snap(pageHeight - line.y2 * scale)}
`;
    });
  }

  // Add circles
  if (geometry.circles) {
    geometry.circles.forEach((circle) => {
      dxf += `0
CIRCLE
8
0
10
${snap(circle.cx * scale)}
20
${snap(pageHeight - circle.cy * scale)}
40
${snap(circle.r * scale)}
`;
    });
  }

  // Add arcs
  if (geometry.arcs) {
    geometry.arcs.forEach((arc) => {
      dxf += `0
ARC
8
0
10
${snap(arc.cx * scale)}
20
${snap(pageHeight - arc.cy * scale)}
40
${snap(arc.r * scale)}
50
${snap(arc.startAngle)}
51
${snap(arc.endAngle)}
`;
    });
  }

  // Add rectangles
  if (geometry.rectangles) {
    geometry.rectangles.forEach((rect) => {
      // Draw rectangle as 4 lines
      const x1 = snap(rect.x * scale);
      const y1 = snap(pageHeight - rect.y * scale);
      const x2 = snap((rect.x + rect.width) * scale);
      const y2 = snap(pageHeight - (rect.y + rect.height) * scale);
      
      dxf += `0
LINE
8
0
10
${x1}
20
${y1}
11
${x2}
21
${y1}
0
LINE
8
0
10
${x2}
20
${y1}
11
${x2}
21
${y2}
0
LINE
8
0
10
${x2}
20
${y2}
11
${x1}
21
${y2}
0
LINE
8
0
10
${x1}
20
${y2}
11
${x1}
21
${y1}
`;
    });
  }

  // Add text
  if (options.detectText && geometry.text) {
    geometry.text.forEach((text) => {
      dxf += `0
TEXT
8
0
10
${snap(text.x * scale)}
20
${snap(pageHeight - text.y * scale)}
40
${snap(text.height * scale)}
1
${text.content}
`;
    });
  }

  dxf += `0
ENDSEC
0
EOF
`;

  return dxf;
}

function generateSvg(geometry, options, pageWidth, pageHeight) {
  const scale = options.scale || 1.0;
  const lineWidth = options.lineWidth || 0.5;

  // Snap coordinates to nearest 0.1 for cleaner SVG
  const snap = (val) => Math.round(val * 10) / 10;

  // Initialize the SVG string with the proper XML headers and viewport
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${snap(pageWidth * scale)}" height="${snap(pageHeight * scale)}" viewBox="0 0 ${snap(pageWidth * scale)} ${snap(pageHeight * scale)}">
  <g stroke="black" stroke-width="${lineWidth}" fill="none">
`;

  // Add lines
  if (geometry.lines) {
    geometry.lines.forEach((line) => {
      svg += `    <line x1="${snap(line.x1 * scale)}" y1="${snap(line.y1 * scale)}" x2="${snap(line.x2 * scale)}" y2="${snap(line.y2 * scale)}" />\n`;
    });
  }

  // Add circles
  if (geometry.circles) {
    geometry.circles.forEach((circle) => {
      svg += `    <circle cx="${snap(circle.cx * scale)}" cy="${snap(circle.cy * scale)}" r="${snap(circle.r * scale)}" />\n`;
    });
  }

  // Add arcs (simplified as paths)
  if (geometry.arcs) {
    geometry.arcs.forEach((arc) => {
      // Simplified arc representation
      svg += `    <path d="M ${snap(arc.cx * scale)} ${snap(arc.cy * scale)} A ${snap(arc.r * scale)} ${snap(arc.r * scale)} 0 0 1 ${snap(arc.cx * scale + arc.r * scale)} ${snap(arc.cy * scale)}" />\n`;
    });
  }

  // Add text
  if (options.detectText && geometry.text) {
    geometry.text.forEach((text) => {
      svg += `    <text x="${snap(text.x * scale)}" y="${snap(text.y * scale)}" font-size="${snap(text.height * scale)}" fill="black" stroke="none">${text.content}</text>\n`;
    });
  }

  svg += `  </g>
</svg>`;

  return svg;
} 
