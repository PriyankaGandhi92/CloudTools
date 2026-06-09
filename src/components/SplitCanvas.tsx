import React, { useState, useEffect } from 'react';
import { useStore } from '../store/useStore';
import MainCanvas from './MainCanvas';
import BimViewer from './BimViewer';
import { Box, Layers } from 'lucide-react';

/**
 * SplitCanvas wraps MainCanvas with its own page navigation.
 * It shares the same annotation store so annotations are visible and editable on both sides.
 * When BIM view is enabled, it splits between 2D PDF and 3D BIM model.
 */
export default function SplitCanvas() {
  const { pageCount, currentDocument } = useStore();
  const label = currentDocument?.name ?? 'PDF';
  const [page, setPage] = useState(0);
  const [showBimView, setShowBimView] = useState(false);

  // Clamp page if pageCount shrinks
  useEffect(() => {
    if (page >= pageCount && pageCount > 0) setPage(pageCount - 1);
  }, [pageCount]);

  const handlePrevPage = () => setPage((p) => Math.max(0, p - 1));
  const handleNextPage = () => setPage((p) => Math.min(pageCount - 1, p + 1));

  const hasBimFile = !!currentDocument?.bimFileUrl;

  if (showBimView && hasBimFile) {
    // Split view: 2D PDF on left, 3D BIM on right
    return (
      <div className="flex-1 overflow-hidden bg-neutral-800 relative flex">
        {/* Left: 2D PDF */}
        <div className="flex-1 flex flex-col border-r border-bb-border">
          <div className="h-7 bg-bb-panel border-b border-bb-border flex items-center justify-between shrink-0 px-2">
            <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider truncate max-w-[120px]">
              {label}
            </span>
            <div className="flex items-center gap-1">
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
          <MainCanvas pageOverride={page} onPageChange={setPage} />
        </div>

        {/* Right: 3D BIM */}
        <div className="flex-1 flex flex-col">
          <div className="h-7 bg-bb-panel border-b border-bb-border flex items-center justify-between shrink-0 px-2">
            <span className="text-[10px] text-purple-400 font-semibold uppercase tracking-wider flex items-center gap-1">
              <Layers size={12} /> 3D BIM
            </span>
            <button
              onClick={() => setShowBimView(false)}
              className="px-1.5 py-0.5 text-[10px] bg-bb-hover rounded text-bb-text hover:text-bb-blue"
              title="Close 3D view"
            >
              <Box size={12} />
            </button>
          </div>
          <BimViewer ifcUrl={currentDocument?.bimFileUrl} />
        </div>
      </div>
    );
  }

  // Standard single view with optional BIM toggle
  return (
    <div className="flex-1 overflow-hidden bg-neutral-800 relative flex flex-col">
      {/* Mini toolbar for split-side page navigation */}
      <div className="h-7 bg-bb-panel border-b border-bb-border flex items-center justify-between shrink-0 px-2">
        <span className="text-[10px] text-green-400 font-semibold uppercase tracking-wider truncate max-w-[120px]">
          {label}
        </span>
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1">
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
          {hasBimFile && (
            <button
              onClick={() => setShowBimView(true)}
              className="px-2 py-0.5 text-[10px] bg-purple-600/20 text-purple-400 rounded hover:bg-purple-600/30 flex items-center gap-1"
              title="Open 3D BIM view"
            >
              <Layers size={10} /> 3D
            </button>
          )}
        </div>
      </div>

      {/* Full interactive MainCanvas operating on the split page */}
      <MainCanvas pageOverride={page} onPageChange={setPage} />
    </div>
  );
}
