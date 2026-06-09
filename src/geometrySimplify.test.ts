import { describe, expect, it } from "vitest";
import type { Geometry, Position } from "geojson";
import mapDataFixture from "../public/data/map-data.json";
import {
  removePolygonalGeometryHoles,
  removeSmallPolygonalGeometryComponents,
  simplifyPolygonalGeometry,
} from "./geometrySimplify";
import type { MapData } from "./types";

describe("geometry simplification", () => {
  it("keeps polygon rings closed and valid", () => {
    const geometry: Geometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0.01],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    };

    const simplified = simplifyPolygonalGeometry(geometry, 0.05);

    expect(simplified.type).toBe("Polygon");
    if (simplified.type !== "Polygon") return;
    const ring = simplified.coordinates[0];
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("reduces heavyweight fallback country geometry used for rendering", () => {
    const data = mapDataFixture as MapData;
    const canada = data.regions.find((region) => region.id === "CAN-ALL");
    if (!canada) throw new Error("Missing Canada test data");

    const simplified = simplifyPolygonalGeometry(canada.geometry, 0.07);

    expect(JSON.stringify(simplified).length).toBeLessThan(JSON.stringify(canada.geometry).length * 0.25);
  });

  it("removes polygon holes from display geometry without mutating the source geometry", () => {
    const geometry: Geometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [10, 0],
          [10, 10],
          [0, 10],
          [0, 0],
        ],
        [
          [2, 2],
          [4, 2],
          [4, 4],
          [2, 2],
        ],
      ],
    };

    const withoutHoles = removePolygonalGeometryHoles(geometry);

    expect(withoutHoles.type).toBe("Polygon");
    if (withoutHoles.type !== "Polygon") return;
    expect(withoutHoles.coordinates).toHaveLength(1);
    expect(geometry.type === "Polygon" ? geometry.coordinates : []).toHaveLength(2);
    expect(withoutHoles.coordinates[0]).toEqual(geometry.coordinates[0]);
    expect(withoutHoles.coordinates[0]).not.toBe(geometry.coordinates[0]);
  });

  it("removes Santa Cruz's source interior rings for transfer rendering", () => {
    const data = mapDataFixture as MapData;
    const santaCruz = data.regions.find((region) => region.id === "BOL-BO-S");
    if (!santaCruz) throw new Error("Missing Santa Cruz test data");

    expect(countPolygonHoles(santaCruz.geometry)).toBeGreaterThan(0);
    expect(countPolygonHoles(removePolygonalGeometryHoles(santaCruz.geometry))).toBe(0);
  });

  it("drops tiny multipolygon slivers while preserving significant components", () => {
    const geometry: Geometry = {
      type: "MultiPolygon",
      coordinates: [
        rectanglePolygon(0, 0, 100, 100),
        rectanglePolygon(110, 0, 111, 1),
        rectanglePolygon(120, 0, 140, 20),
      ],
    };

    const withoutSlivers = removeSmallPolygonalGeometryComponents(geometry, 0.01);

    expect(withoutSlivers.type).toBe("MultiPolygon");
    if (withoutSlivers.type !== "MultiPolygon") return;
    expect(withoutSlivers.coordinates).toHaveLength(2);
    expect(withoutSlivers.coordinates[0]).toEqual(geometry.coordinates[0]);
    expect(withoutSlivers.coordinates[1]).toEqual(geometry.coordinates[2]);
  });

  it("collapses Bolivia base-subtraction slivers after Santa Cruz transfers away", async () => {
    const data = mapDataFixture as MapData;
    const bolivia = data.baseCountries.find((country) => country.entityId === "BOL");
    const santaCruz = data.regions.find((region) => region.id === "BOL-BO-S");
    if (!bolivia || !santaCruz) throw new Error("Missing Bolivia test data");
    const { subtractGeoJsonGeometries } = await import("./geometrySplit");
    const changedBolivia = subtractGeoJsonGeometries(
      bolivia.geometry,
      [removePolygonalGeometryHoles(santaCruz.geometry)],
    );
    if (!changedBolivia) throw new Error("Missing changed Bolivia geometry");

    const withoutSlivers = removeSmallPolygonalGeometryComponents(changedBolivia, 0.0005);

    expect(countPolygonComponents(changedBolivia)).toBeGreaterThan(1);
    expect(countPolygonComponents(withoutSlivers)).toBe(1);
    expect(countPolygonHoles(withoutSlivers)).toBe(0);
  });
});

function rectanglePolygon(minX: number, minY: number, maxX: number, maxY: number): Position[][] {
  return [
    [
      [minX, minY],
      [maxX, minY],
      [maxX, maxY],
      [minX, maxY],
      [minX, minY],
    ],
  ];
}

function countPolygonHoles(geometry: Geometry): number {
  if (geometry.type === "Polygon") return Math.max(0, geometry.coordinates.length - 1);
  if (geometry.type === "MultiPolygon") {
    return geometry.coordinates.reduce((total, polygon) => total + Math.max(0, polygon.length - 1), 0);
  }
  return 0;
}

function countPolygonComponents(geometry: Geometry): number {
  if (geometry.type === "Polygon") return 1;
  if (geometry.type === "MultiPolygon") return geometry.coordinates.length;
  return 0;
}
