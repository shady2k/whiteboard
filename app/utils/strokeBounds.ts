import { v4 as uuidv4 } from 'uuid';
import type { Stroke, Point, FreehandStroke, MarkerStroke } from '@/app/types';

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
    case 'axes':
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

export function distPointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}

export function findStrokeAtPoint(p: Point, strokes: Stroke[], eraserRadius: number): string | null {
  for (let i = strokes.length - 1; i >= 0; i--) {
    const stroke = strokes[i];
    if (stroke.type === 'freehand' || stroke.type === 'marker') {
      for (const sp of stroke.points) {
        const dx = sp.x - p.x;
        const dy = sp.y - p.y;
        if (dx * dx + dy * dy < eraserRadius * eraserRadius) return stroke.id;
      }
    } else if (stroke.type === 'line') {
      if (distPointToSegment(p, stroke.start, stroke.end) < eraserRadius) return stroke.id;
    } else if (stroke.type === 'rect') {
      const s = stroke;
      const corners = [s.start, { ...s.start, x: s.end.x }, s.end, { ...s.end, x: s.start.x }] as Point[];
      for (let j = 0; j < 4; j++) {
        if (distPointToSegment(p, corners[j], corners[(j + 1) % 4]) < eraserRadius) return stroke.id;
      }
    } else if (stroke.type === 'triangle') {
      const s = stroke;
      const x = Math.min(s.start.x, s.end.x);
      const y = Math.min(s.start.y, s.end.y);
      const w = Math.abs(s.end.x - s.start.x);
      const h = Math.abs(s.end.y - s.start.y);
      const tri = [
        { x: x + w / 2, y, pressure: 0 },
        { x: x + w, y: y + h, pressure: 0 },
        { x, y: y + h, pressure: 0 },
      ] as Point[];
      for (let j = 0; j < 3; j++) {
        if (distPointToSegment(p, tri[j], tri[(j + 1) % 3]) < eraserRadius) return stroke.id;
      }
    } else if (stroke.type === 'axes') {
      const x = Math.min(stroke.start.x, stroke.end.x);
      const y = Math.min(stroke.start.y, stroke.end.y);
      const w = Math.abs(stroke.end.x - stroke.start.x);
      const h = Math.abs(stroke.end.y - stroke.start.y);
      const cx = x + w / 2, cy = y + h / 2;
      const xLeft = { x, y: cy, pressure: 0 } as Point;
      const xRight = { x: x + w, y: cy, pressure: 0 } as Point;
      const yTop = { x: cx, y, pressure: 0 } as Point;
      const yBottom = { x: cx, y: y + h, pressure: 0 } as Point;
      if (distPointToSegment(p, xLeft, xRight) < eraserRadius) return stroke.id;
      if (distPointToSegment(p, yTop, yBottom) < eraserRadius) return stroke.id;
    } else if (stroke.type === 'ellipse') {
      const s = stroke;
      const dx = (p.x - s.center.x) / s.radiusX;
      const dy = (p.y - s.center.y) / s.radiusY;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (Math.abs(d - 1) < eraserRadius / Math.min(s.radiusX, s.radiusY)) return stroke.id;
    } else if (stroke.type === 'image') {
      const { x, y, width, height } = stroke;
      if (p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + height) return stroke.id;
    }
  }
  return null;
}

function boxesOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

/**
 * Partially erase a stroke at the given point with the given radius.
 * Returns null if the stroke is not hit.
 * Returns an empty array if the stroke is fully erased.
 * Returns an array of remaining stroke fragments if split.
 */
export function partialEraseStroke(
  stroke: Stroke,
  eraserPos: Point,
  eraserRadius: number
): Stroke[] | null {
  if (stroke.type === 'freehand' || stroke.type === 'marker') {
    return partialEraseFreehand(stroke, eraserPos, eraserRadius);
  }

  // For shapes/images: check hit and delete whole stroke
  if (stroke.type === 'line') {
    if (distPointToSegment(eraserPos, stroke.start, stroke.end) < eraserRadius) return [];
  } else if (stroke.type === 'rect') {
    const corners = [stroke.start, { ...stroke.start, x: stroke.end.x }, stroke.end, { ...stroke.end, x: stroke.start.x }] as Point[];
    for (let j = 0; j < 4; j++) {
      if (distPointToSegment(eraserPos, corners[j], corners[(j + 1) % 4]) < eraserRadius) return [];
    }
  } else if (stroke.type === 'triangle') {
    const x = Math.min(stroke.start.x, stroke.end.x);
    const y = Math.min(stroke.start.y, stroke.end.y);
    const w = Math.abs(stroke.end.x - stroke.start.x);
    const h = Math.abs(stroke.end.y - stroke.start.y);
    const tri = [
      { x: x + w / 2, y, pressure: 0 },
      { x: x + w, y: y + h, pressure: 0 },
      { x, y: y + h, pressure: 0 },
    ] as Point[];
    for (let j = 0; j < 3; j++) {
      if (distPointToSegment(eraserPos, tri[j], tri[(j + 1) % 3]) < eraserRadius) return [];
    }
  } else if (stroke.type === 'axes') {
    const x = Math.min(stroke.start.x, stroke.end.x);
    const y = Math.min(stroke.start.y, stroke.end.y);
    const w = Math.abs(stroke.end.x - stroke.start.x);
    const h = Math.abs(stroke.end.y - stroke.start.y);
    const origin = { x, y: y + h, pressure: 0 } as Point;
    const xEnd = { x: x + w, y: y + h, pressure: 0 } as Point;
    const yEnd = { x, y, pressure: 0 } as Point;
    if (distPointToSegment(eraserPos, origin, xEnd) < eraserRadius) return [];
    if (distPointToSegment(eraserPos, origin, yEnd) < eraserRadius) return [];
  } else if (stroke.type === 'ellipse') {
    const dx = (eraserPos.x - stroke.center.x) / stroke.radiusX;
    const dy = (eraserPos.y - stroke.center.y) / stroke.radiusY;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (Math.abs(d - 1) < eraserRadius / Math.min(stroke.radiusX, stroke.radiusY)) return [];
  } else if (stroke.type === 'image') {
    const { x, y, width, height } = stroke;
    if (eraserPos.x >= x && eraserPos.x <= x + width && eraserPos.y >= y && eraserPos.y <= y + height) return [];
  }

  return null; // No hit
}

