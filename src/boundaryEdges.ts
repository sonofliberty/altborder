import type { BoundaryEdgeRecord } from "./types";

export type BoundaryEdgeKind = "administrative" | "coastline" | "country" | "hidden";

export type ProjectedBoundaryEdge = Pick<BoundaryEdgeRecord, "id" | "regionIds"> & {
  pathData: string;
};

export type BatchedBoundaryPaths = {
  administrativePath: string;
  activeAdministrativePath: string;
  coastlinePath: string;
  countryPath: string;
  selectedCountryPath: string;
};

export function classifyBoundaryEdge(
  edge: Pick<BoundaryEdgeRecord, "regionIds">,
  regionOwners: Record<string, string>,
): BoundaryEdgeKind {
  const [firstRegionId, secondRegionId] = edge.regionIds;
  if (secondRegionId === null) return "coastline";

  const firstOwnerId = getOwnValue(regionOwners, firstRegionId);
  const secondOwnerId = getOwnValue(regionOwners, secondRegionId);
  if (!firstOwnerId || !secondOwnerId) return "hidden";
  return firstOwnerId === secondOwnerId ? "administrative" : "country";
}

export function batchBoundaryPaths(
  edges: readonly ProjectedBoundaryEdge[],
  regionOwners: Record<string, string>,
  options: {
    activeAdministrativeEntityId?: string;
    selectedEntityId?: string;
  } = {},
): BatchedBoundaryPaths {
  const paths: BatchedBoundaryPaths = {
    administrativePath: "",
    activeAdministrativePath: "",
    coastlinePath: "",
    countryPath: "",
    selectedCountryPath: "",
  };

  for (const edge of edges) {
    const kind = classifyBoundaryEdge(edge, regionOwners);
    const [firstRegionId, secondRegionId] = edge.regionIds;
    const firstOwnerId = getOwnValue(regionOwners, firstRegionId);
    const secondOwnerId = secondRegionId === null ? undefined : getOwnValue(regionOwners, secondRegionId);

    if (kind === "coastline") {
      paths.coastlinePath += edge.pathData;
    } else if (kind === "country") {
      paths.countryPath += edge.pathData;
    } else if (kind === "administrative") {
      if (firstOwnerId === options.activeAdministrativeEntityId) {
        paths.activeAdministrativePath += edge.pathData;
      } else {
        paths.administrativePath += edge.pathData;
      }
    }

    if (
      options.selectedEntityId &&
      (kind === "country" || kind === "coastline") &&
      (firstOwnerId === options.selectedEntityId || secondOwnerId === options.selectedEntityId)
    ) {
      paths.selectedCountryPath += edge.pathData;
    }
  }

  return paths;
}

function getOwnValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
