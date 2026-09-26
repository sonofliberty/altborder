const closeAdministrativeBorderZoom = 2.4;
const detailAdministrativeBorderZoom = 5.5;
const minimumCountryBorderWidth = 1.25;
const maximumCountryBorderWidth = 3;

export function getAdministrativeBorderZoomClass(zoomScale: number): string {
  if (!Number.isFinite(zoomScale) || zoomScale < closeAdministrativeBorderZoom) {
    return "map-admin-borders-default";
  }

  if (zoomScale < detailAdministrativeBorderZoom) {
    return "map-admin-borders-close";
  }

  return "map-admin-borders-detail";
}

export function getCountryBorderStrokeWidth(zoomScale: number): number {
  if (!Number.isFinite(zoomScale)) return minimumCountryBorderWidth;
  return Math.min(
    maximumCountryBorderWidth,
    Math.max(minimumCountryBorderWidth, minimumCountryBorderWidth + (zoomScale - 1) * 0.4),
  );
}
