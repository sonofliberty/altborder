import type { Geometry, Position } from "geojson";
import { countryLabelCharWidthRatio } from "./labelConstants";

export type ProjectPoint = (position: Position) => [number, number] | null | undefined;

export type FittedCountryLabel = {
  id: string;
  displayName: string;
  x: number;
  y: number;
  fontSize: number;
  letterSpacing: number;
  textLength: number;
  width: number;
  height: number;
  angle: number;
  priority: number;
};

export type CountryLabelInput = {
  id: string;
  name: string;
  geometries: Geometry[];
  project: ProjectPoint;
};

type Point = [number, number];

type Bounds = {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
};

type ProjectedPolygon = {
  rings: IndexedRing[];
  bounds: Bounds;
  area: number;
};

type IndexedRing = {
  points: Point[];
  bounds: Bounds;
  bucketScale: number;
  edgeBuckets: number[][];
};

type PolygonCluster = {
  polygons: ProjectedPolygon[];
  bounds: Bounds;
  area: number;
};

const labelAngles = [0, -8, 8, -15, 15];
const minMapFontSize = 0.5;
const maxMapFontSize = 24;
const areaFontRatio = 0.4;
const heightFontRatio = 0.72;
const labelHorizontalSafetyRatio = 0.95;
const labelVerticalSafetyRatio = 1.55;

export function layoutCountryLabel(input: CountryLabelInput): FittedCountryLabel | null {
  const displayName = input.name.trim().toUpperCase();
  if (!displayName) return null;

  const polygons = input.geometries.flatMap((geometry) => projectGeometryPolygons(geometry, input.project));
  const cluster = chooseLargestCluster(polygons);
  if (!cluster) return null;

  const candidates = candidatePoints(cluster);
  if (candidates.length === 0) return null;

  const label = fitLabel(displayName, cluster, candidates);
  if (!label) return null;

  return {
    id: input.id,
    displayName,
    x: label.x,
    y: label.y,
    fontSize: label.fontSize,
    letterSpacing: label.letterSpacing,
    textLength: label.textLength,
    width: label.width,
    height: label.height,
    angle: label.angle,
    priority: cluster.area,
  };
}

function fitLabel(
  displayName: string,
  cluster: PolygonCluster,
  candidates: Point[],
): Pick<FittedCountryLabel, "x" | "y" | "fontSize" | "letterSpacing" | "textLength" | "width" | "height" | "angle"> | null {
  const boundsWidth = cluster.bounds.maxX - cluster.bounds.minX;
  const boundsHeight = cluster.bounds.maxY - cluster.bounds.minY;
  const contentWidthRatio =
    displayName.length * countryLabelCharWidthRatio;
  const widthLimitedFont = (boundsWidth * 0.92) / Math.max(contentWidthRatio, 1);
  const heightLimitedFont = boundsHeight * heightFontRatio;
  const areaLimitedFont = Math.sqrt(cluster.area) * areaFontRatio;
  const maxFontSize = Math.min(maxMapFontSize, widthLimitedFont, heightLimitedFont, areaLimitedFont);

  for (const angle of labelAngles) {
    let fontSize = maxFontSize;
    while (fontSize >= minMapFontSize) {
      const letterSpacing = countryLabelLetterSpacing(fontSize);
      const textLength =
        displayName.length * countryLabelCharWidthRatio * fontSize +
        Math.max(0, displayName.length - 1) * letterSpacing;
      const width = textLength + fontSize * labelHorizontalSafetyRatio;
      const height = fontSize * labelVerticalSafetyRatio;
      for (const point of candidates) {
        if (labelRectangleFitsCluster(cluster, point, width, height, angle)) {
          return {
            x: point[0],
            y: point[1],
            fontSize,
            letterSpacing,
            textLength,
            width,
            height,
            angle,
          };
        }
      }
      fontSize *= 0.86;
    }
  }

  return null;
}

function countryLabelLetterSpacing(fontSize: number): number {
  const minimumRatio = 0.012;
  const maximumRatio = 0.085;
  const sizeProgress = Math.max(0, Math.min(1, (fontSize - 2) / 18));
  return fontSize * (minimumRatio + (maximumRatio - minimumRatio) * sizeProgress);
}

function projectGeometryPolygons(geometry: Geometry, project: ProjectPoint): ProjectedPolygon[] {
  if (geometry.type === "Polygon") {
    return projectPolygon(geometry.coordinates, project);
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.flatMap((polygon) => projectPolygon(polygon, project));
  }
  return [];
}

