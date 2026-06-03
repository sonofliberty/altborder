import { describe, expect, it } from "vitest";
import { geoIdentity, geoNaturalEarth1 } from "d3-geo";
import type { GeoProjection } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import mapDataFixture from "../public/data/map-data.json";
import { subtractGeoJsonGeometries, unionGeoJsonGeometriesClosingGaps } from "./geometrySplit";
import { projectGeometryToPathData } from "./projectedPath";
import type { ProjectedPathData } from "./projectedPath";
import type { MapData } from "./types";

const identityProjection = geoIdentity().reflectY(false) as unknown as GeoProjection;
const renderPathOptions = {
  coordinatePrecision: 2,
  seamBreakDistance: 220,
};

describe("projected path layout", () => {
  it("projects simple polygon paths and bounds without duplicate closing coordinates", () => {
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
      ],
    };

    const projected = projectGeometryToPathData(geometry, identityProjection, {
      coordinatePrecision: 0,
      seamBreakDistance: 100,
    });

    expect(projected?.pathData).toBe("M0,0L10,0L10,10L0,10Z");
    expect(projected?.strokePathData).toBe("M0,0L10,0L10,10L0,10Z");
    expect(projected?.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 10 });
  });

  it("includes interior rings so holes do not fill with country color", () => {
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
          [2, 4],
          [2, 2],
        ],
      ],
    };

    const projected = projectGeometryToPathData(geometry, identityProjection, {
      coordinatePrecision: 0,
    });

    expect(projected?.pathData.match(/M/g)).toHaveLength(2);
    expect(projected?.pathData).toContain("M2,2L4,2L4,4L2,4Z");
  });

  it("projects subdivision border LineString paths and bounds", () => {
    const geometry: Geometry = {
      type: "LineString",
      coordinates: [
        [0, 0],
        [10, 0],
        [10, 5],
      ],
    };

    const projected = projectGeometryToPathData(geometry, identityProjection, {
      coordinatePrecision: 0,
    });

    expect(projected?.pathData).toBe("M0,0L10,0L10,5");
    expect(projected?.strokePathData).toBe("M0,0L10,0L10,5");
    expect(projected?.bounds).toEqual({ minX: 0, minY: 0, maxX: 10, maxY: 5 });
  });

  it("projects subdivision border MultiLineString paths", () => {
    const geometry: Geometry = {
      type: "MultiLineString",
      coordinates: [
        [
          [0, 0],
          [2, 0],
        ],
        [
          [4, 1],
          [4, 3],
        ],
      ],
    };

    const projected = projectGeometryToPathData(geometry, identityProjection, {
      coordinatePrecision: 0,
    });

    expect(projected?.pathData).toBe("M0,0L2,0M4,1L4,3");
    expect(projected?.strokePathData).toBe("M0,0L2,0M4,1L4,3");
    expect(projected?.bounds).toEqual({ minX: 0, minY: 0, maxX: 4, maxY: 3 });
  });

  it("projects Canada as a single fallback country without seam artifacts", () => {
    const data = mapDataFixture as MapData;
    const projection = makeMapProjection(data);
    const canada = data.countries.find((country) => country.id === "CAN");
    if (!canada) throw new Error("Missing Canada test data");

    expect(canada.regionIds).toEqual(["CAN-ALL"]);
    const projectedCanada = projectGeometryToPathData(
      getRegionGeometry(data, "CAN-ALL"),
      projection,
      renderPathOptions,
    );

    expect(projectedCanada?.pathData.length).toBeGreaterThan(1000);
    expect(projectedCanada?.pathData.length).toBeLessThan(750_000);
    expect(countShortArcticHorizontalSegments(projectedCanada?.pathData ?? "")).toBe(0);
    expect(countLongHorizontalSegments(projectedCanada?.strokePathData ?? "")).toBe(0);
    expect(countLikelyProjectedSeamStrokeSegments(projectedCanada?.strokePathData ?? "")).toBe(0);
    expect(countArcticHorizontalSeamSegments(projectedCanada?.strokePathData ?? "")).toBe(0);
    expect(countArcticDiagonalSeamSegments(projectedCanada?.strokePathData ?? "")).toBe(1);
    expect(
      hasSegmentNear(
        projectedCanada?.strokePathData ?? "",
        projection([-141, 60.31]) as [number, number],
        projection([-141, 69.65]) as [number, number],
      ),
    ).toBe(true);
  }, 15_000);

  it("keeps a Canada to United States transfer renderable without unioning the countries", () => {
    const data = mapDataFixture as MapData;
    const projection = makeMapProjection(data);
    const unitedStates = data.countries.find((country) => country.id === "USA");
    if (!unitedStates) throw new Error("Missing United States test data");

    const projectedTransferredFill = combineProjectedPathData(
      [...unitedStates.regionIds, "CAN-ALL"].map((regionId) =>
        projectGeometryToPathData(getRegionGeometry(data, regionId), projection, renderPathOptions),
      ),
    );

    expect(projectedTransferredFill?.pathData.length).toBeGreaterThan(1000);
    expect(projectedTransferredFill?.pathData.length).toBeLessThan(900_000);
    expect(countLongHorizontalSegments(projectedTransferredFill?.pathData ?? "")).toBe(0);
    expect(countLikelyProjectedSeamSegments(projectedTransferredFill?.pathData ?? "")).toBe(0);
  }, 15_000);

  it("removes the national outline between Canada and the United States after transfer", () => {
    const data = mapDataFixture as MapData;
    const projection = makeMapProjection(data);
    const unitedStatesBase = data.baseCountries.find((country) => country.entityId === "USA");
    if (!unitedStatesBase) throw new Error("Missing United States test data");

    const transferredOutlineGeometry = unionGeoJsonGeometriesClosingGaps(
      [unitedStatesBase.geometry, getRegionGeometry(data, "CAN-ALL")],
      0.08,
    );
    const projectedTransferredOutline = transferredOutlineGeometry
      ? projectGeometryToPathData(transferredOutlineGeometry, projection, renderPathOptions)
      : null;

    expect(projectedTransferredOutline?.pathData.length).toBeGreaterThan(1000);
    expect(
      hasSegmentNear(
        projectedTransferredOutline?.strokePathData ?? "",
        projection([-122.75, 48.99]) as [number, number],
        projection([-95.18, 48.99]) as [number, number],
      ),
    ).toBe(false);
    expect(
      hasSegmentNear(
        projectedTransferredOutline?.strokePathData ?? "",
        projection([-141, 69.65]) as [number, number],
        projection([-140.99, 60.3]) as [number, number],
      ),
    ).toBe(false);
  }, 15_000);

  it("projects United States outlines without Arctic seam strokes", () => {
    const data = mapDataFixture as MapData;
    const projection = makeMapProjection(data);
    const unitedStatesBase = data.baseCountries.find((country) => country.entityId === "USA");
    if (!unitedStatesBase) throw new Error("Missing United States test data");

    const projectedUnitedStates = projectGeometryToPathData(
      unitedStatesBase.geometry,
      projection,
      renderPathOptions,
    );

    expect(projectedUnitedStates?.pathData.length).toBeGreaterThan(1000);
    expect(projectedUnitedStates?.pathData).not.toBe(projectedUnitedStates?.strokePathData);
    expect(countGreatLakesClosureArtifacts(projectedUnitedStates?.strokePathData ?? "")).toBe(0);
    expect(countArcticHorizontalSeamSegments(projectedUnitedStates?.strokePathData ?? "")).toBe(1);
    expect(countArcticDiagonalSeamSegments(projectedUnitedStates?.strokePathData ?? "")).toBe(1);
    expect(
      hasSegmentNear(
        projectedUnitedStates?.strokePathData ?? "",
        projection([-122.75, 48.99]) as [number, number],
        projection([-95.18, 48.99]) as [number, number],
      ),
    ).toBe(true);
    expect(
      hasSegmentNear(
        projectedUnitedStates?.strokePathData ?? "",
        projection([-141, 69.65]) as [number, number],
        projection([-140.99, 60.3]) as [number, number],
      ),
    ).toBe(true);
  }, 15_000);

  it("projects Alaska subdivision borders without diagonal seam closures", () => {
    const data = mapDataFixture as MapData;
    const projection = makeMapProjection(data);
    const alaska = getRegionGeometry(data, "USA-US-AK");

    const projectedAlaska = projectGeometryToPathData(alaska, projection, renderPathOptions);
    const alaskaCanadaBorderStart = projection([-141, 69.65]);
    const alaskaCanadaBorderEnd = projection([-141, 60.31]);

    expect(projectedAlaska?.strokePathData.length).toBeGreaterThan(1000);
    expect(alaskaCanadaBorderStart).not.toBeNull();
    expect(alaskaCanadaBorderEnd).not.toBeNull();
    expect(
      hasSegmentNear(
        projectedAlaska?.strokePathData ?? "",
        alaskaCanadaBorderStart as [number, number],
        alaskaCanadaBorderEnd as [number, number],
      ),
    ).toBe(true);
    expect(countLongClosureSegments(projectedAlaska?.strokePathData ?? "")).toBe(0);
    expect(countArcticDiagonalClosureSegments(projectedAlaska?.strokePathData ?? "")).toBe(0);
  });

  it("projects United States after Alaska is separated without invented northern border closures", () => {
    const data = mapDataFixture as MapData;
    const projection = makeMapProjection(data);
    const unitedStatesBase = data.baseCountries.find((country) => country.entityId === "USA");
    const alaska = getRegionGeometry(data, "USA-US-AK");
    if (!unitedStatesBase) throw new Error("Missing United States test data");

    const unitedStatesWithoutAlaska = subtractGeoJsonGeometries(unitedStatesBase.geometry, [alaska]);
    const projectedUnitedStates = unitedStatesWithoutAlaska
      ? projectGeometryToPathData(unitedStatesWithoutAlaska, projection, renderPathOptions)
      : null;

    expect(projectedUnitedStates?.pathData.length).toBeGreaterThan(1000);
    expect(countNorthernClosureArtifacts(projectedUnitedStates?.strokePathData ?? "")).toBe(0);
    expect(countArcticDiagonalClosureSegments(projectedUnitedStates?.strokePathData ?? "")).toBe(0);
  });

  it("projects Russia with Kaliningrad subtracted without changing internal border rendering", () => {
    const data = mapDataFixture as MapData;
    const projection = makeMapProjection(data);
    const russiaBase = data.baseCountries.find((country) => country.entityId === "RUS");
    const kaliningrad = getRegionGeometry(data, "RUS-RU-KGD");
    if (!russiaBase) throw new Error("Missing Russia test data");

    const russiaWithoutKaliningrad = subtractGeoJsonGeometries(russiaBase.geometry, [kaliningrad]);
    const projectedRussia = russiaWithoutKaliningrad
      ? projectGeometryToPathData(russiaWithoutKaliningrad, projection, renderPathOptions)
      : null;
    const projectedYamalo = projectGeometryToPathData(
      getRegionGeometry(data, "RUS-RU-YAN"),
      projection,
      renderPathOptions,
    );

    expect(projectedRussia?.pathData.length).toBeGreaterThan(1000);
    expect(countLongHorizontalSegments(projectedRussia?.strokePathData ?? "")).toBe(0);
    expect(countLongClosureSegments(projectedRussia?.strokePathData ?? "")).toBe(0);
    expect(countLikelyProjectedSeamStrokeSegments(projectedRussia?.strokePathData ?? "")).toBe(0);
    expect(countArcticHorizontalSeamSegments(projectedRussia?.strokePathData ?? "")).toBe(0);
    expect(countArcticDiagonalSeamSegments(projectedRussia?.strokePathData ?? "")).toBe(0);
    expect(countLongClosureSegments(projectedYamalo?.strokePathData ?? "")).toBe(0);
    expect(countLikelyProjectedSeamStrokeSegments(projectedYamalo?.strokePathData ?? "")).toBe(0);
  });

  it("uses region-composed fills for Russia without projected seam strips", () => {
    const data = mapDataFixture as MapData;
    const projection = makeMapProjection(data);
    const russia = data.countries.find((country) => country.id === "RUS");
    if (!russia) throw new Error("Missing Russia test data");

    const projectedRussiaFill = combineProjectedPathData(
      russia.regionIds.map((regionId) =>
        projectGeometryToPathData(getRegionGeometry(data, regionId), projection, renderPathOptions),
      ),
    );
    const projectedNenets = projectGeometryToPathData(
      getRegionGeometry(data, "RUS-RU-NEN"),
      projection,
      renderPathOptions,
    );

    expect(projectedRussiaFill?.pathData.length).toBeGreaterThan(1000);
    expect(countLikelyProjectedSeamSegments(projectedRussiaFill?.pathData ?? "")).toBe(0);
    expect(countLikelyProjectedSeamSegments(projectedRussiaFill?.strokePathData ?? "")).toBe(0);
    expect(countLikelyProjectedSeamSegments(projectedNenets?.pathData ?? "")).toBe(0);
    expect(countLikelyProjectedSeamSegments(projectedNenets?.strokePathData ?? "")).toBe(0);
  });

  it("uses region-composed fills for Russia after a native region is transferred away", () => {
    const data = mapDataFixture as MapData;
    const projection = makeMapProjection(data);
    const russia = data.countries.find((country) => country.id === "RUS");
    if (!russia) throw new Error("Missing Russia test data");

    const projectedRussiaFill = combineProjectedPathData(
      russia.regionIds
        .filter((regionId) => regionId !== "RUS-RU-KGD")
        .map((regionId) =>
          projectGeometryToPathData(getRegionGeometry(data, regionId), projection, renderPathOptions),
        ),
    );

    expect(projectedRussiaFill?.pathData.length).toBeGreaterThan(1000);
    expect(countLongHorizontalSegments(projectedRussiaFill?.pathData ?? "")).toBe(0);
    expect(countLikelyProjectedSeamSegments(projectedRussiaFill?.pathData ?? "")).toBe(0);
  });

  it("splits exploded antimeridian fills into local subpaths instead of drawing across the map", () => {
    const data = mapDataFixture as MapData;
    const projection = makeMapProjection(data);
    const fiji = getRegionGeometry(data, "NE-242-ALL");
    const projectedFiji = projectGeometryToPathData(fiji, projection, renderPathOptions);

    expect(projectedFiji?.pathData.length).toBeGreaterThan(1000);
    expect(projectedFiji?.pathData).toBe(projectedFiji?.strokePathData);
    expect(countLikelyProjectedSeamSegments(projectedFiji?.pathData ?? "")).toBe(0);
    expect(countLongHorizontalSegments(projectedFiji?.pathData ?? "")).toBe(0);
    expect(countLikelyProjectedSeamSegments(projectedFiji?.strokePathData ?? "")).toBe(0);
    expect(countLongHorizontalSegments(projectedFiji?.strokePathData ?? "")).toBe(0);
    expect((projectedFiji?.bounds.maxY ?? 0) - (projectedFiji?.bounds.minY ?? 0)).toBeLessThan(20);
  });
});

