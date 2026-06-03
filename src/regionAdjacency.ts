import type { Geometry, Position } from "geojson";
import type { RegionRecord } from "./types";

type Bounds = [minX: number, minY: number, maxX: number, maxY: number];

type Segment = {
  start: Position;
  end: Position;
  bounds: Bounds;
};

type IndexedRegion = {
  id: string;
  geometry: Geometry;
  bounds: Bounds;
  segments: Segment[] | null;
};

const defaultAdjacencyTolerance = 0.0008;
const minimumSharedBorderLength = 1e-6;
const indexedRegionCache = new WeakMap<RegionRecord[], IndexedRegion[]>();
const sortedSegmentCache = new WeakMap<Segment[], Segment[]>();

export function buildSelectedRegionAdjacency(
  regions: RegionRecord[],
  selectedRegionIds: Iterable<string>,
  tolerance = defaultAdjacencyTolerance,
): Map<string, Set<string>> {
  const selectedRegionSet = new Set(selectedRegionIds);
  const adjacency = new Map<string, Set<string>>();
  if (selectedRegionSet.size === 0) return adjacency;

  const indexedRegions = getIndexedRegions(regions);
  const selectedRegions = indexedRegions.filter((region) => selectedRegionSet.has(region.id));

  for (const region of selectedRegions) {
    adjacency.set(region.id, new Set());
  }

  for (const selectedRegion of selectedRegions) {
    const selectedAdjacency = adjacency.get(selectedRegion.id);
    if (!selectedAdjacency) continue;

    for (const candidate of indexedRegions) {
      if (candidate.id === selectedRegion.id) continue;
      if (!boundsOverlap(selectedRegion.bounds, candidate.bounds, tolerance)) continue;
      if (!regionsShareBorder(selectedRegion, candidate, tolerance)) continue;
      selectedAdjacency.add(candidate.id);
    }
  }

  return adjacency;
}

function getIndexedRegions(regions: RegionRecord[]): IndexedRegion[] {
  const cached = indexedRegionCache.get(regions);
  if (cached) return cached;

  const indexedRegions = regions
    .map((region) => indexRegion(region))
    .filter((region): region is IndexedRegion => Boolean(region));
  indexedRegionCache.set(regions, indexedRegions);
  return indexedRegions;
}

function indexRegion(region: RegionRecord): IndexedRegion | null {
  const bounds = geometryBounds(region.geometry);
  if (!bounds) return null;

  return {
    id: region.id,
    geometry: region.geometry,
    bounds,
    segments: null,
  };
}

function regionsShareBorder(first: IndexedRegion, second: IndexedRegion, tolerance: number): boolean {
  const firstSegments = getRegionSegments(first);
  const secondSegments = getRegionSegments(second);

  return approximateSharedBorderLength(firstSegments, secondSegments, tolerance) > minimumSharedBorderLength;
}

function getRegionSegments(region: IndexedRegion): Segment[] {
  region.segments ??= geometrySegments(region.geometry);
  return region.segments;
}

function approximateSharedBorderLength(first: Segment[], second: Segment[], tolerance: number): number {
  let sharedLength = 0;
  const firstSorted = getSegmentsSortedByMinX(first);
  const secondSorted = getSegmentsSortedByMinX(second);
  let secondStartIndex = 0;

  for (const firstSegment of firstSorted) {
    while (
      secondStartIndex < secondSorted.length &&
      secondSorted[secondStartIndex].bounds[2] + tolerance < firstSegment.bounds[0]
    ) {
      secondStartIndex += 1;
    }

    for (let index = secondStartIndex; index < secondSorted.length; index += 1) {
      const secondSegment = secondSorted[index];
      if (secondSegment.bounds[0] - tolerance > firstSegment.bounds[2]) break;
      if (!yBoundsOverlap(firstSegment.bounds, secondSegment.bounds, tolerance)) continue;
      sharedLength += nearlyCollinearOverlapLength(firstSegment, secondSegment, tolerance);
      if (sharedLength > minimumSharedBorderLength) return sharedLength;
    }
  }

  return sharedLength;
}

function getSegmentsSortedByMinX(segments: Segment[]): Segment[] {
  const cached = sortedSegmentCache.get(segments);
  if (cached) return cached;

  const sorted = [...segments].sort((a, b) => a.bounds[0] - b.bounds[0]);
  sortedSegmentCache.set(segments, sorted);
  return sorted;
}

