import type { ScenarioPayload } from "./types";
import { isHexColor } from "./colorRuntime";

export type DecodedShare =
  | { ok: true; payload: ScenarioPayload }
  | { ok: false; error: string };

let lzStringModulePromise: Promise<typeof import("lz-string")> | null = null;

export async function encodeSharePayload(payload: ScenarioPayload): Promise<string> {
  const { compressToEncodedURIComponent } = await loadLzStringModule();
  return compressToEncodedURIComponent(JSON.stringify(payload));
}

export async function decodeSharePayload(encoded: string): Promise<DecodedShare> {
  try {
    const { decompressFromEncodedURIComponent } = await loadLzStringModule();
    const json = decompressFromEncodedURIComponent(encoded);
    if (!json) {
      return { ok: false, error: "The shared map data could not be decompressed." };
    }
    const payload = JSON.parse(json) as ScenarioPayload;
    if (!isRecord(payload) || payload.version !== 1) {
      return { ok: false, error: "This shared map uses an unsupported scenario version." };
    }
    if (!isScenarioPayloadShape(payload)) {
      return { ok: false, error: "The shared map link is invalid." };
    }
    return { ok: true, payload };
  } catch {
    return { ok: false, error: "The shared map link is invalid." };
  }
}

function loadLzStringModule(): Promise<typeof import("lz-string")> {
  lzStringModulePromise ??= import("lz-string");
  return lzStringModulePromise;
}

export function readShareFromHash(hash: string): string | null {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  return readHashParam(value, "s");
}

export function makeShareUrl(encoded: string): string {
  const url = new URL(window.location.href);
  url.hash = `s=${encoded}`;
  return url.toString();
}

export function makeEditableUrl(encoded: string): string {
  const url = new URL(window.location.href);
  url.hash = `s=${encoded}&edit=1`;
  return url.toString();
}

export function hashRequestsEdit(hash: string): boolean {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  return new URLSearchParams(value).get("edit") === "1";
}

function readHashParam(hashValue: string, key: string): string | null {
  for (const entry of hashValue.split("&")) {
    const [rawKey, ...rawValueParts] = entry.split("=");
    if (decodeHashComponent(rawKey) !== key) continue;
    return decodeHashComponent(rawValueParts.join("="));
  }
  return null;
}

function decodeHashComponent(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function describeUrlSize(url: string): { bytes: number; level: "ok" | "warn" | "large" } {
  const bytes = new Blob([url]).size;
  if (bytes >= 8000) {
    return { bytes, level: "large" };
  }
  if (bytes >= 4000) {
    return { bytes, level: "warn" };
  }
  return { bytes, level: "ok" };
}

function isScenarioPayloadShape(payload: Record<string, unknown>): payload is ScenarioPayload {
  return (
    optionalString(payload.title) &&
    optionalString(payload.description) &&
    optionalPositiveInteger(payload.customCounter) &&
    optionalEntityChanges(payload.entityChanges) &&
    optionalRegionOwnerChanges(payload.regionOwnerChanges) &&
    optionalStringRecord(payload.regionNameOverrides) &&
    optionalCustomRegions(payload.customRegions) &&
    customOwnersHaveEntityChanges(payload) &&
    customRegionOwnerChangesAreConsistent(payload)
  );
}

function optionalString(value: unknown): boolean {
  return value === undefined || typeof value === "string";
}

function optionalPositiveInteger(value: unknown): boolean {
  return value === undefined || (typeof value === "number" && Number.isInteger(value) && value >= 1);
}

function optionalEntityChanges(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) &&
      Object.entries(value).every(([entityId, entity]) => {
        if (!isCountryEntity(entity)) return false;
        return entity.id === entityId;
      }))
  );
}

function optionalStringRecord(value: unknown): boolean {
  return (
    value === undefined ||
    (isRecord(value) && Object.values(value).every((entry) => typeof entry === "string"))
  );
}

function optionalCustomRegions(value: unknown): boolean {
  if (value === undefined) return true;
  if (!Array.isArray(value) || !value.every(isRegionRecord)) return false;
  return new Set(value.map((region) => region.id)).size === value.length;
}

