'use client';

import { useState, useRef, useEffect } from 'react';
import { ToolType, StrokeStyle, BackgroundPattern } from '@/app/types';

interface PenConfig {
  color: string;
  label: string;
  baseWidth: number;
}

interface ToolbarProps {
  activeTool: ToolType;
  activePenColor: string;
  penConfigs: PenConfig[];
  markerStyle: StrokeStyle;
  backgroundPattern: BackgroundPattern;
  backgroundColor: string;
  zoom: number;
  onToolChange: (tool: ToolType) => void;
  onPenSelect: (color: string) => void;
  onPenWidthChange: (color: string, width: number) => void;
  onMarkerWidthChange: (width: number) => void;
  onBackgroundPatternChange: (pattern: BackgroundPattern) => void;
  onBackgroundColorChange: (color: string) => void;
  onUndo: () => void;
  onRedo: () => void;
  onClear: () => void;
  onImportFile: () => void;
  onExportPng: () => void;
  onExportPdf: () => void;
  onShowCheatsheet: () => void;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  canUndo: boolean;
  canRedo: boolean;
  isOffline?: boolean;
}

const PEN_WIDTHS = [2, 4, 8, 16];
const MARKER_WIDTHS = [12, 20, 28, 40];

const BG_COLORS = [
  { color: '#ffffff', label: 'White' },
  { color: '#d4d4d4', label: 'Light Gray' },
];

const SHAPE_TOOLS: ToolType[] = ['line', 'rect', 'triangle', 'ellipse', 'axes'];

const BG_PATTERNS: { pattern: BackgroundPattern; label: string; icon: React.ReactNode }[] = [
  { pattern: 'blank', label: 'Blank', icon: <BlankBgIcon /> },
  { pattern: 'grid', label: 'Grid', icon: <GridBgIcon /> },
  { pattern: 'dotgrid', label: 'Dots', icon: <DotBgIcon /> },
  { pattern: 'ruled', label: 'Ruled', icon: <RuledBgIcon /> },
];

