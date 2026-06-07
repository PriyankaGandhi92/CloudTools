import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import { extractAllText } from '../utils/pdfSummarize';
import { callGeminiSummarize } from '../utils/firebaseAi';
import { FileText, Loader2, Copy, Check } from 'lucide-react';

export default function AiSummaryDialog({ onClose }: { onClose: () => void }) {
  const { pageCount, currentDocument } = useStore();

  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState('');
  const [error, setError] = useState('');
  const [summary, setSummary] = useState('');
  const [copied, setCopied] = useState(false);

  const handleSummarize = async () => {
    setError('');
    setSummary('');
    setLoading(true);

    try {
      setStatus('Extracting text from PDF...');
      const text = await extractAllText(pageCount, (page, total) => {
        setStatus(`Extracting text — page ${page} of ${total}...`);
      });

      if (!text.trim()) {
        setError('No text could be extracted from this PDF. It may be a scanned document — try OCR first.');
        setLoading(false);
        return;
      }

      setStatus('Sending to Gemini AI for summarization...');
      const result = await callGeminiSummarize({
        text,
        documentName: currentDocument?.name || 'Document',
      });
      setSummary(result.summary);
      setStatus('');
    } catch (err: any) {
      setError(err.message || 'Failed to summarize');
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(summary);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bb-sidebar rounded-lg border border-bb-border p-6 w-[560px] max-h-[80vh] flex flex-col shadow-2xl">
        <div className="flex items-center gap-2 mb-4">
          <FileText size={18} className="text-blue-400" />
          <h3 className="text-sm font-semibold">AI PDF Summary</h3>
          <span className="text-[10px] text-bb-muted ml-auto">
            {currentDocument?.name || 'Document'} · {pageCount} page{pageCount !== 1 ? 's' : ''}
          </span>
        </div>

        {!summary && (
          <div className="space-y-3">
            <div className="text-[11px] text-bb-muted leading-relaxed">
              This will extract all text from every page and use Gemini AI to produce a
              structured summary with key points, section details, and action items.
            </div>

            {status && (
              <div className="flex items-center gap-2 text-xs text-blue-300">
                <Loader2 size={12} className="animate-spin" />
                {status}
              </div>
            )}

            {error && (
              <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5">
                {error}
              </div>
            )}
          </div>
        )}

        {summary && (
          <div className="flex-1 overflow-hidden flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs text-green-400 font-medium">Summary generated</span>
              <button
                onClick={handleCopy}
                className="flex items-center gap-1 text-[11px] text-bb-muted hover:text-bb-text transition-colors"
              >
                {copied ? <Check size={11} className="text-green-400" /> : <Copy size={11} />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <div className="flex-1 overflow-auto bg-bb-dark border border-bb-border rounded p-3 text-xs text-bb-text leading-relaxed prose prose-invert prose-xs max-w-none">
              <SummaryMarkdown text={summary} />
            </div>
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4 shrink-0">
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
          >
            Close
          </button>
          {!summary && (
            <button
              onClick={handleSummarize}
              disabled={loading}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors disabled:opacity-50 flex items-center gap-1.5"
            >
              {loading ? <Loader2 size={12} className="animate-spin" /> : <FileText size={12} />}
              {loading ? 'Summarizing...' : 'Summarize PDF'}
            </button>
          )}
          {summary && (
            <button
              onClick={() => { setSummary(''); setError(''); }}
              className="px-4 py-1.5 text-xs bg-blue-600 hover:bg-blue-700 text-white rounded transition-colors flex items-center gap-1.5"
            >
              <FileText size={12} />
              Re-summarize
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Simple markdown renderer for the summary output */
function SummaryMarkdown({ text }: { text: string }) {
  const lines = text.split('\n');
  const elements: React.ReactNode[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith('### ')) {
      elements.push(<h4 key={i} className="font-semibold text-xs text-blue-300 mt-3 mb-1">{parseBold(line.slice(4))}</h4>);
    } else if (line.startsWith('## ')) {
      elements.push(<h3 key={i} className="font-semibold text-sm text-blue-300 mt-3 mb-1">{parseBold(line.slice(3))}</h3>);
    } else if (line.startsWith('# ')) {
      elements.push(<h2 key={i} className="font-bold text-sm text-blue-200 mt-2 mb-1">{parseBold(line.slice(2))}</h2>);
    } else if (line.match(/^\s*[-*]\s/)) {
      const content = line.replace(/^\s*[-*]\s/, '');
      elements.push(
        <div key={i} className="flex gap-1.5 ml-2 my-0.5">
          <span className="text-blue-400 shrink-0">•</span>
          <span>{parseBold(content)}</span>
        </div>,
      );
    } else if (line.trim() === '') {
      elements.push(<div key={i} className="h-2" />);
    } else {
      elements.push(<p key={i} className="my-0.5">{parseBold(line)}</p>);
    }
  }

  return <>{elements}</>;
}

function parseBold(text: string): React.ReactNode {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('**') && part.endsWith('**')) {
      return <strong key={i} className="text-bb-text font-semibold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}
