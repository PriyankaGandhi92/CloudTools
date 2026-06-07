import * as pdfjsLib from 'pdfjs-dist';
import { AnnotationMode } from 'pdfjs-dist';

// Widget subtypes for form fields
const WIDGET_SUBTYPE = 'Widget';

/**
 * Draw form field widgets directly onto a canvas context.
 * This handles PDFs where form fields don't have appearance streams
 * (common in blueprint/engineering PDFs). Adobe and Bluebeam generate
 * these appearances on-the-fly; we replicate that here.
 */
async function drawFormFieldWidgets(
  page: any,
  ctx: CanvasRenderingContext2D,
  viewport: any,
  formFieldValues?: Record<string, string | boolean>
) {
  try {
    const annotations = await page.getAnnotations({ intent: 'display' });
    // Debug: log all annotations
    console.log('[FormFields] Total annotations:', annotations.length);
    
    const formWidgets = annotations.filter(
      (a: any) => a.subtype === WIDGET_SUBTYPE || a.fieldType
    );
    console.log('[FormFields] Form widgets found:', formWidgets.length);
    console.log('[FormFields] Widget details:', formWidgets.map((w: any) => ({
      fieldType: w.fieldType,
      fieldName: w.fieldName,
      fieldValue: w.fieldValue,
      hasAppearance: w.hasAppearance,
      rect: w.rect,
      subtype: w.subtype
    })));
    
    if (formWidgets.length === 0) return;

    for (const widget of formWidgets) {
      if (!widget.rect || widget.rect.length < 4) {
        console.log('[FormFields] Skipping widget - no rect:', widget);
        continue;
      }

      // Use pdf.js viewport to properly convert PDF coordinates to canvas coordinates
      // widget.rect is [x1, y1, x2, y2] in PDF user space
      const [x1, y1, x2, y2] = widget.rect;
      
      // Convert to viewport coordinates using pdf.js's transform
      const [canvasX1, canvasY1] = viewport.convertToViewportPoint(x1, y1);
      const [canvasX2, canvasY2] = viewport.convertToViewportPoint(x2, y2);
      
      const canvasX = Math.min(canvasX1, canvasX2);
      const canvasY = Math.min(canvasY1, canvasY2);
      const canvasW = Math.abs(canvasX2 - canvasX1);
      const canvasH = Math.abs(canvasY2 - canvasY1);

      // Use provided form field values if available, otherwise use original PDF value
      const fieldName = widget.fieldName;
      let fieldValue = widget.fieldValue || widget.buttonValue || '';
      if (formFieldValues && fieldName && fieldName in formFieldValues) {
        fieldValue = String(formFieldValues[fieldName]);
      }

      console.log('[FormFields] Drawing widget:', {
        fieldType: widget.fieldType,
        fieldName: widget.fieldName,
        fieldValue: fieldValue,
        pdfRect: [x1, y1, x2, y2],
        canvasRect: [canvasX, canvasY, canvasW, canvasH]
      });

      if (canvasW <= 2 || canvasH <= 2) {
        console.log('[FormFields] Skipping - too small:', canvasW, canvasH);
        continue;
      }

      ctx.save();

      const fieldType = widget.fieldType; // Tx, Btn, Ch

      // Draw field background
      if (widget.backgroundColor) {
        const [r, g, b] = widget.backgroundColor;
        ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      } else {
        ctx.fillStyle = '#ffffff';
      }
      ctx.fillRect(canvasX, canvasY, canvasW, canvasH);

      // Draw field border
      const borderWidth = (widget.borderStyle?.width || 1) * viewport.scale;
      if (widget.borderColor) {
        const [r, g, b] = widget.borderColor;
        ctx.strokeStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
      } else {
        ctx.strokeStyle = '#000000';
      }
      ctx.lineWidth = borderWidth;
      ctx.strokeRect(canvasX, canvasY, canvasW, canvasH);

      // Draw field content based on type
      if (fieldType === 'Tx' && fieldValue) {
        // Text field
        const fontSize = Math.min((widget.defaultAppearanceData?.fontSize || 10) * viewport.scale, canvasH * 0.8);
        const fontName = widget.defaultAppearanceData?.fontName || 'Helvetica';
        ctx.font = `${fontSize}px ${fontName}, Arial, sans-serif`;
        if (widget.color) {
          const [r, g, b] = widget.color;
          ctx.fillStyle = `rgb(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)})`;
        } else {
          ctx.fillStyle = '#000000';
        }
        ctx.textBaseline = 'middle';
        const textX = canvasX + 2 * viewport.scale;
        const textY = canvasY + canvasH / 2;
        ctx.beginPath();
        ctx.rect(canvasX, canvasY, canvasW, canvasH);
        ctx.clip();
        ctx.fillText(String(fieldValue), textX, textY);
      } else if (fieldType === 'Btn') {
        // Checkbox or radio button
        if (widget.checkBox) {
          // Draw checkmark if checked
          const isChecked = fieldValue && fieldValue !== 'Off' && fieldValue !== '';
          if (isChecked) {
            ctx.strokeStyle = '#000000';
            ctx.lineWidth = 2 * viewport.scale;
            ctx.beginPath();
            ctx.moveTo(canvasX + canvasW * 0.2, canvasY + canvasH * 0.5);
            ctx.lineTo(canvasX + canvasW * 0.4, canvasY + canvasH * 0.75);
            ctx.lineTo(canvasX + canvasW * 0.8, canvasY + canvasH * 0.25);
            ctx.stroke();
          }
        } else if (widget.radioButton) {
          // Draw filled circle if selected
          const isSelected = fieldValue && fieldValue !== 'Off' && fieldValue !== '';
          ctx.beginPath();
          ctx.arc(canvasX + canvasW / 2, canvasY + canvasH / 2, Math.min(canvasW, canvasH) * 0.35, 0, Math.PI * 2);
          if (isSelected) {
            ctx.fillStyle = '#000000';
            ctx.fill();
          }
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1 * viewport.scale;
          ctx.stroke();
        }
      } else if (fieldType === 'Ch' && fieldValue) {
        // Choice field (dropdown/listbox)
        const fontSize = Math.min((widget.defaultAppearanceData?.fontSize || 10) * viewport.scale, canvasH * 0.8);
        ctx.font = `${fontSize}px Arial, sans-serif`;
        ctx.fillStyle = '#000000';
        ctx.textBaseline = 'middle';
        ctx.beginPath();
        ctx.rect(canvasX, canvasY, canvasW, canvasH);
        ctx.clip();
        ctx.fillText(String(fieldValue), canvasX + 2 * viewport.scale, canvasY + canvasH / 2);
        // Draw dropdown arrow
        const arrowSize = canvasH * 0.3;
        const arrowX = canvasX + canvasW - arrowSize - 2 * viewport.scale;
        const arrowY = canvasY + canvasH / 2;
        ctx.beginPath();
        ctx.moveTo(arrowX, arrowY - arrowSize / 2);
        ctx.lineTo(arrowX + arrowSize, arrowY - arrowSize / 2);
        ctx.lineTo(arrowX + arrowSize / 2, arrowY + arrowSize / 2);
        ctx.closePath();
        ctx.fillStyle = '#666666';
        ctx.fill();
      }

      ctx.restore();
    }
  } catch (err) {
    // Silently fail — form fields are a visual enhancement, not critical
    console.warn('Form field rendering warning:', err);
  }
}

pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

// Support multiple PDFs appended together
interface PdfSegment {
  doc: pdfjsLib.PDFDocumentProxy;
  startPage: number; // global page index
  pageCount: number;
}

let segments: PdfSegment[] = [];

// Page ordering: maps virtual page index to actual underlying page index
// e.g. pageOrder[0] = 3 means "the first visible page is actually underlying page 3"
// When empty, identity mapping is used.
let pageOrder: number[] = [];

// Memory caching layers for performance
const textItemsCache = new Map<number, any[]>();
const dimensionsCache = new Map<number, { width: number; height: number }>();

// Clear caches when PDF is reloaded
export function clearCaches() {
  textItemsCache.clear();
  dimensionsCache.clear();
}

function resolveVirtual(virtualIndex: number): number {
  if (pageOrder.length === 0) return virtualIndex;
  return pageOrder[virtualIndex] ?? virtualIndex;
}

function totalPages(): number {
  return segments.reduce((s, seg) => s + seg.pageCount, 0);
}

function resolveGlobalPage(globalIndex: number): { doc: pdfjsLib.PDFDocumentProxy; localPage: number } | null {
  const actual = resolveVirtual(globalIndex);
  for (const seg of segments) {
    if (actual < seg.startPage + seg.pageCount) {
      return { doc: seg.doc, localPage: actual - seg.startPage + 1 };
    }
  }
  return null;
}

export async function loadPdf(data: ArrayBuffer): Promise<pdfjsLib.PDFDocumentProxy> {
  // Phase 3: Memory Management - Disable auto-fetch for large PDFs
  // Clone so pdf.js worker transfer doesn't detach the caller's buffer
  const loadingTask = pdfjsLib.getDocument({
    data: data.slice(0),
    disableAutoFetch: true, // Crucial for 100+ page documents - only fetch pages on demand
    disableStream: false,
  });
  const doc = await loadingTask.promise;
  segments = [{ doc, startPage: 0, pageCount: doc.numPages }];
  pageOrder = []; // reset ordering on new load
  clearCaches(); // clear memory caches on new load
  return doc;
}

// Phase 3: Memory Management - Explicit cleanup for PDF pages
// Call this when navigating away from a page to free memory
export const cleanupPdfPage = (page: any) => {
  if (page && typeof page.cleanup === 'function') {
    try {
      page.cleanup();
    } catch (e) {
      console.warn('Failed to cleanup PDF page:', e);
    }
  }
};

export async function appendPdf(data: ArrayBuffer): Promise<number> {
  const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
  const doc = await loadingTask.promise;
  const oldTotal = totalPages();
  const start = oldTotal;
  segments.push({ doc, startPage: start, pageCount: doc.numPages });
  const newTotal = totalPages();
  // Extend page order to include newly appended pages
  if (pageOrder.length > 0) {
    for (let i = oldTotal; i < newTotal; i++) pageOrder.push(i);
  }
  return newTotal;
}

// Insert a blank page at a specific global page position
export async function insertBlankPage(atGlobalPage: number, pageSize: 'letter' | '11x17' | 'a4' | 'legal' = 'letter'): Promise<number> {
  // Create a blank PDF with one page
  const { PDFDocument, rgb } = await import('pdf-lib');
  const pdfDoc = await PDFDocument.create();
  
  // Page sizes in points (1 point = 1/72 inch)
  const pageSizes = {
    letter: [612, 792],      // 8.5 x 11 inches
    '11x17': [792, 1224],     // 11 x 17 inches
    a4: [595.28, 841.89],     // A4 size
    legal: [612, 1008],       // 8.5 x 14 inches
  };
  
  const [width, height] = pageSizes[pageSize];
  const page = pdfDoc.addPage([width, height]);
  page.drawLine({
    start: { x: 0, y: 0 },
    end: { x: width, y: height },
    thickness: 0,
    color: rgb(1, 1, 1),
  });
  const pdfBytes = await pdfDoc.save();
  
  const loadingTask = pdfjsLib.getDocument({ data: pdfBytes.slice() });
  const doc = await loadingTask.promise;
  
  // 1. Get the current total BEFORE insertion
  const oldTotal = totalPages();

  // 2. Physically append the new document to the end of the segments array
  segments.push({ doc, startPage: oldTotal, pageCount: 1 });
  
  // 3. Initialize the virtual page ordering array if this is the first mutation
  if (pageOrder.length === 0) {
    pageOrder = Array.from({ length: oldTotal }, (_, i) => i);
  }
  
  // 4. Splice the new underlying page index exactly where the user requested
  pageOrder.splice(atGlobalPage, 0, oldTotal);
  
  return totalPages();
}

