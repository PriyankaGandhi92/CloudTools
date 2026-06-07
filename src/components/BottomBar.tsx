import React, { useEffect, useRef } from 'react';
import { useStore } from '../store/useStore';
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Crosshair } from 'lucide-react';
import { getPageDimensions } from '../utils/pdfRenderer';
import HelpChatbox from './HelpChatbox';

export default function BottomBar() {
  const { currentPage, pageCount, setCurrentPage, zoom, setZoom, setPanOffset, pdfData, leftSidebarOpen, rightSidebarOpen } = useStore();
  const containerRef = useRef<HTMLDivElement>(null);

  const goFirst = () => setCurrentPage(0);
  const goPrev = () => setCurrentPage(Math.max(0, currentPage - 1));
  const goNext = () => setCurrentPage(Math.min(pageCount - 1, currentPage + 1));
  const goLast = () => setCurrentPage(pageCount - 1);

  const handleInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseInt(e.target.value, 10);
    if (!isNaN(val) && val >= 1 && val <= pageCount) {
      setCurrentPage(val - 1);
    }
  };

  const handleFitToScreen = async () => {
    if (!pdfData) return;
    const dims = await getPageDimensions(currentPage);
    if (!dims) return;

    // Get canvas container size (assuming parent container)
    const container = containerRef.current?.parentElement?.parentElement;
    if (!container) return;

    // Sidebar widths: left sidebar is 280px, right sidebar is 256px (w-64)
    const leftSidebarWidth = leftSidebarOpen ? 280 : 0;
    const rightSidebarWidth = rightSidebarOpen ? 256 : 0;

    const containerWidth = container.clientWidth - leftSidebarWidth - rightSidebarWidth - 40; // 20px padding on each side
    const containerHeight = container.clientHeight - 40; // account for header/bottombar

    // Calculate zoom to fit with 10% padding
    const zoomX = containerWidth / dims.width;
    const zoomY = containerHeight / dims.height;
    const newZoom = Math.min(zoomX, zoomY, 2); // Cap at 200%

    setZoom(newZoom);

    // Center the page within the available space (between sidebars)
    // The canvas origin is at the left edge of the screen, so we need to offset by left sidebar width
    const centeredX = leftSidebarWidth + 20 + (containerWidth - dims.width * newZoom) / 2;
    const centeredY = (containerHeight - dims.height * newZoom) / 2;
    setPanOffset({ x: centeredX, y: centeredY });
  };

  if (pageCount === 0) return null;

  return (
    <>
      <div ref={containerRef} className="h-8 bg-bb-sidebar border-t border-bb-border flex items-center justify-center gap-2 px-4 shrink-0">
        <button
          onClick={goFirst}
          disabled={currentPage === 0}
          className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text disabled:opacity-30 transition-colors"
          title="First Page"
        >
          <ChevronsLeft size={14} />
        </button>
        <button
          onClick={goPrev}
          disabled={currentPage === 0}
          className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text disabled:opacity-30 transition-colors"
          title="Previous Page"
        >
          <ChevronLeft size={14} />
        </button>

        <div className="flex items-center gap-1 text-xs text-bb-muted">
          <span>Page</span>
          <input
            type="number"
            min={1}
            max={pageCount}
            value={currentPage + 1}
            onChange={handleInput}
            className="w-10 bg-bb-panel border border-bb-border rounded px-1 py-0.5 text-xs text-bb-text text-center outline-none focus:border-bb-blue"
          />
          <span>of {pageCount}</span>
        </div>

        <button
          onClick={goNext}
          disabled={currentPage >= pageCount - 1}
          className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text disabled:opacity-30 transition-colors"
          title="Next Page"
        >
          <ChevronRight size={14} />
        </button>
        <button
          onClick={goLast}
          disabled={currentPage >= pageCount - 1}
          className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text disabled:opacity-30 transition-colors"
          title="Last Page"
        >
          <ChevronsRight size={14} />
        </button>

        <div className="w-px h-4 bg-bb-border mx-2" />

        <button
          onClick={handleFitToScreen}
          disabled={!pdfData}
          className="p-1 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text disabled:opacity-30 transition-colors"
          title="Fit to Screen"
        >
          <Crosshair size={14} />
        </button>

        <span className="text-[10px] text-bb-muted font-mono">
          {Math.round(zoom * 100)}%
        </span>
      </div>
      <HelpChatbox />
    </>
  );
}
