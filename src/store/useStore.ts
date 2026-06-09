import { create } from 'zustand';
import type {
  Annotation,
  AnnotationStyle,
  BIMType,
  Bookmark,
  CalibrationSettings,
  Measurement,
  MeasurementUnit,
  PageClipboard,
  PDFDocument,
  PdfTab,
  Point,
  ToolPreset,
  ToolType,
  UndoAction,
  UserPresence,
} from '../types';

export interface Watermark {
  id: string;
  type: 'watermark' | 'header' | 'footer';
  text: string;
  pages: 'all' | 'current' | 'custom';
  customPages?: number[];
  position: 'top-left' | 'top-center' | 'top-right' | 'center' | 'bottom-left' | 'bottom-center' | 'bottom-right' | 'diagonal';
  opacity: number;
  fontSize: number;
  fontFamily: string;
  color: string;
}

export interface FormField {
  name: string;
  type: 'text' | 'checkbox' | 'radio' | 'dropdown' | 'signature';
  value: string | boolean;
  pageIndex: number;
  rect: [number, number, number, number]; // x1, y1, x2, y2
  options?: string[]; // for dropdown/radio
  readOnly?: boolean;
  defaultValue?: string | boolean;
}

interface EditorState {
  // PDF state
  currentDocument: PDFDocument | null;
  pdfData: ArrayBuffer | null;
  pageCount: number;
  currentPage: number;
  zoom: number;
  panOffset: Point;
  viewKey: number;

  // Tool state
  activeTool: ToolType;
  activeStyle: AnnotationStyle;
  toolPresets: ToolPreset[];

  // Annotations
  annotations: Annotation[];
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  selectedBimType: BIMType | null;
  measurements: Measurement[];

  // Watermarks
  watermarks: Watermark[];

  // Cut tool
  cutBuffer: { imageData: string; width: number; height: number } | null;
  cutMode: 'rect' | 'polygon';
  cutColor: string | null;

  // Calibration
  calibrations: Record<number, CalibrationSettings>;
  measurementUnit: MeasurementUnit;

  // Collaboration
  presenceList: UserPresence[];
  currentUser: { uid: string; displayName: string; color: string } | null;

  // Undo/Redo
  undoStack: UndoAction[];
  redoStack: UndoAction[];

  // UI state
  leftSidebarOpen: boolean;
  rightSidebarOpen: boolean;
  isCalibrating: boolean;
  calibrationPoints: Point[];
  drawingPoints: Point[];
  isDrawing: boolean;
  snapToGrid: boolean;

  // Recent files
  recentFiles: any[];
  loadRecentFiles: () => Promise<void>;
  addRecentFile: (file: any) => Promise<void>;
  removeRecentFile: (id: string) => Promise<void>;
  clearRecentFiles: () => Promise<void>;
  gridSize: number;

  // Count tool
  countMarkers: Point[];

  // Page management
  selectedPages: Set<number>;
  showPageNumbers: boolean;
  pageClipboard: PageClipboard | null;

  // Bookmarks
  bookmarks: Bookmark[];

  // Tabs
  tabs: PdfTab[];
  activeTabId: string | null;

  // Split view
  splitView: boolean;
  splitPage: number;
  splitTabId: string | null;

  // PDF lock (after digital signature)
  pdfLocked: boolean;
  setPdfLocked: (locked: boolean) => void;
  
  // AutoSave toggle
  autoSaveEnabled: boolean;
  setAutoSaveEnabled: (enabled: boolean) => void;

  // Document ID (SHA-256 hash of PDF) for annotation storage
  documentId: string | null;
  setDocumentId: (id: string | null) => void;

  // Cloud sync toggle
  cloudSyncEnabled: boolean;
  setCloudSyncEnabled: (enabled: boolean) => void;

  // Saved certificate for persistent signing
  savedCert: { data: ArrayBuffer; name: string } | null;
  setSavedCert: (cert: { data: ArrayBuffer; name: string } | null) => void;

  // Signature Pad dialog (handwritten/typed signature image placement)
  signaturePadOpen: boolean;
  setSignaturePadOpen: (open: boolean) => void;
  pendingSignature: { imageData: string; showDateStamp: boolean } | null;
  setPendingSignature: (sig: { imageData: string; showDateStamp: boolean } | null) => void;

  // Annotation summary
  annotationSummaryOpen: boolean;

  // PDF background toggle
  showPdfBackground: boolean;
  togglePdfBackground: () => void;

