import type { Geometry, Position } from "geojson";
import type { MapData } from "./types";
import { mapInBatches, yieldToMainThread } from "./mapWork";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
const coordinateDigits = new Int8Array(128).fill(-1);
for (let index = 0; index < alphabet.length; index += 1) {
  coordinateDigits[alphabet.charCodeAt(index)] = index;
}

type PackedGeometry = {
  type: Geometry["type"];
  coordinates: string | string[] | string[][];
  precision?: 2 | 5;
};

type PackedRecord<T> = Omit<T, "geometry"> & { geometry: PackedGeometry };

type PackedMapData = {
  format: "polyline-2" | "polyline-variable" | "point-index-1";
  points?: string;
  version: number;
  attribution: string;
  baseCountries: PackedRecord<MapData["baseCountries"][number]>[];
  countries: MapData["countries"];
  regions: PackedRecord<MapData["regions"][number]>[];
  boundaryEdges: PackedRecord<MapData["boundaryEdges"][number]>[];
};

function createCoordinateDecoder(encoded: string, scale: number, mixedPrecision = false) {
  if (typeof encoded !== "string") throw new Error("Map data contains an invalid coordinate table.");
  const positions: Position[] = [];
  let value = 0;
  let shift = 0;
  let factor = 1;
  let longitude = 0;
  let latitude = 0;
  let expectsLatitude = false;
  let index = 0;

  function readTo(end: number) {
    for (; index < Math.min(end, encoded.length); index += 1) {
      const digit = coordinateDigits[encoded.charCodeAt(index)];
      if (digit === undefined || digit < 0) throw new Error("Map data contains an invalid coordinate.");
      value += (digit & 31) * factor;
      if (digit & 32) {
        shift += 5;
        if (shift > 50) throw new Error("Map data contains an invalid coordinate.");
        factor *= 32;
        continue;
      }
      const signed = mixedPrecision ? Math.floor(value / 2) : value;
      const delta = signed & 1 ? -(signed + 1) / 2 : signed / 2;
      const previous = expectsLatitude ? latitude : longitude;
      const next = mixedPrecision && !(value & 1)
        ? (Math.round(previous / 1000) + delta) * 1000
        : previous + delta;
      if (expectsLatitude) {
        latitude = next;
        positions.push([longitude / scale, latitude / scale]);
      } else {
        longitude = next;
      }
      expectsLatitude = !expectsLatitude;
      value = 0;
      shift = 0;
      factor = 1;
    }
  }

  function finish() {
    if (shift !== 0 || expectsLatitude) throw new Error("Map data contains an incomplete coordinate.");
    return positions;
  }
  return { readTo, finish };
}

function decodeLine(encoded: string, scale: number, mixedPrecision = false): Position[] {
  const decoder = createCoordinateDecoder(encoded, scale, mixedPrecision);
  decoder.readTo(encoded.length);
  return decoder.finish();
}

function decodePointLine(encoded: string, points: readonly Position[]): Position[] {
  if (typeof encoded !== "string") throw new Error("Map data contains an invalid coordinate index.");
  const positions: Position[] = [];
  let value = 0;
  let factor = 1;
  let pointId = 0;
  for (let index = 0; index < encoded.length; index += 1) {
    const digit = coordinateDigits[encoded.charCodeAt(index)];
    if (digit === undefined || digit < 0) throw new Error("Map data contains an invalid coordinate index.");
    value += (digit & 31) * factor;
    if (digit & 32) {
      factor *= 32;
      if (factor > 2 ** 50) throw new Error("Map data contains an invalid coordinate index.");
      continue;
    }
    pointId += value & 1 ? -(value + 1) / 2 : value / 2;
    const point = points[pointId];
    if (!point) throw new Error("Map data contains an invalid coordinate index.");
    // Keep geometries independent even when their vertices share a packed ID.
    positions.push([point[0], point[1]]);
    value = 0;
    factor = 1;
  }
  if (factor !== 1) throw new Error("Map data contains an incomplete coordinate index.");
  return positions;
}

