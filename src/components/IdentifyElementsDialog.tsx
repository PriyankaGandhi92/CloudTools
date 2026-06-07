import React, { useState } from 'react';
import { X, ScanSearch, Loader2, Sparkles, MousePointerClick } from 'lucide-react';
import { useStore } from '../store/useStore';
import {
  ELEMENT_CATEGORIES,
  identifyElementsOnPage,
  summarizeDetections,
  type ElementCategory,
} from '../utils/identifyElements';

interface Props {
  onClose: () => void;
}

export default function IdentifyElementsDialog({ onClose }: Props) {
  const { currentPage, setDetectedElements, setHoverPredictionEnabled, hoverPredictionEnabled } = useStore();
  const [selected, setSelected] = useState<Set<ElementCategory>>(new Set(['wall', 'room']));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const [useAi, setUseAi] = useState(true);

  const toggle = (id: ElementCategory) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => setSelected(new Set(ELEMENT_CATEGORIES.map((e) => e.id)));
  const clearAll = () => setSelected(new Set());

  const handleIdentify = async () => {
    if (!selected.size) {
      setError('Select at least one element type.');
      return;
    }
    setBusy(true);
    setError(null);
    setResult(null);
    try {
      // Get current page dimensions
      const { renderPage } = await import('../utils/pdfRenderer');
      const tmp = document.createElement('canvas');
      const { width, height } = await renderPage(currentPage, tmp, 1);

      const detections = await identifyElementsOnPage(
        currentPage,
        width,
        height,
        Array.from(selected),
        { useAi },
      );
      setDetectedElements(detections);
      setHoverPredictionEnabled(true);
      setResult(summarizeDetections(detections));
    } catch (err: any) {
      setError(err?.message || 'Detection failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center" onClick={onClose}>
      <div
        className="bg-bb-sidebar border border-bb-border rounded-lg shadow-2xl w-[640px] max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-4 py-3 border-b border-bb-border">
          <div className="flex items-center gap-2">
            <ScanSearch size={18} className="text-bb-blue" />
            <span className="text-sm font-semibold text-bb-text">Identify Elements (BIM)</span>
          </div>
          <button onClick={onClose} className="p-1 hover:bg-bb-hover rounded text-bb-muted">
            <X size={16} />
          </button>
        </div>

        <div className="px-4 py-4 space-y-4 overflow-y-auto">
          <p className="text-xs text-bb-muted">
            Select what to identify on the current page. Detected regions will be shown as
            interactive overlays — hover to preview, click to convert into an area measurement.
          </p>

          {/* Categories */}
          <div className="grid grid-cols-2 gap-2">
            {ELEMENT_CATEGORIES.map((cat) => {
              const on = selected.has(cat.id);
              return (
                <button
                  key={cat.id}
                  onClick={() => toggle(cat.id)}
                  className={`flex items-start gap-2 px-3 py-2 rounded border text-left transition-colors ${
                    on
                      ? 'bg-bb-blue/15 border-bb-blue text-bb-text'
                      : 'bg-bb-dark border-bb-border text-bb-muted hover:text-bb-text hover:border-bb-border/80'
                  }`}
                >
                  <span
                    className="w-3 h-3 rounded-sm mt-0.5 shrink-0"
                    style={{ backgroundColor: cat.color }}
                  />
                  <div className="flex-1">
                    <div className="text-xs font-medium">{cat.label}</div>
                    <div className="text-[10px] text-bb-muted leading-tight">{cat.description}</div>
                  </div>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-xs">
            <div className="flex gap-2">
              <button onClick={selectAll} className="text-bb-blue hover:underline">Select all</button>
              <span className="text-bb-muted">·</span>
              <button onClick={clearAll} className="text-bb-blue hover:underline">Clear</button>
            </div>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={useAi}
                onChange={(e) => setUseAi(e.target.checked)}
              />
              <Sparkles size={12} className="text-amber-300" />
              Use AI (Gemini Vision)
            </label>
          </div>

          {/* Hover prediction toggle */}
          <label className="flex items-start gap-3 p-3 rounded border border-bb-border cursor-pointer">
            <input
              type="checkbox"
              checked={hoverPredictionEnabled}
              onChange={(e) => setHoverPredictionEnabled(e.target.checked)}
              className="mt-0.5"
            />
            <div className="flex-1">
              <div className="text-xs font-medium text-bb-text flex items-center gap-1.5">
                <MousePointerClick size={12} />
                Interactive prediction UI
              </div>
              <div className="text-[10px] text-bb-muted leading-tight">
                When on, hover over the page to preview detected regions; click any region to drop
                an area-measurement polygon around it.
              </div>
            </div>
          </label>

          {error && (
            <div className="bg-red-500/10 border border-red-500/30 rounded px-3 py-2 text-xs text-red-300">
              {error}
            </div>
          )}
          {result && (
            <div className="bg-green-500/10 border border-green-500/30 rounded px-3 py-2 text-xs text-green-300 whitespace-pre-line">
              {result}
            </div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-4 py-3 border-t border-bb-border">
          <button
            onClick={onClose}
            disabled={busy}
            className="px-4 py-1.5 text-xs text-bb-muted hover:text-bb-text hover:bg-bb-hover rounded transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleIdentify}
            disabled={busy || !selected.size}
            className="flex items-center gap-1.5 px-4 py-1.5 bg-bb-blue hover:bg-blue-600 disabled:opacity-50 rounded text-white text-xs font-medium transition-colors"
          >
            {busy ? <Loader2 size={13} className="animate-spin" /> : <ScanSearch size={13} />}
            {busy ? 'Identifying...' : 'Identify on this page'}
          </button>
        </div>
      </div>
    </div>
  );
}
