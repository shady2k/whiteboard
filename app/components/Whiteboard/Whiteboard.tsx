'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Stroke, ToolType, StrokeStyle, Command, Page, BackgroundPattern, ImageStroke } from '@/app/types';
import Canvas from '@/app/components/Canvas/Canvas';
import Toolbar from '@/app/components/Toolbar/Toolbar';
import PageNav from '@/app/components/PageNav/PageNav';
import { useIDBState } from '@/app/hooks/useIDBState';
import { useSyncEngine } from '@/app/hooks/useSyncEngine';
import { saveUndoHistory, loadUndoHistory, putAsset } from '@/app/lib/idb';
import { v4 as uuidv4 } from 'uuid';
import { exportPageAsPng, exportAllPagesAsPdf, downloadBlob } from '@/app/utils/exportPage';
import { drawBackground } from '@/app/utils/drawGrid';
import { renderAllStrokes } from '@/app/utils/renderStroke';
import Image from 'next/image';

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

interface WhiteboardProps {
  sessionId: string;
  initialPages: Page[];
  sessionName: string;
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export default function Whiteboard({ sessionId, initialPages, sessionName: initialName }: WhiteboardProps) {
  const { page, setPage, isOffline } = useIDBState(sessionId, initialPages, initialName);
  const { queuePageSync, queueBackgroundSync, tryThumbnailSync, isOnline, isSyncing } = useSyncEngine(sessionId);

  const [sessionName] = useState(initialName);
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>({
    color: '#000000',
    baseWidth: 4,
  });
  const [markerStyle, setMarkerStyle] = useState<StrokeStyle>({
    color: '#facc15',
    baseWidth: 24,
  });
  const [zoom, setZoom] = useState(1);
  const [panOffset, setPanOffset] = useState({ x: 0, y: 0 });
  const [showCheatsheet, setShowCheatsheet] = useState(false);

  const strokes = useMemo(() => page?.strokes ?? [], [page?.strokes]);

  // Undo/redo stacks
  const [undoStack, setUndoStack] = useState<Command[]>([]);
  const [redoStack, setRedoStack] = useState<Command[]>([]);

  const strokesRef = useRef(strokes);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);

  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

  // Restore undo history from IDB on mount
  useEffect(() => {
    loadUndoHistory(sessionId).then((history) => {
      if (history) {
        setUndoStack(history.undoStack);
        setRedoStack(history.redoStack);
      }
    }).catch(() => {});
  }, [sessionId]);