// Insert PDF pages at a specific global page position
export async function insertPdfAt(data: ArrayBuffer, atGlobalPage: number): Promise<number> {
  const loadingTask = pdfjsLib.getDocument({ data: data.slice(0) });
  const doc = await loadingTask.promise;
  
  // 1. Get the current total BEFORE insertion
  const oldTotal = totalPages();
  
  // 2. Physically append the new document segment to the end
  segments.push({ doc, startPage: oldTotal, pageCount: doc.numPages });
  
  // 3. Initialize the virtual page ordering array if this is the first mutation
  if (pageOrder.length === 0) {
    pageOrder = Array.from({ length: oldTotal }, (_, i) => i);
  }
  
  // 4. Generate the new underlying page indices (e.g., [42, 43, 44])
  const newIndices = Array.from({ length: doc.numPages }, (_, i) => oldTotal + i);
  
  // 5. Splice the new indices into the virtual display map exactly where requested
  pageOrder.splice(atGlobalPage, 0, ...newIndices);
  
  return totalPages();
}

export function getSegments() {
  return segments;
}

/**
 * Get the PDF document for a specific page index.
 * Returns null if no document is loaded for that page.
 */
export function getDocumentForPage(pageIndex: number): pdfjsLib.PDFDocumentProxy | null {
  const resolved = resolveGlobalPage(pageIndex);
  if (!resolved) return null;
  return resolved.doc;
}

/**
 * Reorder a page from one virtual position to another.
 * This updates the internal page order mapping used by all rendering functions.
 */
export function reorderRendererPage(from: number, to: number): void {
  const total = totalPages();
  // Initialize identity mapping if needed
  if (pageOrder.length === 0) {
    pageOrder = Array.from({ length: total }, (_, i) => i);
  }
  // Move the page
  const [moved] = pageOrder.splice(from, 1);
  pageOrder.splice(to, 0, moved);
}

/** Get the current page order (empty = identity). */
export function getPageOrder(): number[] {
  return pageOrder;
}

export async function renderPage(
  pageIndex: number,
  canvas: HTMLCanvasElement,
  scale: number = 1,
  rotation: number = 0,
  skipFormFields: boolean = true,
  formFieldValues?: Record<string, string | boolean>
): Promise<{ width: number; height: number }> {
  const resolved = resolveGlobalPage(pageIndex);
  if (!resolved) throw new Error('No PDF loaded');
  const page = await resolved.doc.getPage(resolved.localPage);
  const viewport = page.getViewport({ scale });
  
  // Apply rotation if needed
  const rotatedViewport = rotation !== 0 ? page.getViewport({ scale, rotation: rotation }) : viewport;
  
  // Cache dimensions
  const cacheKey = pageIndex;
  if (!dimensionsCache.has(cacheKey)) {
    dimensionsCache.set(cacheKey, { width: rotatedViewport.width, height: rotatedViewport.height });
  }
  
  canvas.width = rotatedViewport.width;
  canvas.height = rotatedViewport.height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Cannot get 2d context');
  
  // Clear canvas
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  await page.render({
    canvasContext: ctx,
    viewport: rotatedViewport,
    annotationMode: AnnotationMode.ENABLE_FORMS,
  }).promise;

  // Draw form field widgets that don't have appearance streams
  // Skip this step for faster rendering when not in form edit mode
  if (!skipFormFields) {
    await drawFormFieldWidgets(page, ctx, rotatedViewport, formFieldValues);
  }

  // Phase 3: Memory Management - Cleanup page after rendering to free memory
  cleanupPdfPage(page);
  
  return { width: rotatedViewport.width, height: rotatedViewport.height };
}