function nearlyCollinearOverlapLength(first: Segment, second: Segment, tolerance: number): number {
  const firstVector = vector(first.start, first.end);
  const secondVector = vector(second.start, second.end);
  const firstLength = length(firstVector);
  const secondLength = length(secondVector);
  if (firstLength <= 0 || secondLength <= 0) return 0;

  const directionCross = Math.abs(cross(firstVector, secondVector)) / (firstLength * secondLength);
  if (directionCross > 0.02) return 0;

  const distanceStart = pointLineDistance(second.start, first.start, first.end);
  const distanceEnd = pointLineDistance(second.end, first.start, first.end);
  if (Math.max(distanceStart, distanceEnd) > tolerance) return 0;

  const axis: Position = [firstVector[0] / firstLength, firstVector[1] / firstLength];
  const firstMin = Math.min(projectOnAxis(first.start, axis), projectOnAxis(first.end, axis));
  const firstMax = Math.max(projectOnAxis(first.start, axis), projectOnAxis(first.end, axis));
  const secondMin = Math.min(projectOnAxis(second.start, axis), projectOnAxis(second.end, axis));
  const secondMax = Math.max(projectOnAxis(second.start, axis), projectOnAxis(second.end, axis));
  const overlap = Math.min(firstMax, secondMax) - Math.max(firstMin, secondMin);

  return overlap > tolerance ? overlap : 0;
}

function geometrySegments(geometry: Geometry): Segment[] {
  if (geometry.type === "Polygon") {
    return polygonSegments(geometry.coordinates);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => polygonSegments(polygon));
  }
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.flatMap(geometrySegments);
  }
  return [];
}

function polygonSegments(polygon: Position[][]): Segment[] {
  return polygon.flatMap((ring) => {
    const segments: Segment[] = [];
    for (let index = 1; index < ring.length; index += 1) {
      const start = ring[index - 1];
      const end = ring[index];
      segments.push({
        start,
        end,
        bounds: pointsBounds([start, end]) ?? [0, 0, 0, 0],
      });
    }
    return segments;
  });
}

function geometryBounds(geometry: Geometry): Bounds | null {
  if (geometry.type === "Polygon") {
    return pointsBounds(geometry.coordinates.flat());
  }
  if (geometry.type === "MultiPolygon") {
    return pointsBounds(geometry.coordinates.flat(2));
  }
  if (geometry.type === "GeometryCollection") {
    return mergeBounds(geometry.geometries.map(geometryBounds).filter((bounds): bounds is Bounds => Boolean(bounds)));
  }
  return null;
}

function pointsBounds(points: Position[]): Bounds | null {
  const bounds: Bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const point of points) {
    bounds[0] = Math.min(bounds[0], point[0]);
    bounds[1] = Math.min(bounds[1], point[1]);
    bounds[2] = Math.max(bounds[2], point[0]);
    bounds[3] = Math.max(bounds[3], point[1]);
  }
  return Number.isFinite(bounds[0]) ? bounds : null;
}

function mergeBounds(boundsList: Bounds[]): Bounds | null {
  if (boundsList.length === 0) return null;
  return boundsList.reduce<Bounds>(
    (merged, bounds) => [
      Math.min(merged[0], bounds[0]),
      Math.min(merged[1], bounds[1]),
      Math.max(merged[2], bounds[2]),
      Math.max(merged[3], bounds[3]),
    ],
    [Infinity, Infinity, -Infinity, -Infinity],
  );
}

function boundsOverlap(a: Bounds, b: Bounds, tolerance: number): boolean {
  return (
    a[0] - tolerance <= b[2] &&
    a[2] + tolerance >= b[0] &&
    a[1] - tolerance <= b[3] &&
    a[3] + tolerance >= b[1]
  );
}

function yBoundsOverlap(a: Bounds, b: Bounds, tolerance: number): boolean {
  return a[1] - tolerance <= b[3] && a[3] + tolerance >= b[1];
}

function vector(start: Position, end: Position): Position {
  return [end[0] - start[0], end[1] - start[1]];
}

function cross(a: Position, b: Position): number {
  return a[0] * b[1] - a[1] * b[0];
}

function length(vectorValue: Position): number {
  return Math.hypot(vectorValue[0], vectorValue[1]);
}

function distance(a: Position, b: Position): number {
  return Math.hypot(a[0] - b[0], a[1] - b[1]);
}

function pointLineDistance(point: Position, start: Position, end: Position): number {
  const segment = vector(start, end);
  const segmentLength = length(segment);
  if (segmentLength <= 0) return distance(point, start);
  return Math.abs(cross(vector(start, point), segment)) / segmentLength;
}

function projectOnAxis(point: Position, axis: Position): number {
  return point[0] * axis[0] + point[1] * axis[1];
}
