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

export interface TriangleStroke {
  type: 'triangle';
  id: string;
  start: Point;
  end: Point;
  style: StrokeStyle;
}

export interface MarkerStroke {
  type: 'marker';
  id: string;
  points: Point[];
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
  opacity?: number; // 0-1, default 1
}

export type Stroke = FreehandStroke | MarkerStroke | LineStroke | RectStroke | TriangleStroke | EllipseStroke | ImageStroke;

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

export type ToolType = 'pen' | 'marker' | 'eraser' | 'hand' | 'line' | 'rect' | 'triangle' | 'ellipse' | 'select';

export type Command =
  | { type: 'createStroke'; pageId: string; stroke: Stroke }
  | { type: 'deleteStroke'; pageId: string; strokeId: string; stroke: Stroke }
  | { type: 'updateStroke'; pageId: string; strokeId: string; oldStroke: Stroke; newStroke: Stroke }
  | { type: 'clearPage'; pageId: string; strokes: Stroke[] }
  | { type: 'addPage'; page: Page }
  | { type: 'deletePage'; page: Page; index: number }
  | { type: 'setPageBackground'; pageId: string; oldPattern: BackgroundPattern; oldColor: string; newPattern: BackgroundPattern; newColor: string }
  | { type: 'pasteImage'; pageId: string; stroke: ImageStroke }
  | { type: 'transformImageStroke'; pageId: string; strokeId: string; oldStroke: ImageStroke; newStroke: ImageStroke }
  | { type: 'pasteSnippet'; pageId: string; strokes: Stroke[] }
  | { type: 'deleteSelected'; pageId: string; strokes: Stroke[] };

export interface DirtyPage {
  pageId: string;
  sessionId: string;
  localUpdatedAt: number;
}

export interface LocalAsset {
  id: string;
  blob: Blob;
  mimeType: string;
  cachedAt: number;
  pendingUpload: boolean;
  contentHash: string;
}

export interface AssetMapping {
  localId: string;
  remoteId: string;
}

export type PendingActionType = 'assetUpload' | 'pageSync' | 'backgroundSync' | 'thumbnailSync' | 'sessionCreate' | 'sessionDelete' | 'sessionRename' | 'snippetCreate' | 'snippetDelete';

export interface Snippet {
  id: string;
  name: string;
  strokes: Stroke[];
  width: number;
  height: number;
  thumbnail: string;
  createdAt: string;
  updatedAt: string;
}

export interface PendingAction {
  actionId: string;
  type: PendingActionType;
  payload: string;
  createdAt: number;
  status: 'pending' | 'inflight';
}
