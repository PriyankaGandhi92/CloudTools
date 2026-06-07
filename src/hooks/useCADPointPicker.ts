import { useEffect, useCallback } from 'react';
import { useStore } from '../store/useStore';
import type { Annotation } from '../types';

/**
 * Hook to handle CAD command point picking
 * When a CAD command like LINE is active and points are collected in the store,
 * this hook creates the appropriate annotation when enough points are captured.
 */
export function useCADPointPicker(): {
  cadPendingCommand: string | null;
  cadPendingPoints: { x: number; y: number }[];
  cadCommandStep: number;
  completeCommand: () => void;
  completePolyline: () => void;
} {
  const {
    cadPendingCommand,
    cadPendingPoints,
    cadCommandStep,
    currentPage,
    activeStyle,
    annotations,
    addAnnotation,
    setCADPendingCommand,
    setCADPendingPoints,
    setCADCommandStep,
    pushUndo,
  } = useStore();

  const completeCommand = useCallback(() => {
    if (!cadPendingCommand || cadPendingPoints.length === 0) return;

    const now = Date.now();
    const baseAnnotation = {
      pageIndex: currentPage,
      style: activeStyle,
      createdBy: 'local',
      createdAt: now,
      updatedAt: now,
      layerOrder: annotations.length,
    };

    switch (cadPendingCommand.toUpperCase()) {
      case 'LINE':
      case 'L': {
        // Need at least 2 points for a line
        if (cadPendingPoints.length >= 2) {
          const ann: Annotation = {
            ...baseAnnotation,
            id: crypto.randomUUID(),
            type: 'line',
            points: [cadPendingPoints[0], cadPendingPoints[1]],
          };
          addAnnotation(ann);
          pushUndo({ type: 'add', annotation: ann });
          
          // Clear state after creating annotation
          setCADPendingCommand(null);
          setCADPendingPoints([]);
          setCADCommandStep(0);
          
          // Reset active tool to select
          useStore.getState().setActiveTool('select');
        }
        break;
      }

      case 'PLINE':
      case 'PL': {
        // Need at least 2 points for a polyline
        // Don't auto-complete - let user add more points until Enter/Escape
        if (cadPendingPoints.length >= 2) {
          // Keep adding points, don't complete yet
          // Command will be completed when user presses Enter/Escape
        }
        break;
      }

      case 'RECTANG':
      case 'REC': {
        // Need 2 points for rectangle (opposite corners)
        if (cadPendingPoints.length >= 2) {
          const p1 = cadPendingPoints[0];
          const p2 = cadPendingPoints[1];
          const ann: Annotation = {
            ...baseAnnotation,
            id: crypto.randomUUID(),
            type: 'rectangle',
            points: [p1],
            width: Math.abs(p2.x - p1.x),
            height: Math.abs(p2.y - p1.y),
          };
          addAnnotation(ann);
          pushUndo({ type: 'add', annotation: ann });
          
          setCADPendingCommand(null);
          setCADPendingPoints([]);
          setCADCommandStep(0);
          useStore.getState().setActiveTool('select');
        }
        break;
      }

      case 'ARC':
      case 'A': {
        // Need 3 points: start, midpoint, end
        if (cadPendingPoints.length >= 3) {
          const ann: Annotation = {
            ...baseAnnotation,
            id: crypto.randomUUID(),
            type: 'arc',
            points: [cadPendingPoints[0], cadPendingPoints[1], cadPendingPoints[2]],
          };
          addAnnotation(ann);
          pushUndo({ type: 'add', annotation: ann });
          
          setCADPendingCommand(null);
          setCADPendingPoints([]);
          setCADCommandStep(0);
          useStore.getState().setActiveTool('select');
        }
        break;
      }

      case 'CIRCLE':
      case 'C': {
        // Need 2 points: center and radius point
        if (cadPendingPoints.length >= 2) {
          const center = cadPendingPoints[0];
          const radiusPoint = cadPendingPoints[1];
          const radius = Math.sqrt(
            Math.pow(radiusPoint.x - center.x, 2) + Math.pow(radiusPoint.y - center.y, 2)
          );
          const ann: Annotation = {
            ...baseAnnotation,
            id: crypto.randomUUID(),
            type: 'circle',
            points: [center],
            radius,
          };
          addAnnotation(ann);
          pushUndo({ type: 'add', annotation: ann });
          
          setCADPendingCommand(null);
          setCADPendingPoints([]);
          setCADCommandStep(0);
          useStore.getState().setActiveTool('select');
        }
        break;
      }

      case 'MTEXT':
      case 'T':
      case 'MT': {
        // Need 1 point for text location
        if (cadPendingPoints.length >= 1) {
          const ann: Annotation = {
            ...baseAnnotation,
            id: crypto.randomUUID(),
            type: 'text',
            points: [cadPendingPoints[0]],
            text: 'Text', // Default text, user can edit later
          };
          addAnnotation(ann);
          pushUndo({ type: 'add', annotation: ann });
          
          setCADPendingCommand(null);
          setCADPendingPoints([]);
          setCADCommandStep(0);
          useStore.getState().setActiveTool('select');
        }
        break;
      }

      case 'ARROW':
      case 'AR': {
        // Need 2 points for an arrow
        if (cadPendingPoints.length >= 2) {
          const ann: Annotation = {
            ...baseAnnotation,
            id: crypto.randomUUID(),
            type: 'arrow',
            points: [cadPendingPoints[0], cadPendingPoints[1]],
          };
          addAnnotation(ann);
          pushUndo({ type: 'add', annotation: ann });
          
          setCADPendingCommand(null);
          setCADPendingPoints([]);
          setCADCommandStep(0);
          useStore.getState().setActiveTool('select');
        }
        break;
      }

      case 'DIST':
      case 'DI':
      case 'DIMLINEAR':
      case 'DLI':
      case 'DIMALIGNED':
      case 'DAL': {
        // Need 2 points for distance measurement
        if (cadPendingPoints.length >= 2) {
          const ann: Annotation = {
            ...baseAnnotation,
            id: crypto.randomUUID(),
            type: 'measure-distance',
            points: [cadPendingPoints[0], cadPendingPoints[1]],
          };
          addAnnotation(ann);
          pushUndo({ type: 'add', annotation: ann });
          
          setCADPendingCommand(null);
          setCADPendingPoints([]);
          setCADCommandStep(0);
          useStore.getState().setActiveTool('select');
        }
        break;
      }

      case 'ROTATE':
      case 'RO':
      case 'MOVE':
      case 'M':
      case 'COPY':
      case 'CO':
      case 'CP':
      case 'OFFSET':
      case 'O': {
        // These commands are handled separately in MainCanvas.tsx - don't auto-complete here
        break;
      }

      default:
        // Unknown command - do not clear state to avoid wiping multi-step commands
        break;
    }
  }, [
    cadPendingCommand,
    cadPendingPoints,
    currentPage,
    activeStyle,
    annotations.length,
    addAnnotation,
    setCADPendingCommand,
    setCADPendingPoints,
    setCADCommandStep,
    pushUndo,
  ]);

  // Check if we should complete the command when points change
  useEffect(() => {
    if (cadPendingCommand && cadPendingPoints.length > 0) {
      // Check if we have enough points for the current command
      const requiredPoints = getRequiredPoints(cadPendingCommand);
      if (cadPendingPoints.length >= requiredPoints) {
        completeCommand();
      }
    }
  }, [cadPendingPoints, cadPendingCommand, completeCommand]);

  // Manual completion for polyline (when user presses Enter/Escape)
  const completePolyline = useCallback(() => {
    if (cadPendingCommand && (cadPendingCommand.toUpperCase() === 'PLINE' || cadPendingCommand.toUpperCase() === 'PL')) {
      if (cadPendingPoints.length >= 2) {
        const now = Date.now();
        const ann: Annotation = {
          pageIndex: currentPage,
          style: activeStyle,
          createdBy: 'local',
          createdAt: now,
          updatedAt: now,
          layerOrder: annotations.length,
          id: crypto.randomUUID(),
          type: 'measure-polyline',
          points: [...cadPendingPoints],
        };
        addAnnotation(ann);
        pushUndo({ type: 'add', annotation: ann });
        
        setCADPendingCommand(null);
        setCADPendingPoints([]);
        setCADCommandStep(0);
        useStore.getState().setActiveTool('select');
      }
    }
  }, [cadPendingCommand, cadPendingPoints, currentPage, activeStyle, annotations.length, addAnnotation, setCADPendingCommand, setCADPendingPoints, setCADCommandStep, pushUndo]);

  return {
    cadPendingCommand,
    cadPendingPoints,
    cadCommandStep,
    completeCommand,
    completePolyline,
  };
}

function getRequiredPoints(command: string): number {
  switch (command.toUpperCase()) {
    case 'LINE':
    case 'L':
    case 'ARROW':
    case 'AR':
    case 'DIST':
    case 'DI':
    case 'DIMLINEAR':
    case 'DLI':
    case 'DIMALIGNED':
    case 'DAL':
    case 'RECTANG':
    case 'REC':
    case 'CIRCLE':
    case 'C':
      return 2;
    case 'ARC':
    case 'A':
      return 3;
    case 'PLINE':
    case 'PL':
      return 999; // Don't auto-complete, user must press Enter/Escape
    case 'MTEXT':
    case 'T':
    case 'MT':
    case 'PIN':
    case 'PI':
      return 1;
    case 'ROTATE':
    case 'RO':
    case 'MOVE':
    case 'M':
    case 'COPY':
    case 'CO':
    case 'CP':
    case 'OFFSET':
    case 'O':
      return 999; // Don't auto-complete, handled separately in MainCanvas.tsx
    default:
      return 1;
  }
}
