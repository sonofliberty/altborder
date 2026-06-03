const fallbackPalette = [
  "#7D8B5F",
  "#A75F55",
  "#5F7FA2",
  "#B9934F",
  "#6F966D",
  "#8370A0",
  "#B18A6A",
  "#687C86",
  "#A8A36A",
  "#B97984",
  "#758E58",
  "#8D6D58",
  "#708E9D",
  "#A98B4E",
  "#609283",
  "#A1654D",
  "#8C9A77",
  "#9C7C96",
] as const;

const hexColorPattern = /^#[0-9A-Fa-f]{6}$/;

export const customCountryAccentColor = "#A85F4F";

export function getFallbackCountryColor(value: string): string {
  return fallbackPalette[hashString(value) % fallbackPalette.length];
}

export function normalizeCountryColorName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function isHexColor(value: string): boolean {
  return hexColorPattern.test(value);
}

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