  // CAD Command Line
  cadCommandLineOpen: boolean;
  cadPendingCommand: string | null;
  cadPendingPoints: { x: number; y: number }[];
  cadCommandStep: number;
  cadSelectionMode: 'erase' | 'join' | 'explode' | 'copy' | 'move' | 'ddedit' | 'trim' | 'rotate' | null;
  cadSelectedIds: string[];
  cadPendingExecute: { command: 'COPY' | 'OFFSET' | 'FENCE_TRIM' | 'FENCE_EXTEND' | 'CONVERTTOCAD' | 'DXF' | 'ROTATE_TYPED' | 'MOVE_TYPED' | 'COPY_TYPED' | 'CIRCLE_TYPED' | 'RECTANG_TYPED'; payload?: any } | null;
  cadExtendDefault: boolean;
  cadFeedback: string;
  cloudStatus: string | null;

  // Find highlight
  findHighlight: { pageIndex: number; x: number; y: number; width: number; height: number } | null;

  // Bumped every time the global PDF renderer (segments) has been (re)loaded
  // with the current pdfData. Components that render from the renderer must
  // depend on this key instead of `pdfData` to avoid racing against loadPdf.
  pdfReadyKey: number;
  bumpPdfReadyKey: () => void;

  // Actions
  setCurrentDocument: (doc: PDFDocument | null) => void;
  setPdfData: (data: ArrayBuffer | null) => void;
  setPageCount: (count: number) => void;
  setCurrentPage: (page: number) => void;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: Point) => void;
  setViewKey: (key: number) => void;
  setActiveTool: (tool: ToolType) => void;
  setActiveStyle: (style: Partial<AnnotationStyle>) => void;
  setToolPresets: (presets: ToolPreset[]) => void;
  addToolPreset: (preset: ToolPreset) => void;
  removeToolPreset: (id: string) => void;

  addAnnotation: (annotation: Annotation) => void;
  updateAnnotation: (id: string, updates: Partial<Annotation>) => void;
  deleteAnnotation: (id: string) => void;
  setSelectedAnnotationId: (id: string | null) => void;
  setSelectedAnnotationIds: (ids: string[]) => void;
  toggleAnnotationSelection: (id: string) => void;
  clearAnnotationSelection: () => void;
  setSelectedBimType: (type: BIMType | null) => void;
  setAnnotations: (annotations: Annotation[]) => void;

  setCutBuffer: (buffer: { imageData: string; width: number; height: number } | null) => void;
  setCutMode: (mode: 'rect' | 'polygon') => void;
  setCutColor: (color: string | null) => void;

  addMeasurement: (measurement: Measurement) => void;
  updateMeasurement: (id: string, updates: Partial<Measurement>) => void;
  deleteMeasurement: (id: string) => void;
  setMeasurements: (measurements: Measurement[]) => void;

  setCalibration: (pageIndex: number, cal: CalibrationSettings) => void;
  setMeasurementUnit: (unit: MeasurementUnit) => void;

  setPresenceList: (list: UserPresence[]) => void;
  setCurrentUser: (user: { uid: string; displayName: string; color: string } | null) => void;

  pushUndo: (action: UndoAction) => void;
  undo: () => void;
  redo: () => void;

  toggleLeftSidebar: () => void;
  toggleRightSidebar: () => void;
  setIsCalibrating: (v: boolean) => void;
  setCalibrationPoints: (pts: Point[]) => void;
  setDrawingPoints: (pts: Point[]) => void;
  setIsDrawing: (v: boolean) => void;
  setSnapToGrid: (v: boolean) => void;

  addCountMarker: (pt: Point) => void;
  clearCountMarkers: () => void;
  setCountMarkers: (pts: Point[]) => void;

  // Page management
  togglePageSelection: (page: number) => void;
  setSelectedPages: (pages: Set<number>) => void;
  deletePages: (pages: number[]) => void;
  reorderPage: (from: number, to: number) => void;
  setShowPageNumbers: (v: boolean) => void;
  setPageClipboard: (clip: PageClipboard | null) => void;

  // Bookmarks
  addBookmark: (bm: Bookmark) => void;
  removeBookmark: (id: string) => void;
  renameBookmark: (id: string, name: string) => void;
  setBookmarks: (bms: Bookmark[]) => void;

  // Tabs
  addTab: (tab: PdfTab) => void;
  removeTab: (id: string) => void;
  setActiveTab: (id: string) => void;
  updateTab: (id: string, updates: Partial<PdfTab>) => void;

  // Split view
  setSplitView: (v: boolean) => void;
  setSplitPage: (page: number) => void;
  setSplitTabId: (id: string | null) => void;

  // Tab switching: save current -> load target
  switchToTab: (tabId: string) => void;
  openPdfInNewTab: (name: string, data: ArrayBuffer, pgCount: number) => void;

  // Annotation summary
  setAnnotationSummaryOpen: (v: boolean) => void;
  toggleAnnotationSummary: () => void;

  // CAD Command Line
  setCADCommandLineOpen: (v: boolean) => void;
  toggleCADCommandLine: () => void;
  setCADPendingCommand: (cmd: string | null) => void;
  setCADPendingPoints: (points: { x: number; y: number }[]) => void;
  addCADPendingPoint: (point: { x: number; y: number }) => void;
  clearCADPendingPoints: () => void;
  setCADCommandStep: (step: number) => void;
  completePolyline: () => void;
  setCompletePolyline: (fn: () => void) => void;
  setCADSelectionMode: (mode: 'erase' | 'join' | 'explode' | 'copy' | 'move' | 'ddedit' | 'trim' | 'rotate' | null) => void;
  setCADSelectedIds: (ids: string[]) => void;
  addCADSelectedId: (id: string) => void;
  removeCADSelectedId: (id: string) => void;
  clearCADSelectedIds: () => void;
  setCADFeedback: (msg: string) => void;
  setCloudStatus: (msg: string | null) => void;
  triggerCADExecute: (command: 'COPY' | 'OFFSET' | 'FENCE_TRIM' | 'FENCE_EXTEND' | 'CONVERTTOCAD' | 'DXF' | 'ROTATE_TYPED' | 'MOVE_TYPED' | 'COPY_TYPED' | 'CIRCLE_TYPED', payload?: any) => void;
  clearCADExecute: () => void;

  // Find highlight
  setFindHighlight: (highlight: { pageIndex: number; x: number; y: number; width: number; height: number } | null) => void;

  // Page rotations
  pageRotations: Record<number, number>;
  rotatePage: (pageIndex: number) => void;
  setPageRotations: (rotations: Record<number, number>) => void;

  // Watermarks
  setWatermarks: (watermarks: Watermark[]) => void;

  // BIM Identify Elements / Interactive prediction UI
  detectedElements: import('../utils/identifyElements').DetectedElement[];
  setDetectedElements: (els: import('../utils/identifyElements').DetectedElement[]) => void;
  hoverPredictionEnabled: boolean;
  setHoverPredictionEnabled: (v: boolean) => void;
  hoveredElementId: string | null;
  setHoveredElementId: (id: string | null) => void;

  // Form Edit Mode
  formEditMode: boolean;
  setFormEditMode: (v: boolean) => void;
  toggleFormEditMode: () => void;
  formFields: FormField[];
  setFormFields: (fields: FormField[]) => void;
  updateFormFieldValue: (fieldName: string, value: string | boolean) => void;

  // Smart Ortho Trace
  smartTraceEnabled: boolean;
  setSmartTraceEnabled: (v: boolean) => void;
  toggleSmartTrace: () => void;
}

