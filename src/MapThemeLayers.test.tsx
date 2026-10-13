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
    expect(html).toContain('clip-rule="evenodd"');
  });

  it("keeps the complete ocean overview while visible cells load", () => {
    const html = renderToStaticMarkup(<MapThemeOcean theme="hoi4" projection={projection} detail viewportBounds={viewportBounds} />);
    expect(html).toContain("ocean-overview.webp");
    expect(html).not.toContain("/ocean.webp");
    expect(html).toContain('class="map-theme-ocean"');
  });
});
