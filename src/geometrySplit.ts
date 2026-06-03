import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import BufferOp from "jsts/org/locationtech/jts/operation/buffer/BufferOp.js";
import OverlayOp from "jsts/org/locationtech/jts/operation/overlay/OverlayOp.js";
import Polygonizer from "jsts/org/locationtech/jts/operation/polygonize/Polygonizer.js";
import RelateOp from "jsts/org/locationtech/jts/operation/relate/RelateOp.js";
import UnaryUnionOp from "jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js";
import ArrayList from "jsts/java/util/ArrayList.js";
import type { Geometry, Position } from "geojson";
import type { RegionRecord } from "./types";

type JstsGeometry = {
  getArea(): number;
  getBoundary(): JstsGeometry;
  getEnvelopeInternal(): {
    getMinX(): number;
    getMinY(): number;
    getMaxX(): number;
    getMaxY(): number;
  };
  getGeometryN(index: number): JstsGeometry;
  getNumGeometries(): number;
  isEmpty(): boolean;
};

type SplitCandidate = {
  geometry: JstsGeometry;
  geoJson: Geometry;
  area: number;
};

export type SplitPiece = {
  geometry: Geometry;
  area: number;
};

export type CountrySplit =
  | {
      ok: true;
      pieces: [SplitPiece, SplitPiece];
      defaultNewPieceIndex: 0 | 1;
      untouchedGeometry: Geometry | null;
    }
  | { ok: false; reason: string };

const reader = new GeoJSONReader(new GeometryFactory());
const writer = new GeoJSONWriter();
const minArea = 1e-10;
const splitSimplifyTolerance = 0.0015;
const outputSimplifyTolerance = 0.004;

export function splitCountryGeometry(regions: RegionRecord[], cutLine: Position[]): CountrySplit {
  if (regions.length === 0) {
    return { ok: false, reason: "Select a country before drawing a border." };
  }
  if (cutLine.length < 2) {
    return { ok: false, reason: "Draw a longer border line across the selected country." };
  }

  try {
    const countryGeometry = unionJstsGeometries(
      regions.map((region) => readGeometry(simplifyGeometry(region.geometry))),
    );
    const components = decomposePolygonComponents(countryGeometry);
    const originalLine = readGeometry({
      type: "LineString",
      coordinates: cutLine,
    });
    const lineBounds = boundsForCoordinates(cutLine);

    const untouched: JstsGeometry[] = [];
    const splitComponents: Array<[JstsGeometry, JstsGeometry]> = [];

    for (const component of components) {
      const split = splitPolygonComponent(component, originalLine, cutLine, lineBounds);
      if (split) {
        splitComponents.push(split);
      } else {
        untouched.push(component);
      }
    }

    if (splitComponents.length === 0) {
      return { ok: false, reason: "Draw the line so it clearly enters and exits the selected country." };
    }
    if (splitComponents.length > 1) {
      return { ok: false, reason: "Draw a border that cuts one continuous part of the country." };
    }

    const pieces = splitComponents[0].map((piece) => ({
      geometry: writeGeometry(piece),
      area: piece.getArea(),
    })) as [SplitPiece, SplitPiece];

    return {
      ok: true,
      pieces,
      defaultNewPieceIndex: pieces[0].area <= pieces[1].area ? 0 : 1,
      untouchedGeometry: unionGeoJsonGeometries(untouched.map(writeGeometry)),
    };
  } catch {
    return { ok: false, reason: "Could not split this country with the drawn line." };
  }
}

