'use client';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);

export default function SelectionActionBar({ bounds, zoom, panOffset, onCopy, onDelete }: {
  bounds: { x: number; y: number; width: number; height: number };
  zoom: number;
  panOffset: { x: number; y: number };
  onCopy: () => void;
  onDelete: () => void;
}) {
  const w = typeof window !== 'undefined' ? window.innerWidth : 0;
  const h = typeof window !== 'undefined' ? window.innerHeight : 0;
  const s = zoom;
  const pX = (w / 2) * (1 - s) + panOffset.x;
  const pY = (h / 2) * (1 - s) + panOffset.y;
  const screenX = (bounds.x + bounds.width / 2) * s + pX;
  const screenY = (bounds.y + bounds.height) * s + pY + 12;
  return (
    <div
      className="fixed z-50 bg-neutral-900/90 backdrop-blur-md rounded-lg px-1.5 py-1 flex items-center gap-1 shadow-xl border border-neutral-700/50 animate-slide-up"
      style={{ left: screenX, top: screenY, transform: 'translateX(-50%)' }}
      onPointerDown={e => e.stopPropagation()}
    >
      <SelectActionBtn onClick={onCopy} title={`Copy (${isMac ? '\u2318' : 'Ctrl'}+C)`} icon={<CopyIcon />} label="Copy" />
      <SelectActionBtn onClick={onDelete} title="Delete" icon={<DeleteIcon />} label="Delete" danger />
    </div>
  );
}

function SelectActionBtn({ onClick, title, icon, label, danger }: {
  onClick: () => void; title: string; icon: React.ReactNode; label: string; danger?: boolean;
}) {
  return (
    <button
      className={`flex items-center gap-1.5 px-2 py-1.5 rounded-md text-xs bg-transparent border-none cursor-pointer transition-colors whitespace-nowrap
        ${danger ? 'text-red-400 hover:bg-red-500/15' : 'text-neutral-300 hover:bg-white/10 hover:text-white'}`}
      onClick={onClick}
      title={title}
    >
      {icon}
      {label}
    </button>
  );
}

function CopyIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>);
}

function DeleteIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>);
}
