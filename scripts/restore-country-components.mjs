import rewind from "@turf/rewind";
import { overlayPolygonalGeometry, normalizePolygonalGeometry } from "../src/polygonOverlay.mjs";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import BufferOp from "jsts/org/locationtech/jts/operation/buffer/BufferOp.js";
import DistanceOp from "jsts/org/locationtech/jts/operation/distance/DistanceOp.js";

const reader = new GeoJSONReader(new GeometryFactory());
const writer = new GeoJSONWriter();
const read = (geometry) => BufferOp.bufferOp(reader.read(geometry), 0);
const minimumArea = 1e-10;
function overlay(operation, left, right) {
  return reader.read(overlayPolygonalGeometry(operation, writer.write(left), writer.write(right)));
}

/** Restore country land omitted from administrative geometry, including coastal gaps. */
export function restoreCountryComponents({ countries, regions, baseCountries }) {
  const indexed = new Map(regions.map((region) => [region.id, {
    region,
    geometry: read(region.geometry),
  }]));
  const countryById = new Map(countries.map((country) => [country.id, country]));
  const replacements = new Map();

  for (const country of baseCountries) {
    const candidates = (countryById.get(country.entityId)?.regionIds ?? [])
      .map((id) => indexed.get(id))
      .filter(Boolean);
    if (candidates.length === 0) continue;
    const originalGeometries = new Map(candidates.map((candidate) => [candidate.region.id, candidate.geometry]));
    const polygons = country.geometry.type === "Polygon"
      ? [country.geometry.coordinates]
      : country.geometry.coordinates;
    for (const polygon of polygons) {
      const component = read({ type: "Polygon", coordinates: polygon });
      const area = component.getArea();
      if (area <= minimumArea) continue;
      const covered = candidates.some(({ geometry }) =>
        component.getEnvelopeInternal().intersects(geometry.getEnvelopeInternal()) &&
        overlay("intersection", component, geometry).getArea() > minimumArea,
      );
      if (covered) {
        let missing = component;
        for (const candidate of candidates) {
          if (!missing.getEnvelopeInternal().intersects(candidate.geometry.getEnvelopeInternal())) continue;
          missing = overlay("difference", missing, candidate.geometry);
          if (missing.getArea() <= minimumArea) break;
        }
        // Restore coastal land. Interior gaps are source boundary differences;
        // assigning them here would create new inland enclaves.
        const boundary = component.getBoundary();
        const coastal = [];
        for (let index = 0; index < missing.getNumGeometries(); index += 1) {
          const patch = missing.getGeometryN(index);
          if (DistanceOp.distance(patch, boundary) <= 1e-5) coastal.push(patch);
        }
        missing = component.getFactory().createMultiPolygon(coastal);
        // Fill nearby gaps in small steps, so one region cannot take an entire
        // connected coastal strip around its neighbors.
        for (const distance of [0.0025, 0.005, 0.01, 0.02, 0.04, 0.08, 0.16]) {
          if (missing.getArea() <= minimumArea) break;
          for (const candidate of candidates) {
            const original = originalGeometries.get(candidate.region.id);
            if (DistanceOp.distance(missing, original) > distance) continue;
            const expanded = BufferOp.bufferOp(original, distance, 1);
            const patch = BufferOp.bufferOp(overlay("intersection", missing, expanded), 0);
            if (patch.getArea() <= minimumArea) continue;
            candidate.geometry = overlay("union", candidate.geometry, patch);
            replacements.set(candidate.region.id, candidate);
            missing = overlay("difference", missing, patch);
            if (missing.getArea() <= minimumArea) break;
          }
        }
        // A larger omitted area still belongs to the nearest region of this country.
        for (let index = 0; index < missing.getNumGeometries(); index += 1) {
          const patch = missing.getGeometryN(index);
          if (patch.getArea() <= minimumArea) continue;
          const nearest = nearestRegion(patch, candidates);
          nearest.geometry = overlay("union", nearest.geometry, patch);
          replacements.set(nearest.region.id, nearest);
        }
        continue;
      }

      const nearest = nearestRegion(component, candidates);
      nearest.geometry = overlay("union", nearest.geometry, component);
      replacements.set(nearest.region.id, nearest);
      // Also cover repeated or overlapping ADM0 records for the same country.
    }
  }
  return regions.map((region) => {
    const replacement = replacements.get(region.id);
    if (!replacement) return region;
    const geometry = writer.write(replacement.geometry);
    for (const polygon of geometry.coordinates) {
      for (let index = polygon.length - 1; index > 0; index -= 1) {
        const ring = polygon[index];
        const area = Math.abs(ring.reduce((sum, point, offset) => {
          const next = ring[(offset + 1) % ring.length];
          return sum + point[0] * next[1] - next[0] * point[1];
        }, 0)) / 2;
        if (area < 1e-6) polygon.splice(index, 1);
      }
    }
    return { ...region, geometry: rewind(normalizePolygonalGeometry(geometry), { reverse: true }) };
  });
}

function nearestRegion(geometry, candidates) {
  let nearest = candidates[0];
  let nearestDistance = Infinity;
  for (const candidate of candidates) {
    const distance = DistanceOp.distance(geometry, candidate.geometry);
    if (distance < nearestDistance) {
      nearest = candidate;
      nearestDistance = distance;
    }
  }
  return nearest;
}
