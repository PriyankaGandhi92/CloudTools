import React, { useCallback, useEffect, useState } from 'react';
import { useStore } from './store/useStore';
import { useAuth } from './hooks/useAuth';
import { useAutoSave } from './hooks/useAutoSave';
import AuthScreen from './components/AuthScreen';
import Header from './components/Header';
import LeftSidebar from './components/LeftSidebar';
import RightSidebar from './components/RightSidebar';
import MainCanvas from './components/MainCanvas';
import SplitCanvas from './components/SplitCanvas';
import ToolBar from './components/ToolBar';
import TabBar from './components/TabBar';
import AnnotationSummary from './components/AnnotationSummary';
import CADCommandLine from './components/CADCommandLine';
import CalibrationDialog from './components/CalibrationDialog';
import AiAnnotateDialog from './components/AiAnnotateDialog';
import OcrDialog from './components/OcrDialog';
import SignatureDialog from './components/SignatureDialog';
import SignaturePadDialog from './components/SignaturePadDialog';
import AiSummaryDialog from './components/AiSummaryDialog';
import PlanReviewDialog from './components/PlanReviewDialog';
import ProjectManager from './components/ProjectManager';
import OpenUrlDialog from './components/OpenUrlDialog';
import AiFillDialog from './components/AiFillDialog';
import WatermarkDialog from './components/WatermarkDialog';
import AiChatPanel from './components/AiChatPanel';
import AiTimelineDialog from './components/AiTimelineDialog';
import AiEngineeringDialog from './components/AiEngineeringDialog';
import ExtensionDialog from './components/ExtensionDialog';
import ShareDialog from './components/ShareDialog';
import BottomBar from './components/BottomBar';
import WelcomeTab from './components/WelcomeTab';
import RecentFilesTab from './components/RecentFilesTab';
import AddressScanDialog from './components/AddressScanDialog';
import ConvertToCADDialog from './components/ConvertToCADDialog';
import NewPdfDialog from './components/NewPdfDialog';
import ReportExportDialog from './components/ReportExportDialog';
import IdentifyElementsDialog from './components/IdentifyElementsDialog';
import QuickStartTour, { useQuickStartTour } from './components/QuickStartTour';
import { useFirebaseSync } from './hooks/useFirebaseSync';
import { useCADPointPicker } from './hooks/useCADPointPicker';
import { loadPdf, getPageCount } from './utils/pdfRenderer';
import { generateDocumentId } from './utils/fileHash';
import { loadAnnotationsFromIndexedDB } from './utils/annotationStorage';
import { isImageFile, imagesToPdf } from './utils/imageToPdf';
import { fetchApiKey, setupExtensionBridge, clearKeyCache } from './utils/license';
import { Loader2, FileText, X } from 'lucide-react';

