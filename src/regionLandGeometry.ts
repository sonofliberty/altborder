import type { Geometry, Position } from "geojson";
import type { RegionRecord } from "./types";

/** Added land is disjoint from the stored subdivision and follows its ID. */
export function withRegionLandAddition(region: RegionRecord, addition?: Geometry): RegionRecord {
  if (!addition) return region;
  return { ...region, geometry: combineRegionLand(region.geometry, addition) };
}

export function combineRegionLand(geometry: Geometry, addition: Geometry): Geometry {
  return removeCollapsedPolygonRings({ type: "MultiPolygon", coordinates: [...polygons(geometry), ...polygons(addition)] });
}

/** Overlay patches can contain zero-area rings. Keep all nonzero land at its saved precision. */
export function removeCollapsedPolygonRings(geometry: Geometry): Geometry {
  return {
    type: "MultiPolygon",
    coordinates: polygons(geometry).flatMap((polygon) =>
      polygon[0] && ringHasArea(polygon[0])
        ? [[polygon[0], ...polygon.slice(1).filter(ringHasArea)]]
        : [],
    ),
  };
}

function polygons(geometry: Geometry): Position[][][] {
  return geometry.type === "Polygon" ? [geometry.coordinates]
    : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
}

function ringHasArea(ring: Position[]): boolean {
  if (ring.length < 4) return false;
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    area += ring[index][0] * ring[index + 1][1] - ring[index + 1][0] * ring[index][1];
  }
  return Math.abs(area) > 0;
}
