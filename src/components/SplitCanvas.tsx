import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import MainCanvas from './MainCanvas';

/**
 * SplitCanvas wraps MainCanvas with its own page navigation.
 * It shares the same annotation store so annotations are visible and editable on both sides.
 */
export default function SplitCanvas() {
  const { pageCount, currentDocument } = useStore();
  const label = currentDocument?.name ?? 'PDF';
  const [page, setPage] = useState(0);

  // Clamp page if pageCount shrinks
  useEffect(() => {
    if (page >= pageCount && pageCount > 0) setPage(pageCount - 1);
  }, [pageCount]);

  const handlePrevPage = () => setPage((p) => Math.max(0, p - 1));
  const handleNextPage = () => setPage((p) => Math.min(pageCount - 1, p + 1));

  return (
    <div className="flex-1 overflow-hidden bg-neutral-800 relative flex flex-col">
      {/* Mini toolbar for split-side page navigation */}
      <div className="h-7 bg-bb-panel border-b border-bb-border flex items-center justify-center gap-2 shrink-0 px-2">
        <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider truncate max-w-[120px]">
          {label}
        </span>
        <div className="flex items-center gap-1 ml-2">
          <button
            onClick={handlePrevPage}
            disabled={page === 0}
            className="px-1.5 py-0.5 text-[10px] bg-bb-hover rounded text-bb-text disabled:opacity-30"
          >
            ←
          </button>
          <span className="text-[10px] text-bb-muted">
            {page + 1} / {pageCount}
          </span>
          <button
            onClick={handleNextPage}
            disabled={page >= pageCount - 1}
            className="px-1.5 py-0.5 text-[10px] bg-bb-hover rounded text-bb-text disabled:opacity-30"
          >
            →
          </button>
        </div>
      </div>

      {/* Full interactive MainCanvas operating on the split page */}
      <MainCanvas pageOverride={page} onPageChange={setPage} />
    </div>
  );
}
