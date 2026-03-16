import { Stroke, BackgroundPattern } from '@/app/types';
import { drawBackground } from './drawGrid';
import { renderAllStrokes } from './renderStroke';

export async function exportPageAsPng(
  strokes: Stroke[],
  backgroundPattern: BackgroundPattern,
  backgroundColor: string
): Promise<Blob> {
  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  const canvas = document.createElement('canvas');
  canvas.width = width * dpr;
  canvas.height = height * dpr;
  const ctx = canvas.getContext('2d')!;
  ctx.scale(dpr, dpr);

  // Draw background
  drawBackground(ctx, width, height, backgroundPattern, backgroundColor);

  // Draw strokes (images may not render if not cached)
  renderAllStrokes(ctx, strokes);

  return new Promise((resolve) => {
    canvas.toBlob(blob => resolve(blob!), 'image/png');
  });
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
