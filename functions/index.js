const { onCall, HttpsError } = require("firebase-functions/v2/https");
const { onRequest } = require("firebase-functions/v2/https");
const cors = require("cors")({ origin: true });
const admin = require("firebase-admin");
const functions = require("firebase-functions");

// Initialize Firebase Admin app at module level
admin.initializeApp();

// Lazy-loaded modules (loaded on first use to avoid deployment timeout)
let _sharp = null;
let _ImageTracer = null;
function getSharp() { if (!_sharp) _sharp = require("sharp"); return _sharp; }
function getImageTracer() { if (!_ImageTracer) _ImageTracer = require("imagetracerjs"); return _ImageTracer; }

let db = null;

function getDb() {
  if (!db) {
    const { getFirestore } = require("firebase-admin/firestore");
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
  DEEP_REVIEW: 5, // requests per day (expensive batch processing)
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
 * Gemini text rewrite - proxies request to avoid CORS
 */
exports.anthropicRewrite = onCall(
  { secrets: ["GEMINI_API_KEY"], cors: true },
  async (request) => {
    const uid = requireAuth(request);
    await requirePaidUser(uid);
    await checkRateLimit(uid, "GEMINI_TEXT");

    const { prompt, text } = request.data;

    if (!text || !prompt) {
      throw new HttpsError("invalid-argument", "Missing required parameters: text and prompt");
    }

    // Strongly typed system prompt to prevent conversational overflow
    const systemPrompt = `
You are a precision document editing engine. Your task is to modify the text according to the instructions.

CRITICAL RULES:
1. Output EXACTLY the modified text and nothing else.
2. NEVER include conversational filler (e.g., "Here are the prices", "Sure").
3. NEVER use Markdown formatting, code fences (\`\`\`), or bolding (**).
4. If modifying a list or table column, keep the exact same number of line breaks.

Instruction: ${prompt}

Original Text:
${text}
`;

    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contents: [{
              parts: [{
                text: systemPrompt
              }]
            }],
            generationConfig: {
              temperature: 0.1, // Low temperature for highly deterministic output
            }
          })
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new HttpsError("internal", `Gemini API error: ${response.status} - ${errorText}`);
      }

      const data = await response.json();
      let rewrittenText = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();

      if (!rewrittenText) {
        throw new HttpsError("internal", "Failed to extract rewritten text from Gemini response");
      }

      // Final safety net: Forcefully strip markdown fences if Gemini disobeys
      rewrittenText = rewrittenText.replace(/^```[a-zA-Z]*\n/i, '').replace(/\n```$/, '').trim();

      await logUsage(uid, "GEMINI_TEXT", 0.002);
      return { rewrittenText };
    } catch (error) {
      console.error("Gemini rewrite error:", error);
      throw new HttpsError("internal", error.message || "Failed to call Gemini API");
    }
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
 * Securely returns the Kimi (Fireworks AI) API key to authenticated paid users.
 */
exports.getKimiKey = functions.https.onCall(async (request) => {
  const uid = requireAuth(request);
  await requirePaidUser(uid);

  const kimiKey = process.env.KIMI_API_KEY;
  return {
    apiKey: kimiKey,
    expiresIn: 3600,
  };
});

/**
 * Securely returns the Qwen API key to authenticated paid users.
 */
exports.getQwenKey = functions.https.onCall(async (request) => {
  const uid = requireAuth(request);
  await requirePaidUser(uid);

  const qwenKey = process.env.QWEN_API_KEY;
  return {
    apiKey: qwenKey,
    expiresIn: 3600,
  };
});

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
// CONVERT TO CAD (3-TIER WATERFALL ARCHITECTURE)
// ============================================================================