function projectPolygon(polygon: Position[][], project: ProjectPoint): ProjectedPolygon[] {
  const rings = polygon
    .map((ring) =>
      ring
        .map(project)
        .filter((point): point is Point => Boolean(point && Number.isFinite(point[0]) && Number.isFinite(point[1]))),
    )
    .filter((ring) => ring.length >= 4);

  if (rings.length === 0) return [];

  const area = Math.abs(ringArea(rings[0])) - rings.slice(1).reduce((total, ring) => total + Math.abs(ringArea(ring)), 0);
  if (area <= 0) return [];

  return [
    {
      rings: rings.map(indexRing),
      bounds: boundsForRings(rings),
      area,
    },
  ];
}

function chooseLargestCluster(polygons: ProjectedPolygon[]): PolygonCluster | null {
  if (polygons.length === 0) return null;

  const clusters: PolygonCluster[] = [];
  const visited = new Set<number>();

  for (let index = 0; index < polygons.length; index += 1) {
    if (visited.has(index)) continue;

    const stack = [index];
    const clusterPolygons: ProjectedPolygon[] = [];
    visited.add(index);

    while (stack.length > 0) {
      const currentIndex = stack.pop();
      if (currentIndex === undefined) continue;
      const current = polygons[currentIndex];
      clusterPolygons.push(current);

      for (let candidateIndex = 0; candidateIndex < polygons.length; candidateIndex += 1) {
        if (visited.has(candidateIndex)) continue;
        if (boundsTouch(current.bounds, polygons[candidateIndex].bounds, 0.65)) {
          visited.add(candidateIndex);
          stack.push(candidateIndex);
        }
      }
    }

    clusters.push({
      polygons: clusterPolygons,
      bounds: mergeBounds(clusterPolygons.map((polygon) => polygon.bounds)),
      area: clusterPolygons.reduce((total, polygon) => total + polygon.area, 0),
    });
  }

  return clusters.sort((a, b) => b.area - a.area)[0] ?? null;
}

function candidatePoints(cluster: PolygonCluster): Point[] {
  const center: Point = [
    (cluster.bounds.minX + cluster.bounds.maxX) / 2,
    (cluster.bounds.minY + cluster.bounds.maxY) / 2,
  ];
  const candidates: Array<{ point: Point; score: number }> = [];
  const xSteps = 11;
  const ySteps = 8;

  for (let yIndex = 1; yIndex < ySteps; yIndex += 1) {
    for (let xIndex = 1; xIndex < xSteps; xIndex += 1) {
      const point: Point = [
        cluster.bounds.minX + ((cluster.bounds.maxX - cluster.bounds.minX) * xIndex) / xSteps,
        cluster.bounds.minY + ((cluster.bounds.maxY - cluster.bounds.minY) * yIndex) / ySteps,
      ];
      if (clusterContainsPoint(cluster, point)) {
        candidates.push({
          point,
          score: Math.hypot(point[0] - center[0], point[1] - center[1]),
        });
      }
    }
  }

  if (clusterContainsPoint(cluster, center)) {
    candidates.push({ point: center, score: -1 });
  }

  return candidates.sort((a, b) => a.score - b.score).map((candidate) => candidate.point);
}

function labelRectangleFitsCluster(
  cluster: PolygonCluster,
  center: Point,
  width: number,
  height: number,
  angleDegrees: number,
): boolean {
  const rectangle = makeRotatedRectangle(center, width, height, angleDegrees);
  return clusterContainsRectangle(cluster, rectangle);
}

