import type { Geometry } from "geojson";
import type { RegionRecord } from "./types";

export type CountryLabelGeometryInput = {
  entityId: string;
  regionIds: string[];
  baseEntityById: Map<string, { regionIds: string[] }>;
  baseCountryByEntityId: Map<string, { geometry: Geometry }>;
  baseOwnerByRegionId: Map<string, string>;
  regionById: Map<string, RegionRecord>;
  fallbackGeometries: Geometry[];
  subtractGeoJsonGeometries: (geometry: Geometry, subtractGeometries: Geometry[]) => Geometry | null;
  unionGeoJsonGeometriesClosingGaps?: (geometries: Geometry[], gapTolerance: number) => Geometry | null;
  unionGapTolerance?: number;
};

export type CountryLabelGeometryResult = {
  cacheKey: string;
  geometries: Geometry[];
};

export function getCountryLabelCacheKey(entityId: string, entityName: string, regionIds: string[]): string {
  return [entityId, entityName, regionIds.join(",")].join("|");
}

export function getCountryLabelGeometry(input: CountryLabelGeometryInput & { entityName: string }): CountryLabelGeometryResult {
  const hasBaseCountryGeometry = input.baseEntityById.has(input.entityId) && input.baseCountryByEntityId.has(input.entityId);

  return {
    cacheKey: getCountryLabelCacheKey(input.entityId, input.entityName, input.regionIds),
    geometries: hasBaseCountryGeometry ? getCountryLabelGeometries(input) : input.fallbackGeometries,
  };
}

export function getCountryLabelGeometries(input: CountryLabelGeometryInput): Geometry[] {
  const baseEntity = input.baseEntityById.get(input.entityId);
  const baseCountry = input.baseCountryByEntityId.get(input.entityId);
  const ownsNativeRegion = baseEntity?.regionIds.some((regionId) => input.regionIds.includes(regionId));
  if (!baseEntity || !baseCountry || !ownsNativeRegion) return input.fallbackGeometries;

  const ownedRegionIds = new Set(input.regionIds);
  const missingBaseGeometries = baseEntity.regionIds
    .filter((regionId) => !ownedRegionIds.has(regionId))
    .map((regionId) => input.regionById.get(regionId)?.geometry)
    .filter((geometry): geometry is Geometry => Boolean(geometry));
  const transferredGeometries = input.regionIds
    .filter((regionId) => input.baseOwnerByRegionId.get(regionId) !== input.entityId)
    .map((regionId) => input.regionById.get(regionId)?.geometry)
    .filter((geometry): geometry is Geometry => Boolean(geometry));

  const nativeGeometry =
    missingBaseGeometries.length > 0
      ? input.subtractGeoJsonGeometries(baseCountry.geometry, missingBaseGeometries)
      : baseCountry.geometry;

  const geometries = nativeGeometry ? [nativeGeometry, ...transferredGeometries] : transferredGeometries;
  if (geometries.length <= 1 || !input.unionGeoJsonGeometriesClosingGaps) return geometries;

  const unioned = input.unionGeoJsonGeometriesClosingGaps(geometries, input.unionGapTolerance ?? 0);
  return unioned ? [unioned] : geometries;
}