exports.convertToCad = onCall(
  {
    maxInstances: 10,
    region: "us-central1",
    timeoutSeconds: 540,
    memory: "4GiB",
    secrets: ["CLOUDCONVERT_API_KEY", "GEMINI_API_KEY"]
  },
  async (request) => {
    const { uid } = request.auth;
    const { imageData, pureGeometry, options, pageWidth, pageHeight, isVectorPdf, rawPdfBase64 } = request.data;

    // Check rate limit
    await checkRateLimit(uid, "CONVERT_TO_CAD");
    await logUsage(uid, "CONVERT_TO_CAD");

    try {
      // ====================================================================
      // TIER 1: CLOUDCONVERT API (Primary Vector Handler)
      // ====================================================================
      if (isVectorPdf && rawPdfBase64) {
        console.log("Tier 1: Attempting CloudConvert API...");
        
        try {
          // Check usage counter
          const today = new Date().toISOString().split('T')[0];
          const usageRef = admin.firestore().doc(`system_usage/cloudconvert_${today}`);
          const usageDoc = await usageRef.get();
          const usageData = usageDoc.exists ? usageDoc.data() : { calls: 0 };
          
          // Check if user is paid
          const userRef = admin.firestore().doc(`users/${uid}`);
          const userDoc = await userRef.get();
          const userData = userDoc.exists ? userDoc.data() : {};
          const isPaid = userData.plan === 'pro' || userData.plan === 'enterprise';
          
          if (usageData.calls < 10 || isPaid) {
            console.log("CloudConvert: Usage limit OK or user is paid, proceeding...");
            
            // Import cloudconvert (if package is installed)
            let CloudConvert;
            try {
              CloudConvert = require('cloudconvert');
              const cloudConvert = new CloudConvert(process.env.CLOUDCONVERT_API_KEY);
              
              // Create conversion job
              const job = await cloudConvert.jobs.create({
                tasks: {
                  'import-my-file': {
                    operation: 'import/upload'
                  },
                  'convert-my-file': {
                    operation: 'convert',
                    input: 'import-my-file',
                    input_format: 'pdf',
                    output_format: 'dxf'
                  },
                  'export-my-file': {
                    operation: 'export/url',
                    input: 'convert-my-file'
                  }
                }
              });
              
              // Upload the file
              const importTask = job.tasks.filter(t => t.name === 'import-my-file')[0];
              await cloudConvert.tasks.upload(importTask, Buffer.from(rawPdfBase64, 'base64'), 'input.pdf');
              
              // Capture the finished job data returned by the wait function!
              const finishedJob = await cloudConvert.jobs.wait(job.id);
              
              // Check if the cloud task flagged any errors
              const failedTask = finishedJob.tasks.find(t => t.status === 'error');
              if (failedTask) {
                throw new Error(`CloudConvert task failed: ${failedTask.message}`);
              }
              
              // Filter the FINISHED job tasks, not the stale initial ones!
              const exportTask = finishedJob.tasks.find(t => t.name === 'export-my-file');
              if (!exportTask || !exportTask.result) {
                throw new Error("CloudConvert finished but export task result is missing.");
              }
              const dxfUrl = exportTask.result.files[0].url;
              
              // Increment usage counter
              await usageRef.set({ calls: (usageData.calls || 0) + 1 }, { merge: true });
              
              console.log("Tier 1 SUCCESS: CloudConvert completed");
              return {
                result: {
                  dxfUrl,
                  source: "cloudconvert"
                },
              };
            } catch (cloudConvertError) {
              console.error("CloudConvert error:", cloudConvertError);
              console.log("Tier 1 FAILED: Falling through to Tier 2");
            }
          } else {
            console.log("CloudConvert: Usage limit reached, falling through to Tier 2");
          }
        } catch (usageError) {
          if (usageError.code) throw usageError; // Let debugging errors pass through!
          console.error("Usage check error:", usageError);
          console.log("Tier 1 FAILED: Falling through to Tier 2");
        }
      }
      
      // ====================================================================
      // TIER 2: CUSTOM PURE GEOMETRY (Free Vector Fallback)
      // ====================================================================
      if (isVectorPdf && pureGeometry && pureGeometry.lines && pureGeometry.lines.length > 0) {
        console.log("Tier 2: Using custom pure geometry extraction...");
        
        let dxfContent = "";
        if (options.outputFormat === "dxf" || options.outputFormat === "both") {
          dxfContent = generateDxf(pureGeometry, options, pageWidth, pageHeight);
        }

        let svgContent = "";
        if (options.outputFormat === "svg" || options.outputFormat === "both") {
          svgContent = generateSvg(pureGeometry, options, pageWidth, pageHeight);
        }

        console.log("Tier 2 SUCCESS: Pure geometry conversion completed");
        return {
          result: {
            dxf: dxfContent || undefined,
            svg: svgContent || undefined,
            debugGeometry: pureGeometry,
            source: "pure_geometry"
          },
        };
      } else if (isVectorPdf && pureGeometry && pureGeometry.lines && pureGeometry.lines.length === 0) {
        console.log("Tier 2: Pure geometry is empty, falling through to Tier 3");
      }
      
      // ====================================================================
      // TIER 3: GEMINI AI (Raster Fallback)
      // ====================================================================
      if (imageData) {
        console.log("Tier 3: Using Gemini AI pipeline...");
        
        let geometry = { lines: [], arcs: [], circles: [], rectangles: [], text: [] };
        let rawGeminiText = "";
        
        // Convert raw base64 image to buffer
        const rawImageBuffer = Buffer.from(imageData.split(',')[1], 'base64');

        // FLATTEN & STANDARDIZE to White JPEG
        const cleanImageBuffer = await getSharp()(rawImageBuffer)
          .flatten({ background: { r: 255, g: 255, b: 255 } })
          .jpeg()
          .toBuffer();
        const cleanBase64 = cleanImageBuffer.toString('base64');

        // --- STAGE 1: GEMINI TEXT & ARC EXTRACTION ---
        console.log("Sending to Gemini...");
        const prompt = `You are an expert CAD digitizer analyzing an architectural blueprint.
Image Dimensions: ${pageWidth} pixels wide by ${pageHeight} pixels high. 

CRITICAL RULES:
1. NEVER use markdown formatting.
2. NEVER output dashed lines or separators (-------).
3. You must follow the exact format below. Do not explain yourself.

TASK:
1. Extract all printed/handwritten TEXT. (Format: x,y;content;height)
2. Identify structural ARCS. (Format: cx,cy,r,startAngle,endAngle)
3. Identify structural CIRCLES. (Format: cx,cy,r)

EXAMPLE OF THE ONLY ACCEPTABLE OUTPUT:
TEXT: 150,200;MASTER BEDROOM;24|450,120;8'-0";16
ARCS: 1000,1400,100,270,0
CIRCLES: 400,150,10

If a category is missing from the image, just output the label (e.g., "ARCS: "). Ignore tiny grid dots.`;

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contents: [{ 
                parts: [
                  { text: prompt }, 
                  { inline_data: { mime_type: "image/jpeg", data: cleanBase64 } }
                ] 
              }],
              generationConfig: { temperature: 0.1, maxOutputTokens: 8192 },
            }),
          }
        );

        if (!response.ok) {
          const errorText = await response.text();
          throw new Error(`Gemini error: ${response.status} - ${errorText}`);
        }

        const data = await response.json();
        rawGeminiText = data.candidates?.[0]?.content?.parts?.[0]?.text || "";

        // Parse Gemini response safely
        const lines = rawGeminiText.trim().split('\n');
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
                  const coords = parts[0].split(',');
                  const x = parseFloat(coords[0]) || 0;
                  const y = parseFloat(coords[1]) || 0;
                  const height = parseFloat(parts[parts.length - 1].trim()) || 12;
                  const content = parts.slice(1, parts.length - 1).join(';').trim();
                  if (content.length > 0) {
                    geometry.text.push({ x, y, content, height });
                  }
                }
              }
            }
          }
        }

        // --- STAGE 2: VECTORIZE THE IMAGE ---
        console.log("Starting vectorization...");
        const svgString = await vectorizeWithImageTracer(cleanImageBuffer); 
        
        const pathRegex = /<path[^>]*d="([^"]*)"[^>]*>/g;
        let pathMatch;
        
        while ((pathMatch = pathRegex.exec(svgString)) !== null) {
          const pathData = pathMatch[1];
          const commands = parsePathData(pathData);
          if (commands.length === 0) continue;

          let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
          for (const cmd of commands) {
              if (cmd.x !== undefined && cmd.y !== undefined) {
                  if (cmd.x < minX) minX = cmd.x;
                  if (cmd.y < minY) minY = cmd.y;
                  if (cmd.x > maxX) maxX = cmd.x;
                  if (cmd.y > maxY) maxY = cmd.y;
              }
          }

          const pathWidth = maxX - minX;
          const pathHeight = maxY - minY;

          // THE DENSITY & SIZE FILTER (Protects text)
          const rawCommandCount = (pathData.match(/[a-zA-Z]/g) || []).length;
          const longestEdge = Math.max(pathWidth, pathHeight);
          const commandDensity = longestEdge > 0 ? (rawCommandCount / longestEdge) : 0;
          const textVaporizerLimit = Math.max(60, pageWidth * 0.025);

          const isSmallShape = pathWidth < textVaporizerLimit && pathHeight < textVaporizerLimit;
          const isDenseTextStrand = (pathHeight < textVaporizerLimit || pathWidth < textVaporizerLimit) && commandDensity > 0.15;

          if (isSmallShape || isDenseTextStrand) {
              continue; 
          }

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

        // Generate DXF/SVG
        console.log(`Final geometry: ${geometry.lines.length} lines, ${geometry.text.length} text items.`);

        let dxfContent = "";
        if (options.outputFormat === "dxf" || options.outputFormat === "both") {
          dxfContent = generateDxf(geometry, options, pageWidth, pageHeight);
        }

        let svgContent = "";
        if (options.outputFormat === "svg" || options.outputFormat === "both") {
          svgContent = generateSvg(geometry, options, pageWidth, pageHeight);
        }

        console.log("Tier 3 SUCCESS: Gemini AI conversion completed");
        return {
          result: {
            dxf: dxfContent || undefined,
            svg: svgContent || undefined,
            debugGeometry: geometry,
            rawGeminiText,
            source: "gemini_ai"
          },
        };
      }
      
      // If we reach here, no valid input was provided
      throw new HttpsError("invalid-argument", "No valid input provided (isVectorPdf, pureGeometry, or imageData required)");
      
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
  const { data, info } = await getSharp()(imageBuffer)
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

  const svgString = getImageTracer().imagedataToSVG(imgData, options);
  
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
  if (geometry.text && geometry.text.length > 0) {
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
  if (geometry.text && geometry.text.length > 0) {
    geometry.text.forEach((text) => {
      svg += `    <text x="${snap(text.x * scale)}" y="${snap(text.y * scale)}" font-size="${snap(text.height * scale)}" fill="black" stroke="none">${text.content}</text>\n`;
    });
  }

  svg += `  </g>
</svg>`;

  return svg;
}

