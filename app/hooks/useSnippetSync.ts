'use client';

import { useRef, useCallback, useEffect, useState } from 'react';
import type { Snippet } from '@/app/types';
import { v4 as uuidv4 } from 'uuid';
import {
  putSnippet as putSnippetIDB,
  getAllSnippets as getAllSnippetsIDB,
  deleteSnippetFromIDB,
  putPendingAction,
  clearPendingAction,
  getPendingActions,
} from '@/app/lib/idb';

export function useSnippetSync() {
  const [snippets, setSnippets] = useState<Snippet[]>([]);
  const [loaded, setLoaded] = useState(false);
  const mountedRef = useRef(true);

  // Load from IDB first, then sync with server
  const loadSnippets = useCallback(async () => {
    // Load local first
    const local = await getAllSnippetsIDB();
    if (mountedRef.current) {
      setSnippets(local);
      setLoaded(true);
    }

    // Then fetch from server and merge (server wins for existing, keep unsynced local)
    try {
      const res = await fetch('/api/snippets');
      if (!res.ok) return;
      const serverSnippets: Snippet[] = await res.json();

      const serverIds = new Set(serverSnippets.map(s => s.id));

      // Find locally-created and locally-deleted snippets that haven't synced yet
      const pending = await getPendingActions();
      const pendingCreateIds = new Set(
        pending.filter(a => a.type === 'snippetCreate').map(a => {
          try { return JSON.parse(a.payload).id; } catch { return null; }
        }).filter(Boolean)
      );
      const pendingDeleteIds = new Set(
        pending.filter(a => a.type === 'snippetDelete').map(a => {
          try { return JSON.parse(a.payload).id; } catch { return null; }
        }).filter(Boolean)
      );

      // Keep local snippets that are pending creation (not yet on server)
      const unsyncedLocal = local.filter(s => !serverIds.has(s.id) && pendingCreateIds.has(s.id));

      // Exclude server snippets that are pending local deletion
      const merged = [...serverSnippets.filter(s => !pendingDeleteIds.has(s.id)), ...unsyncedLocal];

      // Update IDB with server state (skip pending deletes)
      for (const s of serverSnippets) {
        if (!pendingDeleteIds.has(s.id)) {
          await putSnippetIDB(s);
        }
      }

      // Remove local snippets that aren't on server and aren't pending create,
      // and also remove any that are pending deletion
      for (const s of local) {
        if (pendingDeleteIds.has(s.id) || (!serverIds.has(s.id) && !pendingCreateIds.has(s.id))) {
          await deleteSnippetFromIDB(s.id);
        }
      }

      if (mountedRef.current) {
        setSnippets(merged);
      }
    } catch {
      // Offline — local data is fine
    }
  }, []);

  const replayPending = useCallback(async () => {
    const pending = await getPendingActions();
    for (const action of pending) {
      if (action.type === 'snippetCreate') {
        try {
          const payload = JSON.parse(action.payload);
          const res = await fetch('/api/snippets', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ...payload, actionId: action.actionId }),
          });
          if (res.ok) await clearPendingAction(action.actionId);
        } catch { /* will retry next time */ }
      } else if (action.type === 'snippetDelete') {
        try {
          const { id } = JSON.parse(action.payload);
          const res = await fetch(`/api/snippets?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
          if (res.ok) await clearPendingAction(action.actionId);
        } catch { /* will retry next time */ }
      }
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    loadSnippets();
    replayPending();
    return () => { mountedRef.current = false; };
  }, [loadSnippets, replayPending]);

  // Replay pending snippet actions on reconnect
  useEffect(() => {
    const handleOnline = () => replayPending();
    window.addEventListener('online', handleOnline);
    return () => window.removeEventListener('online', handleOnline);
  }, [replayPending]);

  const saveSnippet = useCallback(async (snippet: Snippet) => {
    // Save locally immediately
    await putSnippetIDB(snippet);
    setSnippets(prev => [snippet, ...prev]);

    const actionId = uuidv4();
    const payload = {
      id: snippet.id,
      name: snippet.name,
      strokes: snippet.strokes,
      width: snippet.width,
      height: snippet.height,
      thumbnail: snippet.thumbnail,
    };

    // Try server sync
    try {
      const res = await fetch('/api/snippets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...payload, actionId }),
      });
      if (!res.ok) throw new Error('Server error');
    } catch {
      // Queue for later
      await putPendingAction({
        actionId,
        type: 'snippetCreate',
        payload: JSON.stringify(payload),
        createdAt: Date.now(),
        status: 'pending',
      });
    }
  }, []);

  const deleteSnippet = useCallback(async (id: string) => {
    await deleteSnippetFromIDB(id);
    setSnippets(prev => prev.filter(s => s.id !== id));

    const actionId = uuidv4();

    try {
      const res = await fetch(`/api/snippets?id=${encodeURIComponent(id)}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Server error');
    } catch {
      await putPendingAction({
        actionId,
        type: 'snippetDelete',
        payload: JSON.stringify({ id }),
        createdAt: Date.now(),
        status: 'pending',
      });
    }
  }, []);

  return { snippets, loaded, saveSnippet, deleteSnippet };
}
