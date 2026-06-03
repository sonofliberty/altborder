import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";

describe("shared-link recovery", () => {
  it("offers an explicit fresh-start action when shared data is invalid", () => {
    expect(appSource).toContain("startFreshAfterLoadError");
    expect(appSource).toContain("Start fresh");
    expect(appSource).toContain("window.history.replaceState");
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

describe("pointer capture handling", () => {
  it("guards pointer-capture release after cancellation", () => {
    expect(appSource).toContain("releasePointerCaptureIfHeld(event.currentTarget, pointerId)");
    expect(appSource).toContain("releasePointerCaptureIfHeld(event.currentTarget, event.pointerId)");
    expect(appSource).toContain("element.hasPointerCapture(pointerId)");
  });
});