// ============================================================================
// DEEP REVIEW (ASYNC BATCH API)
// ============================================================================

exports.submitDeepReview = onCall(async (request) => {
  const { pdfData, pageCount, discipline, projectState, codeYear, reviewMode, email } = request.data;
  const uid = request.auth?.uid;

  if (!uid) {
    throw new HttpsError("unauthenticated", "User must be authenticated");
  }

  if (!pdfData || !pageCount || !discipline || !email) {
    throw new HttpsError("invalid-argument", "Missing required fields");
  }

  // Check rate limit for deep review
  await checkRateLimit(uid, "DEEP_REVIEW");

  // Create a job document in Firestore
  const db = getDb();
  const jobRef = await db.collection("deepReviewJobs").add({
    uid,
    email,
    status: "pending",
    createdAt: Date.now(),
    pageCount,
    discipline,
    projectState,
    codeYear,
    reviewMode,
  });

  // Trigger async processing
  processDeepReview(jobRef.id, pdfData, pageCount, discipline, projectState, codeYear, reviewMode, email, uid)
    .catch((err) => console.error("Deep review processing error:", err));

  return { jobId: jobRef.id, message: "Deep review submitted. You will receive an email when complete." };
});

async function processDeepReview(jobId, pdfData, pageCount, discipline, projectState, codeYear, reviewMode, email, uid) {
  const db = getDb();
  const jobRef = db.collection("deepReviewJobs").doc(jobId);

  try {
    await jobRef.update({ status: "processing" });

    // Build mental build prompt
    const mentalBuildPrompt = buildMentalBuildPrompt(discipline, projectState, codeYear);

    // Submit to OpenAI Batch API with PDF data (OpenAI can process PDFs natively)
    const batchId = await submitToOpenAIBatch(pdfData, pageCount, mentalBuildPrompt);

    await jobRef.update({
      status: "batch_submitted",
      batchId,
      submittedAt: Date.now(),
    });

    // Poll for batch completion (simplified - in production, use Cloud Tasks or scheduled function)
    await pollBatchCompletion(batchId, jobRef);

    // Send email notification
    await sendDeepReviewEmail(email, jobRef.id);

    await jobRef.update({ status: "completed", completedAt: Date.now() });
  } catch (err) {
    console.error("Deep review error:", err);
    await jobRef.update({ status: "failed", error: err.message, failedAt: Date.now() });
  }
}

