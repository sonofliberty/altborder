import { geoPath } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { Geometry, Position } from "geojson";
import type { ProjectedBounds } from "./mapZoom";

export type ProjectedPathData = {
  pathData: string;
  strokePathData: string;
  bounds: ProjectedBounds;
};

type ProjectedPathOptions = {
  coordinatePrecision?: number;
  seamBreakDistance?: number;
  preferManualFill?: boolean;
};

type GeoPathWithDigits = ReturnType<typeof geoPath> & {
  digits?: (digits: number) => ReturnType<typeof geoPath>;
};

export function geometryToSvgPath(
  geometry: Geometry,
  projection: GeoProjection,
  options?: ProjectedPathOptions,
): string {
  return projectGeometryToPathData(geometry, projection, options)?.pathData ?? "";
}

export function projectGeometryToPathData(
  geometry: Geometry,
  projection: GeoProjection,
  options: ProjectedPathOptions = {},
): ProjectedPathData | null {
  const projectedStroke = projectGeometryToStrokePathData(geometry, projection, options);
  if (!projectedStroke.bounds) return null;

  if (geometry.type === "LineString" || geometry.type === "MultiLineString") {
    return projectedStroke.pathData
      ? {
          pathData: projectedStroke.pathData,
          strokePathData: projectedStroke.pathData,
          bounds: projectedStroke.bounds,
        }
      : null;
  }

  let pathGenerator = geoPath(projection) as GeoPathWithDigits;
  if (pathGenerator.digits && options.coordinatePrecision !== undefined) {
    pathGenerator = pathGenerator.digits(options.coordinatePrecision) as GeoPathWithDigits;
  }

  const d3PathData = pathGenerator(geometry);
  if (!d3PathData) return null;
  const d3Bounds = pathGenerator.bounds(geometry);
  const pathData =
    options.preferManualFill || shouldUseManualFillPath(d3PathData, d3Bounds, projectedStroke.bounds)
      ? projectedStroke.pathData
      : d3PathData;
  if (!pathData) return null;

  return {
    pathData,
    strokePathData: projectedStroke.pathData || pathData,
    bounds: projectedStroke.bounds,
  };
}

type ProjectedStrokePathData = {
  pathData: string;
  bounds: ProjectedBounds | null;
};

type ProjectionAccumulator = {
  bounds: ProjectedBounds | null;
};

function projectGeometryToStrokePathData(
  geometry: Geometry,
  projection: GeoProjection,
  options: ProjectedPathOptions,
): ProjectedStrokePathData {
  const accumulator: ProjectionAccumulator = { bounds: null };
  const pathData = projectGeometryToStrokePathDataInternal(geometry, projection, options, accumulator);

  return {
    pathData,
    bounds: accumulator.bounds,
  };
}

function projectGeometryToStrokePathDataInternal(
  geometry: Geometry,
  projection: GeoProjection,
  options: ProjectedPathOptions,
  accumulator: ProjectionAccumulator,
): string {
  if (geometry.type === "Polygon") {
    return projectPolygonToStrokePathData(geometry.coordinates, projection, options, accumulator);
  }

  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates
      .map((polygon) => projectPolygonToStrokePathData(polygon, projection, options, accumulator))
      .join("");
  }

  if (geometry.type === "GeometryCollection") {
    return geometry.geometries
      .map((childGeometry) => projectGeometryToStrokePathDataInternal(childGeometry, projection, options, accumulator))
      .join("");
  }

  if (geometry.type === "LineString") {
    return projectLineStringToPathData(geometry.coordinates, projection, options, accumulator);
  }

  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.map((line) => projectLineStringToPathData(line, projection, options, accumulator)).join("");
  }

  if (geometry.type === "Point") {
    projectPosition(geometry.coordinates, projection, accumulator);
    return "";
  }

  if (geometry.type === "MultiPoint") {
    for (const position of geometry.coordinates) {
      projectPosition(position, projection, accumulator);
    }
  }

  return "";
}