export default function App() {
  const { user, loading } = useAuth();
  const { showTour, userProfile, closeTour } = useQuickStartTour();
  const { performSilentSave } = useAutoSave();
  const {
    pdfData,
    setPageCount,
    leftSidebarOpen,
    rightSidebarOpen,
    isCalibrating,
    undo,
    redo,
    currentDocument,
    splitView,
    currentPage,
    bookmarks,
    addBookmark,
    tabs,
    activeTabId,
    watermarks,
    setWatermarks,
    pageCount,
    openPdfInNewTab,
    cadCommandLineOpen,
    toggleCADCommandLine,
    recentFiles,
  } = useStore();
  const [isMobile, setIsMobile] = useState(() => window.innerWidth <= 768);
  const [mobileLeftSidebarOpen, setMobileLeftSidebarOpen] = useState(false);
  const [mobileRightSidebarOpen, setMobileRightSidebarOpen] = useState(false);

  // Responsive: handle window resize
  useEffect(() => {
    const onResize = () => {
      const mobile = window.innerWidth <= 768;
      setIsMobile(mobile);
      if (!mobile) {
        setMobileLeftSidebarOpen(false);
        setMobileRightSidebarOpen(false);
      }
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  const [showAiDialog, setShowAiDialog] = useState(false);
  const [showOcrDialog, setShowOcrDialog] = useState(false);
  const [showSignDialog, setShowSignDialog] = useState(false);
  const [showSummaryDialog, setShowSummaryDialog] = useState(false);
  const signaturePadOpen = useStore((s) => s.signaturePadOpen);
  const setSignaturePadOpen = useStore((s) => s.setSignaturePadOpen);
  const [showPlanReview, setShowPlanReview] = useState(false);
  const [showProjectManager, setShowProjectManager] = useState(false);
  const [showOpenUrl, setShowOpenUrl] = useState(false);
  const [showAiFill, setShowAiFill] = useState(false);
  const [showAiChat, setShowAiChat] = useState(false);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showEngParams, setShowEngParams] = useState(false);
  const [showExtension, setShowExtension] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showWatermarkDialog, setShowWatermarkDialog] = useState(false);
  const [showAddressScan, setShowAddressScan] = useState(false);
  const [showConvertToCad, setShowConvertToCad] = useState(false);
  const [shareUrl, setShareUrl] = useState('');
  const [shareUploading, setShareUploading] = useState(false);
  const [shareError, setShareError] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const [showNewPdfDialog, setShowNewPdfDialog] = useState(false);
  const [showReportExport, setShowReportExport] = useState(false);
  const [showIdentifyElements, setShowIdentifyElements] = useState(false);

  // Multi-user real-time sync via Firestore
  const { uploadAndSharePdf } = useFirebaseSync(currentDocument?.id ?? null);

  // CAD command point picking
  const { completePolyline } = useCADPointPicker();

  // Set completePolyline in store for global access
  useEffect(() => {
    useStore.getState().setCompletePolyline(completePolyline);
  }, [completePolyline]);

  // Handle Enter/Escape to complete polyline when in CAD mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { cadPendingCommand } = useStore.getState();
      if (cadPendingCommand && (cadPendingCommand.toUpperCase() === 'PLINE' || cadPendingCommand.toUpperCase() === 'PL')) {
        if (e.key === 'Enter' || e.key === 'Escape') {
          // Ignore if typing in input
          const target = e.target as HTMLElement;
          if (target.tagName !== 'INPUT' && target.tagName !== 'TEXTAREA') {
            e.preventDefault();
            completePolyline();
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [completePolyline]);

  // Handle mobile back button as Escape key
  useEffect(() => {
    const handlePopState = (e: PopStateEvent) => {
      // Trigger Escape functionality
      const storeState = useStore.getState();
      
      // Cancel drawing
      if (storeState.isDrawing) {
        storeState.setIsDrawing(false);
        storeState.setDrawingPoints([]);
      }
      
      // Cancel calibration
      if (storeState.calibrationPoints.length > 0) {
        storeState.setCalibrationPoints([]);
        storeState.setIsCalibrating(false);
      }
      
      // Clear selection
      storeState.clearAnnotationSelection();
      
      // Cancel CAD commands
      storeState.setCADSelectionMode(null);
      storeState.clearCADSelectedIds();
      storeState.setCADPendingCommand(null);
      storeState.clearCADPendingPoints();
      storeState.setCADCommandStep(0);
      
      // Prevent default back navigation
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
    };

    // Push initial state to enable popstate handling
    window.history.pushState(null, '', window.location.href);
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Auto-focus command line when open - capture global keystrokes
  useEffect(() => {
    if (!cadCommandLineOpen) return;

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      // Ignore if typing in an input/textarea/select
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      // Ignore if modifier keys are pressed (Ctrl, Alt, Meta)
      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      // Ignore function keys and navigation keys
      if (e.key.startsWith('F') || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
        return;
      }

      // Ignore Escape (used to close command line)
      if (e.key === 'Escape') {
        return;
      }

      // Focus the command line input
      const commandInput = document.querySelector('input[placeholder*="Type command"]') as HTMLInputElement;
      if (commandInput) {
        commandInput.focus();
        // If it's a printable character, add it to the input
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          // Prevent the browser from ALSO inserting this character into the
          // now-focused input (which caused the first keystroke to double, e.g. "RR")
          e.preventDefault();
          const currentValue = commandInput.value;
          commandInput.value = currentValue + e.key.toUpperCase();
          // Trigger change event
          const event = new Event('input', { bubbles: true });
          commandInput.dispatchEvent(event);
        }
      }
    };

    window.addEventListener('keydown', handleGlobalKeydown);
    return () => window.removeEventListener('keydown', handleGlobalKeydown);
  }, [cadCommandLineOpen]);

  // Auto-fetch API key for paid users & set up extension bridge
  useEffect(() => {
    if (user) {
      // Fire-and-forget with delay to ensure UI renders first
      setTimeout(() => {
        fetchApiKey().catch(err => {
          console.warn('[App] Background API key fetch failed:', err);
        });
      }, 1000);
      setupExtensionBridge();
    } else {
      clearKeyCache();
    }
  }, [user]);

  // Initialize welcome/recent tab on first load
  useEffect(() => {
    if (user && tabs.length === 0 && !activeTabId && !pdfData) {
      const welcomeTab = {
        id: 'welcome',
        name: 'Welcome',
        pdfData: new ArrayBuffer(0), // NEVER holds actual PDF bytes
        pageCount: 0,
        currentPage: 0,
        annotations: [],
        measurements: [],
        calibrations: {},
        bookmarks: [],
        isWelcome: true,
      };
      useStore.getState().addTab(welcomeTab);
      useStore.getState().setActiveTab('welcome');
    }
  }, [user, tabs, activeTabId, pdfData]);

  // Update welcome tab name based on whether PDFs are open
  useEffect(() => {
    const allTabs = useStore.getState().tabs;
    const welcomeTab = allTabs.find(t => t.id === 'welcome');
    if (welcomeTab) {
      const hasPdfTabs = allTabs.some(t => t.id !== 'welcome' && t.pdfData.byteLength > 0);
      const newName = hasPdfTabs ? 'RECENT' : 'Welcome';
      if (welcomeTab.name !== newName) {
        useStore.getState().updateTab('welcome', { name: newName });
      }
    }
  }, [tabs]);

  useEffect(() => {
    if (pdfData) {
      let cancelled = false;
      loadPdf(pdfData).then(() => {
        if (cancelled) return;
        setPageCount(getPageCount());
        useStore.getState().bumpPdfReadyKey();
      });
      return () => { cancelled = true; };
    }
  }, [pdfData, setPageCount]);

  // Auto-open PDF from ?url= query parameter (web PDFs)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pdfUrl = params.get('url');
    if (!pdfUrl) return;
    // Clear the URL param so it doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname);
    (async () => {
      try {
        let res: Response;
        try { res = await fetch(pdfUrl); } catch {
          res = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(pdfUrl)}`);
        }
        if (!res.ok) return;
        const buf = await res.arrayBuffer();
        const header = String.fromCharCode(...new Uint8Array(buf.slice(0, 5)));
        if (!header.startsWith('%PDF')) return;

        const urlObj = new URL(pdfUrl);
        const name = decodeURIComponent(urlObj.pathname.split('/').pop() || 'online.pdf');

        const doc = await loadPdf(buf);
        // Force it into a brand new tab, leaving 'welcome' untouched
        useStore.getState().openPdfInNewTab(name, buf, doc.numPages);
      } catch { /* silently fail */ }
    })();
  }, []);

  // Auto-open PDF from ?data= query parameter (base64-encoded from extension)
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dataUrl = params.get('data');
    if (!dataUrl) return;
    // Clear the URL param so it doesn't re-trigger
    window.history.replaceState({}, '', window.location.pathname);
    (async () => {
      try {
        const res = await fetch(dataUrl);
        const buf = await res.arrayBuffer();
        const header = String.fromCharCode(...new Uint8Array(buf.slice(0, 5)));
        if (!header.startsWith('%PDF')) return;

        const doc = await loadPdf(buf);
        // Force it into a brand new tab
        useStore.getState().openPdfInNewTab('local.pdf', buf, doc.numPages);
      } catch (err) {
        console.error('Failed to load PDF from data URL:', err);
      }
    })();
  }, []);

  // PWA File Handling API — handle files opened via OS "Open with"
  useEffect(() => {
    if (!('launchQueue' in window)) return;
    (window as any).launchQueue.setConsumer(async (launchParams: any) => {
      if (!launchParams.files?.length) return;

      const imageHandles: any[] = [];
      const imageFiles: File[] = [];

      for (const handle of launchParams.files) {
        const file: File = await handle.getFile();
        const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
        if (isPdf) {
          try {
            const buf = await file.arrayBuffer();
            const doc = await loadPdf(buf);
            const documentId = await generateDocumentId(buf);
            await useStore.getState().openPdfInNewTab(file.name, buf, doc.numPages);
            // Track file handle and documentId on the newly opened tab
            const newTabId = useStore.getState().activeTabId;
            if (newTabId) {
              useStore.getState().updateTab(newTabId, { fileHandle: handle, documentId });
              useStore.getState().setDocumentId(documentId);
            }
            // Load annotations from IndexedDB if they exist
            const storedAnnotations = await loadAnnotationsFromIndexedDB(documentId);
            if (storedAnnotations) {
              console.log('[App] Loaded annotations from IndexedDB for', documentId);
              useStore.getState().setAnnotations(storedAnnotations.annotations);
              useStore.getState().setMeasurements(storedAnnotations.measurements);
              Object.entries(storedAnnotations.calibrations).forEach(([pageIndex, cal]) => {
                useStore.getState().setCalibration(parseInt(pageIndex), cal);
              });
              useStore.getState().setBookmarks(storedAnnotations.bookmarks);
              useStore.getState().setCurrentPage(storedAnnotations.currentPage);
              // Also update the tab's annotations to match
              if (newTabId) {
                useStore.getState().updateTab(newTabId, {
                  annotations: storedAnnotations.annotations,
                  measurements: storedAnnotations.measurements,
                  calibrations: storedAnnotations.calibrations,
                  bookmarks: storedAnnotations.bookmarks,
                  currentPage: storedAnnotations.currentPage
                });
              }
            }
          } catch (err) {
            console.error('Failed to open PDF via launchQueue:', err);
          }
        } else if (isImageFile(file)) {
          imageHandles.push(handle);
          imageFiles.push(file);
        }
      }

      // Convert any images dropped via "Open with" into a single PDF tab
      if (imageFiles.length > 0) {
        try {
          const { buffer, pageCount } = await imagesToPdf(imageFiles);
          const baseName =
            imageFiles.length === 1
              ? imageFiles[0].name.replace(/\.[^.]+$/, '')
              : `Images (${imageFiles.length})`;
          useStore.getState().openPdfInNewTab(`${baseName}.pdf`, buffer, pageCount);
        } catch (err) {
          console.error('Failed to convert images via launchQueue:', err);
        }
      }
    });
  }, []);

  // Drag and drop handlers - only trigger for actual file drops, not internal UI drags
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Only show drop overlay if files are being dragged (not internal UI elements)
    const hasFiles = e.dataTransfer.types.includes('Files') || e.dataTransfer.files.length > 0;
    if (hasFiles) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
    // Only process if there are actual files
    if (e.dataTransfer.files.length === 0) return;

    const files = Array.from(e.dataTransfer.files);
    const pdfFiles = files.filter((file) => file.type === 'application/pdf');
    const imageFiles = files.filter((file) => isImageFile(file));

    // Open each PDF in a new tab
    for (const file of pdfFiles) {
      try {
        const buffer = await file.arrayBuffer();
        const doc = await loadPdf(buffer);
        const documentId = await generateDocumentId(buffer);
        await useStore.getState().openPdfInNewTab(file.name, buffer, doc.numPages);
        // Set documentId on the newly opened tab
        const newTabId = useStore.getState().activeTabId;
        if (newTabId) {
          useStore.getState().updateTab(newTabId, { documentId });
          useStore.getState().setDocumentId(documentId);
        }
        // Load annotations from IndexedDB if they exist
        const storedAnnotations = await loadAnnotationsFromIndexedDB(documentId);
        if (storedAnnotations) {
          console.log('[App] Loaded annotations from IndexedDB for', documentId);
          useStore.getState().setAnnotations(storedAnnotations.annotations);
          useStore.getState().setMeasurements(storedAnnotations.measurements);
          Object.entries(storedAnnotations.calibrations).forEach(([pageIndex, cal]) => {
            useStore.getState().setCalibration(parseInt(pageIndex), cal);
          });
          useStore.getState().setBookmarks(storedAnnotations.bookmarks);
          useStore.getState().setCurrentPage(storedAnnotations.currentPage);
          // Also update the tab's annotations to match
          if (newTabId) {
            useStore.getState().updateTab(newTabId, {
              annotations: storedAnnotations.annotations,
              measurements: storedAnnotations.measurements,
              calibrations: storedAnnotations.calibrations,
              bookmarks: storedAnnotations.bookmarks,
              currentPage: storedAnnotations.currentPage
            });
          }
        }
      } catch (error) {
        console.error('Failed to load PDF:', file.name, error);
      }
    }

    // Convert dropped images into a single PDF tab
    if (imageFiles.length > 0) {
      try {
        const { buffer, pageCount } = await imagesToPdf(imageFiles);
        const baseName =
          imageFiles.length === 1
            ? imageFiles[0].name.replace(/\.[^.]+$/, '')
            : `Images (${imageFiles.length})`;
        openPdfInNewTab(`${baseName}.pdf`, buffer, pageCount);
      } catch (error) {
        console.error('Failed to convert images to PDF:', error);
      }
    }
  };

  // New blank PDF handler
  const handleCreateBlankPdf = (name: string, buffer: ArrayBuffer, pageCount: number) => {
    openPdfInNewTab(name, buffer, pageCount);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      // If the user is actively typing in ANY input or textarea, ignore global hotkeys
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      // Ctrl+O: open a PDF from disk inside the app (prevent browser default)
      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        (async () => {
          try {
            // Prefer the File System Access API so we can also track the handle
            // for Ctrl+S save-back.
            if ('showOpenFilePicker' in window) {
              const [handle] = await (window as any).showOpenFilePicker({
                types: [{ description: 'PDF', accept: { 'application/pdf': ['.pdf'] } }],
                multiple: false,
              });
              const file: File = await handle.getFile();
              if (file.type !== 'application/pdf' && !/\.pdf$/i.test(file.name)) return;
              const buffer = await file.arrayBuffer();
              const doc = await loadPdf(buffer);
              const documentId = await generateDocumentId(buffer);
              await useStore.getState().openPdfInNewTab(file.name, buffer, doc.numPages);
              // Track file handle and documentId on the newly opened tab
              const newTabId = useStore.getState().activeTabId;
              if (newTabId) {
                useStore.getState().updateTab(newTabId, { fileHandle: handle, documentId });
                useStore.getState().setDocumentId(documentId);
              }
              // Load annotations from IndexedDB if they exist
              const storedAnnotations = await loadAnnotationsFromIndexedDB(documentId);
              if (storedAnnotations) {
                console.log('[App] Loaded annotations from IndexedDB for', documentId);
                useStore.getState().setAnnotations(storedAnnotations.annotations);
                useStore.getState().setMeasurements(storedAnnotations.measurements);
                Object.entries(storedAnnotations.calibrations).forEach(([pageIndex, cal]) => {
                  useStore.getState().setCalibration(parseInt(pageIndex), cal);
                });
                useStore.getState().setBookmarks(storedAnnotations.bookmarks);
                useStore.getState().setCurrentPage(storedAnnotations.currentPage);
                // Also update the tab's annotations to match
                if (newTabId) {
                  useStore.getState().updateTab(newTabId, {
                    annotations: storedAnnotations.annotations,
                    measurements: storedAnnotations.measurements,
                    calibrations: storedAnnotations.calibrations,
                    bookmarks: storedAnnotations.bookmarks,
                    currentPage: storedAnnotations.currentPage
                  });
                }
              }
            } else {
              // Fallback: hidden <input type=file>
              const input = document.createElement('input');
              input.type = 'file';
              input.accept = 'application/pdf,.pdf';
              input.onchange = async () => {
                const file = input.files?.[0];
                if (!file) return;
                const buffer = await file.arrayBuffer();
                const doc = await loadPdf(buffer);
                useStore.getState().openPdfInNewTab(file.name, buffer, doc.numPages);
              };
              input.click();
            }
          } catch (err: any) {
            if (err?.name !== 'AbortError') console.error('Ctrl+O open failed:', err);
          }
        })();
        return;
      }
      // Tab switching shortcuts.
      // NOTE: Browsers reserve Ctrl+Tab / Alt+Tab and consume them before the
      // page can receive the keydown, so those cannot be overridden. We use
      // Ctrl+PageDown / Ctrl+PageUp (cycle) and Alt+1..9 (jump to index)
      // which every major browser lets through to the page.
      const cycleTabs = (dir: 1 | -1) => {
        const s = useStore.getState();
        const list = s.tabs;
        if (list.length <= 1) return;
        const curIdx = list.findIndex((t) => t.id === s.activeTabId);
        const nextIdx = (curIdx + dir + list.length) % list.length;
        const next = list[nextIdx];
        if (next && next.id !== s.activeTabId) s.switchToTab(next.id);
      };
      if (e.ctrlKey && !e.altKey && (e.key === 'PageDown' || e.key === 'PageUp')) {
        e.preventDefault();
        cycleTabs(e.key === 'PageDown' ? 1 : -1);
        return;
      }
      // Ctrl+Tab still works on browsers that permit it (and will be ignored
      // otherwise). Kept for users outside Chrome.
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        cycleTabs(e.shiftKey ? -1 : 1);
        return;
      }
      // Alt+1..9 → jump to that tab index
      if (e.altKey && !e.ctrlKey && !e.shiftKey && /^[1-9]$/.test(e.key)) {
        const s = useStore.getState();
        const idx = parseInt(e.key, 10) - 1;
        const target = s.tabs[idx];
        if (target) {
          e.preventDefault();
          if (target.id !== s.activeTabId) s.switchToTab(target.id);
        }
        return;
      }
      if (e.ctrlKey && e.key === 'z') {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      }
      if (e.ctrlKey && e.key === 'y') {
        e.preventDefault();
        redo();
      }
      // Ctrl+S is now handled by useAutoSave hook
      // Ctrl+B: bookmark current page
      if (e.ctrlKey && e.key === 'b') {
        e.preventDefault();
        const exists = bookmarks.some((b) => b.pageIndex === currentPage);
        if (!exists) {
          addBookmark({
            id: crypto.randomUUID(),
            pageIndex: currentPage,
            name: `Page ${currentPage + 1}`,
            createdAt: Date.now(),
          });
        }
      }
      // Ctrl+9: toggle CAD command line
      if (e.ctrlKey && e.key === '9') {
        e.preventDefault();
        toggleCADCommandLine();
      }
    },
    [undo, redo, bookmarks, currentPage, addBookmark, toggleCADCommandLine]
  );

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);

  if (loading) {
    return (
      <div className="h-full flex items-center justify-center bg-bb-dark">
        <Loader2 size={32} className="animate-spin text-bb-blue" />
      </div>
    );
  }

  if (!user) {
    return <AuthScreen />;
  }

  return (
    <div
      className="h-full flex flex-col bg-bb-dark text-bb-text"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
      {/* Drag overlay indicator */}
      {isDragging && (
        <div className="fixed inset-0 bg-bb-blue/20 border-4 border-bb-blue border-dashed z-50 flex items-center justify-center">
          <div className="bg-bb-panel border border-bb-border rounded-lg p-8 shadow-xl relative">
            <button
              onClick={() => setIsDragging(false)}
              className="absolute top-2 right-2 p-1 hover:bg-bb-hover rounded text-bb-muted"
            >
              <X size={16} />
            </button>
            <p className="text-xl font-semibold text-bb-text flex items-center gap-3">
              <FileText size={24} className="text-bb-blue" />
              Drop PDF or image files to open in new tabs
            </p>
          </div>
        </div>
      )}
      <Header
        isMobile={isMobile}
        onToggleLeftSidebar={() => setMobileLeftSidebarOpen(!mobileLeftSidebarOpen)}
        onToggleRightSidebar={() => setMobileRightSidebarOpen(!mobileRightSidebarOpen)}
        onOpenAiDialog={() => setShowAiDialog(true)}
        onOpenOcrDialog={() => setShowOcrDialog(true)}
        onOpenSignDialog={() => setShowSignDialog(true)}
        onOpenSummaryDialog={() => setShowSummaryDialog(true)}
        onOpenPlanReview={() => setShowPlanReview(true)}
        onOpenProjectManager={() => setShowProjectManager(true)}
        onOpenUrl={() => setShowOpenUrl(true)}
        onOpenAiFill={() => setShowAiFill(true)}
        onOpenAiChat={() => setShowAiChat(true)}
        onOpenTimeline={() => setShowTimeline(true)}
        onOpenEngParams={() => setShowEngParams(true)}
        onOpenExtension={() => setShowExtension(true)}
        onOpenAddressScan={() => setShowAddressScan(true)}
        onOpenConvertToCad={() => setShowConvertToCad(true)}
        onOpenReportExport={() => setShowReportExport(true)}
        onOpenIdentifyElements={() => setShowIdentifyElements(true)}
        onShare={async () => {
          if (!currentDocument || !pdfData) return;
          setShareUrl('');
          setShareError('');
          setShareUploading(true);
          setShowShareDialog(true);
          try {
            await uploadAndSharePdf(currentDocument.name, pdfData);
            const url = `${window.location.origin}?doc=${currentDocument.id}`;
            setShareUrl(url);
          } catch (err: any) {
            setShareError(err?.message || 'Upload failed');
            setShareUrl(`${window.location.origin}?doc=${currentDocument.id}`);
          } finally {
            setShareUploading(false);
          }
        }}
        onSharePdf={uploadAndSharePdf}
      />
      <ToolBar onWatermarkClick={() => setShowWatermarkDialog(true)} />
      {!isMobile && <TabBar onNewPdfClick={() => setShowNewPdfDialog(true)} />}
      <div className="flex flex-1 overflow-hidden relative">
        {/* Desktop sidebar - Left */}
        {!isMobile && leftSidebarOpen && <LeftSidebar />}
        <div className="flex flex-1 overflow-hidden">
          {activeTabId === 'welcome' ? (
            recentFiles.length > 0 ? <RecentFilesTab /> : <WelcomeTab />
          ) : (
            <>
              <MainCanvas />
              {splitView && pdfData && !isMobile && (
                <>
                  <div className="w-px bg-bb-border shrink-0" />
                  <SplitCanvas />
                </>
              )}
            </>
          )}
        </div>
        {/* Desktop sidebar - Right */}
        {!isMobile && rightSidebarOpen && <RightSidebar />}
      </div>
      <div className="relative z-[80]">
        <CADCommandLine isOpen={cadCommandLineOpen} onToggle={toggleCADCommandLine} />
      </div>
      {!isMobile && <AnnotationSummary />}
      <BottomBar />
      {/* Mobile sidebar overlay - Left */}
      {isMobile && mobileLeftSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={() => setMobileLeftSidebarOpen(false)}
          />
          <div className="fixed left-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-bb-sidebar border-r border-bb-border z-[70]">
            <LeftSidebar />
          </div>
        </>
      )}
      {/* Mobile sidebar overlay - Right */}
      {isMobile && mobileRightSidebarOpen && (
        <>
          <div
            className="fixed inset-0 bg-black/50 z-[60]"
            onClick={() => setMobileRightSidebarOpen(false)}
          />
          <div className="fixed right-0 top-0 bottom-0 w-[85%] max-w-[320px] bg-bb-sidebar border-l border-bb-border z-[70]">
            <RightSidebar />
          </div>
        </>
      )}
      {isCalibrating && <CalibrationDialog />}
      {showAiDialog && <AiAnnotateDialog onClose={() => setShowAiDialog(false)} />}
      {showOcrDialog && <OcrDialog onClose={() => setShowOcrDialog(false)} />}
      {showSignDialog && <SignatureDialog onClose={() => setShowSignDialog(false)} />}
      {signaturePadOpen && <SignaturePadDialog onClose={() => setSignaturePadOpen(false)} />}
      {showSummaryDialog && <AiSummaryDialog onClose={() => setShowSummaryDialog(false)} />}
      {showPlanReview && <PlanReviewDialog onClose={() => setShowPlanReview(false)} />}
      {showProjectManager && <ProjectManager onClose={() => setShowProjectManager(false)} />}
      {showOpenUrl && <OpenUrlDialog onClose={() => setShowOpenUrl(false)} />}
      {showAiFill && <AiFillDialog onClose={() => setShowAiFill(false)} />}
      {showAiChat && <AiChatPanel onClose={() => setShowAiChat(false)} />}
      {showTimeline && <AiTimelineDialog onClose={() => setShowTimeline(false)} />}
      {showEngParams && <AiEngineeringDialog onClose={() => setShowEngParams(false)} />}
      {showExtension && <ExtensionDialog onClose={() => setShowExtension(false)} />}
      {showConvertToCad && <ConvertToCADDialog onClose={() => setShowConvertToCad(false)} />}
      {showWatermarkDialog && (
        <WatermarkDialog
          isOpen={showWatermarkDialog}
          onClose={() => setShowWatermarkDialog(false)}
          onSave={(watermarks) => setWatermarks(watermarks)}
          pageCount={pageCount}
          currentPage={currentPage}
          existingWatermarks={watermarks}
        />
      )}
      {showShareDialog && (
        <ShareDialog
          onClose={() => setShowShareDialog(false)}
          shareUrl={shareUrl}
          uploading={shareUploading}
          error={shareError}
        />
      )}
      {showAddressScan && <AddressScanDialog onClose={() => setShowAddressScan(false)} />}
      {showNewPdfDialog && (
        <NewPdfDialog
          isOpen={showNewPdfDialog}
          onClose={() => setShowNewPdfDialog(false)}
          onCreate={handleCreateBlankPdf}
        />
      )}
      {showReportExport && (
        <ReportExportDialog onClose={() => setShowReportExport(false)} />
      )}
      {showIdentifyElements && (
        <IdentifyElementsDialog onClose={() => setShowIdentifyElements(false)} />
      )}
      {showTour && userProfile && (
        <QuickStartTour userProfile={userProfile} onClose={closeTour} />
      )}
    </div>
  );
}
