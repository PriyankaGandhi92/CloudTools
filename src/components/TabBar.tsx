import React, { useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { X, FileText, Plus, PanelRight, Star, FilePlus } from 'lucide-react';
import { loadPdf, getPageCount } from '../utils/pdfRenderer';

interface TabBarProps {
  onNewPdfClick?: () => void;
}

export default function TabBar({ onNewPdfClick }: TabBarProps = {}) {
  const {
    tabs, activeTabId, switchToTab, removeTab, currentDocument, pdfData,
    openPdfInNewTab, splitView, setSplitView, splitTabId, setSplitTabId,
  } = useStore();
  const fileRef = useRef<HTMLInputElement>(null);
  const [ctxMenu, setCtxMenu] = useState<{ x: number; y: number; tabId: string } | null>(null);

  const handleOpenFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;
    const buffer = await file.arrayBuffer();
    const doc = await loadPdf(buffer);
    openPdfInNewTab(file.name, buffer, doc.numPages);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleTabContextMenu = (e: React.MouseEvent, tabId: string) => {
    e.preventDefault();
    setCtxMenu({ x: e.clientX, y: e.clientY, tabId });
  };

  const handleSplitRight = (tabId: string) => {
    setSplitTabId(tabId);
    setSplitView(true);
    setCtxMenu(null);
  };

  const handleCloseSplit = () => {
    setSplitView(false);
    setSplitTabId(null);
  };

  // Close context menu on click outside
  React.useEffect(() => {
    if (!ctxMenu) return;
    const handler = () => setCtxMenu(null);
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [ctxMenu]);

  // Show nothing if no tabs and no document
  if (tabs.length === 0 && !currentDocument) return null;

  return (
    <>
      <input ref={fileRef} type="file" accept=".pdf" onChange={handleOpenFile} className="hidden" />
      <div className="h-8 bg-bb-sidebar border-b border-bb-border flex items-center gap-0 overflow-x-auto shrink-0">
        {/* Render all tabs */}
        {tabs.map((tab) => {
          const isActive = activeTabId === tab.id;
          const isSplit = splitTabId === tab.id;
          const isWelcome = tab.isWelcome;
          return (
            <div
              key={tab.id}
              className={`h-full flex items-center border-r border-bb-border shrink-0 ${
                isActive
                  ? 'bg-bb-dark border-b-2 border-b-bb-blue'
                  : isSplit
                  ? 'bg-bb-dark/50 border-b-2 border-b-green-500'
                  : 'hover:bg-bb-hover'
              }`}
              onContextMenu={(e) => handleTabContextMenu(e, tab.id)}
            >
              <button
                onClick={() => {
                  if (!isActive) switchToTab(tab.id);
                }}
                className={`h-full px-3 flex items-center gap-1.5 text-xs transition-colors ${
                  isActive ? 'text-bb-text' : 'text-bb-muted hover:text-bb-text'
                }`}
              >
                {isWelcome ? <Star size={11} className="text-yellow-400" /> : <FileText size={11} />}
                <span className="truncate max-w-[120px]">{tab.name}</span>
                {isSplit && <PanelRight size={9} className="text-green-400" />}
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (isSplit) handleCloseSplit();
                  removeTab(tab.id);
                }}
                className="pr-2 text-bb-muted hover:text-red-400 transition-colors"
              >
                <X size={11} />
              </button>
            </div>
          );
        })}

        {/* If we have a document but no tabs yet, show it as the first tab label */}
        {tabs.length === 0 && currentDocument && (
          <div className="h-full flex items-center border-r border-bb-border shrink-0 bg-bb-dark border-b-2 border-b-bb-blue">
            <button className="h-full px-3 flex items-center gap-1.5 text-xs text-bb-text">
              <FileText size={11} />
              <span className="truncate max-w-[120px]">{currentDocument.name}</span>
            </button>
            <button
              onClick={(e) => {
                e.stopPropagation();
                removeTab('main');
              }}
              className="pr-2 text-bb-muted hover:text-red-400 transition-colors"
              title="Close"
            >
              <X size={11} />
            </button>
          </div>
        )}

        {/* + button to open new PDF in tab */}
        <button
          onClick={() => fileRef.current?.click()}
          className="h-full px-2 flex items-center text-bb-muted hover:text-bb-text hover:bg-bb-hover transition-colors shrink-0"
          title="Open PDF in new tab"
        >
          <Plus size={14} />
        </button>

        {/* New blank PDF button */}
        {onNewPdfClick && (
          <button
            onClick={onNewPdfClick}
            className="h-full px-2 flex items-center text-bb-muted hover:text-bb-text hover:bg-bb-hover transition-colors shrink-0"
            title="Create new blank PDF"
          >
            <FilePlus size={14} />
          </button>
        )}

        {/* Show split indicator */}
        {splitView && splitTabId && (
          <div className="ml-auto flex items-center gap-1 px-2 text-[10px] text-green-400 shrink-0">
            <PanelRight size={11} />
            <span>Split</span>
            <button
              onClick={handleCloseSplit}
              className="hover:text-red-400 transition-colors"
              title="Close split view"
            >
              <X size={10} />
            </button>
          </div>
        )}
      </div>

      {/* Tab context menu */}
      {ctxMenu && (
        <div
          className="fixed bg-bb-panel border border-bb-border rounded-lg shadow-xl py-1 z-50 min-w-[140px]"
          style={{ left: ctxMenu.x, top: ctxMenu.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            onClick={() => handleSplitRight(ctxMenu.tabId)}
            className="w-full text-left px-3 py-1.5 text-xs text-bb-text hover:bg-bb-hover flex items-center gap-2"
          >
            <PanelRight size={12} />
            Open in Split View
          </button>
          <button
            onClick={() => {
              if (splitTabId === ctxMenu.tabId) handleCloseSplit();
              removeTab(ctxMenu.tabId);
              setCtxMenu(null);
            }}
            className="w-full text-left px-3 py-1.5 text-xs text-red-400 hover:bg-bb-hover flex items-center gap-2"
          >
            <X size={12} />
            Close Tab
          </button>
        </div>
      )}
    </>
  );
}
