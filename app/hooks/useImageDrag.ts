'use client';

import { useRef, useEffect, useCallback, useState, useMemo } from 'react';
import { Point, Stroke, ImageStroke, ToolType } from '@/app/types';

export type DragHandle = 'move' | 'nw' | 'ne' | 'sw' | 'se';

interface UseImageDragOptions {
  getTransform: () => { panX: number; panY: number; scale: number };
  scaleRef: React.RefObject<number>;
  strokesRef: React.RefObject<Stroke[]>;
  strokes: Stroke[];
  scale: number;
  panOffset: { x: number; y: number };
  activeTool: ToolType;
  onStrokeDeleteRef: React.RefObject<((strokeId: string) => void) | undefined>;
  onImageTransformRef: React.RefObject<((strokeId: string, newStroke: ImageStroke) => void) | undefined>;
  clearPreview: () => void;
  getCtx: (canvas: HTMLCanvasElement | null) => CanvasRenderingContext2D | null;
  previewCanvasRef: React.RefObject<HTMLCanvasElement | null>;
}

export function useImageDrag({
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
}: UseImageDragOptions) {
  // Image drag refs
  const selectedImageRef = useRef<ImageStroke | null>(null);
  const dragHandleRef = useRef<DragHandle | null>(null);
  const dragStartRef = useRef<{ x: number; y: number } | null>(null);
  const dragOriginalRef = useRef<ImageStroke | null>(null);
  const draggingImageIdRef = useRef<string | null>(null);

  // Image selection UI state
  const [selectedImage, setSelectedImage] = useState<ImageStroke | null>(null);
  const [lockProportions, setLockProportions] = useState(true);
  const [isDragging, setIsDragging] = useState(false);

  // Lock proportions ref for use in pointer handler
  const lockProportionsRef = useRef(lockProportions);
  useEffect(() => { lockProportionsRef.current = lockProportions; }, [lockProportions]);

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
  }, [scaleRef, strokesRef]);

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
  }, [selectedImage, clearPreview, getCtx, previewCanvasRef, drawImageSelection, onImageTransformRef]);

  // Handle delete selected image
  const handleDeleteImage = useCallback(() => {
    if (!selectedImage) return;
    if (onStrokeDeleteRef.current) {
      onStrokeDeleteRef.current(selectedImage.id);
    }
    selectedImageRef.current = null;
    setSelectedImage(null);
    clearPreview();
  }, [selectedImage, clearPreview, onStrokeDeleteRef]);

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
  }, [clearPreview, onStrokeDeleteRef]);

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

  return {
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
  };
}
