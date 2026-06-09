export interface Point {
  x: number;
  y: number;
}

/**
 * Takes a rough array of hand-drawn points and forces them into 
 * perfect horizontal or vertical lines if they are close to 90 degrees.
 * 
 * @param points - Array of points from user drawing
 * @param toleranceDegrees - Angle tolerance in degrees (default 15)
 * @returns Normalized points snapped to orthogonal axes
 */
export const normalizeToOrtho = (points: Point[], toleranceDegrees: number = 15): Point[] => {
  if (points.length < 2) return points;

  const snappedPoints: Point[] = [{ ...points[0] }];
  let snappedCount = 0;

  for (let i = 1; i < points.length; i++) {
    const prev = snappedPoints[i - 1];
    const current = points[i];

    const dx = current.x - prev.x;
    const dy = current.y - prev.y;
    
    // Calculate angle in degrees
    const angle = Math.abs((Math.atan2(dy, dx) * 180) / Math.PI);
    
    // Check if the line is close to Horizontal (0 or 180 degrees)
    const isHorizontal = angle < toleranceDegrees || angle > 180 - toleranceDegrees;
    
    // Check if the line is close to Vertical (90 or 270 degrees)
    const isVertical = Math.abs(angle - 90) < toleranceDegrees || Math.abs(angle - 270) < toleranceDegrees;

    if (isHorizontal) {
      // Force Y to match previous Y (Perfectly horizontal)
      snappedPoints.push({ x: current.x, y: prev.y });
      snappedCount++;
    } else if (isVertical) {
      // Force X to match previous X (Perfectly vertical)
      snappedPoints.push({ x: prev.x, y: current.y });
      snappedCount++;
    } else {
      // The line is intentionally diagonal, leave it alone
      snappedPoints.push({ ...current });
    }
  }

  return snappedPoints;
};
