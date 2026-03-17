import type { Stroke } from '@/app/types';

export interface BoundingBox {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function getStrokeBounds(stroke: Stroke): BoundingBox {
  switch (stroke.type) {
    case 'freehand':
    case 'marker': {
      let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
      for (const p of stroke.points) {
        if (p.x < minX) minX = p.x;
        if (p.y < minY) minY = p.y;
        if (p.x > maxX) maxX = p.x;
        if (p.y > maxY) maxY = p.y;
      }
      return { minX, minY, maxX, maxY };
    }
    case 'line':
    case 'rect':
    case 'triangle':
      return {
        minX: Math.min(stroke.start.x, stroke.end.x),
        minY: Math.min(stroke.start.y, stroke.end.y),
        maxX: Math.max(stroke.start.x, stroke.end.x),
        maxY: Math.max(stroke.start.y, stroke.end.y),
      };
    case 'ellipse':
      return {
        minX: stroke.center.x - stroke.radiusX,
        minY: stroke.center.y - stroke.radiusY,
        maxX: stroke.center.x + stroke.radiusX,
        maxY: stroke.center.y + stroke.radiusY,
      };
    case 'image':
      return {
        minX: stroke.x,
        minY: stroke.y,
        maxX: stroke.x + stroke.width,
        maxY: stroke.y + stroke.height,
      };
  }
}

function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function strokeIntersectsRect(stroke: Stroke, rect: BoundingBox): boolean {
  // Skip image strokes — not included in snippets
  if (stroke.type === 'image') return false;

  const bounds = getStrokeBounds(stroke);

  // For freehand/marker, also check if any individual point falls in the rect
  if (stroke.type === 'freehand' || stroke.type === 'marker') {
    for (const p of stroke.points) {
      if (p.x >= rect.minX && p.x <= rect.maxX && p.y >= rect.minY && p.y <= rect.maxY) {
        return true;
      }
    }
    return boxesOverlap(bounds, rect);
  }

  return boxesOverlap(bounds, rect);
}
