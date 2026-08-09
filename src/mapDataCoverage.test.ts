import { describe, expect, it } from "vitest";
import { geoArea } from "d3-geo";
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
const flagAssetPaths = new Set(Object.keys(import.meta.glob("../public/flags/4x3/*.svg")));

describe("country flag coverage", () => {
  it("assigns a bundled flag asset to every base country", () => {
    const data = mapDataFixture as MapData;

    expect(data.countries).toHaveLength(237);
    for (const country of data.countries) {
      expect(country.flag?.kind, country.id).toBe("builtin");
      if (country.flag?.kind !== "builtin") continue;
      expect(
        flagAssetPaths.has(`../public/flags/4x3/${country.flag.id}.svg`),
        `${country.id}:${country.flag.id}`,
      ).toBe(true);
    }
    expect(flagAssetPaths.has("../public/flags/4x3/neutral.svg")).toBe(true);
  });

  it("uses explicit flag mappings for special map entities", () => {
    const data = mapDataFixture as MapData;
    const flags = new Map(data.countries.map((country) => [country.id, country.flag]));

    expect(flags.get("XKX")).toEqual({ kind: "builtin", id: "xk" });
    expect(flags.get("NE-N-Cyprus")).toEqual({ kind: "builtin", id: "northern-cyprus" });
    expect(flags.get("NE-Somaliland")).toEqual({ kind: "builtin", id: "somaliland" });
  });
});

describe("generated ADM1 coverage", () => {
  it("keeps every base country smaller than half the sphere", () => {
    const data = mapDataFixture as MapData;
    for (const country of data.baseCountries) {
      expect(geoArea(country.geometry), country.entityId).toBeLessThan(2 * Math.PI);
    }
  });

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

  it("generates complete shared boundary linework", () => {
    const data = mapDataFixture as MapData;
    const regionIds = new Set(data.regions.map((region) => region.id));
    const edgeIds = new Set<string>();
    const segmentKeys = new Set<string>();
    const duplicateEdgeIds: string[] = [];
    const duplicateSegments: string[] = [];
    const invalidEdges: string[] = [];
    const polarCoastlineClosures: string[] = [];

    expect(data.version).toBe(2);
    expect(data.boundaryEdges.filter((edge) => edge.id.startsWith("internal:")).length).toBeGreaterThan(3100);
    expect(data.boundaryEdges.filter((edge) => edge.id.startsWith("country:")).length).toBeGreaterThan(200);
    expect(data.boundaryEdges.filter((edge) => edge.id.startsWith("coast:")).length).toBeGreaterThan(200);
    expect(data.boundaryEdges.some((edge) => edge.regionIds.includes("BRA-BR-RR"))).toBe(true);

    for (const edge of data.boundaryEdges) {
      const [firstRegionId, secondRegionId] = edge.regionIds;
      if (edgeIds.has(edge.id)) duplicateEdgeIds.push(edge.id);
      edgeIds.add(edge.id);
      if (
        !regionIds.has(firstRegionId) ||
        (secondRegionId !== null && !regionIds.has(secondRegionId)) ||
        !["LineString", "MultiLineString"].includes(edge.geometry.type) ||
        !linealPartsHaveLength(edge.geometry) ||
        (secondRegionId !== null && edge.regionIds.join(":") !== [...edge.regionIds].sort().join(":"))
      ) {
        invalidEdges.push(edge.id);
      }
      const lines = edge.geometry.type === "LineString" ? [edge.geometry.coordinates] : edge.geometry.coordinates;
      for (const line of lines) {
        for (let index = 1; index < line.length; index += 1) {
          const previous = line[index - 1];
          const position = line[index];
          const key = boundarySegmentKey(previous, position);
          if (segmentKeys.has(key)) duplicateSegments.push(`${edge.id}:${key}`);
          segmentKeys.add(key);
          if (
            secondRegionId === null &&
            Math.min(previous[1], position[1]) > 60 &&
            ((Math.abs(previous[0] - position[0]) > 5 &&
              Math.abs(previous[1] - position[1]) < 0.1) ||
              (Math.abs(previous[0] - position[0]) > 1.5 &&
                Math.abs(previous[1] - position[1]) < 0.011))
          ) {
            polarCoastlineClosures.push(`${edge.id}:${key}`);
          }
        }
      }
    }

    expect(duplicateEdgeIds).toEqual([]);
    expect(duplicateSegments).toEqual([]);
    expect(invalidEdges).toEqual([]);
    expect(polarCoastlineClosures).toEqual([]);
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

function linealPartsHaveLength(geometry: MapData["boundaryEdges"][number]["geometry"]): boolean {
  const lines = geometry.type === "LineString" ? [geometry.coordinates] : geometry.coordinates;
  return lines.every((line) => line.length >= 2 && lineLength(line) > 1e-6);
}

function lineLength(line: Position[]): number {
  return line.slice(1).reduce((total, point, index) => {
    const previous = line[index];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
}

function boundarySegmentKey(first: Position, second: Position): string {
  const firstKey = `${first[0]},${first[1]}`;
  const secondKey = `${second[0]},${second[1]}`;
  return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
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
