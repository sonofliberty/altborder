import { describe, expect, it } from "vitest";
import type { CountryEntity, RegionRecord } from "./types";
import { getSelectedTransferRegions, getValidTransferFocus } from "./transferContext";

describe("transfer context helpers", () => {
  it("falls back to the first selected region when the focused region is removed", () => {
    expect(
      getValidTransferFocus({
        currentFocusId: "MISSING",
        selectedRegionIds: ["AAA_2", "AAA_1"],
        regionOwners: { AAA_1: "AAA", AAA_2: "AAA" },
        selectedEntityId: "AAA",
      }),
    ).toBe("AAA_2");
  });

  it("clears focus when the focused region is no longer owned by the selected country", () => {
    expect(
      getValidTransferFocus({
        currentFocusId: "AAA_1",
        selectedRegionIds: ["AAA_1"],
        regionOwners: { AAA_1: "BBB" },
        selectedEntityId: "AAA",
      }),
    ).toBe("");
  });

  it("uses display name overrides for selected transfer regions", () => {
    const regions = getSelectedTransferRegions({
      selectedRegionIds: ["AAA_1"],
      regionById: new Map([["AAA_1", region("AAA_1", "Original")]]),
      regionOwners: { AAA_1: "AAA" },
      entities: { AAA: country("AAA", "Alpha") },
      getRegionDisplayName: (regionId) => (regionId === "AAA_1" ? "Renamed Region" : regionId),
    });

    expect(regions[0]?.displayName).toBe("Renamed Region");
    expect(regions[0]?.ownerName).toBe("Alpha");
  });

  it("sorts multiple selected transfer regions by display name", () => {
    const regions = getSelectedTransferRegions({
      selectedRegionIds: ["AAA_2", "AAA_1", "AAA_3"],
      regionById: new Map([
        ["AAA_1", region("AAA_1", "Zurich")],
        ["AAA_2", region("AAA_2", "Aargau")],
        ["AAA_3", region("AAA_3", "Bern")],
      ]),
      regionOwners: { AAA_1: "AAA", AAA_2: "AAA", AAA_3: "AAA" },
      entities: { AAA: country("AAA", "Alpha") },
      getRegionDisplayName: (regionId) =>
        ({ AAA_1: "Zurich", AAA_2: "Aargau", AAA_3: "Bern" })[regionId] ?? regionId,
    });

    expect(regions.map((entry) => entry.displayName)).toEqual(["Aargau", "Bern", "Zurich"]);
  });
});

function country(id: string, name: string): CountryEntity {
  return {
    id,
    name,
    color: "#777777",
    regionIds: [],
  };
}

function region(id: string, name: string): RegionRecord {
  return {
    id,
    name,
    ownerId: "AAA",
    type: "Test region",
    geometry: {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
          [0, 0],
        ],
      ],
    },
  };
}
