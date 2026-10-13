import type { Geometry } from "geojson";
type GeometrySplitModule = typeof import("./geometrySplit");

export type StableBaseRenderGeometryInput = {
  baseCountryByEntityId: Map<string, { geometry: Geometry }>;
  baseEntityById: Map<string, { regionIds: string[] }>;
  baseOwnerByRegionId: Map<string, string>;
  entityId: string;
  regionGeometryById: Map<string, Geometry>;
  regionIds: string[];
  regionOwners: Readonly<Record<string, string>>;
  subtractGeoJsonGeometries: GeometrySplitModule["subtractGeoJsonGeometries"];
  unionGeoJsonGeometries: GeometrySplitModule["unionGeoJsonGeometries"];
  unionGeoJsonGeometriesClosingGaps?: GeometrySplitModule["unionGeoJsonGeometriesClosingGaps"];
  unionGapTolerance?: number;
};

/** A single union prevents overlapping subdivisions from cancelling in SVG. */
export async function unionOwnedRegionRenderGeometry(geometries: Geometry[]): Promise<Geometry | null> {
  const coordinates = geometries.flatMap((geometry) => geometry.type === "Polygon"
    ? [geometry.coordinates] : geometry.type === "MultiPolygon" ? geometry.coordinates : []);
  if (coordinates.length === 0) return null;
  const { overlayPolygonalGeometry } = await import("./polygonOverlay.mjs");
  const geometry = overlayPolygonalGeometry("union", { type: "MultiPolygon", coordinates }, { type: "MultiPolygon", coordinates: [] });
  if (geometry.type !== "MultiPolygon" || geometry.coordinates.length === 0) return null;
  // Clipper emits standard GeoJSON winding; d3-geo expects the reverse winding.
  return { ...geometry, coordinates: geometry.coordinates.map((polygon) => polygon.map((ring) => [...ring].reverse())) };
}

export function shouldUseStableBaseRenderGeometry(
  entityId: string,
  regionIds: string[],
  baseEntityById: Map<string, { regionIds: string[] }>,
  baseCountryByEntityId: Map<string, { geometry: Geometry }>,
  sensitiveEntityIds: ReadonlySet<string>,
  regionOwners: Readonly<Record<string, string>>,
): boolean {
  const baseEntity = baseEntityById.get(entityId);
  if (!baseEntity || !baseCountryByEntityId.has(entityId)) return false;
  const ownedIds = new Set(regionIds);
  const hasNativeRegion = baseEntity.regionIds.some((id) => ownedIds.has(id));
  const hasMissingNativeRegion = baseEntity.regionIds.some((id) => !ownedIds.has(id));
  const hasRetiredRegion = baseEntity.regionIds.some((id) => !regionOwners[id]);
  // A cut can replace every original ID, including in a country with one region.
  return Boolean(
    (hasNativeRegion && (sensitiveEntityIds.has(entityId) || hasMissingNativeRegion)) ||
    (hasRetiredRegion && regionIds.some((id) => !baseEntity.regionIds.includes(id))),
  );
}

