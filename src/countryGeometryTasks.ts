import type { Geometry } from "geojson";
import type { CountryLabelGeometryInput } from "./countryLabelGeometry";
import type { StableBaseRenderGeometryInput } from "./countryRenderGeometry";

export type StableBaseGeometryWorkerInput = Omit<StableBaseRenderGeometryInput,
  "subtractGeoJsonGeometries" | "unionGeoJsonGeometries" | "unionGeoJsonGeometriesClosingGaps">;
export type CountryLabelGeometryWorkerInput = Omit<CountryLabelGeometryInput,
  "subtractGeoJsonGeometries" | "unionGeoJsonGeometriesClosingGaps">;

export type CountryGeometryTask =
  | { kind: "union-owned"; geometries: Geometry[] }
  | { kind: "union"; geometries: Geometry[]; gapTolerance?: number }
  | { kind: "stable-base"; input: StableBaseGeometryWorkerInput }
  | { kind: "label-geometry"; input: CountryLabelGeometryWorkerInput };

export type CountryGeometryResult = Geometry | Geometry[] | null;
export type CountryGeometryWorkerRequest = { id: number; task: CountryGeometryTask };
export type CountryGeometryWorkerResponse =
  | { id: number; result: CountryGeometryResult }
  | { id: number; error: string };

/** Keep whole-world geometry out of per-country structured-clone payloads. */
export function prepareStableBaseGeometryInput(input: StableBaseGeometryWorkerInput): StableBaseGeometryWorkerInput {
  const baseEntity = input.baseEntityById.get(input.entityId);
  const baseCountry = input.baseCountryByEntityId.get(input.entityId);
  const relevantIds = new Set([...(baseEntity?.regionIds ?? []), ...input.regionIds]);
  if (baseEntity?.regionIds.some((id) => !input.regionOwners[id])) {
    for (const id of input.regionGeometryById.keys()) {
      if (!input.baseOwnerByRegionId.has(id) && input.regionOwners[id] && input.regionOwners[id] !== input.entityId) {
        relevantIds.add(id);
      }
    }
  }
  return {
    entityId: input.entityId,
    regionIds: input.regionIds,
    unionGapTolerance: input.unionGapTolerance,
    baseEntityById: new Map(baseEntity ? [[input.entityId, { regionIds: baseEntity.regionIds }]] : []),
    baseCountryByEntityId: new Map(baseCountry ? [[input.entityId, { geometry: baseCountry.geometry }]] : []),
    baseOwnerByRegionId: selectMapEntries(input.baseOwnerByRegionId, relevantIds),
    regionGeometryById: selectMapEntries(input.regionGeometryById, relevantIds),
    regionOwners: Object.fromEntries([...relevantIds]
      .filter((id) => input.regionOwners[id] !== undefined)
      .map((id) => [id, input.regionOwners[id]])),
  };
}

export function prepareCountryLabelGeometryInput(input: CountryLabelGeometryWorkerInput): CountryLabelGeometryWorkerInput {
  const baseEntity = input.baseEntityById.get(input.entityId);
  const baseCountry = input.baseCountryByEntityId.get(input.entityId);
  const relevantIds = new Set([...(baseEntity?.regionIds ?? []), ...input.regionIds]);
  return {
    entityId: input.entityId,
    regionIds: input.regionIds,
    fallbackGeometries: input.fallbackGeometries,
    unionGapTolerance: input.unionGapTolerance,
    baseEntityById: new Map(baseEntity ? [[input.entityId, { regionIds: baseEntity.regionIds }]] : []),
    baseCountryByEntityId: new Map(baseCountry ? [[input.entityId, { geometry: baseCountry.geometry }]] : []),
    baseOwnerByRegionId: selectMapEntries(input.baseOwnerByRegionId, relevantIds),
    regionById: selectMapEntries(input.regionById, relevantIds),
  };
}

function selectMapEntries<T>(source: Map<string, T>, ids: ReadonlySet<string>): Map<string, T> {
  const result = new Map<string, T>();
  for (const id of ids) {
    const value = source.get(id);
    if (value !== undefined) result.set(id, value);
  }
  return result;
}

/** This module is also testable without a worker or a browser. */
export async function runCountryGeometryTask(task: CountryGeometryTask): Promise<CountryGeometryResult> {
  if (task.kind === "union-owned") {
    const { unionOwnedRegionRenderGeometry } = await import("./countryRenderGeometry");
    return unionOwnedRegionRenderGeometry(task.geometries);
  }
  const split = await import("./geometrySplit");
  if (task.kind === "union") {
    return task.gapTolerance === undefined
      ? split.unionGeoJsonGeometries(task.geometries)
      : split.unionGeoJsonGeometriesClosingGaps(task.geometries, task.gapTolerance);
  }
  if (task.kind === "stable-base") {
    const { buildStableBaseRenderGeometry } = await import("./countryRenderGeometry");
    return buildStableBaseRenderGeometry({ ...task.input, ...split });
  }
  const { getCountryLabelGeometries } = await import("./countryLabelGeometry");
  return getCountryLabelGeometries({ ...task.input, ...split });
}
