'use client';

import { useState, useRef, useEffect } from 'react';
import { ToolType, StrokeStyle, BackgroundPattern } from '@/app/types';

interface ToolbarProps {
  activeTool: ToolType;
  strokeStyle: StrokeStyle;
  backgroundPattern: BackgroundPattern;
  backgroundColor: string;
  onToolChange: (tool: ToolType) => void;
  onColorChange: (color: string) => void;
  onWidthChange: (width: number) => void;
  onBackgroundPatternChange: (pattern: BackgroundPattern) => void;
  onBackgroundColorChange: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onImportPdf: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  canUndo: boolean;
  canRedo: boolean;
}

const COLORS = ['#000000', '#e53e3e', '#3182ce', '#38a169', '#dd6b20', '#ffffff'];
const WIDTHS = [2, 4, 8, 16];

const BG_COLORS = [
  { color: '#ffffff', label: 'White' },
  { color: '#faf5e6', label: 'Cream' },
  { color: '#1a3a2a', label: 'Chalkboard' },
  { color: '#111111', label: 'Dark' },
];

const SHAPE_TOOLS: ToolType[] = ['line', 'rect', 'ellipse'];

const BG_PATTERNS: { pattern: BackgroundPattern; label: string; icon: React.ReactNode }[] = [
  { pattern: 'blank', label: 'Blank', icon: <BlankBgIcon /> },
  { pattern: 'grid', label: 'Grid', icon: <GridBgIcon /> },
  { pattern: 'dotgrid', label: 'Dots', icon: <DotBgIcon /> },
  { pattern: 'ruled', label: 'Ruled', icon: <RuledBgIcon /> },
];

