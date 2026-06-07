import JSZip from 'jszip';
import { renderPage, getPdfDoc } from './pdfRenderer';
import * as pdfjsLib from 'pdfjs-dist';
import type { Annotation } from '../types';

export interface ExportOptions {
  includePdfPages: boolean;
  includeEmbeddedImages: boolean;
  includeUploadedImages: boolean;
  includeBimImages: boolean;
  includePinImages: boolean;
  imageFormat: 'png' | 'jpeg';
  pdfPageScale: number; // 1 = 72 DPI, 2 = 144 DPI, etc.
  documentName: string;
}

export const DEFAULT_EXPORT_OPTIONS: ExportOptions = {
  includePdfPages: true,
  includeEmbeddedImages: true,
  includeUploadedImages: true,
  includeBimImages: true,
  includePinImages: true,
  imageFormat: 'png',
  pdfPageScale: 2,
  documentName: 'document',
};

function sanitize(s: string): string {
  return (s || '').replace(/[^a-z0-9_\-]+/gi, '_').slice(0, 60);
}

/**
 * Build a ZIP containing:
 *  - pdf_pages/        rendered raster of each PDF page
 *  - embedded_images/  REAL images embedded in the PDF (extracted via pdfjs)
 *  - uploaded_images/  user-pasted/uploaded image annotations
 *  - bim_images/       photos attached to BIM @Inspection annotations
 *  - pin_images/       photos attached to Location Pin annotations
 */
