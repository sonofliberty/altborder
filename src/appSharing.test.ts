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
  });
});
