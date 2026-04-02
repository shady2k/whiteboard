import { useState, useCallback, useEffect } from 'react';
import { Stroke, Page, ImageStroke } from '@/app/types';
import { putAsset } from '@/app/lib/idb';
import { v4 as uuidv4 } from 'uuid';
import { exportPageAsPng, exportAllPagesAsPdf, downloadBlob } from '@/app/utils/exportPage';

async function loadPdfDocument(file: File | Blob): Promise<import('pdfjs-dist').PDFDocumentProxy> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';
  const arrayBuffer = file instanceof File ? await file.arrayBuffer() : await file.arrayBuffer();
  return pdfjsLib.getDocument({ data: arrayBuffer }).promise;
}

function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new globalThis.Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 400, height: 300 });
    img.src = url;
  });
}

async function computeContentHash(blob: Blob): Promise<string> {
  const slice = blob.slice(0, 65536);
  const buf = await slice.arrayBuffer();
  const hash = await crypto.subtle.digest('SHA-256', buf);
  return Array.from(new Uint8Array(hash))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface UseFileOperationsArgs {
  page: Page | null;
  strokes: Stroke[];
  sessionName: string;
  handleStrokeComplete: (stroke: Stroke) => void;
  screenToCanvas: (sx: number, sy: number) => { x: number; y: number };
  mouseRef: React.RefObject<{ x: number; y: number }>;
  scaleRef: React.RefObject<number>;
}

export function useFileOperations({ page, strokes, sessionName, handleStrokeComplete, screenToCanvas, mouseRef, scaleRef }: UseFileOperationsArgs) {
  const [pdfPageDialog, setPdfPageDialog] = useState<{ pdf: import('pdfjs-dist').PDFDocumentProxy; numPages: number } | null>(null);

  // Upload image — offline-capable with stable local IDs
  // screenPos: optional screen coordinates to place the image at (defaults to current mouse position)
  const uploadAndCreateImageStroke = useCallback(async (file: File | Blob, mimeType?: string, screenPos?: { x: number; y: number }, targetScreenWidth?: number): Promise<ImageStroke | null> => {
    const pageId = page?.id;
    if (!pageId) return null;

    try {
      // Generate stable local ID
      const localAssetId = `local-${uuidv4()}`;
      const blob = file instanceof Blob ? file : file;
      const contentHash = await computeContentHash(blob);

      // Store blob in IDB
      await putAsset({
        id: localAssetId,
        blob,
        mimeType: mimeType || file.type || 'image/png',
        cachedAt: Date.now(),
        pendingUpload: true,
        contentHash,
      });

      const url = URL.createObjectURL(file);
      const dims = await getImageDimensions(url);
      URL.revokeObjectURL(url);

      // Divide by current zoom so content appears the same on-screen size
      // regardless of zoom level (always readable as if at 100%)
      const scale = scaleRef.current;
      let w: number;
      let h: number;

      if (targetScreenWidth) {
        // Document mode: size by readable target width
        const aspect = dims.height / dims.width;
        w = targetScreenWidth / scale;
        h = w * aspect;
      } else {
        // Image mode: use natural dimensions, clamp to viewport
        w = dims.width / scale;
        h = dims.height / scale;
        const maxW = window.innerWidth / scale;
        const maxH = window.innerHeight / scale;
        if (w > maxW) { h *= maxW / w; w = maxW; }
        if (h > maxH) { w *= maxH / h; h = maxH; }
      }

      // Place at cursor position (screen coords → canvas coords), centered on cursor
      const pos = screenPos ?? mouseRef.current;
      const canvasPos = screenToCanvas(pos.x, pos.y);
      const x = canvasPos.x - w / 2;
      const y = canvasPos.y - h / 2;

      const stroke: ImageStroke = {
        type: 'image',
        id: uuidv4(),
        assetId: localAssetId,
        x, y,
        width: w,
        height: h,
      };

      return stroke;
    } catch (e) {
      console.error('Failed to create image stroke:', e);
      return null;
    }
  }, [page?.id, screenToCanvas, mouseRef, scaleRef]);

  // Clipboard paste handler
  useEffect(() => {
    const handlePaste = async (e: ClipboardEvent) => {
      const items = e.clipboardData?.items;
      if (!items) return;

      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          e.preventDefault();
          const blob = item.getAsFile();
          if (!blob) continue;

          const stroke = await uploadAndCreateImageStroke(blob);
          if (stroke) {
            handleStrokeComplete(stroke);
          }
          return;
        }
      }
    };

    document.addEventListener('paste', handlePaste);
    return () => document.removeEventListener('paste', handlePaste);
  }, [uploadAndCreateImageStroke, handleStrokeComplete]);

  // Import selected PDF pages as image strokes
  const importPdfPages = useCallback(async (pdf: import('pdfjs-dist').PDFDocumentProxy, pageNumbers: number[]) => {
    for (let idx = 0; idx < pageNumbers.length; idx++) {
      const pageNum = pageNumbers[idx];
      const pdfPage = await pdf.getPage(pageNum);
      // Use page dimensions at scale 1 (72 DPI) for aspect ratio
      const baseViewport = pdfPage.getViewport({ scale: 1 });
      // Readable target: map 72 DPI PDF units to 96 DPI screen px, then bump to ~950px min
      const targetScreenWidth = Math.max(950, baseViewport.width * (96 / 72));
      // Rasterize at high res for crispness, capped to avoid memory spikes
      const maxRenderWidth = 4096;
      const idealRenderWidth = targetScreenWidth * window.devicePixelRatio;
      const renderScale = Math.min(idealRenderWidth, maxRenderWidth) / baseViewport.width;
      const renderViewport = pdfPage.getViewport({ scale: renderScale });

      const canvas = document.createElement('canvas');
      canvas.width = renderViewport.width;
      canvas.height = renderViewport.height;
      const ctx = canvas.getContext('2d')!;

      await pdfPage.render({ canvasContext: ctx, viewport: renderViewport, canvas } as never).promise;

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob(b => resolve(b!), 'image/png')
      );

      const stroke = await uploadAndCreateImageStroke(blob, 'image/png', undefined, targetScreenWidth);
      if (stroke) {
        if (idx > 0) {
          stroke.y = stroke.y + idx * (stroke.height + 20);
        }
        handleStrokeComplete(stroke);
      }
    }
  }, [uploadAndCreateImageStroke, handleStrokeComplete]);

  // File import handler (images + PDFs)
  const handleImportFile = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,.pdf,application/pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      if (file.type.startsWith('image/')) {
        const stroke = await uploadAndCreateImageStroke(file);
        if (stroke) handleStrokeComplete(stroke);
        return;
      }

      if (file.type === 'application/pdf' || file.name.endsWith('.pdf')) {
        try {
          const pdf = await loadPdfDocument(file);

          if (pdf.numPages === 1) {
            await importPdfPages(pdf, [1]);
          } else {
            setPdfPageDialog({ pdf, numPages: pdf.numPages });
          }
        } catch (e) {
          console.error('Failed to import PDF:', e);
          alert('Failed to import PDF. Please try again.');
        }
      }
    };
    input.click();
  }, [uploadAndCreateImageStroke, handleStrokeComplete, importPdfPages]);

  // Drag and drop handler
  useEffect(() => {
    const handleDragOver = (e: DragEvent) => {
      e.preventDefault();
      e.dataTransfer!.dropEffect = 'copy';
    };

    const handleDrop = async (e: DragEvent) => {
      e.preventDefault();
      const files = e.dataTransfer?.files;
      if (!files?.length) return;

      const dropPos = { x: e.clientX, y: e.clientY };
      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          const stroke = await uploadAndCreateImageStroke(file, undefined, dropPos);
          if (stroke) handleStrokeComplete(stroke);
        } else if (file.type === 'application/pdf') {
          try {
            const pdf = await loadPdfDocument(file);

            if (pdf.numPages === 1) {
              await importPdfPages(pdf, [1]);
            } else {
              setPdfPageDialog({ pdf, numPages: pdf.numPages });
            }
          } catch (err) {
            console.error('PDF drop import failed:', err);
          }
        }
      }
    };

    document.addEventListener('dragover', handleDragOver);
    document.addEventListener('drop', handleDrop);
    return () => {
      document.removeEventListener('dragover', handleDragOver);
      document.removeEventListener('drop', handleDrop);
    };
  }, [uploadAndCreateImageStroke, handleStrokeComplete, importPdfPages]);

  const handleExportPng = useCallback(async () => {
    if (!page) return;
    const blob = await exportPageAsPng(strokes, page.backgroundPattern, page.backgroundColor);
    downloadBlob(blob, `${sessionName}.png`);
  }, [page, strokes, sessionName]);

  const handleExportPdf = useCallback(async () => {
    if (!page) return;
    await exportAllPagesAsPdf([page], sessionName);
  }, [page, sessionName]);

  return {
    handleImportFile,
    handleExportPng,
    handleExportPdf,
    pdfPageDialog,
    setPdfPageDialog,
    importPdfPages,
  };
}
