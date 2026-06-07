import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { ocrPage, ocrAllPages, cancelOcr } from '../utils/ocr';
import type { OcrResult } from '../utils/ocr';
import { embedOcrTextLayer } from '../utils/embedOcrText';
import { X, ScanSearch, Loader2, Copy, FileSearch, Check } from 'lucide-react';

export default function OcrDialog({ onClose }: { onClose: () => void }) {
  const { pageCount, currentPage, setCurrentPage, pdfData, setPdfData } = useStore();
  const [results, setResults] = useState<OcrResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const [embedded, setEmbedded] = useState(false);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [mode, setMode] = useState<'current' | 'all'>('current');

  const handleOcrCurrentPage = async () => {
    setLoading(true);
    setMode('current');
    setEmbedded(false);
    try {
      const result = await ocrPage(currentPage);
      setResults([result]);
    } catch (err) {
      console.error('OCR failed:', err);
    }
    setLoading(false);
  };

  const handleOcrAllPages = async () => {
    setLoading(true);
    setMode('all');
    setResults([]);
    setEmbedded(false);
    try {
      const allResults = await ocrAllPages(pageCount, (page, total) => {
        setProgress({ current: page + 1, total });
      });
      setResults(allResults);
    } catch (err) {
      console.error('OCR failed:', err);
    }
    setLoading(false);
  };

  const handleCancel = () => {
    cancelOcr();
    setLoading(false);
  };

  const copyAll = () => {
    const text = results.map((r) => `--- Page ${r.pageIndex + 1} ---\n${r.text}`).join('\n\n');
    navigator.clipboard.writeText(text);
  };

  // Embed OCR text into the PDF as an invisible layer → makes it searchable & selectable
  const handleMakeSearchable = async () => {
    if (!pdfData || results.length === 0) return;
    setEmbedding(true);
    try {
      const newPdf = await embedOcrTextLayer(pdfData, results, (page, total) => {
        setProgress({ current: page + 1, total });
      });
      setPdfData(newPdf);
      setEmbedded(true);
    } catch (err) {
      console.error('Embedding failed:', err);
    }
    setEmbedding(false);
  };

  return (
    <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4">
      <div className="bg-bb-panel border border-bb-border rounded-xl shadow-2xl w-full max-w-lg max-h-[80vh] flex flex-col">
        <div className="flex items-center justify-between px-4 py-3 border-b border-bb-border">
          <div className="flex items-center gap-2 text-sm font-semibold text-bb-text">
            <ScanSearch size={16} />
            OCR — Text Recognition
          </div>
          <button onClick={onClose} className="p-1 hover:bg-bb-hover rounded text-bb-muted">
            <X size={16} />
          </button>
        </div>

        <div className="p-4 space-y-3">
          <div className="flex gap-2">
            <button
              onClick={handleOcrCurrentPage}
              disabled={loading || embedding}
              className="flex-1 px-3 py-2 bg-bb-blue/20 hover:bg-bb-blue/30 text-bb-blue rounded text-xs font-medium transition-colors disabled:opacity-50"
            >
              {loading && mode === 'current' ? (
                <span className="flex items-center gap-1 justify-center"><Loader2 size={12} className="animate-spin" /> Processing...</span>
              ) : (
                `OCR Current Page (${currentPage + 1})`
              )}
            </button>
            <button
              onClick={handleOcrAllPages}
              disabled={loading || embedding}
              className="flex-1 px-3 py-2 bg-purple-600/20 hover:bg-purple-600/30 text-purple-300 rounded text-xs font-medium transition-colors disabled:opacity-50"
            >
              {loading && mode === 'all' ? (
                <span className="flex items-center gap-1 justify-center"><Loader2 size={12} className="animate-spin" /> {progress.current}/{progress.total}</span>
              ) : (
                `OCR All Pages (${pageCount})`
              )}
            </button>
          </div>

          {loading && (
            <button onClick={handleCancel} className="w-full px-3 py-1.5 bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded text-xs transition-colors">
              Cancel
            </button>
          )}

          {results.length > 0 && (
            <>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-bb-muted">{results.length} page(s) processed</span>
                <button onClick={copyAll} className="flex items-center gap-1 text-[11px] text-bb-muted hover:text-bb-text transition-colors">
                  <Copy size={11} /> Copy All
                </button>
              </div>

              {/* Make Searchable button */}
              <button
                onClick={handleMakeSearchable}
                disabled={embedding || embedded}
                className={`w-full px-3 py-2.5 rounded-lg text-xs font-medium flex items-center justify-center gap-2 transition-colors ${
                  embedded
                    ? 'bg-green-600/20 text-green-400 border border-green-500/30'
                    : 'bg-teal-600/20 hover:bg-teal-600/30 text-teal-300 border border-teal-500/20'
                }`}
              >
                {embedding ? (
                  <><Loader2 size={13} className="animate-spin" /> Embedding text layer...</>
                ) : embedded ? (
                  <><Check size={13} /> PDF is now searchable &amp; selectable!</>
                ) : (
                  <><FileSearch size={13} /> Make PDF Searchable (embed text layer)</>
                )}
              </button>
              {!embedded && !embedding && (
                <p className="text-[10px] text-bb-muted text-center">
                  Embeds invisible text into the PDF so you can use Find and select/copy text
                </p>
              )}
              {embedded && (
                <p className="text-[10px] text-teal-400/70 text-center">
                  Text layer embedded — Find (Ctrl+F) and text selection now work on OCR'd pages
                </p>
              )}
            </>
          )}
        </div>

        <div className="flex-1 overflow-y-auto px-4 pb-4 space-y-3">
          {results.map((r) => (
            <div key={r.pageIndex} className="border border-bb-border rounded-lg overflow-hidden">
              <div
                className="flex items-center justify-between px-3 py-1.5 bg-bb-sidebar cursor-pointer hover:bg-bb-hover transition-colors"
                onClick={() => { setCurrentPage(r.pageIndex); }}
              >
                <span className="text-xs font-medium">Page {r.pageIndex + 1}</span>
                <span className="text-[10px] text-bb-muted">Confidence: {r.confidence.toFixed(1)}%</span>
              </div>
              <pre className="p-2 text-[11px] text-bb-text whitespace-pre-wrap max-h-40 overflow-y-auto bg-bb-dark font-mono">
                {r.text || '(No text detected)'}
              </pre>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
