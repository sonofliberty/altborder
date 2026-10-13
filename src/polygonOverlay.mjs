import ClipperLib from "clipper-lib";

const scale = 100000;
const fill = ClipperLib.PolyFillType.pftNonZero;

function pathsFor(geometry) {
  const rings = geometry.type === "Polygon" ? geometry.coordinates : geometry.coordinates.flat();
  return rings.map((ring) => ring.map(([x, y]) => ({ X: Math.round(x * scale), Y: Math.round(y * scale) })));
}

function execute(operation, subject, clip = []) {
  const clipper = new ClipperLib.Clipper();
  clipper.AddPaths(subject, ClipperLib.PolyType.ptSubject, true);
  clipper.AddPaths(clip, ClipperLib.PolyType.ptClip, true);
  const result = new ClipperLib.PolyTree();
  const types = { union: ClipperLib.ClipType.ctUnion, difference: ClipperLib.ClipType.ctDifference, intersection: ClipperLib.ClipType.ctIntersection };
  if (!clipper.Execute(types[operation], result, fill, fill)) throw new Error(`Could not ${operation} country geometry.`);
  const closeRing = (path) => {
    const ring = path.map(({ X, Y }) => [X / scale, Y / scale]);
    return [...ring, [...ring[0]]];
  };
  return { type: "MultiPolygon", coordinates: ClipperLib.JS.PolyTreeToExPolygons(result)
    .map(({ outer, holes }) => [closeRing(outer), ...holes.map(closeRing)]) };
}

/** Use one fixed grid for nearly coincident polygon edges. */
export function overlayPolygonalGeometry(operation, left, right) {
  return execute(operation, pathsFor(left), pathsFor(right));
}

/** Split self-touching contours and remove duplicated area. */
export function normalizePolygonalGeometry(geometry) {
  return execute("union", ClipperLib.Clipper.SimplifyPolygons(pathsFor(geometry), fill));
}
