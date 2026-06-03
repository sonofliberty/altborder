import { describe, expect, it } from "vitest";
import type { Geometry } from "geojson";
import mapDataFixture from "../public/data/map-data.json";
import { simplifyPolygonalGeometry } from "./geometrySimplify";
import type { MapData } from "./types";

describe("geometry simplification", () => {
  it("keeps polygon rings closed and valid", () => {
    const geometry: Geometry = {
      type: "Polygon",
      coordinates: [
        [
          [0, 0],
          [1, 0.01],
          [2, 0],
          [2, 2],
          [0, 2],
          [0, 0],
        ],
      ],
    };

    const simplified = simplifyPolygonalGeometry(geometry, 0.05);

    expect(simplified.type).toBe("Polygon");
    if (simplified.type !== "Polygon") return;
    const ring = simplified.coordinates[0];
    expect(ring.length).toBeGreaterThanOrEqual(4);
    expect(ring[0]).toEqual(ring[ring.length - 1]);
  });

  it("reduces heavyweight fallback country geometry used for rendering", () => {
    const data = mapDataFixture as MapData;
    const canada = data.regions.find((region) => region.id === "CAN-ALL");
    if (!canada) throw new Error("Missing Canada test data");

    const simplified = simplifyPolygonalGeometry(canada.geometry, 0.07);

    expect(JSON.stringify(simplified).length).toBeLessThan(JSON.stringify(canada.geometry).length * 0.25);
  });
});
