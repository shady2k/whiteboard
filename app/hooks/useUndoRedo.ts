import { useState, useCallback, useEffect, useRef, useMemo } from 'react';
import { Stroke, Command, Page } from '@/app/types';
import { saveUndoHistory, loadUndoHistory } from '@/app/lib/idb';

interface UseUndoRedoParams {
  sessionId: string;
  updatePageStrokes: (pageId: string, updater: (strokes: Stroke[]) => Stroke[]) => void;
  setPage: (updater: Page | ((prev: Page) => Page)) => void;
  queuePageSync: (page: Page) => void;
  queueBackgroundSync: (page: Page) => void;
  pageRef: React.RefObject<Page | null>;
}

export function useUndoRedo({
  sessionId,
  updatePageStrokes,
  setPage,
  queuePageSync,
  queueBackgroundSync,
  pageRef,
}: UseUndoRedoParams) {
  const [undoStack, setUndoStack] = useState<Command[]>([]);
  const [redoStack, setRedoStack] = useState<Command[]>([]);

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

  const pushCommand = useCallback((cmd: Command) => {
    setUndoStack(prev => [...prev, cmd]);
    setRedoStack([]);
  }, []);

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
          updatePageStrokes(cmd.pageId, s => s.some(st => st.id === cmd.stroke.id) ? s : [...s, cmd.stroke]);
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
        case 'pasteSnippet': {
          const ids = new Set(cmd.strokes.map(s => s.id));
          updatePageStrokes(cmd.pageId, s => s.filter(st => !ids.has(st.id)));
          break;
        }
        case 'deleteSelected': {
          const existingIds = new Set<string>();
          updatePageStrokes(cmd.pageId, s => {
            existingIds.clear();
            for (const st of s) existingIds.add(st.id);
            const toAdd = cmd.strokes.filter(st => !existingIds.has(st.id));
            return toAdd.length > 0 ? [...s, ...toAdd] : s;
          });
          break;
        }
        case 'eraseStrokes':
          // Undo: remove remaining fragments, restore originals
          updatePageStrokes(cmd.pageId, s => {
            let result = [...s];
            const allFragIds = new Set<string>();
            for (const { remaining } of cmd.erased) {
              for (const r of remaining) allFragIds.add(r.id);
            }
            result = result.filter(st => !allFragIds.has(st.id));
            // Re-add originals only if not already present
            const resultIds = new Set(result.map(st => st.id));
            for (const { original } of cmd.erased) {
              if (!resultIds.has(original.id)) {
                result.push(original);
              }
            }
            return result;
          });
          break;
      }

      setRedoStack(r => [...r, cmd]);
      setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
      return rest;
    });
  }, [updatePageStrokes, setPage, queuePageSync, queueBackgroundSync, pageRef]);

  const redo = useCallback(() => {
    setRedoStack(prev => {
      if (prev.length === 0) return prev;
      const cmd = prev[prev.length - 1];
      const rest = prev.slice(0, -1);

      switch (cmd.type) {
        case 'createStroke':
        case 'pasteImage':
          updatePageStrokes(cmd.pageId, s => s.some(st => st.id === cmd.stroke.id) ? s : [...s, cmd.stroke]);
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
        case 'pasteSnippet':
          updatePageStrokes(cmd.pageId, s => {
            const existingIds = new Set(s.map(st => st.id));
            const toAdd = cmd.strokes.filter(st => !existingIds.has(st.id));
            return toAdd.length > 0 ? [...s, ...toAdd] : s;
          });
          break;
        case 'deleteSelected': {
          const ids = new Set(cmd.strokes.map(s => s.id));
          updatePageStrokes(cmd.pageId, s => s.filter(st => !ids.has(st.id)));
          break;
        }
        case 'eraseStrokes':
          // Redo: remove originals, insert remaining fragments
          updatePageStrokes(cmd.pageId, s => {
            let result = [...s];
            for (const { strokeId, remaining } of cmd.erased) {
              const idx = result.findIndex(st => st.id === strokeId);
              if (idx !== -1) {
                result.splice(idx, 1, ...remaining);
              } else {
                result = result.filter(st => st.id !== strokeId);
                // Only add fragments not already present
                const existingIds = new Set(result.map(st => st.id));
                const toAdd = remaining.filter(r => !existingIds.has(r.id));
                result.push(...toAdd);
              }
            }
            return result;
          });
          break;
      }

      setUndoStack(u => [...u, cmd]);
      setTimeout(() => { if (pageRef.current) queuePageSync(pageRef.current); }, 0);
      return rest;
    });
  }, [updatePageStrokes, setPage, queuePageSync, queueBackgroundSync, pageRef]);

  const canUndo = useMemo(() => undoStack.length > 0, [undoStack]);
  const canRedo = useMemo(() => redoStack.length > 0, [redoStack]);

  return { undoStack, redoStack, pushCommand, undo, redo, canUndo, canRedo };
}
