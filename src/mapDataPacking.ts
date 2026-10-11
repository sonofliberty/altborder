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
};

type PackedRecord<T> = Omit<T, "geometry"> & { geometry: PackedGeometry };

type PackedMapData = {
  format: "polyline-2";
  version: number;
  attribution: string;
  baseCountries: PackedRecord<MapData["baseCountries"][number]>[];
  countries: MapData["countries"];
  regions: PackedRecord<MapData["regions"][number]>[];
  boundaryEdges: PackedRecord<MapData["boundaryEdges"][number]>[];
};

function decodeLine(encoded: string): Position[] {
  const positions: Position[] = [];
  let value = 0;
  let shift = 0;
  let factor = 1;
  let longitude = 0;
  let latitude = 0;
  let expectsLatitude = false;

  for (let index = 0; index < encoded.length; index += 1) {
    const digit = coordinateDigits[encoded.charCodeAt(index)];
    if (digit === undefined || digit < 0) throw new Error("Map data contains an invalid coordinate.");
    value += (digit & 31) * factor;
    if (digit & 32) {
      shift += 5;
      if (shift > 50) throw new Error("Map data contains an invalid coordinate.");
      factor *= 32;
      continue;
    }
    const delta = value & 1 ? -(value + 1) / 2 : value / 2;
    if (expectsLatitude) {
      latitude += delta;
      positions.push([longitude / 100, latitude / 100]);
    } else {
      longitude += delta;
    }
    expectsLatitude = !expectsLatitude;
    value = 0;
    shift = 0;
    factor = 1;
  }

  if (shift !== 0 || expectsLatitude) {
    throw new Error("Map data contains an incomplete coordinate.");
  }

  return positions;
}

function decodeGeometry(geometry: PackedGeometry): Geometry {
  switch (geometry.type) {
    case "LineString":
      return { type: "LineString", coordinates: decodeLine(geometry.coordinates as string) };
    case "MultiLineString":
      return { type: "MultiLineString", coordinates: (geometry.coordinates as string[]).map(decodeLine) };
    case "Polygon":
      return { type: "Polygon", coordinates: (geometry.coordinates as string[]).map(decodeLine) };
    case "MultiPolygon":
      return {
        type: "MultiPolygon",
        coordinates: (geometry.coordinates as string[][]).map((polygon) => polygon.map(decodeLine)),
      };
    default:
      throw new Error("Map data contains an unsupported geometry.");
  }
}

function readPackedMapData(value: unknown): PackedMapData {
  if (!value || typeof value !== "object" || (value as { format?: string }).format !== "polyline-2") {
    throw new Error("Map data has an unsupported format.");
  }
  return value as PackedMapData;
}

export function decodePackedMapData(value: unknown): MapData {
  const packed = readPackedMapData(value);
  return {
    version: packed.version,
    attribution: packed.attribution,
    countries: packed.countries,
    baseCountries: packed.baseCountries.map((row) => ({ ...row, geometry: decodeGeometry(row.geometry) })),
    regions: packed.regions.map((row) => ({ ...row, geometry: decodeGeometry(row.geometry) })),
    boundaryEdges: packed.boundaryEdges.map((row) => ({
      ...row,
      geometry: decodeGeometry(row.geometry) as MapData["boundaryEdges"][number]["geometry"],
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
  const baseCountries = await mapInBatches(packed.baseCountries,
    (row) => ({ ...row, geometry: decodeGeometry(row.geometry) }), isCancelled);
  if (!baseCountries) return null;
  await yieldToMainThread();
  const regions = await mapInBatches(packed.regions,
    (row) => ({ ...row, geometry: decodeGeometry(row.geometry) }), isCancelled);
  if (!regions) return null;
  await yieldToMainThread();
  const boundaryEdges = await mapInBatches(packed.boundaryEdges,
    (row) => ({
      ...row,
      geometry: decodeGeometry(row.geometry) as MapData["boundaryEdges"][number]["geometry"],
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
