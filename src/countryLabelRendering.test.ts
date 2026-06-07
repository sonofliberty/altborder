import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";

describe("country label rendering", () => {
  it("renders country labels as one unclipped SVG text element", () => {
    expect(appSource).toContain('className="country-label"');
    expect(appSource).not.toContain("country-label-outline");
    expect(appSource).not.toContain("country-label-fill");
    expect(appSource).not.toContain("country-label-clip");
    expect(appSource).not.toContain("<clipPath");
  });
});

describe("country underlay rendering", () => {
  it("uses evenodd fill for projected country underlays", () => {
    expect(appSource).toContain('fillRule="evenodd"');
  });

  it("renders a selected country overlay from the projected country underlay", () => {
    expect(appSource).toContain("selectedCountryOverlayElement");
    expect(appSource).toContain('className="selected-country-overlay" data-entity-id={selectedEntityId} aria-hidden="true"');
    expect(appSource).toContain('className="selected-country-tint"');
    expect(appSource).toContain('className="selected-country-outline selected-country-outline-halo"');
    expect(appSource).toContain('className="selected-country-outline selected-country-outline-inner"');
  });

  it("clears derived geometry caches when custom region geometry changes", () => {
    expect(appSource).toMatch(
      /useEffect\(\(\) => \{\s+countryUnderlayCacheRef\.current\.clear\(\);\s+countryLabelLayoutCacheRef\.current\.clear\(\);\s+\}, \[customRegionRecords\]\);/,
    );
  });

  it("builds changed-country underlay fills from unioned original geometry", () => {
    expect(appSource).toContain("hasTransferredOwnershipChanges(");
    expect(appSource).toContain("baseCountryByEntityId.get(baseEntityId)?.geometry");
    expect(appSource).toContain("regionById.get(regionId)?.geometry");
    expect(appSource).toContain("simplifyPolygonalGeometry(geometry, mapRenderSimplifyTolerance)");
    expect(appSource).not.toContain("renderGapSensitiveEntityIds");
    expect(appSource).not.toContain("combineProjectedPathData");
    expect(appSource).not.toContain("baseFillGeometry");
  });
});

describe("region border rendering", () => {
  it("uses original region geometry for detailed visible border strokes", () => {
    expect(appSource).toContain("getBaseDetailedRegionStrokePath");
    expect(appSource).toContain("originalRegionGeometryById.get(regionId)");
    expect(appSource).toContain("getRegionStrokePath(regionId, useDetailedRegionBorderStrokes)");
  });
});