function buildMentalBuildPrompt(discipline, projectState, codeYear) {
  const disciplinePrompts = {
    architect: `You are a Senior Architect reviewing construction plans for ${projectState} (${codeYear} code). Focus on: egress paths, fire-rated assemblies, ADA compliance, envelope continuity, and coordination between architectural and structural drawings.`,
    building_engineer: `You are a Senior Structural Engineer reviewing plans for ${projectState} (${codeYear} code). Focus on: load path continuity, lateral force resisting systems, connection details, foundation design, and constructability sequencing.`,
    bridge_engineer: `You are a Senior Bridge Engineer reviewing plans for ${projectState} (${codeYear} AASHTO). Focus on: bearing details, expansion joints, scour protection, MOT requirements, and constructability.`,
    contractor: `You are a Senior Contractor reviewing plans for constructability. Focus on: trade coordination, sequencing, material access, installation conflicts, and practical field constraints.`,
    general_structural: `You are a Senior Structural Engineer reviewing plans. Perform a comprehensive structural review covering all disciplines.`,
  };

  return `### CONTEXT
${disciplinePrompts[discipline] || disciplinePrompts.general_structural}

### STEP 1: MENTAL BUILD
Before generating any warnings, you must establish context. Create a <mental_build> block. Inside it:

Define the primary structural system.

Outline the step-by-step erection sequence based only on the provided visuals.

Explicitly state what standard details are missing that you would need to complete the build.

### STEP 2: ANNOTATION GENERATION
Based on your mental build, output an array of precise JSON annotations flagging constructability traps, missing elevations, or load path breaks.

Ensure your output exactly matches this JSON schema: [{"severity": "High", "issue": "...", "recommended_action": "..."}]`;
}

