import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourcePath = path.join(root, "public/data/map-data.json");
const outputPath = path.join(root, "public/data/map-data.packed.json");
const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

function encodeNumber(number) {
  let value = number >= 0 ? number * 2 : -number * 2 - 1;
  let encoded = "";
  while (value >= 32) {
    encoded += alphabet[(value & 31) | 32];
    value = Math.floor(value / 32);
  }
  return encoded + alphabet[value];
}

function encodeLine(positions) {
  let encoded = "";
  let previousLongitude = 0;
  let previousLatitude = 0;
  for (const [longitude, latitude] of positions) {
    const nextLongitude = Math.round(longitude * 100);
    const nextLatitude = Math.round(latitude * 100);
    if (Math.abs(longitude - nextLongitude / 100) > 1e-8 || Math.abs(latitude - nextLatitude / 100) > 1e-8) {
      throw new Error("Map coordinates must use two-decimal precision.");
    }
    encoded += encodeNumber(nextLongitude - previousLongitude);
    encoded += encodeNumber(nextLatitude - previousLatitude);
    previousLongitude = nextLongitude;
    previousLatitude = nextLatitude;
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
  format: "polyline-2",
  version: source.version,
  attribution: source.attribution,
  countries: source.countries,
  baseCountries: source.baseCountries.map((row) => ({ ...row, geometry: encodeGeometry(row.geometry) })),
  regions: source.regions.map((row) => ({ ...row, geometry: encodeGeometry(row.geometry) })),
  boundaryEdges: source.boundaryEdges.map((row) => ({ ...row, geometry: encodeGeometry(row.geometry) })),
};
await fs.writeFile(outputPath, `${JSON.stringify(packed)}\n`);
console.log(`Packed map data: ${sourcePath} -> ${outputPath}`);
