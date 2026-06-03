import { describe, expect, it } from "vitest";
import mapDataFixture from "../public/data/map-data.json";
import colorScheme from "./color-scheme.json";
import { buildSelectedRegionAdjacency } from "./regionAdjacency";
import type { Geometry, MultiPolygon, Polygon, Position } from "geojson";
import type { MapData, RegionRecord } from "./types";

const requestedAdm1Countries = [
  "GBR",
  "CHE",
  "DNK",
  "FIN",
  "ISL",
  "IRL",
  "NOR",
  "SWE",
  "CZE",
  "CHL",
  "COL",
  "ECU",
  "GUY",
  "PER",
  "SUR",
  "VEN",
  "BOL",
  "PRY",
  "URY",
  "BLR",
  "UKR",
  "EST",
  "LVA",
  "LTU",
  "ROU",
  "HUN",
  "BGR",
  "GRC",
  "ALB",
  "ARM",
  "AZE",
  "BIH",
  "HRV",
  "CYP",
  "GEO",
  "XKX",
  "MKD",
  "MDA",
  "MNE",
  "PRT",
  "SRB",
  "SVK",
  "SVN",
  "BRN",
  "KHM",
  "IDN",
  "LAO",
  "MYS",
  "MMR",
  "PHL",
  "THA",
  "TLS",
  "VNM",
  "PRK",
  "KOR",
  "KAZ",
  "MNG",
  "BHR",
  "IRQ",
  "ISR",
  "JOR",
  "KWT",
  "LBN",
  "OMN",
  "PSE",
  "QAT",
  "SYR",
  "ARE",
  "YEM",
];

