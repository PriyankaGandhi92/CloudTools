import React, { useState, useRef } from 'react';
import { useStore } from '../store/useStore';
import { Hexagon, Loader2, Download, FileImage, FileText, Settings } from 'lucide-react';
import { httpsCallable } from 'firebase/functions';
import { functions } from '../config/firebase';

interface ConvertOptions {
  outputFormat: 'dxf' | 'svg' | 'both';
  scale: number;
  lineWidth: number;
  detectText: boolean;
}

export default function ConvertToCADDialog({ onClose }: { onClose: () => void }) {
  const { currentPage, pdfData } = useStore();
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [result, setResult] = useState<{ dxf?: string; svg?: string } | null>(null);
  
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

      console.log("3. API Key secured. Rendering canvas at scale 2...");
      setStatus('Rendering current page...');
      
      if (!pdfData) throw new Error('No PDF loaded');
      
      // Create a copy of the ArrayBuffer to avoid detached ArrayBuffer errors
      const pdfDataCopy = new Uint8Array(pdfData).slice().buffer;
      
      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Failed to create canvas context');
      if (!pdfDataCopy) throw new Error('No PDF loaded');

      const pdfjsLib = await import('pdfjs-dist');
      const doc = await pdfjsLib.getDocument({ data: pdfDataCopy }).promise;
      const page = await doc.getPage(currentPage + 1);
      
      // IMPORTANT: Reduce scale to 2 to avoid 503 timeout errors
      const viewport = page.getViewport({ scale: 2 }); 
      
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      
      await page.render({ canvasContext: ctx, viewport }).promise;
      
      console.log("4. Canvas rendered. Converting to Base64...");
      // Compress it to a JPEG at 60% quality. 
      // It keeps the massive 6x resolution, but shrinks the file size down to ~2MB!
      const imageData = canvas.toDataURL('image/jpeg', 0.6);

      console.log("5. Base64 ready. Calling backend convertToCad function...");
      setStatus('Detecting geometry with AI...');
      
      const convertResult = await httpsCallable(functions, 'convertToCad')({
        imageData,
        options,
        pageWidth: viewport.width,
        pageHeight: viewport.height,
      });

      console.log("6. Backend returned a response!");
      const resultData = (convertResult.data as any).result || null;
      setResult(resultData);
      
      console.log('AI Extraction Data:', resultData?.debugGeometry);
      
      // ADD THIS LINE:
      console.log('RAW GEMINI RESPONSE:', resultData?.rawGeminiText); 
      
      setStatus('Conversion complete!');
    } catch (err: any) {
      console.error('7. FATAL ERROR CAUGHT:', err);
      const errorMessage = err?.message || err?.toString() || 'Failed to convert to CAD';
      setError(errorMessage);
    } finally {
      setLoading(false);
      console.log("8. handleConvert finished.");
    }
  };

  const handleDownload = (format: 'dxf' | 'svg') => {
    if (!result) return;
    
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
                {result.dxf && (
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
