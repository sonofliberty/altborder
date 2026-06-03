import type { ProjectedBounds, ZoomState } from "./mapZoom";

export function shouldCullPaths({
  isMapMoving,
  minZoom,
  zoomScale,
}: {
  isMapMoving: boolean;
  minZoom: number;
  zoomScale: number;
}): boolean {
  return !isMapMoving && zoomScale >= minZoom;
}

export function projectedViewportBounds({
  height,
  overscanRatio,
  width,
  zoom,
}: {
  height: number;
  overscanRatio: number;
  width: number;
  zoom: ZoomState;
}): ProjectedBounds {
  const visibleWidth = width / zoom.k;
  const visibleHeight = height / zoom.k;
  const overscanX = visibleWidth * overscanRatio;
  const overscanY = visibleHeight * overscanRatio;
  const minX = -zoom.x / zoom.k;
  const minY = -zoom.y / zoom.k;

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

