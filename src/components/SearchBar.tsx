import React, { useState, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { ocrAllPages, searchOcrResults, cancelOcr, type OcrResult, type SearchMatch } from '../utils/ocr';
import { Search, X, Loader2, ChevronDown, ChevronUp, ScanText } from 'lucide-react';

export default function SearchBar() {
  const { pageCount, setCurrentPage, pdfData } = useStore();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [ocrResults, setOcrResults] = useState<OcrResult[]>([]);
  const [matches, setMatches] = useState<SearchMatch[]>([]);
  const [currentMatch, setCurrentMatch] = useState(0);
  const [ocrProgress, setOcrProgress] = useState<string | null>(null);
  const [ocrDone, setOcrDone] = useState(false);

  const runOcr = useCallback(async () => {
    if (!pdfData || pageCount === 0) return;
    setOcrProgress('Scanning page 1...');
    setOcrDone(false);
    try {
      const results = await ocrAllPages(pageCount, (page, total) => {
        setOcrProgress(`Scanning page ${page + 1} of ${total}...`);
      });
      setOcrResults(results);
      setOcrDone(true);
      setOcrProgress(null);
    } catch {
      setOcrProgress('OCR failed.');
    }
  }, [pdfData, pageCount]);

  const handleSearch = useCallback(
    (q: string) => {
      setQuery(q);
      if (!q.trim() || ocrResults.length === 0) {
        setMatches([]);
        setCurrentMatch(0);
        return;
      }
      const m = searchOcrResults(ocrResults, q);
      setMatches(m);
      setCurrentMatch(0);
      if (m.length > 0) setCurrentPage(m[0].pageIndex);
    },
    [ocrResults, setCurrentPage]
  );

  const goToMatch = (idx: number) => {
    if (idx < 0 || idx >= matches.length) return;
    setCurrentMatch(idx);
    setCurrentPage(matches[idx].pageIndex);
  };

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors"
        title="Search / OCR"
      >
        <Search size={15} />
      </button>
    );
  }

  return (
    <div className="flex items-center gap-1.5 bg-bb-panel border border-bb-border rounded-lg px-2 py-1">
      <Search size={13} className="text-bb-muted shrink-0" />
      <input
        type="text"
        value={query}
        onChange={(e) => handleSearch(e.target.value)}
        placeholder={ocrDone ? 'Search text...' : 'Run OCR first...'}
        disabled={!ocrDone}
        className="bg-transparent text-xs text-bb-text outline-none w-32 placeholder:text-bb-muted/50"
        autoFocus
      />

      {matches.length > 0 && (
        <span className="text-[10px] text-bb-muted whitespace-nowrap">
          {currentMatch + 1}/{matches.length}
        </span>
      )}

      {matches.length > 0 && (
        <>
          <button onClick={() => goToMatch(currentMatch - 1)} disabled={currentMatch === 0} className="p-0.5 hover:bg-bb-hover rounded text-bb-muted disabled:opacity-30">
            <ChevronUp size={12} />
          </button>
          <button onClick={() => goToMatch(currentMatch + 1)} disabled={currentMatch >= matches.length - 1} className="p-0.5 hover:bg-bb-hover rounded text-bb-muted disabled:opacity-30">
            <ChevronDown size={12} />
          </button>
        </>
      )}

      {!ocrDone && (
        <button
          onClick={runOcr}
          disabled={!!ocrProgress}
          className="flex items-center gap-1 px-1.5 py-0.5 text-[10px] bg-bb-blue/20 text-bb-blue rounded hover:bg-bb-blue/30 disabled:opacity-60"
          title="Run OCR on all pages"
        >
          {ocrProgress ? <Loader2 size={10} className="animate-spin" /> : <ScanText size={10} />}
          {ocrProgress ? 'Scanning...' : 'OCR'}
        </button>
      )}

      {ocrProgress && (
        <span className="text-[9px] text-bb-muted whitespace-nowrap">{ocrProgress}</span>
      )}

      <button onClick={() => { setOpen(false); setQuery(''); setMatches([]); cancelOcr(); }} className="p-0.5 hover:bg-bb-hover rounded text-bb-muted">
        <X size={12} />
      </button>
    </div>
  );
}
