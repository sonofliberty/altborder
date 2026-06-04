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
});
