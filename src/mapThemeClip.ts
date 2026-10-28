import type { ProjectedBounds } from "./mapZoom";

export type MapThemeCountryPath = { id: string; pathData: string };
type Point = readonly [number, number];
type Ring = { points: readonly Point[]; bounds: ProjectedBounds; pathData: string };

const parsedCountries = new WeakMap<MapThemeCountryPath, { pathData: string; rings: readonly Ring[] | null }>();
const clippedCountryViewports = new WeakMap<MapThemeCountryPath, { pathData: string; viewportKey: string }>();
const parsedPolygons = new Map<string, readonly Ring[] | null>();
const maxPolygonCacheEntries = 8;
const maxPolygonCachePoints = 100_000;
let cachedPolygonPoints = 0;

function parsePolygonPath(pathData: string): readonly Ring[] | null {
  // Polygon paths from the map projection use straight segments. Preserve a
  // future unsupported path rather than silently change its fill geometry.
  if (/[^MLZ0-9eE+.,\-\s]/.test(pathData)) return null;
  const rings: Ring[] = [];
  let points: Point[] = [];
  const commit = () => {
    if (points.length >= 3) {
      const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
      for (const [x, y] of points) {
        bounds.minX = Math.min(bounds.minX, x);
        bounds.minY = Math.min(bounds.minY, y);
        bounds.maxX = Math.max(bounds.maxX, x);
        bounds.maxY = Math.max(bounds.maxY, y);
      }
      rings.push({
        points,
        bounds,
        pathData: points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join("") + "Z",
      });
    }
    points = [];
  };
  const tokens = pathData.match(/[MLZ]|[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi) ?? [];
  for (let index = 0; index < tokens.length;) {
    if (tokens[index] === "M") { commit(); index += 1; }
    else if (tokens[index] === "L") index += 1;
    else if (tokens[index] === "Z") { commit(); index += 1; continue; }
    if (index + 1 >= tokens.length) return null;
    const x = Number(tokens[index++]);
    const y = Number(tokens[index++]);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    points.push([x, y]);
  }
  commit();
  return rings;
}

function clipRing(points: readonly Point[], bounds: ProjectedBounds): readonly Point[] {
  let result = points;
  for (const [axis, edge, greater] of [
    [0, bounds.minX, true], [0, bounds.maxX, false],
    [1, bounds.minY, true], [1, bounds.maxY, false],
  ] as const) {
    if (result.length === 0) break;
    const clipped: Point[] = [];
    let previous = result[result.length - 1];
    let previousInside = greater ? previous[axis] >= edge : previous[axis] <= edge;
    for (const current of result) {
      const currentInside = greater ? current[axis] >= edge : current[axis] <= edge;
      if (currentInside !== previousInside) {
        const ratio = (edge - previous[axis]) / (current[axis] - previous[axis]);
        clipped.push(axis === 0
          ? [edge, previous[1] + (current[1] - previous[1]) * ratio]
          : [previous[0] + (current[0] - previous[0]) * ratio, edge]);
      }
      if (currentInside) clipped.push(current);
      previous = current;
      previousInside = currentInside;
    }
    result = clipped;
  }
  return result;
}

function clipParsedPath(rings: readonly Ring[], bounds: ProjectedBounds): string {
  return rings.map((ring) => {
    const box = ring.bounds;
    if (box.maxX < bounds.minX || box.minX > bounds.maxX || box.maxY < bounds.minY || box.minY > bounds.maxY) return "";
    if (box.minX >= bounds.minX && box.maxX <= bounds.maxX && box.minY >= bounds.minY && box.maxY <= bounds.maxY) return ring.pathData;
    const points = clipRing(ring.points, bounds);
    return points.length < 3 ? "" : points.map(([x, y], index) => `${index === 0 ? "M" : "L"}${x},${y}`).join("") + "Z";
  }).join("");
}

/** Bound the mask geometry itself, including distant islands in a country. */
export function clipMapThemeCountryPaths<T extends MapThemeCountryPath>(
  countries: readonly T[],
  bounds?: ProjectedBounds,
): readonly T[] {
  if (!bounds) return countries;
  const viewportKey = `${bounds.minX},${bounds.minY},${bounds.maxX},${bounds.maxY}`;
  return countries.flatMap((country) => {
    // Country fills and the terrain mask share these bounded paths. The mask
    // must not parse and clip the same result again on each camera update.
    const clipped = clippedCountryViewports.get(country);
    if (clipped?.pathData === country.pathData && clipped.viewportKey === viewportKey) return [country];

    let parsed = parsedCountries.get(country);
    if (!parsed || parsed.pathData !== country.pathData) {
      parsed = { pathData: country.pathData, rings: parsePolygonPath(country.pathData) };
      parsedCountries.set(country, parsed);
    }
    const pathData = parsed.rings ? clipParsedPath(parsed.rings, bounds) : country.pathData;
    if (!pathData) return [];
    const result = pathData === country.pathData ? country : { ...country, pathData };
    clippedCountryViewports.set(result, { pathData, viewportKey });
    return [result];
  });
}

export function clipMapThemePolygonPath(pathData: string, bounds?: ProjectedBounds): string {
  if (!bounds) return pathData;
  let rings = parsedPolygons.get(pathData);
  if (rings === undefined) {
    rings = parsePolygonPath(pathData);
    const pointCount = rings?.reduce((sum, ring) => sum + ring.points.length, 0) ?? 0;
    if (pointCount <= maxPolygonCachePoints) {
      while (parsedPolygons.size > 0 && (parsedPolygons.size >= maxPolygonCacheEntries || cachedPolygonPoints + pointCount > maxPolygonCachePoints)) {
        const oldest = parsedPolygons.keys().next().value!;
        cachedPolygonPoints -= parsedPolygons.get(oldest)?.reduce((sum, ring) => sum + ring.points.length, 0) ?? 0;
        parsedPolygons.delete(oldest);
      }
      parsedPolygons.set(pathData, rings);
      cachedPolygonPoints += pointCount;
    }
  }
  return rings ? clipParsedPath(rings, bounds) : pathData;
}
