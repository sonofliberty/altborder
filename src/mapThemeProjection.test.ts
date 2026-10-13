import { geoNaturalEarth1 } from "d3-geo";
import { describe, expect, it } from "vitest";
import { getMapThemeOverviewClipPath, getMapThemeRasterBounds, getMapThemeRasterTiles, getMapThemeRasterTransform } from "./mapThemeProjection";
import raster from "./mapThemeRaster.json";
import atlas from "./mapThemeTiles.json";

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

  it.each(["hoi4", "eu4", "ocean"] as const)("partitions %s detail into aligned cells with interpolation borders", (name) => {
    const tiles = getMapThemeRasterTiles(name, source);
    const { width, height } = atlas.textures[name];
    expect(tiles).toHaveLength(Math.ceil(width / atlas.tileSize) * Math.ceil(height / atlas.tileSize));
    expect(tiles.reduce((sum, tile) => sum + tile.width * tile.height, 0)).toBeCloseTo(raster.width * raster.height);
    for (const tile of tiles) {
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
      expect(tile.x + tile.width).toBeLessThanOrEqual(raster.width);
      expect(tile.y + tile.height).toBeLessThanOrEqual(raster.height);
      expect(tile.imageX).toBeLessThanOrEqual(tile.x);
      expect(tile.imageY).toBeLessThanOrEqual(tile.y);
      expect(tile.imageX + tile.imageWidth).toBeGreaterThanOrEqual(tile.x + tile.width - 1e-10);
      expect(tile.imageY + tile.imageHeight).toBeGreaterThanOrEqual(tile.y + tile.height - 1e-10);
      expect(tile.imageWidth * width / raster.width).toBeLessThanOrEqual(atlas.tileSize + atlas.bleed * 2 + 1e-10);
      expect(tile.imageHeight * height / raster.height).toBeLessThanOrEqual(atlas.tileSize + atlas.bleed * 2 + 1e-10);
    }
  });

  it("decodes only the cells around a close camera view", () => {
    const [x, y] = source([7.7, 48.6])!;
    const tiles = getMapThemeRasterTiles("hoi4", source, { minX: x - 20, minY: y - 12, maxX: x + 20, maxY: y + 12 });
    expect(tiles.length).toBeGreaterThan(0);
    expect(tiles.length).toBeLessThanOrEqual(4);
    expect(tiles.some((tile) => x >= tile.x && x <= tile.x + tile.width && y >= tile.y && y <= tile.y + tile.height)).toBe(true);
  });

  it("selects the same source cells after projection scale and translation change", () => {
    const target = geoNaturalEarth1().scale(source.scale() * 2).translate([640, 330]);
    const point = source([7.7, 48.6])!;
    const targetPoint = target([7.7, 48.6])!;
    const first = getMapThemeRasterTiles("hoi4", source, {
      minX: point[0] - 30, minY: point[1] - 20, maxX: point[0] + 30, maxY: point[1] + 20,
    });
    const second = getMapThemeRasterTiles("hoi4", target, {
      minX: targetPoint[0] - 60, minY: targetPoint[1] - 40, maxX: targetPoint[0] + 60, maxY: targetPoint[1] + 40,
    });
    expect(second).toEqual(first);
  });

  it("does not request a neighboring cell when a camera ends exactly at a cell edge", () => {
    const width = atlas.tileSize / atlas.textures.hoi4.width * raster.width;
    const height = atlas.tileSize / atlas.textures.hoi4.height * raster.height;
    expect(getMapThemeRasterTiles("hoi4", source, { minX: 0, minY: 0, maxX: width, maxY: height }).map((tile) => tile.id)).toEqual(["0-0"]);
  });

  it.each([
    { minX: -100, minY: -100, maxX: 0, maxY: 0 },
    { minX: 1000, minY: 560, maxX: 1100, maxY: 660 },
    { minX: 30, minY: 20, maxX: 20, maxY: 30 },
    { minX: NaN, minY: 0, maxX: 1000, maxY: 560 },
  ])("avoids decoding for an empty or invalid viewport: %j", (bounds) => {
    expect(getMapThemeRasterTiles("hoi4", source, bounds)).toEqual([]);
  });

  it("cuts decoded transparent cells out of the overview to avoid double shading", () => {
    const tile = getMapThemeRasterTiles("hoi4", source)[0];
    expect(getMapThemeOverviewClipPath([tile])).toBe(`M0,0H1000V560H0ZM0,0h${tile.width}v${tile.height}h${-tile.width}Z`);
  });

  it("bounds the overview mask itself to the camera rather than the transformed world", () => {
    const target = geoNaturalEarth1().scale(source.scale() * 2).translate([640, 330]);
    const bounds = getMapThemeRasterBounds(target, { minX: 600, minY: 280, maxX: 680, maxY: 360 });
    expect(bounds).toEqual({ minX: 480, minY: 253, maxX: 520, maxY: 293 });
    const tile = getMapThemeRasterTiles("hoi4", source).find((cell) => cell.x < 500 && cell.x + cell.width > 500 && cell.y < 270 && cell.y + cell.height > 270)!;
    expect(getMapThemeOverviewClipPath([tile], bounds)).toBe("M480,253H520V293H480ZM480,253h32v40h-32Z");
  });

  it("does not draw overview exclusion holes outside the camera", () => {
    const tile = getMapThemeRasterTiles("hoi4", source)[0];
    expect(getMapThemeOverviewClipPath([tile], { minX: 480, minY: 253, maxX: 520, maxY: 293 })).toBe("M480,253H520V293H480Z");
  });
});
