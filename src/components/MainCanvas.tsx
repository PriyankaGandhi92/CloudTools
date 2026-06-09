import React, { useRef, useEffect, useState, useCallback, useLayoutEffect } from 'react';
import { Stage, Layer, Line, Rect, Circle, Ellipse, Arrow, Text, Group, Image as KonvaImage, Arc, Path, Shape, Transformer } from 'react-konva';
import type Konva from 'konva';
import { useStore } from '../store/useStore';
import { renderPage, getTextAtPosition, getPageTextItems, getVectorSegmentsForPage, extractFullVectorGeometry, cleanupPdfPage } from '../utils/pdfRenderer';
import { saveCADLayerToFirestore, loadCADChunksFromFirestore, deleteCADChunksFromFirestore } from '../utils/cadFirestore';
import { flattenEraserToPdf } from '../utils/flattenEraser';
import type { PdfTextItem } from '../utils/pdfRenderer';
import PinContentDialog from './PinContentDialog';
import EditTextDialog from './EditTextDialog';
import TextAnnotationEditor from './TextAnnotationEditor';
import FormEditOverlay from './FormEditOverlay';
import BimDataDialog from './BimDataDialog';
import ImageColorEditorDialog from './ImageColorEditorDialog';
import type { PinContent, Measurement, CalibrationSettings as Calibration } from '../types';
import type { BIMType, BIMData, BIMDialogData } from '../types';
import type { Watermark } from '../store/useStore';
import {
  calibratedDistance,
  polygonArea,
  polygonPerimeter,
  angleBetweenPoints,
  formatMeasurement,
  midpoint,
  snapToGrid as snapFn,
} from '../utils/measurement';
import type { Annotation, Point, ToolType, MeasurementUnit } from '../types';
import { ELEMENT_CATEGORIES } from '../utils/identifyElements';
import { getLineIntersection, isPointInPolygon, getOffsetPoints, rotatePointAround, getDist, pointToSegmentDistance } from '../utils/cadGeometry';
import { generateDXF } from '../utils/exportDxf';
import { normalizeToOrtho } from '../utils/geometryEngine';
import {
  Copy as CopyIcon,
  RotateCw as RotateCwIcon,
  RotateCcw as RotateCcwIcon,
  ArrowUpToLine as ArrowUpToLineIcon,
  ArrowDownToLine as ArrowDownToLineIcon,
  Palette as PaletteIcon,
  Lock as LockIcon,
  Unlock as UnlockIcon,
  Layers as LayersIcon,
  Minus as MinusIcon,
  Trash2 as Trash2Icon,
} from 'lucide-react';

function constrainToAxis(origin: Point, current: Point): Point {
  const dx = Math.abs(current.x - origin.x);
  const dy = Math.abs(current.y - origin.y);
  if (dx > dy) return { x: current.x, y: origin.y };
  return { x: origin.x, y: current.y };
}

// Compress image to prevent GPU memory issues
function compressImage(dataUrl: string, maxWidth: number = 1500, quality: number = 0.85): Promise<{ dataUrl: string; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, maxWidth / img.width);
      canvas.width = img.width * scale;
      canvas.height = img.height * scale;
      
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Failed to get canvas context'));
        return;
      }
      
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const compressedDataUrl = canvas.toDataURL('image/jpeg', quality);
      resolve({ dataUrl: compressedDataUrl, width: canvas.width, height: canvas.height });
    };
    img.onerror = reject;
    img.src = dataUrl;
  });
}

interface MainCanvasProps {
  pageOverride?: number;
  onPageChange?: (page: number) => void;
}

