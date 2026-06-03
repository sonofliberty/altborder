import { describe, expect, it } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import type { Geometry, Position } from "geojson";
import mapDataFixture from "../public/data/map-data.json";
import { findRegionAtProjectedPoint, type HitTestRegion } from "./geometryHitTest";
import type { MapData } from "./types";

const identityProject = (position: Position) => [position[0], position[1]] as [number, number];

describe("findRegionAtProjectedPoint", () => {
  it("finds a polygon region by projected point", () => {
    const regions: HitTestRegion[] = [
      {
        id: "A",
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
              [0, 0],
            ],
          ],
        },
      },
    ];

    expect(findRegionAtProjectedPoint([5, 5], regions, identityProject)).toBe("A");
    expect(findRegionAtProjectedPoint([11, 5], regions, identityProject)).toBeNull();
  });

  it("chooses the smallest containing region when candidates overlap", () => {
    const regions: HitTestRegion[] = [
      {
        id: "large",
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [0, 0],
              [10, 0],
              [10, 10],
              [0, 10],
              [0, 0],
            ],
          ],
        },
      },
      {
        id: "small",
        bounds: { minX: 4, minY: 4, maxX: 6, maxY: 6 },
        geometry: {
          type: "Polygon",
          coordinates: [
            [
              [4, 4],
              [6, 4],
              [6, 6],
              [4, 6],
              [4, 4],
            ],
          ],
        },
      },
    ];

    expect(findRegionAtProjectedPoint([5, 5], regions, identityProject)).toBe("small");
  });

  it("respects polygon holes", () => {
    const regions: HitTestRegion[] = [
      {
        id: "donut",
        bounds: { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        geometry: {
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
              [4, 4],
              [6, 4],
              [6, 6],
              [4, 6],
              [4, 4],
            ],
          ],
        },
      },
    ];

    expect(findRegionAtProjectedPoint([2, 2], regions, identityProject)).toBe("donut");
    expect(findRegionAtProjectedPoint([5, 5], regions, identityProject)).toBeNull();
  });

  it("can hit-test Lower Saxony from generated map data", () => {
    const data = mapDataFixture as MapData;
    const region = data.regions.find((candidate) => candidate.id === "DEU-DE-NI");
    expect(region).toBeDefined();

    const projection = geoNaturalEarth1().fitExtent(
      [
        [16, 18],
        [984, 538],
      ],
      {
        type: "FeatureCollection",
        features: data.regions.map((candidate) => ({
          type: "Feature",
          properties: { id: candidate.id },
          geometry: candidate.geometry,
        })),
      },
    );

    const projectedRegion = firstExteriorRing(region!.geometry).map((position) => projection([position[0], position[1]]));
    const validPoints = projectedRegion.filter((point): point is [number, number] => Boolean(point));
    const averagePoint: [number, number] = [
      validPoints.reduce((total, point) => total + point[0], 0) / validPoints.length,
      validPoints.reduce((total, point) => total + point[1], 0) / validPoints.length,
    ];
    const bounds = {
      minX: Math.min(...validPoints.map((point) => point[0])),
      minY: Math.min(...validPoints.map((point) => point[1])),
      maxX: Math.max(...validPoints.map((point) => point[0])),
      maxY: Math.max(...validPoints.map((point) => point[1])),
    };

    expect(
      findRegionAtProjectedPoint(
        averagePoint,
        [{ id: region!.id, geometry: region!.geometry, bounds }],
        (position) => projection([position[0], position[1]]),
      ),
    ).toBe("DEU-DE-NI");
  });
});

function firstExteriorRing(geometry: Geometry): Position[] {
  if (geometry.type === "Polygon") return geometry.coordinates[0];
  if (geometry.type === "MultiPolygon") return geometry.coordinates[0][0];
  throw new Error(`Unsupported geometry ${geometry.type}`);
}