function projectLineStringToPathData(
  line: Position[],
  projection: GeoProjection,
  options: ProjectedPathOptions,
  accumulator: ProjectionAccumulator,
): string {
  let pathData = "";
  let subpathData = "";
  let previousPosition: Position | null = null;
  let previousPoint: [number, number] | null = null;
  let subpathDrawablePoints = 0;

  const commitSubpath = () => {
    if (subpathDrawablePoints >= 2) {
      pathData += subpathData;
    }
    subpathData = "";
    subpathDrawablePoints = 0;
  };

  for (const position of line) {
    const point = projectPosition(position, projection, accumulator);
    if (!point) continue;
    const crossesAntimeridianBoundary = previousPosition ? crossesAntimeridian(previousPosition, position) : false;
    const crossesProjectionSeam = crossesProjectedSeam(previousPoint, point, options.seamBreakDistance);
    const crossesStrokeSeam = previousPosition
      ? crossesLikelyProjectedStrokeSeam(previousPosition, position, previousPoint, point)
      : false;
    const startsSubpath =
      subpathDrawablePoints === 0 ||
      !previousPosition ||
      crossesAntimeridianBoundary ||
      crossesProjectionSeam ||
      crossesStrokeSeam;

    if (startsSubpath) {
      commitSubpath();
      subpathData = `M${formatPoint(point, options.coordinatePrecision)}`;
      subpathDrawablePoints = 1;
    } else {
      subpathData += `L${formatPoint(point, options.coordinatePrecision)}`;
      subpathDrawablePoints += 1;
    }

    previousPosition = position;
    previousPoint = point;
  }

  commitSubpath();
  return pathData;
}

function projectPolygonToStrokePathData(
  polygon: Position[][],
  projection: GeoProjection,
  options: ProjectedPathOptions,
  accumulator: ProjectionAccumulator,
): string {
  let polygonPathData = "";

  for (const ring of polygon) {
    const drawableRing = hasDuplicateClosingPosition(ring) ? ring.slice(0, -1) : ring;
    if (drawableRing.length < 3) continue;

    let ringPathData = "";
    let subpathData = "";
    let subpathStartPosition = drawableRing[0];
    let subpathStartPoint: [number, number] | null = null;
    let previousPosition = drawableRing[0];
    let previousPoint: [number, number] | null = null;
    let subpathDrawablePoints = 0;

    const commitSubpath = (close: boolean) => {
      if (subpathDrawablePoints >= 3) {
        ringPathData += close ? `${subpathData}Z` : subpathData;
      }
      subpathData = "";
      subpathStartPoint = null;
      subpathDrawablePoints = 0;
    };

    for (const position of drawableRing) {
      const point = projectPosition(position, projection, accumulator);
      if (!point) continue;
      const crossesAntimeridianBoundary = crossesAntimeridian(previousPosition, position);
      const crossesProjectionSeam = crossesProjectedSeam(previousPoint, point, options.seamBreakDistance);
      const crossesStrokeSeam = crossesLikelyProjectedStrokeSeam(previousPosition, position, previousPoint, point);
      const startsSubpath =
        subpathDrawablePoints === 0 ||
        crossesAntimeridianBoundary ||
        crossesProjectionSeam ||
        crossesStrokeSeam;

      if (startsSubpath) {
        const startsAfterSeam =
          subpathDrawablePoints > 0 &&
          (crossesAntimeridianBoundary || crossesProjectionSeam || crossesStrokeSeam);
        commitSubpath(!startsAfterSeam);
        subpathData = `M${formatPoint(point, options.coordinatePrecision)}`;
        subpathStartPosition = position;
        subpathStartPoint = point;
        subpathDrawablePoints = 1;
      } else {
        subpathData += `L${formatPoint(point, options.coordinatePrecision)}`;
        subpathDrawablePoints += 1;
      }

      previousPosition = position;
      previousPoint = point;
    }

    const closesAcrossSeam =
      crossesAntimeridian(previousPosition, subpathStartPosition) ||
      crossesProjectedSeam(previousPoint, subpathStartPoint, options.seamBreakDistance) ||
      crossesLikelyProjectedStrokeSeam(previousPosition, subpathStartPosition, previousPoint, subpathStartPoint) ||
      crossesLikelyProjectedClosureArtifact(previousPoint, subpathStartPoint);
    commitSubpath(!closesAcrossSeam);

    polygonPathData += ringPathData;
  }

  return polygonPathData;
}

function hasDuplicateClosingPosition(ring: Position[]): boolean {
  if (ring.length < 2) return false;
  const first = ring[0];
  const last = ring[ring.length - 1];
  return first[0] === last[0] && first[1] === last[1];
}

function formatPoint(point: [number, number], precision = 2): string {
  return `${point[0].toFixed(precision)},${point[1].toFixed(precision)}`;
}

function projectPosition(
  position: Position,
  projection: GeoProjection,
  accumulator: ProjectionAccumulator,
): [number, number] | null {
  const point = projection([position[0], position[1]]);
  if (!point || !Number.isFinite(point[0]) || !Number.isFinite(point[1])) return null;
  accumulator.bounds = mergeBounds(accumulator.bounds, {
    minX: point[0],
    minY: point[1],
    maxX: point[0],
    maxY: point[1],
  });
  return point;
}

