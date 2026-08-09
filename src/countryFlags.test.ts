import { describe, expect, it } from "vitest";
import {
  builtinCountryFlag,
  countryFlagEquals,
  getCountryFlag,
  isCountryFlag,
  makeFlagOptions,
  maxCustomFlagDataUrlLength,
  normalizeFlagUpload,
} from "./countryFlags";

describe("country flag helpers", () => {
  it("validates bundled and normalized custom flags", () => {
    expect(isCountryFlag({ kind: "builtin", id: "gb" })).toBe(true);
    expect(isCountryFlag({ kind: "builtin", id: "northern-cyprus" })).toBe(true);
    expect(isCountryFlag({ kind: "builtin", id: "../bad" })).toBe(false);
    expect(isCountryFlag({ kind: "custom", dataUrl: "data:image/webp;base64,AAAA" })).toBe(true);
    expect(isCountryFlag({ kind: "custom", dataUrl: "https://example.com/flag.svg" })).toBe(false);
    expect(
      isCountryFlag({ kind: "custom", dataUrl: `data:image/webp;base64,${"A".repeat(maxCustomFlagDataUrlLength)}` }),
    ).toBe(false);
  });

  it("uses the neutral flag for missing entity data", () => {
    expect(getCountryFlag(undefined)).toEqual({ kind: "builtin", id: "neutral" });
    expect(getCountryFlag({ id: "A", name: "A", color: "#000000", regionIds: [] })).toEqual({
      kind: "builtin",
      id: "neutral",
    });
  });

  it("compares flag values and builds unique sorted picker options", () => {
    expect(countryFlagEquals(builtinCountryFlag("br"), builtinCountryFlag("br"))).toBe(true);
    expect(countryFlagEquals(builtinCountryFlag("br"), builtinCountryFlag("ar"))).toBe(false);
    expect(
      makeFlagOptions([
        { id: "B", name: "Brazil", color: "#000000", regionIds: [], flag: builtinCountryFlag("br") },
        { id: "A", name: "Argentina", color: "#000000", regionIds: [], flag: builtinCountryFlag("ar") },
        { id: "B2", name: "Brazil copy", color: "#000000", regionIds: [], flag: builtinCountryFlag("br") },
      ]),
    ).toEqual([
      { id: "ar", name: "Argentina" },
      { id: "br", name: "Brazil" },
    ]);
  });

  it("rejects unsupported and oversized uploads before image decoding", async () => {
    await expect(normalizeFlagUpload({ type: "text/plain", size: 10 } as File)).rejects.toThrow(
      "Choose a PNG, JPEG, WebP, or SVG image.",
    );
    await expect(normalizeFlagUpload({ type: "image/png", size: 2 * 1024 * 1024 + 1 } as File)).rejects.toThrow(
      "The image must be 2 MiB or smaller.",
    );
  });
});
