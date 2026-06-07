import React, { useEffect, useRef, useState } from 'react';
import { X, RefreshCw, Pipette } from 'lucide-react';

interface ColorRemap {
  original: string; // hex
  replacement: string; // hex
}

interface Props {
  imageData: string;
  width: number;
  height: number;
  onConfirm: (processedImageData: string) => void;
  onCancel: () => void;
}

function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r, g, b];
}

function rgbToHex(r: number, g: number, b: number): string {
  return '#' + [r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('');
}

function colorDistance(a: [number, number, number], b: [number, number, number]): number {
  return Math.sqrt((a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2 + (a[2] - b[2]) ** 2);
}

/** Extract the dominant distinct colors from the image (up to maxColors) */
function extractColors(imgData: ImageData, maxColors = 12, tolerance = 30): string[] {
  const buckets: { rgb: [number, number, number]; count: number }[] = [];
  const { data } = imgData;
  for (let i = 0; i < data.length; i += 4) {
    const a = data[i + 3];
    if (a < 20) continue; // skip transparent
    const r = data[i], g = data[i + 1], b = data[i + 2];
    // Skip near-white
    if (r > 245 && g > 245 && b > 245) continue;
    const rgb: [number, number, number] = [r, g, b];
    const existing = buckets.find((bk) => colorDistance(bk.rgb, rgb) < tolerance);
    if (existing) {
      existing.count++;
      // Move centroid towards new sample
      existing.rgb[0] = Math.round((existing.rgb[0] * (existing.count - 1) + r) / existing.count);
      existing.rgb[1] = Math.round((existing.rgb[1] * (existing.count - 1) + g) / existing.count);
      existing.rgb[2] = Math.round((existing.rgb[2] * (existing.count - 1) + b) / existing.count);
    } else {
      buckets.push({ rgb, count: 1 });
    }
  }
  return buckets
    .sort((a, b) => b.count - a.count)
    .slice(0, maxColors)
    .map((bk) => rgbToHex(...bk.rgb));
}

/** Apply color remaps and background fill to imageData, return new data URL */
function processImage(
  src: string,
  remaps: ColorRemap[],
  bgColor: string | null,
  tolerance: number = 40,
): Promise<string> {
  return new Promise((resolve) => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;

      // Draw background fill first if set
      if (bgColor) {
        ctx.fillStyle = bgColor;
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.globalCompositeOperation = 'source-atop';
      }

      ctx.drawImage(img, 0, 0);
      ctx.globalCompositeOperation = 'source-over';

      if (remaps.length === 0 && !bgColor) {
        resolve(canvas.toDataURL('image/png'));
        return;
      }

      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const { data } = imgData;

      const remapRgbs = remaps.map((r) => ({
        from: hexToRgb(r.original),
        to: hexToRgb(r.replacement),
      }));

      for (let i = 0; i < data.length; i += 4) {
        if (data[i + 3] < 20) continue;
        const pixel: [number, number, number] = [data[i], data[i + 1], data[i + 2]];
        for (const { from, to } of remapRgbs) {
          if (colorDistance(pixel, from) < tolerance) {
            data[i] = to[0];
            data[i + 1] = to[1];
            data[i + 2] = to[2];
            break;
          }
        }
      }

      ctx.putImageData(imgData, 0, 0);
      resolve(canvas.toDataURL('image/png'));
    };
    img.src = src;
  });
}

