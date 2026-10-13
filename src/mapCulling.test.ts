import { describe, expect, it } from "vitest";
import { boundsIntersect, projectedViewportBounds, shouldCullPaths, shouldRefreshCullingZoom } from "./mapCulling";
import { svgViewportBounds, type ProjectedBounds } from "./mapZoom";

describe("map path culling", () => {
  it("keeps culling active during high-zoom movement", () => {
    expect(shouldCullPaths({ isMapMoving: false, minZoom: 2.1, zoomScale: 2.1 })).toBe(true);
    expect(shouldCullPaths({ isMapMoving: false, minZoom: 2.1, zoomScale: 1.9 })).toBe(false);
    expect(shouldCullPaths({ isMapMoving: true, minZoom: 2.1, zoomScale: 5 })).toBe(true);
  });

  it("reuses prepared paths for small zooms and pans within the overscan", () => {
    const previous = { x: -4500, y: -2520, k: 10 };
    expect(shouldRefreshCullingZoom(previous, { x: -4800, y: -2660, k: 10.6 }, 1000, 560, 0.42)).toBe(false);
    expect(shouldRefreshCullingZoom(previous, { ...previous, x: previous.x + 300 }, 1000, 560, 0.42)).toBe(false);
  });

  it("refreshes before a fast pan reveals unprepared land", () => {
    const previous = { x: -4500, y: -2520, k: 10 };
    for (const next of [{ ...previous, x: previous.x + 500 }, { ...previous, y: previous.y - 300 }]) {
      expect(shouldRefreshCullingZoom(previous, next, 1000, 560, 0.42)).toBe(true);
    }
  });

  it("refreshes after a substantial zoom in or out", () => {
    const previous = { x: 0, y: 0, k: 1 };
    expect(shouldRefreshCullingZoom(previous, { ...previous, k: 1.4 }, 1000, 560, 0.42)).toBe(true);
    expect(shouldRefreshCullingZoom(previous, { ...previous, k: 0.7 }, 1000, 560, 0.42)).toBe(true);
  });

  it("converts screen viewport into projected map bounds with overscan", () => {
    const bounds = projectedViewportBounds({
      width: 1000,
      height: 500,
      overscanRatio: 0.5,
      zoom: { x: -300, y: -100, k: 2 },
    });

    expect(bounds).toEqual({
      minX: -100,
      minY: -75,
      maxX: 900,
      maxY: 425,
    });
  });

  it("detects visible and offscreen projected bounds", () => {
    const viewport: ProjectedBounds = { minX: 0, minY: 0, maxX: 100, maxY: 100 };

    expect(boundsIntersect(viewport, { minX: 20, minY: 20, maxX: 40, maxY: 40 })).toBe(true);
    expect(boundsIntersect(viewport, { minX: 100, minY: 30, maxX: 140, maxY: 50 })).toBe(true);
    expect(boundsIntersect(viewport, { minX: 101, minY: 30, maxX: 140, maxY: 50 })).toBe(false);
  });

  it("includes the full portrait stage outside the centered viewBox", () => {
    const viewport = svgViewportBounds(390, 650);
    const zoom = { x: -4500, y: -2520, k: 10 };
    const bounds = projectedViewportBounds({ width: 1000, height: 560, overscanRatio: 0, zoom, viewport });
    expect(bounds.minX).toBeCloseTo(450);
    expect(bounds.maxX).toBeCloseTo(550);
    expect(bounds.minY).toBeCloseTo(196.6666667);
    expect(bounds.maxY).toBeCloseTo(363.3333333);
    expect(shouldRefreshCullingZoom(zoom, { ...zoom, y: zoom.y + 400 }, 1000, 560, 0.42, viewport)).toBe(false);
    expect(shouldRefreshCullingZoom(zoom, { ...zoom, y: zoom.y + 800 }, 1000, 560, 0.42, viewport)).toBe(true);
  });
});

