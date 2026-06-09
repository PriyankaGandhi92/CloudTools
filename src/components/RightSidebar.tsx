import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { ToolPreset, MeasurementUnit } from '../types';
import {
  Save,
  Trash2,
  Palette,
  Ruler,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import { formatMeasurement } from '../utils/measurement';
import EstimatingPanel from './EstimatingPanel';

export default function RightSidebar() {
  const {
    toolPresets,
    addToolPreset,
    removeToolPreset,
    activeTool,
    activeStyle,
    setActiveTool,
    setActiveStyle,
    measurements,
    currentPage,
    calibrations,
    measurementUnit,
    setMeasurementUnit,
    countMarkers,
  } = useStore();

  const [presetsOpen, setPresetsOpen] = useState(true);
  const [measureOpen, setMeasureOpen] = useState(true);
  const [calibOpen, setCalibOpen] = useState(true);

  const pageMeasurements = measurements.filter((m) => m.pageIndex === currentPage);
  const currentCal = calibrations[currentPage];

  const handleSavePreset = () => {
    const name = prompt('Preset name:');
    if (!name) return;
    const preset: ToolPreset = {
      id: crypto.randomUUID(),
      name,
      type: activeTool,
      style: { ...activeStyle },
      userId: 'local',
    };
    addToolPreset(preset);
  };

  const handleApplyPreset = (p: ToolPreset) => {
    setActiveTool(p.type);
    setActiveStyle(p.style);
  };

  const units: MeasurementUnit[] = ['in', 'ft', 'cm', 'm', 'mm'];

  return (
    <div className="w-64 bg-bb-sidebar border-l border-bb-border flex flex-col shrink-0 overflow-y-auto">
      {/* Tool Chest / Presets */}
      <div className="border-b border-bb-border">
        <button
          onClick={() => setPresetsOpen(!presetsOpen)}
          className="w-full px-3 py-2 flex items-center gap-2 text-xs font-semibold text-bb-muted uppercase tracking-wider hover:bg-bb-hover"
        >
          {presetsOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Palette size={12} />
          Tool Chest
        </button>
        {presetsOpen && (
          <div className="px-3 pb-3">
            <button
              onClick={handleSavePreset}
              className="w-full flex items-center justify-center gap-1.5 px-2 py-1.5 bg-bb-hover hover:bg-bb-blue text-xs rounded transition-colors mb-2"
            >
              <Save size={12} />
              Save Current Style
            </button>
            {toolPresets.length === 0 ? (
              <p className="text-[10px] text-bb-muted text-center">
                No saved presets
              </p>
            ) : (
              <div className="space-y-1">
                {toolPresets.map((p) => (
                  <div
                    key={p.id}
                    className="flex items-center gap-2 px-2 py-1.5 rounded bg-bb-panel hover:bg-bb-hover cursor-pointer group"
                    onClick={() => handleApplyPreset(p)}
                  >
                    <div
                      className="w-3 h-3 rounded-sm border border-bb-border"
                      style={{ backgroundColor: p.style.stroke }}
                    />
                    <span className="text-xs flex-1 truncate">{p.name}</span>
                    <span className="text-[9px] text-bb-muted">{p.type}</span>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        removeToolPreset(p.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-300"
                    >
                      <Trash2 size={11} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Calibration Info */}
      <div className="border-b border-bb-border">
        <button
          onClick={() => setCalibOpen(!calibOpen)}
          className="w-full px-3 py-2 flex items-center gap-2 text-xs font-semibold text-bb-muted uppercase tracking-wider hover:bg-bb-hover"
        >
          {calibOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          <Ruler size={12} />
          Calibration
        </button>
        {calibOpen && (
          <div className="px-3 pb-3">
            {currentCal ? (
              <div className="text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-bb-muted">Scale X:</span>
                  <span>{currentCal.scaleX.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-bb-muted">Scale Y:</span>
                  <span>{currentCal.scaleY.toFixed(4)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-bb-muted">Reference:</span>
                  <span>
                    {currentCal.realWorldValue} {currentCal.unit}
                  </span>
                </div>
              </div>
            ) : (
              <p className="text-[10px] text-bb-muted">
                Not calibrated. Use the Calibrate tool to set scale.
              </p>
            )}
            <div className="mt-2">
              <label className="text-[10px] text-bb-muted block mb-1">Unit:</label>
              <select
                value={measurementUnit}
                onChange={(e) => setMeasurementUnit(e.target.value as MeasurementUnit)}
                className="w-full bg-bb-panel border border-bb-border rounded px-2 py-1 text-xs text-bb-text"
              >
                {units.map((u) => (
                  <option key={u} value={u}>
                    {u}
                  </option>
                ))}
              </select>
            </div>
          </div>
        )}
      </div>

      {/* Measurements */}
      <div className="border-b border-bb-border">
        <button
          onClick={() => setMeasureOpen(!measureOpen)}
          className="w-full px-3 py-2 flex items-center gap-2 text-xs font-semibold text-bb-muted uppercase tracking-wider hover:bg-bb-hover"
        >
          {measureOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          Measurements ({pageMeasurements.length})
        </button>
        {measureOpen && (
          <div className="px-3 pb-3 space-y-1 max-h-60 overflow-y-auto">
            {pageMeasurements.length === 0 ? (
              <p className="text-[10px] text-bb-muted">No measurements on this page</p>
            ) : (
              pageMeasurements.map((m) => (
                <div
                  key={m.id}
                  className="flex justify-between items-center px-2 py-1 bg-bb-panel rounded text-xs"
                >
                  <span className="text-bb-muted capitalize">{m.type}</span>
                  <span className="font-mono">
                    {formatMeasurement(m.value, m.unit, m.type)}
                  </span>
                </div>
              ))
            )}
            {countMarkers.length > 0 && (
              <div className="flex justify-between items-center px-2 py-1 bg-bb-panel rounded text-xs">
                <span className="text-bb-muted">Count</span>
                <span className="font-mono">{countMarkers.length}</span>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Estimating Panel */}
      <EstimatingPanel />
    </div>
  );
}
