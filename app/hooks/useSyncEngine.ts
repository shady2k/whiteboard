'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import type { Page, Stroke } from '@/app/types';
import { useOnlineStatus } from './useOnlineStatus';
import { v4 as uuidv4 } from 'uuid';
import {
  clearDirty,
  getAssetMapping,
  putAssetMapping,
  getAsset,
  getPage,
  putPendingAction,
  clearPendingAction,
  getPendingActions,
  putAsset,
  putPage,
} from '@/app/lib/idb';


const MAX_RETRIES = 8;
const BASE_DELAY = 500;
const MAX_DELAY = 30_000;

async function fetchWithRetry(
  url: string,
  options: RequestInit,
  retries = MAX_RETRIES
): Promise<Response> {
  let lastError: unknown;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await fetch(url, options);
      if (res.ok) return res;
      if (res.status < 500) return res;
      lastError = new Error(`Server error: ${res.status}`);
    } catch (e) {
      lastError = e;
    }
    if (attempt < retries) {
      const delay = Math.min(BASE_DELAY * Math.pow(2, attempt), MAX_DELAY);
      const jitter = delay * (0.5 + Math.random() * 0.5);
      await new Promise((r) => setTimeout(r, jitter));
    }
  }
  throw lastError;
}

async function resolveStrokesForServer(strokes: Stroke[]): Promise<Stroke[]> {
  return Promise.all(
    strokes.map(async (s) => {
      if (s.type === 'image' && s.assetId.startsWith('local-')) {
        const mapping = await getAssetMapping(s.assetId);
        if (mapping) {
          return { ...s, assetId: mapping.remoteId };
        }
      }
      return s;
    })
  );
}

async function findExistingActionId(localId: string): Promise<string | null> {
  const actions = await getPendingActions();
  for (const a of actions) {
    if (a.type === 'assetUpload') {
      try {
        const payload = JSON.parse(a.payload);
        if (payload.localId === localId) return a.actionId;
      } catch { /* ignore */ }
    }
  }
  return null;
}

async function uploadPendingAssetsForPage(
  strokes: Stroke[],
  sessionId: string
): Promise<boolean> {
  const imageStrokes = strokes.filter(
    (s) => s.type === 'image' && s.assetId.startsWith('local-')
  );

  for (const stroke of imageStrokes) {
    if (stroke.type !== 'image') continue;
    const localId = stroke.assetId;

    // Already mapped?
    const existing = await getAssetMapping(localId);
    if (existing) continue;

    // Get blob from IDB
    const asset = await getAsset(localId);
    if (!asset) continue;

    // Reuse existing actionId if we already attempted this upload (crash recovery / retry)
    let actionId = await findExistingActionId(localId);
    if (!actionId) {
      actionId = uuidv4();
      await putPendingAction({
        actionId,
        type: 'assetUpload',
        payload: JSON.stringify({ localId, sessionId }),
        createdAt: Date.now(),
        status: 'inflight',
      });
    }

    try {
      const formData = new FormData();
      const file = new File([asset.blob], `${localId}.png`, { type: asset.mimeType });
      formData.append('file', file);
      formData.append('actionId', actionId);

      const res = await fetchWithRetry('/api/assets', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) return false;
      const { id: remoteId } = await res.json();

      await putAssetMapping({ localId, remoteId });

      // Also store blob under remote ID for cache hits
      await putAsset({ ...asset, id: remoteId, pendingUpload: false });

      // Mark original as uploaded
      await putAsset({ ...asset, pendingUpload: false });

      await clearPendingAction(actionId);
    } catch {
      return false;
    }
  }

  return true;
}