describe("generated ADM1 coverage", () => {
  it("includes requested countries with generated ADM1 coverage", () => {
    const data = mapDataFixture as MapData;

    for (const countryId of requestedAdm1Countries) {
      const country = data.countries.find((entry) => entry.id === countryId);
      const regions = data.regions.filter((region) => country?.regionIds.includes(region.id));

      expect(country, countryId).toBeDefined();
      expect(regions.length, countryId).toBeGreaterThan(1);
      expect(country?.regionIds, countryId).toHaveLength(regions.length);
    }
  });

  it("clips coastal administrative regions to land instead of offshore water", () => {
    const data = mapDataFixture as MapData;
    const crimea = data.regions.find((region) => region.id === "UKR-UA-43");

    expect(crimea?.name).toBe("Autonomous Republic of Crimea");
    if (!crimea || !isPolygonalGeometry(crimea.geometry)) {
      throw new Error("Crimea must have polygonal geometry");
    }
    expect(polygonalArea(crimea.geometry)).toBeGreaterThan(2.5);
    expect(polygonalArea(crimea.geometry)).toBeLessThan(3.5);
  });

  it("keeps Russia ADM1 geometry from acquiring horizontal land-mask strips", () => {
    const data = mapDataFixture as MapData;
    const sakha = data.regions.find((region) => region.id === "RUS-RU-SA");

    expect(sakha?.name).toBe("Sakha Republic");
    if (!sakha || !isPolygonalGeometry(sakha.geometry)) {
      throw new Error("Sakha Republic must have polygonal geometry");
    }

    expect(hasLongHorizontalExteriorSegment(sakha.geometry)).toBe(false);
  });

  it("emits polygonal map geometry without degenerate rings", () => {
    const data = mapDataFixture as MapData;
    const degenerateRings = [];

    for (const region of data.regions) {
      if (isPolygonalGeometry(region.geometry)) {
        degenerateRings.push(...degeneratePolygonRingIds(region.id, region.geometry));
      }
    }
    for (const country of data.baseCountries) {
      if (isPolygonalGeometry(country.geometry)) {
        degenerateRings.push(...degeneratePolygonRingIds(country.entityId, country.geometry));
      }
    }

    expect(degenerateRings).toEqual([]);
  });

  it("generates shared subdivision border linework for multi-region countries", () => {
    const data = mapDataFixture as MapData;
    const regionIds = new Set(data.regions.map((region) => region.id));
    const baseOwnerByRegionId = new Map<string, string>();
    for (const country of data.countries) {
      for (const regionId of country.regionIds) {
        baseOwnerByRegionId.set(regionId, country.id);
      }
    }

    expect(data.subdivisionBorders.length).toBeGreaterThan(3000);
    expect(data.subdivisionBorders.filter((border) => border.ownerId === "DEU").length).toBeGreaterThan(20);
    expect(data.subdivisionBorders.filter((border) => border.ownerId === "FRA").length).toBeGreaterThan(15);
    expect(data.subdivisionBorders.filter((border) => border.ownerId === "POL").length).toBeGreaterThan(20);
    expect(data.subdivisionBorders.filter((border) => border.ownerId === "ROU").length).toBeGreaterThan(80);
    expect(data.subdivisionBorders.filter((border) => border.ownerId === "RUS").length).toBeGreaterThan(150);
    expect(data.subdivisionBorders.filter((border) => border.ownerId === "USA").length).toBeGreaterThan(90);
    expect(data.subdivisionBorders.filter((border) => border.ownerId === "BRA").length).toBeGreaterThan(40);
    expect(
      data.subdivisionBorders.filter((border) => border.ownerId === "BRA" && border.regionIds.includes("BRA-BR-RR")),
    ).toHaveLength(2);
    expect(data.subdivisionBorders.filter((border) => border.ownerId === "CAN")).toEqual([]);

    for (const border of data.subdivisionBorders) {
      const [firstRegionId, secondRegionId] = border.regionIds;
      expect(regionIds.has(firstRegionId), border.id).toBe(true);
      expect(regionIds.has(secondRegionId), border.id).toBe(true);
      expect(baseOwnerByRegionId.get(firstRegionId), border.id).toBe(border.ownerId);
      expect(baseOwnerByRegionId.get(secondRegionId), border.id).toBe(border.ownerId);
      expect(["LineString", "MultiLineString"], border.id).toContain(border.geometry.type);
    }
  });

  it("repairs mojibake in generated administrative region names", () => {
    const data = mapDataFixture as MapData;
    const portugal = data.countries.find((country) => country.id === "PRT");
    const portugalRegionNames = data.regions
      .filter((region) => portugal?.regionIds.includes(region.id))
      .map((region) => region.name);

    expect(portugalRegionNames).toContain("ÉVORA");
    expect(portugalRegionNames).toContain("Região Autónoma dos Açores");
    expect(portugalRegionNames.some((name) => name.includes("Ã"))).toBe(false);
  });

  it("keeps fallback-colored countries from matching bordering countries", () => {
    const data = mapDataFixture as MapData;
    const countriesById = new Map(data.countries.map((country) => [country.id, country]));
    const fallbackCountryIds = new Set(
      data.countries.filter((country) => countryUsesFallbackColor(country.id, country.name)).map((country) => country.id),
    );
    const adjacency = buildRegionAdjacency(
      countryBoundaryRecords(data).filter((country) => countriesById.has(country.ownerId)),
    );
    const conflicts = [];

    for (const countryId of fallbackCountryIds) {
      const country = countriesById.get(countryId);
      if (!country) continue;

      for (const neighborId of adjacency.get(countryId) ?? []) {
        const neighbor = countriesById.get(neighborId);
        if (neighbor && country.color === neighbor.color) {
          conflicts.push(`${country.name} / ${neighbor.name}: ${country.color}`);
        }
      }
    }

    expect(conflicts).toEqual([]);
  }, 15_000);

  it("omits duplicated base geometry for one-region fallback countries", () => {
    const data = mapDataFixture as MapData;
    const countriesById = new Map(data.countries.map((country) => [country.id, country]));
    const missingBaseCountryIds = data.countries
      .filter((country) => country.regionIds.length === 1)
      .map((country) => country.id)
      .filter((countryId) => !data.baseCountries.some((baseCountry) => baseCountry.entityId === countryId));

    expect(missingBaseCountryIds.length).toBeGreaterThan(100);
    for (const countryId of missingBaseCountryIds) {
      const country = countriesById.get(countryId);
      const region = data.regions.find((entry) => entry.id === country?.regionIds[0]);
      expect(region?.geometry, countryId).toBeDefined();
    }
  });

  it("keeps Canada as a single fallback region without ADM1 subdivisions", () => {
    const data = mapDataFixture as MapData;
    const canada = data.countries.find((country) => country.id === "CAN");
    const canadaRegion = data.regions.find((region) => region.id === "CAN-ALL");
    const adjacency = buildRegionAdjacency(countryBoundaryRecords(data));

    expect(canada?.name).toBe("Canada");
    expect(canada?.regionIds).toEqual(["CAN-ALL"]);
    expect(canadaRegion?.name).toBe("Canada");
    expect(canadaRegion?.type).toBe("Whole country fallback");
    expect(data.regions.filter((region) => region.id.startsWith("CAN-CA-"))).toEqual([]);
    expect(adjacency.get("CAN")?.has("USA")).toBe(true);
  }, 15_000);

  it("keeps Baikonur under Kazakhstan instead of listing it as a country", () => {
    const data = mapDataFixture as MapData;

    expectNonCountryRegion(data, "Baikonur", "KAZ", "KAZ-Baikonur");
  });

  it("removes obvious non-country map units from the country list", () => {
    const data = mapDataFixture as MapData;
    const hiddenMapUnits = ["Bajo Nuevo Bank", "Serranilla Bank", "Scarborough Reef", "Spratly Is."];

    for (const name of hiddenMapUnits) {
      expect(data.countries.some((country) => country.name === name), name).toBe(false);
      expect(data.regions.some((region) => region.name === name), name).toBe(false);
    }

    expectNonCountryRegion(data, "Siachen Glacier", "IND", "IND-Siachen-Glacier");
    expectNonCountryRegion(
      data,
      "Cyprus U.N. Buffer Zone",
      "CYP",
      "CYP-Cyprus-U-N-Buffer-Zone",
    );
    expectNonCountryRegion(data, "USNB Guantanamo Bay", "NE-192", "NE-192-USNB-Guantanamo-Bay");
    expectNonCountryRegion(data, "Akrotiri", "GBR", "GBR-Akrotiri");
    expectNonCountryRegion(data, "Dhekelia", "GBR", "GBR-Dhekelia");
    expectNonCountryRegion(data, "Coral Sea Is.", "AUS", "AUS-Coral-Sea-Is");
    expectNonCountryRegion(data, "Ashmore and Cartier Is.", "AUS", "AUS-Ashmore-and-Cartier-Is");
    expectNonCountryRegion(data, "Heard I. and McDonald Is.", "AUS", "AUS-Heard-I-and-McDonald-Is");
    expectNonCountryRegion(data, "Norfolk Island", "AUS", "AUS-Norfolk-Island");
    expectNonCountryRegion(data, "Indian Ocean Ter.", "AUS", "AUS-Indian-Ocean-Ter");
    expectNonCountryRegion(data, "Clipperton I.", "FRA", "FRA-Clipperton-I");
    expectNonCountryRegion(data, "Br. Indian Ocean Ter.", "GBR", "GBR-Br-Indian-Ocean-Ter");
    expectNonCountryRegion(data, "Åland", "FIN", "FIN-land");
  });
});

