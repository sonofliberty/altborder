import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";

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
  it("exposes scenario descriptions for editing and shared-map viewing", () => {
    expect(appSource).toContain("updateScenarioDescription");
    expect(appSource).toContain("value={currentSnapshot.description}");
    expect(appSource).toContain("onChange={(event) => updateScenarioDescription(event.target.value)}");
    expect(appSource).toContain('className="scenario-title-text"');
    expect(appSource).toContain('className="scenario-description"');
    expect(appSource).toContain("selectedEntity || inspectFocusedRegion || snapshot?.description");
  });
});

describe("read-only map inspection", () => {
  it("focuses clicked regions while viewing shared maps", () => {
    expect(appSource).toMatch(
      /if \(readOnly\) \{\s+setSelectedEntityId\(ownerId\);\s+if \(mode === "inspect"\) \{\s+setInspectFocusedRegionId\(regionId\);/,
    );
  });
});

describe("share dialog accessibility", () => {
  it("keeps keyboard focus inside the modal share dialog", () => {
    expect(appSource).toContain("shareDialogRef");
    expect(appSource).toContain("getFocusableDialogElements");
    expect(appSource).toContain('event.key !== "Tab"');
    expect(appSource).toContain('event.key === "Escape"');
    expect(appSource).toContain("tabIndex={-1}");
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
