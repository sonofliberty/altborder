const closeAdministrativeBorderZoom = 2.4;
const detailAdministrativeBorderZoom = 5.5;

export function getAdministrativeBorderZoomClass(zoomScale: number): string {
  if (!Number.isFinite(zoomScale) || zoomScale < closeAdministrativeBorderZoom) {
    return "map-admin-borders-default";
  }

  if (zoomScale < detailAdministrativeBorderZoom) {
    return "map-admin-borders-close";
  }

  return "map-admin-borders-detail";
}