function countryUsesFallbackColor(id: string, name: string): boolean {
  const idColor = colorScheme.curatedColorsById[id as keyof typeof colorScheme.curatedColorsById];
  const nameColor =
    colorScheme.curatedColorsByName[
      normalizeCountryColorName(name) as keyof typeof colorScheme.curatedColorsByName
    ];
  return !idColor && !nameColor;
}

function normalizeCountryColorName(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function buildRegionAdjacency(regions: RegionRecord[]): Map<string, Set<string>> {
  return buildSelectedRegionAdjacency(
    regions,
    regions.map((region) => region.id),
  );
}

function countryBoundaryRecords(data: MapData) {
  const baseCountryIds = new Set(data.baseCountries.map((country) => country.entityId));
  const countriesById = new Map(data.countries.map((country) => [country.id, country]));
  const records = data.baseCountries.map((country) => {
    const entity = countriesById.get(country.entityId);
    return {
      id: country.entityId,
      name: entity?.name ?? country.entityId,
      ownerId: country.entityId,
      type: "Country boundary",
      geometry: country.geometry as Geometry,
    };
  });

  for (const country of data.countries) {
    if (baseCountryIds.has(country.id) || country.regionIds.length !== 1) continue;
    const region = data.regions.find((entry) => entry.id === country.regionIds[0]);
    if (!region) continue;
    records.push({
      id: country.id,
      name: country.name,
      ownerId: country.id,
      type: "Fallback country boundary",
      geometry: region.geometry as Geometry,
    });
  }

  return records;
}

function expectNonCountryRegion(data: MapData, name: string, ownerId: string, regionId: string): void {
  const country = data.countries.find((entry) => entry.name === name);
  const owner = data.countries.find((entry) => entry.id === ownerId);
  const region = data.regions.find((entry) => entry.name === name);

  expect(country, name).toBeUndefined();
  expect(owner?.regionIds, name).toContain(regionId);
  expect(region, name).toMatchObject({
    id: regionId,
    type: "Non-sovereign territory",
  });
}

function isPolygonalGeometry(geometry: MapData["regions"][number]["geometry"]): geometry is Polygon | MultiPolygon {
  return geometry.type === "Polygon" || geometry.type === "MultiPolygon";
}

function polygonalArea(geometry: Polygon | MultiPolygon): number {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  return polygons.reduce((total: number, polygon: Position[][]) => {
    const shellArea = Math.abs(ringSignedArea(polygon[0] ?? []));
    const holeArea = polygon
      .slice(1)
      .reduce((sum: number, ring: Position[]) => sum + Math.abs(ringSignedArea(ring)), 0);
    return total + shellArea - holeArea;
  }, 0);
}

function hasLongHorizontalExteriorSegment(geometry: Polygon | MultiPolygon): boolean {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;

  return polygons.some((polygon) => {
    const exterior = polygon[0] ?? [];
    return exterior.some((position, index) => {
      if (index === 0) return false;
      const previous = exterior[index - 1];
      return Math.abs(position[0] - previous[0]) > 40 && Math.abs(position[1] - previous[1]) < 0.05;
    });
  });
}

function degeneratePolygonRingIds(id: string, geometry: Polygon | MultiPolygon): string[] {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const degenerateRings = [];

  for (let polygonIndex = 0; polygonIndex < polygons.length; polygonIndex += 1) {
    const polygon = polygons[polygonIndex];
    for (let ringIndex = 0; ringIndex < polygon.length; ringIndex += 1) {
      const ring = polygon[ringIndex];
      if (ring.length < 4 || Math.abs(ringSignedArea(ring)) <= 1e-12) {
        degenerateRings.push(`${id}:${polygonIndex}:${ringIndex}`);
      }
    }
  }

  return degenerateRings;
}

function ringSignedArea(ring: Position[]): number {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return area / 2;
}
