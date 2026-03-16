const MAX_CACHE_SIZE = 100;
const cache = new Map<string, HTMLImageElement>();
const loading = new Set<string>();
const callbacks = new Map<string, (() => void)[]>();

function evictIfNeeded() {
  if (cache.size <= MAX_CACHE_SIZE) return;
  // Evict oldest entries (first inserted)
  const keysToRemove = Array.from(cache.keys()).slice(0, cache.size - MAX_CACHE_SIZE);
  for (const key of keysToRemove) {
    cache.delete(key);
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

  const img = new Image();
  img.onload = () => {
    cache.set(assetId, img);
    evictIfNeeded();
    loading.delete(assetId);
    const cbs = callbacks.get(assetId) ?? [];
    callbacks.delete(assetId);
    for (const cb of cbs) cb();
  };
  img.onerror = () => {
    loading.delete(assetId);
    const cbs = callbacks.get(assetId) ?? [];
    callbacks.delete(assetId);
    console.error(`Failed to load asset: ${assetId}`);
    // Still notify callbacks so awaiting code (e.g. export) doesn't hang
    for (const cb of cbs) cb();
  };
  img.src = `/api/assets?id=${assetId}`;
}