export async function renderPageThumbnail(
  pageIndex: number,
  canvas: HTMLCanvasElement,
  maxWidth: number = 150,
  annotations: any[] = [],
  rotation: number = 0,
  skipFormFields: boolean = true
): Promise<void> {
  const resolved = resolveGlobalPage(pageIndex);
  if (!resolved) return;
  const page = await resolved.doc.getPage(resolved.localPage);
  
  // Get the page's inherent rotation from the PDF
  const pageRotation = page.rotate || 0;
  const totalRotation = (rotation + pageRotation) % 360;
  
  const viewport = page.getViewport({ scale: 1 });
  
  // Apply rotation if needed (combine page rotation with user rotation)
  const rotatedViewport = totalRotation !== 0 ? page.getViewport({ scale: 1, rotation: totalRotation }) : viewport;
  
  // Calculate scale based on the larger dimension to ensure proper fitting
  const maxDimension = Math.max(rotatedViewport.width, rotatedViewport.height);
  const scale = maxWidth / maxDimension;
  const thumbViewport = page.getViewport({ scale, rotation: totalRotation });
  
  // Only resize canvas if dimensions actually changed (prevents unnecessary re-paints)
  const targetWidth = Math.floor(thumbViewport.width);
  const targetHeight = Math.floor(thumbViewport.height);
  if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
    canvas.width = targetWidth;
    canvas.height = targetHeight;
  }
  
  const ctx = canvas.getContext('2d');
  if (!ctx) return;
  
  // Clear canvas
  ctx.fillStyle = 'white';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  
  await page.render({
    canvasContext: ctx,
    viewport: thumbViewport,
    annotationMode: AnnotationMode.ENABLE_FORMS,
  }).promise;

  // Draw form field widgets on thumbnails too (only when not skipping)
  if (!skipFormFields) {
    await drawFormFieldWidgets(page, ctx, thumbViewport);
  }

  // Phase 3: Memory Management - Cleanup page after rendering to free memory
  cleanupPdfPage(page);

  // Render annotations on top of the thumbnail
  const pageAnnotations = annotations.filter((a) => a.pageIndex === pageIndex);
  for (const ann of pageAnnotations) {
    ctx.save();
    ctx.strokeStyle = ann.style.stroke;
    ctx.lineWidth = ann.style.strokeWidth * scale;
    ctx.fillStyle = ann.style.fill;
    ctx.globalAlpha = ann.style.opacity;

    const flatPoints = ann.points.flatMap((p: any) => [p.x * scale, p.y * scale]);

    switch (ann.type) {
      case 'line':
      case 'arrow':
        if (flatPoints.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(flatPoints[0], flatPoints[1]);
          ctx.lineTo(flatPoints[2], flatPoints[3]);
          ctx.stroke();
        }
        break;
      case 'rectangle':
        if (ann.width && ann.height && ann.points.length > 0) {
          const x = ann.points[0].x * scale;
          const y = ann.points[0].y * scale;
          const w = ann.width * scale;
          const h = ann.height * scale;
          ctx.strokeRect(x, y, w, h);
          if (ann.style.fill !== 'transparent') {
            ctx.fillRect(x, y, w, h);
          }
        }
        break;
      case 'circle':
        if (ann.radius && ann.points.length > 0) {
          const x = ann.points[0].x * scale;
          const y = ann.points[0].y * scale;
          const r = ann.radius * scale;
          ctx.beginPath();
          ctx.arc(x, y, r, 0, Math.PI * 2);
          ctx.stroke();
          if (ann.style.fill !== 'transparent') {
            ctx.fill();
          }
        }
        break;
      case 'freehand':
      case 'highlight':
        if (flatPoints.length >= 4) {
          ctx.beginPath();
          ctx.moveTo(flatPoints[0], flatPoints[1]);
          for (let i = 2; i < flatPoints.length; i += 2) {
            ctx.lineTo(flatPoints[i], flatPoints[i + 1]);
          }
          ctx.stroke();
        }
        break;
      case 'text':
        if (ann.text && ann.points.length > 0) {
          const x = ann.points[0].x * scale;
          const y = ann.points[0].y * scale;
          const fontSize = (ann.style.fontSize || 16) * scale;
          ctx.font = `${fontSize}px ${ann.style.fontFamily || 'Arial'}`;
          ctx.fillText(ann.text, x, y + fontSize);
        }
        break;
      case 'image':
        if (ann.imageData && ann.width && ann.height && ann.points.length > 0) {
          const img = new Image();
          img.src = ann.imageData;
          if (img.complete) {
            const x = ann.points[0].x * scale;
            const y = ann.points[0].y * scale;
            const w = ann.width * scale;
            const h = ann.height * scale;
            ctx.drawImage(img, x, y, w, h);
          }
        }
        break;
      case 'stamp-check':
      case 'stamp-x':
        if (ann.points.length > 0) {
          const x = ann.points[0].x * scale;
          const y = ann.points[0].y * scale;
          const size = 30 * scale;
          ctx.strokeStyle = ann.type === 'stamp-check' ? '#22c55e' : '#000000';
          ctx.lineWidth = 3 * scale;
          ctx.beginPath();
          if (ann.type === 'stamp-check') {
            ctx.moveTo(x - size/2, y);
            ctx.lineTo(x - size/6, y + size/2);
            ctx.lineTo(x + size/2, y - size/2);
          } else {
            ctx.moveTo(x - size/2, y - size/2);
            ctx.lineTo(x + size/2, y + size/2);
            ctx.moveTo(x + size/2, y - size/2);
            ctx.lineTo(x - size/2, y + size/2);
          }
          ctx.stroke();
        }
        break;
    }
    ctx.restore();
  }
}

export function getPageCount(): number {
  return totalPages();
}

/**
 * Extract specific pages from the PDF and create a new PDF document.
 * @param pageIndices - Array of page indices to extract (0-based)
 * @returns ArrayBuffer of the new PDF
 */
export async function extractPages(pageIndices: number[]): Promise<ArrayBufferLike> {
  if (pageIndices.length === 0) {
    throw new Error('No pages to extract');
  }

  const { PDFDocument } = await import('pdf-lib');
  const currentDoc = getPdfDoc();
  if (!currentDoc) {
    throw new Error('No PDF loaded');
  }

  // Create a new PDF document
  const newPdf = await PDFDocument.create();

  // Get sorted unique page indices
  const sortedIndices = [...new Set(pageIndices)].sort((a, b) => a - b);

  // Load the current PDF as a pdf-lib document
  const pdfBytes = await currentDoc.getData();
  const sourcePdf = await PDFDocument.load(pdfBytes);

  // Copy each page to the new PDF
  for (const pageIndex of sortedIndices) {
    if (pageIndex < 0 || pageIndex >= currentDoc.numPages) {
      continue;
    }
    const [copiedPage] = await newPdf.copyPages(sourcePdf, [pageIndex]);
    newPdf.addPage(copiedPage);
  }

  // Save the new PDF
  const newPdfBytes = await newPdf.save();
  return newPdfBytes.buffer;
}

export function getPdfDoc(): pdfjsLib.PDFDocumentProxy | null {
  return segments.length > 0 ? segments[0].doc : null;
}

/** Get the PDF page dimensions at scale=1 (in PDF points). */
export async function getPageDimensions(pageIndex: number): Promise<{ width: number; height: number } | null> {
  const resolved = resolveGlobalPage(pageIndex);
  if (!resolved) return null;
  const page = await resolved.doc.getPage(resolved.localPage);
  const vp = page.getViewport({ scale: 1 });
  return { width: vp.width, height: vp.height };
}

// Get text items with font info for a given page
export interface PdfTextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontFamily: string;
  fontSize: number;
  fontColor?: string; // RGB color from PDF
  fontName?: string; // Original PDF font name
  fontMatched?: boolean; // Whether we found a matching web font
  rotation?: number; // Text rotation angle in degrees
}

