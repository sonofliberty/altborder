import { memo, useEffect, useId, useMemo, useState } from "react";
import { geoPath, type GeoProjection } from "d3-geo";
import type { MapThemeId } from "./types";
import type { ProjectedBounds } from "./mapZoom";
import {
  getMapThemeOverviewClipPath,
  getMapThemeRasterBounds,
  getMapThemeRasterTiles,
  getMapThemeRasterTransform,
  type MapThemeRasterName,
} from "./mapThemeProjection";
import { decodeMapThemeRaster } from "./mapThemeAssets";
import { clipMapThemeCountryPaths, clipMapThemePolygonPath, type MapThemeCountryPath } from "./mapThemeClip";
import raster from "./mapThemeRaster.json";

type ThemeLayerProps = {
  theme: MapThemeId;
  projection: GeoProjection;
  detail: boolean;
  viewportBounds?: ProjectedBounds;
};

function useDecodedRasterTiles(sources: readonly string[]): ReadonlySet<string> {
  const [decoded, setDecoded] = useState<ReadonlySet<string>>(() => new Set());
  useEffect(() => {
    let cancelled = false;
    let next = 0;
    async function decodeNextTiles() {
      while (!cancelled && next < sources.length) {
        const source = sources[next++];
        try {
          await decodeMapThemeRaster(source);
          if (!cancelled) setDecoded((previous) => previous.has(source) ? previous : new Set([...previous, source]));
        } catch {
          // Keep the overview cell when a detail tile cannot load.
        }
      }
    }
    // Request only two cells at a time; obsolete viewports do not queue a world.
    void decodeNextTiles();
    void decodeNextTiles();
    return () => { cancelled = true; };
  }, [sources]);
  return decoded;
}

/** Keep a complete overview while decoding small, visible detail cells. */
const MapThemeRaster = memo(function MapThemeRaster({
  name,
  projection,
  detail,
  viewportBounds,
  className,
}: Omit<ThemeLayerProps, "theme"> & { name: MapThemeRasterName; className?: string }) {
  const clipId = `map-theme-overview-${useId()}`;
  const base = `${import.meta.env.BASE_URL}map-themes`;
  const tiles = useMemo(() => detail ? getMapThemeRasterTiles(name, projection, viewportBounds) : [],
    [detail, name, projection, viewportBounds]);
  const sourceForTile = (id: string) => `${base}/tiles/${name}/${id}.webp`;
  const sources = useMemo(() => tiles.map((tile) => `${base}/tiles/${name}/${tile.id}.webp`), [base, name, tiles]);
  const decoded = useDecodedRasterTiles(sources);
  const readyTiles = tiles.filter((tile) => decoded.has(sourceForTile(tile.id)));
  const rasterBounds = getMapThemeRasterBounds(projection, viewportBounds);
  const hasOverviewClip = Boolean(viewportBounds) || readyTiles.length > 0;
  return (
    <g transform={getMapThemeRasterTransform(projection)}>
      {hasOverviewClip ? (
        <defs>
          <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
            <path d={getMapThemeOverviewClipPath(readyTiles, rasterBounds)} clipRule="evenodd" fillRule="evenodd" />
          </clipPath>
        </defs>
      ) : null}
      <image
        className={className}
        href={`${base}/${name}-overview.webp`}
        width={raster.width}
        height={raster.height}
        preserveAspectRatio="none"
        clipPath={hasOverviewClip ? `url(#${clipId})` : undefined}
      />
      {readyTiles.map((tile) => (
        <svg
          key={tile.id}
          x={tile.x}
          y={tile.y}
          width={tile.width}
          height={tile.height}
          viewBox={`0 0 ${tile.width} ${tile.height}`}
          overflow="hidden"
        >
          <image
            className={className}
            href={sourceForTile(tile.id)}
            x={tile.imageX - tile.x}
            y={tile.imageY - tile.y}
            width={tile.imageWidth}
            height={tile.imageHeight}
            preserveAspectRatio="none"
          />
        </svg>
      ))}
    </g>
  );
});

const MapThemeLandClip = memo(function MapThemeLandClip({
  clipId,
  countryPaths,
  viewportBounds,
}: { clipId: string; countryPaths: readonly MapThemeCountryPath[]; viewportBounds?: ProjectedBounds }) {
  const clippedPaths = useMemo(() => clipMapThemeCountryPaths(countryPaths, viewportBounds), [countryPaths, viewportBounds]);
  return (
    <defs>
      <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
        {clippedPaths.map((country) => (
          <path key={country.id} d={country.pathData} clipRule="evenodd" fillRule="evenodd" />
        ))}
      </clipPath>
    </defs>
  );
});

/** Render within the existing map zoom group, before country fills. */
export const MapThemeOcean = memo(function MapThemeOcean({ projection, detail, viewportBounds }: ThemeLayerProps) {
  const clipId = `map-theme-world-${useId()}`;
  const worldPath = useMemo(() => clipMapThemePolygonPath(geoPath(projection)({ type: "Sphere" }) ?? "", viewportBounds), [projection, viewportBounds]);
  return (
    <g pointerEvents="none" aria-hidden="true">
      <defs>
        <clipPath id={clipId} clipPathUnits="userSpaceOnUse">
          <path d={worldPath} />
        </clipPath>
      </defs>
      <g clipPath={`url(#${clipId})`}>
        <MapThemeRaster name="ocean" projection={projection} detail={detail} viewportBounds={viewportBounds} className="map-theme-ocean" />
      </g>
    </g>
  );
});

/** Clip against current fills, so transfers and cuts keep exactly the same land. */
export const MapThemeLand = memo(function MapThemeLand({
  theme,
  projection,
  detail,
  viewportBounds,
  countryPaths,
}: ThemeLayerProps & { countryPaths: readonly MapThemeCountryPath[] }) {
  const clipId = `map-theme-land-${useId()}`;
  return (
    <g className="map-theme-land" pointerEvents="none" aria-hidden="true">
      <MapThemeLandClip clipId={clipId} countryPaths={countryPaths} viewportBounds={viewportBounds} />
      <g clipPath={`url(#${clipId})`}>
        <MapThemeRaster name={theme} projection={projection} detail={detail} viewportBounds={viewportBounds} />
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
