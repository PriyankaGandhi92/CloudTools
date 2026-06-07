import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { renderPageThumbnail, loadPdf, appendPdf, insertPdfAt, getPageCount, reorderRendererPage, insertBlankPage, extractPages, getPageOrder } from '../utils/pdfRenderer';
import { Upload, Trash2, GripVertical, Bookmark, BookmarkCheck, Search, Replace, ArrowDown, ArrowUp, Download, Edit, Image as ImageIcon, Calendar, User, Layers, ListChecks } from 'lucide-react';
import { getPageTextItems } from '../utils/pdfRenderer';
import { getOcrCache } from '../utils/ocr';
import BlankPageDialog from './BlankPageDialog';
import PageThumbnail from './PageThumbnail';

type SidebarView = 'pages' | 'bookmarks' | 'find' | 'tasks' | 'photos';

export default function LeftSidebar() {
  const {
    pageCount, currentPage, setCurrentPage, pdfData, setPdfData,
    setCurrentDocument, setPageCount, selectedPages, togglePageSelection,
    setSelectedPages, deletePages, reorderPage, pageClipboard, setPageClipboard,
    bookmarks, addBookmark, removeBookmark, renameBookmark,
    pageRotations, rotatePage,
    viewKey: pdfViewKey,
    activeTabId,
    annotations,
  } = useStore();

  const [dragOver, setDragOver] = useState(false);
  const [dragPageIdx, setDragPageIdx] = useState<number | null>(null);
  const [dropTarget, setDropTarget] = useState<number | null>(null);
  const [thumbnailKey, setThumbnailKey] = useState(0);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; pageIdx: number } | null>(null);

  const [insertFileIdx, setInsertFileIdx] = useState<number | null>(null);
  const insertFileRef = useRef<HTMLInputElement>(null);
  const [editingBookmark, setEditingBookmark] = useState<string | null>(null);
  const [blankPageDialogOpen, setBlankPageDialogOpen] = useState(false);
  const [blankPageInsertIdx, setBlankPageInsertIdx] = useState<number | null>(null);
  const [bookmarkName, setBookmarkName] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [showReplace, setShowReplace] = useState(false);
  const [searchResults, setSearchResults] = useState<{pageIndex: number; text: string; context: string; source: 'pdf'|'ocr'}[]>([]);
  const [searching, setSearching] = useState(false);
  const [activeMatchIdx, setActiveMatchIdx] = useState(-1);
  const [sidebarWidth, setSidebarWidth] = useState(192);
  const isResizing = useRef(false);
  const [view, setView] = useState<SidebarView>('pages');
  const [viewKey, setViewKey] = useState(0);
  const [photoSort, setPhotoSort] = useState<'date' | 'assignee'>('date');
  const [taskAssigneeFilter, setTaskAssigneeFilter] = useState<string>('All');
  const [lastSelectedPageIdx, setLastSelectedPageIdx] = useState<number | null>(null);

  // When switching back to pages, bump viewKey so thumbnails re-render
  const switchView = (v: SidebarView) => {
    setView(v);
    if (v === 'pages') setViewKey((k) => k + 1);
  };

  // Extract and flatten all photos from all tasks
  const allPhotos = React.useMemo(() => {
    const tasks = annotations.filter(a => a.type === 'inspection-task');
    const extracted: { url: string; taskId: string; taskName: string; assignee: string; date: number; pageIndex: number }[] = [];
    
    tasks.forEach(task => {
      if (task.pinContent?.images && task.pinContent.images.length > 0) {
        task.pinContent.images.forEach(imgUrl => {
          extracted.push({
            url: imgUrl,
            taskId: task.id,
            taskName: task.pinContent?.name || 'Untitled Task',
            assignee: task.pinContent?.assignee || 'Unassigned',
            date: task.updatedAt || task.createdAt,
            pageIndex: task.pageIndex
          });
        });
      }
    });

    return extracted.sort((a, b) => {
      if (photoSort === 'assignee') {
        if (a.assignee === b.assignee) return b.date - a.date;
        return a.assignee.localeCompare(b.assignee);
      }
      return b.date - a.date;
    });
  }, [annotations, photoSort]);

  // Drag-to-resize handler
  const handleResizeStart = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    isResizing.current = true;
    const startX = e.clientX;
    const startWidth = sidebarWidth;
    const onMouseMove = (ev: MouseEvent) => {
      if (!isResizing.current) return;
      const newWidth = Math.max(150, Math.min(600, startWidth + (ev.clientX - startX)));
      setSidebarWidth(newWidth);
    };
    const onMouseUp = () => {
      isResizing.current = false;
      document.removeEventListener('mousemove', onMouseMove);
      document.removeEventListener('mouseup', onMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', onMouseUp);
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';
  }, [sidebarWidth]);

  const wide = sidebarWidth >= 300;

  // Drop a new PDF
  const handleDrop = useCallback(async (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    // Ignore internal page drags (no files)
    if (!e.dataTransfer.files?.length) return;
    const file = e.dataTransfer.files[0];
    if (file.type !== 'application/pdf') return;
    const buffer = await file.arrayBuffer();

    if (!pdfData) {
      setPdfData(buffer);
      setCurrentDocument({
        id: crypto.randomUUID(),
        name: file.name,
        storageUrl: '',
        pageCount: 0,
        ownerId: 'local',
        sharedWith: {},
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });
      setCurrentPage(0);
      await loadPdf(buffer);
      setPageCount(getPageCount());
    } else {
      const total = await appendPdf(buffer);
      setPageCount(total);
      setThumbnailKey((k) => k + 1);
    }
  }, [pdfData, setPdfData, setCurrentDocument, setCurrentPage, setPageCount]);

  const handleDeleteSelected = () => {
    const pages = Array.from(selectedPages);
    if (pages.length === 0) return;
    if (pages.length >= pageCount) return;
    deletePages(pages);
    setThumbnailKey((k) => k + 1);
  };

  // Page drag-reorder handlers
  const handlePageDragStart = (e: React.DragEvent, idx: number) => {
    // If the page being dragged is part of a selection, drag the whole chunk
    const pagesToDrag = selectedPages.has(idx) 
      ? Array.from(selectedPages).sort((a, b) => a - b)
      : [idx];
      
    // Use JSON to pass multiple indices robustly
    e.dataTransfer.setData('application/json', JSON.stringify(pagesToDrag));
    
    // 🚨 CRITICAL FIX: Add this back so the sidebar knows it's an internal page drag, not an external file drop!
    e.dataTransfer.setData('text/x-page-drag', 'true'); 
    
    e.dataTransfer.effectAllowed = 'move';
    setDragPageIdx(idx);
  };

  const handlePageDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    e.stopPropagation(); // 🚨 CRITICAL FIX: Stop the event from bubbling up to the main sidebar container
    e.dataTransfer.dropEffect = 'move';
    setDropTarget(idx);
  };
  const handlePageDrop = (e: React.DragEvent, targetIdx: number) => {
    e.preventDefault();
    e.stopPropagation();
    setDragPageIdx(null);
    setDropTarget(null);

    try {
      const dataStr = e.dataTransfer.getData('application/json');
      
      // Fallback for old single-page drag format
      if (!dataStr) {
        const fromStr = e.dataTransfer.getData('text/x-page-drag');
        if (fromStr) {
          const from = parseInt(fromStr, 10);
          if (!isNaN(from) && from !== targetIdx) {
            reorderRendererPage(from, targetIdx);
            reorderPage(from, targetIdx);
            setThumbnailKey((k) => k + 1);
          }
        }
        return;
      }

      const sourceIndices = JSON.parse(dataStr) as number[];
      if (!Array.isArray(sourceIndices) || sourceIndices.length === 0) return;

      const sorted = [...sourceIndices].sort((a, b) => a - b);
      
      // Prevent dropping the selection onto itself
      if (sorted.includes(targetIdx)) return;

      // Get current page order from renderer
      const currentOrder = getPageOrder();
      const currentArray = currentOrder.length > 0 ? [...currentOrder] : Array.from({length: pageCount}, (_, i) => i);
      
      // Remove selected pages from current array
      const remaining = currentArray.filter(x => !sorted.includes(x));
      
      // Adjust target index based on how many selected pages were removed from above it
      const numSourcesBeforeTarget = sorted.filter(p => p < targetIdx).length;
      const finalTargetIdx = targetIdx - numSourcesBeforeTarget;
      
      // Build desired array
      const desiredArray = [
          ...remaining.slice(0, finalTargetIdx),
          ...sorted,
          ...remaining.slice(finalTargetIdx)
      ];

      // Issue specific move commands to shift the current array into the desired array
      desiredArray.forEach((expectedPageIdx, i) => {
         const currentPos = currentArray.indexOf(expectedPageIdx);
         if (currentPos !== i) {
             reorderRendererPage(currentPos, i);
             reorderPage(currentPos, i);
             
             // Keep our tracking array perfectly synced
             const [val] = currentArray.splice(currentPos, 1);
             currentArray.splice(i, 0, val);
         }
      });

      setThumbnailKey(k => k + 1);
      
      // Keep the dropped pages selected so the user can easily move them again!
      const newSelection = new Set(sorted.map(pageIdx => desiredArray.indexOf(pageIdx)));
      setSelectedPages(newSelection);
      
    } catch (err) {
      console.error('Drag and drop failed:', err);
    }
  };
  const handlePageDragEnd = () => {
    setDragPageIdx(null);
    setDropTarget(null);
  };

  // Context menu actions
  const handleContextMenu = (e: React.MouseEvent, pageIdx: number) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY, pageIdx });
  };
  const closeContextMenu = () => setContextMenu(null);

  const handleCut = (pageIdx: number) => {
    const pages = selectedPages.size > 0 ? Array.from(selectedPages) : [pageIdx];
    setPageClipboard({ type: 'cut', pageIndices: pages });
    closeContextMenu();
  };
  const handleCopy = (pageIdx: number) => {
    const pages = selectedPages.size > 0 ? Array.from(selectedPages) : [pageIdx];
    setPageClipboard({ type: 'copy', pageIndices: pages });
    closeContextMenu();
  };
  const handlePaste = (afterIdx: number) => {
    if (!pageClipboard) return;
    if (pageClipboard.type === 'cut') {
      const sorted = [...pageClipboard.pageIndices].sort((a, b) => a - b);
      sorted.forEach((fromIdx, i) => {
        const adjustedFrom = fromIdx - sorted.slice(0, i).filter(p => p < fromIdx).length;
        const adjustedTo = afterIdx + 1 + i;
        reorderPage(adjustedFrom, Math.min(adjustedTo, pageCount - 1));
      });
      setPageClipboard(null);
      setSelectedPages(new Set<number>());
      setThumbnailKey((k) => k + 1);
    }
    closeContextMenu();
  };
  const handleDeletePage = (pageIdx: number) => {
    const pages = selectedPages.size > 0 ? Array.from(selectedPages) : [pageIdx];
    if (pages.length >= pageCount) return;
    deletePages(pages);
    setThumbnailKey((k) => k + 1);
    closeContextMenu();
  };
  const handleMoveUp = (pageIdx: number) => {
    const pagesToMove = selectedPages.size > 0 ? Array.from(selectedPages).sort((a, b) => a - b) : [pageIdx];
    if (pagesToMove[0] <= 0) return; // Can't move if first page is selected
    
    // Move each selected page up by 1
    pagesToMove.forEach((idx, i) => {
      const adjustedIdx = idx - i; // Adjust for already moved pages
      if (adjustedIdx > 0) {
        reorderRendererPage(adjustedIdx, adjustedIdx - 1);
        reorderPage(adjustedIdx, adjustedIdx - 1);
      }
    });
    setThumbnailKey((k) => k + 1);
    closeContextMenu();
  };
  const handleMoveDown = (pageIdx: number) => {
    const pagesToMove = selectedPages.size > 0 ? Array.from(selectedPages).sort((a, b) => b - a) : [pageIdx];
    if (pagesToMove[0] >= pageCount - 1) return; // Can't move if last page is selected
    
    // Move each selected page down by 1 (process in reverse order)
    pagesToMove.forEach((idx, i) => {
      const adjustedIdx = idx + i; // Adjust for already moved pages
      if (adjustedIdx < pageCount - 1) {
        reorderRendererPage(adjustedIdx, adjustedIdx + 1);
        reorderPage(adjustedIdx, adjustedIdx + 1);
      }
    });
    setThumbnailKey((k) => k + 1);
    closeContextMenu();
  };
  const handleMoveTo = (pageIdx: number, direction: 'first' | 'last') => {
    const target = direction === 'first' ? 0 : pageCount - 1;
    reorderRendererPage(pageIdx, target);
    reorderPage(pageIdx, target);
    setThumbnailKey((k) => k + 1);
    closeContextMenu();
  };
  const handleRotatePage = (pageIdx: number) => {
    const pagesToRotate = selectedPages.size > 0 ? Array.from(selectedPages) : [pageIdx];
    pagesToRotate.forEach(idx => rotatePage(idx));
    setThumbnailKey((k) => k + 1);
    closeContextMenu();
  };
  const handleInsertPdfHere = (afterIdx: number) => {
    setInsertFileIdx(afterIdx);
    closeContextMenu();
    setTimeout(() => insertFileRef.current?.click(), 50);
  };
  const handleInsertFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf' || insertFileIdx === null) return;
    const buffer = await file.arrayBuffer();
    const total = await insertPdfAt(buffer, insertFileIdx + 1);
    setPageCount(total);
    setThumbnailKey((k) => k + 1);
    setInsertFileIdx(null);
    if (insertFileRef.current) insertFileRef.current.value = '';
  };
  const handleInsertBlankPage = (afterIdx: number) => {
    setBlankPageInsertIdx(afterIdx);
    setBlankPageDialogOpen(true);
    closeContextMenu();
  };

  const handleBlankPageInsert = async (pageSize: 'letter' | '11x17' | 'a4' | 'legal') => {
    if (blankPageInsertIdx === null) return;
    // Insert after the selected page (or the context menu page if no selection)
    const insertAfter = selectedPages.size > 0 ? Math.max(...selectedPages) : blankPageInsertIdx;
    const total = await insertBlankPage(insertAfter + 1, pageSize);
    setPageCount(total);
    setThumbnailKey((k) => k + 1);
    setBlankPageDialogOpen(false);
    setBlankPageInsertIdx(null);
  };

  const handleExtractPages = async (pageIdx: number) => {
    const pages = selectedPages.size > 0 ? Array.from(selectedPages) : [pageIdx];
    if (pages.length === 0) return;

    try {
      const pdfBuffer = await extractPages(pages);
      const blob = new Blob([pdfBuffer as ArrayBuffer], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `extracted-pages-${pages.length}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      closeContextMenu();
    } catch (err) {
      console.error('Failed to extract pages:', err);
      alert('Failed to extract pages. Please try again.');
    }
  };

  // Bookmark helpers
  const isBookmarked = (pageIdx: number) => bookmarks.some((b) => b.pageIndex === pageIdx);
  const toggleBookmark = (pageIdx: number) => {
    const existing = bookmarks.find((b) => b.pageIndex === pageIdx);
    if (existing) {
      removeBookmark(existing.id);
    } else {
      addBookmark({ id: crypto.randomUUID(), pageIndex: pageIdx, name: `Page ${pageIdx + 1}`, createdAt: Date.now() });
    }
  };

  // Shift+Click range selection
  const handleShiftClick = (pageIdx: number) => {
    if (lastSelectedPageIdx === null) {
      // First shift click, just select this page
      togglePageSelection(pageIdx);
      setLastSelectedPageIdx(pageIdx);
    } else {
      // Select range from lastSelectedPageIdx to pageIdx
      const start = Math.min(lastSelectedPageIdx, pageIdx);
      const end = Math.max(lastSelectedPageIdx, pageIdx);
      const newSelection = new Set(selectedPages);
      for (let i = start; i <= end; i++) {
        newSelection.add(i);
      }
      setSelectedPages(newSelection);
      setLastSelectedPageIdx(pageIdx);
    }
  };

  // Regular click handler that updates lastSelectedPageIdx
  const handlePageClick = (pageIdx: number) => {
    setCurrentPage(pageIdx);
    setLastSelectedPageIdx(pageIdx);
  };

  // Ctrl+Click handler that updates lastSelectedPageIdx
  const handleCtrlClick = (pageIdx: number) => {
    togglePageSelection(pageIdx);
    setLastSelectedPageIdx(pageIdx);
  };

  const allPages = Array.from({ length: pageCount }, (_, i) => i);
  const pageOrder = getPageOrder();

  // Close context menu on click outside
  useEffect(() => {
    if (!contextMenu) return;
    const handler = () => closeContextMenu();
    window.addEventListener('click', handler);
    return () => window.removeEventListener('click', handler);
  }, [contextMenu]);

  // Reset page selection and bump thumbnail key when PDF changes (new tab opened)
  useEffect(() => {
    setThumbnailKey((k) => k + 1);
    setSelectedPages(new Set());
    setLastSelectedPageIdx(null);
  }, [pdfData, activeTabId]);

  const thumbMaxWidth = wide ? Math.floor((sidebarWidth - 32) / 2) : sidebarWidth - 24;

  return (
    <div
      className={`bg-bb-sidebar border-r border-bb-border flex flex-col shrink-0 relative ${dragOver ? 'ring-2 ring-inset ring-bb-blue' : ''}`}
      style={{ width: sidebarWidth }}
      onDragOver={(e) => { 
        e.preventDefault(); 
        // Only set dragOver for external file drops, not internal page drags
        if (!e.dataTransfer.types.includes('text/x-page-drag')) {
          setDragOver(true);
        }
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={handleDrop}
    >
      {/* Resize handle */}
      <div
        onMouseDown={handleResizeStart}
        className="absolute top-0 right-0 w-1.5 h-full cursor-col-resize hover:bg-bb-blue/40 transition-colors z-20"
      />
      <input ref={insertFileRef} type="file" accept=".pdf" onChange={handleInsertFileChange} className="hidden" />

      {/* Sidebar Navigation Tabs */}
      <div className="flex flex-wrap border-b border-bb-border bg-[#252526] shrink-0 text-[10px] font-bold">
        
        {/* PAGES (Always visible) */}
        <button 
          onClick={() => switchView('pages')} 
          className={`flex-1 py-2 min-w-[65px] border-b-2 transition-colors flex items-center justify-center gap-1 ${view === 'pages' ? 'border-bb-blue text-bb-blue bg-bb-dark' : 'border-transparent text-bb-muted hover:bg-bb-hover'}`}
        >
          <Layers size={12} /> Pages
        </button>
        
        {/* FIND (Always visible) */}
        <button 
          onClick={() => switchView('find')} 
          className={`flex-1 py-2 min-w-[65px] border-b-2 transition-colors flex items-center justify-center gap-1 ${view === 'find' ? 'border-bb-blue text-bb-blue bg-bb-dark' : 'border-transparent text-bb-muted hover:bg-bb-hover'}`}
        >
          <Search size={12} /> Find
        </button>

        {/* BOOKMARKS (Always visible) */}
        <button 
          onClick={() => switchView('bookmarks')} 
          className={`flex-1 py-2 min-w-[65px] border-b-2 transition-colors flex items-center justify-center gap-1 ${view === 'bookmarks' ? 'border-bb-blue text-bb-blue bg-bb-dark' : 'border-transparent text-bb-muted hover:bg-bb-hover'}`}
        >
          <Bookmark size={12} /> Bookmarks
        </button>

        {/* TASKS & PHOTOS (Only visible if at least 1 task exists) */}
        {annotations.filter(a => a.type === 'inspection-task').length > 0 && (
          <>
            <button 
              onClick={() => switchView('tasks')} 
              className={`flex-1 py-2 min-w-[65px] border-b-2 transition-colors flex items-center justify-center gap-1 ${view === 'tasks' ? 'border-bb-blue text-bb-blue bg-bb-dark' : 'border-transparent text-bb-muted hover:bg-bb-hover'}`}
            >
              <ListChecks size={12} /> Tasks
            </button>
            
            <button 
              onClick={() => switchView('photos')} 
              className={`flex-1 py-2 min-w-[65px] border-b-2 transition-colors flex items-center justify-center gap-1 ${view === 'photos' ? 'border-bb-blue text-bb-blue bg-bb-dark' : 'border-transparent text-bb-muted hover:bg-bb-hover'}`}
            >
              <ImageIcon size={12} /> Photos
            </button>
          </>
        )}
      </div>

      {/* Find & Replace view */}
      {view === 'find' && (
        <FindReplacePanel
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          replaceQuery={replaceQuery}
          setReplaceQuery={setReplaceQuery}
          showReplace={showReplace}
          setShowReplace={setShowReplace}
          searchResults={searchResults}
          setSearchResults={setSearchResults}
          searching={searching}
          setSearching={setSearching}
          activeMatchIdx={activeMatchIdx}
          setActiveMatchIdx={setActiveMatchIdx}
          pageCount={pageCount}
          setCurrentPage={setCurrentPage}
          pdfData={pdfData}
        />
      )}

      {/* Bookmarks view */}
      {view === 'bookmarks' && (
        <div className="flex-1 overflow-y-auto px-2 py-1.5">
          {bookmarks.length === 0 ? (
            <div className="text-xs text-bb-muted text-center py-8">
              No bookmarks yet.<br />Press <kbd className="bg-bb-dark px-1 rounded text-[10px]">Ctrl+B</kbd> to bookmark a page.
            </div>
          ) : (
            <div className="space-y-0.5">
              {bookmarks.map((bm) => (
                <div key={bm.id} className="flex items-center gap-1.5 text-[11px] text-bb-text hover:bg-bb-hover rounded px-2 py-1 cursor-pointer group">
                  <BookmarkCheck size={11} className="text-yellow-400 shrink-0" />
                  {editingBookmark === bm.id ? (
                    <input
                      autoFocus
                      value={bookmarkName}
                      onChange={(e) => setBookmarkName(e.target.value)}
                      onBlur={() => { renameBookmark(bm.id, bookmarkName); setEditingBookmark(null); }}
                      onKeyDown={(e) => { if (e.key === 'Enter') { renameBookmark(bm.id, bookmarkName); setEditingBookmark(null); } }}
                      className="bg-bb-panel border border-bb-border rounded px-1 text-[10px] w-full outline-none"
                    />
                  ) : (
                    <span
                      onClick={() => setCurrentPage(bm.pageIndex)}
                      onDoubleClick={() => { setEditingBookmark(bm.id); setBookmarkName(bm.name); }}
                      className="truncate flex-1"
                      title="Click to go, double-click to rename"
                    >
                      {bm.name}
                    </span>
                  )}
                  <span className="text-[9px] text-bb-muted shrink-0">p.{bm.pageIndex + 1}</span>
                  <button
                    onClick={() => removeBookmark(bm.id)}
                    className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300 shrink-0"
                  >
                    <Trash2 size={10} />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Tasks view */}
      {view === 'tasks' && (() => {
        const tasks = React.useMemo(() => annotations.filter(a => a.type === 'inspection-task'), [annotations]);
        const statusColors = { 'Open': 'text-red-400', 'In Progress': 'text-yellow-400', 'Complete': 'text-blue-400', 'Verified': 'text-green-400' };
        
        const uniqueAssignees = React.useMemo(() => {
          const assignees = new Set<string>();
          tasks.forEach(t => {
            if (t.pinContent?.assignee) assignees.add(t.pinContent.assignee);
          });
          return Array.from(assignees).sort();
        }, [tasks]);

        const filteredTasks = React.useMemo(() => {
          if (taskAssigneeFilter === 'All') return tasks;
          return tasks.filter(t => t.pinContent?.assignee === taskAssigneeFilter);
        }, [tasks, taskAssigneeFilter]);
        
        return (
          <div className="flex-1 overflow-y-auto p-4 space-y-2 custom-scrollbar">
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-xs font-semibold text-bb-muted uppercase tracking-wider">Project Tasks</h3>
              
              <div className="flex gap-2">
                <span className="text-xs bg-bb-blue/20 text-bb-blue px-2 py-0.5 rounded-full">{filteredTasks.length} / {tasks.length}</span>
                <button 
                  onClick={() => window.dispatchEvent(new CustomEvent('open-export-dialog'))}
                  className="text-[10px] flex items-center gap-1 bg-green-600 hover:bg-green-500 text-white px-2 py-0.5 rounded transition-colors"
                >
                  <Download size={12} /> Export
                </button>
              </div>
            </div>

            {tasks.length > 0 && (
              <div className="mb-3 flex items-center gap-2">
                <span className="text-[10px] text-bb-muted uppercase tracking-wider font-semibold">Assignee:</span>
                <select
                  value={taskAssigneeFilter}
                  onChange={(e) => setTaskAssigneeFilter(e.target.value)}
                  className="flex-1 bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
                >
                  <option value="All">All Users</option>
                  {uniqueAssignees.map(assignee => (
                    <option key={assignee} value={assignee}>{assignee}</option>
                  ))}
                </select>
              </div>
            )}

            {filteredTasks.length > 0 && (() => {
              const counts = {
                'Open': filteredTasks.filter(t => t.pinContent?.status === 'Open').length,
                'In Progress': filteredTasks.filter(t => t.pinContent?.status === 'In Progress').length,
                'Complete': filteredTasks.filter(t => t.pinContent?.status === 'Complete').length,
                'Verified': filteredTasks.filter(t => t.pinContent?.status === 'Verified').length,
              };
              const total = filteredTasks.length;

              return (
                <div className="mb-4 bg-bb-panel border border-bb-border rounded p-3">
                  <div className="flex justify-between items-end mb-2">
                    <span className="text-[10px] uppercase tracking-wider text-bb-muted font-bold">Project Health</span>
                    <span className="text-xs font-bold text-bb-text">{Math.round((counts['Verified'] / total) * 100)}% Verified</span>
                  </div>
                  
                  <div className="h-2 w-full flex rounded-full overflow-hidden mb-2 bg-black">
                    <div style={{ width: `${(counts['Verified'] / total) * 100}%` }} className="bg-green-500 h-full" />
                    <div style={{ width: `${(counts['Complete'] / total) * 100}%` }} className="bg-blue-500 h-full" />
                    <div style={{ width: `${(counts['In Progress'] / total) * 100}%` }} className="bg-yellow-500 h-full" />
                    <div style={{ width: `${(counts['Open'] / total) * 100}%` }} className="bg-red-500 h-full" />
                  </div>
                  
                  <div className="flex justify-between text-[9px] text-bb-muted font-medium">
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-green-500" /> V: {counts['Verified']}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-blue-500" /> C: {counts['Complete']}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-yellow-500" /> IP: {counts['In Progress']}</span>
                    <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-red-500" /> O: {counts['Open']}</span>
                  </div>
                </div>
              );
            })()}

            {filteredTasks.length === 0 ? (
              <div className="text-xs text-bb-muted text-center py-8">
                {tasks.length === 0 ? 'No tasks recorded.' : 'No tasks for this assignee.'}
              </div>
            ) : (
              filteredTasks.map(task => {
                const content = task.pinContent || {};
                
                return (
                  <div 
                    key={task.id}
                    onClick={() => {
                      useStore.getState().setCurrentPage(task.pageIndex);
                      window.dispatchEvent(new CustomEvent('edit-task', { detail: task.id }));
                    }}
                    className="bg-[#1e1e1e] border border-bb-border rounded p-3 cursor-pointer hover:border-bb-blue transition-colors group relative"
                  >
                    <div className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-bb-blue">
                      <Edit size={14} />
                    </div>

                    <div className="flex justify-between items-start mb-2 pr-4">
                      <h4 className="text-sm text-bb-text font-medium group-hover:text-bb-blue transition-colors">
                        {content.name || 'Untitled Task'}
                      </h4>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded bg-black/30 font-semibold ${statusColors[content.status || 'Open']}`}>
                        {content.status || 'Open'}
                      </span>
                    </div>
                    
                    <div className="flex flex-wrap gap-2 text-[10px] text-bb-muted mb-2">
                      <span className="bg-bb-dark px-1.5 py-0.5 rounded">Page {task.pageIndex + 1}</span>
                      {content.priority === 'High' && <span className="bg-red-500/20 text-red-400 px-1.5 py-0.5 rounded flex items-center gap-1">⚠️ High Risk</span>}
                      {content.assignee && <span className="bg-blue-500/10 text-blue-400 px-1.5 py-0.5 rounded">@{content.assignee}</span>}
                      {content.category && <span className="bg-purple-500/10 text-purple-400 px-1.5 py-0.5 rounded">{content.category}</span>}
                    </div>

                    {content.text && <p className="text-xs text-bb-muted line-clamp-2">{content.text}</p>}
                  </div>
                );
              })
            )}
          </div>
        );
      })()}

      {/* Photos view */}
      {view === 'photos' && (
        <div className="flex-1 overflow-y-auto p-4 space-y-4 custom-scrollbar">
          <div className="flex justify-between items-center mb-2">
            <h3 className="text-xs font-semibold text-bb-muted uppercase tracking-wider">Project Photos</h3>
            <span className="text-xs bg-bb-blue/20 text-bb-blue px-2 py-0.5 rounded-full">{allPhotos.length}</span>
          </div>

          <div className="flex gap-1 bg-bb-panel rounded p-1 mb-4">
            <button 
              onClick={() => setPhotoSort('date')}
              className={`flex-1 flex justify-center items-center gap-1 text-[10px] py-1 rounded transition-colors ${photoSort === 'date' ? 'bg-bb-dark text-bb-blue' : 'text-bb-muted hover:text-white'}`}
            >
              <Calendar size={12} /> By Date
            </button>
            <button 
              onClick={() => setPhotoSort('assignee')}
              className={`flex-1 flex justify-center items-center gap-1 text-[10px] py-1 rounded transition-colors ${photoSort === 'assignee' ? 'bg-bb-dark text-bb-blue' : 'text-bb-muted hover:text-white'}`}
            >
              <User size={12} /> By Assignee
            </button>
          </div>

          {allPhotos.length === 0 ? (
            <div className="text-xs text-bb-muted text-center py-8">No photos uploaded to this project yet.</div>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              {allPhotos.map((photo, i) => (
                <div 
                  key={`${photo.taskId}-${i}`} 
                  className="relative group cursor-pointer border border-bb-border hover:border-bb-blue rounded overflow-hidden"
                  onClick={() => {
                    useStore.getState().setCurrentPage(photo.pageIndex);
                    window.dispatchEvent(new CustomEvent('edit-task', { detail: photo.taskId }));
                  }}
                >
                  <img src={photo.url} alt="Site" className="w-full h-24 object-cover" />
                  
                  <div className="absolute inset-0 bg-black/70 opacity-0 group-hover:opacity-100 transition-opacity p-2 flex flex-col justify-end">
                    <span className="text-[10px] text-white font-semibold truncate">{photo.taskName}</span>
                    <span className="text-[9px] text-gray-300 truncate">@{photo.assignee}</span>
                    <span className="text-[8px] text-bb-blue mt-1">
                      {new Date(photo.date).toLocaleDateString()}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Pages view */}
      {view === 'pages' && (
        <>
          {selectedPages.size > 0 && (
            <div className="px-2 py-1.5 bg-bb-panel border-b border-bb-border flex items-center justify-between">
              <span className="text-xs text-bb-muted">{selectedPages.size} page(s) selected</span>
              <button onClick={handleDeleteSelected} className="p-0.5 hover:bg-red-500/20 rounded text-red-400" title={`Delete ${selectedPages.size} page(s)`}>
                <Trash2 size={12} />
              </button>
            </div>
          )}
          <div
            className="flex-1 overflow-y-auto p-2 outline-none"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'ArrowDown') {
                e.preventDefault();
                if (currentPage < pageCount - 1) setCurrentPage(currentPage + 1);
              } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                if (currentPage > 0) setCurrentPage(currentPage - 1);
              } else if (e.key === 'Home') {
                e.preventDefault();
                setCurrentPage(0);
              } else if (e.key === 'End') {
                e.preventDefault();
                setCurrentPage(pageCount - 1);
              }
            }}
          >
          <div className={`${wide ? 'grid grid-cols-2 gap-2' : 'space-y-2'}`}>
            {pageCount > 0 ? (
              allPages.map((i) => (
                <PageThumbnail
                  key={`${i}-${thumbnailKey}-${viewKey}-${pdfViewKey}`}
                  pageIndex={i}
                  underlyingPageIndex={pageOrder.length > 0 ? pageOrder[i] : i}
                  isActive={i === currentPage}
                  isSelectedForDeletion={selectedPages.has(i)}
                  isBookmarked={isBookmarked(i)}
                  onClick={() => handlePageClick(i)}
                  onCtrlClick={() => handleCtrlClick(i)}
                  onShiftClick={() => handleShiftClick(i)}
                  onContextMenu={(e: any) => handleContextMenu(e, i)}
                  onDragStart={(e: any) => handlePageDragStart(e, i)}
                  onDragOver={(e: any) => handlePageDragOver(e, i)}
                  onDrop={(e: any) => handlePageDrop(e, i)}
                  onDragEnd={handlePageDragEnd}
                  onToggleBookmark={() => toggleBookmark(i)}
                  isDropTarget={dropTarget === i}
                  isDragging={dragPageIdx === i}
                  hasPdf={!!pdfData}
                  maxWidth={wide ? 200 : 150}
                  thumbnailKey={thumbnailKey}
                  pageRotations={pageRotations}
                />
              ))
            ) : (
              <div className="flex flex-col items-center justify-center py-8 gap-2 text-bb-muted col-span-2">
                <Upload size={24} className="opacity-40" />
                <span className="text-xs text-center">
                  Drag &amp; drop a PDF here<br />or use Open PDF
                </span>
              </div>
            )}
          </div>
          </div>
        </>
      )}

      {/* Right-click context menu */}
      {contextMenu && (
        <ContextMenuPositioned x={contextMenu.x} y={contextMenu.y} onClick={(e) => e.stopPropagation()}>
          <CtxItem label="Cut" shortcut="Page(s)" onClick={() => handleCut(contextMenu.pageIdx)} />
          <CtxItem label="Copy" shortcut="Page(s)" onClick={() => handleCopy(contextMenu.pageIdx)} />
          {pageClipboard && (
            <CtxItem label="Paste After" onClick={() => handlePaste(contextMenu.pageIdx)} />
          )}
          <div className="h-px bg-bb-border my-1" />
          <CtxItem label="Insert PDF Here" onClick={() => handleInsertPdfHere(contextMenu.pageIdx)} />
          <CtxItem label="Insert Blank Page" onClick={() => handleInsertBlankPage(contextMenu.pageIdx)} />
          <CtxItem label="Extract Selected Pages" onClick={() => handleExtractPages(contextMenu.pageIdx)} />
          <CtxItem label="Rotate Page(s) 90°" shortcut={selectedPages.size > 0 ? `${selectedPages.size} selected` : '1 page'} onClick={() => handleRotatePage(contextMenu.pageIdx)} />
          <div className="h-px bg-bb-border my-1" />
          <CtxItem label="Move Up" onClick={() => handleMoveUp(contextMenu.pageIdx)} />
          <CtxItem label="Move Down" onClick={() => handleMoveDown(contextMenu.pageIdx)} />
          <CtxItem label="Move to First" onClick={() => handleMoveTo(contextMenu.pageIdx, 'first')} />
          <CtxItem label="Move to Last" onClick={() => handleMoveTo(contextMenu.pageIdx, 'last')} />
          <div className="h-px bg-bb-border my-1" />
          <CtxItem label="Delete Page" danger onClick={() => handleDeletePage(contextMenu.pageIdx)} />
        </ContextMenuPositioned>
      )}
      {blankPageDialogOpen && (
        <BlankPageDialog
          onClose={() => {
            setBlankPageDialogOpen(false);
            setBlankPageInsertIdx(null);
          }}
          onInsert={handleBlankPageInsert}
        />
      )}
    </div>
  );
}

