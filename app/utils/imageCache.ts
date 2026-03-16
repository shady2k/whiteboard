import { getAsset, getAssetMapping } from '@/app/lib/idb';

const MAX_CACHE_SIZE = 100;
const cache = new Map<string, HTMLImageElement>();
const loading = new Set<string>();
const callbacks = new Map<string, (() => void)[]>();
const blobUrls = new Map<string, string>();

function evictIfNeeded() {
  if (cache.size <= MAX_CACHE_SIZE) return;
  const keysToRemove = Array.from(cache.keys()).slice(0, cache.size - MAX_CACHE_SIZE);
  for (const key of keysToRemove) {
    cache.delete(key);
    const url = blobUrls.get(key);
    if (url) {
      URL.revokeObjectURL(url);
      blobUrls.delete(key);
    }
  }
}

export function getCachedImage(assetId: string): HTMLImageElement | null {
  return cache.get(assetId) ?? null;
}

export function preloadImages(assetIds: string[]): Promise<void> {
  const unloaded = assetIds.filter(id => !cache.has(id));
  if (unloaded.length === 0) return Promise.resolve();
  return new Promise<void>((resolve) => {
    let remaining = unloaded.length;
    const done = () => { if (--remaining <= 0) resolve(); };
    for (const id of unloaded) {
      loadImage(id, done);
    }
  });
}

export function loadImage(assetId: string, onLoad: () => void): void {
  if (cache.has(assetId)) {
    onLoad();
    return;
  }

  // Queue callback if already loading
  if (loading.has(assetId)) {
    const cbs = callbacks.get(assetId) ?? [];
    cbs.push(onLoad);
    callbacks.set(assetId, cbs);
    return;
  }

  loading.add(assetId);
  callbacks.set(assetId, [onLoad]);

  // Try IDB first, then network
  loadFromIDBThenNetwork(assetId);
}

async function loadFromIDBThenNetwork(assetId: string) {
  // Check IDB for blob
  try {
    const asset = await getAsset(assetId);
    if (asset?.blob) {
      const url = URL.createObjectURL(asset.blob);
      blobUrls.set(assetId, url);
      setImageSrc(assetId, url);
      return;
    }
  } catch {
    // IDB unavailable, fall through
  }

  // For local- IDs without a blob, check if there's a remote mapping to fetch from
  let fetchId = assetId;
  if (assetId.startsWith('local-')) {
    try {
      const mapping = await getAssetMapping(assetId);
      if (mapping) {
        fetchId = mapping.remoteId;
      } else {
        // No blob, no mapping — can't load this image
        finishLoading(assetId, null);
        return;
      }
    } catch {
      finishLoading(assetId, null);
      return;
    }
  }

  // Fetch from server
  setImageSrc(assetId, `/api/assets?id=${fetchId}`);
}

function setImageSrc(assetId: string, src: string) {
  const img = new Image();
  img.onload = () => {
    finishLoading(assetId, img);

    // Cache blob in IDB for offline use (only for server-fetched images)
    if (!src.startsWith('blob:') && !assetId.startsWith('local-')) {
      cacheImageBlobToIDB(assetId, src).catch(() => {});
    }
  };
  img.onerror = () => {
    finishLoading(assetId, null);
  };
  img.src = src;
}

function finishLoading(assetId: string, img: HTMLImageElement | null) {
  if (img) {
    cache.set(assetId, img);
    evictIfNeeded();
  }
  loading.delete(assetId);
  const cbs = callbacks.get(assetId) ?? [];
  callbacks.delete(assetId);
  if (!img) {
    console.error(`Failed to load asset: ${assetId}`);
  }
  for (const cb of cbs) cb();
}

async function cacheImageBlobToIDB(assetId: string, url: string) {
  try {
    const { putAsset } = await import('@/app/lib/idb');
    const res = await fetch(url);
    if (!res.ok) return;
    const blob = await res.blob();
    await putAsset({
      id: assetId,
      blob,
      mimeType: blob.type,
      cachedAt: Date.now(),
      pendingUpload: false,
      contentHash: '',
    });
  } catch {
    // Non-critical
  }
}
