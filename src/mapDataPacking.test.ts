import { describe, expect, it } from "vitest";
import source from "../public/data/map-data.json";
import packed from "../public/data/map-data.packed.json";
import { decodePackedMapData, decodePackedMapDataInBatches } from "./mapDataPacking";

describe("packed map data", () => {
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
