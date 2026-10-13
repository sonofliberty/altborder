import type { MapThemeId } from "./types";

const decodedRasters = new Set<string>();
const pendingRasters = new Map<string, Promise<void>>();
const decodeQueue: Array<() => void> = [];
const maxConcurrentDecodes = 2;
let activeDecodes = 0;

function startNextDecode(): void {
  while (activeDecodes < maxConcurrentDecodes && decodeQueue.length > 0) {
    decodeQueue.shift()!();
  }
}

/** Share requests between changing viewports and limit transient bitmap memory. */
export function decodeMapThemeRaster(source: string): Promise<void> {
  if (decodedRasters.has(source)) return Promise.resolve();
  const pending = pendingRasters.get(source);
  if (pending) return pending;

  const request = new Promise<void>((resolve, reject) => {
    decodeQueue.push(() => {
      activeDecodes += 1;
      const image = new Image();
      image.src = source;
      void image.decode().then(() => {
        decodedRasters.add(source);
        resolve();
      }, reject).finally(() => {
        pendingRasters.delete(source);
        activeDecodes -= 1;
        startNextDecode();
      });
    });
  });
  pendingRasters.set(source, request);
  startNextDecode();
  return request;
}

/** Start the selected overview and font while the map geometry is prepared. */
export function preloadMapThemeAssets(theme: MapThemeId): () => void {
  const base = import.meta.env.BASE_URL;
  // Use the CSS font face directly so its request mode and URL are reused.
  const font = theme === "eu4" ? '500 12px "Cinzel Map"' : '600 12px "Barlow Map"';
  void document.fonts.load(font).catch(() => {
    // The existing CSS fallback remains available if the font request fails.
  });
  const links = [
    { href: `${base}map-themes/ocean-overview.webp`, as: "image", type: "image/webp" },
    { href: `${base}map-themes/${theme}-overview.webp`, as: "image", type: "image/webp" },
  ].map((asset) => {
    const link = document.createElement("link");
    link.rel = "preload";
    link.href = asset.href;
    link.as = asset.as;
    link.type = asset.type;
    document.head.append(link);
    return link;
  });
  return () => links.forEach((link) => link.remove());
}
