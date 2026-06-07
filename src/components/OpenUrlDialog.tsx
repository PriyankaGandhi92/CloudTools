import React, { useState } from 'react';
import { Globe } from 'lucide-react';

// ── Component ────────────────────────────────────────────────────────

export default function OpenUrlDialog({ onClose }: { onClose: () => void }) {
  const [url, setUrl] = useState('');

  const handleOpen = () => {
    const trimmed = url.trim();
    if (!trimmed) return;
    const target = `${window.location.origin}?url=${encodeURIComponent(trimmed)}`;
    window.open(target, '_blank');
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && url.trim()) handleOpen();
    if (e.key === 'Escape') onClose();
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-bb-sidebar rounded-xl border border-bb-border shadow-2xl w-full max-w-lg">
        {/* Header */}
        <div className="px-5 py-3 border-b border-bb-border flex items-center gap-2">
          <Globe size={16} className="text-bb-blue" />
          <h2 className="text-sm font-bold">Open PDF from URL</h2>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          <div>
            <label className="text-[10px] text-bb-muted font-semibold uppercase tracking-wider block mb-1.5">
              PDF URL
            </label>
            <input
              autoFocus
              type="url"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              onKeyDown={handleKeyDown}
              onPaste={(e) => { e.stopPropagation(); }}
              placeholder="https://example.com/document.pdf"
              className="w-full bg-bb-dark border border-bb-border rounded-lg px-3 py-2 text-sm text-bb-text outline-none focus:border-bb-blue font-mono"
            />
          </div>

          <p className="text-[10px] text-bb-muted">Paste a direct link to a PDF file, then click Open.</p>
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-bb-border flex items-center gap-2 justify-end">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleOpen}
            disabled={!url.trim()}
            className="px-4 py-1.5 text-xs bg-bb-blue hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            <Globe size={12} />
            Open in New Tab
          </button>
        </div>
      </div>
    </div>
  );
}
