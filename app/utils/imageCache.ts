const cache = new Map<string, HTMLImageElement>();
const loading = new Set<string>();
const callbacks = new Map<string, (() => void)[]>();

export function getCachedImage(assetId: string): HTMLImageElement | null {
  return cache.get(assetId) ?? null;
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
    loading.delete(assetId);
    const cbs = callbacks.get(assetId) ?? [];
    callbacks.delete(assetId);
    for (const cb of cbs) cb();
  };
  img.onerror = () => {
    loading.delete(assetId);
    callbacks.delete(assetId);
    console.error(`Failed to load asset: ${assetId}`);
  };
  img.src = `/api/assets?id=${assetId}`;
}
