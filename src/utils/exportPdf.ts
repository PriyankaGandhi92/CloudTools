import { jsPDF } from 'jspdf';
import { PDFDocument, rgb, rgb as pdfRgb } from 'pdf-lib';
import { renderPage } from './pdfRenderer';
import type { Annotation, Measurement, Point } from '../types';
import { formatMeasurement, midpoint } from './measurement';
import type { MeasurementUnit } from '../types';

/**
 * Flatten all annotations into the PDF, returning a new PDF ArrayBuffer
 * with annotations burned in and no separate annotation objects.
 */
export async function flattenAnnotationsIntoPdf(
  pageCount: number,
  annotations: Annotation[],
  measurements: Measurement[],
  measurementUnit: MeasurementUnit,
  formFieldValues?: Record<string, string | boolean>
): Promise<ArrayBuffer> {
  if (pageCount === 0) throw new Error('No pages');

  let pdf: jsPDF | null = null;

  for (let i = 0; i < pageCount; i++) {
    const canvas = document.createElement('canvas');
    // Pass skipFormFields=false to include form fields in the flattened output
    await renderPage(i, canvas, 2, 0, false, formFieldValues);

    const pageAnns = annotations.filter((a) => a.pageIndex === i);
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawAnnotationsToCtx(ctx, pageAnns, measurements, measurementUnit, 2);
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const w = canvas.width;
    const h = canvas.height;
    const pdfW = w * 0.75;
    const pdfH = h * 0.75;

    if (i === 0) {
      pdf = new jsPDF({
        orientation: pdfW > pdfH ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [pdfW, pdfH],
      });
    } else {
      pdf!.addPage([pdfW, pdfH], pdfW > pdfH ? 'landscape' : 'portrait');
    }

    pdf!.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
  }

  if (!pdf) throw new Error('Failed to create PDF');
  const blob = pdf.output('arraybuffer');
  return blob;
}

export async function exportAnnotatedPdf(
  pageCount: number,
  annotations: Annotation[],
  measurements: Measurement[],
  measurementUnit: MeasurementUnit,
  mode: 'download' | 'print' = 'download',
  formFieldValues?: Record<string, string | boolean>
): Promise<void> {
  if (pageCount === 0) return;

  let pdf: jsPDF | null = null;

  for (let i = 0; i < pageCount; i++) {
    const canvas = document.createElement('canvas');
    await renderPage(i, canvas, 2, 0, true, formFieldValues);

    const pageAnns = annotations.filter((a) => a.pageIndex === i);

    // Draw annotations onto the canvas
    const ctx = canvas.getContext('2d');
    if (ctx) {
      drawAnnotationsToCtx(ctx, pageAnns, measurements, measurementUnit, 2);
    }

    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const w = canvas.width;
    const h = canvas.height;
    const pdfW = w * 0.75; // 72 dpi conversion (canvas is 2x)
    const pdfH = h * 0.75;

    if (i === 0) {
      pdf = new jsPDF({
        orientation: pdfW > pdfH ? 'landscape' : 'portrait',
        unit: 'pt',
        format: [pdfW, pdfH],
      });
    } else {
      pdf!.addPage([pdfW, pdfH], pdfW > pdfH ? 'landscape' : 'portrait');
    }

    pdf!.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
  }

  if (!pdf) return;

  if (mode === 'print') {
    const blob = pdf.output('blob');
    const url = URL.createObjectURL(blob);
    const win = window.open(url);
    if (win) {
      win.addEventListener('load', () => {
        win.print();
      });
    }
  } else {
    pdf.save('annotated-document.pdf');
  }
}

/**
 * Export annotated PDF as an ArrayBuffer (for Ctrl+S save-back).
 * This flattens annotations into the PDF as raster images.
 */
