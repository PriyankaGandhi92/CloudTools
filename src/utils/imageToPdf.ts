import { PDFDocument } from 'pdf-lib';

const SUPPORTED_IMAGE_TYPES = [
  'image/png',
  'image/jpeg',
  'image/jpg',
  'image/webp',
  'image/gif',
  'image/bmp',
];

export function isImageFile(file: File): boolean {
  return SUPPORTED_IMAGE_TYPES.includes(file.type) ||
    /\.(png|jpe?g|webp|gif|bmp)$/i.test(file.name);
}

/**
 * Convert one or more image files into a single PDF document.
 * Each image becomes a page, sized to fit the image dimensions.
 */
export async function imagesToPdf(files: File[]): Promise<{ buffer: ArrayBuffer; pageCount: number }> {
  const pdfDoc = await PDFDocument.create();

  for (const file of files) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    let img;

    if (file.type === 'image/png' || /\.png$/i.test(file.name)) {
      img = await pdfDoc.embedPng(bytes);
    } else if (
      file.type === 'image/jpeg' ||
      file.type === 'image/jpg' ||
      /\.jpe?g$/i.test(file.name)
    ) {
      img = await pdfDoc.embedJpg(bytes);
    } else {
      // For unsupported formats (webp/gif/bmp), convert via canvas to PNG first
      const png = await convertImageToPng(file);
      img = await pdfDoc.embedPng(png);
    }

    const page = pdfDoc.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  }

  const pdfBytes = await pdfDoc.save();
  const arrayBuffer = new ArrayBuffer(pdfBytes.length);
  new Uint8Array(arrayBuffer).set(pdfBytes);
  return { buffer: arrayBuffer, pageCount: files.length };
}

/** Convert any image file to a PNG byte array via canvas */
async function convertImageToPng(file: File): Promise<Uint8Array> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const el = new Image();
      el.onload = () => resolve(el);
      el.onerror = reject;
      el.src = url;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas not supported');
    ctx.drawImage(img, 0, 0);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob((b) => resolve(b), 'image/png')
    );
    if (!blob) throw new Error('Failed to convert image to PNG');
    return new Uint8Array(await blob.arrayBuffer());
  } finally {
    URL.revokeObjectURL(url);
  }
}