export function separateCountryIsland(regions: RegionRecord[], point: Position): CountrySplit {
  if (regions.length === 0) {
    return { ok: false, reason: "Select a country before choosing an island." };
  }

  try {
    const countryGeometry = unionJstsGeometries(
      regions.map((region) => readGeometry(simplifyGeometry(region.geometry))),
    );
    const components = decomposePolygonComponents(countryGeometry);
    if (components.length < 2) {
      return { ok: false, reason: "This country has no separate island to detach." };
    }

    const componentGeometries = components.map(writeGeometry);
    const islandIndex = componentGeometries.findIndex((geometry) => polygonalGeometryContainsPoint(geometry, point));
    if (islandIndex < 0) {
      return { ok: false, reason: "Click a separate island inside the selected country." };
    }

    const island = components[islandIndex];
    const remainderComponents = components.filter((_, index) => index !== islandIndex);
    const remainderGeometry = unionGeoJsonGeometries(remainderComponents.map(writeGeometry));
    if (!remainderGeometry) {
      return { ok: false, reason: "This island cannot be separated from the selected country." };
    }

    const remainder = readGeometry(remainderGeometry);

    return {
      ok: true,
      pieces: [
        {
          geometry: writeGeometry(island),
          area: island.getArea(),
        },
        {
          geometry: writeGeometry(remainder),
          area: remainder.getArea(),
        },
      ],
      defaultNewPieceIndex: 0,
      untouchedGeometry: null,
    };
  } catch {
    return { ok: false, reason: "Could not separate this island from the selected country." };
  }
}

export function buildDivideTerritories(
  split: Extract<CountrySplit, { ok: true }>,
  newPieceIndex: 0 | 1,
): { existingGeometry: Geometry; newGeometry: Geometry } {
  const existingPieceIndex = newPieceIndex === 0 ? 1 : 0;
  const existingGeometry = unionGeoJsonGeometries(
    [split.untouchedGeometry, split.pieces[existingPieceIndex].geometry].filter(Boolean) as Geometry[],
  );

  return {
    existingGeometry: existingGeometry ?? split.pieces[existingPieceIndex].geometry,
    newGeometry: split.pieces[newPieceIndex].geometry,
  };
}

export function unionGeoJsonGeometries(geometries: Geometry[]): Geometry | null {
  const readable = geometries.filter(isPolygonalGeometry);
  if (readable.length === 0) return null;
  if (readable.length === 1) return readable[0];
  return writeGeometry(unionJstsGeometries(readable.map(readGeometry)));
}

export function unionGeoJsonGeometriesClosingGaps(
  geometries: Geometry[],
  gapTolerance: number,
): Geometry | null {
  const readable = geometries.filter(isPolygonalGeometry);
  if (readable.length === 0) return null;
  if (readable.length === 1) return readable[0];

  const unioned = unionJstsGeometries(readable.map(readGeometry));
  if (gapTolerance <= 0) return writeGeometry(unioned);

  const expanded = BufferOp.bufferOp(unioned, gapTolerance) as JstsGeometry;
  const closed = BufferOp.bufferOp(expanded, -gapTolerance) as JstsGeometry;
  return writeGeometry(closed);
}

export function subtractGeoJsonGeometries(
  baseGeometry: Geometry,
  subtractGeometries: Geometry[],
): Geometry | null {
  if (!isPolygonalGeometry(baseGeometry)) return null;
  const readable = subtractGeometries.filter(isPolygonalGeometry);
  if (readable.length === 0) return baseGeometry;

  const base = readGeometry(baseGeometry);
  const subtract = unionJstsGeometries(readable.map(readGeometry));
  const difference = OverlayOp.difference(base, subtract) as JstsGeometry;
  if (difference.isEmpty()) return null;
  return writeGeometry(difference);
}

