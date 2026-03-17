import { FreehandStroke, MarkerStroke, Point } from '@/app/types';
import getStroke from 'perfect-freehand';

/**
 * Convert perfect-freehand outline points into a single SVG-like path
 * using quadratic bezier curves for smoothness, then fill it.
 */
function fillOutline(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, outline: number[][], color: string): void {
  if (outline.length < 2) return;

  ctx.beginPath();
  ctx.moveTo(outline[0][0], outline[0][1]);

  for (let i = 1; i < outline.length - 1; i++) {
    const curr = outline[i];
    const next = outline[i + 1];
    const mx = (curr[0] + next[0]) / 2;
    const my = (curr[1] + next[1]) / 2;
    ctx.quadraticCurveTo(curr[0], curr[1], mx, my);
  }

  const last = outline[outline.length - 1];
  ctx.lineTo(last[0], last[1]);
  ctx.closePath();
  ctx.fillStyle = color;
  ctx.fill();
}

function pointsToInput(points: Point[]): number[][] {
  return points.map(p => [p.x, p.y, p.pressure]);
}

const PEN_OPTIONS = {
  thinning: 0.3,
  smoothing: 0.5,
  streamline: 0.5,
  simulatePressure: false,
  start: { taper: false, cap: true },
  end: { taper: false, cap: true },
  last: true,
};

const SHAPE_OPTIONS = {
  thinning: 0,
  smoothing: 0,
  streamline: 0,
  simulatePressure: false,
  start: { taper: false, cap: true },
  end: { taper: false, cap: true },
  last: true,
};

const MARKER_OPTIONS = {
  thinning: 0,        // uniform width — markers don't taper
  smoothing: 0.5,
  streamline: 0.4,
  simulatePressure: false,
  start: { taper: false },
  end: { taper: false },
};

export function drawFreehandStroke(
  ctx: CanvasRenderingContext2D,
  stroke: FreehandStroke
): void {
  const { points, style } = stroke;
  if (points.length === 0) return;

  if (points.length === 1) {
    const r = style.baseWidth / 2;
    ctx.beginPath();
    ctx.arc(points[0].x, points[0].y, r, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
    return;
  }

  const opts = stroke.geometric ? SHAPE_OPTIONS : PEN_OPTIONS;
  const outline = getStroke(pointsToInput(points), {
    size: style.baseWidth,
    ...opts,
  });

  fillOutline(ctx, outline, style.color);
}

export function drawFreehandPoints(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseWidth: number
): void {
  drawFreehandStroke(ctx, {
    type: 'freehand',
    id: '',
    points,
    style: { color, baseWidth },
  });
}

export function drawMarkerStroke(
  ctx: CanvasRenderingContext2D,
  stroke: MarkerStroke
): void {
  const { points, style } = stroke;
  if (points.length === 0) return;

  // Compute bounding box for the offscreen canvas
  const outline = getStroke(pointsToInput(points), {
    size: style.baseWidth,
    ...MARKER_OPTIONS,
  });
  if (outline.length < 2) return;

  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  for (const [x, y] of outline) {
    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x > maxX) maxX = x;
    if (y > maxY) maxY = y;
  }

  const pad = 2;
  minX -= pad; minY -= pad; maxX += pad; maxY += pad;
  const w = Math.ceil(maxX - minX);
  const h = Math.ceil(maxY - minY);
  if (w <= 0 || h <= 0) return;

  // Draw opaque on offscreen canvas, then composite with alpha
  let offscreen: OffscreenCanvas | HTMLCanvasElement;
  if (typeof OffscreenCanvas !== 'undefined') {
    offscreen = new OffscreenCanvas(w, h);
  } else {
    offscreen = document.createElement('canvas');
    offscreen.width = w;
    offscreen.height = h;
  }
  const octx = offscreen.getContext('2d')! as CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  octx.translate(-minX, -minY);
  fillOutline(octx, outline, style.color);

  ctx.save();
  ctx.globalAlpha = 0.4;
  ctx.drawImage(offscreen, minX, minY);
  ctx.restore();
}

export function drawMarkerPoints(
  ctx: CanvasRenderingContext2D,
  points: Point[],
  color: string,
  baseWidth: number
): void {
  drawMarkerStroke(ctx, {
    type: 'marker',
    id: '',
    points,
    style: { color, baseWidth },
  });
}
