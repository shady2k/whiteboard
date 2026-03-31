import { Stroke, ImageStroke } from '@/app/types';
import { drawFreehandStroke, drawMarkerStroke } from './drawStroke';
import { drawLineStroke, drawRectStroke, drawTriangleStroke, drawEllipseStroke, drawAxesStroke } from './drawShape';
import { getCachedImage, loadImage } from './imageCache';
import { getStrokeBounds, type BoundingBox } from './strokeBounds';

// Cache per-stroke bounds to avoid recomputing on every redraw (strokes are immutable objects)
const boundsCache = new WeakMap<Stroke, BoundingBox>();
function getCachedBounds(stroke: Stroke): BoundingBox {
  let b = boundsCache.get(stroke);
  if (!b) {
    b = getStrokeBounds(stroke);
    boundsCache.set(stroke, b);
  }
  return b;
}

export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  onImageLoad?: () => void
): void {
  switch (stroke.type) {
    case 'freehand':
      drawFreehandStroke(ctx, stroke);
      break;
    case 'marker':
      drawMarkerStroke(ctx, stroke);
      break;
    case 'line':
      drawLineStroke(ctx, stroke);
      break;
    case 'rect':
      drawRectStroke(ctx, stroke);
      break;
    case 'triangle':
      drawTriangleStroke(ctx, stroke);
      break;
    case 'ellipse':
      drawEllipseStroke(ctx, stroke);
      break;
    case 'axes':
      drawAxesStroke(ctx, stroke);
      break;
    case 'image':
      drawImageStroke(ctx, stroke, onImageLoad);
      break;
  }
}

function drawImageStroke(
  ctx: CanvasRenderingContext2D,
  stroke: ImageStroke,
  onImageLoad?: () => void
): void {
  const img = getCachedImage(stroke.assetId);
  if (img) {
    const opacity = stroke.opacity ?? 1;
    if (opacity < 1) {
      ctx.save();
      ctx.globalAlpha = opacity;
      ctx.drawImage(img, stroke.x, stroke.y, stroke.width, stroke.height);
      ctx.restore();
    } else {
      ctx.drawImage(img, stroke.x, stroke.y, stroke.width, stroke.height);
    }
  } else if (onImageLoad) {
    loadImage(stroke.assetId, onImageLoad);
  }
}

function boundsOverlap(a: BoundingBox, b: BoundingBox): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

export function renderAllStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  onImageLoad?: () => void,
  skipStrokeId?: string,
  visibleRect?: BoundingBox
): void {
  for (const stroke of strokes) {
    if (skipStrokeId && stroke.id === skipStrokeId) continue;
    // Viewport culling: skip strokes entirely outside the visible area
    if (visibleRect) {
      const bounds = { ...getCachedBounds(stroke) };
      // Add padding for stroke width (freehand strokes extend beyond their points)
      const pad = 'style' in stroke && stroke.style ? (stroke.style as { baseWidth?: number }).baseWidth ?? 0 : 0;
      bounds.minX -= pad;
      bounds.minY -= pad;
      bounds.maxX += pad;
      bounds.maxY += pad;
      if (!boundsOverlap(bounds, visibleRect)) continue;
    }
    renderStroke(ctx, stroke, onImageLoad);
  }
}
