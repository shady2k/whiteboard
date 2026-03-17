import { BackgroundPattern } from '@/app/types';

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pattern: BackgroundPattern,
  color: string,
  startX: number = 0,
  startY: number = 0
): void {
  // Fill background color
  ctx.fillStyle = color;
  ctx.fillRect(startX, startY, width, height);

  if (pattern === 'blank') return;

  const endX = startX + width;
  const endY = startY + height;

  // Determine line color based on background brightness
  const isDark = isColorDark(color);
  const lineColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const strongLineColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const dotColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';

  switch (pattern) {
    case 'grid':
      drawGrid(ctx, startX, startY, endX, endY, lineColor, strongLineColor);
      break;
    case 'dotgrid':
      drawDotGrid(ctx, startX, startY, endX, endY, dotColor);
      break;
    case 'ruled':
      drawRuled(ctx, startX, startY, endX, endY, lineColor, strongLineColor);
      break;
  }
}

function isColorDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function snapFloor(value: number, step: number): number {
  return Math.floor(value / step) * step;
}

function snapCeil(value: number, step: number): number {
  return Math.ceil(value / step) * step;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  lineColor: string,
  strongLineColor: string
): void {
  const smallStep = 20;
  const bigStep = 100;

  const x0 = snapFloor(startX, smallStep);
  const y0 = snapFloor(startY, smallStep);
  const x1 = snapCeil(endX, smallStep);
  const y1 = snapCeil(endY, smallStep);

  // Small grid
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = x0; x <= x1; x += smallStep) {
    if (x % bigStep === 0) continue;
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }
  for (let y = y0; y <= y1; y += smallStep) {
    if (y % bigStep === 0) continue;
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();

  // Large grid
  const bx0 = snapFloor(startX, bigStep);
  const by0 = snapFloor(startY, bigStep);
  const bx1 = snapCeil(endX, bigStep);
  const by1 = snapCeil(endY, bigStep);

  ctx.strokeStyle = strongLineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = bx0; x <= bx1; x += bigStep) {
    ctx.moveTo(x, startY);
    ctx.lineTo(x, endY);
  }
  for (let y = by0; y <= by1; y += bigStep) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();
}

function drawDotGrid(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  dotColor: string
): void {
  const step = 20;
  const dotRadius = 1;

  const x0 = snapFloor(startX, step);
  const y0 = snapFloor(startY, step);
  const x1 = snapCeil(endX, step);
  const y1 = snapCeil(endY, step);

  ctx.fillStyle = dotColor;
  for (let x = x0; x <= x1; x += step) {
    for (let y = y0; y <= y1; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRuled(
  ctx: CanvasRenderingContext2D,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  lineColor: string,
  strongLineColor: string
): void {
  const step = 32;

  const y0 = snapFloor(startY, step);
  const y1 = snapCeil(endY, step);

  // Horizontal ruled lines
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let y = y0; y <= y1; y += step) {
    ctx.moveTo(startX, y);
    ctx.lineTo(endX, y);
  }
  ctx.stroke();

  // Left margin line
  ctx.strokeStyle = strongLineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, startY);
  ctx.lineTo(80, endY);
  ctx.stroke();
}
