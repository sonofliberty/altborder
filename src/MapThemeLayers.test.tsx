import { geoNaturalEarth1 } from "d3-geo";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MapThemeLand, MapThemeOcean } from "./MapThemeLayers";
import raster from "./mapThemeRaster.json";

describe("map theme texture fallback", () => {
  const projection = geoNaturalEarth1().scale(raster.scale).translate(raster.translate as [number, number]);
  const viewportBounds = { minX: 480, minY: 100, maxX: 550, maxY: 160 };

  it.each(["hoi4", "eu4"] as const)("keeps %s overview visible and clips it to current edited land before detail decodes", (theme) => {
    const html = renderToStaticMarkup(<MapThemeLand theme={theme} projection={projection} detail viewportBounds={viewportBounds} countryPaths={[{ id: "edited", pathData: "M500,110L520,110L520,130ZM1,2L3,4L5,6Z" }]} />);
    expect(html).toContain(`${theme}-overview.webp`);
    expect(html).not.toContain(`/${theme}.webp`);
    expect(html).toContain('d="M500,110L520,110L520,130Z"');
    expect(html).not.toContain("M1,2L3,4L5,6Z");
    expect(html).toContain('fill-rule="evenodd"');
    expect(html).toContain('maskUnits="userSpaceOnUse" x="480" y="100" width="70" height="60"');
    expect(html).toContain('mask-type:alpha');
    expect(html).toContain('fill="white"');
  });

  it("keeps the complete ocean overview while visible cells load", () => {
    const html = renderToStaticMarkup(<MapThemeOcean theme="hoi4" projection={projection} detail viewportBounds={viewportBounds} />);
    expect(html).toContain("ocean-overview.webp");
    expect(html).not.toContain("/ocean.webp");
    expect(html).toContain('class="map-theme-ocean"');
  });

  it("paints overlapping countries separately so their terrain mask remains a union", () => {
    const paths = [
      { id: "west", pathData: "M490,110L520,110L520,140L490,140Z" },
      { id: "east", pathData: "M510,110L540,110L540,140L510,140Z" },
    ];
    const html = renderToStaticMarkup(<MapThemeLand theme="hoi4" projection={projection} detail={false} viewportBounds={viewportBounds} countryPaths={paths} />);
    const mask = html.match(/<mask\b[^>]*>(.*?)<\/mask>/)?.[1] ?? "";
    expect(mask.match(/<path\b/g)).toHaveLength(2);
    for (const { pathData } of paths) expect(mask).toContain(`d="${pathData}"`);
  });
});
