/** Find intact original countries, ignoring annexed custom regions. */
export function getCompleteBaseCountryGroups(
  regionIds: readonly string[],
  baseEntities: ReadonlyMap<string, { regionIds: string[] }>,
  baseOwners: ReadonlyMap<string, string>,
): Map<string, string[]> {
  const groups = new Map<string, string[]>();
  for (const regionId of regionIds) {
    const ownerId = baseOwners.get(regionId);
    if (!ownerId) continue;
    const group = groups.get(ownerId) ?? [];
    group.push(regionId);
    groups.set(ownerId, group);
  }
  for (const [entityId, ids] of groups) {
    const base = baseEntities.get(entityId);
    const owned = new Set(ids);
    if (!base || owned.size !== base.regionIds.length || !base.regionIds.every((id) => owned.has(id))) {
      groups.delete(entityId);
    }
  }
  return groups;
}
