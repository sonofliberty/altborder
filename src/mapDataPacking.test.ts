import { describe, expect, it } from "vitest";
import source from "../public/data/map-data.json";
import packed from "../public/data/map-data.packed.json";
import { decodePackedMapData, decodePackedMapDataInBatches } from "./mapDataPacking";

describe("packed map data", () => {
  const minimal = { version: 1, attribution: "Test", countries: [], regions: [], boundaryEdges: [] };

  it("decodes coastal coordinates at five-decimal precision", async () => {
    const data = { ...minimal, format: "polyline-variable", baseCountries: [
      { entityId: "AAA", geometry: { type: "LineString", precision: 5, coordinates: "CD" } },
      { entityId: "BBB", geometry: { type: "LineString", coordinates: "CD" } },
    ] };
    const decoded = decodePackedMapData(data);
    expect(decoded.baseCountries.map(({ geometry }) => geometry)).toEqual([
      { type: "LineString", coordinates: [[0.00001, -0.00002]] },
      { type: "LineString", coordinates: [[0.01, -0.02]] },
    ]);
    await expect(decodePackedMapDataInBatches(data, () => false)).resolves.toEqual(decoded);
  });

  it("decodes existing two-decimal bundles", () => {
    const data = { ...minimal, format: "polyline-2", baseCountries: [
      { entityId: "AAA", geometry: { type: "LineString", coordinates: "CD" } },
    ] };
    expect(decodePackedMapData(data).baseCountries[0].geometry).toEqual({ type: "LineString", coordinates: [[0.01, -0.02]] });
  });

  it("rejects unsupported coordinate precision", async () => {
    const data = { ...minimal, format: "polyline-variable", baseCountries: [
      { entityId: "AAA", geometry: { type: "LineString", precision: 3, coordinates: "CD" } },
    ] };
    expect(() => decodePackedMapData(data)).toThrow("unsupported coordinate precision");
    await expect(decodePackedMapDataInBatches(data, () => false)).rejects.toThrow("unsupported coordinate precision");
  });

  it("preserves every country, region, and boundary coordinate", () => {
    expect(decodePackedMapData(packed)).toEqual(source);
  });

  it("preserves the same data when decoding in browser batches", async () => {
    await expect(decodePackedMapDataInBatches(packed, () => false)).resolves.toEqual(source);
  });

  it("discards data when loading is cancelled", async () => {
    let cancelled = false;
    const decoding = decodePackedMapDataInBatches(packed, () => cancelled);
    cancelled = true;
    await expect(decoding).resolves.toBeNull();
  });

  it("rejects malformed data when decoding in browser batches", async () => {
    await expect(decodePackedMapDataInBatches({ format: "other" }, () => false)).rejects.toThrow("unsupported format");
    await expect(decodePackedMapDataInBatches({
      ...packed,
      regions: [{ ...packed.regions[0], geometry: { type: "Polygon", coordinates: ["!"] } }],
    }, () => false)).rejects.toThrow("invalid coordinate");
  });

  it("rejects an unknown format", () => {
    expect(() => decodePackedMapData({ format: "other" })).toThrow("unsupported format");
  });

  it.each(["!", "é", "___________"])("rejects invalid coordinate input %s", (coordinates) => {
    expect(() => decodePackedMapData({
      ...packed,
      baseCountries: [{ ...packed.baseCountries[0], geometry: { type: "Polygon", coordinates: [coordinates] } }],
    })).toThrow(/invalid coordinate|incomplete coordinate/);
  });

  it.each(["A", "g"])("rejects an incomplete coordinate pair %s", (coordinates) => {
    expect(() => decodePackedMapData({
      ...packed,
      baseCountries: [{ ...packed.baseCountries[0], geometry: { type: "Polygon", coordinates: [coordinates] } }],
    })).toThrow("incomplete coordinate");
  });
});
