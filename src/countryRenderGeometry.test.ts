import { geoContains } from "d3-geo";
import type { Geometry, Position } from "geojson";
import { describe, expect, it } from "vitest";
import mapDataFixture from "../public/data/map-data.json";
import { buildStableBaseRenderGeometry, shouldUseStableBaseRenderGeometry, unionOwnedRegionRenderGeometry } from "./countryRenderGeometry";
import { completeDivisionLand } from "./divisionLandCoverage";
import { withRegionLandAddition } from "./regionLandGeometry";
import { decodeSharePayload, encodeSharePayload } from "./share";
import { getCompleteBaseCountryGroups } from "./countryRenderGroups";
import { removePolygonalGeometryHoles } from "./geometrySimplify";
import {
  buildDivideTerritories,
  divideRegions,
  splitCountryGeometry,
  subtractGeoJsonGeometries,
  unionGeoJsonGeometries,
  unionGeoJsonGeometriesClosingGaps,
} from "./geometrySplit";
import { applyScenarioPayload, createInitialSnapshot, createScenarioPayload, divideCountry, transferRegions } from "./state";
import { overlayPolygonalGeometry } from "./polygonOverlay.mjs";
import type { EditorSnapshot, MapData } from "./types";

const data = mapDataFixture as MapData;
const baseCountries = new Map(data.baseCountries.map((country) => [country.entityId, country]));
const baseOwners = new Map(data.countries.flatMap((entity) => entity.regionIds.map((id) => [id, entity.id] as const)));
const sensitiveEntityIds = new Set(["BOL", "BRA", "RUS", "USA"]);