function splitPolygonComponent(
  component: JstsGeometry,
  originalLine: JstsGeometry,
  cutLineCoordinates: Position[],
  lineBounds: [number, number, number, number],
): [JstsGeometry, JstsGeometry] | null {
  const bounds = boundsForGeometry(component);
  if (!boundsOverlap(bounds, lineBounds)) {
    return null;
  }
  if (!RelateOp.intersects(component, originalLine) || lineLength(cutLineCoordinates) < minimumCutLength(bounds)) {
    return null;
  }
  if (lineStaysInsideComponent(component, cutLineCoordinates)) {
    return null;
  }

  const componentArea = component.getArea();
  try {
    const clippedLine = OverlayOp.intersection(component, originalLine) as JstsGeometry;
    const clippedSplit = splitPolygonComponentWithLine(component, clippedLine, componentArea, cutLineCoordinates);
    if (clippedSplit) {
      return clippedSplit;
    }
  } catch {
    // Fall back to the extended-line split path below.
  }

  const extendedLine = readGeometry({
    type: "LineString",
    coordinates: extendLineToBounds(cutLineCoordinates, bounds),
  });
  return splitPolygonComponentWithLine(component, extendedLine, componentArea, cutLineCoordinates);
}

function splitPolygonComponentWithLine(
  component: JstsGeometry,
  splitLine: JstsGeometry,
  componentArea: number,
  cutLineCoordinates: Position[],
): [JstsGeometry, JstsGeometry] | null {
  try {
    const splitLineGeoJson = rawWriteGeometry(splitLine);
    if (!isLinealGeometry(splitLineGeoJson)) {
      return null;
    }

    const polygonizer = new Polygonizer();
    polygonizer.add(OverlayOp.union(component.getBoundary(), splitLine));
    const polygonized = polygonizer.getPolygons().array as JstsGeometry[];
    const artifactArea = artifactAreaThreshold(componentArea);
    const pieces = polygonized
      .map((polygon) => OverlayOp.intersection(component, polygon) as JstsGeometry)
      .map((geometry) => ({ geometry, geoJson: rawWriteGeometry(geometry), area: geometry.getArea() }))
      .filter((piece): piece is SplitCandidate => piece.area > artifactArea && isPolygonalGeometry(piece.geoJson));

    if (pieces.length === 2) {
      return validateSplitPair(componentArea, artifactArea, [pieces[0].geometry, pieces[1].geometry]);
    }

    if (pieces.length < 2) {
      return null;
    }

    return groupSplitCandidatesByCutSide(componentArea, artifactArea, pieces, cutLineCoordinates);
  } catch {
    return null;
  }
}

function groupSplitCandidatesByCutSide(
  componentArea: number,
  artifactArea: number,
  pieces: SplitCandidate[],
  cutLineCoordinates: Position[],
): [JstsGeometry, JstsGeometry] | null {
  const left: JstsGeometry[] = [];
  const right: JstsGeometry[] = [];
  let leftArea = 0;
  let rightArea = 0;
  const ambiguousArtifacts: SplitCandidate[] = [];

  for (const piece of pieces) {
    const side = classifyGeometrySide(piece.geoJson, cutLineCoordinates);
    if (side < 0) {
      left.push(piece.geometry);
      leftArea += piece.area;
    } else if (side > 0) {
      right.push(piece.geometry);
      rightArea += piece.area;
    } else if (piece.area <= artifactArea) {
      ambiguousArtifacts.push(piece);
    } else {
      return null;
    }
  }

  for (const artifact of ambiguousArtifacts) {
    if (leftArea >= rightArea) {
      left.push(artifact.geometry);
      leftArea += artifact.area;
    } else {
      right.push(artifact.geometry);
      rightArea += artifact.area;
    }
  }

  if (left.length === 0 || right.length === 0) {
    return null;
  }

  return validateSplitPair(componentArea, artifactArea, [
    unionJstsGeometries(left),
    unionJstsGeometries(right),
  ]);
}

function validateSplitPair(
  componentArea: number,
  artifactArea: number,
  pair: [JstsGeometry, JstsGeometry],
): [JstsGeometry, JstsGeometry] | null {
  const firstArea = pair[0].getArea();
  const secondArea = pair[1].getArea();
  if (firstArea <= artifactArea || secondArea <= artifactArea) {
    return null;
  }

  const coverageTolerance = Math.max(componentArea * 1e-5, 1e-9);
  if (Math.abs(firstArea + secondArea - componentArea) > coverageTolerance) {
    return null;
  }

  return pair;
}

