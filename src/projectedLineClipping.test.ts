import { describe, expect, it } from "vitest";
import { geoIdentity, geoNaturalEarth1, type GeoProjection } from "d3-geo";
import type { Geometry } from "geojson";
import mapDataFixture from "../public/data/map-data.json";
import { clipProjectedLinePath, clipProjectedLinePaths } from "./projectedLineClipping";
import { batchBoundaryPaths, batchBoundaryTransitionPaths, type BatchedBoundaryPaths } from "./boundaryEdges";
import { projectGeometryStrokeToPathData } from "./projectedPath";
import type { MapData } from "./types";

const viewport = { minX: 0, minY: 0, maxX: 10, maxY: 10 };

describe("projected line clipping", () => {
  it("reuses contained edges and clips crossings before display grouping", () => {
    const inside = { id: "inside", pathData: "M2,2L8,8", bounds: { minX: 2, minY: 2, maxX: 8, maxY: 8 } };
    const crossing = { id: "crossing", pathData: "M-5,5L15,5", bounds: { minX: -5, minY: 5, maxX: 15, maxY: 5 } };
    const outside = { id: "outside", pathData: "M20,20L30,30", bounds: { minX: 20, minY: 20, maxX: 30, maxY: 30 } };
    const result = clipProjectedLinePaths([inside, crossing, outside], viewport);
    expect(result).toHaveLength(2);
    expect(result[0]).toBe(inside);
    expect(result[1]).toEqual({ ...crossing, pathData: "M0,5L10,5" });
    expect(crossing.pathData).toBe("M-5,5L15,5");
    expect(clipProjectedLinePaths([crossing], { ...viewport, minX: 10, maxX: 20 })[0].pathData).toBe("M10,5L15,5");
  });

  it("accounts for coordinate rounding at the viewport edge", () => {
    const rounded = { pathData: "M0,5L10,5", bounds: { minX: 0.004, minY: 5, maxX: 10.004, maxY: 5 } };
    const result = clipProjectedLinePaths([rounded], { ...viewport, minX: 0.002 });
    expect(result[0].pathData).toBe("M0.002,5L10,5");
  });

  it("preserves political, selected, and animated borders when ownership changes", () => {
    const edges = [
      { id: "coast", regionIds: ["a", null] as [string, null], pathData: "M-5,2L15,2", bounds: { minX: -5, minY: 2, maxX: 15, maxY: 2 } },
      { id: "admin", regionIds: ["a", "b"] as [string, string], pathData: "M2,-5L2,15", bounds: { minX: 2, minY: -5, maxX: 2, maxY: 15 } },
      { id: "country", regionIds: ["a", "c"] as [string, string], pathData: "M3,3L8,8", bounds: { minX: 3, minY: 3, maxX: 8, maxY: 8 } },
    ];
    const owners = { a: "AAA", b: "AAA", c: "BBB" };
    const next = { ...owners, a: "BBB" };
    const options = { selectedEntityId: "AAA", activeAdministrativeEntityId: "AAA" };
    const clipBatch = (paths: BatchedBoundaryPaths) => Object.fromEntries(Object.entries(paths).map(([key, path]) => [key, clipProjectedLinePath(path, viewport)]));
    const clipped = clipProjectedLinePaths(edges, viewport);
    expect(batchBoundaryPaths(clipped, owners, options)).toEqual(clipBatch(batchBoundaryPaths(edges, owners, options)));
    const before = batchBoundaryTransitionPaths(edges, owners, next, options);
    const after = batchBoundaryTransitionPaths(clipped, owners, next, options);
    for (const key of ["stable", "previous", "next"] as const) expect(after[key]).toEqual(clipBatch(before[key]));
  });

  it("keeps paths inside the viewport unchanged and removes paths outside it", () => {
    const inside = "M1.00,2.00L3.00,4.00L5.00,6.00";
    expect(clipProjectedLinePath(inside, viewport)).toBe(inside);
    expect(clipProjectedLinePath("M-3,-2L-1,-1M20,20L30,30", viewport)).toBe("");
  });

  it("keeps horizontal, vertical, and diagonal crossings with outside endpoints", () => {
    expect(clipProjectedLinePath("M-5,5L15,5M5,-5L5,15M-5,-5L15,15", viewport))
      .toBe("M0,5L10,5M5,0L5,10M0,0L10,10");
  });

  it("breaks linework after removed sections without joining viewport edges", () => {
    expect(clipProjectedLinePath("M5,5L15,5L15,8L5,8", viewport))
      .toBe("M5,5L10,5M10,8L5,8");
  });

  it("keeps original subpath breaks such as antimeridian boundaries", () => {
    expect(clipProjectedLinePath("M-5,5L5,5M5,5L15,5", viewport))
      .toBe("M0,5L5,5M5,5L10,5");
  });

  it("clips a closed ring's original closing edge without adding a clip border", () => {
    expect(clipProjectedLinePath("M-5,2L5,2L5,12Z", viewport))
      .toBe("M0,2L5,2L5,10M3,10L0,7");
    expect(clipProjectedLinePath("M-5,-5L15,-5L15,15L-5,15Z", viewport)).toBe("");
  });

  it("preserves small segments and linework on the viewport boundary", () => {
    const path = "M-1,0L0,0L0.00000001,0L0.00000002,0";
    expect(clipProjectedLinePath(path, viewport)).toBe("M0,0L0,0L1e-8,0L2e-8,0");
  });

  it("accepts implicit coordinate pairs, whitespace, and scientific notation", () => {
    expect(clipProjectedLinePath("M -5 5 5 5 L 1.5e1,5", viewport)).toBe("M0,5L5,5L10,5");
  });

  it("preserves unsupported commands and invalid viewport bounds", () => {
    const path = "M-5,5C0,0,10,10,15,5";
    expect(clipProjectedLinePath(path, viewport)).toBe(path);
    expect(clipProjectedLinePath("M-5,5L15,5", { ...viewport, minX: NaN })).toBe("M-5,5L15,5");
  });

  it("updates cached linework when the viewport changes", () => {
    const path = "M-20,3L30,3";
    expect(clipProjectedLinePath(path, viewport)).toBe("M0,3L10,3");
    expect(clipProjectedLinePath(path, { ...viewport, minX: 10, maxX: 20 })).toBe("M10,3L20,3");
    expect(clipProjectedLinePath(path, viewport)).toBe("M0,3L10,3");
  });

  it("keeps clipped polygon outlines on their original edges", () => {
    const projection = geoIdentity().reflectY(false) as unknown as GeoProjection;
    const geometry: Geometry = {
      type: "Polygon",
      coordinates: [[[-5, 2], [5, 2], [5, 8], [-5, 8], [-5, 2]]],
    };
    const outline = projectGeometryStrokeToPathData(geometry, projection)?.pathData ?? "";
    expect(clipProjectedLinePath(outline, viewport)).toBe("M0,2L5,2L5,8L0,8");
  });

  it("bounds real world border linework without losing crossings", () => {
    const data = mapDataFixture as MapData;
    const projection = geoNaturalEarth1().fitExtent([[16, 18], [984, 538]], {
      type: "FeatureCollection",
      features: data.regions.map((region) => ({ type: "Feature", properties: {}, geometry: region.geometry })),
    });
    const mapBounds = { minX: 0, minY: 0, maxX: 1000, maxY: 560 };
    const projectedEdges = data.boundaryEdges.flatMap((edge) => {
      const path = projectGeometryStrokeToPathData(edge.geometry, projection, { coordinatePrecision: 2, seamBreakDistance: 220 });
      return path ? [{ ...edge, ...path }] : [];
    });
    const worldLinework = projectedEdges.map((edge) => edge.pathData).join("");
    expect(clipProjectedLinePath(worldLinework, mapBounds)).toBe(worldLinework);
    const germany = projection([10, 51]);
    if (!germany) throw new Error("Missing Germany projected position");
    const germanyBounds = { minX: germany[0] - 15, minY: germany[1] - 15, maxX: germany[0] + 15, maxY: germany[1] + 15 };
    const clipped = clipProjectedLinePath(worldLinework, germanyBounds);
    const clippedEdges = clipProjectedLinePaths(projectedEdges, germanyBounds).map((edge) => edge.pathData).join("");
    const normalize = (path: string) => path.replace(/[-+]?(?:\d*\.?\d+)(?:e[-+]?\d+)?/gi, (number) => String(Number(number)));
    expect(normalize(clippedEdges)).toBe(normalize(clipped));
    expect(clipped.length).toBeGreaterThan(1000);
    expect(clipped.length).toBeLessThan(worldLinework.length / 20);
    for (const match of clipped.matchAll(/[ML]([-+\d.eE]+),([-+\d.eE]+)/g)) {
      const x = Number(match[1]);
      const y = Number(match[2]);
      expect(x).toBeGreaterThanOrEqual(germanyBounds.minX - 1e-9);
      expect(x).toBeLessThanOrEqual(germanyBounds.maxX + 1e-9);
      expect(y).toBeGreaterThanOrEqual(germanyBounds.minY - 1e-9);
      expect(y).toBeLessThanOrEqual(germanyBounds.maxY + 1e-9);
    }
  });
});
