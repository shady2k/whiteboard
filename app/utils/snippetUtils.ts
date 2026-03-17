import type { Stroke, Snippet } from '@/app/types';
import { getStrokeBounds, type BoundingBox } from './strokeBounds';
import { offsetStroke as baseOffsetStroke } from './strokeTransform';
import { renderAllStrokes } from './renderStroke';
import { v4 as uuidv4 } from 'uuid';

function getCombinedBounds(strokes: Stroke[]): BoundingBox {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const s of strokes) {
    const b = getStrokeBounds(s);
    if (b.minX < minX) minX = b.minX;
    if (b.minY < minY) minY = b.minY;
    if (b.maxX > maxX) maxX = b.maxX;
    if (b.maxY > maxY) maxY = b.maxY;
  }
  return { minX, minY, maxX, maxY };
}

function offsetStrokeWithNewId(stroke: Stroke, dx: number, dy: number): Stroke {
  return { ...baseOffsetStroke(stroke, dx, dy), id: uuidv4() };
}

export function normalizeStrokes(strokes: Stroke[]): { normalized: Stroke[]; width: number; height: number } {
  if (strokes.length === 0) return { normalized: [], width: 0, height: 0 };
  const bounds = getCombinedBounds(strokes);
  const normalized = strokes.map(s => offsetStrokeWithNewId(s, -bounds.minX, -bounds.minY));
  return {
    normalized,
    width: bounds.maxX - bounds.minX,
    height: bounds.maxY - bounds.minY,
  };
}

export function denormalizeStrokes(strokes: Stroke[], targetX: number, targetY: number): Stroke[] {
  return strokes.map(s => offsetStrokeWithNewId(s, targetX, targetY));
}

export function generateSnippetThumbnail(strokes: Stroke[], width: number, height: number): string {
  const canvas = document.createElement('canvas');
  const maxDim = 200;
  const padding = 8;
  const contentW = width + padding * 2;
  const contentH = height + padding * 2;
  const scale = Math.min(maxDim / contentW, maxDim / contentH, 1);
  canvas.width = Math.ceil(contentW * scale);
  canvas.height = Math.ceil(contentH * scale);
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.scale(scale, scale);
  ctx.translate(padding, padding);
  renderAllStrokes(ctx, strokes);
  return canvas.toDataURL('image/png', 0.7);
}

export function createSnippet(name: string, strokes: Stroke[]): Snippet {
  const { normalized, width, height } = normalizeStrokes(strokes);
  const thumbnail = generateSnippetThumbnail(normalized, width, height);
  const now = new Date().toISOString();
  return {
    id: uuidv4(),
    name,
    strokes: normalized,
    width,
    height,
    thumbnail,
    createdAt: now,
    updatedAt: now,
  };
}