export async function buildStableBaseRenderGeometry({
  baseCountryByEntityId,
  baseEntityById,
  baseOwnerByRegionId,
  entityId,
  regionGeometryById,
  regionIds,
  regionOwners,
  subtractGeoJsonGeometries,
  unionGeoJsonGeometries,
  unionGeoJsonGeometriesClosingGaps,
  unionGapTolerance,
}: StableBaseRenderGeometryInput): Promise<Geometry | null> {
  const baseEntity = baseEntityById.get(entityId);
  const baseCountry = baseCountryByEntityId.get(entityId);
  if (!baseEntity || !baseCountry) return null;

  const ownedRegionIds = new Set(regionIds);
  const ownsNativeRegion = baseEntity.regionIds.some((id) => ownedRegionIds.has(id));
  const retiredBaseGeometries = baseEntity.regionIds
    .filter((id) => !regionOwners[id])
    .map((id) => regionGeometryById.get(id))
    .filter((geometry): geometry is Geometry => Boolean(geometry));
  const customGeometries = regionIds
    .filter((id) => !baseOwnerByRegionId.has(id))
    .map((id) => regionGeometryById.get(id))
    .filter((geometry): geometry is Geometry => Boolean(geometry));
  const missingBaseGeometries = baseEntity.regionIds
    .filter((regionId) => !ownedRegionIds.has(regionId) && Boolean(regionOwners[regionId]))
    .map((regionId) => regionGeometryById.get(regionId))
    .filter((geometry): geometry is Geometry => Boolean(geometry));
  const nativeCutFootprint = retiredBaseGeometries.length > 0
    ? unionGeoJsonGeometries([baseCountry.geometry, ...retiredBaseGeometries])
    : null;
  const { overlayPolygonalGeometry } = await import("./polygonOverlay.mjs");
  const foreignGeometries = regionIds
    .filter((regionId) => baseOwnerByRegionId.get(regionId) !== entityId)
    .map((regionId) => {
      const geometry = regionGeometryById.get(regionId);
      if (!geometry || baseOwnerByRegionId.has(regionId) || !nativeCutFootprint) return geometry;
      // Native cut pieces are already represented by ADM0 minus lost land.
      // ADM1 can extend over a neighbor's border; adding it back would paint
      // that neighbor with the source country's color. Keep only acquired land
      // outside both the original country and its retired subdivisions.
      // Match the overlay coordinate grid so rounding does not create false
      // acquisitions along the original subdivision's boundary.
      return subtractGeoJsonGeometries(geometry, [nativeCutFootprint], { preserveCoordinates: true, boundaryTolerance: 0.00002 });
    })
    .filter((geometry): geometry is Geometry => Boolean(geometry));

  if (!ownsNativeRegion) {
    const ownsRetiredNativeLand = retiredBaseGeometries.some((baseGeometry) =>
      customGeometries.some((geometry) => {
        const intersection = overlayPolygonalGeometry("intersection", baseGeometry, geometry);
        return intersection.type === "MultiPolygon" && intersection.coordinates.length > 0;
      }),
    );
    // An original country that only owns foreign land must not regain its old land.
    if (!ownsRetiredNativeLand) {
      return unionGeoJsonGeometriesClosingGaps
        ? unionGeoJsonGeometriesClosingGaps(foreignGeometries, unionGapTolerance ?? 0)
        : unionGeoJsonGeometries(foreignGeometries);
    }
  }

  // Retired IDs represent cuts. Remove the pieces owned elsewhere from ADM0;
  // removing the entire old subdivision would also remove land gaps in ADM1.
  const lostCustomGeometries = retiredBaseGeometries.length > 0
    ? [...regionGeometryById]
      .filter(([id]) => !baseOwnerByRegionId.has(id) && Boolean(regionOwners[id]) && regionOwners[id] !== entityId)
      .map(([, geometry]) => geometry)
    : [];
  const lostGeometries = [...missingBaseGeometries, ...lostCustomGeometries];
  let stableBaseGeometry =
    lostGeometries.length > 0
      ? subtractGeoJsonGeometries(baseCountry.geometry, lostGeometries, { preserveCoordinates: true })
      : baseCountry.geometry;

  if (stableBaseGeometry && lostGeometries.length > 0) {
    const ownedNativeGeometries = regionIds
      .filter((id) => baseOwnerByRegionId.get(id) === entityId || !baseOwnerByRegionId.has(id))
      .map((id) => regionGeometryById.get(id))
      .filter((geometry): geometry is Geometry => Boolean(geometry));
    const components = stableBaseGeometry.type === "Polygon"
      ? [stableBaseGeometry.coordinates]
      : stableBaseGeometry.type === "MultiPolygon" ? stableBaseGeometry.coordinates : [];
    const ownedComponents = components.filter((coordinates) =>
      ownedNativeGeometries.some((geometry) => {
        const intersection = overlayPolygonalGeometry("intersection", { type: "Polygon", coordinates }, geometry);
        return intersection.type === "MultiPolygon" && intersection.coordinates.length > 0;
      }),
    );
    // A data gap inside lost land can become an isolated piece after subtraction.
    // Keep only components that contain actual owned land, including islands.
    stableBaseGeometry = ownedComponents.length > 0
      ? { type: "MultiPolygon", coordinates: ownedComponents }
      : null;
  }

  if (!stableBaseGeometry) return foreignGeometries.length > 0 ? unionGeoJsonGeometries(foreignGeometries) : null;
  if (foreignGeometries.length === 0) return stableBaseGeometry;
  const expandedGeometries = [stableBaseGeometry, ...foreignGeometries];
  const expandedGeometry = unionGeoJsonGeometriesClosingGaps
    ? unionGeoJsonGeometriesClosingGaps(expandedGeometries, unionGapTolerance ?? 0)
    : unionGeoJsonGeometries(expandedGeometries);
  // Gap closing must not fill a narrow cut or a subdivision transferred away.
  return expandedGeometry && lostGeometries.length > 0
    ? subtractGeoJsonGeometries(expandedGeometry, lostGeometries, { preserveCoordinates: true })
    : expandedGeometry;
}
