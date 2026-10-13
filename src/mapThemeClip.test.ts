import { describe, expect, it } from "vitest";
import { clipMapThemeCountryPaths, clipMapThemePolygonPath } from "./mapThemeClip";

const viewport = { minX: 20, minY: 20, maxX: 80, maxY: 80 };

function contains(pathData: string, x: number, y: number): boolean {
  let inside = false;
  for (const ring of pathData.split("Z")) {
    const points = [...ring.matchAll(/[ML]([-+\d.e]+),([-+\d.e]+)/gi)].map((match) => [Number(match[1]), Number(match[2])]);
    let previous = points[points.length - 1];
    for (const current of points) {
      if ((current[1] > y) !== (previous[1] > y)
        && x < (previous[0] - current[0]) * (y - current[1]) / (previous[1] - current[1]) + current[0]) inside = !inside;
      previous = current;
    }
  }
  return inside;
}

describe("viewport-bounded map masks", () => {
  it("drops distant islands from a visible country and preserves other underlay fields", () => {
    const country = {
      id: "France", color: "blue", bounds: { minX: 0, minY: 0, maxX: 960, maxY: 420 },
      pathData: "M0,0L100,0L100,100L0,100ZM900,400L960,400L960,420L900,420Z",
    };
    const result = clipMapThemeCountryPaths([country], viewport);
    expect(result).toHaveLength(1);
    expect(result[0].color).toBe("blue");
    expect(result[0].bounds).toBe(country.bounds);
    expect(result[0].pathData).not.toContain("900");
    const points = [...result[0].pathData.matchAll(/[ML]([-+\d.e]+),([-+\d.e]+)/gi)];
    for (const point of points) {
      expect(Number(point[1])).toBeGreaterThanOrEqual(viewport.minX);
      expect(Number(point[1])).toBeLessThanOrEqual(viewport.maxX);
      expect(Number(point[2])).toBeGreaterThanOrEqual(viewport.minY);
      expect(Number(point[2])).toBeLessThanOrEqual(viewport.maxY);
    }
    expect(contains(result[0].pathData, 50, 50)).toBe(true);
  });

  it("keeps even-odd holes when a country surrounds the camera", () => {
    const path = clipMapThemePolygonPath("M0,0L100,0L100,100L0,100ZM40,40L60,40L60,60L40,60Z", viewport);
    expect(contains(path, 30, 30)).toBe(true);
    expect(contains(path, 50, 50)).toBe(false);
  });

  it("preserves a concave country that is split into disconnected visible pieces", () => {
    const path = clipMapThemePolygonPath("M0,0L100,0L100,100L70,100L70,30L30,30L30,100L0,100Z", {
      minX: 10, minY: 40, maxX: 90, maxY: 80,
    });
    expect(contains(path, 20, 60)).toBe(true);
    expect(contains(path, 50, 60)).toBe(false);
    expect(contains(path, 80, 60)).toBe(true);
  });

  it("clips a hole that crosses the camera edge without filling it", () => {
    const path = clipMapThemePolygonPath("M0,0L100,0L100,100L0,100ZM10,40L60,40L60,60L10,60Z", viewport);
    expect(contains(path, 30, 50)).toBe(false);
    expect(contains(path, 70, 50)).toBe(true);
  });

  it("handles implicit polygon closure and exponent coordinates", () => {
    const path = clipMapThemePolygonPath("M0,0L1e2,0L100,100L0,100", viewport);
    expect(contains(path, 50, 50)).toBe(true);
    expect(path).toMatch(/Z$/);
  });

  it("reuses contained country objects and removes countries outside the viewport", () => {
    const contained = { id: "inside", pathData: "M30,30L50,30L50,50L30,50Z" };
    const outside = { id: "outside", pathData: "M100,100L150,100L150,150L100,150Z" };
    expect(clipMapThemeCountryPaths([contained, outside], viewport)).toEqual([contained]);
    expect(clipMapThemeCountryPaths([contained], viewport)[0]).toBe(contained);
  });

  it("preserves the original paths when no viewport is supplied", () => {
    const countries = [{ id: "land", pathData: "M0,0L100,0L100,100Z" }];
    expect(clipMapThemeCountryPaths(countries)).toBe(countries);
    expect(clipMapThemePolygonPath(countries[0].pathData)).toBe(countries[0].pathData);
  });

  it("preserves an unsupported future curve rather than losing its land", () => {
    const path = "M20,20C30,10,70,10,80,20L80,80Z";
    expect(clipMapThemePolygonPath(path, viewport)).toBe(path);
  });
});