export default function Toolbar({
  activeTool,
  strokeStyle,
  backgroundPattern,
  backgroundColor,
  onToolChange,
  onColorChange,
  onWidthChange,
  onBackgroundPatternChange,
  onBackgroundColorChange,
  onUndo,
  onRedo,
  onClear,
  onImportPdf,
  onExportPng,
  onExportPdf,
  canUndo,
  canRedo,
}: ToolbarProps) {
  const [shapesOpen, setShapesOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const shapesRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const activeShape = SHAPE_TOOLS.includes(activeTool) ? activeTool : 'line';
  const isShapeActive = SHAPE_TOOLS.includes(activeTool);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (shapesRef.current && !shapesRef.current.contains(e.target as Node)) setShapesOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  return (
    <>
    {/* Invisible backdrop to catch clicks when menus are open — prevents canvas from drawing */}
    {(shapesOpen || moreOpen) && (
      <div
        className="fixed inset-0 z-40"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          setShapesOpen(false);
          setMoreOpen(false);
        }}
      />
    )}
    <div className="fixed top-1/2 left-2 -translate-y-1/2 z-50 bg-neutral-900/85 backdrop-blur-md rounded-xl p-2 flex flex-col gap-1 shadow-xl">
      {/* === QUICK ACCESS === */}

      {/* Pen */}
      <ToolBtn active={activeTool === 'pen'} onClick={() => onToolChange('pen')} title="Pen (P)">
        <PenIcon />
      </ToolBtn>

      {/* Eraser */}
      <ToolBtn active={activeTool === 'eraser'} onClick={() => onToolChange('eraser')} title="Eraser (E)">
        <EraserIcon />
      </ToolBtn>

      {/* Shapes (grouped with flyout) */}
      <div className="relative" ref={shapesRef}>
        <ToolBtn
          active={isShapeActive}
          onClick={() => {
            if (!isShapeActive) { onToolChange(activeShape); }
            else { setShapesOpen(!shapesOpen); setMoreOpen(false); }
          }}
          title={shapeLabel(activeShape)}
          badge="&#x25B8;"
        >
          {shapeIcon(activeShape)}
        </ToolBtn>
        {shapesOpen && (
          <Flyout>
            {SHAPE_TOOLS.map(type => (
              <ToolBtn key={type} active={activeTool === type}
                onClick={() => { onToolChange(type); setShapesOpen(false); }}
                title={shapeLabel(type)}>
                {shapeIcon(type)}
              </ToolBtn>
            ))}
          </Flyout>
        )}
      </div>

      <Divider />

      {/* Colors */}
      <div className="flex flex-col items-center gap-1">
        {COLORS.map(color => (
          <button key={color}
            className={`w-7 h-7 rounded-full cursor-pointer transition-transform hover:scale-115 border-2
              ${strokeStyle.color === color ? 'border-blue-400' : 'border-transparent'}`}
            style={{ backgroundColor: color }}
            onClick={() => onColorChange(color)} title={color} />
        ))}
        <input type="color" value={strokeStyle.color}
          onChange={e => onColorChange(e.target.value)}
          className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-none p-0"
          title="Custom color" />
      </div>

      <Divider />

      {/* Widths */}
      <div className="flex flex-col items-center gap-1">
        {WIDTHS.map(w => (
          <button key={w}
            className={`w-10 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none
              ${strokeStyle.baseWidth === w ? 'bg-blue-500/30' : 'bg-transparent hover:bg-white/10'}`}
            onClick={() => onWidthChange(w)} title={`${w}px`}>
            <span className="block rounded-full bg-neutral-400" style={{ width: w, height: w, minWidth: 2, minHeight: 2 }} />
          </button>
        ))}
      </div>

      <Divider />

      {/* Undo / Redo */}
      <ToolBtn active={false} onClick={onUndo} title="Undo (Ctrl+Z)" disabled={!canUndo}>
        <UndoIcon />
      </ToolBtn>
      <ToolBtn active={false} onClick={onRedo} title="Redo (Ctrl+Shift+Z)" disabled={!canRedo}>
        <RedoIcon />
      </ToolBtn>

      <Divider />

      {/* === MORE MENU === */}
      <div className="relative" ref={moreRef}>
        <ToolBtn active={false} onClick={() => { setMoreOpen(!moreOpen); setShapesOpen(false); }} title="More options">
          <MoreIcon />
        </ToolBtn>
        {moreOpen && (
          <div className="absolute left-12 bottom-0 bg-neutral-900/95 backdrop-blur-md rounded-xl p-3 shadow-xl border border-neutral-700/50 min-w-[200px] flex flex-col gap-3 animate-menu-in">

            {/* Background pattern */}
            <div>
              <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 px-1">Background</div>
              <div className="flex gap-1">
                {BG_PATTERNS.map(bp => (
                  <button key={bp.pattern}
                    className={`w-10 h-9 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none
                      ${backgroundPattern === bp.pattern ? 'bg-amber-500/30 text-amber-400' : 'bg-transparent text-neutral-500 hover:bg-white/10 hover:text-neutral-300'}`}
                    onClick={() => onBackgroundPatternChange(bp.pattern)} title={bp.label}>
                    {bp.icon}
                  </button>
                ))}
              </div>
            </div>

            {/* Background colors */}
            <div>
              <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 px-1">Page Color</div>
              <div className="flex gap-1.5">
                {BG_COLORS.map(bg => (
                  <button key={bg.color}
                    className={`w-8 h-8 rounded-lg cursor-pointer transition-transform hover:scale-110 border-2
                      ${backgroundColor === bg.color ? 'border-amber-400' : 'border-neutral-600'}`}
                    style={{ backgroundColor: bg.color }}
                    onClick={() => onBackgroundColorChange(bg.color)} title={bg.label} />
                ))}
              </div>
            </div>

            <div className="w-full h-px bg-white/10" />

            {/* Import / Export */}
            <div className="flex flex-col gap-0.5">
              <MenuBtn onClick={() => { onImportPdf(); setMoreOpen(false); }} icon={<ImportIcon />} label="Import PDF" />
              <MenuBtn onClick={() => { onExportPng(); setMoreOpen(false); }} icon={<ImageExportIcon />} label="Export page as PNG" />
              <MenuBtn onClick={() => { onExportPdf(); setMoreOpen(false); }} icon={<FileExportIcon />} label="Export all as PDF" />
            </div>

            <div className="w-full h-px bg-white/10" />

            {/* Clear */}
            <MenuBtn onClick={() => { onClear(); setMoreOpen(false); }} icon={<TrashIcon />} label="Clear page" danger />
          </div>
        )}
      </div>
    </div>
    </>
  );
}

