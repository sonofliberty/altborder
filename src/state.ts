import type { CountryEntity, EditorSnapshot, MapData, RegionRecord, ScenarioPayload } from "./types";

export function createInitialSnapshot(data: MapData): EditorSnapshot {
  const regionOwners: Record<string, string> = {};
  for (const country of data.countries) {
    for (const regionId of country.regionIds) {
      regionOwners[regionId] = country.id;
    }
  }

  return {
    title: "Untitled Border Experiment",
    description: "",
    entities: Object.fromEntries(data.countries.map((country) => [country.id, { ...country }])),
    regionOwners,
    regionNameOverrides: {},
    customRegions: {},
    customCounter: 1,
  };
}

export function cloneSnapshot(snapshot: EditorSnapshot): EditorSnapshot {
  return {
    title: snapshot.title,
    description: snapshot.description,
    customCounter: snapshot.customCounter,
    entities: Object.fromEntries(
      Object.entries(snapshot.entities).map(([id, entity]) => [
        id,
        { ...entity, regionIds: [...entity.regionIds] },
      ]),
    ),
    regionOwners: { ...snapshot.regionOwners },
    regionNameOverrides: { ...snapshot.regionNameOverrides },
    customRegions: Object.fromEntries(
      Object.entries(snapshot.customRegions).map(([id, region]) => [id, { ...region }]),
    ),
  };
}

export function getEntityRegionIds(snapshot: EditorSnapshot, entityId: string): string[] {
  return Object.entries(snapshot.regionOwners)
    .filter(([, ownerId]) => ownerId === entityId)
    .map(([regionId]) => regionId);
}

export function updateEntityRegions(snapshot: EditorSnapshot): EditorSnapshot {
  const next = cloneSnapshot(snapshot);
  for (const entity of Object.values(next.entities)) {
    entity.regionIds = [];
  }
  for (const [regionId, ownerId] of Object.entries(next.regionOwners)) {
    if (next.entities[ownerId]) {
      next.entities[ownerId].regionIds.push(regionId);
    }
  }
  for (const [regionId, region] of Object.entries(next.customRegions)) {
    const ownerId = next.regionOwners[regionId];
    if (!ownerId || !next.entities[ownerId]) {
      delete next.customRegions[regionId];
      delete next.regionOwners[regionId];
      continue;
    }
    next.customRegions[regionId] = withCurrentRegionOwner(region, ownerId);
  }
  next.regionNameOverrides = pruneInactiveRegionNameOverrides(next);
  pruneEmptyCustomEntities(next.entities);
  return next;
}

export function transferRegions(
  snapshot: EditorSnapshot,
  regionIds: Iterable<string>,
  targetEntityId: string,
): EditorSnapshot {
  const targetEntity = snapshot.entities[targetEntityId];
  if (!targetEntity) return snapshot;

  const movedBySource = new Map<string, string[]>();
  const movedRegionIds: string[] = [];
  const seen = new Set<string>();

  for (const regionId of regionIds) {
    if (seen.has(regionId)) continue;
    seen.add(regionId);
    const sourceEntityId = snapshot.regionOwners[regionId];
    if (!sourceEntityId || sourceEntityId === targetEntityId) continue;
    const sourceEntity = snapshot.entities[sourceEntityId];
    if (!sourceEntity) continue;

    const sourceMoved = movedBySource.get(sourceEntityId) ?? [];
    sourceMoved.push(regionId);
    movedBySource.set(sourceEntityId, sourceMoved);
    movedRegionIds.push(regionId);
  }

  if (movedRegionIds.length === 0) return snapshot;

  const nextRegionOwners = { ...snapshot.regionOwners };
  for (const regionId of movedRegionIds) {
    nextRegionOwners[regionId] = targetEntityId;
  }

  const nextEntities = { ...snapshot.entities };
  for (const [sourceEntityId, sourceMoved] of movedBySource) {
    const sourceEntity = snapshot.entities[sourceEntityId];
    const sourceMovedSet = new Set(sourceMoved);
    nextEntities[sourceEntityId] = {
      ...sourceEntity,
      regionIds: sourceEntity.regionIds.filter((regionId) => !sourceMovedSet.has(regionId)),
    };
  }

  const targetRegionIds = new Set(targetEntity.regionIds);
  const addedTargetRegionIds = movedRegionIds.filter((regionId) => {
    if (targetRegionIds.has(regionId)) return false;
    targetRegionIds.add(regionId);
    return true;
  });

  nextEntities[targetEntityId] = {
    ...targetEntity,
    regionIds: [...targetEntity.regionIds, ...addedTargetRegionIds],
  };

  const nextCustomRegions = { ...snapshot.customRegions };
  for (const regionId of movedRegionIds) {
    const customRegion = nextCustomRegions[regionId];
    if (customRegion) {
      nextCustomRegions[regionId] = withCurrentRegionOwner(customRegion, targetEntityId);
    }
  }
  pruneEmptyCustomEntities(nextEntities);

  return {
    ...snapshot,
    entities: nextEntities,
    regionOwners: nextRegionOwners,
    customRegions: nextCustomRegions,
  };
}

