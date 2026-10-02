import { describe, expect, it } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import type { Geometry, Position } from "geojson";
import mapDataFixture from "../public/data/map-data.json";
import { findRegionAtProjectedPoint } from "./geometryHitTest";
import { projectedGeometryBounds } from "./projectedPath";
import { decodeSharePayload, encodeSharePayload } from "./share";
import { applyScenarioPayload } from "./state";
import type { MapData } from "./types";

const identityProject = (position: Position) => [position[0], position[1]] as [number, number];
type HitTestRegion = Parameters<typeof findRegionAtProjectedPoint>[1][number];

describe("findRegionAtProjectedPoint", () => {
  it("selects both divided territories instead of retired base regions, including after undo and redo", () => {
    const rectangle = (id: string, minX: number, minY: number, maxX: number, maxY: number): HitTestRegion => ({
      id,
      bounds: { minX, minY, maxX, maxY },
      geometry: {
        type: "Polygon",
        coordinates: [[[minX, minY], [maxX, minY], [maxX, maxY], [minX, maxY], [minX, minY]]],
      },
    });
    const regions = [
      rectangle("original-north", 0, 0, 4, 4),
      rectangle("original-south", 0, 6, 4, 10),
      rectangle("remainder", 0, 0, 10, 5),
      rectangle("new-country", 0, 5, 10, 10),
    ];
    const dividedOwners = {
      "original-north": "", "original-south": "", remainder: "A", "new-country": "B",
    };
    const originalOwners = { "original-north": "A", "original-south": "A" };

    for (const owners of [dividedOwners, originalOwners, dividedOwners]) {
      const divided = owners === dividedOwners;
      expect(findRegionAtProjectedPoint([2, 2], regions, identityProject, owners))
        .toBe(divided ? "remainder" : "original-north");
      expect(findRegionAtProjectedPoint([2, 8], regions, identityProject, owners))
        .toBe(divided ? "new-country" : "original-south");
    }
    expect(findRegionAtProjectedPoint([2, 2], regions, identityProject, {})).toBeNull();
  });

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

  it("selects Fiji at both sides of the map seam without selecting distant ocean", () => {
    const data = mapDataFixture as MapData;
    const fiji = data.regions.find((region) => region.id === "NE-242-ALL");
    if (!fiji) throw new Error("Missing Fiji test data");
    const projection = geoNaturalEarth1();
    const regions = [{ ...fiji, bounds: projectedGeometryBounds(fiji.geometry, projection) }];
    const hit = (longitude: number, latitude: number) => findRegionAtProjectedPoint(
      projection([longitude, latitude])!,
      regions,
      (position) => projection([position[0], position[1]]),
    );

    for (const longitude of [-100, 0, 100]) {
      expect(hit(longitude, -16.52)).toBeNull();
    }
    expect(hit(179.99, -16.52)).toBe(fiji.id);
    expect(hit(-179.999, -16.52)).toBe(fiji.id);
    expect(hit(178, -17.8)).toBe(fiji.id);
  });

  it.each([1e20, -1e20])("skips unsafe longitude-copy indices from a shared map at %s", async (longitude) => {
    const decoded = await decodeSharePayload(await encodeSharePayload({
      version: 1,
      title: "Extreme coordinates",
      customCounter: 1,
      entityChanges: {},
      regionOwnerChanges: [],
      customRegions: [{
        id: "CUSTOM_001-TERRITORY",
        name: "Test",
        ownerId: "BRA",
        type: "Custom divided territory",
        geometry: {
          type: "Polygon",
          coordinates: [[
            [longitude, 0], [longitude + 1e6, 0], [90, 10],
            [longitude, 10], [longitude, 0],
          ]],
        },
      }],
    }));
    if (!decoded.ok) throw new Error(decoded.error);
    const snapshot = applyScenarioPayload(mapDataFixture as MapData, decoded.payload);
    const region = snapshot.customRegions["CUSTOM_001-TERRITORY"];
    const projection = geoNaturalEarth1();
    const bounds = projectedGeometryBounds(region.geometry, projection);
    if (!bounds) throw new Error("Expected projected bounds for the shared region");

    expect(findRegionAtProjectedPoint(
      [(bounds.minX + bounds.maxX) / 2, (bounds.minY + bounds.maxY) / 2],
      [{ ...region, bounds }],
      (position) => projection([position[0], position[1]]),
      snapshot.regionOwners,
    )).toBeNull();
  });

  it("preserves holes in polygons that cross the map seam", () => {
    const regions: HitTestRegion[] = [{
      id: "seam",
      bounds: { minX: -180, minY: 0, maxX: 180, maxY: 10 },
      geometry: {
        type: "Polygon",
        coordinates: [
          [[170, 0], [-170, 0], [-170, 10], [170, 10], [170, 0]],
          [[175, 3], [-175, 3], [-175, 7], [175, 7], [175, 3]],
        ],
      },
    }];

    expect(findRegionAtProjectedPoint([172, 5], regions, identityProject)).toBe("seam");
    expect(findRegionAtProjectedPoint([-172, 5], regions, identityProject)).toBe("seam");
    expect(findRegionAtProjectedPoint([179, 5], regions, identityProject)).toBeNull();
    expect(findRegionAtProjectedPoint([-179, 5], regions, identityProject)).toBeNull();
    expect(findRegionAtProjectedPoint([0, 5], regions, identityProject)).toBeNull();
  });
});

function firstExteriorRing(geometry: Geometry): Position[] {
  if (geometry.type === "Polygon") return geometry.coordinates[0];
  if (geometry.type === "MultiPolygon") return geometry.coordinates[0][0];
  throw new Error(`Unsupported geometry ${geometry.type}`);
}
