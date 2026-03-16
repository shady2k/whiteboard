import { BackgroundPattern } from '@/app/types';

export function drawBackground(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  pattern: BackgroundPattern,
  color: string
): void {
  // Fill background color
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);

  if (pattern === 'blank') return;

  // Determine line color based on background brightness
  const isDark = isColorDark(color);
  const lineColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.08)';
  const strongLineColor = isDark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.15)';
  const dotColor = isDark ? 'rgba(255,255,255,0.2)' : 'rgba(0,0,0,0.15)';

  switch (pattern) {
    case 'grid':
      drawGrid(ctx, width, height, lineColor, strongLineColor);
      break;
    case 'dotgrid':
      drawDotGrid(ctx, width, height, dotColor);
      break;
    case 'ruled':
      drawRuled(ctx, width, height, lineColor, strongLineColor);
      break;
  }
}

function isColorDark(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}

function drawGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lineColor: string,
  strongLineColor: string
): void {
  const smallStep = 20;
  const bigStep = 100;

  // Small grid
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let x = smallStep; x < width; x += smallStep) {
    if (x % bigStep === 0) continue;
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = smallStep; y < height; y += smallStep) {
    if (y % bigStep === 0) continue;
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // Large grid
  ctx.strokeStyle = strongLineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let x = bigStep; x < width; x += bigStep) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = bigStep; y < height; y += bigStep) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();
}

function drawDotGrid(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  dotColor: string
): void {
  const step = 20;
  const dotRadius = 1;

  ctx.fillStyle = dotColor;
  for (let x = step; x < width; x += step) {
    for (let y = step; y < height; y += step) {
      ctx.beginPath();
      ctx.arc(x, y, dotRadius, 0, Math.PI * 2);
      ctx.fill();
    }
  }
}

function drawRuled(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  lineColor: string,
  strongLineColor: string
): void {
  const step = 32;

  // Horizontal ruled lines
  ctx.strokeStyle = lineColor;
  ctx.lineWidth = 0.5;
  ctx.beginPath();
  for (let y = step; y < height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  // Left margin line
  ctx.strokeStyle = strongLineColor;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(80, 0);
  ctx.lineTo(80, height);
  ctx.stroke();
}
