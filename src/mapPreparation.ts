import { geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import type { Geometry } from "geojson";
import { removePolygonalGeometryHoles, simplifyPolygonalGeometry } from "./geometrySimplify";
import { mapInBatches } from "./mapWork";
import type { MapData } from "./types";

export type PreparedMapRendering = {
  data: MapData;
  projection: GeoProjection;
  topologyGeometryById: Map<string, Geometry>;
  renderGeometryById: Map<string, Geometry>;
};

/** Prepare the base map without making its first React render one long task. */
export async function prepareMapRendering(
  data: MapData,
  extent: [[number, number], [number, number]],
  simplifyTolerance: number,
  isCancelled: () => boolean,
): Promise<PreparedMapRendering | null> {
  // Use the same reference scale and streamed bounds as D3's fitExtent.
  // Per-region bounds can be combined without changing the fitted projection.
  const projection = geoNaturalEarth1().scale(150).translate([0, 0]);
  const path = geoPath(projection);
  const bounds = [[Infinity, Infinity], [-Infinity, -Infinity]];
  const topologyGeometryById = new Map<string, Geometry>();
  const renderGeometryById = new Map<string, Geometry>();

  // Canada alone has over 40,000 vertices. A batch must be able to yield
  // between its polygons, as well as between ordinary regions.
  const jobs = data.regions.flatMap<{ regionId: string; geometry: Geometry; polygonIndex: number | null }>((region) => {
    if (region.geometry.type !== "MultiPolygon") {
      return [{ regionId: region.id, geometry: region.geometry, polygonIndex: null }];
    }
    topologyGeometryById.set(region.id, { ...region.geometry, coordinates: [] });
    renderGeometryById.set(region.id, { ...region.geometry, coordinates: [] });
    return region.geometry.coordinates.map((coordinates, polygonIndex) => ({
      regionId: region.id,
      geometry: { type: "Polygon" as const, coordinates },
      polygonIndex,
    }));
  });

  const result = await mapInBatches(jobs, ({ regionId, geometry, polygonIndex }) => {
    const regionBounds = path.bounds(geometry);
    bounds[0][0] = Math.min(bounds[0][0], regionBounds[0][0]);
    bounds[0][1] = Math.min(bounds[0][1], regionBounds[0][1]);
    bounds[1][0] = Math.max(bounds[1][0], regionBounds[1][0]);
    bounds[1][1] = Math.max(bounds[1][1], regionBounds[1][1]);

    const topologyGeometry = removePolygonalGeometryHoles(geometry);
    const renderGeometry = simplifyPolygonalGeometry(topologyGeometry, simplifyTolerance);
    if (polygonIndex === null) {
      topologyGeometryById.set(regionId, topologyGeometry);
      renderGeometryById.set(regionId, renderGeometry);
    } else {
      const topology = topologyGeometryById.get(regionId);
      const render = renderGeometryById.get(regionId);
      if (topology?.type === "MultiPolygon" && topologyGeometry.type === "Polygon") {
        topology.coordinates[polygonIndex] = topologyGeometry.coordinates;
      }
      if (render?.type === "MultiPolygon" && renderGeometry.type === "Polygon") {
        render.coordinates[polygonIndex] = renderGeometry.coordinates;
      }
    }
  }, isCancelled);
  if (!result) return null;

  const width = extent[1][0] - extent[0][0];
  const height = extent[1][1] - extent[0][1];
  const scale = Math.min(width / (bounds[1][0] - bounds[0][0]), height / (bounds[1][1] - bounds[0][1]));
  projection.scale(150 * scale).translate([
    extent[0][0] + (width - scale * (bounds[1][0] + bounds[0][0])) / 2,
    extent[0][1] + (height - scale * (bounds[1][1] + bounds[0][1])) / 2,
  ]);

  return { data, projection, topologyGeometryById, renderGeometryById };
}
