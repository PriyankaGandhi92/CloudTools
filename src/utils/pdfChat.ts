import { getPageTextItems } from './pdfRenderer';

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: number;
  pageRef?: number; // optional page reference
}

/**
 * Extract text from a specific page range for context.
 */
export async function extractPageText(pageIndex: number): Promise<string> {
  const items = await getPageTextItems(pageIndex);
  return items.map((it) => it.text).join(' ').trim();
}

/**
 * Extract text from all pages (cached after first call).
 */
let fullTextCache: string | null = null;
let fullTextPageCount = 0;

export async function extractFullText(
  pageCount: number,
  onProgress?: (page: number, total: number) => void,
): Promise<string> {
  if (fullTextCache && fullTextPageCount === pageCount) return fullTextCache;

  const parts: string[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (onProgress) onProgress(i + 1, pageCount);
    const items = await getPageTextItems(i);
    const text = items.map((it) => it.text).join(' ').trim();
    if (text) parts.push(`[Page ${i + 1}]\n${text}`);
  }
  fullTextCache = parts.join('\n\n');
  fullTextPageCount = pageCount;
  return fullTextCache;
}

export function clearTextCache() {
  fullTextCache = null;
  fullTextPageCount = 0;
}

/**
 * Send a chat message to Gemini with the full PDF context.
 * Supports multi-turn conversation via the messages history.
 */
export async function chatWithPdf(
  apiKey: string,
  pdfText: string,
  documentName: string,
  messages: ChatMessage[],
): Promise<string> {
  // Build Gemini contents array for multi-turn
  const systemInstruction = `You are an intelligent PDF assistant for a document called "${documentName}". The user has loaded this document in BluePrint PDF Editor.

Your capabilities:
- Answer questions about the document content
- Find specific information, clauses, figures, dates, names
- Summarize sections or the entire document
- Compare or cross-reference parts of the document
- Explain complex content in simpler terms
- Help locate where specific information appears (cite page numbers)

The full document text is provided below. When referencing content, always mention the page number in brackets like [Page X].

--- DOCUMENT TEXT ---
${pdfText.slice(0, 120_000)}
${pdfText.length > 120_000 ? '\n[... document truncated due to length ...]' : ''}
--- END DOCUMENT ---`;

  // Build contents for Gemini multi-turn
  const contents: Array<{ role: string; parts: Array<{ text: string }> }> = [];

  // First message includes system context
  const userMessages = messages.filter((m) => m.role !== 'system');

  for (let i = 0; i < userMessages.length; i++) {
    const msg = userMessages[i];
    if (msg.role === 'user') {
      const text = i === 0
        ? `${systemInstruction}\n\nUser question: ${msg.content}`
        : msg.content;
      contents.push({ role: 'user', parts: [{ text }] });
    } else if (msg.role === 'assistant') {
      contents.push({ role: 'model', parts: [{ text: msg.content }] });
    }
  }

  const response = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents,
        generationConfig: {
          temperature: 0.4,
          maxOutputTokens: 4096,
        },
      }),
    },
  );

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini error: ${response.status} — ${errText}`);
  }

  const data = await response.json();
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Empty response from Gemini');
  return text;
}
