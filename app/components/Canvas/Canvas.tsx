'use client';

import { useRef, useEffect, useCallback } from 'react';
import { Point, Stroke, FreehandStroke, StrokeStyle, ToolType, BackgroundPattern } from '@/app/types';
import { drawFreehandPoints } from '@/app/utils/drawStroke';
import { renderStroke } from '@/app/utils/renderStroke';
import { drawLinePreview, drawRectPreview, drawEllipsePreview } from '@/app/utils/drawShape';
import { drawBackground } from '@/app/utils/drawGrid';
import { snapLineEnd, snapRectEnd, snapEllipseEnd } from '@/app/utils/snapShape';
import { v4 as uuidv4 } from 'uuid';

interface CanvasProps {
  strokes: Stroke[];
  activeTool: ToolType;
  strokeStyle: StrokeStyle;
  backgroundColor: string;
  backgroundPattern: BackgroundPattern;
  onStrokeComplete: (stroke: Stroke) => void;
  onStrokeDelete?: (strokeId: string) => void;
}

export default function Canvas({
  strokes,
  activeTool,
  strokeStyle,
  backgroundColor,
  backgroundPattern,
  onStrokeComplete,
  onStrokeDelete,
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

  const activeToolRef = useRef(activeTool);
  const strokeStyleRef = useRef(strokeStyle);
  const strokesRef = useRef(strokes);
  const bgPatternRef = useRef(backgroundPattern);
  const bgColorRef = useRef(backgroundColor);
  const onStrokeCompleteRef = useRef(onStrokeComplete);
  const onStrokeDeleteRef = useRef(onStrokeDelete);

  activeToolRef.current = activeTool;
  strokeStyleRef.current = strokeStyle;
  strokesRef.current = strokes;
  bgPatternRef.current = backgroundPattern;
  bgColorRef.current = backgroundColor;
  onStrokeCompleteRef.current = onStrokeComplete;
  onStrokeDeleteRef.current = onStrokeDelete;

  const getCtx = useCallback((canvas: HTMLCanvasElement | null): CanvasRenderingContext2D | null => {
    return canvas?.getContext('2d') ?? null;
  }, []);

  const getViewportSize = useCallback(() => {
    return { w: window.innerWidth, h: window.innerHeight };
  }, []);

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
    drawBackground(ctx, w, h, bgPatternRef.current, bgColorRef.current);
  }, [getCtx, getViewportSize]);

  const redrawInk = useCallback(() => {
    const ctx = getCtx(inkCanvasRef.current);
    if (!ctx) return;
    const { w, h } = getViewportSize();
    ctx.clearRect(0, 0, w, h);
    const triggerRedraw = () => redrawInk();
    for (const stroke of strokesRef.current) {
      renderStroke(ctx, stroke, triggerRedraw);
    }
  }, [getCtx, getViewportSize]);

  const clearPreview = useCallback(() => {
    const ctx = getCtx(previewCanvasRef.current);
    if (!ctx) return;
    const { w, h } = getViewportSize();
    ctx.clearRect(0, 0, w, h);
  }, [getCtx, getViewportSize]);

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

  // Track shift key
  useEffect(() => {
    const down = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = true; };
    const up = (e: KeyboardEvent) => { if (e.key === 'Shift') shiftHeldRef.current = false; };
    window.addEventListener('keydown', down);
    window.addEventListener('keyup', up);
    return () => { window.removeEventListener('keydown', down); window.removeEventListener('keyup', up); };
  }, []);

  const getPoint = useCallback((e: PointerEvent): Point => {
    const canvas = previewCanvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const pressure = e.pointerType === 'mouse' ? 0.5 : (e.pressure || 0.5);
    return { x: e.clientX - rect.left, y: e.clientY - rect.top, pressure };
  }, []);

  const findStrokeAtPoint = useCallback((p: Point): string | null => {
    const eraserRadius = 10;
    for (let i = strokesRef.current.length - 1; i >= 0; i--) {
      const stroke = strokesRef.current[i];
      if (stroke.type === 'freehand') {
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
      } else if (stroke.type === 'ellipse') {
        const s = stroke;
        const dx = (p.x - s.center.x) / s.radiusX;
        const dy = (p.y - s.center.y) / s.radiusY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (Math.abs(d - 1) < eraserRadius / Math.min(s.radiusX, s.radiusY)) return stroke.id;
      }
    }
    return null;
  }, []);

  // Pointer events
  useEffect(() => {
    const canvas = previewCanvasRef.current;
    if (!canvas) return;

    const onPointerDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture(e.pointerId);
      isDrawingRef.current = true;
      const point = getPoint(e);
      const tool = activeToolRef.current;

      if (tool === 'pen') {
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
      const tool = activeToolRef.current;
      const events = e.getCoalescedEvents?.() ?? [e];

      if (tool === 'pen') {
        for (const ce of events) currentPointsRef.current.push(getPoint(ce));
        cancelAnimationFrame(rafIdRef.current);
        rafIdRef.current = requestAnimationFrame(() => {
          clearPreview();
          const ctx = getCtx(previewCanvasRef.current);
          if (ctx && currentPointsRef.current.length > 0) {
            drawFreehandPoints(ctx, currentPointsRef.current, strokeStyleRef.current.color, strokeStyleRef.current.baseWidth);
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
            ctx.beginPath();
            ctx.arc(point.x, point.y, 10, 0, Math.PI * 2);
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

          // Apply snapping when Shift is held
          if (shiftHeldRef.current) {
            if (tool === 'line') end = snapLineEnd(start, end);
            else if (tool === 'rect') end = snapRectEnd(start, end);
            else if (tool === 'ellipse') end = snapEllipseEnd(start, end);
          }

          if (tool === 'line') drawLinePreview(ctx, start, end, strokeStyleRef.current);
          else if (tool === 'rect') drawRectPreview(ctx, start, end, strokeStyleRef.current);
          else if (tool === 'ellipse') drawEllipsePreview(ctx, start, end, strokeStyleRef.current);
        });
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isDrawingRef.current) return;
      e.preventDefault();
      isDrawingRef.current = false;
      const tool = activeToolRef.current;
      const style = strokeStyleRef.current;

      if (tool === 'pen' && currentPointsRef.current.length > 0) {
        const stroke: FreehandStroke = { type: 'freehand', id: uuidv4(), points: [...currentPointsRef.current], style: { ...style } };
        onStrokeCompleteRef.current(stroke);
        currentPointsRef.current = [];
        clearPreview();
      } else if (tool === 'line' || tool === 'rect' || tool === 'ellipse') {
        const start = startPointRef.current;
        let end = getPoint(e);
        if (start) {
          // Apply snapping
          if (shiftHeldRef.current) {
            if (tool === 'line') end = snapLineEnd(start, end);
            else if (tool === 'rect') end = snapRectEnd(start, end);
            else if (tool === 'ellipse') end = snapEllipseEnd(start, end);
          }

          let stroke: Stroke;
          if (tool === 'line') {
            stroke = { type: 'line', id: uuidv4(), start, end, style: { ...style } };
          } else if (tool === 'rect') {
            stroke = { type: 'rect', id: uuidv4(), start, end, style: { ...style } };
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

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointerleave', onPointerUp);

    return () => {
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointerleave', onPointerUp);
      cancelAnimationFrame(rafIdRef.current);
    };
  }, [getPoint, getCtx, clearPreview, findStrokeAtPoint]);

  return (
    <div className="fixed inset-0 overflow-hidden">
      <canvas ref={bgCanvasRef} className="absolute inset-0 touch-none cursor-crosshair" />
      <canvas ref={inkCanvasRef} className="absolute inset-0 touch-none cursor-crosshair" />
      <canvas ref={previewCanvasRef} className="absolute inset-0 touch-none cursor-crosshair" />
    </div>
  );
}

// Utility: distance from point to line segment
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