function lineStaysInsideComponent(component: JstsGeometry, cutLineCoordinates: Position[]): boolean {
  const componentGeometry = rawWriteGeometry(component);
  if (!isPolygonalGeometry(componentGeometry)) return false;
  return cutLineCoordinates.every((position) => polygonalGeometryInteriorContainsPoint(componentGeometry, position));
}

function artifactAreaThreshold(componentArea: number): number {
  return Math.max(minArea, componentArea * 1e-8);
}

function classifyGeometrySide(geometry: Geometry, cutLineCoordinates: Position[]): -1 | 0 | 1 {
  const tolerance = Math.max(lineLength(cutLineCoordinates) * 1e-10, 1e-12);
  let strongestSignedDistance = 0;

  for (const point of representativePointsForGeometry(geometry)) {
    const signedDistance = signedDistanceToNearestLineSegment(point, cutLineCoordinates);
    if (Math.abs(signedDistance) > Math.abs(strongestSignedDistance)) {
      strongestSignedDistance = signedDistance;
    }
  }

  if (Math.abs(strongestSignedDistance) <= tolerance) {
    return 0;
  }

  return strongestSignedDistance < 0 ? -1 : 1;
}

function signedDistanceToNearestLineSegment(point: Position, line: Position[]): number {
  let nearestDistanceSquared = Infinity;
  let nearestSignedDistance = 0;

  for (let index = 1; index < line.length; index += 1) {
    const start = line[index - 1];
    const end = line[index];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const lengthSquared = dx * dx + dy * dy;
    if (lengthSquared === 0) continue;

    const projection = Math.max(
      0,
      Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared),
    );
    const projectedX = start[0] + projection * dx;
    const projectedY = start[1] + projection * dy;
    const distanceSquared = (point[0] - projectedX) ** 2 + (point[1] - projectedY) ** 2;

    if (distanceSquared < nearestDistanceSquared) {
      nearestDistanceSquared = distanceSquared;
      const cross = dx * (point[1] - start[1]) - dy * (point[0] - start[0]);
      nearestSignedDistance = cross / Math.sqrt(lengthSquared);
    }
  }

  return nearestSignedDistance;
}

function representativePointsForGeometry(geometry: Geometry): Position[] {
  const polygons = polygonsForGeometry(geometry)
    .map((polygon) => ({ polygon, area: polygonArea(polygon) }))
    .sort((a, b) => b.area - a.area);
  const largest = polygons[0]?.polygon;
  if (!largest) return [];

  const shell = largest[0] ?? [];
  const centroid = ringCentroid(shell);
  const points: Position[] = centroid ? [centroid] : [];
  const step = Math.max(1, Math.floor(shell.length / 8));

  for (let index = 0; index < shell.length - 1; index += step) {
    points.push(shell[index]);
  }

  for (let index = 1; index < shell.length; index += step) {
    points.push([
      (shell[index - 1][0] + shell[index][0]) / 2,
      (shell[index - 1][1] + shell[index][1]) / 2,
    ]);
  }

  return points;
}

function polygonsForGeometry(geometry: Geometry): Position[][][] {
  if (geometry.type === "Polygon") {
    return [geometry.coordinates];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates;
  }
  return [];
}

function polygonArea(polygon: Position[][]): number {
  return Math.max(
    0,
    Math.abs(ringSignedArea(polygon[0] ?? [])) -
      polygon.slice(1).reduce((total, ring) => total + Math.abs(ringSignedArea(ring)), 0),
  );
}

function ringCentroid(ring: Position[]): Position | null {
  if (ring.length === 0) return null;

  let twiceArea = 0;
  let x = 0;
  let y = 0;

  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    const cross = current[0] * next[1] - next[0] * current[1];
    twiceArea += cross;
    x += (current[0] + next[0]) * cross;
    y += (current[1] + next[1]) * cross;
  }

  if (Math.abs(twiceArea) < 1e-12) {
    return averagePosition(ring);
  }

  return [x / (3 * twiceArea), y / (3 * twiceArea)];
}