  // Persist undo history to IDB (debounced)
  const undoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (undoSaveTimerRef.current) clearTimeout(undoSaveTimerRef.current);
    undoSaveTimerRef.current = setTimeout(() => {
      saveUndoHistory(sessionId, undoStack, redoStack).catch(() => {});
    }, 1000);
    return () => {
      if (undoSaveTimerRef.current) clearTimeout(undoSaveTimerRef.current);
    };
  }, [sessionId, undoStack, redoStack]);

  // Generate and save thumbnail
  const thumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const generateAndSaveThumbRef = useRef<() => void>(null);
  const generateAndSaveThumb = useCallback(() => {
    try {
      const canvas = document.createElement('canvas');
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const tw = 360;
      const th = Math.round(tw * (vh / vw));
      canvas.width = tw;
      canvas.height = th;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.scale(tw / vw, th / vh);
      drawBackground(ctx, vw, vh, page?.backgroundPattern || 'blank', page?.backgroundColor || '#ffffff');
      renderAllStrokes(ctx, strokesRef.current, () => {
        generateAndSaveThumbRef.current?.();
      });
      const dataUrl = canvas.toDataURL('image/png', 0.7);
      tryThumbnailSync(dataUrl);
    } catch {}
  }, [page, tryThumbnailSync]);
  useEffect(() => { generateAndSaveThumbRef.current = generateAndSaveThumb; }, [generateAndSaveThumb]);

  const saveThumbnail = useCallback(() => {
    if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    thumbTimerRef.current = setTimeout(generateAndSaveThumb, 2000);
  }, [generateAndSaveThumb]);

  useEffect(() => {
    saveThumbnail();
  }, [strokes, saveThumbnail, page?.backgroundPattern, page?.backgroundColor]);

  const updatePageStrokes = useCallback((pageId: string, updater: (strokes: Stroke[]) => Stroke[]) => {
    setPage(prev => {
      if (prev.id !== pageId) return prev;
      return { ...prev, strokes: updater(prev.strokes) };
    });
  }, [setPage]);

  const pushCommand = useCallback((cmd: Command) => {
    setUndoStack(prev => [...prev, cmd]);
    setRedoStack([]);
  }, []);

  const handleStrokeComplete = useCallback((stroke: Stroke) => {
    const pageId = page?.id;
    if (!pageId) return;
    updatePageStrokes(pageId, s => [...s, stroke]);
    pushCommand({ type: 'createStroke', pageId, stroke });
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
  }, [page?.id, updatePageStrokes, pushCommand, queuePageSync]);

  const handleStrokeDelete = useCallback((strokeId: string) => {
    const pageId = page?.id;
    if (!pageId) return;
    const stroke = strokes.find(s => s.id === strokeId);
    if (!stroke) return;
    updatePageStrokes(pageId, s => s.filter(st => st.id !== strokeId));
    pushCommand({ type: 'deleteStroke', pageId, strokeId, stroke });
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
  }, [page?.id, strokes, updatePageStrokes, pushCommand, queuePageSync]);

  const undo = useCallback(() => {
    setUndoStack(prev => {
      if (prev.length === 0) return prev;
      const cmd = prev[prev.length - 1];
      const rest = prev.slice(0, -1);

      switch (cmd.type) {
        case 'createStroke':
        case 'pasteImage':
          updatePageStrokes(cmd.pageId, s => s.filter(st => st.id !== cmd.stroke.id));
          break;
        case 'deleteStroke':
          updatePageStrokes(cmd.pageId, s => [...s, cmd.stroke]);
          break;
        case 'clearPage':
          updatePageStrokes(cmd.pageId, () => cmd.strokes);
          break;
        case 'setPageBackground':
          setPage(p => p.id === cmd.pageId
            ? { ...p, backgroundPattern: cmd.oldPattern, backgroundColor: cmd.oldColor }
            : p
          );
          // Background change via sync engine
          setTimeout(() => { if (pageRef.current) queueBackgroundSync(pageRef.current); }, 0);
          break;
        case 'transformImageStroke':
          updatePageStrokes(cmd.pageId, s => s.map(st => st.id === cmd.strokeId ? cmd.oldStroke : st));
          break;
      }

      setRedoStack(r => [...r, cmd]);
      setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
      return rest;
    });
  }, [updatePageStrokes, setPage, queuePageSync, queueBackgroundSync]);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const cmd = prev[prev.length - 1];
      const rest = prev.slice(0, -1);

      switch (cmd.type) {
        case 'createStroke':
        case 'pasteImage':
          updatePageStrokes(cmd.pageId, s => [...s, cmd.stroke]);
          break;
        case 'deleteStroke':
          updatePageStrokes(cmd.pageId, s => s.filter(st => st.id !== cmd.strokeId));
          break;
        case 'clearPage':
          updatePageStrokes(cmd.pageId, () => []);
          break;
        case 'setPageBackground':
          setPage(p => p.id === cmd.pageId
            ? { ...p, backgroundPattern: cmd.newPattern, backgroundColor: cmd.newColor }
            : p
          );
          setTimeout(() => { if (pageRef.current) queueBackgroundSync(pageRef.current); }, 0);
          break;
        case 'transformImageStroke':
          updatePageStrokes(cmd.pageId, s => s.map(st => st.id === cmd.strokeId ? cmd.newStroke : st));
          break;
      }

      setUndoStack(u => [...u, cmd]);
      setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
      return rest;
    });
  }, [updatePageStrokes, setPage, queuePageSync, queueBackgroundSync]);

  const handleBackgroundPatternChange = useCallback(async (pattern: BackgroundPattern) => {
    const pageId = page?.id;
    if (!pageId) return;
    const oldPattern = page.backgroundPattern;
    const oldColor = page.backgroundColor;
    pushCommand({ type: 'setPageBackground', pageId, oldPattern, oldColor, newPattern: pattern, newColor: oldColor });
    setPage(p => ({ ...p, backgroundPattern: pattern }));
    setTimeout(() => { if (pageRef.current) queueBackgroundSync(pageRef.current); }, 0);
  }, [page, pushCommand, setPage, queueBackgroundSync]);

  const handleBackgroundColorChange = useCallback(async (color: string) => {
    const pageId = page?.id;
    if (!pageId) return;
    const oldPattern = page.backgroundPattern;
    const oldColor = page.backgroundColor;
    pushCommand({ type: 'setPageBackground', pageId, oldPattern, oldColor, newPattern: oldPattern, newColor: color });
    setPage(p => ({ ...p, backgroundColor: color }));
    setTimeout(() => { if (pageRef.current) queueBackgroundSync(pageRef.current); }, 0);
  }, [page, pushCommand, setPage, queueBackgroundSync]);

  const clearCanvas = useCallback(() => {
    if (!page || strokes.length === 0) return;
    pushCommand({ type: 'clearPage', pageId: page.id, strokes: [...strokes] });
    updatePageStrokes(page.id, () => []);
    queuePageSync({ ...page, strokes: [] });
  }, [page, strokes, pushCommand, updatePageStrokes, queuePageSync]);

  // Zoom controls
  const zoomIn = useCallback(() => {
    setZoom(z => {
      const nextStep = ZOOM_STEPS.find(s => s > z + 0.01);
      return nextStep ?? z;
    });
  }, []);

  const zoomOut = useCallback(() => {
    setZoom(z => {
      const prevStep = [...ZOOM_STEPS].reverse().find(s => s < z - 0.01);
      return prevStep ?? z;
    });
  }, []);

  const zoomReset = useCallback(() => {
    setZoom(1);
    setPanOffset({ x: 0, y: 0 });
  }, []);

  const handleExportPngRef = useRef<() => void>(() => {});
  const handleExportPdfRef = useRef<() => void>(() => {});
  const handleImportFileRef = useRef<() => void>(() => {});

  const [pdfPageDialog, setPdfPageDialog] = useState<{ pdf: import('pdfjs-dist').PDFDocumentProxy; numPages: number } | null>(null);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;

      if (isCmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (isCmd && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (isCmd && e.key === 'y') {
        e.preventDefault();
        redo();
      } else if (isCmd && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
      } else if (isCmd && e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (isCmd && e.key === '0') {
        e.preventDefault();
        zoomReset();
      } else if (isCmd && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        handleExportPngRef.current();
      } else if (isCmd && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleExportPdfRef.current();
      } else if (isCmd && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        handleImportFileRef.current();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowCheatsheet(v => {
          if (v) return false;
          setActiveTool('pen');
          return false;
        });
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowCheatsheet(v => !v);
      } else if (e.key === '1' && !isCmd) {
        setStrokeStyle(s => ({ ...s, baseWidth: 2 }));
      } else if (e.key === '2' && !isCmd) {
        setStrokeStyle(s => ({ ...s, baseWidth: 4 }));
      } else if (e.key === '3' && !isCmd) {
        setStrokeStyle(s => ({ ...s, baseWidth: 8 }));
      } else if (e.key === '4' && !isCmd) {
        setStrokeStyle(s => ({ ...s, baseWidth: 16 }));
      } else if (!isCmd && !e.altKey && !e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'p': setActiveTool('pen'); break;
          case 'm': setActiveTool('marker'); break;
          case 'e': setActiveTool('eraser'); break;
          case 'h': setActiveTool('hand'); break;
          case 'l': setActiveTool('line'); break;
          case 'r': setActiveTool('rect'); break;
          case 't': setActiveTool('triangle'); break;
          case 'o': setActiveTool('ellipse'); break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, zoomIn, zoomOut, zoomReset]);

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

  useEffect(() => { handleExportPngRef.current = handleExportPng; }, [handleExportPng]);
  useEffect(() => { handleExportPdfRef.current = handleExportPdf; }, [handleExportPdf]);
  useEffect(() => { handleImportFileRef.current = handleImportFile; }, [handleImportFile]);

  const handleImageTransform = useCallback((strokeId: string, newStroke: ImageStroke) => {
    const pageId = page?.id;
    if (!pageId) return;
    const oldStroke = strokes.find(s => s.id === strokeId) as ImageStroke | undefined;
    if (!oldStroke) return;
    pushCommand({ type: 'transformImageStroke', pageId, strokeId, oldStroke, newStroke });
    updatePageStrokes(pageId, s => s.map(st => st.id === strokeId ? newStroke : st));
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
  }, [page?.id, strokes, pushCommand, updatePageStrokes, queuePageSync]);

  if (!page) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#16161a' }}>
        <div className="text-neutral-500 text-sm flex flex-col items-center gap-3">
          <div className="w-6 h-6 rounded-full border-2 border-neutral-600 border-t-neutral-400 animate-spin" />
          Loading whiteboard...
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Offline indicator */}
      {(isOffline || !isOnline) && (
        <div className="fixed top-3 left-1/2 -translate-x-1/2 z-[90] px-3 py-1.5 rounded-lg bg-amber-600/90 text-white text-xs font-medium backdrop-blur-sm shadow-lg">
          Offline — changes saved locally
        </div>
      )}
      {isSyncing && isOnline && (
        <div className="fixed top-3 right-3 z-[90] px-2 py-1 rounded bg-blue-600/80 text-white text-[10px] backdrop-blur-sm">
          Syncing...
        </div>
      )}
      <Canvas
        strokes={strokes}
        activeTool={activeTool}
        strokeStyle={activeTool === 'marker' ? markerStyle : strokeStyle}
        backgroundColor={page.backgroundColor}
        backgroundPattern={page.backgroundPattern}
        scale={zoom}
        panOffset={panOffset}
        onStrokeComplete={handleStrokeComplete}
        onStrokeDelete={handleStrokeDelete}
        onImageTransform={handleImageTransform}
        onToolChange={setActiveTool}
        onZoomChange={setZoom}
        onPanChange={setPanOffset}
      />
      <Toolbar
        activeTool={activeTool}
        strokeStyle={strokeStyle}
        markerStyle={markerStyle}
        backgroundPattern={page.backgroundPattern}
        backgroundColor={page.backgroundColor}
        onToolChange={setActiveTool}
        onColorChange={color => {
          if (activeTool === 'marker') setMarkerStyle(s => ({ ...s, color }));
          else setStrokeStyle(s => ({ ...s, color }));
        }}
        onWidthChange={baseWidth => {
          if (activeTool === 'marker') setMarkerStyle(s => ({ ...s, baseWidth }));
          else setStrokeStyle(s => ({ ...s, baseWidth }));
        }}
        onBackgroundPatternChange={handleBackgroundPatternChange}
        onBackgroundColorChange={handleBackgroundColorChange}
        onUndo={undo}
        onRedo={redo}
        onClear={clearCanvas}
        onImportFile={handleImportFile}
        onExportPng={handleExportPng}
        onExportPdf={handleExportPdf}
        onShowCheatsheet={() => setShowCheatsheet(true)}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
      />
      <PageNav
        sessionName={sessionName}
        zoom={zoom}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={zoomReset}
        strokes={strokes}
        backgroundPattern={page.backgroundPattern}
        backgroundColor={page.backgroundColor}
      />
      {pdfPageDialog && (
        <PdfPageDialog
          pdf={pdfPageDialog.pdf}
          numPages={pdfPageDialog.numPages}
          onConfirm={async (pages) => {
            await importPdfPages(pdfPageDialog.pdf, pages);
            setPdfPageDialog(null);
          }}
          onCancel={() => setPdfPageDialog(null)}
        />
      )}
      {showCheatsheet && <Cheatsheet onClose={() => setShowCheatsheet(false)} />}
    </>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = isMac ? '\u2318' : 'Ctrl';
const SHIFT = isMac ? '\u21E7' : 'Shift';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded bg-neutral-700/60 text-neutral-300 text-[11px] font-mono leading-none border border-neutral-600/40">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-neutral-400 text-sm">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
      </span>
    </div>
  );
}

function Cheatsheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-neutral-900/95 border border-neutral-700/50 rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-semibold m-0">Keyboard Shortcuts</h2>
          <button
            className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/10 transition-colors border-none bg-transparent cursor-pointer"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
          {/* Tools */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Tools</div>
            <ShortcutRow keys={['H']} label="Hand / Pan" />
            <ShortcutRow keys={['P']} label="Pen" />
            <ShortcutRow keys={['M']} label="Marker" />
            <ShortcutRow keys={['E']} label="Eraser" />
            <ShortcutRow keys={['L']} label="Line" />
            <ShortcutRow keys={['R']} label="Rectangle" />
            <ShortcutRow keys={['T']} label="Triangle" />
            <ShortcutRow keys={['O']} label="Ellipse" />
            <ShortcutRow keys={['Esc']} label="Back to Pen" />
          </div>

          {/* Stroke width */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Stroke Width</div>
            <ShortcutRow keys={['1']} label="Thin (2px)" />
            <ShortcutRow keys={['2']} label="Normal (4px)" />
            <ShortcutRow keys={['3']} label="Thick (8px)" />
            <ShortcutRow keys={['4']} label="Heavy (16px)" />
          </div>

          {/* Navigation */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Navigation</div>
            <ShortcutRow keys={[MOD, '+']} label="Zoom in" />
            <ShortcutRow keys={[MOD, '\u2212']} label="Zoom out" />
            <ShortcutRow keys={[MOD, '0']} label="Reset zoom & pan" />
            <ShortcutRow keys={['Space', 'Drag']} label="Pan canvas" />
            <ShortcutRow keys={['Scroll']} label="Pan canvas" />
            <ShortcutRow keys={[MOD, 'Scroll']} label="Zoom" />
          </div>

          {/* Edit */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Edit</div>
            <ShortcutRow keys={[MOD, 'Z']} label="Undo" />
            <ShortcutRow keys={[MOD, SHIFT, 'Z']} label="Redo" />
            <ShortcutRow keys={[MOD, 'V']} label="Paste image" />
            <ShortcutRow keys={['Shift']} label="Snap shape / lock ratio" />
          </div>

          {/* Import / Export */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Import / Export</div>
            <ShortcutRow keys={[MOD, SHIFT, 'I']} label="Import file" />
            <ShortcutRow keys={[MOD, SHIFT, 'E']} label="Export as PNG" />
            <ShortcutRow keys={[MOD, SHIFT, 'S']} label="Export as PDF" />
          </div>

          {/* Help */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Help</div>
            <ShortcutRow keys={['?']} label="Toggle this cheatsheet" />
          </div>
        </div>
      </div>
    </div>
  );
}

function PdfPageDialog({ pdf, numPages, onConfirm, onCancel }: {
  pdf: import('pdfjs-dist').PDFDocumentProxy;
  numPages: number;
  onConfirm: (pages: number[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(Array.from({ length: numPages }, (_, i) => i + 1)));
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) break;
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
          if (!cancelled) {
            setThumbnails(prev => new Map(prev).set(i, canvas.toDataURL('image/png', 0.6)));
          }
        } catch {
          // skip failed page
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, numPages]);

  const toggle = (pageNum: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const allSelected = selected.size === numPages;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(Array.from({ length: numPages }, (_, i) => i + 1)));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-neutral-900/95 border border-neutral-700/50 rounded-2xl shadow-2xl p-5 max-w-xl w-full mx-4 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white text-lg font-semibold m-0">Import PDF</h2>
            <p className="text-neutral-400 text-sm mt-0.5 mb-0">
              {numPages} pages — {selected.size} selected
            </p>
          </div>
          <button
            onClick={toggleAll}
            className="text-sm text-blue-400 hover:text-blue-300 bg-transparent border-none cursor-pointer transition-colors"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-[50vh] overflow-y-auto p-1 -m-1">
          {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => {
            const isSelected = selected.has(pageNum);
            const thumb = thumbnails.get(pageNum);
            return (
              <button
                key={pageNum}
                onClick={() => toggle(pageNum)}
                className={`relative flex flex-col items-center gap-1 p-1.5 rounded-lg cursor-pointer transition-all border-2 bg-transparent
                  ${isSelected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-transparent hover:border-neutral-600 hover:bg-white/5'}`}
              >
                <div className="relative w-full aspect-[3/4] rounded bg-neutral-800 overflow-hidden flex items-center justify-center">
                  {thumb ? (
                    <Image src={thumb} alt={`Page ${pageNum}`} className="w-full h-full object-contain" draggable={false} fill unoptimized />
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-neutral-600 border-t-neutral-400 animate-spin" />
                  )}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
                <span className={`text-xs tabular-nums ${isSelected ? 'text-blue-400' : 'text-neutral-500'}`}>
                  {pageNum}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-neutral-300 bg-transparent border border-neutral-600 cursor-pointer hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const pages = Array.from(selected).sort((a, b) => a - b);
              if (pages.length > 0) onConfirm(pages);
            }}
            disabled={selected.size === 0}
            className="px-4 py-2 rounded-lg text-sm text-white bg-blue-600 border-none cursor-pointer hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-default"
          >
            Import {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
