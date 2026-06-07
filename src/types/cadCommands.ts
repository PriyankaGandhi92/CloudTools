import type { ToolType } from './index';

/**
 * CAD Command System Types
 * AutoCAD-inspired command line interface for the PDF Editor
 */

export type CADCommandCategory =
  | 'draw'
  | 'modify'
  | 'annotate'
  | 'navigate'
  | 'cleanup'
  | 'property'
  | 'utility'
  | 'cloud';

export type CADCommandContext = {
  // Canvas/Viewer
  setActiveTool: (tool: ToolType) => void;
  setZoom: (zoom: number) => void;
  setPanOffset: (offset: { x: number; y: number }) => void;
  fitToScreen: () => void;
  regenerate: () => void;
  zoom: number;
  panOffset: { x: number; y: number };
  currentPage: number;

  // Annotations
  annotations: any[];
  selectedAnnotationId: string | null;
  selectedAnnotationIds: string[];
  setSelectedAnnotationId: (id: string | null) => void;
  updateAnnotation: (id: string, updates: any) => void;
  deleteAnnotation: (id: string) => void;
  addAnnotation: (annotation: any) => void;

  // Measurements
  measurements: any[];
  addMeasurement: (measurement: any) => void;

  // Style
  activeStyle: any;
  setActiveStyle: (style: any) => void;

  // UI
  showMessage: (message: string) => void;
  setPendingCommand: (cmd: PendingCADCommand | null) => void;
  setSignaturePadOpen: (open: boolean) => void;

  // Store integration for point picking
  setCADPendingCommand: (cmd: string | null) => void;
  setCADPendingPoints: (points: { x: number; y: number }[]) => void;
  clearCADPendingPoints: () => void;
  setCADCommandStep: (step: number) => void;
  cadPendingPoints: { x: number; y: number }[];

  // Selection mode for modify commands
  setCADSelectionMode: (mode: 'erase' | 'join' | 'explode' | 'copy' | 'move' | 'ddedit' | 'trim' | 'rotate' | null) => void;
  setCADSelectedIds: (ids: string[]) => void;
  addCADSelectedId: (id: string) => void;
  clearCADSelectedIds: () => void;
  cadSelectedIds: string[];
  pushUndo: (action: any) => void;

  // Zustand bridge for triggering CAD tool execution in MainCanvas
  triggerCADExecute: (command: 'COPY' | 'OFFSET' | 'FENCE_TRIM' | 'FENCE_EXTEND' | 'CONVERTTOCAD' | 'DXF' | 'ROTATE_TYPED' | 'MOVE_TYPED' | 'COPY_TYPED' | 'CIRCLE_TYPED', payload?: any) => void;
};

export type PendingCADCommand = {
  command: string;
  alias: string;
  step: number;
  data?: Record<string, any>;
};

export type CADCommand = {
  name: string;           // Full command name (e.g., "LINE")
  aliases: string[];      // Shortcuts (e.g., ["L"])
  category: CADCommandCategory;
  description: string;
  helpText?: string;      // Extended help shown during execution
  params?: string[];      // Expected parameters
  execute: (ctx: CADCommandContext, args?: string[]) => void | Promise<void>;
  isMultiStep?: boolean;  // Does this command require multiple steps?
  executeStep?: (        // For multi-step commands
    ctx: CADCommandContext,
    step: number,
    input: string,
    pendingData?: Record<string, any>
  ) => { complete: boolean; nextStep?: number; data?: Record<string, any> } | void;
};

// Command suggestion for autocomplete
export type CommandSuggestion = {
  alias: string;
  name: string;
  description: string;
  category: CADCommandCategory;
};

// Command history entry
export type CommandHistoryEntry = {
  command: string;
  timestamp: number;
  result?: 'success' | 'error' | 'cancelled';
  message?: string;
};
