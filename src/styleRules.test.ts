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

  it("renders selected countries with a color-matched tint, aura, and crisp outline", () => {
    expect(styles).toMatch(/\.selected-country-overlay,[^}]*pointer-events: none;/);
    expect(styles).toMatch(/\.selected-country-tint \{[^}]*fill: currentColor;[^}]*fill-opacity: 0\.09;/);
    expect(styles).toMatch(/\.selected-country-aura-outer \{[^}]*stroke-opacity: 0\.16;[^}]*stroke-width: 10;/);
    expect(styles).toMatch(/\.selected-country-aura-inner \{[^}]*stroke-opacity: 0\.34;[^}]*stroke-width: 5;/);
    expect(styles).toMatch(/\.selected-country-outline \{[^}]*stroke: color-mix\(in srgb, currentColor 76%, #ffffff\);[^}]*stroke-width: 1\.35;/);
  });

  it("uses a light label outline with a soft shadow", () => {
    expect(styles).toMatch(/\.country-label \{[^}]*filter: drop-shadow\(0 0\.04em 0\.08em rgba\(3, 10, 9, 0\.3\)\);/);
    expect(styles).toMatch(/\.country-label \{[^}]*stroke-width: 0\.055em;/);
  });

  it("uses short interface motion with a reduced-motion fallback", () => {
    expect(styles).toMatch(/\.panel-mode-content \{[^}]*animation: panel-mode-in 180ms/);
    expect(styles).toMatch(/\.country-summary \{[^}]*animation: country-summary-in 220ms/);
    expect(styles).toMatch(/\.transfer-confirmation \{[^}]*animation: transfer-confirmation-life 2200ms/);
    expect(styles).toContain("@media (prefers-reduced-motion: reduce)");
  });
});
