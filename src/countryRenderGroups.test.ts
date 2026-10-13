import { describe, expect, it } from "vitest";
import data from "../public/data/map-data.json";
import { getCompleteBaseCountryGroups } from "./countryRenderGroups";

const baseEntities = new Map(data.countries.map((country) => [country.id, country]));
const baseOwners = new Map(data.countries.flatMap((country) => country.regionIds.map((id) => [id, country.id] as const)));

describe("complete country fills after annexation", () => {
  it("keeps Germany's complete shape when it acquires a custom region", () => {
    const germany = baseEntities.get("DEU")!;
    const groups = getCompleteBaseCountryGroups([...germany.regionIds, "CUSTOM_001-ELSASS"], baseEntities, baseOwners);
    expect(groups.get("DEU")).toEqual(germany.regionIds);
    expect(groups.size).toBe(1);
  });

  it("does not restore a subdivision that Germany transferred away", () => {
    const germany = baseEntities.get("DEU")!;
    const groups = getCompleteBaseCountryGroups([...germany.regionIds.slice(1), "CUSTOM_001-ELSASS"], baseEntities, baseOwners);
    expect(groups.has("DEU")).toBe(false);
  });

  it("uses both complete shapes after annexing a whole original country", () => {
    const regions = [...baseEntities.get("DEU")!.regionIds, ...baseEntities.get("FRA")!.regionIds];
    expect([...getCompleteBaseCountryGroups(regions, baseEntities, baseOwners).keys()]).toEqual(["DEU", "FRA"]);
  });
});
