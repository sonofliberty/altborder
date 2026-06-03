import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { feature } from "topojson-client";
import simplify from "@turf/simplify";
import rewind from "@turf/rewind";
import GeoJSONReader from "jsts/org/locationtech/jts/io/GeoJSONReader.js";
import GeoJSONWriter from "jsts/org/locationtech/jts/io/GeoJSONWriter.js";
import GeometryFactory from "jsts/org/locationtech/jts/geom/GeometryFactory.js";
import BufferOp from "jsts/org/locationtech/jts/operation/buffer/BufferOp.js";
import OverlayOp from "jsts/org/locationtech/jts/operation/overlay/OverlayOp.js";
import UnaryUnionOp from "jsts/org/locationtech/jts/operation/union/UnaryUnionOp.js";
import ArrayList from "jsts/java/util/ArrayList.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const cacheDir = path.join(root, ".cache/geoboundaries");
const adm1SimplifyTolerance = 0.03;
const fallbackSimplifyTolerance = 0.015;
const fallbackSimplifyToleranceByCountryId = new Map([["CAN", 0.008]]);
const singleRegionAdm0SimplifyToleranceByCountryId = new Map([
  ["CAN", 0.01],
  ["VAT", 0.00001],
]);
const subdivisionBorderSimplifyTolerance = 0.03;
const subdivisionBorderMatchTolerance = 0.02;
const minimumSubdivisionBorderLength = 1e-6;
const minimumPolygonArea = 0.005;
const minimumClippedAreaRetentionRatio = 0.2;
const coordinatePrecision = 2;
const fallbackPolygonCoordinatePrecision = 5;
const fetchTimeoutMs = 180_000;
const reader = new GeoJSONReader(new GeometryFactory());
const writer = new GeoJSONWriter();
const skipLandMaskClipCountryIds = new Set(["RUS"]);

const adm1Countries = [
  { iso3: "USA", name: "United States", aliases: ["United States of America"] },
  { iso3: "MEX", name: "Mexico", aliases: ["Mexico"] },
  { iso3: "BRA", name: "Brazil", aliases: ["Brazil"] },
  { iso3: "ARG", name: "Argentina", aliases: ["Argentina"] },
  { iso3: "CHL", name: "Chile", aliases: ["Chile"] },
  { iso3: "COL", name: "Colombia", aliases: ["Colombia"] },
  { iso3: "ECU", name: "Ecuador", aliases: ["Ecuador"] },
  { iso3: "GUY", name: "Guyana", aliases: ["Guyana"] },
  { iso3: "PER", name: "Peru", aliases: ["Peru"] },
  { iso3: "SUR", name: "Suriname", aliases: ["Suriname"] },
  { iso3: "VEN", name: "Venezuela", aliases: ["Venezuela"] },
  { iso3: "GBR", name: "United Kingdom", aliases: ["United Kingdom"] },
  { iso3: "FRA", name: "France", aliases: ["France"] },
  { iso3: "DEU", name: "Germany", aliases: ["Germany"] },
  { iso3: "POL", name: "Poland", aliases: ["Poland"] },
  { iso3: "NLD", name: "Netherlands", aliases: ["Netherlands"] },
  { iso3: "BEL", name: "Belgium", aliases: ["Belgium"] },
  { iso3: "AUT", name: "Austria", aliases: ["Austria"] },
  { iso3: "CHE", name: "Switzerland", aliases: ["Switzerland"] },
  { iso3: "DNK", name: "Denmark", aliases: ["Denmark"] },
  { iso3: "FIN", name: "Finland", aliases: ["Finland"] },
  { iso3: "ISL", name: "Iceland", aliases: ["Iceland"] },
  { iso3: "IRL", name: "Ireland", aliases: ["Ireland"] },
  { iso3: "NOR", name: "Norway", aliases: ["Norway"] },
  { iso3: "SWE", name: "Sweden", aliases: ["Sweden"] },
  { iso3: "CZE", name: "Czechia", aliases: ["Czechia", "Czech Republic"] },
  { iso3: "ITA", name: "Italy", aliases: ["Italy"] },
  { iso3: "ESP", name: "Spain", aliases: ["Spain"] },
  { iso3: "BOL", name: "Bolivia", aliases: ["Bolivia"] },
  { iso3: "PRY", name: "Paraguay", aliases: ["Paraguay"] },
  { iso3: "URY", name: "Uruguay", aliases: ["Uruguay"] },
  { iso3: "BLR", name: "Belarus", aliases: ["Belarus"] },
  { iso3: "UKR", name: "Ukraine", aliases: ["Ukraine"] },
  { iso3: "EST", name: "Estonia", aliases: ["Estonia"] },
  { iso3: "LVA", name: "Latvia", aliases: ["Latvia"] },
  { iso3: "LTU", name: "Lithuania", aliases: ["Lithuania"] },
  { iso3: "ROU", name: "Romania", aliases: ["Romania"] },
  { iso3: "HUN", name: "Hungary", aliases: ["Hungary"] },
  { iso3: "BGR", name: "Bulgaria", aliases: ["Bulgaria"] },
  { iso3: "GRC", name: "Greece", aliases: ["Greece"] },
  { iso3: "ALB", name: "Albania", aliases: ["Albania"] },
  { iso3: "ARM", name: "Armenia", aliases: ["Armenia"] },
  { iso3: "AZE", name: "Azerbaijan", aliases: ["Azerbaijan"] },
  { iso3: "BIH", name: "Bosnia and Herzegovina", aliases: ["Bosnia and Herz.", "Bosnia and Herzegovina"] },
  { iso3: "HRV", name: "Croatia", aliases: ["Croatia"] },
  { iso3: "CYP", name: "Cyprus", aliases: ["Cyprus"] },
  { iso3: "GEO", name: "Georgia", aliases: ["Georgia"] },
  { iso3: "XKX", name: "Kosovo", aliases: ["Kosovo"] },
  { iso3: "MKD", name: "North Macedonia", aliases: ["Macedonia", "North Macedonia"] },
  { iso3: "MDA", name: "Moldova", aliases: ["Moldova"] },
  { iso3: "MNE", name: "Montenegro", aliases: ["Montenegro"] },
  { iso3: "PRT", name: "Portugal", aliases: ["Portugal"] },
  { iso3: "SRB", name: "Serbia", aliases: ["Serbia"] },
  { iso3: "SVK", name: "Slovakia", aliases: ["Slovakia"] },
  { iso3: "SVN", name: "Slovenia", aliases: ["Slovenia"] },
  { iso3: "RUS", name: "Russia", aliases: ["Russia"] },
  { iso3: "IND", name: "India", aliases: ["India"] },
  { iso3: "CHN", name: "China", aliases: ["China"] },
  { iso3: "JPN", name: "Japan", aliases: ["Japan"] },
  { iso3: "AUS", name: "Australia", aliases: ["Australia"] },
  { iso3: "KAZ", name: "Kazakhstan", aliases: ["Kazakhstan"] },
  { iso3: "MNG", name: "Mongolia", aliases: ["Mongolia"] },
  { iso3: "BRN", name: "Brunei", aliases: ["Brunei"] },
  { iso3: "KHM", name: "Cambodia", aliases: ["Cambodia"] },
  { iso3: "IDN", name: "Indonesia", aliases: ["Indonesia"] },
  { iso3: "LAO", name: "Laos", aliases: ["Laos", "Lao PDR"] },
  { iso3: "MYS", name: "Malaysia", aliases: ["Malaysia"] },
  { iso3: "MMR", name: "Myanmar", aliases: ["Myanmar", "Burma"] },
  { iso3: "PHL", name: "Philippines", aliases: ["Philippines"] },
  { iso3: "THA", name: "Thailand", aliases: ["Thailand"] },
  { iso3: "TLS", name: "Timor-Leste", aliases: ["Timor-Leste", "East Timor"] },
  { iso3: "VNM", name: "Vietnam", aliases: ["Vietnam", "Viet Nam"] },
  { iso3: "PRK", name: "North Korea", aliases: ["North Korea"] },
  { iso3: "KOR", name: "South Korea", aliases: ["South Korea"] },
  { iso3: "TUR", name: "Turkey", aliases: ["Turkey"] },
  { iso3: "IRN", name: "Iran", aliases: ["Iran"] },
  { iso3: "SAU", name: "Saudi Arabia", aliases: ["Saudi Arabia"] },
  { iso3: "BHR", name: "Bahrain", aliases: ["Bahrain"] },
  { iso3: "IRQ", name: "Iraq", aliases: ["Iraq"] },
  { iso3: "ISR", name: "Israel", aliases: ["Israel"] },
  { iso3: "JOR", name: "Jordan", aliases: ["Jordan"] },
  { iso3: "KWT", name: "Kuwait", aliases: ["Kuwait"] },
  { iso3: "LBN", name: "Lebanon", aliases: ["Lebanon"] },
  { iso3: "OMN", name: "Oman", aliases: ["Oman"] },
  { iso3: "PSE", name: "Palestine", aliases: ["Palestine"] },
  { iso3: "QAT", name: "Qatar", aliases: ["Qatar"] },
  { iso3: "SYR", name: "Syria", aliases: ["Syria"] },
  { iso3: "ARE", name: "United Arab Emirates", aliases: ["United Arab Emirates", "UAE"] },
  { iso3: "YEM", name: "Yemen", aliases: ["Yemen"] },
  { iso3: "ZAF", name: "South Africa", aliases: ["South Africa"] },
  { iso3: "NGA", name: "Nigeria", aliases: ["Nigeria"] },
  { iso3: "EGY", name: "Egypt", aliases: ["Egypt"] },
];

