'use client';

import { useState, useRef, useEffect } from 'react';
import { ToolType, StrokeStyle, BackgroundPattern } from '@/app/types';

interface ToolbarProps {
  activeTool: ToolType;
  strokeStyle: StrokeStyle;
  markerStyle: StrokeStyle;
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
  onImportFile: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onShowCheatsheet: () => void;
  onSnippetPanelToggle: () => void;
  snippetPanelOpen: boolean;
  canUndo: boolean;
  canRedo: boolean;
}

const PEN_COLORS = ['#000000', '#e53e3e', '#3182ce', '#38a169', '#dd6b20', '#805ad5', '#ffffff'];
const MARKER_COLORS = ['#facc15', '#fb923c', '#f87171', '#a78bfa', '#34d399', '#38bdf8'];
const PEN_WIDTHS = [2, 4, 8, 16];
const MARKER_WIDTHS = [12, 20, 28, 40];

const BG_COLORS = [
  { color: '#ffffff', label: 'White' },
  { color: '#faf5e6', label: 'Cream' },
  { color: '#1a3a2a', label: 'Chalkboard' },
  { color: '#111111', label: 'Dark' },
];

const SHAPE_TOOLS: ToolType[] = ['line', 'rect', 'triangle', 'ellipse'];

const BG_PATTERNS: { pattern: BackgroundPattern; label: string; icon: React.ReactNode }[] = [
  { pattern: 'blank', label: 'Blank', icon: <BlankBgIcon /> },
  { pattern: 'grid', label: 'Grid', icon: <GridBgIcon /> },
  { pattern: 'dotgrid', label: 'Dots', icon: <DotBgIcon /> },
  { pattern: 'ruled', label: 'Ruled', icon: <RuledBgIcon /> },
];

