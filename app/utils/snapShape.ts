import { Point } from '@/app/types';

/**
 * Apply shape snapping when Shift is held:
 * - Lines: snap to horizontal, vertical, or 45-degree angles
 * - Rect: force to perfect square
 * - Ellipse: force to perfect circle
 */
export function snapLineEnd(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const absDx = Math.abs(dx);
  const absDy = Math.abs(dy);

  // Snap to nearest 45-degree angle
  const angle = Math.atan2(absDy, absDx);
  const snapAngle = Math.round(angle / (Math.PI / 4)) * (Math.PI / 4);
  const dist = Math.sqrt(dx * dx + dy * dy);

  return {
    x: start.x + dist * Math.cos(snapAngle) * Math.sign(dx || 1),
    y: start.y + dist * Math.sin(snapAngle) * Math.sign(dy || 1),
    pressure: end.pressure,
  };
}

export function snapRectEnd(start: Point, end: Point): Point {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  const size = Math.max(Math.abs(dx), Math.abs(dy));

  return {
    x: start.x + size * Math.sign(dx || 1),
    y: start.y + size * Math.sign(dy || 1),
    pressure: end.pressure,
  };
}

export function snapEllipseEnd(start: Point, end: Point): Point {
  // Force equal radii (circle)
  return snapRectEnd(start, end);
}