const singleRegionCountries = [
  { iso3: "CAN", name: "Canada", aliases: ["Canada"] },
  { iso3: "LUX", name: "Luxembourg", aliases: ["Luxembourg"] },
  { iso3: "LIE", name: "Liechtenstein", aliases: ["Liechtenstein"] },
  { iso3: "AND", name: "Andorra", aliases: ["Andorra"] },
  { iso3: "MCO", name: "Monaco", aliases: ["Monaco"] },
  { iso3: "SMR", name: "San Marino", aliases: ["San Marino"] },
  { iso3: "VAT", name: "Vatican", aliases: ["Vatican", "Vatican City"] },
  { iso3: "MLT", name: "Malta", aliases: ["Malta"] },
];

const singleRegionAdm0CountryIds = new Set(["CAN", "VAT"]);

const nonSovereignFallbackOwners = {
  akrotiri: "GBR",
  ashmoreandcartieris: "AUS",
  baikonur: "KAZ",
  brindianoceanter: "GBR",
  clippertoni: "FRA",
  coralseais: "AUS",
  cyprusunbufferzone: "CYP",
  dhekelia: "GBR",
  heardiandmcdonaldis: "AUS",
  indianoceanter: "AUS",
  // normalizeName strips the leading Å, so Åland is keyed as "land".
  land: "FIN",
  norfolkisland: "AUS",
  siachenglacier: "IND",
  usnbguantanamobay: "NE-192",
};

const hiddenFallbackNames = new Set([
  "bajonuevobank",
  "scarboroughreef",
  "serranillabank",
  "spratlyis",
]);

const selectedNames = new Set(
  adm1Countries.flatMap((country) => [country.name, ...country.aliases]).map(normalizeName),
);
const singleRegionCountryByName = new Map(
  singleRegionCountries.flatMap((country) =>
    [country.name, ...country.aliases].map((name) => [normalizeName(name), country]),
  ),
);

