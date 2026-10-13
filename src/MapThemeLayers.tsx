import { memo, useEffect, useId, useMemo, useState } from "react";
import { geoPath, type GeoProjection } from "d3-geo";
import type { MapThemeId } from "./types";
import { getMapThemeRasterTransform } from "./mapThemeProjection";
import raster from "./mapThemeRaster.json";

type ThemeLayerProps = { theme: MapThemeId; projection: GeoProjection; detail: boolean };
type CountryPath = { id: string; pathData: string };

/** Keep the overview visible while a zoomed texture loads and decodes. */
function useMapRaster(name: MapThemeId | "ocean", detail: boolean): string {
  const base = `${import.meta.env.BASE_URL}map-themes/${name}`;
  const full = `${base}.webp`;
  const [decoded, setDecoded] = useState<string | null>(null);

  useEffect(() => {
    if (!detail || decoded === full) return;
    let cancelled = false;
    const image = new Image();
    image.src = full;
    void image.decode().then(() => {
      if (!cancelled) setDecoded(full);
    }).catch(() => {
      // A failed detail request keeps the complete overview map available.
    });
    return () => { cancelled = true; };
  }, [decoded, detail, full]);

  return detail && decoded === full ? full : `${base}-overview.webp`;
}

/** Render within the existing map zoom group, before country fills. */
export const MapThemeOcean = memo(function MapThemeOcean({ projection, detail }: ThemeLayerProps) {
  const source = useMapRaster("ocean", detail);
  const clipId = `map-theme-world-${useId()}`;
  const worldPath = useMemo(() => geoPath(projection)({ type: "Sphere" }) ?? "", [projection]);
  return (
    <g pointerEvents="none" aria-hidden="true">
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={worldPath} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <image
          className="map-theme-ocean"
          href={source}
          width={raster.width}
          height={raster.height}
          preserveAspectRatio="none"
          transform={getMapThemeRasterTransform(projection)}
        />
      </g>
    </g>
  );
});

/** Clip against current fills, so transfers and cuts keep exactly the same land. */
export const MapThemeLand = memo(function MapThemeLand({
  theme,
  projection,
  detail,
  countryPaths,
}: ThemeLayerProps & { countryPaths: readonly CountryPath[] }) {
  const clipId = `map-theme-land-${useId()}`;
  const source = useMapRaster(theme, detail);
  return (
    <g className="map-theme-land" pointerEvents="none" aria-hidden="true">
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          {countryPaths.map((country) => (
            <path key={country.id} d={country.pathData} clipRule="evenodd" fillRule="evenodd" />
          ))}
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <image
          href={source}
          width={raster.width}
          height={raster.height}
          preserveAspectRatio="none"
          transform={getMapThemeRasterTransform(projection)}
        />
      </g>
    </g>
  );
});

/** Pale shelves follow real coastlines; inland country borders stay fine. */
export const MapThemeCoasts = memo(function MapThemeCoasts({
  theme,
  coastlinePath,
}: { theme: MapThemeId; coastlinePath: string }) {
  if (theme !== "eu4" || !coastlinePath) return null;
  return (
    <g className="map-theme-coastal-shelves" pointerEvents="none" aria-hidden="true">
      <path className="map-theme-shelf-outer" d={coastlinePath} />
      <path className="map-theme-shelf-middle" d={coastlinePath} />
      <path className="map-theme-shelf-inner" d={coastlinePath} />
    </g>
  );
});
