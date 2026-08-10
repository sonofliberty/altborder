import type { BoundaryEdgeRecord } from "./types";

type BoundaryNeighborRecord = Pick<BoundaryEdgeRecord, "regionIds">;

export function buildSelectedRegionAdjacency(
  boundaryEdges: readonly BoundaryNeighborRecord[],
  selectedRegionIds: Iterable<string>,
): Map<string, Set<string>> {
  const selectedRegionSet = new Set(selectedRegionIds);
  const adjacency = new Map<string, Set<string>>();

  for (const regionId of selectedRegionSet) {
    adjacency.set(regionId, new Set());
  }

  for (const { regionIds: [firstRegionId, secondRegionId] } of boundaryEdges) {
    if (secondRegionId === null) continue;

    if (selectedRegionSet.has(firstRegionId)) {
      adjacency.get(firstRegionId)?.add(secondRegionId);
    }
    if (selectedRegionSet.has(secondRegionId)) {
      adjacency.get(secondRegionId)?.add(firstRegionId);
    }
  }

  return adjacency;
}
