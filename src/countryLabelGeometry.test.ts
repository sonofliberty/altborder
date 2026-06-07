import { describe, expect, it } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import type { Geometry, Position } from "geojson";
import mapDataFixture from "../public/data/map-data.json";
import { subtractGeoJsonGeometries, unionGeoJsonGeometriesClosingGaps } from "./geometrySplit";
import { getCountryLabelGeometries, getCountryLabelGeometry } from "./countryLabelGeometry";
import type { MapData } from "./types";
import { layoutCountryLabel } from "./labelLayout";

describe("getCountryLabelGeometries", () => {
  it("uses the base country geometry when a base country owns transferred regions", () => {
    const data = mapDataFixture as MapData;
    const germany = data.countries.find((country) => country.id === "DEU");
    const france = data.countries.find((country) => country.id === "FRA");
    const germanyBase = data.baseCountries.find((country) => country.entityId === "DEU");
    const transferredRegionId = france?.regionIds[0];
    if (!germany || !france || !germanyBase || !transferredRegionId) {
      throw new Error("Missing fixture records");
    }

    const regionById = new Map(data.regions.map((region) => [region.id, region]));
    const regionIds = [...germany.regionIds, transferredRegionId];
    const geometries = getCountryLabelGeometries({
      baseCountryByEntityId: new Map(data.baseCountries.map((country) => [country.entityId, country])),
      baseEntityById: new Map(data.countries.map((country) => [country.id, country])),
      baseOwnerByRegionId: new Map(
        data.countries.flatMap((country) => country.regionIds.map((regionId) => [regionId, country.id])),
      ),
      entityId: germany.id,
      fallbackGeometries: regionIds
        .map((regionId) => regionById.get(regionId)?.geometry)
        .filter((geometry): geometry is NonNullable<typeof geometry> => Boolean(geometry)),
      regionById,
      regionIds,
      subtractGeoJsonGeometries,
      unionGeoJsonGeometriesClosingGaps,
    });

    expect(geometries).toHaveLength(1);
  });

  it("fits Germany's label against Germany after it owns a transferred region", () => {
    const data = mapDataFixture as MapData;
    const germany = data.countries.find((country) => country.id === "DEU");
    const france = data.countries.find((country) => country.id === "FRA");
    const germanyBase = data.baseCountries.find((country) => country.entityId === "DEU");
    const transferredRegionId = france?.regionIds[0];
    if (!germany || !france || !germanyBase || !transferredRegionId) {
      throw new Error("Missing fixture records");
    }

    const projection = geoNaturalEarth1().fitExtent(
      [
        [16, 18],
        [984, 538],
      ],
      {
        type: "FeatureCollection",
        features: data.regions.map((region) => ({
          type: "Feature",
          properties: { id: region.id },
          geometry: region.geometry,
        })),
      },
    );
    const regionById = new Map(data.regions.map((region) => [region.id, region]));
    const regionIds = [...germany.regionIds, transferredRegionId];
    const geometries = getCountryLabelGeometries({
      baseCountryByEntityId: new Map(data.baseCountries.map((country) => [country.entityId, country])),
      baseEntityById: new Map(data.countries.map((country) => [country.id, country])),
      baseOwnerByRegionId: new Map(
        data.countries.flatMap((country) => country.regionIds.map((regionId) => [regionId, country.id])),
      ),
      entityId: germany.id,
      fallbackGeometries: regionIds
        .map((regionId) => regionById.get(regionId)?.geometry)
        .filter((geometry): geometry is NonNullable<typeof geometry> => Boolean(geometry)),
      regionById,
      regionIds,
      subtractGeoJsonGeometries,
      unionGeoJsonGeometriesClosingGaps,
    });
    const label = layoutCountryLabel({
      id: germany.id,
      name: germany.name,
      geometries,
      project: (position) => projection([position[0], position[1]]),
    });
    const germanyPolygons = projectGeometryRings(germanyBase.geometry, (position) => projection([position[0], position[1]]));

    expect(label).not.toBeNull();
    expect(projectedPolygonsContainPoint(germanyPolygons, [label!.x, label!.y])).toBe(true);
  });

  it("fits Vietnam's expanded label only when it stays inside expanded geometry", () => {
    const data = mapDataFixture as MapData;
    const vietnam = data.countries.find((country) => country.id === "VNM");
    const vietnamBase = data.baseCountries.find((country) => country.entityId === "VNM");
    const transferredRegionIds = [
      "CHN-43563684B59914390554750",
      "CHN-43563684B84540832148656",
      "CHN-43563684B78583622565599",
      "CHN-43563684B64987462919315",
      "CHN-43563684B38891657012300",
      "CHN-43563684B30737817496648",
    ];
    if (!vietnam || !vietnamBase) {
      throw new Error("Missing Vietnam fixture records");
    }

    const projection = geoNaturalEarth1().fitExtent(
      [
        [16, 18],
        [984, 538],
      ],
      {
        type: "FeatureCollection",
        features: data.regions.map((region) => ({
          type: "Feature",
          properties: { id: region.id },
          geometry: region.geometry,
        })),
      },
    );
    const regionById = new Map(data.regions.map((region) => [region.id, region]));
    const baseCountryByEntityId = new Map(data.baseCountries.map((country) => [country.entityId, country]));
    const baseEntityById = new Map(data.countries.map((country) => [country.id, country]));
    const baseOwnerByRegionId = new Map(
      data.countries.flatMap((country) => country.regionIds.map((regionId) => [regionId, country.id])),
    );
    const originalLabel = layoutCountryLabel({
      id: vietnam.id,
      name: vietnam.name,
      geometries: [vietnamBase.geometry],
      project: (position) => projection([position[0], position[1]]),
    });
    const expandedRegionIds = [...vietnam.regionIds, ...transferredRegionIds];
    const expandedGeometry = getCountryLabelGeometry({
      baseCountryByEntityId,
      baseEntityById,
      baseOwnerByRegionId,
      entityId: vietnam.id,
      entityName: vietnam.name,
      fallbackGeometries: expandedRegionIds
        .map((regionId) => regionById.get(regionId)?.geometry)
        .filter((geometry): geometry is NonNullable<typeof geometry> => Boolean(geometry)),
      regionById,
      regionIds: expandedRegionIds,
      subtractGeoJsonGeometries,
      unionGeoJsonGeometriesClosingGaps,
      unionGapTolerance: 0.08,
    });
    const expandedLabel = layoutCountryLabel({
      id: vietnam.id,
      name: vietnam.name,
      geometries: expandedGeometry.geometries,
      project: (position) => projection([position[0], position[1]]),
    });
    const expandedPolygons = expandedGeometry.geometries.flatMap((geometry) =>
      projectGeometryRings(geometry, (position) => projection([position[0], position[1]])),
    );

    expect(originalLabel).not.toBeNull();
    expect(expandedGeometry.cacheKey).toContain("VNM|Vietnam|");
    if (expandedLabel) {
      for (const point of rectangleSamplePoints(
        expandedLabel.x,
        expandedLabel.y,
        expandedLabel.width,
        expandedLabel.height,
        expandedLabel.angle,
      )) {
        expect(projectedPolygonsContainPoint(expandedPolygons, point)).toBe(true);
      }
    }
  });

  it("unions expanded country geometry before fitting the label", () => {
    const baseGeometry = rectangleGeometry(0, 0, 10, 4);
    const transferredGeometry = rectangleGeometry(10, 0, 34, 4);
    const unionedGeometry = rectangleGeometry(0, 0, 34, 4);
    const regionById = new Map([
      ["BASE-1", { id: "BASE-1", name: "Base", ownerId: "AAA", type: "Base", geometry: baseGeometry }],
      ["BBB-1", { id: "BBB-1", name: "Transfer", ownerId: "BBB", type: "Base", geometry: transferredGeometry }],
    ]);
    const unionCalls: Geometry[][] = [];
    const geometries = getCountryLabelGeometries({
      baseCountryByEntityId: new Map([["AAA", { geometry: baseGeometry }]]),
      baseEntityById: new Map([["AAA", { regionIds: ["BASE-1"] }]]),
      baseOwnerByRegionId: new Map([
        ["BASE-1", "AAA"],
        ["BBB-1", "BBB"],
      ]),
      entityId: "AAA",
      fallbackGeometries: [baseGeometry, transferredGeometry],
      regionById,
      regionIds: ["BASE-1", "BBB-1"],
      subtractGeoJsonGeometries,
      unionGeoJsonGeometriesClosingGaps: (inputGeometries) => {
        unionCalls.push(inputGeometries);
        return unionedGeometry;
      },
    });
    const originalLabel = layoutCountryLabel({
      id: "AAA",
      name: "Expanded",
      geometries: [baseGeometry],
      project: identityProject,
    });
    const expandedLabel = layoutCountryLabel({
      id: "AAA",
      name: "Expanded",
      geometries,
      project: identityProject,
    });

    expect(unionCalls).toEqual([[baseGeometry, transferredGeometry]]);
    expect(geometries).toEqual([unionedGeometry]);
    expect(originalLabel).not.toBeNull();
    expect(expandedLabel).not.toBeNull();
    expect(expandedLabel!.fontSize).toBeGreaterThan(originalLabel!.fontSize);
  });
});

