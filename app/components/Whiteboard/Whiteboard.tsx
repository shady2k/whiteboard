'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Stroke, ToolType, StrokeStyle, Command, Page, BackgroundPattern, ImageStroke } from '@/app/types';
import Canvas from '@/app/components/Canvas/Canvas';
import Toolbar from '@/app/components/Toolbar/Toolbar';
import PageNav from '@/app/components/PageNav/PageNav';
import { useAutoSave } from '@/app/hooks/useAutoSave';
import { v4 as uuidv4 } from 'uuid';
import { exportPageAsPng, exportAllPagesAsPdf, downloadBlob } from '@/app/utils/exportPage';
import { drawBackground } from '@/app/utils/drawGrid';
import { renderAllStrokes } from '@/app/utils/renderStroke';

function getImageDimensions(url: string): Promise<{ width: number; height: number }> {
  return new Promise((resolve) => {
    const img = new Image();
    img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
    img.onerror = () => resolve({ width: 400, height: 300 });
    img.src = url;
  });
}

interface WhiteboardProps {
  sessionId: string;
  initialPages: Page[];
  sessionName: string;
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export default function Whiteboard({ sessionId, initialPages, sessionName: initialName }: WhiteboardProps) {
  const [page, setPage] = useState<Page>(initialPages[0]);
  const [sessionName] = useState(initialName);
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>({
    color: '#000000',
    baseWidth: 4,
  });
  const [zoom, setZoom] = useState(1);

  const strokes = page?.strokes ?? [];

  // Undo/redo stacks
  const [undoStack, setUndoStack] = useState<Command[]>([]);
  const [redoStack, setRedoStack] = useState<Command[]>([]);

  // Autosave
  const { saveStrokes, saveImmediate } = useAutoSave({
    sessionId,
    pageId: page?.id ?? '',
  });

  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  // Generate and save thumbnail
  const thumbTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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
        // An image just finished loading — re-generate thumbnail
        generateAndSaveThumb();
      });
      const dataUrl = canvas.toDataURL('image/png', 0.7);
      fetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnail: dataUrl }),
      }).catch(() => {});
    } catch {}
  }, [sessionId, page?.backgroundPattern, page?.backgroundColor]);

  const saveThumbnail = useCallback(() => {
    if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    thumbTimerRef.current = setTimeout(generateAndSaveThumb, 2000);
  }, [generateAndSaveThumb]);

  // Trigger thumbnail save when strokes change
  useEffect(() => {
    saveThumbnail();
  }, [strokes, saveThumbnail]);

  const updatePageStrokes = useCallback((pageId: string, updater: (strokes: Stroke[]) => Stroke[]) => {
    setPage(prev => {
      if (prev.id !== pageId) return prev;
      return { ...prev, strokes: updater(prev.strokes) };
    });
  }, []);

  const pushCommand = useCallback((cmd: Command) => {
    setUndoStack(prev => [...prev, cmd]);
    setRedoStack([]);
  }, []);

  const handleStrokeComplete = useCallback((stroke: Stroke) => {
    const pageId = page?.id;
    if (!pageId) return;
    updatePageStrokes(pageId, s => [...s, stroke]);
    pushCommand({ type: 'createStroke', pageId, stroke });
    setTimeout(() => saveStrokes(strokesRef.current), 0);
  }, [page?.id, updatePageStrokes, pushCommand, saveStrokes]);

  const handleStrokeDelete = useCallback((strokeId: string) => {
    const pageId = page?.id;
    if (!pageId) return;
    const stroke = strokes.find(s => s.id === strokeId);
    if (!stroke) return;
    updatePageStrokes(pageId, s => s.filter(st => st.id !== strokeId));
    pushCommand({ type: 'deleteStroke', pageId, strokeId, stroke });
    setTimeout(() => saveStrokes(strokesRef.current), 0);
  }, [page?.id, strokes, updatePageStrokes, pushCommand, saveStrokes]);

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
          break;
        case 'transformImageStroke':
          updatePageStrokes(cmd.pageId, s => s.map(st => st.id === cmd.strokeId ? cmd.oldStroke : st));
          break;
      }

      setRedoStack(r => [...r, cmd]);
      setTimeout(() => saveStrokes(strokesRef.current), 0);
      return rest;
    });
  }, [updatePageStrokes, saveStrokes]);

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
          break;
        case 'transformImageStroke':
          updatePageStrokes(cmd.pageId, s => s.map(st => st.id === cmd.strokeId ? cmd.newStroke : st));
          break;
      }

      setUndoStack(u => [...u, cmd]);
      setTimeout(() => saveStrokes(strokesRef.current), 0);
      return rest;
    });
  }, [updatePageStrokes, saveStrokes]);

  const handleBackgroundPatternChange = useCallback(async (pattern: BackgroundPattern) => {
    const pageId = page?.id;
    if (!pageId) return;
    const oldPattern = page.backgroundPattern;
    const oldColor = page.backgroundColor;
    pushCommand({ type: 'setPageBackground', pageId, oldPattern, oldColor, newPattern: pattern, newColor: oldColor });
    setPage(p => ({ ...p, backgroundPattern: pattern }));
    await fetch('/api/pages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, backgroundPattern: pattern, backgroundColor: oldColor }),
    });
  }, [page, pushCommand]);

  const handleBackgroundColorChange = useCallback(async (color: string) => {
    const pageId = page?.id;
    if (!pageId) return;
    const oldPattern = page.backgroundPattern;
    const oldColor = page.backgroundColor;
    pushCommand({ type: 'setPageBackground', pageId, oldPattern, oldColor, newPattern: oldPattern, newColor: color });
    setPage(p => ({ ...p, backgroundColor: color }));
    await fetch('/api/pages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, backgroundPattern: oldPattern, backgroundColor: color }),
    });
  }, [page, pushCommand]);

  const clearCanvas = useCallback(() => {
    const pageId = page?.id;
    if (!pageId || strokes.length === 0) return;
    pushCommand({ type: 'clearPage', pageId, strokes: [...strokes] });
    updatePageStrokes(pageId, () => []);
    saveImmediate([]);
  }, [page?.id, strokes, pushCommand, updatePageStrokes, saveImmediate]);

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
  }, []);

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
      } else if (!isCmd && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'p': setActiveTool('pen'); break;
          case 'e': setActiveTool('eraser'); break;
          case 'l': setActiveTool('line'); break;
          case 'r': setActiveTool('rect'); break;
          case 'o': setActiveTool('ellipse'); break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, zoomIn, zoomOut, zoomReset]);

  // Upload image to server and create ImageStroke
  const uploadAndCreateImageStroke = useCallback(async (file: File | Blob, mimeType?: string): Promise<ImageStroke | null> => {
    const pageId = page?.id;
    if (!pageId) return null;

    try {
      const formData = new FormData();
      const actualFile = file instanceof Blob && !(file instanceof File)
        ? new File([file], `paste-${Date.now()}.png`, { type: mimeType || 'image/png' })
        : file;
      formData.append('file', actualFile);

      const res = await fetch('/api/assets', { method: 'POST', body: formData });
      const { id: assetId } = await res.json();

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
        assetId,
        x, y,
        width: w,
        height: h,
      };

      return stroke;
    } catch (e) {
      console.error('Failed to upload image:', e);
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

  // PDF import handler
  const handleImportPdf = useCallback(async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.pdf,application/pdf';
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;

      try {
        const pdfjsLib = await import('pdfjs-dist');
        // Use local worker from node_modules
        pdfjsLib.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs';

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        // Import all pages as images on the single canvas
        for (let i = 0; i < pdf.numPages; i++) {
          const pdfPage = await pdf.getPage(i + 1);
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
            // Offset each subsequent page image downward
            if (i > 0) {
              stroke.y = stroke.y + i * (stroke.height + 20);
            }
            handleStrokeComplete(stroke);
          }
        }
      } catch (e) {
        console.error('Failed to import PDF:', e);
        alert('Failed to import PDF. Please try again.');
      }
    };
    input.click();
  }, [uploadAndCreateImageStroke, handleStrokeComplete]);

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
            const pdfjsLib = await import('pdfjs-dist');
            const workerUrl = new URL('pdfjs-dist/build/pdf.worker.min.mjs', import.meta.url);
            pdfjsLib.GlobalWorkerOptions.workerSrc = workerUrl.toString();
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            for (let i = 0; i < pdf.numPages; i++) {
              const pdfPage = await pdf.getPage(i + 1);
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
                if (i > 0) stroke.y = stroke.y + i * (stroke.height + 20);
                handleStrokeComplete(stroke);
              }
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
  }, [uploadAndCreateImageStroke, handleStrokeComplete]);

  const handleExportPng = useCallback(async () => {
    if (!page) return;
    const blob = await exportPageAsPng(strokes, page.backgroundPattern, page.backgroundColor);
    downloadBlob(blob, `${sessionName}.png`);
  }, [page, strokes, sessionName]);

  const handleExportPdf = useCallback(async () => {
    await exportAllPagesAsPdf([page], sessionName);
  }, [page, sessionName]);

  const handleImageTransform = useCallback((strokeId: string, newStroke: ImageStroke) => {
    const pageId = page?.id;
    if (!pageId) return;
    const oldStroke = strokes.find(s => s.id === strokeId) as ImageStroke | undefined;
    if (!oldStroke) return;
    pushCommand({ type: 'transformImageStroke', pageId, strokeId, oldStroke, newStroke });
    updatePageStrokes(pageId, s => s.map(st => st.id === strokeId ? newStroke : st));
    setTimeout(() => saveStrokes(strokesRef.current), 0);
  }, [page?.id, strokes, pushCommand, updatePageStrokes, saveStrokes]);

  if (!page) return null;

  return (
    <>
      <Canvas
        strokes={strokes}
        activeTool={activeTool}
        strokeStyle={strokeStyle}
        backgroundColor={page.backgroundColor}
        backgroundPattern={page.backgroundPattern}
        scale={zoom}
        onStrokeComplete={handleStrokeComplete}
        onStrokeDelete={handleStrokeDelete}
        onImageTransform={handleImageTransform}
        onToolChange={setActiveTool}
        onZoomChange={setZoom}
      />
      <Toolbar
        activeTool={activeTool}
        strokeStyle={strokeStyle}
        backgroundPattern={page.backgroundPattern}
        backgroundColor={page.backgroundColor}
        onToolChange={setActiveTool}
        onColorChange={color => setStrokeStyle(s => ({ ...s, color }))}
        onWidthChange={baseWidth => setStrokeStyle(s => ({ ...s, baseWidth }))}
        onBackgroundPatternChange={handleBackgroundPatternChange}
        onBackgroundColorChange={handleBackgroundColorChange}
        onUndo={undo}
        onRedo={redo}
        onClear={clearCanvas}
        onImportPdf={handleImportPdf}
        onExportPng={handleExportPng}
        onExportPdf={handleExportPdf}
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
    </>
  );
}
