import { describe, expect, it } from "vitest";
import mapDataFixture from "../public/data/map-data.json";

import { applyPoliticalMapPalette, getAdministrativeBorderZoomClass, getCountryBorderStrokeWidth } from "./mapVisualStyle";

import { applyScenarioPayload, createInitialSnapshot, createScenarioPayload } from "./state";
import type { MapData } from "./types";

describe("map visual style helpers", () => {
  it("keeps administrative borders quiet at low or invalid zoom", () => {
    expect(getAdministrativeBorderZoomClass(1)).toBe("map-admin-borders-default");
    expect(getAdministrativeBorderZoomClass(2.39)).toBe("map-admin-borders-default");
    expect(getAdministrativeBorderZoomClass(Number.NaN)).toBe("map-admin-borders-default");
    expect(getAdministrativeBorderZoomClass(Number.POSITIVE_INFINITY)).toBe("map-admin-borders-default");
  });

  it("uses stronger administrative borders at close zoom", () => {
    expect(getAdministrativeBorderZoomClass(2.4)).toBe("map-admin-borders-close");
    expect(getAdministrativeBorderZoomClass(5.49)).toBe("map-admin-borders-close");
  });

  it("uses the strongest administrative borders at detail zoom", () => {
    expect(getAdministrativeBorderZoomClass(5.5)).toBe("map-admin-borders-detail");
    expect(getAdministrativeBorderZoomClass(30)).toBe("map-admin-borders-detail");
  });

  it("keeps borders strong at world scale and below two pixels at detail scale", () => {
    expect(getCountryBorderStrokeWidth(0.8)).toBe(1.55);
    expect(getCountryBorderStrokeWidth(1)).toBe(1.55);
    expect(getCountryBorderStrokeWidth(3)).toBeGreaterThan(1);
    expect(getCountryBorderStrokeWidth(5.5)).toBeGreaterThan(getCountryBorderStrokeWidth(1.5));
    expect(getCountryBorderStrokeWidth(30)).toBe(1.8);
    expect(getCountryBorderStrokeWidth(Number.NaN)).toBe(1.55);
  });
});

describe("neighboring country colors", () => {
  const data = mapDataFixture as unknown as MapData;

  it("gives every pair of countries with a shared border different palette colors", () => {
    const styled = applyPoliticalMapPalette(data);
    const countries = new Map(styled.countries.map((country) => [country.id, country]));
    const owners = new Map(styled.countries.flatMap((country) =>
      country.regionIds.map((id) => [id, country.id] as const),
    ));
    const pairs = new Set<string>();
    for (const { regionIds: [first, second] } of data.boundaryEdges) {
      const a = owners.get(first);
      const b = second ? owners.get(second) : undefined;
      if (!a || !b || a === b) continue;
      pairs.add([a, b].sort().join(":"));
      expect(countries.get(a)!.color, `${a} borders ${b}`).not.toBe(countries.get(b)!.color);
    }
    expect(pairs.size).toBeGreaterThan(300);
    expect(new Set(styled.countries.map((country) => country.color)).size).toBeLessThanOrEqual(6);
    expect(countries.get("FRA")!.color).toBe("#7a8eaa");
    expect(countries.get("DEU")!.color).toBe("#85887b");
    expect(countries.get("RUS")!.color).not.toBe(countries.get("CHN")!.color);
    expect(countries.get("FIN")!.color).not.toBe(countries.get("NOR")!.color);
  });

  it("keeps assignments stable when countries and boundaries are reordered", () => {
    const colors = (input: MapData) => Object.fromEntries(
      applyPoliticalMapPalette(input).countries.map((country) => [country.id, country.color]),
    );
    expect(colors({ ...data, countries: [...data.countries].reverse(), boundaryEdges: [...data.boundaryEdges].reverse() }))
      .toEqual(colors(data));
  });
});


describe("Political Command scenario compatibility", () => {
  const originalData: MapData = {
    version: 1, attribution: "Test data", baseCountries: [], boundaryEdges: [], regions: [],
    countries: [
      { id: "FRA", name: "France", color: "#123456", flag: { kind: "builtin", id: "fr" }, regionIds: [] },
      { id: "DEU", name: "Germany", color: "#654321", flag: { kind: "builtin", id: "de" }, regionIds: [] },
    ],
  };

  it("uses the new defaults without creating share changes or mutating bundled data", () => {
    const styled = applyPoliticalMapPalette(originalData);
    expect(styled.countries[0].color).toBe("#7a8eaa");
    expect(styled.countries[1].color).toBe("#85887b");
    expect(originalData.countries[0].color).toBe("#123456");
    expect(createScenarioPayload(styled, createInitialSnapshot(styled)).entityChanges).toEqual({});
  });

  it("preserves a legacy scenario's explicit color when it is opened and shared again", () => {
    const oldSnapshot = createInitialSnapshot(originalData);
    oldSnapshot.entities.FRA = { ...oldSnapshot.entities.FRA, name: "New France", color: "#f030a0" };
    const oldPayload = createScenarioPayload(originalData, oldSnapshot);
    const styled = applyPoliticalMapPalette(originalData);
    const restored = applyScenarioPayload(styled, oldPayload);
    expect(restored.entities.FRA.color).toBe("#f030a0");
    expect(restored.entities.FRA.name).toBe("New France");
    expect(restored.entities.DEU.color).toBe("#85887b");
    const sharedAgain = applyScenarioPayload(styled, createScenarioPayload(styled, restored));
    expect(sharedAgain.entities.FRA).toEqual(restored.entities.FRA);
  });
});
