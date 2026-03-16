'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';

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
  const [navigatingId, setNavigatingId] = useState<string | null>(null);
  const [menuId, setMenuId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const editRef = useRef<HTMLInputElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(data => { setSessions(data); setLoaded(true); })
      .catch(() => setLoaded(true));
  }, []);

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

  const createSession = async () => {
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Untitled' }),
    });
    const session = await res.json();
    router.push(`/session/${session.id}`);
  };

  const deleteSession = async (id: string) => {
    setMenuId(null);
    setConfirmDeleteId(null);
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const cloneSession = async (id: string) => {
    setMenuId(null);
    const res = await fetch(`/api/sessions/${id}`, { method: 'POST' });
    const cloned = await res.json();
    const listRes = await fetch('/api/sessions');
    setSessions(await listRes.json());
    router.push(`/session/${cloned.id}`);
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
      await fetch(`/api/sessions/${editingId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: trimmed }),
      });
      setSessions(prev => prev.map(s => s.id === editingId ? { ...s, name: trimmed } : s));
    }
    setEditingId(null);
  };

  const openSession = (id: string) => {
    if (editingId || menuId) return;
    setNavigatingId(id);
    router.push(`/session/${id}`);
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
                <div
                  key={session.id}
                  className={`group relative rounded-xl border border-white/8 bg-white/5 cursor-pointer transition-all duration-200 hover:border-white/15 hover:bg-white/8 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5 overflow-hidden ${
                    navigatingId === session.id ? 'opacity-70 pointer-events-none scale-[0.98]' : ''
                  }`}
                  onClick={() => openSession(session.id)}
                >
                  {/* Thumbnail area — 16:9 to match common viewport */}
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

                    {/* Loading overlay */}
                    {navigatingId === session.id && (
                      <div className="absolute inset-0 bg-black/40 flex items-center justify-center backdrop-blur-sm">
                        <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                      </div>
                    )}

                    {/* Context menu button */}
                    <div className="absolute top-2 right-2">
                      <button
                        className="w-7 h-7 rounded-md flex items-center justify-center bg-black/30 backdrop-blur-sm text-white/70 text-xs cursor-pointer transition-all hover:bg-black/50 hover:text-white border-none opacity-0 group-hover:opacity-100"
                        onClick={(e) => {
                          e.stopPropagation();
                          setMenuId(menuId === session.id ? null : session.id);
                        }}
                        title="Options"
                      >
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                          <circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" />
                        </svg>
                      </button>

                      {/* Dropdown menu */}
                      {menuId === session.id && (
                        <div
                          ref={menuRef}
                          className="absolute right-0 top-8 bg-neutral-800/95 backdrop-blur-md border border-white/10 rounded-lg shadow-xl py-1 min-w-[140px] z-10 animate-menu-in"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            className="w-full px-3 py-1.5 text-left text-sm text-neutral-300 bg-transparent border-none cursor-pointer hover:bg-white/10 flex items-center gap-2"
                            onClick={() => startRename(session.id, session.name)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" />
                            </svg>
                            Rename
                          </button>
                          <button
                            className="w-full px-3 py-1.5 text-left text-sm text-neutral-300 bg-transparent border-none cursor-pointer hover:bg-white/10 flex items-center gap-2"
                            onClick={() => cloneSession(session.id)}
                          >
                            <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                              <rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                            </svg>
                            Clone
                          </button>
                          <div className="h-px bg-white/10 my-1" />
                          {confirmDeleteId === session.id ? (
                            <div className="flex items-center gap-1 px-2 py-1">
                              <button
                                className="flex-1 px-2 py-1.5 text-xs text-red-400 font-medium bg-red-500/15 border border-red-500/30 rounded cursor-pointer hover:bg-red-500/25 transition-colors"
                                onClick={() => deleteSession(session.id)}
                              >
                                Delete
                              </button>
                              <button
                                className="flex-1 px-2 py-1.5 text-xs text-neutral-400 bg-transparent border border-white/10 rounded cursor-pointer hover:bg-white/10 transition-colors"
                                onClick={() => setConfirmDeleteId(null)}
                              >
                                Cancel
                              </button>
                            </div>
                          ) : (
                            <button
                              className="w-full px-3 py-1.5 text-left text-sm text-red-400 bg-transparent border-none cursor-pointer hover:bg-red-500/10 flex items-center gap-2"
                              onClick={() => setConfirmDeleteId(session.id)}
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

                  {/* Info */}
                  <div className="p-3">
                    {editingId === session.id ? (
                      <input
                        ref={editRef}
                        className="w-full bg-white/10 text-white text-sm px-2 py-1 rounded border border-blue-500 outline-none"
                        value={editValue}
                        onChange={e => setEditValue(e.target.value)}
                        onBlur={commitRename}
                        onKeyDown={e => {
                          if (e.key === 'Enter') commitRename();
                          if (e.key === 'Escape') setEditingId(null);
                        }}
                        onClick={e => e.stopPropagation()}
                      />
                    ) : (
                      <div className="text-sm font-medium text-white truncate">{session.name}</div>
                    )}
                    <div className="text-xs text-neutral-500 mt-1">{formatDate(session.updated_at)}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
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
