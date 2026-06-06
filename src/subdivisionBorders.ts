import type { Geometry, LineString, MultiLineString, Position } from "geojson";
import type { SubdivisionBorderRecord } from "./types";

type SubdivisionBorderVisibilityOptions = {
  ownerRemainderGeometries?: ReadonlyMap<string, readonly Geometry[]>;
};

export function isSubdivisionBorderVisible(
  border: Pick<SubdivisionBorderRecord, "ownerId" | "regionIds"> & { samplePoint?: Position | null },
  regionOwners: Record<string, string>,
  options: SubdivisionBorderVisibilityOptions = {},
): boolean {
  const [firstRegionId, secondRegionId] = border.regionIds;
  const firstOwnerId = getOwnValue(regionOwners, firstRegionId);
  const secondOwnerId = getOwnValue(regionOwners, secondRegionId);
  if (firstOwnerId && firstOwnerId === secondOwnerId && firstOwnerId === border.ownerId) {
    return true;
  }

  const ownerRemainderGeometries = options.ownerRemainderGeometries?.get(border.ownerId);
  if (!border.samplePoint || !ownerRemainderGeometries) {
    return false;
  }

  return ownerRemainderGeometries.some((geometry) => polygonalGeometryContainsPoint(geometry, border.samplePoint!));
}

export function getSubdivisionBorderSamplePoint(
  geometry: LineString | MultiLineString,
): Position | null {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  let bestSegment: [Position, Position] | null = null;
  let bestLength = 0;

  for (const line of lines) {
    for (let index = 1; index < line.length; index += 1) {
      const start = line[index - 1];
      const end = line[index];
      const length = Math.hypot(end[0] - start[0], end[1] - start[1]);
      if (length > bestLength) {
        bestLength = length;
        bestSegment = [start, end];
      }
    }
  }

  if (!bestSegment) return null;
  return [
    (bestSegment[0][0] + bestSegment[1][0]) / 2,
    (bestSegment[0][1] + bestSegment[1][1]) / 2,
  ];
}

function getOwnValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}

function polygonalGeometryContainsPoint(geometry: Geometry, point: Position): boolean {
  if (geometry.type === "Polygon") {
    return polygonContainsPoint(geometry.coordinates, point);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => polygonContainsPoint(polygon, point));
  }
  return false;
}

function polygonContainsPoint(polygon: Position[][], point: Position): boolean {
  const [outerRing, ...holes] = polygon;
  if (!outerRing || !ringContainsPoint(outerRing, point)) {
    return false;
  }
  return holes.every((hole) => !ringContainsPoint(hole, point));
}

function ringContainsPoint(ring: Position[], point: Position): boolean {
  let inside = false;
  const [x, y] = point;

  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    const crossesRay =
      current[1] > y !== previous[1] > y &&
      x < ((previous[0] - current[0]) * (y - current[1])) / (previous[1] - current[1]) + current[0];

    if (crossesRay) {
      inside = !inside;
    }
  }

  return inside;
}
