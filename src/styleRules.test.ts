import { describe, expect, it } from "vitest";

declare const require: (id: string) => { readFileSync: (path: URL, encoding: "utf8") => string };

const { readFileSync } = require("node:fs");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("map style rules", () => {
  it("makes region borders visible on hover", () => {
    expect(styles).toContain("stroke-opacity: 0;");
    expect(styles).toMatch(
      /\.region-layer:has\(\.region:hover\) \.region-border,\s*\.region-layer:has\(\.region-editable:hover\) \.region-border \{[^}]*stroke-opacity: 1;/,
    );
  });

  it("strengthens subdivision borders as the map zooms in", () => {
    expect(styles).toMatch(/\.subdivision-border-line \{[^}]*stroke-width: 0\.3;/);
    expect(styles).toMatch(/\.map-admin-borders-close \.subdivision-border-line \{[^}]*stroke-width: 0\.52;/);
    expect(styles).toMatch(/\.map-admin-borders-detail \.subdivision-border-line \{[^}]*stroke-width: 0\.72;/);
  });

  it("keeps fallback region borders visible at close admin-border zooms", () => {
    expect(styles).toMatch(/\.region-border \{[^}]*stroke-opacity: 0;/);
    expect(styles).toMatch(/\.map-admin-borders-close \.region-border \{[^}]*stroke-opacity: 0\.52;/);
    expect(styles).toMatch(/\.map-admin-borders-detail \.region-border \{[^}]*stroke-opacity: 0\.68;/);
  });

  it("renders selected regions with a non-interactive tint and contrast outline", () => {
    expect(styles).toMatch(/\.selected-region-overlays,[^}]*pointer-events: none;/);
    expect(styles).toMatch(/\.selected-region-tint \{[^}]*fill: rgba\(255, 231, 128, 0\.24\);/);
    expect(styles).toMatch(/\.selected-region-outline-halo \{[^}]*stroke-width: 3\.9;/);
    expect(styles).toMatch(/\.selected-region-outline-inner \{[^}]*stroke-width: 1\.55;/);
  });

  it("renders selected countries with a non-interactive tint and contrast outline", () => {
    expect(styles).toMatch(/\.selected-country-overlay,[^}]*pointer-events: none;/);
    expect(styles).toMatch(/\.selected-country-tint \{[^}]*fill: rgba\(255, 231, 128, 0\.12\);/);
    expect(styles).toMatch(/\.selected-country-outline-halo \{[^}]*stroke-width: 4\.8;/);
    expect(styles).toMatch(/\.selected-country-outline-inner \{[^}]*stroke-width: 1\.7;/);
  });
});
