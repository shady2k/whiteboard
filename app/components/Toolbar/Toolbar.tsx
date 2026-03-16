'use client';

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

const TOOLS: { type: ToolType; label: string; icon: string }[] = [
  { type: 'pen', label: 'Pen (P)', icon: 'P' },
  { type: 'eraser', label: 'Eraser (E)', icon: 'E' },
  { type: 'line', label: 'Line (L)', icon: 'L' },
  { type: 'rect', label: 'Rect (R)', icon: 'R' },
  { type: 'ellipse', label: 'Ellipse (O)', icon: 'O' },
];

const BG_PATTERNS: { pattern: BackgroundPattern; label: string; icon: string }[] = [
  { pattern: 'blank', label: 'Blank', icon: '—' },
  { pattern: 'grid', label: 'Grid', icon: '#' },
  { pattern: 'dotgrid', label: 'Dots', icon: '·' },
  { pattern: 'ruled', label: 'Ruled', icon: '≡' },
];

const BG_COLORS = [
  { color: '#ffffff', label: 'White' },
  { color: '#faf5e6', label: 'Cream' },
  { color: '#1a3a2a', label: 'Chalkboard' },
  { color: '#111111', label: 'Dark' },
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
  return (
    <div className="fixed top-1/2 left-2 -translate-y-1/2 z-50 bg-neutral-900/85 backdrop-blur-md rounded-xl p-2 flex flex-col gap-1 shadow-xl max-h-[90vh] overflow-y-auto">
      {/* Tools */}
      <div className="flex flex-col items-center gap-1">
        {TOOLS.map(t => (
          <button
            key={t.type}
            className={`w-10 h-10 rounded-lg flex items-center justify-center text-sm cursor-pointer transition-colors border-none
              ${activeTool === t.type ? 'bg-blue-500/30 text-blue-400' : 'bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white'}`}
            onClick={() => onToolChange(t.type)}
            title={t.label}
          >
            {t.icon}
          </button>
        ))}
      </div>

      <Divider />

      {/* Stroke colors */}
      <div className="flex flex-col items-center gap-1">
        {COLORS.map(color => (
          <button
            key={color}
            className={`w-7 h-7 rounded-full cursor-pointer transition-transform hover:scale-115 border-2
              ${strokeStyle.color === color ? 'border-blue-400' : 'border-transparent'}`}
            style={{ backgroundColor: color }}
            onClick={() => onColorChange(color)}
            title={color}
          />
        ))}
        <input
          type="color"
          value={strokeStyle.color}
          onChange={e => onColorChange(e.target.value)}
          className="w-7 h-7 rounded-full cursor-pointer bg-transparent border-none p-0"
          title="Custom color"
        />
      </div>

      <Divider />

      {/* Widths */}
      <div className="flex flex-col items-center gap-1">
        {WIDTHS.map(w => (
          <button
            key={w}
            className={`w-10 h-8 rounded-md flex items-center justify-center cursor-pointer transition-colors border-none
              ${strokeStyle.baseWidth === w ? 'bg-blue-500/30' : 'bg-transparent hover:bg-white/10'}`}
            onClick={() => onWidthChange(w)}
            title={`${w}px`}
          >
            <span className="block rounded-full bg-neutral-400" style={{ width: w, height: w, minWidth: 2, minHeight: 2 }} />
          </button>
        ))}
      </div>

      <Divider />

      {/* Background pattern */}
      <div className="flex flex-col items-center gap-1">
        {BG_PATTERNS.map(bp => (
          <button
            key={bp.pattern}
            className={`w-10 h-8 rounded-md flex items-center justify-center text-xs cursor-pointer transition-colors border-none
              ${backgroundPattern === bp.pattern ? 'bg-amber-500/30 text-amber-400' : 'bg-transparent text-neutral-500 hover:bg-white/10 hover:text-neutral-300'}`}
            onClick={() => onBackgroundPatternChange(bp.pattern)}
            title={bp.label}
          >
            {bp.icon}
          </button>
        ))}
      </div>

      <Divider />

      {/* Background colors */}
      <div className="flex flex-col items-center gap-1">
        {BG_COLORS.map(bg => (
          <button
            key={bg.color}
            className={`w-6 h-6 rounded-md cursor-pointer transition-transform hover:scale-110 border-2
              ${backgroundColor === bg.color ? 'border-amber-400' : 'border-neutral-600'}`}
            style={{ backgroundColor: bg.color }}
            onClick={() => onBackgroundColorChange(bg.color)}
            title={bg.label}
          />
        ))}
      </div>

      <Divider />

      {/* Import/Export */}
      <div className="flex flex-col items-center gap-1">
        <button
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xs cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white"
          onClick={onImportPdf}
          title="Import PDF"
        >
          PDF
        </button>
        <button
          className="w-10 h-10 rounded-lg flex items-center justify-center text-xs cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white"
          onClick={onExportPng}
          title="Export page as PNG"
        >
          PNG
        </button>
        <button
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[10px] cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white"
          onClick={onExportPdf}
          title="Export all pages as PDF"
        >
          &#x2193;PDF
        </button>
      </div>

      <Divider />

      {/* Actions */}
      <div className="flex flex-col items-center gap-1">
        <button
          className="w-10 h-10 rounded-lg flex items-center justify-center text-base cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default"
          onClick={onUndo}
          disabled={!canUndo}
          title="Undo (Ctrl+Z)"
        >
          &#x21B6;
        </button>
        <button
          className="w-10 h-10 rounded-lg flex items-center justify-center text-base cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default"
          onClick={onRedo}
          disabled={!canRedo}
          title="Redo (Ctrl+Shift+Z)"
        >
          &#x21B7;
        </button>
        <button
          className="w-10 h-10 rounded-lg flex items-center justify-center text-base cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white"
          onClick={onClear}
          title="Clear"
        >
          &#x2715;
        </button>
      </div>
    </div>
  );
}

function Divider() {
  return <div className="w-8 h-px bg-white/15 mx-auto my-1" />;
}
