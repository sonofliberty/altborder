import { describe, expect, it } from "vitest";
import mapDataFixture from "../public/data/map-data.json";
import { applyPoliticalMapPalette } from "./mapVisualStyle";
import { DEFAULT_MAP_THEME, getMapTheme, getThemedEntities, MAP_THEMES, setEntityColor, setMapTheme } from "./mapThemes";
import { applyScenarioPayload, cloneSnapshot, createInitialSnapshot, createScenarioPayload, separateRegionAsCountry, transferRegions } from "./state";
import { decodeSharePayload, encodeSharePayload } from "./share";
import type { MapData, MapThemeId, ScenarioPayload } from "./types";

const data = applyPoliticalMapPalette(mapDataFixture as unknown as MapData);

describe("map theme display colors", () => {
  it.each<MapThemeId>(["hoi4", "eu4"])("uses the approved %s palette without changing the scenario", (themeId) => {
    const initial = createInitialSnapshot(data);
    const snapshot = setMapTheme(initial, themeId);
    const entities = getThemedEntities(data, snapshot);
    const theme = MAP_THEMES[themeId];
    for (const [id, color] of Object.entries(theme.colors)) {
      if (entities[id]) expect(entities[id].color, id).toBe(color);
    }
    expect(snapshot.entities).toBe(initial.entities);
    expect(snapshot.regionOwners).toBe(initial.regionOwners);
    expect(snapshot.customRegions).toBe(initial.customRegions);
    expect(snapshot.entities.DEU.color).toBe("#85887b");
    expect(snapshot.entities.FRA.color).toBe("#7a8eaa");
    expect(createScenarioPayload(data, snapshot).entityChanges).toEqual({});
  });

  it.each<MapThemeId>(["hoi4", "eu4"])("separates all neighboring default countries in %s", (themeId) => {
    const snapshot = setMapTheme(createInitialSnapshot(data), themeId);
    const entities = getThemedEntities(data, snapshot);
    const pairs = new Set<string>();
    for (const { regionIds: [first, second] } of data.boundaryEdges) {
      if (!second) continue;
      const a = snapshot.regionOwners[first];
      const b = snapshot.regionOwners[second];
      if (!a || !b || a === b) continue;
      pairs.add([a, b].sort().join(":"));
      expect(entities[a].color, `${a} borders ${b}`).not.toBe(entities[b].color);
    }
    expect(pairs.size).toBeGreaterThan(300);
  });

  it.each<MapThemeId>(["hoi4", "eu4"])("keeps %s colors stable when data order changes", (themeId) => {
    const reversed = { ...data, countries: [...data.countries].reverse(), boundaryEdges: [...data.boundaryEdges].reverse() };
    const colors = (input: MapData) => Object.fromEntries(Object.entries(
      getThemedEntities(input, setMapTheme(createInitialSnapshot(input), themeId)),
    ).map(([id, entity]) => [id, entity.color]));
    expect(colors(reversed)).toEqual(colors(data));
  });

  it("keeps legacy explicit colors while renamed default countries follow the theme", () => {
    const initial = createInitialSnapshot(data);
    const restored = applyScenarioPayload(data, {
      version: 1, title: "Legacy colors", customCounter: 1, regionOwnerChanges: [],
      entityChanges: {
        FRA: { ...initial.entities.FRA, name: "Renamed France" },
        DEU: { ...initial.entities.DEU, color: "#A010F0" },
      },
    });
    for (const themeId of ["hoi4", "eu4"] as const) {
      const entities = getThemedEntities(data, setMapTheme(restored, themeId));
      expect(entities.DEU.color).toBe("#A010F0");
      expect(entities.FRA.name).toBe("Renamed France");
      expect(entities.FRA.color).toBe(MAP_THEMES[themeId].colors.FRA);
    }
  });

  it("keeps a custom country's selected color even when it matches a default", () => {
    const initial = createInitialSnapshot(data);
    const regionId = initial.entities.FRA.regionIds[0];
    const result = separateRegionAsCountry(initial, regionId, "Elsass", MAP_THEMES.hoi4.colors.FRA)!;
    for (const themeId of ["hoi4", "eu4"] as const) {
      const entities = getThemedEntities(data, setMapTheme(result.snapshot, themeId));
      expect(entities[result.entityId].color).toBe(MAP_THEMES.hoi4.colors.FRA);
    }
  });

  it.each<MapThemeId>(["hoi4", "eu4"])("uses the receiving country's %s display color after whole-region transfers", (themeId) => {
    const initial = setMapTheme(createInitialSnapshot(data), themeId);
    const transferred = transferRegions(initial, ["FRA-FR-GES", "POL-PL-LB"], "DEU");
    const entities = getThemedEntities(data, transferred);
    for (const regionId of ["FRA-FR-GES", "POL-PL-LB"]) {
      expect(transferred.regionOwners[regionId]).toBe("DEU");
      expect(entities[transferred.regionOwners[regionId]].color).toBe(MAP_THEMES[themeId].colors.DEU);
    }
    expect(transferred.mapTheme).toBe(themeId);
    expect(getThemedEntities(data, initial).DEU.color).toBe(entities.DEU.color);
  });

  it("retains theme and color edits in cloned snapshots without changing earlier history", () => {
    const original = createInitialSnapshot(data);
    const themed = setMapTheme(original, "eu4");
    const edited = setEntityColor(themed, "DEU", "#013579");
    const cloned = cloneSnapshot(edited);
    expect(original.mapTheme).toBe("hoi4");
    expect(original.entities.DEU.colorIsCustom).toBeUndefined();
    expect(themed.entities.DEU.color).toBe(original.entities.DEU.color);
    expect(cloned.mapTheme).toBe("eu4");
    expect(cloned.entities.DEU).toMatchObject({ color: "#013579", colorIsCustom: true });
    expect(getThemedEntities(data, original).DEU.color).toBe(MAP_THEMES.hoi4.colors.DEU);
    expect(getThemedEntities(data, themed).DEU.color).toBe(MAP_THEMES.eu4.colors.DEU);
    expect(getThemedEntities(data, cloned).DEU.color).toBe("#013579");
    expect(setMapTheme(themed, "eu4")).toBe(themed);
  });
});

