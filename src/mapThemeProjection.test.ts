import { geoNaturalEarth1 } from "d3-geo";
import { describe, expect, it } from "vitest";
import { getMapThemeRasterTransform } from "./mapThemeProjection";
import raster from "./mapThemeRaster.json";

describe("map theme raster alignment", () => {
  const source = geoNaturalEarth1().scale(raster.scale).translate(raster.translate as [number, number]);
  const positions: [number, number][] = [[7.7, 48.6], [-72, -15], [145, -32], [35, 70], [0, 0]];

  it("leaves textures in place for the prepared map projection", () => {
    expect(getMapThemeRasterTransform(source)).toBe("translate(0 0) scale(1)");
  });

  it("keeps terrain under the same geographic point after the map fit changes", () => {
    const target = geoNaturalEarth1().scale(238.75).translate([603, 301]);
    const transform = getMapThemeRasterTransform(target);
    const values = transform.match(/-?\d+(?:\.\d+)?(?:e[+-]?\d+)?/gi)!.map(Number);
    const [x, y, scale] = values;
    for (const position of positions) {
      const original = source(position)!;
      const expected = target(position)!;
      expect(original[0] * scale + x).toBeCloseTo(expected[0], 8);
      expect(original[1] * scale + y).toBeCloseTo(expected[1], 8);
    }
  });
});
