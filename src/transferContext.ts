import type { CountryEntity, RegionRecord } from "./types";

export type TransferRegionSummary = {
  id: string;
  displayName: string;
  type: string;
  ownerId: string;
  ownerName: string;
};

export function getSelectedTransferRegions({
  selectedRegionIds,
  regionById,
  regionOwners,
  entities,
  getRegionDisplayName,
}: {
  selectedRegionIds: Iterable<string>;
  regionById: Map<string, RegionRecord>;
  regionOwners: Record<string, string>;
  entities: Record<string, CountryEntity>;
  getRegionDisplayName: (regionId: string) => string;
}): TransferRegionSummary[] {
  return [...selectedRegionIds]
    .map((regionId) => {
      const region = regionById.get(regionId);
      const ownerId = getOwnValue(regionOwners, regionId);
      if (!region || !ownerId) return null;
      const owner = getOwnValue(entities, ownerId);
      return {
        id: region.id,
        displayName: getRegionDisplayName(region.id),
        type: region.type,
        ownerId,
        ownerName: owner?.name ?? ownerId,
      };
    })
    .filter((region): region is TransferRegionSummary => Boolean(region))
    .sort((a, b) => a.displayName.localeCompare(b.displayName));
}

export function getValidTransferFocus({
  currentFocusId,
  selectedRegionIds,
  regionOwners,
  selectedEntityId,
}: {
  currentFocusId: string;
  selectedRegionIds: Iterable<string>;
  regionOwners: Record<string, string>;
  selectedEntityId: string;
}): string {
  if (!selectedEntityId) return "";
  const selectedRegionList = [...selectedRegionIds];
  if (
    currentFocusId &&
    selectedRegionList.includes(currentFocusId) &&
    getOwnValue(regionOwners, currentFocusId) === selectedEntityId
  ) {
    return currentFocusId;
  }

  return selectedRegionList.find((regionId) => getOwnValue(regionOwners, regionId) === selectedEntityId) ?? "";
}

export function getNeighborTargetEntityIds({
  selectedRegionIds,
  selectedEntityId,
  regionAdjacency,
  regionOwners,
}: {
  selectedRegionIds: Iterable<string>;
  selectedEntityId: string;
  regionAdjacency: Map<string, Set<string>>;
  regionOwners: Record<string, string>;
}): Set<string> {
  const selectedRegionSet = new Set(selectedRegionIds);
  const neighborEntityIds = new Set<string>();

  for (const regionId of selectedRegionSet) {
    const adjacentRegionIds = regionAdjacency.get(regionId);
    if (!adjacentRegionIds) continue;

    for (const adjacentRegionId of adjacentRegionIds) {
      if (selectedRegionSet.has(adjacentRegionId)) continue;
      const ownerId = getOwnValue(regionOwners, adjacentRegionId);
      if (!ownerId || ownerId === selectedEntityId) continue;
      neighborEntityIds.add(ownerId);
    }
  }

  return neighborEntityIds;
}

export function orderTransferTargetEntities({
  entityOptions,
  selectedEntityId,
  neighborEntityIds,
}: {
  entityOptions: CountryEntity[];
  selectedEntityId: string;
  neighborEntityIds: Set<string>;
}): { neighborTargets: CountryEntity[]; otherTargets: CountryEntity[] } {
  const validTargets = entityOptions.filter((entity) => entity.id !== selectedEntityId);
  if (neighborEntityIds.size === 0) {
    return { neighborTargets: [], otherTargets: validTargets };
  }

  return {
    neighborTargets: validTargets.filter((entity) => neighborEntityIds.has(entity.id)),
    otherTargets: validTargets.filter((entity) => !neighborEntityIds.has(entity.id)),
  };
}

export function isValidTransferTarget({
  targetEntityId,
  selectedEntityId,
  entities,
}: {
  targetEntityId: string;
  selectedEntityId: string;
  entities: Record<string, CountryEntity>;
}): boolean {
  return Boolean(targetEntityId && targetEntityId !== selectedEntityId && getOwnValue(entities, targetEntityId));
}

function getOwnValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
