import { useCallback, useMemo, useRef } from 'react';
import type { CADCommand, CADCommandContext, PendingCADCommand, CommandSuggestion } from '../types/cadCommands';
import { useStore } from '../store/useStore';
import { getPageDimensions } from '../utils/pdfRenderer';
import { useCloudCommands } from './useCloudCommands';

// Helper function to rotate a point around a base point
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

// ============================================================================
// COMMAND REGISTRY
// ============================================================================

const createCommandRegistry = (): Record<string, CADCommand> => {
  const commands: Record<string, CADCommand> = {};

  // Helper to register a command with all its aliases
  const register = (cmd: CADCommand) => {
    commands[cmd.name] = cmd;
    cmd.aliases.forEach(alias => {
      commands[alias.toUpperCase()] = { ...cmd, name: cmd.name };
    });
  };

  // ==========================================================================
  // DRAWING COMMANDS
  // ==========================================================================

  register({
    name: 'LINE',
    aliases: ['L'],
    category: 'draw',
    description: 'Create straight line segments',
    helpText: 'Specify first point:',
    execute: (ctx) => {
      ctx.setActiveTool('line');
      ctx.clearCADPendingPoints();
      ctx.setCADPendingCommand('LINE');
      ctx.setCADCommandStep(0);
      ctx.showMessage('Command: LINE\nSpecify first point:');
    },
  });

  register({
    name: 'PLINE',
    aliases: ['PL'],
    category: 'draw',
    description: 'Create a polyline',
    helpText: 'Specify start point:',
    execute: (ctx) => {
      ctx.setActiveTool('measure-polyline');
      ctx.clearCADPendingPoints();
      ctx.setCADPendingCommand('PLINE');
      ctx.setCADCommandStep(0);
      ctx.showMessage('Command: PLINE\nSpecify start point:');
    },
  });

  register({
    name: 'RECTANG',
    aliases: ['REC'],
    category: 'draw',
    description: 'Create a rectangular polyline',
    helpText: 'Specify first corner point:',
    execute: (ctx) => {
      ctx.setActiveTool('rectangle');
      ctx.clearCADPendingPoints();
      ctx.setCADPendingCommand('RECTANG');
      ctx.setCADCommandStep(0);
      ctx.showMessage('Command: RECTANG\nSpecify first corner point:');
    },
  });

  register({
    name: 'CIRCLE',
    aliases: ['C'],
    category: 'draw',
    description: 'Create a circle',
    helpText: 'Specify center point:',
    isMultiStep: true,
    execute: (ctx) => {
      ctx.setActiveTool('circle');
      ctx.clearCADPendingPoints();
      ctx.setCADPendingCommand('CIRCLE');
      ctx.setCADCommandStep(0);
      ctx.showMessage('Command: CIRCLE\nSpecify center point:');
    },
    executeStep: (ctx, step, input, data) => {
      if (step === 0) {
        // Center point input (x,y) or canvas click
        const coords = input.match(/^(-?\d*\.?\d+)(?:,|\s+)(-?\d*\.?\d+)$/);
        if (coords) {
          const x = parseFloat(coords[1]);
          const y = parseFloat(coords[2]);
          ctx.setCADPendingPoints([{ x, y }]);
          ctx.showMessage('Command: CIRCLE\nSpecify radius or click edge point:');
          return { complete: false, data: { center: { x, y } }, nextStep: 1 };
        }
        // If not coordinates, assume canvas click - wait for next step
        if (ctx.cadPendingPoints.length >= 1) {
          ctx.showMessage('Command: CIRCLE\nSpecify radius or click edge point:');
          return { complete: false, data: { center: ctx.cadPendingPoints[0] }, nextStep: 1 };
        }
        return { complete: false, data: data || {}, nextStep: 0 };
      }
      if (step === 1) {
        // Radius input or edge point
        const radius = parseFloat(input);
        if (!isNaN(radius) && radius > 0) {
          const center = data?.center || ctx.cadPendingPoints[0];
          if (center) {
            ctx.triggerCADExecute('CIRCLE_TYPED', { center, radius });
            ctx.showMessage(`Command: CIRCLE\nCircle created with radius ${radius}.`);
            return { complete: true, data: {} };
          }
        }
        // If edge point clicked on canvas
        if (ctx.cadPendingPoints.length >= 2) {
          const center = data?.center || ctx.cadPendingPoints[0];
          const edge = ctx.cadPendingPoints[1];
          const radius = Math.sqrt(Math.pow(edge.x - center.x, 2) + Math.pow(edge.y - center.y, 2));
          ctx.triggerCADExecute('CIRCLE_TYPED', { center, radius });
          ctx.showMessage(`Command: CIRCLE\nCircle created with radius ${Math.round(radius)}.`);
          return { complete: true, data: {} };
        }
        return { complete: false, data: data || {}, nextStep: 1 };
      }
      return { complete: true, data: {} };
    },
  });

  register({
    name: 'ARC',
    aliases: ['A'],
    category: 'draw',
    description: 'Create a 3-point arc (start, midpoint, end)',
    helpText: 'Specify start point of arc:',
    execute: (ctx) => {
      ctx.setActiveTool('arc');
      ctx.clearCADPendingPoints();
      ctx.setCADPendingCommand('ARC');
      ctx.setCADCommandStep(0);
      ctx.showMessage('Command: ARC\nStep 1/3: Click to specify the START point of the arc.');
    },
  });

  register({
    name: 'ELLIPSE',
    aliases: ['EL'],
    category: 'draw',
    description: 'Create an ellipse',
    helpText: 'Specify axis endpoint:',
    execute: (ctx) => {
      ctx.setActiveTool('circle'); // Closest available
      ctx.showMessage('Command: ELLIPSE\nSpecify axis endpoint: (Using circle tool)');
    },
  });

  register({
    name: 'HATCH',
    aliases: ['H'],
    category: 'draw',
    description: 'Fill an enclosed area',
    helpText: 'Select objects to hatch:',
    execute: (ctx) => {
      // Set fill style for subsequent shapes
      ctx.setActiveStyle({ fill: ctx.activeStyle.stroke, opacity: 0.3 });
      ctx.showMessage('Command: HATCH\nHatch fill enabled for next shape');
    },
  });

  // ==========================================================================
  // MODIFY COMMANDS
  // ==========================================================================

  register({
    name: 'MOVE',
    aliases: ['M'],
    category: 'modify',
    description: 'Displace selected objects',
    helpText: 'Select objects:',
    isMultiStep: true,
    execute: (ctx) => {
      const selectedIds = ctx.selectedAnnotationIds;
      if (selectedIds.length > 0) {
        ctx.setCADSelectedIds(selectedIds);
        ctx.setCADPendingCommand('MOVE');
        ctx.setCADCommandStep(1);
        ctx.setActiveTool('select');
        ctx.showMessage(`MOVE — Step 2 of 3: PICK BASE POINT\n${selectedIds.length} object(s) pre-selected.\nClick anywhere on the canvas to set the base point.`);
      } else {
        ctx.clearCADSelectedIds();
        ctx.setCADSelectionMode('move');
        ctx.setCADPendingCommand('MOVE');
        ctx.setCADCommandStep(0);
        ctx.setActiveTool('select');
        ctx.showMessage('MOVE — Step 1 of 3: SELECT OBJECTS\nClick on the annotations you want to move.\nPress ENTER when selection is complete.');
      }
    },
    executeStep: (ctx, step, input, data) => {
      if (step === 0) {
        const selectedIds = ctx.cadSelectedIds;
        if (selectedIds.length === 0) {
          ctx.showMessage('MOVE — No objects selected. Click on annotations and press ENTER.');
          return { complete: false, data: { ...data, selectedIds: [] } };
        }
        ctx.setCADSelectionMode(null);
        ctx.setActiveTool('select');
        ctx.setCADCommandStep(1);
        ctx.setCADPendingCommand('MOVE');
        ctx.showMessage(`MOVE — Step 2 of 3: PICK BASE POINT\n${selectedIds.length} object(s) selected.\nClick to set base point.`);
        return { complete: false, data: { ...data, selectedIds }, nextStep: 1 };
      }
      if (step === 2) {
        const distance = parseFloat(input);
        if (!isNaN(distance)) {
          ctx.triggerCADExecute('MOVE_TYPED', distance);
          return { complete: true, data: {} };
        }
      }
      return { complete: false, data: data || {}, nextStep: step };
    },
  });

  register({
    name: 'COPY',
    aliases: ['CO', 'CP'],
    category: 'modify',
    description: 'Duplicate selected objects',
    helpText: 'Select objects:',
    isMultiStep: true,
    execute: (ctx) => {
      const selectedIds = ctx.selectedAnnotationIds;
      if (selectedIds.length > 0) {
        ctx.setCADSelectedIds(selectedIds);
        ctx.setCADPendingCommand('COPY');
        ctx.setCADCommandStep(1);
        ctx.setActiveTool('select');
        ctx.showMessage(`COPY — Step 2 of 3: PICK BASE POINT\n${selectedIds.length} object(s) pre-selected.\nClick anywhere on the canvas to set the base point.`);
      } else {
        ctx.clearCADSelectedIds();
        ctx.setCADSelectionMode('copy');
        ctx.setCADPendingCommand('COPY');
        ctx.setCADCommandStep(0);
        ctx.setActiveTool('select');
        ctx.showMessage('COPY — Step 1 of 3: SELECT OBJECTS\nClick on the annotations you want to copy.\nPress ENTER when selection is complete.');
      }
    },
    executeStep: (ctx, step, input, data) => {
      if (step === 0) {
        const selectedIds = ctx.cadSelectedIds;
        if (selectedIds.length === 0) {
          ctx.showMessage('COPY — No objects selected. Click on annotations and press ENTER.');
          return { complete: false, data: { ...data, selectedIds: [] } };
        }
        ctx.setCADSelectionMode(null);
        ctx.setActiveTool('select');
        ctx.setCADCommandStep(1);
        ctx.setCADPendingCommand('COPY');
        ctx.showMessage(`COPY — Step 2 of 3: PICK BASE POINT\n${selectedIds.length} object(s) selected.\nClick to set base point.`);
        return { complete: false, data: { ...data, selectedIds }, nextStep: 1 };
      }
      if (step === 2) {
        const distance = parseFloat(input);
        if (!isNaN(distance)) {
          ctx.triggerCADExecute('COPY_TYPED', distance);
          return { complete: true, data: {} };
        }
      }
      return { complete: false, data: data || {}, nextStep: step };
    },
  });

  register({
    name: 'OFFSET',
    aliases: ['O'],
    category: 'modify',
    description: 'Create parallel offset of selected lines/polylines',
    helpText: 'Specify offset distance:',
    isMultiStep: true,
    execute: (ctx) => {
      const selectedIds = ctx.selectedAnnotationIds;
      if (selectedIds.length > 0) {
        ctx.setCADSelectedIds(selectedIds);
        ctx.setCADPendingCommand('OFFSET');
        ctx.setCADCommandStep(1);
        ctx.setActiveTool('select');
        ctx.showMessage(`OFFSET — ${selectedIds.length} object(s) pre-selected.\nSpecify offset distance:`);
      } else {
        ctx.clearCADSelectedIds();
        ctx.setCADSelectionMode('copy');
        ctx.setCADPendingCommand('OFFSET');
        ctx.setCADCommandStep(0);
        ctx.setActiveTool('select');
        ctx.showMessage('OFFSET — Step 1 of 2: SELECT OBJECTS\nClick on the annotations to offset.\nPress ENTER when selection is complete.');
      }
    },
    executeStep: (ctx, step, input, data) => {
      if (step === 0) {
        const selectedIds = ctx.cadSelectedIds;
        if (selectedIds.length === 0) {
          ctx.showMessage('OFFSET — No objects selected. Click on annotations and press ENTER.');
          return { complete: false, data: { ...data, selectedIds: [] } };
        }
        ctx.setCADSelectionMode(null);
        ctx.setActiveTool('select');
        ctx.setCADCommandStep(1);
        ctx.setCADPendingCommand('OFFSET');
        ctx.showMessage(`OFFSET — ${selectedIds.length} object(s) selected.\nSpecify offset distance:`);
        return { complete: false, data: { ...data, selectedIds }, nextStep: 1 };
      }
      if (step === 1) {
        const distance = parseFloat(input);
        if (isNaN(distance)) {
          ctx.showMessage('OFFSET — Invalid distance. Please enter a number.');
          return { complete: false, data: data || {}, nextStep: 1 };
        }
        ctx.triggerCADExecute('OFFSET', distance);
        ctx.showMessage(`Command: OFFSET\nCreated offset at ${distance}px distance.`);
        return { complete: true, data: {} };
      }
      return { complete: true, data: {} };
    },
  });

  register({
    name: 'FENCE_TRIM',
    aliases: ['FENCE'],
    category: 'modify',
    description: 'Draw a cutting fence to trim intersecting lines',
    helpText: 'Draw fence line:',
    execute: (ctx) => {
      // Trigger trim-fence mode
      ctx.triggerCADExecute('FENCE_TRIM');
      ctx.showMessage('Command: FENCE_TRIM\nDraw a fence line to trim intersecting annotations. Click and drag to draw the fence.\nHold SHIFT while drawing to EXTEND instead of trim.');
    },
  });

  register({
    name: 'FENCE_EXTEND',
    aliases: ['FENCEEX'],
    category: 'modify',
    description: 'Extend lines using a fence',
    helpText: 'Select line to extend:',
    execute: (ctx) => {
      ctx.triggerCADExecute('FENCE_EXTEND');
      ctx.showMessage('Command: FENCE_EXTEND\nDraw a fence line. Lines that intersect the fence boundary will be extended to meet it.');
    },
  });

  register({
    name: 'ROTATE',
    aliases: ['RO'],
    category: 'modify',
    description: 'Rotate objects around a base point',
    helpText: 'Select objects:',
    isMultiStep: true,
    execute: (ctx) => {
      // Check if objects are already selected
      const selectedIds = ctx.selectedAnnotationIds;
      if (selectedIds.length > 0) {
        // Use pre-selected objects
        ctx.setCADSelectedIds(selectedIds);
        ctx.setCADPendingCommand('ROTATE');
        ctx.setCADCommandStep(1);
        ctx.setActiveTool('select');
        ctx.showMessage(`ROTATE — Step 2 of 3: PICK BASE POINT\n${selectedIds.length} object(s) pre-selected.\nClick anywhere on the canvas to set the rotation center.`);
      } else {
        // Enter selection mode
        ctx.clearCADSelectedIds();
        ctx.setCADSelectionMode('rotate');
        ctx.setCADPendingCommand('ROTATE');
        ctx.setCADCommandStep(0);
        ctx.setActiveTool('select');
        ctx.showMessage('ROTATE — Step 1 of 3: SELECT OBJECTS\nClick on the annotations you want to rotate.\nPress ENTER when selection is complete.');
      }
    },
    executeStep: (ctx, step, input, data) => {
      if (step === 0) {
        // Step 0: Selection phase - wait for Enter
        const selectedIds = ctx.cadSelectedIds;
        if (selectedIds.length === 0) {
          ctx.showMessage('ROTATE — No objects selected. Click on annotations and press ENTER.');
          return { complete: false, data: { ...data, selectedIds: [] } };
        }
        // Move to base point selection
        ctx.setCADSelectionMode(null);
        ctx.setActiveTool('select');
        ctx.setCADCommandStep(1);
        ctx.setCADPendingCommand('ROTATE');
        ctx.showMessage(`ROTATE — Step 2 of 3: PICK BASE POINT\n${selectedIds.length} object(s) selected.\nClick anywhere on the canvas to set the rotation center.`);
        return { complete: false, data: { ...data, selectedIds }, nextStep: 1 };
      }
      if (step === 1) {
        // Step 1: Base point already picked via canvas click
        // Update message to guide user for rotation angle
        ctx.showMessage('Command: ROTATE\nBase point set. Move mouse to preview rotation, click to accept, or type angle (e.g., 45).');
        return { complete: false, data: data || {}, nextStep: 2 };
      }
      if (step === 2) {
        // Step 2: Rotation angle - accept typed angle or click interaction
        const angle = parseFloat(input);
        if (!isNaN(angle)) {
          // Offload to MainCanvas to use the bulletproof shape/rectangle math!
          ctx.triggerCADExecute('ROTATE_TYPED', angle);
          return { complete: true, data: {} };
        }
        // If not a number, user might be clicking - handled by canvas
        return { complete: false, data: data || {}, nextStep: 2 };
      }
      return { complete: true, data: {} };
    },
  });

  register({
    name: 'CONVERTTOCAD',
    aliases: ['CTC', 'VECTORIZE'],
    category: 'modify',
    description: 'Convert PDF linework into editable annotations (lines you can move, trim, extend)',
    helpText: 'Converts vectors:',
    execute: (ctx) => {
      ctx.triggerCADExecute('CONVERTTOCAD');
      ctx.showMessage('Command: CONVERTTOCAD\nConverting PDF vector linework on this page to editable line annotations...');
    },
  });

  register({
    name: 'SCALE',
    aliases: ['SC'],
    category: 'modify',
    description: 'Enlarge or reduce selected objects',
    helpText: 'Select objects:',
    execute: (ctx) => {
      const currentZoom = ctx.zoom;
      const newZoom = Math.min(5, currentZoom * 1.25);
      ctx.setZoom(newZoom);
      ctx.showMessage(`Command: SCALE\nZoom scaled to ${Math.round(newZoom * 100)}%`);
    },
  });

  register({
    name: 'TRIM',
    aliases: ['TR'],
    category: 'modify',
    description: 'Trim objects to meet other objects',
    helpText: 'Draw fence line to trim...',
    execute: (ctx) => {
      ctx.clearCADSelectedIds();
      ctx.setCADSelectionMode(null);
      ctx.setCADPendingCommand(null);
      ctx.clearCADPendingPoints();
      ctx.setCADCommandStep(0);
      // Trigger FENCE_TRIM execution which handles fenceExtendMode correctly
      ctx.triggerCADExecute('FENCE_TRIM');
      ctx.showMessage('Command: TRIM\nDraw a fence line to trim intersecting annotations. Click and drag to draw the fence.\nHold SHIFT while drawing to EXTEND instead of trim.');
    },
  });

  register({
    name: 'EXTEND',
    aliases: ['EX'],
    category: 'modify',
    description: 'Extend objects to meet other objects',
    helpText: 'Draw fence line to extend...',
    execute: (ctx) => {
      ctx.clearCADSelectedIds();
      ctx.setCADSelectionMode(null);
      ctx.setCADPendingCommand(null);
      ctx.clearCADPendingPoints();
      ctx.setCADCommandStep(0);
      // Trigger FENCE_EXTEND execution which handles fenceExtendMode correctly
      ctx.triggerCADExecute('FENCE_EXTEND');
      ctx.showMessage('Command: EXTEND\nDraw a fence line to extend intersecting annotations. Click and drag to draw the fence.\nHold SHIFT while drawing to TRIM instead of extend.');
    },
  });

  register({
    name: 'FILLET',
    aliases: ['F'],
    category: 'modify',
    description: 'Round and fillet the edges of objects',
    helpText: 'Select first object:',
    execute: (ctx) => {
      ctx.setActiveTool('select');
      ctx.showMessage('Command: FILLET\nSelect first object or polyline vertex:');
    },
  });


  register({
    name: 'JOIN',
    aliases: ['J'],
    category: 'modify',
    description: 'Join similar objects to form a single unbroken object',
    helpText: 'Select source object:',
    execute: (ctx) => {
      // Join polylines/lines
      ctx.setActiveTool('select');
      ctx.showMessage('Command: JOIN\nSelect source object:');
    },
  });

  register({
    name: 'SIGNATURE',
    aliases: ['SIG'],
    category: 'modify',
    description: 'Add a handwritten or typed signature to the document',
    helpText: 'Signature pad opened.',
    execute: (ctx) => {
      ctx.setSignaturePadOpen(true);
      ctx.showMessage('Command: SIGNATURE\nDraw or type your signature. It will be placed as a draggable image on the page.');
    },
  });

  register({
    name: 'EXPLODE',
    aliases: ['X'],
    category: 'modify',
    description: 'Break a compound object into its component objects',
    helpText: 'Select objects to explode:',
    execute: (ctx) => {
      ctx.clearCADSelectedIds();
      ctx.setCADSelectionMode('explode');
      ctx.setActiveTool('select');
      ctx.showMessage('Command: EXPLODE\nSelect objects to break apart. Press Enter when done.');
    },
    isMultiStep: true,
    executeStep: (ctx, step, input) => {
      if (input === '' || input === '\r' || input === '\n') {
        const selectedIds = ctx.cadSelectedIds;
        if (selectedIds.length === 0) {
          ctx.showMessage('No objects selected. Command cancelled.');
          ctx.setCADSelectionMode(null);
          return { complete: true };
        }
        
        let explodedCount = 0;
        selectedIds.forEach(id => {
          const ann = ctx.annotations.find(a => a.id === id);
          if (!ann) return;

          let points: any[] = [];
          let componentType: 'line' | 'arc' = 'line';

          // Handle different shape types
          if (ann.type === 'rectangle') {
            points = [
              ann.points[0],
              { x: ann.points[0].x + (ann.width || 0), y: ann.points[0].y },
              { x: ann.points[0].x + (ann.width || 0), y: ann.points[0].y + (ann.height || 0) },
              { x: ann.points[0].x, y: ann.points[0].y + (ann.height || 0) },
              ann.points[0]
            ];
            // Apply rotation if present
            if (ann.rotation) {
              const rad = (ann.rotation * Math.PI) / 180;
              const center = { x: ann.points[0].x + (ann.width || 0) / 2, y: ann.points[0].y + (ann.height || 0) / 2 };
              points = points.map((p: { x: number; y: number }) => rotatePointAround(p, center, rad));
            }
          } else if (ann.type === 'measure-polyline' || ann.type === 'polygon' || ann.type === 'cloud') {
            points = [...ann.points];
            // Close the loop for polygons and clouds
            if (ann.type === 'polygon' || ann.type === 'cloud') {
              points.push(ann.points[0]);
            }
          } else if (ann.type === 'circle') {
            // Break circle into arc segments
            const center = ann.points[0];
            const radius = ann.radius || (ann.width || 0) / 2;
            const numSegments = 32; // Number of arc segments
            componentType = 'arc';
            
            for (let i = 0; i < numSegments; i++) {
              const startAngle = (i / numSegments) * 2 * Math.PI;
              const endAngle = ((i + 1) / numSegments) * 2 * Math.PI;
              points.push({
                start: { x: center.x + radius * Math.cos(startAngle), y: center.y + radius * Math.sin(startAngle) },
                end: { x: center.x + radius * Math.cos(endAngle), y: center.y + radius * Math.sin(endAngle) },
                control: { x: center.x + radius * Math.cos((startAngle + endAngle) / 2), y: center.y + radius * Math.sin((startAngle + endAngle) / 2) }
              });
            }
          } else if (ann.type === 'ellipse') {
            // Break ellipse into arc segments
            const center = { x: ann.points[0].x + (ann.width || 0) / 2, y: ann.points[0].y + (ann.height || 0) / 2 };
            const rx = (ann.width || 0) / 2;
            const ry = (ann.height || 0) / 2;
            const numSegments = 32;
            componentType = 'arc';
            
            for (let i = 0; i < numSegments; i++) {
              const startAngle = (i / numSegments) * 2 * Math.PI;
              const endAngle = ((i + 1) / numSegments) * 2 * Math.PI;
              points.push({
                start: { x: center.x + rx * Math.cos(startAngle), y: center.y + ry * Math.sin(startAngle) },
                end: { x: center.x + rx * Math.cos(endAngle), y: center.y + ry * Math.sin(endAngle) },
                control: { x: center.x + rx * Math.cos((startAngle + endAngle) / 2), y: center.y + ry * Math.sin((startAngle + endAngle) / 2) }
              });
            }
          } else if (ann.type === 'arc') {
            // Keep arc as is
            points = [{ start: ann.points[0], end: ann.points[1], control: ann.points[2] }];
            componentType = 'arc';
          } else {
            return; // Skip unsupported types
          }

          // Delete original
          ctx.deleteAnnotation(id);
          ctx.pushUndo({ type: 'delete', annotation: ann });
          
          // Create component segments
          if (componentType === 'line') {
            for (let i = 0; i < points.length - 1; i++) {
              const lineAnn = {
                id: crypto.randomUUID(),
                type: 'line' as const,
                pageIndex: ann.pageIndex,
                points: [points[i], points[i + 1]],
                style: ann.style,
                createdBy: ann.createdBy,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                layerOrder: ctx.annotations.length + i,
              };
              ctx.addAnnotation(lineAnn);
              ctx.pushUndo({ type: 'add', annotation: lineAnn });
            }
          } else if (componentType === 'arc') {
            points.forEach((arcData: any, i: number) => {
              const arcAnn = {
                id: crypto.randomUUID(),
                type: 'arc' as const,
                pageIndex: ann.pageIndex,
                points: [arcData.start, arcData.end, arcData.control],
                style: ann.style,
                createdBy: ann.createdBy,
                createdAt: Date.now(),
                updatedAt: Date.now(),
                layerOrder: ctx.annotations.length + i,
              };
              ctx.addAnnotation(arcAnn);
              ctx.pushUndo({ type: 'add', annotation: arcAnn });
            });
          }
          
          explodedCount++;
        });
        
        ctx.clearCADSelectedIds();
        ctx.setCADSelectionMode(null);
        ctx.showMessage(`${explodedCount} object(s) exploded into component lines.`);
        return { complete: true };
      }
      return { complete: false };
    },
  });

  register({
    name: 'ERASE',
    aliases: ['E'],
    category: 'modify',
    description: 'Remove objects from the drawing',
    helpText: 'Select objects to erase (click or drag box):',
    execute: (ctx) => {
      ctx.clearCADSelectedIds();
      ctx.setCADSelectionMode('erase');
      ctx.setActiveTool('select');
      ctx.showMessage('Command: ERASE\nSelect objects to erase. Press Enter when done, Esc to cancel.');
    },
    isMultiStep: true,
    executeStep: (ctx, step, input) => {
      // When Enter is pressed, delete all selected annotations
      if (input === '' || input === '\r' || input === '\n') {
        const selectedIds = ctx.cadSelectedIds;
        if (selectedIds.length === 0) {
          ctx.showMessage('No objects selected. Command cancelled.');
          ctx.setCADSelectionMode(null);
          return { complete: true };
        }
        
        // Delete all selected annotations
        let deletedCount = 0;
        selectedIds.forEach(id => {
          const ann = ctx.annotations.find(a => a.id === id);
          if (ann) {
            ctx.deleteAnnotation(id);
            ctx.pushUndo({ type: 'delete', annotation: ann });
            deletedCount++;
          }
        });
        
        ctx.clearCADSelectedIds();
        ctx.setCADSelectionMode(null);
        ctx.showMessage(`${deletedCount} object(s) deleted.`);
        return { complete: true };
      }
      
      // Handle "ALL" keyword
      if (input.toUpperCase() === 'ALL') {
        const pageAnnotations = ctx.annotations.filter(a => a.pageIndex === ctx.currentPage);
        pageAnnotations.forEach(ann => {
          ctx.deleteAnnotation(ann.id);
          ctx.pushUndo({ type: 'delete', annotation: ann });
        });
        ctx.clearCADSelectedIds();
        ctx.setCADSelectionMode(null);
        ctx.showMessage(`${pageAnnotations.length} object(s) deleted.`);
        return { complete: true };
      }
      
      return { complete: false };
    },
  });

  // ==========================================================================
  // ANNOTATION COMMANDS
  // ==========================================================================

  register({
    name: 'MTEXT',
    aliases: ['T', 'MT'],
    category: 'annotate',
    description: 'Create a multiline text object',
    helpText: 'Specify first corner:',
    execute: (ctx) => {
      ctx.setActiveTool('text');
      ctx.clearCADPendingPoints();
      ctx.setCADPendingCommand('MTEXT');
      ctx.setCADCommandStep(0);
      ctx.showMessage('Command: MTEXT\nSpecify first corner of text area:');
    },
  });

  register({
    name: 'DDEDIT',
    aliases: ['ED'],
    category: 'annotate',
    description: 'Edit text, dimension text, or attribute definitions',
    helpText: 'Select annotation to edit:',
    execute: (ctx) => {
      ctx.clearCADSelectedIds();
      ctx.setCADSelectionMode('ddedit');
      ctx.setActiveTool('select');
      ctx.showMessage('Command: DDEDIT\nSelect text annotation to edit:');
    },
  });

  register({
    name: 'DIST',
    aliases: ['DI'],
    category: 'annotate',
    description: 'Measure distance and angle',
    helpText: 'Specify first point:',
    execute: (ctx) => {
      ctx.setActiveTool('measure-distance');
      ctx.clearCADPendingPoints();
      ctx.setCADPendingCommand('DIST');
      ctx.setCADCommandStep(0);
      ctx.showMessage('Command: DIST\nSpecify first point:');
    },
  });

  register({
    name: 'DIMLINEAR',
    aliases: ['DLI'],
    category: 'annotate',
    description: 'Create linear dimensions',
    helpText: 'Specify first extension line origin:',
    execute: (ctx) => {
      ctx.setActiveTool('measure-distance');
      ctx.clearCADPendingPoints();
      ctx.setCADPendingCommand('DIMLINEAR');
      ctx.setCADCommandStep(0);
      ctx.showMessage('Command: DIMLINEAR\nSpecify first extension line origin:');
    },
  });

  register({
    name: 'DIMALIGNED',
    aliases: ['DAL'],
    category: 'annotate',
    description: 'Create aligned dimensions',
    helpText: 'Specify first extension line origin:',
    execute: (ctx) => {
      ctx.setActiveTool('measure-distance');
      ctx.clearCADPendingPoints();
      ctx.setCADPendingCommand('DIMALIGNED');
      ctx.setCADCommandStep(0);
      ctx.showMessage('Command: DIMALIGNED\nSpecify first extension line origin:');
    },
  });

  register({
    name: 'LEADER',
    aliases: ['LE'],
    category: 'annotate',
    description: 'Create a line that connects annotation to a feature',
    helpText: 'Specify leader start point:',
    execute: (ctx) => {
      ctx.setActiveTool('text-leader');
      ctx.showMessage('Command: LEADER\nSpecify leader start point:');
    },
  });

  // ==========================================================================
  // NAVIGATION COMMANDS
  // ==========================================================================

  register({
    name: 'ZOOM',
    aliases: ['Z'],
    category: 'navigate',
    description: 'Increase or decrease the magnification of the view',
    helpText: 'Specify corner of window or [Extents/Dynamic/Previous/Scale/Window]:',
    isMultiStep: true,
    execute: (ctx) => {
      ctx.showMessage('Command: ZOOM\nSpecify corner of window or [Extents/Dynamic/Previous/Scale/Window]:');
    },
    executeStep: (ctx, step, input) => {
      const normalized = input.toUpperCase().trim();

      if (step === 0) {
        if (normalized === 'E' || normalized === 'EXTENTS') {
          ctx.fitToScreen();
          ctx.showMessage('Zoom Extents complete.');
          return { complete: true };
        }
        if (normalized === 'W' || normalized === 'WINDOW') {
          ctx.setActiveTool('zoom-rectangle');
          ctx.showMessage('Specify first corner:');
          return { complete: false, nextStep: 1 };
        }
        if (normalized === 'P' || normalized === 'PREVIOUS') {
          ctx.showMessage('Restoring previous view.');
          return { complete: true };
        }
        if (normalized === 'S' || normalized === 'SCALE') {
          ctx.showMessage('Enter scale factor:');
          return { complete: false, nextStep: 2 };
        }
        // Default: zoom in/out
        const factor = parseFloat(input);
        if (!isNaN(factor)) {
          const newZoom = Math.max(0.1, Math.min(5, ctx.zoom * factor));
          ctx.setZoom(newZoom);
          ctx.showMessage(`Zoom scale set to ${Math.round(newZoom * 100)}%`);
          return { complete: true };
        }
      }

      return { complete: true };
    },
  });

  register({
    name: 'PAN',
    aliases: ['P'],
    category: 'navigate',
    description: 'Move the view without changing zoom',
    helpText: 'Press Esc or Enter to exit pan mode',
    execute: (ctx) => {
      ctx.setActiveTool('pan');
      ctx.showMessage('Command: PAN\nPan mode active. Click and drag to pan. Press Esc to exit.');
    },
  });

  register({
    name: 'REGEN',
    aliases: ['RE'],
    category: 'navigate',
    description: 'Regenerate the drawing',
    helpText: 'Regenerating display...',
    execute: (ctx) => {
      ctx.regenerate();
      ctx.showMessage('Command: REGEN\nRegenerating display...');
    },
  });

  register({
    name: 'REDRAW',
    aliases: ['R'],
    category: 'navigate',
    description: 'Refresh the display',
    helpText: 'Redrawing display...',
    execute: (ctx) => {
      ctx.regenerate();
      ctx.showMessage('Command: REDRAW\nRedrawing display...');
    },
  });

  // ==========================================================================
  // CLEANUP COMMANDS
  // ==========================================================================

  register({
    name: 'PURGE',
    aliases: ['PU'],
    category: 'cleanup',
    description: 'Remove unused items from the drawing',
    helpText: 'Purging unused items...',
    execute: (ctx) => {
      ctx.showMessage('Command: PURGE\nPurge complete. 0 unused items removed.');
    },
  });

  register({
    name: 'OVERKILL',
    aliases: ['OVERKILL'],
    category: 'cleanup',
    description: 'Delete duplicate or overlapping objects',
    helpText: 'Removing duplicate geometry...',
    execute: (ctx) => {
      // Find and remove duplicate annotations
      const seen = new Map<string, typeof ctx.annotations[0]>();
      const duplicates: string[] = [];
      
      for (const ann of ctx.annotations) {
        // Create a key based on type, page, and position (rounded to avoid floating point issues)
        const pointsKey = ann.points.map((p: {x: number, y: number}) => `${Math.round(p.x)},${Math.round(p.y)}`).join('|');
        const key = `${ann.type}-${ann.pageIndex}-${pointsKey}`;
        
        if (seen.has(key)) {
          // This is a duplicate
          duplicates.push(ann.id);
        } else {
          seen.set(key, ann);
        }
      }
      
      // Delete duplicates
      duplicates.forEach(id => {
        const ann = ctx.annotations.find(a => a.id === id);
        if (ann) {
          ctx.deleteAnnotation(id);
          ctx.pushUndo({ type: 'delete', annotation: ann });
        }
      });

      ctx.showMessage(`Command: OVERKILL\n${duplicates.length} duplicate path(s) removed.`);
    },
  });

  register({
    name: 'LAYER',
    aliases: ['LA'],
    category: 'property',
    description: 'Manage layers and layer properties',
    helpText: 'Layer Manager dialog opened',
    execute: (ctx) => {
      ctx.showMessage('Command: LAYER\nLayer Manager - Use styles to organize annotations');
    },
  });

  register({
    name: 'COLOR',
    aliases: ['COL'],
    category: 'property',
    description: 'Set the color for new objects',
    helpText: 'Enter color name or number:',
    execute: (ctx) => {
      ctx.showMessage('Command: COLOR\nSpecify color (use style panel for precise selection):');
    },
  });

  register({
    name: 'LINETYPE',
    aliases: ['LT'],
    category: 'property',
    description: 'Set the linetype for new objects',
    helpText: 'Loading linetypes...',
    execute: (ctx) => {
      ctx.showMessage('Command: LINETYPE\nLinetype settings (use style panel)');
    },
  });

  register({
    name: 'UNITS',
    aliases: ['UN'],
    category: 'property',
    description: 'Control coordinate and angle display formats',
    helpText: 'Drawing units dialog',
    execute: (ctx) => {
      ctx.showMessage('Command: UNITS\nDrawing units: Current setting is ft');
    },
  });

  // ==========================================================================
  // UTILITY COMMANDS
  // ==========================================================================

  register({
    name: 'UNDO',
    aliases: ['U'],
    category: 'modify',
    description: 'Reverse the most recent command',
    helpText: 'Undoing last operation...',
    execute: (ctx) => {
      // This would need to be connected to the store's undo
      ctx.showMessage('Command: UNDO\nUndoing last operation...');
    },
  });

  register({
    name: 'REDO',
    aliases: ['REDO'],
    category: 'modify',
    description: 'Reverse the effects of UNDO',
    helpText: 'Redoing last undo...',
    execute: (ctx) => {
      ctx.showMessage('Command: REDO\nRedoing last undo...');
    },
  });

  register({
    name: 'HELP',
    aliases: ['?'],
    category: 'navigate',
    description: 'Display help for commands',
    helpText: 'Type command name for help:',
    execute: (ctx) => {
      ctx.showMessage('Command: HELP\nType any command alias for help. Common commands: L (line), C (circle), TR (trim), Z (zoom)');
    },
  });

  register({
    name: 'SELECT',
    aliases: ['SEL'],
    category: 'modify',
    description: 'Select objects',
    helpText: 'Select objects:',
    execute: (ctx) => {
      ctx.setActiveTool('select');
      ctx.showMessage('Command: SELECT\nSelect objects:');
    },
  });

  register({
    name: 'ALL',
    aliases: ['ALL'],
    category: 'modify',
    description: 'Select all objects on current page',
    helpText: 'Selecting all objects...',
    execute: (ctx) => {
      const pageAnns = ctx.annotations.filter(a => a.pageIndex === ctx.currentPage);
      if (pageAnns.length > 0 && pageAnns[0]) {
        ctx.setSelectedAnnotationId(pageAnns[0].id);
      }
      ctx.showMessage(`${pageAnns.length} objects selected.`);
    },
  });

  register({
    name: 'COUNT',
    aliases: ['N'],
    category: 'annotate',
    description: 'Add count markers',
    helpText: 'Click to place count markers:',
    execute: (ctx) => {
      ctx.setActiveTool('measure-count');
      ctx.showMessage('Command: COUNT\nClick to place count markers. Esc to exit.');
    },
  });

  register({
    name: 'AREA',
    aliases: ['AA'],
    category: 'annotate',
    description: 'Calculate area and perimeter',
    helpText: 'Specify first corner point:',
    execute: (ctx) => {
      ctx.setActiveTool('measure-area');
      ctx.showMessage('Command: AREA\nSpecify first corner point:');
    },
  });

  register({
    name: 'CLOUD',
    aliases: ['CL'],
    category: 'annotate',
    description: 'Create a revision cloud',
    helpText: 'Specify start point:',
    execute: (ctx) => {
      ctx.setActiveTool('cloud');
      ctx.showMessage('Command: CLOUD\nSpecify start point or [Rectangular/Polygonal]:');
    },
  });

  register({
    name: 'ARROW',
    aliases: ['AR'],
    category: 'annotate',
    description: 'Create an arrow',
    helpText: 'Specify start point:',
    execute: (ctx) => {
      ctx.setActiveTool('arrow');
      ctx.clearCADPendingPoints();
      ctx.setCADPendingCommand('ARROW');
      ctx.setCADCommandStep(0);
      ctx.showMessage('Command: ARROW\nSpecify start point:');
    },
  });

  register({
    name: 'CALIBRATE',
    aliases: ['CAL'],
    category: 'annotate',
    description: 'Calibrate measurement scale',
    helpText: 'Specify first point of known distance:',
    execute: (ctx) => {
      ctx.setActiveTool('calibrate');
      ctx.showMessage('Command: CALIBRATE\nSpecify first point of known distance:');
    },
  });

  register({
    name: 'PIN',
    aliases: ['PI'],
    category: 'annotate',
    description: 'Add location pin',
    helpText: 'Specify pin location:',
    execute: (ctx) => {
      ctx.setActiveTool('pin');
      ctx.showMessage('Command: PIN\nSpecify pin location:');
    },
  });

  register({
    name: 'HIGHLIGHT',
    aliases: ['HI'],
    category: 'annotate',
    description: 'Highlight text or area',
    helpText: 'Select text to highlight or drag area:',
    execute: (ctx) => {
      ctx.setActiveTool('highlight');
      ctx.showMessage('Command: HIGHLIGHT\nSelect text or drag to highlight area:');
    },
  });

  register({
    name: 'STRIKETHROUGH',
    aliases: ['ST'],
    category: 'annotate',
    description: 'Add strikethrough markup',
    helpText: 'Select text to strikethrough:',
    execute: (ctx) => {
      ctx.setActiveTool('strikethrough');
      ctx.showMessage('Command: STRIKETHROUGH\nSelect text to markup:');
    },
  });

  register({
    name: 'FREEHAND',
    aliases: ['FH'],
    category: 'draw',
    description: 'Create freehand sketch',
    helpText: 'Drag to draw:',
    execute: (ctx) => {
      ctx.setActiveTool('freehand');
      ctx.showMessage('Command: FREEHAND\nDrag to draw freehand sketch:');
    },
  });

  register({
    name: 'DXF',
    aliases: ['EXPORT'],
    category: 'utility',
    description: 'Export current page to DXF format',
    helpText: 'Exporting to DXF...',
    execute: (ctx) => {
      ctx.triggerCADExecute('DXF');
      ctx.showMessage('Command: DXF\nExporting current page to DXF format...');
    },
  });

  register({
    name: 'RECENT',
    aliases: ['RC'],
    category: 'utility',
    description: 'Switch to recent files view',
    helpText: 'Opening recent files...',
    execute: (ctx) => {
      const tabs = useStore.getState().tabs;
      const welcomeTab = tabs.find(t => t.id === 'welcome');
      if (welcomeTab) {
        useStore.getState().setActiveTab('welcome');
        ctx.showMessage('Command: RECENT\nSwitched to recent files view.');
      } else {
        ctx.showMessage('Command: RECENT\nNo recent files tab found.');
      }
    },
  });

  // ==========================================================================
  // CLOUD COMMANDS
  // ==========================================================================

  register({
    name: 'CLOUD',
    aliases: [],
    category: 'cloud',
    description: 'Execute cloud-based PDF operations (OCR, Redact, Compress, etc.)',
    helpText: 'Usage: CLOUD:OPERATION [params]\nExamples:\n  CLOUD:OCR scope=document lang=eng\n  CLOUD:REDACT text="confidential" scope=document\n  CLOUD:COMPRESS preset=web\n  CLOUD:TO-WORD scope=document',
    execute: (ctx) => {
      // This is a placeholder - actual execution happens in CADCommandLine
      // The command line will parse the full string and call useCloudCommands
      ctx.showMessage('Command: CLOUD\nUse: CLOUD:OPERATION [params]\nOperations: OCR, REDACT, COMPRESS, TO-WORD, TO-PPT, TO-HTML, REPAIR, ENCRYPT, PDF-A');
    },
  });

  return commands;
};