const DEFAULT_STYLE: AnnotationStyle = {
  stroke: '#ff0000',
  strokeWidth: 2,
  fill: 'transparent',
  opacity: 1,
  fontSize: 16,
  fontFamily: 'Arial',
};

export const useStore = create<EditorState>((set, get) => ({
  currentDocument: null,
  pdfData: null,
  pageCount: 0,
  currentPage: 0,
  zoom: 1,
  panOffset: { x: 0, y: 0 },
  viewKey: 0,
  pageRotations: {},
  activeTool: 'select',
  activeStyle: { ...DEFAULT_STYLE },
  toolPresets: [],
  annotations: [],
  selectedAnnotationId: null,
  selectedAnnotationIds: [],
  selectedBimType: null,
  measurements: [],
  watermarks: [],
  cutBuffer: null,
  cutMode: 'rect',
  cutColor: null,

  calibrations: {},
  measurementUnit: 'ft',

  presenceList: [],
  currentUser: null,

  undoStack: [],
  redoStack: [],

  leftSidebarOpen: typeof window !== 'undefined' ? window.innerWidth > 768 : true,
  rightSidebarOpen: true,
  isCalibrating: false,
  calibrationPoints: [],
  drawingPoints: [],
  isDrawing: false,
  snapToGrid: false,
  gridSize: 10,

  recentFiles: [],

  countMarkers: [],

  selectedPages: new Set<number>(),
  showPageNumbers: true,
  pageClipboard: null,
  bookmarks: [],
  tabs: [],
  activeTabId: null,
  splitView: false,
  splitPage: 0,
  splitTabId: null,
  pdfLocked: false,
  autoSaveEnabled: false,
  documentId: null,
  cloudSyncEnabled: false,
  savedCert: null,
  signaturePadOpen: false,
  pendingSignature: null,
  annotationSummaryOpen: false,
  showPdfBackground: true,
  cadCommandLineOpen: true,
  cadPendingCommand: null,
  cadPendingPoints: [],
  cadCommandStep: 0,
  cadSelectionMode: null,
  cadSelectedIds: [],
  cadPendingExecute: null,
  cadExtendDefault: false,
  cadFeedback: '',
  cloudStatus: null,
  findHighlight: null,

  pdfReadyKey: 0,
  bumpPdfReadyKey: () => set((s) => ({ pdfReadyKey: s.pdfReadyKey + 1 })),

  setCurrentDocument: (doc) => set({ currentDocument: doc }),
  setPdfData: (data) => set({ pdfData: data }),
  setPageCount: (count) => set({ pageCount: count }),
  setCurrentPage: (page) => set({ currentPage: page }),
  setZoom: (zoom) => set({ zoom: Math.max(0.1, Math.min(5, zoom)) }),
  setPanOffset: (offset) => set({ panOffset: offset }),
  setViewKey: (key) => set({ viewKey: key }),
  setActiveTool: (tool) => set({ activeTool: tool, selectedAnnotationId: null }),
  setActiveStyle: (style) =>
    set((s) => ({ activeStyle: { ...s.activeStyle, ...style } })),
  setToolPresets: (presets) => set({ toolPresets: presets }),
  addToolPreset: (preset) =>
    set((s) => ({ toolPresets: [...s.toolPresets, preset] })),
  removeToolPreset: (id) =>
    set((s) => ({ toolPresets: s.toolPresets.filter((p) => p.id !== id) })),

  addAnnotation: (annotation) =>
    set((s) => ({
      annotations: [...s.annotations, annotation],
      redoStack: [],
    })),
  updateAnnotation: (id, updates) =>
    set((s) => ({
      annotations: s.annotations.map((a) =>
        a.id === id ? { ...a, ...updates, updatedAt: Date.now() } : a
      ),
    })),
  deleteAnnotation: (id) =>
    set((s) => ({
      annotations: s.annotations.filter((a) => a.id !== id),
      selectedAnnotationId:
        s.selectedAnnotationId === id ? null : s.selectedAnnotationId,
    })),
  setSelectedAnnotationId: (id) => set({ selectedAnnotationId: id }),
  setSelectedAnnotationIds: (ids) => set({ selectedAnnotationIds: ids }),
  toggleAnnotationSelection: (id) =>
    set((s) => {
      const isSelected = s.selectedAnnotationIds.includes(id);
      if (isSelected) {
        return { selectedAnnotationIds: s.selectedAnnotationIds.filter((i) => i !== id) };
      } else {
        return { selectedAnnotationIds: [...s.selectedAnnotationIds, id] };
      }
    }),
  clearAnnotationSelection: () => set({ selectedAnnotationIds: [], selectedAnnotationId: null }),
  setSelectedBimType: (type) => set({ selectedBimType: type }),
  setAnnotations: (annotations) => set({ annotations }),

  setCutBuffer: (buffer) => set({ cutBuffer: buffer }),
  setCutMode: (mode) => set({ cutMode: mode }),
  setCutColor: (color) => set({ cutColor: color }),

  addMeasurement: (measurement) =>
    set((s) => ({ measurements: [...s.measurements, measurement] })),
  updateMeasurement: (id, updates) =>
    set((s) => ({
      measurements: s.measurements.map((m) =>
        m.id === id ? { ...m, ...updates, updatedAt: Date.now() } : m
      ),
    })),
  deleteMeasurement: (id) =>
    set((s) => ({ measurements: s.measurements.filter((m) => m.id !== id) })),
  setMeasurements: (measurements) => set({ measurements }),

  setCalibration: (pageIndex, cal) =>
    set((s) => ({
      calibrations: { ...s.calibrations, [pageIndex]: cal },
    })),
  setMeasurementUnit: (unit) => set({ measurementUnit: unit }),

  setPresenceList: (list) => set({ presenceList: list }),
  setCurrentUser: (user) => set({ currentUser: user }),

  pushUndo: (action) =>
    set((s) => ({
      undoStack: [...s.undoStack.slice(-49), action],
      redoStack: [],
    })),
  undo: () => {
    const { undoStack, annotations, pdfData } = get();
    if (undoStack.length === 0) return;
    const action = undoStack[undoStack.length - 1];
    const newUndo = undoStack.slice(0, -1);

    let newAnnotations = [...annotations];
    let newPdfData = pdfData;
    let redoAction: UndoAction;

    switch (action.type) {
      case 'add':
        if (action.annotation) {
          newAnnotations = newAnnotations.filter((a) => a.id !== action.annotation!.id);
          redoAction = { type: 'add', annotation: action.annotation };
        } else {
          redoAction = { type: 'add' };
        }
        break;
      case 'delete':
        if (action.annotation) {
          newAnnotations.push(action.annotation);
          redoAction = { type: 'delete', annotation: action.annotation };
        } else {
          redoAction = { type: 'delete' };
        }
        break;
      case 'update':
        if (action.annotation) {
          newAnnotations = newAnnotations.map((a) => {
            if (a.id === action.annotation!.id) {
              return action.previousState ?? action.annotation!;
            }
            return a;
          });
          redoAction = {
            type: 'update',
            annotation: action.annotation,
            previousState: action.previousState,
          };
        } else {
          redoAction = { type: 'update' };
        }
        break;
      case 'batch-add':
        if (action.annotations) {
          const batchIds = new Set(action.annotations.map(a => a.id));
          newAnnotations = newAnnotations.filter(a => !batchIds.has(a.id));
          redoAction = { type: 'batch-add', annotations: action.annotations };
        } else {
          redoAction = { type: 'batch-add' };
        }
        break;
      case 'pdf-edit':
        if (action.previousPdfData) {
          newPdfData = action.previousPdfData;
        }
        redoAction = {
          type: 'pdf-edit',
          previousPdfData: pdfData,
        };
        break;
      default:
        return;
    }

    set((s) => ({
      undoStack: newUndo,
      redoStack: [...s.redoStack, redoAction],
      annotations: newAnnotations,
      pdfData: newPdfData,
    }));
  },
  redo: () => {
    const { redoStack, annotations, pdfData } = get();
    if (redoStack.length === 0) return;
    const action = redoStack[redoStack.length - 1];
    const newRedo = redoStack.slice(0, -1);

    let newAnnotations = [...annotations];
    let newPdfData = pdfData;
    let undoAction: UndoAction;

    switch (action.type) {
      case 'add':
        if (action.annotation) {
          newAnnotations.push(action.annotation);
          undoAction = { type: 'add', annotation: action.annotation };
        } else {
          undoAction = { type: 'add' };
        }
        break;
      case 'delete':
        if (action.annotation) {
          newAnnotations = newAnnotations.filter((a) => a.id !== action.annotation!.id);
          undoAction = { type: 'delete', annotation: action.annotation };
        } else {
          undoAction = { type: 'delete' };
        }
        break;
      case 'update':
        if (action.annotation) {
          newAnnotations = newAnnotations.map((a) => {
            if (a.id === action.annotation!.id) {
              return action.annotation!;
            }
            return a;
          });
          undoAction = {
            type: 'update',
            annotation: action.annotation,
            previousState: action.previousState,
          };
        } else {
          undoAction = { type: 'update' };
        }
        break;
      case 'batch-add':
        if (action.annotations) {
          newAnnotations.push(...action.annotations);
          undoAction = { type: 'batch-add', annotations: action.annotations };
        } else {
          undoAction = { type: 'batch-add' };
        }
        break;
      case 'pdf-edit':
        if (action.previousPdfData) {
          newPdfData = action.previousPdfData;
        }
        undoAction = {
          type: 'pdf-edit',
          previousPdfData: pdfData,
        };
        break;
      default:
        return;
    }

    set((s) => ({
      redoStack: newRedo,
      undoStack: [...s.undoStack, undoAction],
      annotations: newAnnotations,
      pdfData: newPdfData,
    }));
  },

  toggleLeftSidebar: () => set((s) => ({ leftSidebarOpen: !s.leftSidebarOpen })),
  toggleRightSidebar: () =>
    set((s) => ({ rightSidebarOpen: !s.rightSidebarOpen })),
  setIsCalibrating: (v) => set({ isCalibrating: v }),
  setCalibrationPoints: (pts) => set({ calibrationPoints: pts }),
  setDrawingPoints: (pts) => set({ drawingPoints: pts }),
  setIsDrawing: (v) => set({ isDrawing: v }),
  setSnapToGrid: (v) => set({ snapToGrid: v }),

  addCountMarker: (pt) =>
    set((s) => ({ countMarkers: [...s.countMarkers, pt] })),
  clearCountMarkers: () => set({ countMarkers: [] }),
  setCountMarkers: (pts) => set({ countMarkers: pts }),

  togglePageSelection: (page) =>
    set((s) => {
      const next = new Set(s.selectedPages);
      if (next.has(page)) next.delete(page); else next.add(page);
      return { selectedPages: next };
    }),
  setSelectedPages: (pages) => set({ selectedPages: pages }),
  deletePages: (pages) =>
    set((s) => {
      const sorted = [...pages].sort((a, b) => b - a);
      const newAnnotations = s.annotations.filter((a) => !sorted.includes(a.pageIndex))
        .map((a) => {
          let newIdx = a.pageIndex;
          for (const p of sorted) { if (a.pageIndex > p) newIdx--; }
          return { ...a, pageIndex: newIdx };
        });
      const newMeasurements = s.measurements.filter((m) => !sorted.includes(m.pageIndex))
        .map((m) => {
          let newIdx = m.pageIndex;
          for (const p of sorted) { if (m.pageIndex > p) newIdx--; }
          return { ...m, pageIndex: newIdx };
        });
      const newPageCount = Math.max(0, s.pageCount - sorted.length);
      const newCurrentPage = Math.min(s.currentPage, newPageCount - 1);
      return {
        annotations: newAnnotations,
        measurements: newMeasurements,
        pageCount: newPageCount,
        currentPage: Math.max(0, newCurrentPage),
        selectedPages: new Set<number>(),
      };
    }),
  reorderPage: (from, to) =>
    set((s) => {
      if (from === to) return s;
      const remap = (idx: number) => {
        if (idx === from) return to;
        if (from < to) { if (idx > from && idx <= to) return idx - 1; }
        else { if (idx >= to && idx < from) return idx + 1; }
        return idx;
      };
      return {
        annotations: s.annotations.map((a) => ({ ...a, pageIndex: remap(a.pageIndex) })),
        measurements: s.measurements.map((m) => ({ ...m, pageIndex: remap(m.pageIndex) })),
        currentPage: remap(s.currentPage),
      };
    }),
  setShowPageNumbers: (v) => set({ showPageNumbers: v }),
  setPageClipboard: (clip) => set({ pageClipboard: clip }),

  // Bookmarks
  addBookmark: (bm) => set((s) => ({ bookmarks: [...s.bookmarks, bm] })),
  removeBookmark: (id) => set((s) => ({ bookmarks: s.bookmarks.filter((b) => b.id !== id) })),
  renameBookmark: (id, name) =>
    set((s) => ({ bookmarks: s.bookmarks.map((b) => (b.id === id ? { ...b, name } : b)) })),
  setBookmarks: (bms) => set({ bookmarks: bms }),

  // Tabs
  addTab: (tab) => set((s) => ({ tabs: [...s.tabs, tab] })),
  removeTab: (id) =>
    set((s) => {
      const newTabs = s.tabs.filter((t) => t.id !== id);
      const newActive = s.activeTabId === id ? (newTabs[0]?.id ?? null) : s.activeTabId;
      return { tabs: newTabs, activeTabId: newActive };
    }),
  setActiveTab: (id) => set({ activeTabId: id }),
  updateTab: (id, updates) =>
    set((s) => ({ tabs: s.tabs.map((t) => (t.id === id ? { ...t, ...updates } : t)) })),

  // Split view
  setSplitView: (v) => set({ splitView: v }),
  setSplitPage: (page) => set({ splitPage: page }),
  setSplitTabId: (id) => set({ splitTabId: id }),
  setPdfLocked: (locked) => set({ pdfLocked: locked }),
  setAutoSaveEnabled: (enabled) => set({ autoSaveEnabled: enabled }),
  setDocumentId: (id) => set({ documentId: id }),
  setCloudSyncEnabled: (enabled) => set({ cloudSyncEnabled: enabled }),
  setSavedCert: (cert) => set({ savedCert: cert }),
  setSignaturePadOpen: (open) => set({ signaturePadOpen: open }),
  setPendingSignature: (sig) => set({ pendingSignature: sig }),

  // Tab switching: save current editor state into a tab, then load another tab
  switchToTab: (tabId) => {
    const s = get();
    // Save current state into the currently active tab (or create one for 'main')
    const currentId = s.activeTabId || 'main';
    const currentTab = s.tabs.find((t) => t.id === currentId);

    // Preserve the welcome tab's name - don't overwrite it with 'Untitled'
    const tabName = currentTab?.isWelcome ? currentTab.name : (s.currentDocument?.name || 'Untitled');

    const currentSnapshot: PdfTab = {
      id: currentId,
      name: tabName,
      pdfData: s.pdfData!,
      pageCount: s.pageCount,
      currentPage: s.currentPage,
      annotations: s.annotations,
      measurements: s.measurements,
      calibrations: s.calibrations,
      bookmarks: s.bookmarks,
      fileHandle: s.tabs.find(t => t.id === currentId)?.fileHandle,
    };

    // Update or insert current snapshot
    let newTabs = [...s.tabs];
    const existingIdx = newTabs.findIndex((t) => t.id === currentId);
    if (existingIdx >= 0) {
      newTabs[existingIdx] = currentSnapshot;
    } else {
      newTabs = [currentSnapshot, ...newTabs];
    }

    // Find the target tab
    const target = newTabs.find((t) => t.id === tabId);
    if (!target) return;

    set({
      tabs: newTabs,
      activeTabId: tabId,
      pdfData: target.pdfData,
      pageCount: target.pageCount,
      currentPage: target.currentPage,
      annotations: target.annotations,
      measurements: target.measurements,
      calibrations: target.calibrations,
      bookmarks: target.bookmarks,
      currentDocument: { id: target.id, name: target.name, storageUrl: '', pageCount: target.pageCount, ownerId: 'local', sharedWith: {}, createdAt: Date.now(), updatedAt: Date.now() },
      selectedAnnotationId: null,
      undoStack: [],
      redoStack: [],
    });
  },

  openPdfInNewTab: async (name, data, pgCount) => {
    const s = get();
    const id = crypto.randomUUID();

    // Try to load annotations from PDF metadata
    let loadedAnnotations: any[] = [];
    try {
      const { loadAnnotationsFromPdf } = await import('../utils/exportPdf');
      const annotations = await loadAnnotationsFromPdf(data);
      if (annotations) {
        loadedAnnotations = annotations;
      }
    } catch (e) {
      console.error('Failed to load annotations from PDF metadata:', e);
    }

    const newTab: PdfTab = {
      id,
      name,
      pdfData: data,
      pageCount: pgCount,
      currentPage: 0,
      annotations: loadedAnnotations,
      measurements: [],
      calibrations: {},
      bookmarks: [],
      fileHandle: undefined, // Will be set when file is opened with File System Access API
    };

    // Save current state first
    const currentId = s.activeTabId || 'main';
    const currentSnapshot: PdfTab = {
      id: currentId,
      name: s.currentDocument?.name || 'Untitled',
      pdfData: s.pdfData!,
      pageCount: s.pageCount,
      currentPage: s.currentPage,
      annotations: s.annotations,
      measurements: s.measurements,
      calibrations: s.calibrations,
      bookmarks: s.bookmarks,
      fileHandle: s.tabs.find(t => t.id === currentId)?.fileHandle,
    };
    let newTabs = [...s.tabs];
    const existingIdx = newTabs.findIndex((t) => t.id === currentId);
    if (existingIdx >= 0) {
      newTabs[existingIdx] = currentSnapshot;
    } else {
      newTabs = [currentSnapshot, ...newTabs];
    }
    newTabs.push(newTab);

    set({
      tabs: newTabs,
      activeTabId: id,
      pdfData: data,
      pageCount: pgCount,
      currentPage: 0,
      annotations: loadedAnnotations,
      measurements: [],
      calibrations: {},
      bookmarks: [],
      currentDocument: { id, name, storageUrl: '', pageCount: pgCount, ownerId: 'local', sharedWith: {}, createdAt: Date.now(), updatedAt: Date.now() },
      selectedAnnotationId: null,
      undoStack: [],
      redoStack: [],
      selectedPages: new Set<number>(),
    });
  },

  // Annotation summary
  setAnnotationSummaryOpen: (v) => set({ annotationSummaryOpen: v }),
  toggleAnnotationSummary: () => set((s) => ({ annotationSummaryOpen: !s.annotationSummaryOpen })),

  // PDF background toggle
  togglePdfBackground: () => set((s) => ({ showPdfBackground: !s.showPdfBackground })),

  // Recent files
  loadRecentFiles: async () => {
    const { RecentDB } = await import('../utils/recentFilesDB');
    const files = await RecentDB.getAll();
    set({ recentFiles: files });
  },
  addRecentFile: async (file) => {
    const { RecentDB } = await import('../utils/recentFilesDB');
    await RecentDB.save(file);
    const files = await RecentDB.getAll();
    set({ recentFiles: files });
  },
  removeRecentFile: async (id) => {
    const { RecentDB } = await import('../utils/recentFilesDB');
    await RecentDB.remove(id);
    const files = await RecentDB.getAll();
    set({ recentFiles: files });
  },
  clearRecentFiles: async () => {
    const { RecentDB } = await import('../utils/recentFilesDB');
    await RecentDB.clearAll();
    set({ recentFiles: [] });
  },

  // CAD Command Line
  setCADCommandLineOpen: (v) => set({ cadCommandLineOpen: v }),
  toggleCADCommandLine: () => set((s) => ({ cadCommandLineOpen: !s.cadCommandLineOpen })),
  setCADPendingCommand: (cmd) => set({ cadPendingCommand: cmd }),
  setCADPendingPoints: (points) => set({ cadPendingPoints: points }),
  addCADPendingPoint: (point) => set((s) => ({ cadPendingPoints: [...s.cadPendingPoints, point] })),
  clearCADPendingPoints: () => set({ cadPendingPoints: [] }),
  setCADCommandStep: (step) => set((s) => ({ cadCommandStep: step })),
  completePolyline: () => {}, // Will be set by App component
  setCompletePolyline: (fn) => set({ completePolyline: fn }),
  setCADSelectionMode: (mode) => set({ cadSelectionMode: mode }),
  setCADSelectedIds: (ids) => set({ cadSelectedIds: ids }),
  addCADSelectedId: (id) => set((s) => ({ cadSelectedIds: [...s.cadSelectedIds, id] })),
  removeCADSelectedId: (id) => set((s) => ({ cadSelectedIds: s.cadSelectedIds.filter((i) => i !== id) })),
  clearCADSelectedIds: () => set({ cadSelectedIds: [] }),
  setCADFeedback: (msg) => set({ cadFeedback: msg }),
  setCloudStatus: (msg) => set({ cloudStatus: msg }),
  triggerCADExecute: (command: 'COPY' | 'OFFSET' | 'FENCE_TRIM' | 'FENCE_EXTEND' | 'CONVERTTOCAD' | 'DXF' | 'ROTATE_TYPED' | 'MOVE_TYPED' | 'COPY_TYPED' | 'CIRCLE_TYPED' | 'RECTANG_TYPED', payload?: any) => set({ cadPendingExecute: { command, payload } }),
  clearCADExecute: () => set({ cadPendingExecute: null }),

  // Find highlight
  setFindHighlight: (highlight) => set({ findHighlight: highlight }),

  // Page rotations
  rotatePage: (pageIndex) =>
    set((s) => ({
      pageRotations: {
        ...s.pageRotations,
        [pageIndex]: ((s.pageRotations[pageIndex] || 0) + 90) % 360,
      },
    })),
  setPageRotations: (rotations) => set({ pageRotations: rotations }),

  // Watermarks
  setWatermarks: (watermarks) => set({ watermarks }),

  // Detection / prediction UI
  detectedElements: [],
  setDetectedElements: (els) => set({ detectedElements: els }),
  hoverPredictionEnabled: false,
  setHoverPredictionEnabled: (v) => set({ hoverPredictionEnabled: v }),
  hoveredElementId: null,
  setHoveredElementId: (id) => set({ hoveredElementId: id }),

  // Form Edit Mode
  formEditMode: false,
  setFormEditMode: (v: boolean) => set({ formEditMode: v }),
  toggleFormEditMode: () => set((s) => ({ formEditMode: !s.formEditMode })),
  formFields: [],
  setFormFields: (fields: FormField[]) => set({ formFields: fields }),
  updateFormFieldValue: (fieldName: string, value: string | boolean) =>
    set((s) => ({
      formFields: s.formFields.map((f: FormField) =>
        f.name === fieldName ? { ...f, value } : f
      ),
    })),

  // Smart Ortho Trace
  smartTraceEnabled: true,
  setSmartTraceEnabled: (v: boolean) => set({ smartTraceEnabled: v }),
  toggleSmartTrace: () => set((s) => ({ smartTraceEnabled: !s.smartTraceEnabled })),
}));