export async function getPageTextItems(pageIndex: number): Promise<PdfTextItem[]> {
  // Check cache first
  if (textItemsCache.has(pageIndex)) {
    return textItemsCache.get(pageIndex) || [];
  }

  const resolved = resolveGlobalPage(pageIndex);
  if (!resolved) return [];

  let page; // Declare outside try for finally block
  try {
    page = await resolved.doc.getPage(resolved.localPage);
    const viewport = page.getViewport({ scale: 2 }); // match the render scale of 2
    const textContent = await page.getTextContent();
    const items: PdfTextItem[] = [];

  for (const item of textContent.items) {
    if (!('str' in item) || !item.str) continue;
    const tx = pdfjsLib.Util.transform(viewport.transform, item.transform);
    // tx: [scaleX, shearX, shearY, scaleY, translateX, translateY]
    const fontSize = Math.abs(tx[3]); // scaled font size
    const x = tx[4];
    const y = tx[5] - fontSize; // adjust from baseline to top
    const width = item.width * (viewport.width / (page.getViewport({ scale: 1 }).width));
    const height = fontSize;

    // Extract rotation angle from the transform matrix
    // The rotation is derived from the shear values in the matrix
    // Matrix: [scaleX, skewX, skewY, scaleY, translateX, translateY]
    // Rotation angle = atan2(skewY, scaleX)
    let rotation = 0;
    if (item.transform) {
      const scaleX = item.transform[0];
      const skewY = item.transform[2];
      // Calculate rotation in radians, then convert to degrees
      rotation = Math.atan2(skewY, scaleX) * (180 / Math.PI);
      // Round to nearest 90 degrees to handle typical PDF text rotations
      rotation = Math.round(rotation / 90) * 90;
      // Normalize to 0-360 range
      if (rotation < 0) rotation += 360;
      if (rotation >= 360) rotation -= 360;
    }

    // Extract font color (RGB from PDF text color)
    let fontColor = '#000000';
    if ('color' in item && item.color) {
      const c = item.color as { r: number; g: number; b: number; a?: number };
      fontColor = `rgb(${Math.round(c.r * 255)},${Math.round(c.g * 255)},${Math.round(c.b * 255)})`;
    }

    // Extract font family from the font name – broader matching
    let fontFamily = 'Arial';
    let fontMatched = true;
    if (item.fontName) {
      const fn = item.fontName.toLowerCase();
      if (fn.includes('times') || fn.includes('timesnewroman')) fontFamily = 'Times New Roman';
      else if (fn.includes('courier') || fn.includes('mono') || fn.includes('consola')) fontFamily = 'Courier New';
      else if (fn.includes('helvetica') || fn.includes('arial')) fontFamily = 'Arial';
      else if (fn.includes('georgia')) fontFamily = 'Georgia';
      else if (fn.includes('verdana')) fontFamily = 'Verdana';
      else if (fn.includes('calibri')) fontFamily = 'Calibri, Arial';
      else if (fn.includes('cambria')) fontFamily = 'Cambria, Georgia';
      else if (fn.includes('garamond')) fontFamily = 'Garamond, Georgia';
      else if (fn.includes('palatino')) fontFamily = 'Palatino Linotype, Palatino, Georgia';
      else if (fn.includes('trebuchet')) fontFamily = 'Trebuchet MS, Arial';
      else if (fn.includes('tahoma')) fontFamily = 'Tahoma, Arial';
      else if (fn.includes('impact')) fontFamily = 'Impact, Arial Black';
      else if (fn.includes('lucida') && fn.includes('console')) fontFamily = 'Lucida Console, Courier New';
      else if (fn.includes('lucida')) fontFamily = 'Lucida Sans, Arial';
      else if (fn.includes('comic')) fontFamily = 'Comic Sans MS';
      else if (fn.includes('book') && fn.includes('antiqua')) fontFamily = 'Book Antiqua, Palatino';
      else if (fn.includes('century') && fn.includes('gothic')) fontFamily = 'Century Gothic, Arial';
      else if (fn.includes('franklin')) fontFamily = 'Franklin Gothic Medium, Arial';
      else if (fn.includes('futura')) fontFamily = 'Futura, Arial';
      else if (fn.includes('rockwell')) fontFamily = 'Rockwell, Georgia';
      else if (fn.includes('optima')) fontFamily = 'Optima, Arial';
      else if (fn.includes('baskerville')) fontFamily = 'Baskerville, Georgia';
      else if (fn.includes('bodoni')) fontFamily = 'Bodoni MT, Times New Roman';
      else if (fn.includes('didot')) fontFamily = 'Didot, Georgia';
      else if (fn.includes('gill')) fontFamily = 'Gill Sans, Arial';
      else if (fn.includes('hoefler')) fontFamily = 'Hoefler Text, Georgia';
      else if (fn.includes('perpetua')) fontFamily = 'Perpetua, Georgia';
      else if (fn.includes('rockwell')) fontFamily = 'Rockwell, Georgia';
      else if (fn.includes('segoe') || fn.includes('ui')) fontFamily = 'Segoe UI, Arial';
      else if (fn.includes('source')) fontFamily = 'Source Sans Pro, Arial';
      else if (fn.includes('roboto')) fontFamily = 'Roboto, Arial';
      else if (fn.includes('open')) fontFamily = 'Open Sans, Arial';
      else if (fn.includes('lato')) fontFamily = 'Lato, Arial';
      else if (fn.includes('montserrat')) fontFamily = 'Montserrat, Arial';
      else if (fn.includes('raleway')) fontFamily = 'Raleway, Arial';
      else if (fn.includes('poppins')) fontFamily = 'Poppins, Arial';
      else if (fn.includes('nunito')) fontFamily = 'Nunito, Arial';
      else if (fn.includes('merriweather')) fontFamily = 'Merriweather, Georgia';
      else if (fn.includes('playfair')) fontFamily = 'Playfair Display, Georgia';
      else if (fn.includes('lora')) fontFamily = 'Lora, Georgia';
      else if (fn.includes('crimson')) fontFamily = 'Crimson Text, Georgia';
      else if (fn.includes('eb') && fn.includes('garamond')) fontFamily = 'EB Garamond, Georgia';
      else if (fn.includes('libre') && fn.includes('baskerville')) fontFamily = 'Libre Baskerville, Georgia';
      else if (fn.includes('libre') && fn.includes('franklin')) fontFamily = 'Libre Franklin, Arial';
      else if (fn.includes('pt') && fn.includes('serif')) fontFamily = 'PT Serif, Georgia';
      else if (fn.includes('pt') && fn.includes('sans')) fontFamily = 'PT Sans, Arial';
      else if (fn.includes('inconsolata')) fontFamily = 'Inconsolata, Courier New';
      else if (fn.includes('fira') && fn.includes('mono')) fontFamily = 'Fira Mono, Courier New';
      else if (fn.includes('fira') && fn.includes('sans')) fontFamily = 'Fira Sans, Arial';
      else if (fn.includes('ibm') && fn.includes('plex')) fontFamily = 'IBM Plex Sans, Arial';
      else if (fn.includes('noto') && fn.includes('serif')) fontFamily = 'Noto Serif, Georgia';
      else if (fn.includes('noto') && fn.includes('sans')) fontFamily = 'Noto Sans, Arial';
      else if (fn.includes('ubuntu')) fontFamily = 'Ubuntu, Arial';
      else if (fn.includes('droid')) fontFamily = 'Droid Sans, Arial';
      else if (fn.includes('oxygen')) fontFamily = 'Oxygen, Arial';
      else if (fn.includes('cantarell')) fontFamily = 'Cantarell, Arial';
      else if (fn.includes('comfortaa')) fontFamily = 'Comfortaa, Arial';
      else if (fn.includes('exo')) fontFamily = 'Exo, Arial';
      else if (fn.includes('josefin')) fontFamily = 'Josefin Sans, Arial';
      else if (fn.includes('karla')) fontFamily = 'Karla, Arial';
      else if (fn.includes('work')) fontFamily = 'Work Sans, Arial';
      else if (fn.includes('hind')) fontFamily = 'Hind, Arial';
      else if (fn.includes('barlow')) fontFamily = 'Barlow, Arial';
      else if (fn.includes('archivo')) fontFamily = 'Archivo, Arial';
      else if (fn.includes('dm') && fn.includes('sans')) fontFamily = 'DM Sans, Arial';
      else if (fn.includes('dm') && fn.includes('serif')) fontFamily = 'DM Serif Display, Georgia';
      else if (fn.includes('inter')) fontFamily = 'Inter, Arial';
      else if (fn.includes('system') && fn.includes('ui')) fontFamily = '-apple-system, BlinkMacSystemFont, Segoe UI, Arial';
      else if (fn.includes('blinkmac')) fontFamily = '-apple-system, BlinkMacSystemFont, Segoe UI, Arial';
      else if (fn.includes('apple')) fontFamily = '-apple-system, BlinkMacSystemFont, Arial';
      // CAD and technical fonts
      else if (fn.includes('iso') || fn.includes('isocp')) fontFamily = 'ISOCP, Courier New';
      else if (fn.includes('autocad') || fn.includes('txt')) fontFamily = 'Courier New';
      else if (fn.includes('simplex')) fontFamily = 'Arial';
      else if (fn.includes('complex')) fontFamily = 'Times New Roman';
      else if (fn.includes('italic') && fn.includes('c')) fontFamily = 'Courier New, Italic';
      else if (fn.includes('italic') && fn.includes('t')) fontFamily = 'Times New Roman, Italic';
      else if (fn.includes('italic') && fn.includes('a')) fontFamily = 'Arial, Italic';
      else if (fn.includes('bold') && fn.includes('c')) fontFamily = 'Courier New, Bold';
      else if (fn.includes('bold') && fn.includes('t')) fontFamily = 'Times New Roman, Bold';
      else if (fn.includes('bold') && fn.includes('a')) fontFamily = 'Arial, Bold';
      else if (fn.includes('romans')) fontFamily = 'Times New Roman';
      else if (fn.includes('romand')) fontFamily = 'Times New Roman';
      else if (fn.includes('greeks')) fontFamily = 'Symbol';
      else if (fn.includes('greekc')) fontFamily = 'Symbol';
      else if (fn.includes('cyrillic')) fontFamily = 'Times New Roman';
      else if (fn.includes('cyrilt')) fontFamily = 'Times New Roman';
      else if (fn.includes('gothice')) fontFamily = 'Arial';
      else if (fn.includes('gothicg')) fontFamily = 'Arial';
      else if (fn.includes('gothici')) fontFamily = 'Times New Roman';
      else if (fn.includes('gothics')) fontFamily = 'Times New Roman';
      else if (fn.includes('script')) fontFamily = 'Brush Script MT, Cursive';
      else if (fn.includes('cursive')) fontFamily = 'Brush Script MT, Cursive';
      else if (fn.includes('technic')) fontFamily = 'Arial';
      else if (fn.includes('techno')) fontFamily = 'Arial';
      else if (fn.includes('architxt')) fontFamily = 'Arial';
      else if (fn.includes('archstyl')) fontFamily = 'Arial';
      else if (fn.includes('country')) fontFamily = 'Arial';
      else if (fn.includes('swis721')) fontFamily = 'Arial';
      else if (fn.includes('swiss')) fontFamily = 'Arial';
      else if (fn.includes('monotxt')) fontFamily = 'Courier New';
      else if (fn.includes('mono')) fontFamily = 'Courier New';
      else if (fn.includes('sans')) fontFamily = 'Arial';
      else if (fn.includes('serif')) fontFamily = 'Times New Roman';
      // Handle cryptic PDF font names (common in CAD drawings)
      else if (/^[a-z]+_\d+_[a-z]+\d*$/.test(fn)) {
        // Pattern like "g_d1_f1" - default to Arial for these
        fontMatched = false;
        fontFamily = 'Arial';
        console.warn(`No matching web font found for PDF font "${item.fontName}". Using Arial as fallback.`);
      }
      else {
        fontMatched = false;
        fontFamily = 'Arial'; // fallback
        console.warn(`No matching web font found for PDF font "${item.fontName}". Using Arial as fallback.`);
      }
    }

    items.push({
      text: item.str,
      x: x / 2, // divide by 2 to convert back to scale=1 coords used by canvas
      y: y / 2,
      width: width / 2,
      height: height / 2,
      fontFamily,
      fontSize: fontSize / 2,
      fontColor,
      fontName: item.fontName || undefined,
      fontMatched,
      rotation,
    });
  }

  // Store in cache
  textItemsCache.set(pageIndex, items);

  return items;
  } catch (err) {
    console.warn("Could not extract text items:", err);
    return [];
  } finally {
    // Memory Management: Guarantee page cleanup
    if (page) cleanupPdfPage(page);
  }
}

