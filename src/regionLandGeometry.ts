import type { Geometry } from "geojson";
import type { RegionRecord } from "./types";

/** Added land is disjoint from the stored subdivision and follows its ID. */
export function withRegionLandAddition(region: RegionRecord, addition?: Geometry): RegionRecord {
  if (!addition) return region;
  return { ...region, geometry: combineRegionLand(region.geometry, addition) };
}

export function combineRegionLand(geometry: Geometry, addition: Geometry): Geometry {
  const polygons = (value: Geometry) => value.type === "Polygon"
    ? [value.coordinates]
    : value.type === "MultiPolygon" ? value.coordinates : [];
  return { type: "MultiPolygon", coordinates: [...polygons(geometry), ...polygons(addition)] };
}