export default function Toolbar({
  activeTool,
  activePenColor,
  penConfigs,
  markerStyle,
  backgroundPattern,
  backgroundColor,
  zoom,
  onToolChange,
  onPenSelect,
  onPenWidthChange,
  onMarkerWidthChange,
  onBackgroundPatternChange,
  onBackgroundColorChange,
  onUndo,
  onRedo,
  onClear,
  onImportFile,
  onExportPng,
  onExportPdf,
  onShowCheatsheet,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  canUndo,
  canRedo,
  isOffline,
}: ToolbarProps) {
  const [shapesOpen, setShapesOpen] = useState(false);
  const [widthOpen, setWidthOpen] = useState<string | null>(null); // pen color whose width picker is open
  const [markerWidthOpen, setMarkerWidthOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  const shapesRef = useRef<HTMLDivElement>(null);
  const widthRefs = useRef<Map<string, HTMLDivElement>>(new Map());
  const markerWidthRef = useRef<HTMLDivElement>(null);
  const moreRef = useRef<HTMLDivElement>(null);

  const activeShape = SHAPE_TOOLS.includes(activeTool) ? activeTool : 'line';
  const isShapeActive = SHAPE_TOOLS.includes(activeTool);
  const prevToolRef = useRef(activeTool);

  useEffect(() => {
    const handler = (e: PointerEvent) => {
      if (shapesRef.current && !shapesRef.current.contains(e.target as Node)) setShapesOpen(false);
      if (moreRef.current && !moreRef.current.contains(e.target as Node)) setMoreOpen(false);
      if (markerWidthRef.current && !markerWidthRef.current.contains(e.target as Node)) setMarkerWidthOpen(false);
      if (widthOpen) {
        const ref = widthRefs.current.get(widthOpen);
        if (ref && !ref.contains(e.target as Node)) setWidthOpen(null);
      }
    };
    document.addEventListener('pointerdown', handler);
    return () => document.removeEventListener('pointerdown', handler);
  }, [widthOpen]);

  useEffect(() => {
    const prev = prevToolRef.current;
    prevToolRef.current = activeTool;
    if (SHAPE_TOOLS.includes(activeTool) && !SHAPE_TOOLS.includes(prev)) {
      queueMicrotask(() => {
        setShapesOpen(true);
        setWidthOpen(null);
        setMarkerWidthOpen(false);
        setMoreOpen(false);
      });
    }
  }, [activeTool]);

  const closeAllMenus = () => { setShapesOpen(false); setWidthOpen(null); setMarkerWidthOpen(false); setMoreOpen(false); };

  return (
    <>
      {/* Backdrop to catch clicks when menus are open */}
      {(shapesOpen || widthOpen || markerWidthOpen || moreOpen) && (
        <div
          className="fixed inset-0 z-40"
          onPointerDown={(e) => {
            e.stopPropagation();
            e.preventDefault();
            closeAllMenus();
          }}
        />
      )}
      <div className="fixed bottom-3 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/85 backdrop-blur-md rounded-2xl px-2 py-1.5 flex items-center gap-0.5 shadow-xl">
        {/* Left tools */}
        <a
          href="/"
          className="w-9 h-9 rounded-lg flex items-center justify-center text-neutral-400 no-underline transition-colors hover:bg-white/10 hover:text-white"
          title="Back to sessions"
        >
          <BackIcon />
        </a>

        <Divider />

        <ToolBtn active={activeTool === 'hand'} onClick={() => onToolChange('hand')} title="Hand / Pan (H)">
          <HandIcon />
        </ToolBtn>

        <div className="relative" ref={markerWidthRef}>
          <ToolBtn
            active={activeTool === 'marker'}
            onClick={() => {
              if (activeTool === 'marker') {
                setMarkerWidthOpen(!markerWidthOpen);
                setWidthOpen(null);
                setShapesOpen(false);
                setMoreOpen(false);
              } else {
                onToolChange('marker');
                setMarkerWidthOpen(false);
              }
            }}
            title="Highlighter (M) — click again for thickness"
          >
            <MarkerIcon />
          </ToolBtn>
          {markerWidthOpen && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-neutral-900/95 backdrop-blur-md rounded-lg p-1 flex flex-col gap-1 shadow-xl border border-neutral-700/50 animate-menu-in">
              {MARKER_WIDTHS.map((w, i) => {
                const d = 5 + (i / (MARKER_WIDTHS.length - 1)) * 11;
                return (
                  <button
                    key={w}
                    className={`w-10 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none
                      ${markerStyle.baseWidth === w ? 'bg-blue-500/30' : 'bg-transparent hover:bg-white/10'}`}
                    onClick={() => { onMarkerWidthChange(w); setMarkerWidthOpen(false); }}
                    title={`${w}px`}
                  >
                    <span className="block rounded-full bg-blue-400/70" style={{ width: d, height: d }} />
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <ToolBtn active={activeTool === 'eraser'} onClick={() => onToolChange('eraser')} title="Eraser (E)">
          <EraserIcon />
        </ToolBtn>

        <Divider />

        <ToolBtn active={activeTool === 'select'} onClick={() => onToolChange('select')} title="Select (S)">
          <SelectIcon />
        </ToolBtn>

        <div className="relative" ref={shapesRef}>
          <ToolBtn
            active={isShapeActive}
            onClick={() => {
              if (!isShapeActive) { onToolChange(activeShape); }
              else { setShapesOpen(!shapesOpen); setWidthOpen(null); setMoreOpen(false); }
            }}
            title={shapeLabel(activeShape)}
            badge="&#x25B4;"
          >
            {shapeIcon(activeShape)}
          </ToolBtn>
          {shapesOpen && (
            <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-neutral-900/95 backdrop-blur-md rounded-lg p-1 flex gap-1 shadow-xl border border-neutral-700/50 animate-menu-in">
              {SHAPE_TOOLS.map(type => (
                <ToolBtn key={type} active={activeTool === type}
                  onClick={() => { onToolChange(type); setShapesOpen(false); }}
                  title={shapeLabel(type)}>
                  {shapeIcon(type)}
                </ToolBtn>
              ))}
            </div>
          )}
        </div>

        {/* Spacer + divider — pushes pens to center */}
        <div className="flex-1 min-w-1" />
        <Divider />

        {/* === THREE PENS — screen center === */}
        {penConfigs.map((pen) => {
          const isActive = activeTool === 'pen' && activePenColor === pen.color;
          return (
            <div
              key={pen.color}
              className="relative"
              ref={(el) => { if (el) widthRefs.current.set(pen.color, el); }}
            >
              <button
                className={`w-10 h-10 rounded-lg flex flex-col items-center justify-center cursor-pointer transition-colors border-none gap-0.5
                  ${isActive ? 'bg-white/15' : 'bg-transparent hover:bg-white/10'}`}
                onClick={() => {
                  if (isActive) {
                    setWidthOpen(widthOpen === pen.color ? null : pen.color);
                    setShapesOpen(false);
                    setMarkerWidthOpen(false);
                    setMoreOpen(false);
                  } else {
                    onPenSelect(pen.color);
                    setWidthOpen(null);
                  }
                }}
                title={`${pen.label} pen (click again for thickness)`}
              >
                <ColoredPenIcon color={pen.color} />
                {isActive && (
                  <span
                    className="block rounded-full bg-white/60"
                    style={{ width: 4, height: 4 }}
                  />
                )}
              </button>
              {widthOpen === pen.color && (
                <div className="absolute bottom-12 left-1/2 -translate-x-1/2 bg-neutral-900/95 backdrop-blur-md rounded-lg p-1 flex flex-col gap-1 shadow-xl border border-neutral-700/50 animate-menu-in">
                  {PEN_WIDTHS.map((w, i) => {
                    const d = 3 + (i / (PEN_WIDTHS.length - 1)) * 9;
                    return (
                      <button
                        key={w}
                        className={`w-10 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none
                          ${pen.baseWidth === w ? 'bg-blue-500/30' : 'bg-transparent hover:bg-white/10'}`}
                        onClick={() => { onPenWidthChange(pen.color, w); setWidthOpen(null); }}
                        title={`${w}px`}
                      >
                        <span className="block rounded-full" style={{ width: d, height: d, backgroundColor: pen.color, border: pen.color === '#000000' ? '1px solid #555' : 'none' }} />
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Divider + spacer — pushes pens to center */}
        <Divider />
        <div className="flex-1 min-w-1" />

        {/* Right tools */}
        <ToolBtn active={false} onClick={onUndo} title="Undo (Ctrl+Z)" disabled={!canUndo}>
          <UndoIcon />
        </ToolBtn>
        <ToolBtn active={false} onClick={onRedo} title="Redo (Ctrl+Shift+Z)" disabled={!canRedo}>
          <RedoIcon />
        </ToolBtn>

        <Divider />

        <ToolBtn active={false} onClick={onZoomOut} title="Zoom out" disabled={zoom <= 0.25}>
          <ZoomOutIcon />
        </ToolBtn>
        <button
          className="min-w-[44px] h-9 rounded-lg flex items-center justify-center text-xs cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white tabular-nums"
          onClick={onZoomReset}
          title="Reset zoom (Cmd+0)"
        >
          {Math.round(zoom * 100)}%
        </button>
        <ToolBtn active={false} onClick={onZoomIn} title="Zoom in" disabled={zoom >= 4}>
          <ZoomInIcon />
        </ToolBtn>

        <Divider />

        <ToolBtn active={false} onClick={onImportFile} title="Import file (Ctrl+Shift+I)">
          <PaperclipIcon />
        </ToolBtn>

        <div className="relative" ref={moreRef}>
          <ToolBtn active={false} onClick={() => { setMoreOpen(!moreOpen); setShapesOpen(false); setWidthOpen(null); }} title="More options">
            <MoreIcon />
          </ToolBtn>
          {moreOpen && (
            <div className="absolute bottom-12 right-0 bg-neutral-900/95 backdrop-blur-md rounded-xl p-3 shadow-xl border border-neutral-700/50 min-w-[200px] flex flex-col gap-3 animate-menu-in">
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

              <div className="flex flex-col gap-0.5">
                <MenuBtn onClick={() => { onExportPng(); setMoreOpen(false); }} icon={<ImageExportIcon />} label="Export page as PNG" />
                <MenuBtn onClick={() => { onExportPdf(); setMoreOpen(false); }} icon={<FileExportIcon />} label="Export as PDF" />
              </div>

              <div className="w-full h-px bg-white/10" />

              <MenuBtn onClick={() => { onClear(); setMoreOpen(false); }} icon={<TrashIcon />} label="Clear page" danger />

              <div className="w-full h-px bg-white/10" />

              <MenuBtn onClick={() => { onShowCheatsheet(); setMoreOpen(false); }} icon={<KeyboardIcon />} label="Keyboard shortcuts" />
            </div>
          )}
        </div>

        {isOffline && (
          <>
            <Divider />
            <div className="flex items-center gap-1 text-amber-400 px-1" title="Offline — changes saved locally">
              <OfflineIcon />
            </div>
          </>
        )}
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
      className={`w-9 h-9 rounded-lg flex items-center justify-center cursor-pointer transition-colors border-none relative
        ${active ? 'bg-blue-500/30 text-blue-400' : 'bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white'}
        ${disabled ? 'opacity-30 !cursor-default' : ''}`}
      onClick={onClick} title={title} disabled={disabled}
    >
      {children}
      {badge && <span className="absolute right-0 top-0 text-[7px] text-neutral-500" dangerouslySetInnerHTML={{ __html: badge }} />}
    </button>
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
  return <div className="h-6 w-px bg-white/15 mx-1" />;
}

function shapeIcon(type: ToolType) {
  switch (type) {
    case 'line': return <LineIcon />;
    case 'rect': return <RectIcon />;
    case 'triangle': return <TriangleIcon />;
    case 'ellipse': return <EllipseIcon />;
    case 'axes': return <AxesIcon />;
    default: return null;
  }
}

function shapeLabel(type: ToolType) {
  switch (type) {
    case 'line': return 'Line (L)';
    case 'rect': return 'Rectangle (R)';
    case 'triangle': return 'Triangle (T)';
    case 'ellipse': return 'Ellipse (O)';
    case 'axes': return 'Axes (A)';
    default: return '';
  }
}

// --- SVG Icons ---

function BackIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 12H5" /><path d="M12 19l-7-7 7-7" /></svg>);
}
function ColoredPenIcon({ color }: { color: string }) {
  // Use a lighter shade for black so it's visible on the dark toolbar
  const displayColor = color === '#000000' ? '#d4d4d4' : color;
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" stroke={displayColor} />
    </svg>
  );
}
function MarkerIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15.5 3.5L22 10l-8 8-6.5-6.5z" /><path d="M7.5 11.5L2 22l10.5-5.5" /><path d="M15.5 3.5l-3 3" /><path d="M14 14l3-3" /></svg>);
}
function HandIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M18 11V6a2 2 0 0 0-4 0v1" /><path d="M14 10V4a2 2 0 0 0-4 0v2" /><path d="M10 10.5V6a2 2 0 0 0-4 0v8" /><path d="M18 8a2 2 0 1 1 4 0v6a8 8 0 0 1-8 8h-2c-2.8 0-4.5-.86-5.99-2.34l-3.6-3.6a2 2 0 0 1 2.83-2.82L7 15" /></svg>);
}
function EraserIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m7 21-4.3-4.3c-1-1-1-2.5 0-3.4l9.6-9.6c1-1 2.5-1 3.4 0l5.6 5.6c1 1 1 2.5 0 3.4L13 21" /><path d="M22 21H7" /><path d="m5 11 9 9" /></svg>);
}
function SelectIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" strokeDasharray="4 2"><rect x="3" y="3" width="18" height="18" rx="1" /></svg>);
}
function LineIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="5" y1="19" x2="19" y2="5" /></svg>);
}
function RectIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" /></svg>);
}
function TriangleIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 3L22 21H2z" /></svg>);
}
function EllipseIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><ellipse cx="12" cy="12" rx="10" ry="7" /></svg>);
}
function AxesIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="2" y1="12" x2="22" y2="12" /><line x1="12" y1="22" x2="12" y2="2" /><polygon points="22 12 19 10.5 19 13.5" fill="currentColor" stroke="none" /><polygon points="12 2 10.5 5 13.5 5" fill="currentColor" stroke="none" /></svg>);
}
function UndoIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>);
}
function RedoIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 7v6h-6" /><path d="M3 17a9 9 0 0 1 9-9 9 9 0 0 1 6 2.3L21 13" /></svg>);
}
function ZoomOutIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="8" y1="11" x2="14" y2="11" /></svg>);
}
function ZoomInIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /><line x1="11" y1="8" x2="11" y2="14" /><line x1="8" y1="11" x2="14" y2="11" /></svg>);
}
function PaperclipIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l8.49-8.48" /></svg>);
}
function MoreIcon() {
  return (<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor"><circle cx="5" cy="12" r="2" /><circle cx="12" cy="12" r="2" /><circle cx="19" cy="12" r="2" /></svg>);
}
function TrashIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>);
}
function KeyboardIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="4" width="20" height="16" rx="2" /><path d="M6 8h.001" /><path d="M10 8h.001" /><path d="M14 8h.001" /><path d="M18 8h.001" /><path d="M6 12h.001" /><path d="M10 12h.001" /><path d="M14 12h.001" /><path d="M18 12h.001" /><path d="M8 16h8" /></svg>);
}
function ImageExportIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="17 8 12 3 7 8" /><line x1="12" y1="3" x2="12" y2="15" /></svg>);
}
function FileExportIcon() {
  return (<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><polyline points="12 18 12 12" /><polyline points="9 15 12 12 15 15" /></svg>);
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
function OfflineIcon() {
  return (<svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><line x1="1" y1="1" x2="23" y2="23" /><path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" /><path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" /><path d="M10.71 5.05A16 16 0 0 1 22.56 9" /><path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" /><path d="M8.53 16.11a6 6 0 0 1 6.95 0" /><line x1="12" y1="20" x2="12.01" y2="20" /></svg>);
}