export default function MainCanvas({ pageOverride, onPageChange }: MainCanvasProps = {}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const transformerRef = useRef<any>(null);
  const selectedShapeRef = useRef<any>(null);
  const shiftHeld = useRef(false);
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });
  const [pdfSize, setPdfSize] = useState({ width: 0, height: 0 });
  const [pdfImage, setPdfImage] = useState<HTMLCanvasElement | null>(null);
  const [hoveredAnnotation, setHoveredAnnotation] = useState<string | null>(null);
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  const [editTextDialogOpen, setEditTextDialogOpen] = useState(false);
  const [editingTextItem, setEditingTextItem] = useState<PdfTextItem | null>(null);
  const [textItems, setTextItems] = useState<PdfTextItem[]>([]);
  const [bimDialogOpen, setBimDialogOpen] = useState(false);
  const [editingBimId, setEditingBimId] = useState<string | null>(null);
  const [bimClickPosition, setBimClickPosition] = useState<Point | null>(null);
  const [textLeaderDialogOpen, setTextLeaderDialogOpen] = useState(false);
  const [editingTextLeaderId, setEditingTextLeaderId] = useState<string | null>(null);
  const [textAnnotationEditorOpen, setTextAnnotationEditorOpen] = useState(false);
  const [editingTextAnnotationId, setEditingTextAnnotationId] = useState<string | null>(null);

  // Pending cut buffer waiting for color editor confirmation before paste
  const [pendingCutBuffer, setPendingCutBuffer] = useState<{ imageData: string; width: number; height: number } | null>(null);

  // Annotation right-click context menu
  const [annContextMenu, setAnnContextMenu] = useState<{ x: number; y: number; annotationId: string } | null>(null);
  // Floating toolbar line-weight popover toggle
  const [toolbarThicknessOpen, setToolbarThicknessOpen] = useState(false);
  useEffect(() => {
    if (!annContextMenu) return;
    const close = () => setAnnContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('contextmenu', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('contextmenu', close); };
  }, [annContextMenu]);

  // Listen for Edit triggers from the Sidebar
  useEffect(() => {
    const handleEditTask = (e: CustomEvent) => {
      const taskId = e.detail;
      setEditingPinId(taskId);
      setPinDialogOpen(true);
    };
    window.addEventListener('edit-task', handleEditTask as EventListener);
    return () => window.removeEventListener('edit-task', handleEditTask as EventListener);
  }, []);

  // Zoom rectangle state
  const [zoomRect, setZoomRect] = useState<{ start: Point; end: Point } | null>(null);

  // Selection rectangle state
  const [selectionRect, setSelectionRect] = useState<{ start: Point; end: Point; direction: 'left-to-right' | 'right-to-left' } | null>(null);

  // CAD command cursor position for rubber-band preview
  const [cadCursorPos, setCadCursorPos] = useState<Point | null>(null);

  // Dynamic input overlay (AutoCAD-style) for typing angle/distance at step 2
  const dynInputRef = useRef<HTMLInputElement>(null);
  const [dynInput, setDynInput] = useState('');

  // Store original positions for rotation preview
  const rotationOriginalPositions = useRef<Map<string, any>>(new Map());

  // Local zoom/pan for split instances
  const [localZoom, setLocalZoom] = useState(1);
  const [localPanOffset, setLocalPanOffset] = useState<Point>({ x: 0, y: 0 });
  const isSplit = pageOverride !== undefined;

  const {
    pdfData,
    setPdfData,
    currentPage: storeCurrentPage,
    zoom: storeZoom,
    setZoom: storeSetZoom,
    panOffset: storePanOffset,
    setPanOffset: storeSetPanOffset,
    activeTool,
    setActiveTool,
    activeStyle,
    annotations,
    addAnnotation,
    updateAnnotation,
    deleteAnnotation,
    selectedAnnotationId,
    setSelectedAnnotationId,
    selectedAnnotationIds,
    setSelectedAnnotationIds,
    toggleAnnotationSelection,
    clearAnnotationSelection,
    selectedBimType,
    setSelectedBimType,
    pendingSignature,
    measurements,
    addMeasurement,
    calibrations,
    setCalibration,
    measurementUnit,
    isCalibrating,
    setIsCalibrating,
    calibrationPoints,
    setCalibrationPoints,
    drawingPoints,
    setDrawingPoints,
    isDrawing,
    setIsDrawing,
    pushUndo,
    pdfLocked,
    countMarkers,
    addCountMarker,
    snapToGrid,
    gridSize,
    showPageNumbers,
    showPdfBackground,
    cutBuffer,
    setCutBuffer,
    cutMode,
    setCutMode,
    cutColor,
    setCutColor,
    watermarks,
    findHighlight,
    pageRotations,
    detectedElements,
    hoverPredictionEnabled,
    hoveredElementId,
    setHoveredElementId,
    cadPendingCommand,
    cadCommandStep,
    pdfReadyKey,
    cadPendingPoints,
  } = useStore();

  // Use store values for main canvas, local values for split
  const currentPage = isSplit ? pageOverride! : storeCurrentPage;
  const zoom = isSplit ? localZoom : storeZoom;
  const setZoom = isSplit ? setLocalZoom : storeSetZoom;
  const panOffset = isSplit ? localPanOffset : storePanOffset;
  const setPanOffset = isSplit ? setLocalPanOffset : storeSetPanOffset;

  // Refs for scroll listener to avoid re-registration on zoom changes
  const zoomRef = useRef(zoom);
  const pdfSizeRef = useRef(pdfSize);
  const canvasSizeRef = useRef(canvasSize);

  // Keep these useEffects to update refs for other code paths (fit-to-screen, keyboard shortcuts, etc.)
  // We also update zoomRef synchronously in handleWheel for immediate panOffset sync
  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { pdfSizeRef.current = pdfSize; }, [pdfSize]);
  useEffect(() => { canvasSizeRef.current = canvasSize; }, [canvasSize]);

  // Track shift key + Escape to cancel + Enter to finalize multi-click tools
  const finalizeMultiClickRef = useRef<(() => void) | null>(null);
  const touchStartTimeRef = useRef<number>(0);
  const touchStartPosRef = useRef<Point | null>(null);
  const previousToolRef = useRef<ToolType>('select');
  const ctrlHeld = useRef(false);
  const middleMousePanning = useRef(false);
  const middleMouseStart = useRef<{ x: number; y: number; panX: number; panY: number }>({ x: 0, y: 0, panX: 0, panY: 0 });
  const fenceExtendMode = useRef(false);
  
  // Pinch-to-zoom state
  const initialPinchDistance = useRef<number>(0);
  const initialZoom = useRef<number>(1);
  const isPinching = useRef(false);
  const lastTouchCenter = useRef<{ x: number; y: number } | null>(null);
  
  // --- ADD THIS REF ---
  const lastBasePointTime = useRef<number>(0);
  // --------------------
  
  // PDF Vector Snapping state
  const [snapToPdf, setSnapToPdf] = useState(false);
  const [pdfVectorSegments, setPdfVectorSegments] = useState<{ p1: Point; p2: Point }[]>([]);
  const pdfVectors = useRef<{ p1: Point; p2: Point }[]>([]);
  
  // Always fetch PDF vectors for the current page (for visibility + snapping + trim)
  // Uses comprehensive CTM-aware extraction (second-tier logic) to detect all linework
  useEffect(() => {
    extractFullVectorGeometry(currentPage).then(segments => {
      pdfVectors.current = segments;
      setPdfVectorSegments(segments);
    }).catch(() => {
      pdfVectors.current = [];
      setPdfVectorSegments([]);
    });
  }, [currentPage]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeld.current = true;
      if (e.key === 'Control' || e.key === 'Meta') {
        ctrlHeld.current = true;
        previousToolRef.current = activeTool;
      }
      if (e.key === 'Escape') {
        if (isDrawing) { setIsDrawing(false); setDrawingPoints([]); setZoomRect(null); }
        if (calibrationPoints.length > 0) { setCalibrationPoints([]); setIsCalibrating(false); }
        clearAnnotationSelection();

        // RESTORE ORIGINAL POSITIONS IF CANCELLED MID-ROTATION
        if (rotationOriginalPositions.current.size > 0) {
          rotationOriginalPositions.current.forEach((orig, id) => {
            useStore.getState().updateAnnotation(id, { points: orig.points, rotation: orig.rotation });
          });
          rotationOriginalPositions.current.clear();
        }

        // Cancel CAD commands completely
        useStore.getState().setCADSelectionMode(null);
        useStore.getState().clearCADSelectedIds();
        useStore.getState().setCADPendingPoints([]);
        useStore.getState().setCADCommandStep(0);
        useStore.getState().setCADPendingCommand(null); // CRITICAL: Stop intercepting clicks!
        setActiveTool('select');
      }
      if (e.key === 'F3') {
        e.preventDefault();
        setSnapToPdf(prev => {
          const newState = !prev;
          console.log(`OSNAP (PDF Snapping) is now ${newState ? 'ON' : 'OFF'}`);
          return newState;
        });
      }
      if (e.key === 'F4') {
        e.preventDefault();
        useStore.getState().togglePdfBackground();
        console.log(`PDF Background is now ${useStore.getState().showPdfBackground ? 'VISIBLE' : 'HIDDEN'}`);
      }
      if (e.key === 'Enter' && isDrawing && finalizeMultiClickRef.current) {
        finalizeMultiClickRef.current();
      }
      // CAD Interactive Commands: Enter advances from Step 0 (selection) to Step 1 (base point)
      if (e.key === 'Enter') {
        const { cadPendingCommand, cadCommandStep, cadSelectedIds, cadPendingPoints } = useStore.getState();
        const cmdUp = cadPendingCommand?.toUpperCase() || '';
        console.log('Enter pressed - cadPendingCommand:', cadPendingCommand, 'cadCommandStep:', cadCommandStep, 'cadSelectedIds:', cadSelectedIds);

        // Handle PLINE finalization with Smart Ortho
        if ((cmdUp === 'PLINE' || cmdUp === 'PL') && cadPendingPoints.length >= 2) {
          e.preventDefault();
          const { smartTraceEnabled } = useStore.getState();
          let finalPoints = [...cadPendingPoints];
          if (smartTraceEnabled) {
            finalPoints = normalizeToOrtho(finalPoints, 15);
          }
          const id = crypto.randomUUID();
          const ann: Annotation = {
            id,
            type: 'line',
            pageIndex: currentPage,
            points: finalPoints,
            style: { ...activeStyle },
            createdBy: 'local',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            layerOrder: annotations.length
          };
          useStore.getState().addAnnotation(ann);
          pushUndo({ type: 'add', annotation: ann });
          useStore.getState().setCADPendingPoints([]);
          useStore.getState().setCADPendingCommand(null);
          useStore.getState().setCADCommandStep(0);
          setActiveTool('select');
          console.log('PLINE finalized with', finalPoints.length, 'points');
          return;
        }

        if (['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(cmdUp)) {
          if (cadCommandStep === 0) {
            e.preventDefault();
            if (cadSelectedIds.length === 0) {
              console.log(`${cmdUp}: No objects selected. Please select annotations first.`);
              return;
            }
            useStore.getState().setCADCommandStep(1);
            useStore.getState().setCADSelectionMode(null);
            console.log(`${cmdUp}: Selection confirmed. Click to set base point.`);
          } else if (cadCommandStep === 1 && cmdUp !== 'OFFSET') {
            e.preventDefault();
            console.log(`${cmdUp}: Click on canvas to set base point`);
            return;
          } else if (cadCommandStep === 2) {
            e.preventDefault();
            console.log(`${cmdUp}: Base point set. Type distance/angle or click to finish.`);
            return;
          }
        }
      }
    };
    const up = (e: KeyboardEvent) => { 
      if (e.key === 'Shift') shiftHeld.current = false;
      if ((e.key === 'Control' || e.key === 'Meta') && ctrlHeld.current) {
        ctrlHeld.current = false;
        // Restore previous tool if we're currently in pan mode
        if (activeTool === 'pan') {
          setActiveTool(previousToolRef.current);
        }
      }
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, [isDrawing, calibrationPoints.length, setIsDrawing, setDrawingPoints, setZoomRect, setCalibrationPoints, setIsCalibrating, setActiveTool, clearAnnotationSelection, annotations]);

  // Attach transformer to selected annotation for visual rotate grip
  useEffect(() => {
    if (selectedAnnotationId && transformerRef.current && selectedShapeRef.current) {
      transformerRef.current.nodes([selectedShapeRef.current]);
      transformerRef.current.getLayer()?.batchDraw();
    } else if (transformerRef.current) {
      transformerRef.current.nodes([]);
      transformerRef.current.getLayer()?.batchDraw();
    }
  }, [selectedAnnotationId, annotations]);

  // Determine if the dynamic (angle/distance) input overlay should be active
  const dynInputCmd = (() => {
    const c = (cadPendingCommand || '').toUpperCase();
    if (['ROTATE', 'MOVE', 'COPY'].includes(c) && cadCommandStep === 2) return c;
    if (c === 'OFFSET' && cadCommandStep === 1) return c;
    if (['CIRCLE', 'C'].includes(c) && cadPendingPoints.length === 1) return 'CIRCLE';
    if (['RECTANG', 'REC'].includes(c) && cadPendingPoints.length === 1) return 'RECTANG';
    return null;
  })();

  // Reliably focus the dynamic input whenever it becomes active so the user can
  // immediately type the value (independent of the command-line focus quirks).
  useEffect(() => {
    if (dynInputCmd) {
      setDynInput('');
      // rAF + timeout to survive the canvas click that triggered the step change
      const id = requestAnimationFrame(() => {
        dynInputRef.current?.focus();
        setTimeout(() => dynInputRef.current?.focus(), 60);
      });
      return () => cancelAnimationFrame(id);
    }
  }, [dynInputCmd]);

  // Ctrl+V paste: images from clipboard → image annotation, text → text annotation, cut buffer → paste cut content
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      if (!pdfData) return;

      // First check if we have cut buffer to paste
      if (cutBuffer) {
        e.preventDefault();
        // Place at center of current viewport
        const cx = (canvasSize.width / 2 - panOffset.x) / zoom;
        const cy = (canvasSize.height / 2 - panOffset.y) / zoom;
        const ann: Annotation = {
          id: crypto.randomUUID(),
          type: 'image',
          pageIndex: currentPage,
          points: [{ x: cx - cutBuffer.width / 2, y: cy - cutBuffer.height / 2 }],
          width: cutBuffer.width,
          height: cutBuffer.height,
          imageData: cutBuffer.imageData,
          style: activeStyle,
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layerOrder: annotations.length,
        };
        addAnnotation(ann);
        pushUndo({ type: 'add', annotation: ann });
        return;
      }

      const items = e.clipboardData?.items;
      if (!items) return;

      // Check for image paste
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) continue;
          const reader = new FileReader();
          reader.onload = async () => {
            const dataUrl = reader.result as string;
            try {
              // Compress image to prevent GPU memory issues
              const compressed = await compressImage(dataUrl, 1500, 0.85);
              
              // Scale for display (keep reasonable on-screen size)
              const maxDim = 300;
              const displayScale = Math.min(1, maxDim / Math.max(compressed.width, compressed.height));
              const w = compressed.width * displayScale;
              const h = compressed.height * displayScale;
              
              // Place at center of current viewport
              const cx = (canvasSize.width / 2 - panOffset.x) / zoom;
              const cy = (canvasSize.height / 2 - panOffset.y) / zoom;
              
              const ann: Annotation = {
                id: crypto.randomUUID(),
                type: 'image',
                pageIndex: currentPage,
                points: [{ x: cx - w / 2, y: cy - h / 2 }],
                width: w,
                height: h,
                imageData: compressed.dataUrl, // Store compressed version
                style: activeStyle,
                createdBy: 'local',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                layerOrder: annotations.length,
              };
              addAnnotation(ann);
              pushUndo({ type: 'add', annotation: ann });
            } catch (err) {
              console.error('Failed to compress pasted image:', err);
            }
          };
          reader.readAsDataURL(blob);
          return; // handle first image only
        }
      }

      // Check for text paste
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        e.preventDefault();
        // Place at center of current viewport
        const cx = (canvasSize.width / 2 - panOffset.x) / zoom;
        const cy = (canvasSize.height / 2 - panOffset.y) / zoom;
        const ann: Annotation = {
          id: crypto.randomUUID(),
          type: 'text',
          pageIndex: currentPage,
          points: [{ x: cx, y: cy }],
          text: text,
          style: activeStyle,
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layerOrder: annotations.length,
        };
        addAnnotation(ann);
        pushUndo({ type: 'add', annotation: ann });
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, [pdfData, currentPage, canvasSize, panOffset, zoom, annotations.length, addAnnotation, pushUndo, activeStyle, cutBuffer]);

  // Ctrl+G to activate cut tool
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'g') {
        e.preventDefault();
        setActiveTool('cut');
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [setActiveTool]);

  // Resize observer
  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const ro = new ResizeObserver((entries) => {
      for (const entry of entries) {
        setCanvasSize({
          width: entry.contentRect.width,
          height: entry.contentRect.height,
        });
      }
    });
    ro.observe(container);
    return () => ro.disconnect();
  }, []);

  // Render PDF page and auto-center with fit-to-screen zoom on first load
  const hasInitiallyCentered = useRef(false);
  useEffect(() => {
    if (!pdfData || !canvasRef.current) return;
    // Wait until the renderer's segments have been (re)loaded with the
    // current pdfData. pdfReadyKey is bumped in App.tsx after loadPdf
    // resolves, so this effect re-runs against the correct underlying doc.
    if (pdfReadyKey === 0) return;
    let cancelled = false;
    const offscreen = document.createElement('canvas');
    const rotation = pageRotations[currentPage] || 0;
    renderPage(currentPage, offscreen, 2, rotation).then((size) => {
      if (cancelled) return;
      const w = size.width / 2;
      const h = size.height / 2;
      setPdfSize({ width: w, height: h });
      setPdfImage(offscreen);

      // Fit-to-screen zoom with padding
      const padding = 40;
      const zoomX = (canvasSize.width - padding * 2) / w;
      const zoomY = (canvasSize.height - padding * 2) / h;
      const fitZoom = Math.min(zoomX, zoomY, 1); // Cap at 1x to avoid over-zooming small PDFs

      // Center on first load or page change
      if (!hasInitiallyCentered.current || true) {
        const cx = (canvasSize.width - w * fitZoom) / 2;
        const cy = (canvasSize.height - h * fitZoom) / 2;
        setPanOffset({ x: cx, y: cy });
        if (!hasInitiallyCentered.current) {
          setZoom(fitZoom);
          hasInitiallyCentered.current = true;
        }
      }
    }).catch(() => {});
    return () => { cancelled = true; };
  }, [pdfData, pdfReadyKey, currentPage, canvasSize.width, canvasSize.height, pageRotations, setZoom, setPanOffset]);

  // Load text items when text-select or pdf-text-edit tool is active
  useEffect(() => {
    if ((activeTool === 'text-select' || activeTool === 'pdf-text-edit') && pdfData) {
      getPageTextItems(currentPage).then(setTextItems);
    } else {
      setTextItems([]);
    }
  }, [activeTool, currentPage, pdfData]);

  // Refs for zoom calculations
  const zoomPointerPosition = useRef<{ x: number; y: number } | null>(null);

  // Zoom with mouse wheel focusing on cursor position
  const handleWheel = useCallback(
    (e: Konva.KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      
      const stage = e.target.getStage();
      if (!stage) return;
      
      const pointerPos = stage.getPointerPosition();
      if (!pointerPos) return;
      
      // Standard CAD smooth zoom (1.1 multiplier instead of static 0.1 add/subtract)
      const scaleBy = 1.1;
      const newZoom = e.evt.deltaY > 0 ? zoom / scaleBy : zoom * scaleBy;
      const clampedZoom = Math.max(0.1, Math.min(5, newZoom));
      
      // If zoom didn't change (hit bounds), do nothing
      if (clampedZoom === zoom) return;

      // Convert pointer position from screen to world (PDF) coordinates
      const worldPos = {
        x: (pointerPos.x - panOffset.x) / zoom,
        y: (pointerPos.y - panOffset.y) / zoom,
      };
      
      // Calculate the new pan offset to keep the world position fixed under the cursor
      const newPanOffset = {
        x: pointerPos.x - worldPos.x * clampedZoom,
        y: pointerPos.y - worldPos.y * clampedZoom,
      };

      // Update zoomRef synchronously BEFORE state update
      zoomRef.current = clampedZoom;

      // Update state
      setZoom(clampedZoom);
      setPanOffset(newPanOffset);
    },
    [zoom, panOffset, setZoom, setPanOffset]
  );

  const getPointerPos = useCallback(
    (stage: Konva.Stage): Point => {
      const pos = stage.getPointerPosition();
      if (!pos) return { x: 0, y: 0 };
      let pt = {
        x: (pos.x - panOffset.x) / zoom,
        y: (pos.y - panOffset.y) / zoom,
      };
      if (snapToGrid) {
        pt = snapFn(pt, gridSize);
      }
      return pt;
    },
    [panOffset, zoom, snapToGrid, gridSize]
  );

  const pageAnnotations = React.useMemo(
    () => annotations.filter((a) => a.pageIndex === currentPage).sort((a, b) => a.layerOrder - b.layerOrder),
    [annotations, currentPage]
  );
  const currentCal = calibrations[currentPage];

  // Detection overlay: filter to current page
  const pageDetections = React.useMemo(
    () => (detectedElements || []).filter((d) => d.pageIndex === currentPage),
    [detectedElements, currentPage]
  );

  // Fence Trim Function — trims annotations AND PDF vectors that intersect the fence line
  const handleFenceTrim = useCallback((fenceStart: Point, fenceEnd: Point) => {
    let trimCount = 0;

    // 1) Trim existing annotations
    pageAnnotations.forEach(ann => {
      if (ann.type === 'line' || ann.type === 'measure-polyline') {
        const newPoints: Point[] = [];
        let wasTrimmed = false;

        for (let i = 0; i < ann.points.length - 1; i++) {
          const p1 = ann.points[i];
          const p2 = ann.points[i + 1];
          
          const intersection = getLineIntersection(fenceStart, fenceEnd, p1, p2);
          
          if (intersection) {
            wasTrimmed = true;
            const distStartToP1 = getDist(fenceStart, p1);
            const distStartToP2 = getDist(fenceStart, p2);
            
            if (distStartToP1 > distStartToP2) {
               newPoints.push(p1, intersection);
            } else {
               newPoints.push(intersection, p2);
            }
          } else {
            newPoints.push(p1);
            if (i === ann.points.length - 2) newPoints.push(p2);
          }
        }

        if (wasTrimmed) {
          updateAnnotation(ann.id, { points: newPoints });
          pushUndo({ type: 'update', annotation: ann });
          trimCount++;
        }
      } else if (ann.type === 'circle') {
        // Trim circles by converting to arc segments
        const center = ann.points[0];
        const rx = ann.radius || (ann.width || 0) / 2;
        const ry = ann.radius || (ann.height || 0) / 2;
        
        // Calculate intersections between fence line and circle/ellipse
        const intersections: Point[] = [];
        
        // For circle: solve line-circle intersection
        if (ann.type === 'circle') {
          const dx = fenceEnd.x - fenceStart.x;
          const dy = fenceEnd.y - fenceStart.y;
          const fx = fenceStart.x - center.x;
          const fy = fenceStart.y - center.y;
          
          const a = dx * dx + dy * dy;
          const b = 2 * (fx * dx + fy * dy);
          const c = fx * fx + fy * fy - rx * rx;
          
          const discriminant = b * b - 4 * a * c;
          
          if (discriminant >= 0) {
            const t1 = (-b - Math.sqrt(discriminant)) / (2 * a);
            const t2 = (-b + Math.sqrt(discriminant)) / (2 * a);
            
            if (t1 >= 0 && t1 <= 1) {
              intersections.push({ x: fenceStart.x + t1 * dx, y: fenceStart.y + t1 * dy });
            }
            if (t2 >= 0 && t2 <= 1) {
              intersections.push({ x: fenceStart.x + t2 * dx, y: fenceStart.y + t2 * dy });
            }
          }
        }
        
        // If we have intersections, delete the circle (simplified approach)
        // A full implementation would convert to arc segments
        if (intersections.length > 0) {
          deleteAnnotation(ann.id);
          pushUndo({ type: 'delete', annotation: ann });
          trimCount++;
        }
      } else if (ann.type === 'rectangle') {
        // Trim rectangles by checking each edge
        const x = ann.points[0].x;
        const y = ann.points[0].y;
        const w = ann.width || 0;
        const h = ann.height || 0;
        
        const rectPoints = [
          { x, y },
          { x: x + w, y },
          { x: x + w, y: y + h },
          { x, y: y + h },
          { x, y } // Close the loop
        ];
        
        let wasTrimmed = false;
        const newPoints: Point[] = [];
        
        for (let i = 0; i < rectPoints.length - 1; i++) {
          const p1 = rectPoints[i];
          const p2 = rectPoints[i + 1];
          
          const intersection = getLineIntersection(fenceStart, fenceEnd, p1, p2);
          
          if (intersection) {
            wasTrimmed = true;
            const distStartToP1 = getDist(fenceStart, p1);
            const distStartToP2 = getDist(fenceStart, p2);
            
            if (distStartToP1 > distStartToP2) {
              newPoints.push(p1, intersection);
            } else {
              newPoints.push(intersection, p2);
            }
          } else {
            newPoints.push(p1);
          }
        }
        
        if (wasTrimmed && newPoints.length >= 3) {
          // For trimmed rectangles, keep as rectangle but update to bounding box of new points
          const xs = newPoints.map(p => p.x);
          const ys = newPoints.map(p => p.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          
          updateAnnotation(ann.id, { 
            points: [{ x: minX, y: minY }],
            width: maxX - minX,
            height: maxY - minY
          });
          pushUndo({ type: 'update', annotation: ann });
          trimCount++;
        }
      } else if (ann.type === 'arc') {
        // Trim arcs by checking if fence line intersects
        // Simplified: delete arc if fence intersects it
        const [start, end, control] = ann.points;
        if (start && end) {
          const intersection = getLineIntersection(fenceStart, fenceEnd, start, end);
          if (intersection) {
            deleteAnnotation(ann.id);
            pushUndo({ type: 'delete', annotation: ann });
            trimCount++;
          }
        }
      }
    });

    // 2) Trim CAD Layer annotations
    pageAnnotations.forEach(ann => {
      if (ann.type === 'cad-layer' && ann.lines) {
        const newLines: { points: Point[] }[] = [];
        let layerTrimmed = false;

        ann.lines.forEach(polylineObj => {
          const polyline = polylineObj.points;
          let currentLine: Point[] = [];

          for (let i = 0; i < polyline.length - 1; i++) {
            const p1 = polyline[i];
            const p2 = polyline[i + 1];
            const intersection = getLineIntersection(fenceStart, fenceEnd, p1, p2);

            if (intersection) {
              layerTrimmed = true;
              const distStartToP1 = getDist(fenceStart, p1);
              const distStartToP2 = getDist(fenceStart, p2);

              if (distStartToP1 > distStartToP2) {
                currentLine.push(p1, intersection);
                newLines.push({ points: [...currentLine] });
                currentLine = [];
              } else {
                if (currentLine.length > 1) {
                  currentLine.pop();
                  if (currentLine.length > 1) newLines.push({ points: [...currentLine] });
                }
                currentLine = [intersection, p2];
              }
            } else {
              currentLine.push(p2);
            }
          }

          if (currentLine.length > 1) {
            newLines.push({ points: currentLine });
          }
        });

        if (layerTrimmed) {
          updateAnnotation(ann.id, { lines: newLines });
          pushUndo({ type: 'update', annotation: ann });
          trimCount++;
        }
      }
    });

    // 3) Trim PDF vector segments — create annotations from trimmed portions
    if (pdfVectors.current.length > 0) {
      pdfVectors.current.forEach(seg => {
        const intersection = getLineIntersection(fenceStart, fenceEnd, seg.p1, seg.p2);
        if (intersection) {
          const distStartToP1 = getDist(fenceStart, seg.p1);
          const distStartToP2 = getDist(fenceStart, seg.p2);
          const keptPoints = distStartToP1 > distStartToP2
            ? [seg.p1, intersection]
            : [intersection, seg.p2];

          const ann: Annotation = {
            id: crypto.randomUUID(),
            type: 'line',
            pageIndex: currentPage,
            points: keptPoints,
            style: { ...activeStyle, stroke: '#00e5ff', strokeWidth: 1.5, opacity: 0.8, fill: 'transparent' },
            createdBy: 'local',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            layerOrder: annotations.length,
          };
          addAnnotation(ann);
          pushUndo({ type: 'add', annotation: ann });
          trimCount++;
        }
      });
    }

    console.log(`Fence Trim: ${trimCount} object(s) trimmed`);
  }, [pageAnnotations, updateAnnotation, pushUndo, currentPage, activeStyle, annotations.length, addAnnotation]);

  // Fence Extend Function — extends line endpoints to meet the fence line
  const handleFenceExtend = useCallback((fenceStart: Point, fenceEnd: Point) => {
    let extendCount = 0;
    const tolerance = 50; // Max distance to consider for extension

    pageAnnotations.forEach(ann => {
      if (ann.type !== 'line' && ann.type !== 'measure-polyline') return;
      if (ann.points.length < 2) return;

      const newPoints = [...ann.points];
      let wasExtended = false;

      // Try extending from the last segment endpoint
      const lastIdx = ann.points.length - 1;
      const secondLast = ann.points[lastIdx - 1];
      const last = ann.points[lastIdx];
      
      // Direction of the last segment
      const dxLast = last.x - secondLast.x;
      const dyLast = last.y - secondLast.y;
      const lenLast = Math.sqrt(dxLast * dxLast + dyLast * dyLast);
      
      if (lenLast > 0) {
        // Project the line endpoint forward to see if it intersects the fence
        const farPoint = { x: last.x + dxLast * 100, y: last.y + dyLast * 100 };
        const intersection = getLineIntersection(fenceStart, fenceEnd, last, farPoint);
        if (intersection) {
          const dist = getDist(last, intersection);
          if (dist < tolerance) {
            newPoints[lastIdx] = intersection;
            wasExtended = true;
          }
        }
      }

      // Try extending from the first segment start point
      const first = ann.points[0];
      const second = ann.points[1];
      const dxFirst = first.x - second.x;
      const dyFirst = first.y - second.y;
      const lenFirst = Math.sqrt(dxFirst * dxFirst + dyFirst * dyFirst);

      if (lenFirst > 0) {
        const farPointFirst = { x: first.x + dxFirst * 100, y: first.y + dyFirst * 100 };
        const intersectionFirst = getLineIntersection(fenceStart, fenceEnd, first, farPointFirst);
        if (intersectionFirst) {
          const dist = getDist(first, intersectionFirst);
          if (dist < tolerance) {
            newPoints[0] = intersectionFirst;
            wasExtended = true;
          }
        }
      }

      if (wasExtended) {
        pushUndo({ type: 'update', annotation: ann });
        updateAnnotation(ann.id, { points: newPoints });
        extendCount++;
      }
    });

    console.log(`Fence Extend: ${extendCount} object(s) extended`);
  }, [pageAnnotations, updateAnnotation, pushUndo]);

  // Extract a single polyline from a CAD layer as a standard editable annotation
  const handleExtractLineFromLayer = useCallback((layerAnn: Annotation, clickPos: Point) => {
    // For manifest: find the chunk containing the clicked line
    if (layerAnn.chunkIds && layerAnn.chunkIds.length > 0) {
      const chunkAnnotations = annotations.filter((a: Annotation) => layerAnn.chunkIds?.includes(a.id) && a.type === 'cad-layer-chunk');
      
      let closestChunkId: string | null = null;
      let closestLineIndex = -1;
      let minDistance = Infinity;

      // Search all chunks for the closest line
      chunkAnnotations.forEach((chunk: Annotation) => {
        if (!chunk.lines) return;
        chunk.lines.forEach((polylineObj, index) => {
          const line = polylineObj.points;
          for (let i = 0; i < line.length - 1; i++) {
            const dist = pointToSegmentDistance(clickPos, line[i], line[i + 1]);
            if (dist < minDistance) {
              minDistance = dist;
              closestLineIndex = index;
              closestChunkId = chunk.id;
            }
          }
        });
      });

      // If they clicked close enough to a line (within 5 pixels)
      if (minDistance < 5 && closestChunkId !== null && closestLineIndex !== -1) {
        const chunk = chunkAnnotations.find((c: Annotation) => c.id === closestChunkId);
        if (!chunk || !chunk.lines) return;

        const extractedLine = chunk.lines[closestLineIndex].points;

        // Remove the line from the chunk
        const newLines = [...chunk.lines];
        newLines.splice(closestLineIndex, 1);
        updateAnnotation(chunk.id, { lines: newLines });

        // Create the Mask (white, locked line that hides the original PDF raster line)
        const maskAnn: Annotation = {
          id: crypto.randomUUID(),
          type: 'line',
          pageIndex: currentPage,
          points: extractedLine,
          style: {
            stroke: '#ffffff',
            strokeWidth: (layerAnn.style.strokeWidth || 1) + 2,
            fill: 'transparent',
            opacity: 1
          },
          createdBy: 'system-mask',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layerOrder: 1, // Sit right above the PDF layer
        locked: true,
      };

        // Create the Editable Line (blue, on top)
        const newAnn: Annotation = {
          id: crypto.randomUUID(),
          type: 'line',
          pageIndex: currentPage,
          points: extractedLine,
          style: { ...layerAnn.style, stroke: '#1a73e8' }, // Highlight in blue
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layerOrder: annotations.length + 2,
        };

        // Add both annotations
        addAnnotation(maskAnn);
        addAnnotation(newAnn);
        setSelectedAnnotationId(newAnn.id); // Auto-select the extracted line

        // Push correct states to Undo Stack
        pushUndo({ type: 'batch-add', annotations: [maskAnn, newAnn] });
        pushUndo({ type: 'update', annotation: { ...chunk, lines: newLines }, previousState: { ...chunk } });

        console.log(`Extracted polyline with ${extractedLine.length} points from CAD layer chunk (with mask)`);
      }
      return;
    }

    // Legacy: direct lines (for backward compatibility)
    if (!layerAnn.lines) return;

    let closestLineIndex = -1;
    let minDistance = Infinity;

    // Find which polyline the user double-clicked on
    layerAnn.lines.forEach((polylineObj, index) => {
      const line = polylineObj.points;
      for (let i = 0; i < line.length - 1; i++) {
        const dist = pointToSegmentDistance(clickPos, line[i], line[i + 1]);
        if (dist < minDistance) {
          minDistance = dist;
          closestLineIndex = index;
        }
      }
    });

    // If they clicked close enough to a line (within 5 pixels)
    if (minDistance < 5 && closestLineIndex !== -1) {
      const extractedLine = layerAnn.lines[closestLineIndex].points;

      // Remove the line from the CAD layer
      const newLines = [...layerAnn.lines];
      newLines.splice(closestLineIndex, 1);
      const updatedLayerAnn = { ...layerAnn, lines: newLines };
      updateAnnotation(layerAnn.id, { lines: newLines });

      // Create the Mask (white, locked line that hides the original PDF raster line)
      const maskAnn: Annotation = {
        id: crypto.randomUUID(),
        type: 'line',
        pageIndex: currentPage,
        points: extractedLine,
        style: {
          stroke: '#ffffff',
          strokeWidth: (layerAnn.style.strokeWidth || 1) + 2,
          fill: 'transparent',
          opacity: 1
        },
        createdBy: 'system-mask',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layerOrder: 1, // Sit right above the PDF layer
        locked: true,
      };

      // Create the Editable Line (blue, on top)
      const newAnn: Annotation = {
        id: crypto.randomUUID(),
        type: 'line',
        pageIndex: currentPage,
        points: extractedLine,
        style: { ...layerAnn.style, stroke: '#1a73e8' }, // Highlight in blue
        createdBy: 'local',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layerOrder: annotations.length + 2,
      };

      // Add both annotations
      addAnnotation(maskAnn);
      addAnnotation(newAnn);
      setSelectedAnnotationId(newAnn.id); // Auto-select the extracted line

      // Push correct states to Undo Stack
      pushUndo({ type: 'batch-add', annotations: [maskAnn, newAnn] });
      pushUndo({ type: 'update', annotation: updatedLayerAnn, previousState: { ...layerAnn, lines: layerAnn.lines } });

      console.log(`Extracted polyline with ${extractedLine.length} points from CAD layer (with mask)`);
    }
  }, [currentPage, annotations, annotations.length, updateAnnotation, addAnnotation, setSelectedAnnotationId, pushUndo]);

  // Convert PDF Vectors to editable annotations using comprehensive CTM-aware extraction
  // Uses Web Worker for greedy merge to prevent UI freezing (Phase 2: Web Worker)
  const handleConvertVectorsToCAD = useCallback(async () => {
    console.log('CONVERTTOCAD: Extracting full vector geometry with CTM tracking...');
    const segments = await extractFullVectorGeometry(currentPage);
    
    if (segments.length === 0) {
      console.log('No PDF vectors found on this page');
      return;
    }

    console.log(`CONVERTTOCAD: Extracted ${segments.length} raw segments, offloading greedy merge to Web Worker...`);

    // Phase 2: Use Web Worker for heavy math to prevent UI freezing
    const worker = new Worker(new URL('../workers/cadWorker.ts', import.meta.url), { type: 'module' });

    const optimizedPolylines = await new Promise<{ x: number; y: number }[][]>((resolve, reject) => {
      worker.onmessage = (e) => {
        if (e.data.type === 'segmentsProcessed') {
          resolve(e.data.optimizedPolylines);
          worker.terminate();
        } else if (e.data.type === 'error') {
          reject(new Error(e.data.error));
          worker.terminate();
        }
      };

      worker.onerror = (error) => {
        reject(error);
        worker.terminate();
      };

      worker.postMessage({
        type: 'processSegments',
        rawSegments: segments
      });
    });

    const optimizedLines: Point[][] = optimizedPolylines.map(line => 
      line.map(p => ({ x: p.x, y: p.y }))
    );

    console.log(`CONVERTTOCAD: Worker merged ${segments.length} segments into ${optimizedLines.length} polylines`);

    // Save to Firestore with chunking (Phase 1: Database Fix)
    const { manifestId, chunkIds } = await saveCADLayerToFirestore(
      optimizedLines,
      currentPage,
      { stroke: '#333333', strokeWidth: 1, opacity: 0.9, fill: 'transparent' }
    );

    // Load chunks back for local rendering
    const loadedLines = await loadCADChunksFromFirestore(chunkIds);

    // Create local chunk annotations for rendering
    const store = useStore.getState();
    const chunkAnnotations: Annotation[] = [];

    chunkIds.forEach((chunkId, index) => {
      const chunkAnn: Annotation = {
        id: chunkId,
        type: 'cad-layer-chunk',
        pageIndex: currentPage,
        points: [{ x: 0, y: 0 }],
        lines: loadedLines.slice(index * 400, (index + 1) * 400),
        style: { stroke: '#333333', strokeWidth: 1, opacity: 0.9, fill: 'transparent' },
        createdBy: 'pdf-vector-import',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layerOrder: 0,
      };
      store.addAnnotation(chunkAnn);
      chunkAnnotations.push(chunkAnn);
    });

    // Create manifest annotation
    const manifestAnn: Annotation = {
      id: manifestId,
      type: 'cad-layer',
      pageIndex: currentPage,
      points: [{ x: 0, y: 0 }],
      lines: [],
      chunkIds,
      style: { stroke: '#333333', strokeWidth: 1, opacity: 0.9, fill: 'transparent' },
      createdBy: 'pdf-vector-import',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      layerOrder: 0,
    };
    store.addAnnotation(manifestAnn);

    pushUndo({ type: 'batch-add', annotations: [...chunkAnnotations, manifestAnn] });

    console.log(`CONVERTTOCAD: Created manifest ${manifestId} with ${chunkIds.length} chunks containing ${optimizedLines.length} total polylines`);
  }, [currentPage, pushUndo]);

  // Copy Function
  const handleCopySelection = useCallback(() => {
    const selectedIds = useStore.getState().selectedAnnotationIds;
    if (selectedIds.length === 0) return;
    
    const store = useStore.getState();
    const clones = selectedIds.map(id => {
      const original = annotations.find(a => a.id === id);
      if (!original) return null;
      
      // Offset copy by 20px so it's visible
      const newPoints = original.points.map(p => ({ x: p.x + 20, y: p.y + 20 }));
      
      const clone: Annotation = {
        ...original,
        id: crypto.randomUUID(),
        points: newPoints,
        createdAt: Date.now(),
        updatedAt: Date.now(),
      };
      return clone;
    }).filter(Boolean) as Annotation[];

    clones.forEach(store.addAnnotation);
    store.setSelectedAnnotationIds(clones.map(c => c.id)); // Auto-select new copies
  }, [annotations]);

  // Offset Function
  const handleOffsetCommand = useCallback((distance: number) => {
    const selectedIds = useStore.getState().selectedAnnotationIds;
    const store = useStore.getState();
    
    selectedIds.forEach(id => {
      const ann = annotations.find(a => a.id === id);
      if (ann && (ann.type === 'line' || ann.type === 'measure-polyline')) {
        const offsetPts = getOffsetPoints(ann.points, distance);
        
        const offsetAnn: Annotation = {
          ...ann,
          id: crypto.randomUUID(),
          points: offsetPts,
        };
        
        store.addAnnotation(offsetAnn);
        store.pushUndo({ type: 'add', annotation: offsetAnn });
      }
    });
  }, [annotations]);

  // Listen for CAD command execution triggers from CLI
  const { cadPendingExecute, clearCADExecute } = useStore();
  
  useEffect(() => {
    if (!cadPendingExecute) return;

    if (cadPendingExecute.command === 'COPY') {
      handleCopySelection();
    } else if (cadPendingExecute.command === 'OFFSET') {
      handleOffsetCommand(cadPendingExecute.payload);
      // Clear CAD state after OFFSET execution
      useStore.getState().setCADPendingCommand(null);
      useStore.getState().setCADCommandStep(0);
      useStore.getState().clearCADSelectedIds();
    } else if (cadPendingExecute.command === 'FENCE_TRIM') {
      // Set tool to trim-fence mode and clear CAD pending command
      // so mouseDown is not intercepted by CAD point collection
      useStore.getState().setCADPendingCommand(null);
      useStore.getState().clearCADPendingPoints();
      useStore.getState().setCADCommandStep(0);
      fenceExtendMode.current = false;
      setActiveTool('trim-fence');
    } else if (cadPendingExecute.command === 'FENCE_EXTEND') {
      useStore.getState().setCADPendingCommand(null);
      useStore.getState().clearCADPendingPoints();
      useStore.getState().setCADCommandStep(0);
      fenceExtendMode.current = true;
      setActiveTool('trim-fence');
    } else if (cadPendingExecute.command === 'CONVERTTOCAD') {
      useStore.getState().setCADPendingCommand(null);
      handleConvertVectorsToCAD();
    } else if (cadPendingExecute.command === 'ROTATE_TYPED') {
      const angleDeg = cadPendingExecute.payload;
      const angleRad = angleDeg * Math.PI / 180;
      const { cadPendingPoints, cadSelectedIds, clearCADSelectedIds, setCADPendingPoints, setCADCommandStep, setCADPendingCommand } = useStore.getState();
      const basePoint = cadPendingPoints[0];

      if (basePoint && rotationOriginalPositions.current.size > 0) {
        cadSelectedIds.forEach(id => {
          const original = rotationOriginalPositions.current.get(id);
          const ann = annotations.find(a => a.id === id);
          if (original && original.points && ann) {
            const isLineBased = ['line', 'arc', 'arrow', 'measure-distance', 'measure-polyline', 'measure-area', 'measure-perimeter', 'freehand'].includes(ann.type);

            if (isLineBased) {
              const rotatedPoints = original.points.map((p: Point) => rotatePointAround(p, basePoint, angleRad));
              updateAnnotation(id, { points: rotatedPoints });
            } else {
              // Non-line shapes (rectangle, circle, text, etc.): rotate the geometric CENTER
              // around basePoint, then shift all points by that delta. Update rotation prop.
              const w = ann.width || 0;
              const h = ann.height || 0;
              const p0 = original.points[0];
              let oldCenter: Point;
              if (w && h) {
                oldCenter = { x: p0.x + w / 2, y: p0.y + h / 2 };
              } else {
                // Fallback: average of all points
                const sum = original.points.reduce((acc: Point, p: Point) => ({ x: acc.x + p.x, y: acc.y + p.y }), { x: 0, y: 0 });
                oldCenter = { x: sum.x / original.points.length, y: sum.y / original.points.length };
              }
              const newCenter = rotatePointAround(oldCenter, basePoint, angleRad);
              const dx = newCenter.x - oldCenter.x;
              const dy = newCenter.y - oldCenter.y;

              const translatedPoints = original.points.map((p: Point) => ({ x: p.x + dx, y: p.y + dy }));

              updateAnnotation(id, {
                points: translatedPoints,
                rotation: (original.rotation || 0) + angleDeg
              });
            }
            // Push the final permanent state to the Undo stack
            const finalAnn = useStore.getState().annotations.find(a => a.id === id);
            if (finalAnn) pushUndo({ type: 'update', annotation: finalAnn });
          }
        });

        // Clean up command states
        rotationOriginalPositions.current.clear();
        clearCADSelectedIds();
        setCADPendingPoints([]);
        setCADPendingCommand(null);
        setCADCommandStep(0);
        setActiveTool('select');
      }
    } else if (cadPendingExecute.command === 'MOVE_TYPED' || cadPendingExecute.command === 'COPY_TYPED') {
      const distance = cadPendingExecute.payload;
      const { cadPendingPoints, cadSelectedIds, clearCADSelectedIds, setCADPendingPoints, setCADCommandStep, setCADPendingCommand } = useStore.getState();
      const basePoint = cadPendingPoints[0];

      // Get mouse cursor position to determine the angle for the typed distance
      const stage = stageRef.current;
      let targetPoint = basePoint;
      if (stage) {
        const pos = stage.getPointerPosition();
        if (pos) targetPoint = { x: (pos.x - panOffset.x) / zoom, y: (pos.y - panOffset.y) / zoom };
      }

      if (basePoint && targetPoint && rotationOriginalPositions.current.size > 0) {
        const angle = Math.atan2(targetPoint.y - basePoint.y, targetPoint.x - basePoint.x);
        const dx = Math.cos(angle) * distance;
        const dy = Math.sin(angle) * distance;

        if (cadPendingExecute.command === 'MOVE_TYPED') {
          cadSelectedIds.forEach(id => {
            const original = rotationOriginalPositions.current.get(id);
            if (original && original.points) {
               const movedPts = original.points.map((p: Point) => ({ x: p.x + dx, y: p.y + dy }));
               updateAnnotation(id, { points: movedPts });
               const finalAnn = useStore.getState().annotations.find(a => a.id === id);
               if (finalAnn) pushUndo({ type: 'update', annotation: finalAnn });
            }
          });
        } else if (cadPendingExecute.command === 'COPY_TYPED') {
          const newAnns: any[] = [];
          cadSelectedIds.forEach(id => {
            const original = rotationOriginalPositions.current.get(id);
            const annToCopy = annotations.find(a => a.id === id);
            if (original && original.points && annToCopy) {
               const movedPts = original.points.map((p: Point) => ({ x: p.x + dx, y: p.y + dy }));
               const newAnn = { ...annToCopy, id: crypto.randomUUID(), points: movedPts };
               useStore.getState().addAnnotation(newAnn);
               newAnns.push(newAnn);
            }
          });
          if (newAnns.length > 0) pushUndo({ type: 'add', annotations: newAnns });
        }

        rotationOriginalPositions.current.clear();
        clearCADSelectedIds();
        setCADPendingPoints([]);
        setCADPendingCommand(null);
        setCADCommandStep(0);
        setActiveTool('select');
      }
    } else if (cadPendingExecute.command === 'CIRCLE_TYPED') {
      useStore.getState().setCADPendingCommand(null);
      const payload = cadPendingExecute.payload;
      const center = payload.center || useStore.getState().cadPendingPoints[0];
      const radius = payload.radius;

      if (center && radius) {
        const circleAnn: Annotation = {
          id: crypto.randomUUID(),
          type: 'circle',
          pageIndex: currentPage,
          points: [center],
          width: radius * 2,
          height: radius * 2,
          radius,
          style: { ...activeStyle, fill: 'transparent' },
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layerOrder: annotations.length,
        };
        addAnnotation(circleAnn);
        pushUndo({ type: 'add', annotation: circleAnn });
        useStore.getState().clearCADPendingPoints();
        useStore.getState().setCADCommandStep(0);
        setActiveTool('select');
      }
    } else if (cadPendingExecute.command === 'RECTANG_TYPED') {
      useStore.getState().setCADPendingCommand(null);
      const { w, h } = cadPendingExecute.payload;
      const p1 = useStore.getState().cadPendingPoints[0];

      if (p1 && !isNaN(w) && !isNaN(h)) {
        // Allows drawing rects backwards if they type negative dimensions
        const x = Math.min(p1.x, p1.x + w);
        const y = Math.min(p1.y, p1.y + h);
        const rectAnn: Annotation = {
          id: crypto.randomUUID(),
          type: 'rectangle',
          pageIndex: currentPage,
          points: [{ x, y }],
          width: Math.abs(w),
          height: Math.abs(h),
          style: { ...activeStyle, fill: 'transparent' },
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layerOrder: annotations.length,
        };
        addAnnotation(rectAnn);
        pushUndo({ type: 'add', annotation: rectAnn });
        useStore.getState().clearCADPendingPoints();
        useStore.getState().setCADCommandStep(0);
        setActiveTool('select');
      }
    } else if (cadPendingExecute.command === 'DXF') {
      useStore.getState().setCADPendingCommand(null);

      const pageAnnotations = annotations.filter(a => a.pageIndex === currentPage);
      const pageHeight = pdfSize.height * 2; // Assuming pdfSize is at 50% scale based on renderPage logic

      const dxfString = generateDXF(pageAnnotations, pageHeight);

      const blob = new Blob([dxfString], { type: 'text/plain' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.download = `Blueprint_Page_${currentPage + 1}.dxf`;
      link.href = url;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    clearCADExecute(); // Reset so it doesn't fire twice
  }, [cadPendingExecute, handleCopySelection, handleOffsetCommand, handleConvertVectorsToCAD, clearCADExecute, setActiveTool, annotations, currentPage, pdfSize.height]);

  const convertDetectionToAreaMeasurement = useCallback((id: string) => {
    const det = (detectedElements || []).find((d) => d.id === id);
    if (!det) return;
    const ann: Annotation = {
      id: crypto.randomUUID(),
      type: 'measure-area',
      pageIndex: currentPage,
      points: det.polygon,
      style: { ...activeStyle, fill: 'rgba(0,229,255,0.18)' },
      createdBy: 'local',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      layerOrder: annotations.length,
      text: det.label,
    };
    addAnnotation(ann);
    pushUndo({ type: 'add', annotation: ann });
    addMeasurement({
      id: crypto.randomUUID(),
      type: 'area',
      annotationId: ann.id,
      pageIndex: currentPage,
      points: det.polygon,
      value: polygonArea(det.polygon, currentCal),
      unit: measurementUnit,
      label: det.label + (det.quantification ? ` (${det.quantification})` : ''),
      createdBy: 'local',
      createdAt: Date.now(),
      updatedAt: Date.now(),
    });
  }, [detectedElements, currentPage, activeStyle, annotations.length, addAnnotation, pushUndo, addMeasurement, currentCal, measurementUnit]);

  // --- Drawing handlers ---
  const handleMouseDown = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      const stage = e.target.getStage();
      if (!stage) return;
      const pos = getPointerPos(stage);

      // Ctrl+Click or middle mouse button enables temporary pan mode
      if (e.evt.ctrlKey || e.evt.metaKey || e.evt.button === 1) {
        e.evt.preventDefault(); // Prevent default middle mouse button behavior (scroll arrows)
        previousToolRef.current = activeTool;
        setActiveTool('pan');
        // Start manual panning immediately (Konva draggable won't catch this mouseDown)
        middleMousePanning.current = true;
        middleMouseStart.current = {
          x: e.evt.clientX,
          y: e.evt.clientY,
          panX: panOffset.x,
          panY: panOffset.y,
        };
        document.body.style.cursor = 'grabbing';
        return;
      }

      if (activeTool === 'pan') {
        return;
      }

      // Block editing when PDF is locked (signed)
      if (pdfLocked && activeTool !== 'select' && activeTool !== 'text-select') {
        return;
      }

      // CAD Command point collection: if a CAD command is pending, capture the point
      const { cadPendingCommand, addCADPendingPoint, cadPendingPoints, setActiveTool: setStoreActiveTool, cadCommandStep: currentCadStep, cadSelectedIds } = useStore.getState();

      // Get fresh values for ROTATE check to avoid stale closure
      const storeState = useStore.getState();
      const storeCmd = storeState.cadPendingCommand;
      const storeStep = storeState.cadCommandStep;
      const storeSelIds = storeState.cadSelectedIds;
      const isInteractiveCmd = ['ROTATE', 'MOVE', 'COPY'].includes(storeCmd?.toUpperCase() || '');

      // --- Finalize command on a NEW mouse click (Step 2) ---
      if (storeStep === 2 && isInteractiveCmd && storeState.cadPendingPoints.length > 0) {
        // Prevent phantom double-clicks (hardware bounce or touch+mouse overlap)
        if (Date.now() - lastBasePointTime.current < 250) {
          console.log(`${storeCmd}: Ignored phantom double-click`);
          return; 
        }

        e.evt.preventDefault();
        e.evt.stopPropagation();
        e.evt.stopImmediatePropagation?.();
        
        const basePoint = storeState.cadPendingPoints[0];
        const targetPoint = pos;
        
        // Calculate the physical distance the mouse moved
        const dx = targetPoint.x - basePoint.x;
        const dy = targetPoint.y - basePoint.y;
        
        const cCmd = storeCmd?.toUpperCase();

        if (cCmd === 'MOVE') {
          storeSelIds.forEach(id => {
            const original = rotationOriginalPositions.current.get(id);
            if (original && original.points) {
               // Shift all points by the exact mouse delta
               const movedPts = original.points.map((p: Point) => ({ x: p.x + dx, y: p.y + dy }));
               storeState.updateAnnotation(id, { points: movedPts });
               const finalAnn = storeState.annotations.find(a => a.id === id);
               if (finalAnn) pushUndo({ type: 'update', annotation: finalAnn });
            }
          });
          console.log('MOVE: Finalized via canvas click.');
        } 
        else if (cCmd === 'COPY') {
          const newAnns: any[] = [];
          storeSelIds.forEach(id => {
            const original = rotationOriginalPositions.current.get(id);
            const annToCopy = annotations.find(a => a.id === id);
            if (original && original.points && annToCopy) {
               // Shift points and assign a brand new ID
               const movedPts = original.points.map((p: Point) => ({ x: p.x + dx, y: p.y + dy }));
               const newAnn = { ...annToCopy, id: crypto.randomUUID(), points: movedPts };
               storeState.addAnnotation(newAnn);
               newAnns.push(newAnn);
            }
          });
          if (newAnns.length > 0) pushUndo({ type: 'add', annotations: newAnns });
          console.log('COPY: Finalized via canvas click.');
        }
        else if (cCmd === 'ROTATE') {
          // Finalize rotation
          storeSelIds.forEach(id => {
            const ann = annotations.find(a => a.id === id);
            if (ann) pushUndo({ type: 'update', annotation: ann });
          });
          console.log('ROTATE: Finalized via canvas click.');
        }
        
        // Clean up and reset tool
        rotationOriginalPositions.current.clear();
        storeState.clearCADSelectedIds();
        storeState.setCADPendingPoints([]);
        storeState.setCADPendingCommand(null);
        storeState.setCADCommandStep(0);
        storeState.setActiveTool('select');
        return;
      }
      // -----------------------------------------------------------------------

      // Special handling for ROTATE/MOVE/COPY mode - base point picking (step 1)
      if (storeStep === 1 && isInteractiveCmd) {
        lastBasePointTime.current = Date.now(); // Record the exact timestamp

        e.evt.preventDefault();
        e.evt.stopPropagation();
        e.evt.stopImmediatePropagation?.();
        // Any click sets the base point
        storeState.setCADPendingPoints([pos]);
        console.log(`${storeCmd}: Before setting step 2, cadCommandStep:`, storeState.cadCommandStep);
        storeState.setCADCommandStep(2); // Step 2: destination
        console.log(`${storeCmd}: After setting step 2, state - cadPendingCommand:`, storeState.cadPendingCommand, 'cadCommandStep:', storeState.cadCommandStep, 'cadPendingPoints:', storeState.cadPendingPoints);
        
        // Store original positions (Works perfectly for MOVE and COPY too!)
        const originals = new Map<string, any>();
        storeSelIds.forEach(id => {
          const ann = annotations.find(a => a.id === id);
          if (ann) {
            originals.set(id, {
              points: ann.points ? ann.points.map(p => ({ ...p })) : undefined,
              rotation: ann.rotation || 0,
            });
          }
        });
        rotationOriginalPositions.current = originals;
        console.log(`${storeCmd}: Base point set at`, pos, '. Click to set destination point.');
        // Don't auto-open command line - it causes state clearing issues
        // User can manually open with Ctrl+9 or click if needed
        // CRITICAL: Return immediately to prevent any other handlers from running
        // This includes annotation selection handlers that might reset the command
        return;
      }

      // Other CAD commands (LINE, CIRCLE, etc.) - skip ROTATE/MOVE/COPY/OFFSET (interactive commands)
      const cmdUpperSkip = cadPendingCommand?.toUpperCase() || '';
      if (cadPendingCommand && !['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(cmdUpperSkip)) {
        // Handle SIGNATURE_PLACE - draw rectangle to place signature
        if (cmdUpperSkip === 'SIGNATURE_PLACE') {
          e.evt.preventDefault();
          e.evt.stopPropagation();

          const newPoints = [...cadPendingPoints, pos];
          storeState.setCADPendingPoints(newPoints);

          if (newPoints.length === 2) {
            // Rectangle complete - place signature
            const pendingSignature = storeState.pendingSignature;
            if (pendingSignature) {
              const p1 = newPoints[0];
              const p2 = newPoints[1];
              const x = Math.min(p1.x, p2.x);
              const y = Math.min(p1.y, p2.y);
              const w = Math.abs(p2.x - p1.x);
              const h = Math.abs(p2.y - p1.y);

              // Create image annotation with signature scaled to rectangle
              const img = new window.Image();
              img.onload = () => {
                const ann = {
                  id: crypto.randomUUID(),
                  type: 'image' as const,
                  pageIndex: currentPage,
                  points: [{ x, y }],
                  width: w,
                  height: h,
                  imageData: pendingSignature.imageData,
                  style: activeStyle,
                  createdBy: 'local',
                  createdAt: Date.now(),
                  updatedAt: Date.now(),
                  layerOrder: annotations.length,
                };
                storeState.addAnnotation(ann);
                pushUndo({ type: 'add', annotation: ann });
                storeState.setPendingSignature(null);
              };
              img.src = pendingSignature.imageData;
            }

            storeState.setCADPendingPoints([]);
            storeState.setCADPendingCommand(null);
            storeState.setCADCommandStep(0);
            storeState.setActiveTool('select');
          }
          return;
        }
        e.evt.preventDefault();
        e.evt.stopPropagation();

        // Apply ORTHO constraint (Shift key) for line-based commands
        let finalPos = pos;
        const cmdUpper = cadPendingCommand.toUpperCase();
        
        // Apply Smart Ortho Trace if enabled (replaces Shift key ORTHO)
        const { smartTraceEnabled } = useStore.getState();
        if (smartTraceEnabled &&
            (cmdUpper === 'LINE' || cmdUpper === 'L' ||
             cmdUpper === 'PLINE' || cmdUpper === 'PL' ||
             cmdUpper === 'ARROW' || cmdUpper === 'AR') &&
            cadPendingPoints.length > 0) {
          const lastPoint = cadPendingPoints[cadPendingPoints.length - 1];
          finalPos = normalizeToOrtho([lastPoint, pos], 15)[1];
        } else if (e.evt.shiftKey &&
            (cmdUpper === 'LINE' || cmdUpper === 'L' ||
             cmdUpper === 'PLINE' || cmdUpper === 'PL' ||
             cmdUpper === 'ARROW' || cmdUpper === 'AR') &&
            cadPendingPoints.length > 0) {
          const lastPoint = cadPendingPoints[cadPendingPoints.length - 1];
          finalPos = constrainToAxis(lastPoint, pos);
        }

        const newPoints = [...cadPendingPoints, finalPos];
        storeState.setCADPendingPoints(newPoints);

        // --- AUTO-COMPLETE FOR 2-POINT COMMANDS ---
        if (['LINE', 'L', 'RECTANG', 'REC', 'CIRCLE', 'C', 'ARROW', 'AR'].includes(cmdUpper)) {
          if (newPoints.length === 2) {
            const id = crypto.randomUUID();
            let ann: Annotation | null = null;

            if (cmdUpper === 'CIRCLE' || cmdUpper === 'C') {
              const radius = Math.sqrt(Math.pow(newPoints[1].x - newPoints[0].x, 2) + Math.pow(newPoints[1].y - newPoints[0].y, 2));
              ann = {
                id, type: 'circle', pageIndex: currentPage, points: [newPoints[0]],
                width: radius * 2, height: radius * 2, radius,
                style: { ...activeStyle, fill: 'transparent' },
                createdBy: 'local', createdAt: Date.now(), updatedAt: Date.now(), layerOrder: annotations.length
              };
            } else if (cmdUpper === 'RECTANG' || cmdUpper === 'REC') {
              const x = Math.min(newPoints[0].x, newPoints[1].x);
              const y = Math.min(newPoints[0].y, newPoints[1].y);
              const w = Math.abs(newPoints[1].x - newPoints[0].x);
              const h = Math.abs(newPoints[1].y - newPoints[0].y);
              ann = {
                id, type: 'rectangle', pageIndex: currentPage, points: [{x, y}],
                width: w, height: h,
                style: { ...activeStyle, fill: 'transparent' },
                createdBy: 'local', createdAt: Date.now(), updatedAt: Date.now(), layerOrder: annotations.length
              };
            } else if (cmdUpper === 'ARROW' || cmdUpper === 'AR') {
              ann = { id, type: 'arrow', pageIndex: currentPage, points: newPoints, style: { ...activeStyle }, createdBy: 'local', createdAt: Date.now(), updatedAt: Date.now(), layerOrder: annotations.length };
            } else {
              ann = { id, type: 'line', pageIndex: currentPage, points: newPoints, style: { ...activeStyle }, createdBy: 'local', createdAt: Date.now(), updatedAt: Date.now(), layerOrder: annotations.length };
            }

            if (ann) {
              storeState.addAnnotation(ann);
              pushUndo({ type: 'add', annotation: ann });
            }

            storeState.setCADPendingPoints([]);
            storeState.setCADPendingCommand(null);
            storeState.setCADCommandStep(0);
            storeState.setActiveTool('select');
          }
        }

        // Keep the drawing tool active for visual feedback
        return;
      }

      // CAD Selection Mode: handle annotation selection for erase, join, explode, etc.
      const { cadSelectionMode, addCADSelectedId, removeCADSelectedId } = useStore.getState();
      const activeCmdUp = storeCmd?.toUpperCase() || '';
      const isInteractiveStep0 = ['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(activeCmdUp) && storeStep === 0;

      if ((cadSelectionMode || isInteractiveStep0) && activeTool === 'select') {
        // Special handling for TRIM mode
        if (cadSelectionMode === 'trim') {
          const target = e.target;
          const clickedAnn = target.name() === 'annotation' ? target : target.findAncestor?.('.annotation');

          if (clickedAnn) {
            const annId = clickedAnn.id();
            const ann = annotations.find(a => a.id === annId);
            const shiftHeld = e.evt.shiftKey;

            e.evt.preventDefault();
            e.evt.stopPropagation();

            if (ann && (ann.type === 'line' || ann.type === 'measure-polyline')) {
              const extendDefault = useStore.getState().cadExtendDefault;
              // When extendDefault is true (EXTEND command), click extends and shift+click trims
              // When extendDefault is false (TRIM command), click trims and shift+click extends
              const shouldExtend = extendDefault ? !shiftHeld : shiftHeld;
              if (shouldExtend) {
                handleTrimExtend(ann, pos);
              } else {
                handleTrimCut(ann, pos);
              }
            }
            return;
          }
          // Don't cancel trim mode on empty space click - keep it active until Escape
        }

        // Special handling for interactive commands - selection phase (step 0)
        if (cadSelectionMode === 'rotate' || isInteractiveStep0) {
          const target = e.target;
          const clickedAnn = target.name() === 'annotation' ? target : target.findAncestor?.('.annotation');

          e.evt.preventDefault();
          e.evt.stopPropagation();

          if (clickedAnn) {
            const annId = clickedAnn.id();
            if (cadSelectedIds.includes(annId)) {
              removeCADSelectedId(annId);
            } else {
              addCADSelectedId(annId);
            }
            return;
          }
          // Clicking empty space does nothing in selection phase
          return;
        }
        
        // Other selection modes (erase, join, explode, etc.)
        const target = e.target;
        const clickedAnn = target.name() === 'annotation' ? target : target.findAncestor?.('.annotation');
        
        if (clickedAnn) {
          const annId = clickedAnn.id();
          e.evt.preventDefault();
          e.evt.stopPropagation();
          
          if (cadSelectedIds.includes(annId)) {
            // Deselect if already selected
            removeCADSelectedId(annId);
          } else {
            // Add to selection
            addCADSelectedId(annId);
          }
          return;
        } else if (target === stage || target.getParent()?.name() === 'pdf-layer') {
          // Clicked on empty space - clear selection
          // But don't interfere with interactive command base point selection
          const { cadPendingCommand, cadCommandStep } = useStore.getState();
          const activeCmdUp = cadPendingCommand?.toUpperCase() || '';
          if (['ROTATE', 'MOVE', 'COPY'].includes(activeCmdUp) && cadCommandStep === 1) {
            // Let the interactive command handler take care of this click
            return;
          }
          useStore.getState().clearCADSelectedIds();
          return;
        }
      }

      if (activeTool === 'select') {
        // Prevent empty space clicks from interfering with interactive command base point selection
        const { cadPendingCommand, cadCommandStep } = useStore.getState();
        const activeCmdUp = cadPendingCommand?.toUpperCase() || '';
        if (['ROTATE', 'MOVE', 'COPY'].includes(activeCmdUp) && cadCommandStep === 1) {
          // Let the interactive command handler take care of this click
          return;
        }
        if (e.target === stage || e.target.getParent()?.name() === 'pdf-layer') {
          setSelectedAnnotationId(null);
          // Start box selection
          setIsDrawing(true);
          setSelectionRect({ start: pos, end: pos, direction: 'left-to-right' });
        }
        return;
      }

      if (activeTool === 'measure-count') {
        addCountMarker(pos);
        return;
      }

      // BIM Capture: place marker if a type is selected
      if (activeTool === 'bim-capture' && selectedBimType) {
        setBimClickPosition(pos);
        setBimDialogOpen(true);
        return;
      }

      // Hatch Tool - Point in Polygon or Shape
      if (activeTool === 'hatch') {
        // Check if click is inside any existing closed annotation
        const targetAnn = pageAnnotations.find(ann => {
          if (ann.type === 'rectangle' && ann.points.length > 0) {
            const x = ann.points[0].x;
            const y = ann.points[0].y;
            const w = ann.width || 0;
            const h = ann.height || 0;
            return pos.x >= x && pos.x <= x + w && pos.y >= y && pos.y <= y + h;
          }
          if (ann.type === 'circle' && ann.points.length > 0) {
            const rX = (ann.width || 0) / 2;
            const rY = (ann.height || 0) / 2;
            const cx = ann.points[0].x + rX;
            const cy = ann.points[0].y + rY;
            // Ellipse collision formula
            return (Math.pow(pos.x - cx, 2) / Math.pow(rX, 2)) + (Math.pow(pos.y - cy, 2) / Math.pow(rY, 2)) <= 1;
          }
          if (['measure-area', 'measure-perimeter', 'cloud'].includes(ann.type) && ann.points.length >= 3) {
            return isPointInPolygon(pos, ann.points);
          }
          return false;
        });

        if (targetAnn) {
          // Create a hatched fill overlay that perfectly matches the target shape
          const hatchAnn: Annotation = {
            ...targetAnn,
            id: crypto.randomUUID(),
            style: { ...activeStyle, fill: 'rgba(0, 0, 0, 0.3)', strokeWidth: 0 },
            createdBy: 'local',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            layerOrder: annotations.length,
          };
          delete hatchAnn.text; // Ensure we don't duplicate any text labels
          addAnnotation(hatchAnn);
          pushUndo({ type: 'add', annotation: hatchAnn });
          setActiveTool('select');
        }
        return;
      }

      // Zoom rectangle tool
      if (activeTool === 'zoom-rectangle') {
        setIsDrawing(true);
        setZoomRect({ start: pos, end: pos });
        return;
      }

      // Calibration tool: collect points
      if (isCalibrating) {
        if (calibrationPoints.length < 2) {
          setCalibrationPoints([...calibrationPoints, pos]);
        }
        return;
      }

      // Start drawing
      setIsDrawing(true);

      // For multi-click tools, accumulate points if already drawing
      if (isDrawing && (
        activeTool === 'measure-area' ||
        activeTool === 'measure-perimeter' ||
        activeTool === 'measure-polyline' ||
        activeTool === 'measure-angle' ||
        (activeTool === 'cut' && cutMode === 'polygon')
      )) {
        setDrawingPoints([...drawingPoints, pos]);
        return;
      }

      setDrawingPoints([pos]);

      // Handle single-click tools
      if (activeTool === 'stamp-check' || activeTool === 'stamp-x') {
        const ann: Annotation = {
          id: crypto.randomUUID(),
          type: activeTool,
          pageIndex: currentPage,
          points: [pos],
          style: { ...activeStyle, stroke: activeTool === 'stamp-check' ? '#22c55e' : '#000000' },
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layerOrder: annotations.length,
        };
        addAnnotation(ann);
        pushUndo({ type: 'add', annotation: ann });
        setIsDrawing(false);
        return;
      }

      if (activeTool === 'pin') {
        const pinName = prompt('Enter inspection location name:');
        if (pinName === null) return;
        const ann: Annotation = {
          id: crypto.randomUUID(),
          type: 'pin',
          pageIndex: currentPage,
          points: [pos],
          style: activeStyle,
          pinContent: { name: pinName },
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layerOrder: annotations.length,
        };
        addAnnotation(ann);
        pushUndo({ type: 'add', annotation: ann });
        setIsDrawing(false);
        return;
      }

      if (activeTool === 'inspection-task') {
        // Fetch the currently logged in user from your store (adjust this to match your actual auth state)
        const currentUser = useStore.getState().currentUser?.displayName || 'Unknown User';

        const ann: Annotation = {
          id: crypto.randomUUID(),
          type: 'inspection-task',
          pageIndex: currentPage,
          points: [pos],
          style: activeStyle,
          pinContent: { name: '', text: '', status: 'Open', priority: 'Medium', checklists: [], images: [], assignee: currentUser },
          createdBy: currentUser,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layerOrder: annotations.length,
        };
        addAnnotation(ann);
        pushUndo({ type: 'add', annotation: ann });
        
        setEditingPinId(ann.id);
        setPinDialogOpen(true);
        
        setIsDrawing(false);
        setActiveTool('select');
        return;
      }

      // Start drawing for shape tools
      if (
        activeTool === 'line' ||
        activeTool === 'arrow' ||
        activeTool === 'rectangle' ||
        activeTool === 'circle' ||
        activeTool === 'cloud' ||
        activeTool === 'freehand' ||
        activeTool === 'highlight' ||
        activeTool === 'text' ||
        activeTool === 'text-leader' ||
        activeTool === 'measure-distance' ||
        activeTool === 'measure-area' ||
        activeTool === 'measure-perimeter' ||
        activeTool === 'measure-polyline' ||
        activeTool === 'measure-angle' ||
        activeTool === 'cut'
      ) {
        // Multi-click tools: accumulate points
        if (
          activeTool === 'measure-area' ||
          activeTool === 'measure-perimeter' ||
          activeTool === 'measure-polyline' ||
          activeTool === 'measure-angle' ||
          activeTool === 'text-leader' ||
          (activeTool === 'cut' && cutMode === 'polygon')
        ) {
          // Points accumulated in drawingPoints
        } else {
          // Two-point tools: set second point to same as first initially
          setDrawingPoints([pos, pos]);
        }
      }
    },
    [
      activeTool,
      getPointerPos,
      pdfLocked,
      isCalibrating,
      calibrationPoints,
      currentPage,
      activeStyle,
      annotations,
      addAnnotation,
      pushUndo,
      addCountMarker,
      setIsDrawing,
      setDrawingPoints,
      setSelectedAnnotationId,
      cutMode,
      isDrawing,
      drawingPoints,
    ]
  );

  const handleMouseMove = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // Manual middle-mouse panning
      if (middleMousePanning.current) {
        const dx = e.evt.clientX - middleMouseStart.current.x;
        const dy = e.evt.clientY - middleMouseStart.current.y;
        setPanOffset({
          x: middleMouseStart.current.panX + dx,
          y: middleMouseStart.current.panY + dy,
        });
        return;
      }

      const stage = e.target.getStage();
      if (!stage) return;
      const pos = getPointerPos(stage);

      // PDF Vector Snapping - snap cursor to nearest PDF vector endpoint
      let activeCursorPos = pos;
      let isSnapped = false;
      if (snapToPdf && pdfVectors.current.length > 0) {
        let nearestSnap: Point | null = null;
        let minSnapDist = 10 / zoom; // Snap tolerance scales with zoom

        for (const seg of pdfVectors.current) {
          const distP1 = getDist(pos, seg.p1);
          const distP2 = getDist(pos, seg.p2);

          if (distP1 < minSnapDist) { minSnapDist = distP1; nearestSnap = seg.p1; }
          if (distP2 < minSnapDist) { minSnapDist = distP2; nearestSnap = seg.p2; }
        }
        if (nearestSnap) {
          activeCursorPos = nearestSnap;
          isSnapped = true;
        }
      }

      // Update cursor based on snap state
      const stageContainer = stage.container();
      if (stageContainer) {
        if (isSnapped) {
          stageContainer.style.cursor = 'cell';
        } else if (activeTool === 'trim-fence') {
          stageContainer.style.cursor = 'crosshair';
        } else {
          stageContainer.style.cursor = 'default';
        }
      }

      // Track cursor position for CAD command rubber-band preview
      if (cadPendingCommand && cadPendingPoints.length > 0) {
        // Apply ORTHO constraint (Shift key) for line-based commands
        let finalCursorPos = activeCursorPos;
        const cmdUp = cadPendingCommand.toUpperCase();
        const { smartTraceEnabled } = useStore.getState();
        
        if (smartTraceEnabled &&
            (cmdUp === 'LINE' || cmdUp === 'L' ||
             cmdUp === 'PLINE' || cmdUp === 'PL' ||
             cmdUp === 'ARROW' || cmdUp === 'AR')) {
          const lastPoint = cadPendingPoints[cadPendingPoints.length - 1];
          finalCursorPos = normalizeToOrtho([lastPoint, activeCursorPos], 15)[1];
        } else if (shiftHeld.current &&
            (cmdUp === 'LINE' || cmdUp === 'L' ||
             cmdUp === 'PLINE' || cmdUp === 'PL' ||
             cmdUp === 'ARROW' || cmdUp === 'AR')) {
          const lastPoint = cadPendingPoints[cadPendingPoints.length - 1];
          finalCursorPos = constrainToAxis(lastPoint, activeCursorPos);
        }
        setCadCursorPos(finalCursorPos);
      } else {
        setCadCursorPos(null);
      }

      // Handle rotation preview when base point is picked (step 2)
      const { cadSelectedIds, cadCommandStep, cadPendingCommand: pendingCmd } = useStore.getState();
      if (pendingCmd?.toUpperCase() === 'ROTATE' && cadCommandStep === 2 && cadPendingPoints.length === 1 && rotationOriginalPositions.current.size > 0) {
        const basePoint = cadPendingPoints[0];
        const angle = calculateRotationAngle(basePoint, activeCursorPos);
        
        // Apply rotation preview using stored originals
        cadSelectedIds.forEach(id => {
          const original = rotationOriginalPositions.current.get(id);
          const ann = annotations.find(a => a.id === id);
          if (original && original.points && ann) {
            const isLineBased = ['line', 'arc', 'arrow', 'measure-distance', 'measure-polyline', 'measure-area', 'measure-perimeter', 'freehand'].includes(ann.type);
            const isRectangle = ann.type === 'rectangle';
            
            if (isRectangle) {
              // For rectangles, only update the rotation property - don't rotate the points
              updateAnnotation(id, {
                rotation: (original.rotation || 0) + (angle * 180 / Math.PI)
              });
            } else if (isLineBased) {
              const rotatedPoints = original.points.map((p: Point) => rotatePointAround(p, basePoint, angle));
              updateAnnotation(id, { points: rotatedPoints });
            } else {
              const rotatedPoints = original.points.map((p: Point) => rotatePointAround(p, basePoint, angle));
              updateAnnotation(id, { 
                points: rotatedPoints, 
                rotation: (original.rotation || 0) + (angle * 180 / Math.PI)
              });
            }
          }
        });
        return;
      }

      if (!isDrawing) return;

      if (activeTool === 'zoom-rectangle' && zoomRect) {
        setZoomRect({ start: zoomRect.start, end: pos });
        return;
      }

      if (activeTool === 'select' && selectionRect) {
        // Determine selection direction
        const direction = pos.x >= selectionRect.start.x ? 'left-to-right' : 'right-to-left';
        setSelectionRect({ start: selectionRect.start, end: pos, direction });
        return;
      }

      if (activeTool === 'freehand' || activeTool === 'highlight') {
        setDrawingPoints([...drawingPoints, pos]);
      } else if (drawingPoints.length >= 1) {
        if (
          activeTool === 'measure-area' ||
          activeTool === 'measure-perimeter' ||
          activeTool === 'measure-polyline' ||
          activeTool === 'measure-angle' ||
          (activeTool === 'cut' && cutMode === 'polygon')
        ) {
          // Multi-click tool, handled on click — don't overwrite accumulated points
        } else {
          const constrained = shiftHeld.current
            ? constrainToAxis(drawingPoints[0], pos)
            : pos;
          setDrawingPoints([drawingPoints[0], constrained]);
        }
      }
    },
    [isDrawing, activeTool, drawingPoints, getPointerPos, setDrawingPoints, zoomRect, selectionRect, cadPendingCommand, cadPendingPoints, setCadCursorPos]
  );

  const handleMouseUp = useCallback(
    (e: Konva.KonvaEventObject<MouseEvent>) => {
      // --- ADD THIS SHORT-CIRCUIT TO PREVENT BUBBLE WIPEOUTS ---
      const storeState = useStore.getState();
      if (['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(storeState.cadPendingCommand?.toUpperCase() || '')) {
        e.evt.preventDefault();
        e.evt.stopPropagation();
        e.evt.stopImmediatePropagation?.();
        return;
      }
      // ---------------------------------------------------------

      // Stop manual middle-mouse panning
      if (middleMousePanning.current) {
        middleMousePanning.current = false;
        document.body.style.cursor = '';
        setActiveTool(previousToolRef.current);
        return;
      }
      // Restore previous tool when middle mouse button is released
      if (e.evt.button === 1 && activeTool === 'pan') {
        setActiveTool(previousToolRef.current);
        return;
      }


      // Trim Fence tool: draw a cutting line to trim/extend intersecting annotations
      if (activeTool === 'trim-fence' && isDrawing && drawingPoints.length >= 1) {
        const stage = e.target.getStage();
        if (!stage) return;
        const pos = getPointerPos(stage);
        
        const fenceStart = drawingPoints[0];
        const fenceEnd = pos;
        
        // Shift key OR fenceExtendMode switches to extend behavior
        if (e.evt.shiftKey || fenceExtendMode.current) {
          handleFenceExtend(fenceStart, fenceEnd);
        } else {
          handleFenceTrim(fenceStart, fenceEnd);
        }
        
        setIsDrawing(false);
        setDrawingPoints([]);
        fenceExtendMode.current = false;
        // Return to select tool after fence trim/extend
        setActiveTool('select');
        return;
      }

      if (!isDrawing) return;
      const stage = e.target.getStage();
      if (!stage) return;
      let pos = getPointerPos(stage);

      // Zoom rectangle tool
      if (activeTool === 'zoom-rectangle' && zoomRect) {
        const { start, end } = zoomRect;
        const rectX = Math.min(start.x, end.x);
        const rectY = Math.min(start.y, end.y);
        const rectW = Math.abs(end.x - start.x);
        const rectH = Math.abs(end.y - start.y);

        // Only zoom if rectangle has reasonable size
        if (rectW > 10 && rectH > 10) {
          // Calculate zoom level to fit rectangle in view with some padding
          const padding = 40;
          const zoomX = (canvasSize.width - padding * 2) / rectW;
          const zoomY = (canvasSize.height - padding * 2) / rectH;
          const newZoom = Math.min(zoomX, zoomY, 5); // Cap at 5x

          // Calculate pan offset to center the rectangle
          const rectCenterX = rectX + rectW / 2;
          const rectCenterY = rectY + rectH / 2;
          const newPanX = canvasSize.width / 2 - rectCenterX * newZoom;
          const newPanY = canvasSize.height / 2 - rectCenterY * newZoom;

          setZoom(newZoom);
          setPanOffset({ x: newPanX, y: newPanY });
        }

        setIsDrawing(false);
        setZoomRect(null);
        setActiveTool('select');
        return;
      }

      // Selection rectangle tool
      if (activeTool === 'select' && selectionRect) {
        const { start, end, direction } = selectionRect;
        const rectX = Math.min(start.x, end.x);
        const rectY = Math.min(start.y, end.y);
        const rectW = Math.abs(end.x - start.x);
        const rectH = Math.abs(end.y - start.y);

        // Process selection for any visible rectangle
        if (rectW > 0 && rectH > 0) {
          performBoxSelection(rectX, rectY, rectW, rectH, direction);
        }

        setIsDrawing(false);
        setSelectionRect(null);
        return;
      }

      if (shiftHeld.current && drawingPoints.length >= 1 &&
          (activeTool === 'line' || activeTool === 'arrow' || activeTool === 'measure-distance')) {
        pos = constrainToAxis(drawingPoints[0], pos);
      }

      // Multi-click tools: points are accumulated in handleMouseDown
      // Here we just check for auto-close/auto-finish conditions
      if (
        activeTool === 'measure-area' ||
        activeTool === 'measure-perimeter' ||
        activeTool === 'measure-polyline'
      ) {
        // Auto-close area polygon: if >=4 pts and last click is near start
        if (activeTool === 'measure-area' && drawingPoints.length >= 4) {
          const start = drawingPoints[0];
          const last = drawingPoints[drawingPoints.length - 1];
          const dx = last.x - start.x;
          const dy = last.y - start.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < 15) {
            const closedPts = drawingPoints.slice(0, -1);
            const ann: Annotation = {
              id: crypto.randomUUID(),
              type: 'measure-area',
              pageIndex: currentPage,
              points: closedPts,
              style: { ...activeStyle, stroke: activeStyle.stroke, fill: 'rgba(0,229,255,0.15)' },
              createdBy: 'local',
              createdAt: Date.now(),
              updatedAt: Date.now(),
              layerOrder: annotations.length,
            };
            addAnnotation(ann);
            pushUndo({ type: 'add', annotation: ann });
            addMeasurement({
              id: crypto.randomUUID(),
              type: 'area',
              annotationId: ann.id,
              pageIndex: currentPage,
              points: closedPts,
              value: polygonArea(closedPts, currentCal),
              unit: measurementUnit,
              createdBy: 'local',
              createdAt: Date.now(),
              updatedAt: Date.now(),
            });
            setIsDrawing(false);
            setDrawingPoints([]);
            return;
          }
        }
        // For polyline and perimeter, just keep accumulating points - no auto-close
        // Don't finalize yet — keep accumulating
        return;
      }

      // Angle tool: 3 clicks — pick 3 points, vertex is the second point
      if (activeTool === 'measure-angle') {
        if (drawingPoints.length < 3) {
          return; // keep accumulating
        }
        const pts = drawingPoints;
        const angle = angleBetweenPoints(pts[1], pts[0], pts[2]);
        const ann: Annotation = {
          id: crypto.randomUUID(),
          type: 'measure-angle',
          pageIndex: currentPage,
          points: pts,
          style: { ...activeStyle, stroke: activeStyle.stroke },
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layerOrder: annotations.length,
        };
        addAnnotation(ann);
        pushUndo({ type: 'add', annotation: ann });
        addMeasurement({
          id: crypto.randomUUID(),
          type: 'angle',
          annotationId: ann.id,
          pageIndex: currentPage,
          points: pts,
          value: angle,
          unit: measurementUnit,
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
        setIsDrawing(false);
        setDrawingPoints([]);
        setActiveTool('select');
        return;
      }

      setIsDrawing(false);
      const pts = activeTool === 'freehand' || activeTool === 'highlight'
        ? drawingPoints
        : [drawingPoints[0], pos];

      if (pts.length < 2) {
        setDrawingPoints([]);
        return;
      }

      // Create annotation
      const ann: Annotation = {
        id: crypto.randomUUID(),
        type: activeTool,
        pageIndex: currentPage,
        points: pts,
        style: activeTool === 'highlight'
          ? { ...activeStyle, stroke: '#ffeb3b', strokeWidth: 20, opacity: 0.35 }
          : { ...activeStyle },
        createdBy: 'local',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layerOrder: annotations.length,
      };

      // Eraser-box: sample background color from PDF canvas at center of erased area
      if (activeTool === 'eraser-box') {
        ann.type = 'eraser-box';
        ann.width = Math.abs(pts[1].x - pts[0].x);
        ann.height = Math.abs(pts[1].y - pts[0].y);
        ann.points = [{ x: Math.min(pts[0].x, pts[1].x), y: Math.min(pts[0].y, pts[1].y) }];
        // Sample background color from the PDF canvas at multiple corner/edge points
        // to avoid picking text color. Use the brightest (most likely background) sample.
        let eraserColor = '#ffffff';
        if (pdfImage) {
          const ctx = pdfImage.getContext('2d');
          if (ctx) {
            const ex = ann.points[0].x;
            const ey = ann.points[0].y;
            const ew = ann.width;
            const eh = ann.height;
            // Sample at 4 corners and 4 edge midpoints
            const samplePoints = [
              { x: ex, y: ey },                          // top-left
              { x: ex + ew, y: ey },                     // top-right
              { x: ex, y: ey + eh },                     // bottom-left
              { x: ex + ew, y: ey + eh },                // bottom-right
              { x: ex + ew / 2, y: ey },                 // top-mid
              { x: ex + ew / 2, y: ey + eh },            // bottom-mid
              { x: ex, y: ey + eh / 2 },                 // left-mid
              { x: ex + ew, y: ey + eh / 2 },            // right-mid
            ];
            // Collect all sampled colors and pick the brightest (background is usually lighter)
            let bestColor = [255, 255, 255];
            let bestBrightness = -1;
            for (const sp of samplePoints) {
              const sx = Math.max(0, Math.min(Math.round(sp.x * 2), pdfImage.width - 1));
              const sy = Math.max(0, Math.min(Math.round(sp.y * 2), pdfImage.height - 1));
              const pixel = ctx.getImageData(sx, sy, 1, 1).data;
              const brightness = pixel[0] + pixel[1] + pixel[2];
              if (brightness > bestBrightness) {
                bestBrightness = brightness;
                bestColor = [pixel[0], pixel[1], pixel[2]];
              }
            }
            eraserColor = `rgb(${bestColor[0]},${bestColor[1]},${bestColor[2]})`;
          }
        }
        // Flatten eraser directly to PDF using pdf-lib
        if (pdfData) {
          flattenEraserToPdf(ann.points[0].x, ann.points[0].y, ann.width, ann.height, eraserColor, currentPage, pdfData, setPdfData, pageRotations[currentPage] || 0);
        }
        setDrawingPoints([]);
        return;
      }

      if (activeTool === 'rectangle' || activeTool === 'circle' || activeTool === 'cloud') {
        ann.width = Math.abs(pts[1].x - pts[0].x);
        ann.height = Math.abs(pts[1].y - pts[0].y);
        ann.points = [{ x: Math.min(pts[0].x, pts[1].x), y: Math.min(pts[0].y, pts[1].y) }];
        if (activeTool === 'circle') {
          ann.radius = Math.max(ann.width, ann.height) / 2;
        }
      }

      if (activeTool === 'cut') {
        // Cut tool: capture PDF content with transparency, erase underlying content
        if (cutMode === 'polygon') {
          // Polygon mode: use all points
          if (drawingPoints.length < 3) {
            setDrawingPoints([]);
            setIsDrawing(false);
            return;
          }

          // Calculate bounding box for the polygon
          const xs = drawingPoints.map(p => p.x);
          const ys = drawingPoints.map(p => p.y);
          const minX = Math.min(...xs);
          const minY = Math.min(...ys);
          const maxX = Math.max(...xs);
          const maxY = Math.max(...ys);
          const x = minX;
          const y = minY;
          const w = maxX - minX;
          const h = maxY - minY;

          if (pdfImage && w > 0 && h > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = w * 2; // Use 2x scale for better quality
            tempCanvas.height = h * 2;
            const ctx = tempCanvas.getContext('2d');
            if (ctx) {
              // Draw the area from the PDF canvas at 2x scale
              ctx.drawImage(pdfImage, x * 2, y * 2, w * 2, h * 2, 0, 0, w * 2, h * 2);

              // Create a clipping path for the polygon (scaled by 2x)
              ctx.globalCompositeOperation = 'destination-in';
              ctx.beginPath();
              ctx.moveTo((drawingPoints[0].x - x) * 2, (drawingPoints[0].y - y) * 2);
              for (let i = 1; i < drawingPoints.length; i++) {
                ctx.lineTo((drawingPoints[i].x - x) * 2, (drawingPoints[i].y - y) * 2);
              }
              ctx.closePath();
              ctx.fill();

              // Remove white background - make white pixels transparent
              const imageData = ctx.getImageData(0, 0, w * 2, h * 2);
              const data = imageData.data;
              for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                if (r > 240 && g > 240 && b > 240) {
                  data[i + 3] = 0;
                }
              }
              ctx.putImageData(imageData, 0, 0);

              const imageDataUrl = tempCanvas.toDataURL('image/png');
              // Compress to prevent GPU memory issues before showing color editor
              compressImage(imageDataUrl, 1500, 0.85).then(compressed => {
                setPendingCutBuffer({ imageData: compressed.dataUrl, width: compressed.width, height: compressed.height });
              }).catch(err => {
                console.error('Failed to compress cut buffer:', err);
                setPendingCutBuffer({ imageData: imageDataUrl, width: w, height: h });
              });

              // Add a polygon annotation to "erase" the underlying content
              const eraseColor = cutColor || '#ffffff';
              const eraseAnn: Annotation = {
                id: crypto.randomUUID(),
                type: 'cloud', // Using cloud type to support polygon shape
                pageIndex: currentPage,
                points: drawingPoints,
                style: { stroke: eraseColor, strokeWidth: 0, fill: eraseColor, opacity: 1 },
                createdBy: 'local',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                layerOrder: annotations.length,
              };
              addAnnotation(eraseAnn);
              pushUndo({ type: 'add', annotation: eraseAnn });
            }
          }
        } else {
          // Rectangle mode (existing logic)
          ann.width = Math.abs(pts[1].x - pts[0].x);
          ann.height = Math.abs(pts[1].y - pts[0].y);
          ann.points = [{ x: Math.min(pts[0].x, pts[1].x), y: Math.min(pts[0].y, pts[1].y) }];

          const x = Math.min(pts[0].x, pts[1].x);
          const y = Math.min(pts[0].y, pts[1].y);
          const w = ann.width;
          const h = ann.height;

          if (pdfImage && w > 0 && h > 0) {
            const tempCanvas = document.createElement('canvas');
            tempCanvas.width = w * 2; // Use 2x scale for better quality
            tempCanvas.height = h * 2;
            const ctx = tempCanvas.getContext('2d');
            if (ctx) {
              ctx.drawImage(pdfImage, x * 2, y * 2, w * 2, h * 2, 0, 0, w * 2, h * 2);

              const imageData = ctx.getImageData(0, 0, w * 2, h * 2);
              const data = imageData.data;
              for (let i = 0; i < data.length; i += 4) {
                const r = data[i];
                const g = data[i + 1];
                const b = data[i + 2];
                if (r > 240 && g > 240 && b > 240) {
                  data[i + 3] = 0;
                }
              }
              ctx.putImageData(imageData, 0, 0);

              const imageDataUrl = tempCanvas.toDataURL('image/png');
              // Compress to prevent GPU memory issues before showing color editor
              compressImage(imageDataUrl, 1500, 0.85).then(compressed => {
                setPendingCutBuffer({ imageData: compressed.dataUrl, width: compressed.width, height: compressed.height });
              }).catch(err => {
                console.error('Failed to compress cut buffer:', err);
                setPendingCutBuffer({ imageData: imageDataUrl, width: w, height: h });
              });

              const eraseColor = cutColor || '#ffffff';
              const eraseAnn: Annotation = {
                id: crypto.randomUUID(),
                type: 'rectangle',
                pageIndex: currentPage,
                points: [{ x, y }],
                width: w,
                height: h,
                style: { stroke: eraseColor, strokeWidth: 0, fill: eraseColor, opacity: 1 },
                createdBy: 'local',
                createdAt: Date.now(),
                updatedAt: Date.now(),
                layerOrder: annotations.length,
              };
              addAnnotation(eraseAnn);
              pushUndo({ type: 'add', annotation: eraseAnn });
            }
          }
        }

        setDrawingPoints([]);
        setIsDrawing(false);
        return;
      }

      if (activeTool === 'text') {
        const text = prompt('Enter text:');
        if (!text) {
          setDrawingPoints([]);
          return;
        }
        ann.text = text;
        ann.points = [pts[0]];
        // Ensure text-specific properties are set
        ann.style.fontSize = ann.style.fontSize || 16;
        ann.style.fontFamily = ann.style.fontFamily || 'Arial';
        ann.align = ann.align || 'left';
        ann.lineHeight = ann.lineHeight || 1.2;
      }

      if (activeTool === 'text-leader') {
        const text = prompt('Enter text (use \\n for new lines):');
        if (!text) {
          setDrawingPoints([]);
          return;
        }
        // Convert \n to actual newlines for multiline support
        ann.text = text.replace(/\\n/g, '\n');
        // points[0] = arrow head (first click)
        // points[1] = arrow rear / tail start (second click)
        // points[2] = tail end / text position (third click)
        // Ensure all points are defined with defaults
        const arrowHead = pts[0];
        const arrowRear = pts[1] || { x: arrowHead.x + 20, y: arrowHead.y };
        const textPos = pts[2] || { x: arrowRear.x + 100, y: arrowRear.y };
        ann.points = [arrowHead, arrowRear, textPos];
        // Ensure text-specific properties are set
        ann.style.fontSize = ann.style.fontSize || 16;
        ann.style.fontFamily = ann.style.fontFamily || 'Arial';
        ann.align = ann.align || 'left';
        ann.lineHeight = ann.lineHeight || 1.2;
      }

      // Apply Smart Ortho Trace if enabled
      const { smartTraceEnabled } = useStore.getState();
      if (smartTraceEnabled && ann.points && ann.points.length >= 2) {
        // Only normalize certain annotation types
        const orthoTypes = ['line', 'arrow', 'freehand', 'rectangle', 'measure-polyline', 'measure-perimeter'];
        if (orthoTypes.includes(activeTool)) {
          ann.points = normalizeToOrtho(ann.points, 15);
        }
      }

      addAnnotation(ann);
      pushUndo({ type: 'add', annotation: ann });

      // Distance measurement with dimension-arrow style
      if (activeTool === 'measure-distance') {
        const dist = calibratedDistance(pts[0], pts[1], currentCal);
        addMeasurement({
          id: crypto.randomUUID(),
          type: 'distance',
          annotationId: ann.id,
          pageIndex: currentPage,
          points: pts,
          value: dist,
          unit: measurementUnit,
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      if (activeTool === 'measure-volume') {
        const area = polygonArea(pts, currentCal);
        const heightInput = parseFloat(prompt('Enter height:') || '0');
        addMeasurement({
          id: crypto.randomUUID(),
          type: 'volume',
          annotationId: ann.id,
          pageIndex: currentPage,
          points: pts,
          value: area * heightInput,
          unit: measurementUnit,
          heightInput,
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      }

      setDrawingPoints([]);
    },
    [
      isDrawing,
      activeTool,
      drawingPoints,
      currentPage,
      activeStyle,
      annotations,
      addAnnotation,
      pushUndo,
      addMeasurement,
      currentCal,
      measurementUnit,
      getPointerPos,
      setIsDrawing,
      setDrawingPoints,
      zoomRect,
      canvasSize,
      setZoom,
      setPanOffset,
      setActiveTool,
      selectionRect,
      cutMode,
      cutColor,
      pdfImage,
    ]
  );

  const finalizeMultiClick = useCallback(() => {
    // Text-leader: finalize with 3 points (arrow head, arrow rear, text position)
    if (activeTool === 'text-leader' && drawingPoints.length >= 2) {
      try {
        const text = prompt('Enter text:');
        if (!text) {
          setDrawingPoints([]);
          setIsDrawing(false);
          return;
        }
        // Ensure we have exactly 3 points with defaults if missing
        const arrowHead = drawingPoints[0];
        const arrowRear = drawingPoints[1] || { x: arrowHead.x + 20, y: arrowHead.y };
        const textPos = drawingPoints[2] || { x: arrowRear.x + 100, y: arrowRear.y };
        
        const ann: Annotation = {
          id: crypto.randomUUID(),
          type: 'text-leader',
          pageIndex: currentPage,
          points: [arrowHead, arrowRear, textPos],
          text: text,
          style: { ...activeStyle, stroke: activeStyle.stroke },
          createdBy: 'local',
          createdAt: Date.now(),
          updatedAt: Date.now(),
          layerOrder: annotations.length,
        };
        addAnnotation(ann);
        pushUndo({ type: 'add', annotation: ann });
      } catch (err) {
        console.error('Failed to create text-leader annotation:', err);
      }
      setIsDrawing(false);
      setDrawingPoints([]);
      return;
    }

    // Polyline: finalize with segment distances
    if (activeTool === 'measure-polyline' && drawingPoints.length >= 2) {
      const ann: Annotation = {
        id: crypto.randomUUID(),
        type: 'measure-polyline',
        pageIndex: currentPage,
        points: drawingPoints,
        style: { ...activeStyle, stroke: activeStyle.stroke },
        createdBy: 'local',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layerOrder: annotations.length,
      };
      addAnnotation(ann);
      pushUndo({ type: 'add', annotation: ann });

      // Add total distance as measurement
      let total = 0;
      for (let i = 0; i < drawingPoints.length - 1; i++) {
        total += calibratedDistance(drawingPoints[i], drawingPoints[i + 1], currentCal);
      }
      addMeasurement({
        id: crypto.randomUUID(),
        type: 'distance',
        annotationId: ann.id,
        pageIndex: currentPage,
        points: drawingPoints,
        value: total,
        unit: measurementUnit,
        createdBy: 'local',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      setIsDrawing(false);
      setDrawingPoints([]);
      return;
    }

    if (
      (activeTool === 'measure-area' || activeTool === 'measure-perimeter') &&
      drawingPoints.length >= 3
    ) {
      const ann: Annotation = {
        id: crypto.randomUUID(),
        type: activeTool,
        pageIndex: currentPage,
        points: drawingPoints,
        style: { ...activeStyle, stroke: activeStyle.stroke, fill: activeTool === 'measure-area' ? 'rgba(0,229,255,0.15)' : 'transparent' },
        createdBy: 'local',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        layerOrder: annotations.length,
      };
      addAnnotation(ann);
      pushUndo({ type: 'add', annotation: ann });

      const val =
        activeTool === 'measure-area'
          ? polygonArea(drawingPoints, currentCal)
          : polygonPerimeter(drawingPoints, currentCal);

      addMeasurement({
        id: crypto.randomUUID(),
        type: activeTool === 'measure-area' ? 'area' : 'perimeter',
        annotationId: ann.id,
        pageIndex: currentPage,
        points: drawingPoints,
        value: val,
        unit: measurementUnit,
        createdBy: 'local',
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      setIsDrawing(false);
      setDrawingPoints([]);
    }

    // Cut tool polygon mode
    if (activeTool === 'cut' && cutMode === 'polygon' && drawingPoints.length >= 3) {
      const xs = drawingPoints.map(p => p.x);
      const ys = drawingPoints.map(p => p.y);
      const minX = Math.min(...xs);
      const minY = Math.min(...ys);
      const maxX = Math.max(...xs);
      const maxY = Math.max(...ys);
      const x = minX;
      const y = minY;
      const w = maxX - minX;
      const h = maxY - minY;

      if (pdfImage && w > 0 && h > 0) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = w;
        tempCanvas.height = h;
        const ctx = tempCanvas.getContext('2d');
        if (ctx) {
          ctx.drawImage(pdfImage, x * 2, y * 2, w * 2, h * 2, 0, 0, w, h);

          ctx.globalCompositeOperation = 'destination-in';
          ctx.beginPath();
          ctx.moveTo(drawingPoints[0].x - x, drawingPoints[0].y - y);
          for (let i = 1; i < drawingPoints.length; i++) {
            ctx.lineTo(drawingPoints[i].x - x, drawingPoints[i].y - y);
          }
          ctx.closePath();
          ctx.fill();

          const imageData = ctx.getImageData(0, 0, w, h);
          const data = imageData.data;
          for (let i = 0; i < data.length; i += 4) {
            const r = data[i];
            const g = data[i + 1];
            const b = data[i + 2];
            if (r > 240 && g > 240 && b > 240) {
              data[i + 3] = 0;
            }
          }
          ctx.putImageData(imageData, 0, 0);

          const imageDataUrl = tempCanvas.toDataURL('image/png');
          // Compress to prevent GPU memory issues before showing color editor
          compressImage(imageDataUrl, 1500, 0.85).then(compressed => {
            setPendingCutBuffer({ imageData: compressed.dataUrl, width: compressed.width, height: compressed.height });
          }).catch(err => {
            console.error('Failed to compress cut buffer:', err);
            setPendingCutBuffer({ imageData: imageDataUrl, width: w, height: h });
          });

          const eraseColor = cutColor || '#ffffff';
          const eraseAnn: Annotation = {
            id: crypto.randomUUID(),
            type: 'cloud',
            pageIndex: currentPage,
            points: drawingPoints,
            style: { stroke: eraseColor, strokeWidth: 0, fill: eraseColor, opacity: 1 },
            createdBy: 'local',
            createdAt: Date.now(),
            updatedAt: Date.now(),
            layerOrder: annotations.length,
          };
          addAnnotation(eraseAnn);
          pushUndo({ type: 'add', annotation: eraseAnn });
        }
      }

      setIsDrawing(false);
      setDrawingPoints([]);
      return;
    }
  }, [
    activeTool,
    drawingPoints,
    currentPage,
    activeStyle,
    annotations,
    addAnnotation,
    pushUndo,
    addMeasurement,
    currentCal,
    measurementUnit,
    setIsDrawing,
    setDrawingPoints,
  ]);

  // Keep ref in sync so Enter key can call it
  finalizeMultiClickRef.current = finalizeMultiClick;

  // Also handle right-click to finalize multi-click tools
  const handleContextMenuFinalize = useCallback((e: Konva.KonvaEventObject<PointerEvent>) => {
    if (isDrawing && (activeTool === 'measure-polyline' || activeTool === 'measure-area' || activeTool === 'measure-perimeter' || activeTool === 'text-leader')) {
      e.evt.preventDefault();
      finalizeMultiClick();
    }
  }, [isDrawing, activeTool, finalizeMultiClick]);

  // Handle double-click to finalize multi-click tools (but NOT polyline - it should be continuous)
  const handleDoubleClick = useCallback((e: Konva.KonvaEventObject<MouseEvent>) => {
    // Polyline should not finalize on double-click - it's meant for continuous point accumulation
    if (isDrawing && activeTool !== 'measure-polyline' && (activeTool === 'measure-area' || activeTool === 'measure-perimeter' || activeTool === 'text-leader')) {
      finalizeMultiClick();
    }
  }, [isDrawing, activeTool, finalizeMultiClick]);

  // Delete on keypress
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      const idsToDelete = selectedAnnotationIds.length > 0 ? selectedAnnotationIds : (selectedAnnotationId ? [selectedAnnotationId] : []);
      if (e.key === 'Delete' && idsToDelete.length > 0) {
        idsToDelete.forEach((id) => {
          const ann = annotations.find((a) => a.id === id);
          if (ann) {
            pushUndo({ type: 'delete', annotation: ann });
            deleteAnnotation(id);
          }
        });
        clearAnnotationSelection();
      }
      // Rotate with [ and ] keys
      if ((e.key === '[' || e.key === ']') && idsToDelete.length > 0) {
        const delta = e.key === '[' ? -1 : 1;
        idsToDelete.forEach((id) => {
          const ann = annotations.find((a) => a.id === id);
          if (ann) {
            const currentRotation = ann.rotation || 0;
            const newRotation = currentRotation + delta;
            const prev = { ...ann };
            updateAnnotation(ann.id, { rotation: newRotation });
            pushUndo({ type: 'update', annotation: { ...ann, rotation: newRotation }, previousState: prev });
          }
        });
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedAnnotationId, selectedAnnotationIds, annotations, deleteAnnotation, pushUndo, updateAnnotation, setActiveTool, clearAnnotationSelection]);

  const handlePinContentSave = (content: PinContent) => {
    if (editingPinId) {
      const ann = annotations.find((a) => a.id === editingPinId);
      if (ann) {
        const prev = { ...ann };
        updateAnnotation(ann.id, { pinContent: content, updatedAt: Date.now() });
        pushUndo({ type: 'update', annotation: { ...ann, pinContent: content, updatedAt: Date.now() }, previousState: prev });
      }
    }
    setPinDialogOpen(false);
    setEditingPinId(null);
  };

  const handleTextLeaderSave = (newText: string | null) => {
    setTextLeaderDialogOpen(false);
    if (!newText || !editingTextLeaderId) return;
    
    const ann = annotations.find((a) => a.id === editingTextLeaderId);
    if (ann && ann.type === 'text-leader') {
      const prev = { ...ann };
      updateAnnotation(ann.id, { text: newText, updatedAt: Date.now() });
      pushUndo({ type: 'update', annotation: { ...ann, text: newText, updatedAt: Date.now() }, previousState: prev });
    }
    setEditingTextLeaderId(null);
  };

  const handleTextAnnotationEditorSave = (data: { text: string; fontSize: number; fontFamily: string; color: string; align: 'left' | 'center' | 'right'; lineHeight: number } | null) => {
    setTextAnnotationEditorOpen(false);
    if (!data || !editingTextAnnotationId) return;

    const ann = annotations.find((a) => a.id === editingTextAnnotationId);
    if (ann && (ann.type === 'text' || ann.type === 'text-leader')) {
      const prev = { ...ann };
      console.log('Saving text annotation with fontSize:', data.fontSize, 'fontFamily:', data.fontFamily);
      updateAnnotation(ann.id, {
        text: data.text,
        style: {
          ...ann.style,
          fontSize: data.fontSize,
          fontFamily: data.fontFamily,
          stroke: data.color,
          fill: data.color,
        },
        align: data.align,
        lineHeight: data.lineHeight,
        updatedAt: Date.now(),
      });
      pushUndo({ type: 'update', annotation: { ...ann, text: data.text, style: { ...ann.style, fontSize: data.fontSize, fontFamily: data.fontFamily, stroke: data.color, fill: data.color }, align: data.align, lineHeight: data.lineHeight, updatedAt: Date.now() }, previousState: prev });
    }
    setEditingTextAnnotationId(null);
  };

  const handleTextLeaderClick = (annotationId: string) => {
    const ann = annotations.find((a) => a.id === annotationId);
    if (ann && ann.type === 'text-leader') {
      setEditingTextLeaderId(annotationId);
      setTextLeaderDialogOpen(true);
    }
  };

  const handleTextClick = (annotationId: string) => {
    const ann = annotations.find((a) => a.id === annotationId);
    if (ann && ann.type === 'text') {
      setEditingTextAnnotationId(annotationId);
      setTextAnnotationEditorOpen(true);
    }
  };

  const handlePinClick = (pinId: string) => {
    const ann = annotations.find((a) => a.id === pinId);
    if (ann && (ann.type === 'pin' || ann.type === 'inspection-task')) {
      setEditingPinId(pinId);
      setPinDialogOpen(true);
    }
  };

  const handleBimClick = (bimId: string) => {
    const ann = annotations.find((a) => a.id === bimId);
    if (ann && ann.type === 'bim-capture') {
      setEditingBimId(bimId);
      setBimDialogOpen(true);
    }
  };

  const handleBimDataSave = (data: BIMDialogData) => {
    if (editingBimId) {
      // Update existing annotation
      const ann = annotations.find((a) => a.id === editingBimId);
      if (ann) {
        const prev = { ...ann };
        const updatedBimContent: BIMData = {
          type: ann.bimContent?.type || 'door',
          aiGenerated: ann.bimContent?.aiGenerated || false,
          ...data,
        };
        updateAnnotation(editingBimId, {
          bimContent: updatedBimContent,
          updatedAt: Date.now(),
        });
        pushUndo({ type: 'update', annotation: { ...ann, bimContent: updatedBimContent, updatedAt: Date.now() }, previousState: prev });
      }
      setBimDialogOpen(false);
      setEditingBimId(null);
      return;
    }

    // Create new annotation
    if (!selectedBimType || !bimClickPosition) return;

    const bimData: BIMData = {
      type: selectedBimType,
      aiGenerated: false,
      ...data,
    };

    const ann: Annotation = {
      id: crypto.randomUUID(),
      type: 'bim-capture',
      pageIndex: currentPage,
      points: [bimClickPosition],
      style: activeStyle,
      bimContent: bimData,
      createdBy: 'local',
      createdAt: Date.now(),
      updatedAt: Date.now(),
      layerOrder: annotations.length,
    };
    addAnnotation(ann);
    pushUndo({ type: 'add', annotation: ann });
    setBimDialogOpen(false);
    setBimClickPosition(null);
    setSelectedBimType(null);
    setActiveTool('select');
  };

  const { currentDocument, pageCount } = useStore();

  // --- Annotation context menu handlers ---
  const handleAnnContextMenu = (e: Konva.KonvaEventObject<PointerEvent>, annotationId: string) => {
    e.evt.preventDefault();
    e.cancelBubble = true;
    const stage = e.target.getStage();
    if (!stage) return;
    const container = stage.container().getBoundingClientRect();
    setAnnContextMenu({
      x: e.evt.clientX ?? container.left + e.evt.offsetX,
      y: e.evt.clientY ?? container.top + e.evt.offsetY,
      annotationId,
    });
    setSelectedAnnotationId(annotationId);
  };

  const handleAnnLock = (annotationId: string, lock: boolean) => {
    updateAnnotation(annotationId, { locked: lock, updatedAt: Date.now() });
    setAnnContextMenu(null);
  };

  // Duplicate an annotation in place (offset +20,+20) and select the copy
  const handleAnnDuplicate = (annotationId: string) => {
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann) return;
    const clone: Annotation = {
      ...ann,
      id: crypto.randomUUID(),
      points: ann.points.map((p) => ({ x: p.x + 20, y: p.y + 20 })),
      layerOrder: annotations.length,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    addAnnotation(clone);
    pushUndo({ type: 'add', annotation: clone });
    setSelectedAnnotationId(clone.id);
    setAnnContextMenu(null);
  };

  // Rotate an annotation by ±90° around its own center
  const handleAnnRotate90 = (annotationId: string, dir: 'cw' | 'ccw') => {
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann) return;
    const delta = dir === 'cw' ? 90 : -90;
    const newRotation = (((ann.rotation || 0) + delta) % 360 + 360) % 360;
    const prev = { ...ann };
    updateAnnotation(annotationId, { rotation: newRotation, updatedAt: Date.now() });
    pushUndo({ type: 'update', annotation: { ...ann, rotation: newRotation }, previousState: prev });
    setAnnContextMenu(null);
  };

  // Rotate by a user-entered angle (prompt)
  const handleAnnRotatePrompt = (annotationId: string) => {
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann) return;
    const input = window.prompt('Enter rotation angle in degrees (clockwise):', '0');
    setAnnContextMenu(null);
    if (input === null) return;
    const angle = parseFloat(input);
    if (isNaN(angle)) return;
    const newRotation = (((ann.rotation || 0) + angle) % 360 + 360) % 360;
    const prev = { ...ann };
    updateAnnotation(annotationId, { rotation: newRotation, updatedAt: Date.now() });
    pushUndo({ type: 'update', annotation: { ...ann, rotation: newRotation }, previousState: prev });
  };

  // Z-order helpers
  const handleAnnBringToFront = (annotationId: string) => {
    const maxOrder = Math.max(0, ...annotations.map((a) => a.layerOrder || 0));
    updateAnnotation(annotationId, { layerOrder: maxOrder + 1, updatedAt: Date.now() });
    setAnnContextMenu(null);
  };
  const handleAnnSendToBack = (annotationId: string) => {
    const minOrder = Math.min(0, ...annotations.map((a) => a.layerOrder || 0));
    updateAnnotation(annotationId, { layerOrder: minOrder - 1, updatedAt: Date.now() });
    setAnnContextMenu(null);
  };

  // Style helpers (live update; do not close menu so user can try multiple)
  const handleAnnSetColor = (annotationId: string, colorVal: string) => {
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann) return;
    updateAnnotation(annotationId, { style: { ...ann.style, stroke: colorVal }, updatedAt: Date.now() });
  };
  const handleAnnSetThickness = (annotationId: string, width: number) => {
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann) return;
    updateAnnotation(annotationId, { style: { ...ann.style, strokeWidth: width }, updatedAt: Date.now() });
  };

  const handleAnnFlatten = async (annotationId: string) => {
    setAnnContextMenu(null);
    const ann = annotations.find((a) => a.id === annotationId);
    if (!ann || !pdfData) return;
    try {
      const { exportAnnotatedPdfAsBuffer } = await import('../utils/exportPdf');
      const { measurementUnit, measurements, formFields } = useStore.getState();
      // Convert formFields array to a record for easy lookup
      const formFieldValues: Record<string, string | boolean> = {};
      formFields.forEach(f => {
        formFieldValues[f.name] = f.value;
      });
      const newPdfBuffer = await exportAnnotatedPdfAsBuffer(
        pageCount,
        [ann], // only this annotation
        measurements,
        measurementUnit,
        formFieldValues,
      );
      setPdfData(newPdfBuffer);
      deleteAnnotation(annotationId);
    } catch (err) {
      console.error('Failed to flatten annotation:', err);
    }
  };

  // Perform box selection based on direction
  const performBoxSelection = (rectX: number, rectY: number, rectW: number, rectH: number, direction: 'left-to-right' | 'right-to-left') => {
    const selectedIds: string[] = [];
    
    // Check annotations
    pageAnnotations.forEach((ann) => {
      let isSelected = false;
      
      if (direction === 'left-to-right') {
        // AutoCAD BLUE Selection: Include ONLY if fully contained
        isSelected = isAnnotationFullyContained(ann, rectX, rectY, rectW, rectH);
      } else {
        // AutoCAD GREEN Selection: Include if ANY part intersects
        isSelected = isAnnotationIntersectingRect(ann, rectX, rectY, rectW, rectH);
      }
      
      if (isSelected) {
        selectedIds.push(ann.id);
      }
    });
    
    // Check text items
    textItems.forEach((item) => {
      let isSelected = false;
      const itemBounds = {
        x: item.x,
        y: item.y,
        width: item.width,
        height: item.height,
      };
      
      if (direction === 'left-to-right') {
        // AutoCAD BLUE Selection: Include ONLY if fully contained
        isSelected = isRectFullyContained(itemBounds, rectX, rectY, rectW, rectH);
      } else {
        // AutoCAD GREEN Selection: Include if ANY part intersects
        isSelected = isRectIntersecting(itemBounds, rectX, rectY, rectW, rectH);
      }
      
      if (isSelected) {
        // Make text item editable - this would require additional implementation
      }
    });
    
    // Update selected annotations
    if (selectedIds.length > 0) {
      setSelectedAnnotationIds(selectedIds);
      setSelectedAnnotationId(selectedIds[0]); // Also set single selection for compatibility
    } else {
      clearAnnotationSelection();
    }
  };

  // Helper functions for geometry calculations
  const isAnnotationIntersectingRect = (ann: any, rectX: number, rectY: number, rectW: number, rectH: number): boolean => {
    // Simple bounding box check for most annotation types
    const bounds = getAnnotationBounds(ann);
    return isRectIntersecting(bounds, rectX, rectY, rectW, rectH);
  };

  const isAnnotationFullyContained = (ann: any, rectX: number, rectY: number, rectW: number, rectH: number): boolean => {
    const bounds = getAnnotationBounds(ann);
    return isRectFullyContained(bounds, rectX, rectY, rectW, rectH);
  };

  const getAnnotationBounds = (ann: any): { x: number; y: number; width: number; height: number } => {
    if (ann.points.length === 0) return { x: 0, y: 0, width: 0, height: 0 };
    
    // For box-based shapes with explicit width/height (rectangle, circle, ellipse, image, etc.)
    if (ann.width !== undefined && ann.height !== undefined) {
      const x = ann.points[0].x;
      const y = ann.points[0].y;
      const padding = ann.type.includes('text') ? 50 : 10;
      return {
        x: x - padding,
        y: y - padding,
        width: ann.width + padding * 2,
        height: ann.height + padding * 2,
      };
    }
    
    // For circle with radius
    if (ann.radius !== undefined) {
      const x = ann.points[0].x;
      const y = ann.points[0].y;
      const r = ann.radius;
      const padding = 10;
      return {
        x: x - r - padding,
        y: y - r - padding,
        width: r * 2 + padding * 2,
        height: r * 2 + padding * 2,
      };
    }
    
    // For line-based shapes (line, arrow, polyline, polygon, freehand, etc.)
    const xs = ann.points.map((p: any) => p.x);
    const ys = ann.points.map((p: any) => p.y);
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);
    
    // Add some padding for text annotations
    const padding = ann.type.includes('text') ? 50 : 10;
    
    return {
      x: minX - padding,
      y: minY - padding,
      width: maxX - minX + padding * 2,
      height: maxY - minY + padding * 2,
    };
  };

  const isRectIntersecting = (rect1: { x: number; y: number; width: number; height: number }, rect2X: number, rect2Y: number, rect2W: number, rect2H: number): boolean => {
    return !(rect1.x + rect1.width < rect2X || 
             rect2X + rect2W < rect1.x || 
             rect1.y + rect1.height < rect2Y || 
             rect2Y + rect2H < rect1.y);
  };

  const isRectFullyContained = (rect1: { x: number; y: number; width: number; height: number }, rect2X: number, rect2Y: number, rect2W: number, rect2H: number): boolean => {
    return rect1.x >= rect2X && 
           rect1.y >= rect2Y && 
           rect1.x + rect1.width <= rect2X + rect2W && 
           rect1.y + rect1.height <= rect2Y + rect2H;
  };

  // TRIM: Cut line at intersection point
  const handleTrimCut = (ann: any, clickPos: { x: number; y: number }) => {
    if (ann.type !== 'line' && ann.type !== 'measure-polyline') return;
    
    // Find intersection with other annotations
    const intersection = findNearestIntersection(ann, clickPos);
    
    if (intersection) {
      // For a simple line, split it at the intersection
      if (ann.type === 'line' && ann.points.length === 2) {
        const p1 = ann.points[0];
        const p2 = ann.points[1];
        
        // Determine which side to delete (the one closer to click - AutoCAD behavior)
        const distToP1 = Math.sqrt(Math.pow(clickPos.x - p1.x, 2) + Math.pow(clickPos.y - p1.y, 2));
        const distToP2 = Math.sqrt(Math.pow(clickPos.x - p2.x, 2) + Math.pow(clickPos.y - p2.y, 2));
        
        const newPoint = intersection;
        
        if (distToP1 < distToP2) {
          // User clicked near P1. Delete the P1 side. Keep the segment from intersection to P2.
          updateAnnotation(ann.id, { points: [newPoint, p2] });
        } else {
          // User clicked near P2. Delete the P2 side. Keep the segment from P1 to intersection.
          updateAnnotation(ann.id, { points: [p1, newPoint] });
        }
        
        pushUndo({ type: 'update', annotation: ann });
      } else if (ann.type === 'measure-polyline' && ann.points.length >= 2) {
        // For polylines, find which segment was clicked and trim it
        const segmentIndex = findClickedSegmentIndex(ann.points, clickPos);
        
        if (segmentIndex !== -1) {
          const p1 = ann.points[segmentIndex];
          const p2 = ann.points[segmentIndex + 1];
          
          // Determine which side of the segment to delete
          const distToP1 = Math.sqrt(Math.pow(clickPos.x - p1.x, 2) + Math.pow(clickPos.y - p1.y, 2));
          const distToP2 = Math.sqrt(Math.pow(clickPos.x - p2.x, 2) + Math.pow(clickPos.y - p2.y, 2));
          
          const newPoint = intersection;
          
          if (distToP1 < distToP2) {
            // Delete from P1 side - remove this segment and all segments before it
            const newPoints = [newPoint, ...ann.points.slice(segmentIndex + 1)];
            updateAnnotation(ann.id, { points: newPoints });
          } else {
            // Delete from P2 side - remove this segment and all segments after it
            const newPoints = [...ann.points.slice(0, segmentIndex + 1), newPoint];
            updateAnnotation(ann.id, { points: newPoints });
          }
          
          pushUndo({ type: 'update', annotation: ann });
        }
      }
    }
  };

  // EXTEND: Extend line to next intersection
  const handleTrimExtend = (ann: any, clickPos: { x: number; y: number }) => {
    if (ann.type !== 'line' && ann.type !== 'measure-polyline') return;
    
    // Use 50% rule: determine which side of the line midpoint was clicked
    if (ann.type === 'line' && ann.points.length === 2) {
      const p1 = ann.points[0];
      const p2 = ann.points[1];
      
      // Calculate midpoint
      const midpoint = {
        x: (p1.x + p2.x) / 2,
        y: (p1.y + p2.y) / 2,
      };
      
      // Determine which side of midpoint was clicked
      const distToP1 = Math.sqrt(Math.pow(clickPos.x - p1.x, 2) + Math.pow(clickPos.y - p1.y, 2));
      const distToMidpoint = Math.sqrt(Math.pow(clickPos.x - midpoint.x, 2) + Math.pow(clickPos.y - midpoint.y, 2));
      
      // If click is closer to P1 than to midpoint, extend from P1. Otherwise extend from P2.
      const extendFromP1 = distToP1 < distToMidpoint;
      const endpoint = extendFromP1 ? p1 : p2;
      const otherEndpoint = extendFromP1 ? p2 : p1;
      
      // Find intersection with other annotations along the line direction
      const intersection = findExtensionIntersection(ann, endpoint, otherEndpoint);
      
      if (intersection) {
        // Extend the line to the intersection - keep the existing line and extend the endpoint
        if (extendFromP1) {
          // Extend from P1: line goes from intersection → P1 → P2
          updateAnnotation(ann.id, { points: [intersection, p1, p2] });
        } else {
          // Extend from P2: line goes from P1 → P2 → intersection
          updateAnnotation(ann.id, { points: [p1, p2, intersection] });
        }
        pushUndo({ type: 'update', annotation: ann });
      }
    } else if (ann.type === 'measure-polyline' && ann.points.length >= 2) {
      // For polylines, find which segment was clicked
      const segmentIndex = findClickedSegmentIndex(ann.points, clickPos);
      
      if (segmentIndex !== -1) {
        const p1 = ann.points[segmentIndex];
        const p2 = ann.points[segmentIndex + 1];
        
        // Calculate midpoint of the clicked segment
        const midpoint = {
          x: (p1.x + p2.x) / 2,
          y: (p1.y + p2.y) / 2,
        };
        
        // Determine which side of midpoint was clicked
        const distToP1 = Math.sqrt(Math.pow(clickPos.x - p1.x, 2) + Math.pow(clickPos.y - p1.y, 2));
        const distToMidpoint = Math.sqrt(Math.pow(clickPos.x - midpoint.x, 2) + Math.pow(clickPos.y - midpoint.y, 2));
        
        // If click is closer to P1 than to midpoint, extend from P1 side
        const extendFromP1 = distToP1 < distToMidpoint;
        
        if (extendFromP1) {
          // Extend from P1 side - add new point before this segment
          const intersection = findExtensionIntersection(ann, p1, p2);
          
          if (intersection) {
            const newPoints = [...ann.points.slice(0, segmentIndex), intersection, ...ann.points.slice(segmentIndex)];
            updateAnnotation(ann.id, { points: newPoints });
            pushUndo({ type: 'update', annotation: ann });
          }
        } else {
          // Extend from P2 side - add new point after this segment
          const intersection = findExtensionIntersection(ann, p2, p1);
          
          if (intersection) {
            const newPoints = [...ann.points.slice(0, segmentIndex + 1), intersection, ...ann.points.slice(segmentIndex + 1)];
            updateAnnotation(ann.id, { points: newPoints });
            pushUndo({ type: 'update', annotation: ann });
          }
        }
      }
    }
  };

  // Find nearest intersection point of a line with other annotations
  const findNearestIntersection = (ann: any, clickPos: { x: number; y: number }): { x: number; y: number } | null => {
    const pageAnns = annotations.filter(a => a.id !== ann.id && a.pageIndex === currentPage);
    let nearestIntersection: { x: number; y: number } | null = null;
    let minDistance = Infinity;
    
    // Get segments to check based on annotation type
    const segments: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
    
    if (ann.type === 'line' && ann.points.length === 2) {
      segments.push({ p1: ann.points[0], p2: ann.points[1] });
    } else if (ann.type === 'measure-polyline' && ann.points.length >= 2) {
      // For polylines, check all segments
      for (let i = 0; i < ann.points.length - 1; i++) {
        segments.push({ p1: ann.points[i], p2: ann.points[i + 1] });
      }
    }
    
    // Check each segment against other annotations
    for (const segment of segments) {
      for (const otherAnn of pageAnns) {
        // Get segments from other annotation
        const otherSegments: { p1: { x: number; y: number }; p2: { x: number; y: number } }[] = [];
        
        if (otherAnn.type === 'line' && otherAnn.points.length === 2) {
          otherSegments.push({ p1: otherAnn.points[0], p2: otherAnn.points[1] });
        } else if (otherAnn.type === 'measure-polyline' && otherAnn.points.length >= 2) {
          for (let i = 0; i < otherAnn.points.length - 1; i++) {
            otherSegments.push({ p1: otherAnn.points[i], p2: otherAnn.points[i + 1] });
          }
        }
        
        // Check intersections
        for (const otherSegment of otherSegments) {
          const intersection = getLineIntersection(segment.p1, segment.p2, otherSegment.p1, otherSegment.p2);
          if (intersection) {
            const dist = Math.sqrt(Math.pow(intersection.x - clickPos.x, 2) + Math.pow(intersection.y - clickPos.y, 2));
            if (dist < minDistance) {
              minDistance = dist;
              nearestIntersection = intersection;
            }
          }
        }
      }
    }
    
    return nearestIntersection;
  };

  // Find intersection when extending a line
  const findExtensionIntersection = (ann: any, endpoint: { x: number; y: number }, otherEndpoint: { x: number; y: number }): { x: number; y: number } | null => {
    const pageAnns = annotations.filter(a => a.id !== ann.id && a.pageIndex === currentPage);
    
    // Calculate line direction
    const dx = otherEndpoint.x - endpoint.x;
    const dy = otherEndpoint.y - endpoint.y;
    const length = Math.sqrt(dx * dx + dy * dy);
    
    if (length === 0) return null;
    
    const dirX = dx / length;
    const dirY = dy / length;
    
    let nearestIntersection: { x: number; y: number } | null = null;
    let minDistance = Infinity;
    
    for (const otherAnn of pageAnns) {
      if (otherAnn.type === 'line' && otherAnn.points.length === 2) {
        const intersection = getLineIntersection(
          endpoint,
          { x: endpoint.x + dirX * 10000, y: endpoint.y + dirY * 10000 },
          otherAnn.points[0],
          otherAnn.points[1]
        );
        
        if (intersection) {
          const dist = Math.sqrt(Math.pow(intersection.x - endpoint.x, 2) + Math.pow(intersection.y - endpoint.y, 2));
          if (dist > 1 && dist < minDistance) { // Must be at least 1px away from endpoint
            minDistance = dist;
            nearestIntersection = intersection;
          }
        }
      }
    }
    
    return nearestIntersection;
  };

  // Calculate intersection of two line segments
  const getLineIntersection = (p1: { x: number; y: number }, p2: { x: number; y: number }, p3: { x: number; y: number }, p4: { x: number; y: number }): { x: number; y: number } | null => {
    const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
    
    if (Math.abs(denom) < 0.0001) return null; // Parallel lines
    
    const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
    const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denom;
    
    if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
      return {
        x: p1.x + t * (p2.x - p1.x),
        y: p1.y + t * (p2.y - p1.y),
      };
    }
    
    return null;
  };

  // Find which segment of a polyline was clicked
  const findClickedSegmentIndex = (points: { x: number; y: number }[], clickPos: { x: number; y: number }): number => {
    let closestSegment = -1;
    let minDistance = Infinity;
    
    for (let i = 0; i < points.length - 1; i++) {
      const p1 = points[i];
      const p2 = points[i + 1];
      
      // Calculate distance from click point to line segment
      const dist = pointToSegmentDistance(clickPos, p1, p2);
      
      if (dist < minDistance) {
        minDistance = dist;
        closestSegment = i;
      }
    }
    
    return closestSegment;
  };

  // Calculate distance from point to line segment
  const pointToSegmentDistance = (point: { x: number; y: number }, p1: { x: number; y: number }, p2: { x: number; y: number }): number => {
    const A = point.x - p1.x;
    const B = point.y - p1.y;
    const C = p2.x - p1.x;
    const D = p2.y - p1.y;
    
    const dot = A * C + B * D;
    const lenSq = C * C + D * D;
    
    let param = -1;
    if (lenSq !== 0) param = dot / lenSq;
    
    let xx, yy;
    
    if (param < 0) {
      xx = p1.x;
      yy = p1.y;
    } else if (param > 1) {
      xx = p2.x;
      yy = p2.y;
    } else {
      xx = p1.x + param * C;
      yy = p1.y + param * D;
    }
    
    const dx = point.x - xx;
    const dy = point.y - yy;
    
    return Math.sqrt(dx * dx + dy * dy);
  };

  // Calculate rotation angle from base point to current point
  const calculateRotationAngle = (basePoint: { x: number; y: number }, currentPoint: { x: number; y: number }): number => {
    const dx = currentPoint.x - basePoint.x;
    const dy = currentPoint.y - basePoint.y;
    return Math.atan2(dy, dx);
  };

  // Rotate a point around a base point by a given angle
  const rotatePointAround = (point: { x: number; y: number }, basePoint: { x: number; y: number }, angle: number): { x: number; y: number } => {
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - basePoint.x;
    const dy = point.y - basePoint.y;
    
    return {
      x: basePoint.x + (dx * cos - dy * sin),
      y: basePoint.y + (dx * sin + dy * cos),
    };
  };

  const exportBimDataToJson = () => {
    const bimAnnotations = annotations.filter((a) => a.type === 'bim-capture');
    if (bimAnnotations.length === 0) {
      alert('No BIM annotations to export');
      return;
    }

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
  };

  const handleEditTextSave = async (newText: string | null) => {
    setEditTextDialogOpen(false);
    if (!newText || !editingTextItem) return;
    
    const item = editingTextItem;
    if (newText === item.text) return;

    try {
      if (!pdfData) return;
      const { PDFDocument, rgb, StandardFonts } = await import('pdf-lib');
      
      // Save previous PDF data for undo
      const previousPdfDataCopy = new ArrayBuffer(pdfData.byteLength);
      new Uint8Array(previousPdfDataCopy).set(new Uint8Array(pdfData));
      
      const pdfDoc = await PDFDocument.load(pdfData);
      const pages = pdfDoc.getPages();
      const page = pages[currentPage];
      
      // Get the page size and rotation
      const { width, height } = page.getSize();
      const pageRotation = page.getRotation().angle || 0;
      
      // Convert canvas coordinates to PDF coordinates
      // Canvas: (0,0) at top-left, PDF: (0,0) at bottom-left
      // item.y is the top of the text in canvas coordinates
      // Canvas coordinates are already rotated by PDF.js viewport
      // PDF coordinates are in the internal (unrotated) coordinate system
      let pdfX = item.x;
      let pdfY = height - item.y;
      
      // Apply inverse rotation to convert canvas coords back to PDF internal coords
      if (pageRotation === 90) {
        pdfX = item.y;
        pdfY = width - item.x;
      } else if (pageRotation === 180) {
        pdfX = width - item.x;
        pdfY = height - item.y;
      } else if (pageRotation === 270) {
        pdfX = height - item.y;
        pdfY = item.x;
      }
      
      // Draw white rectangle to hide original text
      const eraserWidth = newText.length * item.fontSize * 0.6;
      const eraserHeight = item.height;
      page.drawRectangle({
        x: pdfX - 2,
        y: pdfY - eraserHeight,
        width: eraserWidth + 4,
        height: eraserHeight + 4,
        color: rgb(1, 1, 1),
      });
      
      // Try to use the exact font from the PDF if available
      let font;
      try {
        font = await pdfDoc.embedFont(item.fontFamily || 'Helvetica');
      } catch {
        const fontFamily = item.fontFamily?.toLowerCase() || '';
        let fontName = StandardFonts.Helvetica;
        if (fontFamily.includes('times') || fontFamily.includes('serif')) {
          fontName = StandardFonts.TimesRoman;
        } else if (fontFamily.includes('courier') || fontFamily.includes('mono')) {
          fontName = StandardFonts.Courier;
        }
        font = await pdfDoc.embedFont(fontName);
      }
      
      // Draw new text at the correct location
      page.drawText(newText, {
        x: pdfX,
        y: pdfY - item.fontSize * 0.8,
        size: item.fontSize,
        font: font,
        color: rgb(0, 0, 0),
      });
      
      // Save and update PDF
      const pdfBytes = await pdfDoc.save();
      const newPdfData = new ArrayBuffer(pdfBytes.byteLength);
      new Uint8Array(newPdfData).set(new Uint8Array(pdfBytes.buffer));
      setPdfData(newPdfData);
      
      // Force re-render of the current page after a short delay to ensure PDF data is updated
      setTimeout(() => {
        const offscreen = document.createElement('canvas');
        const rotation = pageRotations[currentPage] || 0;
        renderPage(currentPage, offscreen, 2, rotation).then((size) => {
          setPdfSize({ width: size.width / 2, height: size.height / 2 });
          setPdfImage(offscreen);
        });
      }, 100);
      
      // Push undo action
      pushUndo({ type: 'pdf-edit', previousPdfData: previousPdfDataCopy });
    } catch (err) {
      console.error('Failed to edit PDF text:', err);
      alert('Failed to edit PDF text. The PDF may have restricted editing or the text may be an image. Please try again.');
    }
    
    setEditingTextItem(null);
  };

  const handlePointChange = useCallback((annotationId: string, pointIndex: number, newPos: Point) => {
    const ann = annotations.find((a) => a.id === annotationId);
    if (ann) {
      const prev = { ...ann };
      const newPoints = [...ann.points];
      newPoints[pointIndex] = newPos;
      updateAnnotation(annotationId, { points: newPoints });
      pushUndo({ type: 'update', annotation: { ...ann, points: newPoints }, previousState: prev });
    }
  }, [annotations, updateAnnotation, pushUndo]);

  // Render live measurement label
  const getLiveMeasurementLabel = (): string => {
    if (drawingPoints.length < 2) return '';
    if (activeTool === 'measure-distance') {
      const d = calibratedDistance(drawingPoints[0], drawingPoints[drawingPoints.length - 1], currentCal);
      return formatMeasurement(d, measurementUnit, 'distance');
    }
    if (activeTool === 'measure-polyline' && drawingPoints.length >= 2) {
      let total = 0;
      for (let i = 0; i < drawingPoints.length - 1; i++) total += calibratedDistance(drawingPoints[i], drawingPoints[i + 1], currentCal);
      return formatMeasurement(total, measurementUnit, 'distance');
    }
    if (activeTool === 'measure-area' && drawingPoints.length >= 3) {
      const a = polygonArea(drawingPoints, currentCal);
      return formatMeasurement(a, measurementUnit, 'area');
    }
    if (activeTool === 'measure-perimeter' && drawingPoints.length >= 2) {
      const p = polygonPerimeter(drawingPoints, currentCal);
      return formatMeasurement(p, measurementUnit, 'perimeter');
    }
    if (activeTool === 'measure-angle' && drawingPoints.length >= 3) {
      const ang = angleBetweenPoints(drawingPoints[1], drawingPoints[0], drawingPoints[2]);
      return formatMeasurement(ang, measurementUnit, 'angle');
    }
    return '';
  };

  const isPanning = activeTool === 'pan';

  // Determine cursor based on tool and hover state
  const getCursor = () => {
    if (isPanning) return 'grab';
    if (hoveredAnnotation) return 'move';
    if (activeTool === 'select') return 'default';
    return 'crosshair';
  };

  // Check if we should intercept annotation clicks for interactive command base point
  const shouldInterceptAnnotationClick = () => {
    const { cadPendingCommand, cadCommandStep } = useStore.getState();
    const activeCmdUp = cadPendingCommand?.toUpperCase() || '';
    return ['ROTATE', 'MOVE', 'COPY'].includes(activeCmdUp) && (cadCommandStep === 1 || cadCommandStep === 2);
  };

  const isCadInteractivePhase = shouldInterceptAnnotationClick();

  return (
    <div 
      ref={containerRef} 
      className="flex-1 overflow-hidden bg-neutral-800 relative"
      style={{ touchAction: 'none' }}
      onTouchStart={(e) => {
        const touches = e.touches;
        if (touches && touches.length >= 2) {
          e.preventDefault();
          const dx = touches[0].clientX - touches[1].clientX;
          const dy = touches[0].clientY - touches[1].clientY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          initialPinchDistance.current = distance;
          initialZoom.current = zoom;
          isPinching.current = true;
          const centerX = (touches[0].clientX + touches[1].clientX) / 2;
          const centerY = (touches[0].clientY + touches[1].clientY) / 2;
          lastTouchCenter.current = { x: centerX, y: centerY };
        }
      }}
      onTouchMove={(e) => {
        if (isPinching.current && e.touches && e.touches.length >= 2) {
          e.preventDefault();
          const dx = e.touches[0].clientX - e.touches[1].clientX;
          const dy = e.touches[0].clientY - e.touches[1].clientY;
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (initialPinchDistance.current > 0) {
            const scale = distance / initialPinchDistance.current;
            const newZoom = Math.max(0.1, Math.min(10, initialZoom.current * scale));
            
            const centerX = (e.touches[0].clientX + e.touches[1].clientX) / 2;
            const centerY = (e.touches[0].clientY + e.touches[1].clientY) / 2;
            
            if (lastTouchCenter.current) {
              const deltaX = centerX - lastTouchCenter.current.x;
              const deltaY = centerY - lastTouchCenter.current.y;
              setPanOffset({ 
                x: panOffset.x + deltaX, 
                y: panOffset.y + deltaY 
              });
            }
            
            lastTouchCenter.current = { x: centerX, y: centerY };
            setZoom(newZoom);
          }
        }
      }}
      onTouchEnd={(e) => {
        if (isPinching.current && (!e.touches || e.touches.length < 2)) {
          isPinching.current = false;
          initialPinchDistance.current = 0;
          lastTouchCenter.current = null;
        }
      }}
    >
      {/* OSNAP Status Indicator */}
      {snapToPdf && (
        <div className="absolute top-2 left-1/2 -translate-x-1/2 z-50 bg-bb-panel border border-bb-border px-3 py-1 rounded-full shadow-lg">
          <span className="text-xs font-bold text-green-400 flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-green-400 animate-pulse"></span>
            OSNAP ON (F3 to toggle)
          </span>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
      {/* Stage wrapper - now uses pure Konva panning without native scroll */}
      <div 
        style={{ width: canvasSize.width, height: canvasSize.height, pointerEvents: 'auto' }}
        onPointerDown={(e) => {
          if (['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(useStore.getState().cadPendingCommand?.toUpperCase() || '')) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }
        }}
        onPointerUp={(e) => {
          if (['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(useStore.getState().cadPendingCommand?.toUpperCase() || '')) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }
        }}
        onMouseDown={(e) => {
          if (['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(useStore.getState().cadPendingCommand?.toUpperCase() || '')) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }
        }}
        onClick={(e) => {
          if (['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(useStore.getState().cadPendingCommand?.toUpperCase() || '')) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }
        }}
        onMouseUp={(e) => {
          if (['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(useStore.getState().cadPendingCommand?.toUpperCase() || '')) {
            e.stopPropagation();
            e.nativeEvent.stopImmediatePropagation();
          }
        }}
      >
        <Stage
          ref={stageRef}
          width={canvasSize.width}
          height={canvasSize.height}
          scaleX={zoom}
          scaleY={zoom}
          x={panOffset.x}
          y={panOffset.y}
          draggable={isPanning}
          listening={activeTool !== 'text-select' && activeTool !== 'pdf-text-edit'}
        onWheel={handleWheel}
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        
        // --- ADD THIS TO DESTROY THE BUBBLING CLICK EVENT ---
        onClick={(e) => {
          const storeState = useStore.getState();
          if (['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(storeState.cadPendingCommand?.toUpperCase() || '')) {
            e.evt.preventDefault();
            e.evt.stopPropagation();
            e.evt.stopImmediatePropagation?.();
          }
        }}
        // ----------------------------------------------------

        onDragStart={() => {
          if (isPanning) {
            document.body.style.cursor = 'grabbing';
          }
        }}
        onDragEnd={(e) => {
          if (isPanning) {
            document.body.style.cursor = 'grab';
            const newPosX = e.target.x();
            const newPosY = e.target.y();
            setPanOffset({ x: newPosX, y: newPosY });
          }
        }}
        onTouchStart={(e) => {
          e.evt.preventDefault();
          const stage = e.target.getStage();
          if (!stage) return;
          const touches = e.evt.touches || (e.evt as any).changedTouches;
          
          // Check for pinch gesture (two fingers)
          if (touches && touches.length >= 2) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            initialPinchDistance.current = distance;
            initialZoom.current = zoom;
            isPinching.current = true;
            
            // Calculate center point for pan
            const centerX = (touches[0].clientX + touches[1].clientX) / 2;
            const centerY = (touches[0].clientY + touches[1].clientY) / 2;
            lastTouchCenter.current = { x: centerX, y: centerY };
            return;
          }
          
          // Single touch - normal handling
          const pos = stage.getPointerPosition();
          if (!pos) return;
          
          // Track touch start time and position for tap detection
          touchStartTimeRef.current = Date.now();
          touchStartPosRef.current = { x: pos.x, y: pos.y };
          
          // Create a mock mouse event with the touch position
          handleMouseDown({
            target: e.target,
            evt: {
              ...e.evt,
              clientX: pos.x,
              clientY: pos.y,
              preventDefault: () => {},
            } as any,
          } as any);
        }}
        onTouchMove={(e) => {
          e.evt.preventDefault();
          const stage = e.target.getStage();
          if (!stage) return;
          const touches = e.evt.touches || (e.evt as any).changedTouches;
          
          // Handle pinch-to-zoom
          if (isPinching.current && touches && touches.length >= 2) {
            const dx = touches[0].clientX - touches[1].clientX;
            const dy = touches[0].clientY - touches[1].clientY;
            const distance = Math.sqrt(dx * dx + dy * dy);
            
            if (initialPinchDistance.current > 0) {
              const scale = distance / initialPinchDistance.current;
              const newZoom = Math.max(0.1, Math.min(10, initialZoom.current * scale));
              
              // Calculate new pan offset to zoom toward the center of the pinch
              const centerX = (touches[0].clientX + touches[1].clientX) / 2;
              const centerY = (touches[0].clientY + touches[1].clientY) / 2;
              
              if (lastTouchCenter.current) {
                const deltaX = centerX - lastTouchCenter.current.x;
                const deltaY = centerY - lastTouchCenter.current.y;
                setPanOffset({ 
                  x: panOffset.x + deltaX, 
                  y: panOffset.y + deltaY 
                });
              }
              
              lastTouchCenter.current = { x: centerX, y: centerY };
              setZoom(newZoom);
            }
            return;
          }
          
          // Single touch - normal handling
          const pos = stage.getPointerPosition();
          if (!pos) return;
          handleMouseMove({
            target: e.target,
            evt: {
              ...e.evt,
              clientX: pos.x,
              clientY: pos.y,
              preventDefault: () => {},
            } as any,
          } as any);
        }}
        onTouchEnd={(e) => {
          e.evt.preventDefault();
          const stage = e.target.getStage();
          if (!stage) return;
          const touches = e.evt.touches || (e.evt as any).changedTouches;
          
          // Reset pinch state when fingers are lifted
          if (isPinching.current && (!touches || touches.length < 2)) {
            isPinching.current = false;
            initialPinchDistance.current = 0;
            lastTouchCenter.current = null;
            return;
          }
          
          // Single touch - normal handling
          const pos = stage.getPointerPosition();
          if (!pos) return;
          
          const touchDuration = Date.now() - touchStartTimeRef.current;
          const touchDistance = Math.hypot(
            pos.x - (touchStartPosRef.current?.x || 0),
            pos.y - (touchStartPosRef.current?.y || 0)
          );
          const isTap = touchDuration < 300 && touchDistance < 10;
          
          // For multi-click tools, treat taps as adding points
          if (isTap && isDrawing && (
            activeTool === 'measure-area' ||
            activeTool === 'measure-perimeter' ||
            activeTool === 'measure-polyline' ||
            activeTool === 'measure-angle' ||
            activeTool === 'text-leader' ||
            (activeTool === 'cut' && cutMode === 'polygon')
          )) {
            const canvasPos = getPointerPos(stage);
            setDrawingPoints([...drawingPoints, canvasPos]);
          } else {
            // For other tools, use normal mouse up
            handleMouseUp({
              target: e.target,
              evt: {
                ...e.evt,
                clientX: (e.evt.changedTouches?.[0]?.clientX || 0),
                clientY: (e.evt.changedTouches?.[0]?.clientY || 0),
                preventDefault: () => {},
              } as any,
            } as any);
          }
        }}
        onDblClick={handleDoubleClick}
        onContextMenu={handleContextMenuFinalize}
        style={{ cursor: getCursor(), touchAction: 'none' }}
      >
        {/* PDF render layer */}
        <Layer name="pdf-layer" listening={false} opacity={showPdfBackground ? 1 : 0}>
          {pdfImage && (
            <PdfImageNode image={pdfImage} width={pdfSize.width} height={pdfSize.height} />
          )}
          {/* Page number overlay */}
          {showPageNumbers && pdfImage && (
            <Text
              x={pdfSize.width / 2 - 30}
              y={pdfSize.height - 20}
              text={`Page ${currentPage + 1}`}
              fontSize={11}
              fill="#666"
              fontStyle="bold"
              align="center"
              width={60}
            />
          )}

          {/* Watermark layer */}
          {watermarks
            .filter((w) => {
              if (w.pages === 'all') return true;
              if (w.pages === 'current') return true;
              if (w.pages === 'custom' && w.customPages) {
                return w.customPages.includes(currentPage + 1);
              }
              return true;
            })
            .map((w) => {
              const { x, y, rotation, align } = (() => {
                const padding = 50;
                switch (w.position) {
                  case 'top-left':
                    return { x: padding, y: padding + w.fontSize, rotation: 0, align: 'left' as const };
                  case 'top-center':
                    return { x: pdfSize.width / 2, y: padding + w.fontSize, rotation: 0, align: 'center' as const };
                  case 'top-right':
                    return { x: pdfSize.width - padding, y: padding + w.fontSize, rotation: 0, align: 'right' as const };
                  case 'bottom-left':
                    return { x: padding, y: pdfSize.height - padding, rotation: 0, align: 'left' as const };
                  case 'bottom-center':
                    return { x: pdfSize.width / 2, y: pdfSize.height - padding, rotation: 0, align: 'center' as const };
                  case 'bottom-right':
                    return { x: pdfSize.width - padding, y: pdfSize.height - padding, rotation: 0, align: 'right' as const };
                  case 'center':
                    return { x: pdfSize.width / 2, y: pdfSize.height / 2, rotation: 0, align: 'center' as const };
                  case 'diagonal':
                  default:
                    return { x: pdfSize.width / 2, y: pdfSize.height / 2, rotation: -45, align: 'center' as const };
                }
              })();

              return (
                <Text
                  key={w.id}
                  x={x}
                  y={y}
                  text={w.text}
                  fontSize={w.fontSize}
                  fontFamily={w.fontFamily}
                  fill={w.color}
                  opacity={w.opacity}
                  rotation={rotation}
                  align={align}
                  listening={false}
                />
              );
            })}
        </Layer>

        {/* Annotation layer */}
        <Layer>
          {/* CAD Command visual feedback - show pending points and lines (skip for ROTATE which has its own preview) */}
          {cadPendingCommand && cadPendingCommand.toUpperCase() !== 'ROTATE' && cadPendingPoints.length > 0 && (
            <>
              {/* Draw lines between pending points */}
              {cadPendingPoints.length >= 2 && (
                <Line
                  points={cadPendingPoints.flatMap(p => [p.x, p.y])}
                  stroke={activeStyle.stroke}
                  strokeWidth={activeStyle.strokeWidth}
                  strokeDasharray={[5, 5]}
                  opacity={0.7}
                />
              )}
              {/* Draw rubber-band line from last point to cursor for line-based tools */}
              {cadCursorPos && cadPendingPoints.length >= 1 && !['CIRCLE', 'C', 'RECTANG', 'REC'].includes(cadPendingCommand?.toUpperCase() || '') && (
                <Line
                  points={[cadPendingPoints[cadPendingPoints.length - 1].x, cadPendingPoints[cadPendingPoints.length - 1].y, cadCursorPos.x, cadCursorPos.y]}
                  stroke={activeStyle.stroke}
                  strokeWidth={activeStyle.strokeWidth}
                  strokeDasharray={[5, 5]}
                  opacity={0.5}
                />
              )}

              {/* Circle preview */}
              {['CIRCLE', 'C'].includes(cadPendingCommand?.toUpperCase() || '') && cadPendingPoints.length === 1 && cadCursorPos && (() => {
                const center = cadPendingPoints[0];
                const radius = Math.sqrt(Math.pow(cadCursorPos.x - center.x, 2) + Math.pow(cadCursorPos.y - center.y, 2));
                return (
                  <Circle
                    x={center.x}
                    y={center.y}
                    radius={radius}
                    stroke={activeStyle.stroke}
                    strokeWidth={activeStyle.strokeWidth}
                    dash={[5, 5]}
                    opacity={0.5}
                  />
                );
              })()}

              {/* Rectangle preview */}
              {['RECTANG', 'REC', 'SIGNATURE_PLACE'].includes(cadPendingCommand?.toUpperCase() || '') && cadPendingPoints.length === 1 && cadCursorPos && (() => {
                const p1 = cadPendingPoints[0];
                const p2 = cadCursorPos;
                const x = Math.min(p1.x, p2.x);
                const y = Math.min(p1.y, p2.y);
                const w = Math.abs(p2.x - p1.x);
                const h = Math.abs(p2.y - p1.y);
                const isSignature = cadPendingCommand?.toUpperCase() === 'SIGNATURE_PLACE';
                return (
                  <>
                    <Rect
                      x={x}
                      y={y}
                      width={w}
                      height={h}
                      stroke={isSignature ? '#00a8ff' : activeStyle.stroke}
                      strokeWidth={isSignature ? 2 : activeStyle.strokeWidth}
                      dash={[5, 5]}
                      opacity={0.5}
                    />
                    {/* Show signature preview if placing signature */}
                    {isSignature && pendingSignature && (
                      <KonvaImage
                        image={(() => {
                          const img = new window.Image();
                          img.src = pendingSignature.imageData;
                          return img;
                        })()}
                        x={x}
                        y={y}
                        width={w}
                        height={h}
                        opacity={0.6}
                        listening={false}
                      />
                    )}
                  </>
                );
              })()}
              {/* Arc preview: when 2 points placed + cursor, show projected arc */}
              {cadPendingCommand?.toUpperCase() === 'ARC' && cadPendingPoints.length === 2 && cadCursorPos && (() => {
                const [s, m] = cadPendingPoints;
                const e = cadCursorPos;
                const cpx = 2 * m.x - 0.5 * s.x - 0.5 * e.x;
                const cpy = 2 * m.y - 0.5 * s.y - 0.5 * e.y;
                return (
                  <Path
                    data={`M ${s.x} ${s.y} Q ${cpx} ${cpy} ${e.x} ${e.y}`}
                    stroke={activeStyle.stroke}
                    strokeWidth={activeStyle.strokeWidth}
                    opacity={0.5}
                    fill=""
                    dash={[5, 5]}
                  />
                );
              })()}
              {/* Draw point markers */}
              {cadPendingPoints.map((point, index) => (
                <Circle
                  key={index}
                  x={point.x}
                  y={point.y}
                  radius={4}
                  fill={activeStyle.stroke}
                  stroke="#fff"
                  strokeWidth={2}
                />
              ))}
            </>
          )}
          {pageAnnotations.map((ann) => (
              <AnnotationShape
                key={ann.id}
                annotation={ann}
                disableDrag={isCadInteractivePhase}
                isSelected={ann.id === selectedAnnotationId || selectedAnnotationIds.includes(ann.id)}
                shapeRef={ann.id === selectedAnnotationId ? selectedShapeRef : undefined}
                onSelect={() => {
                  // Prevent annotation selection when ROTATE is at step 1 (base point selection)
                  if (!shouldInterceptAnnotationClick()) {
                    setSelectedAnnotationId(ann.id);
                  }
                }}
                onPinClick={handlePinClick}
                onBimClick={handleBimClick}
                onTextLeaderClick={handleTextLeaderClick}
                onTextClick={handleTextClick}
                onPointChange={(pointIndex, newPos) => { if (!ann.locked) handlePointChange(ann.id, pointIndex, newPos); }}
                onContextMenu={(e) => handleAnnContextMenu(e, ann.id)}
                onCadLayerDblClick={(e) => {
                  const stage = e.target.getStage();
                  if (!stage) return;
                  const pos = getPointerPos(stage);
                  handleExtractLineFromLayer(ann, pos);
                }}
                allAnnotations={annotations}
                onDragMove={(e) => {
                  // Move all selected siblings visually in sync
                  if (selectedAnnotationIds.length <= 1) return;
                  const stage = stageRef.current;
                  if (!stage) return;
                  const dx = e.target.x();
                  const dy = e.target.y();
                  selectedAnnotationIds.forEach((id) => {
                    if (id === ann.id) return;
                    const node = stage.findOne('#' + id);
                    if (node) { node.x(dx); node.y(dy); }
                  });
                  stage.batchDraw();
                }}
                onDragEnd={(offset) => {
                  if (ann.locked) return;
                  const idsToMove = selectedAnnotationIds.length > 0 ? selectedAnnotationIds : [ann.id];
                  // Reset visual positions of sibling nodes
                  if (selectedAnnotationIds.length > 1 && stageRef.current) {
                    selectedAnnotationIds.forEach((id) => {
                      const node = stageRef.current?.findOne('#' + id);
                      if (node) { node.x(0); node.y(0); }
                    });
                  }
                  idsToMove.forEach((id) => {
                    const targetAnn = annotations.find((a) => a.id === id);
                    if (targetAnn && !targetAnn.locked) {
                      const prev = { ...targetAnn };
                      updateAnnotation(id, {
                        points: targetAnn.points.map((p) => ({
                          x: p.x + offset.x,
                          y: p.y + offset.y,
                        })),
                      });
                      pushUndo({ type: 'update', annotation: { ...targetAnn, points: targetAnn.points.map((p) => ({ x: p.x + offset.x, y: p.y + offset.y })) }, previousState: prev });
                    }
                  });
                }}
                onResize={(newOrigin, newWidth, newHeight) => {
                  if (ann.locked) return;
                  const prev = { ...ann, points: [...ann.points] };
                  updateAnnotation(ann.id, {
                    points: [newOrigin],
                    width: newWidth,
                    height: newHeight,
                  });
                  pushUndo({ type: 'update', annotation: { ...ann, points: [newOrigin], width: newWidth, height: newHeight }, previousState: prev });
                }}
                onHover={() => {}}
                measurements={measurements.filter(m => m.annotationId === ann.id)}
                measurementUnit={measurementUnit}
                calibration={currentCal}
              />
            ))}

          {/* Find highlight */}
          {findHighlight && findHighlight.pageIndex === currentPage && (
            <Rect
              x={findHighlight.x}
              y={findHighlight.y}
              width={findHighlight.width}
              height={findHighlight.height}
              fill="rgba(255, 255, 0, 0.3)"
              stroke="#ffff00"
              strokeWidth={2}
              listening={false}
            />
          )}

          {/* PDF Vector Overlay - show underlying PDF linework when OSNAP or trim-fence is active */}
          {(snapToPdf || activeTool === 'trim-fence') && pdfVectorSegments.length > 0 && (
            <Group listening={false} opacity={0.4}>
              {pdfVectorSegments.map((seg, i) => (
                <Line
                  key={`pdfvec-${i}`}
                  points={[seg.p1.x, seg.p1.y, seg.p2.x, seg.p2.y]}
                  stroke="#00e5ff"
                  strokeWidth={1.5}
                  dash={[3, 3]}
                  listening={false}
                />
              ))}
            </Group>
          )}

          {/* Drawing preview */}
          {isDrawing && drawingPoints.length >= 1 && activeTool !== 'zoom-rectangle' && (
            <DrawingPreview
              tool={activeTool}
              points={drawingPoints}
              style={activeStyle}
              liveLabel={getLiveMeasurementLabel()}
              calibration={currentCal}
              measurementUnit={measurementUnit}
              cutMode={cutMode}
            />
          )}

          {/* Zoom rectangle preview */}
          {isDrawing && activeTool === 'zoom-rectangle' && zoomRect && (
            <Rect
              x={Math.min(zoomRect.start.x, zoomRect.end.x)}
              y={Math.min(zoomRect.start.y, zoomRect.end.y)}
              width={Math.abs(zoomRect.end.x - zoomRect.start.x)}
              height={Math.abs(zoomRect.end.y - zoomRect.start.y)}
              stroke="#3b82f6"
              strokeWidth={2 / zoom}
              fill="rgba(59, 130, 246, 0.1)"
              dash={[4 / zoom, 4 / zoom]}
            />
          )}

          {/* Selection rectangle */}
          {isDrawing && activeTool === 'select' && selectionRect && (
            <Rect
              x={Math.min(selectionRect.start.x, selectionRect.end.x)}
              y={Math.min(selectionRect.start.y, selectionRect.end.y)}
              width={Math.abs(selectionRect.end.x - selectionRect.start.x)}
              height={Math.abs(selectionRect.end.y - selectionRect.start.y)}
              stroke={selectionRect.direction === 'left-to-right' ? '#10b981' : '#3b82f6'}
              strokeWidth={2 / zoom}
              fill={selectionRect.direction === 'left-to-right' ? 'rgba(16, 185, 129, 0.1)' : 'rgba(59, 130, 246, 0.1)'}
              dash={[4 / zoom, 4 / zoom]}
            />
          )}

          {/* Calibration preview */}
          {calibrationPoints.length === 1 && (
            <Group>
              <Circle
                x={calibrationPoints[0].x}
                y={calibrationPoints[0].y}
                radius={4}
                fill="#ff9800"
              />
            </Group>
          )}
          {calibrationPoints.length === 2 && (
            <Group>
              <Line
                points={[
                  calibrationPoints[0].x, calibrationPoints[0].y,
                  calibrationPoints[1].x, calibrationPoints[1].y,
                ]}
                stroke="#ff9800"
                strokeWidth={2}
                dash={[6, 3]}
              />
              <Circle x={calibrationPoints[0].x} y={calibrationPoints[0].y} radius={4} fill="#ff9800" />
              <Circle x={calibrationPoints[1].x} y={calibrationPoints[1].y} radius={4} fill="#ff9800" />
            </Group>
          )}

          {/* Count markers */}
          {countMarkers.map((pt, i) => {
            const label = String(i + 1);
            const r = label.length > 2 ? 16 : label.length > 1 ? 13 : 10;
            const fs = label.length > 2 ? 9 : label.length > 1 ? 9 : 10;
            return (
              <Group key={i}>
                <Circle x={pt.x} y={pt.y} radius={r} fill="rgba(255,87,34,0.7)" stroke="#ff5722" strokeWidth={1} />
                <Text
                  x={pt.x - r}
                  y={pt.y - fs / 2}
                  text={label}
                  fontSize={fs}
                  fill="white"
                  fontStyle="bold"
                  align="center"
                  width={r * 2}
                />
              </Group>
            );
          })}

          {/* Transformer for visual rotate grip on selected annotation */}
          <Transformer
            ref={transformerRef}
            enabledAnchors={[]}
            rotateEnabled={true}
            rotateAnchorOffset={-45}
            rotationSnaps={[0, 45, 90, 135, 180, 225, 270, 315]}
            borderStroke="#00a8ff"
            borderDash={[4, 4]}
            onTransformEnd={(e) => {
              const node = selectedShapeRef.current;
              if (node) {
                const newRotation = node.rotation();
                
                // Clear the physical transform from the outer group immediately
                // so it doesn't conflict with our React state render
                node.rotation(0);
                node.x(0);
                node.y(0);
                
                useStore.getState().updateAnnotation(node.id(), {
                  rotation: newRotation,
                });
              }
            }}
          />
        </Layer>

        {/* Detection overlay layer (BIM Identify Elements) */}
        {hoverPredictionEnabled && pageDetections.length > 0 && (
          <Layer name="detection-layer">
            {pageDetections.map((det) => {
              const meta = ELEMENT_CATEGORIES.find((e) => e.id === det.category);
              const color = meta?.color || '#3b82f6';
              const isHovered = hoveredElementId === det.id;
              const flat: number[] = [];
              for (const p of det.polygon) {
                flat.push(p.x, p.y);
              }
              return (
                <Group
                  key={det.id}
                  onMouseEnter={() => setHoveredElementId(det.id)}
                  onMouseLeave={() => setHoveredElementId(null)}
                  onClick={() => convertDetectionToAreaMeasurement(det.id)}
                  onTap={() => convertDetectionToAreaMeasurement(det.id)}
                >
                  <Line
                    points={flat}
                    closed
                    stroke={color}
                    strokeWidth={isHovered ? 3 / zoom : 1.5 / zoom}
                    fill={color}
                    opacity={isHovered ? 0.35 : 0.15}
                    dash={isHovered ? undefined : [6 / zoom, 4 / zoom]}
                  />
                  {isHovered && det.bbox.w > 0 && (
                    <Text
                      x={det.bbox.x + 4}
                      y={det.bbox.y + 4}
                      text={`${det.label}${det.quantification ? '\n' + det.quantification : ''}\n(click to measure)`}
                      fontSize={Math.max(10, 12 / zoom)}
                      fill="#ffffff"
                      stroke={color}
                      strokeWidth={0.5 / zoom}
                      padding={4}
                      fontStyle="bold"
                    />
                  )}
                </Group>
              );
            })}
          </Layer>
        )}
      </Stage>

      {/* Text selection overlay — rendered when text-select or pdf-text-edit tool is active */}
      {(activeTool === 'text-select' || activeTool === 'pdf-text-edit') && textItems.length > 0 && (
        <div
          className="absolute inset-0 pointer-events-auto"
          style={{
            overflow: 'hidden',
            cursor: 'text',
            zIndex: 10,
          }}
        >
          <div
            style={{
              position: 'absolute',
              transformOrigin: '0 0',
              transform: `translate(${panOffset.x}px, ${panOffset.y}px) scale(${zoom})`,
            }}
          >
            {textItems.map((item, i) => (
              <span
                key={i}
                onClick={(e) => {
                  if (activeTool === 'pdf-text-edit') {
                    e.stopPropagation();
                    setEditingTextItem(item);
                    setEditTextDialogOpen(true);
                  }
                }}
                style={{
                  position: 'absolute',
                  left: item.x,
                  top: item.y,
                  fontSize: item.fontSize,
                  fontFamily: item.fontFamily,
                  lineHeight: `${item.height}px`,
                  whiteSpace: 'pre',
                  color: activeTool === 'pdf-text-edit' ? 'rgba(0, 100, 255, 0.3)' : 'transparent',
                  userSelect: 'text',
                  WebkitUserSelect: 'text',
                  cursor: activeTool === 'pdf-text-edit' ? 'pointer' : 'text',
                }}
              >
                {item.text}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Form Edit Mode Overlay */}
      <FormEditOverlay
        pageIndex={currentPage}
        scale={zoom}
        containerRef={containerRef}
        pdfSize={pdfSize}
        panOffset={panOffset}
      />
      </div>
      {/* end sticky Stage wrapper */}

      {/* Pin Content Dialog */}
      <PinContentDialog
        isOpen={pinDialogOpen}
        onClose={() => { setPinDialogOpen(false); setEditingPinId(null); }}
        onSave={handlePinContentSave}
        initialContent={editingPinId ? annotations.find((a) => a.id === editingPinId)?.pinContent : undefined}
      />

      {/* Edit Text Dialog */}
      <EditTextDialog
        isOpen={editTextDialogOpen}
        onClose={handleEditTextSave}
        initialValue={editingTextItem?.text || ''}
      />

      {/* Edit Text Leader Dialog */}
      <EditTextDialog
        isOpen={textLeaderDialogOpen}
        onClose={handleTextLeaderSave}
        initialValue={editingTextLeaderId ? (annotations.find((a) => a.id === editingTextLeaderId)?.text || '') : ''}
      />

      {/* Text Annotation Editor Dialog */}
      {textAnnotationEditorOpen && editingTextAnnotationId && (() => {
        const ann = annotations.find((a) => a.id === editingTextAnnotationId);
        if (!ann) return null;
        return (
          <TextAnnotationEditor
            isOpen={textAnnotationEditorOpen}
            onClose={handleTextAnnotationEditorSave}
            initialData={{
              text: ann.text || '',
              fontSize: ann.style.fontSize || 16,
              fontFamily: ann.style.fontFamily || 'Arial',
              color: ann.style.stroke || ann.style.fill || '#000000',
              align: ann.align || 'left',
              lineHeight: ann.lineHeight || 1.2,
            }}
          />
        );
      })()}

      {/* Dynamic input overlay (AutoCAD-style) for ROTATE/MOVE/COPY/OFFSET value entry */}
      {dynInputCmd && (() => {
        const stage = stageRef.current;
        const rect = stage?.container().getBoundingClientRect();
        const bp = cadPendingPoints[0];
        let left = 0, top = 0;
        if (rect && bp) {
          left = rect.left + bp.x * zoom + panOffset.x + 18;
          top = rect.top + bp.y * zoom + panOffset.y - 18;
        } else if (rect) {
          left = rect.left + rect.width / 2;
          top = rect.top + rect.height - 90;
        }
        left = Math.max(8, Math.min(left, window.innerWidth - 200));
        top = Math.max(8, Math.min(top, window.innerHeight - 60));
        const label = dynInputCmd === 'ROTATE' ? 'Angle°' : dynInputCmd === 'OFFSET' ? 'Offset' : dynInputCmd === 'CIRCLE' ? 'Radius' : dynInputCmd === 'RECTANG' ? 'W, H' : 'Distance';
        const hint = dynInputCmd === 'ROTATE' ? 'e.g. 45  ·  Enter to apply' : dynInputCmd === 'RECTANG' ? 'e.g. 10,20  ·  Enter' : 'e.g. 100  ·  Enter to apply';

        const commit = () => {
          const c = dynInputCmd;
          if (c === 'RECTANG') {
            const parts = dynInput.split(',');
            const w = parseFloat(parts[0]);
            const h = parseFloat(parts[1] !== undefined ? parts[1] : parts[0]); // Fallback to square if only 1 dimension provided
            if (isNaN(w) || isNaN(h)) return;
            useStore.setState({ cadPendingExecute: { command: 'RECTANG_TYPED', payload: { w, h } } });
          } else {
            const val = parseFloat(dynInput);
            if (isNaN(val)) return;
            if (c === 'OFFSET') {
              useStore.setState({ cadPendingExecute: { command: 'OFFSET', payload: val } });
            } else if (c === 'CIRCLE') {
              useStore.setState({ cadPendingExecute: { command: 'CIRCLE_TYPED', payload: { radius: val } } });
            } else {
              useStore.setState({ cadPendingExecute: { command: `${c}_TYPED` as any, payload: val } });
            }
          }
          setDynInput('');
        };
        const cancel = () => {
          // Restore any live-preview mutations to originals
          if (rotationOriginalPositions.current.size > 0) {
            rotationOriginalPositions.current.forEach((orig, id) => {
              useStore.getState().updateAnnotation(id, { points: orig.points, rotation: orig.rotation });
            });
            rotationOriginalPositions.current.clear();
          }
          const s = useStore.getState();
          s.setCADPendingCommand(null);
          s.setCADPendingPoints([]);
          s.setCADCommandStep(0);
          s.clearCADSelectedIds();
          setDynInput('');
        };

        return (
          <div
            className="fixed z-50 flex items-center gap-2 bg-[#1e1e1e] border border-bb-blue rounded-md shadow-2xl px-2.5 py-1.5"
            style={{ top, left }}
            onMouseDown={(e) => { e.stopPropagation(); }}
            onContextMenu={(e) => e.preventDefault()}
          >
            <span className="text-xs font-mono font-semibold text-bb-blue whitespace-nowrap">{label}</span>
            <input
              ref={dynInputRef}
              type="text"
              autoFocus
              value={dynInput}
              onChange={(e) => setDynInput(e.target.value)}
              onMouseDown={(e) => e.stopPropagation()}
              onKeyDown={(e) => {
                e.stopPropagation();
                e.nativeEvent.stopImmediatePropagation?.();
                if (e.key === 'Enter') { e.preventDefault(); commit(); }
                else if (e.key === 'Escape') { e.preventDefault(); cancel(); }
              }}
              placeholder={hint}
              className="w-28 bg-[#252526] border border-bb-border rounded px-2 py-1 font-mono text-sm text-bb-text placeholder:text-gray-600 outline-none focus:border-bb-blue"
              spellCheck={false}
              autoComplete="off"
            />
          </div>
        );
      })()}

      {/* Floating action toolbar above the selected annotation */}
      {(() => {
        const selId = selectedAnnotationId || (selectedAnnotationIds.length === 1 ? selectedAnnotationIds[0] : null);
        if (!selId) return null;
        if (activeTool !== 'select') return null;
        // Hide while a CAD interactive command is active or while box-selecting
        const cadCmd = (cadPendingCommand || '').toUpperCase();
        if (['ROTATE', 'MOVE', 'COPY', 'OFFSET'].includes(cadCmd)) return null;
        if (selectionRect) return null;
        const ann = annotations.find((a) => a.id === selId);
        if (!ann || !ann.points || ann.points.length === 0) return null;
        const stage = stageRef.current;
        if (!stage) return null;
        const rect = stage.container().getBoundingClientRect();
        // Compute bounding box in canvas coordinates
        let minX: number, minY: number, maxX: number, maxY: number;
        if (ann.width && ann.height) {
          minX = ann.points[0].x; minY = ann.points[0].y;
          maxX = minX + ann.width; maxY = minY + ann.height;
        } else {
          const xs = ann.points.map((p) => p.x);
          const ys = ann.points.map((p) => p.y);
          minX = Math.min(...xs); maxX = Math.max(...xs);
          minY = Math.min(...ys); maxY = Math.max(...ys);
        }
        const screenCenterX = rect.left + ((minX + maxX) / 2) * zoom + panOffset.x;
        const screenTopY = rect.top + minY * zoom + panOffset.y;
        // Position the bar above the shape; clamp within viewport
        const barTop = Math.max(8, screenTopY - 65);
        const barLeft = Math.min(Math.max(8, screenCenterX), window.innerWidth - 8);
        const btn = 'w-7 h-7 flex items-center justify-center rounded hover:bg-blue-600 text-gray-200 transition-colors';
        return (
          <div
            className="fixed z-40 flex items-center gap-0.5 bg-[#2d2d2d] border border-gray-600 rounded-lg shadow-2xl px-1 py-1"
            style={{ top: barTop, left: barLeft, transform: 'translateX(-50%)' }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button className={btn} title="Rotate 90° CCW" onClick={() => handleAnnRotate90(selId, 'ccw')}>
              <RotateCcwIcon size={15} />
            </button>
            <button className={btn} title="Rotate 90° CW" onClick={() => handleAnnRotate90(selId, 'cw')}>
              <RotateCwIcon size={15} />
            </button>
            <button className={btn} title="Duplicate" onClick={() => handleAnnDuplicate(selId)}>
              <CopyIcon size={15} />
            </button>
            <label className={btn + ' cursor-pointer relative'} title="Change color">
              <PaletteIcon size={15} />
              <input
                type="color"
                className="absolute opacity-0 w-0 h-0"
                value={ann.style.stroke}
                onChange={(e) => handleAnnSetColor(selId, e.target.value)}
              />
            </label>
            <button className={btn} title="Bring to Front" onClick={() => handleAnnBringToFront(selId)}>
              <ArrowUpToLineIcon size={15} />
            </button>
            <button className={btn} title="Send to Back" onClick={() => handleAnnSendToBack(selId)}>
              <ArrowDownToLineIcon size={15} />
            </button>
            {/* Line weight / thickness with popover */}
            <div className="relative">
              <button
                className={btn + (toolbarThicknessOpen ? ' bg-blue-600 text-white' : '')}
                title="Line weight"
                onClick={() => setToolbarThicknessOpen((v) => !v)}
              >
                <MinusIcon size={15} />
              </button>
              {toolbarThicknessOpen && (
                <div className="absolute top-9 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-[#2d2d2d] border border-gray-600 rounded-lg shadow-2xl px-1.5 py-1">
                  {[1, 2, 3, 5, 8].map((w) => (
                    <button
                      key={w}
                      className="w-7 h-7 rounded border text-xs hover:bg-blue-600 transition-colors"
                      style={{
                        borderColor: (ann.style.strokeWidth || 1) === w ? '#00a8ff' : '#555',
                        background: (ann.style.strokeWidth || 1) === w ? '#1e3a5f' : 'transparent',
                      }}
                      onClick={() => { handleAnnSetThickness(selId, w); setToolbarThicknessOpen(false); }}
                    >
                      {w}
                    </button>
                  ))}
                </div>
              )}
            </div>
            {/* Lock / Unlock */}
            <button
              className={btn + (ann.locked ? ' bg-amber-600/80 text-white' : '')}
              title={ann.locked ? 'Unlock position' : 'Lock position'}
              onClick={() => handleAnnLock(selId, !ann.locked)}
            >
              {ann.locked ? <LockIcon size={15} /> : <UnlockIcon size={15} />}
            </button>
            {/* Flatten this annotation only */}
            <button className={btn} title="Flatten this annotation to PDF" onClick={() => handleAnnFlatten(selId)}>
              <LayersIcon size={15} />
            </button>
            <div className="w-px h-5 bg-gray-600 mx-0.5" />
            <button
              className={btn + ' hover:bg-red-600 text-red-400 hover:text-white'}
              title="Delete"
              onClick={() => {
                const annToDelete = annotations.find((a) => a.id === selId);
                useStore.getState().deleteAnnotation(selId);
                if (annToDelete) pushUndo({ type: 'delete', annotation: annToDelete });
              }}
            >
              <Trash2Icon size={15} />
            </button>
          </div>
        );
      })()}

      {/* Annotation right-click context menu */}
      {annContextMenu && (() => {
        const menuAnn = annotations.find((a) => a.id === annContextMenu.annotationId);
        if (!menuAnn) return null;
        const id = annContextMenu.annotationId;
        const MENU_H = 470;
        const MENU_W = 224;
        const top = Math.max(8, Math.min(annContextMenu.y, window.innerHeight - MENU_H - 8));
        const left = Math.max(8, Math.min(annContextMenu.x, window.innerWidth - MENU_W - 8));
        const swatches = ['#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6', '#8b5cf6', '#ec4899', '#000000', '#ffffff'];
        const weights = [1, 2, 3, 5, 8];
        const itemCls = 'px-4 py-1.5 text-left hover:bg-blue-600 transition-colors flex items-center gap-2';
        return (
          <div
            className="fixed bg-[#2d2d2d] border border-gray-600 rounded shadow-2xl flex flex-col text-sm text-gray-200 py-1 z-50 max-h-[90vh] overflow-y-auto"
            style={{ top, left, width: MENU_W }}
            onMouseDown={(e) => e.stopPropagation()}
            onContextMenu={(e) => e.preventDefault()}
          >
            <button className={itemCls} onClick={() => handleAnnDuplicate(id)}>
              <CopyIcon size={14} /> Duplicate
            </button>
            <button className={itemCls} onClick={() => handleAnnRotate90(id, 'cw')}>
              <RotateCwIcon size={14} /> Rotate 90° CW
            </button>
            <button className={itemCls} onClick={() => handleAnnRotate90(id, 'ccw')}>
              <RotateCcwIcon size={14} /> Rotate 90° CCW
            </button>
            <button className={itemCls} onClick={() => handleAnnRotatePrompt(id)}>
              <RotateCwIcon size={14} /> Rotate by angle…
            </button>

            <div className="h-px bg-gray-600 my-1"></div>

            <button className={itemCls} onClick={() => handleAnnBringToFront(id)}>
              <ArrowUpToLineIcon size={14} /> Bring to Front
            </button>
            <button className={itemCls} onClick={() => handleAnnSendToBack(id)}>
              <ArrowDownToLineIcon size={14} /> Send to Back
            </button>

            <div className="h-px bg-gray-600 my-1"></div>

            <div className="px-4 py-1 text-xs text-gray-400 font-semibold uppercase tracking-wider">Color</div>
            <div className="px-4 py-1.5 grid grid-cols-5 gap-1.5">
              {swatches.map((c) => (
                <button
                  key={c}
                  title={c}
                  className="w-6 h-6 rounded border-2 hover:scale-110 transition-transform"
                  style={{ backgroundColor: c, borderColor: menuAnn.style.stroke === c ? '#00a8ff' : '#555' }}
                  onClick={() => handleAnnSetColor(id, c)}
                />
              ))}
              <label
                className="w-6 h-6 rounded border-2 border-gray-500 flex items-center justify-center cursor-pointer hover:scale-110 transition-transform overflow-hidden"
                title="Custom color"
              >
                <PaletteIcon size={12} />
                <input
                  type="color"
                  className="absolute opacity-0 w-0 h-0"
                  value={menuAnn.style.stroke}
                  onChange={(e) => handleAnnSetColor(id, e.target.value)}
                />
              </label>
            </div>

            <div className="px-4 py-1 text-xs text-gray-400 font-semibold uppercase tracking-wider">Line Weight</div>
            <div className="px-4 py-1.5 flex items-center gap-1.5">
              {weights.map((w) => (
                <button
                  key={w}
                  className="flex-1 h-7 rounded border text-xs hover:bg-blue-600 transition-colors"
                  style={{ borderColor: (menuAnn.style.strokeWidth || 1) === w ? '#00a8ff' : '#555', background: (menuAnn.style.strokeWidth || 1) === w ? '#1e3a5f' : 'transparent' }}
                  onClick={() => handleAnnSetThickness(id, w)}
                >
                  {w}
                </button>
              ))}
            </div>

            <div className="h-px bg-gray-600 my-1"></div>

            {!menuAnn.locked ? (
              <button className={itemCls} onClick={() => handleAnnLock(id, true)}>
                <LockIcon size={14} /> Lock
              </button>
            ) : (
              <button className={itemCls} onClick={() => handleAnnLock(id, false)}>
                <UnlockIcon size={14} /> Unlock
              </button>
            )}
            <button className={itemCls} onClick={() => handleAnnFlatten(id)}>
              <LayersIcon size={14} /> Flatten to PDF
            </button>

            <div className="h-px bg-gray-600 my-1"></div>

            <button
              className="px-4 py-1.5 text-left text-red-400 hover:bg-red-600 hover:text-white transition-colors flex items-center gap-2"
              onClick={() => {
                const annToDelete = annotations.find((a) => a.id === id);
                useStore.getState().deleteAnnotation(id);
                if (annToDelete) pushUndo({ type: 'delete', annotation: annToDelete });
                setAnnContextMenu(null);
              }}
            >
              <Trash2Icon size={14} /> Delete
            </button>
          </div>
        );
      })()}

      {/* Image Color Editor Dialog (shown after cut, before paste) */}
      {pendingCutBuffer && (
        <ImageColorEditorDialog
          imageData={pendingCutBuffer.imageData}
          width={pendingCutBuffer.width}
          height={pendingCutBuffer.height}
          onConfirm={(processedImageData) => {
            setCutBuffer({ imageData: processedImageData, width: pendingCutBuffer.width, height: pendingCutBuffer.height });
            setPendingCutBuffer(null);
          }}
          onCancel={() => {
            setPendingCutBuffer(null);
            // Still commit the unprocessed buffer so user can paste without edits
            setCutBuffer({ imageData: pendingCutBuffer.imageData, width: pendingCutBuffer.width, height: pendingCutBuffer.height });
          }}
        />
      )}

      {/* BIM Data Dialog */}
      {bimDialogOpen && (selectedBimType || editingBimId) && (
        <BimDataDialog
          isOpen={bimDialogOpen}
          onClose={() => {
            setBimDialogOpen(false);
            setBimClickPosition(null);
            setSelectedBimType(null);
            setEditingBimId(null);
            setActiveTool('select');
          }}
          onSave={handleBimDataSave}
          bimType={selectedBimType || annotations.find((a) => a.id === editingBimId)?.bimContent?.type || 'door'}
          initialData={editingBimId ? annotations.find((a) => a.id === editingBimId)?.bimContent : undefined}
        />
      )}
    </div>
  );
}

// BIM marker with uploaded image
function BimMarkerImage({ x, y, imageUrl }: { x: number; y: number; imageUrl: string }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  
  useEffect(() => {
    const imageEl = new window.Image();
    imageEl.crossOrigin = 'anonymous';
    imageEl.src = imageUrl;
    imageEl.onload = () => setImg(imageEl);
    imageEl.onerror = () => setImg(null);
  }, [imageUrl]);

  if (!img) return null;

  return (
    <KonvaImage
      image={img}
      x={x - 15}
      y={y - 15}
      width={30}
      height={30}
      listening={false}
    />
  );
}

// PDF image as Konva Image
function PdfImageNode({ image, width, height }: { image: HTMLCanvasElement; width: number; height: number }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);

  useEffect(() => {
    const imgEl = new window.Image();
    imgEl.src = image.toDataURL();
    imgEl.onload = () => setImg(imgEl);
  }, [image]);

  if (!img) return null;
  return <KonvaImage image={img} width={width} height={height} />;
}

// Individual annotation rendering
const AnnotationShape = React.memo(function AnnotationShape({
  annotation: ann,
  isSelected,
  onSelect,
  onDragMove,
  onDragEnd,
  onResize,
  onHover,
  onPinClick,
  onBimClick,
  onTextLeaderClick,
  onTextClick,
  onPointChange,
  onContextMenu,
  onCadLayerDblClick,
  measurements: annMeasurements,
  measurementUnit: unit,
  calibration,
  allAnnotations,
  shapeRef,
  disableDrag,
}: {
  annotation: Annotation;
  isSelected: boolean;
  onSelect: () => void;
  onDragMove: (e: Konva.KonvaEventObject<DragEvent>) => void;
  onDragEnd: (offset: Point) => void;
  onResize: (newOrigin: Point, newWidth: number, newHeight: number) => void;
  onHover: (hovered: boolean) => void;
  onPinClick?: (id: string) => void;
  onBimClick?: (id: string) => void;
  onTextLeaderClick?: (id: string) => void;
  onTextClick?: (id: string) => void;
  onPointChange?: (pointIndex: number, newPos: Point) => void;
  onContextMenu?: (e: Konva.KonvaEventObject<PointerEvent>) => void;
  onCadLayerDblClick?: (e: Konva.KonvaEventObject<MouseEvent>) => void;
  measurements: Measurement[];
  measurementUnit: MeasurementUnit;
  calibration: Calibration | null;
  allAnnotations: Annotation[];
  shapeRef?: React.RefObject<any>;
  disableDrag?: boolean;
}) {
  const dragStartPos = useRef<Point>({ x: 0, y: 0 });
  const resizeStartRef = useRef<{ origin: Point; w: number; h: number; corner: string }>({ origin: { x: 0, y: 0 }, w: 0, h: 0, corner: '' });

  // Render 4 corner resize handles for box-based shapes
  const renderResizeHandles = (origin: Point, w: number, h: number) => {
    if (!isSelected) return null;
    const handleSize = 6;
    const corners = [
      { id: 'tl', x: origin.x, y: origin.y, cursor: 'nwse-resize' },
      { id: 'tr', x: origin.x + w, y: origin.y, cursor: 'nesw-resize' },
      { id: 'bl', x: origin.x, y: origin.y + h, cursor: 'nesw-resize' },
      { id: 'br', x: origin.x + w, y: origin.y + h, cursor: 'nwse-resize' },
    ];
    return (
      <>
        <Rect
          x={origin.x - 1}
          y={origin.y - 1}
          width={w + 2}
          height={h + 2}
          stroke="#1a73e8"
          strokeWidth={1}
          dash={[4, 2]}
          listening={false}
        />
        {corners.map((c) => (
          <Rect
            key={c.id}
            x={c.x - handleSize / 2}
            y={c.y - handleSize / 2}
            width={handleSize}
            height={handleSize}
            fill="#fff"
            stroke="#1a73e8"
            strokeWidth={1.5}
            draggable
            onMouseEnter={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = c.cursor;
            }}
            onMouseLeave={(e) => {
              const stage = e.target.getStage();
              if (stage) stage.container().style.cursor = 'default';
            }}
            onDragStart={(e) => {
              e.cancelBubble = true;
              resizeStartRef.current = { origin: { ...origin }, w, h, corner: c.id };
            }}
            onDragMove={(e) => {
              e.cancelBubble = true;
              const node = e.target;
              const nx = node.x() + handleSize / 2;
              const ny = node.y() + handleSize / 2;
              const { origin: startOrigin, w: startW, h: startH, corner } = resizeStartRef.current;
              let newX = startOrigin.x;
              let newY = startOrigin.y;
              let newW = startW;
              let newH = startH;

              if (corner === 'br') {
                newW = Math.max(10, nx - startOrigin.x);
                newH = Math.max(10, ny - startOrigin.y);
              } else if (corner === 'bl') {
                newW = Math.max(10, startOrigin.x + startW - nx);
                newH = Math.max(10, ny - startOrigin.y);
                newX = startOrigin.x + startW - newW;
              } else if (corner === 'tr') {
                newW = Math.max(10, nx - startOrigin.x);
                newH = Math.max(10, startOrigin.y + startH - ny);
                newY = startOrigin.y + startH - newH;
              } else if (corner === 'tl') {
                newW = Math.max(10, startOrigin.x + startW - nx);
                newH = Math.max(10, startOrigin.y + startH - ny);
                newX = startOrigin.x + startW - newW;
                newY = startOrigin.y + startH - newH;
              }
              onResize({ x: newX, y: newY }, newW, newH);
            }}
            onDragEnd={(e) => {
              e.cancelBubble = true;
            }}
          />
        ))}
      </>
    );
  };

  const commonProps = {
    name: 'annotation',
    id: ann.id,
    ref: shapeRef,
    onClick: onSelect,
    onTap: onSelect,
    onContextMenu: onContextMenu,
    draggable: !ann.locked && !disableDrag,
    onMouseEnter: () => onHover(true),
    onMouseLeave: () => onHover(false),
    onDragStart: (e: Konva.KonvaEventObject<DragEvent>) => {
      if (ann.locked || disableDrag) { e.target.stopDrag(); return; }
      dragStartPos.current = { x: e.target.x(), y: e.target.y() };
    },
    onDragMove: onDragMove,
    onDragEnd: (e: Konva.KonvaEventObject<DragEvent>) => {
      const dx = e.target.x() - dragStartPos.current.x;
      const dy = e.target.y() - dragStartPos.current.y;
      e.target.position(dragStartPos.current);
      onDragEnd({ x: dx, y: dy });
    },
    opacity: ann.style.opacity,
  };

  // Lock badge: small padlock icon rendered at the top-left of the first point
  const renderLockBadge = () => {
    if (!ann.locked) return null;
    const p = ann.points[0] || { x: 0, y: 0 };
    return (
      <Text
        x={p.x}
        y={p.y - 14}
        text="🔒"
        fontSize={11}
        listening={false}
      />
    );
  };

  const flatPoints = ann.points.flatMap((p) => [p.x, p.y]);
  const measureLabel = annMeasurements.length > 0
    ? formatMeasurement(annMeasurements[0].value, unit as any, annMeasurements[0].type)
    : '';
  const color = ann.style.stroke;
  const rotation = ann.rotation || 0;

  // Calculate absolute center for rotation
  const getLineCenter = () => {
    if (ann.points.length < 2) return { x: ann.points[0].x, y: ann.points[0].y };
    const minX = Math.min(...ann.points.map(p => p.x));
    const maxX = Math.max(...ann.points.map(p => p.x));
    const minY = Math.min(...ann.points.map(p => p.y));
    const maxY = Math.max(...ann.points.map(p => p.y));
    return { x: (minX + maxX) / 2, y: (minY + maxY) / 2 };
  };

  const getBoxCenter = () => {
    if (ann.points.length === 0) return { x: 0, y: 0 };
    return { x: ann.points[0].x + (ann.width || 0) / 2, y: ann.points[0].y + (ann.height || 0) / 2 };
  };

  const getTextCenter = () => {
    if (ann.points.length === 0) return { x: 0, y: 0 };
    const textWidth = (ann.text || '').length * (ann.style.fontSize || 16) * 0.6;
    const textHeight = ann.style.fontSize || 16;
    return { x: ann.points[0].x + textWidth / 2, y: ann.points[0].y + textHeight / 2 };
  };

  const lineCenter = getLineCenter();
  const boxCenter = getBoxCenter();
  const textCenter = getTextCenter();

  const lockBadge = renderLockBadge();

  switch (ann.type) {
    case 'line':
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? lineCenter.x : 0}
            y={rotation !== 0 ? lineCenter.y : 0}
            offsetX={rotation !== 0 ? lineCenter.x : 0}
            offsetY={rotation !== 0 ? lineCenter.y : 0}
            rotation={rotation}
          >
            <Line points={flatPoints} stroke={color} strokeWidth={ann.style.strokeWidth} hitStrokeWidth={10} />
            {isSelected && ann.points.map((p, i) => (
              <Circle key={i} x={p.x} y={p.y} radius={12} fill="#fff" stroke="#1a73e8" strokeWidth={1} />
            ))}
          </Group>
          {lockBadge}
        </Group>
      );

    case 'arc': {
      // 3-point arc: start, mid, end — render as quadratic curve through midpoint
      if (ann.points.length >= 3) {
        const [arcStart, arcMid, arcEnd] = ann.points;
        // Compute control point so the curve passes through arcMid
        const cpx = 2 * arcMid.x - 0.5 * arcStart.x - 0.5 * arcEnd.x;
        const cpy = 2 * arcMid.y - 0.5 * arcStart.y - 0.5 * arcEnd.y;
        const pathData = `M ${arcStart.x} ${arcStart.y} Q ${cpx} ${cpy} ${arcEnd.x} ${arcEnd.y}`;
        return (
          <Group {...commonProps}>
            <Path
              data={pathData}
              stroke={color}
              strokeWidth={ann.style.strokeWidth}
              hitStrokeWidth={10}
              fill=""
            />
            {isSelected && ann.points.map((p, i) => (
              <Circle key={i} x={p.x} y={p.y} radius={4} fill="#fff" stroke="#1a73e8" strokeWidth={1.5} />
            ))}
            {lockBadge}
          </Group>
        );
      }
      return null;
    }

    case 'measure-distance': {
      // Dimension-line style: arrows at both ends + label
      const p1 = ann.points[0];
      const p2 = ann.points.length > 1 ? ann.points[1] : ann.points[0];
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? lineCenter.x : 0}
            y={rotation !== 0 ? lineCenter.y : 0}
            offsetX={rotation !== 0 ? lineCenter.x : 0}
            offsetY={rotation !== 0 ? lineCenter.y : 0}
            rotation={rotation}
          >
            <Arrow
              points={[p1.x, p1.y, p2.x, p2.y]}
              stroke={color}
              strokeWidth={ann.style.strokeWidth}
              fill={color}
              pointerLength={6}
              pointerWidth={5}
              hitStrokeWidth={10}
            />
            <Arrow
              points={[p2.x, p2.y, p1.x, p1.y]}
              stroke={color}
              strokeWidth={ann.style.strokeWidth}
              fill={color}
              pointerLength={6}
              pointerWidth={5}
              hitStrokeWidth={10}
            />
            {measureLabel && (
              <Text
                x={midpoint(p1, p2).x - 30}
                y={midpoint(p1, p2).y - 18}
                text={measureLabel}
                fontSize={12}
                fill={color}
                fontStyle="bold"
                padding={2}
              />
            )}
            {isSelected && ann.points.map((p, i) => (
              <Circle key={i} x={p.x} y={p.y} radius={12} fill="#fff" stroke="#1a73e8" strokeWidth={1} />
            ))}
          </Group>
        </Group>
      );
    }

    case 'measure-polyline': {
      // Polyline with segment dimension labels
      const segLabels: React.ReactNode[] = [];
      for (let i = 0; i < ann.points.length - 1; i++) {
        const segDist = calibration ? calibratedDistance(ann.points[i], ann.points[i + 1], calibration) : 0;
        const mp = midpoint(ann.points[i], ann.points[i + 1]);
        if (segDist > 0) {
          segLabels.push(
            <Text
              key={`seg-${i}`}
              x={mp.x - 20}
              y={mp.y - 16}
              text={formatMeasurement(segDist, unit as any, 'distance')}
              fontSize={10}
              fill={color}
              fontStyle="bold"
              padding={1}
            />
          );
        }
      }
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? lineCenter.x : 0}
            y={rotation !== 0 ? lineCenter.y : 0}
            offsetX={rotation !== 0 ? lineCenter.x : 0}
            offsetY={rotation !== 0 ? lineCenter.y : 0}
            rotation={rotation}
          >
            <Line points={flatPoints} stroke={color} strokeWidth={ann.style.strokeWidth} hitStrokeWidth={10} />
            {ann.points.map((p, i) => (
              <Circle key={i} x={p.x} y={p.y} radius={3} fill={color} />
            ))}
            {segLabels}
            {measureLabel && (
              <Text
                x={ann.points[ann.points.length - 1].x + 8}
                y={ann.points[ann.points.length - 1].y - 16}
                text={measureLabel}
                fontSize={12}
                fill={color}
                fontStyle="bold"
                padding={2}
              />
            )}
            {isSelected && ann.points.map((p, i) => (
              <Circle key={i} x={p.x} y={p.y} radius={12} fill="#fff" stroke="#1a73e8" strokeWidth={1} />
            ))}
          </Group>
        </Group>
      );
    }

    case 'measure-perimeter':
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? lineCenter.x : 0}
            y={rotation !== 0 ? lineCenter.y : 0}
            offsetX={rotation !== 0 ? lineCenter.x : 0}
            offsetY={rotation !== 0 ? lineCenter.y : 0}
            rotation={rotation}
          >
            <Line
              points={flatPoints}
              stroke={color}
              strokeWidth={ann.style.strokeWidth}
              closed
              fill={ann.style.fill !== 'transparent' ? ann.style.fill : undefined}
              hitStrokeWidth={10}
            />
            {measureLabel && ann.points.length >= 2 && (
              <Text
                x={midpoint(ann.points[0], ann.points[ann.points.length - 1]).x}
                y={midpoint(ann.points[0], ann.points[ann.points.length - 1]).y - 16}
                text={measureLabel}
                fontSize={12}
                fill={color}
                fontStyle="bold"
                padding={2}
              />
            )}
            {isSelected && ann.points.map((p, i) => (
              <Circle key={i} x={p.x} y={p.y} radius={12} fill="#fff" stroke="#1a73e8" strokeWidth={1} />
            ))}
          </Group>
        </Group>
      );

    case 'arrow':
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? lineCenter.x : 0}
            y={rotation !== 0 ? lineCenter.y : 0}
            offsetX={rotation !== 0 ? lineCenter.x : 0}
            offsetY={rotation !== 0 ? lineCenter.y : 0}
            rotation={rotation}
          >
            <Arrow
              points={flatPoints}
              stroke={color}
              strokeWidth={ann.style.strokeWidth}
              fill={color}
              pointerLength={8}
              pointerWidth={6}
              hitStrokeWidth={10}
            />
            {isSelected && ann.points.map((p, i) => (
              <Circle key={i} x={p.x} y={p.y} radius={12} fill="#fff" stroke="#1a73e8" strokeWidth={1} />
            ))}
          </Group>
        </Group>
      );

    case 'rectangle':
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? boxCenter.x : 0}
            y={rotation !== 0 ? boxCenter.y : 0}
            offsetX={rotation !== 0 ? boxCenter.x : 0}
            offsetY={rotation !== 0 ? boxCenter.y : 0}
            rotation={rotation}
          >
            <Rect
              x={ann.points[0].x}
              y={ann.points[0].y}
              width={ann.width || 0}
              height={ann.height || 0}
              stroke={color}
              strokeWidth={ann.style.strokeWidth}
              fill={ann.style.fill !== 'transparent' ? ann.style.fill : undefined}
            />
            {renderResizeHandles(ann.points[0], ann.width || 0, ann.height || 0)}
          </Group>
        </Group>
      );

    case 'circle':
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? boxCenter.x : 0}
            y={rotation !== 0 ? boxCenter.y : 0}
            offsetX={rotation !== 0 ? boxCenter.x : 0}
            offsetY={rotation !== 0 ? boxCenter.y : 0}
            rotation={rotation}
          >
            <Ellipse
              x={ann.points[0].x + (ann.width || 0) / 2}
              y={ann.points[0].y + (ann.height || 0) / 2}
              radiusX={(ann.width || 0) / 2}
              radiusY={(ann.height || 0) / 2}
              stroke={color}
              strokeWidth={ann.style.strokeWidth}
              fill={ann.style.fill !== 'transparent' ? ann.style.fill : undefined}
            />
            {renderResizeHandles(ann.points[0], ann.width || 0, ann.height || 0)}
          </Group>
        </Group>
      );

    case 'cloud': {
      // Revision cloud with uniform semicircular bumps
      const cx = ann.points[0].x;
      const cy = ann.points[0].y;
      const cw = ann.width || 120;
      const ch = ann.height || 60;

      // Uniform arc radius — small bumps for a proper "clouded" look
      const targetR = 8;
      const perimeter = 2 * (cw + ch);
      const nBumps = Math.max(8, Math.round(perimeter / (targetR * 2)));

      // Distribute bumps along top, right, bottom, left edges
      const bumpCountH = Math.max(2, Math.round((cw / perimeter) * nBumps));
      const bumpCountV = Math.max(2, Math.round((ch / perimeter) * nBumps));

      // Convert cloud outline to polyline points for Konva (approximate arcs with segments)
      const cloudPts: number[] = [];
      const segsPerBump = 6; // segments per semicircle

      const arcPoints = (startX: number, startY: number, endX: number, endY: number, bulgeX: number, bulgeY: number) => {
        for (let s = 0; s <= segsPerBump; s++) {
          const t = s / segsPerBump;
          const ct = 1 - t;
          // Quadratic bezier approximation of arc through bulge point
          const px = ct * ct * startX + 2 * ct * t * bulgeX + t * t * endX;
          const py = ct * ct * startY + 2 * ct * t * bulgeY + t * t * endY;
          cloudPts.push(px, py);
        }
      };

      const r = targetR;
      // Top edge bumps (outward = up)
      for (let i = 0; i < bumpCountH; i++) {
        const x1 = cx + (i / bumpCountH) * cw;
        const x2 = cx + ((i + 1) / bumpCountH) * cw;
        arcPoints(x1, cy, x2, cy, (x1 + x2) / 2, cy - r);
      }
      // Right edge bumps (outward = right)
      for (let i = 0; i < bumpCountV; i++) {
        const y1 = cy + (i / bumpCountV) * ch;
        const y2 = cy + ((i + 1) / bumpCountV) * ch;
        arcPoints(cx + cw, y1, cx + cw, y2, cx + cw + r, (y1 + y2) / 2);
      }
      // Bottom edge bumps (outward = down), right to left
      for (let i = 0; i < bumpCountH; i++) {
        const x1 = cx + cw - (i / bumpCountH) * cw;
        const x2 = cx + cw - ((i + 1) / bumpCountH) * cw;
        arcPoints(x1, cy + ch, x2, cy + ch, (x1 + x2) / 2, cy + ch + r);
      }
      // Left edge bumps (outward = left), bottom to top
      for (let i = 0; i < bumpCountV; i++) {
        const y1 = cy + ch - (i / bumpCountV) * ch;
        const y2 = cy + ch - ((i + 1) / bumpCountV) * ch;
        arcPoints(cx, y1, cx, y2, cx - r, (y1 + y2) / 2);
      }

      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? boxCenter.x : 0}
            y={rotation !== 0 ? boxCenter.y : 0}
            offsetX={rotation !== 0 ? boxCenter.x : 0}
            offsetY={rotation !== 0 ? boxCenter.y : 0}
            rotation={rotation}
          >
            <Line
              points={cloudPts}
              stroke={color}
              strokeWidth={ann.style.strokeWidth || 2}
              closed
              fill={ann.style.fill !== 'transparent' ? ann.style.fill : undefined}
            />
          {ann.text && (
            <Text
              x={cx + 4}
              y={cy + ch + 4}
              text={ann.text}
              fontSize={ann.style.fontSize || 10}
              fill={color}
              width={cw}
            />
          )}
          {renderResizeHandles({ x: cx, y: cy }, cw, ch)}
        </Group>
        </Group>
      );
    }

    case 'strikethrough': {
      // Strikethrough: red line through a text region
      const sx = ann.points[0].x;
      const sy = ann.points[0].y;
      const sw = ann.width || 100;
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? boxCenter.x : 0}
            y={rotation !== 0 ? boxCenter.y : 0}
            offsetX={rotation !== 0 ? boxCenter.x : 0}
            offsetY={rotation !== 0 ? boxCenter.y : 0}
            rotation={rotation}
          >
            <Line
              points={[sx, sy, sx + sw, sy]}
              stroke={color || '#ef4444'}
              strokeWidth={ann.style.strokeWidth || 2}
            />
            {ann.text && (
              <Text
                x={sx}
                y={sy + 4}
                text={ann.text}
                fontSize={ann.style.fontSize || 10}
                fill={color}
              />
            )}
            {isSelected && (
              <Rect
                x={sx - 2}
                y={sy - 2}
                width={sw + 4}
                height={20}
                stroke="#1a73e8"
                strokeWidth={1}
                dash={[4, 2]}
                listening={false}
              />
            )}
          </Group>
        </Group>
      );
    }

    case 'freehand':
    case 'highlight': {
      // Calculate bounding box for selection indicator
      const fhMinX = Math.min(...ann.points.map(p => p.x));
      const fhMaxX = Math.max(...ann.points.map(p => p.x));
      const fhMinY = Math.min(...ann.points.map(p => p.y));
      const fhMaxY = Math.max(...ann.points.map(p => p.y));
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? lineCenter.x : 0}
            y={rotation !== 0 ? lineCenter.y : 0}
            offsetX={rotation !== 0 ? lineCenter.x : 0}
            offsetY={rotation !== 0 ? lineCenter.y : 0}
            rotation={rotation}
          >
            <Line
              points={flatPoints}
              // Use the actual selected color, default to yellow ONLY if none exists
              stroke={color || (ann.type === 'highlight' ? '#ffeb3b' : '#000000')}
              // Use the actual selected thickness, default to 20 ONLY for highlights
              strokeWidth={ann.style.strokeWidth || (ann.type === 'highlight' ? 20 : 2)}
              // Use the actual selected opacity, default to 0.35 ONLY for highlights
              opacity={ann.style.opacity ?? (ann.type === 'highlight' ? 0.35 : 1)}
              tension={0.5}
              lineCap="round"
              lineJoin="round"
              globalCompositeOperation={ann.type === 'highlight' ? 'multiply' : 'source-over'}
            />
            {isSelected && (
              <>
                {/* Bounding box */}
                <Rect
                  x={fhMinX - 2}
                  y={fhMinY - 2}
                  width={fhMaxX - fhMinX + 4}
                  height={fhMaxY - fhMinY + 4}
                  stroke="#1a73e8"
                  strokeWidth={1}
                  dash={[4, 2]}
                  listening={false}
                />
                {/* Pick points at start and end */}
                <Circle x={ann.points[0].x} y={ann.points[0].y} radius={4} fill="#fff" stroke="#1a73e8" strokeWidth={1.5} listening={false} />
                <Circle x={ann.points[ann.points.length - 1].x} y={ann.points[ann.points.length - 1].y} radius={4} fill="#fff" stroke="#1a73e8" strokeWidth={1.5} listening={false} />
                {/* Corner handles */}
                <Circle x={fhMinX} y={fhMinY} radius={3} fill="#1a73e8" listening={false} />
                <Circle x={fhMaxX} y={fhMinY} radius={3} fill="#1a73e8" listening={false} />
                <Circle x={fhMinX} y={fhMaxY} radius={3} fill="#1a73e8" listening={false} />
                <Circle x={fhMaxX} y={fhMaxY} radius={3} fill="#1a73e8" listening={false} />
              </>
            )}
          </Group>
          {lockBadge}
        </Group>
      );
    }

    case 'text': {
      return (
        <Group {...commonProps} onDblClick={() => onTextClick?.(ann.id)}>
          <Group
            x={rotation !== 0 ? textCenter.x : ann.points[0].x}
            y={rotation !== 0 ? textCenter.y : ann.points[0].y}
            offsetX={rotation !== 0 ? textCenter.x : 0}
            offsetY={rotation !== 0 ? textCenter.y : 0}
            rotation={rotation}
          >
            <Text
              x={rotation !== 0 ? -textCenter.x : 0}
              y={rotation !== 0 ? -textCenter.y : 0}
              text={ann.text || ''}
              fontSize={ann.style.fontSize || 16}
              fontFamily={ann.style.fontFamily || 'Arial'}
              fill={color}
              lineHeight={ann.lineHeight || 1.2}
              align={ann.align || 'left'}
              wrap="word"
            />
          </Group>
          {isSelected && (
            <Rect
              x={ann.points[0].x - 2}
              y={ann.points[0].y - 2}
              width={100}
              height={20}
              stroke="#1a73e8"
              strokeWidth={1}
              dash={[4, 2]}
              listening={false}
            />
          )}
        </Group>
      );
    }

    case 'stamp-check':
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? boxCenter.x : 0}
            y={rotation !== 0 ? boxCenter.y : 0}
            offsetX={rotation !== 0 ? boxCenter.x : 0}
            offsetY={rotation !== 0 ? boxCenter.y : 0}
            rotation={rotation}
          >
            <Line
              points={[
                ann.points[0].x - 8, ann.points[0].y,
                ann.points[0].x, ann.points[0].y + 10,
                ann.points[0].x + 12, ann.points[0].y - 10,
              ]}
              stroke="#22c55e"
              strokeWidth={3}
              lineCap="round"
              lineJoin="round"
            />
            {isSelected && (
              <Rect
                x={ann.points[0].x - 12}
                y={ann.points[0].y - 14}
                width={28}
                height={28}
                stroke="#1a73e8"
                strokeWidth={1}
                dash={[4, 2]}
                listening={false}
              />
            )}
          </Group>
        </Group>
      );

    case 'stamp-x':
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? boxCenter.x : 0}
            y={rotation !== 0 ? boxCenter.y : 0}
            offsetX={rotation !== 0 ? boxCenter.x : 0}
            offsetY={rotation !== 0 ? boxCenter.y : 0}
            rotation={rotation}
          >
            <Line
              points={[ann.points[0].x - 8, ann.points[0].y - 8, ann.points[0].x + 8, ann.points[0].y + 8]}
              stroke="#000000"
              strokeWidth={3}
              lineCap="round"
            />
            <Line
              points={[ann.points[0].x + 8, ann.points[0].y - 8, ann.points[0].x - 8, ann.points[0].y + 8]}
              stroke="#000000"
              strokeWidth={3}
              lineCap="round"
            />
            {isSelected && (
              <Rect
                x={ann.points[0].x - 12}
                y={ann.points[0].y - 12}
                width={24}
                height={24}
                stroke="#1a73e8"
                strokeWidth={1}
                dash={[4, 2]}
                listening={false}
              />
            )}
          </Group>
        </Group>
      );

    case 'measure-area':
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? lineCenter.x : 0}
            y={rotation !== 0 ? lineCenter.y : 0}
            offsetX={rotation !== 0 ? lineCenter.x : 0}
            offsetY={rotation !== 0 ? lineCenter.y : 0}
            rotation={rotation}
          >
            <Line
              points={flatPoints}
              stroke={color}
              strokeWidth={ann.style.strokeWidth}
              closed
              fill={ann.style.fill !== 'transparent' ? ann.style.fill : 'rgba(0,229,255,0.15)'}
            />
            {measureLabel && (
              <Text
                x={ann.points.reduce((s, p) => s + p.x, 0) / ann.points.length}
                y={ann.points.reduce((s, p) => s + p.y, 0) / ann.points.length}
                text={measureLabel}
                fontSize={12}
                fill={color}
                fontStyle="bold"
                padding={2}
              />
            )}
            {isSelected && ann.points.map((p, i) => (
              <Circle key={i} x={p.x} y={p.y} radius={12} fill="#fff" stroke="#1a73e8" strokeWidth={1} />
            ))}
          </Group>
        </Group>
      );

    case 'measure-angle': {
      // 3 points: pts[0] → pts[1] (vertex) → pts[2], angle at vertex
      const pA = ann.points[0];
      const vertex = ann.points[1];
      const pB = ann.points.length > 2 ? ann.points[2] : vertex;
      // Arc angles: direction from vertex to each endpoint
      const angA = Math.atan2(pA.y - vertex.y, pA.x - vertex.x) * (180 / Math.PI);
      const angB = Math.atan2(pB.y - vertex.y, pB.x - vertex.x) * (180 / Math.PI);
      let arcAngle = angB - angA;
      if (arcAngle > 180) arcAngle -= 360;
      if (arcAngle < -180) arcAngle += 360;
      const arcRadius = 25;
      return (
        <Group {...commonProps}>
          <Group
            x={vertex.x}
            y={vertex.y}
            rotation={rotation}
          >
            {/* Line from first point to vertex */}
            <Line points={[pA.x - vertex.x, pA.y - vertex.y, 0, 0]} stroke={color} strokeWidth={2} hitStrokeWidth={10} />
            {/* Line from vertex to third point */}
            <Line points={[0, 0, pB.x - vertex.x, pB.y - vertex.y]} stroke={color} strokeWidth={2} hitStrokeWidth={10} />
            {/* Arc showing the angle at the vertex */}
            <Arc
              x={0}
              y={0}
              innerRadius={arcRadius - 1}
              outerRadius={arcRadius}
              angle={Math.abs(arcAngle)}
              rotation={arcAngle >= 0 ? angA : angA + arcAngle}
              fill="transparent"
              stroke={color}
              strokeWidth={1.5}
              opacity={0.8}
            />
            {/* Endpoint dots */}
            <Circle x={pA.x - vertex.x} y={pA.y - vertex.y} radius={3} fill={color} />
            <Circle x={0} y={0} radius={4} fill={color} />
            <Circle x={pB.x - vertex.x} y={pB.y - vertex.y} radius={3} fill={color} />
            {measureLabel && (
              <Text
                x={10}
                y={-10}
                text={measureLabel}
                fontSize={12}
                fill={color}
                fontStyle="bold"
                padding={2}
              />
            )}
            {isSelected && ann.points.map((p, i) => (
              <Circle key={i} x={p.x - vertex.x} y={p.y - vertex.y} radius={4} fill="#fff" stroke="#1a73e8" strokeWidth={1} />
            ))}
          </Group>
        </Group>
      );
    }

    case 'eraser-box':
      return (
        <Group {...commonProps}>
          <Rect
            x={ann.points[0].x}
            y={ann.points[0].y}
            width={ann.width || 50}
            height={ann.height || 20}
            fill={ann.style.fill || '#ffffff'}
            stroke={ann.style.fill || '#ffffff'}
            strokeWidth={0}
          />
          {renderResizeHandles(ann.points[0], ann.width || 50, ann.height || 20)}
        </Group>
      );

    case 'pdf-text-edit': {
      const fontSize = ann.style.fontSize || 14;
      const textLen = (ann.text?.length || 1) * fontSize * 0.6;
      const editW = Math.max(ann.width || 0, textLen);
      const editH = ann.height || fontSize + 6;
      const centerX = ann.points[0].x + editW / 2;
      const centerY = ann.points[0].y + editH / 2;
      return (
        <Group {...commonProps}>
          <Group
            x={rotation !== 0 ? centerX : 0}
            y={rotation !== 0 ? centerY : 0}
            offsetX={rotation !== 0 ? editW / 2 : 0}
            offsetY={rotation !== 0 ? editH / 2 : 0}
            rotation={rotation}
          >
            <Rect
              x={-editW / 2}
              y={-editH / 2}
              width={editW}
              height={editH}
              fill={ann.style.fill || '#ffffff'}
            />
            <Text
              x={-editW / 2}
              y={-editH / 2 + 2}
              text={ann.text || ''}
              fontSize={fontSize}
              fontFamily={ann.style.fontFamily || 'Arial'}
              fill={ann.style.stroke || '#000000'}
              wrap="none"
            />
            {isSelected && (
              <Rect
                x={-editW / 2 - 1}
                y={-editH / 2 - 1}
                width={editW + 2}
                height={editH + 2}
                stroke="#1a73e8"
                strokeWidth={1}
                dash={[4, 2]}
                fill="transparent"
                listening={false}
              />
            )}
          </Group>
        </Group>
      );
    }

    case 'image': {
      const rotation = ann.rotation || 0;
      const centerX = ann.points[0].x + (ann.width || 100) / 2;
      const centerY = ann.points[0].y + (ann.height || 100) / 2;
      return (
        <Group {...commonProps}>
          <Group
            x={centerX}
            y={centerY}
            rotation={rotation}
            offsetX={(ann.width || 100) / 2}
            offsetY={(ann.height || 100) / 2}
          >
            <PastedImageNode
              dataUrl={ann.imageData || ''}
              x={0}
              y={0}
              width={ann.width || 100}
              height={ann.height || 100}
              stroke={ann.style.stroke}
              strokeWidth={ann.style.strokeWidth}
            />
          </Group>
          {renderResizeHandles(ann.points[0], ann.width || 100, ann.height || 100)}
        </Group>
      );
    }

    case 'text-leader': {
      // points[0] = arrow head (first click) - front of arrow
      // points[1] = arrow rear / tail start (second click) - back of arrow, start of tail line
      // points[2] = tail end / text position (third click) - end of tail line, where text is placed
      const arrowHead = ann.points[0];
      const arrowRear = ann.points[1] || (arrowHead ? { x: arrowHead.x + 20, y: arrowHead.y } : { x: 0, y: 0 });
      const textPos = ann.points[2] || (arrowRear ? { x: arrowRear.x + 100, y: arrowRear.y } : { x: 0, y: 0 });
      
      // Defensive check for valid points
      if (!arrowHead || !arrowRear || !textPos) {
        return null;
      }
      
      const fontSize = ann.style.fontSize || 16;
      const lines = (ann.text || '').split('\n');
      const lineSpacing = 4;
      const textWidth = Math.max(...lines.map(line => line.length * fontSize * 0.6), 50); // Minimum width
      const textHeight = lines.length * fontSize + (lines.length - 1) * lineSpacing + 8; // Line spacing
      const padding = 4;
      
      return (
        <Group {...commonProps} onDblClick={() => onTextLeaderClick?.(ann.id)}>
          <Group
            x={rotation !== 0 ? lineCenter.x : 0}
            y={rotation !== 0 ? lineCenter.y : 0}
            offsetX={rotation !== 0 ? lineCenter.x : 0}
            offsetY={rotation !== 0 ? lineCenter.y : 0}
            rotation={rotation}
          >
            {/* Arrow from arrow rear to arrow head (reversed direction) */}
            <Arrow
              points={[arrowRear.x, arrowRear.y, arrowHead.x, arrowHead.y]}
              stroke={color}
              strokeWidth={ann.style.strokeWidth || 1}
              fill={color}
              pointerLength={6}
              pointerWidth={4}
              hitStrokeWidth={10}
            />
            {/* Tail line from arrow rear to text position */}
            <Line
              points={[arrowRear.x, arrowRear.y, textPos.x, textPos.y]}
              stroke={color}
              strokeWidth={ann.style.strokeWidth || 1}
              hitStrokeWidth={10}
            />
            {/* Text box at text position */}
            <Rect
              x={textPos.x - textWidth - padding}
              y={textPos.y - textHeight - padding}
              width={textWidth + padding * 2}
              height={textHeight + padding * 2}
              stroke={color}
              strokeWidth={ann.style.strokeWidth || 1}
              fill="white"
            />
            {lines.map((line, index) => (
              <Text
                key={index}
                x={textPos.x - textWidth - padding}
                y={textPos.y - textHeight - padding + 2 + index * (fontSize + lineSpacing)}
                text={line}
                fontSize={fontSize}
                fontFamily={ann.style.fontFamily || 'Arial'}
                fill={color}
              />
            ))}
            {isSelected && (
              <>
                <Circle
                  key={0}
                  x={arrowHead.x}
                  y={arrowHead.y}
                  radius={4}
                  fill="#fff"
                  stroke="#1a73e8"
                  strokeWidth={1}
                  draggable
                  onDragStart={(e) => e.cancelBubble = true}
                  onDragEnd={(e) => {
                    e.cancelBubble = true;
                    if (onPointChange) {
                      onPointChange(0, { x: e.target.x(), y: e.target.y() });
                    }
                  }}
                />
                <Circle
                  key={1}
                  x={arrowRear.x}
                  y={arrowRear.y}
                  radius={4}
                  fill="#fff"
                  stroke="#1a73e8"
                  strokeWidth={1}
                  draggable
                  onDragStart={(e) => e.cancelBubble = true}
                  onDragEnd={(e) => {
                    e.cancelBubble = true;
                    if (onPointChange) {
                      onPointChange(1, { x: e.target.x(), y: e.target.y() });
                    }
                  }}
                />
                <Circle
                  key={2}
                  x={textPos.x}
                  y={textPos.y}
                  radius={4}
                  fill="#fff"
                  stroke="#1a73e8"
                  strokeWidth={1}
                  draggable
                  onDragStart={(e) => e.cancelBubble = true}
                  onDragEnd={(e) => {
                    e.cancelBubble = true;
                    if (onPointChange) {
                      onPointChange(2, { x: e.target.x(), y: e.target.y() });
                    }
                  }}
                />
              </>
            )}
          </Group>
        </Group>
      );
    }

    case 'pin': {
      return (
        <Group
          {...commonProps}
          onClick={(e) => { e.cancelBubble = true; onPinClick?.(ann.id); }}
          onTap={(e) => { e.cancelBubble = true; onPinClick?.(ann.id); }}
        >
          <MapPinIcon
            x={ann.points[0].x}
            y={ann.points[0].y}
            size={14}
            color={ann.style.stroke || '#ef4444'}
            hasContent={!!(ann.pinContent?.text || ann.pinContent?.images?.length)}
          />
          {isSelected && (
            <Circle
              x={ann.points[0].x}
              y={ann.points[0].y}
              radius={10}
              stroke="#1a73e8"
              strokeWidth={1}
              dash={[4, 2]}
              fill="transparent"
              listening={false}
            />
          )}
        </Group>
      );
    }

    case 'inspection-task': {
      const statusColors = {
        'Open': '#ef4444',
        'In Progress': '#eab308',
        'Complete': '#3b82f6',
        'Verified': '#22c55e'
      };
      const pinColor = statusColors[ann.pinContent?.status || 'Open'] || '#ef4444';
      const isHighPriority = ann.pinContent?.priority === 'High';

      return (
        <Group
          {...commonProps}
          onClick={(e) => { e.cancelBubble = true; onPinClick?.(ann.id); }}
          onTap={(e) => { e.cancelBubble = true; onPinClick?.(ann.id); }}
        >
          <Group x={ann.points[0].x} y={ann.points[0].y}>
            <Path
              data="M0,-24 C-8,-24 -14,-18 -14,-10 C-14,0 0,16 0,16 C0,16 14,0 14,-10 C14,-18 8,-24 0,-24 Z"
              fill={pinColor}
              stroke="#ffffff"
              strokeWidth={2}
              shadowColor="rgba(0,0,0,0.5)"
              shadowBlur={4}
              shadowOffsetY={2}
            />
            <Circle y={-12} radius={4} fill="#ffffff" />
            {isHighPriority && (
              <Group x={10} y={-24}>
                <Circle radius={6} fill="#ef4444" stroke="#ffffff" strokeWidth={1.5} />
                <Text text="!" x={-2} y={-5} fontSize={10} fill="white" fontStyle="bold" />
              </Group>
            )}
          </Group>
          {isSelected && (
            <Circle
              x={ann.points[0].x}
              y={ann.points[0].y}
              radius={10}
              stroke="#1a73e8"
              strokeWidth={1}
              dash={[4, 2]}
              fill="transparent"
              listening={false}
            />
          )}
        </Group>
      );
    }

    case 'bim-capture': {
      const bimType = ann.bimContent?.type || 'wall';
      const colors: Record<string, string> = {
        door: '#3b82f6',
        wall: '#10b981',
        supplier: '#f59e0b',
        'fire-rating': '#ef4444',
      };
      const symbols: Record<string, string> = {
        door: 'D',
        wall: 'W',
        supplier: 'S',
        'fire-rating': 'F',
      };
      
      const firstImage = ann.bimContent?.images?.[0];
      
      return (
        <Group 
          {...commonProps} 
          onClick={(e) => {
            e.cancelBubble = true;
            onBimClick?.(ann.id);
          }}
          onTap={(e) => {
            e.cancelBubble = true;
            onBimClick?.(ann.id);
          }}
        >
          {firstImage ? (
            <BimMarkerImage x={ann.points[0].x} y={ann.points[0].y} imageUrl={firstImage} />
          ) : (
            <>
              <Circle
                x={ann.points[0].x}
                y={ann.points[0].y}
                radius={15}
                fill={colors[bimType] || '#10b981'}
                stroke={colors[bimType] || '#10b981'}
                strokeWidth={2}
              />
              <Text
                x={ann.points[0].x}
                y={ann.points[0].y}
                text={symbols[bimType] || 'W'}
                fontSize={14}
                fontFamily="Arial"
                fontStyle="bold"
                fill="white"
                align="center"
                verticalAlign="middle"
                offsetX={(symbols[bimType] || 'W').length * 4.5}
                offsetY={5}
              />
            </>
          )}
          {isSelected && (
            <Circle
              x={ann.points[0].x}
              y={ann.points[0].y}
              radius={18}
              stroke="#1a73e8"
              strokeWidth={1}
              dash={[4, 2]}
              fill="transparent"
              listening={false}
            />
          )}
        </Group>
      );
    }

    case 'cad-layer': {
      // Manifest: load chunks and render them together
      if (ann.chunkIds && ann.chunkIds.length > 0) {
        const chunkAnnotations = allAnnotations.filter((a: Annotation) => ann.chunkIds?.includes(a.id) && a.type === 'cad-layer-chunk');
        const allLines: { points: Point[] }[] = [];
        chunkAnnotations.forEach((chunk: Annotation) => {
          if (chunk.lines) {
            allLines.push(...chunk.lines);
          }
        });

        return (
          <Group
            {...commonProps}
            onDblClick={onCadLayerDblClick}
          >
            <Shape
              sceneFunc={(ctx: Konva.Context, shape: Konva.Shape) => {
                ctx.beginPath();
                // Draw all polylines from all chunks in a single path for performance
                for (const polylineObj of allLines) {
                  const line = polylineObj.points;
                  if (line.length < 2) continue;
                  ctx.moveTo(line[0].x, line[0].y);
                  for (let i = 1; i < line.length; i++) {
                    ctx.lineTo(line[i].x, line[i].y);
                  }
                }
                ctx.strokeShape(shape);
              }}
              stroke={color}
              strokeWidth={ann.style.strokeWidth}
              hitStrokeWidth={5}
              listening={true}
            />
            {isSelected && (
              <Text
                x={10}
                y={10}
                text={`CAD Layer (${chunkAnnotations.length} chunks, ${allLines.length} polylines) - Double-click a line to extract`}
                fill="#1a73e8"
                fontSize={12}
                fontFamily="Arial"
                listening={false}
              />
            )}
          </Group>
        );
      }
      // Legacy: direct lines (for backward compatibility)
      if (!ann.lines) return null;
      const lines = ann.lines;
      return (
        <Group
          {...commonProps}
          onDblClick={onCadLayerDblClick}
        >
          <Shape
            sceneFunc={(ctx: Konva.Context, shape: Konva.Shape) => {
              ctx.beginPath();
              // Draw all polylines in a single path for performance
              for (const polylineObj of lines) {
                const line = polylineObj.points;
                if (line.length < 2) continue;
                ctx.moveTo(line[0].x, line[0].y);
                for (let i = 1; i < line.length; i++) {
                  ctx.lineTo(line[i].x, line[i].y);
                }
              }
              ctx.strokeShape(shape);
            }}
            stroke={color}
            strokeWidth={ann.style.strokeWidth}
            hitStrokeWidth={5}
            listening={true}
          />
          {isSelected && (
            <Text
              x={10}
              y={10}
              text="CAD Layer Selected (Double-click a line to extract)"
              fill="#1a73e8"
              fontSize={12}
              fontFamily="Arial"
              listening={false}
            />
          )}
        </Group>
      );
    }

    default:
      return null;
  }
}, (prev, next) => {
  // Performance Critical: Only re-render if visual props or selection state change
  return (
    prev.isSelected === next.isSelected &&
    prev.annotation.updatedAt === next.annotation.updatedAt &&
    prev.annotation.points === next.annotation.points &&
    prev.annotation.style === next.annotation.style &&
    prev.annotation.rotation === next.annotation.rotation
  );
});

