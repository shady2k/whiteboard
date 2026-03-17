'use client';

import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Stroke, ToolType, StrokeStyle, Page, BackgroundPattern, ImageStroke, Snippet } from '@/app/types';
import Canvas from '@/app/components/Canvas/Canvas';
import Toolbar from '@/app/components/Toolbar/Toolbar';
import PageNav from '@/app/components/PageNav/PageNav';
import SnippetSaveDialog from '@/app/components/SnippetSaveDialog';
import SnippetPanel from '@/app/components/SnippetPanel';
import { useIDBState } from '@/app/hooks/useIDBState';
import { useSyncEngine } from '@/app/hooks/useSyncEngine';
import { useSnippetSync } from '@/app/hooks/useSnippetSync';
import { useUndoRedo } from '@/app/hooks/useUndoRedo';
import { getSession, putSession } from '@/app/lib/idb';
import { useFileOperations } from '@/app/hooks/useFileOperations';
import { drawBackground } from '@/app/utils/drawGrid';
import { renderAllStrokes } from '@/app/utils/renderStroke';
import { createSnippet, denormalizeStrokes, generateSnippetThumbnail, normalizeStrokes } from '@/app/utils/snippetUtils';
import Image from 'next/image';

interface WhiteboardProps {
  sessionId: string;
  initialPages: Page[];
  sessionName: string;
}

const ZOOM_STEPS = [0.25, 0.5, 0.75, 1, 1.25, 1.5, 2, 3, 4];

