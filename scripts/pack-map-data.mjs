import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { buildMapRenderPreparation } from "./prepare-map-rendering.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "public/data/map-data.json");
const outputPath = path.join(root, "public/data/map-data.packed.json");
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeUnsigned(number) {
  let value = number;
  let encoded = "";
  while (value >= 32) {
    encoded += alphabet[(value & 31) | 32];
    value = Math.floor(value / 32);
  }
  return encoded + alphabet[value];
}

function zigzag(number) {
  return number >= 0 ? number * 2 : -number * 2 - 1;
}

const pointIds = new Map();
const points = [];

/** Reuse exact vertices without changing polygon order, winding, or precision. */
function encodeLine(positions) {
  let encoded = "";
  let previousId = 0;
  for (const [longitude, latitude] of positions) {
    const x = Math.round(longitude * 100000);
    const y = Math.round(latitude * 100000);
    if (Math.abs(longitude - x / 100000) > 1e-8 || Math.abs(latitude - y / 100000) > 1e-8) {
      throw new Error("Map coordinates must use at most five-decimal precision.");
    }
    const key = `${x},${y}`;
    let id = pointIds.get(key);
    if (id === undefined) {
      id = points.length;
      pointIds.set(key, id);
      points.push([x, y]);
    }
    encoded += encodeUnsigned(zigzag(id - previousId));
    previousId = id;
  }
  return encoded;
}

function encodePoints() {
  let encoded = "";
  const previous = [0, 0];
  for (const point of points) {
    for (let axis = 0; axis < 2; axis += 1) {
      const value = point[axis];
      // Most vertices are exact hundredths. The low bit selects either an
      // exact hundredth relative to the rounded prior value or a fine delta.
      const isCoarse = value % 1000 === 0;
      const delta = isCoarse ? value / 1000 - Math.round(previous[axis] / 1000) : value - previous[axis];
      encoded += encodeUnsigned(zigzag(delta) * 2 + Number(!isCoarse));
      previous[axis] = value;
    }
  }
  return encoded;
}

function encodeGeometry(geometry) {
  const { type, coordinates } = geometry;
  if (type === "LineString") return { type, coordinates: encodeLine(coordinates) };
  if (type === "MultiLineString" || type === "Polygon") {
    return { type, coordinates: coordinates.map(encodeLine) };
  }
  if (type === "MultiPolygon") {
    return { type, coordinates: coordinates.map((polygon) => polygon.map(encodeLine)) };
  }
  throw new Error(`Unsupported geometry: ${type}`);
}

const source = JSON.parse(await fs.readFile(sourcePath, "utf8"));
const packed = {
  format: "point-index-1",
  version: source.version,
  attribution: source.attribution,
  countries: source.countries,
  baseCountries: source.baseCountries.map((row) => ({ ...row, geometry: encodeGeometry(row.geometry) })),
  regions: source.regions.map((row) => ({ ...row, geometry: encodeGeometry(row.geometry) })),
  boundaryEdges: source.boundaryEdges.map((row) => ({ ...row, geometry: encodeGeometry(row.geometry) })),
  points: encodePoints(),
  renderPreparation: await buildMapRenderPreparation(source),
};
await fs.writeFile(outputPath, `${JSON.stringify(packed)}\n`);
console.log(`Packed map data: ${sourcePath} -> ${outputPath}`);