export function renameRegion(snapshot: EditorSnapshot, regionId: string, name: string): EditorSnapshot {
  const normalizedName = name.trim();
  const currentOverride = snapshot.regionNameOverrides[regionId] ?? "";
  if (currentOverride === normalizedName) return snapshot;

  const nextOverrides = { ...snapshot.regionNameOverrides };
  if (normalizedName) {
    nextOverrides[regionId] = normalizedName;
  } else {
    delete nextOverrides[regionId];
  }

  return {
    ...snapshot,
    regionNameOverrides: nextOverrides,
  };
}

export function separateRegionAsCountry(
  snapshot: EditorSnapshot,
  regionId: string,
  name: string,
  color: string,
): { snapshot: EditorSnapshot; entityId: string } | null {
  const sourceEntityId = snapshot.regionOwners[regionId];
  const sourceEntity = sourceEntityId ? snapshot.entities[sourceEntityId] : undefined;
  const trimmedName = name.trim();
  if (!sourceEntity || !trimmedName) return null;

  const newEntityId = makeCustomEntityId(snapshot.customCounter);
  const nextEntities = { ...snapshot.entities };
  nextEntities[sourceEntityId] = {
    ...sourceEntity,
    regionIds: sourceEntity.regionIds.filter((ownedRegionId) => ownedRegionId !== regionId),
  };
  nextEntities[newEntityId] = {
    id: newEntityId,
    name: trimmedName,
    color,
    regionIds: [regionId],
    isCustom: true,
  };
  const nextCustomRegions = { ...snapshot.customRegions };
  const customRegion = nextCustomRegions[regionId];
  if (customRegion) {
    nextCustomRegions[regionId] = withCurrentRegionOwner(customRegion, newEntityId);
  }

  return {
    entityId: newEntityId,
    snapshot: {
      ...snapshot,
      customCounter: snapshot.customCounter + 1,
      entities: nextEntities,
      customRegions: nextCustomRegions,
      regionOwners: {
        ...snapshot.regionOwners,
        [regionId]: newEntityId,
      },
    },
  };
}

export function makeCustomEntityId(counter: number): string {
  return `CUSTOM_${String(counter).padStart(3, "0")}`;
}

export function createScenarioPayload(data: MapData, snapshot: EditorSnapshot): ScenarioPayload {
  const base = createInitialSnapshot(data);
  const normalizedSnapshot = createSerializableSnapshot(base, snapshot);
  const entityChanges: Record<string, CountryEntity> = {};

  for (const [id, entity] of Object.entries(normalizedSnapshot.entities)) {
    if (entity.isCustom && entity.regionIds.length === 0) continue;
    const baseEntity = base.entities[id];
    if (
      !baseEntity ||
      baseEntity.name !== entity.name ||
      baseEntity.color !== entity.color ||
      entity.isCustom
    ) {
      entityChanges[id] = entity;
    }
  }

  const regionOwnerChanges = Object.entries(normalizedSnapshot.regionOwners).filter(
    ([regionId, ownerId]) => base.regionOwners[regionId] !== ownerId,
  );

  return {
    version: 1,
    title: normalizedSnapshot.title,
    description: normalizedSnapshot.description,
    customCounter: normalizedSnapshot.customCounter,
    entityChanges,
    regionOwnerChanges,
    regionNameOverrides: pruneInactiveRegionNameOverrides(normalizedSnapshot),
    customRegions: Object.values(normalizedSnapshot.customRegions)
      .filter((region) => {
        const ownerId = normalizedSnapshot.regionOwners[region.id];
        return Boolean(ownerId && normalizedSnapshot.entities[ownerId]);
      })
      .map((region) => withCurrentRegionOwner(region, normalizedSnapshot.regionOwners[region.id])),
  };
}