async function main() {
  const colorScheme = await loadColorScheme();
  const topoPath = path.join(root, "node_modules/world-atlas/countries-10m.json");
  const topo = JSON.parse(await fs.readFile(topoPath, "utf8"));
  const countryCollection = feature(topo, topo.objects.countries);
  const worldCountries = countryCollection.features;
  const worldLandFeatures = worldCountries.flatMap((worldFeature) =>
    getGeometryPolygons(simplifyGeometry(worldFeature.geometry, fallbackSimplifyTolerance)).map((polygon) => ({
      geometry: polygonsToGeometry([polygon]),
      bbox: polygonBoundingBox(polygon),
    })),
  );
  const singleRegionAdm0Geometries = await loadSingleRegionAdm0Geometries();

  const countries = [];
  const regions = [];
  const baseCountries = [];
  const countryNameToId = new Map();
  const errors = [];
  const usedRegionIds = new Set();
  const usedWorldFeatureIds = new Set();
  const nonSovereignFallbacks = new Map();

  for (const country of adm1Countries) {
    try {
      const meta = await fetchCachedJson(
        `https://www.geoboundaries.org/api/current/gbOpen/${country.iso3}/ADM1/`,
      );
      const geojson = await fetchCachedJson(meta.gjDownloadURL || meta.simplifiedGeometryGeoJSON);
      const regionIds = [];

      for (const [featureIndex, regionFeature] of geojson.features.entries()) {
        const properties = regionFeature.properties ?? {};
        const id = makeAdm1RegionId(country.iso3, properties, featureIndex, usedRegionIds);
        const region = {
          id,
          name: cleanDisplayName(properties.shapeName || `${country.name} region ${featureIndex + 1}`),
          ownerId: country.iso3,
          type: meta.boundaryCanonical || "ADM1",
          geometry: simplifyAdm1Geometry(regionFeature.geometry, country.iso3, worldLandFeatures),
        };
        regions.push(region);
        regionIds.push(id);
      }

      countries.push({
        id: country.iso3,
        name: country.name,
        color: getCountryColor(colorScheme, {
          id: country.iso3,
          name: country.name,
          aliases: country.aliases,
        }),
        regionIds,
        hasAdm1: true,
      });
      countryNameToId.set(normalizeName(country.name), country.iso3);
      for (const alias of country.aliases) {
        countryNameToId.set(normalizeName(alias), country.iso3);
      }
      console.log(`Loaded ${country.iso3}: ${regionIds.length} ADM1 regions`);
    } catch (error) {
      errors.push(`${country.iso3}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const [worldIndex, worldFeature] of worldCountries.entries()) {
    const worldName = String(worldFeature.properties?.name ?? `Country ${worldFeature.id}`);
    const normalizedWorldName = normalizeName(worldName);
    const worldFeatureId = makeUniqueId(
      cleanId(worldFeature.id) || cleanId(worldName) || `country-${worldIndex + 1}`,
      usedWorldFeatureIds,
    );
    const nonSovereignOwnerId = nonSovereignFallbackOwners[normalizedWorldName];
    const singleRegionCountry = singleRegionCountryByName.get(normalizedWorldName);
    const fallbackCountryId = singleRegionCountry?.iso3 || `NE-${worldFeatureId}`;
    const worldGeometry = simplifyGeometry(
      worldFeature.geometry,
      fallbackSimplifyToleranceByCountryId.get(fallbackCountryId) ?? fallbackSimplifyTolerance,
    );

    if (hiddenFallbackNames.has(normalizedWorldName)) {
      continue;
    }

    if (nonSovereignOwnerId) {
      const regionId = makeUniqueId(`${nonSovereignOwnerId}-${cleanId(worldName)}`, usedRegionIds);
      regions.push({
        id: regionId,
        name: worldName,
        ownerId: nonSovereignOwnerId,
        type: "Non-sovereign territory",
        geometry: worldGeometry,
      });

      const pending = nonSovereignFallbacks.get(nonSovereignOwnerId) ?? { regionIds: [], geometries: [] };
      pending.regionIds.push(regionId);
      pending.geometries.push(worldGeometry);
      nonSovereignFallbacks.set(nonSovereignOwnerId, pending);
      continue;
    }

    const entityId = countryNameToId.get(normalizedWorldName) || singleRegionCountry?.iso3 || `NE-${worldFeatureId}`;
    baseCountries.push({
      id: `BASE-${worldFeatureId}`,
      entityId,
      name: worldName,
      geometry: worldGeometry,
    });

    if (shouldSkipWorldFallback(normalizedWorldName, countryNameToId)) {
      continue;
    }

    const fallbackRegionId = `${fallbackCountryId}-ALL`;
    countries.push({
      id: fallbackCountryId,
      name: singleRegionCountry?.name || worldName,
      color: getCountryColor(colorScheme, {
        id: fallbackCountryId,
        name: singleRegionCountry?.name || worldName,
        aliases: singleRegionCountry?.aliases,
      }),
      regionIds: [fallbackRegionId],
      hasAdm1: false,
    });
    countryNameToId.set(normalizedWorldName, fallbackCountryId);
    for (const alias of singleRegionCountry?.aliases ?? []) {
      countryNameToId.set(normalizeName(alias), fallbackCountryId);
    }
    const fallbackGeometry = conformSingleRegionFallbackGeometry(
      fallbackCountryId,
      singleRegionAdm0Geometries.get(fallbackCountryId) ?? worldGeometry,
      regions,
    );
    regions.push({
      id: fallbackRegionId,
      name: singleRegionCountry?.name || worldName,
      ownerId: fallbackCountryId,
      type: "Whole country fallback",
      geometry: fallbackGeometry,
    });
    usedRegionIds.add(fallbackRegionId);
  }

  attachNonSovereignFallbacks({ countries, baseCountries, nonSovereignFallbacks, errors });
  addFrenchOverseasRegions({ countries, regions, baseCountries, usedRegionIds });
  assignCountryColors({ countries, baseCountries, colorScheme });
  const subdivisionBorders = buildSubdivisionBorders(countries, regions);

  countries.sort((a, b) => a.name.localeCompare(b.name));
  regions.sort((a, b) => a.id.localeCompare(b.id));
  subdivisionBorders.sort((a, b) => a.id.localeCompare(b.id));
  const outputBaseCountries = filterOutputBaseCountries(baseCountries, countries);
  const outputCountries = stripInternalCountryFields(countries);
  const outputRegions = stripInternalRegionFields(regions);
  outputBaseCountries.sort((a, b) => a.name.localeCompare(b.name));
  const outputBaseCountryRecords = stripInternalBaseCountryFields(outputBaseCountries);

  const output = {
    version: 1,
    attribution:
      "Administrative regions from geoBoundaries Open (CC BY 4.0). Fallback country geometry from geoBoundaries ADM0 where configured, otherwise world-atlas / Natural Earth public domain data.",
    baseCountries: outputBaseCountryRecords,
    countries: outputCountries,
    regions: outputRegions,
    subdivisionBorders,
  };

  await fs.mkdir(path.join(root, "public/data"), { recursive: true });
  await fs.writeFile(
    path.join(root, "public/data/map-data.json"),
    `${JSON.stringify(output)}\n`,
    "utf8",
  );
  console.log(`Wrote ${countries.length} countries and ${regions.length} regions`);
  if (errors.length > 0) {
    console.warn(`Completed with ${errors.length} warnings:`);
    for (const error of errors) {
      console.warn(`- ${error}`);
    }
  }
}

function stripInternalCountryFields(countries) {
  return countries.map((country) => {
    const outputCountry = { ...country };
    delete outputCountry.hasAdm1;
    return outputCountry;
  });
}

function stripInternalBaseCountryFields(baseCountries) {
  return baseCountries.map((baseCountry) => ({
    entityId: baseCountry.entityId,
    geometry: baseCountry.geometry,
  }));
}

function stripInternalRegionFields(regions) {
  return regions.map((region) => {
    const outputRegion = { ...region };
    delete outputRegion.ownerId;
    return outputRegion;
  });
}

function buildSubdivisionBorders(countries, regions) {
  const regionById = new Map(regions.map((region) => [region.id, region]));
  const borders = [];

  for (const country of countries) {
    if (country.regionIds.length <= 1) continue;

    const indexedRegions = country.regionIds
      .map((regionId) => regionById.get(regionId))
      .filter((region) => region && isPolygonalGeometry(region.geometry))
      .map((region) => ({
        id: region.id,
        bounds: geometryBoundingBox(region.geometry),
        boundary: readBoundaryGeometry(region.geometry),
      }));

    for (let firstIndex = 0; firstIndex < indexedRegions.length; firstIndex += 1) {
      for (let secondIndex = firstIndex + 1; secondIndex < indexedRegions.length; secondIndex += 1) {
        const first = indexedRegions[firstIndex];
        const second = indexedRegions[secondIndex];
        if (!bboxIntersectsWithTolerance(first.bounds, second.bounds, subdivisionBorderMatchTolerance)) continue;

        const geometry = sharedSubdivisionBorderGeometry(first.boundary, second.boundary);
        if (!geometry) continue;

        borders.push({
          id: `${country.id}:${first.id}:${second.id}`,
          ownerId: country.id,
          regionIds: [first.id, second.id],
          geometry,
        });
      }
    }
  }

  return borders;
}

function sharedSubdivisionBorderGeometry(firstBoundary, secondBoundary) {
  try {
    const secondBoundaryMatchArea = BufferOp.bufferOp(secondBoundary, subdivisionBorderMatchTolerance);
    const intersection = OverlayOp.intersection(firstBoundary, secondBoundaryMatchArea);
    if (intersection.isEmpty()) return null;

    const linealGeometry = collectLinealGeometry(writer.write(intersection));
    if (!linealGeometry || sharedLinealLength(linealGeometry) <= minimumSubdivisionBorderLength) return null;

    const simplified = simplifyLinealGeometry(linealGeometry, subdivisionBorderSimplifyTolerance);
    const pruned = pruneShortLinealParts(simplified, minimumSubdivisionBorderLength);
    return pruned ? roundGeometry(pruned) : null;
  } catch {
    return null;
  }
}

function collectLinealGeometry(geometry) {
  const lines = collectLineStrings(geometry);
  if (lines.length === 0) return null;
  if (lines.length === 1) {
    return { type: "LineString", coordinates: lines[0] };
  }
  return { type: "MultiLineString", coordinates: lines };
}

function collectLineStrings(geometry) {
  if (!geometry) return [];
  if (geometry.type === "LineString") return geometry.coordinates.length >= 2 ? [geometry.coordinates] : [];
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.filter((line) => line.length >= 2);
  }
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.flatMap(collectLineStrings);
  }
  return [];
}

function simplifyLinealGeometry(geometry, tolerance) {
  if (geometry.type === "LineString") {
    return { ...geometry, coordinates: simplifyLine(geometry.coordinates, tolerance) };
  }
  if (geometry.type === "MultiLineString") {
    return {
      ...geometry,
      coordinates: geometry.coordinates.map((line) => simplifyLine(line, tolerance)),
    };
  }
  return geometry;
}

function pruneShortLinealParts(geometry, minimumLength) {
  const lines = collectLineStrings(geometry).filter(
    (line) => line.length >= 2 && sharedLineLength(line) > minimumLength,
  );
  if (lines.length === 0) return null;
  if (lines.length === 1) return { type: "LineString", coordinates: lines[0] };
  return { type: "MultiLineString", coordinates: lines };
}

function sharedLinealLength(geometry) {
  return collectLineStrings(geometry).reduce((total, line) => total + sharedLineLength(line), 0);
}

function sharedLineLength(line) {
  return line.slice(1).reduce((total, point, index) => {
    const previous = line[index];
    return total + Math.hypot(point[0] - previous[0], point[1] - previous[1]);
  }, 0);
}

function simplifyLine(line, tolerance) {
  if (line.length <= 2) return line.map(copyPosition);

  const toleranceSquared = tolerance * tolerance;
  const radial = simplifyLineRadialDistance(line, toleranceSquared);
  const simplified = simplifyLineDouglasPeucker(radial, toleranceSquared);
  return simplified.length >= 2 ? simplified : line.map(copyPosition);
}

function simplifyLineRadialDistance(points, toleranceSquared) {
  const simplified = [copyPosition(points[0])];
  let previous = points[0];

  for (let index = 1; index < points.length; index += 1) {
    const point = points[index];
    if (distanceSquared(point, previous) > toleranceSquared) {
      simplified.push(copyPosition(point));
      previous = point;
    }
  }

  const last = points[points.length - 1];
  if (!positionsEqual(simplified[simplified.length - 1], last)) {
    simplified.push(copyPosition(last));
  }

  return simplified;
}

function simplifyLineDouglasPeucker(points, toleranceSquared) {
  if (points.length <= 2) return points.map(copyPosition);

  const keep = new Uint8Array(points.length);
  keep[0] = 1;
  keep[points.length - 1] = 1;
  const stack = [[0, points.length - 1]];

  while (stack.length > 0) {
    const [firstIndex, lastIndex] = stack.pop() ?? [0, 0];
    let maxDistanceSquared = 0;
    let maxIndex = 0;

    for (let index = firstIndex + 1; index < lastIndex; index += 1) {
      const distance = segmentDistanceSquared(points[index], points[firstIndex], points[lastIndex]);
      if (distance > maxDistanceSquared) {
        maxDistanceSquared = distance;
        maxIndex = index;
      }
    }

    if (maxDistanceSquared > toleranceSquared) {
      keep[maxIndex] = 1;
      stack.push([firstIndex, maxIndex], [maxIndex, lastIndex]);
    }
  }

  return points.filter((_, index) => keep[index]).map(copyPosition);
}

function segmentDistanceSquared(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  const lengthSquared = dx * dx + dy * dy;
  if (lengthSquared === 0) return distanceSquared(point, start);

  const ratio = Math.max(0, Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / lengthSquared));
  const projected = [start[0] + ratio * dx, start[1] + ratio * dy];
  return distanceSquared(point, projected);
}

function distanceSquared(first, second) {
  return (first[0] - second[0]) ** 2 + (first[1] - second[1]) ** 2;
}

function positionsEqual(first, second) {
  return first[0] === second[0] && first[1] === second[1];
}

function copyPosition(position) {
  return [position[0], position[1]];
}

function conformSingleRegionFallbackGeometry(countryId, geometry, regions) {
  if (countryId !== "CAN") {
    return geometry;
  }

  const usaGeometries = regions
    .filter((region) => region.ownerId === "USA")
    .map((region) => region.geometry)
    .filter(isPolygonalGeometry);
  return subtractPolygonalGeometries(geometry, usaGeometries) ?? geometry;
}

function subtractPolygonalGeometries(geometry, cutters) {
  if (!isPolygonalGeometry(geometry) || cutters.length === 0) {
    return geometry;
  }

  try {
    const cutterUnion = unionJstsGeometries(cutters.map(readGeometry));
    const difference = OverlayOp.difference(readGeometry(geometry), cutterUnion);
    if (difference.isEmpty()) return null;

    const differenceGeometry = writer.write(difference);
    if (!isPolygonalGeometry(differenceGeometry)) return null;
    return roundGeometry(rewindForD3(pruneSmallPolygonParts(differenceGeometry)));
  } catch {
    return null;
  }
}

async function loadSingleRegionAdm0Geometries() {
  const geometries = new Map();
  const countriesById = new Map(singleRegionCountries.map((country) => [country.iso3, country]));

  for (const countryId of singleRegionAdm0CountryIds) {
    const country = countriesById.get(countryId);
    if (!country) continue;

    try {
      const meta = await fetchCachedJson(
        `https://www.geoboundaries.org/api/current/gbOpen/${country.iso3}/ADM0/`,
      );
      const geojson = await fetchCachedJson(meta.simplifiedGeometryGeoJSON || meta.gjDownloadURL);
      const adm0Geometries = getFeatureCollectionGeometries(geojson)
        .map((geometry) =>
          simplifyGeometry(
            geometry,
            singleRegionAdm0SimplifyToleranceByCountryId.get(country.iso3) ?? fallbackSimplifyTolerance,
          ),
        )
        .filter(isPolygonalGeometry);
      const adm0Geometry = mergePolygonalGeometries(adm0Geometries);
      if (adm0Geometry) {
        geometries.set(country.iso3, adm0Geometry);
        console.log(`Loaded ${country.iso3}: single fallback from geoBoundaries ADM0`);
      }
    } catch (error) {
      console.warn(
        `Could not load ${country.iso3} single-region ADM0 geometry: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  return geometries;
}

function getFeatureCollectionGeometries(geojson) {
  if (geojson?.type === "FeatureCollection") {
    return geojson.features.map((entry) => entry.geometry).filter(Boolean);
  }
  if (geojson?.type === "Feature") {
    return geojson.geometry ? [geojson.geometry] : [];
  }
  return geojson ? [geojson] : [];
}

function filterOutputBaseCountries(baseCountries, countries) {
  const countryById = new Map(countries.map((country) => [country.id, country]));
  return baseCountries.filter((baseCountry) => {
    const country = countryById.get(baseCountry.entityId);
    return Boolean(country?.hasAdm1 || (country?.regionIds.length ?? 0) > 1);
  });
}

async function loadColorScheme() {
  return JSON.parse(await fs.readFile(path.join(root, "src/color-scheme.json"), "utf8"));
}

function getCountryColor(colorScheme, input) {
  return getCuratedCountryColor(colorScheme, input) ?? getFallbackCountryColor(colorScheme, input.id || input.name);
}

function getCuratedCountryColor(colorScheme, input) {
  const idColor = input.id ? colorScheme.curatedColorsById[input.id] : undefined;
  if (idColor) return idColor;

  for (const name of [input.name, ...(input.aliases ?? [])]) {
    const nameColor = colorScheme.curatedColorsByName[normalizeName(name)];
    if (nameColor) return nameColor;
  }

  return null;
}

function getFallbackCountryColor(colorScheme, value) {
  return colorScheme.fallbackPalette[hashString(value) % colorScheme.fallbackPalette.length];
}

function assignCountryColors({ countries, baseCountries, colorScheme }) {
  const countryById = new Map(countries.map((country) => [country.id, country]));
  const adjacency = buildCountryAdjacency(baseCountries, countryById);
  const assignedColors = new Map();
  const fallbackCountries = [];

  for (const country of countries) {
    const curatedColor = getCuratedCountryColor(colorScheme, {
      id: country.id,
      name: country.name,
    });

    if (curatedColor) {
      country.color = curatedColor;
      assignedColors.set(country.id, curatedColor);
    } else {
      fallbackCountries.push(country);
    }
  }

  fallbackCountries.sort((a, b) => {
    const degreeDiff = (adjacency.get(b.id)?.size ?? 0) - (adjacency.get(a.id)?.size ?? 0);
    return degreeDiff || a.name.localeCompare(b.name);
  });

  for (const country of fallbackCountries) {
    const neighborColors = new Set(
      [...(adjacency.get(country.id) ?? [])]
        .map((neighborId) => assignedColors.get(neighborId))
        .filter(Boolean),
    );
    const color = getFallbackCountryColorAvoiding(
      colorScheme,
      country.id || country.name,
      neighborColors,
    );
    country.color = color;
    assignedColors.set(country.id, color);
  }
}

function getFallbackCountryColorAvoiding(colorScheme, value, blockedColors) {
  const palette = colorScheme.fallbackPalette;
  const startIndex = hashString(value) % palette.length;

  for (let offset = 0; offset < palette.length; offset += 1) {
    const color = palette[(startIndex + offset) % palette.length];
    if (!blockedColors.has(color)) {
      return color;
    }
  }

  return palette[startIndex];
}

function buildCountryAdjacency(baseCountries, countryById) {
  const adjacency = new Map();
  const indexedCountries = baseCountries
    .filter((country) => countryById.has(country.entityId) && isPolygonalGeometry(country.geometry))
    .map((country) => ({
      id: country.entityId,
      geometry: country.geometry,
      bounds: geometryBoundingBox(country.geometry),
    }));

  for (const country of indexedCountries) {
    if (!adjacency.has(country.id)) {
      adjacency.set(country.id, new Set());
    }
  }

  for (let firstIndex = 0; firstIndex < indexedCountries.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < indexedCountries.length; secondIndex += 1) {
      const first = indexedCountries[firstIndex];
      const second = indexedCountries[secondIndex];
      if (first.id === second.id) continue;
      if (!bboxIntersectsWithTolerance(first.bounds, second.bounds, 0.001)) continue;
      if (exactSharedBorderLength(first.geometry, second.geometry) <= 1e-6) continue;

      adjacency.get(first.id)?.add(second.id);
      adjacency.get(second.id)?.add(first.id);
    }
  }

  return adjacency;
}

function exactSharedBorderLength(first, second) {
  try {
    const firstBoundary = readGeometry(first).getBoundary();
    const secondBoundary = readGeometry(second).getBoundary();
    const intersection = OverlayOp.intersection(firstBoundary, secondBoundary);
    if (intersection.isEmpty()) return 0;
    return linealLength(writer.write(intersection));
  } catch {
    return 0;
  }
}

function linealLength(geometry) {
  if (geometry.type === "LineString") {
    return lineLength(geometry.coordinates);
  }
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.reduce((total, line) => total + lineLength(line), 0);
  }
  if (geometry.type === "GeometryCollection") {
    return geometry.geometries.reduce((total, child) => total + linealLength(child), 0);
  }
  return 0;
}

function lineLength(coordinates) {
  let total = 0;
  for (let index = 1; index < coordinates.length; index += 1) {
    total += Math.hypot(
      coordinates[index][0] - coordinates[index - 1][0],
      coordinates[index][1] - coordinates[index - 1][1],
    );
  }
  return total;
}

function simplifyAdm1Geometry(geometry, countryIso3, worldLandFeatures) {
  const simplifiedGeometry = simplifyGeometry(geometry, adm1SimplifyTolerance);

  if (skipLandMaskClipCountryIds.has(countryIso3)) {
    return simplifiedGeometry;
  }

  return clipGeometryToLandMask(simplifiedGeometry, worldLandFeatures);
}

function hashString(value) {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function fetchCachedJson(url) {
  await fs.mkdir(cacheDir, { recursive: true });
  const cachePath = path.join(cacheDir, `${hashUrl(url)}.json`);
  try {
    return JSON.parse(await fs.readFile(cachePath, "utf8"));
  } catch {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), fetchTimeoutMs);
    try {
      const response = await fetch(url, { signal: controller.signal });
      if (!response.ok) {
        throw new Error(`${response.status} ${response.statusText} for ${url}`);
      }
      const json = await response.json();
      await fs.writeFile(cachePath, JSON.stringify(json), "utf8");
      return json;
    } finally {
      clearTimeout(timeout);
    }
  }
}

function hashUrl(url) {
  return crypto.createHash("sha256").update(url).digest("hex").slice(0, 24);
}

function clipGeometryToLandMask(geometry, worldLandFeatures) {
  if (!geometry || !isPolygonalGeometry(geometry)) {
    return geometry;
  }

  try {
    const originalArea = polygonalArea(geometry);
    const geometryBounds = geometryBoundingBox(geometry);
    const regionGeometry = readGeometry(geometry);
    const intersections = [];

    for (const landFeature of worldLandFeatures) {
      if (!bboxIntersects(geometryBounds, landFeature.bbox)) continue;

      const intersection = OverlayOp.intersection(regionGeometry, readGeometry(landFeature.geometry));
      if (intersection.isEmpty()) continue;

      const intersectionGeometry = writer.write(intersection);
      if (isPolygonalGeometry(intersectionGeometry)) {
        intersections.push(intersection);
      }
    }

    if (intersections.length === 0) {
      return geometry;
    }

    const clippedGeometry = writer.write(unionJstsGeometries(intersections));
    if (!isPolygonalGeometry(clippedGeometry)) {
      return geometry;
    }

    const clippedArea = polygonalArea(clippedGeometry);
    if (originalArea > 0 && clippedArea / originalArea < minimumClippedAreaRetentionRatio) {
      return geometry;
    }

    return roundGeometry(rewindForD3(pruneSmallPolygonParts(clippedGeometry)));
  } catch {
    return geometry;
  }
}

function attachNonSovereignFallbacks({ countries, baseCountries, nonSovereignFallbacks, errors }) {
  for (const [ownerId, fallback] of nonSovereignFallbacks) {
    const country = countries.find((entry) => entry.id === ownerId);
    if (!country) {
      errors.push(`Non-sovereign fallback owner ${ownerId} was not found`);
      continue;
    }

    country.regionIds.push(...fallback.regionIds);

    const baseCountry = baseCountries.find((entry) => entry.entityId === ownerId);
    if (!baseCountry) {
      errors.push(`Non-sovereign fallback base country ${ownerId} was not found`);
      continue;
    }

    baseCountry.geometry = mergePolygonalGeometries([baseCountry.geometry, ...fallback.geometries]) ?? baseCountry.geometry;
  }
}

function mergePolygonalGeometries(geometries) {
  const readable = geometries.filter(isPolygonalGeometry);
  if (readable.length === 0) return null;
  if (readable.length === 1) return readable[0];

  try {
    const unioned = unionJstsGeometries(readable.map(readGeometry));
    const geometry = writer.write(unioned);
    if (!isPolygonalGeometry(geometry)) return null;
    return roundGeometry(rewindForD3(pruneSmallPolygonParts(geometry)));
  } catch {
    return null;
  }
}

function unionJstsGeometries(geometries) {
  if (geometries.length === 1) return geometries[0];

  const list = new ArrayList([]);
  for (const geometry of geometries) {
    list.add(geometry);
  }
  return UnaryUnionOp.union(list);
}

function readGeometry(geometry) {
  const jstsGeometry = reader.read(geometry);
  return BufferOp.bufferOp(jstsGeometry, 0);
}

function readBoundaryGeometry(geometry) {
  return reader.read(geometry).getBoundary();
}

function isPolygonalGeometry(geometry) {
  return geometry?.type === "Polygon" || geometry?.type === "MultiPolygon";
}

function geometryBoundingBox(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const polygon of getGeometryPolygons(geometry)) {
    const polygonBounds = polygonBoundingBox(polygon);
    bounds[0] = Math.min(bounds[0], polygonBounds[0]);
    bounds[1] = Math.min(bounds[1], polygonBounds[1]);
    bounds[2] = Math.max(bounds[2], polygonBounds[2]);
    bounds[3] = Math.max(bounds[3], polygonBounds[3]);
  }
  return bounds;
}

function bboxIntersects(a, b) {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

function bboxIntersectsWithTolerance(a, b, tolerance) {
  return (
    a[0] - tolerance <= b[2] &&
    a[2] + tolerance >= b[0] &&
    a[1] - tolerance <= b[3] &&
    a[3] + tolerance >= b[1]
  );
}

function makeUniqueId(base, usedIds) {
  let id = base;
  let suffix = 2;

  while (usedIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  usedIds.add(id);
  return id;
}

function cleanId(value) {
  if (value == null) {
    return "";
  }
  return String(value)
    .trim()
    .replace(/[^A-Za-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function makeAdm1RegionId(countryIso3, properties, featureIndex, usedRegionIds) {
  const shapeIso = cleanId(properties.shapeISO);
  const shapeId = cleanId(properties.shapeID);
  const fallback = `${countryIso3}-${String(featureIndex + 1).padStart(3, "0")}`;
  const preferred = shapeIso && shapeIso !== countryIso3 ? shapeIso : shapeId || fallback;
  const base = preferred.startsWith(`${countryIso3}-`) ? preferred : `${countryIso3}-${preferred}`;
  let id = base;
  let suffix = 2;

  while (usedRegionIds.has(id)) {
    id = `${base}-${suffix}`;
    suffix += 1;
  }

  usedRegionIds.add(id);
  return id;
}

function cleanDisplayName(value) {
  const name = String(value);
  if (!/(?:Ã|Â|â[\u0080-\u00bf])/.test(name)) {
    return name;
  }

  const decoded = Buffer.from(name, "latin1").toString("utf8");
  return decoded.includes("�") ? name : decoded;
}

function normalizeName(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

export function shouldSkipWorldFallback(normalizedWorldName, countryNameToId) {
  return selectedNames.has(normalizedWorldName) && countryNameToId.has(normalizedWorldName);
}

function simplifyGeometry(geometry, tolerance) {
  if (!geometry) {
    return geometry;
  }

  try {
    const simplified = simplify(
      {
        type: "Feature",
        properties: {},
        geometry,
      },
      { tolerance, highQuality: false, mutate: false },
    );
    return roundGeometry(rewindForD3(pruneSmallPolygonParts(simplified.geometry)));
  } catch {
    return roundGeometry(rewindForD3(pruneSmallPolygonParts(geometry)));
  }
}

function addFrenchOverseasRegions({ countries, regions, baseCountries, usedRegionIds }) {
  const france = countries.find((country) => country.id === "FRA");
  const baseFrance = baseCountries.find((country) => country.entityId === "FRA");
  if (!france || !baseFrance) return;

  const polygons = getGeometryPolygons(baseFrance.geometry).map((polygon) => ({
    polygon,
    bbox: polygonBoundingBox(polygon),
  }));
  const overseasRegions = [
    {
      id: "FRA-FR-GF",
      name: "Guyane",
      bbox: [-55, 1.5, -51, 6.2],
    },
    {
      id: "FRA-FR-GP",
      name: "Guadeloupe",
      bbox: [-62.1, 15.7, -60.9, 16.7],
    },
    {
      id: "FRA-FR-MQ",
      name: "Martinique",
      bbox: [-61.4, 14.3, -60.7, 15],
    },
    {
      id: "FRA-FR-RE",
      name: "La Réunion",
      bbox: [55, -21.5, 56, -20.7],
    },
    {
      id: "FRA-FR-YT",
      name: "Mayotte",
      bbox: [44.8, -13.1, 45.4, -12.5],
    },
  ];

  for (const overseasRegion of overseasRegions) {
    if (france.regionIds.includes(overseasRegion.id)) continue;
    const matchedPolygons = polygons
      .filter((entry) => bboxWithin(entry.bbox, overseasRegion.bbox))
      .map((entry) => entry.polygon);

    if (matchedPolygons.length === 0) continue;

    const regionId = makeUniqueId(overseasRegion.id, usedRegionIds);
    regions.push({
      id: regionId,
      name: overseasRegion.name,
      ownerId: "FRA",
      type: "ADM1 overseas region",
      geometry: polygonsToGeometry(matchedPolygons),
    });
    france.regionIds.push(regionId);
    console.log(`Added FRA overseas region: ${overseasRegion.name}`);
  }
}

function getGeometryPolygons(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return [geometry.coordinates];
  if (geometry.type === "MultiPolygon") return geometry.coordinates;
  return [];
}

function polygonsToGeometry(polygons) {
  if (polygons.length === 1) {
    return {
      type: "Polygon",
      coordinates: polygons[0],
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: polygons,
  };
}

function polygonBoundingBox(polygon) {
  const bbox = [Infinity, Infinity, -Infinity, -Infinity];
  for (const ring of polygon) {
    for (const [x, y] of ring) {
      bbox[0] = Math.min(bbox[0], x);
      bbox[1] = Math.min(bbox[1], y);
      bbox[2] = Math.max(bbox[2], x);
      bbox[3] = Math.max(bbox[3], y);
    }
  }
  return bbox;
}

function bboxWithin(inner, outer) {
  return inner[0] >= outer[0] && inner[1] >= outer[1] && inner[2] <= outer[2] && inner[3] <= outer[3];
}

function pruneSmallPolygonParts(geometry) {
  if (!geometry || geometry.type !== "MultiPolygon") {
    return geometry;
  }

  const ranked = geometry.coordinates.map((polygon, index) => ({
    polygon,
    index,
    area: polygonArea(polygon),
  }));
  const kept = ranked.filter((entry) => entry.area >= minimumPolygonArea);

  if (kept.length === 0) {
    kept.push(ranked.sort((a, b) => b.area - a.area)[0]);
  }

  const coordinates = kept.sort((a, b) => a.index - b.index).map((entry) => entry.polygon);
  if (coordinates.length === 1) {
    return {
      type: "Polygon",
      coordinates: coordinates[0],
    };
  }

  return {
    type: "MultiPolygon",
    coordinates,
  };
}

function polygonalArea(geometry) {
  return getGeometryPolygons(geometry).reduce((total, polygon) => total + polygonArea(polygon), 0);
}

function polygonArea(polygon) {
  return Math.max(
    0,
    ringArea(polygon[0]) - polygon.slice(1).reduce((total, ring) => total + ringArea(ring), 0),
  );
}

function ringArea(ring) {
  let area = 0;
  for (let index = 0; index < ring.length; index += 1) {
    const current = ring[index];
    const next = ring[(index + 1) % ring.length];
    area += current[0] * next[1] - next[0] * current[1];
  }
  return Math.abs(area / 2);
}

function rewindForD3(geometry) {
  const rewound = rewind(
    {
      type: "Feature",
      properties: {},
      geometry,
    },
    { reverse: true, mutate: false },
  );
  return rewound.geometry;
}

function roundGeometry(geometry) {
  if (geometry.type === "Polygon") {
    const rounded = roundPolygonalGeometry(geometry, coordinatePrecision);
    return (
      pruneDegeneratePolygonRings(rounded) ??
      pruneDegeneratePolygonRings(roundPolygonalGeometry(geometry, fallbackPolygonCoordinatePrecision)) ??
      rounded
    );
  }

  if (geometry.type === "MultiPolygon") {
    const rounded = roundPolygonalGeometry(geometry, coordinatePrecision);
    return (
      pruneDegeneratePolygonRings(rounded) ??
      pruneDegeneratePolygonRings(roundPolygonalGeometry(geometry, fallbackPolygonCoordinatePrecision)) ??
      rounded
    );
  }

  if (geometry.type === "LineString") {
    return {
      type: "LineString",
      coordinates: geometry.coordinates.map(roundPoint),
    };
  }

  if (geometry.type === "MultiLineString") {
    return {
      type: "MultiLineString",
      coordinates: geometry.coordinates.map((line) => line.map(roundPoint)),
    };
  }

  return geometry;
}

function roundPolygonalGeometry(geometry, precision) {
  if (geometry.type === "Polygon") {
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) =>
        ring.map((point) => roundPoint(point, precision)),
      ),
    };
  }

  return {
    type: "MultiPolygon",
    coordinates: geometry.coordinates.map((polygon) =>
      polygon.map((ring) => ring.map((point) => roundPoint(point, precision))),
    ),
  };
}

function pruneDegeneratePolygonRings(geometry) {
  const polygons = geometry.type === "Polygon" ? [geometry.coordinates] : geometry.coordinates;
  const keptPolygons = polygons
    .map((polygon) => {
      const [shell, ...holes] = polygon;
      if (!ringHasArea(shell)) return null;
      return [shell, ...holes.filter(ringHasArea)];
    })
    .filter(Boolean);

  if (keptPolygons.length === 0) return null;
  if (keptPolygons.length === 1) {
    return {
      type: "Polygon",
      coordinates: keptPolygons[0],
    };
  }
  return {
    type: "MultiPolygon",
    coordinates: keptPolygons,
  };
}

function ringHasArea(ring) {
  return Array.isArray(ring) && ring.length >= 4 && ringArea(ring) > 1e-12;
}

function roundPoint(point, precision = coordinatePrecision) {
  return [
    Number(point[0].toFixed(precision)),
    Number(point[1].toFixed(precision)),
  ];
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
