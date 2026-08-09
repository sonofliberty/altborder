import type { CountryEntity, CountryFlag } from "./types";

export const neutralCountryFlag: CountryFlag = { kind: "builtin", id: "neutral" };
const maxFlagUploadBytes = 2 * 1024 * 1024;
export const maxCustomFlagDataUrlLength = 24 * 1024;

const supportedUploadTypes = new Set([
  "image/jpeg",
  "image/png",
  "image/svg+xml",
  "image/webp",
]);
const builtinFlagIdPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const customFlagDataUrlPattern = /^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/;

export type FlagOption = {
  id: string;
  name: string;
};

export function builtinCountryFlag(id: string): CountryFlag {
  return { kind: "builtin", id };
}

export function countryFlagEquals(first: CountryFlag | undefined, second: CountryFlag | undefined): boolean {
  if (!first || !second || first.kind !== second.kind) return first === second;
  return first.kind === "builtin"
    ? first.id === (second as Extract<CountryFlag, { kind: "builtin" }>).id
    : first.dataUrl === (second as Extract<CountryFlag, { kind: "custom" }>).dataUrl;
}

export function getCountryFlag(entity: CountryEntity | undefined): CountryFlag {
  return isCountryFlag(entity?.flag) ? entity.flag : neutralCountryFlag;
}

export function getCountryFlagUrl(flag: CountryFlag | undefined): string {
  const safeFlag = isCountryFlag(flag) ? flag : neutralCountryFlag;
  if (safeFlag.kind === "custom") return safeFlag.dataUrl;
  return `${import.meta.env.BASE_URL}flags/4x3/${safeFlag.id}.svg`;
}

export function isCountryFlag(value: unknown): value is CountryFlag {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const record = value as Record<string, unknown>;
  if (record.kind === "builtin") {
    return typeof record.id === "string" && builtinFlagIdPattern.test(record.id) && record.id.length <= 32;
  }
  return (
    record.kind === "custom" &&
    typeof record.dataUrl === "string" &&
    record.dataUrl.length <= maxCustomFlagDataUrlLength &&
    customFlagDataUrlPattern.test(record.dataUrl)
  );
}

export function makeFlagOptions(entities: readonly CountryEntity[]): FlagOption[] {
  const options = new Map<string, FlagOption>();
  for (const entity of entities) {
    const flag = getCountryFlag(entity);
    if (flag.kind !== "builtin" || flag.id === "neutral" || options.has(flag.id)) continue;
    options.set(flag.id, { id: flag.id, name: entity.name });
  }
  return [...options.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export async function normalizeFlagUpload(file: File): Promise<CountryFlag> {
  if (!supportedUploadTypes.has(file.type)) {
    throw new Error("Choose a PNG, JPEG, WebP, or SVG image.");
  }
  if (file.size > maxFlagUploadBytes) {
    throw new Error("The image must be 2 MiB or smaller.");
  }

  const objectUrl = URL.createObjectURL(file);
  try {
    const image = await loadImage(objectUrl);
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 96;
    const context = canvas.getContext("2d");
    if (!context) throw new Error("This browser cannot process the image.");

    const scale = Math.min(canvas.width / image.naturalWidth, canvas.height / image.naturalHeight);
    const width = image.naturalWidth * scale;
    const height = image.naturalHeight * scale;
    context.clearRect(0, 0, canvas.width, canvas.height);
    context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);

    const dataUrl = canvas.toDataURL("image/webp", 0.82);
    if (!customFlagDataUrlPattern.test(dataUrl)) {
      throw new Error("This browser cannot create a WebP flag image.");
    }
    if (dataUrl.length > maxCustomFlagDataUrlLength) {
      throw new Error("The processed image is too complex. Choose a simpler flag image.");
    }
    return { kind: "custom", dataUrl };
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      if (image.naturalWidth > 0 && image.naturalHeight > 0) {
        resolve(image);
      } else {
        reject(new Error("The image has no visible content."));
      }
    };
    image.onerror = () => reject(new Error("The image could not be read."));
    image.src = url;
  });
}
