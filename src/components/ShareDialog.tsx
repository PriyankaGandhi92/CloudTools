import React, { useState, useRef, useEffect } from 'react';
import { Share2, Copy, Check, Loader2, Link2 } from 'lucide-react';

interface ShareDialogProps {
  onClose: () => void;
  shareUrl: string;
  uploading: boolean;
  error?: string;
}

export default function ShareDialog({ onClose, shareUrl, uploading, error }: ShareDialogProps) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (shareUrl && inputRef.current) {
      inputRef.current.select();
    }
  }, [shareUrl]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 3000);
    } catch {
      // Fallback: select the input so user can Ctrl+C
      inputRef.current?.select();
    }
  };

  return (
    <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-50 p-4">
      <div className="bg-bb-sidebar rounded-xl border border-bb-border shadow-2xl w-full max-w-md">
        {/* Header */}
        <div className="px-5 py-3 border-b border-bb-border flex items-center gap-2">
          <Share2 size={16} className="text-bb-blue" />
          <h2 className="text-sm font-bold">Share Document</h2>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4">
          {uploading && (
            <div className="flex items-center gap-3 text-sm text-blue-300">
              <Loader2 size={16} className="animate-spin" />
              Uploading PDF for sharing...
            </div>
          )}

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-3 py-2">
              {error}
            </div>
          )}

          {shareUrl && !uploading && (
            <>
              <div className="text-[11px] text-bb-muted leading-relaxed">
                Anyone with this link can open the PDF and collaborate with you in real-time.
                All annotations and markups sync live.
              </div>

              <div className="flex gap-2">
                <div className="flex-1 relative">
                  <Link2 size={13} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-bb-muted" />
                  <input
                    ref={inputRef}
                    readOnly
                    value={shareUrl}
                    onClick={(e) => (e.target as HTMLInputElement).select()}
                    className="w-full bg-bb-dark border border-bb-border rounded-lg pl-8 pr-3 py-2.5 text-xs text-bb-text outline-none focus:border-bb-blue font-mono select-all cursor-text"
                  />
                </div>
                <button
                  onClick={handleCopy}
                  className={`px-3 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all shrink-0 ${
                    copied
                      ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                      : 'bg-bb-blue hover:bg-blue-600 text-white'
                  }`}
                >
                  {copied ? <Check size={13} /> : <Copy size={13} />}
                  {copied ? 'Copied!' : 'Copy'}
                </button>
              </div>

              <div className="text-[10px] text-bb-muted bg-bb-dark rounded-lg border border-bb-border px-3 py-2 space-y-1">
                <p><strong>How it works:</strong></p>
                <p>1. Copy the link and send it to your collaborator</p>
                <p>2. They open the link in their browser (must be signed in)</p>
                <p>3. The same PDF loads with all your annotations — edits sync in real-time</p>
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3 border-t border-bb-border flex justify-end">
          <button
            onClick={onClose}
            className="px-4 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
          >
            {uploading ? 'Cancel' : 'Done'}
          </button>
        </div>
      </div>
    </div>
  );
}
