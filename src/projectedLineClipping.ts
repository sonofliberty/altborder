import type { ProjectedBounds } from "./mapZoom";

type ParsedLinePath = {
  coordinates: Float64Array;
  starts: Uint8Array;
  bounds: ProjectedBounds;
  viewportKey?: string;
  clippedPath?: string;
};

const parsedPaths = new Map<string, ParsedLinePath>();
const maxCachedPaths = 24;
const maxCachedCharacters = 6_000_000;
let cachedCharacters = 0;

/** Clip original M/L/Z edges without adding borders along the viewport. */
export function clipProjectedLinePath(pathData: string, viewport: ProjectedBounds): string {
  if (!pathData || !validBounds(viewport)) return pathData;

  let parsed = parsedPaths.get(pathData);
  if (!parsed) {
    parsed = parseLinePath(pathData) ?? undefined;
    // Preserve unsupported SVG commands instead of changing their geometry.
    if (!parsed) return pathData;
    if (pathData.length <= maxCachedCharacters) {
      parsedPaths.set(pathData, parsed);
      cachedCharacters += pathData.length;
      trimCache();
    }
  } else {
    // Keep the active map paths when ownership or camera bounds change.
    parsedPaths.delete(pathData);
    parsedPaths.set(pathData, parsed);
  }

  if (containsBounds(viewport, parsed.bounds)) return pathData;
  if (!intersectsBounds(viewport, parsed.bounds)) return "";

  const viewportKey = `${viewport.minX},${viewport.minY},${viewport.maxX},${viewport.maxY}`;
  if (parsed.viewportKey === viewportKey) return parsed.clippedPath ?? "";

  const pathParts: string[] = [];
  const { coordinates, starts } = parsed;
  let previousX = 0;
  let previousY = 0;
  let lastX = 0;
  let lastY = 0;
  let penDown = false;

  for (let pointIndex = 0; pointIndex < starts.length; pointIndex += 1) {
    const x = coordinates[pointIndex * 2];
    const y = coordinates[pointIndex * 2 + 1];
    if (starts[pointIndex]) {
      previousX = x;
      previousY = y;
      penDown = false;
      continue;
    }

    const dx = x - previousX;
    const dy = y - previousY;
    let first = 0;
    let last = 1;
    if (dx === 0) {
      if (previousX < viewport.minX || previousX > viewport.maxX) last = -1;
    } else {
      const a = (viewport.minX - previousX) / dx;
      const b = (viewport.maxX - previousX) / dx;
      first = Math.max(first, Math.min(a, b));
      last = Math.min(last, Math.max(a, b));
    }
    if (dy === 0) {
      if (previousY < viewport.minY || previousY > viewport.maxY) last = -1;
    } else {
      const a = (viewport.minY - previousY) / dy;
      const b = (viewport.maxY - previousY) / dy;
      first = Math.max(first, Math.min(a, b));
      last = Math.min(last, Math.max(a, b));
    }

    if (first <= last) {
      const startX = first === 0 ? previousX : previousX + first * dx;
      const startY = first === 0 ? previousY : previousY + first * dy;
      const endX = last === 1 ? x : previousX + last * dx;
      const endY = last === 1 ? y : previousY + last * dy;
      if (!penDown || startX !== lastX || startY !== lastY) {
        pathParts.push(`M${startX},${startY}`);
      }
      pathParts.push(`L${endX},${endY}`);
      lastX = endX;
      lastY = endY;
      penDown = last === 1;
    } else {
      penDown = false;
    }
    previousX = x;
    previousY = y;
  }

  const clippedPath = pathParts.join("");
  if (parsedPaths.get(pathData) === parsed) {
    cachedCharacters += clippedPath.length - (parsed.clippedPath?.length ?? 0);
    parsed.viewportKey = viewportKey;
    parsed.clippedPath = clippedPath;
    trimCache();
  }
  return clippedPath;
}

function parseLinePath(pathData: string): ParsedLinePath | null {
  const coordinates: number[] = [];
  const starts: number[] = [];
  const bounds = { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity };
  let index = 0;
  let command = "";
  let startX = 0;
  let startY = 0;

  function skipSeparators() {
    while (index < pathData.length) {
      const code = pathData.charCodeAt(index);
      if (code > 32 && code !== 44) break;
      index += 1;
    }
  }

  function readNumber(): number | null {
    skipSeparators();
    const start = index;
    if (pathData[index] === "-" || pathData[index] === "+") index += 1;
    let digits = 0;
    while (isDigit(pathData.charCodeAt(index))) { index += 1; digits += 1; }
    if (pathData[index] === ".") {
      index += 1;
      while (isDigit(pathData.charCodeAt(index))) { index += 1; digits += 1; }
    }
    if (digits === 0) return null;
    if (pathData[index] === "e" || pathData[index] === "E") {
      index += 1;
      if (pathData[index] === "-" || pathData[index] === "+") index += 1;
      const exponentStart = index;
      while (isDigit(pathData.charCodeAt(index))) index += 1;
      if (index === exponentStart) return null;
    }
    const value = Number(pathData.slice(start, index));
    return Number.isFinite(value) ? value : null;
  }

  function addPoint(x: number, y: number, startsPath: boolean) {
    coordinates.push(x, y);
    starts.push(startsPath ? 1 : 0);
    bounds.minX = Math.min(bounds.minX, x);
    bounds.minY = Math.min(bounds.minY, y);
    bounds.maxX = Math.max(bounds.maxX, x);
    bounds.maxY = Math.max(bounds.maxY, y);
  }

  while (index < pathData.length) {
    skipSeparators();
    if (index === pathData.length) break;
    const character = pathData[index];
    if (character === "M" || character === "L") {
      command = character;
      index += 1;
    } else if (character === "Z" || character === "z") {
      if (starts.length === 0) return null;
      addPoint(startX, startY, false);
      command = "";
      index += 1;
      continue;
    } else if (!command) {
      return null;
    }

    if (command !== "M" && (command !== "L" || starts.length === 0)) return null;
    const x = readNumber();
    const y = readNumber();
    if (x === null || y === null) return null;
    const startsPath = command === "M";
    addPoint(x, y, startsPath);
    if (startsPath) { startX = x; startY = y; }
    command = "L";
  }

  return { coordinates: new Float64Array(coordinates), starts: new Uint8Array(starts), bounds };
}

function isDigit(code: number): boolean {
  return code >= 48 && code <= 57;
}

function validBounds(bounds: ProjectedBounds): boolean {
  return Number.isFinite(bounds.minX) && Number.isFinite(bounds.minY) &&
    Number.isFinite(bounds.maxX) && Number.isFinite(bounds.maxY) &&
    bounds.minX <= bounds.maxX && bounds.minY <= bounds.maxY;
}

function containsBounds(outer: ProjectedBounds, inner: ProjectedBounds): boolean {
  return inner.minX >= outer.minX && inner.minY >= outer.minY &&
    inner.maxX <= outer.maxX && inner.maxY <= outer.maxY;
}

function intersectsBounds(a: ProjectedBounds, b: ProjectedBounds): boolean {
  return a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY;
}

function trimCache() {
  while (parsedPaths.size > maxCachedPaths || cachedCharacters > maxCachedCharacters) {
    const oldest = parsedPaths.keys().next().value;
    if (oldest === undefined) return;
    cachedCharacters -= oldest.length + (parsedPaths.get(oldest)?.clippedPath?.length ?? 0);
    parsedPaths.delete(oldest);
  }
}