describe("country fills after dividing subdivisions", () => {
  it.each([0, 1] as const)("preserves the preview fill on both sides of the France cut (new side: %s)", async (side) => {
    const original = createInitialSnapshot(data);
    const regions = data.regions.filter(({ id }) => original.regionOwners[id] === "FRA");
    const cutLine: Position[] = [[6.5, 49.6], [7.5, 47.4]];
    const split = splitCountryGeometry([{ id: "FRA", name: "France", type: "Country", geometry: baseCountries.get("FRA")!.geometry }], cutLine);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const preview = buildDivideTerritories(split, side);
    const divisions = completeDivisionLand(regions, divideRegions(regions, preview.newGeometry, { cutLine }), preview);
    const divided = divideCountry(original, "FRA", new Map(regions.map((region) => [region.id, region])), divisions, "New France", "#a85f4f")!;
    const decoded = await decodeSharePayload(await encodeSharePayload(createScenarioPayload(data, divided.snapshot)));
    expect(decoded.ok, decoded.ok ? "" : decoded.error).toBe(true);
    if (!decoded.ok) return;
    const restored = applyScenarioPayload(data, decoded.payload);
    const newFill = (await renderFill(restored, divided.entityId))!;
    const sourceFill = (await renderFill(restored, "FRA"))!;
    for (const point of [[-1.08, 48.52], [2.08, 44.96], [-1.38, 48.48], [-0.9, 46.32]] as [number, number][]) {
      expect(geoContains(newFill, point), `New country land at ${point}`).toBe(geoContains(preview.newGeometry, point));
      expect(geoContains(sourceFill, point), `Source country land at ${point}`).toBe(geoContains(preview.existingGeometry, point));
    }
    for (let x = -4.9; x < 8.5; x += 0.1) {
      for (let y = 42.4; y < 51.1; y += 0.1) {
        const point: [number, number] = [x, y];
        const insidePreview = [point, [x - 0.005, y], [x + 0.005, y], [x, y - 0.005], [x, y + 0.005]]
          .every((candidate) => geoContains(preview.newGeometry, candidate as [number, number]));
        if (insidePreview) expect(geoContains(newFill, point), `New preview land at ${point}`).toBe(true);
      }
    }
    if (side === 0) {
      const point: [number, number] = [2.08, 44.96];
      const ownerRegion = [...data.regions, ...Object.values(restored.customRegions)]
        .map((region) => withRegionLandAddition(region, restored.regionLandAdditions?.[region.id]))
        .find((region) => restored.regionOwners[region.id] === divided.entityId &&
          planarArea(overlayPolygonalGeometry("intersection", region.geometry, rectangle(point[0] - 0.00001, point[1] - 0.00001, point[0] + 0.00001, point[1] + 0.00001))) > 0)!;
      expect(ownerRegion).toBeDefined();
      const transferred = transferRegions(restored, [ownerRegion.id], "DEU");
      expect(geoContains((await renderFill(transferred, divided.entityId))!, point)).toBe(false);
      expect(geoContains((await renderFill(transferred, "DEU"))!, point)).toBe(true);
      const annexed = transferRegions(restored, restored.entities[divided.entityId].regionIds, "DEU");
      expect(geoContains((await renderFill(annexed, "DEU"))!, point)).toBe(true);
    }
  }, 20000);

  it("fills overlapping native regions once in a custom country", async () => {
    const fill = (await unionOwnedRegionRenderGeometry([rectangle(0, 0, 6, 10), rectangle(4, 0, 10, 10)]))!;
    expect(geoContains(fill, [5, 5])).toBe(true);
    expect(planarArea(fill)).toBe(100);
  });

  it("keeps France out of Germany after dividing and transferring Elsass", async () => {
    const original = createInitialSnapshot(data);
    const regions = data.regions.filter(({ id }) => original.regionOwners[id] === "FRA");
    const cutLine: Position[] = [[6.5, 49.6], [7.5, 47.4]];
    const split = splitCountryGeometry([{ id: "FRA", name: "France", type: "Country", geometry: baseCountries.get("FRA")!.geometry }], cutLine);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const preview = buildDivideTerritories(split, split.defaultNewPieceIndex);
    const divisions = completeDivisionLand(regions, divideRegions(regions, preview.newGeometry, { cutLine }), preview);
    const divided = divideCountry(original, "FRA", new Map(regions.map((region) => [region.id, region])), divisions, "Elsass", "#a85f4f")!;
    const annexed = transferRegions(divided.snapshot, divided.snapshot.entities[divided.entityId].regionIds, "DEU");
    const decoded = await decodeSharePayload(await encodeSharePayload(createScenarioPayload(data, annexed)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const restored = applyScenarioPayload(data, decoded.payload);
    const germanyBase = baseCountries.get("DEU")!.geometry;
    for (const snapshot of [divided.snapshot, annexed, restored]) {
      const franceFill = (await renderFill(snapshot, "FRA"))!;
      expect(planarArea(overlayPolygonalGeometry("intersection", franceFill, germanyBase))).toBeLessThan(0.00001);
    }
    const germanyFill = (await renderFill(restored, "DEU"))!;
    expect(planarArea(overlayPolygonalGeometry("difference", germanyBase, germanyFill))).toBeLessThan(0.00001);
    expect(planarArea(overlayPolygonalGeometry("difference", preview.newGeometry, germanyFill))).toBeLessThan(0.00001);
  });

  it("preserves acquired land outside a retired native subdivision", async () => {
    const fixture = singleRegionMap();
    const original = createInitialSnapshot(fixture);
    const region = fixture.regions[0];
    const divided = divideCountry(original, "AAA", new Map([[region.id, region]]), divideRegions([region], rectangle(8, 0, 10, 10)), "Native cut", "#a85f4f")!;
    const remainder = divided.snapshot.customRegions[divided.snapshot.entities.AAA.regionIds[0]];
    remainder.geometry = { type: "MultiPolygon", coordinates: [
      ...(remainder.geometry.type === "Polygon" ? [remainder.geometry.coordinates] : remainder.geometry.type === "MultiPolygon" ? remainder.geometry.coordinates : []),
      rectangle(20, 0, 30, 10).coordinates,
    ] };
    const fill = (await renderFill(divided.snapshot, "AAA", fixture))!;
    expect(geoContains(fill, [5, 5])).toBe(true);
    expect(geoContains(fill, [25, 5])).toBe(true);
    expect(geoContains(fill, [9, 5])).toBe(false);
  });

  it("preserves inland France land without restoring Elsass after annexation", async () => {
    const original = createInitialSnapshot(data);
    const france = baseCountries.get("FRA")!;
    const regions = data.regions.filter(({ id }) => original.regionOwners[id] === "FRA");
    const cutLine: Position[] = [[6.5, 49.6], [7.5, 47.4]];
    const split = splitCountryGeometry([{ id: "FRA", name: "France", type: "Country", geometry: france.geometry }], cutLine);
    expect(split.ok, split.ok ? "" : split.reason).toBe(true);
    if (!split.ok) return;
    const preview = buildDivideTerritories(split, split.defaultNewPieceIndex);
    const divided = divideCountry(original, "FRA", new Map(regions.map((region) => [region.id, region])), divideRegions(regions, preview.newGeometry, { cutLine }), "Elsass", "#a85f4f")!;
    const annexed = transferRegions(divided.snapshot, divided.snapshot.entities[divided.entityId].regionIds, "DEU");
    const fill = await renderFill(annexed, "FRA");
    expect(fill).not.toBeNull();
    for (const point of [[-1.08, 48.52], [2.08, 44.96]] as [number, number][]) {
      expect(geoContains(preview.existingGeometry, point)).toBe(true);
      expect(geoContains(fill!, point), `France must retain land at ${point}`).toBe(true);
    }
    expect(geoContains(preview.newGeometry, [7.35, 48.4])).toBe(true);
    expect(geoContains(fill!, [7.35, 48.4])).toBe(false);
    expect(planarArea(overlayPolygonalGeometry("intersection", fill!, preview.newGeometry))).toBeLessThan(0.00001);

    const keptRegionId = annexed.entities.FRA.regionIds.find((id) => baseOwners.has(id))!;
    const transferred = transferRegions(annexed, [keptRegionId], "DEU");
    const transferredGeometry = data.regions.find(({ id }) => id === keptRegionId)!.geometry;
    const nextFill = (await renderFill(transferred, "FRA"))!;
    expect(planarArea(overlayPolygonalGeometry("intersection", transferredGeometry, nextFill))).toBeLessThan(0.00001);
  });

  it.each([false, true])("keeps the correct source fill when its only region is split (other side: %s)", async (otherSide) => {
    const fixture = singleRegionMap();
    const original = createInitialSnapshot(fixture);
    const region = fixture.regions[0];
    const mask = otherSide ? rectangle(0, 0, 8, 10) : rectangle(8, 0, 10, 10);
    const divided = divideCountry(original, "AAA", new Map([[region.id, region]]), divideRegions([region], mask), "First cut", "#a85f4f")!;
    const sourceRegionIds = divided.snapshot.entities.AAA.regionIds;
    expect(sourceRegionIds).toHaveLength(1);
    expect(sourceRegionIds).not.toContain(region.id);
    const fill = (await renderFill(divided.snapshot, "AAA", fixture))!;
    expect(geoContains(fill, [5, 5])).toBe(!otherSide);
    expect(geoContains(fill, [9, 5])).toBe(otherSide);
    expect(geoContains(fill, [13, 1])).toBe(true);
    const newGeometry = divided.snapshot.customRegions[divided.snapshot.entities[divided.entityId].regionIds[0]].geometry;
    expect(planarArea(overlayPolygonalGeometry("intersection", fill, newGeometry))).toBeLessThan(0.00001);
  });

  it("keeps source land through repeated cuts and excludes all lost pieces", async () => {
    const fixture = singleRegionMap();
    const original = createInitialSnapshot(fixture);
    const region = fixture.regions[0];
    const first = divideCountry(original, "AAA", new Map([[region.id, region]]), divideRegions([region], rectangle(8, 0, 10, 10)), "First cut", "#a85f4f")!;
    const remainder = first.snapshot.customRegions[first.snapshot.entities.AAA.regionIds[0]];
    const second = divideCountry(first.snapshot, "AAA", new Map([[remainder.id, remainder]]), divideRegions([remainder], rectangle(6, 0, 8, 10)), "Second cut", "#a85f4f")!;
    const fill = (await renderFill(second.snapshot, "AAA", fixture))!;
    expect(geoContains(fill, [5, 5])).toBe(true);
    expect(geoContains(fill, [13, 1])).toBe(true);
    for (const id of [first.entityId, second.entityId]) {
      for (const regionId of second.snapshot.entities[id].regionIds) {
        expect(planarArea(overlayPolygonalGeometry("intersection", fill, second.snapshot.customRegions[regionId].geometry))).toBeLessThan(0.00001);
      }
    }
  });

  it("does not restore the original country when only an acquired custom region remains", async () => {
    const fixture = singleRegionMap();
    const original = createInitialSnapshot(fixture);
    const region = fixture.regions[0];
    const divided = divideCountry(original, "AAA", new Map([[region.id, region]]), divideRegions([region], rectangle(8, 0, 10, 10)), "Native cut", "#a85f4f")!;
    const nativeIds = [...divided.snapshot.entities.AAA.regionIds];
    divided.snapshot.customRegions.foreign = { id: "foreign", name: "Foreign", type: "Region", ownerId: "AAA", geometry: rectangle(20, 0, 30, 10) };
    divided.snapshot.regionOwners.foreign = "AAA";
    divided.snapshot.entities.AAA.regionIds.push("foreign");
    const transferred = transferRegions(divided.snapshot, nativeIds, divided.entityId);
    const fill = (await renderFill(transferred, "AAA", fixture))!;
    expect(geoContains(fill, [25, 5])).toBe(true);
    expect(geoContains(fill, [5, 5])).toBe(false);
    expect(geoContains(fill, [13, 1])).toBe(false);
    expect(planarArea(overlayPolygonalGeometry("intersection", fill, fixture.baseCountries[0].geometry))).toBe(0);
  });
});

async function renderFill(snapshot: EditorSnapshot, entityId: string, fixture: MapData = data): Promise<Geometry | null> {
  const baseEntities = new Map(fixture.countries.map((entity) => [entity.id, entity]));
  const baseCountries = new Map(fixture.baseCountries.map((country) => [country.entityId, country]));
  const baseOwners = new Map(fixture.countries.flatMap((entity) => entity.regionIds.map((id) => [id, entity.id] as const)));
  const regionIds = snapshot.entities[entityId].regionIds;
  const geometriesById = new Map([...fixture.regions, ...Object.values(snapshot.customRegions)]
    .map((region) => withRegionLandAddition(region, snapshot.regionLandAdditions?.[region.id]))
    .map((region) => [region.id, removePolygonalGeometryHoles(region.geometry)] as const));
  if (shouldUseStableBaseRenderGeometry(entityId, regionIds, baseEntities, baseCountries, sensitiveEntityIds, snapshot.regionOwners)) {
    return buildStableBaseRenderGeometry({
      baseCountryByEntityId: baseCountries,
      baseEntityById: baseEntities,
      baseOwnerByRegionId: baseOwners,
      entityId,
      regionGeometryById: geometriesById,
      regionIds,
      regionOwners: snapshot.regionOwners,
      subtractGeoJsonGeometries,
      unionGeoJsonGeometries,
      unionGeoJsonGeometriesClosingGaps,
      unionGapTolerance: 0.08,
    });
  }
  const complete = getCompleteBaseCountryGroups(regionIds, baseEntities, baseOwners);
  const consumed = new Set([...complete.values()].flat());
  const geometries = [...complete.keys()].map((id) => baseCountries.get(id)!.geometry);
  geometries.push(...regionIds.filter((id) => !consumed.has(id)).map((id) => geometriesById.get(id)!));
  if (!baseEntities.has(entityId)) return unionOwnedRegionRenderGeometry(geometries);
  return unionGeoJsonGeometriesClosingGaps(geometries, 0.02);
}

function singleRegionMap(): MapData {
  const geometry: Geometry = { type: "MultiPolygon", coordinates: [rectangle(0, 0, 4.9, 10).coordinates, rectangle(5.1, 0, 10, 10).coordinates, rectangle(12, 0, 14, 2).coordinates] };
  return {
    version: 1, attribution: "Test",
    countries: [{ id: "AAA", name: "Country", color: "#abcdef", regionIds: ["native"] }],
    baseCountries: [{ entityId: "AAA", geometry: { type: "MultiPolygon", coordinates: [rectangle(0, 0, 10, 10).coordinates, rectangle(12, 0, 14, 2).coordinates] } }],
    regions: [{ id: "native", name: "Native", type: "Region", ownerId: "AAA", geometry }],
    boundaryEdges: [],
  };
}

function rectangle(minX: number, minY: number, maxX: number, maxY: number): Extract<Geometry, { type: "Polygon" }> {
  return { type: "Polygon", coordinates: [[[minX, minY], [minX, maxY], [maxX, maxY], [maxX, minY], [minX, minY]]] };
}

function planarArea(geometry: Geometry): number {
  const ringArea = (ring: Position[]) => Math.abs(ring.slice(1).reduce((sum, point, index) => sum + ring[index][0] * point[1] - point[0] * ring[index][1], 0) / 2);
  const polygonArea = (polygon: Position[][]) => ringArea(polygon[0]) - polygon.slice(1).reduce((sum, ring) => sum + ringArea(ring), 0);
  if (geometry.type === "Polygon") return polygonArea(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.reduce((sum, polygon) => sum + polygonArea(polygon), 0);
  return 0;
}
