import type { Point } from '@/app/types';

/**
 * Pre-filter: remove points closer than `minDist` to the previous kept point.
 * Gentle deduplication that doesn't change visual shape.
 */
function distanceFilter(points: Point[], minDist: number): Point[] {
  if (points.length <= 2) return points;
  const result: Point[] = [points[0]];
  const minDistSq = minDist * minDist;
  for (let i = 1; i < points.length - 1; i++) {
    const prev = result[result.length - 1];
    const dx = points[i].x - prev.x;
    const dy = points[i].y - prev.y;
    if (dx * dx + dy * dy >= minDistSq) {
      result.push(points[i]);
    }
  }
  // Always keep last point
  result.push(points[points.length - 1]);
  return result;
}

/**
 * Round point coordinates to `precision` decimal places.
 * Reduces JSON payload size without visual impact.
 */
function roundPoints(points: Point[], precision: number): Point[] {
  const factor = Math.pow(10, precision);
  return points.map(p => ({
    x: Math.round(p.x * factor) / factor,
    y: Math.round(p.y * factor) / factor,
    pressure: Math.round(p.pressure * 100) / 100,
  }));
}

/**
 * Optimize freehand points for storage:
 * 1. Distance filter — remove oversampled points (minDist=1px)
 * 2. Round coordinates to 1 decimal place
 *
 * No shape-altering simplification (RDP) — that caused visible artifacts.
 */
export function simplifyPoints(points: Point[]): Point[] {
  if (points.length <= 2) return roundPoints(points, 1);
  const filtered = distanceFilter(points, 1.0);
  return roundPoints(filtered, 1);
}
