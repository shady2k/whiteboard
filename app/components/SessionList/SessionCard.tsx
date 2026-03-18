'use client';

import Image from 'next/image';

export interface SessionSummary {
  id: string;
  name: string;
  created_at: string;
  updated_at: string;
  page_count: number;
  thumbnail: string | null;
  bg_color: string | null;
  bg_pattern: string | null;
}

export default function SessionCard({ session, isNavigating, isMenuOpen, isEditing, isConfirmingDelete, selectMode, isSelected, editValue, editRef, menuRef, onOpen, onToggleSelect, onMenuToggle, onRename, onClone, onDelete, onConfirmDelete, onCancelDelete, onEditChange, onEditCommit, onEditCancel, formatDate }: {
  session: SessionSummary;
  isNavigating: boolean;
  isMenuOpen: boolean;
  isEditing: boolean;
  isConfirmingDelete: boolean;
  selectMode: boolean;
  isSelected: boolean;
  editValue: string;
  editRef: React.RefObject<HTMLInputElement | null>;
  menuRef: React.RefObject<HTMLDivElement | null>;
  onOpen: (e: React.MouseEvent) => void;
  onToggleSelect: () => void;
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
      className={`group relative rounded-xl border cursor-pointer transition-all duration-200 hover:shadow-lg hover:shadow-black/30 hover:-translate-y-0.5 overflow-hidden ${
        isNavigating ? 'opacity-70 pointer-events-none scale-[0.98]' : ''
      } ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10 ring-2 ring-blue-500/40'
          : 'border-white/8 bg-white/5 hover:border-white/15 hover:bg-white/8'
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

        {/* Checkbox — click directly to toggle selection without navigating */}
        <button
          className={`absolute top-2 left-2 z-10 transition-opacity p-0 bg-transparent border-none cursor-pointer ${selectMode ? 'opacity-100' : 'opacity-0 group-hover:opacity-60'}`}
          onClick={(e) => { e.stopPropagation(); onToggleSelect(); }}
          title="Select"
        >
          <div className={`w-6 h-6 rounded-md border-2 flex items-center justify-center transition-all ${
            isSelected
              ? 'bg-blue-600 border-blue-600'
              : 'bg-black/30 border-white/40 backdrop-blur-sm'
          }`}>
            {isSelected && (
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
            )}
          </div>
        </button>

        {!selectMode && (
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
        )}
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
