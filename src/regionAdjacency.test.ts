import { describe, expect, it } from "vitest";
import type { CountryEntity, RegionRecord } from "./types";
import { buildRegionAdjacency } from "./regionAdjacency";
import { getNeighborTargetEntityIds, orderTransferTargetEntities } from "./transferContext";

describe("buildRegionAdjacency", () => {
  it("connects regions that share a border edge", () => {
    const adjacency = buildRegionAdjacency([
      region("left", square(0, 0, 1, 1)),
      region("right", square(1, 0, 2, 1)),
    ]);

    expect(adjacency.get("left")?.has("right")).toBe(true);
    expect(adjacency.get("right")?.has("left")).toBe(true);
  });

  it("does not connect regions that only touch at a corner", () => {
    const adjacency = buildRegionAdjacency([
      region("southwest", square(0, 0, 1, 1)),
      region("northeast", square(1, 1, 2, 2)),
    ]);

    expect(adjacency.get("southwest")?.has("northeast")).toBe(false);
    expect(adjacency.get("northeast")?.has("southwest")).toBe(false);
  });

  it("does not connect non-touching regions outside tolerance", () => {
    const adjacency = buildRegionAdjacency(
      [region("left", square(0, 0, 1, 1)), region("right", square(1.1, 0, 2.1, 1))],
      0.01,
    );

    expect(adjacency.get("left")?.has("right")).toBe(false);
  });

  it("connects regions separated by a tiny geometry gap", () => {
    const adjacency = buildRegionAdjacency(
      [region("left", square(0, 0, 1, 1)), region("right", square(1.0004, 0, 2.0004, 1))],
      0.001,
    );

    expect(adjacency.get("left")?.has("right")).toBe(true);
  });
});

describe("transfer target ordering", () => {
  it("puts neighboring target countries before other countries", () => {
    const adjacency = buildRegionAdjacency([
      region("germany_border", square(0, 0, 1, 1)),
      region("france_border", square(-1, 0, 0, 1)),
      region("netherlands_border", square(0, 1, 1, 2)),
      region("italy_interior", square(5, 5, 6, 6)),
    ]);
    const neighborEntityIds = getNeighborTargetEntityIds({
      selectedRegionIds: ["germany_border"],
      selectedEntityId: "DEU",
      regionAdjacency: adjacency,
      regionOwners: {
        germany_border: "DEU",
        france_border: "FRA",
        netherlands_border: "NLD",
        italy_interior: "ITA",
      },
    });
    const ordered = orderTransferTargetEntities({
      entityOptions: countries(["FRA", "France"], ["DEU", "Germany"], ["ITA", "Italy"], ["NLD", "Netherlands"]),
      selectedEntityId: "DEU",
      neighborEntityIds,
    });

    expect(ordered.neighborTargets.map((entity) => entity.id)).toEqual(["FRA", "NLD"]);
    expect(ordered.otherTargets.map((entity) => entity.id)).toEqual(["ITA"]);
  });

  it("unions neighboring countries from multiple selected regions without duplicates", () => {
    const adjacency = buildRegionAdjacency([
      region("germany_west", square(0, 0, 1, 1)),
      region("germany_north", square(1, 0, 2, 1)),
      region("france_border", square(-1, 0, 0, 1)),
      region("denmark_border", square(1, 1, 2, 2)),
      region("netherlands_corner", square(2, 1, 3, 2)),
    ]);
    const neighborEntityIds = getNeighborTargetEntityIds({
      selectedRegionIds: ["germany_west", "germany_north"],
      selectedEntityId: "DEU",
      regionAdjacency: adjacency,
      regionOwners: {
        germany_west: "DEU",
        germany_north: "DEU",
        france_border: "FRA",
        denmark_border: "DNK",
        netherlands_corner: "NLD",
      },
    });

    expect([...neighborEntityIds].sort()).toEqual(["DNK", "FRA"]);
  });

  it("keeps alphabetical target ordering when no selected regions have neighbors", () => {
    const ordered = orderTransferTargetEntities({
      entityOptions: countries(["FRA", "France"], ["DEU", "Germany"], ["ITA", "Italy"]),
      selectedEntityId: "DEU",
      neighborEntityIds: new Set(),
    });

    expect(ordered.neighborTargets).toEqual([]);
    expect(ordered.otherTargets.map((entity) => entity.id)).toEqual(["FRA", "ITA"]);
  });

  it("keeps non-neighbor targets available for an existing selection", () => {
    const ordered = orderTransferTargetEntities({
      entityOptions: countries(["FRA", "France"], ["DEU", "Germany"], ["ITA", "Italy"]),
      selectedEntityId: "DEU",
      neighborEntityIds: new Set(["FRA"]),
    });

    expect(ordered.neighborTargets.map((entity) => entity.id)).toEqual(["FRA"]);
    expect(ordered.otherTargets.map((entity) => entity.id)).toEqual(["ITA"]);
  });
});

function region(id: string, geometry: RegionRecord["geometry"]): RegionRecord {
  return {
    id,
    name: id,
    ownerId: id,
    type: "Test region",
    geometry,
  };
}

function square(minX: number, minY: number, maxX: number, maxY: number): RegionRecord["geometry"] {
  return {
    type: "Polygon",
    coordinates: [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ],
  };
}

function countries(...entries: Array<[id: string, name: string]>): CountryEntity[] {
  return entries.map(([id, name]) => ({
    id,
    name,
    color: "#777777",
    regionIds: [],
  }));
}
