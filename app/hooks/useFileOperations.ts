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
}

export function useFileOperations({ page, strokes, sessionName, handleStrokeComplete }: UseFileOperationsArgs) {
  const [pdfPageDialog, setPdfPageDialog] = useState<{ pdf: import('pdfjs-dist').PDFDocumentProxy; numPages: number } | null>(null);

  // Upload image — offline-capable with stable local IDs
  const uploadAndCreateImageStroke = useCallback(async (file: File | Blob, mimeType?: string): Promise<ImageStroke | null> => {
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

      const maxW = window.innerWidth * 0.6;
      const maxH = window.innerHeight * 0.6;
      let w = dims.width;
      let h = dims.height;
      if (w > maxW) { h *= maxW / w; w = maxW; }
      if (h > maxH) { w *= maxH / h; h = maxH; }

      const x = (window.innerWidth - w) / 2;
      const y = (window.innerHeight - h) / 2;

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
  }, [page?.id]);

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
      const viewport = pdfPage.getViewport({ scale: 2 });

      const canvas = document.createElement('canvas');
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext('2d')!;

      await pdfPage.render({ canvasContext: ctx, viewport, canvas } as never).promise;

      const blob = await new Promise<Blob>((resolve) =>
        canvas.toBlob(b => resolve(b!), 'image/png')
      );

      const stroke = await uploadAndCreateImageStroke(blob, 'image/png');
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

      for (const file of Array.from(files)) {
        if (file.type.startsWith('image/')) {
          const stroke = await uploadAndCreateImageStroke(file);
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
