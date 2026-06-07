export type ToolType =
  | 'select'
  | 'text-select'
  | 'pan'
  | 'text'
  | 'pdf-text-edit'
  | 'arrow'
  | 'line'
  | 'rectangle'
  | 'circle'
  | 'cloud'
  | 'zoom-rectangle'
  | 'freehand'
  | 'highlight'
  | 'strikethrough'
  | 'eraser'
  | 'eraser-box'
  | 'stamp-check'
  | 'stamp-x'
  | 'calibrate'
  | 'measure-distance'
  | 'measure-polyline'
  | 'measure-area'
  | 'measure-perimeter'
  | 'measure-angle'
  | 'measure-count'
  | 'measure-volume'
  | 'image'
  | 'cut'
  | 'rotate'
  | 'hatch'
  | 'trim-fence'
  | 'arc'
  | 'pin'
  | 'inspection-task'
  | 'text-leader'
  | 'bim-capture'
  | 'cad-layer'
  | 'cad-layer-chunk';

export type MeasurementUnit = 'in' | 'ft' | 'cm' | 'm' | 'mm';

export interface Point {
  x: number;
  y: number;
}

export interface AnnotationStyle {
  stroke: string;
  strokeWidth: number;
  fill: string;
  opacity: number;
  fontSize?: number;
  fontFamily?: string;
}

export type BIMType = 'door' | 'wall' | 'supplier' | 'fire-rating';

export interface BIMData {
  type: BIMType;
  aiGenerated: boolean;
  // Door-specific fields
  doorType?: string;
  doorWidth?: string;
  doorHeight?: string;
  doorMaterial?: string;
  doorFireRating?: string;
  doorManufacturer?: string;
  // Wall-specific fields
  wallType?: string;
  wallThickness?: string;
  wallHeight?: string;
  wallMaterial?: string;
  wallInsulation?: string;
  wallFireRating?: string;
  // Supplier-specific fields
  supplierName?: string;
  supplierContact?: string;
  supplierCategory?: string;
  // Fire Rating-specific fields
  fireRatingValue?: string;
  assemblyType?: string;
  testedAssembly?: string;
  // Common fields
  notes?: string;
  images?: string[];
}

export interface BIMDialogData {
  doorType?: string;
  doorWidth?: string;
  doorHeight?: string;
  doorMaterial?: string;
  doorFireRating?: string;
  doorManufacturer?: string;
  wallType?: string;
  wallThickness?: string;
  wallHeight?: string;
  wallMaterial?: string;
  wallInsulation?: string;
  wallFireRating?: string;
  supplierName?: string;
  supplierContact?: string;
  supplierCategory?: string;
  fireRatingValue?: string;
  assemblyType?: string;
  testedAssembly?: string;
  notes?: string;
  images?: string[];
}

export interface ChecklistItem {
  id: string;
  text: string;
  isChecked: boolean;
}

export interface PinContent {
  name?: string;
  text?: string;
  images?: string[]; // base64 data URLs for images
  // Task-specific fields for inspection-task type
  status?: 'Open' | 'In Progress' | 'Complete' | 'Verified';
  priority?: 'Low' | 'Medium' | 'High';
  assignee?: string;
  category?: string;
  gps?: { lat: number; lng: number };
  checklists?: ChecklistItem[];
}

export interface Annotation {
  id: string;
  type: ToolType;
  pageIndex: number;
  points: Point[];
  text?: string;
  style: AnnotationStyle;
  width?: number;
  height?: number;
  radius?: number;
  rotation?: number;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
  locked?: boolean;
  imageData?: string; // base64 data URL for pasted images
  // Plan review specific fields
  engineering_justification?: string;
  cad_directive?: string;
  layerOrder: number;
  pinContent?: PinContent; // content for location pins
  bimContent?: BIMData; // content for BIM capture annotations
  lines?: { points: Point[] }[]; // For cad-layer: array of polylines (each polyline is an object with points array)
  chunkIds?: string[]; // For cad-layer manifest: IDs of chunk annotations that hold the actual line data
  // Text formatting fields
  align?: 'left' | 'center' | 'right';
  lineHeight?: number;
}

export interface Measurement {
  id: string;
  type: 'distance' | 'area' | 'perimeter' | 'angle' | 'count' | 'volume';
  annotationId: string;
  pageIndex: number;
  points: Point[];
  value: number;
  unit: MeasurementUnit;
  heightInput?: number;
  label?: string;
  createdBy: string;
  createdAt: number;
  updatedAt: number;
}

export interface CalibrationSettings {
  pageIndex: number;
  referencePixelLength: number;
  realWorldValue: number;
  unit: MeasurementUnit;
  scaleX: number;
  scaleY: number;
}

export interface ToolPreset {
  id: string;
  name: string;
  type: ToolType;
  style: AnnotationStyle;
  userId: string;
}

export interface PDFDocument {
  id: string;
  name: string;
  storageUrl: string;
  pageCount: number;
  ownerId: string;
  sharedWith: Record<string, 'view' | 'edit'>;
  shareLink?: string;
  createdAt: number;
  updatedAt: number;
}

export interface UserPresence {
  userId: string;
  displayName: string;
  color: string;
  currentPage: number;
  cursorPosition?: Point;
  lastActive: number;
}

export interface UndoAction {
  type: 'add' | 'update' | 'delete' | 'pdf-edit' | 'batch-add';
  annotation?: Annotation;
  annotations?: Annotation[];
  previousState?: Annotation;
  previousPdfData?: ArrayBuffer | null;
}

export interface Bookmark {
  id: string;
  pageIndex: number;
  name: string;
  createdAt: number;
}

export interface PdfTab {
  id: string;
  name: string;
  pdfData: ArrayBuffer;
  pageCount: number;
  currentPage: number;
  annotations: Annotation[];
  measurements: Measurement[];
  calibrations: Record<number, CalibrationSettings>;
  bookmarks: Bookmark[];
  isWelcome?: boolean; // Special tab for welcome/features page
  fileHandle?: FileSystemFileHandle; // File handle for saving this specific tab
  documentId?: string; // SHA-256 hash of PDF for annotation storage
}

export interface PageClipboard {
  type: 'cut' | 'copy';
  pageIndices: number[];
}
