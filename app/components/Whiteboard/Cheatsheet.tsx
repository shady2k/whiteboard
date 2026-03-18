'use client';

const isMac = typeof navigator !== 'undefined' && /Mac|iPhone|iPad/.test(navigator.userAgent);
const MOD = isMac ? '\u2318' : 'Ctrl';
const SHIFT = isMac ? '\u21E7' : 'Shift';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded bg-neutral-700/60 text-neutral-300 text-[11px] font-mono leading-none border border-neutral-600/40">
      {children}
    </kbd>
  );
}

function ShortcutRow({ keys, label }: { keys: string[]; label: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-1">
      <span className="text-neutral-400 text-sm">{label}</span>
      <span className="flex items-center gap-1">
        {keys.map((k, i) => <Kbd key={i}>{k}</Kbd>)}
      </span>
    </div>
  );
}

export default function Cheatsheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-neutral-900/95 border border-neutral-700/50 rounded-2xl shadow-2xl p-6 max-w-lg w-full mx-4 max-h-[80vh] overflow-y-auto animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white text-lg font-semibold m-0">Keyboard Shortcuts</h2>
          <button
            className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/10 transition-colors border-none bg-transparent cursor-pointer"
            onClick={onClose}
          >
            &times;
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-8 gap-y-0">
          {/* Tools */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Tools</div>
            <ShortcutRow keys={['H']} label="Hand / Pan" />
            <ShortcutRow keys={['P']} label="Pen" />
            <ShortcutRow keys={['M']} label="Highlighter" />
            <ShortcutRow keys={['E']} label="Eraser" />
            <ShortcutRow keys={['L']} label="Line" />
            <ShortcutRow keys={['R']} label="Rectangle" />
            <ShortcutRow keys={['T']} label="Triangle" />
            <ShortcutRow keys={['O']} label="Ellipse" />
            <ShortcutRow keys={['A']} label="Axes" />
            <ShortcutRow keys={['S']} label="Select" />
            <ShortcutRow keys={['Esc']} label="Back to Pen" />
          </div>

          {/* Navigation */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Navigation</div>
            <ShortcutRow keys={[MOD, '+']} label="Zoom in" />
            <ShortcutRow keys={[MOD, '\u2212']} label="Zoom out" />
            <ShortcutRow keys={[MOD, '0']} label="Reset zoom & pan" />
            <ShortcutRow keys={['Space', 'Drag']} label="Pan canvas" />
            <ShortcutRow keys={['Scroll']} label="Pan canvas" />
            <ShortcutRow keys={[MOD, 'Scroll']} label="Zoom" />
          </div>

          {/* Edit */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Edit</div>
            <ShortcutRow keys={[MOD, 'Z']} label="Undo" />
            <ShortcutRow keys={[MOD, SHIFT, 'Z']} label="Redo" />
            <ShortcutRow keys={[MOD, 'C']} label="Copy selection" />
            <ShortcutRow keys={[MOD, 'V']} label="Paste" />
            <ShortcutRow keys={['Del']} label="Delete selection" />
            <ShortcutRow keys={['Shift']} label="Snap shape / lock ratio" />
          </div>

          {/* Import / Export */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Import / Export</div>
            <ShortcutRow keys={[MOD, SHIFT, 'I']} label="Import file" />
            <ShortcutRow keys={[MOD, SHIFT, 'E']} label="Export as PNG" />
            <ShortcutRow keys={[MOD, SHIFT, 'S']} label="Export as PDF" />
          </div>

          {/* Help */}
          <div>
            <div className="text-neutral-500 text-[11px] uppercase tracking-wider mb-1.5 mt-2">Help</div>
            <ShortcutRow keys={['?']} label="Toggle this cheatsheet" />
          </div>
        </div>
      </div>
    </div>
  );
}
