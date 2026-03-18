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

/** Interpolate between two points */
function lerpPoint(a: Point, b: Point, t: number): Point {
  return {
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    pressure: (a.pressure ?? 0.5) + ((b.pressure ?? 0.5) - (a.pressure ?? 0.5)) * t,
  };
}

/**
 * Compute erased intervals [t1,t2] on segment a→b for all eraser circles.
 * Returns merged, sorted intervals in parameter space [0,1].
 */
function computeErasedIntervals(
  a: Point, b: Point, eraserPts: EraserPoint[],
): [number, number][] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const segLenSq = dx * dx + dy * dy;
  if (segLenSq < 1e-10) return [];

  const intervals: [number, number][] = [];
  for (const { point: ep, radius: er } of eraserPts) {
    const fx = a.x - ep.x;
    const fy = a.y - ep.y;
    const aa = segLenSq;
    const bb = 2 * (fx * dx + fy * dy);
    const cc = fx * fx + fy * fy - er * er;
    const disc = bb * bb - 4 * aa * cc;
    if (disc <= 0) continue; // skip tangent (disc==0) and miss (disc<0)
    const sqrtDisc = Math.sqrt(disc);
    const t1 = (-bb - sqrtDisc) / (2 * aa);
    const t2 = (-bb + sqrtDisc) / (2 * aa);
    if (t2 < 0 || t1 > 1) continue;
    const clamped1 = Math.max(0, t1);
    const clamped2 = Math.min(1, t2);
    if (clamped2 - clamped1 < 1e-6) continue; // skip zero-width intervals
    intervals.push([clamped1, clamped2]);
  }
  if (intervals.length === 0) return [];

  // Merge overlapping intervals
  intervals.sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [intervals[0]];
  for (let i = 1; i < intervals.length; i++) {
    const last = merged[merged.length - 1];
    if (intervals[i][0] <= last[1]) {
      last[1] = Math.max(last[1], intervals[i][1]);
    } else {
      merged.push(intervals[i]);
    }
  }
  return merged;
}

/**
 * Compute erase results for a single stroke against a set of eraser points.
 * Uses segment-based clipping for precise eraser boundaries.
 * Returns null if no hit. Returns { hit: true, remaining: Stroke[] } otherwise.
 */
export function computeEraseResult(
  stroke: Stroke,
  eraserPts: EraserPoint[],
  preview = false,
): { hit: true; remaining: Stroke[] } | null {
  if ((stroke.type === 'freehand' || stroke.type === 'marker') && stroke.points.length > 0) {
    const pts = stroke.points;
    // Dot visual radius (rendered as a filled circle for single-point strokes
    // and very short strokes)
    const dotRadius = stroke.style.baseWidth / 2;

    // Check if all points are clustered (dot / tap) — treat as a single dot
    if (pts.length === 1 || pts.every(p =>
      (p.x - pts[0].x) ** 2 + (p.y - pts[0].y) ** 2 < dotRadius * dotRadius
    )) {
      const p = pts[0];
      const hitRadius = dotRadius; // visual radius of the dot
      for (const { point: ep, radius: er } of eraserPts) {
        const dist = Math.sqrt((p.x - ep.x) ** 2 + (p.y - ep.y) ** 2);
        if (dist < er + hitRadius) {
          return { hit: true, remaining: [] };
        }
      }
      return null;
    }

    // Collect all erased intervals in global parameter space [0, N-1]
    const erasedGlobal: [number, number][] = [];
    for (let i = 0; i < pts.length - 1; i++) {
      const segErased = computeErasedIntervals(pts[i], pts[i + 1], eraserPts);
      for (const [t1, t2] of segErased) {
        erasedGlobal.push([i + t1, i + t2]);
      }
    }
    if (erasedGlobal.length === 0) return null;

    // Merge erased intervals globally
    erasedGlobal.sort((a, b) => a[0] - b[0]);
    const merged: [number, number][] = [erasedGlobal[0]];
    for (let i = 1; i < erasedGlobal.length; i++) {
      const last = merged[merged.length - 1];
      if (erasedGlobal[i][0] <= last[1] + 1e-6) {
        last[1] = Math.max(last[1], erasedGlobal[i][1]);
      } else {
        merged.push(erasedGlobal[i]);
      }
    }

    // Compute surviving intervals (complement of merged within [0, N-1])
    const N = pts.length - 1;
    const surviving: [number, number][] = [];
    let prev = 0;
    for (const [t1, t2] of merged) {
      if (t1 > prev + 1e-6) surviving.push([prev, t1]);
      prev = Math.max(prev, t2);
    }
    if (prev < N - 1e-6) surviving.push([prev, N]);

    // Sample a point at global parameter t
    const sample = (t: number): Point => {
      const i = Math.min(Math.floor(t), pts.length - 2);
      const frac = t - i;
      if (frac < 1e-6) return pts[i];
      if (frac > 1 - 1e-6) return pts[i + 1];
      return lerpPoint(pts[i], pts[i + 1], frac);
    };

    // Convert surviving intervals to point arrays
    const fragments: Point[][] = [];
    for (const [start, end] of surviving) {
      if (end - start < 1e-6) continue;
      const frag: Point[] = [sample(start)];
      // Add all original points strictly between start and end
      const iStart = Math.ceil(start + 1e-6);
      const iEnd = Math.floor(end - 1e-6);
      for (let j = iStart; j <= iEnd; j++) {
        frag.push(pts[j]);
      }
      // Add endpoint if distinct from last point
      const endPt = sample(end);
      const last = frag[frag.length - 1];
      if (Math.abs(endPt.x - last.x) > 1e-4 || Math.abs(endPt.y - last.y) > 1e-4) {
        frag.push(endPt);
      }
      if (frag.length >= 2) fragments.push(frag);
    }

    const remaining = fragments.map((fragPts) => ({
      type: stroke.type,
      id: preview ? stroke.id : uuidv4(),
      points: fragPts,
      style: stroke.style,
      ...((stroke as FreehandStroke).geometric ? { geometric: true } : {}),
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
