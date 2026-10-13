import type { Geometry } from "geojson";
import { geoContains } from "d3-geo";
import { describe, expect, it } from "vitest";
import {
  prepareCountryLabelGeometryInput,
  prepareStableBaseGeometryInput,
  runCountryGeometryTask,
  type StableBaseGeometryWorkerInput,
} from "./countryGeometryTasks";

function rectangle(minX: number, minY: number, maxX: number, maxY: number): Geometry {
  return { type: "Polygon", coordinates: [[[minX, minY], [minX, maxY], [maxX, maxY], [maxX, minY], [minX, minY]]] };
}

describe("country geometry worker tasks", () => {
  it("unions overlapping custom pieces without removing their shared land", async () => {
    const result = await runCountryGeometryTask({ kind: "union-owned", geometries: [rectangle(0, 0, 6, 10), rectangle(4, 0, 10, 10)] });
    expect(result).not.toBeNull();
    expect(geoContains(result as Geometry, [5, 5])).toBe(true);
  });

  it("copies only native, owned and lost custom regions for stable fills", async () => {
    const source = rectangle(0, 0, 10, 10);
    const remaining = rectangle(0, 0, 8, 10);
    const lost = rectangle(8, 0, 10, 10);
    const foreign = rectangle(20, 0, 22, 2);
    const input: StableBaseGeometryWorkerInput = {
      entityId: "AAA",
      regionIds: ["remaining", "foreign"],
      baseEntityById: new Map([["AAA", { regionIds: ["native"] }], ["BBB", { regionIds: ["other"] }]]),
      baseCountryByEntityId: new Map([["AAA", { geometry: source }], ["BBB", { geometry: foreign }]]),
      baseOwnerByRegionId: new Map([["native", "AAA"], ["other", "BBB"], ["foreign", "BBB"]]),
      regionGeometryById: new Map([["native", source], ["remaining", remaining], ["lost", lost], ["other", foreign], ["foreign", foreign]]),
      regionOwners: { remaining: "AAA", lost: "BBB", other: "BBB", foreign: "AAA" },
      unionGapTolerance: 0,
    };
    const prepared = prepareStableBaseGeometryInput(input);
    expect([...prepared.baseCountryByEntityId.keys()]).toEqual(["AAA"]);
    expect([...prepared.regionGeometryById.keys()]).toEqual(["native", "remaining", "foreign", "lost"]);
    expect(prepared.regionGeometryById.has("other")).toBe(false);
    expect(prepared.baseOwnerByRegionId.has("foreign")).toBe(true);
    const original = await runCountryGeometryTask({ kind: "stable-base", input });
    const result = await runCountryGeometryTask({ kind: "stable-base", input: structuredClone(prepared) });
    expect(result).toEqual(original);
    expect(geoContains(result as Geometry, [5, 5])).toBe(true);
    expect(geoContains(result as Geometry, [9, 5])).toBe(false);
    expect(geoContains(result as Geometry, [21, 1])).toBe(true);
  });

  it("keeps label geometry after a native region is transferred", async () => {
    const input = prepareCountryLabelGeometryInput({
      entityId: "AAA",
      regionIds: ["left"],
      baseEntityById: new Map([["AAA", { regionIds: ["left", "right"] }], ["BBB", { regionIds: ["other"] }]]),
      baseCountryByEntityId: new Map([["AAA", { geometry: rectangle(0, 0, 10, 10) }]]),
      baseOwnerByRegionId: new Map([["left", "AAA"], ["right", "AAA"], ["other", "BBB"]]),
      regionById: new Map(["left", "right", "other"].map((id, index) => [id, { id, name: id, type: "Region", geometry: rectangle(index * 5, 0, index * 5 + 5, 10) }])),
      fallbackGeometries: [],
    });
    expect([...input.regionById.keys()]).toEqual(["left", "right"]);
    const result = await runCountryGeometryTask({ kind: "label-geometry", input: structuredClone(input) }) as Geometry[];
    expect(result).toHaveLength(1);
    expect(geoContains(result[0], [2, 5])).toBe(true);
    expect(geoContains(result[0], [8, 5])).toBe(false);
  });
});
