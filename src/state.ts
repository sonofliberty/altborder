import type { CountryEntity, EditorSnapshot, MapData, RegionDivision, RegionRecord, ScenarioPayload } from "./types";
import { DEFAULT_MAP_THEME, isMapThemeId } from "./mapThemes";
import {
  countryFlagEquals,
  getCountryFlag,
  isCountryFlag,
  neutralCountryFlag,
} from "./countryFlags";

export function createInitialSnapshot(data: MapData): EditorSnapshot {
  const regionOwners: Record<string, string> = {};
  for (const country of data.countries) {
    for (const regionId of country.regionIds) {
      regionOwners[regionId] = country.id;
    }
  }

  return {
    title: "Untitled Border Experiment",
    mapTheme: DEFAULT_MAP_THEME,
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
    mapTheme: snapshot.mapTheme ?? DEFAULT_MAP_THEME,
    customCounter: snapshot.customCounter,
    entities: Object.fromEntries(
      Object.entries(snapshot.entities).map(([id, entity]) => [
        id,
        {
          ...entity,
          flag: entity.flag ? { ...entity.flag } : undefined,
          regionIds: [...entity.regionIds],
        },
      ]),
    ),
    regionOwners: { ...snapshot.regionOwners },
    regionNameOverrides: { ...snapshot.regionNameOverrides },
    customRegions: Object.fromEntries(
      Object.entries(snapshot.customRegions).map(([id, region]) => [id, { ...region }]),
    ),
    ...(snapshot.regionLandAdditions ? { regionLandAdditions: { ...snapshot.regionLandAdditions } } : {}),
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
    const owner = getOwnValue(next.entities, ownerId);
    if (owner) {
      owner.regionIds.push(regionId);
    }
  }
  for (const [regionId, region] of Object.entries(next.customRegions)) {
    const ownerId = next.regionOwners[regionId];
    if (!ownerId || !getOwnValue(next.entities, ownerId)) {
      delete next.customRegions[regionId];
      delete next.regionOwners[regionId];
      continue;
    }
    next.customRegions[regionId] = withCurrentRegionOwner(region, ownerId);
  }
  next.regionNameOverrides = pruneInactiveRegionNameOverrides(next);
  if (next.regionLandAdditions) {
    next.regionLandAdditions = Object.fromEntries(Object.entries(next.regionLandAdditions)
      .filter(([id]) => Boolean(next.regionOwners[id] && getOwnValue(next.entities, next.regionOwners[id]))));
    if (Object.keys(next.regionLandAdditions).length === 0) delete next.regionLandAdditions;
  }
  pruneEmptyCustomEntities(next.entities);
  return next;
}

export function transferRegions(
  snapshot: EditorSnapshot,
  regionIds: Iterable<string>,
  targetEntityId: string,
): EditorSnapshot {
  const targetEntity = getOwnValue(snapshot.entities, targetEntityId);
  if (!targetEntity) return snapshot;

  const movedBySource = new Map<string, string[]>();
  const movedRegionIds: string[] = [];
  const seen = new Set<string>();

  for (const regionId of regionIds) {
    if (seen.has(regionId)) continue;
    seen.add(regionId);
    const sourceEntityId = snapshot.regionOwners[regionId];
    if (!sourceEntityId || sourceEntityId === targetEntityId) continue;
    const sourceEntity = getOwnValue(snapshot.entities, sourceEntityId);
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
    const sourceEntity = getOwnValue(snapshot.entities, sourceEntityId);
    if (!sourceEntity) continue;
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
  const nextRegionNameOverrides = { ...snapshot.regionNameOverrides };
  for (const [sourceEntityId, sourceMoved] of movedBySource) {
    const sourceEntity = snapshot.entities[sourceEntityId];
    if (sourceEntity.isCustom && sourceEntity.regionIds.length === 1 && sourceMoved.length === 1) {
      const regionId = sourceMoved[0];
      nextRegionNameOverrides[regionId] ||= sourceEntity.name;
    }
  }
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
    regionNameOverrides: nextRegionNameOverrides,
    customRegions: movedRegionIds.some((id) => snapshot.customRegions[id]) ? nextCustomRegions : snapshot.customRegions,
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
  const sourceEntity = sourceEntityId ? getOwnValue(snapshot.entities, sourceEntityId) : undefined;
  const trimmedName = name.trim();
  if (!sourceEntity || !trimmedName) return null;

  const next = { ...snapshot };
  const newEntityId = allocateCustomEntityId(next);
  const nextEntities = { ...snapshot.entities };
  nextEntities[sourceEntityId] = {
    ...sourceEntity,
    regionIds: sourceEntity.regionIds.filter((ownedRegionId) => ownedRegionId !== regionId),
  };
  nextEntities[newEntityId] = {
    id: newEntityId,
    name: trimmedName,
    color,
    flag: { ...neutralCountryFlag },
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
      ...next,
      entities: nextEntities,
      customRegions: nextCustomRegions,
      regionOwners: {
        ...snapshot.regionOwners,
        [regionId]: newEntityId,
      },
    },
  };
}