export function useSyncEngine(sessionId: string) {
  const isOnline = useOnlineStatus();
  const [isSyncing, setIsSyncing] = useState(false);

  const pageSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bgSyncTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingPageRef = useRef<Page | null>(null);
  const pendingBgRef = useRef<Page | null>(null);
  const syncingRef = useRef(false);
  // Track server revision per page for optimistic concurrency
  const pageRevisionRef = useRef<Record<string, number>>({});
  const onConflictRef = useRef<((serverStrokes: Stroke[]) => void) | null>(null);

  const loadLatestPage = useCallback(
    async (page: Page): Promise<Page> => {
      const latest = await getPage(page.id);
      if (!latest) return page;
      return {
        id: latest.id,
        sessionId: latest.sessionId,
        position: latest.position,
        backgroundPattern: latest.backgroundPattern,
        backgroundColor: latest.backgroundColor,
        strokes: latest.strokes,
      };
    },
    []
  );

  const doPageSync = useCallback(
    async (page: Page) => {
      if (!navigator.onLine) return;

      const latestPage = await loadLatestPage(page);

      // Upload pending assets for this page
      const assetsOk = await uploadPendingAssetsForPage(latestPage.strokes, sessionId);
      if (!assetsOk) return;

      // Resolve local IDs to remote IDs for server
      const resolvedStrokes = await resolveStrokesForServer(latestPage.strokes);

      // Abort if any unresolved local- IDs remain — don't send them to the server
      const hasUnresolved = resolvedStrokes.some(
        (s) => s.type === 'image' && s.assetId.startsWith('local-')
      );
      if (hasUnresolved) {
        console.warn('Page sync deferred: unresolved local asset IDs');
        return;
      }

      const actionId = uuidv4();
      await putPendingAction({
        actionId,
        type: 'pageSync',
        payload: JSON.stringify({ pageId: page.id }),
        createdAt: Date.now(),
        status: 'inflight',
      });

      try {
        const res = await fetchWithRetry('/api/strokes', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageId: latestPage.id,
            sessionId,
            strokes: resolvedStrokes,
            actionId,
            expectedRevision: pageRevisionRef.current[latestPage.id],
          }),
        });
        if (res.status === 409) {
          const body = await res.json();
          if (body.conflict && body.strokes) {
            // Server has newer data — hydrate locally
            console.warn('Page sync conflict — accepting server version, revision:', body.revision);
            pageRevisionRef.current[latestPage.id] = body.revision;
            const serverPage: Page = { ...latestPage, strokes: body.strokes };
            await putPage(serverPage, 0); // localUpdatedAt=0 so server wins next comparison
            await clearDirty(latestPage.id);
            onConflictRef.current?.(body.strokes);
          }
          await clearPendingAction(actionId);
          return;
        }
        if (!res.ok) {
          console.error('Page sync failed with status:', res.status);
          return;
        }
        const result = await res.json();
        if (result.revision !== undefined) {
          pageRevisionRef.current[latestPage.id] = result.revision;
        }
        await clearDirty(latestPage.id);
        await clearPendingAction(actionId);
      } catch (e) {
        console.error('Page sync failed:', e);
      }
    },
    [loadLatestPage, sessionId]
  );

  const doBgSync = useCallback(
    async (page: Page) => {
      if (!navigator.onLine) return;

      const latestPage = await loadLatestPage(page);

      const actionId = uuidv4();
      await putPendingAction({
        actionId,
        type: 'backgroundSync',
        payload: JSON.stringify({ pageId: latestPage.id }),
        createdAt: Date.now(),
        status: 'inflight',
      });

      try {
        const res = await fetchWithRetry('/api/pages', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            pageId: latestPage.id,
            backgroundPattern: latestPage.backgroundPattern,
            backgroundColor: latestPage.backgroundColor,
            actionId,
          }),
        });
        if (!res.ok) {
          console.error('Background sync failed with status:', res.status);
          return;
        }
        const result = await res.json();
        if (result.revision !== undefined) {
          pageRevisionRef.current[latestPage.id] = result.revision;
        }
        await clearPendingAction(actionId);
      } catch (e) {
        console.error('Background sync failed:', e);
      }
    },
    [loadLatestPage]
  );

  const flushAll = useCallback(async () => {
    if (syncingRef.current) return;
    syncingRef.current = true;
    setIsSyncing(true);

    try {
      // Flush pending page sync
      if (pageSyncTimerRef.current) {
        clearTimeout(pageSyncTimerRef.current);
        pageSyncTimerRef.current = null;
      }
      const pagePending = pendingPageRef.current;
      if (pagePending) {
        pendingPageRef.current = null;
        await doPageSync(pagePending);
      }

      // Flush pending bg sync
      if (bgSyncTimerRef.current) {
        clearTimeout(bgSyncTimerRef.current);
        bgSyncTimerRef.current = null;
      }
      const bgPending = pendingBgRef.current;
      if (bgPending) {
        pendingBgRef.current = null;
        await doBgSync(bgPending);
      }

    } finally {
      syncingRef.current = false;
      setIsSyncing(false);
    }
  }, [doPageSync, doBgSync]);

  const queuePageSync = useCallback(
    (page: Page) => {
      pendingPageRef.current = page;
      if (pageSyncTimerRef.current) clearTimeout(pageSyncTimerRef.current);
      pageSyncTimerRef.current = setTimeout(async () => {
        pageSyncTimerRef.current = null;
        if (syncingRef.current) {
          // Another sync is running — reschedule so this work isn't lost
          pageSyncTimerRef.current = setTimeout(() => {
            const p = pendingPageRef.current;
            if (p) {
              pendingPageRef.current = null;
              queuePageSync(p);
            }
          }, 500);
          return;
        }
        const p = pendingPageRef.current;
        if (!p) return;
        pendingPageRef.current = null;
        syncingRef.current = true;
        setIsSyncing(true);
        await doPageSync(p);
        // After sync, drain any work that accumulated during this sync
        const next = pendingPageRef.current;
        if (next) {
          pendingPageRef.current = null;
          await doPageSync(next);
        }
        syncingRef.current = false;
        setIsSyncing(false);
      }, 500);
    },
    [doPageSync]
  );

  const queueBackgroundSync = useCallback(
    (page: Page) => {
      pendingBgRef.current = page;
      if (bgSyncTimerRef.current) clearTimeout(bgSyncTimerRef.current);
      bgSyncTimerRef.current = setTimeout(async () => {
        bgSyncTimerRef.current = null;
        const p = pendingBgRef.current;
        if (!p) return;
        pendingBgRef.current = null;
        await doBgSync(p);
      }, 500);
    },
    [doBgSync]
  );

  const tryThumbnailSync = useCallback(
    (dataUrl: string) => {
      if (!navigator.onLine) return;
      fetch(`/api/sessions/${sessionId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ thumbnail: dataUrl }),
      }).catch(() => {});
    },
    [sessionId]
  );

  // Flush on visibility change / page hide
  useEffect(() => {
    const handleVisChange = () => {
      if (document.visibilityState === 'hidden') flushAll();
    };
    const handlePageHide = () => flushAll();

    document.addEventListener('visibilitychange', handleVisChange);
    window.addEventListener('pagehide', handlePageHide);
    return () => {
      document.removeEventListener('visibilitychange', handleVisChange);
      window.removeEventListener('pagehide', handlePageHide);
      if (pageSyncTimerRef.current) clearTimeout(pageSyncTimerRef.current);
      if (bgSyncTimerRef.current) clearTimeout(bgSyncTimerRef.current);
    };
  }, [flushAll]);

  // Flush when coming back online
  useEffect(() => {
    if (isOnline) {
      flushAll();
    }
  }, [isOnline, flushAll]);

  const setOnConflict = useCallback((cb: (serverStrokes: Stroke[]) => void) => {
    onConflictRef.current = cb;
  }, []);

  const setPageRevision = useCallback((pageId: string, revision: number) => {
    pageRevisionRef.current[pageId] = revision;
  }, []);

  return {
    queuePageSync,
    queueBackgroundSync,
    tryThumbnailSync,
    flushNow: flushAll,
    isOnline,
    isSyncing,
    setOnConflict,
    setPageRevision,
  };
}
