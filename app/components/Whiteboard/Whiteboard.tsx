'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { Stroke, ToolType, StrokeStyle, Command, Page, BackgroundPattern, ImageStroke } from '@/app/types';
import Canvas from '@/app/components/Canvas/Canvas';
import Toolbar from '@/app/components/Toolbar/Toolbar';
import PageNav from '@/app/components/PageNav/PageNav';
import { useAutoSave } from '@/app/hooks/useAutoSave';
import { v4 as uuidv4 } from 'uuid';
import { exportPageAsPng, exportAllPagesAsPdf, downloadBlob } from '@/app/utils/exportPage';

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

export default function Whiteboard({ sessionId, initialPages, sessionName: initialName }: WhiteboardProps) {
  const [pages, setPages] = useState<Page[]>(initialPages);
  const [currentPageIndex, setCurrentPageIndex] = useState(0);
  const [sessionName, setSessionName] = useState(initialName);
  const [activeTool, setActiveTool] = useState<ToolType>('pen');
  const [strokeStyle, setStrokeStyle] = useState<StrokeStyle>({
    color: '#000000',
    baseWidth: 4,
  });

  const currentPage = pages[currentPageIndex];
  const strokes = currentPage?.strokes ?? [];

  // Undo/redo stacks
  const [undoStack, setUndoStack] = useState<Command[]>([]);
  const [redoStack, setRedoStack] = useState<Command[]>([]);

  // Autosave
  const { saveStrokes, saveImmediate } = useAutoSave({
    sessionId,
    pageId: currentPage?.id ?? '',
  });

  // Track strokes for autosave
  const strokesRef = useRef(strokes);
  strokesRef.current = strokes;

  const updatePageStrokes = useCallback((pageId: string, updater: (strokes: Stroke[]) => Stroke[]) => {
    setPages(prev => prev.map(p =>
      p.id === pageId ? { ...p, strokes: updater(p.strokes) } : p
    ));
  }, []);

  const pushCommand = useCallback((cmd: Command) => {
    setUndoStack(prev => [...prev, cmd]);
    setRedoStack([]);
  }, []);

  const handleStrokeComplete = useCallback((stroke: Stroke) => {
    const pageId = currentPage?.id;
    if (!pageId) return;
    updatePageStrokes(pageId, s => [...s, stroke]);
    pushCommand({ type: 'createStroke', pageId, stroke });
    // Debounced save
    setTimeout(() => saveStrokes(strokesRef.current), 0);
  }, [currentPage?.id, updatePageStrokes, pushCommand, saveStrokes]);

  const handleStrokeDelete = useCallback((strokeId: string) => {
    const pageId = currentPage?.id;
    if (!pageId) return;
    const stroke = strokes.find(s => s.id === strokeId);
    if (!stroke) return;
    updatePageStrokes(pageId, s => s.filter(st => st.id !== strokeId));
    pushCommand({ type: 'deleteStroke', pageId, strokeId, stroke });
    setTimeout(() => saveStrokes(strokesRef.current), 0);
  }, [currentPage?.id, strokes, updatePageStrokes, pushCommand, saveStrokes]);

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
          setPages(p => p.map(pg =>
            pg.id === cmd.pageId
              ? { ...pg, backgroundPattern: cmd.oldPattern, backgroundColor: cmd.oldColor }
              : pg
          ));
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
          setPages(p => p.map(pg =>
            pg.id === cmd.pageId
              ? { ...pg, backgroundPattern: cmd.newPattern, backgroundColor: cmd.newColor }
              : pg
          ));
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
    const pageId = currentPage?.id;
    if (!pageId) return;
    const oldPattern = currentPage.backgroundPattern;
    const oldColor = currentPage.backgroundColor;
    pushCommand({ type: 'setPageBackground', pageId, oldPattern, oldColor, newPattern: pattern, newColor: oldColor });
    setPages(p => p.map(pg => pg.id === pageId ? { ...pg, backgroundPattern: pattern } : pg));
    await fetch('/api/pages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, backgroundPattern: pattern, backgroundColor: oldColor }),
    });
  }, [currentPage, pushCommand]);

  const handleBackgroundColorChange = useCallback(async (color: string) => {
    const pageId = currentPage?.id;
    if (!pageId) return;
    const oldPattern = currentPage.backgroundPattern;
    const oldColor = currentPage.backgroundColor;
    pushCommand({ type: 'setPageBackground', pageId, oldPattern, oldColor, newPattern: oldPattern, newColor: color });
    setPages(p => p.map(pg => pg.id === pageId ? { ...pg, backgroundColor: color } : pg));
    await fetch('/api/pages', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ pageId, backgroundPattern: oldPattern, backgroundColor: color }),
    });
  }, [currentPage, pushCommand]);

  const clearCanvas = useCallback(() => {
    const pageId = currentPage?.id;
    if (!pageId || strokes.length === 0) return;
    pushCommand({ type: 'clearPage', pageId, strokes: [...strokes] });
    updatePageStrokes(pageId, () => []);
    saveImmediate([]);
  }, [currentPage?.id, strokes, pushCommand, updatePageStrokes, saveImmediate]);

  // Page management
  const addPage = useCallback(async () => {
    const position = currentPageIndex + 1;
    try {
      const res = await fetch('/api/pages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sessionId,
          position,
          backgroundPattern: currentPage?.backgroundPattern || 'blank',
          backgroundColor: currentPage?.backgroundColor || '#ffffff',
        }),
      });
      const newPage = await res.json();
      newPage.strokes = [];
      setPages(prev => {
        const next = [...prev];
        next.splice(position, 0, newPage);
        return next;
      });
      setCurrentPageIndex(position);
    } catch (e) {
      console.error('Failed to add page:', e);
    }
  }, [sessionId, currentPageIndex]);

  const deletePage = useCallback(async () => {
    if (pages.length <= 1) return;
    const page = currentPage;
    if (!page) return;
    try {
      await fetch('/api/pages', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId: page.id, sessionId }),
      });
      setPages(prev => prev.filter(p => p.id !== page.id));
      setCurrentPageIndex(i => Math.min(i, pages.length - 2));
    } catch (e) {
      console.error('Failed to delete page:', e);
    }
  }, [pages, currentPage, sessionId]);

  const goToPage = useCallback((index: number) => {
    if (index >= 0 && index < pages.length) {
      setCurrentPageIndex(index);
    }
  }, [pages.length]);

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
      } else if (!isCmd && !e.altKey) {
        switch (e.key.toLowerCase()) {
          case 'p': setActiveTool('pen'); break;
          case 'e': setActiveTool('eraser'); break;
          case 'l': setActiveTool('line'); break;
          case 'r': setActiveTool('rect'); break;
          case 'o': setActiveTool('ellipse'); break;
          case 'arrowleft': goToPage(currentPageIndex - 1); break;
          case 'arrowright': goToPage(currentPageIndex + 1); break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, goToPage, currentPageIndex]);

  // Upload image to server and create ImageStroke
  const uploadAndCreateImageStroke = useCallback(async (file: File | Blob, mimeType?: string): Promise<ImageStroke | null> => {
    const pageId = currentPage?.id;
    if (!pageId) return null;

    try {
      const formData = new FormData();
      const actualFile = file instanceof Blob && !(file instanceof File)
        ? new File([file], `paste-${Date.now()}.png`, { type: mimeType || 'image/png' })
        : file;
      formData.append('file', actualFile);

      const res = await fetch('/api/assets', { method: 'POST', body: formData });
      const { id: assetId } = await res.json();

      // Get image dimensions
      const url = URL.createObjectURL(file);
      const dims = await getImageDimensions(url);
      URL.revokeObjectURL(url);

      // Scale to fit reasonably on screen
      const maxW = window.innerWidth * 0.6;
      const maxH = window.innerHeight * 0.6;
      let w = dims.width;
      let h = dims.height;
      if (w > maxW) { h *= maxW / w; w = maxW; }
      if (h > maxH) { w *= maxH / h; h = maxH; }

      // Center on screen
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
  }, [currentPage?.id]);

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
        pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;

        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

        for (let i = 0; i < pdf.numPages; i++) {
          const page = await pdf.getPage(i + 1);
          const viewport = page.getViewport({ scale: 2 });

          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;

          await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;

          const blob = await new Promise<Blob>((resolve) =>
            canvas.toBlob(b => resolve(b!), 'image/png')
          );

          const stroke = await uploadAndCreateImageStroke(blob, 'image/png');
          if (stroke) {
            // If it's the first page, add to current page
            // For subsequent pages, create new pages
            if (i === 0) {
              handleStrokeComplete(stroke);
            } else {
              // Add a new page and place the image
              const position = currentPageIndex + i;
              const res = await fetch('/api/pages', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  sessionId,
                  position,
                  backgroundPattern: currentPage?.backgroundPattern || 'blank',
                  backgroundColor: currentPage?.backgroundColor || '#ffffff',
                }),
              });
              const newPage = await res.json();
              newPage.strokes = [stroke];
              setPages(prev => {
                const next = [...prev];
                next.splice(position, 0, newPage);
                return next;
              });
              // Save the stroke to the new page
              await fetch('/api/strokes', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ pageId: newPage.id, sessionId, strokes: [stroke] }),
              });
            }
          }
        }
      } catch (e) {
        console.error('Failed to import PDF:', e);
        alert('Failed to import PDF. Please try again.');
      }
    };
    input.click();
  }, [uploadAndCreateImageStroke, handleStrokeComplete, currentPageIndex, sessionId, currentPage]);

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
          // Trigger PDF import with the dropped file
          // Re-use the same logic but with the file directly
          try {
            const pdfjsLib = await import('pdfjs-dist');
            pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.mjs`;
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

            for (let i = 0; i < pdf.numPages; i++) {
              const page = await pdf.getPage(i + 1);
              const viewport = page.getViewport({ scale: 2 });
              const canvas = document.createElement('canvas');
              canvas.width = viewport.width;
              canvas.height = viewport.height;
              const ctx = canvas.getContext('2d')!;
              await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
              const blob = await new Promise<Blob>((resolve) =>
                canvas.toBlob(b => resolve(b!), 'image/png')
              );
              const stroke = await uploadAndCreateImageStroke(blob, 'image/png');
              if (stroke) handleStrokeComplete(stroke);
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
    if (!currentPage) return;
    const blob = await exportPageAsPng(strokes, currentPage.backgroundPattern, currentPage.backgroundColor);
    downloadBlob(blob, `${sessionName}-page-${currentPageIndex + 1}.png`);
  }, [currentPage, strokes, sessionName, currentPageIndex]);

  const handleExportPdf = useCallback(async () => {
    await exportAllPagesAsPdf(pages, sessionName);
  }, [pages, sessionName]);

  const handleSessionRename = useCallback(async (name: string) => {
    setSessionName(name);
    try {
      await fetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name }),
      });
    } catch (e) {
      console.error('Failed to rename session:', e);
    }
  }, [sessionId]);

  const handleImageTransform = useCallback((strokeId: string, newStroke: ImageStroke) => {
    const pageId = currentPage?.id;
    if (!pageId) return;
    const oldStroke = strokes.find(s => s.id === strokeId) as ImageStroke | undefined;
    if (!oldStroke) return;
    pushCommand({ type: 'transformImageStroke', pageId, strokeId, oldStroke, newStroke });
    updatePageStrokes(pageId, s => s.map(st => st.id === strokeId ? newStroke : st));
    setTimeout(() => saveStrokes(strokesRef.current), 0);
  }, [currentPage?.id, strokes, pushCommand, updatePageStrokes, saveStrokes]);

  if (!currentPage) return null;

  return (
    <>
      <Canvas
        strokes={strokes}
        activeTool={activeTool}
        strokeStyle={strokeStyle}
        backgroundColor={currentPage.backgroundColor}
        backgroundPattern={currentPage.backgroundPattern}
        onStrokeComplete={handleStrokeComplete}
        onStrokeDelete={handleStrokeDelete}
        onImageTransform={handleImageTransform}
        onToolChange={setActiveTool}
      />
      <Toolbar
        activeTool={activeTool}
        strokeStyle={strokeStyle}
        backgroundPattern={currentPage.backgroundPattern}
        backgroundColor={currentPage.backgroundColor}
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
        currentIndex={currentPageIndex}
        pages={pages}
        onGoToPage={goToPage}
        onAddPage={addPage}
        onDeletePage={deletePage}
        sessionName={sessionName}
        onSessionRename={handleSessionRename}
      />
    </>
  );
}
