import type { Point } from '../types';

export const getDist = (p1: Point, p2: Point) => Math.hypot(p2.x - p1.x, p2.y - p1.y);

// Used for Trim Fence and Vector Detection
export const getLineIntersection = (p1: Point, p2: Point, p3: Point, p4: Point): Point | null => {
  const denom = (p1.x - p2.x) * (p3.y - p4.y) - (p1.y - p2.y) * (p3.x - p4.x);
  if (Math.abs(denom) < 0.0001) return null;

  const t = ((p1.x - p3.x) * (p3.y - p4.y) - (p1.y - p3.y) * (p3.x - p4.x)) / denom;
  const u = -((p1.x - p2.x) * (p1.y - p3.y) - (p1.y - p2.y) * (p1.x - p3.x)) / denom;

  if (t >= 0 && t <= 1 && u >= 0 && u <= 1) {
    return { x: p1.x + t * (p2.x - p1.x), y: p1.y + t * (p2.y - p1.y) };
  }
  return null;
};

// Used for Hatch Tool (Flood Fill / Area Detection)
export const isPointInPolygon = (point: Point, polygon: Point[]): boolean => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].x, yi = polygon[i].y;
    const xj = polygon[j].x, yj = polygon[j].y;
    const intersect = ((yi > point.y) !== (yj > point.y)) &&
      (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
    if (intersect) inside = !inside;
  }
  return inside;
};

// Used for Offset Tool
export const getOffsetPoints = (pts: Point[], distance: number): Point[] => {
  if (pts.length < 2) return pts;
  const offsetPts: Point[] = [];
  
  for (let i = 0; i < pts.length - 1; i++) {
    const p1 = pts[i];
    const p2 = pts[i + 1];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const len = Math.hypot(dx, dy);
    const nx = -dy / len;
    const ny = dx / len;
    
    // Add offset points (continuous polyline version - no duplicates)
    // Note: This is a basic shift. For true AutoCAD offsets on sharp corners,
    // you would calculate the intersection of the shifted lines, but this works great for V1.
    if (i === 0) offsetPts.push({ x: p1.x + nx * distance, y: p1.y + ny * distance });
    offsetPts.push({ x: p2.x + nx * distance, y: p2.y + ny * distance });
  }
  return offsetPts;
};

// Used to fix the Rotate Tool center-anchoring
export const rotatePointAround = (point: Point, base: Point, angleRad: number): Point => {
  const cos = Math.cos(angleRad);
  const sin = Math.sin(angleRad);
  const dx = point.x - base.x;
  const dy = point.y - base.y;
  return {
    x: base.x + (dx * cos - dy * sin),
    y: base.y + (dx * sin + dy * cos),
  };
};

// Used for CAD Layer sub-object extraction: find distance from point to line segment
export const pointToSegmentDistance = (point: Point, segStart: Point, segEnd: Point): number => {
  const A = point.x - segStart.x;
  const B = point.y - segStart.y;
  const C = segEnd.x - segStart.x;
  const D = segEnd.y - segStart.y;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;

  if (lenSq !== 0) param = dot / lenSq;

  let xx, yy;

  if (param < 0) {
    xx = segStart.x;
    yy = segStart.y;
  } else if (param > 1) {
    xx = segEnd.x;
    yy = segEnd.y;
  } else {
    xx = segStart.x + param * C;
    yy = segStart.y + param * D;
  }

  const dx = point.x - xx;
  const dy = point.y - yy;
  return Math.sqrt(dx * dx + dy * dy);
};