export async function exportAnnotatedPdfAsBuffer(
  pageCount: number,
  annotations: Annotation[],
  measurements: Measurement[],
  measurementUnit: MeasurementUnit,
  formFieldValues?: Record<string, string | boolean>
): Promise<ArrayBuffer> {
  let pdf: jsPDF | null = null;
  for (let i = 0; i < pageCount; i++) {
    const canvas = document.createElement('canvas');
    await renderPage(i, canvas, 2, 0, true, formFieldValues);
    const pageAnns = annotations.filter((a) => a.pageIndex === i);
    const ctx = canvas.getContext('2d');
    if (ctx) drawAnnotationsToCtx(ctx, pageAnns, measurements, measurementUnit, 2);
    const imgData = canvas.toDataURL('image/jpeg', 0.95);
    const w = canvas.width;
    const h = canvas.height;
    const pdfW = w * 0.75;
    const pdfH = h * 0.75;
    if (i === 0) {
      pdf = new jsPDF({ orientation: pdfW > pdfH ? 'landscape' : 'portrait', unit: 'pt', format: [pdfW, pdfH] });
    } else {
      pdf!.addPage([pdfW, pdfH], pdfW > pdfH ? 'landscape' : 'portrait');
    }
    pdf!.addImage(imgData, 'JPEG', 0, 0, pdfW, pdfH);
  }
  if (!pdf) throw new Error('No pages');
  return pdf.output('arraybuffer');
}

/**
 * Save annotations as embedded metadata in the PDF (editable when reopened in app).
 * This embeds the annotation data as a custom PDF metadata field.
 */
export async function saveAnnotationsAsPdfObjects(
  originalPdfData: ArrayBuffer,
  annotations: Annotation[],
): Promise<ArrayBuffer> {
  const pdfDoc = await PDFDocument.load(originalPdfData.slice(0), { ignoreEncryption: true });

  // Embed annotations as JSON in PDF metadata
  const annotationsJson = JSON.stringify(annotations);
  pdfDoc.setTitle(pdfDoc.getTitle() || 'Annotated PDF');
  pdfDoc.setSubject('Blueprint PDF Editor');
  
  // Use UTF-8 safe base64 encoding instead of btoa (which only supports Latin1)
  const utf8Bytes = new TextEncoder().encode(annotationsJson);
  const binaryString = Array.from(utf8Bytes, (byte) => String.fromCharCode(byte)).join('');
  const base64 = btoa(binaryString);
  pdfDoc.setKeywords(['blueprint-annotations', base64]);

  const bytes = await pdfDoc.save();
  return bytes.buffer as ArrayBuffer;
}

/**
 * Load annotations from PDF metadata if present.
 */
export async function loadAnnotationsFromPdf(pdfData: ArrayBuffer): Promise<Annotation[] | null> {
  try {
    const pdfDoc = await PDFDocument.load(pdfData.slice(0), { ignoreEncryption: true });
    const keywords = pdfDoc.getKeywords();
    
    // Check if our annotation marker is present
    const markerIndex = keywords?.indexOf('blueprint-annotations');
    if (markerIndex !== undefined && markerIndex >= 0 && keywords && keywords[markerIndex + 1]) {
      const encoded = keywords[markerIndex + 1];
      const binaryString = atob(encoded);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      const decoded = new TextDecoder().decode(bytes);
      return JSON.parse(decoded) as Annotation[];
    }
    return null;
  } catch {
    return null;
  }
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result
    ? { r: parseInt(result[1], 16), g: parseInt(result[2], 16), b: parseInt(result[3], 16) }
    : null;
}

