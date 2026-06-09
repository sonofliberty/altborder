import type { Geometry, Position } from "geojson";

export function simplifyPolygonalGeometry(geometry: Geometry, tolerance: number): Geometry {
  if (tolerance <= 0) return geometry;

  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: simplifyPolygonCoordinates(geometry.coordinates, tolerance),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => simplifyPolygonCoordinates(polygon, tolerance)),
    };
  }
  return geometry;
}

export function removePolygonalGeometryHoles(geometry: Geometry): Geometry {
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: removePolygonHoles(geometry.coordinates),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map(removePolygonHoles),
    };
  }
  return geometry;
}

export function removeSmallPolygonalGeometryComponents(
  geometry: Geometry,
  minAreaRatio: number,
): Geometry {
  if (geometry.type !== "MultiPolygon" || minAreaRatio <= 0 || geometry.coordinates.length <= 1) {
    return geometry;
  }

  const componentAreas = geometry.coordinates.map((polygon) => polygonOuterArea(polygon));
  const maxArea = Math.max(...componentAreas);
  if (maxArea <= 0) return geometry;

  const keptPolygons = geometry.coordinates
    .filter((_, index) => componentAreas[index] >= maxArea * minAreaRatio)
    .map(copyPolygonCoordinates);
  if (keptPolygons.length === 0 || keptPolygons.length === geometry.coordinates.length) {
    return geometry;
  }
  if (keptPolygons.length === 1) {
    return {
      ...geometry,
      type: "Polygon",
      coordinates: keptPolygons[0],
    };
  }
  return {
    ...geometry,
    coordinates: keptPolygons,
  };
}

function removePolygonHoles(polygon: Position[][]): Position[][] {
  const outerRing = polygon[0];
  return outerRing ? [outerRing.map(copyPosition)] : [];
}

function copyPolygonCoordinates(polygon: Position[][]): Position[][] {
  return polygon.map((ring) => ring.map(copyPosition));
}

function polygonOuterArea(polygon: Position[][]): number {
  const outerRing = polygon[0];
  return outerRing ? Math.abs(ringSignedArea(outerRing)) : 0;
}

function simplifyPolygonCoordinates(polygon: Position[][], tolerance: number): Position[][] {
  return polygon.map((ring) => simplifyRing(ring, tolerance));
}

function simplifyRing(ring: Position[], tolerance: number): Position[] {
  if (ring.length <= 4) return ring.map(copyPosition);

  const openRing = positionsEqual(ring[0], ring[ring.length - 1]) ? ring.slice(0, -1) : ring;
  if (openRing.length <= 3) return ring.map(copyPosition);

  const toleranceSquared = tolerance * tolerance;
  const radial = simplifyRadialDistance(openRing, toleranceSquared);
  const simplified = simplifyDouglasPeucker(radial, toleranceSquared);
  const closed = closeRing(simplified);

  if (closed.length < 4 || Math.abs(ringSignedArea(closed)) < 1e-12) {
    return ring.map(copyPosition);
  }

  return closed;
}

function simplifyRadialDistance(points: Position[], toleranceSquared: number): Position[] {
  const simplified: Position[] = [copyPosition(points[0])];
  let previous = points[0];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (distanceSquared(point, previous) > toleranceSquared) {
      simplified.push(copyPosition(point));
      previous = point;
    }
  }

  const last = points[points.length - 1];
  if (!positionsEqual(simplified[simplified.length - 1], last)) {
    simplified.push(copyPosition(last));
  }

  return simplified;
}

function simplifyDouglasPeucker(points: Position[], toleranceSquared: number): Position[] {
  if (points.length <= 2) return points.map(copyPosition);

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack: Array<[number, number]> = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [firstIndex, lastIndex] = stack.pop() ?? [0, 0];
    let maxDistanceSquared = 0;
    let maxIndex = 0;

    for (let index = firstIndex + 1; index < lastIndex; index += 1) {
      const distance = segmentDistanceSquared(points[index], points[firstIndex], points[lastIndex]);
      if (distance > maxDistanceSquared) {
        maxDistanceSquared = distance;
        maxIndex = index;
      }
    }

    if (maxDistanceSquared > toleranceSquared) {
      keep[maxIndex] = 1;
      stack.push([firstIndex, maxIndex], [maxIndex, lastIndex]);
    }
  }

  return points.filter((_, index) => keep[index]).map(copyPosition);
}

function closeRing(points: Position[]): Position[] {
  const closed = points.map(copyPosition);
  if (closed.length > 0 && !positionsEqual(closed[0], closed[closed.length - 1])) {
    closed.push(copyPosition(closed[0]));
  }
  return closed;
}

function positionsEqual(a: Position, b: Position): boolean {
  return a[0] === b[0] && a[1] === b[1];
}

function copyPosition(position: Position): Position {
  return [position[0], position[1]];
}

function segmentDistanceSquared(point: Position, start: Position, end: Position): number {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distanceSquared(point, start);

  const ratio = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  const projected: Position = [start[0] + ratio * dx, start[1] + ratio * dy];
  return distanceSquared(point, projected);
}

function distanceSquared(a: Position, b: Position): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function ringSignedArea(ring: Position[]): number {
  let area = 0;
  for (let index = 1; index < ring.length; index += 1) {
    const previous = ring[index - 1];
    const current = ring[index];
    area += previous[0] * current[1] - current[0] * previous[1];
  }
  return area / 2;
}
