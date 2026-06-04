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

  it("drops region name overrides for missing or inactive regions", () => {
    const data = makeMapData();
    const snapshot = renameRegion(createInitialSnapshot(data), "BBB_1", "Renamed Beta");
    snapshot.regionNameOverrides.MISSING = "Ghost";
    snapshot.regionNameOverrides.AAA_ALL = "Dormant Alpha";
    snapshot.regionOwners.AAA_ALL = "";

    const payload = createScenarioPayload(data, snapshot);
    const restored = applyScenarioPayload(data, {
      ...payload,
      regionNameOverrides: {
        BBB_1: "Renamed Beta",
        MISSING: "Ghost",
        AAA_ALL: "Dormant Alpha",
      },
      regionOwnerChanges: [["AAA_ALL", ""]],
    });

    expect(payload.regionNameOverrides).toEqual({ BBB_1: "Renamed Beta" });
    expect(restored.regionNameOverrides).toEqual({ BBB_1: "Renamed Beta" });
  });

  it("drops blank region name overrides from restored and serialized state", () => {
    const data = makeMapData();
    const restored = applyScenarioPayload(data, {
      version: 1,
      title: "Blank override",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [],
      regionNameOverrides: {
        BBB_1: "",
      },
      customRegions: [],
    });
    const payload = createScenarioPayload(data, {
      ...createInitialSnapshot(data),
      regionNameOverrides: {
        BBB_1: "",
      },
    });

    expect(restored.regionNameOverrides).toEqual({});
    expect(payload.regionNameOverrides).toEqual({});
  });

  it("does not serialize custom entities that only own unknown regions", () => {
    const data = makeMapData();
    const snapshot = createInitialSnapshot(data);
    snapshot.customCounter = 2;
    snapshot.entities.CUSTOM_001 = {
      id: "CUSTOM_001",
      name: "Ghostland",
      color: "#A85F4F",
      regionIds: ["MISSING"],
      isCustom: true,
    };
    snapshot.regionOwners.MISSING = "CUSTOM_001";
    snapshot.regionNameOverrides.MISSING = "Ghost";

    const payload = createScenarioPayload(data, snapshot);

    expect(payload.entityChanges.CUSTOM_001).toBeUndefined();
    expect(payload.regionOwnerChanges).not.toContainEqual(["MISSING", "CUSTOM_001"]);
    expect(payload.regionNameOverrides).toEqual({});
  });

  it("does not serialize invalid owners for base regions", () => {
    const data = makeMapData();
    const snapshot = createInitialSnapshot(data);
    snapshot.regionOwners.BBB_1 = "MISSING_OWNER";
    snapshot.regionNameOverrides.BBB_1 = "Renamed Beta";

    const payload = createScenarioPayload(data, snapshot);
    const restored = applyScenarioPayload(data, payload);

    expect(payload.regionOwnerChanges).not.toContainEqual(["BBB_1", "MISSING_OWNER"]);
    expect(payload.regionNameOverrides).toEqual({ BBB_1: "Renamed Beta" });
    expect(restored.regionOwners.BBB_1).toBe("BBB");
  });

  it("ignores restored owners that resolve to inherited object properties", () => {
    const data = makeMapData();

    const restored = applyScenarioPayload(data, {
      version: 1,
      title: "Inherited owner",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [["BBB_1", "toString"]],
      customRegions: [],
    });

    expect(restored.regionOwners.BBB_1).toBe("BBB");
    expect(restored.entities.BBB.regionIds).toEqual(["BBB_1", "BBB_2"]);
  });

  it("preserves an intentionally empty scenario title", () => {
    const data = makeMapData();
    const snapshot = createInitialSnapshot(data);
    snapshot.title = "";

    const restored = applyScenarioPayload(data, createScenarioPayload(data, snapshot));

    expect(restored.title).toBe("");
  });

  it("omits custom regions that no longer have a valid owner", () => {
    const data = makeMapData();
    const snapshot = createInitialSnapshot(data);
    const customRegion: RegionRecord = {
      id: "CUSTOM_001-TERRITORY",
      name: "Orphan",
      type: "Custom divided territory",
      geometry: data.regions[0].geometry,
    };

    snapshot.customRegions[customRegion.id] = customRegion;

    const payload = createScenarioPayload(data, snapshot);
    const restored = applyScenarioPayload(data, {
      ...payload,
      customRegions: [customRegion],
    });

    expect(payload.customRegions).toEqual([]);
    expect(restored.customRegions[customRegion.id]).toBeUndefined();
    expect(restored.regionOwners[customRegion.id]).toBeUndefined();
  });

  it("drops custom regions cleared by region owner changes during restoration", () => {
    const data = makeMapData();
    const customRegion: RegionRecord = {
      id: "CUSTOM_001-TERRITORY",
      name: "Orphan",
      ownerId: "CUSTOM_001",
      type: "Custom divided territory",
      geometry: data.regions[0].geometry,
    };
    const payload: ScenarioPayload = {
      version: 1,
      title: "Cleared custom region",
      customCounter: 2,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Orphan",
          color: "#A85F4F",
          regionIds: [customRegion.id],
          isCustom: true,
        },
      },
      regionOwnerChanges: [[customRegion.id, ""]],
      regionNameOverrides: {
        [customRegion.id]: "Cleared name",
      },
      customRegions: [customRegion],
    };

    const restored = applyScenarioPayload(data, payload);

    expect(restored.customRegions[customRegion.id]).toBeUndefined();
    expect(restored.regionOwners[customRegion.id]).toBeUndefined();
    expect(restored.regionNameOverrides[customRegion.id]).toBeUndefined();
    expect(restored.entities.CUSTOM_001).toBeUndefined();
  });

  it("advances stale custom counters from shared payloads", () => {
    const data = makeMapData();
    const customRegion: RegionRecord = {
      id: "CUSTOM_001-TERRITORY",
      name: "Newland",
      ownerId: "CUSTOM_001",
      type: "Custom divided territory",
      geometry: data.regions[0].geometry,
    };
    const restored = applyScenarioPayload(data, {
      version: 1,
      title: "Stale counter",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Newland",
          color: "#A85F4F",
          regionIds: [customRegion.id],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [customRegion],
    });

    const separated = separateRegionAsCountry(restored, "BBB_1", "Beta Coast", "#A85F4F");

    expect(restored.customCounter).toBe(2);
    expect(separated?.entityId).toBe("CUSTOM_002");
    expect(separated?.snapshot.entities.CUSTOM_001.name).toBe("Newland");
    expect(separated?.snapshot.entities.CUSTOM_002.name).toBe("Beta Coast");
  });

  it("advances stale custom counters from custom region ids", () => {
    const data = makeMapData();
    const customRegion: RegionRecord = {
      id: "CUSTOM_001-TERRITORY",
      name: "Transferred Newland",
      ownerId: "AAA",
      type: "Custom divided territory",
      geometry: data.regions[0].geometry,
    };

    const restored = applyScenarioPayload(data, {
      version: 1,
      title: "Transferred custom region",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [[customRegion.id, "AAA"]],
      customRegions: [customRegion],
    });

    expect(restored.customRegions[customRegion.id]?.ownerId).toBe("AAA");
    expect(restored.customCounter).toBe(2);
  });

  it("rejects custom regions that collide with base region ids", () => {
    const data = makeMapData();
    const collidingRegion: RegionRecord = {
      id: "BBB_1",
      name: "Fake Beta",
      ownerId: "AAA",
      type: "Custom divided territory",
      geometry: data.regions[0].geometry,
    };
    const restored = applyScenarioPayload(data, {
      version: 1,
      title: "Colliding custom region",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [["BBB_1", "AAA"]],
      customRegions: [collidingRegion],
    });

    const payload = createScenarioPayload(data, {
      ...restored,
      customRegions: {
        ...restored.customRegions,
        [collidingRegion.id]: collidingRegion,
      },
    });

    expect(restored.customRegions.BBB_1).toBeUndefined();
    expect(restored.regionOwners.BBB_1).toBe("AAA");
    expect(payload.customRegions).toEqual([]);
    expect(payload.regionOwnerChanges).toContainEqual(["BBB_1", "AAA"]);
  });

  it("strips custom flags from base entities in restored and serialized state", () => {
    const data = makeMapData();
    const restored = applyScenarioPayload(data, {
      version: 1,
      title: "Base entity marked custom",
      customCounter: 1,
      entityChanges: {
        BBB: {
          id: "BBB",
          name: "Beta renamed",
          color: "#6F9A5C",
          regionIds: ["BBB_1", "BBB_2"],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [],
    });

    const emptiedBase = transferRegions(restored, ["BBB_1", "BBB_2"], "AAA");
    const payload = createScenarioPayload(data, {
      ...restored,
      entities: {
        ...restored.entities,
        BBB: { ...restored.entities.BBB, isCustom: true },
      },
    });

    expect(restored.entities.BBB).toMatchObject({ name: "Beta renamed" });
    expect(restored.entities.BBB.isCustom).toBeUndefined();
    expect(emptiedBase.entities.BBB).toBeDefined();
    expect(emptiedBase.entities.BBB.regionIds).toEqual([]);
    expect(payload.entityChanges.BBB.isCustom).toBeUndefined();
  });

  it("marks non-base entities as custom before pruning and sharing", () => {
    const data = makeMapData();
    const restored = applyScenarioPayload(data, {
      version: 1,
      title: "Non-base entity without custom flag",
      customCounter: 1,
      entityChanges: {
        GHOST: {
          id: "GHOST",
          name: "Ghostland",
          color: "#A85F4F",
          regionIds: ["BBB_1"],
        },
      },
      regionOwnerChanges: [["BBB_1", "GHOST"]],
      customRegions: [],
    });

    const emptiedGhost = transferRegions(restored, ["BBB_1"], "AAA");
    const ghostWithoutCustomFlag = { ...restored.entities.GHOST };
    delete ghostWithoutCustomFlag.isCustom;
    const payload = createScenarioPayload(data, {
      ...restored,
      entities: {
        ...restored.entities,
        GHOST: { ...ghostWithoutCustomFlag, regionIds: [] },
      },
      regionOwners: {
        ...restored.regionOwners,
        BBB_1: "AAA",
      },
    });

    expect(restored.entities.GHOST.isCustom).toBe(true);
    expect(emptiedGhost.entities.GHOST).toBeUndefined();
    expect(payload.entityChanges.GHOST).toBeUndefined();
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
    });
    expect(result?.snapshot.entities.BBB.regionIds).toEqual(["BBB_2"]);
    expect(result?.snapshot.customCounter).toBe(2);
  });

  it("keeps separated custom region owner metadata in sync", () => {
    const data = makeMapData();
    const snapshot = createInitialSnapshot(data);
    const customRegion: RegionRecord = {
      id: "CUSTOM_001-TERRITORY",
      name: "Transferred Newland",
      ownerId: "AAA",
      type: "Custom divided territory",
      geometry: data.regions[0].geometry,
    };

    snapshot.customCounter = 2;
    snapshot.customRegions[customRegion.id] = customRegion;
    snapshot.regionOwners[customRegion.id] = "AAA";
    snapshot.entities.AAA.regionIds.push(customRegion.id);

    const result = separateRegionAsCountry(snapshot, customRegion.id, "Newland", "#A85F4F");

    expect(result?.entityId).toBe("CUSTOM_002");
    expect(result?.snapshot.regionOwners[customRegion.id]).toBe("CUSTOM_002");
    expect(result?.snapshot.customRegions[customRegion.id].ownerId).toBe("CUSTOM_002");
  });

  it("keeps transferred custom region owner metadata in sync", () => {
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
    };
    snapshot.customRegions[customRegion.id] = customRegion;
    snapshot.regionOwners[customRegion.id] = "CUSTOM_001";

    const transferred = transferRegions(snapshot, [customRegion.id], "AAA");
    const payload = createScenarioPayload(data, transferred);
    const restored = applyScenarioPayload(data, payload);

    expect(transferred.regionOwners[customRegion.id]).toBe("AAA");
    expect(transferred.customRegions[customRegion.id].ownerId).toBe("AAA");
    expect(transferred.entities.CUSTOM_001).toBeUndefined();
    expect(payload.entityChanges.CUSTOM_001).toBeUndefined();
    expect(restored.regionOwners[customRegion.id]).toBe("AAA");
    expect(restored.customRegions[customRegion.id].ownerId).toBe("AAA");
    expect(restored.entities.CUSTOM_001).toBeUndefined();
    expect(restored.entities.AAA.regionIds).toContain(customRegion.id);
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
