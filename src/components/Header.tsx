import React, { useRef, useState } from 'react';
import { useStore } from '../store/useStore';
import { useAuth } from '../hooks/useAuth';
import { useAutoSave } from '../hooks/useAutoSave';
import { exportAnnotatedPdf, flattenAnnotationsIntoPdf } from '../utils/exportPdf';
import SearchBar from './SearchBar';
import HeaderFooterDialog from './HeaderFooterDialog';
import InsertPdfDialog from './InsertPdfDialog';
import {
  Upload,
  ZoomIn,
  ZoomOut,
  Download,
  Printer,
  Save,
  FileJson,
  FileText,
  Settings,
  LogOut,
  Share2,
  Sparkles,
  Menu,
  X,
  Search,
  Layers,
  ShieldCheck,
  PanelRightOpen,
  Puzzle,
  MapPin,
  PanelLeftOpen,
  Undo2,
  Redo2,
  Users,
  Loader2,
  FilePlus2,
  ScanSearch,
  Shield,
  Globe,
  Wand2,
  MessageSquare,
  ChevronDown,
  Clock,
  Ruler,
  Hexagon,
  FileArchive,
  Maximize,
  Type,
  MonitorDown,
  Cloud,
} from 'lucide-react';
import { appendPdf, getPageCount, loadPdf } from '../utils/pdfRenderer';
import { generateDocumentId } from '../utils/fileHash';
import { loadAnnotationsFromIndexedDB } from '../utils/annotationStorage';
import { FolderOpen } from 'lucide-react';

