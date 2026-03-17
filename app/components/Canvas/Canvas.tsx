'use client';

import { useRef, useEffect, useCallback } from 'react';
import { useLatestRef } from '@/app/hooks/useLatestRef';
import { Point, Stroke, FreehandStroke, MarkerStroke, ImageStroke, StrokeStyle, ToolType, BackgroundPattern, Snippet } from '@/app/types';
import { drawFreehandPoints, drawMarkerPoints } from '@/app/utils/drawStroke';
import { renderStroke, renderAllStrokes } from '@/app/utils/renderStroke';
import { drawLinePreview, drawRectPreview, drawEllipsePreview, drawTrianglePreview, drawAxesPreview, shapeToPointGroups } from '@/app/utils/drawShape';
import { drawBackground } from '@/app/utils/drawGrid';
import { snapLineEnd, snapRectEnd, snapEllipseEnd } from '@/app/utils/snapShape';
import { getCachedImage } from '@/app/utils/imageCache';
import { strokeIntersectsRect, findStrokeAtPoint as findStrokeAtPointUtil, computeEraseResult } from '@/app/utils/strokeBounds';
import { offsetStroke } from '@/app/utils/strokeTransform';
import { useImageDrag } from '@/app/hooks/useImageDrag';
import { v4 as uuidv4 } from 'uuid';

interface CanvasProps {
  strokes: Stroke[];
  activeTool: ToolType;
  strokeStyle: StrokeStyle;
  backgroundColor: string;
  backgroundPattern: BackgroundPattern;
  scale: number;
  panOffset: { x: number; y: number };
  onStrokeComplete: (stroke: Stroke) => void;
  onStrokeDelete?: (strokeId: string) => void;
  onEraseCommit?: (erased: { strokeId: string; remaining: Stroke[] }[]) => void;
  onImageTransform?: (strokeId: string, newStroke: ImageStroke) => void;
  onToolChange?: (tool: ToolType) => void;
  onZoomChange?: (zoom: number) => void;
  onPanChange?: (offset: { x: number; y: number }) => void;
  onSelectionComplete?: (strokes: Stroke[], bounds: { x: number; y: number; width: number; height: number }) => void;
  pastePreview?: Snippet | null;
  onPasteConfirm?: (targetX: number, targetY: number) => void;
  selectionActive?: boolean;
}

