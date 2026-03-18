'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';

export default function PdfPageDialog({ pdf, numPages, onConfirm, onCancel }: {
  pdf: import('pdfjs-dist').PDFDocumentProxy;
  numPages: number;
  onConfirm: (pages: number[]) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<Set<number>>(() => new Set(Array.from({ length: numPages }, (_, i) => i + 1)));
  const [thumbnails, setThumbnails] = useState<Map<number, string>>(new Map());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 1; i <= numPages; i++) {
        if (cancelled) break;
        try {
          const page = await pdf.getPage(i);
          const viewport = page.getViewport({ scale: 0.5 });
          const canvas = document.createElement('canvas');
          canvas.width = viewport.width;
          canvas.height = viewport.height;
          const ctx = canvas.getContext('2d')!;
          await page.render({ canvasContext: ctx, viewport, canvas } as never).promise;
          if (!cancelled) {
            setThumbnails(prev => new Map(prev).set(i, canvas.toDataURL('image/png', 0.6)));
          }
        } catch {
          // skip failed page
        }
      }
    })();
    return () => { cancelled = true; };
  }, [pdf, numPages]);

  const toggle = (pageNum: number) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(pageNum)) next.delete(pageNum);
      else next.add(pageNum);
      return next;
    });
  };

  const allSelected = selected.size === numPages;
  const toggleAll = () => {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(Array.from({ length: numPages }, (_, i) => i + 1)));
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center" onClick={onCancel}>
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" />
      <div
        className="relative bg-neutral-900/95 border border-neutral-700/50 rounded-2xl shadow-2xl p-5 max-w-xl w-full mx-4 animate-slide-up"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <div>
            <h2 className="text-white text-lg font-semibold m-0">Import PDF</h2>
            <p className="text-neutral-400 text-sm mt-0.5 mb-0">
              {numPages} pages — {selected.size} selected
            </p>
          </div>
          <button
            onClick={toggleAll}
            className="text-sm text-blue-400 hover:text-blue-300 bg-transparent border-none cursor-pointer transition-colors"
          >
            {allSelected ? 'Deselect all' : 'Select all'}
          </button>
        </div>

        <div className="grid grid-cols-4 sm:grid-cols-5 gap-3 max-h-[50vh] overflow-y-auto p-1 -m-1">
          {Array.from({ length: numPages }, (_, i) => i + 1).map(pageNum => {
            const isSelected = selected.has(pageNum);
            const thumb = thumbnails.get(pageNum);
            return (
              <button
                key={pageNum}
                onClick={() => toggle(pageNum)}
                className={`relative flex flex-col items-center gap-1 p-1.5 rounded-lg cursor-pointer transition-all border-2 bg-transparent
                  ${isSelected
                    ? 'border-blue-500 bg-blue-500/10'
                    : 'border-transparent hover:border-neutral-600 hover:bg-white/5'}`}
              >
                <div className="relative w-full aspect-[3/4] rounded bg-neutral-800 overflow-hidden flex items-center justify-center">
                  {thumb ? (
                    <Image src={thumb} alt={`Page ${pageNum}`} className="w-full h-full object-contain" draggable={false} fill unoptimized />
                  ) : (
                    <div className="w-6 h-6 rounded-full border-2 border-neutral-600 border-t-neutral-400 animate-spin" />
                  )}
                  {isSelected && (
                    <div className="absolute top-1 right-1 w-5 h-5 rounded-full bg-blue-500 flex items-center justify-center shadow-md">
                      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="20 6 9 17 4 12" />
                      </svg>
                    </div>
                  )}
                </div>
                <span className={`text-xs tabular-nums ${isSelected ? 'text-blue-400' : 'text-neutral-500'}`}>
                  {pageNum}
                </span>
              </button>
            );
          })}
        </div>

        <div className="flex justify-end gap-2 mt-4">
          <button
            onClick={onCancel}
            className="px-4 py-2 rounded-lg text-sm text-neutral-300 bg-transparent border border-neutral-600 cursor-pointer hover:bg-white/10 transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              const pages = Array.from(selected).sort((a, b) => a - b);
              if (pages.length > 0) onConfirm(pages);
            }}
            disabled={selected.size === 0}
            className="px-4 py-2 rounded-lg text-sm text-white bg-blue-600 border-none cursor-pointer hover:bg-blue-500 transition-colors disabled:opacity-40 disabled:cursor-default"
          >
            Import {selected.size > 0 ? `(${selected.size})` : ''}
          </button>
        </div>
      </div>
    </div>
  );
}
