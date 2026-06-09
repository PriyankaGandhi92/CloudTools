import { PDFDocument } from 'pdf-lib';

/**
 * Parse a page-range string into a sorted, de-duplicated list of 0-based page indices.
 * Supports forms like: "5", "1-10", "1,3,5", "2-4,8,10-12".
 * `totalPages` is used to clamp/validate the range and to resolve open-ended values.
 * Returns null if the string is empty/invalid (caller should treat as "all pages").
 */
export function parsePageRange(range: string, totalPages: number): number[] | null {
  if (!range || !range.trim()) return null;

  const indices = new Set<number>();
  const parts = range.split(',').map((p) => p.trim()).filter(Boolean);

  for (const part of parts) {
    const dash = part.indexOf('-');
    if (dash === -1) {
      const n = parseInt(part, 10);
      if (!isNaN(n) && n >= 1 && n <= totalPages) indices.add(n - 1);
    } else {
      const start = parseInt(part.slice(0, dash), 10);
      const end = parseInt(part.slice(dash + 1), 10);
      if (isNaN(start) || isNaN(end)) continue;
      const lo = Math.max(1, Math.min(start, end));
      const hi = Math.min(totalPages, Math.max(start, end));
      for (let i = lo; i <= hi; i++) indices.add(i - 1);
    }
  }

  if (indices.size === 0) return null;
  return Array.from(indices).sort((a, b) => a - b);
}

/**
 * Build a new PDF ArrayBuffer containing only the requested pages.
 * `pageIndices` are 0-based. Returns the new PDF bytes.
 */
export async function extractPages(
  pdfBuffer: ArrayBuffer,
  pageIndices: number[]
): Promise<ArrayBuffer> {
  const srcDoc = await PDFDocument.load(pdfBuffer);
  const outDoc = await PDFDocument.create();
  const copied = await outDoc.copyPages(srcDoc, pageIndices);
  copied.forEach((p) => outDoc.addPage(p));
  const bytes = await outDoc.save();
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}
