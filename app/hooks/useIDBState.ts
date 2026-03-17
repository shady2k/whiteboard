'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Page } from '@/app/types';
import { useOnlineStatus } from './useOnlineStatus';
import {
  getPagesBySession,
  putPage,
  markPageDirty,
  getDirtyPagesForSession,
  putSession,
} from '@/app/lib/idb';
import { resolveAssetId } from '@/app/lib/idb';

async function computePageHash(page: Page): Promise<string> {
  const sorted = {
    id: page.id,
    bg: page.backgroundPattern + page.backgroundColor,
    strokes: page.strokes
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map((s) => {
        if (s.type === 'image') {
          // Resolve local asset IDs for hash comparison with server
          return { ...s, assetId: '__resolved__' };
        }
        return s;
      }),
  };
  const text = JSON.stringify(sorted);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

async function computePageHashWithResolvedAssets(page: Page): Promise<string> {
  const resolvedStrokes = await Promise.all(
    page.strokes
      .slice()
      .sort((a, b) => a.id.localeCompare(b.id))
      .map(async (s) => {
        if (s.type === 'image') {
          const remoteId = await resolveAssetId(s.assetId);
          return { ...s, assetId: remoteId };
        }
        return s;
      })
  );
  const sorted = {
    id: page.id,
    bg: page.backgroundPattern + page.backgroundColor,
    strokes: resolvedStrokes,
  };
  const text = JSON.stringify(sorted);
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

interface ServerPageData {
  id: string;
  session_id: string;
  position: number;
  background_pattern: string;
  background_color: string;
  strokes: Array<{ id: string; type: string; [key: string]: unknown }>;
}

function serverPageToPage(sp: ServerPageData): Page {
  return {
    id: sp.id,
    sessionId: sp.session_id,
    position: sp.position,
    backgroundPattern: sp.background_pattern as Page['backgroundPattern'],
    backgroundColor: sp.background_color,
    strokes: sp.strokes.map((s) => ({ ...s }) as never),
  };
}

export function useIDBState(
  sessionId: string,
  initialPages: Page[],
  sessionName: string
) {
  const [page, setPageState] = useState<Page | null>(initialPages[0] ?? null);
  const isOffline = !useOnlineStatus();
  const idbInitialized = useRef(false);
  const fetchStartedAtRef = useRef<number>(0);

  // On mount: load from IDB, background-fetch from server
  useEffect(() => {
    if (idbInitialized.current) return;
    idbInitialized.current = true;

    (async () => {
      try {
        const idbPages = await getPagesBySession(sessionId);

        if (idbPages.length > 0) {
          // Sort by position
          idbPages.sort((a, b) => a.position - b.position);
          const first = idbPages[0];
          setPageState({
            id: first.id,
            sessionId: first.sessionId,
            position: first.position,
            backgroundPattern: first.backgroundPattern,
            backgroundColor: first.backgroundColor,
            strokes: first.strokes,
          });
        } else {
          // No IDB data — populate from SSR
          for (const p of initialPages) {
            await putPage(p, 0);
          }
          await putSession({
            id: sessionId,
            name: sessionName,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            thumbnail: null,
          });
        }

        // Background fetch from server
        fetchStartedAtRef.current = Date.now();
        try {
          const res = await fetch(`/api/sessions/${sessionId}/data`);
          if (!res.ok) return;
          const serverData = await res.json();
          const serverPages: ServerPageData[] = serverData.pages || [];

          // Get current dirty pages
          const dirtySet = new Set(
            (await getDirtyPagesForSession(sessionId)).map((d) => d.pageId)
          );

          // Re-read fresh IDB state after fetch (user may have edited during fetch)
          const freshIdbPages = await getPagesBySession(sessionId);

          for (const sp of serverPages) {
            const serverPage = serverPageToPage(sp);

            // Skip if dirty locally
            if (dirtySet.has(serverPage.id)) continue;

            // Re-read fresh IDB page to avoid stale snapshot
            const freshLocalPage = freshIdbPages.find((p) => p.id === serverPage.id);
            if (freshLocalPage && freshLocalPage.localUpdatedAt > fetchStartedAtRef.current) {
              continue;
            }

            // Compare hashes
            const localPage = freshLocalPage
              ? ({
                  id: freshLocalPage.id,
                  sessionId: freshLocalPage.sessionId,
                  position: freshLocalPage.position,
                  backgroundPattern: freshLocalPage.backgroundPattern,
                  backgroundColor: freshLocalPage.backgroundColor,
                  strokes: freshLocalPage.strokes,
                } as Page)
              : null;

            if (localPage) {
              const [localHash, serverHash] = await Promise.all([
                computePageHashWithResolvedAssets(localPage),
                computePageHash(serverPage),
              ]);
              if (localHash === serverHash) continue;
            }

            // Server wins — update IDB and state
            await putPage(serverPage, 0);
            if (serverPage.id === page?.id || serverPage.position === 0) {
              setPageState(serverPage);
            }
          }
        } catch {
          // Server unreachable — proceed with IDB/SSR data
        }
      } catch (err) {
        console.error('IDB init error:', err);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId]);

  const setPage = useCallback(
    (updater: Page | ((prev: Page) => Page)) => {
      setPageState((prev) => {
        if (!prev) return prev;
        const next = typeof updater === 'function' ? updater(prev) : updater;

        // Async write to IDB
        putPage(next).catch(() => {});
        markPageDirty(next.id, sessionId).catch(() => {});

        return next;
      });
    },
    [sessionId]
  );

  return { page, setPage, isOffline };
}
