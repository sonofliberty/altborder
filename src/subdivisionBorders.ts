import type { SubdivisionBorderRecord } from "./types";

export function isSubdivisionBorderVisible(
  border: Pick<SubdivisionBorderRecord, "regionIds">,
  regionOwners: Record<string, string>,
): boolean {
  const [firstRegionId, secondRegionId] = border.regionIds;
  const firstOwnerId = getOwnValue(regionOwners, firstRegionId);
  const secondOwnerId = getOwnValue(regionOwners, secondRegionId);
  return Boolean(firstOwnerId && firstOwnerId === secondOwnerId);
}

function getOwnValue<T>(record: Record<string, T>, key: string): T | undefined {
  return Object.prototype.hasOwnProperty.call(record, key) ? record[key] : undefined;
}
