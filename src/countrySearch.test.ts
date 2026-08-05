import { describe, expect, it } from "vitest";
import { filterCountryOptions } from "./countrySearch";

const countries = [
  { id: "ARG", name: "Argentina" },
  { id: "BRA", name: "Brazil" },
  { id: "CIV", name: "Côte d'Ivoire" },
  { id: "FRA", name: "France" },
];

describe("filterCountryOptions", () => {
  it("matches country names and ids without case sensitivity", () => {
    expect(filterCountryOptions(countries, "bra")).toEqual([{ id: "BRA", name: "Brazil" }]);
    expect(filterCountryOptions(countries, "civ")).toEqual([{ id: "CIV", name: "Côte d'Ivoire" }]);
  });

  it("matches names without requiring diacritics", () => {
    expect(filterCountryOptions(countries, "cote")).toEqual([{ id: "CIV", name: "Côte d'Ivoire" }]);
  });

  it("shows the ordered list when the current selected name is displayed", () => {
    expect(filterCountryOptions(countries, "Brazil", "BRA", 2)).toEqual(countries.slice(0, 2));
  });

  it("respects the result limit", () => {
    expect(filterCountryOptions(countries, "", "", 3)).toHaveLength(3);
  });
});
