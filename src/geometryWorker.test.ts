import { describe, expect, it } from "vitest";
import appSource from "./App.tsx?raw";
import workerSource from "./geometryWorker.ts?raw";

describe("background geometry work", () => {
  it("sends divide and custom-boundary calculations to a web worker", () => {
    expect(appSource.match(/new Worker\(new URL\("\.\/geometryWorker\.ts", import\.meta\.url\)/g)).toHaveLength(2);
    expect(appSource.match(/worker\.terminate\(\);/g)).toHaveLength(2);
    expect(appSource).toContain('kind: "divide"');
    expect(appSource).toContain('kind: "custom-boundaries"');
  });

  it("calculates both divide choices before it returns the preview", () => {
    expect(workerSource).toContain("splitCountryGeometry(request.regions, request.cutLine)");
    expect(workerSource).toContain("separateCountryIsland(request.regions, request.islandPoint)");
    expect(workerSource).toContain("buildDivideTerritories(split, 0)");
    expect(workerSource).toContain("buildDivideTerritories(split, 1)");
  });
});
