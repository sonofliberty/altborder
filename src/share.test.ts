import { describe, expect, it } from "vitest";
import { decodeSharePayload, encodeSharePayload, hashRequestsEdit, readShareFromHash } from "./share";
import type { ScenarioPayload } from "./types";

describe("share helpers", () => {
  it("round-trips scenario payloads through lazy compression", async () => {
    const payload: ScenarioPayload = {
      version: 1,
      title: "Shared map",
      description: "",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Newland",
          color: "#A85F4F",
          regionIds: ["CUSTOM_001-TERRITORY"],
          isCustom: true,
        },
      },
      regionOwnerChanges: [["A", "B"]],
      regionNameOverrides: { A: "Renamed region" },
      customRegions: [
        {
          id: "CUSTOM_001-TERRITORY",
          name: "Newland",
          ownerId: "CUSTOM_001",
          type: "Custom divided territory",
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
        },
      ],
    };

    const encoded = await encodeSharePayload(payload);
    const decoded = await decodeSharePayload(encoded);

    expect(decoded).toEqual({ ok: true, payload });
  });

  it("reads shared scenario hashes without loading compression", () => {
    expect(readShareFromHash("#s=abc&edit=1")).toBe("abc");
    expect(hashRequestsEdit("#s=abc&edit=1")).toBe(true);
    expect(hashRequestsEdit("#s=abc")).toBe(false);
  });

  it("preserves plus signs in compressed share hashes", () => {
    expect(readShareFromHash("#s=A+B-$&edit=1")).toBe("A+B-$");
    expect(readShareFromHash("#edit=1&s=A%2BB%3D")).toBe("A+B=");
  });

  it("rejects malformed versioned payloads before app state restoration", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [],
      customRegions: { bad: true },
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects malformed entity and override records", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {
        BROKEN: {
          id: "BROKEN",
          name: "Broken",
          color: "#A85F4F",
          regionIds: [123],
        },
      },
      regionOwnerChanges: [],
      regionNameOverrides: { A: 42 },
      customRegions: [],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects entity records whose id does not match their payload key", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_002",
          name: "Broken",
          color: "#A85F4F",
          regionIds: [],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects entity records with invalid colors", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "not-a-color",
          regionIds: [],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects duplicate region owner changes in shared payloads", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [
        ["BBB_1", "AAA"],
        ["BBB_1", "CCC"],
      ],
      customRegions: [],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects region owner changes to missing custom entities", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [["BBB_1", "CUSTOM_001"]],
      customRegions: [],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects ownerless custom regions in shared payloads", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [],
      customRegions: [
        {
          id: "CUSTOM_001-TERRITORY",
          name: "Nowhere",
          type: "Custom divided territory",
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
        },
      ],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects custom regions owned by missing custom entities", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [],
      customRegions: [
        {
          id: "CUSTOM_001-TERRITORY",
          name: "Nowhere",
          ownerId: "CUSTOM_001",
          type: "Custom divided territory",
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
        },
      ],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects custom region owner changes that conflict with custom region owners", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 2,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: ["CUSTOM_001-TERRITORY"],
          isCustom: true,
        },
        CUSTOM_002: {
          id: "CUSTOM_002",
          name: "Other",
          color: "#5F7FA2",
          regionIds: [],
          isCustom: true,
        },
      },
      regionOwnerChanges: [["CUSTOM_001-TERRITORY", "CUSTOM_002"]],
      customRegions: [
        {
          id: "CUSTOM_001-TERRITORY",
          name: "Broken",
          ownerId: "CUSTOM_001",
          type: "Custom divided territory",
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
        },
      ],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects duplicate custom region ids in shared payloads", async () => {
    const customRegion = {
      id: "CUSTOM_001-TERRITORY",
      name: "Broken",
      ownerId: "CUSTOM_001",
      type: "Custom divided territory",
      geometry: {
        type: "Polygon",
        coordinates: [
          [
            [0, 0],
            [1, 0],
            [1, 1],
            [0, 0],
          ],
        ],
      },
    };
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: ["CUSTOM_001-TERRITORY"],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [customRegion, { ...customRegion, name: "Duplicate" }],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects custom regions with invalid geometry coordinates", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: ["CUSTOM_001-TERRITORY"],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [
        {
          id: "CUSTOM_001-TERRITORY",
          name: "Broken",
          ownerId: "CUSTOM_001",
          type: "Custom divided territory",
          geometry: {
            type: "Polygon",
            coordinates: [[["bad", 0]]],
          },
        },
      ],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects custom regions with unclosed polygon rings", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: ["CUSTOM_001-TERRITORY"],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [
        {
          id: "CUSTOM_001-TERRITORY",
          name: "Broken",
          ownerId: "CUSTOM_001",
          type: "Custom divided territory",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [1, 1],
                [0, 1],
              ],
            ],
          },
        },
      ],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects custom regions with degenerate polygon rings", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: ["CUSTOM_001-TERRITORY"],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [
        {
          id: "CUSTOM_001-TERRITORY",
          name: "Broken",
          ownerId: "CUSTOM_001",
          type: "Custom divided territory",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [0, 0],
                [0, 0],
                [0, 0],
              ],
            ],
          },
        },
      ],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects custom regions with zero-area polygon rings", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: ["CUSTOM_001-TERRITORY"],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [
        {
          id: "CUSTOM_001-TERRITORY",
          name: "Broken",
          ownerId: "CUSTOM_001",
          type: "Custom divided territory",
          geometry: {
            type: "Polygon",
            coordinates: [
              [
                [0, 0],
                [1, 0],
                [2, 0],
                [0, 0],
              ],
            ],
          },
        },
      ],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects custom regions with empty multipolygon geometries", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: ["CUSTOM_001-TERRITORY"],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [
        {
          id: "CUSTOM_001-TERRITORY",
          name: "Broken",
          ownerId: "CUSTOM_001",
          type: "Custom divided territory",
          geometry: {
            type: "MultiPolygon",
            coordinates: [],
          },
        },
      ],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects non-polygonal custom region geometries", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      description: "",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: ["CUSTOM_001-TERRITORY"],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [
        {
          id: "CUSTOM_001-TERRITORY",
          name: "Broken",
          ownerId: "CUSTOM_001",
          type: "Custom divided territory",
          geometry: {
            type: "GeometryCollection",
            geometries: [],
          },
        },
      ],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });
});