function averagePosition(points: Position[]): Position | null {
  if (points.length === 0) return null;
  const total = points.reduce(
    (sum, point) => [sum[0] + point[0], sum[1] + point[1]] as Position,
    [0, 0],
  );
  return [total[0] / points.length, total[1] / points.length];
}

function ringSignedArea(ring: Position[]): number {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function unionJstsGeometries(geometries: JstsGeometry[]): JstsGeometry {
  if (geometries.length === 1) return geometries[0];
  const list = new ArrayList([]);
  for (const geometry of geometries) {
    list.add(geometry);
  }
  return UnaryUnionOp.union(list);
}

function decomposePolygonComponents(geometry: JstsGeometry): JstsGeometry[] {
  const geoJson = rawWriteGeometry(geometry);
  if (geoJson.type === "Polygon") return [geometry];
  if (geoJson.type !== "MultiPolygon") return [];

  const components: JstsGeometry[] = [];
  for (let index = 0; index < geometry.getNumGeometries(); index += 1) {
    components.push(geometry.getGeometryN(index));
  }
  return components;
}

function readGeometry(geometry: Geometry): JstsGeometry {
  const jstsGeometry = reader.read(geometry) as JstsGeometry;
  return isPolygonalGeometry(geometry) ? (BufferOp.bufferOp(jstsGeometry, 0) as JstsGeometry) : jstsGeometry;
}

function writeGeometry(geometry: JstsGeometry): Geometry {
  return finalizeOutputGeometry(rawWriteGeometry(geometry));
}

function rawWriteGeometry(geometry: JstsGeometry): Geometry {
  return writer.write(geometry) as Geometry;
}

function boundsForGeometry(geometry: JstsGeometry): [number, number, number, number] {
  const envelope = geometry.getEnvelopeInternal();
  return [envelope.getMinX(), envelope.getMinY(), envelope.getMaxX(), envelope.getMaxY()];
}

function boundsForCoordinates(coordinates: Position[]): [number, number, number, number] {
  const bounds: [number, number, number, number] = [Infinity, Infinity, -Infinity, -Infinity];
  for (const position of coordinates) {
    bounds[0] = Math.min(bounds[0], position[0]);
    bounds[1] = Math.min(bounds[1], position[1]);
    bounds[2] = Math.max(bounds[2], position[0]);
    bounds[3] = Math.max(bounds[3], position[1]);
  }
  return bounds;
}

function boundsOverlap(a: [number, number, number, number], b: [number, number, number, number]): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function extendLineToBounds(line: Position[], bounds: [number, number, number, number]): Position[] {
  const [minX, minY, maxX, maxY] = bounds;
  const span = Math.max(maxX - minX, maxY - minY, 1);
  const padding = span * 3;
  const first = line[0];
  const second = line[1];
  const last = line[line.length - 1];
  const previous = line[line.length - 2];

  return [
    extendPoint(first, [first[0] - second[0], first[1] - second[1]], padding),
    ...line,
    extendPoint(last, [last[0] - previous[0], last[1] - previous[1]], padding),
  ];
}

function extendPoint(point: Position, direction: [number, number], distance: number): Position {
  const length = Math.hypot(direction[0], direction[1]) || 1;
  return [point[0] + (direction[0] / length) * distance, point[1] + (direction[1] / length) * distance];
}

function lineLength(line: Position[]): number {
  return line.slice(1).reduce((total, point, index) => {
    const previous = line[index];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
}

function minimumCutLength(bounds: [number, number, number, number]): number {
  const [minX, minY, maxX, maxY] = bounds;
  const width = Math.max(maxX - minX, 0);
  const height = Math.max(maxY - minY, 0);
  return Math.max(Math.hypot(width, height) * 0.01, 1e-8);
}

function simplifyGeometry(geometry: Geometry): Geometry {
  if (!isPolygonalGeometry(geometry)) return geometry;
  return simplifyPolygonalGeometry(geometry, splitSimplifyTolerance);
}

function finalizeOutputGeometry(geometry: Geometry): Geometry {
  if (!isPolygonalGeometry(geometry)) return geometry;
  return roundGeometryCoordinates(simplifyPolygonalGeometry(geometry, outputSimplifyTolerance));
}

function simplifyPolygonalGeometry(geometry: Geometry, tolerance: number): Geometry {
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

function roundGeometryCoordinates(geometry: Geometry): Geometry {
  if (geometry.type === "Polygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((ring) => ring.map(roundPosition)),
    };
  }
  if (geometry.type === "MultiPolygon") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => ring.map(roundPosition))),
    };
  }
  return geometry;
}

