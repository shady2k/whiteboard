import { LineStroke, RectStroke, TriangleStroke, EllipseStroke, AxesStroke, Point, StrokeStyle, FreehandStroke } from '@/app/types';

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

export function drawAxesStroke(ctx: CanvasRenderingContext2D, stroke: AxesStroke): void {
  drawAxes(ctx, stroke.start, stroke.end, stroke.style);
}

export function drawAxesPreview(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  style: StrokeStyle
): void {
  drawAxes(ctx, start, end, style);
}

function drawAxes(ctx: CanvasRenderingContext2D, start: Point, end: Point, style: StrokeStyle): void {
  applyStyle(ctx, style);
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  const w = Math.abs(end.x - start.x);
  const h = Math.abs(end.y - start.y);

  // Origin at center of bounding box
  const ox = x + w / 2;
  const oy = y + h / 2;

  const arrowLen = Math.max(style.baseWidth * 6, Math.min(w, h) * 0.06);
  const arrowW = Math.max(style.baseWidth * 3, arrowLen * 0.5);
  const labelSize = Math.max(16, Math.min(w, h) * 0.05);

  // X axis — line stops at arrow base
  ctx.beginPath();
  ctx.moveTo(x, oy);
  ctx.lineTo(x + w - arrowLen, oy);
  ctx.stroke();

  // X arrow right
  ctx.beginPath();
  ctx.moveTo(x + w, oy);
  ctx.lineTo(x + w - arrowLen, oy - arrowW);
  ctx.lineTo(x + w - arrowLen, oy + arrowW);
  ctx.closePath();
  ctx.fillStyle = style.color;
  ctx.fill();

  // Y axis — line stops at arrow base
  ctx.beginPath();
  ctx.moveTo(ox, y + h);
  ctx.lineTo(ox, y + arrowLen);
  ctx.stroke();

  // Y arrow top
  ctx.beginPath();
  ctx.moveTo(ox, y);
  ctx.lineTo(ox - arrowW, y + arrowLen);
  ctx.lineTo(ox + arrowW, y + arrowLen);
  ctx.closePath();
  ctx.fill();

  // Labels
  ctx.fillStyle = style.color;
  ctx.font = `${labelSize}px sans-serif`;
  ctx.textAlign = 'left';
  ctx.textBaseline = 'bottom';
  ctx.fillText('x', x + w - labelSize * 0.3, oy - labelSize * 0.4);
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText('y', ox + arrowW + labelSize * 0.2, y + arrowLen * 0.4);
}

export function drawEllipsePreview(
  ctx: CanvasRenderingContext2D,
  start: Point,
  end: Point,
  style: StrokeStyle
): void {
  applyStyle(ctx, style);
  const rx = Math.abs(end.x - start.x);
  const ry = Math.abs(end.y - start.y);
  if (rx === 0 || ry === 0) return;
  ctx.beginPath();
  ctx.ellipse(start.x, start.y, rx, ry, 0, 0, Math.PI * 2);
  ctx.stroke();
}

// --- Shape to freehand conversion ---
// Rendered with geometric: true flag → thinning: 0, smoothing: 0, streamline: 0.

const P = 0.5;
const pt = (x: number, y: number): Point => ({ x, y, pressure: P });

/** Sample intermediate points along a straight edge so eraser can partially erase */
function edgePoints(a: Point, b: Point, spacing: number): Point[] {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  const steps = Math.max(1, Math.round(dist / spacing));
  const pts: Point[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    pts.push(pt(a.x + dx * t, a.y + dy * t));
  }
  return pts;
}

/**
 * Convert a shape tool result into one or more point groups.
 * Each group becomes a separate FreehandStroke with geometric: true.
 * Note: axes is NOT converted — it stays as its own type (has labels/arrows).
 */
export function shapeToPointGroups(
  tool: string,
  start: Point,
  end: Point,
  baseWidth: number,
): Point[][] | null {
  // Spacing between points — enough for partial erasing
  const sp = Math.max(baseWidth * 1.5, 6);

  if (tool === 'line') {
    return [edgePoints(pt(start.x, start.y), pt(end.x, end.y), sp)];
  }

  if (tool === 'rect') {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    const c1 = pt(x, y), c2 = pt(x + w, y), c3 = pt(x + w, y + h), c4 = pt(x, y + h);
    return [[
      ...edgePoints(c1, c2, sp),
      ...edgePoints(c2, c3, sp).slice(1),
      ...edgePoints(c3, c4, sp).slice(1),
      ...edgePoints(c4, c1, sp).slice(1),
    ]];
  }

  if (tool === 'triangle') {
    const x = Math.min(start.x, end.x);
    const y = Math.min(start.y, end.y);
    const w = Math.abs(end.x - start.x);
    const h = Math.abs(end.y - start.y);
    const t1 = pt(x + w / 2, y), t2 = pt(x + w, y + h), t3 = pt(x, y + h);
    return [[
      ...edgePoints(t1, t2, sp),
      ...edgePoints(t2, t3, sp).slice(1),
      ...edgePoints(t3, t1, sp).slice(1),
    ]];
  }

  if (tool === 'ellipse') {
    const cx = start.x;
    const cy = start.y;
    const rx = Math.abs(end.x - start.x);
    const ry = Math.abs(end.y - start.y);
    const circumference = Math.PI * (3 * (rx + ry) - Math.sqrt((3 * rx + ry) * (rx + 3 * ry)));
    const steps = Math.max(36, Math.round(circumference / sp));
    const pts: Point[] = [];
    for (let i = 0; i <= steps; i++) {
      const angle = (i / steps) * Math.PI * 2;
      pts.push(pt(cx + rx * Math.cos(angle), cy + ry * Math.sin(angle)));
    }
    return [pts];
  }

  // axes and other types are not converted
  return null;
}
