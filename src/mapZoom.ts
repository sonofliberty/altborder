const viewportWidth = 1000;
const viewportHeight = 560;
const minZoom = 0.8;
const maxZoom = 30;

export type ProjectedBounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

export type ZoomState = {
  x: number;
  y: number;
  k: number;
};

export function interpolateZoom(start: ZoomState, end: ZoomState, progress: number): ZoomState {
  if (progress <= 0) return start;
  if (progress >= 1) return end;
  const k = start.k * Math.pow(end.k / start.k, progress);
  // Translation follows scale so a zoom's anchor does not drift during the flight.
  const positionProgress = Math.abs(end.k - start.k) < 0.000001
    ? progress
    : (k - start.k) / (end.k - start.k);
  return {
    k,
    x: start.x + (end.x - start.x) * positionProgress,
    y: start.y + (end.y - start.y) * positionProgress,
  };
}

export function zoomToBounds(bounds: ProjectedBounds, padding: number): ZoomState {
  const width = Math.max(0.001, bounds.maxX - bounds.minX);
  const height = Math.max(0.001, bounds.maxY - bounds.minY);
  const availableWidth = Math.max(1, viewportWidth - padding * 2);
  const availableHeight = Math.max(1, viewportHeight - padding * 2);
  const k = clamp(Math.min(availableWidth / width, availableHeight / height), minZoom, maxZoom);
  const centerX = (bounds.minX + bounds.maxX) / 2;
  const centerY = (bounds.minY + bounds.maxY) / 2;

  return {
    k,
    x: viewportWidth / 2 - centerX * k,
    y: viewportHeight / 2 - centerY * k,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
