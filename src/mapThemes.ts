import { isHexColor } from "./colorRuntime";
import type { CountryEntity, EditorSnapshot, MapData, MapThemeId } from "./types";

export const DEFAULT_MAP_THEME: MapThemeId = "hoi4";

type MapTheme = {
  id: MapThemeId;
  name: string;
  sea: string;
  coast: string;
  border: string;
  region: string;
  ink: string;
  halo: string;
  font: string;
  weight: number;
  relief: number;
  colors: Readonly<Record<string, string>>;
  fallbackColors: readonly string[];
};

// The approved Europe study supplies each named country's color. Remaining
// countries use a stable adjacency palette in the same visual range.
export const MAP_THEMES: Readonly<Record<MapThemeId, MapTheme>> = {
  hoi4: {
    id: "hoi4", name: "Hearts of Iron IV", sea: "#253248", coast: "#7088a9",
    border: "#202630", region: "#10151b", ink: "#202731", halo: "#d8d9d3",
    font: "Barlow", weight: 600, relief: 0.85,
    colors: {
      DEU: "#555856", FRA: "#53779b", GBR: "#92596b", IRL: "#506c51",
      ESP: "#a99b66", PRT: "#4b695c", ITA: "#52755a", CHE: "#925953",
      AUT: "#a7a6a0", BEL: "#9c9562", NLD: "#a78c6d", LUX: "#766f84",
      POL: "#99738b", CZE: "#727d95", SVK: "#867384", HUN: "#a07d6d",
      DNK: "#81635f", NOR: "#5a6469", SWE: "#597c9b", FIN: "#929da5",
      UKR: "#9b9872", BLR: "#6c7057", ROU: "#a49c6b", SVN: "#6d7a66",
      HRV: "#637980", BIH: "#838067", SRB: "#80756f", MNE: "#895a5b",
      ALB: "#815354", GRC: "#628191", TUR: "#97907a", LTU: "#a59e75",
      LVA: "#79697b", EST: "#728782", RUS: "#7f585c",
    },
    fallbackColors: ["#777c6b", "#53779b", "#99738b", "#a99b66", "#52755a", "#766f84", "#a07d6d", "#929da5"],
  },
  eu4: {
    id: "eu4", name: "Europa Universalis IV", sea: "#548798", coast: "#bee2d5",
    border: "#4c4b41", region: "#4b4d40", ink: "#172324", halo: "#f1e4b7",
    font: "Cinzel", weight: 500, relief: 0.15,
    colors: {
      DEU: "#9db6bb", FRA: "#547bd1", GBR: "#d65f58", IRL: "#72a64d",
      ESP: "#ebcc55", PRT: "#479b77", ITA: "#52ac79", CHE: "#ab3f48",
      AUT: "#e9dfb6", BEL: "#d8b344", NLD: "#e09342", LUX: "#b795bf",
      POL: "#dd8dad", CZE: "#bfab61", SVK: "#89b899", HUN: "#bc7d61",
      DNK: "#b86054", NOR: "#c191b5", SWE: "#58a2d0", FIN: "#d6d8bd",
      UKR: "#dfc65b", BLR: "#89b970", ROU: "#d9b957", SVN: "#839c51",
      HRV: "#839ed1", BIH: "#bdad66", SRB: "#c9a183", MNE: "#9775a6",
      ALB: "#b14950", GRC: "#6ba1cd", TUR: "#6bb87a", LTU: "#b07599",
      LVA: "#bdab69", EST: "#77aaa1", RUS: "#7aa34d",
    },
    fallbackColors: ["#c5bc8b", "#547bd1", "#dd8dad", "#ebcc55", "#52ac79", "#b795bf", "#bc7d61", "#9db6bb"],
  },
};

export function isMapThemeId(value: unknown): value is MapThemeId {
  return value === "hoi4" || value === "eu4";
}