function drawAnnotationsToCtx(
  ctx: CanvasRenderingContext2D,
  annotations: Annotation[],
  measurements: Measurement[],
  unit: MeasurementUnit,
  scale: number
) {
  for (const ann of annotations.sort((a, b) => a.layerOrder - b.layerOrder)) {
    ctx.save();
    ctx.globalAlpha = ann.style.opacity;
    ctx.strokeStyle = ann.style.stroke;
    ctx.lineWidth = ann.style.strokeWidth * scale;
    ctx.fillStyle = ann.style.fill !== 'transparent' ? ann.style.fill : 'transparent';
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const pts = ann.points.map((p) => ({ x: p.x * scale, y: p.y * scale }));

    switch (ann.type) {
      case 'line':
      case 'measure-distance':
        if (pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.stroke();
        }
        break;

      case 'arrow':
        if (pts.length >= 2) {
          const p1 = pts[0], p2 = pts[1];
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          ctx.stroke();
          // Arrowhead
          const angle = Math.atan2(p2.y - p1.y, p2.x - p1.x);
          const headLen = 10 * scale;
          ctx.beginPath();
          ctx.moveTo(p2.x, p2.y);
          ctx.lineTo(p2.x - headLen * Math.cos(angle - Math.PI / 6), p2.y - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(p2.x - headLen * Math.cos(angle + Math.PI / 6), p2.y - headLen * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fillStyle = ann.style.stroke;
          ctx.fill();
        }
        break;

      case 'rectangle':
        if (pts.length >= 1 && ann.width && ann.height) {
          if (ann.style.fill !== 'transparent') {
            ctx.fillRect(pts[0].x, pts[0].y, ann.width * scale, ann.height * scale);
          }
          ctx.strokeRect(pts[0].x, pts[0].y, ann.width * scale, ann.height * scale);
        }
        break;

      case 'circle':
        if (pts.length >= 1 && ann.width && ann.height) {
          const cx = pts[0].x + (ann.width * scale) / 2;
          const cy = pts[0].y + (ann.height * scale) / 2;
          const rx = (ann.width * scale) / 2;
          const ry = (ann.height * scale) / 2;
          ctx.beginPath();
          ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
          if (ann.style.fill !== 'transparent') ctx.fill();
          ctx.stroke();
        }
        break;

      case 'eraser-box':
        if (pts.length >= 1 && ann.width && ann.height) {
          ctx.fillStyle = ann.style.fill || '#ffffff';
          ctx.fillRect(pts[0].x, pts[0].y, ann.width * scale, ann.height * scale);
        }
        break;

      case 'freehand':
        if (pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
        }
        break;

      case 'highlight':
        if (pts.length >= 2) {
          ctx.globalAlpha = 0.35;
          ctx.strokeStyle = '#ffeb3b';
          ctx.lineWidth = 20 * scale;
          ctx.globalCompositeOperation = 'multiply';
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
          ctx.globalCompositeOperation = 'source-over';
        }
        break;

      case 'text':
        if (pts.length >= 1 && ann.text) {
          const fontSize = (ann.style.fontSize || 16) * scale;
          ctx.font = `${fontSize}px ${ann.style.fontFamily || 'Arial'}`;
          ctx.fillStyle = ann.style.stroke;
          const lines = ann.text.split('\n');
          let lineY = pts[0].y + fontSize;
          for (const line of lines) {
            ctx.fillText(line, pts[0].x, lineY);
            lineY += fontSize * 1.2;
          }
        }
        break;

      case 'text-leader':
        if (pts.length >= 2) {
          const arrowHead = pts[0];
          const arrowRear = pts[1] || { x: arrowHead.x + 20, y: arrowHead.y };
          const textPos = pts[2] || { x: arrowRear.x + 100, y: arrowRear.y };

          // Arrow from arrow rear to arrow head
          ctx.strokeStyle = ann.style.stroke;
          ctx.lineWidth = (ann.style.strokeWidth || 1) * scale;
          ctx.beginPath();
          ctx.moveTo(arrowRear.x, arrowRear.y);
          ctx.lineTo(arrowHead.x, arrowHead.y);
          ctx.stroke();
          // Arrowhead
          const angle = Math.atan2(arrowHead.y - arrowRear.y, arrowHead.x - arrowRear.x);
          const headLen = 6 * scale;
          ctx.fillStyle = ann.style.stroke;
          ctx.beginPath();
          ctx.moveTo(arrowHead.x, arrowHead.y);
          ctx.lineTo(arrowHead.x - headLen * Math.cos(angle - Math.PI / 6), arrowHead.y - headLen * Math.sin(angle - Math.PI / 6));
          ctx.lineTo(arrowHead.x - headLen * Math.cos(angle + Math.PI / 6), arrowHead.y - headLen * Math.sin(angle + Math.PI / 6));
          ctx.closePath();
          ctx.fill();

          // Tail line from arrow rear to text position
          ctx.beginPath();
          ctx.moveTo(arrowRear.x, arrowRear.y);
          ctx.lineTo(textPos.x, textPos.y);
          ctx.stroke();

          // Text box at text position
          if (ann.text) {
            const fontSize = (ann.style.fontSize || 16) * scale;
            ctx.font = `${fontSize}px ${ann.style.fontFamily || 'Arial'}`;
            const textWidth = ann.text.length * fontSize * 0.6;
            const textHeight = fontSize + 8;
            const padding = 4 * scale;
            const boxX = textPos.x - textWidth - padding;
            const boxY = textPos.y - textHeight - padding;
            ctx.fillStyle = 'white';
            ctx.fillRect(boxX, boxY, textWidth + padding * 2, textHeight + padding * 2);
            ctx.strokeStyle = ann.style.stroke;
            ctx.lineWidth = (ann.style.strokeWidth || 1) * scale;
            ctx.strokeRect(boxX, boxY, textWidth + padding * 2, textHeight + padding * 2);
            ctx.fillStyle = ann.style.stroke;
            ctx.fillText(ann.text, boxX + padding, boxY + textHeight);
          }
        }
        break;

      case 'strikethrough':
        if (pts.length >= 1) {
          const sx = pts[0].x;
          const sy = pts[0].y;
          const sw = (ann.width || 100) * scale;
          ctx.strokeStyle = ann.style.stroke || '#ef4444';
          ctx.lineWidth = (ann.style.strokeWidth || 2) * scale;
          ctx.beginPath();
          ctx.moveTo(sx, sy);
          ctx.lineTo(sx + sw, sy);
          ctx.stroke();
          if (ann.text) {
            const fontSize = (ann.style.fontSize || 10) * scale;
            ctx.font = `${fontSize}px ${ann.style.fontFamily || 'Arial'}`;
            ctx.fillStyle = ann.style.stroke || '#ef4444';
            ctx.fillText(ann.text, sx, sy + 4 * scale + fontSize);
          }
        }
        break;

      case 'image':
        if (pts.length >= 1 && ann.imageData && ann.width && ann.height) {
          const img = new Image();
          img.src = ann.imageData;
          if (img.complete) {
            ctx.save();
            const cx = pts[0].x + (ann.width * scale) / 2;
            const cy = pts[0].y + (ann.height * scale) / 2;
            ctx.translate(cx, cy);
            if (ann.rotation) ctx.rotate((ann.rotation * Math.PI) / 180);
            ctx.drawImage(img, - (ann.width * scale) / 2, - (ann.height * scale) / 2, ann.width * scale, ann.height * scale);
            ctx.restore();
          }
        }
        break;

      case 'stamp-check':
        if (pts.length >= 1) {
          const s = 24 * scale;
          ctx.strokeStyle = '#22c55e';
          ctx.lineWidth = 3 * scale;
          ctx.beginPath();
          ctx.moveTo(pts[0].x - s * 0.3, pts[0].y);
          ctx.lineTo(pts[0].x, pts[0].y + s * 0.3);
          ctx.lineTo(pts[0].x + s * 0.4, pts[0].y - s * 0.3);
          ctx.stroke();
        }
        break;

      case 'stamp-x':
        if (pts.length >= 1) {
          const s = 20 * scale;
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 3 * scale;
          ctx.beginPath();
          ctx.moveTo(pts[0].x - s * 0.35, pts[0].y - s * 0.35);
          ctx.lineTo(pts[0].x + s * 0.35, pts[0].y + s * 0.35);
          ctx.moveTo(pts[0].x + s * 0.35, pts[0].y - s * 0.35);
          ctx.lineTo(pts[0].x - s * 0.35, pts[0].y + s * 0.35);
          ctx.stroke();
        }
        break;

      case 'measure-perimeter':
        if (pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.stroke();
        }
        break;

      case 'measure-area':
        if (pts.length >= 3) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
          ctx.closePath();
          ctx.fillStyle = 'rgba(0,229,255,0.15)';
          ctx.fill();
          ctx.strokeStyle = '#00e5ff';
          ctx.stroke();
        }
        break;

      case 'measure-angle':
        if (pts.length >= 3) {
          // 3 points: pts[0] → pts[1] (vertex) → pts[2]
          ctx.strokeStyle = '#00e5ff';
          ctx.lineWidth = 2 * scale;
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          ctx.lineTo(pts[1].x, pts[1].y);
          ctx.lineTo(pts[2].x, pts[2].y);
          ctx.stroke();
        }
        break;

      case 'measure-polyline':
        if (pts.length >= 2) {
          ctx.beginPath();
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
        }
        break;

      case 'measure-count':
        if (pts.length >= 1) {
          // Get count from associated measurement
          const countMeas = measurements.find((m) => m.annotationId === ann.id && m.type === 'count');
          const count = countMeas ? Math.round(countMeas.value) : 1;
          const radius = 12 * scale;
          ctx.fillStyle = ann.style.fill || 'rgba(59, 130, 246, 0.3)';
          ctx.strokeStyle = ann.style.stroke || '#3b82f6';
          ctx.lineWidth = 2 * scale;
          
          ctx.beginPath();
          ctx.arc(pts[0].x, pts[0].y, radius, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
          
          // Draw count number
          ctx.fillStyle = ann.style.stroke || '#3b82f6';
          ctx.font = `bold ${12 * scale}px Arial`;
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText(count.toString(), pts[0].x, pts[0].y);
        }
        break;

      case 'pin':
        if (pts.length >= 1) {
          // Draw pin icon
          const pinX = pts[0].x;
          const pinY = pts[0].y;
          const pinSize = 20 * scale;
          
          // Pin head (circle)
          ctx.fillStyle = '#ef4444';
          ctx.beginPath();
          ctx.arc(pinX, pinY - pinSize * 0.5, pinSize * 0.3, 0, Math.PI * 2);
          ctx.fill();
          
          // Pin body (triangle pointing down)
          ctx.beginPath();
          ctx.moveTo(pinX, pinY - pinSize * 0.3);
          ctx.lineTo(pinX - pinSize * 0.2, pinY + pinSize * 0.3);
          ctx.lineTo(pinX + pinSize * 0.2, pinY + pinSize * 0.3);
          ctx.closePath();
          ctx.fill();
        }
        break;

      case 'bim-capture':
        if (pts.length >= 1 && ann.bimContent) {
          // Draw BIM capture marker
          const bimX = pts[0].x;
          const bimY = pts[0].y;
          const size = 24 * scale;
          
          // Draw house/building icon
          ctx.fillStyle = '#3b82f6';
          ctx.strokeStyle = '#1d4ed8';
          ctx.lineWidth = 2 * scale;
          
          // Building shape
          ctx.beginPath();
          ctx.moveTo(bimX, bimY - size * 0.5);
          ctx.lineTo(bimX + size * 0.5, bimY);
          ctx.lineTo(bimX + size * 0.3, bimY);
          ctx.lineTo(bimX + size * 0.3, bimY + size * 0.4);
          ctx.lineTo(bimX - size * 0.3, bimY + size * 0.4);
          ctx.lineTo(bimX - size * 0.3, bimY);
          ctx.lineTo(bimX - size * 0.5, bimY);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
        break;

      case 'cloud':
        if (pts.length >= 1 && ann.width && ann.height) {
          const cx = pts[0].x;
          const cy = pts[0].y;
          const cw = ann.width * scale;
          const ch = ann.height * scale;

          // Uniform arc radius — small bumps for a proper "clouded" look
          const targetR = 8 * scale;
          const perimeter = 2 * (cw + ch);
          const nBumps = Math.max(8, Math.round(perimeter / (targetR * 2)));

          // Distribute bumps along top, right, bottom, left edges
          const bumpCountH = Math.max(2, Math.round((cw / perimeter) * nBumps));
          const bumpCountV = Math.max(2, Math.round((ch / perimeter) * nBumps));

          const cloudPts: { x: number; y: number }[] = [];
          const segsPerBump = 6; // segments per semicircle

          const arcPoints = (startX: number, startY: number, endX: number, endY: number, bulgeX: number, bulgeY: number) => {
            for (let s = 0; s <= segsPerBump; s++) {
              const t = s / segsPerBump;
              const ct = 1 - t;
              // Quadratic bezier approximation of arc through bulge point
              const px = ct * ct * startX + 2 * ct * t * bulgeX + t * t * endX;
              const py = ct * ct * startY + 2 * ct * t * bulgeY + t * t * endY;
              cloudPts.push({ x: px, y: py });
            }
          };

          const r = targetR;
          // Top edge bumps (outward = up)
          for (let i = 0; i < bumpCountH; i++) {
            const x1 = cx + (i / bumpCountH) * cw;
            const x2 = cx + ((i + 1) / bumpCountH) * cw;
            arcPoints(x1, cy, x2, cy, (x1 + x2) / 2, cy - r);
          }
          // Right edge bumps (outward = right)
          for (let i = 0; i < bumpCountV; i++) {
            const y1 = cy + (i / bumpCountV) * ch;
            const y2 = cy + ((i + 1) / bumpCountV) * ch;
            arcPoints(cx + cw, y1, cx + cw, y2, cx + cw + r, (y1 + y2) / 2);
          }
          // Bottom edge bumps (outward = down), right to left
          for (let i = 0; i < bumpCountH; i++) {
            const x1 = cx + cw - (i / bumpCountH) * cw;
            const x2 = cx + cw - ((i + 1) / bumpCountH) * cw;
            arcPoints(x1, cy + ch, x2, cy + ch, (x1 + x2) / 2, cy + ch + r);
          }
          // Left edge bumps (outward = left), bottom to top
          for (let i = 0; i < bumpCountV; i++) {
            const y1 = cy + ch - (i / bumpCountV) * ch;
            const y2 = cy + ch - ((i + 1) / bumpCountV) * ch;
            arcPoints(cx, y1, cx, y2, cx - r, (y1 + y2) / 2);
          }

          // Draw the cloud path
          if (cloudPts.length > 0) {
            ctx.beginPath();
            ctx.moveTo(cloudPts[0].x, cloudPts[0].y);
            for (let i = 1; i < cloudPts.length; i++) {
              ctx.lineTo(cloudPts[i].x, cloudPts[i].y);
            }
            ctx.closePath();
            if (ann.style.fill !== 'transparent') ctx.fill();
            ctx.stroke();
          }

          // Draw text label below the cloud (matches MainCanvas rendering)
          if (ann.text) {
            const fontSize = (ann.style.fontSize || 10) * scale;
            ctx.font = `${fontSize}px ${ann.style.fontFamily || 'Arial'}`;
            ctx.fillStyle = ann.style.stroke;
            ctx.globalAlpha = 1;
            // Word-wrap text within the cloud width
            const maxWidth = cw;
            const words = ann.text.split(' ');
            let line = '';
            let lineY = cy + ch + 4 * scale;
            for (const word of words) {
              const testLine = line ? line + ' ' + word : word;
              const metrics = ctx.measureText(testLine);
              if (metrics.width > maxWidth && line) {
                ctx.fillText(line, cx + 4 * scale, lineY);
                line = word;
                lineY += fontSize * 1.2;
              } else {
                line = testLine;
              }
            }
            if (line) {
              ctx.fillText(line, cx + 4 * scale, lineY);
            }
          }
        }
        break;
    }

    // Draw measurement labels
    const annMeasurements = measurements.filter((m) => m.annotationId === ann.id);
    if (annMeasurements.length > 0) {
      const m = annMeasurements[0];
      const label = formatMeasurement(m.value, unit, m.type);
      ctx.font = `bold ${12 * scale}px Arial`;
      ctx.fillStyle = '#00e5ff';
      if (pts.length >= 2) {
        const mp = midpoint(pts[0], pts[pts.length - 1]);
        ctx.fillText(label, mp.x, mp.y - 8 * scale);
      }
    }

    ctx.restore();
  }
}
