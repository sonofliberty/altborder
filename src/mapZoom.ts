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

// Anchor the country under the initial midpoint while the fingers move and spread.
export function zoomFromTouchPair(
  current: ZoomState,
  start: [{ x: number; y: number }, { x: number; y: number }],
  next: [{ x: number; y: number }, { x: number; y: number }],
): ZoomState {
  const distance = (pair: typeof start) => Math.hypot(pair[1].x - pair[0].x, pair[1].y - pair[0].y);
  const startDistance = distance(start);
  const k = clamp(current.k * (startDistance > 0 ? distance(next) / startDistance : 1), minZoom, maxZoom);
  const ratio = k / current.k;
  const startCenter = { x: (start[0].x + start[1].x) / 2, y: (start[0].y + start[1].y) / 2 };
  const nextCenter = { x: (next[0].x + next[1].x) / 2, y: (next[0].y + next[1].y) / 2 };
  return { k, x: nextCenter.x - (startCenter.x - current.x) * ratio, y: nextCenter.y - (startCenter.y - current.y) * ratio };
}
