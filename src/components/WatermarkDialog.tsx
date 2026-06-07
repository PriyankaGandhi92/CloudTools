import React, { useState } from 'react';
import { X, Plus, Trash2 } from 'lucide-react';

interface Watermark {
  id: string;
  type: 'watermark' | 'header' | 'footer';
  text: string;
  pages: 'all' | 'current' | 'custom';
  customPages?: number[];
  position: 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'diagonal';
  opacity: number;
  fontSize: number;
  fontFamily: string;
  color: string;
}

interface WatermarkDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (watermarks: Watermark[]) => void;
  pageCount: number;
  currentPage: number;
  existingWatermarks?: Watermark[];
}

const COMMON_WATERMARKS = [
  'NOT FOR CONSTRUCTION',
  'APPROVED',
  'WORK IN PROGRESS',
  'DRAFT',
  'CONFIDENTIAL',
  'REVIEW',
  'PRELIMINARY',
  'FINAL',
];

export default function WatermarkDialog({
  isOpen,
  onClose,
  onSave,
  pageCount,
  currentPage,
  existingWatermarks = [],
}: WatermarkDialogProps) {
  const [watermarks, setWatermarks] = useState<Watermark[]>(existingWatermarks);
  const [selectedPreset, setSelectedPreset] = useState<string>('');
  const [customPages, setCustomPages] = useState<string>('');

  const addWatermark = () => {
    const newWatermark: Watermark = {
      id: crypto.randomUUID(),
      type: 'watermark',
      text: selectedPreset || 'WATERMARK',
      pages: 'all',
      position: 'diagonal',
      opacity: 0.3,
      fontSize: 48,
      fontFamily: 'Arial',
      color: '#ff0000',
    };
    setWatermarks([...watermarks, newWatermark]);
    setSelectedPreset('');
  };

  const removeWatermark = (id: string) => {
    setWatermarks(watermarks.filter((w) => w.id !== id));
  };

  const updateWatermark = (id: string, updates: Partial<Watermark>) => {
    setWatermarks(watermarks.map((w) => (w.id === id ? { ...w, ...updates } : w)));
  };

  const handleSave = () => {
    onSave(watermarks);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bb-sidebar border border-bb-border rounded-lg shadow-2xl w-[600px] max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-bb-border">
          <h2 className="text-sm font-semibold text-bb-text">Watermarks</h2>
          <button onClick={onClose} className="p-1 hover:bg-bb-hover rounded text-bb-muted">
            <X size={16} />
          </button>
        </div>

        {/* Body */}
        <div className="p-4 space-y-4">
          {/* Preset Watermarks */}
          <div>
            <label className="block text-xs text-bb-muted mb-2">Quick Add Common Watermark</label>
            <div className="flex gap-2">
              <select
                value={selectedPreset}
                onChange={(e) => setSelectedPreset(e.target.value)}
                className="flex-1 bg-bb-dark border border-bb-border rounded px-3 py-2 text-xs text-bb-text outline-none focus:border-bb-blue"
              >
                <option value="">Select preset...</option>
                {COMMON_WATERMARKS.map((w) => (
                  <option key={w} value={w}>{w}</option>
                ))}
              </select>
              <button
                onClick={addWatermark}
                disabled={!selectedPreset}
                className="px-3 py-2 bg-bb-blue hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed rounded text-white text-xs font-medium transition-colors"
              >
                <Plus size={14} className="inline mr-1" />
                Add
              </button>
            </div>
          </div>

          {/* Watermarks List */}
          <div className="space-y-3">
            {watermarks.length === 0 && (
              <p className="text-xs text-bb-muted text-center py-4">No watermarks added yet</p>
            )}
            {watermarks.map((w) => (
              <div key={w.id} className="bg-bb-panel border border-bb-border rounded p-3 space-y-3">
                <div className="flex items-center justify-between">
                  <input
                    type="text"
                    value={w.text}
                    onChange={(e) => updateWatermark(w.id, { text: e.target.value })}
                    className="flex-1 bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
                    placeholder="Watermark text"
                  />
                  <button
                    onClick={() => removeWatermark(w.id)}
                    className="p-1 hover:bg-bb-hover rounded text-red-400 ml-2"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  {/* Pages */}
                  <div>
                    <label className="block text-[10px] text-bb-muted mb-1">Pages</label>
                    <select
                      value={w.pages}
                      onChange={(e) => updateWatermark(w.id, { pages: e.target.value as any })}
                      className="w-full bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
                    >
                      <option value="all">All Pages</option>
                      <option value="current">Current Page Only</option>
                      <option value="custom">Custom Pages</option>
                    </select>
                  </div>

                  {/* Position */}
                  <div>
                    <label className="block text-[10px] text-bb-muted mb-1">Position</label>
                    <select
                      value={w.position}
                      onChange={(e) => updateWatermark(w.id, { position: e.target.value as any })}
                      className="w-full bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
                    >
                      <option value="diagonal">Diagonal (Center)</option>
                      <option value="center">Center</option>
                      <option value="top-left">Top Left</option>
                      <option value="top-right">Top Right</option>
                      <option value="bottom-left">Bottom Left</option>
                      <option value="bottom-right">Bottom Right</option>
                    </select>
                  </div>

                  {/* Opacity */}
                  <div>
                    <label className="block text-[10px] text-bb-muted mb-1">Opacity: {Math.round(w.opacity * 100)}%</label>
                    <input
                      type="range"
                      min="0.1"
                      max="1"
                      step="0.1"
                      value={w.opacity}
                      onChange={(e) => updateWatermark(w.id, { opacity: Number(e.target.value) })}
                      className="w-full h-1 accent-bb-blue"
                    />
                  </div>

                  {/* Font Size */}
                  <div>
                    <label className="block text-[10px] text-bb-muted mb-1">Font Size: {w.fontSize}px</label>
                    <input
                      type="range"
                      min="12"
                      max="96"
                      step="4"
                      value={w.fontSize}
                      onChange={(e) => updateWatermark(w.id, { fontSize: Number(e.target.value) })}
                      className="w-full h-1 accent-bb-blue"
                    />
                  </div>

                  {/* Font Family */}
                  <div>
                    <label className="block text-[10px] text-bb-muted mb-1">Font</label>
                    <select
                      value={w.fontFamily}
                      onChange={(e) => updateWatermark(w.id, { fontFamily: e.target.value })}
                      className="w-full bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
                    >
                      <option value="Arial">Arial</option>
                      <option value="Helvetica">Helvetica</option>
                      <option value="Times New Roman">Times New Roman</option>
                      <option value="Courier New">Courier New</option>
                      <option value="Calibri">Calibri</option>
                      <option value="Verdana">Verdana</option>
                      <option value="Roboto">Roboto</option>
                      <option value="Open Sans">Open Sans</option>
                      <option value="Lato">Lato</option>
                      <option value="Inter">Inter</option>
                      <option value="JetBrains Mono">JetBrains Mono</option>
                    </select>
                  </div>

                  {/* Color */}
                  <div>
                    <label className="block text-[10px] text-bb-muted mb-1">Color</label>
                    <input
                      type="color"
                      value={w.color}
                      onChange={(e) => updateWatermark(w.id, { color: e.target.value })}
                      className="w-full h-8 rounded cursor-pointer border-0 bg-transparent"
                    />
                  </div>
                </div>

                {/* Custom Pages Input */}
                {w.pages === 'custom' && (
                  <div>
                    <label className="block text-[10px] text-bb-muted mb-1">
                      Page Numbers (comma-separated, e.g., 1,3,5-7)
                    </label>
                    <input
                      type="text"
                      value={w.customPages?.join(',') || ''}
                      onChange={(e) => {
                        const pages = e.target.value.split(',').map((p) => {
                          const range = p.trim().split('-');
                          if (range.length === 2) {
                            const start = parseInt(range[0]);
                            const end = parseInt(range[1]);
                            if (!isNaN(start) && !isNaN(end)) {
                              return Array.from({ length: end - start + 1 }, (_, i) => start + i);
                            }
                          }
                          const num = parseInt(p.trim());
                          return isNaN(num) ? [] : [num];
                        }).flat();
                        updateWatermark(w.id, { customPages: pages });
                      }}
                      placeholder="1,3,5-7"
                      className="w-full bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
                    />
                  </div>
                )}
              </div>
            ))}
          </div>

          {/* Add Custom Watermark Button */}
          <button
            onClick={() => {
              const newWatermark: Watermark = {
                id: crypto.randomUUID(),
                type: 'watermark',
                text: 'CUSTOM',
                pages: 'all',
                position: 'diagonal',
                opacity: 0.3,
                fontSize: 48,
                fontFamily: 'Arial',
                color: '#ff0000',
              };
              setWatermarks([...watermarks, newWatermark]);
            }}
            className="w-full flex items-center justify-center gap-2 px-3 py-2 bg-bb-hover hover:bg-bb-blue text-xs rounded transition-colors border border-bb-border"
          >
            <Plus size={14} />
            Add Custom Watermark
          </button>
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
            onClick={handleSave}
            className="px-4 py-1.5 bg-bb-blue hover:bg-blue-600 rounded text-white text-xs font-medium transition-colors"
          >
            Apply Watermarks
          </button>
        </div>
      </div>
    </div>
  );
}
