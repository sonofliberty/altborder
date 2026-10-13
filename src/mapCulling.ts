import type { ProjectedBounds, ZoomState } from "./mapZoom";

export function shouldCullPaths({
  minZoom,
  zoomScale,
}: {
  isMapMoving: boolean;
  minZoom: number;
  zoomScale: number;
}): boolean {
  return zoomScale >= minZoom;
}

/** Refresh geometry only when the camera leaves its prepared area or changes scale substantially. */
export function shouldRefreshCullingZoom(
  previous: ZoomState,
  next: ZoomState,
  width: number,
  height: number,
  overscanRatio: number,
  viewport?: ProjectedBounds,
): boolean {
  const ratio = next.k / previous.k;
  if (ratio > 1.35 || ratio < 1 / 1.35) return true;
  const prepared = projectedViewportBounds({ width, height, zoom: previous, overscanRatio, viewport });
  const visible = projectedViewportBounds({ width, height, zoom: next, overscanRatio: 0, viewport });
  return visible.minX < prepared.minX || visible.minY < prepared.minY ||
    visible.maxX > prepared.maxX || visible.maxY > prepared.maxY;
}

export function projectedViewportBounds({
  height,
  overscanRatio,
  width,
  zoom,
  viewport,
}: {
  height: number;
  overscanRatio: number;
  width: number;
  zoom: ZoomState;
  viewport?: ProjectedBounds;
}): ProjectedBounds {
  const visibleWidth = (viewport ? viewport.maxX - viewport.minX : width) / zoom.k;
  const visibleHeight = (viewport ? viewport.maxY - viewport.minY : height) / zoom.k;
  const overscanX = visibleWidth * overscanRatio;
  const overscanY = visibleHeight * overscanRatio;
  const minX = ((viewport?.minX ?? 0) - zoom.x) / zoom.k;
  const minY = ((viewport?.minY ?? 0) - zoom.y) / zoom.k;

  return {
    minX: minX - overscanX,
    minY: minY - overscanY,
    maxX: minX + visibleWidth + overscanX,
    maxY: minY + visibleHeight + overscanY,
  };
}

export function boundsIntersect(a: ProjectedBounds, b: ProjectedBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