export default function Canvas({
  strokes,
  activeTool,
  strokeStyle,
  backgroundColor,
  backgroundPattern,
  scale,
  panOffset,
  onStrokeComplete,
  onStrokeDelete,
  onEraseCommit,
  onImageTransform,
  onToolChange,
  onZoomChange,
  onPanChange,
  onSelectionComplete,
  pastePreview,
  onPasteConfirm,
  selectionActive,
}: CanvasProps) {
  const bgCanvasRef = useRef<HTMLCanvasElement>(null);
  const inkCanvasRef = useRef<HTMLCanvasElement>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement>(null);

  const isDrawingRef = useRef(false);
  const currentPointsRef = useRef<Point[]>([]);
  const startPointRef = useRef<Point | null>(null);
  const currentPointRef = useRef<Point | null>(null);
  const shiftHeldRef = useRef(false);
  const rafIdRef = useRef<number>(0);

  // Pan state
  const isPanningRef = useRef(false);
  const panStartRef = useRef<{ x: number; y: number } | null>(null);
  const panOffsetStartRef = useRef<{ x: number; y: number }>({ x: 0, y: 0 });
  const spaceHeldRef = useRef(false);

  // Mutable viewport state — drives canvas directly, syncs back to React lazily
  const viewportRef = useRef({ scale, panOffset });
  const viewportCommitRafRef = useRef(0);

  const activeToolRef = useLatestRef(activeTool);
  const strokeStyleRef = useLatestRef(strokeStyle);
  const strokesRef = useLatestRef(strokes);
  const bgPatternRef = useLatestRef(backgroundPattern);
  const bgColorRef = useLatestRef(backgroundColor);
  const scaleRef = useLatestRef(scale);
  const onStrokeCompleteRef = useLatestRef(onStrokeComplete);
  const onStrokeDeleteRef = useLatestRef(onStrokeDelete);
  const onEraseCommitRef = useLatestRef(onEraseCommit);
  // Track eraser path during a drag — collect positions with per-point radius, commit on mouseup
  const eraserPointsRef = useRef<{ point: Point; radius: number }[]>([]);
  const lastEraserTimeRef = useRef(0);
  const lastEraserPosRef = useRef<{ x: number; y: number } | null>(null);
  const eraserVelocityRef = useRef(0); // smoothed velocity in canvas-space px/ms
  const onImageTransformRef = useLatestRef(onImageTransform);
  const onToolChangeRef = useLatestRef(onToolChange);
  const onZoomChangeRef = useLatestRef(onZoomChange);
  const onPanChangeRef = useLatestRef(onPanChange);
  const panOffsetRef = useLatestRef(panOffset);
  const onSelectionCompleteRef = useLatestRef(onSelectionComplete);
  const onPasteConfirmRef = useLatestRef(onPasteConfirm);
  const pastePreviewRef = useLatestRef(pastePreview);

  const getCtx = useCallback((canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null => {
    return canvas?.getContext('2d') ?? null;
  }, []);

  const getViewportSize = useCallback(() => {
    return { w: window.innerWidth, h: window.innerHeight };
  }, []);

  // Compute pan offset for center-based zoom + user pan
  const getTransform = useCallback(() => {
    const { w, h } = getViewportSize();
    const { scale: s, panOffset: pan } = viewportRef.current;
    const panX = (w / 2) * (1 - s) + pan.x;
    const panY = (h / 2) * (1 - s) + pan.y;
    return { panX, panY, scale: s };
  }, [getViewportSize]);

  const resizeCanvases = useCallback(() => {
    const dpr = window.devicePixelRatio || 1;
    const { w, h } = getViewportSize();

    [bgCanvasRef, inkCanvasRef, previewCanvasRef].forEach(ref => {
      const canvas = ref.current;
      if (!canvas) return;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const ctx = canvas.getContext('2d');
      if (ctx) ctx.scale(dpr, dpr);
    });
  }, [getViewportSize]);

  const redrawBackground = useCallback(() => {
    const ctx = getCtx(bgCanvasRef.current);
    if (!ctx) return;
    const { w, h } = getViewportSize();
    const { panX, panY, scale: s } = getTransform();

    // Clear in screen space
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(s, s);
    // Visible rectangle in canvas coordinates
    const visX = -panX / s;
    const visY = -panY / s;
    const visW = w / s;
    const visH = h / s;
    drawBackground(ctx, visW, visH, bgPatternRef.current, bgColorRef.current, visX, visY);
    ctx.restore();
  }, [getCtx, getViewportSize, getTransform]);

  const redrawInkRef = useRef<() => void>(null);
  const redrawInk = useCallback(() => {
    const ctx = getCtx(inkCanvasRef.current);
    if (!ctx) return;
    const { w, h } = getViewportSize();
    const { panX, panY, scale: s } = getTransform();
    ctx.clearRect(0, 0, w, h);
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(s, s);
    renderAllStrokes(ctx, strokesRef.current, () => redrawInkRef.current?.(), draggingImageIdRef.current ?? undefined);
    ctx.restore();
  }, [getCtx, getViewportSize, getTransform]);
  useEffect(() => { redrawInkRef.current = redrawInk; }, [redrawInk]);

  const clearPreview = useCallback(() => {
    const ctx = getCtx(previewCanvasRef.current);
    if (!ctx) return;
    const { w, h } = getViewportSize();
    ctx.clearRect(0, 0, w, h);
  }, [getCtx, getViewportSize]);

  const drawCommittedStrokeToInk = useCallback((stroke: Stroke) => {
    const ctx = getCtx(inkCanvasRef.current);
    if (!ctx) return;
    const { panX, panY, scale: s } = getTransform();
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(s, s);
    renderStroke(ctx, stroke, () => redrawInkRef.current?.());
    ctx.restore();
  }, [getCtx, getTransform]);

  const {
    selectedImageRef,
    dragHandleRef,
    dragStartRef,
    dragOriginalRef,
    draggingImageIdRef,
    selectedImage,
    setSelectedImage,
    lockProportions,
    setLockProportions,
    isDragging,
    setIsDragging,
    lockProportionsRef,
    findImageAtPoint,
    drawImageSelection,
    handleOpacityChange,
    handleDeleteImage,
    selPos,
  } = useImageDrag({
    getTransform,
    scaleRef,
    strokesRef,
    strokes,
    scale,
    panOffset,
    activeTool,
    onStrokeDeleteRef,
    onImageTransformRef,
    clearPreview,
    getCtx,
    previewCanvasRef,
  });

  // rAF-batched redraw scheduling
  const rafRef = useRef(0);
  const dirtyRef = useRef<{ bg: boolean; ink: boolean }>({ bg: false, ink: false });

  const scheduleRedraw = useCallback((bg: boolean, ink: boolean) => {
    if (bg) dirtyRef.current.bg = true;
    if (ink) dirtyRef.current.ink = true;
    if (rafRef.current) return;
    rafRef.current = requestAnimationFrame(() => {
      rafRef.current = 0;
      const { bg: needBg, ink: needInk } = dirtyRef.current;
      dirtyRef.current = { bg: false, ink: false };
      if (needBg) redrawBackground();
      if (needInk) redrawInk();
    });
  }, [redrawBackground, redrawInk]);

  // Direct viewport update — bypasses React render, draws immediately via rAF
  const updateViewport = useCallback((nextScale: number, nextPan: { x: number; y: number }) => {
    viewportRef.current = { scale: nextScale, panOffset: nextPan };
    scaleRef.current = nextScale;
    panOffsetRef.current = nextPan;
    scheduleRedraw(true, true);

    // Lazily sync back to React state
    if (viewportCommitRafRef.current) cancelAnimationFrame(viewportCommitRafRef.current);
    viewportCommitRafRef.current = requestAnimationFrame(() => {
      viewportCommitRafRef.current = 0;
      if (onPanChangeRef.current) onPanChangeRef.current(viewportRef.current.panOffset);
      if (onZoomChangeRef.current) onZoomChangeRef.current(viewportRef.current.scale);
    });
  }, [scheduleRedraw]);

  const flushViewportCommit = useCallback(() => {
    if (!viewportCommitRafRef.current) return;
    cancelAnimationFrame(viewportCommitRafRef.current);
    viewportCommitRafRef.current = 0;
    if (onPanChangeRef.current) onPanChangeRef.current(viewportRef.current.panOffset);
    if (onZoomChangeRef.current) onZoomChangeRef.current(viewportRef.current.scale);
  }, []);

  // Init + resize
  useEffect(() => {
    resizeCanvases();
    redrawBackground();
    redrawInk();

    const handleResize = () => {
      resizeCanvases();
      redrawBackground();
      redrawInk();
    };

    window.addEventListener('resize', handleResize);
    return () => {
      window.removeEventListener('resize', handleResize);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      if (viewportCommitRafRef.current) cancelAnimationFrame(viewportCommitRafRef.current);
    };
  }, [resizeCanvases, redrawBackground, redrawInk]);

  useEffect(() => { redrawInk(); }, [strokes, redrawInk]);
  useEffect(() => { redrawBackground(); }, [backgroundColor, backgroundPattern, redrawBackground]);
  // Sync viewport ref when React state changes externally (e.g. zoom buttons)
  useEffect(() => {
    const changed = viewportRef.current.scale !== scale ||
      viewportRef.current.panOffset.x !== panOffset.x ||
      viewportRef.current.panOffset.y !== panOffset.y;
    viewportRef.current = { scale, panOffset };
    scaleRef.current = scale;
    panOffsetRef.current = panOffset;
    if (changed) {
      redrawBackground();
      redrawInk();
    }
  }, [scale, panOffset, redrawBackground, redrawInk]);

  // Track shift and space keys
  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = true;
      if (e.key === ' ' && !e.repeat) { e.preventDefault(); spaceHeldRef.current = true; }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === 'Shift') shiftHeldRef.current = false;
      if (e.key === ' ') spaceHeldRef.current = false;
    };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  // Pinch-to-zoom (trackpad/gesture) and Ctrl+wheel; plain scroll = pan
  useEffect(() => {
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      const vp = viewportRef.current;
      if (e.ctrlKey || e.metaKey) {
        const delta = -e.deltaY * 0.01;
        const newZoom = Math.max(0.25, Math.min(4, vp.scale + delta));
        updateViewport(newZoom, vp.panOffset);
      } else {
        updateViewport(vp.scale, {
          x: vp.panOffset.x - e.deltaX,
          y: vp.panOffset.y - e.deltaY,
        });
      }
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, [updateViewport]);

  // Clear preview when selection is dismissed
  useEffect(() => {
    if (selectionActive === false && activeTool === 'select') {
      clearPreview();
    }
  }, [selectionActive, activeTool, clearPreview]);

  // Helper to get canvas-space point from pointer event (used inline below)
  const getPoint = useCallback((e: PointerEvent): Point => {
    const canvas = previewCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { panX, panY, scale: s } = getTransform();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const pressure = e.pointerType === 'mouse' ? 0.5 : (e.pressure || 0.5);
    return { x: (screenX - panX) / s, y: (screenY - panY) / s, pressure };
  }, [getTransform]);

  // Paste preview: render ghost strokes following cursor
  useEffect(() => {
    if (!pastePreview || activeTool !== 'select') return;
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const onMove = (e: PointerEvent) => {
      const point = getPoint(e);
      cancelAnimationFrame(rafIdRef.current);
      rafIdRef.current = requestAnimationFrame(() => {
        clearPreview();
        const ctx = getCtx(previewCanvasRef.current);
        if (!ctx) return;
        const { panX, panY, scale: s } = getTransform();
        ctx.save();
        ctx.translate(panX, panY);
        ctx.scale(s, s);
        ctx.globalAlpha = 0.5;
        const offsetX = point.x - pastePreview.width / 2;
        const offsetY = point.y - pastePreview.height / 2;
        for (const stroke of pastePreview.strokes) {
          const shifted = offsetStroke(stroke, offsetX, offsetY);
          renderStroke(ctx, shifted);
        }
        ctx.globalAlpha = 1;
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 1 / s;
        ctx.setLineDash([4 / s, 3 / s]);
        ctx.strokeRect(offsetX, offsetY, pastePreview.width, pastePreview.height);
        ctx.setLineDash([]);
        ctx.restore();
      });
    };

    canvas.addEventListener('pointermove', onMove);
    return () => canvas.removeEventListener('pointermove', onMove);
  }, [pastePreview, activeTool, getPoint, getCtx, getTransform, clearPreview]);

  const findStrokeAtPoint = useCallback((p: Point): string | null => {
    const eraserRadius = 10 / scaleRef.current;
    return findStrokeAtPointUtil(p, strokesRef.current, eraserRadius);
  }, []);

  // Pointer events
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);

      const isBarrelButton = e.button === 2 || e.button === 5;
      const isEraserEnd = (e as PointerEvent & { pointerType: string }).pointerType === 'pen' &&
        ((e as unknown as { pressure: number }).pressure > 0) &&
        (e.buttons === 32);
      let tool = activeToolRef.current;

      // Temporarily override to eraser for this stroke only (don't change toolbar state)
      if (isBarrelButton || isEraserEnd) {
        tool = 'eraser';
      }

      // Space+drag or middle-mouse = temporary pan
      if (spaceHeldRef.current || e.button === 1) {
        isPanningRef.current = true;
        panStartRef.current = { x: e.clientX, y: e.clientY };
        panOffsetStartRef.current = { ...panOffsetRef.current };
        isDrawingRef.current = true;
        return;
      }

      const point = getPoint(e);

      // Select tool: start selection rectangle or paste preview click
      if (tool === 'select') {
        if (pastePreviewRef.current) {
          // Paste mode: place snippet at clicked position
          if (onPasteConfirmRef.current) {
            onPasteConfirmRef.current(point.x, point.y);
          }
          return;
        }
        // Start selection rectangle
        startPointRef.current = point;
        currentPointRef.current = point;
        isDrawingRef.current = true;
        return;
      }

      // Hand tool: pan canvas or select/drag images
      if (tool === 'hand') {
        const imgHit = findImageAtPoint(point);
        if (imgHit) {
          selectedImageRef.current = imgHit.stroke;
          setSelectedImage(imgHit.stroke);
          setIsDragging(false);
          dragHandleRef.current = imgHit.handle;
          dragStartRef.current = { x: point.x, y: point.y };
          dragOriginalRef.current = { ...imgHit.stroke };
          draggingImageIdRef.current = null;
          isDrawingRef.current = true;
          clearPreview();
          drawImageSelection(getCtx(previewCanvasRef.current)!, imgHit.stroke);
          return;
        } else {
          selectedImageRef.current = null;
          setSelectedImage(null);
          setIsDragging(false);
          draggingImageIdRef.current = null;
          clearPreview();
          // Start panning
          isPanningRef.current = true;
          panStartRef.current = { x: e.clientX, y: e.clientY };
          panOffsetStartRef.current = { ...panOffsetRef.current };
          isDrawingRef.current = true;
          return;
        }
      }

      isDrawingRef.current = true;

      if (tool === 'pen' || tool === 'marker') {
        currentPointsRef.current = [point];
      } else if (tool === 'eraser') {
        const baseRadius = 10 / scaleRef.current;
        eraserPointsRef.current = [{ point, radius: baseRadius }];
        lastEraserTimeRef.current = performance.now();
        lastEraserPosRef.current = { x: point.x, y: point.y };
        eraserVelocityRef.current = 0;
      } else {
        startPointRef.current = point;
        currentPointRef.current = point;
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();

      // Panning (hand tool, space+drag, or middle-mouse)
      if (isPanningRef.current && panStartRef.current) {
        const dx = e.clientX - panStartRef.current.x;
        const dy = e.clientY - panStartRef.current.y;
        updateViewport(viewportRef.current.scale, {
          x: panOffsetStartRef.current.x + dx,
          y: panOffsetStartRef.current.y + dy,
        });
        return;
      }

      // Image drag/resize (hand tool)
      if (selectedImageRef.current && dragHandleRef.current && dragStartRef.current && dragOriginalRef.current) {
        const point = getPoint(e);
        const dx = point.x - dragStartRef.current.x;
        const dy = point.y - dragStartRef.current.y;
        const orig = dragOriginalRef.current;
        const handle = dragHandleRef.current;
        const aspectRatio = orig.width / orig.height;

        // On first actual movement, draw image on preview first, then remove from ink (avoids flash)
        if (!draggingImageIdRef.current && (Math.abs(dx) > 2 || Math.abs(dy) > 2)) {
          draggingImageIdRef.current = orig.id;
          setIsDragging(true);
          // Draw image on preview canvas first so there's no gap
          const previewCtx = getCtx(previewCanvasRef.current);
          if (previewCtx) {
            const { panX: px, panY: py, scale: ps } = getTransform();
            previewCtx.save();
            previewCtx.translate(px, py);
            previewCtx.scale(ps, ps);
            const cachedImg = getCachedImage(orig.assetId);
            if (cachedImg) {
              const opacity = orig.opacity ?? 1;
              if (opacity < 1) previewCtx.globalAlpha = opacity;
              previewCtx.drawImage(cachedImg, orig.x, orig.y, orig.width, orig.height);
              if (opacity < 1) previewCtx.globalAlpha = 1;
            }
            previewCtx.restore();
          }
          // Now remove from ink canvas
          const inkCtx = getCtx(inkCanvasRef.current);
          if (inkCtx) {
            const { w, h } = getViewportSize();
            const { panX, panY, scale: s } = getTransform();
            inkCtx.clearRect(0, 0, w, h);
            inkCtx.save();
            inkCtx.translate(panX, panY);
            inkCtx.scale(s, s);
            renderAllStrokes(inkCtx, strokesRef.current, () => {}, orig.id);
            inkCtx.restore();
          }
        }

        let newImg: ImageStroke;
        if (handle === 'move') {
          newImg = { ...orig, x: orig.x + dx, y: orig.y + dy };
        } else {
          let nx = orig.x, ny = orig.y, nw = orig.width, nh = orig.height;
          if (handle === 'se') { nw = orig.width + dx; nh = orig.height + dy; }
          else if (handle === 'sw') { nx = orig.x + dx; nw = orig.width - dx; nh = orig.height + dy; }
          else if (handle === 'ne') { ny = orig.y + dy; nw = orig.width + dx; nh = orig.height - dy; }
          else if (handle === 'nw') { nx = orig.x + dx; ny = orig.y + dy; nw = orig.width - dx; nh = orig.height - dy; }

          if (shiftHeldRef.current || lockProportionsRef.current) {
            if (handle === 'se' || handle === 'nw') {
              if (Math.abs(dx) > Math.abs(dy)) {
                nh = nw / aspectRatio;
                if (handle === 'nw') ny = orig.y + orig.height - nh;
              } else {
                nw = nh * aspectRatio;
                if (handle === 'nw') nx = orig.x + orig.width - nw;
              }
            } else if (handle === 'ne' || handle === 'sw') {
              if (Math.abs(dx) > Math.abs(dy)) {
                nh = nw / aspectRatio;
                if (handle === 'ne') ny = orig.y + orig.height - nh;
              } else {
                nw = nh * aspectRatio;
                if (handle === 'sw') nx = orig.x + orig.width - nw;
              }
            }
          }

          if (nw < 20) { nw = 20; nx = handle.includes('w') ? orig.x + orig.width - 20 : nx; }
          if (nh < 20) { nh = 20; ny = handle.includes('n') ? orig.y + orig.height - 20 : ny; }
          newImg = { ...orig, x: nx, y: ny, width: nw, height: nh };
        }

        selectedImageRef.current = newImg;

        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(() => {
          clearPreview();
          const ctx = getCtx(previewCanvasRef.current);
          if (!ctx) return;
          const { panX, panY, scale: s } = getTransform();
          ctx.save();
          ctx.translate(panX, panY);
          ctx.scale(s, s);
          const img = getCachedImage(newImg.assetId);
          if (img) {
            const opacity = newImg.opacity ?? 1;
            if (opacity < 1) ctx.globalAlpha = opacity;
            ctx.drawImage(img, newImg.x, newImg.y, newImg.width, newImg.height);
            if (opacity < 1) ctx.globalAlpha = 1;
          }
          ctx.restore();
          drawImageSelection(ctx, newImg);
        });
        return;
      }

      const tool = activeToolRef.current;

      // Select tool: draw selection rectangle
      if (tool === 'select' && startPointRef.current) {
        currentPointRef.current = getPoint(e);
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(() => {
          clearPreview();
          const ctx = getCtx(previewCanvasRef.current);
          const start = startPointRef.current;
          const end = currentPointRef.current;
          if (!ctx || !start || !end) return;
          const { panX, panY, scale: s } = getTransform();
          ctx.save();
          ctx.translate(panX, panY);
          ctx.scale(s, s);
          const rx = Math.min(start.x, end.x);
          const ry = Math.min(start.y, end.y);
          const rw = Math.abs(end.x - start.x);
          const rh = Math.abs(end.y - start.y);
          ctx.strokeStyle = '#3b82f6';
          ctx.lineWidth = 2 / s;
          ctx.setLineDash([6 / s, 3 / s]);
          ctx.strokeRect(rx, ry, rw, rh);
          ctx.fillStyle = 'rgba(59, 130, 246, 0.08)';
          ctx.fillRect(rx, ry, rw, rh);
          ctx.setLineDash([]);
          ctx.restore();
        });
        return;
      }

      const events = e.getCoalescedEvents?.() ?? [e];

      if (tool === 'pen' || tool === 'marker') {
        for (const ce of events) currentPointsRef.current.push(getPoint(ce));
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(() => {
          clearPreview();
          const ctx = getCtx(previewCanvasRef.current);
          if (ctx && currentPointsRef.current.length > 0) {
            const { panX, panY, scale: s } = getTransform();
            ctx.save();
            ctx.translate(panX, panY);
            ctx.scale(s, s);
            if (tool === 'marker') {
              drawMarkerPoints(ctx, currentPointsRef.current, strokeStyleRef.current.color, strokeStyleRef.current.baseWidth);
            } else {
              drawFreehandPoints(ctx, currentPointsRef.current, strokeStyleRef.current.color, strokeStyleRef.current.baseWidth);
            }
            ctx.restore();
          }
        });
      } else if (tool === 'eraser') {
        const point = getPoint(e);
        // Compute velocity-based eraser radius
        const now = performance.now();
        const baseRadius = 10 / scaleRef.current;
        const maxRadius = 60 / scaleRef.current;
        let currentRadius = baseRadius;
        if (lastEraserPosRef.current) {
          const dx = point.x - lastEraserPosRef.current.x;
          const dy = point.y - lastEraserPosRef.current.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          const dt = Math.max(1, now - lastEraserTimeRef.current);
          const velocity = dist / dt; // canvas-space px per ms
          // Smooth the velocity
          eraserVelocityRef.current = eraserVelocityRef.current * 0.6 + velocity * 0.4;
          // Map velocity to radius: ramp up between 0.15 and 1.5 px/ms
          const t = Math.min(1, Math.max(0, (eraserVelocityRef.current - 0.15) / 1.35));
          currentRadius = baseRadius + (maxRadius - baseRadius) * t * t;
        }
        lastEraserTimeRef.current = now;
        lastEraserPosRef.current = { x: point.x, y: point.y };
        eraserPointsRef.current.push({ point, radius: currentRadius });
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(() => {
          // Redraw ink with erased areas hidden
          const eraserPts = eraserPointsRef.current;
          const inkCtx = getCtx(inkCanvasRef.current);
          if (inkCtx) {
            const { w, h } = getViewportSize();
            inkCtx.clearRect(0, 0, w, h);
            const { panX, panY, scale: s } = getTransform();
            inkCtx.save();
            inkCtx.translate(panX, panY);
            inkCtx.scale(s, s);
            for (const stroke of strokesRef.current) {
              const result = computeEraseResult(stroke, eraserPts);
              if (result === null) {
                renderStroke(inkCtx, stroke);
              } else {
                for (const fragment of result.remaining) {
                  renderStroke(inkCtx, fragment);
                }
              }
            }
            inkCtx.restore();
          }
          // Draw eraser cursor on preview — size reflects current velocity-based radius
          clearPreview();
          const ctx = getCtx(previewCanvasRef.current);
          if (ctx) {
            const { panX, panY, scale: s } = getTransform();
            const screenX = point.x * s + panX;
            const screenY = point.y * s + panY;
            const screenRadius = currentRadius * s;
            ctx.beginPath();
            ctx.arc(screenX, screenY, screenRadius, 0, Math.PI * 2);
            ctx.strokeStyle = '#999';
            ctx.lineWidth = 1;
            ctx.stroke();
          }
        });
      } else {
        currentPointRef.current = getPoint(e);
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(() => {
          clearPreview();
          const ctx = getCtx(previewCanvasRef.current);
          const start = startPointRef.current;
          let end = currentPointRef.current;
          if (!ctx || !start || !end) return;

          if (shiftHeldRef.current) {
            if (tool === 'line') end = snapLineEnd(start, end);
            else if (tool === 'rect' || tool === 'triangle') end = snapRectEnd(start, end);
            else if (tool === 'ellipse') end = snapEllipseEnd(start, end);
          }

          const { panX, panY, scale: s } = getTransform();
          ctx.save();
          ctx.translate(panX, panY);
          ctx.scale(s, s);
          if (tool === 'line') drawLinePreview(ctx, start, end, strokeStyleRef.current);
          else if (tool === 'rect') drawRectPreview(ctx, start, end, strokeStyleRef.current);
          else if (tool === 'triangle') drawTrianglePreview(ctx, start, end, strokeStyleRef.current);
          else if (tool === 'ellipse') drawEllipsePreview(ctx, start, end, strokeStyleRef.current);
          else if (tool === 'axes') drawAxesPreview(ctx, start, end, strokeStyleRef.current);
          ctx.restore();
        });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      isDrawingRef.current = false;
      cancelAnimationFrame(rafIdRef.current);

      // End panning
      if (isPanningRef.current) {
        isPanningRef.current = false;
        panStartRef.current = null;
        flushViewportCommit();
        return;
      }

      // Commit image drag/resize
      if (dragHandleRef.current && selectedImageRef.current && dragOriginalRef.current) {
        const newImg = selectedImageRef.current;
        const origImg = dragOriginalRef.current;
        const wasDragging = !!draggingImageIdRef.current;
        if (newImg.x !== origImg.x || newImg.y !== origImg.y ||
            newImg.width !== origImg.width || newImg.height !== origImg.height) {
          if (onImageTransformRef.current) {
            onImageTransformRef.current(origImg.id, newImg);
          }
        }
        dragHandleRef.current = null;
        dragStartRef.current = null;
        dragOriginalRef.current = null;
        draggingImageIdRef.current = null;
        setSelectedImage(newImg);
        setIsDragging(false);

        if (wasDragging) {
          const inkCtx = getCtx(inkCanvasRef.current);
          if (inkCtx) {
            const { w, h } = getViewportSize();
            const { panX, panY, scale: s } = getTransform();
            inkCtx.clearRect(0, 0, w, h);
            inkCtx.save();
            inkCtx.translate(panX, panY);
            inkCtx.scale(s, s);
            for (const st of strokesRef.current) {
              if (st.id === newImg.id) {
                renderStroke(inkCtx, newImg, () => {});
              } else {
                renderStroke(inkCtx, st, () => {});
              }
            }
            inkCtx.restore();
          }
        }

        clearPreview();
        const ctx = getCtx(previewCanvasRef.current);
        if (ctx) drawImageSelection(ctx, newImg);
        return;
      }

      const tool = activeToolRef.current;
      const style = strokeStyleRef.current;

      // Select tool: complete selection
      if (tool === 'select' && startPointRef.current) {
        const end = getPoint(e);
        const start = startPointRef.current;
        const rx = Math.min(start.x, end.x);
        const ry = Math.min(start.y, end.y);
        const rw = Math.abs(end.x - start.x);
        const rh = Math.abs(end.y - start.y);
        startPointRef.current = null;
        currentPointRef.current = null;

        if (rw > 5 && rh > 5) {
          const rect = { minX: rx, minY: ry, maxX: rx + rw, maxY: ry + rh };
          const selected = strokesRef.current.filter(s => strokeIntersectsRect(s, rect));
          if (selected.length > 0 && onSelectionCompleteRef.current) {
            onSelectionCompleteRef.current(selected, { x: rx, y: ry, width: rw, height: rh });
            // Keep selection rectangle visible (don't clear preview)
          } else {
            clearPreview();
          }
        } else {
          clearPreview();
        }
        return;
      }

      if (tool === 'eraser') {
        // Commit partial erase: compute splits for all affected strokes
        const eraserPts = eraserPointsRef.current;
        if (eraserPts.length > 0 && onEraseCommitRef.current) {
          const results: { strokeId: string; remaining: Stroke[] }[] = [];
          for (const stroke of strokesRef.current) {
            const result = computeEraseResult(stroke, eraserPts);
            if (result) {
              results.push({ strokeId: stroke.id, remaining: result.remaining });
            }
          }
          if (results.length > 0) {
            onEraseCommitRef.current(results);
          }
        }
        eraserPointsRef.current = [];
        clearPreview();
        redrawInk();
        return;
      }

      if ((tool === 'pen' || tool === 'marker') && currentPointsRef.current.length > 0) {
        const strokeType = tool === 'marker' ? 'marker' : 'freehand';
        const stroke: FreehandStroke | MarkerStroke = { type: strokeType, id: uuidv4(), points: [...currentPointsRef.current], style: { ...style } };
        onStrokeCompleteRef.current(stroke);
        drawCommittedStrokeToInk(stroke);
        currentPointsRef.current = [];
        clearPreview();
      } else if (tool === 'line' || tool === 'rect' || tool === 'triangle' || tool === 'ellipse' || tool === 'axes') {
        const start = startPointRef.current;
        let end = getPoint(e);
        if (start) {
          if (shiftHeldRef.current) {
            if (tool === 'line') end = snapLineEnd(start, end);
            else if (tool === 'rect' || tool === 'triangle') end = snapRectEnd(start, end);
            else if (tool === 'ellipse') end = snapEllipseEnd(start, end);
          }

          const pointGroups = shapeToPointGroups(tool, start, end, style.baseWidth);
          if (pointGroups) {
            // Converted to freehand strokes (line, rect, triangle, ellipse)
            for (const pts of pointGroups) {
              if (pts.length < 2) continue;
              const stroke: FreehandStroke = { type: 'freehand', id: uuidv4(), points: pts, style: { ...style }, geometric: true };
              onStrokeCompleteRef.current(stroke);
              drawCommittedStrokeToInk(stroke);
            }
          } else {
            // Stays as shape type (axes)
            const stroke: Stroke = { type: 'axes', id: uuidv4(), start, end, style: { ...style } };
            onStrokeCompleteRef.current(stroke);
            drawCommittedStrokeToInk(stroke);
          }
        }
        startPointRef.current = null;
        currentPointRef.current = null;
        clearPreview();
      }
    };

    const onContextMenu = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [getPoint, getCtx, getViewportSize, getTransform, clearPreview, drawCommittedStrokeToInk, findStrokeAtPoint, findImageAtPoint, drawImageSelection, redrawBackground, redrawInk, updateViewport, flushViewportCommit]);


  const eraserCursorSvg = `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='22' height='22'%3E%3Ccircle cx='11' cy='11' r='9.5' fill='none' stroke='black' stroke-width='2'/%3E%3Ccircle cx='11' cy='11' r='9.5' fill='none' stroke='white' stroke-width='1'/%3E%3C/svg%3E") 11 11, auto`;
  const cursorClass = activeTool === 'hand' ? 'cursor-grab' : activeTool === 'select' && pastePreview ? 'cursor-copy' : activeTool === 'eraser' ? '' : 'cursor-crosshair';
  const cursorStyle = activeTool === 'eraser' ? { cursor: eraserCursorSvg } : undefined;

  return (
    <div className="fixed inset-0 overflow-hidden">
      <canvas ref={bgCanvasRef} className={`absolute inset-0 touch-none ${cursorClass}`} style={cursorStyle} />
      <canvas ref={inkCanvasRef} className={`absolute inset-0 touch-none ${cursorClass}`} style={cursorStyle} />
      <canvas ref={previewCanvasRef} className={`absolute inset-0 touch-none ${cursorClass}`} style={cursorStyle} />

      {/* Image selection controls — hidden while dragging */}
      {selectedImage && selPos && activeTool === 'hand' && !isDragging && (
        <div
          className="fixed z-50 bg-neutral-900/90 backdrop-blur-md rounded-lg px-2 py-1.5 flex items-center gap-2 shadow-xl border border-neutral-700/50 animate-slide-up"
          style={{ left: selPos.x, top: selPos.y }}
          onPointerDown={e => e.stopPropagation()}
        >
          {/* Lock proportions */}
          <button
            className={`w-7 h-7 rounded flex items-center justify-center text-xs cursor-pointer transition-colors border-none
              ${lockProportions ? 'bg-blue-500/30 text-blue-400' : 'bg-transparent text-neutral-400 hover:bg-white/10'}`}
            onClick={() => setLockProportions(!lockProportions)}
            title={lockProportions ? 'Unlock proportions' : 'Lock proportions'}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {lockProportions ? (
                <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" /></>
              ) : (
                <><rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 9.9-1" /></>
              )}
            </svg>
          </button>

          {/* Opacity slider */}
          <div className="flex items-center gap-1.5">
            <span className="text-neutral-500 text-[10px]">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" opacity="0.6">
                <circle cx="12" cy="12" r="10" />
                <path d="M12 2a10 10 0 0 1 0 20" fill="currentColor" opacity="0.3" />
              </svg>
            </span>
            <input
              type="range"
              min="5"
              max="100"
              value={Math.round((selectedImage.opacity ?? 1) * 100)}
              onChange={e => handleOpacityChange(Number(e.target.value) / 100)}
              className="w-16 h-1 accent-blue-500"
              title={`Opacity: ${Math.round((selectedImage.opacity ?? 1) * 100)}%`}
            />
            <span className="text-neutral-400 text-[10px] tabular-nums w-7">
              {Math.round((selectedImage.opacity ?? 1) * 100)}%
            </span>
          </div>

          {/* Delete image */}
          <button
            className="w-7 h-7 rounded flex items-center justify-center text-xs cursor-pointer transition-colors border-none text-red-400 hover:bg-red-500/20"
            onClick={handleDeleteImage}
            title="Delete image"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />
            </svg>
          </button>
        </div>
      )}
    </div>
  );
}
