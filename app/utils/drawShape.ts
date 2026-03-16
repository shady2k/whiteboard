import { LineStroke, RectStroke, TriangleStroke, EllipseStroke, Point, StrokeStyle } from '@/app/types';

function applyStyle(ctx: CanvasRenderingContext2D, style: StrokeStyle) {
  ctx.strokeStyle = style.color;
  ctx.lineWidth = style.baseWidth;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
}

export function drawLineStroke(ctx: CanvasRenderingContext2D, stroke: LineStroke): void {
  applyStyle(ctx, stroke.style);
  ctx.beginPath();
  ctx.moveTo(stroke.start.x, stroke.start.y);
  ctx.lineTo(stroke.end.x, stroke.end.y);
  ctx.stroke();
}

export function drawRectStroke(ctx: CanvasRenderingContext2D, stroke: RectStroke): void {
  applyStyle(ctx, stroke.style);
  const x = Math.min(stroke.start.x, stroke.end.x);
  const y = Math.min(stroke.start.y, stroke.end.y);
  const w = Math.abs(stroke.end.x - stroke.start.x);
  const h = Math.abs(stroke.end.y - stroke.start.y);
  ctx.strokeRect(x, y, w, h);
}

export function drawTriangleStroke(ctx: CanvasRenderingContext2D, stroke: TriangleStroke): void {
  applyStyle(ctx, stroke.style);
  const x = Math.min(stroke.start.x, stroke.end.x);
  const y = Math.min(stroke.start.y, stroke.end.y);
  const w = Math.abs(stroke.end.x - stroke.start.x);
  const h = Math.abs(stroke.end.y - stroke.start.y);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.stroke();
}

export function drawEllipseStroke(ctx: CanvasRenderingContext2D, stroke: EllipseStroke): void {
  applyStyle(ctx, stroke.style);
  ctx.beginPath();
  ctx.ellipse(stroke.center.x, stroke.center.y, stroke.radiusX, stroke.radiusY, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// Preview helpers for drawing shapes from two points (during drag)
export function drawLinePreview(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  style: StrokeStyle
): void {
  applyStyle(ctx, style);
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

export function drawRectPreview(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  style: StrokeStyle
): void {
  applyStyle(ctx, style);
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  ctx.strokeRect(x, y, w, h);
}

export function drawTrianglePreview(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  style: StrokeStyle
): void {
  applyStyle(ctx, style);
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);
  ctx.beginPath();
  ctx.moveTo(x + w / 2, y);
  ctx.lineTo(x + w, y + h);
  ctx.lineTo(x, y + h);
  ctx.closePath();
  ctx.stroke();
}

export function drawEllipsePreview(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  style: StrokeStyle
): void {
  applyStyle(ctx, style);
  const cx = (start.x + end.x) / 2;
  const cy = (start.y + end.y) / 2;
  const rx = Math.abs(end.x - start.x) / 2;
  const ry = Math.abs(end.y - start.y) / 2;
  if (rx === 0 || ry === 0) return;
  ctx.beginPath();
  ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}
