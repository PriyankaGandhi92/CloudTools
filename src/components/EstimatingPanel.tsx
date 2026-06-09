import React, { useState, useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import { Calculator, AlertCircle } from 'lucide-react';

export default function EstimatingPanel() {
  const { annotations, cadSelectedIds } = useStore();
  const [netArea, setNetArea] = useState<number | null>(null);
  const [error, setError] = useState<string>('');

  const handleCalculateArea = useCallback(async () => {
    setError('');
    setNetArea(null);

    if (cadSelectedIds.length < 1) {
      setError("Please select at least 1 shape.");
      return;
    }

    try {
      // Calculate total area of all selected shapes
      let totalArea = 0;
      
      for (const id of cadSelectedIds) {
        const ann = annotations.find(a => a.id === id);
        if (!ann) continue;
        
        if (ann.type === 'rectangle') {
          const width = ann.width || Math.abs(ann.points[1].x - ann.points[0].x);
          const height = ann.height || Math.abs(ann.points[1].y - ann.points[0].y);
          totalArea += width * height;
        } else if (ann.type === 'circle') {
          const radius = ann.radius || Math.sqrt(
            Math.pow(ann.points[1].x - ann.points[0].x, 2) + 
            Math.pow(ann.points[1].y - ann.points[0].y, 2)
          ) / 2;
          totalArea += Math.PI * radius * radius;
        } else {
          throw new Error(`Unsupported shape type: ${ann.type}`);
        }
      }
      
      setNetArea(totalArea);

    } catch (err: any) {
      setError(err.message || "Failed to calculate area.");
    }
  }, [cadSelectedIds, annotations]);

  // Auto-calculate when shapes are selected
  useEffect(() => {
    if (cadSelectedIds.length > 0) {
      handleCalculateArea();
    } else {
      setNetArea(null);
      setError('');
    }
  }, [cadSelectedIds, handleCalculateArea]);

  // Only show this panel if they have shapes selected
  // TEMP: Always show for testing
  // if (cadSelectedIds.length === 0) return null;

  return (
    <div className="bg-bb-dark border border-bb-border rounded-lg p-4 mt-4 shadow-lg">
      <h3 className="text-sm font-bold text-white mb-2 flex items-center gap-2">
        <Calculator size={16} className="text-bb-blue" />
        Material Takeoff (Estimator)
      </h3>
      
      <p className="text-xs text-bb-muted mb-4 leading-relaxed">
        Select shapes (rectangles, circles) to calculate total area. Click Calculate to compute.
      </p>

      {cadSelectedIds.length < 1 ? (
        <div className="flex items-center gap-2 text-xs text-yellow-500 bg-yellow-500/10 p-2 rounded">
          <AlertCircle size={14} /> Select at least 1 shape.
        </div>
      ) : (
        <button
          onClick={handleCalculateArea}
          className="w-full py-2 bg-bb-blue hover:bg-blue-600 text-white text-xs font-bold rounded transition-colors"
        >
          Calculate Total Area ({cadSelectedIds.length} shape{cadSelectedIds.length !== 1 ? 's' : ''})
        </button>
      )}

      {error && <p className="text-xs text-red-400 mt-2">{error}</p>}

      {netArea !== null && (
        <div className="mt-4 p-3 bg-bb-panel border border-bb-border rounded">
          <p className="text-[10px] text-bb-muted uppercase tracking-wider">Net Result (Raw Pixels)</p>
          <p className="text-2xl font-mono text-green-400 font-bold">{Math.round(netArea).toLocaleString()} px²</p>
          <p className="text-[10px] text-bb-muted mt-1">*Multiply by your calibrated scale factor for real-world SQFT.</p>
        </div>
      )}
    </div>
  );
}
