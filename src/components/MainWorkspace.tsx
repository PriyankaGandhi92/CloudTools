import React, { useCallback, useEffect, useState, Suspense, lazy } from 'react';
import { useStore } from '../store/useStore';
import { useAutoSave } from '../hooks/useAutoSave';
import Header from './Header';
import LeftSidebar from './LeftSidebar';
import RightSidebar from './RightSidebar';
import MainCanvas from './MainCanvas';
import SplitCanvas from './SplitCanvas';
import ToolBar from './ToolBar';
import TabBar from './TabBar';
import AnnotationSummary from './AnnotationSummary';
import CADCommandLine from './CADCommandLine';
import CalibrationDialog from './CalibrationDialog';
import BottomBar from './BottomBar';
import WelcomeTab from './WelcomeTab';
import RecentFilesTab from './RecentFilesTab';
import CloudStatusToast from './CloudStatusToast';
import QuickStartTour, { useQuickStartTour } from './QuickStartTour';
import { useFirebaseSync } from '../hooks/useFirebaseSync';
import { useCADPointPicker } from '../hooks/useCADPointPicker';
import { loadPdf, getPageCount } from '../utils/pdfRenderer';
import { generateDocumentId } from '../utils/fileHash';
import { loadAnnotationsFromIndexedDB } from '../utils/annotationStorage';
import { isImageFile, imagesToPdf } from '../utils/imageToPdf';
import { fetchApiKey, setupExtensionBridge, clearKeyCache } from '../utils/license';
import { Loader2, FileText, X } from 'lucide-react';

// Lazy-load all heavy AI and export dialogs
const SmartRewriteDialog = lazy(() => import('./SmartRewriteDialog'));
const ConvertToCADDialog = lazy(() => import('./ConvertToCADDialog'));
const PlanReviewDialog = lazy(() => import('./PlanReviewDialog'));
const AiAnnotateDialog = lazy(() => import('./AiAnnotateDialog'));
const OcrDialog = lazy(() => import('./OcrDialog'));
const SignatureDialog = lazy(() => import('./SignatureDialog'));
const SignaturePadDialog = lazy(() => import('./SignaturePadDialog'));
const AiSummaryDialog = lazy(() => import('./AiSummaryDialog'));
const ProjectManager = lazy(() => import('./ProjectManager'));
const OpenUrlDialog = lazy(() => import('./OpenUrlDialog'));
const AiFillDialog = lazy(() => import('./AiFillDialog'));
const WatermarkDialog = lazy(() => import('./WatermarkDialog'));
const AiChatPanel = lazy(() => import('./AiChatPanel'));
const AiTimelineDialog = lazy(() => import('./AiTimelineDialog'));
const AiEngineeringDialog = lazy(() => import('./AiEngineeringDialog'));
const ExtensionDialog = lazy(() => import('./ExtensionDialog'));
const ShareDialog = lazy(() => import('./ShareDialog'));
const AddressScanDialog = lazy(() => import('./AddressScanDialog'));
const NewPdfDialog = lazy(() => import('./NewPdfDialog'));
const ReportExportDialog = lazy(() => import('./ReportExportDialog'));
const IdentifyElementsDialog = lazy(() => import('./IdentifyElementsDialog'));

