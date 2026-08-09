import { describe, expect, it } from "vitest";

declare const require: (id: string) => { readFileSync: (path: URL, encoding: "utf8") => string };

const { readFileSync } = require("node:fs");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("map style rules", () => {
  it("shows administrative borders only for the active edited country", () => {
    expect(styles).toMatch(/\.administrative-border-line \{[^}]*stroke-opacity: 0;[^}]*stroke-width: 0\.4;/);
    expect(styles).toMatch(/\.map-admin-borders-close \.administrative-border-line \{[^}]*stroke-opacity: 0;/);
    expect(styles).toMatch(/\.map-admin-borders-detail \.administrative-border-line \{[^}]*stroke-opacity: 0;[^}]*stroke-width: 0\.55;/);
    expect(styles).toMatch(/\.administrative-border-line\.administrative-border-active \{[^}]*stroke-opacity: 0\.56;/);
  });

  it("uses crisp non-scaling country and coastline strokes", () => {
    expect(styles).toMatch(/\.country-border-line \{[^}]*stroke-width: 0\.9;/);
    expect(styles).toMatch(/\.coastline-line \{[^}]*stroke-width: 0\.65;/);
    expect(styles).toMatch(/\.coastline-line,[^}]*stroke-linecap: butt;/);
    expect(styles).toMatch(/\.coastline-line,[^}]*vector-effect: non-scaling-stroke;/);
  });

  it("renders selected regions with a non-interactive tint and one outline", () => {
    expect(styles).toMatch(/\.selected-region-overlays,[^}]*pointer-events: none;/);
    expect(styles).toMatch(/\.selected-region-tint \{[^}]*fill: rgba\(255, 231, 128, 0\.24\);/);
    expect(styles).toMatch(/\.selected-region-outline \{[^}]*stroke-width: 1\.5;/);
  });

  it("renders selected countries with a non-interactive tint and one outline", () => {
    expect(styles).toMatch(/\.selected-country-overlay,[^}]*pointer-events: none;/);
    expect(styles).toMatch(/\.selected-country-tint \{[^}]*fill: rgba\(255, 231, 128, 0\.12\);/);
    expect(styles).toMatch(/\.selected-country-outline \{[^}]*stroke-width: 1\.6;/);
  });
});
