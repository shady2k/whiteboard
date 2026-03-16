'use client';

import { useRef, useCallback, useEffect } from 'react';
import { Stroke } from '@/app/types';

interface AutoSaveOptions {
  sessionId: string;
  pageId: string;
  debounceMs?: number;
}

export function useAutoSave({ sessionId, pageId, debounceMs = 500 }: AutoSaveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Stroke[] | null>(null);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const strokes = pendingRef.current;
    if (strokes === null) return;
    pendingRef.current = null;

    try {
      await fetch('/api/strokes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, sessionId, strokes }),
      });
    } catch (e) {
      console.error('Autosave failed:', e);
    }
  }, [pageId, sessionId]);

  const saveStrokes = useCallback((strokes: Stroke[]) => {
    pendingRef.current = strokes;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, debounceMs);
  }, [flush, debounceMs]);

  const saveImmediate = useCallback(async (strokes: Stroke[]) => {
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    try {
      await fetch('/api/strokes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, sessionId, strokes }),
      });
    } catch (e) {
      console.error('Immediate save failed:', e);
    }
  }, [pageId, sessionId]);

  // Flush on visibility change / page hide
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        flush();
      }
    };
    const handlePageHide = () => flush();

    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('pagehide', handlePageHide);

    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('pagehide', handlePageHide);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [flush]);

  return { saveStrokes, saveImmediate, flush };
}
