import { describe, expect, it } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import type { Geometry, Position } from "geojson";
import mapDataFixture from "../public/data/map-data.json";
import { subtractGeoJsonGeometries } from "./geometrySplit";
import { getCountryLabelGeometries } from "./countryLabelGeometry";
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
    });

    expect(geometries[0]).toBe(germanyBase.geometry);
    expect(geometries).toHaveLength(2);
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
});

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
