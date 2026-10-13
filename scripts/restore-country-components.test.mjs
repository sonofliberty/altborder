import { describe, expect, it } from "vitest";
import { restoreCountryComponents } from "./restore-country-components.mjs";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import OverlayOp from "jsts/org/locationtech/jts/operation/overlay/OverlayOp.js";

const reader = new GeoJSONReader(new GeometryFactory());

const square = (x1, y1, x2, y2) => ({
  type: "Polygon",
  coordinates: [[[x1, y1], [x2, y1], [x2, y2], [x1, y2], [x1, y1]]],
});

describe("country component coverage", () => {
  it("adds an omitted island to the closest owned region without changing IDs or names", () => {
    const west = { id: "west", name: "West", ownerId: "AAA", type: "Province", geometry: square(0, 0, 5, 10) };
    const east = { id: "east", name: "East", ownerId: "AAA", type: "Province", geometry: square(5, 0, 10, 10) };
    const foreign = { id: "foreign", name: "Foreign", ownerId: "BBB", type: "Province", geometry: square(19, 0, 20, 10) };
    const island = square(20, 0, 25, 5);
    const data = {
      countries: [{ id: "AAA", regionIds: [west.id, east.id] }],
      regions: [west, east, foreign],
      baseCountries: [{ entityId: "AAA", geometry: { type: "MultiPolygon", coordinates: [square(0, 0, 10, 10).coordinates, island.coordinates] } }],
    };
    const restored = restoreCountryComponents(data);
    expect(restored[0]).toBe(west);
    expect(restored[2]).toBe(foreign);
    expect(restored[1]).toMatchObject({ id: east.id, name: east.name, ownerId: east.ownerId, type: east.type });
    const expected = OverlayOp.union(reader.read(east.geometry), reader.read(island));
    expect(OverlayOp.symDifference(reader.read(restored[1].geometry), expected).getArea()).toBeLessThan(1e-9);
    expect(data.regions[1]).toBe(east);
    expect(restoreCountryComponents({ ...data, regions: restored })).toEqual(restored);
  });

  it("keeps fully represented components unchanged", () => {
    const region = { id: "main", name: "Main", type: "Province", geometry: square(0, 0, 10, 10) };
    const regions = restoreCountryComponents({
      countries: [{ id: "AAA", regionIds: [region.id] }],
      regions: [region],
      baseCountries: [{ entityId: "AAA", geometry: region.geometry }],
    });
    expect(regions[0]).toBe(region);
  });

  it("fills coastal gaps without moving the existing border between regions", () => {
    const west = { id: "west", name: "West", type: "Province", geometry: square(0, 0, 5, 10) };
    const east = { id: "east", name: "East", type: "Province", geometry: square(5, 0, 10, 10) };
    const country = square(-0.02, -0.02, 10.02, 10.02);
    const data = { countries: [{ id: "AAA", regionIds: [west.id, east.id] }], regions: [west, east], baseCountries: [{ entityId: "AAA", geometry: country }] };
    const restored = restoreCountryComponents(data);
    expect(restored.map(({ id, name, type }) => ({ id, name, type }))).toEqual(data.regions.map(({ id, name, type }) => ({ id, name, type })));
    const geometries = restored.map(({ geometry }) => reader.read(geometry));
    const coverage = OverlayOp.union(geometries[0], geometries[1]);
    expect(OverlayOp.difference(reader.read(country), coverage).getArea()).toBeLessThan(1e-9);
    expect(OverlayOp.intersection(geometries[0], geometries[1]).getArea()).toBeLessThan(1e-9);
    for (let index = 0; index < 2; index += 1) {
      expect(OverlayOp.difference(reader.read(data.regions[index].geometry), geometries[index]).getArea()).toBeLessThan(1e-9);
    }
    expect(OverlayOp.intersection(geometries[0], reader.read(square(5.03, -0.02, 10.02, 10.02))).getArea()).toBeLessThan(1e-9);
    expect(restoreCountryComponents({ ...data, regions: restored })).toEqual(restored);
  });
});
