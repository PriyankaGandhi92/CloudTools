import { PDFDocument, rgb } from 'pdf-lib';

export interface PageSize {
  name: string;
  width: number;
  height: number;
  unit: 'in' | 'mm';
}

export const PAGE_SIZES: PageSize[] = [
  { name: 'Letter', width: 8.5, height: 11, unit: 'in' },
  { name: 'Legal', width: 8.5, height: 14, unit: 'in' },
  { name: 'A4', width: 210, height: 297, unit: 'mm' },
  { name: 'A3', width: 297, height: 420, unit: 'mm' },
  { name: 'Tabloid', width: 11, height: 17, unit: 'in' },
  { name: 'A5', width: 148, height: 210, unit: 'mm' },
];

/**
 * Convert page size to PDF points (1 point = 1/72 inch)
 */
function convertToPoints(size: PageSize): { width: number; height: number } {
  const factor = size.unit === 'in' ? 72 : 72 / 25.4; // 72 points per inch, or convert mm to inches then to points
  return {
    width: size.width * factor,
    height: size.height * factor,
  };
}

/**
 * Create a blank PDF with specified page size
 * @param pageSize - The page size to use
 * @param pageCount - Number of pages to create (default: 1)
 * @returns ArrayBuffer containing the PDF data
 */
export async function createBlankPdf(
  pageSize: PageSize,
  pageCount: number = 1
): Promise<ArrayBuffer> {
  const pdfDoc = await PDFDocument.create();
  const { width, height } = convertToPoints(pageSize);

  for (let i = 0; i < pageCount; i++) {
    const page = pdfDoc.addPage([width, height]);
    // Set white background
    page.drawText('', {
      x: 0,
      y: 0,
    });
  }

  const pdfBytes = await pdfDoc.save();
  // Convert Uint8Array to ArrayBuffer
  const arrayBuffer = new ArrayBuffer(pdfBytes.length);
  const view = new Uint8Array(arrayBuffer);
  view.set(pdfBytes);
  return arrayBuffer;
}

/**
 * Create a blank PDF and return as ArrayBuffer with page count info
 */
export async function createBlankPdfWithInfo(
  pageSize: PageSize,
  pageCount: number = 1
): Promise<{ buffer: ArrayBuffer; numPages: number }> {
  const buffer = await createBlankPdf(pageSize, pageCount);
  return { buffer, numPages: pageCount };
}
