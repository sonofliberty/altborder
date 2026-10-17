import { describe, expect, it } from "vitest";
import { cameraViewportTransform, interpolateZoom, svgViewportPoint, zoomFromTouchPair, zoomToBounds } from "./mapZoom";

describe("map zoom helpers", () => {
  it.each([[1280, 732], [390, 650], [844, 300]])("composes the cached camera correctly in a %s by %s viewport", (width, height) => {
    const rendered = { x: -400, y: -220, k: 2 };
    const camera = { x: -750, y: -400, k: 3 };
    const delta = cameraViewportTransform(camera, rendered, width, height);
    const scale = Math.min(width / 1000, height / 560);
    const offset = { x: (width - 1000 * scale) / 2, y: (height - 560 * scale) / 2 };
    const point = { x: 510, y: 125 };
    const cached = { x: offset.x + scale * (rendered.x + point.x * rendered.k), y: offset.y + scale * (rendered.y + point.y * rendered.k) };
    expect(delta.x + cached.x * delta.k).toBeCloseTo(offset.x + scale * (camera.x + point.x * camera.k));
    expect(delta.y + cached.y * delta.k).toBeCloseTo(offset.y + scale * (camera.y + point.y * camera.k));
    const client = { x: 20 + offset.x + 500 * scale, y: 68 + offset.y + 280 * scale };
    const converted = svgViewportPoint(client.x, client.y, { x: 20, y: 68, width, height });
    expect(converted.x).toBeCloseTo(500);
    expect(converted.y).toBeCloseTo(280);
  });

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

  it("fits selected land within the map area left beside a floating panel", () => {
    const land = { minX: 300, minY: 100, maxX: 600, maxY: 300 };
    const viewport = { minX: -40, minY: 30, maxX: 680, maxY: 520 };
    const zoom = zoomToBounds(land, 40, viewport);
    expect(zoom.x + land.minX * zoom.k).toBeGreaterThanOrEqual(viewport.minX + 40);
    expect(zoom.x + land.maxX * zoom.k).toBeLessThanOrEqual(viewport.maxX - 40);
    expect(zoom.y + land.minY * zoom.k).toBeGreaterThanOrEqual(viewport.minY + 40);
    expect(zoom.y + land.maxY * zoom.k).toBeLessThanOrEqual(viewport.maxY - 40 + 1e-8);
    expect(zoom.x + (land.minX + land.maxX) / 2 * zoom.k).toBeCloseTo((viewport.minX + viewport.maxX) / 2);
  });
});

describe("touch map navigation", () => {
  const start: [{ x: number; y: number }, { x: number; y: number }] = [{ x: 200, y: 240 }, { x: 400, y: 240 }];

  it("keeps the map point under the moving pinch midpoint", () => {
    const current = { x: -100, y: 40, k: 2 };
    const next = zoomFromTouchPair(current, start, [{ x: 150, y: 300 }, { x: 550, y: 300 }]);
    expect(next.k).toBe(4);
    expect(next.x + 200 * next.k).toBe(350);
    expect(next.y + 100 * next.k).toBe(300);
  });

  it("pans with two fingers at constant separation", () => {
    expect(zoomFromTouchPair({ x: 0, y: 0, k: 1 }, start, [{ x: 260, y: 280 }, { x: 460, y: 280 }]))
      .toEqual({ x: 60, y: 40, k: 1 });
  });

  it("clamps pinch zoom without moving its geographic anchor", () => {
    const next = zoomFromTouchPair({ x: 0, y: 0, k: 20 }, start, [{ x: 0, y: 240 }, { x: 600, y: 240 }]);
    expect(next.k).toBe(30);
    expect(next.x + 15 * next.k).toBe(300);
    expect(zoomFromTouchPair({ x: 0, y: 0, k: 1 }, start, [{ x: 295, y: 240 }, { x: 305, y: 240 }]).k).toBe(0.8);
  });

  it("handles coincident starting touches without non-finite transforms", () => {
    const next = zoomFromTouchPair({ x: 0, y: 0, k: 1 }, [start[0], start[0]], start);
    expect(next).toEqual({ x: 100, y: 0, k: 1 });
  });
});
