import { describe, expect, it } from "vitest";
import source from "../public/data/map-data.json";
import packed from "../public/data/map-data.packed.json";
import { decodePackedMapData } from "./mapDataPacking";

describe("packed map data", () => {
  it("preserves every country, region, and boundary coordinate", () => {
    expect(decodePackedMapData(packed)).toEqual(source);
  });

  it("rejects an unknown format", () => {
    expect(() => decodePackedMapData({ format: "other" })).toThrow("unsupported format");
  });
});
