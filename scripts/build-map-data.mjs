import fs from "node:fs/promises";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
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
const singleRegionAdm0SimplifyToleranceByCountryId = new Map([["CAN", 0.01]]);
const subdivisionBorderSimplifyTolerance = 0.03;
const subdivisionBorderMatchTolerance = 0.02;
const stableBorderRegionMatchTolerance = 0.08;
const minimumSubdivisionBorderLength = 1e-6;
const minimumPolygonArea = 0.005;
const minimumClippedAreaRetentionRatio = 0.2;
const coordinatePrecision = 2;
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

const singleRegionAdm0CountryIds = new Set(["CAN"]);

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
  const coarseTopoPath = path.join(root, "node_modules/world-atlas/countries-50m.json");
  const detailedTopoPath = path.join(root, "node_modules/world-atlas/countries-10m.json");
  const [coarseTopo, detailedTopo] = await Promise.all(
    [coarseTopoPath, detailedTopoPath].map(async (topoPath) =>
      JSON.parse(await fs.readFile(topoPath, "utf8")),
    ),
  );
  const coarseCountryCollection = feature(coarseTopo, coarseTopo.objects.countries);
  const detailedCountryCollection = feature(detailedTopo, detailedTopo.objects.countries);
  const coarseCountryNames = new Set(
    coarseCountryCollection.features.map((worldFeature) =>
      normalizeName(String(worldFeature.properties?.name ?? "")),
    ),
  );
  const missingDetailedCountries = detailedCountryCollection.features.filter(
    (worldFeature) =>
      !coarseCountryNames.has(normalizeName(String(worldFeature.properties?.name ?? ""))),
  );
  const worldCountries = [
    ...coarseCountryCollection.features,
    ...missingDetailedCountries,
  ].map((worldFeature) => ({
    ...worldFeature,
    geometry: prepareStableWorldGeometry(worldFeature.geometry),
  }));
  const worldLandFeatures = worldCountries.flatMap((worldFeature) =>
    getGeometryPolygons(worldFeature.geometry).map((polygon) => ({
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
    const worldGeometry = worldFeature.geometry;

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

    if (selectedNames.has(normalizeName(worldName))) {
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
  const boundaryEdges = buildBoundaryEdges(countries, regions, baseCountries);

  countries.sort((a, b) => a.name.localeCompare(b.name));
  regions.sort((a, b) => a.id.localeCompare(b.id));
  boundaryEdges.sort((a, b) => a.id.localeCompare(b.id));
  const outputBaseCountries = filterOutputBaseCountries(baseCountries, countries);
  const outputCountries = stripInternalCountryFields(countries);
  const outputRegions = stripInternalRegionFields(regions);
  outputBaseCountries.sort((a, b) => a.name.localeCompare(b.name));
  const outputBaseCountryRecords = stripInternalBaseCountryFields(outputBaseCountries);

  const output = {
    version: 2,
    attribution:
      "Administrative regions from geoBoundaries Open (CC BY 4.0). Fallback country geometry from geoBoundaries ADM0 where configured, otherwise world-atlas / Natural Earth public domain data.",
    baseCountries: outputBaseCountryRecords,
    countries: outputCountries,
    regions: outputRegions,
    boundaryEdges,
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

function buildBoundaryEdges(countries, regions, baseCountries) {
  const internalEdges = buildInternalBoundaryEdges(countries, regions);
  const { coastlineEdges, internationalEdges } = buildStableBoundaryEdges(countries, regions, baseCountries);
  return dedupeBoundaryEdgeSegments([...internationalEdges, ...coastlineEdges, ...internalEdges]);
}

function dedupeBoundaryEdgeSegments(edges) {
  const seenSegments = new Set();
  const dedupedEdges = [];

  for (const edge of edges) {
    const keptLines = [];
    for (const line of collectLineStrings(edge.geometry)) {
      let currentLine = [];
      for (let index = 1; index < line.length; index += 1) {
        const start = line[index - 1];
        const end = line[index];
        const key = boundarySegmentKey(start, end);
        if (seenSegments.has(key)) {
          if (currentLine.length >= 2) keptLines.push(currentLine);
          currentLine = [];
          continue;
        }

        seenSegments.add(key);
        if (currentLine.length === 0) currentLine.push(copyPosition(start));
        currentLine.push(copyPosition(end));
      }
      if (currentLine.length >= 2) keptLines.push(currentLine);
    }

    const validLines = keptLines.filter((line) => sharedLineLength(line) > minimumSubdivisionBorderLength);
    if (validLines.length === 0) continue;
    dedupedEdges.push({
      ...edge,
      geometry: validLines.length === 1
        ? { type: "LineString", coordinates: validLines[0] }
        : { type: "MultiLineString", coordinates: validLines },
    });
  }

  return dedupedEdges;
}

function boundarySegmentKey(first, second) {
  const firstKey = `${first[0]},${first[1]}`;
  const secondKey = `${second[0]},${second[1]}`;
  return firstKey < secondKey ? `${firstKey}|${secondKey}` : `${secondKey}|${firstKey}`;
}

function buildInternalBoundaryEdges(countries, regions) {
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

        const regionIds = [first.id, second.id].sort();
        borders.push({
          id: `internal:${regionIds[0]}:${regionIds[1]}`,
          regionIds,
          geometry: stitchLinealGeometry(geometry),
        });
      }
    }
  }

  return borders;
}

function buildStableBoundaryEdges(countries, regions, baseCountries) {
  const regionBoundaryMatchIndex = new Map(
    regions.filter((region) => isPolygonalGeometry(region.geometry)).map((region) => [
      region.id,
      {
        bounds: geometryBoundingBox(region.geometry),
        matchArea: null,
        region,
      },
    ]),
  );
  const regionsByOwnerId = new Map();
  for (const country of countries) {
    const regionIdSet = new Set(country.regionIds);
    regionsByOwnerId.set(
      country.id,
      regions.filter((region) => regionIdSet.has(region.id) && isPolygonalGeometry(region.geometry)),
    );
  }

  const stableCountries = mergeBaseCountriesByEntity(baseCountries)
    .filter((country) => regionsByOwnerId.has(country.entityId) && isPolygonalGeometry(country.geometry))
    .map((country) => {
      const boundaryGeometry = polygonalBoundaryGeometry(country.geometry);
      return {
        id: country.entityId,
        geometry: country.geometry,
        bounds: geometryBoundingBox(country.geometry),
        boundaryGeometry,
        boundary: reader.read(boundaryGeometry),
        sharedBoundaries: [],
      };
    });
  const internationalEdges = [];

  for (let firstIndex = 0; firstIndex < stableCountries.length; firstIndex += 1) {
    for (let secondIndex = firstIndex + 1; secondIndex < stableCountries.length; secondIndex += 1) {
      const first = stableCountries[firstIndex];
      const second = stableCountries[secondIndex];
      if (!bboxIntersectsWithTolerance(first.bounds, second.bounds, 0.001)) continue;

      const sharedGeometry = exactSharedBoundaryGeometry(first.boundary, second.boundary);
      if (!sharedGeometry) continue;
      first.sharedBoundaries.push(sharedGeometry);
      second.sharedBoundaries.push(sharedGeometry);

      const firstRegions = regionsByOwnerId.get(first.id) ?? [];
      const secondRegions = regionsByOwnerId.get(second.id) ?? [];
      internationalEdges.push(
        ...splitStableSharedBorderByRegions(
          sharedGeometry,
          firstRegions,
          secondRegions,
          regionBoundaryMatchIndex,
        ),
      );
    }
  }

  const coastlineEdges = stableCountries.flatMap((country) => {
    const coastline = subtractSharedBoundaries(
      country.boundary,
      country.boundaryGeometry,
      country.sharedBoundaries,
    );
    if (!coastline) return [];
    return splitStableCoastlineByRegions(
      coastline,
      regionsByOwnerId.get(country.id) ?? [],
      country.id,
      regionBoundaryMatchIndex,
    );
  });

  return { coastlineEdges, internationalEdges };
}

function mergeBaseCountriesByEntity(baseCountries) {
  const geometriesByEntity = new Map();
  for (const country of baseCountries) {
    const geometries = geometriesByEntity.get(country.entityId) ?? [];
    geometries.push(country.geometry);
    geometriesByEntity.set(country.entityId, geometries);
  }

  return [...geometriesByEntity].flatMap(([entityId, geometries]) => {
    const geometry = geometries.length === 1
      ? geometries[0]
      : mergePolygonalGeometries(geometries);
    return geometry ? [{ entityId, geometry }] : [];
  });
}

function exactSharedBoundaryGeometry(firstBoundary, secondBoundary) {
  try {
    const intersection = OverlayOp.intersection(firstBoundary, secondBoundary);
    if (intersection.isEmpty()) return null;
    const lineal = collectLinealGeometry(writer.write(intersection));
    if (!lineal || sharedLinealLength(lineal) <= minimumSubdivisionBorderLength) return null;
    return stitchLinealGeometry(roundGeometry(lineal));
  } catch {
    return null;
  }
}

function splitStableSharedBorderByRegions(
  sharedGeometry,
  firstRegions,
  secondRegions,
  regionBoundaryMatchIndex,
) {
  const sharedJsts = reader.read(sharedGeometry);
  const sharedBounds = linealGeometryBoundingBox(sharedGeometry);
  const matchingFirst = firstRegions.filter((region) =>
    bboxIntersectsWithTolerance(
      regionBoundaryMatchIndex.get(region.id)?.bounds ?? geometryBoundingBox(region.geometry),
      sharedBounds,
      stableBorderRegionMatchTolerance,
    ),
  );
  const matchingSecond = secondRegions.filter((region) =>
    bboxIntersectsWithTolerance(
      regionBoundaryMatchIndex.get(region.id)?.bounds ?? geometryBoundingBox(region.geometry),
      sharedBounds,
      stableBorderRegionMatchTolerance,
    ),
  );
  const edges = [];

  for (const first of matchingFirst) {
    let firstPart;
    try {
      firstPart = OverlayOp.intersection(
        sharedJsts,
        getRegionBoundaryMatchArea(first, regionBoundaryMatchIndex),
      );
    } catch {
      continue;
    }
    if (firstPart.isEmpty()) continue;

    for (const second of matchingSecond) {
      try {
        const intersection = OverlayOp.intersection(
          firstPart,
          getRegionBoundaryMatchArea(second, regionBoundaryMatchIndex),
        );
        if (intersection.isEmpty()) continue;
        const geometry = normalizeBoundaryLineGeometry(writer.write(intersection));
        if (!geometry) continue;
        const regionIds = [first.id, second.id].sort();
        edges.push({
          id: `country:${regionIds[0]}:${regionIds[1]}`,
          regionIds,
          geometry,
        });
      } catch {
        // Skip invalid regional matches. The stable country boundary remains available to other matches.
      }
    }
  }

  return mergeBoundaryEdgesByRegionPair(edges);
}

function subtractSharedBoundaries(boundary, boundaryGeometry, sharedGeometries) {
  if (sharedGeometries.length === 0) {
    return normalizeBoundaryLineGeometry(boundaryGeometry);
  }

  try {
    const shared = unionJstsGeometries(sharedGeometries.map((geometry) => reader.read(geometry)));
    const coastline = OverlayOp.difference(boundary, shared);
    return coastline.isEmpty() ? null : normalizeBoundaryLineGeometry(writer.write(coastline));
  } catch {
    return normalizeBoundaryLineGeometry(boundaryGeometry);
  }
}

function polygonalBoundaryGeometry(geometry) {
  try {
    const dissolvedBoundary = collectLinealGeometry(writer.write(readGeometry(geometry).getBoundary()));
    const seamSafeBoundary = removeAntimeridianWrappingLineSegments(dissolvedBoundary);
    if (seamSafeBoundary) {
      return roundGeometry(seamSafeBoundary);
    }
  } catch {
    // Fall back to the source rings if JSTS cannot normalize the polygon.
  }

  const lines = getGeometryPolygons(geometry).flatMap((polygon) => polygon);
  return removeAntimeridianWrappingLineSegments(lines.length === 1
    ? { type: "LineString", coordinates: lines[0] }
    : { type: "MultiLineString", coordinates: lines });
}

function removeAntimeridianWrappingLineSegments(geometry) {
  if (!geometry) return null;
  const parts = collectLineStrings(geometry).flatMap((line) =>
    splitLineBySegmentPredicate(
      line,
      (previous, position) => Math.abs(previous[0] - position[0]) <= 180,
    ),
  );
  if (parts.length === 0) return null;
  return parts.length === 1
    ? { type: "LineString", coordinates: parts[0] }
    : { type: "MultiLineString", coordinates: parts };
}

function splitStableCoastlineByRegions(coastline, regions, ownerId, regionBoundaryMatchIndex) {
  const coastlineJsts = reader.read(coastline);
  const coastlineBounds = linealGeometryBoundingBox(coastline);
  const coastlineSegments = collectLineSegments(coastline);
  const edges = [];

  for (const region of regions) {
    if (
      !bboxIntersectsWithTolerance(
        regionBoundaryMatchIndex.get(region.id)?.bounds ?? geometryBoundingBox(region.geometry),
        coastlineBounds,
        stableBorderRegionMatchTolerance,
      )
    ) {
      continue;
    }

    try {
      const intersection = OverlayOp.intersection(
        coastlineJsts,
        getRegionBoundaryMatchArea(region, regionBoundaryMatchIndex),
      );
      if (intersection.isEmpty()) continue;
      const geometry = removeSuspiciousPolarCoastlineSegments(
        filterLineSegmentsToSource(
          normalizeBoundaryLineGeometry(writer.write(intersection)),
          coastlineSegments,
        ),
      );
      if (!geometry) continue;
      edges.push({
        id: `coast:${region.id}`,
        regionIds: [region.id, null],
        geometry,
      });
    } catch {
      // Keep processing the remaining coastline parts.
    }
  }

  if (edges.length > 0) return edges;
  const fallbackRegionId = regions[0]?.id;
  return fallbackRegionId
    ? [{ id: `coast:${ownerId}`, regionIds: [fallbackRegionId, null], geometry: coastline }]
    : [];
}

function collectLineSegments(geometry) {
  return collectLineStrings(geometry).flatMap((line) =>
    line.slice(1).flatMap((position, index) => {
      const previous = line[index];
      return Math.abs(previous[0] - position[0]) > 180
        ? []
        : [[previous, position]];
    }),
  );
}

function filterLineSegmentsToSource(geometry, sourceSegments, tolerance = 0.035) {
  if (!geometry) return null;
  const parts = collectLineStrings(geometry).flatMap((line) =>
    splitLineBySegmentPredicate(line, (previous, position) => {
      const midpoint = [
        (previous[0] + position[0]) / 2,
        (previous[1] + position[1]) / 2,
      ];
      return sourceSegments.some(
        ([sourceStart, sourceEnd]) =>
          pointToSegmentDistance(midpoint, sourceStart, sourceEnd) <= tolerance,
      );
    }),
  );

  if (parts.length === 0) return null;
  return parts.length === 1
    ? { type: "LineString", coordinates: parts[0] }
    : { type: "MultiLineString", coordinates: parts };
}

function splitLineBySegmentPredicate(line, keepSegment) {
  if (line.length < 2) return [];
  const parts = [];
  let current = [line[0]];

  for (let index = 1; index < line.length; index += 1) {
    const previous = line[index - 1];
    const position = line[index];
    if (keepSegment(previous, position)) {
      current.push(position);
    } else {
      if (current.length >= 2) parts.push(current);
      current = [position];
    }
  }

  if (current.length >= 2) parts.push(current);
  return parts;
}

function pointToSegmentDistance(point, start, end) {
  const dx = end[0] - start[0];
  const dy = end[1] - start[1];
  if (dx === 0 && dy === 0) {
    return Math.hypot(point[0] - start[0], point[1] - start[1]);
  }
  const t = Math.max(
    0,
    Math.min(1, ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / (dx * dx + dy * dy)),
  );
  return Math.hypot(point[0] - (start[0] + t * dx), point[1] - (start[1] + t * dy));
}

function removeSuspiciousPolarCoastlineSegments(geometry) {
  if (!geometry) return null;
  const parts = collectLineStrings(geometry).flatMap((line) =>
    splitLineBySegmentPredicate(line, (previous, position) => {
      const longitudeDelta = Math.abs(previous[0] - position[0]);
      const latitudeDelta = Math.abs(previous[1] - position[1]);
      const isPolarClosure =
        Math.min(previous[1], position[1]) > 60 &&
        ((longitudeDelta > 5 && latitudeDelta < 0.1) ||
          (longitudeDelta > 1.5 && latitudeDelta < 0.011));
      return !isPolarClosure;
    }),
  );

  if (parts.length === 0) return null;
  return parts.length === 1
    ? { type: "LineString", coordinates: parts[0] }
    : { type: "MultiLineString", coordinates: parts };
}

function getRegionBoundaryMatchArea(region, regionBoundaryMatchIndex) {
  const indexed = regionBoundaryMatchIndex.get(region.id);
  if (!indexed) {
    return BufferOp.bufferOp(readGeometry(region.geometry), stableBorderRegionMatchTolerance);
  }
  indexed.matchArea ??= BufferOp.bufferOp(readGeometry(indexed.region.geometry), stableBorderRegionMatchTolerance);
  return indexed.matchArea;
}

function mergeBoundaryEdgesByRegionPair(edges) {
  const grouped = new Map();
  for (const edge of edges) {
    const existing = grouped.get(edge.id);
    if (existing) {
      existing.push(edge.geometry);
    } else {
      grouped.set(edge.id, [edge.geometry]);
    }
  }

  return [...grouped].flatMap(([id, geometries]) => {
    const lines = geometries.flatMap(collectLineStrings);
    const geometry = normalizeBoundaryLineGeometry({
      type: lines.length === 1 ? "LineString" : "MultiLineString",
      coordinates: lines.length === 1 ? lines[0] : lines,
    });
    if (!geometry) return [];
    const [, firstRegionId, secondRegionId] = id.split(":");
    return [{ id, regionIds: [firstRegionId, secondRegionId], geometry }];
  });
}

function normalizeBoundaryLineGeometry(geometry) {
  const lineal = collectLinealGeometry(geometry);
  if (!lineal) return null;
  const pruned = pruneShortLinealParts(lineal, minimumSubdivisionBorderLength);
  if (!pruned) return null;
  const stitched = stitchLinealGeometry(roundGeometry(pruned));
  return pruneShortLinealParts(stitched, minimumSubdivisionBorderLength);
}

function stitchLinealGeometry(geometry) {
  const remaining = collectLineStrings(geometry).map((line) => line.map(copyPosition));
  const stitched = [];

  while (remaining.length > 0) {
    const line = remaining.pop();
    if (!line) continue;
    let joined = true;
    while (joined) {
      joined = false;
      for (let index = remaining.length - 1; index >= 0; index -= 1) {
        const candidate = remaining[index];
        if (positionsEqual(line[line.length - 1], candidate[0])) {
          line.push(...candidate.slice(1));
        } else if (positionsEqual(line[line.length - 1], candidate[candidate.length - 1])) {
          line.push(...candidate.slice(0, -1).reverse());
        } else if (positionsEqual(line[0], candidate[candidate.length - 1])) {
          line.unshift(...candidate.slice(0, -1));
        } else if (positionsEqual(line[0], candidate[0])) {
          line.unshift(...candidate.slice(1).reverse());
        } else {
          continue;
        }
        remaining.splice(index, 1);
        joined = true;
        break;
      }
    }
    stitched.push(line);
  }

  if (stitched.length === 1) return { type: "LineString", coordinates: stitched[0] };
  return { type: "MultiLineString", coordinates: stitched };
}

function linealGeometryBoundingBox(geometry) {
  const bounds = [Infinity, Infinity, -Infinity, -Infinity];
  for (const line of collectLineStrings(geometry)) {
    for (const position of line) {
      bounds[0] = Math.min(bounds[0], position[0]);
      bounds[1] = Math.min(bounds[1], position[1]);
      bounds[2] = Math.max(bounds[2], position[0]);
      bounds[3] = Math.max(bounds[3], position[1]);
    }
  }
  return bounds;
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
    const rounded = pruned ? roundGeometry(pruned) : null;
    return rounded ? pruneShortLinealParts(rounded, minimumSubdivisionBorderLength) : null;
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

function prepareStableWorldGeometry(geometry) {
  return roundGeometry(pruneSmallPolygonParts(geometry));
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
    return {
      type: "Polygon",
      coordinates: geometry.coordinates.map((ring) => ring.map(roundPoint)),
    };
  }

  if (geometry.type === "MultiPolygon") {
    return {
      type: "MultiPolygon",
      coordinates: geometry.coordinates.map((polygon) =>
        polygon.map((ring) => ring.map(roundPoint)),
      ),
    };
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

function roundPoint(point) {
  return [
    Number(point[0].toFixed(coordinatePrecision)),
    Number(point[1].toFixed(coordinatePrecision)),
  ];
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
