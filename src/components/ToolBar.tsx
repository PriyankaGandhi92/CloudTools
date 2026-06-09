import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { useStore } from '../store/useStore';
import type { ToolType } from '../types';
import type { BIMType } from '../types';
import {
  MousePointer2,
  Hand,
  Type,
  ArrowRight,
  Minus,
  Square,
  Circle,
  Cloud,
  Pencil,
  Highlighter,
  Ruler,
  Move3D,
  Triangle,
  Waypoints,
  Hash,
  Box,
  Scaling,
  CheckCircle,
  XCircle,
  Spline,
  FileEdit,
  Eraser,
  Columns2,
  TextCursorInput,
  Scissors,
  RotateCw,
  MapPin,
  MessageSquare,
  Droplets,
  Building2,
  DoorOpen,
  LayoutGrid,
  Building,
  Shield,
  ChevronDown,
  FormInput,
  ListChecks,
  Magnet,
} from 'lucide-react';

interface ToolDef {
  type: ToolType;
  icon: React.ReactNode;
  label: string;
  group: string;
  shortcut?: string;
}

const tools: ToolDef[] = [
  { type: 'select', icon: <MousePointer2 size={16} />, label: 'Select', group: 'general', shortcut: 'Esc' },
  { type: 'text-select', icon: <TextCursorInput size={16} />, label: 'Select Text / Copy', group: 'general' },
  { type: 'pan', icon: <Hand size={16} />, label: 'Pan', group: 'general', shortcut: 'Space' },
  { type: 'cut', icon: <Scissors size={16} />, label: 'Cut or Overlay (Ctrl+G then Ctrl+V)', group: 'general' },
  { type: 'rotate', icon: <RotateCw size={16} />, label: 'Rotate (Select + [ / ])', group: 'general' },
  { type: 'inspection-task', icon: <ListChecks size={16} />, label: 'Inspection Task', group: 'general', shortcut: 'I' },
  { type: 'text', icon: <Type size={16} />, label: 'Text', group: 'markup', shortcut: 'T' },
  { type: 'text-leader', icon: <MessageSquare size={16} />, label: 'Text with Leader', group: 'markup', shortcut: 'Shift+T' },
  { type: 'pdf-text-edit', icon: <FileEdit size={16} />, label: 'Edit Existing Text', group: 'markup' },
  { type: 'eraser-box', icon: <Eraser size={16} />, label: 'Eraser', group: 'markup', shortcut: 'E' },
  { type: 'arrow', icon: <ArrowRight size={16} />, label: 'Arrow', group: 'markup', shortcut: 'A' },
  { type: 'line', icon: <Minus size={16} />, label: 'Line', group: 'markup', shortcut: 'L' },
  { type: 'rectangle', icon: <Square size={16} />, label: 'Rectangle', group: 'markup', shortcut: 'R' },
  { type: 'circle', icon: <Circle size={16} />, label: 'Circle', group: 'markup', shortcut: 'O' },
  { type: 'cloud', icon: <Cloud size={16} />, label: 'Cloud', group: 'markup', shortcut: 'C' },
  { type: 'freehand', icon: <Pencil size={16} />, label: 'Freehand', group: 'markup', shortcut: 'F' },
  { type: 'highlight', icon: <Highlighter size={16} />, label: 'Highlight', group: 'markup', shortcut: 'H' },
  { type: 'stamp-check', icon: <CheckCircle size={16} />, label: 'Green Check', group: 'markup' },
  { type: 'stamp-x', icon: <XCircle size={16} />, label: 'Black X', group: 'markup' },
  { type: 'calibrate', icon: <Scaling size={16} />, label: 'Calibrate', group: 'measure', shortcut: 'K' },
  { type: 'measure-distance', icon: <Ruler size={16} />, label: 'Distance', group: 'measure', shortcut: 'D' },
  { type: 'measure-polyline', icon: <Spline size={16} />, label: 'Polyline', group: 'measure' },
  { type: 'measure-area', icon: <Move3D size={16} />, label: 'Area', group: 'measure', shortcut: 'Q' },
  { type: 'measure-perimeter', icon: <Waypoints size={16} />, label: 'Perimeter', group: 'measure' },
  { type: 'measure-angle', icon: <Triangle size={16} />, label: 'Angle', group: 'measure', shortcut: 'G' },
  { type: 'measure-count', icon: <Hash size={16} />, label: 'Count', group: 'measure', shortcut: 'N' },
  { type: 'measure-volume', icon: <Box size={16} />, label: 'Volume', group: 'measure' },
];

