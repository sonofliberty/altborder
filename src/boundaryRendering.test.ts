import { describe, expect, it } from "vitest";

declare const require: (id: string) => { readFileSync: (path: URL, encoding: "utf8") => string };

const { readFileSync } = require("node:fs");
const appSource = readFileSync(new URL("./App.tsx", import.meta.url), "utf8");

describe("shared boundary rendering", () => {
  it("renders one path for each permanent boundary style and one active administrative path", () => {
    expect(appSource.match(/className="coastline-line"/g)).toHaveLength(1);
    expect(appSource.match(/className="country-border-line"/g)).toHaveLength(1);
    expect(appSource.match(/administrative-border-line administrative-border-active/g)).toHaveLength(1);
    expect(appSource).toContain(
      'className="administrative-border-line administrative-border-active"',
    );
    expect(appSource).not.toContain('d={boundaryPaths.administrativePath}');
  });

  it("does not render country unions or region perimeters as permanent borders", () => {
    expect(appSource).not.toContain('className="country-outline"');
    expect(appSource).not.toContain('className="subdivision-border-line"');
    expect(appSource).not.toContain('className="region-border"');
    expect(appSource).not.toContain('"region-interaction-outline"');
  });

  it("uses country unions as the only permanent fills", () => {
    expect(appSource).not.toContain("{regionFillElements}");
    expect(appSource.indexOf("{countryUnderlayElements}")).toBeLessThan(
      appSource.indexOf("{regionInteractionElements}"),
    );
  });

  it("does not show administrative borders in Inspect mode", () => {
    expect(appSource).toContain('mode === "transfer" || mode === "divide"');
    expect(appSource).not.toContain(
      'mode === "inspect" || mode === "transfer" || mode === "divide"',
    );
  });

  it("seals composed fill seams with the country color", () => {
    expect(appSource).toContain('underlay.sealInternalSeams ? "country-underlay-composed"');
    expect(appSource).toContain("stroke={underlay.sealInternalSeams ? color : undefined}");
  });
});