export default function Toolbar({
  activeTool,
  strokeStyle,
  markerStyle,
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
  onImportFile,
  onExportPng,
  onExportPdf,
  onShowCheatsheet,
  onSnippetPanelToggle,
  snippetPanelOpen,
  canUndo,
  canRedo,
}: ToolbarProps) {
  const [shapesOpen, setShapesOpen] = useState(false);
  const [colorsOpen, setColorsOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const shapesRef = useRef<HTMLDivElement>(null);
  const colorsRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const activeShape = SHAPE_TOOLS.includes(activeTool) ? activeTool : 'line';
  const isShapeActive = SHAPE_TOOLS.includes(activeTool);
  const prevToolRef = useRef(activeTool);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (shapesRef.current && !shapesRef.current.contains(e.target as Node)) setShapesOpen(false);
      if (colorsRef.current && !colorsRef.current.contains(e.target as Node)) setColorsOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, []);

  // Auto-expand shapes flyout when switching to a shape tool (e.g. via keyboard)
  useEffect(() => {
    const prev = prevToolRef.current;
    prevToolRef.current = activeTool;
    if (SHAPE_TOOLS.includes(activeTool) && !SHAPE_TOOLS.includes(prev)) {
      queueMicrotask(() => {
        setShapesOpen(true);
        setColorsOpen(false);
        setMoreOpen(false);
      });
    }
  }, [activeTool]);

  const closeAllMenus = () => { setShapesOpen(false); setColorsOpen(false); setMoreOpen(false); };

  return (
    <>
    {/* Invisible backdrop to catch clicks when menus are open — prevents canvas from drawing */}
    {(shapesOpen || colorsOpen || moreOpen) && (
      <div
        className="fixed inset-0 z-40"
        onPointerDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          closeAllMenus();
        }}
      />
    )}
    <div className="fixed top-1/2 left-2 -translate-y-1/2 z-50 bg-neutral-900/85 backdrop-blur-md rounded-xl p-2 flex flex-col gap-1 shadow-xl">
      {/* === TOOLS === */}

      {/* Hand / Pan */}
      <ToolBtn active={activeTool === 'hand'} onClick={() => onToolChange('hand')} title="Hand / Pan (H)">
        <HandIcon />
      </ToolBtn>

      {/* Pen */}
      <ToolBtn active={activeTool === 'pen'} onClick={() => onToolChange('pen')} title="Pen (P)">
        <PenIcon />
      </ToolBtn>

      {/* Marker */}
      <ToolBtn active={activeTool === 'marker'} onClick={() => onToolChange('marker')} title="Marker (M)">
        <MarkerIcon />
      </ToolBtn>

      {/* Eraser */}
      <ToolBtn active={activeTool === 'eraser'} onClick={() => onToolChange('eraser')} title="Eraser (E)">
        <EraserIcon />
      </ToolBtn>

      {/* Select */}
      <ToolBtn active={activeTool === 'select'} onClick={() => onToolChange('select')} title="Select (S)">
        <SelectIcon />
      </ToolBtn>

      {/* Shapes (grouped with flyout) */}
      <div className="relative" ref={shapesRef}>
        <ToolBtn
          active={isShapeActive}
          onClick={() => {
            if (!isShapeActive) { onToolChange(activeShape); }
            else { setShapesOpen(!shapesOpen); setColorsOpen(false); setMoreOpen(false); }
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

      {/* Color (grouped) — switches palette for marker vs pen */}
      {(() => {
        const isMarker = activeTool === 'marker';
        const currentStyle = isMarker ? markerStyle : strokeStyle;
        const colors = isMarker ? MARKER_COLORS : PEN_COLORS;
        const widths = isMarker ? MARKER_WIDTHS : PEN_WIDTHS;
        return (
          <>
            <div className="relative" ref={colorsRef}>
              <button
                className="w-10 h-10 rounded-lg flex items-center justify-center cursor-pointer transition-colors border-none relative bg-transparent hover:bg-white/10"
                onClick={() => { setColorsOpen(!colorsOpen); setShapesOpen(false); setMoreOpen(false); }}
                title="Color"
              >
                <span
                  className="block w-6 h-6 rounded-full border-2 border-neutral-600"
                  style={{ backgroundColor: currentStyle.color }}
                />
                <span className="absolute right-0.5 bottom-0.5 text-[8px] text-neutral-500" dangerouslySetInnerHTML={{ __html: '&#x25B8;' }} />
              </button>
              {colorsOpen && (
                <div className="absolute left-12 top-0 bg-neutral-900/95 backdrop-blur-md rounded-lg p-2 shadow-xl border border-neutral-700/50 animate-menu-in">
                  <div className="grid grid-cols-4 gap-1.5">
                    {colors.map(color => (
                      <button key={color}
                        className={`w-7 h-7 rounded-full cursor-pointer transition-transform hover:scale-115 border-2
                          ${currentStyle.color === color ? 'border-blue-400' : 'border-transparent'}`}
                        style={{ backgroundColor: color }}
                        onClick={() => { onColorChange(color); setColorsOpen(false); }} title={color} />
                    ))}
                    <label className="w-7 h-7 rounded-full cursor-pointer border-2 border-neutral-600 overflow-hidden relative flex items-center justify-center hover:scale-115 transition-transform" title="Custom color">
                      <span className="text-neutral-400 text-xs">+</span>
                      <input type="color" value={currentStyle.color}
                        onChange={e => { onColorChange(e.target.value); setColorsOpen(false); }}
                        className="absolute inset-0 opacity-0 cursor-pointer w-full h-full" />
                    </label>
                  </div>
                </div>
              )}
            </div>

            {/* Widths — visual dots scaled to 3-12px range */}
            <div className="flex flex-col items-center gap-1">
              {widths.map((w, i) => {
                const dotSize = 3 + (i / (widths.length - 1)) * 9;
                return (
                  <button key={w}
                    className={`w-10 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none
                      ${currentStyle.baseWidth === w ? 'bg-blue-500/30' : 'bg-transparent hover:bg-white/10'}`}
                    onClick={() => onWidthChange(w)} title={`${w}px`}>
                    <span className="block rounded-full bg-neutral-400" style={{ width: dotSize, height: dotSize }} />
                  </button>
                );
              })}
            </div>
          </>
        );
      })()}

      <Divider />

      {/* Undo / Redo */}
      <ToolBtn active={false} onClick={onUndo} title="Undo (Ctrl+Z)" disabled={!canUndo}>
        <UndoIcon />
      </ToolBtn>
      <ToolBtn active={false} onClick={onRedo} title="Redo (Ctrl+Shift+Z)" disabled={!canRedo}>
        <RedoIcon />
      </ToolBtn>

      <Divider />

      {/* Import file */}
      <ToolBtn active={false} onClick={onImportFile} title="Import file (Ctrl+Shift+I)">
        <PaperclipIcon />
      </ToolBtn>

      {/* Snippets */}
      <ToolBtn active={snippetPanelOpen} onClick={onSnippetPanelToggle} title="Snippets">
        <SnippetsIcon />
      </ToolBtn>

      {/* === MORE MENU === */}
      <div className="relative" ref={moreRef}>
        <ToolBtn active={false} onClick={() => { setMoreOpen(!moreOpen); setShapesOpen(false); setColorsOpen(false); }} title="More options">
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
              <MenuBtn onClick={() => { onExportPng(); setMoreOpen(false); }} icon={<ImageExportIcon />} label="Export page as PNG" />
              <MenuBtn onClick={() => { onExportPdf(); setMoreOpen(false); }} icon={<FileExportIcon />} label="Export as PDF" />
            </div>

            <div className="w-full h-px bg-white/10" />

            {/* Clear */}
            <MenuBtn onClick={() => { onClear(); setMoreOpen(false); }} icon={<TrashIcon />} label="Clear page" danger />

            <div className="w-full h-px bg-white/10" />

            {/* Keyboard shortcuts */}
            <MenuBtn onClick={() => { onShowCheatsheet(); setMoreOpen(false); }} icon={<KeyboardIcon />} label="Keyboard shortcuts" />
          </div>
        )}
      </div>

      <Divider />

      {/* Keyboard shortcuts */}
      <ToolBtn active={false} onClick={onShowCheatsheet} title="Keyboard shortcuts (?)">
        <span className="text-base font-bold leading-none">?</span>
      </ToolBtn>
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
    case 'triangle': return <TriangleIcon />;
    case 'ellipse': return <EllipseIcon />;
    default: return null;
  }
}

