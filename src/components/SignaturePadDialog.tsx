import React, { useRef, useState, useEffect } from 'react';
import { X, Pen, Type, Calendar, Trash2, Check } from 'lucide-react';
import { useStore } from '../store/useStore';

interface SignaturePadDialogProps {
  onClose: () => void;
}

type Tab = 'draw' | 'type';

export default function SignaturePadDialog({ onClose }: SignaturePadDialogProps) {
  const { currentPage, addAnnotation, activeStyle, annotations, pushUndo, setPendingSignature, setCADPendingCommand, setActiveTool } = useStore();
  const [tab, setTab] = useState<Tab>('draw');
  const [showDateStamp, setShowDateStamp] = useState(true);
  const [typedName, setTypedName] = useState('');
  const [typedNameFont, setTypedNameFont] = useState('Great Vibes');

  // Drawing canvas refs
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const isDrawing = useRef(false);
  const lastPoint = useRef<{ x: number; y: number } | null>(null);

  // Initialize drawing canvas
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size
    canvas.width = 400;
    canvas.height = 200;

    // Clear with transparent background
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Set drawing style - dark black and thick
    ctx.strokeStyle = '#000000';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
  }, [tab]);

  // Drawing handlers
  const getPointerPos = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    isDrawing.current = true;
    lastPoint.current = getPointerPos(e);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isDrawing.current || !canvasRef.current) return;
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const currentPoint = getPointerPos(e);
    if (lastPoint.current) {
      ctx.beginPath();
      ctx.moveTo(lastPoint.current.x, lastPoint.current.y);
      ctx.lineTo(currentPoint.x, currentPoint.y);
      ctx.stroke();
    }
    lastPoint.current = currentPoint;
  };

  const stopDrawing = () => {
    isDrawing.current = false;
    lastPoint.current = null;
  };

  const clearCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
  };

  // Generate signature image (base64 PNG with transparency)
  const generateSignatureImage = (): string | null => {
    if (tab === 'draw') {
      const canvas = canvasRef.current;
      if (!canvas) return null;
      return canvas.toDataURL('image/png');
    } else {
      // Type mode: render text to canvas
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 200;
      const ctx = canvas.getContext('2d');
      if (!ctx) return null;

      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = '#000000';
      ctx.font = `italic 48px "${typedNameFont}"`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(typedName || 'Your Name', canvas.width / 2, canvas.height / 2 - (showDateStamp ? 25 : 0));

      if (showDateStamp) {
        ctx.font = 'bold 14px Arial';
        ctx.fillStyle = '#000000';
        const now = new Date();
        const dateStr = now.toLocaleDateString() + ' ' + now.toLocaleTimeString();
        ctx.fillText(dateStr, canvas.width / 2, canvas.height / 2 + 35);
      }

      return canvas.toDataURL('image/png');
    }
  };

  const handlePlaceSignature = () => {
    const imageData = generateSignatureImage();
    if (!imageData) return;

    // Store signature data for placement via rectangle drawing
    setPendingSignature({ imageData, showDateStamp });
    
    // Close dialog and enter signature placement mode
    onClose();
    
    // Set CAD command to trigger rectangle drawing mode in MainCanvas
    setCADPendingCommand('SIGNATURE_PLACE');
    setActiveTool('select');
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bb-sidebar border border-bb-border rounded-lg shadow-2xl w-[480px] max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bb-border">
          <div className="flex items-center gap-2">
            <Pen size={18} className="text-bb-blue" />
            <span className="text-sm font-semibold text-bb-text">Signature</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-bb-hover rounded text-bb-muted">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="px-4 py-4 space-y-4">
          {/* Tabs */}
          <div className="flex gap-1 bg-bb-dark p-1 rounded">
            <button
              onClick={() => setTab('draw')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
                tab === 'draw' ? 'bg-bb-blue text-white' : 'text-bb-muted hover:text-bb-text'
              }`}
            >
              <Pen size={13} /> Draw
            </button>
            <button
              onClick={() => setTab('type')}
              className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs rounded transition-colors ${
                tab === 'type' ? 'bg-bb-blue text-white' : 'text-bb-muted hover:text-bb-text'
              }`}
            >
              <Type size={13} /> Type
            </button>
          </div>

          {/* Draw tab */}
          {tab === 'draw' && (
            <div>
              <div className="relative bg-white rounded border border-bb-border">
                <canvas
                  ref={canvasRef}
                  className="w-full h-[200px] cursor-crosshair touch-none"
                  onMouseDown={startDrawing}
                  onMouseMove={draw}
                  onMouseUp={stopDrawing}
                  onMouseLeave={stopDrawing}
                  onTouchStart={startDrawing}
                  onTouchMove={draw}
                  onTouchEnd={stopDrawing}
                />
                <button
                  onClick={clearCanvas}
                  className="absolute top-2 right-2 p-1.5 bg-gray-100 hover:bg-gray-200 rounded text-gray-600"
                  title="Clear"
                >
                  <Trash2 size={14} />
                </button>
              </div>
              <p className="text-[10px] text-bb-muted mt-1.5">Draw your signature above. After clicking Place Signature, draw a rectangle on the PDF to define the size and position.</p>
            </div>
          )}

          {/* Type tab */}
          {tab === 'type' && (
            <div className="space-y-3">
              <div>
                <label className="block text-xs text-bb-muted mb-1.5">Your Name</label>
                <input
                  type="text"
                  value={typedName}
                  onChange={(e) => setTypedName(e.target.value)}
                  placeholder="John Doe"
                  className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
                />
              </div>
              <div>
                <label className="block text-xs text-bb-muted mb-1.5">Font Style</label>
                <select
                  value={typedNameFont}
                  onChange={(e) => setTypedNameFont(e.target.value)}
                  className="w-full px-3 py-1.5 bg-bb-dark border border-bb-border rounded text-xs text-bb-text outline-none focus:border-bb-blue"
                >
                  <option value="Great Vibes">Great Vibes (Cursive)</option>
                  <option value="serif">Serif</option>
                  <option value="sans-serif">Sans Serif</option>
                  <option value="monospace">Monospace</option>
                </select>
              </div>
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="dateStamp"
                  checked={showDateStamp}
                  onChange={(e) => setShowDateStamp(e.target.checked)}
                  className="rounded"
                />
                <label htmlFor="dateStamp" className="text-xs text-bb-text flex items-center gap-1">
                  <Calendar size={12} className="text-bb-muted" />
                  Include date & time stamp
                </label>
              </div>
            </div>
          )}

          {/* Date stamp option for draw tab */}
          {tab === 'draw' && (
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="dateStampDraw"
                checked={showDateStamp}
                onChange={(e) => setShowDateStamp(e.target.checked)}
                className="rounded"
              />
              <label htmlFor="dateStampDraw" className="text-xs text-bb-text flex items-center gap-1">
                <Calendar size={12} className="text-bb-muted" />
                Add date & time stamp below signature
              </label>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-bb-border">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs text-bb-muted hover:text-bb-text hover:bg-bb-hover rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handlePlaceSignature}
            disabled={tab === 'type' && !typedName.trim()}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-bb-blue hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-xs font-medium transition-colors"
          >
            <Check size={13} />
            Draw Placement Box
          </button>
        </div>
      </div>
    </div>
  );
}
