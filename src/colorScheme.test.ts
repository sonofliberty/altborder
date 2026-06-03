import { describe, expect, it } from "vitest";
import colorScheme from "./color-scheme.json";
import {
  customCountryAccentColor,
  getCountryColor,
  getFallbackCountryColor,
  isHexColor,
  normalizeCountryColorName,
} from "./colorScheme";

describe("country color scheme", () => {
  it("keeps runtime color constants in sync with the generated color scheme", () => {
    expect(customCountryAccentColor).toBe(colorScheme.customCountryAccentColor);
    for (const [index, color] of colorScheme.fallbackPalette.entries()) {
      expect(getFallbackCountryColor(`runtime-palette-${index}`)).toBe(
        colorScheme.fallbackPalette[hashString(`runtime-palette-${index}`) % colorScheme.fallbackPalette.length],
      );
      expect(isHexColor(color)).toBe(true);
    }
  });

  it("returns curated colors by country id", () => {
    expect(getCountryColor({ id: "ALB", name: "Albania" })).toBe("#B95757");
    expect(getCountryColor({ id: "USA", name: "United States" })).toBe("#4F76A8");
    expect(getCountryColor({ id: "DEU", name: "Germany" })).toBe("#626B5C");
    expect(getCountryColor({ id: "AUT", name: "Austria" })).toBe("#C9C7BD");
    expect(getCountryColor({ id: "BEL", name: "Belgium" })).toBe("#D2B34C");
    expect(getCountryColor({ id: "BGR", name: "Bulgaria" })).toBe("#6FA16A");
    expect(getCountryColor({ id: "CZE", name: "Czechia" })).toBe("#5F86B3");
    expect(getCountryColor({ id: "HRV", name: "Croatia" })).toBe("#C77A93");
    expect(getCountryColor({ id: "GBR", name: "United Kingdom" })).toBe("#7B5FA8");
    expect(getCountryColor({ id: "LUX", name: "Luxembourg" })).toBe("#8FB7D6");
    expect(getCountryColor({ id: "RUS", name: "Russia" })).toBe("#C8645C");
  });

  it("returns curated colors by normalized names and aliases", () => {
    expect(getCountryColor({ name: "United States of America" })).toBe("#4F76A8");
    expect(getCountryColor({ name: "Unknown", aliases: ["South Africa"] })).toBe("#8A8F62");
    expect(getCountryColor({ name: "Czech Republic" })).toBe("#5F86B3");
    expect(normalizeCountryColorName("Cote d'Ivoire")).toBe("cotedivoire");
  });

  it("returns deterministic valid fallback colors", () => {
    const first = getFallbackCountryColor("NE-999");
    const second = getFallbackCountryColor("NE-999");

    expect(first).toBe(second);
    expect(isHexColor(first)).toBe(true);
  });

  it("keeps fallback colors varied across nearby ids", () => {
    const colors = ["NE-101", "NE-102", "NE-103", "NE-104", "NE-105", "NE-106"].map((id) =>
      getFallbackCountryColor(id),
    );

    expect(new Set(colors).size).toBeGreaterThan(3);
  });
});

function hashString(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}