function shapeLabel(type: ToolType) {
  switch (type) {
    case 'line': return 'Line (L)';
    case 'rect': return 'Rectangle (R)';
    case 'triangle': return 'Triangle (T)';
    case 'ellipse': return 'Ellipse (O)';
    default: return '';
  }
}

// --- SVG Icons ---

function PenIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /></svg>);
}
function MarkerIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3.5L22 10l-8 8-6.5-6.5z" /><path d="M7.5 11.5L2 22l10.5-5.5" /><path d="M15.5 3.5l-3 3" /><path d="M14 14l3-3" /></svg>);
}
function EraserIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>);
}
function HandIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v1" /><path d="M14 10V4a2 2 0 0 0-4 0v2" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>);
}
function LineIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="19" x2="19" y2="5" /></svg>);
}
function RectIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>);
}
function TriangleIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L22 21H2z" /></svg>);
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
function KeyboardIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.001" /><path d="M10 8h.001" /><path d="M14 8h.001" /><path d="M18 8h.001" /><path d="M6 12h.001" /><path d="M10 12h.001" /><path d="M14 12h.001" /><path d="M18 12h.001" /><path d="M8 16h8" /></svg>);
}
function FileExportIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><polyline points="12 18 12 12" /><polyline points="9 15 12 12 15 15" /></svg>);
}
function PaperclipIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>);
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
function SelectIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2"><rect x="3" y="3" width="18" height="18" rx="1" /></svg>);
}
function SnippetsIcon() {
  return (<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="8" y="2" width="14" height="14" rx="2" /><path d="M4 8H2v14a2 2 0 0 0 2 2h14v-2" /></svg>);
}