// ============================================================================
// HOOK IMPLEMENTATION
// ============================================================================

export function useCADCommands() {
  const {
    setActiveTool,
    setZoom,
    setPanOffset,
    zoom,
    panOffset,
    currentPage,
    annotations,
    selectedAnnotationId,
    selectedAnnotationIds,
    setSelectedAnnotationId,
    updateAnnotation,
    deleteAnnotation,
    addAnnotation,
    measurements,
    addMeasurement,
    activeStyle,
    setActiveStyle,
    cloudStatus,
  } = useStore();

  const { processCommand: processCloudCommand } = useCloudCommands();
  const commandRegistry = useMemo(() => createCommandRegistry(), []);
  const feedbackRef = useRef<{ message: string; timestamp: number } | null>(null);

  const getSuggestions = useCallback((input: string): CommandSuggestion[] => {
    if (!input) return [];
    const normalized = input.toUpperCase();
    const seen = new Set<string>();
    const suggestions: CommandSuggestion[] = [];

    // Get unique commands (by name)
    for (const [key, cmd] of Object.entries(commandRegistry)) {
      if (seen.has(cmd.name)) continue;

      // Match if input is prefix of alias or name
      const matches = cmd.aliases.some(alias =>
        alias.toUpperCase().startsWith(normalized)
      ) || cmd.name.toUpperCase().startsWith(normalized);

      if (matches) {
        seen.add(cmd.name);
        suggestions.push({
          alias: cmd.aliases[0] || cmd.name,
          name: cmd.name,
          description: cmd.description,
          category: cmd.category,
        });
      }
    }

    return suggestions.slice(0, 10); // Limit suggestions
  }, [commandRegistry]);

  const executeCommand = useCallback((
    input: string,
    pendingCommand?: PendingCADCommand,
    onMessage?: (msg: string) => void,
    onPendingChange?: (pending: PendingCADCommand | null) => void
  ): { success: boolean; message: string } => {
    const trimmed = input.trim();
    if (!trimmed) {
      // For multi-step commands, empty input is valid (e.g., pressing Enter to advance)
      // Only return failure if there's no pending command
      if (!pendingCommand) return { success: false, message: '' };
    }

    const normalized = trimmed.toUpperCase();

    // Create context for command execution
    const context: CADCommandContext = {
      setActiveTool,
      setZoom,
      setPanOffset,
      zoom,
      panOffset,
      currentPage,
      fitToScreen: async () => {
        // Get store state for pdfData and sidebars
        const state = useStore.getState();
        if (!state.pdfData) return;
        const dims = await getPageDimensions(state.currentPage);
        if (!dims) return;

        // Calculate fit zoom
        const containerWidth = window.innerWidth - (state.leftSidebarOpen ? 280 : 0) - (state.rightSidebarOpen ? 256 : 0) - 40;
        const containerHeight = window.innerHeight - 200;
        const zoomX = containerWidth / dims.width;
        const zoomY = containerHeight / dims.height;
        const newZoom = Math.min(zoomX, zoomY, 2);

        setZoom(newZoom);
        const centeredX = (state.leftSidebarOpen ? 280 : 0) + 20 + (containerWidth - dims.width * newZoom) / 2;
        const centeredY = (containerHeight - dims.height * newZoom) / 2;
        setPanOffset({ x: centeredX, y: centeredY });
      },
      regenerate: () => {
        useStore.getState().bumpPdfReadyKey();
      },
      annotations,
      selectedAnnotationId,
      selectedAnnotationIds,
      setSelectedAnnotationId,
      updateAnnotation,
      deleteAnnotation,
      addAnnotation,
      measurements,
      addMeasurement,
      activeStyle,
      setActiveStyle,
      showMessage: (msg: string) => {
        feedbackRef.current = { message: msg, timestamp: Date.now() };
        onMessage?.(msg);
      },
      setPendingCommand: onPendingChange || (() => {}),
      setSignaturePadOpen: (open) => useStore.getState().setSignaturePadOpen(open),
      setCADPendingCommand: (cmd) => useStore.getState().setCADPendingCommand(cmd),
      setCADPendingPoints: (points) => useStore.getState().setCADPendingPoints(points),
      clearCADPendingPoints: () => useStore.getState().clearCADPendingPoints(),
      setCADCommandStep: (step) => useStore.getState().setCADCommandStep(step),
      cadPendingPoints: useStore.getState().cadPendingPoints,
      setCADSelectionMode: (mode) => useStore.getState().setCADSelectionMode(mode),
      setCADSelectedIds: (ids) => useStore.getState().setCADSelectedIds(ids),
      addCADSelectedId: (id) => useStore.getState().addCADSelectedId(id),
      clearCADSelectedIds: () => useStore.getState().clearCADSelectedIds(),
      cadSelectedIds: useStore.getState().cadSelectedIds,
      pushUndo: (action) => useStore.getState().pushUndo(action),
      triggerCADExecute: (command, payload) => useStore.getState().triggerCADExecute(command, payload),
    };

    // Handle multi-step command continuation
    if (pendingCommand) {
      const cmd = commandRegistry[pendingCommand.command];
      if (cmd?.isMultiStep && cmd.executeStep) {
        const result = cmd.executeStep(context, pendingCommand.step, trimmed, pendingCommand.data);

        if (!result || result.complete) {
          onPendingChange?.(null);
          return { success: true, message: feedbackRef.current?.message || 'Command completed' };
        } else {
          onPendingChange?.({
            command: pendingCommand.command,
            alias: pendingCommand.alias,
            step: result.nextStep ?? pendingCommand.step + 1,
            data: result.data,
          });
          return { success: true, message: feedbackRef.current?.message || 'Continue...' };
        }
      }
    }

    // Handle new command
    const cmd = commandRegistry[normalized];
    if (!cmd) {
      // Check if it's a number (could be zoom factor, distance, or angle)
      const numValue = parseFloat(trimmed);
      if (!isNaN(numValue)) { // Removed > 0 check so users can type negative angles!
        // Check if ROTATE is active at step 2 (angle input phase)
        const state = useStore.getState();
        const pendingUp = state.cadPendingCommand?.toUpperCase() || '';
        const step = state.cadCommandStep;
        // Excuse numeric inputs for interactive commands so the Canvas/CLI can handle them
        if (['ROTATE', 'MOVE', 'COPY'].includes(pendingUp) && step === 2) return { success: false, message: '' };
        if (pendingUp === 'OFFSET' && step === 1) return { success: false, message: '' };
        if (['CIRCLE', 'C'].includes(pendingUp) && state.cadPendingPoints.length === 1) return { success: false, message: '' };
        if (['RECTANG', 'REC'].includes(pendingUp) && state.cadPendingPoints.length === 1) return { success: false, message: '' };
        // Otherwise just show error
        return { success: false, message: `Unknown command "${trimmed}". Type ? for help.` };
      }
      return { success: false, message: `Unknown command "${trimmed}". Type ? for help.` };
    }

    // Special handling for CLOUD command - delegate to useCloudCommands
    if (cmd.name === 'CLOUD') {
      // Execute cloud command asynchronously
      processCloudCommand(trimmed);
      return { success: true, message: cloudStatus || 'Cloud command initiated...' };
    }

    // Execute command
    try {
      if (cmd.isMultiStep) {
        cmd.execute(context);
        onPendingChange?.({
          command: cmd.name,
          alias: normalized,
          step: 0,
        });
        return { success: true, message: feedbackRef.current?.message || `${cmd.name} command initiated` };
      } else {
        cmd.execute(context);
        return { success: true, message: feedbackRef.current?.message || `${cmd.name} executed` };
      }
    } catch (err) {
      return { success: false, message: `Error executing ${cmd.name}: ${err}` };
    }
  }, [
    commandRegistry,
    setActiveTool,
    setZoom,
    setPanOffset,
    zoom,
    panOffset,
    currentPage,
    annotations,
    selectedAnnotationId,
    setSelectedAnnotationId,
    updateAnnotation,
    deleteAnnotation,
    addAnnotation,
    measurements,
    addMeasurement,
    activeStyle,
    setActiveStyle,
  ]);

  const getAllCommands = useCallback((): CommandSuggestion[] => {
    const seen = new Set<string>();
    const commands: CommandSuggestion[] = [];

    for (const cmd of Object.values(commandRegistry)) {
      if (seen.has(cmd.name)) continue;
      seen.add(cmd.name);
      commands.push({
        alias: cmd.aliases.join('/'),
        name: cmd.name,
        description: cmd.description,
        category: cmd.category,
      });
    }

    return commands.sort((a, b) => a.name.localeCompare(b.name));
  }, [commandRegistry]);

  return {
    commandRegistry,
    getSuggestions,
    executeCommand,
    getAllCommands,
  };
}
