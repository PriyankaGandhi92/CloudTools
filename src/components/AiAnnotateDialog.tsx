import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { callGeminiAnnotate } from '../utils/firebaseAi';
import { Loader2, Sparkles } from 'lucide-react';

export default function AiAnnotateDialog({ onClose }: { onClose: () => void }) {
  const {
    currentPage,
    annotations,
    addAnnotation,
    pushUndo,
  } = useStore();

  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [resultCount, setResultCount] = useState<number | null>(null);

  // Estimate page size from rendered PDF (use a rough default)
  const pageWidth = 612; // standard US letter
  const pageHeight = 792;

  const handleRun = async () => {
    if (!prompt.trim()) { setError('Please describe what to fill in'); return; }

    setError('');
    setLoading(true);
    setResultCount(null);

    try {
      const result = await callGeminiAnnotate({
        prompt: prompt.trim(),
        pageWidth,
        pageHeight,
        imageBase64: '', // Will be populated by the function from PDF
      });

      // Parse the result to extract annotations
      const newAnns = JSON.parse(result.result || '[]');

      // Add annotations with proper layer order
      newAnns.forEach((ann: any, i: number) => {
        const finalAnn = { ...ann, layerOrder: annotations.length + i };
        addAnnotation(finalAnn);
        pushUndo({ type: 'add', annotation: finalAnn });
      });

      setResultCount(newAnns.length);
    } catch (err: any) {
      setError(err.message || 'Failed to annotate with AI');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bb-sidebar rounded-lg border border-bb-border p-6 w-[420px] shadow-2xl">
        <div className="flex items-center gap-2 mb-4">
          <Sparkles size={18} className="text-purple-400" />
          <h3 className="text-sm font-semibold">Annotate with AI</h3>
        </div>

        <div className="space-y-3">
          <div>
            <label className="text-xs text-bb-muted block mb-1">
              Instructions (what to fill in)
            </label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value.trim())}
              onPaste={(e) => e.stopPropagation()}
              onKeyDown={(e) => e.stopPropagation()}
              onKeyUp={(e) => e.stopPropagation()}
              placeholder={`e.g. Fill in the name as John Doe, address as 123 Main St, date as 04/19/2026...
or find every door/window/fire damper`}
              rows={4}
              className="w-full bg-bb-panel border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text outline-none focus:border-bb-blue resize-none"
            />
          </div>

          <div className="text-[11px] text-bb-muted">
            Current page: <span className="text-bb-text font-mono">{currentPage + 1}</span> — AI will analyze this page and place text annotations.
          </div>

          {error && (
            <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
              {error}
            </div>
          )}

          {resultCount !== null && (
            <div className="text-xs text-green-400 bg-green-500/10 border border-green-500/20 rounded px-2 py-1.5">
              Successfully placed {resultCount} annotation(s). You can move them to adjust positions.
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
          >
            Close
          </button>
          <button
            onClick={handleRun}
            disabled={loading}
            className="px-4 py-1.5 text-xs bg-purple-600 hover:bg-purple-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
          >
            {loading ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {loading ? 'Analyzing...' : 'Run AI'}
          </button>
        </div>
      </div>
    </div>
  );
}
