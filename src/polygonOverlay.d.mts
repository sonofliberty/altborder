import type { Geometry } from "geojson";

export function overlayPolygonalGeometry(operation: "union" | "difference" | "intersection", left: Geometry, right: Geometry): Geometry;
export function normalizePolygonalGeometry(geometry: Geometry): Geometry;