export default function Header({ isMobile, onToggleLeftSidebar, onToggleRightSidebar, onOpenAiDialog, onOpenOcrDialog, onOpenSignDialog, onOpenSummaryDialog, onOpenPlanReview, onOpenProjectManager, onOpenUrl, onOpenAiFill, onOpenAiChat, onOpenTimeline, onOpenEngParams, onOpenExtension, onShare, onSharePdf, onOpenAddressScan, onOpenConvertToCad, onOpenReportExport, onOpenIdentifyElements }: { isMobile?: boolean; onToggleLeftSidebar?: () => void; onToggleRightSidebar?: () => void; onOpenAiDialog?: () => void; onOpenOcrDialog?: () => void; onOpenSignDialog?: () => void; onOpenSummaryDialog?: () => void; onOpenPlanReview?: () => void; onOpenProjectManager?: () => void; onOpenUrl?: () => void; onOpenAiFill?: () => void; onOpenAiChat?: () => void; onOpenTimeline?: () => void; onOpenEngParams?: () => void; onOpenExtension?: () => void; onShare?: () => void; onSharePdf?: (name: string, data: ArrayBuffer) => Promise<string>; onOpenAddressScan?: () => void; onOpenConvertToCad?: () => void; onOpenReportExport?: () => void; onOpenIdentifyElements?: () => void }) {
  const { user, logout } = useAuth();
  const { performSilentSave } = useAutoSave();
  const aiButtonRef = useRef<HTMLButtonElement>(null);
  const [aiMenuPosition, setAiMenuPosition] = useState({ top: 0, right: 0 });
  const [aiMenuOpen, setAiMenuOpen] = useState(false);
  const [headerFooterDialogOpen, setHeaderFooterDialogOpen] = useState(false);
  const [insertPdfDialogOpen, setInsertPdfDialogOpen] = useState(false);
  const { autoSaveEnabled, setAutoSaveEnabled, activeTabId, tabs, updateTab, cloudSyncEnabled, setCloudSyncEnabled } = useStore();

  // Calculate AI menu position when it opens
  React.useEffect(() => {
    if (aiMenuOpen && aiButtonRef.current) {
      const rect = aiButtonRef.current.getBoundingClientRect();
      setAiMenuPosition({
        top: rect.bottom + 4,
        right: window.innerWidth - rect.right,
      });
    }
  }, [aiMenuOpen]);

  const {
    currentDocument,
    zoom,
    setZoom,
    setPdfData,
    setCurrentDocument,
    setCurrentPage,
    toggleLeftSidebar,
    toggleRightSidebar,
    undo,
    redo,
    undoStack,
    redoStack,
    presenceList,
    pdfData,
    setPageCount,
    pdfLocked,
    annotations: allAnnotations,
    measurements: allMeasurements,
    measurementUnit,
    activeTool,
    setActiveTool,
  } = useStore();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [sharing, setSharing] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || file.type !== 'application/pdf') return;
    const buffer = await file.arrayBuffer();
    const doc = await loadPdf(buffer);
    const pgCount = doc.numPages;
    const documentId = await generateDocumentId(buffer);
    // Always open in a new tab, leaving 'welcome' untouched
    await useStore.getState().openPdfInNewTab(file.name, buffer, pgCount);
    // Set documentId on the newly opened tab
    const newTabId = useStore.getState().activeTabId;
    if (newTabId) {
      updateTab(newTabId, { documentId });
      useStore.getState().setDocumentId(documentId);
    }
    // Load annotations from IndexedDB if they exist
    const storedAnnotations = await loadAnnotationsFromIndexedDB(documentId);
    if (storedAnnotations) {
      console.log('[Header] Loaded annotations from IndexedDB for', documentId);
      useStore.getState().setAnnotations(storedAnnotations.annotations);
      useStore.getState().setMeasurements(storedAnnotations.measurements);
      if (storedAnnotations.calibrations) {
        Object.entries(storedAnnotations.calibrations).forEach(([pageIndex, cal]) => {
          useStore.getState().setCalibration(parseInt(pageIndex), cal);
        });
      }
      useStore.getState().setBookmarks(storedAnnotations.bookmarks);
      useStore.getState().setCurrentPage(storedAnnotations.currentPage);
      // Also update the tab's annotations to match
      if (newTabId) {
        updateTab(newTabId, {
          annotations: storedAnnotations.annotations,
          measurements: storedAnnotations.measurements,
          calibrations: storedAnnotations.calibrations,
          bookmarks: storedAnnotations.bookmarks,
          currentPage: storedAnnotations.currentPage
        });
      }
    }
  };

  const handleOpenWithHandle = async () => {
    try {
      if (!('showOpenFilePicker' in window)) {
        fileInputRef.current?.click();
        return;
      }
      const [handle] = await (window as any).showOpenFilePicker({
        types: [{ description: 'PDF Files', accept: { 'application/pdf': ['.pdf'] } }],
      });
      const file = await handle.getFile();
      const buffer = await file.arrayBuffer();
      const doc = await loadPdf(buffer);
      const pgCount = doc.numPages;

      // Generate document ID from file hash
      const documentId = await generateDocumentId(buffer);

      // Always open in a new tab, leaving 'welcome' untouched
      await useStore.getState().openPdfInNewTab(file.name, buffer, pgCount);

      // Set the file handle and documentId on the newly created tab
      const newTabId = useStore.getState().activeTabId;
      if (newTabId) {
        updateTab(newTabId, { fileHandle: handle, documentId });
        useStore.getState().setDocumentId(documentId);
      }

      // Load annotations from IndexedDB if they exist
      const storedAnnotations = await loadAnnotationsFromIndexedDB(documentId);
      if (storedAnnotations) {
        console.log('[Header] Loaded annotations from IndexedDB for', documentId);
        useStore.getState().setAnnotations(storedAnnotations.annotations);
        useStore.getState().setMeasurements(storedAnnotations.measurements);
        // Set calibrations page by page
        if (storedAnnotations.calibrations) {
          Object.entries(storedAnnotations.calibrations).forEach(([pageIndex, cal]) => {
            useStore.getState().setCalibration(parseInt(pageIndex), cal);
          });
        }
        useStore.getState().setBookmarks(storedAnnotations.bookmarks);
        useStore.getState().setCurrentPage(storedAnnotations.currentPage);
        // Also update the tab's annotations to match
        if (newTabId) {
          updateTab(newTabId, {
            annotations: storedAnnotations.annotations,
            measurements: storedAnnotations.measurements,
            calibrations: storedAnnotations.calibrations,
            bookmarks: storedAnnotations.bookmarks,
            currentPage: storedAnnotations.currentPage
          });
        }
      }

      // Save to recent files (only save handle if File System Access API is supported)
      useStore.getState().addRecentFile({
        id: crypto.randomUUID(),
        name: file.name,
        handle: 'showOpenFilePicker' in window ? handle : undefined,
        lastOpened: Date.now(),
        source: 'local',
      });
    } catch (err: any) {
      if (err?.name !== 'AbortError') console.error('Open file failed:', err);
    }
  };


  const handleSave = async () => {
    if (!pdfData || !currentDocument) return;
    
    // Save annotations to IndexedDB (fast, doesn't need file handle)
    const success = await performSilentSave();
    if (success) {
      alert('Annotations saved successfully');
    } else {
      alert('Failed to save annotations');
    }
  };

  const handleExportPdf = async () => {
    if (!pdfData || !currentDocument) return;
    
    // Export the flattened PDF with annotations baked in
    try {
      const { annotations, pageCount, measurements, measurementUnit, formFields } = useStore.getState();
      const { exportAnnotatedPdfAsBuffer } = await import('../utils/exportPdf');
      // Convert formFields array to a record for easy lookup
      const formFieldValues: Record<string, string | boolean> = {};
      formFields.forEach(f => {
        formFieldValues[f.name] = f.value;
      });
      const buf = await exportAnnotatedPdfAsBuffer(pageCount, annotations, measurements, measurementUnit, formFieldValues);
      const blob = new Blob([buf], { type: 'application/pdf' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = currentDocument.name;
      a.click();
      URL.revokeObjectURL(url);
      alert('PDF saved successfully');
    } catch (err: any) {
      console.error('Save failed:', err);
      alert('Save failed: ' + (err?.message || 'Unknown error'));
    }
  };

  return (
    <header className="h-11 bg-bb-sidebar border-b border-bb-border flex items-center px-3 gap-2 shrink-0 overflow-x-auto">
      <button
        onClick={() => {
          if (isMobile) {
            onToggleLeftSidebar?.();
          } else {
            toggleLeftSidebar();
          }
        }}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
        title="Toggle Pages Panel"
      >
        <PanelLeftOpen size={16} />
      </button>

      <div className="flex items-center gap-1 border-r border-bb-border pr-3 mr-1 shrink-0">
        <button
          onClick={handleOpenWithHandle}
          className="flex items-center gap-1.5 px-2.5 py-1 bg-bb-blue hover:bg-blue-600 rounded text-white text-xs font-medium transition-colors shrink-0"
          data-tour="open-pdf"
        >
          <Upload size={13} />
          Open PDF
        </button>
        <input
          ref={fileInputRef}
          type="file"
          accept=".pdf"
          onChange={handleFileUpload}
          className="hidden"
        />
        {pdfData && (
          <button
            onClick={() => setInsertPdfDialogOpen(true)}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-bb-hover hover:bg-bb-border rounded text-bb-text text-xs font-medium transition-colors shrink-0"
            title="Insert additional PDF pages"
          >
            <FilePlus2 size={13} />
            Insert PDF
          </button>
        )}
      </div>

      {currentDocument && (
        <span className="text-xs text-bb-muted truncate max-w-[200px]">
          {currentDocument.name}
        </span>
      )}

      <div className="flex-1" />

      <div className="flex items-center gap-1 border-r border-bb-border pr-3 mr-1 shrink-0">
        <button
          onClick={undo}
          disabled={undoStack.length === 0}
          className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text disabled:opacity-30 transition-colors shrink-0"
          title="Undo (Ctrl+Z)"
        >
          <Undo2 size={15} />
        </button>
        <button
          onClick={redo}
          disabled={redoStack.length === 0}
          className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text disabled:opacity-30 transition-colors shrink-0"
          title="Redo (Ctrl+Y)"
        >
          <Redo2 size={15} />
        </button>
      </div>

      <div className="flex items-center gap-1 border-r border-bb-border pr-3 mr-1 shrink-0">
        <button
          onClick={() => setZoom(zoom - 0.1)}
          className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
          title="Zoom Out"
        >
          <ZoomOut size={15} />
        </button>
        <span className="text-xs text-bb-muted w-12 text-center font-mono">
          {Math.round(zoom * 100)}%
        </span>
        <button
          onClick={() => setZoom(zoom + 0.1)}
          className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
          title="Zoom In"
        >
          <ZoomIn size={15} />
        </button>
        <button
          onClick={() => setActiveTool(activeTool === 'zoom-rectangle' ? 'select' : 'zoom-rectangle')}
          className={`p-1.5 rounded transition-colors shrink-0 ${activeTool === 'zoom-rectangle' ? 'bg-bb-blue text-white' : 'hover:bg-bb-hover text-bb-muted hover:text-bb-text'}`}
          title="Zoom Rectangle"
        >
          <Maximize size={15} />
        </button>
      </div>

      {presenceList.length > 0 && (
        <div className="flex items-center gap-1 mr-2">
          <Users size={14} className="text-bb-muted" />
          <div className="flex -space-x-1.5">
            {presenceList.slice(0, 5).map((u) => (
              <div
                key={u.userId}
                className="w-5 h-5 rounded-full text-[9px] flex items-center justify-center font-bold border border-bb-dark"
                style={{ backgroundColor: u.color }}
                title={u.displayName}
              >
                {u.displayName[0]?.toUpperCase()}
              </div>
            ))}
          </div>
        </div>
      )}

      <SearchBar />

      {/* ── AI Features Dropdown ──────────────────────────── */}
      <div className="relative shrink-0">
        <button
          ref={aiButtonRef}
          onClick={() => setAiMenuOpen(!aiMenuOpen)}
          className="flex items-center gap-1 px-2.5 py-1 bg-purple-600/20 hover:bg-purple-600/30 rounded text-purple-300 text-xs font-medium transition-colors shrink-0"
          data-tour="ai-tools"
        >
          <Sparkles size={13} />
          AI Tools
          <ChevronDown size={11} className={`transition-transform ${aiMenuOpen ? 'rotate-180' : ''}`} />
        </button>
        {aiMenuOpen && (
          <>
            <div className="fixed inset-0 z-[100]" onClick={() => setAiMenuOpen(false)} />
            <div className="fixed z-[110] w-56 bg-bb-sidebar border border-bb-border rounded-lg shadow-2xl py-1 overflow-hidden" style={{ top: aiMenuPosition.top, right: aiMenuPosition.right }}>
              {pdfData && onOpenAiChat && (
                <AiMenuItem icon={<MessageSquare size={13} />} label="Chat with PDF" desc="Ask questions about your document" color="text-purple-300" onClick={() => { onOpenAiChat(); setAiMenuOpen(false); }} data-tour="ai-chat" />
              )}
              {pdfData && onOpenSummaryDialog && (
                <AiMenuItem icon={<FileText size={13} />} label="Summarize PDF" desc="Get a structured AI summary" color="text-blue-300" onClick={() => { onOpenSummaryDialog(); setAiMenuOpen(false); }} />
              )}
              {pdfData && onOpenAiDialog && (
                <AiMenuItem icon={<Sparkles size={13} />} label="AI Annotate" desc="Auto-annotate with Gemini" color="text-purple-300" onClick={() => { onOpenAiDialog(); setAiMenuOpen(false); }} />
              )}
              {pdfData && onOpenAiFill && (
                <AiMenuItem icon={<Wand2 size={13} />} label="AI Form Fill" desc="Auto-fill PDF form fields" color="text-purple-300" onClick={() => { onOpenAiFill(); setAiMenuOpen(false); }} />
              )}
              {pdfData && onOpenPlanReview && (
                <AiMenuItem icon={<Shield size={13} />} label="Plan Review" desc="AI structural plan review" color="text-orange-300" onClick={() => { onOpenPlanReview(); setAiMenuOpen(false); }} />
              )}
              {onOpenProjectManager && (
                <AiMenuItem icon={<FolderOpen size={13} />} label="Projects" desc="Manage AI analysis projects" color="text-blue-300" onClick={() => { onOpenProjectManager(); setAiMenuOpen(false); }} data-tour="projects" />
              )}
              {pdfData && onOpenAddressScan && (
                <AiMenuItem icon={<MapPin size={13} />} label="Scan Addresses" desc="Find addresses and open in Google Maps" color="text-green-300" onClick={() => { onOpenAddressScan(); setAiMenuOpen(false); }} />
              )}
              {pdfData && onOpenEngParams && (
                <AiMenuItem icon={<Ruler size={13} />} label="Engineering Parameters" desc="Extract specs, loads & dimensions" color="text-cyan-300" onClick={() => { onOpenEngParams(); setAiMenuOpen(false); }} />
              )}
              {pdfData && onOpenConvertToCad && (
                <AiMenuItem icon={<Hexagon size={13} />} label="Convert to CAD" desc="PDF → DXF/SVG for AutoCAD" color="text-blue-300" onClick={() => { onOpenConvertToCad(); setAiMenuOpen(false); }} />
              )}
              {pdfData && onOpenIdentifyElements && (
                <AiMenuItem icon={<ScanSearch size={13} />} label="Identify Elements (BIM)" desc="Detect walls, rooms, ducts, slabs, etc." color="text-emerald-300" onClick={() => { onOpenIdentifyElements(); setAiMenuOpen(false); }} data-tour="identify-elements" />
              )}
              {onOpenTimeline && (
                <AiMenuItem icon={<Clock size={13} />} label="PDF Timeline" desc="Scan folder → timeline CSV" color="text-amber-300" onClick={() => { onOpenTimeline(); setAiMenuOpen(false); }} />
              )}
              <div className="border-t border-bb-border my-1" />
              {pdfData && onOpenOcrDialog && (
                <AiMenuItem icon={<ScanSearch size={13} />} label="OCR" desc="Extract text from scanned PDFs" color="text-teal-300" onClick={() => { onOpenOcrDialog(); setAiMenuOpen(false); }} />
              )}
              {onOpenUrl && (
                <AiMenuItem icon={<Globe size={13} />} label="Open URL" desc="Load PDF from a web link" color="text-cyan-300" onClick={() => { onOpenUrl(); setAiMenuOpen(false); }} />
              )}
              {onOpenExtension && (
                <AiMenuItem icon={<Puzzle size={13} />} label="Chrome Extension" desc="Make BluePrint your default PDF viewer" color="text-purple-300" onClick={() => { onOpenExtension(); setAiMenuOpen(false); }} />
              )}
            </div>
          </>
        )}
      </div>

      <button
        onClick={() => {
          if (!currentDocument || !pdfData) {
            alert('Open a PDF first before sharing.');
            return;
          }
          onShare?.();
        }}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
        title="Share document link for collaboration"
        data-tour="share"
      >
        <Share2 size={15} />
      </button>
      <button
        onClick={async () => {
          if (!currentDocument || !pdfData) {
            alert('Open a PDF first.');
            return;
          }
          if (!confirm('Flatten all annotations into the PDF? This will permanently burn markups into the pages and remove editable annotations.')) return;
          try {
            const { pageCount: pc, annotations: anns, measurements: ms, measurementUnit: mu, setAnnotations: setAnns, setMeasurements: setMs } = useStore.getState();
            const flatBuffer = await flattenAnnotationsIntoPdf(pc, anns, ms, mu);
            setPdfData(flatBuffer);
            await loadPdf(flatBuffer);
            setPageCount(getPageCount());
            setAnns([]);
            setMs([]);
            alert('Annotations flattened successfully. All markups are now part of the PDF.');
          } catch (err: any) {
            console.error('Flatten failed:', err);
            alert('Failed to flatten: ' + (err?.message || 'Unknown error'));
          }
        }}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
        title="Flatten Annotations (burn markups into PDF)"
      >
        <Layers size={15} />
      </button>
      <button
        onClick={() => setHeaderFooterDialogOpen(true)}
        disabled={!pdfData}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors disabled:opacity-30 shrink-0 font-bold text-xs"
        title="Add Header/Footer with Page Numbers"
      >
        HF
      </button>
      <button
        onClick={async () => {
          if (!currentDocument) return;
          const { pageCount, annotations, measurements, measurementUnit, formFields } = useStore.getState();
          // Convert formFields array to a record for easy lookup
          const formFieldValues: Record<string, string | boolean> = {};
          formFields.forEach(f => {
            formFieldValues[f.name] = f.value;
          });
          await exportAnnotatedPdf(pageCount, annotations, measurements, measurementUnit, 'download', formFieldValues);
        }}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
        title="Export PDF"
        data-tour="export-pdf"
      >
        <Download size={15} />
      </button>
      <button
        onClick={() => {
          alert('Windows desktop app coming soon! It requires Rust to build. Contact the developer for more information.');
        }}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
        title="Download Windows App (Coming Soon)"
      >
        <MonitorDown size={15} />
      </button>
      {onOpenReportExport && (
        <button
          onClick={onOpenReportExport}
          disabled={!pdfData}
          className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors disabled:opacity-30 shrink-0"
          title="Export PDF Pages & Images (ZIP)"
          data-tour="export-zip"
        >
          <FileArchive size={15} />
        </button>
      )}
      <button
        onClick={async () => {
          if (!currentDocument) return;
          const { pageCount, annotations, measurements, measurementUnit, formFields } = useStore.getState();
          // Convert formFields array to a record for easy lookup
          const formFieldValues: Record<string, string | boolean> = {};
          formFields.forEach(f => {
            formFieldValues[f.name] = f.value;
          });
          await exportAnnotatedPdf(pageCount, annotations, measurements, measurementUnit, 'print', formFieldValues);
        }}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
        title="Print"
      >
        <Printer size={15} />
      </button>
      <button
        onClick={handleSave}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
        title="Save annotations (Ctrl+S)"
      >
        <Save size={15} />
      </button>
      {activeTabId && tabs.find(t => t.id === activeTabId)?.fileHandle && (
        <button
          onClick={() => setAutoSaveEnabled(!autoSaveEnabled)}
          className={`p-1.5 hover:bg-bb-hover rounded transition-colors shrink-0 ${autoSaveEnabled ? 'text-bb-blue' : 'text-bb-muted hover:text-bb-text'}`}
          title={autoSaveEnabled ? 'AutoSave enabled (click to disable)' : 'AutoSave disabled (click to enable)'}
        >
          <div className="flex items-center gap-1">
            <Save size={15} />
            <span className="text-xs font-bold">AS</span>
          </div>
        </button>
      )}
      {activeTabId && tabs.find(t => t.id === activeTabId)?.documentId && (
        <button
          onClick={() => setCloudSyncEnabled(!cloudSyncEnabled)}
          className={`p-1.5 hover:bg-bb-hover rounded transition-colors shrink-0 ${cloudSyncEnabled ? 'text-bb-blue' : 'text-bb-muted hover:text-bb-text'}`}
          title={cloudSyncEnabled ? 'Cloud sync enabled (click to disable)' : 'Cloud sync disabled (click to enable)'}
        >
          <div className="flex items-center gap-1">
            <Cloud size={15} />
            <span className="text-xs font-bold">CS</span>
          </div>
        </button>
      )}
      <button
        onClick={() => {
          const bimAnnotations = allAnnotations.filter((a) => a.type === 'bim-capture');
          if (bimAnnotations.length === 0) {
            alert('No BIM annotations to export');
            return;
          }
          const { currentDocument, pageCount } = useStore.getState();
          const exportData = {
            document: currentDocument?.name || 'Unknown',
            exportedAt: new Date().toISOString(),
            pageCount: pageCount,
            bimAnnotations: bimAnnotations.map((ann) => ({
              id: ann.id,
              type: ann.bimContent?.type,
              pageIndex: ann.pageIndex,
              position: ann.points[0],
              data: ann.bimContent,
              createdAt: new Date(ann.createdAt).toISOString(),
              updatedAt: new Date(ann.updatedAt).toISOString(),
            })),
          };
          const jsonStr = JSON.stringify(exportData, null, 2);
          const blob = new Blob([jsonStr], { type: 'application/json' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = `${currentDocument?.name || 'document'}_bim_data.json`;
          a.click();
          URL.revokeObjectURL(url);
        }}
        disabled={allAnnotations.filter((a) => a.type === 'bim-capture').length === 0}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors disabled:opacity-30 shrink-0"
        title="Export BIM Data as JSON"
      >
        <FileJson size={15} />
      </button>

      <button
        onClick={() => {
          if (!currentDocument || !pdfData) {
            alert('Open a PDF first.');
            return;
          }
          onOpenSignDialog?.();
        }}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
        title="Digital Signature (import certificate)"
      >
        <ShieldCheck size={15} />
      </button>

      {pdfLocked && (
        <span className="flex items-center gap-1 text-[10px] text-amber-400 font-semibold uppercase tracking-wider shrink-0" title="PDF is locked after digital signature">
          🔒 Locked
        </span>
      )}

      <button
        onClick={() => {
          if (isMobile && onToggleRightSidebar) {
            onToggleRightSidebar();
          } else {
            toggleRightSidebar();
          }
        }}
        className="p-1.5 hover:bg-bb-hover rounded text-bb-muted hover:text-bb-text transition-colors shrink-0"
        title="Toggle Tool Chest"
      >
        <PanelRightOpen size={16} />
      </button>

      <div className="w-px h-6 bg-bb-border mx-1 shrink-0" />

      {user && (
        <div className="flex items-center gap-2 shrink-0">
          <span className="text-[11px] text-bb-muted truncate max-w-[120px]">
            {user.displayName || user.email}
          </span>
          <button
            onClick={logout}
            className="p-1.5 hover:bg-red-500/20 rounded text-bb-muted hover:text-red-400 transition-colors shrink-0"
            title="Sign Out"
          >
            <LogOut size={14} />
          </button>
        </div>
      )}

      {/* Header/Footer Dialog */}
      <HeaderFooterDialog
        isOpen={headerFooterDialogOpen}
        onClose={() => setHeaderFooterDialogOpen(false)}
      />

      {/* Insert PDF Dialog */}
      <InsertPdfDialog
        isOpen={insertPdfDialogOpen}
        onClose={() => setInsertPdfDialogOpen(false)}
      />
    </header>
  );
}

function AiMenuItem({ icon, label, desc, color, onClick }: { icon: React.ReactNode; label: string; desc: string; color: string; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-start gap-2.5 px-3 py-2 hover:bg-bb-hover text-left transition-colors"
    >
      <span className={`${color} mt-0.5 shrink-0`}>{icon}</span>
      <div className="min-w-0">
        <span className="text-xs font-medium text-bb-text block">{label}</span>
        <span className="text-[10px] text-bb-muted block leading-tight">{desc}</span>
      </div>
    </button>
  );
}
