import { describe, expect, it } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import type { FeatureCollection } from "geojson";
import mapDataFixture from "../public/data/map-data.packed.json";
import { decodePackedMapData } from "./mapDataPacking";
import { prepareMapRendering } from "./mapPreparation";
import { removePolygonalGeometryHoles, simplifyPolygonalGeometry } from "./geometrySimplify";

const extent: [[number, number], [number, number]] = [[16, 18], [984, 538]];

describe("base map preparation", () => {
  it("keeps the fitted projection and render geometry exact for the shipped map", async () => {
    const data = decodePackedMapData(mapDataFixture);
    const originalCoordinates = JSON.stringify(data.regions.map((region) => region.geometry));
    const prepared = await prepareMapRendering(data, extent, 0.07, () => false);
    expect(prepared).not.toBeNull();
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: data.regions.map((region) => ({ type: "Feature", properties: {}, geometry: region.geometry })),
    };
    const original = geoNaturalEarth1().fitExtent(extent, collection);
    expect(prepared!.projection.scale()).toBe(original.scale());
    expect(prepared!.projection.translate()).toEqual(original.translate());
    for (const point of [[-180, 0], [180, 0], [0, 85], [-47, -15]] as [number, number][]) {
      expect(prepared!.projection(point)).toEqual(original(point));
    }
    for (const region of data.regions) {
      const topology = removePolygonalGeometryHoles(region.geometry);
      expect(prepared!.topologyGeometryById.get(region.id)).toEqual(topology);
      expect(prepared!.renderGeometryById.get(region.id)).toEqual(simplifyPolygonalGeometry(topology, 0.07));
    }
    expect(JSON.stringify(data.regions.map((region) => region.geometry))).toBe(originalCoordinates);
  });

  it("does not publish an obsolete map when loading is cancelled", async () => {
    const data = decodePackedMapData(mapDataFixture);
    let cancelled = false;
    const preparation = prepareMapRendering(data, extent, 0.07, () => cancelled);
    cancelled = true;
    await expect(preparation).resolves.toBeNull();
  });
});
