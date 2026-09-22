import type { Geometry, Position } from "geojson";
import type { MapData } from "./types";

const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";

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
  const numbers: number[] = [];
  let value = 0;
  let shift = 0;

  for (const character of encoded) {
    const digit = alphabet.indexOf(character);
    if (digit < 0) throw new Error("Map data contains an invalid coordinate.");
    value += (digit & 31) * 2 ** shift;
    if (digit & 32) {
      shift += 5;
      if (shift > 50) throw new Error("Map data contains an invalid coordinate.");
      continue;
    }
    numbers.push(value & 1 ? -(value + 1) / 2 : value / 2);
    value = 0;
    shift = 0;
  }

  if (shift !== 0 || numbers.length % 2 !== 0) {
    throw new Error("Map data contains an incomplete coordinate.");
  }

  const positions: Position[] = [];
  let longitude = 0;
  let latitude = 0;
  for (let index = 0; index < numbers.length; index += 2) {
    longitude += numbers[index];
    latitude += numbers[index + 1];
    positions.push([longitude / 100, latitude / 100]);
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

export function decodePackedMapData(value: unknown): MapData {
  if (!value || typeof value !== "object" || (value as { format?: string }).format !== "polyline-2") {
    throw new Error("Map data has an unsupported format.");
  }
  const packed = value as PackedMapData;
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
