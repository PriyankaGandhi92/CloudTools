import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Hexagon, Loader2, Download, FileImage, FileText, Settings } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';
import { PDFDocument } from 'pdf-lib';

interface ConvertOptions {
  outputFormat: 'dxf' | 'svg' | 'both';
  scale: number;
  lineWidth: number;
  detectText: boolean;
}

interface Geometry {
  lines: Array<{ x1: number; y1: number; x2: number; y2: number; type: string }>;
  text: Array<{ x: number; y: number; content: string; fontSize: number }>;
  arcs: Array<{ x: number; y: number; radius: number; startAngle: number; endAngle: number }>;
  circles: Array<{ x: number; y: number; radius: number }>;
}

interface ConversionResult {
  dxf?: string;
  svg?: string;
  dxfUrl?: string;
  result?: {
    dxfUrl?: string;
  };
}

// PDF Operator List Extraction with CTM Tracking
async function extractVectorGeometryFromPDF(pdfData: ArrayBuffer, pageIndex: number, scale: number): Promise<Geometry | null> {
  try {
    const pdfjsLib = await import('pdfjs-dist');
    const doc = await pdfjsLib.getDocument({ data: pdfData }).promise;
    const page = await doc.getPage(pageIndex + 1);
    
    const operatorList = await page.getOperatorList();
    const OPS = pdfjsLib.OPS;
    
    const geometry: Geometry = {
      lines: [],
      text: [],
      arcs: [],
      circles: [],
    };
    
    // Track current position and CTM
    let currentX = 0;
    let currentY = 0;
    let ctm = [1, 0, 0, 1, 0, 0]; // Identity matrix
    let ctmStack: number[][] = []; // CTM memory stack
    
    // Helper: Apply CTM to a point
    const transformPoint = (x: number, y: number): { x: number; y: number } => {
      return {
        x: ctm[0] * x + ctm[2] * y + ctm[4],
        y: ctm[1] * x + ctm[3] * y + ctm[5],
      };
    };
    
    // Helper: Flatten cubic Bezier curve into line segments
    const flattenBezier = (x0: number, y0: number, x1: number, y1: number, x2: number, y2: number, x3: number, y3: number, segments: number = 20): Array<{x: number, y: number}> => {
      const points: Array<{x: number, y: number}> = [];
      for (let i = 0; i <= segments; i++) {
        const t = i / segments;
        const mt = 1 - t;
        const mt2 = mt * mt;
        const mt3 = mt2 * mt;
        const t2 = t * t;
        const t3 = t2 * t;
        
        const x = mt3 * x0 + 3 * mt2 * t * x1 + 3 * mt * t2 * x2 + t3 * x3;
        const y = mt3 * y0 + 3 * mt2 * t * y1 + 3 * mt * t2 * y2 + t3 * y3;
        points.push({ x, y });
      }
      return points;
    };
    
    // Helper: Recursively process operator list (for XObjects)
    const processOperators = async (fnArray: number[], argsArray: any[][]) => {
      for (let i = 0; i < fnArray.length; i++) {
        const fn = fnArray[i];
        const args = argsArray[i];
        
        switch (fn) {
          case OPS.moveTo:
            currentX = args[0];
            currentY = args[1];
            break;
            
          case OPS.lineTo:
            const startX = currentX;
            const startY = currentY;
            currentX = args[0];
            currentY = args[1];
            
            const transformedStart = transformPoint(startX, startY);
            const transformedEnd = transformPoint(currentX, currentY);
            
            geometry.lines.push({
              x1: transformedStart.x,
              y1: transformedStart.y,
              x2: transformedEnd.x,
              y2: transformedEnd.y,
              type: 'solid',
            });
            break;
            
          case OPS.transform:
            // Update CTM: [a, b, c, d, e, f]
            // New CTM = Current CTM × Transform Matrix
            const [a, b, c, d, e, f] = args;
            const newCtm = [
              ctm[0] * a + ctm[2] * b,
              ctm[1] * a + ctm[3] * b,
              ctm[0] * c + ctm[2] * d,
              ctm[1] * c + ctm[3] * d,
              ctm[0] * e + ctm[2] * f + ctm[4],
              ctm[1] * e + ctm[3] * f + ctm[5],
            ];
            ctm = newCtm;
            break;
            
          case OPS.save:
            // Push a perfect copy of the current matrix to the memory stack
            ctmStack.push([...ctm]);
            break;
            
          case OPS.restore:
            // Pop the last saved matrix off the stack
            if (ctmStack.length > 0) {
              ctm = ctmStack.pop()!;
            }
            break;
            
          case OPS.rectangle:
            // args: [x, y, width, height]
            const rectX = args[0];
            const rectY = args[1];
            const rectW = args[2];
            const rectH = args[3];
            
            // Calculate all four corners
            const corners = [
              { x: rectX, y: rectY },
              { x: rectX + rectW, y: rectY },
              { x: rectX + rectW, y: rectY + rectH },
              { x: rectX, y: rectY + rectH },
            ];
            
            // Transform all corners
            const transformedCorners = corners.map(p => transformPoint(p.x, p.y));
            
            // Push 4 bounding lines
            for (let j = 0; j < 4; j++) {
              const start = transformedCorners[j];
              const end = transformedCorners[(j + 1) % 4];
              geometry.lines.push({
                x1: start.x,
                y1: start.y,
                x2: end.x,
                y2: end.y,
                type: 'solid',
              });
            }
            break;
            
          case OPS.constructPath:
            // args: [ops, argsArray] - argsArray is a FLAT numeric array
            const pathOps = args[0];
            const pathArgs = args[1]; // Flat array of all coordinates
            
            let pathCurrentX = 0;
            let pathCurrentY = 0;
            let argIndex = 0; // Index pointer for flat array
            
            for (let j = 0; j < pathOps.length; j++) {
              const pathOp = pathOps[j];
              
              switch (pathOp) {
                case pdfjsLib.OPS.moveTo:
                  pathCurrentX = pathArgs[argIndex++];
                  pathCurrentY = pathArgs[argIndex++];
                  break;
                  
                case pdfjsLib.OPS.lineTo:
                  const pStartX = pathCurrentX;
                  const pStartY = pathCurrentY;
                  pathCurrentX = pathArgs[argIndex++];
                  pathCurrentY = pathArgs[argIndex++];
                  
                  const pTransformedStart = transformPoint(pStartX, pStartY);
                  const pTransformedEnd = transformPoint(pathCurrentX, pathCurrentY);
                  
                  geometry.lines.push({
                    x1: pTransformedStart.x,
                    y1: pTransformedStart.y,
                    x2: pTransformedEnd.x,
                    y2: pTransformedEnd.y,
                    type: 'solid',
                  });
                  break;
                  
                case pdfjsLib.OPS.curveTo:
                  // args: [control1X, control1Y, control2X, control2Y, endX, endY]
                  const c1x = pathArgs[argIndex++];
                  const c1y = pathArgs[argIndex++];
                  const c2x = pathArgs[argIndex++];
                  const c2y = pathArgs[argIndex++];
                  const endX = pathArgs[argIndex++];
                  const endY = pathArgs[argIndex++];
                  
                  // Flatten the Bezier curve into line segments
                  const curvePoints = flattenBezier(pathCurrentX, pathCurrentY, c1x, c1y, c2x, c2y, endX, endY, 20);
                  
                  // Push line segments for the flattened curve
                  for (let k = 0; k < curvePoints.length - 1; k++) {
                    const cpStart = transformPoint(curvePoints[k].x, curvePoints[k].y);
                    const cpEnd = transformPoint(curvePoints[k + 1].x, curvePoints[k + 1].y);
                    
                    geometry.lines.push({
                      x1: cpStart.x,
                      y1: cpStart.y,
                      x2: cpEnd.x,
                      y2: cpEnd.y,
                      type: 'solid',
                    });
                  }
                  
                  pathCurrentX = endX;
                  pathCurrentY = endY;
                  break;
                  
                case pdfjsLib.OPS.curveTo2:
                  // args: [controlX, controlY, endX, endY]
                  const c2x2 = pathArgs[argIndex++];
                  const c2y2 = pathArgs[argIndex++];
                  const endX2 = pathArgs[argIndex++];
                  const endY2 = pathArgs[argIndex++];
                  
                  // Flatten with control point 2 as current point
                  const curvePoints2 = flattenBezier(pathCurrentX, pathCurrentY, pathCurrentX, pathCurrentY, c2x2, c2y2, endX2, endY2, 20);
                  
                  for (let k = 0; k < curvePoints2.length - 1; k++) {
                    const cpStart = transformPoint(curvePoints2[k].x, curvePoints2[k].y);
                    const cpEnd = transformPoint(curvePoints2[k + 1].x, curvePoints2[k + 1].y);
                    geometry.lines.push({
                      x1: cpStart.x,
                      y1: cpStart.y,
                      x2: cpEnd.x,
                      y2: cpEnd.y,
                      type: 'solid',
                    });
                  }
                  
                  pathCurrentX = endX2;
                  pathCurrentY = endY2;
                  break;
                  
                case pdfjsLib.OPS.curveTo3:
                  // args: [controlX, controlY, endX, endY]
                  const c3x = pathArgs[argIndex++];
                  const c3y = pathArgs[argIndex++];
                  const endX3 = pathArgs[argIndex++];
                  const endY3 = pathArgs[argIndex++];
                  
                  // Flatten with control point 1 as current point
                  const curvePoints3 = flattenBezier(pathCurrentX, pathCurrentY, c3x, c3y, endX3, endY3, endX3, endY3, 20);
                  
                  for (let k = 0; k < curvePoints3.length - 1; k++) {
                    const cpStart = transformPoint(curvePoints3[k].x, curvePoints3[k].y);
                    const cpEnd = transformPoint(curvePoints3[k + 1].x, curvePoints3[k + 1].y);
                    geometry.lines.push({
                      x1: cpStart.x,
                      y1: cpStart.y,
                      x2: cpEnd.x,
                      y2: cpEnd.y,
                      type: 'solid',
                    });
                  }
                  
                  pathCurrentX = endX3;
                  pathCurrentY = endY3;
                  break;
                  
                case pdfjsLib.OPS.rectangle:
                  // args: [x, y, width, height]
                  const rectX = pathArgs[argIndex++];
                  const rectY = pathArgs[argIndex++];
                  const rectW = pathArgs[argIndex++];
                  const rectH = pathArgs[argIndex++];
                  
                  const corners = [
                    { x: rectX, y: rectY },
                    { x: rectX + rectW, y: rectY },
                    { x: rectX + rectW, y: rectY + rectH },
                    { x: rectX, y: rectY + rectH },
                  ];
                  
                  const transformedCorners = corners.map(p => transformPoint(p.x, p.y));
                  
                  for (let k = 0; k < 4; k++) {
                    const start = transformedCorners[k];
                    const end = transformedCorners[(k + 1) % 4];
                    geometry.lines.push({
                      x1: start.x,
                      y1: start.y,
                      x2: end.x,
                      y2: end.y,
                      type: 'solid',
                    });
                  }
                  break;
                  
                case pdfjsLib.OPS.closePath:
                  // Close the path - just reset current point
                  break;
              }
            }
            break;
            
          case OPS.paintXObject:
            // args: [objId]
            const objId = args[0];
            const xObject = await page.objs.get(objId);
            
            if (xObject && xObject.type === 'Form') {
              // Save current CTM state before entering XObject
              ctmStack.push([...ctm]);
              
              // Recursively process the XObject's operator list
              await processOperators(xObject.fnArray, xObject.argsArray);
              
              // Restore CTM after XObject processing
              if (ctmStack.length > 0) {
                ctm = ctmStack.pop()!;
              }
            }
            break;
            
          // Text operators (for future enhancement)
          case OPS.showText:
          case OPS.showSpacedText:
            // Could extract text here if needed
            break;
        }
      }
    };
    
    // Process operator list
    await processOperators(operatorList.fnArray, operatorList.argsArray);
    
    // Filter out any lines with NaN or invalid coordinates
    geometry.lines = geometry.lines.filter(line => 
      !isNaN(line.x1) && !isNaN(line.y1) && !isNaN(line.x2) && !isNaN(line.y2) &&
      isFinite(line.x1) && isFinite(line.y1) && isFinite(line.x2) && isFinite(line.y2)
    );
    
    console.log(`Extracted ${geometry.lines.length} valid vector lines from PDF`);
    return geometry;
  } catch (err) {
    console.error('Failed to extract vector geometry from PDF:', err);
    return null;
  }
}