function ContextMenuPositioned({ x, y, onClick, children }: { x: number; y: number; onClick: (e: React.MouseEvent) => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [top, setTop] = useState(y);

  useEffect(() => {
    if (!ref.current) return;
    const menuH = ref.current.offsetHeight;
    const padding = 8;
    const maxTop = window.innerHeight - menuH - padding;
    setTop(Math.min(y, maxTop));
  }, [y]);

  return (
    <div
      ref={ref}
      className="fixed bg-bb-panel border border-bb-border rounded-lg shadow-xl py-1 z-50 min-w-[160px]"
      style={{ left: x, top }}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

function CtxItem({ label, shortcut, danger, onClick }: { label: string; shortcut?: string; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`w-full text-left px-3 py-1.5 text-xs flex items-center justify-between hover:bg-bb-hover transition-colors ${danger ? 'text-red-400' : 'text-bb-text'}`}
    >
      <span>{label}</span>
      {shortcut && <span className="text-bb-muted text-[10px] ml-3">{shortcut}</span>}
    </button>
  );
}

// ── Find & Replace panel ─────────────────────────────────────────────

function FindReplacePanel({
  searchQuery, setSearchQuery,
  replaceQuery, setReplaceQuery,
  showReplace, setShowReplace,
  searchResults, setSearchResults,
  searching, setSearching,
  activeMatchIdx, setActiveMatchIdx,
  pageCount, setCurrentPage, pdfData,
}: {
  searchQuery: string; setSearchQuery: (v: string) => void;
  replaceQuery: string; setReplaceQuery: (v: string) => void;
  showReplace: boolean; setShowReplace: (v: boolean) => void;
  searchResults: {pageIndex: number; text: string; context: string; source: 'pdf'|'ocr'; tabName?: string; x?: number; y?: number}[];
  setSearchResults: (v: {pageIndex: number; text: string; context: string; source: 'pdf'|'ocr'; tabName?: string; x?: number; y?: number}[]) => void;
  searching: boolean; setSearching: (v: boolean) => void;
  activeMatchIdx: number; setActiveMatchIdx: (v: number) => void;
  pageCount: number; setCurrentPage: (p: number) => void;
  pdfData: ArrayBuffer | null;
}) {
  const { annotations, addAnnotation, pushUndo, tabs, activeTabId, switchToTab, zoom, setZoom, setPanOffset, setFindHighlight } = useStore();
  const searchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [searchAllDocs, setSearchAllDocs] = useState(false);

  // Search a single PDF buffer and return results
  const searchBuffer = useCallback(async (query: string, buffer: ArrayBuffer, pgCount: number, tabName?: string) => {
    const pdfjsLib = await import('pdfjs-dist');
    // FIX 1: Disable auto-fetch for the background search document
    const loadingTask = pdfjsLib.getDocument({ data: buffer.slice(0), disableAutoFetch: true });
    const doc = await loadingTask.promise;

    const q = query.toLowerCase();
    const results: {pageIndex: number; text: string; context: string; source: 'pdf'|'ocr'; tabName?: string; x?: number; y?: number}[] = [];
    const total = Math.min(doc.numPages, pgCount || doc.numPages);
    for (let p = 0; p < total; p++) {
      let page; // Declare outside try/catch for finally block
      try {
        page = await doc.getPage(p + 1);
        const tc = await page.getTextContent();
        const fullText = tc.items.map((it: any) => it.str || '').join(' ');
        const lower = fullText.toLowerCase();
        let idx = 0;
        while ((idx = lower.indexOf(q, idx)) !== -1) {
          const start = Math.max(0, idx - 40);
          const end = Math.min(fullText.length, idx + q.length + 40);
          // Try to find the position of the match
          let matchX = 0, matchY = 0;
          let charCount = 0;
          for (const item of tc.items) {
            if ('str' in item && 'transform' in item) {
              if (charCount + item.str.length >= idx) {
                matchX = item.transform[4] || 0;
                matchY = item.transform[5] || 0;
                break;
              }
              charCount += item.str.length + 1;
            }
          }
          results.push({
            pageIndex: p,
            text: fullText.slice(idx, idx + q.length),
            context: (start > 0 ? '...' : '') + fullText.slice(start, end).trim() + (end < fullText.length ? '...' : ''),
            source: 'pdf',
            tabName,
            x: matchX / 2,
            y: matchY / 2,
          });
          idx += q.length;
        }
      } catch { /* page might not be accessible */ }
      finally {
        // FIX 2: Destroy the page object from memory immediately after scanning
        if (page && typeof page.cleanup === 'function') {
          page.cleanup();
        }
      }
    }

    // FIX 3: Destroy the entire background document when search is complete
    await doc.destroy();

    return results;
  }, []);

  // Debounced search through PDF text layer + OCR cache
  const runSearch = useCallback(async (query: string) => {
    if (!query.trim() || !pdfData) {
      setSearchResults([]);
      setActiveMatchIdx(-1);
      return;
    }
    setSearching(true);
    const q = query.toLowerCase();
    const results: {pageIndex: number; text: string; context: string; source: 'pdf'|'ocr'; tabName?: string; x?: number; y?: number}[] = [];
    const ocrCache = getOcrCache();

    if (searchAllDocs && tabs.length > 1) {
      // Search all open tabs
      for (const tab of tabs) {
        try {
          const tabResults = await searchBuffer(query, tab.pdfData, tab.pageCount, tab.name);
          results.push(...tabResults);
        } catch { /* skip tabs that fail */ }
      }
    } else {
      // Search current document only
      for (let p = 0; p < pageCount; p++) {
        // Search PDF text layer
        try {
          const items = await getPageTextItems(p);
          const fullText = items.map((it) => it.text).join(' ');
          const lower = fullText.toLowerCase();
          let idx = 0;
          while ((idx = lower.indexOf(q, idx)) !== -1) {
            const start = Math.max(0, idx - 40);
            const end = Math.min(fullText.length, idx + q.length + 40);
            // Try to find the position of the match
            let matchX = 0, matchY = 0;
            let charCount = 0;
            for (const item of items) {
              if (charCount + item.text.length >= idx) {
                matchX = item.x;
                matchY = item.y;
                break;
              }
              charCount += item.text.length + 1;
            }
            results.push({
              pageIndex: p,
              text: fullText.slice(idx, idx + q.length),
              context: (start > 0 ? '...' : '') + fullText.slice(start, end).trim() + (end < fullText.length ? '...' : ''),
              source: 'pdf',
              x: matchX,
              y: matchY,
            });
            idx += q.length;
          }
        } catch { /* page might not be accessible */ }

        // Search OCR cache for this page
        const ocrResult = ocrCache.get(p);
        if (ocrResult) {
          const ocrLower = ocrResult.text.toLowerCase();
          let idx = 0;
          while ((idx = ocrLower.indexOf(q, idx)) !== -1) {
            const start = Math.max(0, idx - 40);
            const end = Math.min(ocrResult.text.length, idx + q.length + 40);
            const isDupe = results.some((r) => r.pageIndex === p && r.source === 'pdf' &&
              r.context.toLowerCase().includes(ocrResult.text.slice(idx, idx + q.length).toLowerCase()));
            if (!isDupe) {
              // Try to find the position from OCR word bounding boxes
              let matchX = 0, matchY = 0;
              let charCount = 0;
              for (const word of ocrResult.words) {
                if (charCount + word.text.length >= idx) {
                  matchX = word.bbox.x0;
                  matchY = word.bbox.y0;
                  break;
                }
                charCount += word.text.length + 1;
              }
              results.push({
                pageIndex: p,
                text: ocrResult.text.slice(idx, idx + q.length),
                context: (start > 0 ? '...' : '') + ocrResult.text.slice(start, end).trim() + (end < ocrResult.text.length ? '...' : ''),
                source: 'ocr',
                x: matchX / 2, // Scale down to match PDF coordinates
                y: matchY / 2,
              });
            }
            idx += q.length;
          }
        }
      }
    }
    setSearchResults(results);
    setActiveMatchIdx(results.length > 0 ? 0 : -1);
    if (results.length > 0) {
      const firstMatch = results[0];
      setCurrentPage(firstMatch.pageIndex);
      // Set zoom to 20% more than current and center on match
      const newZoom = zoom * 1.2;
      setZoom(newZoom);
      if (firstMatch.x !== undefined && firstMatch.y !== undefined) {
        setFindHighlight({
          pageIndex: firstMatch.pageIndex,
          x: firstMatch.x,
          y: firstMatch.y,
          width: query.length * 12, // approximate width
          height: 16,
        });
        // Center the view on the match
        const canvasWidth = window.innerWidth - (document.querySelector('[data-sidebar="left"]')?.clientWidth || 0) - (document.querySelector('[data-sidebar="right"]')?.clientWidth || 0);
        const canvasHeight = window.innerHeight - 120; // account for header and bottom bar
        const targetX = firstMatch.x * newZoom;
        const targetY = firstMatch.y * newZoom;
        setPanOffset({
          x: canvasWidth / 2 - targetX,
          y: canvasHeight / 2 - targetY,
        });
      }
    }
    setSearching(false);
  }, [pdfData, pageCount, setSearchResults, setActiveMatchIdx, setCurrentPage, setSearching, searchAllDocs, tabs, searchBuffer, zoom, setZoom, setPanOffset, setFindHighlight]);

  const handleQueryChange = (val: string) => {
    setSearchQuery(val);
    if (searchTimerRef.current) clearTimeout(searchTimerRef.current);
    searchTimerRef.current = setTimeout(() => runSearch(val), 400);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) goToPrev();
      else goToNext();
    }
  };

  const goToNext = () => {
    if (searchResults.length === 0) return;
    const next = (activeMatchIdx + 1) % searchResults.length;
    setActiveMatchIdx(next);
    const match = searchResults[next];
    setCurrentPage(match.pageIndex);
    // Set zoom to 20% more than current and center on match
    const newZoom = zoom * 1.2;
    setZoom(newZoom);
    if (match.x !== undefined && match.y !== undefined) {
      setFindHighlight({
        pageIndex: match.pageIndex,
        x: match.x,
        y: match.y,
        width: searchQuery.length * 12, // approximate width
        height: 16,
      });
      // Center the view on the match
      const canvasWidth = window.innerWidth - (document.querySelector('[data-sidebar="left"]')?.clientWidth || 0) - (document.querySelector('[data-sidebar="right"]')?.clientWidth || 0);
      const canvasHeight = window.innerHeight - 120; // account for header and bottom bar
      const targetX = match.x * newZoom;
      const targetY = match.y * newZoom;
      setPanOffset({
        x: canvasWidth / 2 - targetX,
        y: canvasHeight / 2 - targetY,
      });
    }
  };

  const goToPrev = () => {
    if (searchResults.length === 0) return;
    const prev = (activeMatchIdx - 1 + searchResults.length) % searchResults.length;
    setActiveMatchIdx(prev);
    const match = searchResults[prev];
    setCurrentPage(match.pageIndex);
    // Set zoom to 20% more than current and center on match
    const newZoom = zoom * 1.2;
    setZoom(newZoom);
    if (match.x !== undefined && match.y !== undefined) {
      setFindHighlight({
        pageIndex: match.pageIndex,
        x: match.x,
        y: match.y,
        width: searchQuery.length * 12, // approximate width
        height: 16,
      });
      // Center the view on the match
      const canvasWidth = window.innerWidth - (document.querySelector('[data-sidebar="left"]')?.clientWidth || 0) - (document.querySelector('[data-sidebar="right"]')?.clientWidth || 0);
      const canvasHeight = window.innerHeight - 120; // account for header and bottom bar
      const targetX = match.x * newZoom;
      const targetY = match.y * newZoom;
      setPanOffset({
        x: canvasWidth / 2 - targetX,
        y: canvasHeight / 2 - targetY,
      });
    }
  };

  const handleReplace = () => {
    if (activeMatchIdx < 0 || !replaceQuery) return;
    const match = searchResults[activeMatchIdx];
    // Add a text annotation with the replacement at the match location
    const ann = {
      id: crypto.randomUUID(),
      type: 'text' as const,
      pageIndex: match.pageIndex,
      points: [{ x: 20, y: 20 }],
      text: `[Replace "${match.text}" → "${replaceQuery}"]`,
      style: { stroke: '#f59e0b', strokeWidth: 1, fill: 'transparent', opacity: 1, fontSize: 10, fontFamily: 'Arial' },
      createdBy: 'find-replace',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      layerOrder: annotations.length,
    };
    addAnnotation(ann);
    pushUndo({ type: 'add', annotation: ann });
    goToNext();
  };

  const handleReplaceAll = () => {
    if (searchResults.length === 0 || !replaceQuery) return;
    // Group by page
    const byPage = new Map<number, typeof searchResults>();
    searchResults.forEach((r) => {
      const arr = byPage.get(r.pageIndex) || [];
      arr.push(r);
      byPage.set(r.pageIndex, arr);
    });
    byPage.forEach((matches, pageIdx) => {
      const ann = {
        id: crypto.randomUUID(),
        type: 'text' as const,
        pageIndex: pageIdx,
        points: [{ x: 20, y: 20 }],
        text: `[Replace All: "${searchQuery}" → "${replaceQuery}" (${matches.length} occurrences)]`,
        style: { stroke: '#f59e0b', strokeWidth: 1, fill: 'transparent', opacity: 1, fontSize: 10, fontFamily: 'Arial' },
        createdBy: 'find-replace',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layerOrder: annotations.length,
      };
      addAnnotation(ann);
      pushUndo({ type: 'add', annotation: ann });
    });
  };

  return (
    <div className="flex flex-col h-full">
      <div className="px-2 py-1.5 border-b border-bb-border space-y-1.5 shrink-0">
        {/* Search input */}
        <div className="flex items-center gap-1">
          <div className="flex items-center gap-1 bg-bb-dark rounded px-1.5 py-1 flex-1">
            <Search size={11} className="text-bb-muted shrink-0" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => handleQueryChange(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Find in document..."
              className="bg-transparent text-[11px] text-bb-text outline-none w-full placeholder:text-bb-muted/50"
            />
          </div>
          <button onClick={goToPrev} disabled={searchResults.length === 0} className="p-1 hover:bg-bb-hover rounded text-bb-muted disabled:opacity-30" title="Previous (Shift+Enter)">
            <ArrowUp size={12} />
          </button>
          <button onClick={goToNext} disabled={searchResults.length === 0} className="p-1 hover:bg-bb-hover rounded text-bb-muted disabled:opacity-30" title="Next (Enter)">
            <ArrowDown size={12} />
          </button>
        </div>

        {/* Scope toggle */}
        {tabs.length > 1 && (
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => { setSearchAllDocs(false); if (searchQuery.trim()) runSearch(searchQuery); }}
              className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${!searchAllDocs ? 'bg-bb-blue/20 text-bb-blue' : 'text-bb-muted hover:bg-bb-hover'}`}
            >
              Current Doc
            </button>
            <button
              onClick={() => { setSearchAllDocs(true); if (searchQuery.trim()) runSearch(searchQuery); }}
              className={`px-1.5 py-0.5 rounded text-[9px] transition-colors ${searchAllDocs ? 'bg-bb-blue/20 text-bb-blue' : 'text-bb-muted hover:bg-bb-hover'}`}
            >
              All Documents ({tabs.length})
            </button>
          </div>
        )}

        {/* Status line */}
        <div className="flex items-center gap-2 text-[10px] text-bb-muted">
          {searching ? (
            <span>Searching...</span>
          ) : searchQuery.trim() ? (
            <span>{searchResults.length} result{searchResults.length !== 1 ? 's' : ''}{activeMatchIdx >= 0 ? ` (${activeMatchIdx + 1}/${searchResults.length})` : ''}</span>
          ) : (
            <span>Search through PDF text &amp; OCR</span>
          )}
          <span className="flex-1" />
          <button
            onClick={() => setShowReplace(!showReplace)}
            className={`flex items-center gap-0.5 px-1 py-0.5 rounded transition-colors ${showReplace ? 'bg-yellow-500/20 text-yellow-400' : 'hover:bg-bb-hover'}`}
            title="Find & Replace"
          >
            <Replace size={10} />
            Replace
          </button>
        </div>

        {/* Replace input */}
        {showReplace && (
          <div className="space-y-1">
            <div className="flex items-center gap-1 bg-bb-dark rounded px-1.5 py-1">
              <Replace size={11} className="text-yellow-400 shrink-0" />
              <input
                value={replaceQuery}
                onChange={(e) => setReplaceQuery(e.target.value)}
                placeholder="Replace with..."
                className="bg-transparent text-[11px] text-bb-text outline-none w-full placeholder:text-bb-muted/50"
              />
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={handleReplace}
                disabled={activeMatchIdx < 0 || !replaceQuery}
                className="px-2 py-0.5 text-[10px] bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded disabled:opacity-30 transition-colors"
              >
                Replace
              </button>
              <button
                onClick={handleReplaceAll}
                disabled={searchResults.length === 0 || !replaceQuery}
                className="px-2 py-0.5 text-[10px] bg-yellow-600/20 hover:bg-yellow-600/30 text-yellow-400 rounded disabled:opacity-30 transition-colors"
              >
                Replace All
              </button>
              <span className="text-[9px] text-bb-muted ml-1">Adds annotation markups</span>
            </div>
          </div>
        )}
      </div>

      {/* Results list */}
      <div className="flex-1 overflow-y-auto p-2 min-h-0">
        {searchResults.length > 0 ? (
          <div className="space-y-0.5">
            {searchResults.map((r, idx) => (
              <button
                key={`${r.pageIndex}-${idx}`}
                onClick={() => {
                  setActiveMatchIdx(idx);
                  setCurrentPage(r.pageIndex);
                  // Set zoom to 20% more than current and center on match
                  const newZoom = zoom * 1.2;
                  setZoom(newZoom);
                  if (r.x !== undefined && r.y !== undefined) {
                    setFindHighlight({
                      pageIndex: r.pageIndex,
                      x: r.x,
                      y: r.y,
                      width: searchQuery.length * 12,
                      height: 16,
                    });
                    // Center the view on the match
                    const canvasWidth = window.innerWidth - (document.querySelector('[data-sidebar="left"]')?.clientWidth || 0) - (document.querySelector('[data-sidebar="right"]')?.clientWidth || 0);
                    const canvasHeight = window.innerHeight - 120;
                    const targetX = r.x * newZoom;
                    const targetY = r.y * newZoom;
                    setPanOffset({
                      x: canvasWidth / 2 - targetX,
                      y: canvasHeight / 2 - targetY,
                    });
                  }
                }}
                className={`w-full text-left px-2 py-1.5 rounded text-[11px] transition-colors ${
                  idx === activeMatchIdx ? 'bg-bb-blue/20 text-bb-blue' : 'text-bb-text hover:bg-bb-hover'
                }`}
              >
                <div className="flex items-center gap-1.5 flex-wrap">
                  {r.tabName && <span className="text-[8px] text-orange-400 bg-orange-500/15 px-1 rounded shrink-0 max-w-[80px] truncate" title={r.tabName}>{r.tabName}</span>}
                  <span className="text-[9px] text-bb-muted shrink-0 bg-bb-panel px-1 rounded">p.{r.pageIndex + 1}</span>
                  {r.source === 'ocr' && <span className="text-[8px] text-teal-400 bg-teal-500/15 px-1 rounded shrink-0">OCR</span>}
                </div>
                <div className="text-[10px] text-bb-muted mt-0.5 leading-tight line-clamp-2" dangerouslySetInnerHTML={{
                  __html: r.context.replace(
                    new RegExp(`(${searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'),
                    '<mark class="bg-yellow-500/40 text-yellow-200 rounded px-0.5">$1</mark>'
                  ),
                }} />
              </button>
            ))}
          </div>
        ) : searchQuery.trim() && !searching ? (
          <div className="text-xs text-bb-muted text-center py-8">No matches found.</div>
        ) : !searchQuery.trim() ? (
          <div className="text-xs text-bb-muted text-center py-8 space-y-1">
            <p>Type to search through all text in the PDF.</p>
            <p className="text-[10px]">Also searches OCR results if available.</p>
          </div>
        ) : null}
      </div>
    </div>
  );
}