// Find the text item closest to a given point
export async function getTextAtPosition(
  pageIndex: number,
  px: number,
  py: number
): Promise<PdfTextItem | null> {
  const items = await getPageTextItems(pageIndex);
  // Find the item whose bounding box contains or is nearest to the click
  let best: PdfTextItem | null = null;
  let bestDist = Infinity;

  for (const item of items) {
    // Check if point is inside the bounding box (with some tolerance)
    const tolerance = 5;
    if (
      px >= item.x - tolerance &&
      px <= item.x + item.width + tolerance &&
      py >= item.y - tolerance &&
      py <= item.y + item.height + tolerance
    ) {
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist < bestDist) {
        bestDist = dist;
        best = item;
      }
    }
  }

  if (!best) {
    // Fallback: find nearest item within 50px
    for (const item of items) {
      const cx = item.x + item.width / 2;
      const cy = item.y + item.height / 2;
      const dist = Math.hypot(px - cx, py - cy);
      if (dist < bestDist && dist < 50) {
        bestDist = dist;
        best = item;
      }
    }
  }

  return best;
}

export async function getVectorSegmentsForPage(pageIndex: number): Promise<{ p1: { x: number; y: number }; p2: { x: number; y: number } }[]> {
  const resolved = resolveGlobalPage(pageIndex);
  if (!resolved) return [];

  let page; // Declare outside try for finally block
  try {
    page = await resolved.doc.getPage(resolved.localPage);
    const operatorList = await page.getOperatorList();
    const segments: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];

    let currentPos = { x: 0, y: 0 };
    const viewport = page.getViewport({ scale: 1 }); // Map to standard canvas coordinates

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];

      // PDF.js operator IDs: moveTo (13), lineTo (14)
      if (fn === pdfjsLib.OPS.moveTo) {
        if (!args || args.length < 2) continue; // Defensive check
        currentPos = { x: args[0], y: viewport.height - args[1] }; // Invert Y for Canvas
      } else if (fn === pdfjsLib.OPS.lineTo) {
        if (!args || args.length < 2) continue; // Defensive check
        const nextPos = { x: args[0], y: viewport.height - args[1] };
        segments.push({ p1: currentPos, p2: nextPos });
        currentPos = nextPos;
      }
    }
    return segments;
  } catch (err) {
    console.warn("Could not parse vectors for this page:", err);
    return []; // Graceful fallback: Snap just disables itself for this page
  } finally {
    // Memory Management: Guarantee page cleanup
    if (page) cleanupPdfPage(page);
  }
}

