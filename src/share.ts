import type { ScenarioPayload } from "./types";

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
    if (payload.version !== 1) {
      return { ok: false, error: "This shared map uses an unsupported scenario version." };
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
  const params = new URLSearchParams(value);
  return params.get("s");
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
