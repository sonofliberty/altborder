import { describe, expect, it } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import mapDataFixture from "../public/data/map-data.json";
import type { Geometry } from "geojson";
import type { Feature, FeatureCollection } from "geojson";
import { buildDivideTerritories, separateCountryIsland, splitCountryGeometry } from "./geometrySplit";
import type { MapData, RegionRecord } from "./types";

describe("splitCountryGeometry", () => {
  it("splits a simple polygon into two valid pieces", () => {
    const result = splitCountryGeometry([region("square", square(0, 0, 10, 10))], [
      [0, 5],
      [10, 5],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieces).toHaveLength(2);
    expect(result.pieces[0].area).toBeCloseTo(50);
    expect(result.pieces[1].area).toBeCloseTo(50);
  });

  it("rejects a line that does not cut through the polygon", () => {
    const result = splitCountryGeometry([region("square", square(0, 0, 10, 10))], [
      [2, 2],
      [8, 2],
    ]);

    expect(result.ok).toBe(false);
  });

  it("splits when the drawn line starts and ends outside the polygon", () => {
    const result = splitCountryGeometry([region("square", square(0, 0, 10, 10))], [
      [-5, 5],
      [15, 5],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieces[0].area + result.pieces[1].area).toBeCloseTo(100);
  });

  it("groups extra polygonized fragments from a noisy crossing cut", () => {
    const result = splitCountryGeometry([region("square", square(0, 0, 10, 10))], [
      [-1, 5],
      [4, 5],
      [4, 7],
      [6, 7],
      [6, 5],
      [11, 5],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieces[0].area + result.pieces[1].area).toBeCloseTo(100);
    expect(Math.min(result.pieces[0].area, result.pieces[1].area)).toBeGreaterThan(1);
  });

  it("splits off a small border pocket from a much larger country", () => {
    const result = splitCountryGeometry([region("large", square(0, 0, 100, 100))], [
      [47, 102],
      [48, 90],
      [50, 82],
      [52, 90],
      [53, 102],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieces[0].area + result.pieces[1].area).toBeCloseTo(10000);
    expect(Math.min(result.pieces[0].area, result.pieces[1].area)).toBeLessThan(100);
  });

  it("ignores tiny artifact fragments from nearly straight noisy cuts", () => {
    const result = splitCountryGeometry([region("square", square(0, 0, 10, 10))], [
      [-1, 5],
      [4, 5],
      [4, 5.00001],
      [6, 5.00001],
      [6, 5],
      [11, 5],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieces[0].area + result.pieces[1].area).toBeCloseTo(100);
  });

  it("preserves detailed bends in drawn split borders", () => {
    const result = splitCountryGeometry([region("square", square(0, 0, 20, 20))], [
      [10, -2],
      [9.2, 2],
      [10.8, 5],
      [9.3, 8],
      [10.9, 11],
      [9.4, 14],
      [10.6, 17],
      [10, 22],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(maxCoordinateCount(result.pieces.map((piece) => piece.geometry))).toBeGreaterThan(10);
  });

  it("splits when one endpoint stops inside but the cut direction is clear", () => {
    const result = splitCountryGeometry([region("square", square(0, 0, 10, 10))], [
      [5, 5],
      [15, 5],
    ]);

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.pieces[0].area + result.pieces[1].area).toBeCloseTo(100);
  });

  it("rejects a line drawn entirely inside the polygon", () => {
    const result = splitCountryGeometry([region("square", square(0, 0, 10, 10))], [
      [1, 5],
      [9, 5],
    ]);

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("Draw the line so it clearly enters and exits the selected country.");
  });

  it("keeps untouched multipolygon components with the existing country", () => {
    const result = splitCountryGeometry(
      [region("multi", multiSquare([squareCoordinates(0, 0, 10, 10), squareCoordinates(20, 0, 30, 10)]))],
      [
        [0, 5],
        [10, 5],
      ],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.untouchedGeometry?.type).toBe("Polygon");

    const territories = buildDivideTerritories(result, result.defaultNewPieceIndex);
    expect(territories.newGeometry.type).toBe("Polygon");
    expect(["Polygon", "MultiPolygon"]).toContain(territories.existingGeometry.type);
  });

  it("rejects a line that cuts two disconnected components", () => {
    const result = splitCountryGeometry(
      [region("multi", multiSquare([squareCoordinates(0, 0, 10, 10), squareCoordinates(20, 0, 30, 10)]))],
      [
        [-1, 5],
        [31, 5],
      ],
    );

    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.reason).toBe("Draw a border that cuts one continuous part of the country.");
  });

  it("separates the clicked island component into a new country", () => {
    const result = separateCountryIsland(
      [region("multi", multiSquare([squareCoordinates(0, 0, 10, 10), squareCoordinates(20, 0, 30, 10)]))],
      [25, 5],
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.defaultNewPieceIndex).toBe(0);
    expect(result.pieces[0].geometry.type).toBe("Polygon");
    expect(result.pieces[0].area).toBeCloseTo(100);

    const territories = buildDivideTerritories(result, result.defaultNewPieceIndex);
    expect(territories.newGeometry.type).toBe("Polygon");
    expect(territories.existingGeometry.type).toBe("Polygon");
  });

  it("rejects island separation when the selected country has one component", () => {
    const result = separateCountryIsland([region("square", square(0, 0, 10, 10))], [5, 5]);

    expect(result.ok).toBe(false);
  });

  it("splits a small northern Italy pocket drawn in the app viewport", () => {
    const data = mapDataFixture as MapData;
    const baseItaly = data.baseCountries.find((country) => country.entityId === "ITA");
    if (!baseItaly) throw new Error("Missing base Italy geometry");
    const baseRegionFeatures: Feature<Geometry, { id: string }>[] = data.regions.map((mapRegion) => ({
      type: "Feature",
      properties: { id: mapRegion.id },
      geometry: mapRegion.geometry,
    }));
    const projection = geoNaturalEarth1().fitExtent(
      [
        [16, 18],
        [984, 538],
      ],
      {
        type: "FeatureCollection",
        features: baseRegionFeatures,
      } satisfies FeatureCollection,
    );
    const cutLine = [
      [518.059, 128.758],
      [523.702, 138.916],
      [529.345, 153.589],
      [536.117, 138.916],
      [542.889, 128.758],
    ]
      .map((point) => projection.invert?.(point as [number, number]))
      .filter((point): point is [number, number] => Boolean(point));

    const result = splitCountryGeometry(
      [
        {
          id: "ITA-BASE-SPLIT",
          name: "Italy",
          ownerId: "ITA",
          type: "Base country split geometry",
          geometry: baseItaly.geometry,
        },
      ],
      cutLine,
    );

    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Math.min(result.pieces[0].area, result.pieces[1].area)).toBeGreaterThan(0);
  });
});

function region(id: string, geometry: Geometry): RegionRecord {
  return {
    id,
    name: id,
    ownerId: "SRC",
    type: "Test",
    geometry,
  };
}

function square(minX: number, minY: number, maxX: number, maxY: number): Geometry {
  return {
    type: "Polygon",
    coordinates: [squareCoordinates(minX, minY, maxX, maxY)],
  };
}

function squareCoordinates(minX: number, minY: number, maxX: number, maxY: number) {
  return [
    [minX, minY],
    [maxX, minY],
    [maxX, maxY],
    [minX, maxY],
    [minX, minY],
  ];
}

function multiSquare(coordinates: number[][][]): Geometry {
  return {
    type: "MultiPolygon",
    coordinates: coordinates.map((polygon) => [polygon]),
  };
}

function maxCoordinateCount(geometries: Geometry[]): number {
  const countCoordinates = (value: unknown): number => {
    if (Array.isArray(value) && typeof value[0] === "number") {
      return 1;
    }
    if (Array.isArray(value)) {
      return value.reduce((total, child) => total + countCoordinates(child), 0);
    }
    return 0;
  };

  return Math.max(
    ...geometries.map((geometry) =>
      geometry.type === "Polygon" || geometry.type === "MultiPolygon" ? countCoordinates(geometry.coordinates) : 0,
    ),
  );
}