function decodeGeometry(geometry: PackedGeometry, points?: readonly Position[]): Geometry {
  const precision = geometry.precision ?? 2;
  if (precision !== 2 && precision !== 5) throw new Error("Map data contains an unsupported coordinate precision.");
  const decode = (line: string) => points ? decodePointLine(line, points) : decodeLine(line, 10 ** precision);
  switch (geometry.type) {
    case "LineString":
      return { type: "LineString", coordinates: decode(geometry.coordinates as string) };
    case "MultiLineString":
      return { type: "MultiLineString", coordinates: (geometry.coordinates as string[]).map(decode) };
    case "Polygon":
      return { type: "Polygon", coordinates: (geometry.coordinates as string[]).map(decode) };
    case "MultiPolygon":
      return {
        type: "MultiPolygon",
        coordinates: (geometry.coordinates as string[][]).map((polygon) => polygon.map(decode)),
      };
    default:
      throw new Error("Map data contains an unsupported geometry.");
  }
}

function readPackedMapData(value: unknown): PackedMapData {
  if (!value || typeof value !== "object" || !["polyline-2", "polyline-variable", "point-index-1"].includes((value as { format?: string }).format ?? "")) {
    throw new Error("Map data has an unsupported format.");
  }
  return value as PackedMapData;
}

export function decodePackedMapData(value: unknown): MapData {
  const packed = readPackedMapData(value);
  const points = packed.format === "point-index-1" ? decodeLine(packed.points!, 100000, true) : undefined;
  return {
    version: packed.version,
    attribution: packed.attribution,
    countries: packed.countries,
    baseCountries: packed.baseCountries.map((row) => ({ ...row, geometry: decodeGeometry(row.geometry, points) })),
    regions: packed.regions.map((row) => ({ ...row, geometry: decodeGeometry(row.geometry, points) })),
    boundaryEdges: packed.boundaryEdges.map((row) => ({
      ...row,
      geometry: decodeGeometry(row.geometry, points) as MapData["boundaryEdges"][number]["geometry"],
    })),
  };
}

/** Decode the shipping bundle while allowing loading feedback and input to run. */
export async function decodePackedMapDataInBatches(
  value: unknown,
  isCancelled: () => boolean,
): Promise<MapData | null> {
  const packed = readPackedMapData(value);
  await yieldToMainThread();
  let points: Position[] | undefined;
  if (packed.format === "point-index-1") {
    const encoded = packed.points!;
    const decoder = createCoordinateDecoder(encoded, 100000, true);
    // A shared point table is larger than one region. Yield within it as well
    // as between geometries, including when a coordinate spans a batch edge.
    const ends = Array.from({ length: Math.ceil(encoded.length / 8192) }, (_, index) => (index + 1) * 8192);
    if (!await mapInBatches(ends, (end) => decoder.readTo(end), isCancelled)) return null;
    points = decoder.finish();
    await yieldToMainThread();
  }
  const baseCountries = await mapInBatches(packed.baseCountries,
    (row) => ({ ...row, geometry: decodeGeometry(row.geometry, points) }), isCancelled);
  if (!baseCountries) return null;
  await yieldToMainThread();
  const regions = await mapInBatches(packed.regions,
    (row) => ({ ...row, geometry: decodeGeometry(row.geometry, points) }), isCancelled);
  if (!regions) return null;
  await yieldToMainThread();
  const boundaryEdges = await mapInBatches(packed.boundaryEdges,
    (row) => ({
      ...row,
      geometry: decodeGeometry(row.geometry, points) as MapData["boundaryEdges"][number]["geometry"],
    }), isCancelled);
  if (!boundaryEdges) return null;
  return {
    version: packed.version,
    attribution: packed.attribution,
    countries: packed.countries,
    baseCountries,
    regions,
    boundaryEdges,
  };
}
