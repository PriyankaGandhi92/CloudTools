import { jsPDF } from 'jspdf';
import type { Annotation } from '../types';

/**
 * Generates a professional PDF inspection report with an executive summary
 * page followed by a 3-per-page photo log. Each photo is rendered at ~3 inches
 * with its task metadata (name, page, assignee, status).
 */
export async function generateInspectionPdfReport(
  tasks: Annotation[],
  projectName: string,
): Promise<void> {
  const total = tasks.length;
  const highRisk = tasks.filter((t) => t.pinContent?.priority === 'High').length;
  const open = tasks.filter((t) => t.pinContent?.status === 'Open').length;
  const verified = tasks.filter((t) => t.pinContent?.status === 'Verified').length;

  const pdf = new jsPDF({ unit: 'mm', format: 'a4' });
  const pageWidth = pdf.internal.pageSize.getWidth();

  // ---- Page 1: Executive Summary ----
  pdf.setFontSize(22);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Inspection Report', 20, 28);

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  pdf.text(`Document: ${projectName}`, 20, 40);
  pdf.text(`Generated: ${new Date().toLocaleString()}`, 20, 47);

  pdf.setDrawColor(200);
  pdf.line(20, 52, pageWidth - 20, 52);

  pdf.setFontSize(14);
  pdf.setFont('helvetica', 'bold');
  pdf.text('Executive Summary', 20, 64);

  pdf.setFontSize(11);
  pdf.setFont('helvetica', 'normal');
  const summaryLines = [
    `Total Tasks: ${total}`,
    `High Risk Items: ${highRisk}`,
    `Open Items: ${open}`,
    `Verified Items: ${verified}`,
    `Completion: ${total > 0 ? Math.round((verified / total) * 100) : 0}% verified`,
  ];
  summaryLines.forEach((line, i) => pdf.text(line, 24, 76 + i * 8));

  // ---- Page 2+: Photo Log (3 per page) ----
  let firstPhotoPage = true;
  let currentY = 0;
  let imagesOnPage = 0;
  const imgSize = 76; // ~3 inches
  const rowHeight = 85;

  const ensurePhotoPage = () => {
    if (firstPhotoPage || imagesOnPage >= 3) {
      pdf.addPage();
      pdf.setFontSize(14);
      pdf.setFont('helvetica', 'bold');
      pdf.text('Photographic Evidence', 20, 20);
      currentY = 30;
      imagesOnPage = 0;
      firstPhotoPage = false;
    }
  };

  for (const task of tasks) {
    const c = task.pinContent;
    if (!c?.images?.length) continue;

    for (const img of c.images) {
      ensurePhotoPage();
      try {
        const fmt = img.includes('image/png') ? 'PNG' : 'JPEG';
        pdf.addImage(img, fmt, 20, currentY, imgSize, imgSize);
      } catch (e) {
        console.error('[InspectionPdfReport] Failed to add image', e);
      }

      const textX = 20 + imgSize + 8;
      pdf.setFontSize(11);
      pdf.setFont('helvetica', 'bold');
      pdf.text(c.name || 'Untitled Task', textX, currentY + 8);
      pdf.setFontSize(9);
      pdf.setFont('helvetica', 'normal');
      pdf.text(`Page: ${task.pageIndex + 1}`, textX, currentY + 16);
      pdf.text(`Assignee: ${c.assignee || 'Unassigned'}`, textX, currentY + 23);
      pdf.text(`Status: ${c.status || 'Open'}`, textX, currentY + 30);
      if (c.category) pdf.text(`Category: ${c.category}`, textX, currentY + 37);
      if (c.priority === 'High') {
        pdf.setTextColor(200, 0, 0);
        pdf.text('HIGH RISK', textX, currentY + 44);
        pdf.setTextColor(0, 0, 0);
      }

      currentY += rowHeight;
      imagesOnPage++;
    }
  }

  pdf.save(`Report_${projectName}.pdf`);
}
