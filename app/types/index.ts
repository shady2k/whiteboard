export interface Point {
  x: number;
  y: number;
  pressure: number;
}

export interface StrokeStyle {
  color: string;
  baseWidth: number;
}

export interface FreehandStroke {
  type: 'freehand';
  id: string;
  points: Point[];
  style: StrokeStyle;
}

export interface LineStroke {
  type: 'line';
  id: string;
  start: Point;
  end: Point;
  style: StrokeStyle;
}

export interface RectStroke {
  type: 'rect';
  id: string;
  start: Point;
  end: Point;
  style: StrokeStyle;
}

export interface EllipseStroke {
  type: 'ellipse';
  id: string;
  center: Point;
  radiusX: number;
  radiusY: number;
  style: StrokeStyle;
}

export interface ImageStroke {
  type: 'image';
  id: string;
  assetId: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export type Stroke = FreehandStroke | LineStroke | RectStroke | EllipseStroke | ImageStroke;

export type BackgroundPattern = 'blank' | 'grid' | 'dotgrid' | 'ruled';

export interface Page {
  id: string;
  sessionId: string;
  position: number;
  backgroundPattern: BackgroundPattern;
  backgroundColor: string;
  strokes: Stroke[];
}

export interface Session {
  id: string;
  name: string;
  pages: Page[];
  createdAt: string;
  updatedAt: string;
}

export type ToolType = 'pen' | 'eraser' | 'line' | 'rect' | 'ellipse';

export type Command =
  | { type: 'createStroke'; pageId: string; stroke: Stroke }
  | { type: 'deleteStroke'; pageId: string; strokeId: string; stroke: Stroke }
  | { type: 'updateStroke'; pageId: string; strokeId: string; oldStroke: Stroke; newStroke: Stroke }
  | { type: 'clearPage'; pageId: string; strokes: Stroke[] }
  | { type: 'addPage'; page: Page }
  | { type: 'deletePage'; page: Page; index: number }
  | { type: 'setPageBackground'; pageId: string; oldPattern: BackgroundPattern; oldColor: string; newPattern: BackgroundPattern; newColor: string }
  | { type: 'pasteImage'; pageId: string; stroke: ImageStroke }
  | { type: 'transformImageStroke'; pageId: string; strokeId: string; oldStroke: ImageStroke; newStroke: ImageStroke };
