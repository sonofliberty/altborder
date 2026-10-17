import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import { combineRegionLand, removeCollapsedPolygonRings } from "./regionLandGeometry";
import { decodeSharePayload, encodeSharePayload } from "./share";
import type { ScenarioPayload } from "./types";

describe("region land patches", () => {
  it("keeps divided land shareable when an overlay patch contains collapsed rings", async () => {
    const land: Geometry = { type: "Polygon", coordinates: [[[0, 0], [0, 1], [1, 1], [1, 0], [0, 0]]] };
    // Zero-area shell captured from a divided Germany map that Share rejected.
    const collapsed = [[14.64612, 50.83833], [14.66, 50.83], [14.63942, 50.84235], [14.61, 50.86], [14.64612, 50.83833]];
    const patch: Geometry = {
      type: "MultiPolygon",
      coordinates: [
        [[[2, 0], [2, 1], [3, 1], [3, 0], [2, 0]], [[2.2, .5], [2.5, .5], [2.8, .5], [2.2, .5]]],
        [collapsed],
      ],
    };
    const payload: ScenarioPayload = {
      version: 1, title: "Divided map", customCounter: 1,
      entityChanges: {}, regionOwnerChanges: [], regionLandAdditions: { region: patch },
    };
    expect((await decodeSharePayload(await encodeSharePayload(payload))).ok).toBe(false);

    const combined = combineRegionLand(land, patch);
    payload.regionLandAdditions = { region: combined };
    expect((await decodeSharePayload(await encodeSharePayload(payload))).ok).toBe(true);
    expect(combined).toEqual({ type: "MultiPolygon", coordinates: [land.coordinates, [patch.coordinates[0][0]]] });
  });

  it("preserves nonzero land and holes without rounding or an area threshold", () => {
    const geometry: Geometry = {
      type: "Polygon",
      coordinates: [
        [[0, 0], [0, 1e-8], [1e-8, 1e-8], [1e-8, 0], [0, 0]],
        [[2e-9, 2e-9], [3e-9, 2e-9], [3e-9, 3e-9], [2e-9, 2e-9]],
      ],
    };
    expect(removeCollapsedPolygonRings(geometry)).toEqual({ type: "MultiPolygon", coordinates: [geometry.coordinates] });
  });
});