export function divideCountry(
  snapshot: EditorSnapshot,
  sourceEntityId: string,
  regionById: ReadonlyMap<string, RegionRecord>,
  divisions: RegionDivision[],
  name: string,
  color: string,
): { snapshot: EditorSnapshot; entityId: string } | null {
  const source = snapshot.entities[sourceEntityId];
  const regionIds = getEntityRegionIds(snapshot, sourceEntityId);
  const dividedIds = new Set(divisions.map((division) => division.regionId));
  if (
    !source || !name.trim() ||
    dividedIds.size !== divisions.length || dividedIds.size !== regionIds.length ||
    !regionIds.every((id) => dividedIds.has(id) && regionById.has(id)) ||
    !divisions.some((division) => division.kind !== "keep") ||
    !divisions.some((division) => division.kind !== "move")
  ) return null;

  const next = cloneSnapshot(snapshot);
  const entityId = allocateCustomEntityId(next);
  next.entities[entityId] = {
    id: entityId,
    name: name.trim(),
    color,
    flag: { ...neutralCountryFlag },
    regionIds: [],
    isCustom: true,
  };

  divisions.forEach((division, index) => {
    if (division.kind !== "split" && division.landAddition) {
      next.regionLandAdditions ??= {};
      next.regionLandAdditions[division.regionId] = division.landAddition;
    }
    if (division.kind === "keep") return;
    if (division.kind === "move") {
      next.regionOwners[division.regionId] = entityId;
      return;
    }
    const region = regionById.get(division.regionId)!;
    const regionNameOverride = snapshot.regionNameOverrides[region.id];
    const regionName = regionNameOverride || region.name;
    if (next.regionLandAdditions) delete next.regionLandAdditions[region.id];
    if (next.customRegions[region.id]) {
      delete next.customRegions[region.id];
      delete next.regionOwners[region.id];
    } else {
      next.regionOwners[region.id] = "";
    }
    delete next.regionNameOverrides[region.id];
    for (const [suffix, ownerId, geometry] of [
      ["REMAINDER", sourceEntityId, division.existingGeometry],
      ["TERRITORY", entityId, division.newGeometry],
    ] as const) {
      const id = `${entityId}-REGION-${index}-${suffix}`;
      next.customRegions[id] = { ...region, id, name: regionName, ownerId, geometry };
      next.regionOwners[id] = ownerId;
      if (regionNameOverride) next.regionNameOverrides[id] = regionNameOverride;
    }
  });

  return { entityId, snapshot: updateEntityRegions(next) };
}

function makeCustomEntityId(counter: number): string {
  return `CUSTOM_${String(counter).padStart(3, "0")}`;
}

export function allocateCustomEntityId(snapshot: EditorSnapshot): string {
  const counter = findAvailableCustomCounter(getUsedCustomCounters(snapshot), snapshot.customCounter);
  snapshot.customCounter = incrementCustomCounter(counter);
  return makeCustomEntityId(counter);
}

