import { geoNaturalEarth1, geoPath, type GeoProjection } from "d3-geo";
import type { Geometry } from "geojson";
import type { FittedCountryLabel } from "./labelLayout";
import { removePolygonalGeometryHoles, simplifyPolygonalGeometry } from "./geometrySimplify";
import { mapInBatches } from "./mapWork";
import type { MapData } from "./types";

type MapExtent = [[number, number], [number, number]];

/** Generated from the same base geometry as the packed map bundle. */
export type MapRenderPreparation = {
  version: 1;
  referenceBounds: MapExtent;
  labelProjection: { scale: number; translate: [number, number]; simplifyTolerance: number };
  baseCountryLabels: Array<{ id: string; name: string; label: FittedCountryLabel | null }>;
};

export type PreparedMapRendering = {
  data: MapData;
  projection: GeoProjection;
  topologyGeometryById: Map<string, Geometry>;
  renderGeometryById: Map<string, Geometry>;
  baseCountryLabels: ReadonlyMap<string, FittedCountryLabel | null>;
};

/** Prepare the base map without making its first React render one long task. */
export async function prepareMapRendering(
  data: MapData,
  extent: MapExtent,
  simplifyTolerance: number,
  isCancelled: () => boolean,
  metadata?: unknown,
): Promise<PreparedMapRendering | null> {
  // Use the same reference scale and streamed bounds as D3's fitExtent.
  // Per-region bounds can be combined without changing the fitted projection.
  const projection = geoNaturalEarth1().scale(150).translate([0, 0]);
  const path = geoPath(projection);
  const preparation = readMapRenderPreparation(metadata);
  const bounds: MapExtent = preparation?.referenceBounds ?? [[Infinity, Infinity], [-Infinity, -Infinity]];
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
    if (!preparation) {
      const regionBounds = path.bounds(geometry);
      bounds[0][0] = Math.min(bounds[0][0], regionBounds[0][0]);
      bounds[0][1] = Math.min(bounds[0][1], regionBounds[0][1]);
      bounds[1][0] = Math.max(bounds[1][0], regionBounds[1][0]);
      bounds[1][1] = Math.max(bounds[1][1], regionBounds[1][1]);
    }

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
  if (!result || isCancelled()) return null;

  fitMapProjectionToBounds(projection, bounds, extent);
  const baseCountryLabels = new Map<string, FittedCountryLabel | null>();
  const translate = projection.translate();
  if (preparation && preparation.labelProjection.simplifyTolerance === simplifyTolerance && preparation.labelProjection.scale === projection.scale() &&
    preparation.labelProjection.translate[0] === translate[0] && preparation.labelProjection.translate[1] === translate[1]) {
    const countries = new Map(data.countries.map((country) => [country.id, country]));
    for (const row of preparation.baseCountryLabels) {
      if (countries.get(row.id)?.name === row.name) baseCountryLabels.set(row.id, row.label);
    }
  }

  return { data, projection, topologyGeometryById, renderGeometryById, baseCountryLabels };
}

/** Shared by offline preparation and the runtime fallback. */
export function fitMapProjectionToBounds(projection: GeoProjection, bounds: MapExtent, extent: MapExtent): void {
  const width = extent[1][0] - extent[0][0];
  const height = extent[1][1] - extent[0][1];
  const scale = Math.min(width / (bounds[1][0] - bounds[0][0]), height / (bounds[1][1] - bounds[0][1]));
  projection.scale(150 * scale).translate([
    extent[0][0] + (width - scale * (bounds[1][0] + bounds[0][0])) / 2,
    extent[0][1] + (height - scale * (bounds[1][1] + bounds[0][1])) / 2,
  ]);
}

function isPoint(value: unknown): value is [number, number] {
  return Array.isArray(value) && value.length === 2 && value.every((coordinate) => typeof coordinate === "number" && Number.isFinite(coordinate));
}

function readMapRenderPreparation(value: unknown): MapRenderPreparation | null {
  if (!value || typeof value !== "object") return null;
  const candidate = value as Partial<MapRenderPreparation>;
  const bounds = candidate.referenceBounds;
  const labelProjection = candidate.labelProjection;
  if (candidate.version !== 1 || !Array.isArray(bounds) || bounds.length !== 2 || !bounds.every(isPoint) ||
    bounds[0][0] >= bounds[1][0] || bounds[0][1] >= bounds[1][1] ||
    !labelProjection || typeof labelProjection !== "object" || !Number.isFinite(labelProjection.scale) || labelProjection.scale <= 0 ||
    !isPoint(labelProjection.translate) || !Number.isFinite(labelProjection.simplifyTolerance) || labelProjection.simplifyTolerance < 0 ||
    !Array.isArray(candidate.baseCountryLabels)) return null;

  const ids = new Set<string>();
  for (const row of candidate.baseCountryLabels) {
    if (!row || typeof row !== "object" || typeof row.id !== "string" || typeof row.name !== "string" || ids.has(row.id)) return null;
    ids.add(row.id);
    const label = row.label;
    if (label === null) continue;
    if (!label || typeof label !== "object" || label.id !== row.id || label.displayName !== row.name.trim().toUpperCase() ||
      ![label.x, label.y, label.fontSize, label.letterSpacing, label.textLength, label.width, label.height, label.angle, label.priority]
        .every((number) => typeof number === "number" && Number.isFinite(number))) return null;
  }
  return candidate as MapRenderPreparation;
}
