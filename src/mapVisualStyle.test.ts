import { describe, expect, it } from "vitest";

import { getAdministrativeBorderZoomClass, getCountryBorderStrokeWidth } from "./mapVisualStyle";

describe("map visual style helpers", () => {
  it("keeps administrative borders quiet at low or invalid zoom", () => {
    expect(getAdministrativeBorderZoomClass(1)).toBe("map-admin-borders-default");
    expect(getAdministrativeBorderZoomClass(2.39)).toBe("map-admin-borders-default");
    expect(getAdministrativeBorderZoomClass(Number.NaN)).toBe("map-admin-borders-default");
    expect(getAdministrativeBorderZoomClass(Number.POSITIVE_INFINITY)).toBe("map-admin-borders-default");
  });

  it("uses stronger administrative borders at close zoom", () => {
    expect(getAdministrativeBorderZoomClass(2.4)).toBe("map-admin-borders-close");
    expect(getAdministrativeBorderZoomClass(5.49)).toBe("map-admin-borders-close");
  });

  it("uses the strongest administrative borders at detail zoom", () => {
    expect(getAdministrativeBorderZoomClass(5.5)).toBe("map-admin-borders-detail");
    expect(getAdministrativeBorderZoomClass(30)).toBe("map-admin-borders-detail");
  });

  it("increases country border width with zoom and caps it at three pixels", () => {
    expect(getCountryBorderStrokeWidth(0.8)).toBe(1.25);
    expect(getCountryBorderStrokeWidth(1)).toBe(1.25);
    expect(getCountryBorderStrokeWidth(3)).toBeCloseTo(2.05);
    expect(getCountryBorderStrokeWidth(5.5)).toBe(3);
    expect(getCountryBorderStrokeWidth(30)).toBe(3);
    expect(getCountryBorderStrokeWidth(Number.NaN)).toBe(1.25);
  });
});
