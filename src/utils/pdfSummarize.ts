import { getPageTextItems } from './pdfRenderer';

/**
 * Extract all text from a range of PDF pages using pdf.js text layer.
 */
export async function extractAllText(
  pageCount: number,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  const parts: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (onProgress) onProgress(i + 1, pageCount);
    const items = await getPageTextItems(i);
    const pageText = items.map((it) => it.text).join(' ').trim();
    if (pageText) {
      parts.push(`--- Page ${i + 1} ---\n${pageText}`);
    }
  }
  return parts.join('\n\n');
}

/**
 * Send extracted PDF text to Gemini and get a structured summary.
 */
export async function summarizeWithGemini(
  apiKey: string,
  pdfText: string,
  documentName: string,
): Promise<string> {
  // Truncate to ~120k chars to stay within Gemini's context window
  const maxChars = 120_000;
  const truncated = pdfText.length > maxChars
    ? pdfText.slice(0, maxChars) + '\n\n[... truncated due to length ...]'
    : pdfText;

  const systemPrompt = `You are a professional document analyst. The user will provide the full text extracted from a PDF document named "${documentName}".

Produce a clear, well-structured summary with the following sections:
1. **Overview** — A concise 2-3 sentence description of what this document is about.
2. **Key Points** — Bullet list of the most important facts, figures, or decisions.
3. **Details by Section** — If the document has distinct sections or pages, briefly summarize each.
4. **Action Items / Takeaways** — Any deadlines, follow-ups, or actionable items mentioned.

Use markdown formatting. Be concise but thorough. If the text is very short or mostly blank, note that and summarize whatever is available.`;

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: `${systemPrompt}\n\n--- DOCUMENT TEXT ---\n${truncated}` },
            ],
          },
        ],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API error: ${response.status} - ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}