const getTourAttribute = (type: ToolType): string => {
  const tourMap: Partial<Record<ToolType, string>> = {
    'text': 'text-tool',
    'highlight': 'highlight',
    'line': 'draw-tools',
    'rectangle': 'draw-tools',
    'circle': 'draw-tools',
    'cloud': 'draw-tools',
    'freehand': 'draw-tools',
    'measure-distance': 'measure-distance',
    'measure-area': 'measure-area',
    'calibrate': 'calibrate',
    'bim-capture': 'bim-capture',
    'pin': 'pin',
  };
  return tourMap[type] || '';
};

export default function ToolBar({ onWatermarkClick }: { onWatermarkClick?: () => void } = {}) {
  const { activeTool, setActiveTool, activeStyle, setActiveStyle, setIsCalibrating, splitView, setSplitView, setSplitTabId, cutMode, setCutMode, cutColor, setCutColor, setSelectedBimType, formEditMode, toggleFormEditMode, smartTraceEnabled, toggleSmartTrace, cadCommandLineOpen } = useStore();
  const [bimDropdownOpen, setBimDropdownOpen] = useState(false);
  const buttonRef = React.useRef<HTMLButtonElement>(null);
  const [dropdownPosition, setDropdownPosition] = React.useState<{ top: number; left: number }>({ top: 0, left: 0 });

  // Keyboard shortcuts for tools
  React.useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Don't trigger shortcuts if user is typing in an input field
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) {
        return;
      }
      // Don't trigger shortcuts if CAD command line is open
      if (cadCommandLineOpen) {
        return;
      }

      const key = e.key.toLowerCase();
      const shortcutMap: Record<string, ToolType> = {
        'escape': 'select',
        ' ': 'pan',
        'i': 'inspection-task',
        't': 'text',
        'e': 'eraser-box',
        'a': 'arrow',
        'l': 'line',
        'r': 'rectangle',
        'o': 'circle',
        'c': 'cloud',
        'f': 'freehand',
        'h': 'highlight',
        'k': 'calibrate',
        'd': 'measure-distance',
        'q': 'measure-area',
        'g': 'measure-angle',
        'n': 'measure-count',
      };

      // Handle Shift+T for text-leader
      if (e.shiftKey && key === 't') {
        e.preventDefault();
        handleToolClick('text-leader');
        return;
      }

      // Handle Ctrl+F10 for Form Edit Mode
      if (e.ctrlKey && key === 'f10') {
        e.preventDefault();
        toggleFormEditMode();
        return;
      }

      if (shortcutMap[key]) {
        e.preventDefault();
        handleToolClick(shortcutMap[key]);
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [cadCommandLineOpen]);

  const handleToolClick = (type: ToolType) => {
    if (type === 'bim-capture') {
      setBimDropdownOpen(!bimDropdownOpen);
      if (buttonRef.current && !bimDropdownOpen) {
        const rect = buttonRef.current.getBoundingClientRect();
        setDropdownPosition({ top: rect.bottom + 4, left: rect.left });
      }
    }
    setActiveTool(type);
    if (type === 'calibrate') {
      setIsCalibrating(true);
    }
  };

  const handleBimTypeSelect = (bimType: BIMType) => {
    setSelectedBimType(bimType);
    setBimDropdownOpen(false);
    setActiveTool('bim-capture');
  };

  const groups = [
    { key: 'general', label: null },
    { key: 'markup', label: null },
    { key: 'measure', label: null },
  ];

  return (
    <div className="h-10 bg-bb-panel border-b border-bb-border flex items-center px-2 gap-0.5 shrink-0 overflow-x-auto scrollbar-thin">
      {groups.map((group, gi) => (
        <React.Fragment key={group.key}>
          {gi > 0 && <div className="w-px h-6 bg-bb-border mx-1 shrink-0" />}
          <div className="flex gap-0.5 shrink-0">
            {tools
              .filter((t) => t.group === group.key)
              .map((tool) => (
                <button
                  key={tool.type}
                  ref={tool.type === 'bim-capture' ? buttonRef : undefined}
                  onClick={(e) => {
                    if (tool.type === 'rotate') {
                      const { selectedAnnotationId, annotations, updateAnnotation, pushUndo } = useStore.getState();
                      const ann = annotations.find((a) => a.id === selectedAnnotationId);
                      if (ann) {
                        const shiftHeld = e.shiftKey;
                        const delta = shiftHeld ? -1 : 1;
                        const newRotation = (((ann.rotation || 0) + delta) % 360 + 360) % 360;
                        
                        const prev = { ...ann };
                        updateAnnotation(ann.id, { rotation: newRotation, updatedAt: Date.now() });
                        pushUndo({ type: 'update', annotation: { ...ann, rotation: newRotation }, previousState: prev });
                        return;
                      }
                    }
                    handleToolClick(tool.type);
                  }}
                  className={`p-1.5 rounded transition-colors shrink-0 ${
                    activeTool === tool.type
                      ? 'bg-bb-blue text-white'
                      : 'text-bb-muted hover:bg-bb-hover hover:text-bb-text'
                  }`}
                  title={tool.shortcut ? `${tool.label} (${tool.shortcut})` : tool.label}
                  data-tour={getTourAttribute(tool.type)}
                >
                  {tool.icon}
                </button>
              ))}
          </div>
        </React.Fragment>
      ))}

      {/* BIM Capture dropdown */}
      {bimDropdownOpen && ReactDOM.createPortal(
        <div
          className="fixed bg-white border border-gray-300 rounded-lg shadow-2xl py-2 z-[99999] min-w-[200px]"
          style={{ top: `${dropdownPosition.top}px`, left: `${dropdownPosition.left}px` }}
        >
          <div className="px-3 py-2 text-sm font-semibold text-gray-900 border-b border-gray-300 mb-2">
            Select BIM Type
          </div>
          <button
            onClick={() => handleBimTypeSelect('door')}
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 text-left transition-colors"
          >
            <DoorOpen size={20} className="text-blue-600" />
            <div>
              <div className="text-sm font-medium text-gray-900">Door</div>
              <div className="text-xs text-gray-600">Door</div>
            </div>
          </button>
          <button
            onClick={() => handleBimTypeSelect('wall')}
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 text-left transition-colors"
          >
            <LayoutGrid size={20} className="text-blue-600" />
            <div>
              <div className="text-sm font-medium text-gray-900">Wall</div>
              <div className="text-xs text-gray-600">Wall with parametric data</div>
            </div>
          </button>
          <button
            onClick={() => handleBimTypeSelect('supplier')}
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 text-left transition-colors"
          >
            <Building size={20} className="text-blue-600" />
            <div>
              <div className="text-sm font-medium text-gray-900">Supplier</div>
              <div className="text-xs text-gray-600">Supplier information</div>
            </div>
          </button>
          <button
            onClick={() => handleBimTypeSelect('fire-rating')}
            className="w-full px-3 py-2 flex items-center gap-3 hover:bg-gray-100 text-left transition-colors"
          >
            <Shield size={20} className="text-blue-600" />
            <div>
              <div className="text-sm font-medium text-gray-900">Fire Rating</div>
              <div className="text-xs text-gray-600">Fire rating</div>
            </div>
          </button>
        </div>,
        document.body
      )}

      <div className="w-px h-6 bg-bb-border mx-1 shrink-0" />

      {/* Form Edit Mode Toggle */}
      <button
        onClick={toggleFormEditMode}
        className={`p-1.5 rounded transition-colors shrink-0 ${
          formEditMode
            ? 'bg-green-600 text-white'
            : 'text-bb-muted hover:bg-bb-hover hover:text-bb-text'
        }`}
        title="Form Edit Mode (Ctrl+F10)"
      >
        <FormInput size={16} />
      </button>

      {/* Smart Ortho Trace Toggle */}
      <button
        onClick={toggleSmartTrace}
        className={`p-1.5 rounded transition-colors shrink-0 ${
          smartTraceEnabled
            ? 'bg-bb-blue text-white'
            : 'text-bb-muted hover:bg-bb-hover hover:text-bb-text'
        }`}
        title="Smart Ortho Snap (Straightens Lines)"
      >
        <Magnet size={16} />
      </button>

      <div className="w-px h-6 bg-bb-border mx-1 shrink-0" />

      <div className="flex items-center gap-2 ml-2 shrink-0">
        <label className="flex items-center gap-1 text-xs text-bb-muted shrink-0">
          <span>Font</span>
          <select
            value={activeStyle.fontFamily || 'Arial'}
            onChange={(e) => setActiveStyle({ fontFamily: e.target.value })}
            className="bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
          >
            <option value="Arial">Arial</option>
            <option value="Helvetica">Helvetica</option>
            <option value="Times New Roman">Times New Roman</option>
            <option value="Courier New">Courier New</option>
            <option value="Calibri">Calibri</option>
            <option value="Verdana">Verdana</option>
            <option value="Tahoma">Tahoma</option>
            <option value="Georgia">Georgia</option>
            <option value="Roboto">Roboto</option>
            <option value="Open Sans">Open Sans</option>
            <option value="Lato">Lato</option>
            <option value="Inter">Inter</option>
            <option value="JetBrains Mono">JetBrains Mono</option>
            <option value="Source Sans Pro">Source Sans Pro</option>
            <option value="Noto Sans">Noto Sans</option>
          </select>
        </label>
        <label className="flex items-center gap-1 text-xs text-bb-muted shrink-0">
          <span>Color</span>
          <input
            type="color"
            value={activeStyle.stroke}
            onChange={(e) => setActiveStyle({ stroke: e.target.value })}
            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-bb-muted">
          <span>Fill</span>
          <input
            type="color"
            value={activeStyle.fill === 'transparent' ? '#000000' : activeStyle.fill}
            onChange={(e) => setActiveStyle({ fill: e.target.value })}
            className="w-6 h-6 rounded cursor-pointer border-0 bg-transparent"
          />
        </label>
        <label className="flex items-center gap-1 text-xs text-bb-muted shrink-0">
          <span>Width</span>
          <input
            type="range"
            min={0}
            max={10}
            value={activeStyle.strokeWidth}
            onChange={(e) => setActiveStyle({ strokeWidth: Number(e.target.value) })}
            className="w-16 h-1 accent-bb-blue"
          />
          <span className="w-4 text-center">{activeStyle.strokeWidth}</span>
        </label>
        <label className="flex items-center gap-1 text-xs text-bb-muted shrink-0">
          <span>Opacity</span>
          <input
            type="range"
            min={0.1}
            max={1}
            step={0.1}
            value={activeStyle.opacity}
            onChange={(e) => setActiveStyle({ opacity: Number(e.target.value) })}
            className="w-14 h-1 accent-bb-blue"
          />
        </label>
      </div>

      {/* Cut tool options */}
      {activeTool === 'cut' && (
        <div className="flex items-center gap-2 ml-2 shrink-0">
          <label className="flex items-center gap-1 text-xs text-bb-muted shrink-0">
            <span>Mode</span>
            <select
              value={cutMode}
              onChange={(e) => setCutMode(e.target.value as 'rect' | 'polygon')}
              className="bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
            >
              <option value="rect">Rectangle</option>
              <option value="polygon">Polygon</option>
            </select>
          </label>
          <label className="flex items-center gap-1 text-xs text-bb-muted shrink-0">
            <span>Erase Color</span>
            <select
              value={cutColor || 'white'}
              onChange={(e) => setCutColor(e.target.value === 'none' ? null : e.target.value)}
              className="bg-bb-dark border border-bb-border rounded px-2 py-1 text-xs text-bb-text outline-none focus:border-bb-blue"
            >
              <option value="none">No Color</option>
              <option value="#ffffff">White</option>
              <option value="#000000">Black</option>
              <option value="#ff0000">Red</option>
              <option value="#00ff00">Green</option>
              <option value="#0000ff">Blue</option>
            </select>
          </label>
        </div>
      )}

      <div className="w-px h-6 bg-bb-border mx-1 shrink-0" />
      <button
        onClick={() => { setSplitTabId(null); setSplitView(!splitView); }}
        className={`p-1.5 rounded transition-colors shrink-0 ${splitView ? 'bg-bb-blue text-white' : 'text-bb-muted hover:bg-bb-hover hover:text-bb-text'}`}
        title="Vertical Split View"
      >
        <Columns2 size={16} />
      </button>
      {onWatermarkClick && (
        <>
          <div className="w-px h-6 bg-bb-border mx-1 shrink-0" />
          <button
            onClick={onWatermarkClick}
            className={`p-1.5 rounded transition-colors shrink-0 text-bb-muted hover:bg-bb-hover hover:text-bb-text`}
            title="Watermarks"
          >
            <Droplets size={16} />
          </button>
        </>
      )}
    </div>
  );
}
