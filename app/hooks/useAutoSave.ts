'use client';

import { useRef, useCallback, useEffect } from 'react';
import { Stroke } from '@/app/types';

interface AutoSaveOptions {
  sessionId: string;
  pageId: string;
  debounceMs?: number;
}

const MAX_RETRIES = 8;
const BASE_DELAY = 500; // ms
const MAX_DELAY = 30_000; // ms

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      // Server error (5xx) — retry; client error (4xx) — don't
      if (res.status < 500) return res;
      lastError = new Error(`Server error: ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    if (attempt < retries) {
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      await new Promise(r => setTimeout(r, jitter));
    }
  }
  throw lastError;
}

export function useAutoSave({ sessionId, pageId, debounceMs = 500 }: AutoSaveOptions) {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingRef = useRef<Stroke[] | null>(null);
  const savingRef = useRef(false);

  const doSave = useCallback(async (strokes: Stroke[]): Promise<boolean> => {
    try {
      await fetchWithRetry('/api/strokes', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ pageId, sessionId, strokes }),
      });
      return true;
    } catch (e) {
      console.error('Autosave failed after retries:', e);
      // Re-queue the data so next save attempt picks it up
      pendingRef.current = strokes;
      return false;
    }
  }, [pageId, sessionId]);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }

    if (savingRef.current) return;

    savingRef.current = true;
    try {
      while (true) {
        const strokes = pendingRef.current;
        if (strokes === null) break;

        pendingRef.current = null;
        const ok = await doSave(strokes);
        if (!ok) break; // Leave pendingRef intact for online retry
      }
    } finally {
      savingRef.current = false;
    }
  }, [doSave]);

  const saveStrokes = useCallback((strokes: Stroke[]) => {
    pendingRef.current = strokes;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(flush, debounceMs);
  }, [flush, debounceMs]);

  const saveImmediate = useCallback(async (strokes: Stroke[]) => {
    // Cancel any pending debounced save
    pendingRef.current = null;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    // Wait for any in-flight save to finish before sending ours
    // This prevents a stale in-flight PUT from overwriting our immediate save
    while (savingRef.current) {
      await new Promise(r => setTimeout(r, 50));
    }
    savingRef.current = true;
    await doSave(strokes);
    savingRef.current = false;
  }, [doSave]);

  // Flush on visibility change / page hide
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') flush();
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

  // Retry pending saves when coming back online
  useEffect(() => {
    const handleOnline = () => {
      if (pendingRef.current) flush();
    };
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [flush]);

  return { saveStrokes, saveImmediate, flush };
}
