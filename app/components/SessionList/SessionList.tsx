'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { v4 as uuidv4 } from 'uuid';
import { getAllSessions as getAllIdbSessions } from '@/app/lib/idb';
import SessionCard from './SessionCard';
import type { SessionSummary } from './SessionCard';

interface Toast {
  message: string;
  undoData: { ids: string[]; sessions: SessionSummary[] };
  timer: ReturnType<typeof setTimeout>;
}

export default function SessionList() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [toast, setToast] = useState<Toast | null>(null);
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const editRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const toastRef = useRef<Toast | null>(null);
  const router = useRouter();

  const selectMode = selected.size > 0;

  const fetchSessions = () =>
    fetch('/api/sessions')
      .then(r => r.json())
      .then(async (data: SessionSummary[]) => {
        // IDB thumbnails are saved immediately (no debounce) so they're
        // always more up-to-date than the server's debounced copy.
        // Prefer the IDB thumbnail whenever one exists.
        try {
          const idbSessions = await getAllIdbSessions();
          const idbMap = new Map(idbSessions.map(s => [s.id, s.thumbnail]));
          for (const s of data) {
            const idbThumb = idbMap.get(s.id);
            if (idbThumb) {
              s.thumbnail = idbThumb;
            }
          }
        } catch { /* IDB unavailable */ }
        setSessions(data);
        setLoaded(true);
      })
      .catch(() => setLoaded(true));

  useEffect(() => { fetchSessions(); }, []);

  useEffect(() => {
    if (editingId && editRef.current) {
      editRef.current.focus();
      editRef.current.select();
    }
  }, [editingId]);

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

  // Esc to exit selection, Delete/Backspace to delete selected
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectMode) {
        e.preventDefault();
        setSelected(new Set());
        setShowDeleteDialog(false);
      }
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectMode && !editingId) {
        const tag = (e.target as HTMLElement)?.tagName;
        if (tag === 'INPUT' || tag === 'TEXTAREA') return;
        e.preventDefault();
        setShowDeleteDialog(true);
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [selectMode, editingId]);

  // On unmount: commit any pending hard-deletes
  useEffect(() => {
    return () => {
      const pending = toastRef.current;
      if (pending) {
        clearTimeout(pending.timer);
        const ids = pending.undoData.ids;
        if (ids.length === 1) {
          fetch(`/api/sessions/${ids[0]}?hard=1`, { method: 'DELETE' });
        } else {
          fetch('/api/sessions/batch', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ids, hard: true }),
          });
        }
      }
    };
  }, []);

  const createSession = async () => {
    const sessionId = uuidv4();
    const pageId = uuidv4();

    try {
      const res = await fetch('/api/sessions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: 'Untitled', id: sessionId, pageId }),
      });
      if (res.ok) {
        router.push(`/session/${sessionId}`);
      }
    } catch { /* network error */ }
  };

  const deleteSession = async (id: string) => {
    setMenuId(null);
    setConfirmDeleteId(null);

    const removed = sessions.filter(s => s.id === id);
    setSessions(prev => prev.filter(s => s.id !== id));

    // Soft-delete on server immediately
    try {
      await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    } catch { /* network error */ }

    showUndoToast([id], removed);
  };

  const cloneSession = async (id: string) => {
    setMenuId(null);

    try {
      const res = await fetch(`/api/sessions/${id}`, { method: 'POST' });
      if (res.ok) {
        const cloned = await res.json();
        await fetchSessions();
        router.push(`/session/${cloned.id}`);
      }
    } catch { /* network error */ }
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
      setSessions(prev => prev.map(s => s.id === editingId ? { ...s, name: trimmed } : s));

      try {
        const res = await fetch(`/api/sessions/${editingId}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ name: trimmed }),
        });
        if (!res.ok) fetchSessions();
      } catch {
        fetchSessions();
      }
    }
    setEditingId(null);
  };

  const handleCardClick = useCallback((id: string, e: React.MouseEvent) => {
    if (editingId || menuId) return;

    const metaSelect = e.metaKey || e.ctrlKey;
    const shiftSelect = e.shiftKey;

    if (metaSelect || selectMode) {
      // Cmd/Ctrl+click toggles individual selection
      if (shiftSelect && lastSelectedId) {
        // Shift+click selects range
        const ids = sessions.map(s => s.id);
        const from = ids.indexOf(lastSelectedId);
        const to = ids.indexOf(id);
        if (from !== -1 && to !== -1) {
          const start = Math.min(from, to);
          const end = Math.max(from, to);
          const rangeIds = ids.slice(start, end + 1);
          setSelected(prev => {
            const next = new Set(prev);
            rangeIds.forEach(rid => next.add(rid));
            return next;
          });
        }
      } else {
        setSelected(prev => {
          const next = new Set(prev);
          if (next.has(id)) next.delete(id);
          else next.add(id);
          return next;
        });
      }
      setLastSelectedId(id);
      return;
    }

    if (shiftSelect && !selectMode) {
      // Shift+click with nothing selected starts range from this item
      setSelected(new Set([id]));
      setLastSelectedId(id);
      return;
    }

    // Normal click — navigate
    setNavigatingId(id);
    window.location.href = `/session/${id}`;
  }, [editingId, menuId, selectMode, lastSelectedId, sessions]);

  const toggleSelectAll = () => {
    if (selected.size === sessions.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(sessions.map(s => s.id)));
    }
  };

  const hardDeleteIds = async (ids: string[]) => {
    try {
      if (ids.length === 1) {
        await fetch(`/api/sessions/${ids[0]}?hard=1`, { method: 'DELETE' });
      } else {
        await fetch('/api/sessions/batch', {
          method: 'DELETE',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, hard: true }),
        });
      }
    } catch { /* network error */ }
  };

  const restoreIds = async (ids: string[]) => {
    try {
      if (ids.length === 1) {
        await fetch(`/api/sessions/${ids[0]}`, { method: 'PATCH' });
      } else {
        await fetch('/api/sessions/batch', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids }),
        });
      }
    } catch { /* network error */ }
  };

  const showUndoToast = (ids: string[], removedSessions: SessionSummary[]) => {
    // Clear any existing toast & hard-delete its pending items
    if (toastRef.current) {
      clearTimeout(toastRef.current.timer);
      hardDeleteIds(toastRef.current.undoData.ids);
    }

    const timer = setTimeout(() => {
      setToast(null);
      toastRef.current = null;
      // Undo window expired — hard delete
      hardDeleteIds(ids);
    }, 5000);

    const t: Toast = {
      message: ids.length === 1
        ? '1 whiteboard deleted'
        : `${ids.length} whiteboards deleted`,
      undoData: { ids, sessions: removedSessions },
      timer,
    };
    toastRef.current = t;
    setToast(t);
  };

  const undoDelete = async () => {
    if (!toast) return;
    clearTimeout(toast.timer);
    // Restore on server
    await restoreIds(toast.undoData.ids);
    // Restore in UI
    setSessions(prev => {
      const existing = new Set(prev.map(s => s.id));
      const restored = toast.undoData.sessions.filter(s => !existing.has(s.id));
      const merged = [...prev, ...restored];
      merged.sort((a, b) => new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime());
      return merged;
    });
    setToast(null);
    toastRef.current = null;
  };

  const bulkDelete = async () => {
    const ids = Array.from(selected);
    if (ids.length === 0) return;

    const removed = sessions.filter(s => selected.has(s.id));
    setSessions(prev => prev.filter(s => !selected.has(s.id)));
    setSelected(new Set());
    setShowDeleteDialog(false);

    // Soft-delete on server immediately
    try {
      await fetch('/api/sessions/batch', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
    } catch { /* network error */ }

    showUndoToast(ids, removed);
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
          <h1 className="text-2xl font-semibold text-white tracking-tight">Whiteboard</h1>
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

        {/* Content */}
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
                  selectMode={selectMode}
                  isSelected={selected.has(session.id)}
                  editValue={editValue}
                  editRef={editRef}
                  menuRef={menuRef}
                  onOpen={(e) => handleCardClick(session.id, e)}
                  onToggleSelect={() => { setSelected(prev => { const next = new Set(prev); if (next.has(session.id)) next.delete(session.id); else next.add(session.id); return next; }); setLastSelectedId(session.id); }}
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

      {/* Floating action bar */}
      {selectMode && (
        <div className="fixed bottom-6 left-1/2 -translate-x-1/2 z-50 animate-slide-up">
          <div className="flex items-center gap-3 px-4 py-2.5 rounded-2xl bg-neutral-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50">
            <span className="text-sm text-neutral-300 font-medium tabular-nums">
              {selected.size} selected
            </span>

            <div className="w-px h-5 bg-white/10" />

            <button
              onClick={toggleSelectAll}
              className="px-3 py-1.5 rounded-lg text-sm text-neutral-300 bg-transparent border-none cursor-pointer transition-colors hover:bg-white/10"
            >
              {selected.size === sessions.length ? 'Deselect all' : 'Select all'}
            </button>

            <button
              onClick={() => setShowDeleteDialog(true)}
              className="px-3 py-1.5 rounded-lg text-sm text-red-400 font-medium bg-transparent border-none cursor-pointer transition-colors hover:bg-red-500/15 flex items-center gap-1.5"
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
              </svg>
              Delete
            </button>

            <div className="w-px h-5 bg-white/10" />

            <button
              onClick={() => { setSelected(new Set()); setShowDeleteDialog(false); }}
              className="px-3 py-1.5 rounded-lg text-sm text-neutral-400 bg-transparent border-none cursor-pointer transition-colors hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Delete confirmation dialog */}
      {showDeleteDialog && (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowDeleteDialog(false)}
        >
          <div
            className="bg-neutral-900 border border-white/10 rounded-2xl shadow-2xl p-6 max-w-sm w-full mx-4 animate-scale-in"
            onClick={e => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 rounded-xl bg-red-500/15 flex items-center justify-center flex-shrink-0">
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ef4444" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
                </svg>
              </div>
              <div>
                <h3 className="text-white font-semibold text-base">Delete {selected.size} {selected.size === 1 ? 'whiteboard' : 'whiteboards'}?</h3>
              </div>
            </div>
            <p className="text-neutral-400 text-sm mb-5 ml-[52px]">
              {selected.size === 1 ? 'This whiteboard' : 'These whiteboards'} will be deleted. You can undo this action for a few seconds after.
            </p>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowDeleteDialog(false)}
                className="px-4 py-2 rounded-lg text-sm text-neutral-300 bg-white/10 border-none cursor-pointer transition-colors hover:bg-white/15"
              >
                Cancel
              </button>
              <button
                onClick={bulkDelete}
                className="px-4 py-2 rounded-lg text-sm text-white font-medium bg-red-600 border-none cursor-pointer transition-colors hover:bg-red-500"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Undo toast */}
      {toast && (
        <div className="fixed bottom-6 inset-x-0 flex justify-center z-[70] pointer-events-none animate-slide-up">
          <div className="pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-xl bg-neutral-800/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/50">
            <span className="text-sm text-neutral-200">{toast.message}</span>
            <button
              onClick={undoDelete}
              className="px-3 py-1 rounded-md text-sm font-medium text-blue-400 bg-blue-500/15 border-none cursor-pointer transition-colors hover:bg-blue-500/25"
            >
              Undo
            </button>
          </div>
        </div>
      )}

      <style jsx global>{`
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(16px); }
          to { opacity: 1; transform: translateY(0); }
        }
        @keyframes fade-in {
          from { opacity: 0; }
          to { opacity: 1; }
        }
        @keyframes scale-in {
          from { opacity: 0; transform: scale(0.95); }
          to { opacity: 1; transform: scale(1); }
        }
        .animate-slide-up { animation: slide-up 0.2s ease-out; }
        .animate-fade-in { animation: fade-in 0.15s ease-out; }
        .animate-scale-in { animation: scale-in 0.15s ease-out; }
      `}</style>
    </div>
  );
}
