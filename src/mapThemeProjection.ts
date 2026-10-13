import type { GeoProjection } from "d3-geo";
import type { ProjectedBounds } from "./mapZoom";
import type { MapThemeId } from "./types";
import raster from "./mapThemeRaster.json";
import tileAtlas from "./mapThemeTiles.json";

export type MapThemeRasterName = MapThemeId | "ocean";
export type MapThemeRasterTile = {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  imageX: number;
  imageY: number;
  imageWidth: number;
  imageHeight: number;
};

function rasterPlacement(projection: GeoProjection): { x: number; y: number; scale: number } {
  const scale = projection.scale() / raster.scale;
  const translate = projection.translate();
  return {
    x: translate[0] - raster.translate[0] * scale,
    y: translate[1] - raster.translate[1] * scale,
    scale,
  };
}

/** Keep the preprojected raster aligned if map-data bounds change the fit. */
export function getMapThemeRasterTransform(projection: GeoProjection): string {
  const { x, y, scale } = rasterPlacement(projection);
  return `translate(${x} ${y}) scale(${scale})`;
}

export function getMapThemeRasterBounds(projection: GeoProjection, viewportBounds?: ProjectedBounds): ProjectedBounds {
  if (!viewportBounds) return { minX: 0, minY: 0, maxX: raster.width, maxY: raster.height };
  const { x, y, scale } = rasterPlacement(projection);
  return {
    minX: Math.max(0, (viewportBounds.minX - x) / scale),
    minY: Math.max(0, (viewportBounds.minY - y) / scale),
    maxX: Math.min(raster.width, (viewportBounds.maxX - x) / scale),
    maxY: Math.min(raster.height, (viewportBounds.maxY - y) / scale),
  };
}

/** Decode detail only where the camera can see it, in the source raster grid. */
export function getMapThemeRasterTiles(
  name: MapThemeRasterName,
  projection: GeoProjection,
  viewportBounds?: ProjectedBounds,
): MapThemeRasterTile[] {
  const { width, height } = tileAtlas.textures[name];
  const { tileSize, bleed } = tileAtlas;
  const { x, y, scale } = rasterPlacement(projection);
  const densityX = width / raster.width;
  const densityY = height / raster.height;
  const bounds = viewportBounds ? {
    minX: (viewportBounds.minX - x) / scale * densityX,
    minY: (viewportBounds.minY - y) / scale * densityY,
    maxX: (viewportBounds.maxX - x) / scale * densityX,
    maxY: (viewportBounds.maxY - y) / scale * densityY,
  } : { minX: 0, minY: 0, maxX: width, maxY: height };
  if (Object.values(bounds).some((value) => !Number.isFinite(value))
    || bounds.maxX <= 0 || bounds.maxY <= 0 || bounds.minX >= width || bounds.minY >= height
    || bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) return [];

  const firstColumn = Math.max(0, Math.floor(bounds.minX / tileSize));
  const firstRow = Math.max(0, Math.floor(bounds.minY / tileSize));
  const lastColumn = Math.min(Math.ceil(width / tileSize), Math.ceil(bounds.maxX / tileSize)) - 1;
  const lastRow = Math.min(Math.ceil(height / tileSize), Math.ceil(bounds.maxY / tileSize)) - 1;
  const tiles: MapThemeRasterTile[] = [];
  for (let row = firstRow; row <= lastRow; row += 1) {
    for (let column = firstColumn; column <= lastColumn; column += 1) {
      const left = column * tileSize;
      const top = row * tileSize;
      const right = Math.min(width, left + tileSize);
      const bottom = Math.min(height, top + tileSize);
      const imageLeft = Math.max(0, left - bleed);
      const imageTop = Math.max(0, top - bleed);
      tiles.push({
        id: `${column}-${row}`,
        x: left / densityX,
        y: top / densityY,
        width: (right - left) / densityX,
        height: (bottom - top) / densityY,
        imageX: imageLeft / densityX,
        imageY: imageTop / densityY,
        imageWidth: (Math.min(width, right + bleed) - imageLeft) / densityX,
        imageHeight: (Math.min(height, bottom + bleed) - imageTop) / densityY,
      });
    }
  }
  return tiles;
}

/** Replace transparent overview cells instead of drawing relief twice. */
export function getMapThemeOverviewClipPath(
  tiles: readonly MapThemeRasterTile[],
  bounds: ProjectedBounds = { minX: 0, minY: 0, maxX: raster.width, maxY: raster.height },
): string {
  if (bounds.minX >= bounds.maxX || bounds.minY >= bounds.maxY) return "";
  return `M${bounds.minX},${bounds.minY}H${bounds.maxX}V${bounds.maxY}H${bounds.minX}Z${tiles.map(({ x, y, width, height }) => {
    const left = Math.max(x, bounds.minX);
    const top = Math.max(y, bounds.minY);
    const right = Math.min(x + width, bounds.maxX);
    const bottom = Math.min(y + height, bounds.maxY);
    return left < right && top < bottom ? `M${left},${top}h${right - left}v${bottom - top}h${left - right}Z` : "";
  }).join("")}`;
}
