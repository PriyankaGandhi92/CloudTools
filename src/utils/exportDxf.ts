import type { Annotation, Point } from '../types';

/**
 * Converts canvas annotations into an ASCII DXF format.
 * Inverts Y-axis to match AutoCAD standard (Y points UP).
 * Includes proper header, tables, and other required sections for AutoCAD compatibility.
 */
export function generateDXF(annotations: Annotation[], pageHeight: number): string {
  let dxf = '';

  // --- HEADER SECTION ---
  dxf += '  0\nSECTION\n  2\nHEADER\n';
  dxf += '  9\n$ACADVER\n  1\nAC1009\n'; // AutoCAD R12 format (most compatible)
  dxf += '  9\n$INSBASE\n 10\n0.0\n 20\n0.0\n 30\n0.0\n';
  dxf += '  9\n$EXTMIN\n 10\n0.0\n 20\n0.0\n 30\n0.0\n';
  dxf += '  9\n$EXTMAX\n 10\n9999.0\n 20\n9999.0\n 30\n0.0\n';
  dxf += '  9\n$LIMMIN\n 10\n0.0\n 20\n0.0\n';
  dxf += '  9\n$LIMMAX\n 10\n9999.0\n 20\n9999.0\n';
  dxf += '  9\n$LUNITS\n 70\n2\n'; // Decimal units
  dxf += '  9\n$LUPREC\n 70\n4\n'; // Decimal precision
  dxf += '  0\nENDSEC\n';

  // --- TABLES SECTION ---
  dxf += '  0\nSECTION\n  2\nTABLES\n';

  // LTYPE table (line types)
  dxf += '  0\nTABLE\n  2\nLTYPE\n 70\n1\n';
  dxf += '  0\nLTYPE\n  2\nCONTINUOUS\n 70\n0\n  3\nSolid line\n 72\n65\n 73\n0\n 40\n0.0\n';
  dxf += '  0\nENDTAB\n';

  // LAYER table
  dxf += '  0\nTABLE\n  2\nLAYER\n 70\n2\n';
  dxf += '  0\nLAYER\n  2\n0\n 70\n0\n 62\n7\n  6\nCONTINUOUS\n'; // Layer 0, white
  dxf += '  0\nLAYER\n  2\nPDF_IMPORT\n 70\n0\n 62\n7\n  6\nCONTINUOUS\n'; // PDF import layer
  dxf += '  0\nLAYER\n  2\nUSER_EDITS\n 70\n0\n 62\n3\n  6\nCONTINUOUS\n'; // User edits layer (green)
  dxf += '  0\nENDTAB\n';

  // STYLE table (text styles)
  dxf += '  0\nTABLE\n  2\nSTYLE\n 70\n0\n';
  dxf += '  0\nENDTAB\n';

  // VIEW table
  dxf += '  0\nTABLE\n  2\nVIEW\n 70\n0\n';
  dxf += '  0\nENDTAB\n';

  // UCS table
  dxf += '  0\nTABLE\n  2\nUCS\n 70\n0\n';
  dxf += '  0\nENDTAB\n';

  // APPID table
  dxf += '  0\nTABLE\n  2\nAPPID\n 70\n1\n';
  dxf += '  0\nAPPID\n  2\nACAD\n 70\n0\n';
  dxf += '  0\nENDTAB\n';

  // DIMSTYLE table
  dxf += '  0\nTABLE\n  2\nDIMSTYLE\n 70\n0\n';
  dxf += '  0\nENDTAB\n';

  // BLOCK_RECORD table
  dxf += '  0\nTABLE\n  2\nBLOCK_RECORD\n 70\n0\n';
  dxf += '  0\nENDTAB\n';

  dxf += '  0\nENDSEC\n';

  // --- BLOCKS SECTION ---
  dxf += '  0\nSECTION\n  2\nBLOCKS\n';
  dxf += '  0\nENDSEC\n';

  // --- ENTITIES SECTION ---
  dxf += '  0\nSECTION\n  2\nENTITIES\n';

  // --- ENTITY HELPERS ---
  const addPolyline = (points: Point[], closed = false, layer = '0', color = 7) => {
    if (points.length < 2) return;
    dxf += `  0\nLWPOLYLINE\n  8\n${layer}\n 62\n${color}\n`;
    dxf += ` 90\n${points.length}\n 70\n${closed ? 1 : 0}\n`;
    for (const p of points) {
      dxf += ` 10\n${p.x.toFixed(4)}\n 20\n${(pageHeight - p.y).toFixed(4)}\n`;
    }
  };

  const addCircle = (center: Point, radius: number, layer = '0', color = 7) => {
    dxf += `  0\nCIRCLE\n  8\n${layer}\n 62\n${color}\n`;
    dxf += ` 10\n${center.x.toFixed(4)}\n 20\n${(pageHeight - center.y).toFixed(4)}\n 30\n0.0\n`;
    dxf += ` 40\n${radius.toFixed(4)}\n`;
  };

  // --- PARSE ANNOTATIONS ---
  for (const ann of annotations) {
    // Ignore masks and system tools
    if (ann.createdBy === 'system-mask' || ann.type === 'eraser-box') continue;

    // Layer separation: Black/White for PDF import, Green for user edits
    const layerName = ann.type === 'cad-layer' ? 'PDF_IMPORT' : 'USER_EDITS';
    const colorCode = ann.type === 'cad-layer' ? 7 : 3;

    if (ann.type === 'cad-layer') {
      // Handle manifest/chunk pattern
      if (ann.chunkIds && ann.chunkIds.length > 0) {
        const chunkAnnotations = annotations.filter(a => ann.chunkIds?.includes(a.id) && a.type === 'cad-layer-chunk');
        for (const chunk of chunkAnnotations) {
          if (chunk.lines) {
            for (const polylineObj of chunk.lines) {
              addPolyline(polylineObj.points, false, layerName, colorCode);
            }
          }
        }
      }
      // Legacy: direct lines (for backward compatibility)
      else if (ann.lines) {
        for (const polylineObj of ann.lines) {
          addPolyline(polylineObj.points, false, layerName, colorCode);
        }
      }
    }
    else if (ann.type === 'line' || ann.type === 'measure-polyline' || ann.type === 'freehand') {
      addPolyline(ann.points, false, layerName, colorCode);
    }
    else if (ann.type === 'measure-area' || ann.type === 'measure-perimeter' || ann.type === 'cloud') {
      addPolyline(ann.points, true, layerName, colorCode);
    }
    else if (ann.type === 'rectangle' && ann.width && ann.height) {
      const { x, y } = ann.points[0];
      const w = ann.width, h = ann.height;
      const pts = [ {x, y}, {x: x+w, y}, {x: x+w, y: y+h}, {x, y: y+h} ];
      addPolyline(pts, true, layerName, colorCode);
    }
    else if (ann.type === 'circle' && ann.width) {
      const cx = ann.points[0].x + ann.width / 2;
      const cy = ann.points[0].y + (ann.height || ann.width) / 2;
      addCircle({ x: cx, y: cy }, ann.width / 2, layerName, colorCode);
    }
  }

  // --- FOOTER ---
  dxf += '  0\nENDSEC\n  0\nEOF\n';
  return dxf;
}
