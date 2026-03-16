import { FreehandStroke, Point } from '@/app/types';

const MIN_PRESSURE_FACTOR = 0.3;

function getWidth(baseWidth: number, pressure: number): number {
  return baseWidth * (MIN_PRESSURE_FACTOR + pressure * (1 - MIN_PRESSURE_FACTOR));
}

export function drawFreehandStroke(
  ctx: CanvasRenderingContext2D,
  stroke: FreehandStroke
): void {
  const { points, style } = stroke;
  if (points.length === 0) return;

  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.strokeStyle = style.color;

  if (points.length === 1) {
    const p = points[0];
    const r = getWidth(style.baseWidth, p.pressure) / 2;
    ctx.beginPath();
    ctx.arc(p.x, p.y, r, 0, Math.PI * 2);
    ctx.fillStyle = style.color;
    ctx.fill();
    return;
  }

  // Draw segments with varying width based on pressure
  for (let i = 0; i < points.length - 1; i++) {
    const p0 = points[i];
    const p1 = points[i + 1];
    const avgPressure = (p0.pressure + p1.pressure) / 2;
    const width = getWidth(style.baseWidth, avgPressure);

    ctx.lineWidth = width;
    ctx.beginPath();

    if (i === 0) {
      ctx.moveTo(p0.x, p0.y);
    } else {
      // Use midpoint of previous segment as start for smooth curve
      const prev = points[i - 1];
      const mx = (prev.x + p0.x) / 2;
      const my = (prev.y + p0.y) / 2;
      ctx.moveTo(mx, my);
    }

    // Quadratic bezier through midpoint for smoothness
    if (i < points.length - 2) {
      const mid = {
        x: (p0.x + p1.x) / 2,
        y: (p0.y + p1.y) / 2,
      };
      ctx.quadraticCurveTo(p0.x, p0.y, mid.x, mid.y);
    } else {
      ctx.lineTo(p1.x, p1.y);
    }

    ctx.stroke();
  }
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