export default function ConvertToCADDialog({ onClose }: { onClose: () => void }) {
  const { currentPage, pdfData } = useStore();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<ConversionResult | null>(null);
  
  const [options, setOptions] = useState<ConvertOptions>({
    outputFormat: 'both',
    scale: 1.0,
    lineWidth: 0.5,
    detectText: true,
  });

  const handleConvert = async () => {
    console.log("1. BUTTON CLICKED! Starting handleConvert...");
    setError('');
    setResult(null);
    setLoading(true);

    try {
      console.log("2. Attempting to get API Key...");
      setStatus('Getting API key...');
      const keyResult = await httpsCallable(functions, 'getApiKey')();
      const apiKey = (keyResult.data as { apiKey: string }).apiKey;

      if (!apiKey) {
        throw new Error('Failed to get API key from Firebase Functions');
      }

      console.log("3. API Key secured. Extracting vector geometry...");
      setStatus('Analyzing PDF for vector content...');
      
      if (!pdfData) throw new Error('No PDF loaded');
      
      // Create a copy of the ArrayBuffer to avoid detached ArrayBuffer errors
      const pdfDataCopy = new Uint8Array(pdfData).slice().buffer;

      // Try to extract vector geometry from PDF operator list
      const vectorGeometry = await extractVectorGeometryFromPDF(pdfDataCopy, currentPage, 6);
      
      const pageWidth = 612 * 6; // Standard letter width at scale 6
      const pageHeight = 792 * 6; // Standard letter height at scale 6

      let payload: any = {
        options,
        pageWidth,
        pageHeight,
      };

      // TIER 1 & 2 SETUP: If it is a PDF file, ALWAYS flag it for CloudConvert and pureGeometry
      if (pdfData) {
        console.log("4. PDF detected. Preparing Tier 1 (CloudConvert) & Tier 2 (Pure Geometry) payloads...");
        
        // Slice PDF to single page using pdf-lib
        const pdfDoc = await PDFDocument.load(pdfData);
        const newPdfDoc = await PDFDocument.create();
        const [copiedPage] = await newPdfDoc.copyPages(pdfDoc, [currentPage]);
        newPdfDoc.addPage(copiedPage);
        
        // Flatten all interactive markups, stamps, and user annotations into sharp native vector elements
        // Remove annotations to ensure they're baked into the content stream
        const pages = newPdfDoc.getPages();
        if (pages.length > 0) {
          const page = pages[0];
          // Clear all annotations by setting an empty PDFArray
          const { PDFArray } = await import('pdf-lib');
          const emptyArray = newPdfDoc.context.obj([]);
          (page.node as any).Annots = newPdfDoc.context.register(emptyArray);
        }
        
        const singlePagePdfBytes = await newPdfDoc.save();
        
        // The BROWSER-SAFE way to convert an ArrayBuffer to Base64
        const bytes = new Uint8Array(singlePagePdfBytes);
        let binary = '';
        for (let i = 0; i < bytes.byteLength; i++) {
          binary += String.fromCharCode(bytes[i]);
        }
        const base64String = window.btoa(binary);

        payload.isVectorPdf = true;
        payload.rawPdfBase64 = base64String;
        payload.pureGeometry = vectorGeometry; 
      }

      // TIER 3 SETUP: ALWAYS generate the canvas image just in case Tier 1 & 2 fail
      console.log("5. Rendering canvas for AI safety net (Tier 3)...");
      setStatus('Rendering canvas for AI tracing...');
      
      const pdfDataFallbackCopy = new Uint8Array(pdfData).slice().buffer;
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to create canvas context');

      const pdfjsLib = await import('pdfjs-dist');
      const doc = await pdfjsLib.getDocument({ data: pdfDataFallbackCopy }).promise;
      const page = await doc.getPage(currentPage + 1);
      
      const viewport = page.getViewport({ scale: 2 }); 
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      payload.imageData = canvas.toDataURL('image/jpeg', 0.6);
      payload.pageWidth = viewport.width;
      payload.pageHeight = viewport.height;

      console.log("6. Calling backend convertToCad function...");
      setStatus('Converting to CAD format...');
      
      const convertResult = await httpsCallable(functions, 'convertToCad', { timeout: 540000 })(payload);

      console.log("7. Backend returned a response!");
      const resultData = (convertResult.data as any).result || null;
      setResult(resultData);
      
      console.log('Extraction Data:', resultData?.debugGeometry);
      console.log('RAW GEMINI RESPONSE:', resultData?.rawGeminiText);
      
      setStatus('Conversion complete!');
    } catch (err: any) {
      console.error('8. FATAL ERROR CAUGHT:', err);
      const errorMessage = err?.message || err?.toString() || 'Failed to convert to CAD';
      setError(errorMessage);
    } finally {
      setLoading(false);
      console.log("9. handleConvert finished.");
    }
  };

  const handleDownload = (format: 'dxf' | 'svg') => {
    if (!result) return;
    
    // Check for URL from CloudConvert (Tier 1)
    const dxfUrl = result.dxfUrl || result.result?.dxfUrl;
    if (format === 'dxf' && dxfUrl) {
      const a = document.createElement('a');
      a.href = dxfUrl;
      a.download = `converted-page-${currentPage + 1}.dxf`;
      a.target = '_blank';
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      return;
    }
    
    // Fallback to inline data (Tier 2/3)
    const data = format === 'dxf' ? result.dxf : result.svg;
    if (!data) return;

    const blob = new Blob([data], { 
      type: format === 'dxf' ? 'application/dxf' : 'image/svg+xml' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `converted-page-${currentPage + 1}.${format}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-bb-sidebar rounded-xl border border-bb-border shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col">
        {/* Header */}
        <div className="px-5 py-3 border-b border-bb-border flex items-center gap-2 shrink-0">
          <Hexagon size={16} className="text-blue-400" />
          <h2 className="text-sm font-bold">Convert to CAD</h2>
          <span className="text-[10px] text-bb-muted ml-auto">PDF/Image → DXF/SVG</span>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 flex-1 overflow-auto min-h-0">
          {/* Description */}
          <div className="text-[11px] text-bb-muted leading-relaxed bg-bb-dark rounded-lg border border-bb-border p-3">
            <p className="mb-2 font-medium text-bb-text">How it works:</p>
            <p>1. AI detects geometry (lines, arcs, shapes) from the current PDF page</p>
            <p>2. Converts linework to rough vectors</p>
            <p>3. Generates DXF (for AutoCAD) and/or SVG files</p>
            <p>4. Download and open in AutoCAD to edit, scale, and refine</p>
            <p className="mt-2 text-blue-400/80">Best results with clean line drawings, floor plans, and technical drawings</p>
          </div>

          {/* Options */}
          <div className="bg-bb-dark rounded-lg border border-bb-border p-4 space-y-3">
            <div className="flex items-center gap-2 mb-3">
              <Settings size={12} className="text-bb-muted" />
              <span className="text-xs font-semibold text-bb-text">Conversion Options</span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-[10px] text-bb-muted block mb-1">Output Format</label>
                <select
                  value={options.outputFormat}
                  onChange={(e) => setOptions({ ...options, outputFormat: e.target.value as any })}
                  className="w-full bg-bb-panel border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text outline-none focus:border-bb-blue"
                >
                  <option value="dxf">DXF Only</option>
                  <option value="svg">SVG Only</option>
                  <option value="both">Both DXF & SVG</option>
                </select>
              </div>

              <div>
                <label className="text-[10px] text-bb-muted block mb-1">Scale Factor</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="10"
                  value={options.scale}
                  onChange={(e) => setOptions({ ...options, scale: parseFloat(e.target.value) || 1 })}
                  className="w-full bg-bb-panel border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text outline-none focus:border-bb-blue"
                />
              </div>

              <div>
                <label className="text-[10px] text-bb-muted block mb-1">Line Width</label>
                <input
                  type="number"
                  step="0.1"
                  min="0.1"
                  max="5"
                  value={options.lineWidth}
                  onChange={(e) => setOptions({ ...options, lineWidth: parseFloat(e.target.value) || 0.5 })}
                  className="w-full bg-bb-panel border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text outline-none focus:border-bb-blue"
                />
              </div>

              <div className="flex items-center gap-2 pt-4">
                <input
                  type="checkbox"
                  id="detectText"
                  checked={options.detectText}
                  onChange={(e) => setOptions({ ...options, detectText: e.target.checked })}
                  className="w-3 h-3 accent-blue-500"
                />
                <label htmlFor="detectText" className="text-[10px] text-bb-text">
                  Detect Text Elements
                </label>
              </div>
            </div>
          </div>

          {/* Progress */}
          {loading && (
            <div className="space-y-2">
              <div className="flex items-center gap-2 text-xs text-blue-300">
                <Loader2 size={12} className="animate-spin" />
                {status}
              </div>
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          {/* Result */}
          {result && (
            <div className="bg-bb-dark rounded-lg border border-bb-border p-4">
              <div className="flex items-center gap-2 mb-3">
                <FileText size={12} className="text-green-400" />
                <span className="text-xs font-semibold text-bb-text">Conversion Complete</span>
              </div>
              <div className="flex gap-2">
                {(result.dxfUrl || result.result?.dxfUrl || result.dxf) && (
                  <button
                    onClick={() => handleDownload('dxf')}
                    className="flex-1 px-3 py-2 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Download size={12} />
                    Download DXF
                  </button>
                )}
                {result.svg && (
                  <button
                    onClick={() => handleDownload('svg')}
                    className="flex-1 px-3 py-2 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors flex items-center justify-center gap-1.5"
                  >
                    <Download size={12} />
                    Download SVG
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-bb-border flex items-center gap-2 justify-between shrink-0">
          <span className="text-[10px] text-bb-muted">
            Current page: {currentPage + 1}
          </span>
          <div className="flex gap-2">
            <button
              onClick={onClose}
              className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
            >
              Close
            </button>
            {!loading && !result && (
              <button
                onClick={handleConvert}
                className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1.5"
              >
                <Hexagon size={12} />
                Convert
              </button>
            )}
            {result && (
              <button
                onClick={() => setResult(null)}
                className="px-4 py-1.5 text-xs bg-bb-blue hover:bg-blue-600 text-white rounded transition-colors"
              >
                Convert Again
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