export function createScenarioPayload(data: MapData, snapshot: EditorSnapshot): ScenarioPayload {
  const base = createInitialSnapshot(data);
  const normalizedSnapshot = createSerializableSnapshot(base, snapshot);
  const entityChanges: Record<string, CountryEntity> = {};

  for (const [id, entity] of Object.entries(normalizedSnapshot.entities)) {
    if (entity.isCustom && entity.regionIds.length === 0) continue;
    const baseEntity = getOwnValue(base.entities, id);
    if (
      !baseEntity ||
      baseEntity.name !== entity.name ||
      baseEntity.color !== entity.color ||
      Boolean(baseEntity.colorIsCustom) !== Boolean(entity.colorIsCustom) ||
      !countryFlagEquals(baseEntity.flag, entity.flag) ||
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
    ...(normalizedSnapshot.mapTheme !== DEFAULT_MAP_THEME ? { mapTheme: normalizedSnapshot.mapTheme } : {}),
    customCounter: normalizedSnapshot.customCounter,
    entityChanges,
    regionOwnerChanges,
    regionNameOverrides: pruneInactiveRegionNameOverrides(normalizedSnapshot),
    ...(normalizedSnapshot.regionLandAdditions ? { regionLandAdditions: normalizedSnapshot.regionLandAdditions } : {}),
    customRegions: Object.values(normalizedSnapshot.customRegions)
      .filter((region) => {
        const ownerId = normalizedSnapshot.regionOwners[region.id];
        return Boolean(ownerId && getOwnValue(normalizedSnapshot.entities, ownerId));
      })
      .map((region) => withCurrentRegionOwner(region, normalizedSnapshot.regionOwners[region.id])),
  };
}

export function applyScenarioPayload(data: MapData, payload: ScenarioPayload): EditorSnapshot {
  const base = createInitialSnapshot(data);
  const next: EditorSnapshot = {
    ...base,
    title: payload.title ?? base.title,
    mapTheme: isMapThemeId(payload.mapTheme) ? payload.mapTheme : DEFAULT_MAP_THEME,
    customCounter: payload.customCounter ?? base.customCounter,
    entities: {
      ...base.entities,
      ...Object.fromEntries(
        Object.entries(payload.entityChanges || {}).map(([id, entity]) => {
          const baseEntity = getOwnValue(base.entities, id);
          return [
            id,
            {
              ...baseEntity,
              ...entity,
              flag: entity.flag ? { ...entity.flag } : baseEntity?.flag ? { ...baseEntity.flag } : undefined,
              regionIds: [...(entity.regionIds || [])],
            },
          ];
        }),
      ),
    },
    regionOwners: { ...base.regionOwners },
    regionNameOverrides: { ...(payload.regionNameOverrides || {}) },
    customRegions: {},
    ...(payload.regionLandAdditions ? { regionLandAdditions: { ...payload.regionLandAdditions } } : {}),
  };
  normalizeEntityCustomFlags(base, next.entities);
  normalizeEntityFlags(base, next.entities);

  for (const region of payload.customRegions || []) {
    if (hasOwnKey(base.regionOwners, region.id)) continue;
    if (region.ownerId && getOwnValue(next.entities, region.ownerId)) {
      next.customRegions[region.id] = { ...region };
      next.regionOwners[region.id] = region.ownerId;
    }
  }

  for (const [regionId, ownerId] of payload.regionOwnerChanges || []) {
    if (hasOwnKey(next.regionOwners, regionId) && (!ownerId || getOwnValue(next.entities, ownerId))) {
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
  const usedCounters = getUsedCustomCounters(snapshot);
  let counter = Number.isSafeInteger(snapshot.customCounter) && snapshot.customCounter >= 1
    ? snapshot.customCounter
    : 1;
  for (const usedCounter of usedCounters) {
    if (usedCounter >= counter) counter = usedCounter;
  }
  if (usedCounters.has(counter)) counter = incrementCustomCounter(counter);
  const nextCounter = findAvailableCustomCounter(usedCounters, counter);

  if (nextCounter === snapshot.customCounter) return snapshot;
  return { ...snapshot, customCounter: nextCounter };
}

function getUsedCustomCounters(snapshot: EditorSnapshot): Set<number> {
  const counters = new Set<number>();
  for (const id of [...Object.keys(snapshot.entities), ...Object.keys(snapshot.customRegions)]) {
    const match = /^CUSTOM_(\d+)(?:$|-)/.exec(id);
    if (!match) continue;
    const counter = Number(match[1]);
    if (Number.isSafeInteger(counter) && counter >= 1) counters.add(counter);
  }
  return counters;
}

function findAvailableCustomCounter(usedCounters: Set<number>, preferredCounter: number): number {
  let counter = Number.isSafeInteger(preferredCounter) && preferredCounter >= 1 ? preferredCounter : 1;
  while (usedCounters.has(counter)) counter = incrementCustomCounter(counter);
  return counter;
}

function incrementCustomCounter(counter: number): number {
  return counter === Number.MAX_SAFE_INTEGER ? 1 : counter + 1;
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
  normalizeEntityCustomFlags(base, next.entities);
  normalizeEntityFlags(base, next.entities);

  for (const [regionId, ownerId] of Object.entries(next.regionOwners)) {
    const isBaseRegion = hasOwnKey(base.regionOwners, regionId);
    let isCustomRegion = hasOwnKey(next.customRegions, regionId);
    if (isBaseRegion && isCustomRegion) {
      delete next.customRegions[regionId];
      isCustomRegion = false;
    }
    if (!isBaseRegion && !isCustomRegion) {
      delete next.regionOwners[regionId];
      continue;
    }
    if (ownerId && !getOwnValue(next.entities, ownerId)) {
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

function normalizeEntityCustomFlags(
  base: EditorSnapshot,
  entities: Record<string, CountryEntity>,
): void {
  for (const [entityId, entity] of Object.entries(entities)) {
    if (!hasOwnKey(base.entities, entityId)) {
      if (!entity.isCustom) {
        entities[entityId] = { ...entity, isCustom: true };
      }
      continue;
    }
    if (!entity.isCustom) continue;
    entities[entityId] = { ...entity };
    delete entities[entityId].isCustom;
  }
}

function normalizeEntityFlags(
  base: EditorSnapshot,
  entities: Record<string, CountryEntity>,
): void {
  const allowedBuiltinIds = new Set(["neutral"]);
  for (const entity of Object.values(base.entities)) {
    const flag = getCountryFlag(entity);
    if (flag.kind === "builtin") allowedBuiltinIds.add(flag.id);
  }

  for (const [entityId, entity] of Object.entries(entities)) {
    const baseFlag = getOwnValue(base.entities, entityId)?.flag;
    const fallbackFlag = baseFlag && isCountryFlag(baseFlag) ? baseFlag : neutralCountryFlag;
    const flag = entity.flag;
    if (
      !isCountryFlag(flag) ||
      (flag.kind === "builtin" && !allowedBuiltinIds.has(flag.id))
    ) {
      entities[entityId] = { ...entity, flag: { ...fallbackFlag } };
    }
  }
}

function pruneInactiveRegionNameOverrides(snapshot: EditorSnapshot): Record<string, string> {
  return Object.fromEntries(
    Object.entries(snapshot.regionNameOverrides).filter(([regionId, name]) => {
      if (!name.trim()) return false;
      const ownerId = snapshot.regionOwners[regionId];
      return Boolean(ownerId && getOwnValue(snapshot.entities, ownerId));
    }),
  );
}

function getOwnValue<T>(record: Record<string, T>, key: string): T | undefined {
  return hasOwnKey(record, key) ? record[key] : undefined;
}

function hasOwnKey<T>(record: Record<string, T>, key: string): boolean {
  return Object.prototype.hasOwnProperty.call(record, key);
}