export default function Whiteboard({ sessionId, initialPages, sessionName: initialName }: WhiteboardProps) {
  const { page, setPage, isOffline } = useIDBState(sessionId, initialPages, initialName);
  const { queuePageSync, queueBackgroundSync, tryThumbnailSync, isOnline, isSyncing, setOnConflict, setPageRevision } = useSyncEngine(sessionId);

  // Wire up conflict handler — server wins, update React state
  useEffect(() => {
    setOnConflict((serverStrokes) => {
      setPage(prev => ({ ...prev, strokes: serverStrokes }));
    });
  }, [setOnConflict, setPage]);

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

  // Snippet state
  const { snippets, saveSnippet, deleteSnippet } = useSnippetSync();
  const [snippetPanelOpen, setSnippetPanelOpen] = useState(false);
  const [pendingSelection, setPendingSelection] = useState<{ strokes: Stroke[]; bounds: { x: number; y: number; width: number; height: number } } | null>(null);
  const [snippetSaveDialog, setSnippetSaveDialog] = useState(false);
  const [pasteSnippet, setPasteSnippet] = useState<Snippet | null>(null);

  const strokes = useMemo(() => page?.strokes ?? [], [page?.strokes]);

  const strokesRef = useRef(strokes);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);

  const pageRef = useRef(page);
  useEffect(() => { pageRef.current = page; }, [page]);

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
      // Always save thumbnail to IDB so the session list shows current preview
      getSession(sessionId).then(s => {
        if (s) putSession({ ...s, thumbnail: dataUrl }).catch(() => {});
      }).catch(() => {});
      tryThumbnailSync(dataUrl);
    } catch {}
  }, [sessionId, page, tryThumbnailSync]);
  useEffect(() => { generateAndSaveThumbRef.current = generateAndSaveThumb; }, [generateAndSaveThumb]);

  const saveThumbnail = useCallback(() => {
    if (thumbTimerRef.current) clearTimeout(thumbTimerRef.current);
    thumbTimerRef.current = setTimeout(generateAndSaveThumb, 2000);
  }, [generateAndSaveThumb]);

  useEffect(() => {
    saveThumbnail();
  }, [strokes, saveThumbnail, page?.backgroundPattern, page?.backgroundColor]);

  // Flush pending thumbnail immediately on unmount
  useEffect(() => {
    return () => {
      if (thumbTimerRef.current) {
        clearTimeout(thumbTimerRef.current);
        thumbTimerRef.current = null;
        generateAndSaveThumbRef.current?.();
      }
    };
  }, []);

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

  const { handleImportFile, handleExportPng, handleExportPdf, pdfPageDialog, setPdfPageDialog, importPdfPages } = useFileOperations({
    page,
    strokes,
    sessionName,
    handleStrokeComplete,
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
  const copySelectionRef = useRef<(() => void) | null>(null);
  const deleteSelectionRef = useRef<(() => void) | null>(null);
  const pasteFromClipboardRef = useRef<(() => void) | null>(null);
  const clipboardRef = useRef<Stroke[] | null>(null);
  const pendingSelectionRef = useRef(pendingSelection);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;

      // Skip clipboard/selection shortcuts if user is typing in an input
      const isEditing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if (isCmd && e.key === 'c' && !e.shiftKey && !isEditing) {
        if (pendingSelectionRef.current && copySelectionRef.current) {
          e.preventDefault();
          copySelectionRef.current();
        }
        return;
      } else if (isCmd && e.key === 'v' && !e.shiftKey && !isEditing) {
        // Only intercept if we have a stroke clipboard; let default paste handle images
        if (clipboardRef.current) {
          e.preventDefault();
          pasteFromClipboardRef.current?.();
        }
        return;
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing && pendingSelectionRef.current) {
        e.preventDefault();
        deleteSelectionRef.current?.();
        return;
      } else if (isCmd && e.key === 'z' && !e.shiftKey) {
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
          // Cancel snippet paste or selection
          setPasteSnippet(null);
          setPendingSelection(null);
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
          case 's': setActiveTool('select'); break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, zoomIn, zoomOut, zoomReset]);

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

  // Clipboard for copy/paste of strokes
  const [clipboard, setClipboard] = useState<Stroke[] | null>(null);

  // Selection complete handler — just store selection, show action bar
  const handleSelectionComplete = useCallback((selectedStrokes: Stroke[], bounds: { x: number; y: number; width: number; height: number }) => {
    setPendingSelection({ strokes: selectedStrokes, bounds });
  }, []);

  // Clear selection
  const clearSelection = useCallback(() => {
    setPendingSelection(null);
  }, []);

  // Copy selected strokes to clipboard
  const copySelection = useCallback(() => {
    if (!pendingSelection) return;
    const { normalized } = normalizeStrokes(pendingSelection.strokes);
    setClipboard(normalized);
    setPendingSelection(null);
  }, [pendingSelection]);

  // Delete selected strokes
  const deleteSelection = useCallback(() => {
    if (!pendingSelection || !page) return;
    const ids = new Set(pendingSelection.strokes.map(s => s.id));
    pushCommand({ type: 'deleteSelected', pageId: page.id, strokes: pendingSelection.strokes });
    updatePageStrokes(page.id, s => s.filter(st => !ids.has(st.id)));
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
    setPendingSelection(null);
  }, [pendingSelection, page, pushCommand, updatePageStrokes, queuePageSync]);

  // Save selection as snippet
  const saveSelectionAsSnippet = useCallback(() => {
    if (!pendingSelection) return;
    setSnippetSaveDialog(true);
  }, [pendingSelection]);

  // Save snippet handler
  const handleSnippetSave = useCallback((name: string) => {
    if (!pendingSelection) return;
    const snippet = createSnippet(name, pendingSelection.strokes);
    saveSnippet(snippet);
    setPendingSelection(null);
    setSnippetSaveDialog(false);
  }, [pendingSelection, saveSnippet]);

  // Paste from clipboard at mouse cursor position
  const pasteFromClipboard = useCallback(() => {
    if (!clipboard || !page) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const { normalized, width, height } = normalizeStrokes(clipboard);
    const s = scaleRef.current;
    const panX = (vw / 2) * (1 - s) + panOffsetRef.current.x;
    const panY = (vh / 2) * (1 - s) + panOffsetRef.current.y;
    // Convert mouse screen position to canvas coordinates
    const canvasX = (mouseRef.current.x - panX) / s - width / 2;
    const canvasY = (mouseRef.current.y - panY) / s - height / 2;
    const newStrokes = denormalizeStrokes(normalized, canvasX, canvasY);
    setPage(prev => ({ ...prev, strokes: [...prev.strokes, ...newStrokes] }));
    pushCommand({ type: 'pasteSnippet', pageId: page.id, strokes: newStrokes });
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
  }, [clipboard, page, setPage, pushCommand, queuePageSync]);

  // Track mouse position for paste-at-cursor
  const mouseRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  useEffect(() => {
    const onMove = (e: PointerEvent) => { mouseRef.current = { x: e.clientX, y: e.clientY }; };
    window.addEventListener('pointermove', onMove);
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  // Refs for keyboard shortcut access
  const scaleRef = useRef(zoom);
  useEffect(() => { scaleRef.current = zoom; }, [zoom]);
  const panOffsetRef = useRef(panOffset);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  // Paste confirm handler (for snippet paste preview mode)
  const handlePasteConfirm = useCallback((targetX: number, targetY: number) => {
    if (!pasteSnippet || !page) return;
    const offsetX = targetX - pasteSnippet.width / 2;
    const offsetY = targetY - pasteSnippet.height / 2;
    const newStrokes = denormalizeStrokes(pasteSnippet.strokes, offsetX, offsetY);
    setPage(prev => ({ ...prev, strokes: [...prev.strokes, ...newStrokes] }));
    pushCommand({ type: 'pasteSnippet', pageId: page.id, strokes: newStrokes });
    setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
    setPasteSnippet(null);
  }, [pasteSnippet, page, setPage, pushCommand, queuePageSync]);

  // Start paste mode from snippet panel
  const handleSnippetPaste = useCallback((snippet: Snippet) => {
    setPasteSnippet(snippet);
    setSnippetPanelOpen(false);
    setActiveTool('select');
  }, []);

  // Keep refs updated for keyboard shortcuts
  useEffect(() => { copySelectionRef.current = copySelection; }, [copySelection]);
  useEffect(() => { deleteSelectionRef.current = deleteSelection; }, [deleteSelection]);
  useEffect(() => { pasteFromClipboardRef.current = pasteFromClipboard; }, [pasteFromClipboard]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);
  useEffect(() => { pendingSelectionRef.current = pendingSelection; }, [pendingSelection]);

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
        onSelectionComplete={handleSelectionComplete}
        pastePreview={pasteSnippet}
        onPasteConfirm={handlePasteConfirm}
        selectionActive={!!pendingSelection}
      />
      {/* Selection action bar */}
      {pendingSelection && activeTool === 'select' && !pasteSnippet && (
        <SelectionActionBar
          bounds={pendingSelection.bounds}
          zoom={zoom}
          panOffset={panOffset}
          onCopy={copySelection}
          onDelete={deleteSelection}
          onSaveSnippet={saveSelectionAsSnippet}
        />
      )}
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
        onSnippetPanelToggle={() => setSnippetPanelOpen(v => !v)}
        snippetPanelOpen={snippetPanelOpen}
        canUndo={canUndo}
        canRedo={canRedo}
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
      {snippetPanelOpen && (
        <SnippetPanel
          snippets={snippets}
          onPaste={handleSnippetPaste}
          onDelete={deleteSnippet}
          onClose={() => setSnippetPanelOpen(false)}
        />
      )}
      {snippetSaveDialog && pendingSelection && (
        <SnippetSaveDialog
          thumbnail={(() => {
            const { normalized, width, height } = normalizeStrokes(pendingSelection.strokes);
            return generateSnippetThumbnail(normalized, width, height);
          })()}
          strokeCount={pendingSelection.strokes.length}
          onSave={handleSnippetSave}
          onCancel={() => { setSnippetSaveDialog(false); setPendingSelection(null); }}
        />
      )}
    </>
  );
}

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = isMac ? '\u2318' : 'Ctrl';
const SHIFT = isMac ? '\u21E7' : 'Shift';

function SelectionActionBar({ bounds, zoom, panOffset, onCopy, onDelete, onSaveSnippet }: {
  bounds: { x: number; y: number; width: number; height: number };
  zoom: number;
  panOffset: { x: number; y: number };
  onCopy: () => void;
  onDelete: () => void;
  onSaveSnippet: () => void;
}) {
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  const s = zoom;
  const pX = (w / 2) * (1 - s) + panOffset.x;
  const pY = (h / 2) * (1 - s) + panOffset.y;
  const screenX = (bounds.x + bounds.width / 2) * s + pX;
  const screenY = (bounds.y + bounds.height) * s + pY + 12;
  return (
    <div
      className="fixed z-50 bg-neutral-900/90 backdrop-blur-md rounded-lg px-1.5 py-1 flex items-center gap-1 shadow-xl border border-neutral-700/50 animate-slide-up"
      style={{ left: screenX, top: screenY, transform: 'translateX(-50%)' }}
      onPointerDown={e => e.stopPropagation()}
    >
      <SelectActionBtn onClick={onCopy} title={`Copy (${isMac ? '\u2318' : 'Ctrl'}+C)`} icon={<CopyIcon />} label="Copy" />
      <SelectActionBtn onClick={onDelete} title="Delete" icon={<DeleteIcon />} label="Delete" danger />
      <div className="w-px h-5 bg-white/15 mx-0.5" />
      <SelectActionBtn onClick={onSaveSnippet} title="Save as Snippet" icon={<SnippetSaveIcon />} label="Snippet" />
    </div>
  );
}

function SelectActionBtn({ onClick, title, icon, label, danger }: {
  onClick: () => void; title: string; icon: React.ReactNode; label: string; danger?: boolean;
}) {
  return (
    <button
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs bg-transparent border-none cursor-pointer transition-colors whitespace-nowrap
        ${danger ? 'text-red-400 hover:bg-red-500/15' : 'text-neutral-300 hover:bg-white/10 hover:text-white'}`}
      onClick={onClick}
      title={title}
    >
      {icon}
      {label}
    </button>
  );
}

function CopyIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
}

function DeleteIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>);
}

function SnippetSaveIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="14" height="14" rx="2" /><path d="M4 8H2v14a2 2 0 0 0 2 2h14v-2" /></svg>);
}

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
            <ShortcutRow keys={['S']} label="Select" />
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
            <ShortcutRow keys={[MOD, 'C']} label="Copy selection" />
            <ShortcutRow keys={[MOD, 'V']} label="Paste" />
            <ShortcutRow keys={['Del']} label="Delete selection" />
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
