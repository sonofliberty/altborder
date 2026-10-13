import BufferOp from "jsts/org/locationtech/jts/operation/buffer/BufferOp.js";
import DistanceOp from "jsts/org/locationtech/jts/operation/distance/DistanceOp.js";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import type { Geometry, Position } from "geojson";
import { overlayPolygonalGeometry } from "./polygonOverlay.mjs";
import { combineRegionLand } from "./regionLandGeometry";
import type { RegionDivision, RegionRecord } from "./types";

type PolygonGeometry = {
  getArea(): number;
};

const reader = new GeoJSONReader(new GeometryFactory());
const writer = new GeoJSONWriter();
const minimumArea = 1e-10;
const read = (geometry: Geometry) => BufferOp.bufferOp(reader.read(geometry), 0) as PolygonGeometry;
const write = (geometry: PolygonGeometry) => writer.write(geometry) as Geometry;
const polygons = (geometry: Geometry) => geometry.type === "Polygon"
  ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : [];
const ringArea = (ring: Position[]) => Math.abs(ring.slice(1).reduce((sum, point, index) =>
  sum + ring[index][0] * point[1] - point[0] * ring[index][1], 0) / 2);
const area = (geometry: Geometry) => polygons(geometry).reduce((sum, polygon) =>
  sum + ringArea(polygon[0]) - polygon.slice(1).reduce((holes, ring) => holes + ringArea(ring), 0), 0);
const reverseWinding = (geometry: Geometry): Geometry => ({
  type: "MultiPolygon", coordinates: polygons(geometry).map((polygon) => polygon.map((ring) => [...ring].reverse())),
});

/** Keep preview land that ADM1 omits, attached to a subdivision on the same side. */
export function completeDivisionLand(
  regions: RegionRecord[],
  divisions: RegionDivision[],
  territories: { existingGeometry: Geometry; newGeometry: Geometry },
  previousAdditions: Readonly<Record<string, Geometry>> = {},
): RegionDivision[] {
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const result = divisions.map((division) => ({ ...division }));
  for (const side of ["existing", "new"] as const) {
    const candidates = result.flatMap((division, index) => {
      if ((division.kind === "keep" && side === "new") || (division.kind === "move" && side === "existing")) return [];
      const geometry = division.kind === "split"
        ? side === "existing" ? division.existingGeometry : division.newGeometry
        : regionById.get(division.regionId)!.geometry;
      return [{ index, geometry: read(geometry), addition: null as Geometry | null }];
    });
    if (candidates.length === 0) continue;
    const coverage: Geometry = {
      type: "MultiPolygon",
      coordinates: candidates.flatMap(({ geometry }) => polygons(write(geometry))),
    };
    let missing = overlayPolygonalGeometry("difference", territories[`${side}Geometry`], coverage);
    if (area(missing) <= minimumArea) continue;
    const assign = (candidate: typeof candidates[number], patch: Geometry) => {
      candidate.addition = candidate.addition ? overlayPolygonalGeometry("union", candidate.addition, patch) : patch;
    };
    // Grow each original subdivision in short steps. Shared gaps then follow
    // nearby regions instead of one region taking a connected coastal strip.
    for (const distance of [0.0025, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16]) {
      if (area(missing) <= minimumArea) break;
      for (const candidate of candidates) {
        if (DistanceOp.distance(read(missing), candidate.geometry) > distance) continue;
        const expanded = BufferOp.bufferOp(candidate.geometry, distance, 1) as PolygonGeometry;
        const patch = overlayPolygonalGeometry("intersection", missing, write(expanded));
        if (area(patch) <= minimumArea) continue;
        assign(candidate, patch);
        missing = overlayPolygonalGeometry("difference", missing, patch);
        if (area(missing) <= minimumArea) break;
      }
    }
    for (const coordinates of polygons(missing)) {
      const patch: Geometry = { type: "Polygon", coordinates };
      if (area(patch) <= minimumArea) continue;
      const shape = read(patch);
      const nearest = candidates.reduce((best, candidate) =>
        DistanceOp.distance(shape, candidate.geometry) < DistanceOp.distance(shape, best.geometry) ? candidate : best);
      assign(nearest, patch);
    }
    for (const candidate of candidates) {
      if (!candidate.addition) continue;
      const division = result[candidate.index];
      const patch = reverseWinding(candidate.addition);
      if (division.kind === "split") {
        if (side === "existing") division.existingGeometry = combineRegionLand(division.existingGeometry, patch);
        else division.newGeometry = combineRegionLand(division.newGeometry, patch);
      } else {
        const previous = previousAdditions[division.regionId];
        division.landAddition = previous ? reverseWinding(overlayPolygonalGeometry("union", previous, patch)) : patch;
      }
    }
  }
  return result;
}
