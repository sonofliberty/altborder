import { geoContains } from "d3-geo";
import type { Geometry, Position } from "geojson";
import { describe, expect, it } from "vitest";
import { completeDivisionLand } from "./divisionLandCoverage";
import { buildDivideTerritories, divideRegions, splitCountryGeometry } from "./geometrySplit";
import { combineRegionLand, withRegionLandAddition } from "./regionLandGeometry";
import { decodeSharePayload, encodeSharePayload } from "./share";
import { applyScenarioPayload, cloneSnapshot, createInitialSnapshot, createScenarioPayload, divideCountry, transferRegions } from "./state";
import type { EditorSnapshot, MapData, RegionRecord } from "./types";

describe("division land coverage", () => {
  it("saves only added land for moved native IDs and follows partial transfers", async () => {
    const data = fixture();
    const before = createInitialSnapshot(data);
    const result = cut(before, data, "AAA", rectangle(0, 0, 8, 10), rectangle(8, 0, 10, 10));
    expect(result.snapshot.entities[result.entityId].regionIds).toContain("west");
    expect(result.snapshot.customRegions.west).toBeUndefined();
    const addition = result.snapshot.regionLandAdditions?.west;
    expect(addition).toBeDefined();
    expect(geoContains(addition!, [4.95, 5])).toBe(true);
    expect(geoContains(addition!, [2, 5])).toBe(false);
    expect(before.regionLandAdditions).toBeUndefined();
    const cloned = cloneSnapshot(result.snapshot);
    delete cloned.regionLandAdditions!.west;
    expect(result.snapshot.regionLandAdditions?.west).toBeDefined();

    const decoded = await decodeSharePayload(await encodeSharePayload(createScenarioPayload(data, result.snapshot)));
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) return;
    const restored = applyScenarioPayload(data, decoded.payload);
    const moved = transferRegions(restored, ["west"], "AAA");
    expect(moved.regionOwners.west).toBe("AAA");
    expect(geoContains(effectiveRegion(moved, data, "west").geometry, [4.95, 5])).toBe(true);
    expect(moved.entities[result.entityId].regionIds).not.toContain("west");
    expect(effectiveRegion(moved, data, "east")).toBe(data.regions[1]);
  });

  it("splits saved additions with the region in a later cut", () => {
    const data = fixture();
    const first = cut(createInitialSnapshot(data), data, "AAA", rectangle(0, 0, 8, 10), rectangle(8, 0, 10, 10));
    const regions = first.snapshot.entities[first.entityId].regionIds.map((id) => effectiveRegion(first.snapshot, data, id));
    const split = splitCountryGeometry(regions, [[4.95, -1], [4.95, 11]]);
    expect(split.ok).toBe(true);
    if (!split.ok) return;
    const preview = buildDivideTerritories(split, split.defaultNewPieceIndex);
    const second = cut(first.snapshot, data, first.entityId, preview.newGeometry, preview.existingGeometry, [[4.95, -1], [4.95, 11]]);
    expect(second.snapshot.regionOwners.west).toBe("");
    expect(second.snapshot.regionLandAdditions?.west).toBeUndefined();
    for (const point of [[4.92, 5], [4.98, 5]] as [number, number][]) {
      const expectedOwner = geoContains(preview.newGeometry, point) ? second.entityId : first.entityId;
      const owned = Object.values(second.snapshot.customRegions).filter((region) => second.snapshot.regionOwners[region.id] === expectedOwner);
      expect(owned.some((region) => geoContains(region.geometry, point)), `Saved added land at ${point}`).toBe(true);
    }
  });

  it("absorbs additions into split records without duplicating old metadata", () => {
    const data = fixture();
    const snapshot = createInitialSnapshot(data);
    snapshot.regionLandAdditions = { west: rectangle(4.9, 0, 5.1, 10) };
    const combined = combineRegionLand(data.regions[0].geometry, snapshot.regionLandAdditions.west);
    expect(geoContains(combined, [4.95, 5])).toBe(true);
    const result = cut(snapshot, data, "AAA", rectangle(0, 0, 4.95, 10), rectangle(4.95, 0, 10, 10));
    expect(result.snapshot.regionLandAdditions?.west).toBeUndefined();
    expect(Object.keys(result.snapshot.customRegions).some((id) => id.endsWith("TERRITORY"))).toBe(true);
  });

  it("prunes unknown or retired addition IDs on load", () => {
    const data = fixture();
    const payload = createScenarioPayload(data, createInitialSnapshot(data));
    payload.regionLandAdditions = { unknown: rectangle(0, 0, 1, 1), west: rectangle(4.9, 0, 5.1, 10) };
    payload.regionOwnerChanges.push(["west", ""]);
    expect(applyScenarioPayload(data, payload).regionLandAdditions).toBeUndefined();
  });

  it("rejects invalid saved additions and accepts old payloads", async () => {
    const data = fixture();
    const payload = createScenarioPayload(data, createInitialSnapshot(data));
    expect((await decodeSharePayload(await encodeSharePayload(payload))).ok).toBe(true);
    payload.regionLandAdditions = { west: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [2, 0], [0, 0]]] } };
    expect((await decodeSharePayload(await encodeSharePayload(payload))).ok).toBe(false);
  });
});

function cut(snapshot: EditorSnapshot, data: MapData, source: string, newGeometry: Geometry, existingGeometry: Geometry, cutLine?: Position[]) {
  const regions = snapshot.entities[source].regionIds.map((id) => effectiveRegion(snapshot, data, id));
  const divisions = completeDivisionLand(regions, divideRegions(regions, newGeometry, { cutLine }), { newGeometry, existingGeometry }, snapshot.regionLandAdditions);
  return divideCountry(snapshot, source, new Map(regions.map((region) => [region.id, region])), divisions, "New country", "#abcdef")!;
}

function effectiveRegion(snapshot: EditorSnapshot, data: MapData, id: string): RegionRecord {
  const region = snapshot.customRegions[id] ?? data.regions.find((region) => region.id === id)!;
  return withRegionLandAddition(region, snapshot.regionLandAdditions?.[id]);
}

function fixture(): MapData {
  return {
    version: 1, attribution: "Test", boundaryEdges: [],
    countries: [{ id: "AAA", name: "Original", color: "#abcdef", regionIds: ["west", "east"] }],
    baseCountries: [{ entityId: "AAA", geometry: rectangle(0, 0, 10, 10) }],
    regions: [
      { id: "west", name: "West", type: "Region", ownerId: "AAA", geometry: rectangle(0, 0, 4.9, 10) },
      { id: "east", name: "East", type: "Region", ownerId: "AAA", geometry: rectangle(5.1, 0, 10, 10) },
    ],
  };
}

function rectangle(minX: number, minY: number, maxX: number, maxY: number): Extract<Geometry, { type: "Polygon" }> {
  return { type: "Polygon", coordinates: [[[minX, minY], [minX, maxY], [maxX, maxY], [maxX, minY], [minX, minY]]] };
}
