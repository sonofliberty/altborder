import { describe, expect, it } from "vitest";
import { geoContains } from "d3-geo";
import type { Geometry } from "geojson";
import appSource from "./App.tsx?raw";
import { unionOwnedRegionRenderGeometry } from "./countryRenderGeometry";
import { withRegionLandAddition } from "./regionLandGeometry";

describe("country label rendering", () => {
  it("renders country labels as one unclipped SVG text element", () => {
    expect(appSource).toContain('className="country-label"');
    expect(appSource).not.toContain("country-label-outline");
    expect(appSource).not.toContain("country-label-fill");
    expect(appSource).not.toContain("country-label-clip");
    const labelLayer = appSource.slice(appSource.indexOf("ref={countryLabelsRef}"), appSource.indexOf('<g className="region-labels"'));
    expect(labelLayer).not.toContain("clipPath");
    expect(appSource).toContain("letterSpacing={label.letterSpacing}");
  });

  it("keeps country label visibility independent from selected country state", () => {
    expect(appSource).not.toContain("label.id === selectedEntityId");
    expect(appSource).not.toContain("priority: label.priority +");
    expect(appSource).toContain("}, [countryLabelLayouts, logicalViewportBounds, mapViewScale, settledZoom]);");
  });

  it("swaps rebuilt country labels only after the full layout pass completes", () => {
    expect(appSource).not.toContain("publishLabels");
    expect(appSource).not.toContain("publishedLabelCount");
    expect(appSource).toContain("flushLabels();");
  });

  it("centers country names without map flag images", () => {
    expect(appSource).not.toContain('className="country-flag"');
    expect(appSource).toMatch(/className="country-label"\s+x=\{0\}/);
  });

});

describe("country underlay rendering", () => {
  it("uses evenodd fill for projected country underlays", () => {
    expect(appSource).toContain('fillRule="evenodd"');
  });

  it("renders a selected country overlay from the projected country underlay", () => {
    expect(appSource).toContain("selectedCountryOverlayElement");
    expect(appSource).toContain('className="selected-country-overlay"');
    expect(appSource).toContain("data-entity-id={selectedEntityId}");
    expect(appSource).toContain('className="selected-country-tint"');
    expect(appSource).toContain('className="selected-country-aura selected-country-aura-outer"');
    expect(appSource).toContain('className="selected-country-aura selected-country-aura-inner"');
    expect(appSource).toContain('className="selected-country-outline"');
    expect(appSource).not.toContain("selected-country-outline-halo");
    expect(appSource).toContain("style={{ color: selectedEntity?.color ?? customCountryAccentColor }}");
  });

  it("keeps added land separate from the original region geometry", () => {
    const region = { id: "west", name: "West", type: "Region", geometry: rectangle(0, 0, 4.9, 10) };
    const geometry = structuredClone(region.geometry);
    const modified = withRegionLandAddition(region, rectangle(4.9, 0, 5.1, 10));
    expect(geoContains(modified.geometry, [5, 5])).toBe(true);
    expect(geoContains(region.geometry, [5, 5])).toBe(false);
    expect(region.geometry).toEqual(geometry);
    expect(withRegionLandAddition(region)).toBe(region);
  });

  it("builds changed-country underlay fills from unioned render topology geometry", () => {
    expect(appSource).toContain("hasTransferredOwnershipChanges(");
    expect(appSource).toContain("baseCountryByEntityId.get(baseEntityId)?.geometry");
    expect(appSource).toContain("renderRegionTopologyGeometryById.get(regionId)");
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

  it("fills overlapping country parts while keeping uncovered holes and outside land excluded", async () => {
    const west = rectangle(0, 0, 6, 10);
    if (west.type !== "Polygon") throw new Error("Expected polygon fixture");
    west.coordinates.push([[1, 1], [2, 1], [2, 2], [1, 2], [1, 1]]);
    const fill = await unionOwnedRegionRenderGeometry([west, rectangle(4, 0, 10, 10)]);
    expect(fill).not.toBeNull();
    expect(geoContains(fill!, [5, 5])).toBe(true);
    expect(geoContains(fill!, [1.5, 1.5])).toBe(false);
    expect(geoContains(fill!, [20, 5])).toBe(false);
  });
});

function rectangle(minX: number, minY: number, maxX: number, maxY: number): Geometry {
  return { type: "Polygon", coordinates: [[[minX, minY], [minX, maxY], [maxX, maxY], [maxX, minY], [minX, minY]]] };
}

describe("region border rendering", () => {
  it("uses holeless topology geometry for detailed visible border strokes", () => {
    expect(appSource).toContain("getBaseDetailedRegionStrokePath");
    expect(appSource).toContain("renderRegionTopologyGeometryById.get(regionId)");
    expect(appSource).toContain("removePolygonalGeometryHoles(region.geometry)");
    expect(appSource).toContain("getRegionStrokePath(region.id, useDetailedRegionBorderStrokes)");
  });
});
