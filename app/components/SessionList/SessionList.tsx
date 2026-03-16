'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';

interface SessionSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  page_count: number;
}

export default function SessionList() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [newName, setNewName] = useState('');
  const router = useRouter();

  useEffect(() => {
    fetch('/api/sessions')
      .then(r => r.json())
      .then(setSessions)
      .finally(() => setLoading(false));
  }, []);

  const createSession = async () => {
    const name = newName.trim() || 'Untitled';
    const res = await fetch('/api/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name }),
    });
    const session = await res.json();
    setNewName('');
    router.push(`/session/${session.id}`);
  };

  const deleteSession = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm('Delete this session and all its pages?')) return;
    await fetch(`/api/sessions/${id}`, { method: 'DELETE' });
    setSessions(prev => prev.filter(s => s.id !== id));
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
      + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  };

  return (
    <div className="max-w-xl mx-auto px-6 py-12 min-h-screen bg-neutral-950 text-neutral-200 touch-auto select-auto">
      <h1 className="text-3xl font-semibold text-white mb-6">Math Whiteboard</h1>

      <div className="flex gap-2 mb-8">
        <input
          type="text"
          placeholder="Session name..."
          value={newName}
          onChange={e => setNewName(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && createSession()}
          className="flex-1 px-3.5 py-2.5 border border-neutral-700 rounded-lg bg-neutral-900 text-neutral-200 text-base outline-none transition-colors focus:border-blue-500 placeholder:text-neutral-600"
        />
        <button
          onClick={createSession}
          className="px-5 py-2.5 rounded-lg bg-blue-600 text-white text-base font-medium cursor-pointer transition-colors hover:bg-blue-700 border-none whitespace-nowrap"
        >
          New Session
        </button>
      </div>

      {loading ? (
        <p className="text-neutral-600 text-base text-center py-10">Loading...</p>
      ) : sessions.length === 0 ? (
        <p className="text-neutral-600 text-base text-center py-10">No sessions yet. Create one to get started.</p>
      ) : (
        <div className="flex flex-col gap-2">
          {sessions.map(session => (
            <div
              key={session.id}
              className="px-4 py-3.5 border border-neutral-800 rounded-xl bg-neutral-900 cursor-pointer transition-colors hover:border-blue-500 hover:bg-neutral-850"
              onClick={() => router.push(`/session/${session.id}`)}
            >
              <div className="flex justify-between items-center mb-1.5">
                <span className="text-base font-medium text-white">{session.name}</span>
                <span className="text-sm text-neutral-600">
                  {session.page_count} page{session.page_count !== 1 ? 's' : ''}
                </span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-sm text-neutral-500">{formatDate(session.updated_at)}</span>
                <button
                  className="w-7 h-7 rounded-md flex items-center justify-center bg-transparent text-neutral-600 text-xs cursor-pointer transition-colors hover:bg-red-500/15 hover:text-red-500 border-none"
                  onClick={(e) => deleteSession(session.id, e)}
                  title="Delete session"
                >
                  &#x2715;
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