export function applyScenarioPayload(data: MapData, payload: ScenarioPayload): EditorSnapshot {
  const base = createInitialSnapshot(data);
  const next: EditorSnapshot = {
    ...base,
    title: payload.title ?? base.title,
    description: payload.description ?? "",
    customCounter: payload.customCounter ?? base.customCounter,
    entities: {
      ...base.entities,
      ...Object.fromEntries(
        Object.entries(payload.entityChanges || {}).map(([id, entity]) => [
          id,
          { ...entity, regionIds: [...(entity.regionIds || [])] },
        ]),
      ),
    },
    regionOwners: { ...base.regionOwners },
    regionNameOverrides: { ...(payload.regionNameOverrides || {}) },
    customRegions: {},
  };
  stripBaseEntityCustomFlags(base, next.entities);

  for (const region of payload.customRegions || []) {
    if (region.id in base.regionOwners) continue;
    if (region.ownerId && next.entities[region.ownerId]) {
      next.customRegions[region.id] = { ...region };
      next.regionOwners[region.id] = region.ownerId;
    }
  }

  for (const [regionId, ownerId] of payload.regionOwnerChanges || []) {
    if (regionId in next.regionOwners && (!ownerId || next.entities[ownerId])) {
      next.regionOwners[regionId] = ownerId;
    }
  }

  return normalizeCustomCounter(updateEntityRegions(next));
}

function withCurrentRegionOwner(region: RegionRecord, ownerId: string | undefined): RegionRecord {
  if (ownerId === undefined || region.ownerId === ownerId) {
    return region;
  }
  if (!ownerId) {
    const regionWithoutOwner = { ...region };
    delete regionWithoutOwner.ownerId;
    return regionWithoutOwner;
  }
  return { ...region, ownerId };
}

function normalizeCustomCounter(snapshot: EditorSnapshot): EditorSnapshot {
  const usedCustomIds = [...Object.keys(snapshot.entities), ...Object.keys(snapshot.customRegions)];
  const nextCounter = usedCustomIds.reduce(
    (counter, id) => Math.max(counter, getCustomCounterFloor(id)),
    snapshot.customCounter,
  );

  if (nextCounter === snapshot.customCounter) return snapshot;
  return { ...snapshot, customCounter: nextCounter };
}

function getCustomCounterFloor(id: string): number {
  const match = /^CUSTOM_(\d+)(?:$|-)/.exec(id);
  if (!match) return 0;
  return Number(match[1]) + 1;
}

function pruneEmptyCustomEntities(entities: Record<string, CountryEntity>): void {
  for (const [entityId, entity] of Object.entries(entities)) {
    if (entity.isCustom && entity.regionIds.length === 0) {
      delete entities[entityId];
    }
  }
}

function createSerializableSnapshot(base: EditorSnapshot, snapshot: EditorSnapshot): EditorSnapshot {
  const next = cloneSnapshot(snapshot);
  stripBaseEntityCustomFlags(base, next.entities);

  for (const [regionId, ownerId] of Object.entries(next.regionOwners)) {
    const isBaseRegion = regionId in base.regionOwners;
    let isCustomRegion = regionId in next.customRegions;
    if (isBaseRegion && isCustomRegion) {
      delete next.customRegions[regionId];
      isCustomRegion = false;
    }
    if (!isBaseRegion && !isCustomRegion) {
      delete next.regionOwners[regionId];
      continue;
    }
    if (ownerId && !next.entities[ownerId]) {
      if (isCustomRegion) {
        delete next.customRegions[regionId];
        delete next.regionOwners[regionId];
      } else {
        next.regionOwners[regionId] = base.regionOwners[regionId] ?? "";
      }
    }
  }

  return updateEntityRegions(next);
}

function stripBaseEntityCustomFlags(
  base: EditorSnapshot,
  entities: Record<string, CountryEntity>,
): void {
  for (const entityId of Object.keys(base.entities)) {
    const entity = entities[entityId];
    if (!entity?.isCustom) continue;
    entities[entityId] = { ...entity };
    delete entities[entityId].isCustom;
  }
}

function pruneInactiveRegionNameOverrides(snapshot: EditorSnapshot): Record<string, string> {
  return Object.fromEntries(
    Object.entries(snapshot.regionNameOverrides).filter(([regionId]) => {
      const ownerId = snapshot.regionOwners[regionId];
      return Boolean(ownerId && snapshot.entities[ownerId]);
    }),
  );
}
