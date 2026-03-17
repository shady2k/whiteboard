'use client';

import { useRef, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { Stroke, BackgroundPattern } from '@/app/types';
import { drawBackground } from '@/app/utils/drawGrid';
import { renderAllStrokes } from '@/app/utils/renderStroke';

interface PageNavProps {
  sessionName: string;
  zoom: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  onZoomReset: () => void;
  strokes: Stroke[];
  backgroundPattern: BackgroundPattern;
  backgroundColor: string;
  isOffline?: boolean;
}

// Fixed height, width computed from viewport aspect ratio
const THUMB_H = 44;

export default function PageNav({
  sessionName,
  zoom,
  onZoomIn,
  onZoomOut,
  onZoomReset,
  strokes,
  backgroundPattern,
  backgroundColor,
  isOffline,
}: PageNavProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const thumbWRef = useRef(Math.round(THUMB_H * 16 / 9));
  const renderThumbRef = useRef<() => void>(null);

  const renderThumb = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const tw = Math.round(THUMB_H * (vw / vh));
    thumbWRef.current = tw;

    canvas.width = tw;
    canvas.height = THUMB_H;

    ctx.clearRect(0, 0, tw, THUMB_H);
    ctx.save();
    ctx.scale(tw / vw, THUMB_H / vh);
    drawBackground(ctx, vw, vh, backgroundPattern, backgroundColor);
    renderAllStrokes(ctx, strokes, () => renderThumbRef.current?.());
    ctx.restore();
  }, [strokes, backgroundPattern, backgroundColor]);
  useEffect(() => { renderThumbRef.current = renderThumb; }, [renderThumb]);

  useEffect(() => {
    renderThumb();
  }, [renderThumb]);

  useEffect(() => {
    const onResize = () => renderThumb();
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [renderThumb]);

  return (
    <div className="fixed bottom-2 right-2 z-50 bg-neutral-900/85 backdrop-blur-md rounded-xl px-3 py-1.5 flex items-center gap-2 shadow-xl">
      <Link
        href="/"
        className="text-neutral-400 no-underline text-base px-2 py-1 rounded-md transition-colors hover:bg-white/10 hover:text-white"
        title="Back to sessions"
      >
        &#x2190;
      </Link>
      <span
        className="text-neutral-500 text-sm max-w-[120px] overflow-hidden text-ellipsis whitespace-nowrap select-none"
        title={sessionName}
      >
        {sessionName}
      </span>

      <div className="w-px h-5 bg-white/15" />

      {/* Mini preview */}
      <canvas
        ref={canvasRef}
        width={Math.round(THUMB_H * 16 / 9)}
        height={THUMB_H}
        className="rounded border border-neutral-700/50 flex-shrink-0"
        title="Page preview"
      />

      <div className="w-px h-5 bg-white/15" />

      <button
        className="w-7 h-7 rounded-md flex items-center justify-center text-sm cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default"
        onClick={onZoomOut}
        disabled={zoom <= 0.25}
        title="Zoom out (Cmd+-)"
      >
        &#x2212;
      </button>
      <button
        className="min-w-[48px] h-7 rounded-md flex items-center justify-center text-xs cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white tabular-nums"
        onClick={onZoomReset}
        title="Reset zoom (Cmd+0)"
      >
        {Math.round(zoom * 100)}%
      </button>
      <button
        className="w-7 h-7 rounded-md flex items-center justify-center text-sm cursor-pointer transition-colors border-none bg-transparent text-neutral-400 hover:bg-white/10 hover:text-white disabled:opacity-30 disabled:cursor-default"
        onClick={onZoomIn}
        disabled={zoom >= 4}
        title="Zoom in (Cmd++)"
      >
        +
      </button>

      {isOffline && (
        <>
          <div className="w-px h-5 bg-white/15" />
          <div className="flex items-center gap-1 text-amber-400" title="Offline — changes saved locally">
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round">
              <line x1="1" y1="1" x2="23" y2="23" />
              <path d="M16.72 11.06A10.94 10.94 0 0 1 19 12.55" />
              <path d="M5 12.55a10.94 10.94 0 0 1 5.17-2.39" />
              <path d="M10.71 5.05A16 16 0 0 1 22.56 9" />
              <path d="M1.42 9a15.91 15.91 0 0 1 4.7-2.88" />
              <path d="M8.53 16.11a6 6 0 0 1 6.95 0" />
              <line x1="12" y1="20" x2="12.01" y2="20" />
            </svg>
            <span className="text-[10px] uppercase tracking-wider">Offline</span>
          </div>
        </>
      )}
    </div>
  );
}
