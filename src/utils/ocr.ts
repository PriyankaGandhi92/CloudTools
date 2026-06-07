import Tesseract from 'tesseract.js';
import { renderPage } from './pdfRenderer';

export interface OcrWord {
  text: string;
  bbox: { x0: number; y0: number; x1: number; y1: number };
  confidence: number;
}

export interface OcrResult {
  pageIndex: number;
  text: string;
  confidence: number;
  words: OcrWord[];
  canvasWidth: number;
  canvasHeight: number;
}

let ocrCache: Map<number, OcrResult> = new Map();
let isProcessing = false;

export function clearOcrCache() {
  ocrCache.clear();
}

export async function ocrPage(pageIndex: number): Promise<OcrResult> {
  if (ocrCache.has(pageIndex)) return ocrCache.get(pageIndex)!;

  const canvas = document.createElement('canvas');
  await renderPage(pageIndex, canvas, 2);

  const { data } = await Tesseract.recognize(canvas, 'eng', {
    logger: () => {},
  });

  // Capture word-level bounding boxes for text layer embedding
  const rawWords = (data as any).words || [];
  const words: OcrWord[] = rawWords.map((w: any) => ({
    text: w.text,
    bbox: { x0: w.bbox.x0, y0: w.bbox.y0, x1: w.bbox.x1, y1: w.bbox.y1 },
    confidence: w.confidence,
  }));

  const result: OcrResult = {
    pageIndex,
    text: data.text,
    confidence: data.confidence,
    words,
    canvasWidth: canvas.width,
    canvasHeight: canvas.height,
  };
  ocrCache.set(pageIndex, result);
  return result;
}

export async function ocrAllPages(
  pageCount: number,
  onProgress?: (page: number, total: number) => void
): Promise<OcrResult[]> {
  isProcessing = true;
  const results: OcrResult[] = [];
  for (let i = 0; i < pageCount; i++) {
    if (!isProcessing) break;
    if (onProgress) onProgress(i, pageCount);
    const result = await ocrPage(i);
    results.push(result);
  }
  isProcessing = false;
  return results;
}

export function cancelOcr() {
  isProcessing = false;
}

export interface SearchMatch {
  pageIndex: number;
  startIndex: number;
  length: number;
  context: string;
}

/** Get all cached OCR results (for use by Find) */
export function getOcrCache(): Map<number, OcrResult> {
  return ocrCache;
}

export function searchOcrResults(
  results: OcrResult[],
  query: string
): SearchMatch[] {
  if (!query.trim()) return [];
  const q = query.toLowerCase();
  const matches: SearchMatch[] = [];

  for (const result of results) {
    const text = result.text.toLowerCase();
    let idx = 0;
    while ((idx = text.indexOf(q, idx)) !== -1) {
      const contextStart = Math.max(0, idx - 30);
      const contextEnd = Math.min(text.length, idx + q.length + 30);
      matches.push({
        pageIndex: result.pageIndex,
        startIndex: idx,
        length: q.length,
        context: '...' + result.text.slice(contextStart, contextEnd).trim() + '...',
      });
      idx += q.length;
    }
  }

  return matches;
}
