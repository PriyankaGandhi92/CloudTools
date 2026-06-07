import { PDFDocument, StandardFonts, rgb } from 'pdf-lib';
import type { OcrResult } from './ocr';

/**
 * Embeds OCR-recognized text into the PDF as an invisible text layer.
 * This makes the PDF searchable and text-selectable in any PDF viewer,
 * including the built-in pdf.js text layer used by Find.
 *
 * Each word is placed at its detected bounding box position with
 * transparent (invisible) text so it doesn't visually alter the scan.
 */
export async function embedOcrTextLayer(
  pdfData: ArrayBuffer,
  ocrResults: OcrResult[],
  onProgress?: (page: number, total: number) => void,
): Promise<ArrayBuffer> {
  const doc = await PDFDocument.load(pdfData.slice(0), { ignoreEncryption: true });
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const pages = doc.getPages();

  for (const ocr of ocrResults) {
    if (onProgress) onProgress(ocr.pageIndex, ocrResults.length);
    if (ocr.words.length === 0) continue;

    const page = pages[ocr.pageIndex];
    if (!page) continue;

    // PDF page dimensions (in points)
    const pdfW = page.getWidth();
    const pdfH = page.getHeight();

    // Canvas dimensions from Tesseract (rendered at scale=2)
    const cW = ocr.canvasWidth;
    const cH = ocr.canvasHeight;

    // Scale factors: Tesseract pixel coords → PDF points
    const sx = pdfW / cW;
    const sy = pdfH / cH;

    for (const word of ocr.words) {
      if (!word.text.trim()) continue;

      // Tesseract bbox is top-left origin; PDF is bottom-left origin
      const x = word.bbox.x0 * sx;
      const wordH = (word.bbox.y1 - word.bbox.y0) * sy;
      const y = pdfH - word.bbox.y1 * sy; // flip Y

      // Estimate font size to roughly match the word height
      const fontSize = Math.max(2, Math.min(wordH * 0.85, 72));

      try {
        page.drawText(word.text, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(0, 0, 0),
          opacity: 0, // invisible — only for text layer / search
        });
      } catch {
        // Some characters may not be encodable in Helvetica — skip
      }
    }
  }

  const bytes = await doc.save();
  return bytes.buffer as ArrayBuffer;
}