function rectangleGeometry(minX: number, minY: number, maxX: number, maxY: number): Geometry {
  return {
    type: "Polygon",
    coordinates: [
      [
        [minX, minY],
        [maxX, minY],
        [maxX, maxY],
        [minX, maxY],
        [minX, minY],
      ],
    ],
  };
}

function identityProject(position: Position): [number, number] {
  return [position[0], position[1]];
}

function rectangleSamplePoints(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  angleDegrees: number,
): Position[] {
  const angle = (angleDegrees * Math.PI) / 180;
  const cos = Math.cos(angle);
  const sin = Math.sin(angle);
  const points: Position[] = [];

  for (const yRatio of [0, 0.25, 0.5, 0.75, 1]) {
    for (const xRatio of [0, 0.25, 0.5, 0.75, 1]) {
      const localX = (xRatio - 0.5) * width;
      const localY = (yRatio - 0.5) * height;
      points.push([centerX + localX * cos - localY * sin, centerY + localX * sin + localY * cos]);
    }
  }

  return points;
}

function projectGeometryRings(
  geometry: Geometry,
  project: (position: Position) => [number, number] | null | undefined,
): Position[][][] {
  if (geometry.type === "Polygon") {
    return [projectPolygonRings(geometry.coordinates, project)];
  }
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.map((polygon) => projectPolygonRings(polygon, project));
  }
  return [];
}

function projectPolygonRings(
  rings: Position[][],
  project: (position: Position) => [number, number] | null | undefined,
): Position[][] {
  return rings.map((ring) =>
    ring
      .map(project)
      .filter((point): point is [number, number] => Boolean(point && Number.isFinite(point[0]) && Number.isFinite(point[1]))),
  );
}

function projectedPolygonsContainPoint(polygons: Position[][][], point: Position): boolean {
  return polygons.some((rings) => rings.length > 0 && ringContainsPoint(rings[0], point) && rings.slice(1).every((hole) => !ringContainsPoint(hole, point)));
}

function ringContainsPoint(ring: Position[], point: Position): boolean {
  let inside = false;
  const x = point[0];
  const y = point[1];

  for (let index = 0, previousIndex = ring.length - 1; index < ring.length; previousIndex = index, index += 1) {
    const current = ring[index];
    const previous = ring[previousIndex];
    const x1 = current[0];
    const y1 = current[1];
    const x2 = previous[0];
    const y2 = previous[1];
    const crossesRay = y1 > y !== y2 > y && x < ((x2 - x1) * (y - y1)) / (y2 - y1) + x1;
    if (crossesRay) inside = !inside;
  }

  return inside;
}
