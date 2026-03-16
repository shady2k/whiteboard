import { Stroke, BackgroundPattern, Page } from '@/app/types';
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

  drawBackground(ctx, width, height, backgroundPattern, backgroundColor);
  renderAllStrokes(ctx, strokes);

  return new Promise((resolve) => {
    canvas.toBlob(blob => resolve(blob!), 'image/png');
  });
}

export async function exportAllPagesAsPdf(
  pages: Page[],
  sessionName: string
): Promise<void> {
  const { jsPDF } = await import('jspdf');

  const width = window.innerWidth;
  const height = window.innerHeight;
  const dpr = window.devicePixelRatio || 1;

  // Landscape orientation matching viewport aspect ratio
  const pdf = new jsPDF({
    orientation: width > height ? 'landscape' : 'portrait',
    unit: 'px',
    format: [width, height],
  });

  for (let i = 0; i < pages.length; i++) {
    if (i > 0) pdf.addPage([width, height], width > height ? 'landscape' : 'portrait');

    const page = pages[i];
    const canvas = document.createElement('canvas');
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    drawBackground(ctx, width, height, page.backgroundPattern, page.backgroundColor);
    renderAllStrokes(ctx, page.strokes);

    const imgData = canvas.toDataURL('image/png');
    pdf.addImage(imgData, 'PNG', 0, 0, width, height);
  }

  pdf.save(`${sessionName}.pdf`);
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
