import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import panelSource from "./EditorSidePanel.tsx?raw";

describe("shared-link recovery", () => {
  it("offers an explicit fresh-start action when shared data is invalid", () => {
    expect(appSource).toContain("startFreshAfterLoadError");
    expect(appSource).toContain("Start fresh");
    expect(appSource).toContain("window.history.replaceState");
  });

  it("validates empty shared-data hashes instead of silently starting fresh", () => {
    expect(appSource).toContain("if (encoded !== null)");
  });
});

describe("scenario metadata UI", () => {
  it("keeps scenario titles without exposing description metadata", () => {
    expect(appSource).toContain('className="scenario-title-text"');
    expect(appSource).not.toContain("updateScenarioDescription");
    expect(appSource).not.toContain("currentSnapshot.description");
    expect(appSource).not.toContain('className="scenario-description"');
  });

  it("coalesces continuous metadata edits into a single undo step", () => {
    expect(appSource).toContain("metadataEditKeyRef");
    expect(appSource).toContain("continuesCurrentEdit");
    expect(appSource).toContain('commitMetadata("scenario-title"');
    expect(appSource).toContain("onBlur={finishMetadataEdit}");
  });
});

describe("editor side panel", () => {
  it("stays available before a country is selected", () => {
    expect(appSource).toContain("<EditorSidePanel");
    expect(appSource).not.toContain("selectedEntity || inspectFocusedRegion");
    expect(panelSource).toContain("<CountrySearchSelect");
    expect(panelSource).toContain('label="Country"');
    expect(panelSource).not.toContain('className="welcome-card"');
  });

  it("shows only available transfer sections in source, region, destination order", () => {
    const sourceStep = panelSource.indexOf(">Source country</div>");
    const regionStep = panelSource.indexOf(">Regions</div>");
    const destinationStep = panelSource.indexOf(">Destination</div>");

    expect(sourceStep).toBeGreaterThan(-1);
    expect(regionStep).toBeGreaterThan(sourceStep);
    expect(destinationStep).toBeGreaterThan(regionStep);
    expect(panelSource).toContain("{props.selectedEntity ? (");
    expect(panelSource).toContain("{selectedCount > 0 ? (");
  });

  it("uses one mode tab row instead of a separate map toolbar", () => {
    expect(panelSource).toContain('className="mode-tabs"');
    expect(appSource).not.toContain('className="toolbar"');
  });

  it("keeps detailed country controls collapsed until they are needed", () => {
    expect(panelSource).toContain('className="country-appearance"');
    expect(panelSource).toContain('className="region-browser"');
    expect(panelSource).toContain("{props.divideHasDraft ? (");
    expect(panelSource).toContain("{props.mergeSelectedEntities.length > 0 ? (");
  });

  it("animates mode and country changes without keeping duplicate panels mounted", () => {
    expect(panelSource).toContain('<div key={props.mode} className="panel-mode-content" role="tabpanel"');
    expect(panelSource).toContain("key={selectedEntity.id}");
    expect(appSource).toContain("function animateZoomTo(nextZoom: ZoomState, duration = 380)");
    expect(appSource).toContain('window.matchMedia("(prefers-reduced-motion: reduce)").matches');
  });

  it("shows brief transfer completion feedback", () => {
    expect(appSource).toContain("setTransferConfirmation({");
    expect(appSource).toContain('className="transfer-confirmation" role="status"');
    expect(appSource).not.toContain("zoomToEntity(nextSelectedEntityId);");
  });
});

describe("pointer capture handling", () => {
  it("guards pointer-capture release after cancellation", () => {
    expect(appSource).toContain("releasePointerCaptureIfHeld(event.currentTarget, pointerId)");
    expect(appSource).toContain("releasePointerCaptureIfHeld(event.currentTarget, event.pointerId)");
    expect(appSource).toContain("element.hasPointerCapture(pointerId)");
  });
});

describe("transient interaction state", () => {
  it("clears active brush state when changing tools or clearing selection", () => {
    expect(appSource.match(/setIsBrushDown\(false\);/g)?.length).toBeGreaterThanOrEqual(4);
    expect(appSource).toContain("setBrushEnabled(false)");
  });

  it("clears stale share and divide drafts around history changes", () => {
    expect(appSource).toContain("function clearHistoryTransientState()");
    expect(appSource.match(/clearHistoryTransientState\(\);/g)?.length).toBeGreaterThanOrEqual(3);
    expect(appSource).toContain("setShare(null);");
    expect(appSource).toContain("clearDivideDraft();");
  });

  it("clears geometry-sensitive render caches around snapshot geometry changes", () => {
    expect(appSource).toContain("function clearGeometryRenderCaches()");
    expect(appSource).toContain("countryUnderlayCacheRef.current.clear();");
    expect(appSource).toContain("countryLabelLayoutCacheRef.current.clear();");
    expect(appSource.match(/clearGeometryRenderCaches\(\);/g)?.length).toBeGreaterThanOrEqual(4);
  });
});
