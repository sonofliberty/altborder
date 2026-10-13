import type { GeoProjection } from "d3-geo";
import raster from "./mapThemeRaster.json";

/** Keep the preprojected raster aligned if map-data bounds change the fit. */
export function getMapThemeRasterTransform(projection: GeoProjection): string {
  const scale = projection.scale() / raster.scale;
  const translate = projection.translate();
  const x = translate[0] - raster.translate[0] * scale;
  const y = translate[1] - raster.translate[1] * scale;
  return `translate(${x} ${y}) scale(${scale})`;
}