describe("shared map themes", () => {
  it("keeps EU4 and ownership through the encoded share link", async () => {
    const initial = setMapTheme(createInitialSnapshot(data), "eu4");
    const changed = transferRegions(initial, ["FRA-FR-GES", "POL-PL-LB"], "DEU");
    const payload = createScenarioPayload(data, changed);
    const decoded = await decodeSharePayload(await encodeSharePayload(payload));
    expect(payload.mapTheme).toBe("eu4");
    expect(payload.entityChanges).toEqual({});
    expect(decoded.ok).toBe(true);
    if (!decoded.ok) throw new Error(decoded.error);
    const restored = applyScenarioPayload(data, decoded.payload);
    expect(restored.mapTheme).toBe("eu4");
    expect(restored.regionOwners).toEqual(changed.regionOwners);
    expect(getThemedEntities(data, restored).DEU.color).toBe(MAP_THEMES.eu4.colors.DEU);
  });

  it("uses HOI4 for legacy links and omits the default theme from new links", async () => {
    const payload: ScenarioPayload = { version: 1, title: "Legacy map", customCounter: 1, entityChanges: {}, regionOwnerChanges: [] };
    const decoded = await decodeSharePayload(await encodeSharePayload(payload));
    expect(decoded.ok).toBe(true);
    expect(applyScenarioPayload(data, payload).mapTheme).toBe(DEFAULT_MAP_THEME);
    expect(getMapTheme(undefined).id).toBe("hoi4");
    expect(createScenarioPayload(data, createInitialSnapshot(data)).mapTheme).toBeUndefined();
  });

  it.each(["invalid", "HOI4", "", null, 2, {}])("rejects an invalid shared theme: %j", async (mapTheme) => {
    const payload = { ...createScenarioPayload(data, createInitialSnapshot(data)), mapTheme } as unknown as ScenarioPayload;
    await expect(decodeSharePayload(await encodeSharePayload(payload))).resolves.toEqual({ ok: false, error: "The shared map link is invalid." });
  });

  it("keeps explicit colors that match the canonical palette after sharing and theme changes", async () => {
    const initial = createInitialSnapshot(data);
    const edited = setEntityColor(initial, "FRA", initial.entities.FRA.color);
    const payload = createScenarioPayload(data, edited);
    expect(payload.entityChanges.FRA.colorIsCustom).toBe(true);
    const decoded = await decodeSharePayload(await encodeSharePayload(payload));
    if (!decoded.ok) throw new Error(decoded.error);
    const restored = setMapTheme(applyScenarioPayload(data, decoded.payload), "eu4");
    expect(getThemedEntities(data, restored).FRA.color).toBe(initial.entities.FRA.color);
  });

  it("rejects malformed explicit color markers", async () => {
    const initial = createInitialSnapshot(data);
    const payload = createScenarioPayload(data, setEntityColor(initial, "FRA", "#ff0000"));
    payload.entityChanges.FRA.colorIsCustom = "yes" as unknown as boolean;
    await expect(decodeSharePayload(await encodeSharePayload(payload))).resolves.toEqual({ ok: false, error: "The shared map link is invalid." });
  });
});
