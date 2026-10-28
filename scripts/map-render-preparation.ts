import { geoNaturalEarth1, geoPath } from "d3-geo";
import { layoutCountryLabel } from "../src/labelLayout";
import { removePolygonalGeometryHoles, simplifyPolygonalGeometry } from "../src/geometrySimplify";
import { fitMapProjectionToBounds, type MapRenderPreparation } from "../src/mapPreparation";
import type { MapData } from "../src/types";

/** Keep generated labels on the same projection and fitting algorithm as edits. */
export function buildMapRenderPreparation(data: MapData): MapRenderPreparation {
  const projection = geoNaturalEarth1().scale(150).translate([0, 0]);
  const path = geoPath(projection);
  const referenceBounds: MapRenderPreparation["referenceBounds"] = [[Infinity, Infinity], [-Infinity, -Infinity]];
  for (const region of data.regions) {
    const geometries = region.geometry.type === "MultiPolygon"
      ? region.geometry.coordinates.map((coordinates) => ({ type: "Polygon" as const, coordinates }))
      : [region.geometry];
    for (const geometry of geometries) {
      const bounds = path.bounds(geometry);
      referenceBounds[0][0] = Math.min(referenceBounds[0][0], bounds[0][0]);
      referenceBounds[0][1] = Math.min(referenceBounds[0][1], bounds[0][1]);
      referenceBounds[1][0] = Math.max(referenceBounds[1][0], bounds[1][0]);
      referenceBounds[1][1] = Math.max(referenceBounds[1][1], bounds[1][1]);
    }
  }
  fitMapProjectionToBounds(projection, referenceBounds, [[16, 18], [984, 538]]);
  const simplifyTolerance = 0.07;
  const baseCountries = new Map(data.baseCountries.map((country) => [country.entityId, country]));
  const regions = new Map(data.regions.map((region) => [region.id, region]));
  return {
    version: 1,
    referenceBounds,
    labelProjection: { scale: projection.scale(), translate: projection.translate(), simplifyTolerance },
    baseCountryLabels: data.countries.map((entity) => {
      const baseCountry = baseCountries.get(entity.id);
      const geometries = baseCountry ? [baseCountry.geometry] : entity.regionIds.flatMap((id) => {
        const region = regions.get(id);
        return region ? [simplifyPolygonalGeometry(removePolygonalGeometryHoles(region.geometry), simplifyTolerance)] : [];
      });
      return {
        id: entity.id,
        name: entity.name,
        label: layoutCountryLabel({
          id: entity.id,
          name: entity.name,
          geometries,
          project: (position) => projection([position[0], position[1]]),
        }),
      };
    }),
  };
}
