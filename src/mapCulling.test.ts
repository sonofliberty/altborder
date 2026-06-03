import { describe, expect, it } from "vitest";
import { boundsIntersect, projectedViewportBounds, shouldCullPaths } from "./mapCulling";
import type { ProjectedBounds } from "./mapZoom";

describe("map path culling", () => {
  it("only culls when the map is settled and zoomed in enough", () => {
    expect(shouldCullPaths({ isMapMoving: false, minZoom: 2.1, zoomScale: 2.1 })).toBe(true);
    expect(shouldCullPaths({ isMapMoving: false, minZoom: 2.1, zoomScale: 1.9 })).toBe(false);
    expect(shouldCullPaths({ isMapMoving: true, minZoom: 2.1, zoomScale: 5 })).toBe(false);
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
});