function roundPosition(position: Position): Position {
  return [roundCoordinate(position[0]), roundCoordinate(position[1])];
}

function roundCoordinate(value: number): number {
  return Number(value.toFixed(5));
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

function polygonalGeometryInteriorContainsPoint(geometry: Geometry, point: Position): boolean {
  if (!polygonalGeometryContainsPoint(geometry, point)) return false;
  return !polygonalGeometryBoundaryContainsPoint(geometry, point);
}

function polygonalGeometryBoundaryContainsPoint(geometry: Geometry, point: Position): boolean {
  if (geometry.type === "Polygon") {
    return polygonBoundaryContainsPoint(geometry.coordinates, point);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.some((polygon) => polygonBoundaryContainsPoint(polygon, point));
  }
  return false;
}

function polygonBoundaryContainsPoint(polygon: Position[][], point: Position): boolean {
  return polygon.some((ring) => ringBoundaryContainsPoint(ring, point));
}

function ringBoundaryContainsPoint(ring: Position[], point: Position): boolean {
  const tolerance = 1e-9;
  for (let index = 1; index < ring.length; index += 1) {
    if (pointOnSegment(point, ring[index - 1], ring[index], tolerance)) {
      return true;
    }
  }
  return false;
}

function pointOnSegment(point: Position, start: Position, end: Position, tolerance: number): boolean {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distanceSquared(point, start) <= tolerance * tolerance;

  const cross = dx * (point[1] - start[1]) - dy * (point[0] - start[0]);
  if (Math.abs(cross) > tolerance * Math.sqrt(lengthSquared)) return false;

  const dot = (point[0] - start[0]) * dx + (point[1] - start[1]) * dy;
  return dot >= -tolerance && dot <= lengthSquared + tolerance;
}

function distanceSquared(a: Position, b: Position): number {
  return (a[0] - b[0]) ** 2 + (a[1] - b[1]) ** 2;
}

function polygonContainsPoint(polygon: Position[][], point: Position): boolean {
  if (polygon.length === 0 || !ringContainsPoint(polygon[0], point)) {
    return false;
  }
  return polygon.slice(1).every((hole) => !ringContainsPoint(hole, point));
}

function ringContainsPoint(ring: Position[], point: Position): boolean {
  let inside = false;
  const x = point[0];
  const y = point[1];

  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    const x1 = current[0];
    const y1 = current[1];
    const x2 = previous[0];
    const y2 = previous[1];
    const crossesRay = y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1;

    if (crossesRay) {
      inside = !inside;
    }
  }

  return inside;
}

function isPolygonalGeometry(geometry: Geometry | null): geometry is Geometry {
  return Boolean(geometry && (geometry.type === "Polygon" || geometry.type === "MultiPolygon"));
}

function isLinealGeometry(geometry: Geometry | null): geometry is Geometry {
  if (!geometry) return false;
  if (geometry.type === "LineString" || geometry.type === "MultiLineString") return true;
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.some(isLinealGeometry);
  }
  return false;
}
