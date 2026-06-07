import type { CalibrationSettings, MeasurementUnit, Point } from '../types';

export function pixelDistance(p1: Point, p2: Point): number {
  return Math.sqrt((p2.x - p1.x) ** 2 + (p2.y - p1.y) ** 2);
}

export function calibratedDistance(
  p1: Point,
  p2: Point,
  cal: CalibrationSettings | undefined
): number {
  if (!cal) return pixelDistance(p1, p2);
  const dx = Math.abs(p2.x - p1.x) * cal.scaleX;
  const dy = Math.abs(p2.y - p1.y) * cal.scaleY;
  return Math.sqrt(dx * dx + dy * dy);
}

export function polygonArea(points: Point[], cal?: CalibrationSettings): number {
  if (points.length < 3) return 0;
  let area = 0;
  const sx = cal?.scaleX ?? 1;
  const sy = cal?.scaleY ?? 1;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    area += points[i].x * sx * points[j].y * sy;
    area -= points[j].x * sx * points[i].y * sy;
  }
  return Math.abs(area) / 2;
}

export function polygonPerimeter(points: Point[], cal?: CalibrationSettings): number {
  if (points.length < 2) return 0;
  let perimeter = 0;
  for (let i = 0; i < points.length; i++) {
    const j = (i + 1) % points.length;
    perimeter += calibratedDistance(points[i], points[j], cal);
  }
  return perimeter;
}

export function angleBetweenPoints(vertex: Point, p1: Point, p2: Point): number {
  const a1 = Math.atan2(p1.y - vertex.y, p1.x - vertex.x);
  const a2 = Math.atan2(p2.y - vertex.y, p2.x - vertex.x);
  let angle = Math.abs((a1 - a2) * (180 / Math.PI));
  if (angle > 180) angle = 360 - angle;
  return angle;
}

/**
 * Angle between two line segments defined by 4 points.
 * Line 1: p0 → p1, Line 2: p2 → p3
 * Returns the angle (in degrees) between the two direction vectors.
 */
export function angleBetweenLines(p0: Point, p1: Point, p2: Point, p3: Point): number {
  const dx1 = p1.x - p0.x;
  const dy1 = p1.y - p0.y;
  const dx2 = p3.x - p2.x;
  const dy2 = p3.y - p2.y;
  const a1 = Math.atan2(dy1, dx1);
  const a2 = Math.atan2(dy2, dx2);
  let angle = Math.abs((a1 - a2) * (180 / Math.PI));
  if (angle > 180) angle = 360 - angle;
  return angle;
}

export function convertUnit(value: number, from: MeasurementUnit, to: MeasurementUnit): number {
  const toInches: Record<MeasurementUnit, number> = {
    in: 1,
    ft: 12,
    cm: 0.393701,
    m: 39.3701,
    mm: 0.0393701,
  };
  return (value * toInches[from]) / toInches[to];
}

export function formatMeasurement(value: number, unit: MeasurementUnit, type: string): string {
  const precision = 2;
  if (type === 'area') {
    return `${value.toFixed(precision)} ${unit}²`;
  }
  if (type === 'angle') {
    return `${value.toFixed(1)}°`;
  }
  if (type === 'count') {
    return `Count: ${Math.round(value)}`;
  }
  if (type === 'volume') {
    return `${value.toFixed(precision)} ${unit}³`;
  }
  return `${value.toFixed(precision)} ${unit}`;
}

export function midpoint(p1: Point, p2: Point): Point {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

export function snapToGrid(point: Point, gridSize: number): Point {
  return {
    x: Math.round(point.x / gridSize) * gridSize,
    y: Math.round(point.y / gridSize) * gridSize,
  };
}