export function getMapTheme(id: MapThemeId | undefined): MapTheme {
  return MAP_THEMES[id ?? DEFAULT_MAP_THEME];
}

export function setMapTheme(snapshot: EditorSnapshot, id: MapThemeId): EditorSnapshot {
  if ((snapshot.mapTheme ?? DEFAULT_MAP_THEME) === id) return snapshot;
  return { ...snapshot, mapTheme: id };
}

/** Record an explicit pick even when it matches the country's stored default. */
export function setEntityColor(snapshot: EditorSnapshot, entityId: string, color: string): EditorSnapshot {
  const entity = Object.prototype.hasOwnProperty.call(snapshot.entities, entityId) ? snapshot.entities[entityId] : undefined;
  if (!entity || !isHexColor(color) || (entity.color === color && entity.colorIsCustom)) return snapshot;
  return {
    ...snapshot,
    entities: { ...snapshot.entities, [entityId]: { ...entity, color, colorIsCustom: true } },
  };
}

const paletteCache = new WeakMap<MapData, Map<MapThemeId, ReadonlyMap<string, string>>>();

function getDefaultColors(data: MapData, theme: MapTheme): ReadonlyMap<string, string> {
  let themes = paletteCache.get(data);
  if (!themes) {
    themes = new Map();
    paletteCache.set(data, themes);
  }
  const cached = themes.get(theme.id);
  if (cached) return cached;

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

  const colors = new Map<string, string>();
  for (const country of data.countries) {
    if (country.isCustom) colors.set(country.id, country.color.toLowerCase());
    else if (Object.prototype.hasOwnProperty.call(theme.colors, country.id)) colors.set(country.id, theme.colors[country.id]);
  }
  const remaining = data.countries.filter((country) => !colors.has(country.id)).map((country) => country.id).sort();
  const usedColors = (id: string) => new Set([...neighbors.get(id)!]
    .map((neighbor) => colors.get(neighbor)).filter((color) => color !== undefined));
  while (remaining.length) {
    let nextIndex = 0;
    let saturation = -1;
    let degree = -1;
    remaining.forEach((id, index) => {
      const nextSaturation = usedColors(id).size;
      const nextDegree = neighbors.get(id)!.size;
      if (nextSaturation > saturation || (nextSaturation === saturation && nextDegree > degree)) {
        nextIndex = index;
        saturation = nextSaturation;
        degree = nextDegree;
      }
    });
    const [id] = remaining.splice(nextIndex, 1);
    const used = usedColors(id);
    const preferred = Array.from(id).reduce((sum, letter) => sum + letter.charCodeAt(0), 0) % theme.fallbackColors.length;
    const color = Array.from({ length: theme.fallbackColors.length }, (_, offset) =>
      theme.fallbackColors[(preferred + offset) % theme.fallbackColors.length],
    ).find((candidate) => !used.has(candidate));
    if (!color) throw new Error("The map theme cannot separate neighboring countries.");
    colors.set(id, color);
  }
  themes.set(theme.id, colors);
  return colors;
}

/**
 * Derive display colors from the immutable map baseline. Store only user colors
 * in scenario state so a theme switch never overwrites an edit or changes land.
 * `data` is the same canonical data used by createInitialSnapshot.
 */
export function getThemedEntities(data: MapData, snapshot: EditorSnapshot): Record<string, CountryEntity> {
  const colors = getDefaultColors(data, getMapTheme(snapshot.mapTheme));
  const baseById = new Map(data.countries.map((country) => [country.id, country]));
  return Object.fromEntries(Object.entries(snapshot.entities).map(([id, entity]) => {
    const base = baseById.get(id);
    const hasExplicitColor = entity.colorIsCustom || !base || entity.color.toLowerCase() !== base.color.toLowerCase();
    const color = colors.get(id);
    if (entity.isCustom || hasExplicitColor || !color || color === entity.color) return [id, entity];
    return [id, { ...entity, color }];
  }));
}
