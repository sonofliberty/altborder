import { describe, expect, it } from "vitest";
import { zoomToBounds } from "./mapZoom";

describe("map zoom helpers", () => {
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
