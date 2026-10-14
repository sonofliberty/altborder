import type { ProjectedBoundaryEdge } from "./boundaryEdges";
import type { ProjectedBounds } from "./mapZoom";

export type MapChangePiece = { path: string; fromColor: string; toColor: string };
export type MapChangeReveal =
  | { kind: "edge"; path: string; extent: number }
  | { kind: "point"; x: number; y: number; extent: number };

export type MapChangeAnimation = {
  id: number;
  pieces: MapChangePiece[];
  backgroundPieces: MapChangePiece[];
  reveal: MapChangeReveal;
  bounds: ProjectedBounds;
  previousRegionOwners: Record<string, string>;
  sweepComplete: boolean;
  settling: boolean;
};

/** Finish an interrupted transfer's color without exposing an older country fill. */
export function createMapChange(
  change: Pick<MapChangeAnimation, "id" | "pieces" | "reveal" | "bounds" | "previousRegionOwners">,
  previous: MapChangeAnimation | null,
): MapChangeAnimation {
  return {
    ...change,
    pieces: groupPieces(change.pieces, false),
    backgroundPieces: groupPieces(previous ? [...previous.backgroundPieces, ...previous.pieces] : [], true),
    bounds: previous ? {
      minX: Math.min(previous.bounds.minX, change.bounds.minX),
      minY: Math.min(previous.bounds.minY, change.bounds.minY),
      maxX: Math.max(previous.bounds.maxX, change.bounds.maxX),
      maxY: Math.max(previous.bounds.maxY, change.bounds.maxY),
    } : change.bounds,
    previousRegionOwners: previous?.previousRegionOwners ?? change.previousRegionOwners,
    sweepComplete: false,
    settling: false,
  };
}

function groupPieces(pieces: MapChangePiece[], completed: boolean): MapChangePiece[] {
  // Keep completed layers in order: a second transfer can cover the first one.
  const grouped: MapChangePiece[] = [];
  for (const piece of pieces) {
    if (!piece.path) continue;
    const last = grouped[grouped.length - 1];
    if (last && last.toColor === piece.toColor && (completed || last.fromColor === piece.fromColor)) {
      last.path += piece.path;
    } else {
      grouped.push({ ...piece });
    }
  }
  return grouped;
}

export function getTransferReveal(
  regionIds: string[],
  destinationId: string,
  regionOwners: Record<string, string>,
  edges: readonly (ProjectedBoundaryEdge & { bounds: ProjectedBounds })[],
  bounds: ProjectedBounds,
  destinationBounds: ProjectedBounds | null,
): MapChangeReveal {
  const selected = new Set(regionIds);
  let sharedBorder = "";
  let sharedBounds: ProjectedBounds | null = null;
  for (const edge of edges) {
    const [first, second] = edge.regionIds;
    if (second === null || !(
      (selected.has(first) && regionOwners[second] === destinationId) ||
      (selected.has(second) && regionOwners[first] === destinationId)
    )) continue;
    sharedBorder += edge.pathData;
    sharedBounds = sharedBounds ? {
      minX: Math.min(sharedBounds.minX, edge.bounds.minX),
      minY: Math.min(sharedBounds.minY, edge.bounds.minY),
      maxX: Math.max(sharedBounds.maxX, edge.bounds.maxX),
      maxY: Math.max(sharedBounds.maxY, edge.bounds.maxY),
    } : edge.bounds;
  }
  if (sharedBorder && sharedBounds) {
    // Include opposite corners too. A winding shared edge can span the full
    // bounding box while still leaving distant land outside a smaller sweep.
    const acrossX = Math.max(Math.abs(bounds.minX - sharedBounds.maxX), Math.abs(bounds.maxX - sharedBounds.minX));
    const acrossY = Math.max(Math.abs(bounds.minY - sharedBounds.maxY), Math.abs(bounds.maxY - sharedBounds.minY));
    return { kind: "edge", path: sharedBorder, extent: Math.hypot(acrossX, acrossY) * 2 + 4 };
  }

  const destinationX = destinationBounds ? (destinationBounds.minX + destinationBounds.maxX) / 2 : bounds.minX;
  const destinationY = destinationBounds ? (destinationBounds.minY + destinationBounds.maxY) / 2 : (bounds.minY + bounds.maxY) / 2;
  const dx = destinationX - (bounds.minX + bounds.maxX) / 2;
  const dy = destinationY - (bounds.minY + bounds.maxY) / 2;
  const horizontal = Math.abs(dx) >= Math.abs(dy);
  const path = horizontal
    ? `M${dx < 0 ? bounds.minX : bounds.maxX},${bounds.minY}V${bounds.maxY}`
    : `M${bounds.minX},${dy < 0 ? bounds.minY : bounds.maxY}H${bounds.maxX}`;
  const depth = horizontal ? bounds.maxX - bounds.minX : bounds.maxY - bounds.minY;
  return { kind: "edge", path, extent: depth * 2 + 4 };
}