async function submitToOpenAIBatch(pdfData, pageCount, prompt) {
  // Create batch request with PDF data
  const batchRequest = {
    custom_id: "deep_review",
    method: "POST",
    url: "/v1/chat/completions",
    body: {
      model: "gpt-4o",
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this construction plan PDF and provide annotations following the mental build framework." },
            { type: "image_url", image_url: { url: `data:application/pdf;base64,${pdfData}` } },
          ],
        },
      ],
      max_tokens: 16384,
    },
  };

  // Upload batch file
  const batchFile = await uploadBatchFile([batchRequest]);

  // Submit batch
  const response = await fetch("https://api.openai.com/v1/batches", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      input_file_id: batchFile.id,
      endpoint: "/v1/chat/completions",
      completion_window: "24h",
    }),
  });

  const data = await response.json();
  return data.id;
}

async function uploadBatchFile(batchRequests) {
  // OpenAI Batch API requires JSONL format (newline-delimited JSON)
  const jsonl = batchRequests.map((req) => JSON.stringify(req)).join("\n");

  const formData = new FormData();
  formData.append("file", Buffer.from(jsonl), "batch_requests.jsonl");
  formData.append("purpose", "batch");

  const response = await fetch("https://api.openai.com/v1/files", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: formData,
  });

  return await response.json();
}

async function pollBatchCompletion(batchId, jobRef) {
  // Simplified polling - in production, use exponential backoff with max duration
  for (let i = 0; i < 60; i++) {
    await new Promise((resolve) => setTimeout(resolve, 60000)); // Check every minute

    const response = await fetch(`https://api.openai.com/v1/batches/${batchId}`, {
      headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
    });

    const data = await response.json();
    if (data.status === "completed") {
      // Retrieve results
      const resultFile = await fetch(data.result_file_id, {
        headers: { "Authorization": `Bearer ${process.env.OPENAI_API_KEY}` },
      });
      const results = await resultFile.json();

      // Parse and merge annotations
      const annotations = parseBatchResults(results);
      await jobRef.update({ annotations, batchResults: results });
      return;
    } else if (data.status === "failed") {
      throw new Error(`Batch failed: ${data.error}`);
    }
  }
  throw new Error("Batch processing timed out");
}