// Comprehensive vector extraction with CTM tracking (second-tier logic from ConvertToCAD)
// Returns line segments in canvas coordinate space (Y-inverted) ready for annotation embedding
export async function extractFullVectorGeometry(pageIndex: number): Promise<{ p1: { x: number; y: number }; p2: { x: number; y: number } }[]> {
  const resolved = resolveGlobalPage(pageIndex);
  if (!resolved) return [];

  let page; // Declare outside try for finally block
  try {
    page = await resolved.doc.getPage(resolved.localPage);
    const operatorList = await page.getOperatorList();
    const viewport = page.getViewport({ scale: 1 });
    // Use viewport transform to properly map PDF coords → canvas coords (handles rotation + Y flip)
    const vt = viewport.transform; // [a, b, c, d, e, f] affine matrix
    const segments: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];

    let currentX = 0;
    let currentY = 0;
    let ctm = [1, 0, 0, 1, 0, 0];
    let ctmStack: number[][] = [];

    const transformPoint = (x: number, y: number) => {
      // First apply internal CTM
      const px = ctm[0] * x + ctm[2] * y + ctm[4];
      const py = ctm[1] * x + ctm[3] * y + ctm[5];
      // Then apply viewport transform (handles page rotation + Y inversion)
      return {
        x: vt[0] * px + vt[2] * py + vt[4],
        y: vt[1] * px + vt[3] * py + vt[5],
      };
    };

    const flattenBezier = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, n = 12) => {
      const pts: { x: number; y: number }[] = [];
      for (let i = 0; i <= n; i++) {
        const t = i / n;
        const mt = 1 - t;
        pts.push({
          x: mt * mt * mt * x0 + 3 * mt * mt * t * x1 + 3 * mt * t * t * x2 + t * t * t * x3,
          y: mt * mt * mt * y0 + 3 * mt * mt * t * y1 + 3 * mt * t * t * y2 + t * t * t * y3,
        });
      }
      return pts;
    };

    for (let i = 0; i < operatorList.fnArray.length; i++) {
      const fn = operatorList.fnArray[i];
      const args = operatorList.argsArray[i];

      switch (fn) {
        case pdfjsLib.OPS.moveTo:
          if (!args || args.length < 2) break; // Defensive check
          currentX = args[0];
          currentY = args[1];
          break;

        case pdfjsLib.OPS.lineTo: {
          if (!args || args.length < 2) break; // Defensive check
          const start = transformPoint(currentX, currentY);
          currentX = args[0];
          currentY = args[1];
          const end = transformPoint(currentX, currentY);
          segments.push({ p1: start, p2: end });
          break;
        }

        case pdfjsLib.OPS.transform: {
          if (!args || args.length < 6) break; // Defensive check
          const [a, b, c, d, e, f] = args;
          ctm = [
            ctm[0] * a + ctm[2] * b,
            ctm[1] * a + ctm[3] * b,
            ctm[0] * c + ctm[2] * d,
            ctm[1] * c + ctm[3] * d,
            ctm[0] * e + ctm[2] * f + ctm[4],
            ctm[1] * e + ctm[3] * f + ctm[5],
          ];
          break;
        }

        case pdfjsLib.OPS.save:
          ctmStack.push([...ctm]);
          break;

        case pdfjsLib.OPS.restore:
          if (ctmStack.length > 0) ctm = ctmStack.pop()!;
          break;

        case pdfjsLib.OPS.rectangle: {
          if (!args || args.length < 4) break; // Defensive check
          const rx = args[0], ry = args[1], rw = args[2], rh = args[3];
          const corners = [
            transformPoint(rx, ry),
            transformPoint(rx + rw, ry),
            transformPoint(rx + rw, ry + rh),
            transformPoint(rx, ry + rh),
          ];
          for (let j = 0; j < 4; j++) {
            segments.push({ p1: corners[j], p2: corners[(j + 1) % 4] });
          }
          break;
        }

        case pdfjsLib.OPS.constructPath: {
          if (!args || args.length < 2) break; // Defensive check
          const pathOps = args[0];
          const pathArgs = args[1];
          let px = 0, py = 0, ai = 0;

          for (let j = 0; j < pathOps.length; j++) {
            switch (pathOps[j]) {
              case pdfjsLib.OPS.moveTo:
                if (ai + 1 < pathArgs.length) {
                  px = pathArgs[ai++];
                  py = pathArgs[ai++];
                }
                break;
              case pdfjsLib.OPS.lineTo: {
                if (ai + 1 < pathArgs.length) {
                  const s = transformPoint(px, py);
                  px = pathArgs[ai++];
                  py = pathArgs[ai++];
                  const e = transformPoint(px, py);
                  segments.push({ p1: s, p2: e });
                }
                break;
              }
              case pdfjsLib.OPS.curveTo: {
                if (ai + 5 < pathArgs.length) {
                  const c1x = pathArgs[ai++], c1y = pathArgs[ai++];
                  const c2x = pathArgs[ai++], c2y = pathArgs[ai++];
                  const ex = pathArgs[ai++], ey = pathArgs[ai++];
                  const pts = flattenBezier(px, py, c1x, c1y, c2x, c2y, ex, ey);
                  for (let k = 0; k < pts.length - 1; k++) {
                    segments.push({ p1: transformPoint(pts[k].x, pts[k].y), p2: transformPoint(pts[k + 1].x, pts[k + 1].y) });
                  }
                  px = ex; py = ey;
                }
                break;
              }
              case pdfjsLib.OPS.curveTo2: {
                if (ai + 3 < pathArgs.length) {
                  const c2x = pathArgs[ai++], c2y = pathArgs[ai++];
                  const ex = pathArgs[ai++], ey = pathArgs[ai++];
                  const pts = flattenBezier(px, py, px, py, c2x, c2y, ex, ey);
                  for (let k = 0; k < pts.length - 1; k++) {
                    segments.push({ p1: transformPoint(pts[k].x, pts[k].y), p2: transformPoint(pts[k + 1].x, pts[k + 1].y) });
                  }
                  px = ex; py = ey;
                }
                break;
              }
              case pdfjsLib.OPS.curveTo3: {
                if (ai + 3 < pathArgs.length) {
                  const c1x = pathArgs[ai++], c1y = pathArgs[ai++];
                  const ex = pathArgs[ai++], ey = pathArgs[ai++];
                  const pts = flattenBezier(px, py, c1x, c1y, ex, ey, ex, ey);
                  for (let k = 0; k < pts.length - 1; k++) {
                    segments.push({ p1: transformPoint(pts[k].x, pts[k].y), p2: transformPoint(pts[k + 1].x, pts[k + 1].y) });
                  }
                  px = ex; py = ey;
                }
                break;
              }
              case pdfjsLib.OPS.rectangle: {
                if (ai + 3 < pathArgs.length) {
                  const rrx = pathArgs[ai++], rry = pathArgs[ai++];
                  const rrw = pathArgs[ai++], rrh = pathArgs[ai++];
                  const c = [
                    transformPoint(rrx, rry),
                    transformPoint(rrx + rrw, rry),
                    transformPoint(rrx + rrw, rry + rrh),
                    transformPoint(rrx, rry + rrh),
                  ];
                  for (let k = 0; k < 4; k++) segments.push({ p1: c[k], p2: c[(k + 1) % 4] });
                }
                break;
              }
              case pdfjsLib.OPS.closePath:
                break;
            }
          }
          break;
        }
      }
    }

    // Filter invalid segments
    return segments.filter(s =>
      isFinite(s.p1.x) && isFinite(s.p1.y) && isFinite(s.p2.x) && isFinite(s.p2.y) &&
      !isNaN(s.p1.x) && !isNaN(s.p1.y) && !isNaN(s.p2.x) && !isNaN(s.p2.y)
    );
  } catch (err) {
    console.warn("Could not extract full vector geometry:", err);
    return [];
  } finally {
    // Memory Management: Guarantee page cleanup
    if (page) cleanupPdfPage(page);
  }
}
