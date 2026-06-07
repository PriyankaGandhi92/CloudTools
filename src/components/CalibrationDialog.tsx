import React, { useState } from 'react';
import { useStore } from '../store/useStore';
import type { MeasurementUnit } from '../types';
import { pixelDistance } from '../utils/measurement';

type CalibrationStep = 'confirm' | 'input';

export default function CalibrationDialog() {
  const {
    calibrationPoints,
    setCalibrationPoints,
    setIsCalibrating,
    setCalibration,
    currentPage,
    measurementUnit,
  } = useStore();

  const [step, setStep] = useState<CalibrationStep>(
    calibrationPoints.length === 2 ? 'confirm' : 'input'
  );
  const [realValue, setRealValue] = useState('');
  const [unit, setUnit] = useState<MeasurementUnit>(measurementUnit);
  const [nonUniform, setNonUniform] = useState(false);
  const [realValueY, setRealValueY] = useState('');

  const units: MeasurementUnit[] = ['in', 'ft', 'cm', 'm', 'mm'];

  const hasPoints = calibrationPoints.length === 2;
  const pxLen = hasPoints
    ? pixelDistance(calibrationPoints[0], calibrationPoints[1])
    : 0;

  // Don't show dialog until points are picked
  if (!hasPoints) return null;

  const handleApply = () => {
    const val = parseFloat(realValue);
    if (!val || !hasPoints) return;

    const dx = Math.abs(calibrationPoints[1].x - calibrationPoints[0].x);
    const dy = Math.abs(calibrationPoints[1].y - calibrationPoints[0].y);

    let scaleX: number;
    let scaleY: number;

    if (nonUniform && realValueY) {
      const valY = parseFloat(realValueY);
      scaleX = dx > 0 ? val / dx : val / pxLen;
      scaleY = dy > 0 ? valY / dy : valY / pxLen;
    } else {
      const uniformScale = val / pxLen;
      scaleX = uniformScale;
      scaleY = uniformScale;
    }

    setCalibration(currentPage, {
      pageIndex: currentPage,
      referencePixelLength: pxLen,
      realWorldValue: val,
      unit,
      scaleX,
      scaleY,
    });

    setIsCalibrating(false);
    setCalibrationPoints([]);
  };

  const handleCancel = () => {
    setIsCalibrating(false);
    setCalibrationPoints([]);
  };

  const handleResetPoints = () => {
    setCalibrationPoints([]);
  };

  // Step 1: confirm points — shows the line info and asks to proceed
  if (step === 'confirm') {
    return (
      <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
        <div className="bg-bb-sidebar rounded-lg border border-bb-border p-6 w-96 shadow-2xl pointer-events-auto">
          <h3 className="text-sm font-semibold mb-3">Confirm Reference Line</h3>

          <div className="bg-bb-panel rounded-lg p-3 mb-4 border border-bb-border">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-bb-muted">Point A:</span>
              <span className="font-mono text-bb-text">
                ({calibrationPoints[0]?.x.toFixed(0)}, {calibrationPoints[0]?.y.toFixed(0)})
              </span>
            </div>
            <div className="flex justify-between text-xs mb-1">
              <span className="text-bb-muted">Point B:</span>
              <span className="font-mono text-bb-text">
                ({calibrationPoints[1]?.x.toFixed(0)}, {calibrationPoints[1]?.y.toFixed(0)})
              </span>
            </div>
            <div className="w-full h-px bg-bb-border my-2" />
            <div className="flex justify-between text-xs">
              <span className="text-bb-muted">Pixel distance:</span>
              <span className="font-mono text-orange-400 font-semibold">{pxLen.toFixed(1)} px</span>
            </div>
          </div>

          <p className="text-[11px] text-bb-muted mb-4">
            An orange dashed line is shown on the canvas between these two points. 
            Confirm these are the correct endpoints, or re-pick.
          </p>

          <div className="flex justify-between">
            <button
              onClick={handleResetPoints}
              className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
            >
              Re-pick Points
            </button>
            <div className="flex gap-2">
              <button
                onClick={handleCancel}
                className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => setStep('input')}
                className="px-4 py-1.5 text-xs bg-bb-blue hover:bg-blue-600 text-white rounded transition-colors"
              >
                Confirm &amp; Set Scale
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Step 2: input real-world value
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-bb-sidebar rounded-lg border border-bb-border p-6 w-96 shadow-2xl">
        <h3 className="text-sm font-semibold mb-4">Set Calibration Scale</h3>

        <div className="space-y-3">
          <div className="text-xs text-bb-muted">
            Pixel distance: <span className="text-bb-text font-mono">{pxLen.toFixed(1)} px</span>
          </div>

          <div>
            <label className="text-xs text-bb-muted block mb-1">
              Real-world distance (X / uniform):
            </label>
            <div className="flex gap-2">
              <input
                type="number"
                value={realValue}
                onChange={(e) => setRealValue(e.target.value)}
                placeholder="e.g. 12"
                className="flex-1 bg-bb-panel border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text outline-none focus:border-bb-blue"
                autoFocus
              />
              <select
                value={unit}
                onChange={(e) => setUnit(e.target.value as MeasurementUnit)}
                className="bg-bb-panel border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text"
              >
                {units.map((u) => (
                  <option key={u} value={u}>{u}</option>
                ))}
              </select>
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-bb-muted cursor-pointer">
            <input
              type="checkbox"
              checked={nonUniform}
              onChange={(e) => setNonUniform(e.target.checked)}
              className="accent-bb-blue"
            />
            Non-uniform scaling (separate X/Y)
          </label>

          {nonUniform && (
            <div>
              <label className="text-xs text-bb-muted block mb-1">
                Real-world distance Y:
              </label>
              <input
                type="number"
                value={realValueY}
                onChange={(e) => setRealValueY(e.target.value)}
                placeholder="e.g. 12"
                className="w-full bg-bb-panel border border-bb-border rounded px-2 py-1.5 text-xs text-bb-text outline-none focus:border-bb-blue"
              />
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 mt-5">
          <button
            onClick={() => setStep('confirm')}
            className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
          >
            Back
          </button>
          <button
            onClick={handleCancel}
            className="px-3 py-1.5 text-xs bg-bb-hover hover:bg-bb-border rounded transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            disabled={!realValue}
            className="px-4 py-1.5 text-xs bg-bb-blue hover:bg-blue-600 text-white rounded transition-colors disabled:opacity-40"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );
}
