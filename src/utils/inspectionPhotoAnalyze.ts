import { fetchApiKey } from './license';

export interface InspectionPhotoAnalysis {
  locationName?: string;
  notes: string;
  priority: 'Low' | 'Medium' | 'High';
}

/**
 * Analyze a photo taken at an inspection pin location and return a
 * suggested location name + a descriptive notes block (observations,
 * defects, materials, condition, etc.).
 *
 * Requires a Gemini API key (licensed user). Throws on failure.
 */
export async function analyzeInspectionPhoto(imageBase64: string): Promise<InspectionPhotoAnalysis> {
  const apiKey = await fetchApiKey();
  if (!apiKey) {
    throw new Error('AI features require an active subscription.');
  }

  const prompt = `You are a Senior Construction Inspector. Analyze this job-site photo.
1. "locationName": Short label (≤ 40 chars) naming the location/component.
2. "notes": Concise inspection notes (materials, defects, code observations).
3. "priority": Evaluate risk. "High" for severe safety/structural/code violations. "Medium" for standard defects. "Low" for minor cosmetic issues.
Return ONLY valid JSON: {"locationName":"...","notes":"...","priority":"Medium"}`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: prompt },
              { inline_data: { mime_type: 'image/jpeg', data: imageBase64 } },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.2,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json',
        },
      }),
    }
  );

  if (!response.ok) {
    const t = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${t.slice(0, 200)}`);
  }

  const data = await response.json();
  const raw: string = data.candidates?.[0]?.content?.parts?.[0]?.text || '{}';
  let s = raw.trim();
  if (s.startsWith('```')) s = s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/i, '');

  // Try direct parse, then slice between { and }
  const tryParse = (str: string): any => { try { return JSON.parse(str); } catch { return null; } };
  let parsed = tryParse(s);
  if (!parsed) {
    const first = s.indexOf('{');
    const last = s.lastIndexOf('}');
    if (first >= 0 && last > first) parsed = tryParse(s.substring(first, last + 1));
  }
  if (!parsed) throw new Error('Failed to parse AI response. Try again.');

  return {
    locationName: typeof parsed.locationName === 'string' ? parsed.locationName.trim() : '',
    notes: typeof parsed.notes === 'string' ? parsed.notes.trim() : '',
    priority: ['Low', 'Medium', 'High'].includes(parsed.priority) ? parsed.priority : 'Medium',
  };
}