export default function ImageColorEditorDialog({ imageData, width, height, onConfirm, onCancel }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [detectedColors, setDetectedColors] = useState<string[]>([]);
  const [remaps, setRemaps] = useState<ColorRemap[]>([]);
  const [bgColor, setBgColor] = useState<string>('');
  const [enableBg, setEnableBg] = useState(false);
  const [processing, setProcessing] = useState(false);
  const [previewUrl, setPreviewUrl] = useState<string>(imageData);

  // Load image and detect colors
  useEffect(() => {
    const img = new window.Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const imgData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const colors = extractColors(imgData);
      setDetectedColors(colors);
    };
    img.src = imageData;
  }, [imageData]);

  // Refresh preview whenever remaps or bgColor change
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const url = await processImage(imageData, remaps, enableBg && bgColor ? bgColor : null);
      if (!cancelled) setPreviewUrl(url);
    })();
    return () => { cancelled = true; };
  }, [imageData, remaps, bgColor, enableBg]);

  const addRemap = (original: string) => {
    if (remaps.find((r) => r.original === original)) return;
    setRemaps((prev) => [...prev, { original, replacement: original }]);
  };

  const updateRemap = (original: string, replacement: string) => {
    setRemaps((prev) => prev.map((r) => r.original === original ? { ...r, replacement } : r));
  };

  const removeRemap = (original: string) => {
    setRemaps((prev) => prev.filter((r) => r.original !== original));
  };

  const handleConfirm = async () => {
    setProcessing(true);
    const result = await processImage(imageData, remaps, enableBg && bgColor ? bgColor : null);
    setProcessing(false);
    onConfirm(result);
  };

  const previewAspect = height / (width || 1);
  const previewW = 320;
  const previewH = Math.min(previewW * previewAspect, 240);

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
      <div className="bg-bb-sidebar border border-bb-border rounded-xl shadow-2xl flex flex-col w-full max-w-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-5 py-3 border-b border-bb-border flex items-center gap-2 shrink-0">
          <Pipette size={16} className="text-orange-400" />
          <span className="text-sm font-bold">Edit Overlay Colors</span>
          <button onClick={onCancel} className="ml-auto text-bb-muted hover:text-bb-text"><X size={16} /></button>
        </div>

        <div className="p-5 space-y-5">
          {/* Preview */}
          <div className="flex justify-center">
            <div className="rounded border border-bb-border overflow-hidden bg-[url('data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAABAAAAAQCAYAAAAf8/9hAAAABHNCSVQICAgIfAhkiAAAAAlwSFlzAAALEwAACxMBAJqcGAAAABl0RVh0U29mdHdhcmUAd3d3Lmlua3NjYXBlLm9yZ5vuPBoAAABCSURBVDiNY2BgYPgPxAQBJiY0QB4AAAAASUVORK5CYII=')]">
              <img
                src={previewUrl}
                style={{ width: previewW, height: previewH, objectFit: 'contain', display: 'block' }}
                alt="Preview"
              />
            </div>
          </div>

          {/* Background color */}
          <div className="bg-bb-dark border border-bb-border rounded-lg p-3 space-y-2">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="enableBg"
                checked={enableBg}
                onChange={(e) => setEnableBg(e.target.checked)}
                className="w-3.5 h-3.5"
              />
              <label htmlFor="enableBg" className="text-xs font-semibold text-bb-text cursor-pointer">
                Add Background Color
              </label>
            </div>
            {enableBg && (
              <div className="flex items-center gap-3 ml-5">
                <input
                  type="color"
                  value={bgColor || '#ffffff'}
                  onChange={(e) => setBgColor(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-bb-border bg-transparent"
                />
                <span className="text-xs text-bb-muted">{bgColor || '#ffffff'}</span>
                <button onClick={() => setBgColor('')} className="text-[10px] text-bb-muted hover:text-red-400">Clear</button>
              </div>
            )}
          </div>

          {/* Detected colors */}
          <div>
            <div className="text-xs font-semibold text-bb-muted uppercase tracking-wider mb-2">
              Detected Linework Colors
              <span className="ml-2 text-[10px] font-normal normal-case">— click to add a color remap</span>
            </div>
            {detectedColors.length === 0 && (
              <div className="text-xs text-bb-muted">No linework colors detected (image may be mostly transparent).</div>
            )}
            <div className="flex flex-wrap gap-2">
              {detectedColors.map((c) => (
                <button
                  key={c}
                  title={`Remap ${c}`}
                  onClick={() => addRemap(c)}
                  className="flex items-center gap-1.5 px-2 py-1 rounded border border-bb-border hover:border-orange-500 bg-bb-dark text-[10px] text-bb-text transition-colors"
                >
                  <span className="w-4 h-4 rounded-sm border border-black/20 inline-block" style={{ backgroundColor: c }} />
                  {c}
                </button>
              ))}
            </div>
          </div>

          {/* Active remaps */}
          {remaps.length > 0 && (
            <div>
              <div className="text-xs font-semibold text-bb-muted uppercase tracking-wider mb-2">Color Remaps</div>
              <div className="space-y-2">
                {remaps.map((r) => (
                  <div key={r.original} className="flex items-center gap-3 bg-bb-dark border border-bb-border rounded-lg px-3 py-2">
                    {/* Original */}
                    <div className="flex items-center gap-1.5">
                      <span className="w-5 h-5 rounded border border-black/20" style={{ backgroundColor: r.original }} />
                      <span className="text-[10px] text-bb-muted font-mono">{r.original}</span>
                    </div>
                    <span className="text-bb-muted text-xs">→</span>
                    {/* Replacement */}
                    <div className="flex items-center gap-1.5 flex-1">
                      <input
                        type="color"
                        value={r.replacement}
                        onChange={(e) => updateRemap(r.original, e.target.value)}
                        className="w-6 h-6 rounded cursor-pointer border border-bb-border bg-transparent"
                      />
                      <span className="text-[10px] text-bb-muted font-mono">{r.replacement}</span>
                    </div>
                    <button onClick={() => removeRemap(r.original)} className="text-bb-muted hover:text-red-400">
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-bb-border flex items-center gap-2 shrink-0">
          <button onClick={onCancel} className="px-3 py-1.5 text-xs bg-bb-hover rounded hover:bg-bb-border transition-colors">
            Cancel
          </button>
          <button
            onClick={() => setRemaps([])}
            className="px-3 py-1.5 text-xs bg-bb-hover rounded hover:bg-bb-border transition-colors flex items-center gap-1"
          >
            <RefreshCw size={11} /> Reset
          </button>
          <span className="flex-1" />
          <button
            onClick={handleConfirm}
            disabled={processing}
            className="px-4 py-1.5 text-xs bg-orange-600 hover:bg-orange-700 text-white rounded transition-colors disabled:opacity-50"
          >
            {processing ? 'Processing...' : 'Paste with Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
