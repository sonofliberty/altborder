import { describe, expect, it } from "vitest";
import { geoNaturalEarth1 } from "d3-geo";
import type { FeatureCollection } from "geojson";
import mapDataFixture from "../public/data/map-data.packed.json";
import { decodePackedMapData } from "./mapDataPacking";
import { prepareMapRendering } from "./mapPreparation";
import { removePolygonalGeometryHoles, simplifyPolygonalGeometry } from "./geometrySimplify";
import { layoutCountryLabel } from "./labelLayout";
import { buildMapRenderPreparation } from "../scripts/map-render-preparation";

const extent: [[number, number], [number, number]] = [[16, 18], [984, 538]];

describe("base map preparation", () => {
  it("keeps the shipping metadata synchronized with the source geometry and label algorithm", () => {
    const data = decodePackedMapData(mapDataFixture);
    const shipping = mapDataFixture as typeof mapDataFixture & { renderPreparation?: unknown };
    expect(shipping.renderPreparation).toEqual(buildMapRenderPreparation(data));
  });

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

  it("uses generated bounds and labels without changing the shipping map", async () => {
    const data = decodePackedMapData(mapDataFixture);
    const metadata = buildMapRenderPreparation(data);
    const [fallback, prepared] = await Promise.all([
      prepareMapRendering(data, extent, 0.07, () => false),
      prepareMapRendering(data, extent, 0.07, () => false, JSON.parse(JSON.stringify(metadata))),
    ]);
    expect(prepared!.projection.scale()).toBe(fallback!.projection.scale());
    expect(prepared!.projection.translate()).toEqual(fallback!.projection.translate());
    expect(prepared!.topologyGeometryById).toEqual(fallback!.topologyGeometryById);
    expect(prepared!.renderGeometryById).toEqual(fallback!.renderGeometryById);
    const baseCountries = new Map(data.baseCountries.map((country) => [country.entityId, country]));
    for (const entity of data.countries) {
      const baseCountry = baseCountries.get(entity.id);
      const geometries = baseCountry ? [baseCountry.geometry] : entity.regionIds.map((id) => fallback!.renderGeometryById.get(id)!);
      const label = layoutCountryLabel({
        id: entity.id,
        name: entity.name,
        geometries,
        project: (position) => fallback!.projection([position[0], position[1]]),
      });
      expect(prepared!.baseCountryLabels.has(entity.id)).toBe(true);
      expect(prepared!.baseCountryLabels.get(entity.id)).toEqual(label);
    }
    expect([...prepared!.baseCountryLabels.values()]).toContain(null);
  });

  it("does not reuse labels for another projection or a changed source name", async () => {
    const data = decodePackedMapData(mapDataFixture);
    const metadata = buildMapRenderPreparation(data);
    const changedExtent: typeof extent = [[0, 0], [500, 300]];
    const [fallback, prepared] = await Promise.all([
      prepareMapRendering(data, changedExtent, 0.07, () => false),
      prepareMapRendering(data, changedExtent, 0.07, () => false, metadata),
    ]);
    expect(prepared!.projection.scale()).toBe(fallback!.projection.scale());
    expect(prepared!.projection.translate()).toEqual(fallback!.projection.translate());
    expect(prepared!.baseCountryLabels.size).toBe(0);

    const anotherTolerance = await prepareMapRendering(data, extent, 0.1, () => false, metadata);
    expect(anotherTolerance!.baseCountryLabels.size).toBe(0);

    const country = data.countries[0];
    const changedData = {
      ...data,
      countries: data.countries.map((entity) => entity.id === country.id ? { ...entity, name: "Different country name" } : entity),
    };
    const renamed = await prepareMapRendering(changedData, extent, 0.07, () => false, metadata);
    expect(renamed!.baseCountryLabels.has(country.id)).toBe(false);
    expect(renamed!.baseCountryLabels.size).toBeGreaterThan(0);
  });

  it("falls back safely for unsupported or malformed generated metadata", async () => {
    const data = decodePackedMapData(mapDataFixture);
    const metadata = buildMapRenderPreparation(data);
    const fallback = await prepareMapRendering(data, extent, 0.07, () => false);
    const malformed = [
      { ...metadata, version: 2 },
      { ...metadata, referenceBounds: [[0, 0], [Infinity, 100]] },
      { ...metadata, labelProjection: { ...metadata.labelProjection, translate: [0] } },
      { ...metadata, baseCountryLabels: [{ id: "AAA", name: "Invalid", label: {} }] },
    ];
    for (const value of malformed) {
      const prepared = await prepareMapRendering(data, extent, 0.07, () => false, value);
      expect(prepared!.projection.scale()).toBe(fallback!.projection.scale());
      expect(prepared!.projection.translate()).toEqual(fallback!.projection.translate());
      expect(prepared!.baseCountryLabels.size).toBe(0);
    }
  });

  it("discards a cancelled preparation when generated bounds make it finish in one batch", async () => {
    const original = decodePackedMapData(mapDataFixture);
    const data = { ...original, regions: original.regions.slice(0, 1), baseCountries: [], countries: [] };
    const metadata = buildMapRenderPreparation(data);
    let cancelled = false;
    const preparation = prepareMapRendering(data, extent, 0.07, () => cancelled, metadata);
    cancelled = true;
    await expect(preparation).resolves.toBeNull();
  });
});
