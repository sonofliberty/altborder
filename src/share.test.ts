import { describe, expect, it } from "vitest";
import { decodeSharePayload, encodeSharePayload, hashRequestsEdit, readShareFromHash } from "./share";
import type { ScenarioPayload } from "./types";
import { maxCustomFlagDataUrlLength } from "./countryFlags";
import { applyScenarioPayload, createScenarioPayload, separateRegionAsCountry } from "./state";

describe("share helpers", () => {
  it("round-trips scenario payloads through lazy compression", async () => {
    const payload: ScenarioPayload = {
      version: 1,
      title: "Shared map",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Newland",
          color: "#A85F4F",
          flag: { kind: "custom", dataUrl: "data:image/webp;base64,AAAA" },
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

  it.each([2 ** 53, 1e100])(
    "rejects an imported custom counter of %s before it can cause ID collisions",
    async (customCounter) => {
      const encoded = await encodeSharePayload({
        version: 1,
        title: "Unsafe counter",
        customCounter,
        entityChanges: {},
        regionOwnerChanges: [],
      });
      expect((await decodeSharePayload(encoded)).ok).toBe(false);
    },
  );

  it.each([1, 2, 10000, Number.MAX_SAFE_INTEGER - 1, Number.MAX_SAFE_INTEGER])("preserves supported imported counter %s", async (customCounter) => {
    const payload: ScenarioPayload = {
      version: 1,
      title: "Legacy counter",
      customCounter,
      entityChanges: {},
      regionOwnerChanges: [],
    };
    expect(await decodeSharePayload(await encodeSharePayload(payload))).toEqual({ ok: true, payload });
  });

  it.each([String(2 ** 32 - 1), String(Number.MAX_SAFE_INTEGER - 1), "9".repeat(400)])(
    "preserves custom IDs with a numeric prefix of %s",
    async (counter) => {
      const id = `CUSTOM_${counter}`;
      const variants = [
        { entityChanges: { [id]: { id, name: "Newland", color: "#A85F4F", regionIds: [] } } },
        {
          customRegions: [{
            id: `${id}-TERRITORY`,
            name: "Newland",
            ownerId: "AAA",
            type: "Custom divided territory",
            geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
          }],
        },
      ];
      for (const variant of variants) {
        const encoded = await encodeSharePayload({
          version: 1,
          title: "Unsafe ID",
          customCounter: 1,
          entityChanges: {},
          regionOwnerChanges: [],
          ...variant,
        } as ScenarioPayload);
        expect((await decodeSharePayload(encoded)).ok).toBe(true);
      }
    },
  );

  it.each([String(Number.MAX_SAFE_INTEGER - 1), String(Number.MAX_SAFE_INTEGER), "9".repeat(400)])(
    "can edit and share a restored custom ID with numeric prefix %s",
    async (counter) => {
      const id = `CUSTOM_${counter}`;
      const data = {
        version: 1,
        attribution: "",
        countries: [{ id: "AAA", name: "Alpha", color: "#A85F4F", regionIds: ["AAA_1", "AAA_2", "AAA_3"] }],
        regions: [],
        baseCountries: [],
        boundaryEdges: [],
      };
      const payload: ScenarioPayload = {
        version: 1,
        title: "Boundary ID",
        customCounter: 1,
        entityChanges: { [id]: { id, name: "Newland", color: "#A85F4F", regionIds: ["AAA_1"] } },
        regionOwnerChanges: [["AAA_1", id]],
      };
      expect((await decodeSharePayload(await encodeSharePayload(payload))).ok).toBe(true);
      const restored = applyScenarioPayload(data, payload);
      const first = separateRegionAsCountry(restored, "AAA_2", "First", "#A85F4F")!;
      const second = separateRegionAsCountry(first.snapshot, "AAA_3", "Second", "#A85F4F")!;
      expect(new Set([id, first.entityId, second.entityId]).size).toBe(3);
      expect(second.snapshot.entities[id].name).toBe("Newland");
      expect(second.snapshot.entities[first.entityId].name).toBe("First");
      expect(second.snapshot.entities[second.entityId].name).toBe("Second");
      expect(Number.isSafeInteger(second.snapshot.customCounter)).toBe(true);
      const sharedAgain = createScenarioPayload(data, second.snapshot);
      expect(await decodeSharePayload(await encodeSharePayload(sharedAgain))).toEqual({ ok: true, payload: sharedAgain });
      const restoredAgain = applyScenarioPayload(data, sharedAgain);
      expect(restoredAgain.regionOwners).toEqual(second.snapshot.regionOwners);
    },
  );

  it("preserves plus signs in compressed share hashes", () => {
    expect(readShareFromHash("#s=A+B-$&edit=1")).toBe("A+B-$");
    expect(readShareFromHash("#edit=1&s=A%2BB%3D")).toBe("A+B=");
  });

  it("rejects malformed versioned payloads before app state restoration", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
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

  it.each(["__proto__", "constructor", "toString", "hasOwnProperty"])(
    "rejects the reserved object key %s in scenario IDs",
    async (id) => {
      const entity = { id: "AAA", name: "Alpha", color: "#A85F4F", regionIds: ["AAA_1"] };
      const region = {
        id: "CUSTOM_001-TERRITORY",
        name: "Newland",
        ownerId: "AAA",
        type: "Custom divided territory",
        geometry: { type: "Polygon", coordinates: [[[0, 0], [1, 0], [1, 1], [0, 0]]] },
      };
      const variants = [
        { entityChanges: { [id]: { ...entity, id } } },
        { entityChanges: { AAA: { ...entity, regionIds: [id] } } },
        { customRegions: [{ ...region, id }] },
        { customRegions: [{ ...region, ownerId: id }] },
        { regionOwnerChanges: [[id, "AAA"]] },
        { regionOwnerChanges: [["AAA_1", id]] },
        { regionNameOverrides: { [id]: "Invalid region name" } },
      ];

      for (const variant of variants) {
        const encoded = await encodeSharePayload({
          version: 1,
          title: "Reserved ID",
          customCounter: 1,
          entityChanges: {},
          regionOwnerChanges: [],
          ...variant,
        } as ScenarioPayload);

        await expect(decodeSharePayload(encoded)).resolves.toEqual({
          ok: false,
          error: "The shared map link is invalid.",
        });
      }
    },
  );

  it("rejects remote, malformed, and oversized custom flag images", async () => {
    for (const flag of [
      { kind: "custom", dataUrl: "https://example.com/flag.webp" },
      { kind: "custom", dataUrl: "data:image/png;base64,AAAA" },
      { kind: "custom", dataUrl: `data:image/webp;base64,${"A".repeat(maxCustomFlagDataUrlLength)}` },
    ]) {
      const encoded = await encodeSharePayload({
        version: 1,
        title: "Broken flag",
        customCounter: 1,
        entityChanges: {
          CUSTOM_001: {
            id: "CUSTOM_001",
            name: "Broken",
            color: "#A85F4F",
            flag,
            regionIds: [],
            isCustom: true,
          },
        },
        regionOwnerChanges: [],
      } as unknown as ScenarioPayload);

      await expect(decodeSharePayload(encoded)).resolves.toEqual({
        ok: false,
        error: "The shared map link is invalid.",
      });
    }
  });

  it("rejects entity records whose id does not match their payload key", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
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

  it("rejects entity records with empty ids", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      customCounter: 1,
      entityChanges: {
        "": {
          id: "",
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

  it("rejects entity records with whitespace-only ids", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      customCounter: 1,
      entityChanges: {
        "   ": {
          id: "   ",
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

  it("rejects entity records with padded ids", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      customCounter: 1,
      entityChanges: {
        " CUSTOM_001 ": {
          id: " CUSTOM_001 ",
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

  it("rejects region owner changes with empty region ids", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [["", "AAA"]],
      customRegions: [],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects region owner changes with whitespace-only ids", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [["   ", "   "]],
      customRegions: [],
    } as unknown as ScenarioPayload);

    await expect(decodeSharePayload(encoded)).resolves.toEqual({
      ok: false,
      error: "The shared map link is invalid.",
    });
  });

  it("rejects region owner changes with padded ids", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [[" BBB_1 ", " AAA "]],
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

  it("rejects custom regions with empty ids", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: [""],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [
        {
          id: "",
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

  it("rejects custom regions with whitespace-only ids", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: ["   "],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [
        {
          id: "   ",
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

  it("rejects custom regions with padded ids", async () => {
    const encoded = await encodeSharePayload({
      version: 1,
      title: "Broken map",
      customCounter: 1,
      entityChanges: {
        CUSTOM_001: {
          id: "CUSTOM_001",
          name: "Broken",
          color: "#A85F4F",
          regionIds: [" CUSTOM_001-TERRITORY "],
          isCustom: true,
        },
      },
      regionOwnerChanges: [],
      customRegions: [
        {
          id: " CUSTOM_001-TERRITORY ",
          name: "Broken",
          ownerId: " CUSTOM_001 ",
          type: " Custom divided territory ",
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
