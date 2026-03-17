import type { Stroke } from '@/app/types';

/**
 * Offset all points/coordinates in a stroke by (dx, dy).
 * Does NOT assign a new id — use this for preview rendering and paste operations.
 */
export function offsetStroke(stroke: Stroke, dx: number, dy: number): Stroke {
  switch (stroke.type) {
    case 'freehand':
    case 'marker':
      return {
        ...stroke,
        points: stroke.points.map(p => ({ x: p.x + dx, y: p.y + dy, pressure: p.pressure })),
      };
    case 'line':
    case 'rect':
    case 'triangle':
      return {
        ...stroke,
        start: { x: stroke.start.x + dx, y: stroke.start.y + dy, pressure: stroke.start.pressure },
        end: { x: stroke.end.x + dx, y: stroke.end.y + dy, pressure: stroke.end.pressure },
      };
    case 'ellipse':
      return {
        ...stroke,
        center: { x: stroke.center.x + dx, y: stroke.center.y + dy, pressure: stroke.center.pressure },
      };
    case 'image':
      return { ...stroke, x: stroke.x + dx, y: stroke.y + dy };
  }
}
