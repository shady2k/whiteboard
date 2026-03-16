'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Page } from '@/app/types';
import { drawBackground } from '@/app/utils/drawGrid';
import { renderAllStrokes } from '@/app/utils/renderStroke';

interface PageNavProps {
  currentIndex: number;
  pages: Page[];
  onGoToPage: (index: number) => void;
  onAddPage: () => void;
  onDeletePage: () => void;
  sessionName: string;
}

const THUMB_W = 64;
const THUMB_H = 40;

export default function PageNav({
  currentIndex,
  pages,
  onGoToPage,
  onAddPage,
  onDeletePage,
  sessionName,
}: PageNavProps) {
  return (
    <div className="fixed bottom-2 left-1/2 -translate-x-1/2 z-50 bg-neutral-900/85 backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center gap-3 shadow-xl">
      <a
        href="/"
        className="text-neutral-400 no-underline text-base px-2 py-1 rounded-md transition-colors hover:bg-white/10 hover:text-white"
        title="Back to sessions"
      >
        &#x2190;
      </a>
      <span className="text-neutral-500 text-sm max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap">
        {sessionName}
      </span>

      {/* Thumbnails */}
      <div className="flex items-center gap-1 max-w-[400px] overflow-x-auto">
        {pages.map((page, i) => (
          <PageThumb
            key={page.id}
            page={page}
            isActive={i === currentIndex}
            onClick={() => onGoToPage(i)}
          />
        ))}
      </div>

      <div className="flex items-center gap-1">
        <span className="text-neutral-400 text-sm min-w-[50px] text-center tabular-nums">
          {currentIndex + 1} / {pages.length}
        </span>
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center text-sm cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white"
          onClick={onAddPage}
          title="Add page"
        >
          +
        </button>
        <button
          className="w-8 h-8 rounded-md flex items-center justify-center text-sm cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default"
          onClick={onDeletePage}
          disabled={pages.length <= 1}
          title="Delete page"
        >
          &#x2212;
        </button>
      </div>
    </div>
  );
}

function PageThumb({ page, isActive, onClick }: { page: Page; isActive: boolean; onClick: () => void }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const scaleX = THUMB_W / window.innerWidth;
    const scaleY = THUMB_H / window.innerHeight;

    ctx.clearRect(0, 0, THUMB_W, THUMB_H);
    ctx.save();
    ctx.scale(scaleX, scaleY);
    drawBackground(ctx, window.innerWidth, window.innerHeight, page.backgroundPattern, page.backgroundColor);
    renderAllStrokes(ctx, page.strokes);
    ctx.restore();
  }, [page.backgroundPattern, page.backgroundColor, page.strokes]);

  useEffect(() => {
    render();
  }, [render]);

  return (
    <canvas
      ref={canvasRef}
      width={THUMB_W}
      height={THUMB_H}
      className={`rounded cursor-pointer transition-all border-2 flex-shrink-0
        ${isActive ? 'border-blue-400 shadow-lg shadow-blue-500/20' : 'border-transparent opacity-60 hover:opacity-100'}`}
      onClick={onClick}
      title={`Page ${page.position + 1}`}
    />
  );
}
