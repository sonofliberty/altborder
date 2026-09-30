import { describe, expect, it } from "vitest";
import { interpolateZoom, zoomToBounds } from "./mapZoom";

describe("map zoom helpers", () => {
  it("keeps a zoom anchor fixed throughout an animated zoom", () => {
    const start = { x: 50, y: -20, k: 3 };
    const end = { x: -350, y: -740, k: 9 };
    const anchor = { x: 250, y: 340 };
    const point = { x: (anchor.x - start.x) / start.k, y: (anchor.y - start.y) / start.k };

    for (const progress of [0, 0.1, 0.25, 0.5, 0.9, 1]) {
      const frame = interpolateZoom(start, end, progress);
      expect(frame.x + point.x * frame.k).toBeCloseTo(anchor.x);
      expect(frame.y + point.y * frame.k).toBeCloseTo(anchor.y);
      expect(frame.k).toBeGreaterThanOrEqual(start.k);
      expect(frame.k).toBeLessThanOrEqual(end.k);
    }
    expect(interpolateZoom(start, end, 0)).toEqual(start);
    expect(interpolateZoom(start, end, 1)).toEqual(end);
  });

  it("interpolates panning when the zoom scale does not change", () => {
    expect(interpolateZoom({ x: 20, y: 40, k: 2 }, { x: 100, y: 240, k: 2 }, 0.5))
      .toEqual({ x: 60, y: 140, k: 2 });
  });

  it("fits bounds inside the viewport padding", () => {
    const zoom = zoomToBounds({ minX: 0, minY: 0, maxX: 100, maxY: 100 }, 50);

    const left = zoom.x;
    const top = zoom.y;
    const right = zoom.x + 100 * zoom.k;
    const bottom = zoom.y + 100 * zoom.k;

    expect(left).toBeGreaterThanOrEqual(50);
    expect(top).toBeGreaterThanOrEqual(50);
    expect(right).toBeLessThanOrEqual(950);
    expect(bottom).toBeLessThanOrEqual(510);
  });

  it("clamps zoom for very large and very small bounds", () => {
    expect(zoomToBounds({ minX: 0, minY: 0, maxX: 10000, maxY: 10000 }, 50).k).toBe(0.8);
    expect(zoomToBounds({ minX: 0, minY: 0, maxX: 0.1, maxY: 0.1 }, 50).k).toBe(30);
  });
});
