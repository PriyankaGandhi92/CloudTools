import React, { useEffect, useRef, useState } from 'react';
import { X, Activity, Maximize, RotateCcw } from 'lucide-react';
import { loadOpenCV, isOpenCVReady } from '../utils/loadOpenCV';

interface PhotoAnalyzerProps {
  imageUrl: string;
  onClose: () => void;
}

declare global {
  interface Window { cv: any; }
}

export default function PhotoAnalyzerDialog({ imageUrl, onClose }: PhotoAnalyzerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const imageRef = useRef<HTMLImageElement>(null);
  const [isCvReady, setIsCvReady] = useState(false);
  const [analyzing, setAnalyzing] = useState(false);
  const [hasResult, setHasResult] = useState(false);

  // Dynamically load OpenCV when dialog opens
  useEffect(() => {
    const initOpenCV = async () => {
      if (isOpenCVReady()) {
        setIsCvReady(true);
        return;
      }
      try {
        await loadOpenCV();
        setIsCvReady(true);
      } catch (err) {
        console.error('Failed to load OpenCV:', err);
      }
    };
    initOpenCV();
  }, []);

  const resetToOriginal = () => {
    if (!canvasRef.current || !imageRef.current) return;
    const ctx = canvasRef.current.getContext('2d');
    if (ctx) {
      canvasRef.current.width = imageRef.current.width;
      canvasRef.current.height = imageRef.current.height;
      ctx.drawImage(imageRef.current, 0, 0);
      setHasResult(false);
    }
  };

  const runDefectDetection = () => {
    if (!window.cv || !canvasRef.current || !imageRef.current) return;
    setAnalyzing(true);

    try {
      // 1. Read the image into OpenCV matrix
      const src = window.cv.imread(imageRef.current);
      const dst = new window.cv.Mat();
      
      // 2. Convert to Grayscale
      window.cv.cvtColor(src, src, window.cv.COLOR_RGBA2GRAY, 0);
      
      // 3. Apply Gaussian Blur to reduce noise
      const ksize = new window.cv.Size(5, 5);
      window.cv.GaussianBlur(src, src, ksize, 0, 0, window.cv.BORDER_DEFAULT);
      
      // 4. Run Canny Edge Detection (Highlights cracks and sharp lines)
      window.cv.Canny(src, dst, 50, 150, 3, false);
      
      // 5. Draw the result back to our visible canvas
      window.cv.imshow(canvasRef.current, dst);
      
      // Cleanup memory (Crucial for C++ WebAssembly)
      src.delete();
      dst.delete();
      setHasResult(true);
    } catch (err) {
      console.error("OpenCV Error:", err);
    }
    setAnalyzing(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm p-4">
      <div className="bg-bb-dark border border-bb-border rounded-lg shadow-2xl w-full max-w-4xl overflow-hidden flex flex-col">
        
        {/* Header */}
        <div className="flex justify-between items-center px-4 py-3 border-b border-bb-border bg-bb-sidebar">
          <h2 className="text-white font-semibold flex items-center gap-2">
            <Activity size={18} className="text-bb-blue" />
            AI Image Analysis (OpenCV)
          </h2>
          <button onClick={onClose} className="text-bb-muted hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Canvas Workspace */}
        <div className="p-6 flex-1 flex justify-center items-center bg-black/50 overflow-hidden relative min-h-[400px]">
          {/* Hidden source image */}
          <img 
            ref={imageRef} 
            src={imageUrl} 
            crossOrigin="anonymous" 
            className="hidden" 
            onLoad={() => {
              // Draw initial image to canvas
              if (canvasRef.current && imageRef.current) {
                const ctx = canvasRef.current.getContext('2d');
                canvasRef.current.width = imageRef.current.width;
                canvasRef.current.height = imageRef.current.height;
                ctx?.drawImage(imageRef.current, 0, 0);
              }
            }}
          />
          {/* Active Canvas */}
          <canvas ref={canvasRef} className="max-w-full max-h-full object-contain shadow-lg" />
        </div>

        {/* Controls */}
        <div className="p-4 bg-bb-panel border-t border-bb-border flex justify-between items-center">
          <p className="text-xs text-bb-muted">
            {isCvReady ? '🟢 Vision Engine Ready' : '🟠 Loading Vision Engine...'}
          </p>
          <div className="flex gap-3">
            {hasResult && (
              <button 
                onClick={resetToOriginal}
                className="px-4 py-2 bg-bb-muted hover:bg-gray-600 text-white text-sm font-medium rounded flex items-center gap-2"
              >
                <RotateCcw size={16} />
                Reset
              </button>
            )}
            <button 
              onClick={runDefectDetection}
              disabled={!isCvReady || analyzing}
              className="px-4 py-2 bg-bb-blue hover:bg-blue-600 text-white text-sm font-medium rounded flex items-center gap-2 disabled:opacity-50"
            >
              <Maximize size={16} />
              {analyzing ? 'Analyzing...' : 'Highlight Defects & Cracks'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
