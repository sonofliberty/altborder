import { describe, expect, it } from "vitest";
import editorSource from "./EditorSidePanel.tsx?raw";

describe("country flag editor", () => {
  it("offers bundled selection, upload, and reset controls", () => {
    expect(editorSource).toContain('label="Choose a flag"');
    expect(editorSource).toContain('placeholder="Search flags"');
    expect(editorSource).toContain('accept="image/png,image/jpeg,image/webp,image/svg+xml"');
    expect(editorSource).toContain("normalizeFlagUpload(file)");
    expect(editorSource).toContain("> Reset");
  });

  it("shows the current flag in the country summary and editor preview", () => {
    expect(editorSource).toContain('className="country-summary-flag"');
    expect(editorSource).toContain('className="flag-preview"');
    expect(editorSource).toContain("getCountryFlagUrl(currentFlag)");
  });
});