export default function MainWorkspace() {
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
  const [showSmartRewrite, setShowSmartRewrite] = useState(false);
  const [selectedText, setSelectedText] = useState('');

  // Multi-user real-time sync via Firestore
  const { uploadAndSharePdf } = useFirebaseSync(currentDocument?.id ?? null);

  // CAD command point picking
  const { completePolyline } = useCADPointPicker();

  // Set completePolyline in store for global access
  useEffect(() => {
    useStore.getState().setCompletePolyline(completePolyline);
  }, [completePolyline]);

  // Open the Reports & Exports dialog when triggered from the Tasks sidebar
  useEffect(() => {
    const openExport = () => setShowReportExport(true);
    window.addEventListener('open-export-dialog', openExport);
    return () => window.removeEventListener('open-export-dialog', openExport);
  }, []);

  // Handle Enter/Escape to complete polyline when in CAD mode
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const { cadPendingCommand } = useStore.getState();
      if (cadPendingCommand && (cadPendingCommand.toUpperCase() === 'PLINE' || cadPendingCommand.toUpperCase() === 'PL')) {
        if (e.key === 'Enter' || e.key === 'Escape') {
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
      const storeState = useStore.getState();
      
      if (storeState.isDrawing) {
        storeState.setIsDrawing(false);
        storeState.setDrawingPoints([]);
      }
      
      if (storeState.calibrationPoints.length > 0) {
        storeState.setCalibrationPoints([]);
        storeState.setIsCalibrating(false);
      }
      
      storeState.clearAnnotationSelection();
      
      storeState.setCADSelectionMode(null);
      storeState.clearCADSelectedIds();
      storeState.setCADPendingCommand(null);
      storeState.clearCADPendingPoints();
      storeState.setCADCommandStep(0);
      
      e.preventDefault();
      window.history.pushState(null, '', window.location.href);
    };

    window.history.pushState(null, '', window.location.href);
    
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  // Auto-focus command line when open
  useEffect(() => {
    if (!cadCommandLineOpen) return;

    const handleGlobalKeydown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT') {
        return;
      }

      if (e.ctrlKey || e.altKey || e.metaKey) {
        return;
      }

      if (e.key.startsWith('F') || ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'].includes(e.key)) {
        return;
      }

      if (e.key === 'Escape') {
        return;
      }

      const commandInput = document.querySelector('input[placeholder*="Type command"]') as HTMLInputElement;
      if (commandInput) {
        commandInput.focus();
        if (e.key.length === 1 && !e.ctrlKey && !e.altKey && !e.metaKey) {
          e.preventDefault();
          const currentValue = commandInput.value;
          commandInput.value = currentValue + e.key.toUpperCase();
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
    const user = useStore.getState().currentUser;
    if (user) {
      setTimeout(() => {
        fetchApiKey().catch(err => {
          console.warn('[MainWorkspace] Background API key fetch failed:', err);
        });
      }, 1000);
      setupExtensionBridge();
    } else {
      clearKeyCache();
    }
  }, []);

  // Initialize welcome/recent tab on first load
  useEffect(() => {
    const user = useStore.getState().currentUser;
    if (user && tabs.length === 0 && !activeTabId && !pdfData) {
      const welcomeTab = {
        id: 'welcome',
        name: 'Welcome',
        pdfData: new ArrayBuffer(0),
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
  }, [tabs, activeTabId, pdfData]);

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

  // Auto-open PDF from ?url= query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const pdfUrl = params.get('url');
    if (!pdfUrl) return;
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
        useStore.getState().openPdfInNewTab(name, buf, doc.numPages);
      } catch { /* silently fail */ }
    })();
  }, []);

  // Auto-open PDF from ?data= query parameter
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const dataUrl = params.get('data');
    if (!dataUrl) return;
    window.history.replaceState({}, '', window.location.pathname);
    (async () => {
      try {
        const res = await fetch(dataUrl);
        const buf = await res.arrayBuffer();
        const header = String.fromCharCode(...new Uint8Array(buf.slice(0, 5)));
        if (!header.startsWith('%PDF')) return;

        const doc = await loadPdf(buf);
        useStore.getState().openPdfInNewTab('local.pdf', buf, doc.numPages);
      } catch (err) {
        console.error('Failed to load PDF from data URL:', err);
      }
    })();
  }, []);

  // PWA File Handling API
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
            const newTabId = useStore.getState().activeTabId;
            if (newTabId) {
              useStore.getState().updateTab(newTabId, { fileHandle: handle, documentId });
              useStore.getState().setDocumentId(documentId);
            }
            const storedAnnotations = await loadAnnotationsFromIndexedDB(documentId);
            if (storedAnnotations) {
              console.log('[MainWorkspace] Loaded annotations from IndexedDB for', documentId);
              useStore.getState().setAnnotations(storedAnnotations.annotations);
              useStore.getState().setMeasurements(storedAnnotations.measurements);
              Object.entries(storedAnnotations.calibrations).forEach(([pageIndex, cal]) => {
                useStore.getState().setCalibration(parseInt(pageIndex), cal);
              });
              useStore.getState().setBookmarks(storedAnnotations.bookmarks);
              useStore.getState().setCurrentPage(storedAnnotations.currentPage);
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

  // Drag and drop handlers
  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
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
    if (e.dataTransfer.files.length === 0) return;

    const files = Array.from(e.dataTransfer.files);
    const pdfFiles = files.filter((file) => file.type === 'application/pdf');
    const imageFiles = files.filter((file) => isImageFile(file));

    for (const file of pdfFiles) {
      try {
        const buffer = await file.arrayBuffer();
        const doc = await loadPdf(buffer);
        const documentId = await generateDocumentId(buffer);
        await useStore.getState().openPdfInNewTab(file.name, buffer, doc.numPages);
        const newTabId = useStore.getState().activeTabId;
        if (newTabId) {
          useStore.getState().updateTab(newTabId, { documentId });
          useStore.getState().setDocumentId(documentId);
        }
        const storedAnnotations = await loadAnnotationsFromIndexedDB(documentId);
        if (storedAnnotations) {
          console.log('[MainWorkspace] Loaded annotations from IndexedDB for', documentId);
          useStore.getState().setAnnotations(storedAnnotations.annotations);
          useStore.getState().setMeasurements(storedAnnotations.measurements);
          Object.entries(storedAnnotations.calibrations).forEach(([pageIndex, cal]) => {
            useStore.getState().setCalibration(parseInt(pageIndex), cal);
          });
          useStore.getState().setBookmarks(storedAnnotations.bookmarks);
          useStore.getState().setCurrentPage(storedAnnotations.currentPage);
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

  const handleCreateBlankPdf = (name: string, buffer: ArrayBuffer, pageCount: number) => {
    openPdfInNewTab(name, buffer, pageCount);
  };

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }

      if (e.ctrlKey && !e.shiftKey && !e.altKey && (e.key === 'o' || e.key === 'O')) {
        e.preventDefault();
        (async () => {
          try {
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
              const newTabId = useStore.getState().activeTabId;
              if (newTabId) {
                useStore.getState().updateTab(newTabId, { fileHandle: handle, documentId });
                useStore.getState().setDocumentId(documentId);
              }
              const storedAnnotations = await loadAnnotationsFromIndexedDB(documentId);
              if (storedAnnotations) {
                console.log('[MainWorkspace] Loaded annotations from IndexedDB for', documentId);
                useStore.getState().setAnnotations(storedAnnotations.annotations);
                useStore.getState().setMeasurements(storedAnnotations.measurements);
                Object.entries(storedAnnotations.calibrations).forEach(([pageIndex, cal]) => {
                  useStore.getState().setCalibration(parseInt(pageIndex), cal);
                });
                useStore.getState().setBookmarks(storedAnnotations.bookmarks);
                useStore.getState().setCurrentPage(storedAnnotations.currentPage);
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
      if (e.ctrlKey && e.key === 'Tab') {
        e.preventDefault();
        cycleTabs(e.shiftKey ? -1 : 1);
        return;
      }
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

  return (
    <div
      className="h-full flex flex-col bg-bb-dark text-bb-text"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
    >
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
        onOpenSmartRewrite={() => {
          setSelectedText('Sample text to rewrite');
          setShowSmartRewrite(true);
        }}
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
        {!isMobile && rightSidebarOpen && <RightSidebar />}
      </div>
      <div className="relative z-[80]">
        <CADCommandLine isOpen={cadCommandLineOpen} onToggle={toggleCADCommandLine} />
      </div>
      {!isMobile && <AnnotationSummary />}
      <BottomBar />
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
      
      {/* Lazy-loaded dialogs wrapped in Suspense */}
      <Suspense fallback={
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <Loader2 className="animate-spin text-bb-blue" size={32} />
        </div>
      }>
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
        {showSmartRewrite && (
          <SmartRewriteDialog 
            originalText={selectedText} 
            onClose={() => setShowSmartRewrite(false)} 
          />
        )}
      </Suspense>
      
      {showTour && userProfile && (
        <QuickStartTour userProfile={userProfile} onClose={closeTour} />
      )}
      <CloudStatusToast />
    </div>
  );
}
