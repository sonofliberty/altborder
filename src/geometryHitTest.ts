import type { Geometry, Position } from "geojson";
import type { ProjectedBounds } from "./mapZoom";

export type ProjectPoint = (position: Position) => [number, number] | null | undefined;

type HitTestRegion = {
  id: string;
  geometry: Geometry;
  bounds: ProjectedBounds | null;
};

type Point = [number, number];

export function findRegionAtProjectedPoint(
  point: Point,
  regions: HitTestRegion[],
  project: ProjectPoint,
  regionOwners?: Readonly<Record<string, string>>,
): string | null {
  let bestRegionId: string | null = null;
  let bestBoundsArea = Number.POSITIVE_INFINITY;

  for (const region of regions) {
    // Dividing retires the original regions without removing their base
    // geometry. They must not intercept clicks on either replacement region.
    if (regionOwners && !regionOwners[region.id]) continue;
    if (!region.bounds || !boundsContainPoint(region.bounds, point)) continue;
    if (!projectedGeometryContainsPoint(region.geometry, point, project)) continue;

    const boundsArea = Math.max(
      (region.bounds.maxX - region.bounds.minX) * (region.bounds.maxY - region.bounds.minY),
      0,
    );
    if (boundsArea < bestBoundsArea) {
      bestBoundsArea = boundsArea;
      bestRegionId = region.id;
    }
  }

  return bestRegionId;
}

function projectedGeometryContainsPoint(geometry: Geometry, point: Point, project: ProjectPoint): boolean {
  if (geometry.type === "Polygon") {
    return projectedPolygonContainsPoint(geometry.coordinates, point, project);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => projectedPolygonContainsPoint(polygon, point, project));
  }
  return false;
}

function projectedPolygonContainsPoint(polygon: Position[][], point: Point, project: ProjectPoint): boolean {
  const [outerRing, ...holes] = polygon;
  if (!outerRing || !projectedRingContainsPoint(outerRing, point, project)) {
    return false;
  }

  return !holes.some((hole) => projectedRingContainsPoint(hole, point, project));
}

function projectedRingContainsPoint(ring: Position[], point: Point, project: ProjectPoint): boolean {
  return splitRingAtAntimeridian(ring).some((part) => projectedRingPartContainsPoint(part, point, project));
}

function splitRingAtAntimeridian(ring: Position[]): Position[][] {
  if (!ring.some((position, index) => index > 0 && Math.abs(position[0] - ring[index - 1][0]) > 180)) {
    return [ring];
  }

  // Keep neighboring longitudes close, then clip each visible copy at the map seam.
  const unwrapped: Position[] = [];
  let minLongitude = Infinity;
  let maxLongitude = -Infinity;
  for (const position of ring) {
    const previousLongitude = unwrapped[unwrapped.length - 1]?.[0] ?? position[0];
    const longitude = position[0] + 360 * Math.round((previousLongitude - position[0]) / 360);
    unwrapped.push([longitude, position[1]]);
    minLongitude = Math.min(minLongitude, longitude);
    maxLongitude = Math.max(maxLongitude, longitude);
  }
  const firstCopy = Math.ceil((-180 - maxLongitude) / 360);
  const lastCopy = Math.floor((180 - minLongitude) / 360);
  // Imported coordinates can produce indices too large for +1 to advance.
  if (!Number.isSafeInteger(firstCopy) || !Number.isSafeInteger(lastCopy)) return [];
  const parts: Position[][] = [];
  for (let copy = firstCopy; copy <= lastCopy; copy += 1) {
    const shifted = unwrapped.map(([longitude, latitude]) => [longitude + copy * 360, latitude]);
    const clipped = clipRingLongitude(clipRingLongitude(shifted, -180, true), 180, false);
    if (clipped.length >= 3) parts.push(clipped);
  }
  return parts;
}

function clipRingLongitude(ring: Position[], longitude: number, keepGreater: boolean): Position[] {
  const clipped: Position[] = [];
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const previous = ring[(index + ring.length - 1) % ring.length];
    const currentInside = keepGreater ? current[0] >= longitude : current[0] <= longitude;
    const previousInside = keepGreater ? previous[0] >= longitude : previous[0] <= longitude;
    if (currentInside !== previousInside) {
      const ratio = (longitude - previous[0]) / (current[0] - previous[0]);
      clipped.push([longitude, previous[1] + ratio * (current[1] - previous[1])]);
    }
    if (currentInside) clipped.push(current);
  }
  return clipped;
}

function projectedRingPartContainsPoint(ring: Position[], point: Point, project: ProjectPoint): boolean {
  const projectedRing = ring
    .map(project)
    .filter((projected): projected is Point => Boolean(projected && Number.isFinite(projected[0]) && Number.isFinite(projected[1])));
  if (projectedRing.length < 3) return false;

  let inside = false;
  for (let index = 0, previousIndex = projectedRing.length - 1; index < projectedRing.length; previousIndex = index, index += 1) {
    const current = projectedRing[index];
    const previous = projectedRing[previousIndex];
    if (pointOnSegment(point, previous, current)) return true;
    const crosses =
      current[1] > point[1] !== previous[1] > point[1] &&
      point[0] < ((previous[0] - current[0]) * (point[1] - current[1])) / (previous[1] - current[1]) + current[0];
    if (crosses) inside = !inside;
  }

  return inside;
}

function boundsContainPoint(bounds: ProjectedBounds, point: Point): boolean {
  return point[0] >= bounds.minX && point[0] <= bounds.maxX && point[1] >= bounds.minY && point[1] <= bounds.maxY;
}

function pointOnSegment(point: Point, start: Point, end: Point): boolean {
  const cross = (end[0] - start[0]) * (point[1] - start[1]) - (end[1] - start[1]) * (point[0] - start[0]);
  if (Math.abs(cross) > 1e-7) return false;
  return (
    point[0] >= Math.min(start[0], end[0]) - 1e-7 &&
    point[0] <= Math.max(start[0], end[0]) + 1e-7 &&
    point[1] >= Math.min(start[1], end[1]) - 1e-7 &&
    point[1] <= Math.max(start[1], end[1]) + 1e-7
  );
}
