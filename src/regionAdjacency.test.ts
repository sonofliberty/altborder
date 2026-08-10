import { describe, expect, it } from "vitest";
import mapDataFixture from "../public/data/map-data.json";
import type { BoundaryEdgeRecord, CountryEntity } from "./types";
import { buildSelectedRegionAdjacency } from "./regionAdjacency";
import { getNeighborTargetEntityIds, orderTransferTargetEntities } from "./transferContext";

describe("buildRegionAdjacency", () => {
  it("connects regions that share a border edge", () => {
    const adjacency = buildRegionAdjacency([
      edge("left", "right"),
    ]);

    expect(adjacency.get("left")?.has("right")).toBe(true);
    expect(adjacency.get("right")?.has("left")).toBe(true);
  });

  it("does not connect regions without a shared boundary edge", () => {
    const adjacency = buildRegionAdjacency([
      edge("southwest", "west"),
      edge("northeast", "east"),
    ], ["southwest", "northeast"]);

    expect(adjacency.get("southwest")?.has("northeast")).toBe(false);
    expect(adjacency.get("northeast")?.has("southwest")).toBe(false);
  });

  it("does not treat a coastline as a region neighbor", () => {
    const adjacency = buildRegionAdjacency([edge("island", null)], ["island"]);

    expect(adjacency.get("island")).toEqual(new Set());
  });

  it("finds both Finland and Norway next to Murmansk Oblast", () => {
    const mapData = mapDataFixture as unknown as {
      boundaryEdges: BoundaryEdgeRecord[];
      regions: Array<{ id: string; name: string }>;
      countries: CountryEntity[];
    };
    const murmanskId = mapData.regions.find((region) => region.name === "Murmansk Oblast")?.id;
    expect(murmanskId).toBe("RUS-RU-MUR");
    if (!murmanskId) throw new Error("Murmansk Oblast is missing from the map data.");

    const adjacency = buildSelectedRegionAdjacency(mapData.boundaryEdges, [murmanskId]);
    const regionOwners = Object.fromEntries(
      mapData.countries.flatMap((country) => country.regionIds.map((regionId) => [regionId, country.id])),
    );
    const neighborEntityIds = getNeighborTargetEntityIds({
      selectedRegionIds: [murmanskId],
      selectedEntityId: "RUS",
      regionAdjacency: adjacency,
      regionOwners,
    });

    expect(neighborEntityIds).toEqual(new Set(["FIN", "NOR"]));
  });
});

describe("transfer target ordering", () => {
  it("puts neighboring target countries before other countries", () => {
    const adjacency = buildRegionAdjacency([
      edge("germany_border", "france_border"),
      edge("germany_border", "netherlands_border"),
    ], ["germany_border", "france_border", "netherlands_border", "italy_interior"]);
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
      edge("germany_west", "france_border"),
      edge("germany_west", "germany_north"),
      edge("germany_north", "denmark_border"),
    ], ["germany_west", "germany_north"]);
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

function edge(firstRegionId: string, secondRegionId: string | null): BoundaryEdgeRecord {
  return {
    id: `${firstRegionId}:${secondRegionId ?? "ocean"}`,
    regionIds: [firstRegionId, secondRegionId],
    geometry: {
      type: "LineString",
      coordinates: [[0, 0], [1, 1]],
    },
  };
}

function buildRegionAdjacency(
  edges: BoundaryEdgeRecord[],
  selectedRegionIds: string[] = [...new Set(edges.flatMap(({ regionIds }) => regionIds.filter((id): id is string => id !== null)))],
): Map<string, Set<string>> {
  return buildSelectedRegionAdjacency(edges, selectedRegionIds);
}

function countries(...entries: Array<[id: string, name: string]>): CountryEntity[] {
  return entries.map(([id, name]) => ({
    id,
    name,
    color: "#777777",
    regionIds: [],
  }));
}
