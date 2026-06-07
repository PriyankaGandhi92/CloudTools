import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, HeadingLevel, AlignmentType, WidthType, PageBreak, ImageRun } from 'docx';
import { saveAs } from 'file-saver';
import { fetchApiKey } from './license';

function base64ToUint8Array(base64: string) {
  const binaryString = window.atob(base64.split(',')[1]);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export async function generateFieldwireReport(tasks: any[], projectName: string, includeAiCover: boolean) {
  let executiveSummary = "Project Task Report generated from BIM Inspection.";

  // 1. Generate AI Cover Page Summary
  if (includeAiCover) {
    const apiKey = await fetchApiKey();
    if (apiKey) {
      const openCount = tasks.filter(t => t.pinContent?.status === 'Open').length;
      const highCount = tasks.filter(t => t.pinContent?.priority === 'High').length;
      
      const prompt = `Act as a Senior Construction Manager. Write a 3-paragraph executive summary for this week's inspection report for project "${projectName}". 
      We have ${tasks.length} total tasks, ${openCount} open items, and ${highCount} high-priority safety/defect risks. Keep it professional and direct.`;
      
      try {
        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] })
          }
        );
        const data = await response.json();
        executiveSummary = data.candidates[0].content.parts[0].text;
      } catch (e) {
        console.error("AI Summary failed", e);
      }
    }
  }

  // Extract tasks that actually have images
  const tasksWithPhotos = tasks.filter(t => t.pinContent?.images && t.pinContent.images.length > 0);

  // Build the Appendix Children Array
  const appendixChildren: any[] = [];
  
  if (tasksWithPhotos.length > 0) {
    appendixChildren.push(new Paragraph({ children: [new PageBreak()] }));
    appendixChildren.push(new Paragraph({ text: "Appendix: Inspection Photos", heading: HeadingLevel.HEADING_1 }));

    tasksWithPhotos.forEach(task => {
      const c = task.pinContent || {};
      
      // Add Task Header for the photo
      appendixChildren.push(new Paragraph({ 
        text: `${c.name || 'Untitled Task'} - Assigned to: ${c.assignee || 'Unassigned'}`, 
        heading: HeadingLevel.HEADING_2,
        spacing: { before: 400, after: 120 }
      }));

      // Add GPS Metadata if it exists
      if (c.gps) {
        appendixChildren.push(new Paragraph({ 
          text: `📍 Location: ${c.gps.lat.toFixed(5)}, ${c.gps.lng.toFixed(5)}`, 
          style: "Subtitle" 
        }));
      }

      // Process and attach each image
      c.images.forEach((imgBase64: string) => {
        try {
          const imageBuffer = base64ToUint8Array(imgBase64);
          appendixChildren.push(new Paragraph({
            children: [
              new ImageRun({
                data: imageBuffer,
                transformation: { width: 400, height: 300 },
                type: "png",
              })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
          }));
        } catch (e) {
          console.error("Failed to embed image in report:", e);
        }
      });
    });
  }

  // 2. Build the DOCX Document
  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        // Cover Page Heading
        new Paragraph({
          text: `${projectName} - Inspection Report`,
          heading: HeadingLevel.TITLE,
          alignment: AlignmentType.CENTER,
        }),
        new Paragraph({ text: `Generated: ${new Date().toLocaleDateString()}`, alignment: AlignmentType.CENTER, spacing: { after: 400 } }),
        
        // AI Executive Summary
        new Paragraph({ text: "Executive Summary", heading: HeadingLevel.HEADING_1 }),
        new Paragraph({ text: executiveSummary, spacing: { after: 400 } }),

        // Tasks Table
        new Paragraph({ text: "Task Log", heading: HeadingLevel.HEADING_1 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: [
            // Header Row
            new TableRow({
              children: [
                new TableCell({ children: [new Paragraph({ text: "Task / Location", style: "Strong" })] }),
                new TableCell({ children: [new Paragraph({ text: "Status", style: "Strong" })] }),
                new TableCell({ children: [new Paragraph({ text: "Assignee", style: "Strong" })] }),
                new TableCell({ children: [new Paragraph({ text: "Notes", style: "Strong" })] }),
              ],
            }),
            // Data Rows
            ...tasks.map(task => {
              const c = task.pinContent || {};
              return new TableRow({
                children: [
                  new TableCell({ children: [new Paragraph(c.name || 'Untitled')] }),
                  new TableCell({ children: [new Paragraph(`${c.status || 'Open'} (${c.priority || 'Medium'} Priority)`)] }),
                  new TableCell({ children: [new Paragraph(c.assignee || 'Unassigned')] }),
                  new TableCell({ children: [new Paragraph(c.text || '')] }),
                ]
              });
            })
          ],
        }),
        
        // Add the Photo Appendix at the end
        ...appendixChildren
      ],
    }],
  });

  // 3. Package and Download
  const buffer = await Packer.toBlob(doc);
  saveAs(buffer, `${projectName}-Inspection-Report.docx`);
}