function crossesAntimeridian(a: Position, b: Position): boolean {
  return Math.abs(a[0] - b[0]) > 180;
}

function crossesProjectedSeam(
  a: [number, number] | null,
  b: [number, number] | null,
  seamBreakDistance = Number.POSITIVE_INFINITY,
): boolean {
  return Boolean(a && b && Math.abs(a[0] - b[0]) > seamBreakDistance);
}

function crossesLikelyProjectedStrokeSeam(
  aPosition: Position,
  bPosition: Position,
  a: [number, number] | null,
  b: [number, number] | null,
): boolean {
  if (!a || !b) return false;
  if (isKnownStraightPoliticalBoundarySegment(aPosition, bPosition)) return false;
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  const minY = Math.min(a[1], b[1]);
  const length = Math.hypot(dx, dy);
  return (
    (dx > 80 && dy < 8 && minY < 110) ||
    (dx > 55 && dy < 2 && minY < 145) ||
    (dx > 35 && dy < 2 && minY < 80) ||
    (dx > 20 && dy > 20 && length > 30 && minY < 100)
  );
}

function isKnownStraightPoliticalBoundarySegment(a: Position, b: Position): boolean {
  const longitudeDelta = Math.abs(a[0] - b[0]);
  const latitudeDelta = Math.abs(a[1] - b[1]);
  const minLongitude = Math.min(a[0], b[0]);
  const maxLongitude = Math.max(a[0], b[0]);
  const minLatitude = Math.min(a[1], b[1]);
  const maxLatitude = Math.max(a[1], b[1]);
  const isAlaskaCanadaMeridian =
    longitudeDelta < 0.025 &&
    Math.abs((a[0] + b[0]) / 2 + 141) < 0.025 &&
    minLatitude >= 59 &&
    maxLatitude <= 71;
  const isContiguousUsCanadaParallel =
    latitudeDelta < 0.025 &&
    Math.abs((a[1] + b[1]) / 2 - 49) < 0.05 &&
    minLongitude >= -125 &&
    maxLongitude <= -94;

  return isAlaskaCanadaMeridian || isContiguousUsCanadaParallel;
}

function crossesLikelyProjectedClosureArtifact(
  a: [number, number] | null,
  b: [number, number] | null,
): boolean {
  if (!a || !b) return false;
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  return (
    (dx > 35 && dy > 8 && minY > 110 && maxY < 150) ||
    (dx > 55 && dy > 3 && minY > 115 && maxY < 145) ||
    (dx > 35 && dy > 8 && minY < 120)
  );
}

function shouldUseManualFillPath(
  d3PathData: string,
  d3Bounds: [[number, number], [number, number]],
  coordinateBounds: ProjectedBounds,
): boolean {
  const d3Area = boundsArea({
    minX: d3Bounds[0][0],
    minY: d3Bounds[0][1],
    maxX: d3Bounds[1][0],
    maxY: d3Bounds[1][1],
  });
  const coordinateArea = boundsArea(coordinateBounds);
  return (
    (coordinateArea > 0 && d3Area / coordinateArea > 12) ||
    countLikelyProjectedFillArtifacts(d3PathData) > 1
  );
}

function countLikelyProjectedFillArtifacts(pathData: string): number {
  let count = 0;
  let subpathStart: [number, number] | null = null;
  let previous: [number, number] | null = null;

  for (const match of pathData.matchAll(/([MLZ])(?:([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?))?/g)) {
    const command = match[1];
    if (command === "M" || command === "L") {
      const point: [number, number] = [Number(match[2]), Number(match[3])];
      if (command === "M") subpathStart = point;
      if (command === "L" && previous && isLikelyProjectedFillArtifact(previous, point)) {
        count += 1;
      }
      previous = point;
      continue;
    }

    if (command === "Z" && previous && subpathStart && isLikelyProjectedFillArtifact(previous, subpathStart)) {
      count += 1;
    }
  }

  return count;
}

function isLikelyProjectedFillArtifact(a: [number, number], b: [number, number]): boolean {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  return dx > 20 && dy < 0.08 && Math.min(a[1], b[1]) < 80;
}

function boundsArea(bounds: ProjectedBounds): number {
  return Math.max(0, bounds.maxX - bounds.minX) * Math.max(0, bounds.maxY - bounds.minY);
}


function mergeBounds(a: ProjectedBounds | null, b: ProjectedBounds): ProjectedBounds {
  if (!a) return b;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}