// MapPin icon using the provided image
function MapPinIcon({ x, y, size, color, hasContent }: { x: number; y: number; size: number; color: string; hasContent: boolean }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  
  useEffect(() => {
    const imgEl = new window.Image();
    imgEl.src = '/a-removebg-preview.png';
    imgEl.onload = () => setImg(imgEl);
  }, []);
  
  if (!img) return null;
  
  return (
    <KonvaImage
      image={img}
      x={x - size / 2}
      y={y - size}
      width={size}
      height={size * 1.5}
    />
  );
}

// Render pasted image as Konva Image
function PastedImageNode({ dataUrl, x, y, width, height, stroke, strokeWidth }: { dataUrl: string; x: number; y: number; width: number; height: number; stroke: string; strokeWidth: number }) {
  const [img, setImg] = useState<HTMLImageElement | null>(null);
  useEffect(() => {
    if (!dataUrl) return;
    const imgEl = new window.Image();
    imgEl.src = dataUrl;
    imgEl.onload = () => setImg(imgEl);
  }, [dataUrl]);
  if (!img) return null;
  return (
    <>
      <KonvaImage image={img} x={x} y={y} width={width} height={height} />
      {strokeWidth > 0 && stroke !== 'transparent' && (
        <Rect
          x={x}
          y={y}
          width={width}
          height={height}
          stroke={stroke}
          strokeWidth={strokeWidth}
          fill="transparent"
          listening={false}
        />
      )}
    </>
  );
}

