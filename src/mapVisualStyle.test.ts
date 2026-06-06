import { describe, expect, it } from "vitest";

import { getSubdivisionBorderZoomClass } from "./mapVisualStyle";

describe("map visual style helpers", () => {
  it("keeps subdivision borders quiet at low or invalid zoom", () => {
    expect(getSubdivisionBorderZoomClass(1)).toBe("map-admin-borders-default");
    expect(getSubdivisionBorderZoomClass(2.39)).toBe("map-admin-borders-default");
    expect(getSubdivisionBorderZoomClass(Number.NaN)).toBe("map-admin-borders-default");
    expect(getSubdivisionBorderZoomClass(Number.POSITIVE_INFINITY)).toBe("map-admin-borders-default");
  });

  it("uses stronger subdivision borders at close zoom", () => {
    expect(getSubdivisionBorderZoomClass(2.4)).toBe("map-admin-borders-close");
    expect(getSubdivisionBorderZoomClass(5.49)).toBe("map-admin-borders-close");
  });

  it("uses the strongest subdivision borders at detail zoom", () => {
    expect(getSubdivisionBorderZoomClass(5.5)).toBe("map-admin-borders-detail");
    expect(getSubdivisionBorderZoomClass(30)).toBe("map-admin-borders-detail");
  });
});
