'use client';

import { useState, useRef, useEffect } from 'react';

interface SnippetSaveDialogProps {
  thumbnail: string;
  strokeCount: number;
  onSave: (name: string) => void;
  onCancel: () => void;
}

export default function SnippetSaveDialog({ thumbnail, strokeCount, onSave, onCancel }: SnippetSaveDialogProps) {
  const [name, setName] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = name.trim() || `Snippet`;
    onSave(trimmed);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-neutral-900/95 border border-neutral-700/50 rounded-2xl shadow-2xl p-5 max-w-sm w-full mx-4 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <h2 className="text-white text-lg font-semibold m-0 mb-4">Save as Snippet</h2>

        <div className="flex items-center gap-4 mb-4">
          <div className="w-20 h-20 rounded-lg bg-neutral-800 border border-neutral-700/50 overflow-hidden flex items-center justify-center flex-shrink-0">
            {thumbnail ? (
              <img src={thumbnail} alt="Snippet preview" className="w-full h-full object-contain" />
            ) : (
              <span className="text-neutral-500 text-xs">Preview</span>
            )}
          </div>
          <div className="text-neutral-400 text-sm">
            {strokeCount} stroke{strokeCount !== 1 ? 's' : ''}
          </div>
        </div>

        <form onSubmit={handleSubmit}>
          <input
            ref={inputRef}
            type="text"
            value={name}
            onChange={e => setName(e.target.value)}
            placeholder="Snippet name"
            className="w-full px-3 py-2 rounded-lg bg-neutral-800 border border-neutral-600 text-white text-sm placeholder-neutral-500 outline-none focus:border-blue-500 transition-colors mb-4"
          />

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-lg text-sm text-neutral-300 bg-transparent border border-neutral-600 cursor-pointer hover:bg-white/10 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 rounded-lg text-sm text-white bg-blue-600 border-none cursor-pointer hover:bg-blue-500 transition-colors"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