function makeMapProjection(data: MapData): GeoProjection {
  return geoNaturalEarth1().fitExtent(
    [
      [16, 18],
      [984, 538],
    ],
    {
      type: "FeatureCollection",
      features: data.regions.map((region) => ({
        type: "Feature",
        properties: {},
        geometry: region.geometry,
      })),
    } satisfies FeatureCollection,
  );
}

function getRegionGeometry(data: MapData, regionId: string): Geometry {
  const region = data.regions.find((candidate) => candidate.id === regionId);
  if (!region) throw new Error(`Missing region ${regionId}`);
  return region.geometry;
}

function combineProjectedPathData(projectedPaths: Array<ProjectedPathData | null>): ProjectedPathData | null {
  let pathData = "";
  let strokePathData = "";
  let bounds: ProjectedPathData["bounds"] | null = null;

  for (const projected of projectedPaths) {
    if (!projected) continue;
    pathData += projected.pathData;
    strokePathData += projected.strokePathData;
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, projected.bounds.minX),
          minY: Math.min(bounds.minY, projected.bounds.minY),
          maxX: Math.max(bounds.maxX, projected.bounds.maxX),
          maxY: Math.max(bounds.maxY, projected.bounds.maxY),
        }
      : projected.bounds;
  }

  return pathData && bounds ? { pathData, strokePathData, bounds } : null;
}

