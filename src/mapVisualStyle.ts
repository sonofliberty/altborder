import type { MapData } from "./types";

const closeAdministrativeBorderZoom = 2.4;
const detailAdministrativeBorderZoom = 5.5;
const minimumCountryBorderWidth = 1.55;
const maximumCountryBorderWidth = 1.8;

export function getAdministrativeBorderZoomClass(zoomScale: number): string {
  if (!Number.isFinite(zoomScale) || zoomScale < closeAdministrativeBorderZoom) {
    return "map-admin-borders-default";
  }

  if (zoomScale < detailAdministrativeBorderZoom) {
    return "map-admin-borders-close";
  }

  return "map-admin-borders-detail";
}

export function getCountryBorderStrokeWidth(zoomScale: number): number {
  if (!Number.isFinite(zoomScale)) return minimumCountryBorderWidth;
  return Math.min(
    maximumCountryBorderWidth,
    Math.max(minimumCountryBorderWidth, minimumCountryBorderWidth + (Math.sqrt(Math.max(zoomScale, 0)) - 1) * 0.4),
  );
}

// Prefer the selected preview's colors when neighboring countries allow them.
const politicalPalette = ["#85887b", "#7a8eaa", "#aa7e7d", "#a69b78", "#739087", "#8e8499"];
const politicalCountryColors = new Map<string, number>([
  ["FRA", 1], ["DEU", 0], ["POL", 2], ["RUS", 2], ["CHN", 2],
  ["USA", 1], ["CAN", 2], ["GBR", 3], ["ESP", 3], ["ITA", 4],
  ["BRA", 4], ["AUS", 3], ["IND", 3], ["UKR", 3], ["TUR", 5],
  ["SWE", 1], ["NOR", 0], ["FIN", 0], ["JPN", 3],
]);

/** Apply the default appearance before restoring a scenario's explicit colors. */
export function applyPoliticalMapPalette(data: MapData): MapData {
  const neighbors = new Map(data.countries.map((country) => [country.id, new Set<string>()]));
  const owners = new Map(data.countries.flatMap((country) =>
    country.regionIds.map((regionId) => [regionId, country.id] as const),
  ));
  for (const { regionIds: [first, second] } of data.boundaryEdges) {
    if (!second) continue;
    const a = owners.get(first);
    const b = owners.get(second);
    if (!a || !b || a === b) continue;
    neighbors.get(a)?.add(b);
    neighbors.get(b)?.add(a);
  }

  const colors = new Map(data.countries.filter((country) => country.isCustom)
    .map((country) => [country.id, country.color.toLowerCase()]));
  const remaining = data.countries.filter((country) => !country.isCustom).map((country) => country.id).sort();
  const usedColors = (id: string) => new Set(
    [...neighbors.get(id)!].map((neighbor) => colors.get(neighbor)).filter((color) => color !== undefined),
  );

  // Establish the preview's named countries first, then color the most
  // constrained neighbors. Stable ties make data ordering irrelevant.
  while (remaining.length > 0) {
    let nextIndex = 0;
    let priority = -1;
    let saturation = -1;
    let degree = -1;
    remaining.forEach((id, index) => {
      const nextSaturation = usedColors(id).size;
      const nextDegree = neighbors.get(id)!.size;
      const nextPriority = politicalCountryColors.has(id) ? 1 : 0;
      if (nextPriority > priority || (nextPriority === priority && (
        nextSaturation > saturation || (nextSaturation === saturation && nextDegree > degree)
      ))) {
        nextIndex = index;
        priority = nextPriority;
        saturation = nextSaturation;
        degree = nextDegree;
      }
    });
    const [id] = remaining.splice(nextIndex, 1);
    const used = usedColors(id);
    const preferred = politicalCountryColors.get(id)
      ?? Array.from(id).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % politicalPalette.length;
    const color = Array.from({ length: politicalPalette.length }, (_, offset) =>
      politicalPalette[(preferred + offset) % politicalPalette.length],
    ).find((candidate) => !used.has(candidate));
    if (!color) throw new Error("The political map palette cannot separate neighboring countries.");
    colors.set(id, color);
  }

  return {
    ...data,
    countries: data.countries.map((country) => {
      if (country.isCustom) return country;
      return { ...country, color: colors.get(country.id)! };
    }),
  };
}
