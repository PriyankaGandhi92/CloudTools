import { renderPage } from './pdfRenderer';
import type { Annotation, Point } from '../types';

interface GeminiFieldSuggestion {
  text: string;
  x: number;
  y: number;
  fontSize?: number;
}

export async function annotateWithGemini(
  apiKey: string,
  pageIndex: number,
  userPrompt: string,
  pageWidth: number,
  pageHeight: number,
): Promise<Annotation[]> {
  // Render page to image for Gemini to analyze
  const canvas = document.createElement('canvas');
  await renderPage(pageIndex, canvas, 1);
  const dataUrl = canvas.toDataURL('image/png');
  const base64 = dataUrl.split(',')[1];

  const systemPrompt = `You are a PDF form assistant. The user will provide an image of a PDF page and instructions about what to fill in. 
Analyze the PDF image and identify blank fields, form fields, or areas where text should be placed.
Return a JSON array of objects, each with:
- "text": the text to place
- "x": x coordinate as a fraction of page width (0 to 1)
- "y": y coordinate as a fraction of page height (0 to 1)  
- "fontSize": optional font size (default 14)

Only return the JSON array, no markdown, no explanation. Example:
[{"text":"John Doe","x":0.35,"y":0.15,"fontSize":14}]`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${systemPrompt}\n\nUser instructions: ${userPrompt}` },
              {
                inline_data: {
                  mime_type: 'image/png',
                  data: base64,
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
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const rawText = data.candidates?.[0]?.content?.parts?.[0]?.text || '[]';
  
  // Extract JSON from response (handle markdown code blocks)
  let jsonStr = rawText.trim();
  if (jsonStr.startsWith('```')) {
    jsonStr = jsonStr.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
  }

  let suggestions: GeminiFieldSuggestion[];
  try {
    suggestions = JSON.parse(jsonStr);
  } catch {
    throw new Error(`Failed to parse Gemini response as JSON: ${jsonStr.slice(0, 200)}`);
  }

  if (!Array.isArray(suggestions)) {
    throw new Error('Gemini response is not an array');
  }

  // Convert suggestions to annotations
  return suggestions.map((s) => ({
    id: crypto.randomUUID(),
    type: 'text' as const,
    pageIndex,
    points: [{ x: s.x * pageWidth, y: s.y * pageHeight }] as Point[],
    text: s.text,
    style: {
      stroke: '#1a1a1a',
      strokeWidth: 1,
      fill: 'transparent',
      opacity: 1,
      fontSize: s.fontSize || 14,
      fontFamily: 'Arial',
    },
    createdBy: 'gemini-ai',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    layerOrder: 0,
  }));
}