function makeRotatedRectangle(center: Point, width: number, height: number, angleDegrees: number): Point[] {
  const halfWidth = width / 2;
  const halfHeight = height / 2;
  const localCorners: Point[] = [
    [-halfWidth, -halfHeight],
    [halfWidth, -halfHeight],
    [halfWidth, halfHeight],
    [-halfWidth, halfHeight],
  ];
  const angle = (angleDegrees * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  return localCorners.map(([x, y]) => [center[0] + x * cos - y * sin, center[1] + x * sin + y * cos]);
}

function clusterContainsRectangle(cluster: PolygonCluster, rectangle: Point[]): boolean {
  const sampleSteps = 6;
  for (let yIndex = 0; yIndex <= sampleSteps; yIndex += 1) {
    const yRatio = yIndex / sampleSteps;
    for (let xIndex = 0; xIndex <= sampleSteps; xIndex += 1) {
      const xRatio = xIndex / sampleSteps;
      if (!clusterContainsPoint(cluster, interpolateRectanglePoint(rectangle, xRatio, yRatio))) {
        return false;
      }
    }
  }

  return true;
}

function interpolateRectanglePoint(rectangle: Point[], xRatio: number, yRatio: number): Point {
  const top = interpolatePoint(rectangle[0], rectangle[1], xRatio);
  const bottom = interpolatePoint(rectangle[3], rectangle[2], xRatio);
  return interpolatePoint(top, bottom, yRatio);
}

function interpolatePoint(a: Point, b: Point, ratio: number): Point {
  return [a[0] + (b[0] - a[0]) * ratio, a[1] + (b[1] - a[1]) * ratio];
}

function clusterContainsPoint(cluster: PolygonCluster, point: Point): boolean {
  return cluster.polygons.some((polygon) => polygonContainsPoint(polygon, point));
}

function polygonContainsPoint(polygon: ProjectedPolygon, point: Point): boolean {
  if (!ringContainsPoint(polygon.rings[0], point)) return false;
  return polygon.rings.slice(1).every((hole) => !ringContainsPoint(hole, point));
}

function ringContainsPoint(ring: IndexedRing, point: Point): boolean {
  let inside = false;
  const x = point[0];
  const y = point[1];
  const { points, bounds, edgeBuckets, bucketScale } = ring;
  if (x < bounds.minX || x > bounds.maxX || y < bounds.minY || y > bounds.maxY) return false;
  const bucket = Math.min(edgeBuckets.length - 1, Math.floor((y - bounds.minY) * bucketScale));

  for (const index of edgeBuckets[bucket]) {
    const current = points[index];
    const previous = points[index === 0 ? points.length - 1 : index - 1];
    const x1 = current[0];
    const y1 = current[1];
    const x2 = previous[0];
    const y2 = previous[1];
    const crossesRay = y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1;
    if (crossesRay) inside = !inside;
  }

  return inside;
}

function indexRing(points: Point[]): IndexedRing {
  const bounds = boundsForRings([points]);
  const bucketCount = Math.min(64, Math.ceil(Math.sqrt(points.length)));
  const height = bounds.maxY - bounds.minY;
  const bucketScale = height > 0 ? bucketCount / height : 0;
  const edgeBuckets: number[][] = Array.from({ length: bucketCount }, () => []);

  // A horizontal ray can only cross edges in its own vertical band.
  for (let index = 0; index < points.length; index += 1) {
    const y1 = points[index][1];
    const y2 = points[index === 0 ? points.length - 1 : index - 1][1];
    if (y1 === y2) continue;
    const first = Math.min(bucketCount - 1, Math.floor((Math.min(y1, y2) - bounds.minY) * bucketScale));
    const last = Math.min(bucketCount - 1, Math.floor((Math.max(y1, y2) - bounds.minY) * bucketScale));
    for (let bucket = first; bucket <= last; bucket += 1) edgeBuckets[bucket].push(index);
  }

  return { points, bounds, bucketScale, edgeBuckets };
}

function ringArea(ring: Point[]): number {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function boundsForRings(rings: Point[][]): Bounds {
  return mergeBounds(
    rings.map((ring) => ({
      minX: Math.min(...ring.map((point) => point[0])),
      minY: Math.min(...ring.map((point) => point[1])),
      maxX: Math.max(...ring.map((point) => point[0])),
      maxY: Math.max(...ring.map((point) => point[1])),
    })),
  );
}

function mergeBounds(boundsList: Bounds[]): Bounds {
  return {
    minX: Math.min(...boundsList.map((bounds) => bounds.minX)),
    minY: Math.min(...boundsList.map((bounds) => bounds.minY)),
    maxX: Math.max(...boundsList.map((bounds) => bounds.maxX)),
    maxY: Math.max(...boundsList.map((bounds) => bounds.maxY)),
  };
}

function boundsTouch(a: Bounds, b: Bounds, tolerance: number): boolean {
  return (
    a.minX - tolerance <= b.maxX &&
    a.maxX + tolerance >= b.minX &&
    a.minY - tolerance <= b.maxY &&
    a.maxY + tolerance >= b.minY
  );
}
