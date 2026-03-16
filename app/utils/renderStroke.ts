import { Stroke, ImageStroke } from '@/app/types';
import { drawFreehandStroke } from './drawStroke';
import { drawLineStroke, drawRectStroke, drawEllipseStroke } from './drawShape';
import { getCachedImage, loadImage } from './imageCache';

export function renderStroke(
  ctx: CanvasRenderingContext2D,
  stroke: Stroke,
  onImageLoad?: () => void
): void {
  switch (stroke.type) {
    case 'freehand':
      drawFreehandStroke(ctx, stroke);
      break;
    case 'line':
      drawLineStroke(ctx, stroke);
      break;
    case 'rect':
      drawRectStroke(ctx, stroke);
      break;
    case 'ellipse':
      drawEllipseStroke(ctx, stroke);
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

export function renderAllStrokes(
  ctx: CanvasRenderingContext2D,
  strokes: Stroke[],
  onImageLoad?: () => void,
  skipStrokeId?: string
): void {
  for (const stroke of strokes) {
    if (skipStrokeId && stroke.id === skipStrokeId) continue;
    renderStroke(ctx, stroke, onImageLoad);
  }
}