function countLongHorizontalSegments(pathData: string): number {
  let count = 0;
  let previous: number[] | null = null;
  for (const match of pathData.matchAll(/([ML])([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?)/g)) {
    const command = match[1];
    const point = [Number(match[2]), Number(match[3])];
    if (command === "L" && previous) {
      const dx = Math.abs(point[0] - previous[0]);
      const dy = Math.abs(point[1] - previous[1]);
      if (dx > 350 && dy < 4) count += 1;
    }
    previous = point;
  }
  return count;
}

function countLongClosureSegments(pathData: string): number {
  let count = 0;
  let subpathStart: number[] | null = null;
  let previous: number[] | null = null;
  for (const match of pathData.matchAll(/([MLZ])(?:([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?))?/g)) {
    const command = match[1];
    if (command === "M" || command === "L") {
      const point = [Number(match[2]), Number(match[3])];
      if (command === "M") subpathStart = point;
      previous = point;
      continue;
    }
    if (command === "Z" && previous && subpathStart) {
      const dx = Math.abs(subpathStart[0] - previous[0]);
      const dy = Math.abs(subpathStart[1] - previous[1]);
      if (dx > 350 && dy < 4) count += 1;
    }
  }
  return count;
}

function countLikelyProjectedSeamStrokeSegments(pathData: string): number {
  return countLikelyProjectedSeamSegments(pathData, false);
}

function hasSegmentNear(pathData: string, a: [number, number], b: [number, number], tolerance = 0.08): boolean {
  let previous: number[] | null = null;
  for (const match of pathData.matchAll(/([ML])([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?)/g)) {
    const command = match[1];
    const point = [Number(match[2]), Number(match[3])];
    if (command === "L" && previous && sameSegment(previous, point, a, b, tolerance)) {
      return true;
    }
    previous = point;
  }
  return false;
}

function sameSegment(
  segmentStart: number[],
  segmentEnd: number[],
  expectedStart: [number, number],
  expectedEnd: [number, number],
  tolerance: number,
): boolean {
  return (
    (nearPoint(segmentStart, expectedStart, tolerance) && nearPoint(segmentEnd, expectedEnd, tolerance)) ||
    (nearPoint(segmentStart, expectedEnd, tolerance) && nearPoint(segmentEnd, expectedStart, tolerance))
  );
}

function nearPoint(a: number[], b: [number, number], tolerance: number): boolean {
  return Math.abs(a[0] - b[0]) <= tolerance && Math.abs(a[1] - b[1]) <= tolerance;
}

function countArcticHorizontalSeamSegments(pathData: string): number {
  let count = 0;
  let previous: number[] | null = null;
  for (const match of pathData.matchAll(/([ML])([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?)/g)) {
    const command = match[1];
    const point = [Number(match[2]), Number(match[3])];
    if (command === "L" && previous) {
      const dx = Math.abs(point[0] - previous[0]);
      const dy = Math.abs(point[1] - previous[1]);
      if (
        (dx > 55 && dy < 2 && Math.min(point[1], previous[1]) < 145) ||
        (dx > 35 && dy < 2 && Math.min(point[1], previous[1]) < 80)
      ) {
        count += 1;
      }
    }
    previous = point;
  }
  return count;
}

function countShortArcticHorizontalSegments(pathData: string): number {
  let count = 0;
  let previous: number[] | null = null;
  let subpathStart: number[] | null = null;
  for (const match of pathData.matchAll(/([MLZ])(?:([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?))?/g)) {
    const command = match[1];
    if (command === "M" || command === "L") {
      const point = [Number(match[2]), Number(match[3])];
      if (command === "M") subpathStart = point;
      if (command === "L" && previous && isShortArcticHorizontalSegment(previous, point)) count += 1;
      previous = point;
      continue;
    }
    if (command === "Z" && previous && subpathStart && isShortArcticHorizontalSegment(previous, subpathStart)) {
      count += 1;
    }
  }
  return count;
}

function countGreatLakesClosureArtifacts(pathData: string): number {
  let count = 0;
  let subpathStart: number[] | null = null;
  let previous: number[] | null = null;
  for (const match of pathData.matchAll(/([MLZ])(?:([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?))?/g)) {
    const command = match[1];
    if (command === "M" || command === "L") {
      const point = [Number(match[2]), Number(match[3])];
      if (command === "M") subpathStart = point;
      previous = point;
      continue;
    }
    if (command === "Z" && previous && subpathStart && isGreatLakesClosureArtifact(previous, subpathStart)) {
      count += 1;
    }
  }
  return count;
}

function isGreatLakesClosureArtifact(a: number[], b: number[]): boolean {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  return dx > 35 && dy > 8 && minY > 110 && maxY < 150;
}

function countNorthernClosureArtifacts(pathData: string): number {
  let count = 0;
  let subpathStart: number[] | null = null;
  let previous: number[] | null = null;
  for (const match of pathData.matchAll(/([MLZ])(?:([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?))?/g)) {
    const command = match[1];
    if (command === "M" || command === "L") {
      const point = [Number(match[2]), Number(match[3])];
      if (command === "M") subpathStart = point;
      previous = point;
      continue;
    }
    if (command === "Z" && previous && subpathStart && isNorthernClosureArtifact(previous, subpathStart)) {
      count += 1;
    }
  }
  return count;
}

function isNorthernClosureArtifact(a: number[], b: number[]): boolean {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  return dx > 55 && dy > 3 && minY > 115 && maxY < 145;
}

function isShortArcticHorizontalSegment(a: number[], b: number[]): boolean {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  return dx > 20 && dy < 0.08 && Math.min(a[1], b[1]) < 80;
}

function countArcticDiagonalSeamSegments(pathData: string): number {
  let count = 0;
  let previous: number[] | null = null;
  for (const match of pathData.matchAll(/([ML])([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?)/g)) {
    const command = match[1];
    const point = [Number(match[2]), Number(match[3])];
    if (command === "L" && previous) {
      const dx = Math.abs(point[0] - previous[0]);
      const dy = Math.abs(point[1] - previous[1]);
      const length = Math.hypot(dx, dy);
      if (dx > 20 && dy > 20 && length > 30 && Math.min(point[1], previous[1]) < 100) count += 1;
    }
    previous = point;
  }
  return count;
}

function countArcticDiagonalClosureSegments(pathData: string): number {
  let count = 0;
  let previous: number[] | null = null;
  let subpathStart: number[] | null = null;
  for (const match of pathData.matchAll(/([MLZ])(?:([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?))?/g)) {
    const command = match[1];
    if (command === "M" || command === "L") {
      const point = [Number(match[2]), Number(match[3])];
      if (command === "M") subpathStart = point;
      previous = point;
      continue;
    }
    if (command === "Z" && previous && subpathStart) {
      const dx = Math.abs(subpathStart[0] - previous[0]);
      const dy = Math.abs(subpathStart[1] - previous[1]);
      if (dx > 35 && dy > 8 && Math.min(subpathStart[1], previous[1]) < 120) count += 1;
    }
  }
  return count;
}

function countLikelyProjectedSeamSegments(pathData: string, includeClosures = true): number {
  let count = 0;
  let subpathStart: number[] | null = null;
  let previous: number[] | null = null;
  for (const match of pathData.matchAll(/([MLZ])(?:([-]?\d+(?:\.\d+)?),([-]?\d+(?:\.\d+)?))?/g)) {
    const command = match[1];
    if (command === "M" || command === "L") {
      const point = [Number(match[2]), Number(match[3])];
      if (command === "M") subpathStart = point;
      if (command === "L" && previous && isLikelyProjectedSeamSegment(previous, point)) count += 1;
      previous = point;
      continue;
    }
    if (includeClosures && command === "Z" && previous && subpathStart && isLikelyProjectedSeamSegment(previous, subpathStart)) {
      count += 1;
    }
  }
  return count;
}

function isLikelyProjectedSeamSegment(a: number[], b: number[]): boolean {
  const dx = Math.abs(a[0] - b[0]);
  const dy = Math.abs(a[1] - b[1]);
  return dx > 80 && dy < 8 && Math.min(a[1], b[1]) < 110;
}
