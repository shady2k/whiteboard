'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Point, Stroke, FreehandStroke, MarkerStroke, ImageStroke, StrokeStyle, ToolType, BackgroundPattern } from '@/app/types';
import { drawFreehandPoints, drawMarkerPoints } from '@/app/utils/drawStroke';
import { renderStroke, renderAllStrokes } from '@/app/utils/renderStroke';
import { drawLinePreview, drawRectPreview, drawEllipsePreview, drawTrianglePreview } from '@/app/utils/drawShape';
import { drawBackground } from '@/app/utils/drawGrid';
import { snapLineEnd, snapRectEnd, snapEllipseEnd } from '@/app/utils/snapShape';
import { getCachedImage } from '@/app/utils/imageCache';
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
  onImageTransform?: (strokeId: string, newStroke: ImageStroke) => void;
  onToolChange?: (tool: ToolType) => void;
  onZoomChange?: (zoom: number) => void;
  onPanChange?: (offset: { x: number; y: number }) => void;
}

type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

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
  onImageTransform,
  onToolChange,
  onZoomChange,
  onPanChange,
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

  // Image drag state
  const selectedImageRef = useRef<ImageStroke | null>(null);
  const dragHandleRef = useRef<DragHandle | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragOriginalRef = useRef<ImageStroke | null>(null);
  const draggingImageIdRef = useRef<string | null>(null);

  // Image selection UI state
  const [selectedImage, setSelectedImage] = useState<ImageStroke | null>(null);
  const [lockProportions, setLockProportions] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  const activeToolRef = useRef(activeTool);
  const strokeStyleRef = useRef(strokeStyle);
  const strokesRef = useRef(strokes);
  const bgPatternRef = useRef(backgroundPattern);
  const bgColorRef = useRef(backgroundColor);
  const scaleRef = useRef(scale);
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  const onStrokeDeleteRef = useRef(onStrokeDelete);
  const onImageTransformRef = useRef(onImageTransform);
  const onToolChangeRef = useRef(onToolChange);
  const onZoomChangeRef = useRef(onZoomChange);
  const onPanChangeRef = useRef(onPanChange);
  const panOffsetRef = useRef(panOffset);

  useEffect(() => { activeToolRef.current = activeTool; }, [activeTool]);
  useEffect(() => { strokeStyleRef.current = strokeStyle; }, [strokeStyle]);
  useEffect(() => { strokesRef.current = strokes; }, [strokes]);
  useEffect(() => { bgPatternRef.current = backgroundPattern; }, [backgroundPattern]);
  useEffect(() => { bgColorRef.current = backgroundColor; }, [backgroundColor]);
  useEffect(() => { scaleRef.current = scale; }, [scale]);
  useEffect(() => { onStrokeCompleteRef.current = onStrokeComplete; }, [onStrokeComplete]);
  useEffect(() => { onStrokeDeleteRef.current = onStrokeDelete; }, [onStrokeDelete]);
  useEffect(() => { onImageTransformRef.current = onImageTransform; }, [onImageTransform]);
  useEffect(() => { onToolChangeRef.current = onToolChange; }, [onToolChange]);
  useEffect(() => { onZoomChangeRef.current = onZoomChange; }, [onZoomChange]);
  useEffect(() => { onPanChangeRef.current = onPanChange; }, [onPanChange]);
  useEffect(() => { panOffsetRef.current = panOffset; }, [panOffset]);

  const getCtx = useCallback((canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null => {
    return canvas?.getContext('2d') ?? null;
  }, []);

  const getViewportSize = useCallback(() => {
    return { w: window.innerWidth, h: window.innerHeight };
  }, []);

  // Compute pan offset for center-based zoom + user pan
  const getTransform = useCallback(() => {
    const { w, h } = getViewportSize();
    const s = scaleRef.current;
    const panX = (w / 2) * (1 - s) + panOffsetRef.current.x;
    const panY = (h / 2) * (1 - s) + panOffsetRef.current.y;
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
    // Draw background large enough to cover visible area
    const visW = w / s + Math.abs(panX) / s * 2;
    const visH = h / s + Math.abs(panY) / s * 2;
    const offsetX = panX < 0 ? -panX / s : 0;
    const offsetY = panY < 0 ? -panY / s : 0;
    ctx.translate(-offsetX, -offsetY);
    drawBackground(ctx, visW, visH, bgPatternRef.current, bgColorRef.current);
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

  // Draw selection handles for selected image
  const drawImageSelection = useCallback((ctx: CanvasRenderingContext2D, img: ImageStroke) => {
    const { panX, panY, scale: s } = getTransform();
    ctx.save();
    ctx.translate(panX, panY);
    ctx.scale(s, s);

    const { x, y, width, height } = img;
    // Selection border
    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 2 / s;
    ctx.setLineDash([6 / s, 3 / s]);
    ctx.strokeRect(x, y, width, height);
    ctx.setLineDash([]);

    // Resize handles
    const handleSize = 8 / s;
    ctx.fillStyle = '#3b82f6';
    const handles = [
      { hx: x, hy: y },
      { hx: x + width, hy: y },
      { hx: x, hy: y + height },
      { hx: x + width, hy: y + height },
    ];
    for (const h of handles) {
      ctx.fillRect(h.hx - handleSize / 2, h.hy - handleSize / 2, handleSize, handleSize);
    }

    // Opacity indicator
    const opacity = img.opacity ?? 1;
    if (opacity < 1) {
      ctx.fillStyle = '#fff';
      ctx.font = `${12 / s}px sans-serif`;
      ctx.fillText(`${Math.round(opacity * 100)}%`, x, y - 6 / s);
    }

    ctx.restore();
  }, [getTransform]);

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
    return () => window.removeEventListener('resize', handleResize);
  }, [resizeCanvases, redrawBackground, redrawInk]);

  useEffect(() => { redrawInk(); }, [strokes, redrawInk]);
  useEffect(() => { redrawBackground(); }, [backgroundColor, backgroundPattern, redrawBackground]);
  useEffect(() => { redrawBackground(); redrawInk(); }, [scale, redrawBackground, redrawInk]);
  useEffect(() => { redrawBackground(); redrawInk(); }, [panOffset, redrawBackground, redrawInk]);

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
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        const delta = -e.deltaY * 0.01;
        const newZoom = Math.max(0.25, Math.min(4, scaleRef.current + delta));
        if (onZoomChangeRef.current) onZoomChangeRef.current(newZoom);
      } else {
        e.preventDefault();
        const cur = panOffsetRef.current;
        if (onPanChangeRef.current) {
          onPanChangeRef.current({ x: cur.x - e.deltaX, y: cur.y - e.deltaY });
        }
      }
    };
    document.addEventListener('wheel', handleWheel, { passive: false });
    return () => document.removeEventListener('wheel', handleWheel);
  }, []);

  // Delete selected image with Delete/Backspace key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedImageRef.current) {
        e.preventDefault();
        if (onStrokeDeleteRef.current) {
          onStrokeDeleteRef.current(selectedImageRef.current.id);
        }
        selectedImageRef.current = null;
        queueMicrotask(() => setSelectedImage(null));
        clearPreview();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [clearPreview]);

  // Deselect image when tool changes away from hand
  useEffect(() => {
    if (activeTool !== 'hand') {
      selectedImageRef.current = null;
      queueMicrotask(() => setSelectedImage(null));
      clearPreview();
    }
  }, [activeTool, clearPreview]);

  // Clear selection when selected image is removed from strokes (e.g. undo)
  useEffect(() => {
    if (selectedImage && !strokes.find(s => s.id === selectedImage.id)) {
      selectedImageRef.current = null;
      queueMicrotask(() => setSelectedImage(null));
      clearPreview();
    }
  }, [strokes, selectedImage, clearPreview]);

  const getPoint = useCallback((e: PointerEvent): Point => {
    const canvas = previewCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const { panX, panY, scale: s } = getTransform();
    const screenX = e.clientX - rect.left;
    const screenY = e.clientY - rect.top;
    const pressure = e.pointerType === 'mouse' ? 0.5 : (e.pressure || 0.5);
    return { x: (screenX - panX) / s, y: (screenY - panY) / s, pressure };
  }, [getTransform]);

  // Find image stroke at point and which handle (if any)
  const findImageAtPoint = useCallback((p: Point): { stroke: ImageStroke; handle: DragHandle } | null => {
    const s = scaleRef.current;
    const handleSize = 12 / s;
    for (let i = strokesRef.current.length - 1; i >= 0; i--) {
      const stroke = strokesRef.current[i];
      if (stroke.type !== 'image') continue;
      const { x, y, width, height } = stroke;

      const corners: { hx: number; hy: number; handle: DragHandle }[] = [
        { hx: x, hy: y, handle: 'nw' },
        { hx: x + width, hy: y, handle: 'ne' },
        { hx: x, hy: y + height, handle: 'sw' },
        { hx: x + width, hy: y + height, handle: 'se' },
      ];
      for (const c of corners) {
        if (Math.abs(p.x - c.hx) < handleSize && Math.abs(p.y - c.hy) < handleSize) {
          return { stroke, handle: c.handle };
        }
      }

      if (p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + height) {
        return { stroke, handle: 'move' };
      }
    }
    return null;
  }, []);

  const findStrokeAtPoint = useCallback((p: Point): string | null => {
    const eraserRadius = 10 / scaleRef.current;
    for (let i = strokesRef.current.length - 1; i >= 0; i--) {
      const stroke = strokesRef.current[i];
      if (stroke.type === 'freehand' || stroke.type === 'marker') {
        for (const sp of stroke.points) {
          const dx = sp.x - p.x;
          const dy = sp.y - p.y;
          if (dx * dx + dy * dy < eraserRadius * eraserRadius) return stroke.id;
        }
      } else if (stroke.type === 'line') {
        if (distPointToSegment(p, stroke.start, stroke.end) < eraserRadius) return stroke.id;
      } else if (stroke.type === 'rect') {
        const s = stroke;
        const corners = [s.start, { ...s.start, x: s.end.x }, s.end, { ...s.end, x: s.start.x }] as Point[];
        for (let j = 0; j < 4; j++) {
          if (distPointToSegment(p, corners[j], corners[(j + 1) % 4]) < eraserRadius) return stroke.id;
        }
      } else if (stroke.type === 'triangle') {
        const s = stroke;
        const x = Math.min(s.start.x, s.end.x);
        const y = Math.min(s.start.y, s.end.y);
        const w = Math.abs(s.end.x - s.start.x);
        const h = Math.abs(s.end.y - s.start.y);
        const tri = [
          { x: x + w / 2, y, pressure: 0 },
          { x: x + w, y: y + h, pressure: 0 },
          { x, y: y + h, pressure: 0 },
        ] as Point[];
        for (let j = 0; j < 3; j++) {
          if (distPointToSegment(p, tri[j], tri[(j + 1) % 3]) < eraserRadius) return stroke.id;
        }
      } else if (stroke.type === 'ellipse') {
        const s = stroke;
        const dx = (p.x - s.center.x) / s.radiusX;
        const dy = (p.y - s.center.y) / s.radiusY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(d - 1) < eraserRadius / Math.min(s.radiusX, s.radiusY)) return stroke.id;
      } else if (stroke.type === 'image') {
        const { x, y, width, height } = stroke;
        if (p.x >= x && p.x <= x + width && p.y >= y && p.y <= y + height) return stroke.id;
      }
    }
    return null;
  }, []);

  // Lock proportions ref for use in pointer handler
  const lockProportionsRef = useRef(lockProportions);
  useEffect(() => { lockProportionsRef.current = lockProportions; }, [lockProportions]);

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
        const strokeId = findStrokeAtPoint(point);
        if (strokeId && onStrokeDeleteRef.current) onStrokeDeleteRef.current(strokeId);
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
        if (onPanChangeRef.current) {
          onPanChangeRef.current({
            x: panOffsetStartRef.current.x + dx,
            y: panOffsetStartRef.current.y + dy,
          });
        }
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
        const strokeId = findStrokeAtPoint(point);
        if (strokeId && onStrokeDeleteRef.current) onStrokeDeleteRef.current(strokeId);
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(() => {
          clearPreview();
          const ctx = getCtx(previewCanvasRef.current);
          if (ctx) {
            const { panX, panY, scale: s } = getTransform();
            const screenX = point.x * s + panX;
            const screenY = point.y * s + panY;
            ctx.beginPath();
            ctx.arc(screenX, screenY, 10, 0, Math.PI * 2);
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

      if (tool === 'eraser') {
        clearPreview();
        return;
      }

      if ((tool === 'pen' || tool === 'marker') && currentPointsRef.current.length > 0) {
        const strokeType = tool === 'marker' ? 'marker' : 'freehand';
        const stroke: FreehandStroke | MarkerStroke = { type: strokeType, id: uuidv4(), points: [...currentPointsRef.current], style: { ...style } };
        onStrokeCompleteRef.current(stroke);
        currentPointsRef.current = [];
        clearPreview();
      } else if (tool === 'line' || tool === 'rect' || tool === 'triangle' || tool === 'ellipse') {
        const start = startPointRef.current;
        let end = getPoint(e);
        if (start) {
          if (shiftHeldRef.current) {
            if (tool === 'line') end = snapLineEnd(start, end);
            else if (tool === 'rect' || tool === 'triangle') end = snapRectEnd(start, end);
            else if (tool === 'ellipse') end = snapEllipseEnd(start, end);
          }

          let stroke: Stroke;
          if (tool === 'line') {
            stroke = { type: 'line', id: uuidv4(), start, end, style: { ...style } };
          } else if (tool === 'rect') {
            stroke = { type: 'rect', id: uuidv4(), start, end, style: { ...style } };
          } else if (tool === 'triangle') {
            stroke = { type: 'triangle', id: uuidv4(), start, end, style: { ...style } };
          } else {
            const cx = (start.x + end.x) / 2, cy = (start.y + end.y) / 2;
            stroke = { type: 'ellipse', id: uuidv4(), center: { x: cx, y: cy, pressure: start.pressure }, radiusX: Math.abs(end.x - start.x) / 2, radiusY: Math.abs(end.y - start.y) / 2, style: { ...style } };
          }
          onStrokeCompleteRef.current(stroke);
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
  }, [getPoint, getCtx, getViewportSize, getTransform, clearPreview, findStrokeAtPoint, findImageAtPoint, drawImageSelection, redrawBackground, redrawInk]);


  // Handle opacity change for selected image
  const handleOpacityChange = useCallback((opacity: number) => {
    if (!selectedImage) return;
    const updated = { ...selectedImage, opacity };
    selectedImageRef.current = updated;
    setSelectedImage(updated);
    if (onImageTransformRef.current) {
      onImageTransformRef.current(selectedImage.id, updated);
    }
    clearPreview();
    const ctx = getCtx(previewCanvasRef.current);
    if (ctx) drawImageSelection(ctx, updated);
  }, [selectedImage, clearPreview, getCtx, drawImageSelection]);

  // Handle delete selected image
  const handleDeleteImage = useCallback(() => {
    if (!selectedImage) return;
    if (onStrokeDeleteRef.current) {
      onStrokeDeleteRef.current(selectedImage.id);
    }
    selectedImageRef.current = null;
    setSelectedImage(null);
    clearPreview();
  }, [selectedImage, clearPreview]);

  // Compute screen position for floating controls using props directly (not refs)
  const selPos = useMemo(() => {
    if (!selectedImage) return null;
    const w = typeof window !== 'undefined' ? window.innerWidth : 0;
    const h = typeof window !== 'undefined' ? window.innerHeight : 0;
    const panX = (w / 2) * (1 - scale) + panOffset.x;
    const panY = (h / 2) * (1 - scale) + panOffset.y;
    const screenX = selectedImage.x * scale + panX;
    const screenY = (selectedImage.y + selectedImage.height) * scale + panY + 8;
    return { x: screenX, y: screenY };
  }, [selectedImage, scale, panOffset]);

  const cursorClass = activeTool === 'hand' ? 'cursor-grab' : 'cursor-crosshair';

  return (
    <div className="fixed inset-0 overflow-hidden">
      <canvas ref={bgCanvasRef} className={`absolute inset-0 touch-none ${cursorClass}`} />
      <canvas ref={inkCanvasRef} className={`absolute inset-0 touch-none ${cursorClass}`} />
      <canvas ref={previewCanvasRef} className={`absolute inset-0 touch-none ${cursorClass}`} />

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

function distPointToSegment(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return Math.sqrt((p.x - a.x) ** 2 + (p.y - a.y) ** 2);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = a.x + t * dx;
  const projY = a.y + t * dy;
  return Math.sqrt((p.x - projX) ** 2 + (p.y - projY) ** 2);
}