function parseBatchResults(results) {
  const annotations = [];
  for (const result of results) {
    try {
      const content = JSON.parse(result.response.body.choices[0].message.content);
      if (Array.isArray(content)) {
        annotations.push(...content);
      }
    } catch (err) {
      console.error("Failed to parse batch result:", err);
    }
  }
  return annotations;
}

async function sendDeepReviewEmail(email, jobId) {
  // Use SendGrid or similar email service
  // For now, log the email send
  console.log(`[Deep Review] Email would be sent to ${email} for job ${jobId}`);
  // In production:
  // const sgMail = require("@sendgrid/mail");
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  // await sgMail.send({
  //   to: email,
  //   from: "noreply@blueprintpdf.web.app",
  //   subject: "Your Deep Review is Complete",
  //   text: `Your deep review (job ID: ${jobId}) is complete. Open the app to view the results.`,
  // });
}

// ============================================================================
// CRYPTOGRAPHIC PDF SIGNING (node-signpdf)
// ============================================================================

let _pdfLib = null;
let _nodeSignpdf = null;
function getPdfLib() { if (!_pdfLib) _pdfLib = require("pdf-lib"); return _pdfLib; }
function getNodeSignpdf() { if (!_nodeSignpdf) _nodeSignpdf = require("node-signpdf").default; return _nodeSignpdf; }

/**
 * Cryptographically sign a PDF with a PKCS#12 certificate
 * This function applies a digital signature seal using node-signpdf
 * and writes an audit trail to Firestore
 */
exports.signPdf = onRequest({
  cors: true,
  maxInstances: 1,
}, async (req, res) => {
  try {
    const { pdfBuffer, signerId, reason, location, contactInfo } = req.body;

    if (!pdfBuffer) {
      throw new HttpsError("invalid-argument", "PDF buffer is required");
    }
    if (!signerId) {
      throw new HttpsError("invalid-argument", "Signer ID is required");
    }

    const pdfBytes = Buffer.from(pdfBuffer, "base64");
    const { PDFDocument } = getPdfLib();
    const signer = getNodeSignpdf();

    // Load the PDF
    const pdfDoc = await PDFDocument.load(pdfBytes);

    // Add invisible signature placeholder (required by node-signpdf)
    const { plainAddPlaceholder } = require("node-signpdf/dist/helpers");
    const pdfWithPlaceholder = plainAddPlaceholder({
      pdfBuffer: pdfBytes,
      reason: reason || "Document approval",
      contactInfo: contactInfo || "",
      name: signerId,
      location: location || "",
    });

    // Load the .p12 certificate from Firebase Storage or environment
    // In production, fetch from Google Cloud Secret Manager or Storage
    const p12Buffer = Buffer.from(process.env.SIGNING_CERTIFICATE_BASE64 || "", "base64");
    const p12Password = process.env.SIGNING_CERTIFICATE_PASSWORD || "";

    if (!p12Buffer.length) {
      throw new HttpsError("failed-precondition", "Signing certificate not configured");
    }

    // Apply the cryptographic seal
    const signedPdfBuffer = signer.sign(pdfWithPlaceholder, p12Buffer, { passphrase: p12Password });

    // Write audit trail to Firestore
    const database = getDb();
    const documentId = `doc_${Date.now()}`;
    const documentHash = require("crypto").createHash("sha256").update(signedPdfBuffer).digest("hex");

    await database.collection("audit_trails").doc(documentId).set({
      signerId,
      signedAt: new Date().toISOString(),
      ipAddress: req.headers["x-forwarded-for"] || req.socket.remoteAddress,
      documentHash,
      reason: reason || "",
      location: location || "",
    });

    // Save signed PDF to Firebase Storage
    const bucket = admin.storage().bucket();
    const file = bucket.file(`signed_documents/${documentId}.pdf`);
    await file.save(signedPdfBuffer, { contentType: "application/pdf" });

    // Generate signed URL (valid for 1 year)
    const [url] = await file.getSignedUrl({
      action: "read",
      expires: "03-01-2500",
    });

    res.status(200).send({ success: true, url, documentId, documentHash });
  } catch (error) {
    console.error("PDF signing failed:", error);
    throw new HttpsError("internal", error.message || "Failed to sign document");
  }
});

// Export PDF Gateway (callable)
exports.pdfGateway = require('./pdf-gateway').pdfGateway;