function optionalRegionOwnerChanges(value: unknown): boolean {
  if (value === undefined) return true;
  if (
    !Array.isArray(value) ||
    !value.every((entry) =>
      Array.isArray(entry) &&
      entry.length === 2 &&
      typeof entry[0] === "string" &&
      typeof entry[1] === "string",
    )
  ) {
    return false;
  }
  return new Set(value.map(([regionId]) => regionId)).size === value.length;
}

function customOwnersHaveEntityChanges(payload: Record<string, unknown>): boolean {
  const customEntityIds = isRecord(payload.entityChanges) ? new Set(Object.keys(payload.entityChanges)) : new Set();
  if (
    Array.isArray(payload.customRegions) &&
    !payload.customRegions.every((region) => {
      if (!isRecord(region) || typeof region.ownerId !== "string") return false;
      return !isCustomId(region.ownerId) || customEntityIds.has(region.ownerId);
    })
  ) {
    return false;
  }
  if (
    Array.isArray(payload.regionOwnerChanges) &&
    !payload.regionOwnerChanges.every((entry) => {
      const ownerId = entry[1];
      return typeof ownerId === "string" && (!isCustomId(ownerId) || customEntityIds.has(ownerId));
    })
  ) {
    return false;
  }
  return true;
}

function customRegionOwnerChangesAreConsistent(payload: Record<string, unknown>): boolean {
  if (!Array.isArray(payload.customRegions) || !Array.isArray(payload.regionOwnerChanges)) {
    return true;
  }
  const customRegionOwnerById = new Map<string, string>();
  for (const region of payload.customRegions) {
    if (!isRecord(region) || typeof region.id !== "string" || typeof region.ownerId !== "string") {
      return false;
    }
    customRegionOwnerById.set(region.id, region.ownerId);
  }
  return payload.regionOwnerChanges.every((entry) => {
    const expectedOwnerId = customRegionOwnerById.get(entry[0]);
    return expectedOwnerId === undefined || expectedOwnerId === entry[1];
  });
}

function isCustomId(value: string): boolean {
  return /^CUSTOM_\d+/.test(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isCountryEntity(value: unknown): value is { id: string } {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.color === "string" &&
    isHexColor(value.color) &&
    Array.isArray(value.regionIds) &&
    value.regionIds.every((regionId) => typeof regionId === "string") &&
    optionalBoolean(value.isCustom)
  );
}

function isRegionRecord(value: unknown): boolean {
  if (!isRecord(value)) return false;
  return (
    typeof value.id === "string" &&
    typeof value.name === "string" &&
    typeof value.ownerId === "string" &&
    typeof value.type === "string" &&
    isGeometry(value.geometry)
  );
}

function isGeometry(value: unknown): boolean {
  if (!isRecord(value) || typeof value.type !== "string") return false;
  if (value.type === "Polygon" || value.type === "MultiPolygon") {
    return value.type === "Polygon"
      ? isPolygonCoordinates(value.coordinates)
      : Array.isArray(value.coordinates) &&
          value.coordinates.length > 0 &&
          value.coordinates.every(isPolygonCoordinates);
  }
  return false;
}

function isPolygonCoordinates(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0 && value.every(isLinearRing);
}

function isLinearRing(value: unknown): boolean {
  if (!Array.isArray(value) || value.length < 4 || !value.every(isPosition)) return false;
  const first = value[0];
  const last = value[value.length - 1];
  if (first[0] !== last[0] || first[1] !== last[1]) return false;
  const distinctPositions = new Set(value.map((position) => `${position[0]},${position[1]}`));
  return distinctPositions.size >= 3 && Math.abs(linearRingArea(value)) > 0;
}

function linearRingArea(ring: number[][]): number {
  let area = 0;
  for (let index = 0; index < ring.length - 1; index += 1) {
    const current = ring[index];
    const next = ring[index + 1];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}

function isPosition(value: unknown): boolean {
  return (
    Array.isArray(value) &&
    value.length >= 2 &&
    typeof value[0] === "number" &&
    Number.isFinite(value[0]) &&
    typeof value[1] === "number" &&
    Number.isFinite(value[1])
  );
}

function optionalBoolean(value: unknown): boolean {
  return value === undefined || typeof value === "boolean";
}