// --- Component helpers ---

function ToolBtn({ active, onClick, title, children, disabled, badge }: {
  active: boolean; onClick: () => void; title: string;
  children: React.ReactNode; disabled?: boolean; badge?: string;
}) {
  return (
    <button
      className={`w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors border-none relative
        ${active ? 'bg-blue-500/30 text-blue-400' : 'bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white'}
        ${disabled ? 'opacity-30 !cursor-default' : ''}`}
      onClick={onClick} title={title} disabled={disabled}
    >
      {children}
      {badge && <span className="absolute right-0.5 bottom-0.5 text-[8px] text-neutral-500" dangerouslySetInnerHTML={{ __html: badge }} />}
    </button>
  );
}

function Flyout({ children }: { children: React.ReactNode }) {
  return (
    <div className="absolute left-12 top-0 bg-neutral-900/95 backdrop-blur-md rounded-lg p-1 flex flex-col gap-1 shadow-xl border border-neutral-700/50 animate-menu-in">
      {children}
    </div>
  );
}

function MenuBtn({ onClick, icon, label, danger }: { onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      className={`flex items-center gap-2.5 px-2 py-2 rounded-md text-sm bg-transparent border-none cursor-pointer transition-colors whitespace-nowrap
        ${danger ? 'text-red-400 hover:bg-red-500/15 hover:text-red-300' : 'text-neutral-300 hover:bg-white/10 hover:text-white'}`}
      onClick={onClick}
    >
      {icon}
      {label}
    </button>
  );
}

function Divider() {
  return <div className="w-8 h-px bg-white/15 mx-auto my-1" />;
}

function shapeIcon(type: ToolType) {
  switch (type) {
    case 'line': return <LineIcon />;
    case 'rect': return <RectIcon />;
    case 'ellipse': return <EllipseIcon />;
    default: return null;
  }
}

function shapeLabel(type: ToolType) {
  switch (type) {
    case 'line': return 'Line (L)';
    case 'rect': return 'Rectangle (R)';
    case 'ellipse': return 'Ellipse (O)';
    default: return '';
  }
}

// --- SVG Icons ---

function PenIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>);
}
function EraserIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>);
}
function LineIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="19" x2="19" y2="5" /></svg>);
}
function RectIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>);
}
function EllipseIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="7" /></svg>);
}
function UndoIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>);
}
function RedoIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" /></svg>);
}
function TrashIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>);
}
function MoreIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor"><circle cx="12" cy="5" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="12" cy="19" r="2" /></svg>);
}
function FileExportIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><polyline points="12 18 12 12" /><polyline points="9 15 12 12 15 15" /></svg>);
}
function ImportIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>);
}
function ImageExportIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
}
function BlankBgIcon() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1" opacity="0.6"><rect x="1" y="1" width="14" height="14" rx="1" /></svg>);
}
function GridBgIcon() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.6"><rect x="1" y="1" width="14" height="14" rx="1" /><line x1="5.5" y1="1" x2="5.5" y2="15" /><line x1="10.5" y1="1" x2="10.5" y2="15" /><line x1="1" y1="5.5" x2="15" y2="5.5" /><line x1="1" y1="10.5" x2="15" y2="10.5" /></svg>);
}
function DotBgIcon() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="currentColor" opacity="0.6"><circle cx="4" cy="4" r="1" /><circle cx="8" cy="4" r="1" /><circle cx="12" cy="4" r="1" /><circle cx="4" cy="8" r="1" /><circle cx="8" cy="8" r="1" /><circle cx="12" cy="8" r="1" /><circle cx="4" cy="12" r="1" /><circle cx="8" cy="12" r="1" /><circle cx="12" cy="12" r="1" /></svg>);
}
function RuledBgIcon() {
  return (<svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="0.7" opacity="0.6"><line x1="1" y1="4" x2="15" y2="4" /><line x1="1" y1="7" x2="15" y2="7" /><line x1="1" y1="10" x2="15" y2="10" /><line x1="1" y1="13" x2="15" y2="13" /><line x1="4" y1="1" x2="4" y2="15" strokeWidth="1" opacity="0.4" /></svg>);
}
