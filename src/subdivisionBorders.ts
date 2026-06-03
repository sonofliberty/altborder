import type { SubdivisionBorderRecord } from "./types";

export function isSubdivisionBorderVisible(
  border: Pick<SubdivisionBorderRecord, "regionIds">,
  regionOwners: Record<string, string>,
): boolean {
  const [firstRegionId, secondRegionId] = border.regionIds;
  const firstOwnerId = regionOwners[firstRegionId];
  return Boolean(firstOwnerId && firstOwnerId === regionOwners[secondRegionId]);
}
