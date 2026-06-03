import { describe, expect, it } from "vitest";
import type { MapData, RegionRecord, ScenarioPayload } from "./types";
import {
  applyScenarioPayload,
  createInitialSnapshot,
  createScenarioPayload,
  renameRegion,
  separateRegionAsCountry,
  transferRegions,
} from "./state";

describe("scenario custom regions", () => {
  it("serializes and restores custom divided regions", () => {
    const data = makeMapData();
    const snapshot = createInitialSnapshot(data);
    const customRegion: RegionRecord = {
      id: "CUSTOM_001-TERRITORY",
      name: "Newland",
      ownerId: "CUSTOM_001",
      type: "Custom divided territory",
      geometry: data.regions[0].geometry,
    };

    snapshot.customCounter = 2;
    snapshot.entities.CUSTOM_001 = {
      id: "CUSTOM_001",
      name: "Newland",
      color: "#A85F4F",
      regionIds: [customRegion.id],
      isCustom: true,
      createdFrom: "AAA",
    };
    snapshot.customRegions[customRegion.id] = customRegion;
    snapshot.regionOwners.AAA_ALL = "";
    snapshot.regionOwners[customRegion.id] = "CUSTOM_001";

    const payload = createScenarioPayload(data, snapshot);
    const restored = applyScenarioPayload(data, payload);

    expect(payload.customRegions).toHaveLength(1);
    expect(restored.customRegions[customRegion.id]?.name).toBe("Newland");
    expect(restored.regionOwners.AAA_ALL).toBe("");
    expect(restored.entities.CUSTOM_001.regionIds).toEqual([customRegion.id]);
  });

  it("loads old v1 payloads without customRegions", () => {
    const data = makeMapData();
    const payload: ScenarioPayload = {
      version: 1,
      title: "Old map",
      description: "",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [],
    };

    expect(applyScenarioPayload(data, payload).customRegions).toEqual({});
  });

  it("serializes and restores region name overrides", () => {
    const data = makeMapData();
    const snapshot = renameRegion(createInitialSnapshot(data), "BBB_1", "Renamed Beta");

    const payload = createScenarioPayload(data, snapshot);
    const restored = applyScenarioPayload(data, payload);

    expect(payload.regionNameOverrides).toEqual({ BBB_1: "Renamed Beta" });
    expect(restored.regionNameOverrides.BBB_1).toBe("Renamed Beta");
  });
});

describe("region transfers", () => {
  it("updates only moved region owners and affected entity region lists", () => {
    const data = makeMapData();
    const snapshot = createInitialSnapshot(data);

    const next = transferRegions(snapshot, ["BBB_1"], "AAA");

    expect(next).not.toBe(snapshot);
    expect(next.regionOwners.BBB_1).toBe("AAA");
    expect(next.regionOwners.BBB_2).toBe("BBB");
    expect(next.entities.AAA.regionIds).toEqual(["AAA_ALL", "BBB_1"]);
    expect(next.entities.BBB.regionIds).toEqual(["BBB_2"]);
    expect(next.entities.CCC).toBe(snapshot.entities.CCC);
  });

  it("returns the same snapshot when nothing changes", () => {
    const data = makeMapData();
    const snapshot = createInitialSnapshot(data);

    expect(transferRegions(snapshot, ["AAA_ALL"], "AAA")).toBe(snapshot);
    expect(transferRegions(snapshot, ["MISSING"], "AAA")).toBe(snapshot);
  });

  it("separates one region into a new custom country", () => {
    const data = makeMapData();
    const snapshot = createInitialSnapshot(data);

    const result = separateRegionAsCountry(snapshot, "BBB_1", "Beta Coast", "#A85F4F");

    expect(result?.entityId).toBe("CUSTOM_001");
    expect(result?.snapshot.regionOwners.BBB_1).toBe("CUSTOM_001");
    expect(result?.snapshot.entities.CUSTOM_001).toMatchObject({
      id: "CUSTOM_001",
      name: "Beta Coast",
      color: "#A85F4F",
      regionIds: ["BBB_1"],
      isCustom: true,
      createdFrom: "BBB:BBB_1",
    });
    expect(result?.snapshot.entities.BBB.regionIds).toEqual(["BBB_2"]);
    expect(result?.snapshot.customCounter).toBe(2);
  });
});

function makeMapData(): MapData {
  const region: RegionRecord = {
    id: "AAA_ALL",
    name: "Alpha",
    ownerId: "AAA",
    type: "Whole country fallback",
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
  const betaRegion1: RegionRecord = {
    id: "BBB_1",
    name: "Beta One",
    ownerId: "BBB",
    type: "Test region",
    geometry: region.geometry,
  };
  const betaRegion2: RegionRecord = {
    id: "BBB_2",
    name: "Beta Two",
    ownerId: "BBB",
    type: "Test region",
    geometry: region.geometry,
  };
  const gammaRegion: RegionRecord = {
    id: "CCC_ALL",
    name: "Gamma",
    ownerId: "CCC",
    type: "Whole country fallback",
    geometry: region.geometry,
  };

  return {
    version: 1,
    attribution: "test",
    baseCountries: [
      { entityId: "AAA", geometry: region.geometry },
      { entityId: "BBB", geometry: region.geometry },
      { entityId: "CCC", geometry: region.geometry },
    ],
    countries: [
      {
        id: "AAA",
        name: "Alpha",
        color: "#4F76A8",
        regionIds: [region.id],
      },
      {
        id: "BBB",
        name: "Beta",
        color: "#6F9A5C",
        regionIds: [betaRegion1.id, betaRegion2.id],
      },
      {
        id: "CCC",
        name: "Gamma",
        color: "#B75D58",
        regionIds: [gammaRegion.id],
      },
    ],
    regions: [region, betaRegion1, betaRegion2, gammaRegion],
    subdivisionBorders: [],
  };
}
