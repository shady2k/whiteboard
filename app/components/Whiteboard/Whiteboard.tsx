'use client';

import { useState, useCallback, useEffect, useRef, useMemo, startTransition } from 'react';
import { Stroke, ToolType, StrokeStyle, Page, BackgroundPattern, ImageStroke } from '@/app/types';
import Canvas from '@/app/components/Canvas/Canvas';
import Toolbar from '@/app/components/Toolbar/Toolbar';
import SelectionActionBar from '@/app/components/Whiteboard/SelectionActionBar';
import Cheatsheet from '@/app/components/Whiteboard/Cheatsheet';
import PdfPageDialog from '@/app/components/Whiteboard/PdfPageDialog';
import { useIDBState } from '@/app/hooks/useIDBState';
import { useSyncEngine } from '@/app/hooks/useSyncEngine';
import { useUndoRedo } from '@/app/hooks/useUndoRedo';
import { useKeyboardShortcuts } from '@/app/hooks/useKeyboardShortcuts';
import { getSession, putSession } from '@/app/lib/idb';
import { useFileOperations } from '@/app/hooks/useFileOperations';
import { drawBackground } from '@/app/utils/drawGrid';
import { renderAllStrokes } from '@/app/utils/renderStroke';
import { normalizeStrokes, denormalizeStrokes } from '@/app/utils/snippetUtils';
import Link from 'next/link';

interface WhiteboardProps {
  sessionId: string;
  initialPages: Page[];
  sessionName: string;
  serverSessionExists?: boolean;
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

const DEFAULT_PEN_CONFIGS = [
  { color: '#000000', label: 'Black', baseWidth: 4 },
  { color: '#e53e3e', label: 'Red', baseWidth: 4 },
  { color: '#3182ce', label: 'Blue', baseWidth: 4 },
];

export default function Whiteboard({ sessionId, initialPages, sessionName: initialName, serverSessionExists }: WhiteboardProps) {
  const { page, setPage, isOffline, notFound } = useIDBState(sessionId, initialPages, initialName, serverSessionExists);
  const { queuePageSync, queueBackgroundSync, tryThumbnailSync, isOnline, isSyncing, setOnConflict, setPageRevision, initServerSnapshot } = useSyncEngine(sessionId);

  // Wire up conflict handler — server wins, update React state
  useEffect(() => {
    setOnConflict((serverStrokes) => {
      setPage(prev => ({ ...prev, strokes: serverStrokes }));
    });
  }, [setOnConflict, setPage]);

  // Seed server snapshot from SSR data (server truth) on mount
  const seededRef = useRef(false);
  useEffect(() => {
    if (seededRef.current || initialPages.length === 0) return;
    seededRef.current = true;
    for (const p of initialPages) {
      initServerSnapshot(p.id, p.strokes);
      if (p.revision !== undefined) {
        setPageRevision(p.id, p.revision);
      }
    }
  }, [initialPages, initServerSnapshot, setPageRevision]);

  const [sessionName] = useState(initialName);
  const [activeTool, setActiveTool] = useState<ToolType>('pen');

  // Per-color pen configs: each color has its own independent thickness
  const [penConfigs, setPenConfigs] = useState(DEFAULT_PEN_CONFIGS);
  const [activePenColor, setActivePenColor] = useState('#000000');
  const [markerStyle, setMarkerStyle] = useState<StrokeStyle>({
    color: '#7dd3fc',
    baseWidth: 24,
  });

  // Derive current stroke style from active pen config (or marker)
  const strokeStyle = useMemo<StrokeStyle>(() => {
    if (activeTool === 'marker') return markerStyle;
    const config = penConfigs.find(p => p.color === activePenColor);
    return config ? { color: config.color, baseWidth: config.baseWidth } : { color: '#000000', baseWidth: 4 };
  }, [penConfigs, activePenColor, activeTool, markerStyle]);
  const [zoom, setZoom] = useState(() => {
    if (typeof sessionStorage === 'undefined') return 1;
    const saved = sessionStorage.getItem(`wb-zoom-${sessionId}`);
    return saved ? Number(saved) : 1;
  });
  const [panOffset, setPanOffset] = useState(() => {
    if (typeof sessionStorage === 'undefined') return { x: 0, y: 0 };
    const saved = sessionStorage.getItem(`wb-pan-${sessionId}`);
    if (!saved) return { x: 0, y: 0 };
    try { return JSON.parse(saved); } catch { return { x: 0, y: 0 }; }
  });
  const [showCheatsheet, setShowCheatsheet] = useState(false);

  // Persist viewport to sessionStorage so it survives navigation
  useEffect(() => {
    sessionStorage.setItem(`wb-zoom-${sessionId}`, String(zoom));
  }, [sessionId, zoom]);
  useEffect(() => {
    sessionStorage.setItem(`wb-pan-${sessionId}`, JSON.stringify(panOffset));
  }, [sessionId, panOffset]);

  const strokes = useMemo(() => page?.strokes ?? [], [page?.strokes]);

  const strokesRef = useRef(strokes);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);

