'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { getAllSessions, getSession, putSession, putPage, putPendingAction, getPendingActions, clearPendingAction, getPagesBySession } from '@/app/lib/idb';
import { replaySessionActions } from '@/app/lib/replayPendingActions';
import { v4 as uuidv4 } from 'uuid';
import type { Page } from '@/app/types';
import WhiteboardLoader from '@/app/components/Whiteboard/WhiteboardLoader';
import { useOnlineStatus } from '@/app/hooks/useOnlineStatus';

interface SessionSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  page_count: number;
  thumbnail: string | null;
  bg_color: string | null;
  bg_pattern: string | null;
}

export default function SessionList() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const isOffline = !useOnlineStatus();
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [offlineSessionId, setOfflineSessionId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    // Load from IDB first for instant display
    getAllSessions().then(idbSessions => {
      if (idbSessions.length > 0) {
        const mapped: SessionSummary[] = idbSessions.map(s => ({
          id: s.id,
          name: s.name,
          created_at: s.createdAt,
          updated_at: s.updatedAt,
          page_count: 0,
          thumbnail: s.thumbnail,
          bg_color: null,
          bg_pattern: null,
        }));
        setSessions(mapped);
        setLoaded(true);
      }
    }).catch(() => {});

    // Then fetch from server and merge with IDB sessions
    fetch('/api/sessions')
      .then(r => r.json())
      .then(async (serverData: SessionSummary[]) => {
        // Merge: server sessions + any IDB-only sessions (e.g. created offline)
        const serverIds = new Set(serverData.map((s: SessionSummary) => s.id));
        const idbSessions = await getAllSessions();
        const idbOnly = idbSessions
          .filter(s => !serverIds.has(s.id))
          .map(s => ({
            id: s.id,
            name: s.name,
            created_at: s.createdAt,
            updated_at: s.updatedAt,
            page_count: 0,
            thumbnail: s.thumbnail,
            bg_color: null,
            bg_pattern: null,
          } as SessionSummary));

        setSessions([...serverData, ...idbOnly]);
        setLoaded(true);

        // Update IDB cache with server data
        for (const s of serverData) {
          putSession({
            id: s.id,
            name: s.name,
            createdAt: s.created_at,
            updatedAt: s.updated_at,
            thumbnail: s.thumbnail,
          }).catch(() => {});
        }

        // Pre-cache page data for sessions that don't have pages in IDB yet.
        // This ensures offline access to session content.
        for (const s of serverData) {
          getPagesBySession(s.id).then(async (idbPages) => {
            if (idbPages.length > 0) return; // already cached
            try {
              const dataRes = await fetch(`/api/sessions/${s.id}/data`);
              if (!dataRes.ok) return;
              const data = await dataRes.json();
              for (const sp of (data.pages || [])) {
                const page: Page = {
                  id: sp.id,
                  sessionId: sp.session_id,
                  position: sp.position,
                  backgroundPattern: sp.background_pattern,
                  backgroundColor: sp.background_color,
                  strokes: (sp.strokes || []).map((st: Record<string, unknown>) => ({ ...st })),
                };
                await putPage(page, 0);
              }
            } catch { /* non-critical background caching */ }
          }).catch(() => {});
        }
      })
      .catch(() => setLoaded(true));
  }, []);

  // Replay pending actions when coming back online.
  useEffect(() => {
    if (!isOffline) replaySessionActions();
  }, [isOffline]);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

  // Handle browser back button when viewing a whiteboard inline
  useEffect(() => {
    if (!offlineSessionId) return;
    const onPopState = () => {
      if (!window.location.pathname.startsWith('/session/')) {
        setOfflineSessionId(null);
      }
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [offlineSessionId]);

  // Close menu on click outside
  useEffect(() => {
    if (!menuId) return;
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuId(null);
        setConfirmDeleteId(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [menuId]);

  const createSession = async () => {
    const sessionId = uuidv4();
    const pageId = uuidv4();
    const now = new Date().toISOString();

    // Always create in IDB first so it works offline
    await putSession({
      id: sessionId,
      name: 'Untitled',
      createdAt: now,
      updatedAt: now,
      thumbnail: null,
    });
    const newPage: Page = {
      id: pageId,
      sessionId,
      position: 0,
      backgroundPattern: 'blank',
      backgroundColor: '#ffffff',
      strokes: [],
    };
    await putPage(newPage, 0);

    // Persist a pending action so the sync engine can replay it on reconnect
    const actionId = uuidv4();
    await putPendingAction({
      actionId,
      type: 'sessionCreate',
      payload: JSON.stringify({ name: 'Untitled', id: sessionId, pageId }),
      createdAt: Date.now(),
      status: 'pending',
    });

    // Try to create on server immediately (non-blocking)
    fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled', id: sessionId, pageId }),
    }).then(async (res) => {
      if (res.ok) {
        await clearPendingAction(actionId);
      }
    }).catch(() => {});

    if (isOffline) {
      // Offline: render whiteboard inline instead of navigating — the SW can't
      // serve an uncached /session/{id} page, so we stay in the SPA shell.
      setOfflineSessionId(sessionId);
      window.history.pushState(null, '', `/session/${sessionId}`);
    } else {
      router.push(`/session/${sessionId}`);
    }
  };

  const deleteSession = async (id: string) => {
    setMenuId(null);
    setConfirmDeleteId(null);

    // Remove from IDB immediately
    const { deleteSession: deleteIDBSession } = await import('@/app/lib/idb');
    await deleteIDBSession(id);
    setSessions(prev => prev.filter(s => s.id !== id));

    // Cancel any pending sessionCreate for this session (compaction)
    const pending = await getPendingActions();
    for (const action of pending) {
      if (action.type === 'sessionCreate') {
        try {
          const payload = JSON.parse(action.payload);
          if (payload.id === id) {
            await clearPendingAction(action.actionId);
          }
        } catch { /* ignore */ }
      }
    }

    // Persist delete action and try server immediately
    const deleteActionId = uuidv4();
    await putPendingAction({
      actionId: deleteActionId,
      type: 'sessionDelete',
      payload: JSON.stringify({ id }),
      createdAt: Date.now(),
      status: 'pending',
    });

    fetch(`/api/sessions/${id}`, { method: 'DELETE' })
      .then(async (res) => {
        if (res.ok || res.status === 404) {
          await clearPendingAction(deleteActionId);
        }
      })
      .catch(() => {});
  };

  const cloneSession = async (id: string) => {
    setMenuId(null);

    try {
      if (!isOffline) {
        const res = await fetch(`/api/sessions/${id}`, { method: 'POST' });
        if (res.ok) {
          const cloned = await res.json();
          const listRes = await fetch('/api/sessions');
          setSessions(await listRes.json());
          router.push(`/session/${cloned.id}`);
          return;
        }
      }
      throw new Error('offline or failed');
    } catch {
      // Offline clone — duplicate locally from IDB
      const newSessionId = uuidv4();
      const now = new Date().toISOString();

      const sourceSession = await getSession(id);
      if (!sourceSession) return;

      await putSession({
        id: newSessionId,
        name: `${sourceSession.name} (copy)`,
        createdAt: now,
        updatedAt: now,
        thumbnail: sourceSession.thumbnail,
      });

      const sourcePages = await getPagesBySession(id);
      for (const sp of sourcePages) {
        const newPageId = uuidv4();
        const clonedPage: Page = {
          id: newPageId,
          sessionId: newSessionId,
          position: sp.position,
          backgroundPattern: sp.backgroundPattern,
          backgroundColor: sp.backgroundColor,
          strokes: sp.strokes.map(s => ({ ...s, id: uuidv4() })),
        };
        await putPage(clonedPage, Date.now());
      }

      // Queue pending action for server sync
      await putPendingAction({
        actionId: uuidv4(),
        type: 'sessionCreate',
        payload: JSON.stringify({ name: `${sourceSession.name} (copy)`, id: newSessionId, pageId: uuidv4() }),
        createdAt: Date.now(),
        status: 'pending',
      });

      // Try to sync immediately
      fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: `${sourceSession.name} (copy)`, id: newSessionId }),
      }).catch(() => {});

      if (isOffline) {
        setOfflineSessionId(newSessionId);
        window.history.pushState(null, '', `/session/${newSessionId}`);
      } else {
        router.push(`/session/${newSessionId}`);
      }
    }
  };

  const startRename = (id: string, name: string) => {
    setMenuId(null);
    setEditingId(id);
    setEditValue(name);
  };

  const commitRename = async () => {
    if (!editingId) return;
    const trimmed = editValue.trim();
    if (trimmed) {
      // Update IDB immediately (works offline)
      const session = await getSession(editingId);
      if (session) {
        await putSession({ ...session, name: trimmed, updatedAt: new Date().toISOString() });
      }

      // Update UI immediately
      setSessions(prev => prev.map(s => s.id === editingId ? { ...s, name: trimmed } : s));

      // Queue pending action for sync
      const actionId = uuidv4();
      await putPendingAction({
        actionId,
        type: 'sessionRename',
        payload: JSON.stringify({ id: editingId, name: trimmed }),
        createdAt: Date.now(),
        status: 'pending',
      });

      // Try server sync immediately (non-blocking)
      fetch(`/api/sessions/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      }).then(async (res) => {
        if (res.ok) await clearPendingAction(actionId);
      }).catch(() => {});
    }
    setEditingId(null);
  };

  const openSession = (id: string) => {
    if (editingId || menuId) return;
    if (isOffline) {
      // Render whiteboard inline — no page navigation needed.
      setOfflineSessionId(id);
      window.history.pushState(null, '', `/session/${id}`);
    } else {
      setNavigatingId(id);
      window.location.href = `/session/${id}`;
    }
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    const now = new Date();
    const diffMs = now.getTime() - d.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  };

  // Offline: render whiteboard inline instead of navigating to a new page.
  // The whiteboard will load its data from IndexedDB.
  if (offlineSessionId) {
    const sessionName = sessions.find(s => s.id === offlineSessionId)?.name || 'Untitled';
    return (
      <WhiteboardLoader
        sessionId={offlineSessionId}
        initialPages={[]}
        sessionName={sessionName}
      />
    );
  }

  return (
    <div
      className="min-h-screen text-neutral-200 overflow-auto touch-auto select-auto"
      style={{
        position: 'fixed', inset: 0,
        background: 'linear-gradient(180deg, #1a1a2e 0%, #16161a 100%)',
      }}
    >
      <div className="max-w-5xl mx-auto px-6 pt-10 pb-10">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-semibold text-white tracking-tight">Whiteboard</h1>
            {isOffline && (
              <span className="flex items-center gap-1 px-2 py-0.5 rounded bg-amber-600/20 text-amber-400 text-xs" title="Offline — viewing cached data">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="1" y1="1" x2="23" y2="23" />
                  <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
                  <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
                  <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
                  <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
                  <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
                  <line x1="12" y1="20" x2="12.01" y2="20" />
                </svg>
                Offline
              </span>
            )}
          </div>
          <button
            onClick={createSession}
            className="px-4 py-2 rounded-lg bg-blue-600 text-white text-sm font-medium cursor-pointer transition-colors hover:bg-blue-500 border-none flex items-center gap-2"
          >
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <line x1="12" y1="5" x2="12" y2="19" /><line x1="5" y1="12" x2="19" y2="12" />
            </svg>
            New
          </button>
        </div>

        {/* Content — no spinner, just fade in */}
        <div
          className="transition-opacity duration-300"
          style={{ opacity: loaded ? 1 : 0 }}
        >
          {loaded && sessions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 gap-4">
              <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center">
                <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="text-neutral-500">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                  <path d="M3 9h18" /><path d="M9 3v18" />
                </svg>
              </div>
              <p className="text-neutral-500 text-sm">No whiteboards yet</p>
              <button
                onClick={createSession}
                className="px-4 py-2 rounded-lg bg-white/10 text-neutral-300 text-sm cursor-pointer transition-colors hover:bg-white/15 border border-white/10"
              >
                Create your first whiteboard
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {sessions.map(session => (
                <SessionCard
                  key={session.id}
                  session={session}
                  isNavigating={navigatingId === session.id}
                  isMenuOpen={menuId === session.id}
                  isEditing={editingId === session.id}
                  isConfirmingDelete={confirmDeleteId === session.id}
                  editValue={editValue}
                  editRef={editRef}
                  menuRef={menuRef}
                  onOpen={() => openSession(session.id)}
                  onMenuToggle={() => setMenuId(menuId === session.id ? null : session.id)}
                  onRename={() => startRename(session.id, session.name)}
                  onClone={() => cloneSession(session.id)}
                  onDelete={() => deleteSession(session.id)}
                  onConfirmDelete={() => setConfirmDeleteId(session.id)}
                  onCancelDelete={() => setConfirmDeleteId(null)}
                  onEditChange={setEditValue}
                  onEditCommit={commitRename}
                  onEditCancel={() => setEditingId(null)}
                  formatDate={formatDate}
                />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function SessionCard({ session, isNavigating, isMenuOpen, isEditing, isConfirmingDelete, editValue, editRef, menuRef, onOpen, onMenuToggle, onRename, onClone, onDelete, onConfirmDelete, onCancelDelete, onEditChange, onEditCommit, onEditCancel, formatDate }: {
  session: SessionSummary;
  isNavigating: boolean;
  isMenuOpen: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  editValue: string;
  editRef: React.RefObject<HTMLInputElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onOpen: () => void;
  onMenuToggle: () => void;
  onRename: () => void;
  onClone: () => void;
  onDelete: () => void;
  onConfirmDelete: () => void;
  onCancelDelete: () => void;
  onEditChange: (v: string) => void;
  onEditCommit: () => void;
  onEditCancel: () => void;
  formatDate: (iso: string) => string;
}) {
  return (
    <div
      className={`group relative rounded-xl border border-white/8 bg-white/5 cursor-pointer transition-all duration-200 hover:border-white/15 hover:bg-white/8 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5 overflow-hidden ${
        isNavigating ? 'opacity-70 pointer-events-none scale-[0.98]' : ''
      }`}
      onClick={onOpen}
    >
      <div
        className="aspect-video relative overflow-hidden rounded-t-xl"
        style={{ backgroundColor: session.bg_color || '#ffffff' }}
      >
        {session.thumbnail ? (
          <Image
            src={session.thumbnail}
            alt=""
            className="w-full h-full object-contain"
            draggable={false}
            fill
            unoptimized
          />
        ) : (
          <PreviewPattern pattern={session.bg_pattern} bgColor={session.bg_color || '#ffffff'} />
        )}

        {isNavigating && (
          <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          </div>
        )}

        <div className="absolute top-2 right-2">
          <button
            className="w-7 h-7 rounded-md flex items-center justify-center bg-black/30 backdrop-blur-sm text-white/70 text-xs cursor-pointer transition-all hover:bg-black/50 hover:text-white border-none opacity-0 group-hover:opacity-100"
            onClick={(e) => { e.stopPropagation(); onMenuToggle(); }}
            title="Options"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
            </svg>
          </button>

          {isMenuOpen && (
            <div
              ref={menuRef}
              className="absolute right-0 top-8 bg-neutral-800/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px] z-10 animate-menu-in"
              onClick={(e) => e.stopPropagation()}
            >
              <button
                className="w-full px-3 py-1.5 text-left text-sm text-neutral-300 bg-transparent border-none cursor-pointer hover:bg-white/10 flex items-center gap-2"
                onClick={onRename}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                </svg>
                Rename
              </button>
              <button
                className="w-full px-3 py-1.5 text-left text-sm text-neutral-300 bg-transparent border-none cursor-pointer hover:bg-white/10 flex items-center gap-2"
                onClick={onClone}
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Clone
              </button>
              <div className="h-px bg-white/10 my-1" />
              {isConfirmingDelete ? (
                <div className="flex items-center gap-1 px-2 py-1">
                  <button
                    className="flex-1 px-2 py-1.5 text-xs text-red-400 font-medium bg-red-500/15 border border-red-500/30 rounded cursor-pointer hover:bg-red-500/25 transition-colors"
                    onClick={onDelete}
                  >
                    Delete
                  </button>
                  <button
                    className="flex-1 px-2 py-1.5 text-xs text-neutral-400 bg-transparent border border-white/10 rounded cursor-pointer hover:bg-white/10 transition-colors"
                    onClick={onCancelDelete}
                  >
                    Cancel
                  </button>
                </div>
              ) : (
                <button
                  className="w-full px-3 py-1.5 text-left text-sm text-red-400 bg-transparent border-none cursor-pointer hover:bg-red-500/10 flex items-center gap-2"
                  onClick={onConfirmDelete}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                  </svg>
                  Delete
                </button>
              )}
            </div>
          )}
        </div>
      </div>

      <div className="p-3">
        {isEditing ? (
          <input
            ref={editRef}
            className="w-full bg-white/10 text-white text-sm px-2 py-1 rounded border border-blue-500 outline-none"
            value={editValue}
            onChange={e => onEditChange(e.target.value)}
            onBlur={onEditCommit}
            onKeyDown={e => {
              if (e.key === 'Enter') onEditCommit();
              if (e.key === 'Escape') onEditCancel();
            }}
            onClick={e => e.stopPropagation()}
          />
        ) : (
          <div className="text-sm font-medium text-white truncate">{session.name}</div>
        )}
        <div className="text-xs text-neutral-500 mt-1">{formatDate(session.updated_at)}</div>
      </div>
    </div>
  );
}

/** Shows a subtle pattern preview matching the session's background */
function PreviewPattern({ pattern, bgColor }: { pattern: string | null; bgColor: string }) {
  const isDark = isDarkColor(bgColor);
  const dotColor = isDark ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.06)';

  if (pattern === 'grid') {
    return (
      <div className="absolute inset-0" style={{
        backgroundImage: `linear-gradient(${dotColor} 1px, transparent 1px), linear-gradient(90deg, ${dotColor} 1px, transparent 1px)`,
        backgroundSize: '20px 20px',
      }} />
    );
  }
  if (pattern === 'dotgrid') {
    return (
      <div className="absolute inset-0" style={{
        backgroundImage: `radial-gradient(circle, ${dotColor} 1px, transparent 1px)`,
        backgroundSize: '16px 16px',
      }} />
    );
  }
  if (pattern === 'ruled') {
    return (
      <div className="absolute inset-0" style={{
        backgroundImage: `repeating-linear-gradient(0deg, transparent, transparent 23px, ${dotColor} 23px, ${dotColor} 24px)`,
      }} />
    );
  }
  return null;
}

function isDarkColor(hex: string): boolean {
  const r = parseInt(hex.slice(1, 3), 16) || 0;
  const g = parseInt(hex.slice(3, 5), 16) || 0;
  const b = parseInt(hex.slice(5, 7), 16) || 0;
  return (r * 299 + g * 587 + b * 114) / 1000 < 128;
}