function partialEraseFreehand(
  stroke: FreehandStroke | MarkerStroke,
  eraserPos: Point,
  eraserRadius: number
): Stroke[] | null {
  const r2 = eraserRadius * eraserRadius;
  let hasHit = false;

  // Check if eraser hits any point or segment between consecutive points
  for (let i = 0; i < stroke.points.length; i++) {
    const p = stroke.points[i];
    const dx = p.x - eraserPos.x;
    const dy = p.y - eraserPos.y;
    if (dx * dx + dy * dy < r2) { hasHit = true; break; }
    // Also check segment between this point and next
    if (i < stroke.points.length - 1) {
      if (distPointToSegment(eraserPos, p, stroke.points[i + 1]) < eraserRadius) { hasHit = true; break; }
    }
  }

  if (!hasHit) return null;

  // Split points into segments, excluding points within eraser radius
  const segments: Point[][] = [];
  let current: Point[] = [];

  for (let i = 0; i < stroke.points.length; i++) {
    const p = stroke.points[i];
    const dx = p.x - eraserPos.x;
    const dy = p.y - eraserPos.y;
    const inside = dx * dx + dy * dy < r2;

    if (!inside) {
      current.push(p);
    } else {
      if (current.length >= 2) {
        segments.push(current);
      }
      current = [];
    }
  }
  if (current.length >= 2) {
    segments.push(current);
  }

  return segments.map((pts) => ({
    type: stroke.type,
    id: uuidv4(),
    points: pts,
    style: { ...stroke.style },
  } as FreehandStroke | MarkerStroke));
}

export interface EraserPoint {
  point: Point;
  radius: number;
}

/**
 * Compute erase results for a single stroke against a set of eraser points.
 * Returns null if no hit. Returns { hit: true, remaining: Stroke[] } otherwise.
 * For freehand/marker strokes, remaining contains the surviving fragments.
 * For shapes/images, remaining is empty (whole stroke deleted).
 */
export function computeEraseResult(
  stroke: Stroke,
  eraserPts: EraserPoint[],
): { hit: true; remaining: Stroke[] } | null {
  if ((stroke.type === 'freehand' || stroke.type === 'marker') && stroke.points.length > 0) {
    const erasedIndices = new Set<number>();
    for (let i = 0; i < stroke.points.length; i++) {
      const p = stroke.points[i];
      for (const { point: ep, radius: er } of eraserPts) {
        const r2 = er * er;
        const dx = p.x - ep.x;
        const dy = p.y - ep.y;
        if (dx * dx + dy * dy < r2) {
          erasedIndices.add(i);
          break;
        }
        if (i > 0 && distPointToSegment(ep, stroke.points[i - 1], p) < er) {
          erasedIndices.add(i);
          break;
        }
        if (i < stroke.points.length - 1 && distPointToSegment(ep, p, stroke.points[i + 1]) < er) {
          erasedIndices.add(i);
          break;
        }
      }
    }
    if (erasedIndices.size === 0) return null;
    const segments: Point[][] = [];
    let seg: Point[] = [];
    for (let i = 0; i < stroke.points.length; i++) {
      if (!erasedIndices.has(i)) {
        seg.push(stroke.points[i]);
      } else {
        if (seg.length >= 2) segments.push(seg);
        seg = [];
      }
    }
    if (seg.length >= 2) segments.push(seg);
    const remaining = segments.map((pts) => ({
      type: stroke.type,
      id: uuidv4(),
      points: pts,
      style: { ...stroke.style },
    } as Stroke));
    return { hit: true, remaining };
  }

  // Shapes/images: delete whole object
  for (const { point: ep, radius: er } of eraserPts) {
    if (partialEraseStroke(stroke, ep, er) !== null) {
      return { hit: true, remaining: [] };
    }
  }
  return null;
}

export function strokeIntersectsRect(stroke: Stroke, rect: BoundingBox): boolean {
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