  const pageRef = useRef(page);
  pageRef.current = page;

  // Generate and save thumbnail only when leaving the canvas (unmount, visibility hidden, pagehide).
  // Zero overhead during drawing.
  const bgPatternRef = useRef(page?.backgroundPattern || 'blank');
  const bgColorRef = useRef(page?.backgroundColor || '#ffffff');
  bgPatternRef.current = page?.backgroundPattern || 'blank';
  bgColorRef.current = page?.backgroundColor || '#ffffff';

  const thumbSentRef = useRef(false);
  const generateAndSyncThumb = useCallback(() => {
    // Guard against double-fire (unmount + pagehide/visibilitychange race)
    if (thumbSentRef.current) return;
    thumbSentRef.current = true;
    // Reset after a short delay so future leave events still work
    setTimeout(() => { thumbSentRef.current = false; }, 1000);

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
      drawBackground(ctx, vw, vh, bgPatternRef.current, bgColorRef.current);
      if (strokesRef.current.length > 0) {
        renderAllStrokes(ctx, strokesRef.current);
      }
      const dataUrl = canvas.toDataURL('image/png', 0.7);

      // Save to IDB (for instant display on session list)
      getSession(sessionId).then(s => {
        if (s) putSession({ ...s, thumbnail: dataUrl }).catch(() => {});
      }).catch(() => {});

      // Sync to server
      tryThumbnailSync(dataUrl);
    } catch {}
  }, [sessionId, tryThumbnailSync]);

  useEffect(() => {
    const handleVisChange = () => {
      if (document.visibilityState === 'hidden') generateAndSyncThumb();
    };
    document.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('pagehide', generateAndSyncThumb);
    return () => {
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('pagehide', generateAndSyncThumb);
      generateAndSyncThumb();
    };
  }, [generateAndSyncThumb]);

  const updatePageStrokes = useCallback((pageId: string, updater: (strokes: Stroke[]) => Stroke[]) => {
    setPage(prev => {
      if (prev.id !== pageId) return prev;
      return { ...prev, strokes: updater(prev.strokes) };
    });
  }, [setPage]);

  const { pushCommand, undo, redo, canUndo, canRedo } = useUndoRedo({
    sessionId,
    updatePageStrokes,
    setPage,
    queuePageSync,
    queueBackgroundSync,
    pageRef,
  });

  const handleStrokeComplete = useCallback((stroke: Stroke) => {
    const pageId = page?.id;
    if (!pageId) return;
    updatePageStrokes(pageId, s => [...s, stroke]);
    pushCommand({ type: 'createStroke', pageId, stroke });
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
  }, [page?.id, updatePageStrokes, pushCommand, queuePageSync]);

  // Refs for viewport transform (used by screenToCanvas, paste, keyboard shortcuts)
  const scaleRef = useRef(zoom);
  useEffect(() => { scaleRef.current = zoom; }, [zoom]);
  const panOffsetRef = useRef(panOffset);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  // Track mouse position for paste/drop at cursor
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  const screenToCanvas = useCallback((sx: number, sy: number) => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const s = scaleRef.current;
    const panX = (vw / 2) * (1 - s) + panOffsetRef.current.x;
    const panY = (vh / 2) * (1 - s) + panOffsetRef.current.y;
    return { x: (sx - panX) / s, y: (sy - panY) / s };
  }, []);

  const { handleImportFile, handleExportPng, handleExportPdf, pdfPageDialog, setPdfPageDialog, importPdfPages } = useFileOperations({
    page,
    strokes,
    sessionName,
    handleStrokeComplete,
    screenToCanvas,
    mouseRef,
  });

  const handleStrokeDelete = useCallback((strokeId: string) => {
    const pageId = page?.id;
    if (!pageId) return;
    const stroke = strokes.find(s => s.id === strokeId);
    if (!stroke) return;
    updatePageStrokes(pageId, s => s.filter(st => st.id !== strokeId));
    pushCommand({ type: 'deleteStroke', pageId, strokeId, stroke });
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
  }, [page?.id, strokes, updatePageStrokes, pushCommand, queuePageSync]);

  const handleEraseCommit = useCallback((erased: { strokeId: string; remaining: Stroke[] }[]) => {
    const pageId = page?.id;
    if (!pageId) return;
    const undoData = erased.map(({ strokeId, remaining }) => {
      const original = strokes.find(s => s.id === strokeId);
      return { strokeId, original: original!, remaining };
    }).filter(e => e.original);
    setPage(prev => {
      let newStrokes = [...prev.strokes];
      for (const { strokeId, remaining } of erased) {
        const idx = newStrokes.findIndex(s => s.id === strokeId);
        if (idx === -1) continue;
        newStrokes.splice(idx, 1, ...remaining);
      }
      return { ...prev, strokes: newStrokes };
    });
    if (undoData.length > 0) {
      pushCommand({ type: 'eraseStrokes', pageId, erased: undoData });
    }
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
  }, [page?.id, strokes, setPage, pushCommand, queuePageSync]);

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

  const [pendingSelection, setPendingSelection] = useState<{ strokes: Stroke[]; bounds: { x: number; y: number; width: number; height: number } } | null>(null);

  const handleImageTransform = useCallback((strokeId: string, newStroke: ImageStroke) => {
    const pageId = page?.id;
    if (!pageId) return;
    const oldStroke = strokes.find(s => s.id === strokeId) as ImageStroke | undefined;
    if (!oldStroke) return;
    pushCommand({ type: 'transformImageStroke', pageId, strokeId, oldStroke, newStroke });
    updatePageStrokes(pageId, s => s.map(st => st.id === strokeId ? newStroke : st));
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
  }, [page?.id, strokes, pushCommand, updatePageStrokes, queuePageSync]);

  // Clipboard for copy/paste of strokes
  const [clipboard, setClipboard] = useState<Stroke[] | null>(null);

  const handleSelectionComplete = useCallback((selectedStrokes: Stroke[], bounds: { x: number; y: number; width: number; height: number }) => {
    setPendingSelection({ strokes: selectedStrokes, bounds });
  }, []);

  const copySelection = useCallback(() => {
    if (!pendingSelection) return;
    const { normalized } = normalizeStrokes(pendingSelection.strokes);
    setClipboard(normalized);
    setPendingSelection(null);
  }, [pendingSelection]);

  const deleteSelection = useCallback(() => {
    if (!pendingSelection || !page) return;
    const ids = new Set(pendingSelection.strokes.map(s => s.id));
    pushCommand({ type: 'deleteSelected', pageId: page.id, strokes: pendingSelection.strokes });
    updatePageStrokes(page.id, s => s.filter(st => !ids.has(st.id)));
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
    setPendingSelection(null);
  }, [pendingSelection, page, pushCommand, updatePageStrokes, queuePageSync]);

  // Paste from clipboard at mouse cursor position
  const pasteFromClipboard = useCallback(() => {
    if (!clipboard || !page) return;
    const { normalized, width, height } = normalizeStrokes(clipboard);
    const center = screenToCanvas(mouseRef.current.x, mouseRef.current.y);
    const canvasX = center.x - width / 2;
    const canvasY = center.y - height / 2;
    const newStrokes = denormalizeStrokes(normalized, canvasX, canvasY);
    setPage(prev => ({ ...prev, strokes: [...prev.strokes, ...newStrokes] }));
    pushCommand({ type: 'pasteSnippet', pageId: page.id, strokes: newStrokes });
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
  }, [clipboard, page, setPage, pushCommand, queuePageSync, screenToCanvas]);


  useKeyboardShortcuts({
    undo,
    redo,
    zoomIn,
    zoomOut,
    zoomReset,
    setActiveTool,
    setShowCheatsheet,
    setPendingSelection,
    handleExportPng,
    handleExportPdf,
    handleImportFile,
    copySelection,
    deleteSelection,
    pasteFromClipboard,
    pendingSelection,
    clipboard,
  });

  const handleZoomChange = useCallback((z: number) => startTransition(() => setZoom(z)), []);
  const handlePanChange = useCallback((p: { x: number; y: number }) => startTransition(() => setPanOffset(p)), []);

  // Pen selection handler — switch to pen tool and set active color
  const handlePenSelect = useCallback((color: string) => {
    setActivePenColor(color);
    setActiveTool('pen');
  }, []);

  // Per-pen width change
  const handlePenWidthChange = useCallback((color: string, width: number) => {
    setPenConfigs(prev => prev.map(p => p.color === color ? { ...p, baseWidth: width } : p));
  }, []);

  if (notFound) {
    return (
      <div className="fixed inset-0 flex items-center justify-center" style={{ background: '#16161a' }}>
        <div className="text-neutral-400 text-sm flex flex-col items-center gap-4">
          <div className="text-lg font-medium text-neutral-300">Session not found</div>
          <p className="text-neutral-500">This whiteboard session doesn&apos;t exist or has been deleted.</p>
          <Link
            href="/"
            className="mt-2 px-4 py-2 rounded-lg bg-neutral-700 hover:bg-neutral-600 text-neutral-200 transition-colors"
          >
            Go to Home
          </Link>
        </div>
      </div>
    );
  }

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
      <Canvas
        strokes={strokes}
        activeTool={activeTool}
        strokeStyle={strokeStyle}
        backgroundColor={page.backgroundColor}
        backgroundPattern={page.backgroundPattern}
        scale={zoom}
        panOffset={panOffset}
        onStrokeComplete={handleStrokeComplete}
        onStrokeDelete={handleStrokeDelete}
        onEraseCommit={handleEraseCommit}
        onImageTransform={handleImageTransform}
        onToolChange={setActiveTool}
        onZoomChange={handleZoomChange}
        onPanChange={handlePanChange}
        onSelectionComplete={handleSelectionComplete}
        pastePreview={null}
        onPasteConfirm={() => {}}
        selectionActive={!!pendingSelection}
      />
      {/* Selection action bar */}
      {pendingSelection && activeTool === 'select' && (
        <SelectionActionBar
          bounds={pendingSelection.bounds}
          zoom={zoom}
          panOffset={panOffset}
          onCopy={copySelection}
          onDelete={deleteSelection}
        />
      )}
      <Toolbar
        activeTool={activeTool}
        activePenColor={activePenColor}
        penConfigs={penConfigs}
        markerStyle={markerStyle}
        backgroundPattern={page.backgroundPattern}
        backgroundColor={page.backgroundColor}
        zoom={zoom}
        onToolChange={setActiveTool}
        onPenSelect={handlePenSelect}
        onPenWidthChange={handlePenWidthChange}
        onMarkerWidthChange={(w) => setMarkerStyle(s => ({ ...s, baseWidth: w }))}
        onBackgroundPatternChange={handleBackgroundPatternChange}
        onBackgroundColorChange={handleBackgroundColorChange}
        onUndo={undo}
        onRedo={redo}
        onClear={clearCanvas}
        onImportFile={handleImportFile}
        onExportPng={handleExportPng}
        onExportPdf={handleExportPdf}
        onShowCheatsheet={() => setShowCheatsheet(true)}
        onZoomIn={zoomIn}
        onZoomOut={zoomOut}
        onZoomReset={zoomReset}
        canUndo={canUndo}
        canRedo={canRedo}
        isOffline={isOffline || !isOnline}
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
