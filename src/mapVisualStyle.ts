const closeSubdivisionBorderZoom = 2.4;
const detailSubdivisionBorderZoom = 5.5;

export function getSubdivisionBorderZoomClass(zoomScale: number): string {
  if (!Number.isFinite(zoomScale) || zoomScale < closeSubdivisionBorderZoom) {
    return "map-admin-borders-default";
  }

  if (zoomScale < detailSubdivisionBorderZoom) {
    return "map-admin-borders-close";
  }

  return "map-admin-borders-detail";
}
