'use client';

import type { Snippet } from '@/app/types';

interface SnippetPanelProps {
  snippets: Snippet[];
  onPaste: (snippet: Snippet) => void;
  onDelete: (id: string) => void;
  onClose: () => void;
}

export default function SnippetPanel({ snippets, onPaste, onDelete, onClose }: SnippetPanelProps) {
  return (
    <div className="fixed top-0 right-0 bottom-0 w-72 z-[60] bg-neutral-900/95 backdrop-blur-md border-l border-neutral-700/50 shadow-2xl flex flex-col animate-slide-left">
      <div className="flex items-center justify-between px-4 py-3 border-b border-neutral-700/50">
        <h3 className="text-white text-sm font-semibold m-0">Snippets</h3>
        <button
          className="w-7 h-7 rounded-md flex items-center justify-center text-neutral-500 hover:text-white hover:bg-white/10 transition-colors border-none bg-transparent cursor-pointer"
          onClick={onClose}
        >
          &times;
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {snippets.length === 0 ? (
          <div className="text-neutral-500 text-sm text-center mt-8 px-4">
            <div className="text-2xl mb-2 opacity-40">
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto opacity-40">
                <rect x="8" y="2" width="14" height="14" rx="2" />
                <path d="M4 8H2v14a2 2 0 0 0 2 2h14v-2" />
              </svg>
            </div>
            No snippets yet. Use the Select tool (S) to select strokes and save them as snippets.
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2">
            {snippets.map(snippet => (
              <div
                key={snippet.id}
                className="group relative rounded-lg border border-neutral-700/50 bg-neutral-800/50 hover:border-blue-500/50 hover:bg-blue-500/5 transition-all cursor-pointer overflow-hidden"
                onClick={() => onPaste(snippet)}
                title={`Click to paste: ${snippet.name}`}
              >
                <div className="aspect-square w-full flex items-center justify-center p-2 bg-white/5">
                  {snippet.thumbnail ? (
                    <img
                      src={snippet.thumbnail}
                      alt={snippet.name}
                      className="w-full h-full object-contain"
                      draggable={false}
                    />
                  ) : (
                    <span className="text-neutral-600 text-xs">No preview</span>
                  )}
                </div>
                <div className="px-2 py-1.5 flex items-center justify-between">
                  <span className="text-neutral-300 text-xs truncate flex-1">{snippet.name}</span>
                  <button
                    className="w-5 h-5 rounded flex items-center justify-center text-neutral-600 hover:text-red-400 hover:bg-red-500/15 transition-colors border-none bg-transparent cursor-pointer opacity-0 group-hover:opacity-100 flex-shrink-0 ml-1"
                    onClick={e => {
                      e.stopPropagation();
                      onDelete(snippet.id);
                    }}
                    title="Delete snippet"
                  >
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />
                    </svg>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
