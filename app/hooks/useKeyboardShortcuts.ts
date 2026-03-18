'use client';

import { useEffect, useRef } from 'react';
import type { ToolType, Stroke } from '@/app/types';

interface UseKeyboardShortcutsOptions {
  undo: () => void;
  redo: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
  setActiveTool: (tool: ToolType) => void;
  setShowCheatsheet: React.Dispatch<React.SetStateAction<boolean>>;
  setPendingSelection: React.Dispatch<React.SetStateAction<{ strokes: Stroke[]; bounds: { x: number; y: number; width: number; height: number } } | null>>;
  handleExportPng: () => void;
  handleExportPdf: () => void;
  handleImportFile: () => void;
  copySelection: () => void;
  deleteSelection: () => void;
  pasteFromClipboard: () => void;
  pendingSelection: { strokes: Stroke[]; bounds: { x: number; y: number; width: number; height: number } } | null;
  clipboard: Stroke[] | null;
}

export function useKeyboardShortcuts({
  undo,
  redo,
  zoomIn,
  zoomOut,
  zoomReset,
  setActiveTool,
  setShowCheatsheet,
  setPendingSelection,
  handleExportPng,
  handleExportPdf,
  handleImportFile,
  copySelection,
  deleteSelection,
  pasteFromClipboard,
  pendingSelection,
  clipboard,
}: UseKeyboardShortcutsOptions) {
  const handleExportPngRef = useRef(handleExportPng);
  const handleExportPdfRef = useRef(handleExportPdf);
  const handleImportFileRef = useRef(handleImportFile);
  const copySelectionRef = useRef(copySelection);
  const deleteSelectionRef = useRef(deleteSelection);
  const pasteFromClipboardRef = useRef(pasteFromClipboard);
  const pendingSelectionRef = useRef(pendingSelection);
  const clipboardRef = useRef(clipboard);

  useEffect(() => { handleExportPngRef.current = handleExportPng; }, [handleExportPng]);
  useEffect(() => { handleExportPdfRef.current = handleExportPdf; }, [handleExportPdf]);
  useEffect(() => { handleImportFileRef.current = handleImportFile; }, [handleImportFile]);
  useEffect(() => { copySelectionRef.current = copySelection; }, [copySelection]);
  useEffect(() => { deleteSelectionRef.current = deleteSelection; }, [deleteSelection]);
  useEffect(() => { pasteFromClipboardRef.current = pasteFromClipboard; }, [pasteFromClipboard]);
  useEffect(() => { pendingSelectionRef.current = pendingSelection; }, [pendingSelection]);
  useEffect(() => { clipboardRef.current = clipboard; }, [clipboard]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const isCmd = e.metaKey || e.ctrlKey;
      const isEditing = e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement;

      if (isCmd && e.key === 'c' && !e.shiftKey && !isEditing) {
        if (pendingSelectionRef.current && copySelectionRef.current) {
          e.preventDefault();
          copySelectionRef.current();
        }
        return;
      } else if (isCmd && e.key === 'v' && !e.shiftKey && !isEditing) {
        if (clipboardRef.current) {
          e.preventDefault();
          pasteFromClipboardRef.current?.();
        }
        return;
      } else if ((e.key === 'Delete' || e.key === 'Backspace') && !isEditing && pendingSelectionRef.current) {
        e.preventDefault();
        deleteSelectionRef.current?.();
        return;
      } else if (isCmd && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (isCmd && e.key === 'z' && e.shiftKey) {
        e.preventDefault();
        redo();
      } else if (isCmd && e.key === 'y') {
        e.preventDefault();
        redo();
      } else if (isCmd && (e.key === '=' || e.key === '+')) {
        e.preventDefault();
        zoomIn();
      } else if (isCmd && e.key === '-') {
        e.preventDefault();
        zoomOut();
      } else if (isCmd && e.key === '0') {
        e.preventDefault();
        zoomReset();
      } else if (isCmd && e.shiftKey && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        handleExportPngRef.current();
      } else if (isCmd && e.shiftKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        handleExportPdfRef.current();
      } else if (isCmd && e.shiftKey && e.key.toLowerCase() === 'i') {
        e.preventDefault();
        handleImportFileRef.current();
      } else if (e.key === 'Escape') {
        e.preventDefault();
        setShowCheatsheet(v => {
          if (v) return false;
          setPendingSelection(null);
          setActiveTool('pen');
          return false;
        });
      } else if (e.key === '?' || (e.shiftKey && e.key === '/')) {
        e.preventDefault();
        setShowCheatsheet(v => !v);
      } else if (!isCmd && !e.altKey && !e.shiftKey) {
        switch (e.key.toLowerCase()) {
          case 'p': setActiveTool('pen'); break;
          case 'm': setActiveTool('marker'); break;
          case 'e': setActiveTool('eraser'); break;
          case 'h': setActiveTool('hand'); break;
          case 'l': setActiveTool('line'); break;
          case 'r': setActiveTool('rect'); break;
          case 't': setActiveTool('triangle'); break;
          case 'o': setActiveTool('ellipse'); break;
          case 'a': setActiveTool('axes'); break;
          case 's': setActiveTool('select'); break;
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo, zoomIn, zoomOut, zoomReset, setActiveTool, setShowCheatsheet, setPendingSelection]);
}
