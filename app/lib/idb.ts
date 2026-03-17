import { openDB, type DBSchema, type IDBPDatabase } from 'idb';
import type { Page, Command, Snippet } from '@/app/types';
import type { DirtyPage, LocalAsset, AssetMapping, PendingAction } from '@/app/types';

interface WhiteboardDB extends DBSchema {
  sessions: {
    key: string;
    value: {
      id: string;
      name: string;
      createdAt: string;
      updatedAt: string;
      thumbnail: string | null;
    };
  };
  pages: {
    key: string;
    value: Page & { localUpdatedAt: number };
    indexes: { sessionId: string };
  };
  dirtyPages: {
    key: string;
    value: DirtyPage;
  };
  undoHistory: {
    key: string;
    value: {
      sessionId: string;
      undoStack: Command[];
      redoStack: Command[];
    };
  };
  assets: {
    key: string;
    value: LocalAsset;
  };
  assetUploadMap: {
    key: string;
    value: AssetMapping;
  };
  pendingActions: {
    key: string;
    value: PendingAction;
  };
  snippets: {
    key: string;
    value: Snippet;
  };
}

let dbPromise: Promise<IDBPDatabase<WhiteboardDB>> | null = null;

function getDB(): Promise<IDBPDatabase<WhiteboardDB>> {
  if (!dbPromise) {
    dbPromise = openDB<WhiteboardDB>('whiteboard', 2, {
      upgrade(db, oldVersion) {
        if (oldVersion < 1) {
          db.createObjectStore('sessions', { keyPath: 'id' });

          const pageStore = db.createObjectStore('pages', { keyPath: 'id' });
          pageStore.createIndex('sessionId', 'sessionId');

          db.createObjectStore('dirtyPages', { keyPath: 'pageId' });
          db.createObjectStore('undoHistory', { keyPath: 'sessionId' });
          db.createObjectStore('assets', { keyPath: 'id' });
          db.createObjectStore('assetUploadMap', { keyPath: 'localId' });
          db.createObjectStore('pendingActions', { keyPath: 'actionId' });
        }
        if (oldVersion < 2) {
          db.createObjectStore('snippets', { keyPath: 'id' });
        }
      },
    });
  }
  return dbPromise;
}

// --- Sessions ---

export async function getSession(id: string) {
  const db = await getDB();
  return db.get('sessions', id);
}

export async function putSession(session: WhiteboardDB['sessions']['value']) {
  const db = await getDB();
  return db.put('sessions', session);
}

export async function getAllSessions() {
  const db = await getDB();
  return db.getAll('sessions');
}

export async function deleteSession(id: string) {
  const db = await getDB();
  const tx = db.transaction(['sessions', 'pages', 'dirtyPages', 'undoHistory'], 'readwrite');
  await tx.objectStore('sessions').delete(id);

  const pages = await tx.objectStore('pages').index('sessionId').getAll(id);
  for (const page of pages) {
    await tx.objectStore('pages').delete(page.id);
    await tx.objectStore('dirtyPages').delete(page.id);
  }
  await tx.objectStore('undoHistory').delete(id);
  await tx.done;
}

// --- Pages ---

export async function getPagesBySession(sessionId: string): Promise<(Page & { localUpdatedAt: number })[]> {
  const db = await getDB();
  return db.getAllFromIndex('pages', 'sessionId', sessionId);
}

export async function getPage(pageId: string): Promise<(Page & { localUpdatedAt: number }) | undefined> {
  const db = await getDB();
  return db.get('pages', pageId);
}

export async function putPage(page: Page, localUpdatedAt?: number) {
  const db = await getDB();
  return db.put('pages', { ...page, localUpdatedAt: localUpdatedAt ?? Date.now() });
}

export async function deletePage(pageId: string) {
  const db = await getDB();
  const tx = db.transaction(['pages', 'dirtyPages'], 'readwrite');
  await tx.objectStore('pages').delete(pageId);
  await tx.objectStore('dirtyPages').delete(pageId);
  await tx.done;
}

// --- Dirty Pages ---

export async function markPageDirty(pageId: string, sessionId: string) {
  const db = await getDB();
  const dirty: DirtyPage = { pageId, sessionId, localUpdatedAt: Date.now() };
  return db.put('dirtyPages', dirty);
}

export async function getDirtyPages(): Promise<DirtyPage[]> {
  const db = await getDB();
  return db.getAll('dirtyPages');
}

export async function getDirtyPagesForSession(sessionId: string): Promise<DirtyPage[]> {
  const db = await getDB();
  const all = await db.getAll('dirtyPages');
  return all.filter(d => d.sessionId === sessionId);
}

export async function clearDirty(pageId: string) {
  const db = await getDB();
  return db.delete('dirtyPages', pageId);
}

// --- Undo History ---

export async function saveUndoHistory(sessionId: string, undoStack: Command[], redoStack: Command[]) {
  const db = await getDB();
  return db.put('undoHistory', { sessionId, undoStack, redoStack });
}

export async function loadUndoHistory(sessionId: string) {
  const db = await getDB();
  return db.get('undoHistory', sessionId);
}

// --- Assets ---

export async function putAsset(asset: LocalAsset) {
  const db = await getDB();
  return db.put('assets', asset);
}

export async function getAsset(id: string) {
  const db = await getDB();
  return db.get('assets', id);
}

export async function getPendingAssets(): Promise<LocalAsset[]> {
  const db = await getDB();
  const all = await db.getAll('assets');
  return all.filter(a => a.pendingUpload);
}

// --- Asset Upload Map ---

export async function putAssetMapping(mapping: AssetMapping) {
  const db = await getDB();
  return db.put('assetUploadMap', mapping);
}

export async function getAssetMapping(localId: string) {
  const db = await getDB();
  return db.get('assetUploadMap', localId);
}

export async function getAllAssetMappings(): Promise<AssetMapping[]> {
  const db = await getDB();
  return db.getAll('assetUploadMap');
}

export async function resolveAssetId(localId: string): Promise<string> {
  if (!localId.startsWith('local-')) return localId;
  const mapping = await getAssetMapping(localId);
  return mapping?.remoteId ?? localId;
}

// --- Pending Actions ---

export async function putPendingAction(action: PendingAction) {
  const db = await getDB();
  return db.put('pendingActions', action);
}

export async function getPendingActions(): Promise<PendingAction[]> {
  const db = await getDB();
  return db.getAll('pendingActions');
}

export async function clearPendingAction(actionId: string) {
  const db = await getDB();
  return db.delete('pendingActions', actionId);
}

// --- Snippets ---

export async function putSnippet(snippet: Snippet) {
  const db = await getDB();
  return db.put('snippets', snippet);
}

export async function getAllSnippets(): Promise<Snippet[]> {
  const db = await getDB();
  return db.getAll('snippets');
}

export async function deleteSnippetFromIDB(id: string) {
  const db = await getDB();
  return db.delete('snippets', id);
}
