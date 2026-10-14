import { describe, expect, it } from "vitest";
import type { Geometry, Position } from "geojson";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import BufferOp from "jsts/org/locationtech/jts/operation/buffer/BufferOp.js";
import OverlayOp from "jsts/org/locationtech/jts/operation/overlay/OverlayOp.js";
import mapDataFixture from "../public/data/map-data.json";
import { completeDivisionLand } from "./divisionLandCoverage";
import { buildDivideTerritories, divideRegions, separateCountryIsland, splitCountryGeometry } from "./geometrySplit";
import { applyScenarioPayload, createInitialSnapshot, createScenarioPayload, divideCountry, renameRegion, transferRegions } from "./state";
import { decodeSharePayload, encodeSharePayload } from "./share";
import { overlayPolygonalGeometry } from "./polygonOverlay.mjs";
import type { MapData, RegionRecord } from "./types";

describe("country division with subdivisions", () => {
  it("keeps polygon land when the preview also touches a fragment along an edge", () => {
    const regions: RegionRecord[] = [{ id: "square", name: "Square", type: "Region", geometry: square(0, 0, 10, 10) }];
    const preview: Geometry = {
      type: "MultiPolygon",
      coordinates: [square(0, 0, 5, 9), square(-1, 9.5, 0, 10)]
        .flatMap((geometry) => geometry.type === "Polygon" ? [geometry.coordinates] : []),
    };
    const divisions = divideRegions(regions, preview, { cutLine: [[5, -1], [5, 11]] });
    expect(divisions[0].kind).toBe("split");
    if (divisions[0].kind !== "split") return;
    expect(area(divisions[0].newGeometry)).toBeCloseTo(45, 10);
    expect(area(divisions[0].existingGeometry)).toBeCloseTo(55, 10);
    expect(OverlayOp.intersection(readPolygon(divisions[0].newGeometry), readPolygon(divisions[0].existingGeometry)).getArea()).toBe(0);
  });

  it("divides either side of northern Poland after three regions are transferred", async () => {
    const data = mapDataFixture as MapData;
    const original = transferRegions(createInitialSnapshot(data), ["POL-PL-ZP", "POL-PL-LB", "POL-PL-WN"], "DEU");
    const regions = data.regions.filter(({ id }) => original.regionOwners[id] === "POL");
    expect(regions).toHaveLength(13);
    const cutLine: Position[] = [[15, 53.3], [16.4, 53.35], [17.5, 53.4], [18.5, 53.4], [19.2, 53.5]];
    const split = splitCountryGeometry(regions, cutLine);
    expect(split.ok, split.ok ? "" : split.reason).toBe(true);
    if (!split.ok) return;

    for (const side of [0, 1] as const) {
      const territory = buildDivideTerritories(split, side);
      const divisions = divideRegions(regions, territory.newGeometry, { cutLine });
      expect(divisions).toHaveLength(13);
      expect(divisions.some(({ kind }) => kind !== "keep")).toBe(true);
      expect(divisions.some(({ kind }) => kind !== "move")).toBe(true);
      for (const division of divisions) {
        if (division.kind !== "split") continue;
        const region = regions.find(({ id }) => id === division.regionId)!;
        // Fallback overlays use the map's five-decimal coordinate grid.
        expect(area(division.existingGeometry) + area(division.newGeometry), region.id).toBeCloseTo(area(region.geometry), 5);
        expect(OverlayOp.intersection(readPolygon(division.existingGeometry), readPolygon(division.newGeometry)).getArea(), region.id).toBeLessThan(1e-8);
      }
      const completeDivisions = completeDivisionLand(regions, divisions, territory);
      const result = divideCountry(original, "POL", byId(regions), completeDivisions, "Northern Poland", "#a85f4f");
      expect(result).not.toBeNull();
      if (!result) continue;
      expect(new Set(result.snapshot.entities.DEU.regionIds)).toEqual(new Set(original.entities.DEU.regionIds));
      const decoded = await decodeSharePayload(await encodeSharePayload(createScenarioPayload(data, result.snapshot)));
      expect(decoded.ok, decoded.ok ? "" : decoded.error).toBe(true);
      if (decoded.ok) expect(applyScenarioPayload(data, decoded.payload).customRegions).toEqual(result.snapshot.customRegions);
    }
  });

  it("keeps the name of a single-region country after annexation and sharing", async () => {
    const data = smallMap();
    const original = createInitialSnapshot(data);
    const divided = divideCountry(original, "AAA", byId(data.regions), divideRegions(data.regions, square(14, 0, 15, 10)), "Elsass", "#a85f4f")!;
    const regionId = divided.snapshot.entities[divided.entityId].regionIds[0];
    divided.snapshot.entities[divided.entityId].name = "Elsass renamed";
    const annexed = transferRegions(divided.snapshot, [regionId], "AAA");
    expect(annexed.regionNameOverrides[regionId]).toBe("Elsass renamed");
    expect(annexed.entities[divided.entityId]).toBeUndefined();
    expect(annexed.customRegions[regionId].geometry).toEqual(divided.snapshot.customRegions[regionId].geometry);
    const decoded = await decodeSharePayload(await encodeSharePayload(createScenarioPayload(data, annexed)));
    expect(decoded.ok).toBe(true);
    if (decoded.ok) expect(applyScenarioPayload(data, decoded.payload).regionNameOverrides[regionId]).toBe("Elsass renamed");

    const renamed = renameRegion(divided.snapshot, regionId, "Regional name");
    expect(transferRegions(renamed, [regionId], "AAA").regionNameOverrides[regionId]).toBe("Regional name");
    expect(divided.snapshot.regionNameOverrides[regionId]).toBeUndefined();
  });

  it("keeps a region name set before division on both pieces after annexation and sharing", async () => {
    const data = smallMap();
    const original = renameRegion(createInitialSnapshot(data), "east", "East province");
    const divided = divideCountry(original, "AAA", byId(data.regions), divideRegions(data.regions, square(14, 0, 15, 10)), "Elsass", "#a85f4f")!;
    const territoryId = divided.snapshot.entities[divided.entityId].regionIds[0];
    const remainderId = divided.snapshot.entities.AAA.regionIds.find(id => divided.snapshot.customRegions[id])!;

    expect(divided.snapshot.regionNameOverrides[territoryId]).toBe("East province");
    expect(divided.snapshot.regionNameOverrides[remainderId]).toBe("East province");
    expect(divided.snapshot.regionNameOverrides.east).toBeUndefined();
    expect(original.regionNameOverrides.east).toBe("East province");

    const annexed = transferRegions(divided.snapshot, [territoryId], "AAA");
    expect(annexed.regionNameOverrides[territoryId]).toBe("East province");
    expect(annexed.regionNameOverrides[remainderId]).toBe("East province");
    const decoded = await decodeSharePayload(await encodeSharePayload(createScenarioPayload(data, annexed)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    expect(applyScenarioPayload(data, decoded.payload).regionNameOverrides).toEqual(annexed.regionNameOverrides);
  });

  it("carries a region name through a second division and annexation", () => {
    const data = smallMap();
    const original = renameRegion(createInitialSnapshot(data), "east", "East province");
    const first = divideCountry(original, "AAA", byId(data.regions), divideRegions(data.regions, square(14, 0, 15, 10)), "First", "#a85f4f")!;
    const firstTerritoryId = first.snapshot.entities[first.entityId].regionIds[0];
    const firstRemainderId = first.snapshot.entities.AAA.regionIds.find(id => first.snapshot.customRegions[id])!;
    const remaining = [...data.regions, ...Object.values(first.snapshot.customRegions)]
      .filter(({ id }) => first.snapshot.regionOwners[id] === "AAA");
    const second = divideCountry(first.snapshot, "AAA", byId(remaining), divideRegions(remaining, square(13, 0, 14, 10)), "Second", "#739087")!;
    const secondTerritoryId = second.snapshot.entities[second.entityId].regionIds[0];
    const secondRemainderId = second.snapshot.entities.AAA.regionIds.find(id => second.snapshot.customRegions[id])!;

    expect(second.snapshot.regionNameOverrides[firstRemainderId]).toBeUndefined();
    for (const id of [firstTerritoryId, secondTerritoryId, secondRemainderId]) {
      expect(second.snapshot.regionNameOverrides[id]).toBe("East province");
    }
    expect(transferRegions(second.snapshot, [secondTerritoryId], "AAA").regionNameOverrides[secondTerritoryId]).toBe("East province");
  });

  it("uses the country name after a region name is cleared before division", () => {
    const data = smallMap();
    const renamed = renameRegion(createInitialSnapshot(data), "east", "East province");
    const original = renameRegion(renamed, "east", " ");
    const divided = divideCountry(original, "AAA", byId(data.regions), divideRegions(data.regions, square(14, 0, 15, 10)), "Elsass", "#a85f4f")!;
    const territoryId = divided.snapshot.entities[divided.entityId].regionIds[0];
    expect(divided.snapshot.regionNameOverrides[territoryId]).toBeUndefined();
    expect(transferRegions(divided.snapshot, [territoryId], "AAA").regionNameOverrides[territoryId]).toBe("Elsass");
  });

  it.each([
    { name: "island", cutLine: [[8.27, 40.93], [8.27, 41.18]] },
    { name: "coastal cape", cutLine: [[12.46, 36.59], [12.46, 38.40]] },
  ])("cuts either side of an Italian $name without replacing unrelated subdivisions", async ({ cutLine: coordinates }) => {
    const data = mapDataFixture as MapData;
    const original = createInitialSnapshot(data);
    const regions = data.regions.filter(({ id }) => original.regionOwners[id] === "ITA");
    const base = data.baseCountries.find(({ entityId }) => entityId === "ITA")!;
    const cutLine: Position[] = coordinates;
    const split = splitCountryGeometry([{ id: "Italy", name: "Italy", type: "Country", geometry: base.geometry }], cutLine);
    expect(split.ok, split.ok ? "" : split.reason).toBe(true);
    if (!split.ok) return;

    for (const side of [0, 1] as const) {
      const preview = buildDivideTerritories(split, side).newGeometry;
      const divisions = divideRegions(regions, preview, { cutLine });
      const result = divideCountry(original, "ITA", byId(regions), divisions, "Island country", "#a85f4f");
      expect(result).not.toBeNull();
      if (!result) continue;
      expect(divisions.filter(({ kind }) => kind === "split")).toHaveLength(1);
      expect(result.snapshot.entities.ITA.regionIds).toHaveLength(regions.length);
      for (const division of divisions.filter(({ kind }) => kind === "keep")) {
        expect(result.snapshot.regionOwners[division.regionId]).toBe("ITA");
        expect(result.snapshot.customRegions[division.regionId]).toBeUndefined();
      }
      const territoryId = result.snapshot.entities[result.entityId].regionIds[0];
      expect(OverlayOp.symDifference(readPolygon(result.snapshot.customRegions[territoryId].geometry), readPolygon(preview)).getArea()).toBeLessThan(0.00001);
      const decoded = await decodeSharePayload(await encodeSharePayload(createScenarioPayload(data, result.snapshot)));
      expect(decoded.ok).toBe(true);
      if (!decoded.ok) continue;
      const restored = applyScenarioPayload(data, decoded.payload);
      expect(restored.regionOwners).toEqual(result.snapshot.regionOwners);
      expect(restored.customRegions).toEqual(result.snapshot.customRegions);
    }
  });

  it("detaches the Italian island or cuts its remainder again without losing the mainland", () => {
    const data = mapDataFixture as MapData;
    const original = createInitialSnapshot(data);
    const regions = data.regions.filter(({ id }) => original.regionOwners[id] === "ITA");
    const base = data.baseCountries.find(({ entityId }) => entityId === "ITA")!;
    const country = [{ id: "Italy", name: "Italy", type: "Country", geometry: base.geometry }];
    const island = separateCountryIsland(country, [8.269642857142852, 41.05]);
    expect(island.ok, island.ok ? "" : island.reason).toBe(true);
    if (!island.ok) return;
    const detached = divideCountry(original, "ITA", byId(regions), divideRegions(regions, buildDivideTerritories(island, 0).newGeometry, { island: true }), "Island", "#a85f4f");
    expect(detached).not.toBeNull();
    expect(detached!.snapshot.entities.ITA.regionIds).toHaveLength(regions.length);

    const firstLine: Position[] = [[8.27, 40.93], [8.27, 41.18]];
    const firstSplit = splitCountryGeometry(country, firstLine);
    expect(firstSplit.ok).toBe(true);
    if (!firstSplit.ok) return;
    const first = divideCountry(original, "ITA", byId(regions), divideRegions(regions, buildDivideTerritories(firstSplit, firstSplit.defaultNewPieceIndex).newGeometry, { cutLine: firstLine }), "First island", "#a85f4f")!;
    expect(first).not.toBeNull();
    const remaining = [...data.regions, ...Object.values(first.snapshot.customRegions)].filter(({ id }) => first.snapshot.regionOwners[id] === "ITA");
    const secondLine: Position[] = [[8.30, 40.93], [8.30, 41.18]];
    const secondSplit = splitCountryGeometry(remaining, secondLine);
    expect(secondSplit.ok, secondSplit.ok ? "" : secondSplit.reason).toBe(true);
    if (!secondSplit.ok) return;
    const second = divideCountry(first.snapshot, "ITA", byId(remaining), divideRegions(remaining, buildDivideTerritories(secondSplit, secondSplit.defaultNewPieceIndex).newGeometry, { cutLine: secondLine }), "Second island", "#739087");
    expect(second).not.toBeNull();
    expect(second!.snapshot.entities.ITA.regionIds).toHaveLength(regions.length);
    expect(second!.snapshot.entities[first.entityId].regionIds).toEqual(first.snapshot.entities[first.entityId].regionIds);
  });

  it("keeps untouched regions and clips only the region crossed by a small cut", () => {
    const data = smallMap();
    const original = createInitialSnapshot(data);
    original.regionNameOverrides.east = "East province";
    original.regionNameOverrides.west = "West province";
    const divisions = divideRegions(data.regions, square(14, 0, 15, 10));
    expect(divisions.map(({ kind }) => kind)).toEqual(["keep", "keep", "split"]);
    const result = divideCountry(original, "AAA", byId(data.regions), divisions, "Newland", "#a85f4f");
    expect(result).not.toBeNull();
    const next = result!.snapshot;
    expect(next.regionOwners.west).toBe("AAA");
    expect(next.regionOwners.center).toBe("AAA");
    expect(next.regionOwners.east).toBe("");
    expect(next.regionNameOverrides.west).toBe("West province");
    expect(next.entities.AAA.regionIds).toHaveLength(3);
    expect(next.entities[result!.entityId].regionIds).toHaveLength(1);
    const pieces = Object.values(next.customRegions);
    expect(pieces).toHaveLength(2);
    expect(pieces.every(({ name, type }) => name === "East province" && type === "Province")).toBe(true);
    expect(pieces.reduce((total, piece) => total + area(piece.geometry), 0)).toBeCloseTo(50, 8);
    expect(area(pieces.find(({ ownerId }) => ownerId === result!.entityId)!.geometry)).toBeCloseTo(10, 8);
    expect(original.entities.AAA.regionIds).toEqual(["west", "center", "east"]);
    expect(original.customRegions).toEqual({});
  });

  it("transfers whole regions without replacing their IDs or names", () => {
    const data = smallMap();
    const original = createInitialSnapshot(data);
    original.regionNameOverrides.east = "Renamed east";
    const divisions = divideRegions(data.regions, square(10, 0, 15, 10));
    expect(divisions.map(({ kind }) => kind)).toEqual(["keep", "keep", "move"]);
    const result = divideCountry(original, "AAA", byId(data.regions), divisions, "Newland", "#a85f4f")!;
    expect(result.snapshot.entities[result.entityId].regionIds).toEqual(["east"]);
    expect(result.snapshot.regionNameOverrides.east).toBe("Renamed east");
    expect(result.snapshot.customRegions).toEqual({});
  });

  it("preserves both pieces and unchanged names through an encoded shared link", async () => {
    const data = smallMap();
    const original = createInitialSnapshot(data);
    original.regionNameOverrides.west = "West province";
    const divided = divideCountry(original, "AAA", byId(data.regions), divideRegions(data.regions, square(14, 0, 15, 10)), "Newland", "#a85f4f")!;
    const payload = createScenarioPayload(data, divided.snapshot);
    const decoded = await decodeSharePayload(await encodeSharePayload(payload));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const restored = applyScenarioPayload(data, decoded.payload);
    expect(restored.entities.AAA.regionIds).toEqual(divided.snapshot.entities.AAA.regionIds);
    expect(restored.regionOwners).toEqual(divided.snapshot.regionOwners);
    expect(restored.customRegions).toEqual(divided.snapshot.customRegions);
    expect(restored.regionNameOverrides.west).toBe("West province");
    expect(payload.regionOwnerChanges.some(([id]) => id === "west" || id === "center")).toBe(false);
  });

  it("supports a second cut through a custom region without retiring unrelated subdivisions", async () => {
    const data = smallMap();
    const first = divideCountry(createInitialSnapshot(data), "AAA", byId(data.regions), divideRegions(data.regions, square(14, 0, 15, 10)), "First", "#a85f4f")!;
    const regions = [...data.regions, ...Object.values(first.snapshot.customRegions)]
      .filter(({ id }) => first.snapshot.regionOwners[id] === "AAA");
    const second = divideCountry(first.snapshot, "AAA", byId(regions), divideRegions(regions, square(13, 0, 14, 10)), "Second", "#739087")!;
    expect(second.snapshot.regionOwners.west).toBe("AAA");
    expect(second.snapshot.regionOwners.center).toBe("AAA");
    expect(second.snapshot.entities.AAA.regionIds).toHaveLength(3);
    expect(second.snapshot.entities[first.entityId].regionIds).toEqual(first.snapshot.entities[first.entityId].regionIds);
    expect(Object.values(second.snapshot.customRegions).reduce((total, region) => total + area(region.geometry), 0)).toBeCloseTo(50, 8);
    const decoded = await decodeSharePayload(await encodeSharePayload(createScenarioPayload(data, second.snapshot)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const restored = applyScenarioPayload(data, decoded.payload);
    expect(restored.regionOwners).toEqual(second.snapshot.regionOwners);
    expect(restored.customRegions).toEqual(second.snapshot.customRegions);
  });

  it("detaches an island without changing its mainland region", () => {
    const mainland: RegionRecord = { id: "mainland", name: "Mainland", type: "Province", geometry: square(0, 0, 10, 10) };
    const islands: RegionRecord = { id: "islands", name: "Islands", type: "Province", geometry: {
      type: "MultiPolygon",
      coordinates: [square(20, 0, 25, 5), square(30, 0, 35, 5)].map(geometry => geometry.type === "Polygon" ? geometry.coordinates : []),
    } };
    const divisions = divideRegions([mainland, islands], square(20, 0, 25, 5), { island: true });
    expect(divisions[0]).toEqual({ regionId: "mainland", kind: "keep" });
    expect(divisions[1].kind).toBe("split");
    if (divisions[1].kind !== "split") return;
    expect(area(divisions[1].newGeometry)).toBeCloseTo(25, 8);
    expect(area(divisions[1].existingGeometry)).toBeCloseTo(25, 8);
  });

  it("keeps most French subdivisions after a small cut near the eastern border", () => {
    const data = mapDataFixture as MapData;
    const original = createInitialSnapshot(data);
    const regions = data.regions.filter(({ id }) => original.regionOwners[id] === "FRA");
    const base = data.baseCountries.find(({ entityId }) => entityId === "FRA")!;
    const split = splitCountryGeometry([{ id: "France", name: "France", type: "Country", geometry: base.geometry }], [[7.2, 46.5], [7.2, 51]]);
    expect(split.ok, split.ok ? "" : split.reason).toBe(true);
    if (!split.ok) return;
    for (const side of [0, 1] as const) {
      const divisions = divideRegions(regions, buildDivideTerritories(split, side).newGeometry, { cutLine: [[7.2, 46.5], [7.2, 51]] });
      const result = divideCountry(original, "FRA", byId(regions), divisions, "Borderland", "#a85f4f");
      expect(result).not.toBeNull();
      expect(divisions.filter(({ kind }) => kind === "split").length).toBeLessThan(regions.length / 2);
      if (side === split.defaultNewPieceIndex) {
        const unchanged = divisions.filter(({ kind }) => kind === "keep");
        expect(unchanged.length).toBeGreaterThan(regions.length / 2);
        for (const { regionId } of unchanged) {
          expect(result!.snapshot.regionOwners[regionId]).toBe("FRA");
          expect(result!.snapshot.customRegions[regionId]).toBeUndefined();
        }
      }
    }
  });

  it.each([0, 1] as const)("reloads a shared France division with side %s selected", async (side) => {
    const data = mapDataFixture as MapData;
    const original = createInitialSnapshot(data);
    const regions = data.regions.filter(({ id }) => original.regionOwners[id] === "FRA");
    const base = data.baseCountries.find(({ entityId }) => entityId === "FRA")!;
    const cutLine: Position[] = [[6.5, 49.6], [7.5, 47.4]];
    const split = splitCountryGeometry([{ id: "France", name: "France", type: "Country", geometry: base.geometry }], cutLine);
    expect(split.ok, split.ok ? "" : split.reason).toBe(true);
    if (!split.ok) return;

    const preview = buildDivideTerritories(split, side).newGeometry;
    const divisions = divideRegions(regions, preview, { cutLine });
    const result = divideCountry(original, "FRA", byId(regions), divisions, "Borderland", "#a85f4f")!;
    expect(result).not.toBeNull();
    const decoded = await decodeSharePayload(await encodeSharePayload(createScenarioPayload(data, result.snapshot)));
    expect(decoded.ok, decoded.ok ? "" : decoded.error).toBe(true);
    if (!decoded.ok) return;
    const restored = applyScenarioPayload(data, decoded.payload);
    expect(restored.customRegions).toEqual(result.snapshot.customRegions);
    expect(restored.entities[result.entityId]).toEqual(result.snapshot.entities[result.entityId]);
    for (const division of divisions) {
      if (division.kind !== "split") continue;
      const originalRegion = regions.find(({ id }) => id === division.regionId)!;
      expect(area(division.existingGeometry) + area(division.newGeometry)).toBeCloseTo(area(originalRegion.geometry), 8);
    }
  });

  it("saves every preview fragment when a bent cut crosses a subdivision several times", () => {
    const regions: RegionRecord[] = Array.from({ length: 9 }, (_, index) => {
      const x = index % 3;
      const y = Math.floor(index / 3);
      return { id: `region-${x}-${y}`, name: `Region ${x}-${y}`, ownerId: "AAA", type: "Province", geometry: square(x * 5, y * 5, (x + 1) * 5, (y + 1) * 5) };
    });
    const data: MapData = { ...smallMap(), regions, baseCountries: [{ entityId: "AAA", geometry: square(0, 0, 15, 15) }], countries: [{ id: "AAA", name: "Original", color: "#739087", regionIds: regions.map(({ id }) => id) }] };
    const cutLine: Position[] = [[-1, 4], [3.5, 13.5], [3.5, 5.5], [5.5, 13.5], [16, 0]];
    const split = splitCountryGeometry([{ id: "country", name: "Original", type: "Country", geometry: data.baseCountries[0].geometry }], cutLine);
    expect(split.ok, split.ok ? "" : split.reason).toBe(true);
    if (!split.ok) return;

    for (const side of [0, 1] as const) {
      const preview = buildDivideTerritories(split, side).newGeometry;
      const divisions = divideRegions(regions, preview, { cutLine });
      const result = divideCountry(createInitialSnapshot(data), "AAA", byId(regions), divisions, "Newland", "#a85f4f")!;
      expect(result).not.toBeNull();
      const saved = result.snapshot.entities[result.entityId].regionIds.map(id => result.snapshot.customRegions[id]?.geometry ?? byId(regions).get(id)!.geometry);
      const savedGeometry = saved.reduce((union, geometry) => OverlayOp.union(union, readPolygon(geometry)), readPolygon({ type: "MultiPolygon", coordinates: [] }));
      expect(OverlayOp.symDifference(savedGeometry, readPolygon(preview)).getArea()).toBeLessThan(0.0001);
      for (const division of divisions) {
        const original = regions.find(({ id }) => id === division.regionId)!;
        const savedArea = division.kind === "keep" ? 0 : division.kind === "move" ? area(original.geometry) : area(division.newGeometry);
        expect(savedArea).toBeCloseTo(OverlayOp.intersection(readPolygon(original.geometry), readPolygon(preview)).getArea(), 4);
        if (division.kind === "split") {
          expect(area(division.existingGeometry) + area(division.newGeometry)).toBeCloseTo(area(original.geometry), 6);
        }
      }
    }
  });

  it("retains and shares a small valid fragment when the cut passes close to a region corner", async () => {
    const regions: RegionRecord[] = [
      { id: "west", name: "West", type: "Province", geometry: square(0, 0, 10, 10) },
      { id: "east", name: "East", type: "Province", geometry: square(10, 0, 20, 10) },
    ];
    const cutLine: Position[] = [[8.9999, 11], [20.9999, -1]];
    const data: MapData = {
      ...smallMap(),
      regions,
      baseCountries: [{ entityId: "AAA", geometry: square(0, 0, 20, 10) }],
      countries: [{ id: "AAA", name: "Original", color: "#739087", regionIds: regions.map(({ id }) => id) }],
    };
    const split = splitCountryGeometry([{ id: "country", name: "Original", type: "Country", geometry: square(0, 0, 20, 10) }], cutLine);
    expect(split.ok, split.ok ? "" : split.reason).toBe(true);
    if (!split.ok) return;
    for (const side of [0, 1] as const) {
      const preview = buildDivideTerritories(split, side).newGeometry;
      const divisions = divideRegions(regions, preview, { cutLine });
      const division = divisions[0];
      expect(division.kind).toBe("split");
      if (division.kind !== "split") continue;
      expect(area(division.newGeometry)).toBeCloseTo(OverlayOp.intersection(readPolygon(regions[0].geometry), readPolygon(preview)).getArea(), 10);
      expect(Math.min(area(division.newGeometry), area(division.existingGeometry))).toBeGreaterThan(0);
      expect(Math.min(area(division.newGeometry), area(division.existingGeometry))).toBeLessThan(1e-8);
      expect(area(division.newGeometry) + area(division.existingGeometry)).toBeCloseTo(100, 10);
      const result = divideCountry(createInitialSnapshot(data), "AAA", byId(regions), divisions, "Newland", "#a85f4f")!;
      const decoded = await decodeSharePayload(await encodeSharePayload(createScenarioPayload(data, result.snapshot)));
      expect(decoded.ok, decoded.ok ? "" : decoded.error).toBe(true);
      if (decoded.ok) expect(applyScenarioPayload(data, decoded.payload).customRegions).toEqual(result.snapshot.customRegions);
    }
  });

  it("preserves the selected Para fragments for either side of a bent Brazil cut", () => {
    const data = mapDataFixture as MapData;
    const original = createInitialSnapshot(data);
    const regions = data.regions.filter(({ id }) => original.regionOwners[id] === "BRA");
    const base = data.baseCountries.find(({ entityId }) => entityId === "BRA")!;
    const cutLine: Position[] = [[-76, -12.351820915937424], [-69.067048284458, -5.520430877804756], [-57.20434979419224, -27.625148832798004], [-56.84757352829911, -0.46007172763347626], [-32, -25.338263981044292]];
    const split = splitCountryGeometry([{ id: "Brazil", name: "Brazil", type: "Country", geometry: base.geometry }], cutLine);
    expect(split.ok, split.ok ? "" : split.reason).toBe(true);
    if (!split.ok) return;
    const para = regions.find(({ id }) => id === "BRA-BR-PA")!;
    const countryPreview = OverlayOp.union(readPolygon(split.pieces[0].geometry), readPolygon(split.pieces[1].geometry));
    for (const side of [0, 1] as const) {
      const preview = buildDivideTerritories(split, side).newGeometry;
      const divisions = divideRegions(regions, preview, { cutLine });
      const division = divisions.find(({ regionId }) => regionId === para.id)!;
      expect(division.kind).toBe("split");
      if (division.kind !== "split") continue;
      const expected = OverlayOp.intersection(readPolygon(para.geometry), readPolygon(preview));
      const savedWithinCountry = OverlayOp.intersection(readPolygon(division.newGeometry), countryPreview);
      expect(OverlayOp.symDifference(savedWithinCountry, expected).getArea() / area(para.geometry)).toBeLessThan(0.001);
      for (const fragment of divisions) {
        const originalRegion = regions.find(({ id }) => id === fragment.regionId)!;
        const selectedGeometry = fragment.kind === "split" ? fragment.newGeometry : fragment.kind === "move" ? originalRegion.geometry : { type: "MultiPolygon", coordinates: [] } satisfies Geometry;
        const expectedSelected = readPolygon(overlayPolygonalGeometry("intersection", originalRegion.geometry, preview));
        const actualSelected = readPolygon(overlayPolygonalGeometry("intersection", selectedGeometry, base.geometry));
        expect(OverlayOp.symDifference(actualSelected, expectedSelected).getArea() / area(originalRegion.geometry), originalRegion.id).toBeLessThan(0.001);
        if (fragment.kind === "split") {
          // Coastal fallback intersections use the map's five-decimal coordinate grid.
          expect(area(fragment.existingGeometry) + area(fragment.newGeometry)).toBeCloseTo(area(originalRegion.geometry), 5);
        }
      }
      expect(divideCountry(original, "BRA", byId(regions), divisions, "Newland", "#a85f4f")).not.toBeNull();
    }
  });
});

const geometryReader = new GeoJSONReader(new GeometryFactory());
function readPolygon(geometry: Geometry) {
  return BufferOp.bufferOp(geometryReader.read(geometry), 0);
}

function square(minX: number, minY: number, maxX: number, maxY: number): Geometry {
  return { type: "Polygon", coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]] };
}

function smallMap(): MapData {
  const regions = ["west", "center", "east"].map((id, index) => ({ id, name: id, ownerId: "AAA", type: "Province", geometry: square(index * 5, 0, (index + 1) * 5, 10) }));
  return { version: 1, attribution: "Test", regions, boundaryEdges: [], baseCountries: [{ entityId: "AAA", geometry: square(0, 0, 15, 10) }], countries: [{ id: "AAA", name: "Original", color: "#739087", regionIds: regions.map(({ id }) => id) }] };
}

function byId(regions: RegionRecord[]) {
  return new Map(regions.map(region => [region.id, region]));
}

function area(geometry: Geometry): number {
  const ringArea = (ring: Position[]) => Math.abs(ring.reduce((sum, point, index) => {
    const next = ring[(index + 1) % ring.length];
    return sum + point[0] * next[1] - next[0] * point[1];
  }, 0)) / 2;
  const polygonArea = (polygon: Position[][]) => ringArea(polygon[0]) - polygon.slice(1).reduce((total, hole) => total + ringArea(hole), 0);
  if (geometry.type === "Polygon") return polygonArea(geometry.coordinates);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.reduce((total, polygon) => total + polygonArea(polygon), 0);
  throw new Error("Expected polygon geometry");
}
