import { describe, expect, it } from "vitest";
import { shouldSkipWorldFallback } from "../scripts/build-map-data.mjs";

describe("build-map-data fallback handling", () => {
  it("keeps world-atlas fallbacks when selected ADM1 data did not load", () => {
    expect(shouldSkipWorldFallback("germany", new Map())).toBe(false);
    expect(shouldSkipWorldFallback("germany", new Map([["germany", "DEU"]]))).toBe(true);
    expect(shouldSkipWorldFallback("unlistedplace", new Map([["unlistedplace", "NE-001"]]))).toBe(false);
  });
});
