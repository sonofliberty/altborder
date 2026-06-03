import type { CountryEntity, EditorSnapshot, MapData, ScenarioPayload } from "./types";

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

  return {
    ...snapshot,
    entities: nextEntities,
    regionOwners: nextRegionOwners,
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
    createdFrom: `${sourceEntityId}:${regionId}`,
  };

  return {
    entityId: newEntityId,
    snapshot: {
      ...snapshot,
      customCounter: snapshot.customCounter + 1,
      entities: nextEntities,
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
  const entityChanges: Record<string, CountryEntity> = {};

  for (const [id, entity] of Object.entries(snapshot.entities)) {
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

  const regionOwnerChanges = Object.entries(snapshot.regionOwners).filter(
    ([regionId, ownerId]) => base.regionOwners[regionId] !== ownerId,
  );

  return {
    version: 1,
    title: snapshot.title,
    description: snapshot.description,
    customCounter: snapshot.customCounter,
    entityChanges,
    regionOwnerChanges,
    regionNameOverrides: snapshot.regionNameOverrides,
    customRegions: Object.values(snapshot.customRegions),
  };
}

export function applyScenarioPayload(data: MapData, payload: ScenarioPayload): EditorSnapshot {
  const base = createInitialSnapshot(data);
  const next: EditorSnapshot = {
    ...base,
    title: payload.title || base.title,
    description: payload.description || "",
    customCounter: payload.customCounter || base.customCounter,
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
    customRegions: Object.fromEntries(
      (payload.customRegions || []).map((region) => [region.id, { ...region }]),
    ),
  };

  for (const region of payload.customRegions || []) {
    if (region.ownerId && next.entities[region.ownerId]) {
      next.regionOwners[region.id] = region.ownerId;
    }
  }

  for (const [regionId, ownerId] of payload.regionOwnerChanges || []) {
    if (regionId in next.regionOwners && (!ownerId || next.entities[ownerId])) {
      next.regionOwners[regionId] = ownerId;
    }
  }

  return updateEntityRegions(next);
}