// Preview while drawing
function DrawingPreview({
  tool,
  points,
  style,
  liveLabel,
  calibration,
  measurementUnit,
  cutMode,
}: {
  tool: ToolType;
  points: Point[];
  style: Annotation['style'];
  liveLabel: string;
  calibration?: any;
  measurementUnit?: string;
  cutMode?: 'rect' | 'polygon';
}) {
  if (points.length < 1) return null;
  const flatPts = points.flatMap((p) => [p.x, p.y]);
  const color = tool.startsWith('measure') ? style.stroke : style.stroke;

  const isRect = tool === 'rectangle' || tool === 'eraser-box' || (tool === 'cut' && cutMode === 'rect');
  const isCircle = tool === 'circle';
  const isCloud = tool === 'cloud';

  // Cut tool polygon mode preview
  if (tool === 'cut' && cutMode === 'polygon' && points.length >= 1) {
    return (
      <Group>
        <Line
          points={flatPts}
          stroke={color}
          strokeWidth={style.strokeWidth}
          dash={[4, 2]}
          lineCap="round"
          lineJoin="round"
        />
        {points.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={3} fill={color} />)}
      </Group>
    );
  }

  if ((isRect || isCircle || isCloud) && points.length === 2) {
    const x = Math.min(points[0].x, points[1].x);
    const y = Math.min(points[0].y, points[1].y);
    const w = Math.abs(points[1].x - points[0].x);
    const h = Math.abs(points[1].y - points[0].y);
    if (isCloud) {
      // Use the same logic as the actual cloud rendering to avoid extra points
      const targetR = 8;
      const perimeter = 2 * (w + h);
      const nBumps = Math.max(8, Math.round(perimeter / (targetR * 2)));
      const bumpCountH = Math.max(2, Math.round((w / perimeter) * nBumps));
      const bumpCountV = Math.max(2, Math.round((h / perimeter) * nBumps));
      
      const cloudPts: number[] = [];
      const segsPerBump = 6;

      const arcPoints = (startX: number, startY: number, endX: number, endY: number, bulgeX: number, bulgeY: number) => {
        for (let s = 0; s <= segsPerBump; s++) {
          const t = s / segsPerBump;
          const ct = 1 - t;
          const px = ct * ct * startX + 2 * ct * t * bulgeX + t * t * endX;
          const py = ct * ct * startY + 2 * ct * t * bulgeY + t * t * endY;
          cloudPts.push(px, py);
        }
      };

      const r = targetR;
      // Top edge bumps
      for (let i = 0; i < bumpCountH; i++) {
        const x1 = x + (i / bumpCountH) * w;
        const x2 = x + ((i + 1) / bumpCountH) * w;
        arcPoints(x1, y, x2, y, (x1 + x2) / 2, y - r);
      }
      // Right edge bumps
      for (let i = 0; i < bumpCountV; i++) {
        const y1 = y + (i / bumpCountV) * h;
        const y2 = y + ((i + 1) / bumpCountV) * h;
        arcPoints(x + w, y1, x + w, y2, x + w + r, (y1 + y2) / 2);
      }
      // Bottom edge bumps, right to left
      for (let i = 0; i < bumpCountH; i++) {
        const x1 = x + w - (i / bumpCountH) * w;
        const x2 = x + w - ((i + 1) / bumpCountH) * w;
        arcPoints(x1, y + h, x2, y + h, (x1 + x2) / 2, y + h + r);
      }
      // Left edge bumps, bottom to top
      for (let i = 0; i < bumpCountV; i++) {
        const y1 = y + h - (i / bumpCountV) * h;
        const y2 = y + h - ((i + 1) / bumpCountV) * h;
        arcPoints(x, y1, x, y2, x - r, (y1 + y2) / 2);
      }

      return <Group><Line points={cloudPts} stroke={color} strokeWidth={style.strokeWidth} closed tension={0.3} dash={[4, 2]} /></Group>;
    }
    return (
      <Group>
        {isRect ? (
          <Rect x={x} y={y} width={w} height={h} stroke={color} strokeWidth={style.strokeWidth} dash={[4, 2]} />
        ) : (
          <Ellipse x={x + w / 2} y={y + h / 2} radiusX={w / 2} radiusY={h / 2} stroke={color} strokeWidth={style.strokeWidth} dash={[4, 2]} />
        )}
      </Group>
    );
  }

  // Polyline preview: show segment labels
  if (tool === 'measure-polyline' && points.length >= 2) {
    const segLabels: React.ReactNode[] = [];
    for (let i = 0; i < points.length - 1; i++) {
      const segDist = calibration ? calibratedDistance(points[i], points[i + 1], calibration) : 0;
      const mp = midpoint(points[i], points[i + 1]);
      if (segDist > 0 && measurementUnit) {
        segLabels.push(
          <Text
            key={`pseg-${i}`}
            x={mp.x - 15}
            y={mp.y - 14}
            text={formatMeasurement(segDist, measurementUnit as any, 'distance')}
            fontSize={9}
            fill={color}
            fontStyle="bold"
          />
        );
      }
    }
    return (
      <Group>
        <Line points={flatPts} stroke={color} strokeWidth={style.strokeWidth} dash={[4, 2]} lineCap="round" lineJoin="round" />
        {points.map((p, i) => <Circle key={i} x={p.x} y={p.y} radius={3} fill={color} />)}
        {segLabels}
        {liveLabel && (
          <Text x={points[points.length - 1].x + 10} y={points[points.length - 1].y - 20} text={liveLabel} fontSize={11} fill={color} fontStyle="bold" padding={2} />
        )}
      </Group>
    );
  }

  return (
    <Group>
      {tool === 'trim-fence' ? (
        <Line
          points={flatPts}
          stroke="#ef4444"
          strokeWidth={2}
          dash={[8, 4]}
        />
      ) : tool === 'arrow' ? (
        <Arrow points={flatPts} stroke={color} strokeWidth={style.strokeWidth} fill={color} pointerLength={8} pointerWidth={6} dash={[4, 2]} />
      ) : tool === 'measure-distance' && points.length === 2 ? (
        <>
          <Arrow points={flatPts} stroke={color} strokeWidth={style.strokeWidth} fill={color} pointerLength={6} pointerWidth={5} dash={[4, 2]} />
          <Arrow points={[points[1].x, points[1].y, points[0].x, points[0].y]} stroke={color} strokeWidth={style.strokeWidth} fill={color} pointerLength={6} pointerWidth={5} dash={[4, 2]} />
        </>
      ) : (
        <Line
          points={flatPts}
          stroke={color}
          strokeWidth={style.strokeWidth}
          tension={tool === 'freehand' || tool === 'highlight' ? 0.5 : 0}
          lineCap="round"
          lineJoin="round"
          dash={[4, 2]}
        />
      )}
      {liveLabel && points.length >= 2 && (
        <Text
          x={points[points.length - 1].x + 10}
          y={points[points.length - 1].y - 20}
          text={liveLabel}
          fontSize={11}
          fill={color}
          fontStyle="bold"
          padding={2}
        />
      )}
    </Group>
  );
}
