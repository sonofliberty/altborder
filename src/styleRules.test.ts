import { describe, expect, it } from "vitest";

declare const require: (id: string) => { readFileSync: (path: URL, encoding: "utf8") => string };

const { readFileSync } = require("node:fs");
const styles = readFileSync(new URL("./styles.css", import.meta.url), "utf8");

describe("map style rules", () => {
  it("reveals subtle administrative borders as the map zooms in", () => {
    expect(styles).toMatch(/\.administrative-border-line \{[^}]*stroke-opacity: 0;[^}]*stroke-width: 0\.3;/);
    expect(styles).toMatch(/\.map-admin-borders-close \.administrative-border-line \{[^}]*stroke-opacity: 0\.26;[^}]*stroke-width: 0\.38;/);
    expect(styles).toMatch(/\.map-admin-borders-detail \.administrative-border-line \{[^}]*stroke-opacity: 0\.44;[^}]*stroke-width: 0\.48;/);
    expect(styles).toMatch(/\.administrative-border-line\.administrative-border-active \{[^}]*stroke-opacity: 0\.56;/);
  });

  it("uses crisp non-scaling country and coastline strokes", () => {
    expect(styles).toMatch(/\.country-border-line \{[^}]*stroke-width: 0\.72;/);
    expect(styles).toMatch(/\.coastline-line \{[^}]*stroke-width: 0\.5;/);
    expect(styles).toMatch(/\.coastline-line,[^}]*stroke-linecap: butt;/);
    expect(styles).toMatch(/\.coastline-line,[^}]*shape-rendering: geometricPrecision;/);
    expect(styles).toMatch(/\.coastline-line,[^}]*vector-effect: non-scaling-stroke;/);
  });

  it("renders selected regions with a non-interactive tint and one outline", () => {
    expect(styles).toMatch(/\.selected-region-overlays,[^}]*pointer-events: none;/);
    expect(styles).toMatch(/\.selected-region-tint \{[^}]*fill: rgba\(255, 231, 128, 0\.24\);/);
    expect(styles).toMatch(/\.selected-region-outline \{[^}]*stroke-width: 1\.2;/);
  });

  it("renders selected countries with a non-interactive tint and one outline", () => {
    expect(styles).toMatch(/\.selected-country-overlay,[^}]*pointer-events: none;/);
    expect(styles).toMatch(/\.selected-country-tint \{[^}]*fill: rgba\(255, 231, 128, 0\.12\);/);
    expect(styles).toMatch(/\.selected-country-outline \{[^}]*stroke-width: 1\.25;/);
  });
});
