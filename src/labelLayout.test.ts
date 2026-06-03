import { describe, expect, it } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import mapDataFixture from "../public/data/map-data.json";
import type { Geometry, Position } from "geojson";
import { layoutCountryLabel } from "./labelLayout";
import type { MapData } from "./types";

const identityProject = (position: Position): [number, number] => [position[0], position[1]];

describe("layoutCountryLabel", () => {
  it("produces larger labels for larger polygons", () => {
    const small = layoutCountryLabel({
      id: "small",
      name: "Small",
      geometries: [square(0, 0, 10, 10)],
      project: identityProject,
    });
    const large = layoutCountryLabel({
      id: "large",
      name: "Large",
      geometries: [square(0, 0, 100, 100)],
      project: identityProject,
    });

    expect(small).not.toBeNull();
    expect(large).not.toBeNull();
    expect(large!.fontSize).toBeGreaterThan(small!.fontSize);
  });

  it("keeps a simple polygon label anchor inside the polygon", () => {
    const label = layoutCountryLabel({
      id: "box",
      name: "Box",
      geometries: [square(0, 0, 30, 20)],
      project: identityProject,
    });

    expect(label).not.toBeNull();
    expect(label!.x).toBeGreaterThan(0);
    expect(label!.x).toBeLessThan(30);
    expect(label!.y).toBeGreaterThan(0);
    expect(label!.y).toBeLessThan(20);
  });

  it("keeps the fitted label footprint inside a concave country shape", () => {
    const coordinates: Position[] = [
      [0, 0],
      [36, 0],
      [36, 12],
      [15, 12],
      [15, 28],
      [0, 28],
      [0, 0],
    ];
    const label = layoutCountryLabel({
      id: "concave",
      name: "Bend",
      geometries: [{
        type: "Polygon",
        coordinates: [coordinates],
      }],
      project: identityProject,
    });

    expect(label).not.toBeNull();
    for (const point of rectangleSamplePoints(label!.x, label!.y, label!.width, label!.height, label!.angle)) {
      expect(ringContainsPoint(coordinates, point)).toBe(true);
    }
  });

  it("chooses the largest multipolygon component", () => {
    const label = layoutCountryLabel({
      id: "multi",
      name: "Multi",
      geometries: [multiSquare([squareCoordinates(0, 0, 8, 8), squareCoordinates(50, 50, 90, 90)])],
      project: identityProject,
    });

    expect(label).not.toBeNull();
    expect(label!.x).toBeGreaterThan(50);
    expect(label!.y).toBeGreaterThan(50);
  });

  it("shrinks long names to fit available geometry", () => {
    const short = layoutCountryLabel({
      id: "short",
      name: "Short",
      geometries: [square(0, 0, 80, 40)],
      project: identityProject,
    });
    const long = layoutCountryLabel({
      id: "long",
      name: "A Very Long Country Name",
      geometries: [square(0, 0, 80, 40)],
      project: identityProject,
    });

    expect(short).not.toBeNull();
    expect(long).not.toBeNull();
    expect(long!.fontSize).toBeLessThan(short!.fontSize);
  });

  it("falls back to a small label for skinny countries", () => {
    const label = layoutCountryLabel({
      id: "skinny",
      name: "Skinnyland",
      geometries: [skinnyPolygon()],
      project: identityProject,
    });

    expect(label).not.toBeNull();
    expect(label!.x).toBeGreaterThan(0);
    expect(label!.y).toBeGreaterThan(0);
  });

  it("fits labels for large generated-map countries", () => {
    const data = mapDataFixture as MapData;
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

    const labels = ["USA", "RUS", "CHN", "BRA"].map((id) => {
        const country = data.countries.find((candidate) => candidate.id === id);
        const baseCountry = data.baseCountries.find((candidate) => candidate.entityId === id);
        if (!country) throw new Error(`Missing country ${id}`);
        const geometries = baseCountry
          ? [baseCountry.geometry]
          : data.regions.filter((region) => country.regionIds.includes(region.id)).map((region) => region.geometry);
        return layoutCountryLabel({
          id,
          name: country.name,
          geometries,
          project: (position) => projection([position[0], position[1]]),
        });
      });

    expect(labels.every(Boolean)).toBe(true);
    expect(labels.filter((label) => label && label.fontSize >= 7)).toHaveLength(labels.length);
  });

  it("keeps real generated-map label footprints inside their country geometry", () => {
    const data = mapDataFixture as MapData;
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

    for (const id of ["GBR", "JPN", "DNK", "ITA"]) {
      const geometries = countryGeometries(data, id);
      const polygons = geometries.flatMap((geometry) =>
        projectGeometryRings(geometry, (position) => projection([position[0], position[1]])),
      );
      const country = data.countries.find((candidate) => candidate.id === id);
      if (!country) throw new Error(`Missing country ${id}`);

      const label = layoutCountryLabel({
        id,
        name: country.name,
        geometries,
        project: (position) => projection([position[0], position[1]]),
      });

      expect(label).not.toBeNull();
      for (const point of rectangleSamplePoints(label!.x, label!.y, label!.width, label!.height, label!.angle)) {
        expect(projectedPolygonsContainPoint(polygons, point)).toBe(true);
      }
    }
  });
});

function square(minX: number, minY: number, maxX: number, maxY: number): Geometry {
  return {
    type: "Polygon",
    coordinates: [squareCoordinates(minX, minY, maxX, maxY)],
  };
}

function squareCoordinates(minX: number, minY: number, maxX: number, maxY: number): Position[] {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

function multiSquare(coordinates: Position[][]): Geometry {
  return {
    type: "MultiPolygon",
    coordinates: coordinates.map((polygon) => [polygon]),
  };
}

function countryGeometries(data: MapData, id: string): Geometry[] {
  const country = data.countries.find((candidate) => candidate.id === id);
  if (!country) throw new Error(`Missing country ${id}`);
  const baseCountry = data.baseCountries.find((candidate) => candidate.entityId === id);
  return baseCountry
    ? [baseCountry.geometry]
    : data.regions.filter((region) => country.regionIds.includes(region.id)).map((region) => region.geometry);
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

function skinnyPolygon(): Geometry {
  return {
    type: "Polygon",
    coordinates: [
      [
        [0, 0],
        [2, 0],
        [4, 5],
        [6, 10],
        [5, 16],
        [7, 24],
        [5, 28],
        [2, 21],
        [1, 14],
        [0, 6],
        [0, 0],
      ],
    ],
  };
}

function rectangleSamplePoints(
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  angleDegrees: number,
): Position[] {
  const angle = (angleDegrees * Math.PI) / 180;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);
  const points: Position[] = [];

  for (let yIndex = 0; yIndex <= 6; yIndex += 1) {
    for (let xIndex = 0; xIndex <= 6; xIndex += 1) {
      const localX = (xIndex / 6 - 0.5) * width;
      const localY = (yIndex / 6 - 0.5) * height;
      points.push([
        centerX + localX * cos - localY * sin,
        centerY + localX * sin + localY * cos,
      ]);
    }
  }

  return points;
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
