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

  it("keeps country label visibility independent from selected country state", () => {
    expect(appSource).not.toContain("label.id === selectedEntityId");
    expect(appSource).not.toContain("priority: label.priority +");
    expect(appSource).toContain("}, [countryLabelLayouts, isMapMoving, zoom]);");
  });

  it("swaps rebuilt country labels only after the full layout pass completes", () => {
    expect(appSource).not.toContain("publishLabels");
    expect(appSource).not.toContain("publishedLabelCount");
    expect(appSource).toContain("flushLabels();");
  });

  it("renders a flag before each country name", () => {
    const flagIndex = appSource.indexOf('className="country-flag"');
    const labelIndex = appSource.indexOf('className="country-label"');

    expect(flagIndex).toBeGreaterThan(-1);
    expect(labelIndex).toBeGreaterThan(flagIndex);
    expect(appSource).toContain("getCountryFlagUrl(getCountryFlag(entities?.[label.id]))");
    expect(appSource).toContain("-label.contentWidth / 2 + label.flagWidth + label.flagGap");
  });

  it("rasterizes very small SVG flags before applying the label scale", () => {
    expect(appSource).toContain("const countryFlagImageRasterScale = 16;");
    expect(appSource).toContain("label.flagHeight * countryFlagImageRasterScale");
    expect(appSource).toContain("transform={`scale(${1 / countryFlagImageRasterScale})`}");
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
    expect(appSource).toContain('className="selected-country-outline"');
    expect(appSource).not.toContain("selected-country-outline-halo");
    expect(appSource).not.toContain("selected-country-outline-inner");
  });

  it("clears derived geometry caches when custom region geometry changes", () => {
    expect(appSource).toMatch(
      /useEffect\(\(\) => \{\s+countryUnderlayCacheRef\.current\.clear\(\);\s+countryLabelLayoutCacheRef\.current\.clear\(\);\s+\}, \[customRegionRecords\]\);/,
    );
  });

  it("builds changed-country underlay fills from unioned render topology geometry", () => {
    expect(appSource).toContain("hasTransferredOwnershipChanges(");
    expect(appSource).toContain("baseCountryByEntityId.get(baseEntityId)?.geometry");
    expect(appSource).toContain("renderRegionTopologyGeometryById.get(regionId)");
    expect(appSource).toContain("simplifyPolygonalGeometry(geometry, mapRenderSimplifyTolerance)");
    expect(appSource).not.toContain("renderGapSensitiveEntityIds");
    expect(appSource).not.toContain("baseFillGeometry");
  });

  it("uses D3 clipping for Russia and composed fills only after ownership changes", () => {
    expect(appSource).toContain('const composedFillSensitiveEntityIds = new Set(["RUS"]);');
    expect(appSource).toContain(
      "const composedFill = hasOwnershipChanges && composedFillSensitiveEntityIds.has(entityId)",
    );
    expect(appSource).toContain('getProjectedPathOptions(false, entityId === "RUS")');
    expect(appSource).toContain("getProjectedPathOptions(false, true)");
    expect(appSource).toContain("combineProjectedPathData(");
  });

  it("renders merged custom countries as compound paths without a polygon union", () => {
    expect(appSource).toContain("!baseEntityById.has(entityId) && renderGeometries.length > 1");
    expect(appSource).toContain("sealInternalSeams: true");
    expect(appSource).toContain("preserveGeometryCaches: true");
  });
});

describe("region border rendering", () => {
  it("uses holeless topology geometry for detailed visible border strokes", () => {
    expect(appSource).toContain("getBaseDetailedRegionStrokePath");
    expect(appSource).toContain("renderRegionTopologyGeometryById.get(regionId)");
    expect(appSource).toContain("removePolygonalGeometryHoles(region.geometry)");
    expect(appSource).toContain("getRegionStrokePath(region.id, useDetailedRegionBorderStrokes)");
  });
});