export async function exportImagesAsZip(
  pageCount: number,
  annotations: Annotation[],
  options: ExportOptions
): Promise<Blob> {
  const zip = new JSZip();
  const mime = options.imageFormat === 'jpeg' ? 'image/jpeg' : 'image/png';
  const ext = options.imageFormat === 'jpeg' ? 'jpg' : 'png';

  const summaryLines: string[] = [
    `Export generated: ${new Date().toISOString()}`,
    `Document: ${options.documentName}`,
    '',
  ];

  // ─────────────────────────────────────────────────────────────────────────
  // 1) PDF pages rendered as images
  // ─────────────────────────────────────────────────────────────────────────
  if (options.includePdfPages && pageCount > 0) {
    const pagesFolder = zip.folder('pdf_pages');
    if (!pagesFolder) throw new Error('Failed to create pages folder');

    let pageOk = 0;
    for (let i = 0; i < pageCount; i++) {
      const canvas = document.createElement('canvas');
      try {
        await renderPage(i, canvas, options.pdfPageScale, 0);
        const blob = await canvasToBlob(canvas, mime);
        if (blob) {
          const buf = await blob.arrayBuffer();
          pagesFolder.file(`page_${String(i + 1).padStart(3, '0')}.${ext}`, buf);
          pageOk++;
        }
      } catch (err) {
        console.warn(`Failed to render page ${i + 1}:`, err);
      }
    }
    summaryLines.push(`pdf_pages/         : ${pageOk} pages`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 2) REAL embedded images inside the PDF (via pdfjs operator list)
  // ─────────────────────────────────────────────────────────────────────────
  if (options.includeEmbeddedImages) {
    const folder = zip.folder('embedded_images');
    if (!folder) throw new Error('Failed to create embedded_images folder');
    let extracted = 0;
    try {
      extracted = await extractEmbeddedImages(pageCount, folder, mime, ext);
    } catch (err) {
      console.warn('Embedded image extraction failed:', err);
    }
    folder.file(
      '_README.txt',
      `Embedded images extracted from the PDF content streams (XObjects).\nTotal: ${extracted}\n`
    );
    summaryLines.push(`embedded_images/   : ${extracted} images`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 3) User-pasted/uploaded image annotations (type 'image')
  // ─────────────────────────────────────────────────────────────────────────
  if (options.includeUploadedImages) {
    const folder = zip.folder('uploaded_images');
    if (!folder) throw new Error('Failed to create uploaded_images folder');
    const uploads = annotations.filter((a) => a.type === 'image' && a.imageData);
    let counter = 0;
    for (const ann of uploads) {
      if (!ann.imageData) continue;
      const match = ann.imageData.match(/^data:(image\/[^;]+);base64,(.+)$/);
      if (!match) continue;
      const fileExt = mimeToExt(match[1]);
      counter++;
      folder.file(
        `page_${String(ann.pageIndex + 1).padStart(3, '0')}_image_${String(counter).padStart(3, '0')}.${fileExt}`,
        match[2],
        { base64: true }
      );
    }
    summaryLines.push(`uploaded_images/   : ${counter} images`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 4) Photos attached to BIM @Inspection annotations
  // ─────────────────────────────────────────────────────────────────────────
  if (options.includeBimImages) {
    const folder = zip.folder('bim_images');
    if (!folder) throw new Error('Failed to create bim_images folder');
    let counter = 0;
    const meta: string[] = ['# BIM @Inspection images', ''];
    for (const ann of annotations) {
      if (ann.type !== 'bim-capture' || !ann.bimContent) continue;
      const imgs = ann.bimContent.images || [];
      if (!imgs.length) continue;

      const bimType = ann.bimContent.type || 'bim';
      const labelParts: string[] = [bimType];
      if (ann.bimContent.doorType) labelParts.push(ann.bimContent.doorType);
      if (ann.bimContent.wallType) labelParts.push(ann.bimContent.wallType);
      if (ann.bimContent.supplierName) labelParts.push(ann.bimContent.supplierName);
      if (ann.bimContent.fireRatingValue) labelParts.push(ann.bimContent.fireRatingValue);
      const label = sanitize(labelParts.join('_'));

      const subdir = folder.folder(`${label}_${ann.id.slice(0, 6)}`);
      if (!subdir) continue;

      // Write a notes file with the BIM data
      const notesLines: string[] = [
        `BIM Type: ${bimType}`,
        `Page: ${ann.pageIndex + 1}`,
        ...Object.entries(ann.bimContent)
          .filter(([k, v]) => k !== 'images' && k !== 'type' && v)
          .map(([k, v]) => `${k}: ${v}`),
      ];
      subdir.file('_data.txt', notesLines.join('\n'));

      let idx = 0;
      for (const dataUrl of imgs) {
        const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (!match) continue;
        const fileExt = mimeToExt(match[1]);
        idx++;
        counter++;
        subdir.file(`photo_${String(idx).padStart(2, '0')}.${fileExt}`, match[2], { base64: true });
      }
      meta.push(`${label}_${ann.id.slice(0, 6)}/ — page ${ann.pageIndex + 1}, ${imgs.length} photo(s)`);
    }
    folder.file('_index.txt', meta.join('\n'));
    summaryLines.push(`bim_images/        : ${counter} photos`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // 5) Photos attached to Location Pin annotations
  // ─────────────────────────────────────────────────────────────────────────
  if (options.includePinImages) {
    const folder = zip.folder('pin_images');
    if (!folder) throw new Error('Failed to create pin_images folder');
    let counter = 0;
    const meta: string[] = ['# Location Pin images', ''];
    for (const ann of annotations) {
      if (ann.type !== 'pin' || !ann.pinContent) continue;
      const imgs = ann.pinContent.images || [];
      if (!imgs.length) continue;

      const label = sanitize(ann.pinContent.name || `pin_${ann.id.slice(0, 6)}`);
      const subdir = folder.folder(`${label}_${ann.id.slice(0, 6)}`);
      if (!subdir) continue;

      const notesLines: string[] = [
        `Pin Name: ${ann.pinContent.name || '(unnamed)'}`,
        `Page: ${ann.pageIndex + 1}`,
        '',
        'Notes:',
        ann.pinContent.text || '(no notes)',
      ];
      subdir.file('_notes.txt', notesLines.join('\n'));

      let idx = 0;
      for (const dataUrl of imgs) {
        const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/);
        if (!match) continue;
        const fileExt = mimeToExt(match[1]);
        idx++;
        counter++;
        subdir.file(`photo_${String(idx).padStart(2, '0')}.${fileExt}`, match[2], { base64: true });
      }
      meta.push(`${label}_${ann.id.slice(0, 6)}/ — page ${ann.pageIndex + 1}, ${imgs.length} photo(s)`);
    }
    folder.file('_index.txt', meta.join('\n'));
    summaryLines.push(`pin_images/        : ${counter} photos`);
  }

  zip.file('_summary.txt', summaryLines.join('\n') + '\n');
  return zip.generateAsync({ type: 'blob' });
}

/**
 * Extract real raster image XObjects embedded in the PDF using pdfjs.
 * Writes them into the given folder. Returns the number of images written.
 */
async function extractEmbeddedImages(
  pageCount: number,
  folder: JSZip,
  mime: string,
  ext: string,
): Promise<number> {
  const doc = getPdfDoc();
  if (!doc) return 0;
  const OPS = (pdfjsLib as any).OPS;
  let written = 0;

  for (let pageNum = 1; pageNum <= Math.min(pageCount, doc.numPages); pageNum++) {
    let page: pdfjsLib.PDFPageProxy;
    try {
      page = await doc.getPage(pageNum);
    } catch {
      continue;
    }
    let opList: any;
    try {
      opList = await page.getOperatorList();
    } catch {
      continue;
    }
    const seen = new Set<string>();
    for (let i = 0; i < opList.fnArray.length; i++) {
      const fn = opList.fnArray[i];
      if (fn !== OPS.paintImageXObject && fn !== OPS.paintInlineImageXObject) continue;
      const args = opList.argsArray[i];
      const imgRef = args && args[0];
      const refName = typeof imgRef === 'string' ? imgRef : null;
      if (refName && seen.has(refName)) continue;
      if (refName) seen.add(refName);

      let imgObj: any;
      try {
        if (refName) {
          // page.objs.get with async resolution
          imgObj = await new Promise<any>((resolve) => {
            try {
              page.objs.get(refName, (o: any) => resolve(o));
            } catch {
              resolve(null);
            }
          });
        } else if (fn === OPS.paintInlineImageXObject) {
          imgObj = args[0];
        }
      } catch {
        imgObj = null;
      }
      if (!imgObj) continue;

      const width: number = imgObj.width || 0;
      const height: number = imgObj.height || 0;
      const data: Uint8Array | Uint8ClampedArray | undefined = imgObj.data;
      const kind: number | undefined = imgObj.kind;
      if (!width || !height || !data) continue;

      try {
        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) continue;
        const imgData = ctx.createImageData(width, height);
        // pdfjs image kinds:
        //   1 = GRAYSCALE_1BPP, 2 = RGB_24BPP, 3 = RGBA_32BPP
        if (kind === 3 || (data.length === width * height * 4)) {
          imgData.data.set(data);
        } else if (kind === 2 || data.length === width * height * 3) {
          // RGB → RGBA
          let di = 0;
          for (let s = 0; s < data.length; s += 3) {
            imgData.data[di++] = data[s];
            imgData.data[di++] = data[s + 1];
            imgData.data[di++] = data[s + 2];
            imgData.data[di++] = 255;
          }
        } else if (kind === 1 || data.length === width * height) {
          // Grayscale → RGBA
          let di = 0;
          for (let s = 0; s < data.length; s++) {
            const v = data[s];
            imgData.data[di++] = v;
            imgData.data[di++] = v;
            imgData.data[di++] = v;
            imgData.data[di++] = 255;
          }
        } else {
          // Unknown layout — best-effort: skip
          continue;
        }
        ctx.putImageData(imgData, 0, 0);
        const blob = await canvasToBlob(canvas, mime);
        if (!blob) continue;
        const buf = await blob.arrayBuffer();
        written++;
        const fname = `page_${String(pageNum).padStart(3, '0')}_img_${String(written).padStart(3, '0')}.${ext}`;
        folder.file(fname, buf);
      } catch (err) {
        console.warn('Failed to write embedded image:', err);
      }
    }

    // Free worker-side resources for this page
    try { page.cleanup(); } catch { /* ignore */ }
  }

  return written;
}

function canvasToBlob(canvas: HTMLCanvasElement, mime: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), mime, 0.92));
}

function mimeToExt(mime: string): string {
  switch (mime) {
    case 'image/png': return 'png';
    case 'image/jpeg':
    case 'image/jpg': return 'jpg';
    case 'image/webp': return 'webp';
    case 'image/gif': return 'gif';
    case 'image/bmp': return 'bmp';
    case 'image/svg+xml': return 'svg';
    default: return 'png';
  }
}

/** Trigger a file download for a blob */
export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
