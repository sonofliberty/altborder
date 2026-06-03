import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Brush,
  Check,
  Copy,
  Eye,
  ArrowLeftRight,
  GitMerge,
  Globe2,
  MousePointer2,
  PaintBucket,
  RotateCcw,
  Share2,
  Split,
  Undo2,
  Redo2,
} from "lucide-react";
import { geoNaturalEarth1 } from "d3-geo";
import type { FeatureCollection, Geometry, Position } from "geojson";
import type { GeoProjection } from "d3-geo";
import type {
  EditMode,
  EditorSnapshot,
  HistoryState,
  MapData,
  RegionRecord,
} from "./types";
import {
  applyScenarioPayload,
  cloneSnapshot,
  createInitialSnapshot,
  createScenarioPayload,
  getEntityRegionIds,
  makeCustomEntityId,
  renameRegion,
  separateRegionAsCountry,
  transferRegions,
  updateEntityRegions,
} from "./state";
import {
  decodeSharePayload,
  describeUrlSize,
  encodeSharePayload,
  hashRequestsEdit,
  makeEditableUrl,
  makeShareUrl,
  readShareFromHash,
} from "./share";
import type { CountrySplit } from "./geometrySplit";
import type { FittedCountryLabel } from "./labelLayout";
import { countryLabelMinScreenFontSize } from "./labelConstants";
import {
  filterLabels,
  getCountryLabelMinScreenFontSize,
} from "./mapLabelDisplay";
import { zoomToBounds, type ProjectedBounds } from "./mapZoom";
import { boundsIntersect, projectedViewportBounds, shouldCullPaths } from "./mapCulling";
import { findRegionAtProjectedPoint } from "./geometryHitTest";
import { customCountryAccentColor, getFallbackCountryColor } from "./colorRuntime";
import {
  getNeighborTargetEntityIds,
  getSelectedTransferRegions,
  getValidTransferFocus,
  orderTransferTargetEntities,
} from "./transferContext";
import { isSubdivisionBorderVisible } from "./subdivisionBorders";
import {
  geometryToSvgPath,
  projectGeometryToPathData,
  type ProjectedPathData,
} from "./projectedPath";
import { getCountryLabelGeometries } from "./countryLabelGeometry";
import { simplifyPolygonalGeometry } from "./geometrySimplify";

const viewportWidth = 1000;
const viewportHeight = 560;
const minZoom = 0.8;
const maxZoom = 30;
const divideLinePointSpacing = 0.45;
const countryRenderGapTolerance = 0.02;
const acquiredRegionRenderGapTolerance = 0.08;
const mapRenderSimplifyTolerance = 0.07;
const countryUnderlayUpdateDelayMs = 0;
const projectedSeamBreakDistance = viewportWidth * 0.22;
const projectedPathCacheVersion = "shared-subdivision-linework-v29";
const baseGeometryUnionSensitiveEntityIds = new Set(["RUS", "USA"]);
const pathCullingMinZoom = 2.1;
const pathCullingOverscanRatio = 0.42;
const svgPathCoordinatePrecision = 2;
const simplifiedCountryLayerMaxZoom = 1.35;
const wheelZoomMaxDelta = 80;
const wheelZoomSensitivity = 0.001;

type ZoomState = {
  x: number;
  y: number;
  k: number;
};

type SvgPoint = {
  x: number;
  y: number;
};

type ShareState = {
  url: string;
  editableUrl: string;
  size: ReturnType<typeof describeUrlSize>;
};

type SimpleMapLabel = {
  id: string;
  name: string;
  x: number;
  y: number;
  priority: number;
};

type CountryUnderlay = {
  id: string;
  pathData: string;
  strokePathData: string;
  bounds: ProjectedBounds;
};

type ProjectedSubdivisionBorder = {
  id: string;
  ownerId: string;
  regionIds: [string, string];
  pathData: string;
  bounds: ProjectedBounds;
};

type GeometrySplitModule = typeof import("./geometrySplit");

export default function App() {
  const [data, setData] = useState<MapData | null>(null);
  const [history, setHistory] = useState<HistoryState | null>(null);
  const [mode, setMode] = useState<EditMode>("inspect");
  const [selectedEntityId, setSelectedEntityId] = useState<string>("");
  const [targetEntityId, setTargetEntityId] = useState<string>("");
  const [selectedRegions, setSelectedRegions] = useState<Set<string>>(new Set());
  const [mergeSelection, setMergeSelection] = useState<Set<string>>(new Set());
  const [mergeName, setMergeName] = useState("");
  const [newCountryName, setNewCountryName] = useState("");
  const [newCountryColor, setNewCountryColor] = useState(customCountryAccentColor);
  const [brushEnabled, setBrushEnabled] = useState(false);
  const [isBrushDown, setIsBrushDown] = useState(false);
  const [divideLine, setDivideLine] = useState<SvgPoint[]>([]);
  const [divideIslandPoint, setDivideIslandPoint] = useState<Position | null>(null);
  const [isDrawingDivideLine, setIsDrawingDivideLine] = useState(false);
  const [divideNewPieceIndex, setDivideNewPieceIndex] = useState<0 | 1 | null>(null);
  const [divideError, setDivideError] = useState("");
  const [readOnly, setReadOnly] = useState(false);
  const [share, setShare] = useState<ShareState | null>(null);
  const [loadError, setLoadError] = useState("");
  const [zoom, setZoom] = useState<ZoomState>({ x: 0, y: 0, k: 1 });
  const [settledZoom, setSettledZoom] = useState<ZoomState>({ x: 0, y: 0, k: 1 });
  const [isMapMoving, setIsMapMoving] = useState(false);
  const [countryUnderlays, setCountryUnderlays] = useState<CountryUnderlay[]>([]);
  const [countryLabelLayouts, setCountryLabelLayouts] = useState<FittedCountryLabel[]>([]);
  const [inspectFocusedRegionId, setInspectFocusedRegionId] = useState("");
  const [transferFocusedRegionId, setTransferFocusedRegionId] = useState("");
  const [neighborTargetEntityIds, setNeighborTargetEntityIds] = useState<Set<string>>(new Set());
  const [geometrySplitModule, setGeometrySplitModule] = useState<GeometrySplitModule | null>(null);
  const mapSvgRef = useRef<SVGSVGElement | null>(null);
  const mapContentRef = useRef<SVGGElement | null>(null);
  const zoomRef = useRef<ZoomState>({ x: 0, y: 0, k: 1 });
  const pendingZoomFrameRef = useRef<number | null>(null);
  const mapMovingTimerRef = useRef<number | null>(null);
  const isMapMovingRef = useRef(false);
  const panRef = useRef<{
    x: number;
    y: number;
    zoom: ZoomState;
    moved: boolean;
    regionId: string | null;
    entityId: string | null;
    selectOnRelease: boolean;
  } | null>(null);
  const divideDrawRef = useRef<{ pointerId: number; moved: boolean } | null>(null);
  const countryLabelLayoutCacheRef = useRef(new Map<string, FittedCountryLabel>());
  const countryUnderlayCacheRef = useRef(new Map<string, CountryUnderlay>());
  const countryUnderlaysInitializedRef = useRef(false);
  const baseProjectedRegionCacheRef = useRef(new Map<string, ProjectedPathData>());

  useEffect(() => {
    baseProjectedRegionCacheRef.current.clear();
    countryUnderlayCacheRef.current.clear();
  }, []);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  const applyZoomToDom = useCallback((nextZoom: ZoomState) => {
    mapContentRef.current?.setAttribute("transform", formatZoomTransform(nextZoom));
  }, []);

  useEffect(() => {
    applyZoomToDom(zoom);
  }, [applyZoomToDom, zoom]);

  useEffect(() => {
    return () => {
      if (pendingZoomFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingZoomFrameRef.current);
      }
      if (mapMovingTimerRef.current !== null) {
        window.clearTimeout(mapMovingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        const response = await fetch("/data/map-data.json");
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const mapData = (await response.json()) as MapData;
        const encoded = readShareFromHash(window.location.hash);
        let initial = createInitialSnapshot(mapData);
        let shouldReadOnly = false;

        if (encoded) {
          const decoded = await decodeSharePayload(encoded);
          if (cancelled) return;
          if (decoded.ok) {
            initial = applyScenarioPayload(mapData, decoded.payload);
            shouldReadOnly = !hashRequestsEdit(window.location.hash);
          } else {
            setLoadError(decoded.error);
          }
        }

        if (!cancelled) {
          setData(mapData);
          setHistory({ present: initial, past: [], future: [] });
          setReadOnly(shouldReadOnly);
          const firstEntity = Object.values(initial.entities).find((entity) => entity.regionIds.length);
          if (firstEntity) {
            setSelectedEntityId(firstEntity.id);
          }
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : "Could not load map data.");
        }
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const snapshot = history?.present ?? null;
  const regionOwners = snapshot?.regionOwners;
  const entities = snapshot?.entities;
  const regionNameOverrides = useMemo(() => snapshot?.regionNameOverrides ?? {}, [snapshot?.regionNameOverrides]);

  const customRegionRecords = useMemo(() => {
    return Object.values(snapshot?.customRegions ?? {});
  }, [snapshot?.customRegions]);

  const effectiveRegions = useMemo(() => {
    if (!data) return [];
    return [...data.regions, ...customRegionRecords];
  }, [customRegionRecords, data]);

  const regionById = useMemo(() => {
    return new Map(effectiveRegions.map((region) => [region.id, region]));
  }, [effectiveRegions]);

  const originalRegionGeometryById = useMemo(() => {
    return new Map(effectiveRegions.map((region) => [region.id, region.geometry]));
  }, [effectiveRegions]);

  const getRegionDisplayName = useCallback((regionId: string): string => {
    return regionNameOverrides[regionId] || regionById.get(regionId)?.name || regionId;
  }, [regionById, regionNameOverrides]);

  const baseEntityById = useMemo(() => {
    if (!data) return new Map();
    return new Map(data.countries.map((country) => [country.id, country]));
  }, [data]);

  const baseCountryByEntityId = useMemo(() => {
    if (!data) return new Map();
    return new Map(data.baseCountries.map((country) => [country.entityId, country]));
  }, [data]);

  const baseOwnerByRegionId = useMemo(() => {
    const owners = new Map<string, string>();
    if (!data) return owners;
    for (const country of data.countries) {
      for (const regionId of country.regionIds) {
        owners.set(regionId, country.id);
      }
    }
    return owners;
  }, [data]);

  const renderRegionGeometryById = useMemo(() => {
    const geometries = new Map<string, Geometry>();
    if (!data) return geometries;

    for (const region of data.regions) {
      geometries.set(region.id, simplifyPolygonalGeometry(region.geometry, mapRenderSimplifyTolerance));
    }
    for (const region of customRegionRecords) {
      geometries.set(region.id, region.geometry);
    }
    return geometries;
  }, [customRegionRecords, data]);

  const renderBaseCountryByEntityId = useMemo(() => {
    if (!data) return new Map<string, { geometry: Geometry }>();
    return new Map(
      data.baseCountries.map((country) => [
        country.entityId,
        {
          geometry: simplifyPolygonalGeometry(country.geometry, mapRenderSimplifyTolerance),
        },
      ]),
    );
  }, [data]);

  const projection = useMemo(() => {
    const collection: FeatureCollection = {
      type: "FeatureCollection",
      features: (data?.regions ?? []).map((region) => ({
        type: "Feature",
        properties: { id: region.id },
        geometry: region.geometry,
      })),
    };
    return geoNaturalEarth1().fitExtent(
      [
        [16, 18],
        [viewportWidth - 16, viewportHeight - 22],
      ],
      collection,
    );
  }, [data]);

  useEffect(() => {
    baseProjectedRegionCacheRef.current.clear();
  }, [data, projection]);

  const customProjectedRegionById = useMemo(() => {
    const projectedRegions = new Map<string, ProjectedPathData>();
    for (const region of customRegionRecords) {
      const projected = projectGeometryToPathData(region.geometry, projection, getProjectedPathOptions());
      if (projected) {
        projectedRegions.set(region.id, projected);
      }
    }
    return projectedRegions;
  }, [customRegionRecords, projection]);

  const getBaseProjectedRegion = useCallback((regionId: string, preferManualFill = false) => {
    const cacheKey = `${projectedPathCacheVersion}|${preferManualFill ? "manual-fill" : "d3-fill"}|${regionId}`;
    const cached = baseProjectedRegionCacheRef.current.get(cacheKey);
    if (cached) return cached;

    const region = regionById.get(regionId);
    const geometry = renderRegionGeometryById.get(regionId) ?? region?.geometry;
    if (!geometry) return null;
    const projected = projectGeometryToPathData(geometry, projection, getProjectedPathOptions(preferManualFill));
    if (projected) {
      baseProjectedRegionCacheRef.current.set(cacheKey, projected);
    }
    return projected;
  }, [projection, regionById, renderRegionGeometryById]);

  const getRegionPath = useCallback((regionId: string) => {
    return customProjectedRegionById.get(regionId)?.pathData ?? getBaseProjectedRegion(regionId)?.pathData ?? "";
  }, [customProjectedRegionById, getBaseProjectedRegion]);

  const getRegionStrokePath = useCallback((regionId: string) => {
    const projected = customProjectedRegionById.get(regionId) ?? getBaseProjectedRegion(regionId);
    return projected?.strokePathData ?? projected?.pathData ?? "";
  }, [customProjectedRegionById, getBaseProjectedRegion]);

  const getRegionBounds = useCallback((regionId: string) => {
    return customProjectedRegionById.get(regionId)?.bounds ?? getBaseProjectedRegion(regionId)?.bounds ?? null;
  }, [customProjectedRegionById, getBaseProjectedRegion]);

  const projectedSubdivisionBorders = useMemo(() => {
    const projectedBorders: ProjectedSubdivisionBorder[] = [];
    for (const border of data?.subdivisionBorders ?? []) {
      const projected = projectGeometryToPathData(border.geometry, projection, getProjectedPathOptions());
      if (!projected) continue;
      projectedBorders.push({
        id: border.id,
        ownerId: border.ownerId,
        regionIds: border.regionIds,
        pathData: projected.strokePathData,
        bounds: projected.bounds,
      });
    }
    return projectedBorders;
  }, [data?.subdivisionBorders, projection]);

  const settledViewportBounds = useMemo(() => {
    return projectedViewportBounds({
      height: viewportHeight,
      overscanRatio: pathCullingOverscanRatio,
      width: viewportWidth,
      zoom: settledZoom,
    });
  }, [settledZoom]);

  const shouldCullMapPaths = shouldCullPaths({
    isMapMoving,
    minZoom: pathCullingMinZoom,
    zoomScale: settledZoom.k,
  });

  const visibleRegions = useMemo(() => {
    if (!shouldCullMapPaths) return effectiveRegions;
    return effectiveRegions.filter((region) => {
      const bounds = getRegionBounds(region.id);
      return Boolean(bounds && boundsIntersect(bounds, settledViewportBounds));
    });
  }, [effectiveRegions, getRegionBounds, settledViewportBounds, shouldCullMapPaths]);

  const findRegionAtMapPoint = useCallback((point: SvgPoint) => {
    return findRegionAtProjectedPoint(
      [point.x, point.y],
      visibleRegions.map((region) => ({
        id: region.id,
        geometry: region.geometry,
        bounds: getRegionBounds(region.id),
      })),
      (position) => projection([position[0], position[1]]),
    );
  }, [getRegionBounds, projection, visibleRegions]);

  const regionIdsByEntityId = useMemo(() => {
    const grouped = new Map<string, string[]>();
    if (!regionOwners) return grouped;
    for (const [regionId, ownerId] of Object.entries(regionOwners)) {
      if (!ownerId) continue;
      const regionIds = grouped.get(ownerId) ?? [];
      regionIds.push(regionId);
      grouped.set(ownerId, regionIds);
    }
    return grouped;
  }, [regionOwners]);

  const activeEntityIds = useMemo(() => {
    return [...regionIdsByEntityId.keys()].sort((a, b) => a.localeCompare(b));
  }, [regionIdsByEntityId]);
  const activeEntityIdSet = useMemo(() => new Set(activeEntityIds), [activeEntityIds]);

  const changedRegionIds = useMemo(() => {
    const changed = new Set<string>();
    if (!regionOwners) return changed;
    for (const [regionId, ownerId] of Object.entries(regionOwners)) {
      const baseOwnerId = baseOwnerByRegionId.get(regionId);
      if (baseOwnerId && baseOwnerId !== ownerId) {
        changed.add(regionId);
      }
    }
    return changed;
  }, [baseOwnerByRegionId, regionOwners]);

  const entityOptions = useMemo(() => {
    if (!entities) return [];
    return activeEntityIds
      .map((entityId) => entities[entityId])
      .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeEntityIds, entities]);

  const selectedEntity = snapshot && selectedEntityId ? snapshot.entities[selectedEntityId] : undefined;
  const targetEntity = snapshot && targetEntityId ? snapshot.entities[targetEntityId] : undefined;
  const activeModeUsesRegions = mode === "transfer";

  const renderGeometriesByEntityId = useMemo(() => {
    const geometriesByEntity = new Map<string, Geometry[]>();
    if (!data) return geometriesByEntity;

    for (const entityId of activeEntityIds) {
      const regionIds = regionIdsByEntityId.get(entityId) ?? [];
      const hasOwnershipChanges = hasTransferredOwnershipChanges(
        entityId,
        regionIds,
        baseEntityById,
        baseOwnerByRegionId,
      );
      const groupedRegionIds = new Map<string, string[]>();
      const consumedRegionIds = new Set<string>();
      const geometries: Geometry[] = [];

      for (const regionId of regionIds) {
        const region = regionById.get(regionId);
        if (!region) continue;
        const originalOwnerId = region.ownerId ?? baseOwnerByRegionId.get(regionId);
        if (!originalOwnerId) continue;
        const group = groupedRegionIds.get(originalOwnerId) ?? [];
        group.push(regionId);
        groupedRegionIds.set(originalOwnerId, group);
      }

      for (const [baseEntityId, groupedIds] of groupedRegionIds) {
        const baseEntity = baseEntityById.get(baseEntityId);
        const renderBaseCountry = renderBaseCountryByEntityId.get(baseEntityId);
        if (
          baseEntity &&
          renderBaseCountry &&
          sameStringSet(groupedIds, baseEntity.regionIds) &&
          !shouldKeepDetailedRegionsForUnion(entityId, baseEntityId)
        ) {
          geometries.push(
            hasOwnershipChanges
              ? baseCountryByEntityId.get(baseEntityId)?.geometry ?? renderBaseCountry.geometry
              : renderBaseCountry.geometry,
          );
          for (const regionId of groupedIds) {
            consumedRegionIds.add(regionId);
          }
        }
      }

      for (const regionId of regionIds) {
        if (consumedRegionIds.has(regionId)) continue;
        const geometry = hasOwnershipChanges
          ? regionById.get(regionId)?.geometry ?? renderRegionGeometryById.get(regionId)
          : renderRegionGeometryById.get(regionId) ?? regionById.get(regionId)?.geometry;
        if (geometry) {
          geometries.push(geometry);
        }
      }

      geometriesByEntity.set(entityId, geometries);
    }

    return geometriesByEntity;
  }, [
    activeEntityIds,
    baseEntityById,
    baseCountryByEntityId,
    baseOwnerByRegionId,
    data,
    regionById,
    renderBaseCountryByEntityId,
    renderRegionGeometryById,
    regionIdsByEntityId,
  ]);

  useEffect(() => {
    if (!data) {
      setCountryUnderlays([]);
      countryUnderlaysInitializedRef.current = false;
      return;
    }

    let cancelled = false;
    const updateDelay = countryUnderlaysInitializedRef.current ? countryUnderlayUpdateDelayMs : 0;
    const timeout = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;

        const activeCacheKeys = new Set<string>();
        const nextUnderlays: CountryUnderlay[] = [];
        let subtractGeoJsonGeometries: GeometrySplitModule["subtractGeoJsonGeometries"] | null = null;
        let unionGeoJsonGeometries: GeometrySplitModule["unionGeoJsonGeometries"] | null = null;
        let unionGeoJsonGeometriesClosingGaps: GeometrySplitModule["unionGeoJsonGeometriesClosingGaps"] | null =
          null;

        for (const entityId of activeEntityIds) {
          const regionIds = regionIdsByEntityId.get(entityId) ?? [];
          const cacheKey = `${projectedPathCacheVersion}|${entityId}|${regionIds.join(",")}`;
          activeCacheKeys.add(cacheKey);
          const cached = countryUnderlayCacheRef.current.get(cacheKey);
          if (cached) {
            nextUnderlays.push(cached);
            continue;
          }

          const geometry = await (async () => {
            if (
              shouldUseStableBaseRenderGeometry(entityId, regionIds, baseEntityById, baseCountryByEntityId)
            ) {
              subtractGeoJsonGeometries ??= (await import("./geometrySplit")).subtractGeoJsonGeometries;
              unionGeoJsonGeometries ??= (await import("./geometrySplit")).unionGeoJsonGeometries;
              return buildStableBaseRenderGeometry({
                baseCountryByEntityId,
                baseEntityById,
                baseOwnerByRegionId,
                entityId,
                regionGeometryById: originalRegionGeometryById,
                regionIds,
                subtractGeoJsonGeometries,
                unionGeoJsonGeometries,
              });
            }

            const geometries = renderGeometriesByEntityId.get(entityId) ?? [];
            if (geometries.length <= 1) return geometries[0];

            if (shouldSkipRenderGapClosing(entityId, regionIds, baseOwnerByRegionId)) {
              unionGeoJsonGeometries ??= (await import("./geometrySplit")).unionGeoJsonGeometries;
              return unionGeoJsonGeometries(geometries);
            }
            unionGeoJsonGeometriesClosingGaps ??= (await import("./geometrySplit")).unionGeoJsonGeometriesClosingGaps;
            return unionGeoJsonGeometriesClosingGaps(
              geometries,
              ownsTransferredRegions(entityId, regionIds, baseOwnerByRegionId)
                ? acquiredRegionRenderGapTolerance
                : countryRenderGapTolerance,
            );
          })();

          if (cancelled) return;
          if (!geometry) continue;

          const hasOwnershipChanges = hasTransferredOwnershipChanges(
            entityId,
            regionIds,
            baseEntityById,
            baseOwnerByRegionId,
          );
          const renderGeometry = hasOwnershipChanges
            ? simplifyPolygonalGeometry(geometry, mapRenderSimplifyTolerance)
            : geometry;
          const projected = projectGeometryToPathData(renderGeometry, projection, getProjectedPathOptions());
          if (!projected) continue;

          const underlay = {
            id: entityId,
            pathData: projected.pathData,
            strokePathData: projected.strokePathData,
            bounds: projected.bounds,
          };
          countryUnderlayCacheRef.current.set(cacheKey, underlay);
          nextUnderlays.push(underlay);
        }

        pruneMapCache(countryUnderlayCacheRef.current, activeCacheKeys, 420);
        if (!cancelled) {
          countryUnderlaysInitializedRef.current = true;
          setCountryUnderlays(nextUnderlays);
        }
      })();
    }, updateDelay);

    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [
    activeEntityIds,
    baseCountryByEntityId,
    baseEntityById,
    baseOwnerByRegionId,
    data,
    originalRegionGeometryById,
    projection,
    regionIdsByEntityId,
    renderGeometriesByEntityId,
  ]);

  useEffect(() => {
    if (mode !== "divide" || geometrySplitModule) return;

    let cancelled = false;
    void import("./geometrySplit").then((module) => {
      if (!cancelled) {
        setGeometrySplitModule(module);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [geometrySplitModule, mode]);

  useEffect(() => {
    if (!data || !entities) {
      setCountryLabelLayouts([]);
      return;
    }

    let cancelled = false;
    let timeoutId: number | null = null;
    const activeCacheKeys = new Set<string>();
    const labels: FittedCountryLabel[] = [];
    const entityMap = entities;
    const entityIds = [...activeEntityIds].sort((a, b) => {
      const regionCountDifference = (regionIdsByEntityId.get(b)?.length ?? 0) - (regionIdsByEntityId.get(a)?.length ?? 0);
      if (regionCountDifference !== 0) return regionCountDifference;
      return (entityMap[b]?.name ?? b).localeCompare(entityMap[a]?.name ?? a);
    });
    let index = 0;
    let publishedLabelCount = 0;
    let layoutCountryLabelFn: (typeof import("./labelLayout"))["layoutCountryLabel"] | null = null;
    let subtractGeoJsonGeometries: GeometrySplitModule["subtractGeoJsonGeometries"] | null = null;

    function sortedLabels() {
      return [...labels].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.id.localeCompare(b.id);
      });
    }

    function publishLabels(final = false) {
      if (!final && labels.length === publishedLabelCount) return;
      if (final) {
        pruneMapCache(countryLabelLayoutCacheRef.current, activeCacheKeys, 680);
      }
      publishedLabelCount = labels.length;
      if (!cancelled) {
        setCountryLabelLayouts(sortedLabels());
      }
    }

    function flushLabels() {
      pruneMapCache(countryLabelLayoutCacheRef.current, activeCacheKeys, 680);
      if (!cancelled) {
        setCountryLabelLayouts(sortedLabels());
      }
    }

    function work() {
      void (async () => {
        layoutCountryLabelFn ??= (await import("./labelLayout")).layoutCountryLabel;
        if (cancelled) return;

        const chunkDeadline = performance.now() + 7;

        while (!cancelled && index < entityIds.length && performance.now() < chunkDeadline) {
          const entityId = entityIds[index];
          index += 1;
          const entity = entityMap[entityId];
          if (!entity) continue;
          const regionIds = regionIdsByEntityId.get(entity.id) ?? [];
          const fallbackGeometries = renderGeometriesByEntityId.get(entity.id) ?? [];
          let geometries = fallbackGeometries;

          if (baseEntityById.has(entity.id) && baseCountryByEntityId.has(entity.id)) {
            subtractGeoJsonGeometries ??= (await import("./geometrySplit")).subtractGeoJsonGeometries;
            geometries = getCountryLabelGeometries({
              baseCountryByEntityId,
              baseEntityById,
              baseOwnerByRegionId,
              entityId: entity.id,
              fallbackGeometries,
              regionById,
              regionIds,
              subtractGeoJsonGeometries,
            });
          }

          if (geometries.length === 0) continue;

          const cacheKey = `${entity.id}|${entity.name}|${regionIds.join(",")}`;
          activeCacheKeys.add(cacheKey);
          const cached = countryLabelLayoutCacheRef.current.get(cacheKey);
          if (cached) {
            labels.push(cached);
            continue;
          }

          const label = layoutCountryLabelFn({
            id: entity.id,
            name: entity.name,
            geometries,
            project: (position) => projection([position[0], position[1]]),
            priority: geometries.length,
          });
          if (label) {
            countryLabelLayoutCacheRef.current.set(cacheKey, label);
            labels.push(label);
          }
        }

        if (cancelled) return;
        if (index < entityIds.length) {
          publishLabels();
          timeoutId = window.setTimeout(work, 0);
        } else {
          flushLabels();
        }
      })();
    }

    timeoutId = window.setTimeout(work, 0);

    return () => {
      cancelled = true;
      if (timeoutId !== null) {
        window.clearTimeout(timeoutId);
      }
    };
  }, [
    activeEntityIds,
    baseCountryByEntityId,
    baseEntityById,
    baseOwnerByRegionId,
    data,
    entities,
    projection,
    regionById,
    regionIdsByEntityId,
    renderGeometriesByEntityId,
  ]);

  const countryLabels = useMemo(() => {
    if (isMapMoving) return [];

    const displayScale = zoom.k;
    const minScreenFontSize = getCountryLabelMinScreenFontSize(countryLabelMinScreenFontSize, zoom.k);
    const rawLabels = countryLabelLayouts
      .filter((label) => label.fontSize * displayScale >= minScreenFontSize)
      .map((label) => ({
        ...label,
        priority: label.priority + (label.id === selectedEntityId ? 100 : 0),
      }));

    return filterLabels(rawLabels, zoom, {
      maxLabels: zoom.k < 1.8 ? 44 : zoom.k < 4 ? 120 : 240,
      minGap: zoom.k < 2.2 ? 5 : zoom.k < 4 ? 1.5 : 0,
      viewportWidth,
      viewportHeight,
      getSortText: (label) => label.displayName,
      getBoxSize: (label) => {
        const angle = (label.angle * Math.PI) / 180;
        const cos = Math.abs(Math.cos(angle));
        const sin = Math.abs(Math.sin(angle));
        const width = Math.max(10, label.width * displayScale);
        const height = Math.max(5, label.height * displayScale);
        return {
          width: width * cos + height * sin,
          height: width * sin + height * cos,
        };
      },
    });
  }, [countryLabelLayouts, isMapMoving, selectedEntityId, zoom]);

  const regionLabels = useMemo<SimpleMapLabel[]>(() => {
    if (!regionOwners) return [];
    if (!activeModeUsesRegions) return [];
    if (isMapMoving) return [];
    if (zoom.k < 1.55 && selectedRegions.size === 0) return [];

    const selectedOwnerIds = new Set(
      [...selectedRegions].map((regionId) => regionOwners[regionId]).filter(Boolean),
    );
    const shouldShowAllVisible = zoom.k >= 2.7;

    const rawLabels: SimpleMapLabel[] = [];
    for (const region of visibleRegions) {
      const ownerId = regionOwners[region.id];
      if (!ownerId) continue;
      if (
        !selectedRegions.has(region.id) &&
        ownerId !== selectedEntityId &&
        !selectedOwnerIds.has(ownerId) &&
        !shouldShowAllVisible
      ) {
        continue;
      }
      const bounds = getRegionBounds(region.id);
      if (!bounds) continue;
      rawLabels.push({
        id: region.id,
        name: regionNameOverrides[region.id] || region.name,
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
        priority: (selectedRegions.has(region.id) ? 100 : 0) + (ownerId === selectedEntityId ? 10 : 0),
      });
    }

    return filterLabels(rawLabels, zoom, {
      maxLabels: zoom.k < 2.7 ? 18 : 55,
      minGap: 8,
      viewportWidth,
      viewportHeight,
      getSortText: (label) => label.name,
      getBoxSize: (label) => ({
        width: Math.min(130, Math.max(18, label.name.length * 5.2)),
        height: 10,
      }),
    });
  }, [
    activeModeUsesRegions,
    getRegionBounds,
    regionNameOverrides,
    regionOwners,
    isMapMoving,
    selectedEntityId,
    selectedRegions,
    visibleRegions,
    zoom,
  ]);

  const selectedEntityRegionIds = useMemo(() => {
    return selectedEntityId ? regionIdsByEntityId.get(selectedEntityId) ?? [] : [];
  }, [regionIdsByEntityId, selectedEntityId]);

  const selectedEntityRegions = useMemo(() => {
    if (mode !== "divide" || !selectedEntityId) return [];
    return selectedEntityRegionIds
      .map((regionId) => regionById.get(regionId))
      .filter((region): region is RegionRecord => Boolean(region));
  }, [mode, regionById, selectedEntityId, selectedEntityRegionIds]);

  const inspectRegions = useMemo(() => {
    return selectedEntityRegionIds
      .map((regionId) => regionById.get(regionId))
      .filter((region): region is RegionRecord => Boolean(region))
      .sort((a, b) => getRegionDisplayName(a.id).localeCompare(getRegionDisplayName(b.id)));
  }, [getRegionDisplayName, regionById, selectedEntityRegionIds]);

  const inspectRegionRows = useMemo(() => {
    return inspectRegions.map((region) => ({
      id: region.id,
      displayName: getRegionDisplayName(region.id),
      type: region.type,
    }));
  }, [getRegionDisplayName, inspectRegions]);

  const inspectFocusedRegion = inspectFocusedRegionId ? regionById.get(inspectFocusedRegionId) : undefined;

  const selectedTransferRegions = useMemo(() => {
    if (!regionOwners || !entities) return [];
    return getSelectedTransferRegions({
      selectedRegionIds: selectedRegions,
      regionById,
      regionOwners,
      entities,
      getRegionDisplayName,
    });
  }, [entities, getRegionDisplayName, regionById, regionOwners, selectedRegions]);

  const focusedTransferRegion =
    selectedTransferRegions.find((region) => region.id === transferFocusedRegionId) ?? selectedTransferRegions[0];

  useEffect(() => {
    if (!regionOwners || mode !== "transfer" || selectedRegions.size === 0) {
      setNeighborTargetEntityIds(new Set());
      return;
    }

    let cancelled = false;
    const selectedRegionIds = [...selectedRegions];
    const regionOwnersSnapshot = regionOwners;

    void import("./regionAdjacency").then(({ buildSelectedRegionAdjacency }) => {
      if (cancelled) return;
      const regionAdjacency = buildSelectedRegionAdjacency(effectiveRegions, selectedRegionIds);
      const nextNeighborTargetEntityIds = getNeighborTargetEntityIds({
        selectedRegionIds,
        selectedEntityId,
        regionAdjacency,
        regionOwners: regionOwnersSnapshot,
      });
      if (!cancelled) {
        setNeighborTargetEntityIds(nextNeighborTargetEntityIds);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [effectiveRegions, mode, regionOwners, selectedEntityId, selectedRegions]);

  const mergeSelectedEntities = useMemo(() => {
    if (!entities) return [];
    return [...mergeSelection]
      .map((entityId) => entities[entityId])
      .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entities, mergeSelection]);

  const transferTargetGroups = useMemo(() => {
    return orderTransferTargetEntities({
      entityOptions,
      selectedEntityId,
      neighborEntityIds: selectedRegions.size > 0 ? neighborTargetEntityIds : new Set(),
    });
  }, [entityOptions, neighborTargetEntityIds, selectedEntityId, selectedRegions.size]);

  const useLowZoomTransferCountryLayer =
    mode === "transfer" && settledZoom.k < simplifiedCountryLayerMaxZoom;

  const useSimplifiedCountryLayer =
    !activeModeUsesRegions &&
    mode !== "divide" &&
    settledZoom.k < simplifiedCountryLayerMaxZoom &&
    selectedRegions.size === 0 &&
    !inspectFocusedRegionId;

  const addRegionByBrush = useCallback((regionId: string) => {
    if (!snapshot || readOnly || !brushEnabled || !isBrushDown || !activeModeUsesRegions) return;
    const ownerId = snapshot.regionOwners[regionId];
    if (!ownerId) return;
    if (!selectedEntityId) {
      setSelectedEntityId(ownerId);
      setSelectedRegions(new Set([regionId]));
      setTransferFocusedRegionId(regionId);
      return;
    }
    if (ownerId === selectedEntityId) {
      setSelectedRegions((current) => new Set(current).add(regionId));
      setTransferFocusedRegionId(regionId);
    }
  }, [
    activeModeUsesRegions,
    brushEnabled,
    isBrushDown,
    readOnly,
    selectedEntityId,
    snapshot,
  ]);

  const selectedEntitySplitRegions = useMemo(() => {
    if (!data || !snapshot || !selectedEntityId || selectedEntityRegions.length === 0) {
      return selectedEntityRegions;
    }
    const baseEntity = data.countries.find((entity) => entity.id === selectedEntityId);
    const baseCountry = data.baseCountries.find((country) => country.entityId === selectedEntityId);
    const currentRegionIds = selectedEntityRegionIds;

    if (baseEntity && baseCountry && sameStringSet(currentRegionIds, baseEntity.regionIds)) {
      return [
        {
          id: `${selectedEntityId}-BASE-SPLIT`,
          name: selectedEntity?.name ?? baseEntity.name,
          ownerId: selectedEntityId,
          type: "Base country split geometry",
          geometry: baseCountry.geometry,
        },
      ];
    }

    return selectedEntityRegions;
  }, [data, selectedEntity, selectedEntityId, selectedEntityRegionIds, selectedEntityRegions, snapshot]);

  const divideLineCoordinates = useMemo(() => {
    if (divideLine.length < 2) return [];
    return divideLine
      .map((point) => projection.invert?.([point.x, point.y]))
      .filter((position): position is [number, number] => {
        return Boolean(position && Number.isFinite(position[0]) && Number.isFinite(position[1]));
      });
  }, [divideLine, projection]);

  const divideSplit = useMemo<CountrySplit>(() => {
    if (mode !== "divide" || isDrawingDivideLine) {
      return { ok: false, reason: "" };
    }
    if (!geometrySplitModule) {
      return { ok: false, reason: "" };
    }
    if (divideIslandPoint) {
      return geometrySplitModule.separateCountryIsland(selectedEntitySplitRegions, divideIslandPoint);
    }
    if (divideLineCoordinates.length < 2) {
      return { ok: false, reason: "" };
    }
    return geometrySplitModule.splitCountryGeometry(selectedEntitySplitRegions, divideLineCoordinates);
  }, [
    divideIslandPoint,
    divideLineCoordinates,
    geometrySplitModule,
    isDrawingDivideLine,
    mode,
    selectedEntitySplitRegions,
  ]);

  const activeDivideNewPieceIndex =
    divideSplit.ok ? divideNewPieceIndex ?? divideSplit.defaultNewPieceIndex : null;
  const divideTerritories =
    divideSplit.ok && activeDivideNewPieceIndex !== null && geometrySplitModule
      ? geometrySplitModule.buildDivideTerritories(divideSplit, activeDivideNewPieceIndex)
      : null;
  const divideExistingPath = divideTerritories
    ? geometryToSvgPath(divideTerritories.existingGeometry, projection, getProjectedPathOptions())
    : "";
  const divideNewPath = divideTerritories
    ? geometryToSvgPath(divideTerritories.newGeometry, projection, getProjectedPathOptions())
    : "";
  const divideLinePath = svgLineToPath(divideLine);
  const visibleDivideError = divideError || (!divideSplit.ok ? divideSplit.reason : "");
  const showSidePanel = mode !== "inspect" || Boolean(selectedEntity || inspectFocusedRegion || snapshot?.description);

  useEffect(() => {
    if (!snapshot) return;

    if (selectedEntityId && !activeEntityIdSet.has(selectedEntityId)) {
      setSelectedEntityId("");
      setInspectFocusedRegionId("");
      setTransferFocusedRegionId("");
      setSelectedRegions(new Set());
      clearDivideDraft();
    }

    if (targetEntityId && !activeEntityIdSet.has(targetEntityId)) {
      setTargetEntityId("");
    }

    setMergeSelection((current) => {
      const next = new Set([...current].filter((entityId) => activeEntityIdSet.has(entityId)));
      if (sameStringSet([...current], [...next])) return current;
      setMergeName(makeDefaultMergeName(snapshot, next));
      return next;
    });

    if (mode === "transfer") {
      setSelectedRegions((current) => {
        const next = new Set(
          [...current].filter((regionId) => {
            const ownerId = snapshot.regionOwners[regionId];
            return Boolean(ownerId && (!selectedEntityId || ownerId === selectedEntityId));
          }),
        );
        return sameStringSet([...current], [...next]) ? current : next;
      });
    }
  }, [activeEntityIdSet, mode, selectedEntityId, snapshot, targetEntityId]);

  useEffect(() => {
    if (!inspectFocusedRegionId || !snapshot) return;
    if (!selectedEntityId || snapshot.regionOwners[inspectFocusedRegionId] !== selectedEntityId) {
      setInspectFocusedRegionId("");
    }
  }, [inspectFocusedRegionId, selectedEntityId, snapshot]);

  useEffect(() => {
    if (mode !== "transfer" || !snapshot) return;
    const validFocusId = getValidTransferFocus({
      currentFocusId: transferFocusedRegionId,
      selectedRegionIds: selectedRegions,
      regionOwners: snapshot.regionOwners,
      selectedEntityId,
    });
    if (validFocusId !== transferFocusedRegionId) {
      setTransferFocusedRegionId(validFocusId);
    }
  }, [mode, selectedEntityId, selectedRegions, snapshot, transferFocusedRegionId]);

  function commit(mutator: (draft: EditorSnapshot) => EditorSnapshot | void) {
    if (!history || readOnly) return;
    const draft = cloneSnapshot(history.present);
    const result = mutator(draft) ?? draft;
    const next = updateEntityRegions(result);
    setHistory({
      present: next,
      past: [...history.past, history.present].slice(-80),
      future: [],
    });
  }

  function commitMetadata(mutator: (current: EditorSnapshot) => EditorSnapshot) {
    if (readOnly) return;
    setHistory((currentHistory) => {
      if (!currentHistory) return currentHistory;
      const next = mutator(currentHistory.present);
      if (next === currentHistory.present) return currentHistory;
      return {
        present: next,
        past: [...currentHistory.past, currentHistory.present].slice(-80),
        future: [],
      };
    });
  }

  function updateScenarioTitle(title: string) {
    commitMetadata((current) => {
      if (current.title === title) return current;
      return { ...current, title };
    });
  }

  function updateScenarioDescription(description: string) {
    commitMetadata((current) => {
      if (current.description === description) return current;
      return { ...current, description };
    });
  }

  function undo() {
    if (!history || readOnly || history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    setHistory({
      present: previous,
      past: history.past.slice(0, -1),
      future: [history.present, ...history.future],
    });
  }

  function redo() {
    if (!history || readOnly || history.future.length === 0) return;
    const next = history.future[0];
    setHistory({
      present: next,
      past: [...history.past, history.present],
      future: history.future.slice(1),
    });
  }

  function resetMap() {
    if (!data || !history || readOnly) return;
    const initial = createInitialSnapshot(data);
    setHistory({
      present: initial,
      past: [...history.past, history.present],
      future: [],
    });
    setSelectedRegions(new Set());
    setTransferFocusedRegionId("");
    setMergeSelection(new Set());
    setTargetEntityId("");
    clearDivideDraft();
  }

  function selectMode(nextMode: EditMode) {
    setMode(nextMode);
    setSelectedRegions(new Set());
    setTransferFocusedRegionId("");
    setMergeSelection(new Set());
    setBrushEnabled(false);
    setShare(null);
    clearDivideDraft();
  }

  function clearMapSelection() {
    setSelectedEntityId("");
    setTargetEntityId("");
    setSelectedRegions(new Set());
    setTransferFocusedRegionId("");
    setMergeSelection(new Set());
    setMergeName("");
    clearDivideDraft();
  }

  function clearDivideDraft() {
    setDivideLine([]);
    setDivideIslandPoint(null);
    setDivideNewPieceIndex(null);
    setDivideError("");
    setIsDrawingDivideLine(false);
  }

  function changeSelectedEntity(entityId: string) {
    setSelectedEntityId(entityId);
    setInspectFocusedRegionId("");
    setSelectedRegions(new Set());
    setTransferFocusedRegionId("");
    setTargetEntityId("");
    setMergeSelection(new Set());
    clearDivideDraft();
  }

  function applyZoom(nextZoom: ZoomState) {
    zoomRef.current = nextZoom;
    setZoom(nextZoom);
    setSettledZoom(nextZoom);
  }

  function zoomToRegion(regionId: string) {
    const region = regionById.get(regionId);
    if (!region) return;
    const bounds = projectedGeometryBounds(region.geometry, projection);
    if (!bounds) return;
    applyZoom(zoomToBounds(bounds, 54));
  }

  function zoomToEntity(entityId: string) {
    if (!entityId) return;
    const geometries = renderGeometriesByEntityId.get(entityId) ?? [];
    const bounds = projectedGeometriesBounds(geometries, projection);
    if (!bounds) return;
    applyZoom(zoomToBounds(bounds, 44));
  }

  function focusInspectRegion(regionId: string) {
    setInspectFocusedRegionId(regionId);
    zoomToRegion(regionId);
  }

  function focusTransferRegion(regionId: string) {
    setTransferFocusedRegionId(regionId);
    zoomToRegion(regionId);
  }

  function updateFocusedRegionName(name: string) {
    if (!inspectFocusedRegionId || readOnly) return;
    commitMetadata((current) => renameRegion(current, inspectFocusedRegionId, name));
  }

  function separateRegion(regionId: string) {
    if (!snapshot || !history || !regionId || readOnly) return;
    const regionName = getRegionDisplayName(regionId);
    const result = separateRegionAsCountry(
      snapshot,
      regionId,
      regionName,
      getFallbackCountryColor(regionName),
    );
    if (!result) return;

    setHistory({
      present: updateEntityRegions(result.snapshot),
      past: [...history.past, history.present].slice(-80),
      future: [],
    });
    setSelectedEntityId(result.entityId);
    setTargetEntityId("");
    setSelectedRegions(new Set([regionId]));
    setTransferFocusedRegionId(regionId);
    setInspectFocusedRegionId("");
  }

  function handleRegionClick(regionId: string) {
    if (!snapshot) return;
    const ownerId = snapshot.regionOwners[regionId];
    if (!ownerId) return;

    if (readOnly) {
      setSelectedEntityId(ownerId);
      return;
    }

    if (mode === "inspect") {
      setSelectedEntityId(ownerId);
      setInspectFocusedRegionId(regionId);
      return;
    }

    if (mode === "divide") {
      setSelectedEntityId(ownerId);
      clearDivideDraft();
      return;
    }

    if (mode === "merge") {
      setMergeSelection((current) => {
        const next = new Set(current);
        if (next.has(ownerId)) {
          next.delete(ownerId);
        } else {
          next.add(ownerId);
        }
        setMergeName(makeDefaultMergeName(snapshot, next));
        return next;
      });
      setSelectedEntityId(ownerId);
      return;
    }

    if (!selectedEntityId || snapshot.regionOwners[regionId] !== selectedEntityId) {
      setSelectedEntityId(ownerId);
      setSelectedRegions(new Set([regionId]));
      setTransferFocusedRegionId(regionId);
      return;
    }

    setTransferFocusedRegionId(selectedRegions.has(regionId) ? "" : regionId);
    toggleRegion(regionId);
  }

  function handleEntityClick(entityId: string) {
    if (!snapshot) return;
    if (!snapshot.entities[entityId]) return;

    if (readOnly || mode === "inspect") {
      setSelectedEntityId(entityId);
      setInspectFocusedRegionId("");
      return;
    }

    if (mode === "merge") {
      setMergeSelection((current) => {
        const next = new Set(current);
        if (next.has(entityId)) {
          next.delete(entityId);
        } else {
          next.add(entityId);
        }
        setMergeName(makeDefaultMergeName(snapshot, next));
        return next;
      });
      setSelectedEntityId(entityId);
      return;
    }

    if (mode === "transfer") {
      setSelectedEntityId(entityId);
      setSelectedRegions(new Set());
      setTransferFocusedRegionId("");
    }
  }

  function selectAllTransferRegions() {
    if (readOnly || selectedEntityRegionIds.length === 0) return;
    setSelectedRegions(new Set(selectedEntityRegionIds));
    setTransferFocusedRegionId(selectedEntityRegionIds[0] ?? "");
  }

  function removeMergeCountry(entityId: string) {
    if (!snapshot) return;
    setMergeSelection((current) => {
      const next = new Set(current);
      next.delete(entityId);
      setMergeName(makeDefaultMergeName(snapshot, next));
      return next;
    });
  }

  function toggleRegion(regionId: string) {
    setSelectedRegions((current) => {
      const next = new Set(current);
      if (next.has(regionId)) {
        next.delete(regionId);
      } else {
        next.add(regionId);
      }
      return next;
    });
  }

  function applyTransfer() {
    if (!snapshot || !targetEntityId || selectedRegions.size === 0 || readOnly) return;
    const regionIds = [...selectedRegions];
    const nextSelectedEntityId = targetEntityId;
    setHistory((currentHistory) => {
      if (!currentHistory || readOnly) return currentHistory;
      const next = transferRegions(currentHistory.present, regionIds, nextSelectedEntityId);
      if (next === currentHistory.present) {
        return currentHistory;
      }
      return {
        present: next,
        past: [...currentHistory.past, currentHistory.present].slice(-80),
        future: [],
      };
    });
    setSelectedRegions(new Set());
    setTransferFocusedRegionId("");
    setSelectedEntityId(nextSelectedEntityId);
  }

  function createCountryFromDivide() {
    const name = newCountryName.trim();
    if (
      !snapshot ||
      !selectedEntity ||
      !divideSplit.ok ||
      activeDivideNewPieceIndex === null ||
      !divideTerritories ||
      !name ||
      readOnly
    ) {
      return;
    }

    const color = newCountryColor;
    const territories = divideTerritories;
    let newEntityId = "";

    commit((draft) => {
      newEntityId = makeCustomEntityId(draft.customCounter);
      draft.customCounter += 1;
      const existingRegionId = `${newEntityId}-REMAINDER`;
      const newRegionId = `${newEntityId}-TERRITORY`;
      const sourceRegionIds = getEntityRegionIds(draft, selectedEntity.id);

      for (const regionId of sourceRegionIds) {
        draft.regionOwners[regionId] = "";
        delete draft.customRegions[regionId];
      }

      draft.entities[newEntityId] = {
        id: newEntityId,
        name,
        color,
        regionIds: [newRegionId],
        isCustom: true,
      };
      draft.customRegions[existingRegionId] = {
        id: existingRegionId,
        name: `${selectedEntity.name} remainder`,
        ownerId: selectedEntity.id,
        type: "Custom divide remainder",
        geometry: territories.existingGeometry,
      };
      draft.customRegions[newRegionId] = {
        id: newRegionId,
        name,
        ownerId: newEntityId,
        type: "Custom divided territory",
        geometry: territories.newGeometry,
      };
      draft.regionOwners[existingRegionId] = selectedEntity.id;
      draft.regionOwners[newRegionId] = newEntityId;
      return draft;
    });

    setSelectedEntityId(newEntityId);
    setSelectedRegions(new Set());
    setNewCountryName("");
    clearDivideDraft();
  }

  function mergeCountries() {
    if (!snapshot || mergeSelection.size < 2 || readOnly) return;
    const members = [...mergeSelection].filter((id) => snapshot.entities[id]);
    if (members.length < 2) return;
    const name = mergeName.trim() || makeDefaultMergeName(snapshot, new Set(members));
    let newEntityId = "";

    commit((draft) => {
      newEntityId = makeCustomEntityId(draft.customCounter);
      draft.customCounter += 1;
      const regionIds = Object.entries(draft.regionOwners)
        .filter(([, ownerId]) => members.includes(ownerId))
        .map(([regionId]) => regionId);
      draft.entities[newEntityId] = {
        id: newEntityId,
        name,
        color: getFallbackCountryColor(name),
        regionIds,
        isCustom: true,
      };
      for (const regionId of regionIds) {
        draft.regionOwners[regionId] = newEntityId;
      }
      return draft;
    });

    setSelectedEntityId(newEntityId);
    setMergeSelection(new Set());
    setMergeName("");
  }

  function updateSelectedName(name: string) {
    const entityId = selectedEntityId;
    if (!entityId || readOnly) return;
    commitMetadata((current) => {
      const entity = current.entities[entityId];
      if (!entity || entity.name === name) return current;
      return {
        ...current,
        entities: {
          ...current.entities,
          [entityId]: { ...entity, name },
        },
      };
    });
  }

  function updateSelectedColor(color: string) {
    const entityId = selectedEntityId;
    if (!entityId || readOnly) return;
    commitMetadata((current) => {
      const entity = current.entities[entityId];
      if (!entity || entity.color === color) return current;
      return {
        ...current,
        entities: {
          ...current.entities,
          [entityId]: { ...entity, color },
        },
      };
    });
  }

  async function makeShare() {
    if (!data || !snapshot) return;
    const encoded = await encodeSharePayload(createScenarioPayload(data, snapshot));
    const url = makeShareUrl(encoded);
    setShare({
      url,
      editableUrl: makeEditableUrl(encoded),
      size: describeUrlSize(url),
    });
  }

  function copyShareUrl() {
    if (!share) return;
    void navigator.clipboard.writeText(share.url);
  }

  function startFreshAfterLoadError() {
    setLoadError("");
    setReadOnly(false);
    if (window.location.hash) {
      window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    }
  }

  async function remix() {
    setReadOnly(false);
    const encoded = data && snapshot ? await encodeSharePayload(createScenarioPayload(data, snapshot)) : "";
    if (encoded) {
      window.history.replaceState(null, "", makeEditableUrl(encoded));
    }
  }

  function queueZoomUpdate(nextZoom: ZoomState) {
    zoomRef.current = nextZoom;
    if (pendingZoomFrameRef.current !== null) {
      return;
    }
    pendingZoomFrameRef.current = window.requestAnimationFrame(() => {
      pendingZoomFrameRef.current = null;
      applyZoomToDom(zoomRef.current);
    });
  }

  function syncZoomStateNow() {
    if (pendingZoomFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingZoomFrameRef.current);
      pendingZoomFrameRef.current = null;
    }
    applyZoomToDom(zoomRef.current);
    setZoom(zoomRef.current);
  }

  function markMapMoving() {
    mapSvgRef.current?.classList.add("is-moving");
    if (!isMapMovingRef.current) {
      isMapMovingRef.current = true;
      setIsMapMoving(true);
    }
    if (mapMovingTimerRef.current !== null) {
      window.clearTimeout(mapMovingTimerRef.current);
      mapMovingTimerRef.current = null;
    }
  }

  function settleMapMoving(delay = 80) {
    if (mapMovingTimerRef.current !== null) {
      window.clearTimeout(mapMovingTimerRef.current);
    }
    mapMovingTimerRef.current = window.setTimeout(() => {
      mapMovingTimerRef.current = null;
      applyZoomToDom(zoomRef.current);
      setZoom(zoomRef.current);
      mapSvgRef.current?.classList.remove("is-moving");
      isMapMovingRef.current = false;
      setSettledZoom(zoomRef.current);
      setIsMapMoving(false);
    }, delay);
  }

  function handlePointerDown(event: React.PointerEvent<SVGSVGElement>) {
    if (event.button === 1) {
      event.preventDefault();
      panRef.current = {
        x: event.clientX,
        y: event.clientY,
        zoom: zoomRef.current,
        moved: false,
        regionId: null,
        entityId: null,
        selectOnRelease: false,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (event.button !== 0) return;
    const clickedMapPoint = getMapPoint(event.currentTarget, event.clientX, event.clientY, zoomRef.current);
    const regionId = getEventRegionId(event.target) ?? findRegionAtMapPoint(clickedMapPoint);
    const entityId = getEventEntityId(event.target);

    if (mode === "inspect") {
      event.preventDefault();
      panRef.current = {
        x: event.clientX,
        y: event.clientY,
        zoom: zoomRef.current,
        moved: false,
        regionId,
        entityId,
        selectOnRelease: true,
      };
      event.currentTarget.setPointerCapture(event.pointerId);
      return;
    }

    if (mode === "divide" && !readOnly) {
      const ownerId = regionId && snapshot ? snapshot.regionOwners[regionId] : "";
      if (!selectedEntityId && ownerId) {
        setSelectedEntityId(ownerId);
        clearDivideDraft();
        return;
      }
      if (selectedEntityId) {
        divideDrawRef.current = { pointerId: event.pointerId, moved: false };
        setDivideLine([clickedMapPoint]);
        setDivideIslandPoint(null);
        setDivideNewPieceIndex(null);
        setDivideError("");
        setIsDrawingDivideLine(true);
        event.currentTarget.setPointerCapture(event.pointerId);
        return;
      }
    }

    if (brushEnabled && activeModeUsesRegions && !readOnly) {
      setIsBrushDown(true);
      if (regionId) {
        handleRegionClick(regionId);
      } else if (entityId) {
        handleEntityClick(entityId);
      }
      return;
    }

    if (regionId) {
      handleRegionClick(regionId);
    } else if (entityId) {
      handleEntityClick(entityId);
    } else {
      clearMapSelection();
    }
  }

  function handlePointerMove(event: React.PointerEvent<SVGSVGElement>) {
    if (divideDrawRef.current) {
      const point = getMapPoint(event.currentTarget, event.clientX, event.clientY, zoomRef.current);
      setDivideLine((current) => {
        const previous = current[current.length - 1];
        if (previous && Math.hypot(point.x - previous.x, point.y - previous.y) < divideLinePointSpacing) {
          return current;
        }
        divideDrawRef.current = divideDrawRef.current
          ? { ...divideDrawRef.current, moved: true }
          : divideDrawRef.current;
        setDivideIslandPoint(null);
        return [...current, point];
      });
      return;
    }

    if (!panRef.current) return;
    const dx = event.clientX - panRef.current.x;
    const dy = event.clientY - panRef.current.y;
    if (Math.hypot(dx, dy) > 3) {
      panRef.current.moved = true;
      markMapMoving();
    }
    queueZoomUpdate({
      ...panRef.current.zoom,
      x: panRef.current.zoom.x + dx,
      y: panRef.current.zoom.y + dy,
    });
  }

  function handlePointerUp(event: React.PointerEvent<SVGSVGElement>) {
    if (divideDrawRef.current) {
      const { moved, pointerId } = divideDrawRef.current;
      divideDrawRef.current = null;
      setIsDrawingDivideLine(false);
      if (!moved) {
        setDivideLine([]);
        const point = getMapPoint(event.currentTarget, event.clientX, event.clientY, zoomRef.current);
        const regionId = getRegionIdAtClientPoint(event.clientX, event.clientY) ?? findRegionAtMapPoint(point);
        if (regionId && snapshot?.regionOwners[regionId] === selectedEntityId) {
          const position = projection.invert?.([point.x, point.y]);
          setDivideIslandPoint(
            position && Number.isFinite(position[0]) && Number.isFinite(position[1]) ? position : null,
          );
        } else {
          setDivideIslandPoint(null);
        }
      }
      event.currentTarget.releasePointerCapture(pointerId);
      return;
    }

    setIsBrushDown(false);
    if (panRef.current) {
      const { entityId, moved, regionId, selectOnRelease } = panRef.current;
      if (!moved && selectOnRelease) {
        if (regionId) {
          handleRegionClick(regionId);
        } else if (entityId) {
          handleEntityClick(entityId);
        } else {
          clearMapSelection();
        }
      }
      panRef.current = null;
      event.currentTarget.releasePointerCapture(event.pointerId);
      syncZoomStateNow();
      settleMapMoving();
    }
  }

  function handleWheel(event: React.WheelEvent<SVGSVGElement>) {
    event.preventDefault();
    markMapMoving();
    const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode, viewportWidth);
    const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode, viewportHeight);
    if (event.shiftKey) {
      queueZoomUpdate({
        ...zoomRef.current,
        x: zoomRef.current.x - deltaX,
        y: zoomRef.current.y - deltaY,
      });
      settleMapMoving(180);
      return;
    }
    const cursor = getSvgPoint(event.currentTarget, event.clientX, event.clientY);
    const clampedDeltaY = clamp(deltaY, -wheelZoomMaxDelta, wheelZoomMaxDelta);
    const factor = Math.exp(-clampedDeltaY * wheelZoomSensitivity);
    queueZoomUpdate(zoomAroundPoint(zoomRef.current, cursor, factor));
    settleMapMoving(180);
  }

  function renderCountryContext() {
    return (
      <section className="context-card">
        <div className="section-heading">COUNTRY</div>
        <label className="field">
          <span>Selected country</span>
          <select value={selectedEntityId} onChange={(event) => changeSelectedEntity(event.target.value)}>
            <option value="">No country selected</option>
            {entityOptions.map((entity) => (
              <option key={entity.id} value={entity.id}>
                {entity.name}
              </option>
            ))}
          </select>
        </label>

        <label className="field">
          <span>Name</span>
          <input
            value={selectedEntity?.name ?? ""}
            disabled={!selectedEntity || readOnly}
            onChange={(event) => updateSelectedName(event.target.value)}
          />
        </label>

        <label className="field color-field">
          <span>Color</span>
          <input
            type="color"
            value={selectedEntity?.color ?? customCountryAccentColor}
            disabled={!selectedEntity || readOnly}
            onInput={(event) => updateSelectedColor(event.currentTarget.value)}
            onChange={(event) => updateSelectedColor(event.target.value)}
          />
        </label>

      </section>
    );
  }

  function renderScenarioContext(currentSnapshot: EditorSnapshot) {
    return (
      <section className="context-card">
        <div className="section-heading">SCENARIO</div>
        {readOnly ? (
          <div className="field">
            <span>Description</span>
            <p className="scenario-description">{currentSnapshot.description || "No description"}</p>
          </div>
        ) : (
          <label className="field">
            <span>Description</span>
            <textarea
              value={currentSnapshot.description}
              onChange={(event) => updateScenarioDescription(event.target.value)}
            />
          </label>
        )}
      </section>
    );
  }

  function renderRegionSummary({
    title,
    name,
    meta,
    className = "",
    children,
  }: {
    title: string;
    name: string;
    meta: string[];
    className?: string;
    children?: React.ReactNode;
  }) {
    return (
      <div className={["region-detail", className].filter(Boolean).join(" ")}>
        <div className="region-detail-header">
          <span>{title}</span>
          <strong>{name}</strong>
        </div>
        {meta.length > 0 ? (
          <div className="region-meta">
            {meta.map((entry) => (
              <span key={entry}>{entry}</span>
            ))}
          </div>
        ) : null}
        {children}
      </div>
    );
  }

  function renderRegionList({
    regions,
    focusedRegionId,
    onSelect,
    className = "",
  }: {
    regions: Array<{ id: string; displayName: string; type: string }>;
    focusedRegionId: string;
    onSelect: (regionId: string) => void;
    className?: string;
  }) {
    return (
      <div className={["region-list", className].filter(Boolean).join(" ")} role="list">
        {regions.map((region) => (
          <button
            key={region.id}
            className={focusedRegionId === region.id ? "region-row active" : "region-row"}
            onClick={() => onSelect(region.id)}
            role="listitem"
          >
            <span>{region.displayName}</span>
            <small>{region.type}</small>
          </button>
        ))}
      </div>
    );
  }

  function renderCountryList({
    entities,
    onSelect,
    onRemove,
  }: {
    entities: Array<{ id: string; name: string }>;
    onSelect: (entityId: string) => void;
    onRemove?: (entityId: string) => void;
  }) {
    return (
      <div className="region-list country-list" role="list">
        {entities.map((entity) => (
          <button key={entity.id} className="region-row" onClick={() => onSelect(entity.id)} role="listitem">
            <span>{entity.name}</span>
            {onRemove ? (
              <small
                onClick={(event) => {
                  event.stopPropagation();
                  onRemove(entity.id);
                }}
              >
                Remove
              </small>
            ) : null}
          </button>
        ))}
      </div>
    );
  }

  const countryUnderlayElements = useMemo(() => {
    if (!entities) return [];
    const visibleUnderlays = shouldCullMapPaths
      ? countryUnderlays.filter((underlay) => boundsIntersect(underlay.bounds, settledViewportBounds))
      : countryUnderlays;

    return visibleUnderlays.map((underlay) => (
      <path
        key={underlay.id}
        id={makeSvgElementId("country-shape", underlay.id)}
        className={[
          "country-underlay",
          useSimplifiedCountryLayer || useLowZoomTransferCountryLayer ? "country-underlay-interactive" : "",
        ].join(" ")}
        data-entity-id={underlay.id}
        d={underlay.pathData}
        fill={entities[underlay.id]?.color ?? "#D7D2C8"}
        fillRule="evenodd"
      />
    ));
  }, [
    countryUnderlays,
    entities,
    settledViewportBounds,
    shouldCullMapPaths,
    useLowZoomTransferCountryLayer,
    useSimplifiedCountryLayer,
  ]);

  const regionPathElements = useMemo(() => {
    if (!entities || !regionOwners) return [];
    const regionsToRender = useSimplifiedCountryLayer
      ? visibleRegions.filter((region) => changedRegionIds.has(region.id))
      : useLowZoomTransferCountryLayer
        ? visibleRegions.filter((region) => selectedEntityId && regionOwners[region.id] === selectedEntityId)
        : visibleRegions;

    return regionsToRender.map((region) => {
      const regionId = region.id;
      const ownerId = regionOwners[regionId];
      const owner = entities[ownerId];
      if (!ownerId || !owner) return null;
      const isSelectedRegion = selectedRegions.has(regionId);
      const isInspectFocusedRegion = mode === "inspect" && inspectFocusedRegionId === regionId;
      const isTransferFocusedRegion = mode === "transfer" && transferFocusedRegionId === regionId;
      const isMergeSelected = mergeSelection.has(ownerId);
      const isEditableRegion = activeModeUsesRegions && (!selectedEntityId || selectedEntityId === ownerId);

      const regionClasses = [
        "region",
        isEditableRegion ? "region-editable" : "",
      ].join(" ");
      const borderClasses = [
        "region-border",
        isSelectedRegion ? "region-selected" : "",
        isInspectFocusedRegion || isTransferFocusedRegion ? "region-focused" : "",
        isMergeSelected ? "merge-selected" : "",
        isEditableRegion ? "region-editable" : "",
      ].join(" ");

      return (
        <g key={regionId} className="region-layer">
          <path
            d={getRegionPath(regionId)}
            data-region-id={regionId}
            className={regionClasses}
            fill={owner.color}
            fillRule="evenodd"
            onPointerEnter={() => addRegionByBrush(regionId)}
          >
            <title>
              {getRegionDisplayName(regionId)} · {owner.name}
            </title>
          </path>
          <path
            d={getRegionStrokePath(regionId)}
            className={borderClasses}
            fill="none"
            aria-hidden="true"
          />
        </g>
      );
    });
  }, [
    activeModeUsesRegions,
    addRegionByBrush,
    changedRegionIds,
    getRegionDisplayName,
    getRegionPath,
    getRegionStrokePath,
    inspectFocusedRegionId,
    mergeSelection,
    mode,
    entities,
    regionOwners,
    selectedEntityId,
    selectedRegions,
    transferFocusedRegionId,
    useLowZoomTransferCountryLayer,
    useSimplifiedCountryLayer,
    visibleRegions,
  ]);

  const subdivisionBorderElements = useMemo(() => {
    if (!regionOwners) return [];
    const visibleSubdivisionBorders = shouldCullMapPaths
      ? projectedSubdivisionBorders.filter((border) => boundsIntersect(border.bounds, settledViewportBounds))
      : projectedSubdivisionBorders;

    return visibleSubdivisionBorders
      .filter((border) => isSubdivisionBorderVisible(border, regionOwners))
      .map((border) => (
        <path
          key={border.id}
          className="subdivision-border-line"
          data-owner-id={border.ownerId}
          data-region-ids={border.regionIds.join(" ")}
          d={border.pathData}
          fill="none"
          aria-hidden="true"
        />
      ));
  }, [
    projectedSubdivisionBorders,
    regionOwners,
    settledViewportBounds,
    shouldCullMapPaths,
  ]);

  const countryOutlineElements = useMemo(() => {
    const visibleUnderlays = shouldCullMapPaths
      ? countryUnderlays.filter((underlay) => boundsIntersect(underlay.bounds, settledViewportBounds))
      : countryUnderlays;

    return visibleUnderlays.map((underlay) => (
      <path
        key={underlay.id}
        className="country-outline"
        data-entity-id={underlay.id}
        d={underlay.strokePathData}
        fillRule="evenodd"
      />
    ));
  }, [countryUnderlays, settledViewportBounds, shouldCullMapPaths]);

  if (loadError && !data) {
    return (
      <main className="app-shell centered">
        <div className="error-panel">
          <Globe2 aria-hidden="true" />
          <h1>AltBorder</h1>
          <p>{loadError}</p>
        </div>
      </main>
    );
  }

  if (!data || !snapshot) {
    return (
      <main className="app-shell centered">
        <div className="loading-panel">
          <Globe2 aria-hidden="true" />
          <span>Loading map data</span>
        </div>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <Globe2 aria-hidden="true" />
          <strong>AltBorder</strong>
        </div>
        <label className="title-field">
          <span>Scenario</span>
          <input
            value={snapshot.title}
            disabled={readOnly}
            onChange={(event) => updateScenarioTitle(event.target.value)}
          />
        </label>
        <div className="topbar-actions">
          {readOnly ? (
            <button className="primary" onClick={remix}>
              <PaintBucket size={16} /> Remix/Edit
            </button>
          ) : (
            <>
              <button onClick={undo} disabled={history!.past.length === 0} title="Undo">
                <Undo2 size={16} />
              </button>
              <button onClick={redo} disabled={history!.future.length === 0} title="Redo">
                <Redo2 size={16} />
              </button>
              <button onClick={resetMap} title="Reset map">
                <RotateCcw size={16} />
              </button>
            </>
          )}
          <button className="primary" onClick={makeShare}>
            <Share2 size={16} /> Share
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="toolbar" aria-label="Map tools">
          <ToolButton
            active={mode === "inspect"}
            icon={<MousePointer2 size={18} />}
            label="Inspect"
            onClick={() => selectMode("inspect")}
          />
          <ToolButton
            active={mode === "transfer"}
            icon={<PaintBucket size={18} />}
            label="Transfer"
            onClick={() => selectMode("transfer")}
          />
          <ToolButton
            active={mode === "divide"}
            icon={<Split size={18} />}
            label="Divide"
            onClick={() => selectMode("divide")}
          />
          <ToolButton
            active={mode === "merge"}
            icon={<GitMerge size={18} />}
            label="Merge"
            onClick={() => selectMode("merge")}
          />
        </aside>

        <section className="map-stage" aria-label="World map editor">
          {loadError ? (
            <div className="inline-error">
              <span>{loadError}</span>
              <button onClick={startFreshAfterLoadError}>Start fresh</button>
            </div>
          ) : null}
          <svg
            ref={mapSvgRef}
            viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
            className={[
              "map",
              brushEnabled && activeModeUsesRegions ? "brush-map" : "",
              mode === "divide" && !readOnly ? "divide-map" : "",
            ].join(" ")}
            role="img"
            aria-label="Editable world map"
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onAuxClick={(event) => event.preventDefault()}
            onWheel={handleWheel}
          >
            <rect width={viewportWidth} height={viewportHeight} className="ocean" />
            <g ref={mapContentRef} transform={formatZoomTransform(zoom)}>
              <g className="country-underlays" aria-hidden="true">
                {countryUnderlayElements}
              </g>
              {regionPathElements}
              <g className="subdivision-borders" aria-hidden="true">
                {subdivisionBorderElements}
              </g>
              <g className="country-outlines" aria-hidden="true">
                {countryOutlineElements}
              </g>
              {divideTerritories ? (
                <g className="divide-preview" aria-hidden="true">
                  <path className="divide-existing-preview" d={divideExistingPath} />
                  <path className="divide-new-preview" d={divideNewPath} fill={newCountryColor} />
                </g>
              ) : null}
              {divideLinePath ? (
                <path className="divide-line" d={divideLinePath} aria-hidden="true" />
              ) : null}
              <g className="country-labels">
                {countryLabels.map((label) => (
                  <g
                    key={label.id}
                    transform={`translate(${label.x} ${label.y}) rotate(${label.angle})`}
                  >
                    <text
                      className="country-label"
                      x={0}
                      y={0}
                      fontSize={label.fontSize}
                      textLength={label.textLength}
                      lengthAdjust="spacingAndGlyphs"
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {label.displayName}
                    </text>
                  </g>
                ))}
              </g>
              <g className="region-labels">
                {regionLabels.map((label) => (
                  <text
                    key={label.id}
                    x={label.x}
                    y={label.y}
                    transform={`translate(${label.x} ${label.y}) scale(${1 / zoom.k}) translate(${-label.x} ${-label.y})`}
                  >
                    {label.name}
                  </text>
                ))}
              </g>
            </g>
          </svg>
        </section>

        {showSidePanel ? (
        <aside className="side-panel">
          <PanelHeader mode={mode} readOnly={readOnly} />
          {renderScenarioContext(snapshot)}

          {mode === "inspect" ? (
            <>
              {renderCountryContext()}

              <section className="context-card">
                <div className="section-heading">REGION</div>

                {inspectFocusedRegion ? (
                  renderRegionSummary({
                    title: "Focused region",
                    name: getRegionDisplayName(inspectFocusedRegion.id),
                    meta: [],
                    children: (
                      <label className="field">
                        <span>Region name</span>
                        <input
                          value={getRegionDisplayName(inspectFocusedRegion.id)}
                          disabled={readOnly}
                          onChange={(event) => updateFocusedRegionName(event.target.value)}
                        />
                      </label>
                    ),
                  })
                ) : (
                  <p className="hint">Choose a region from the list to inspect or rename it.</p>
                )}

                {inspectRegionRows.length > 0 ? (
                  renderRegionList({
                    regions: inspectRegionRows,
                    focusedRegionId: inspectFocusedRegionId,
                    onSelect: focusInspectRegion,
                  })
                ) : (
                  <>
                  {selectedEntity ? (
                    <div className="empty-state">No regions</div>
                  ) : null}
                  {!selectedEntity ? <div className="empty-state">No country selected</div> : null}
                  </>
                )}
              </section>
            </>
          ) : (
            <>
              {renderCountryContext()}

              {activeModeUsesRegions ? (
                <section className="context-card compact-context-card">
                  <div className="section-heading">SELECTION</div>
                  <div className="switch-row">
                    <button
                      className={brushEnabled ? "active compact" : "compact"}
                      disabled={readOnly}
                      onClick={() => setBrushEnabled((value) => !value)}
                    >
                      <Brush size={15} /> Brush
                    </button>
                    <button
                      className="compact"
                      disabled={readOnly || selectedEntityRegionIds.length === 0}
                      onClick={selectAllTransferRegions}
                    >
                      All regions
                    </button>
                  </div>
                </section>
              ) : null}
            </>
          )}

          {mode === "transfer" ? (
            <div className="tool-card">
              {focusedTransferRegion ? (
                renderRegionSummary({
                  title: "Selected region",
                  name: focusedTransferRegion.displayName,
                  meta: [],
                  className: "transfer-region-detail",
                  children: (
                    <div className="region-actions">
                      <button onClick={() => separateRegion(focusedTransferRegion.id)} disabled={readOnly}>
                        <Split size={15} /> Separate region
                      </button>
                    </div>
                  ),
                })
              ) : (
                <div className="empty-state">No region selected</div>
              )}

              {selectedTransferRegions.length > 1 ? (
                renderRegionList({
                  regions: selectedTransferRegions,
                  focusedRegionId: focusedTransferRegion?.id ?? "",
                  onSelect: focusTransferRegion,
                  className: "transfer-region-list",
                })
              ) : null}

              <label className="field">
                <span>Transfer selected regions to</span>
                <select
                  value={targetEntityId}
                  disabled={readOnly}
                  onChange={(event) => setTargetEntityId(event.target.value)}
                >
                  <option value="">Choose target</option>
                  {transferTargetGroups.neighborTargets.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                  {transferTargetGroups.neighborTargets.length > 0 &&
                  transferTargetGroups.otherTargets.length > 0 ? (
                    <option disabled value="__neighbor-separator">
                      ────────
                    </option>
                  ) : null}
                  {transferTargetGroups.otherTargets.map((entity) => (
                    <option key={entity.id} value={entity.id}>
                      {entity.name}
                    </option>
                  ))}
                </select>
              </label>
              {selectedRegions.size > 0 && transferTargetGroups.neighborTargets.length > 0 ? (
                <p className="hint">Neighboring targets are listed first.</p>
              ) : null}
              <button
                className="primary wide"
                disabled={readOnly || !targetEntity || selectedRegions.size === 0}
                onClick={applyTransfer}
              >
                <Check size={16} /> Transfer {selectedRegions.size || ""} region(s)
              </button>
            </div>
          ) : null}

          {mode === "divide" ? (
            <div className="tool-card">
              <div className="section-heading">NEW COUNTRY</div>
              <div className="switch-row">
                <button
                  className="compact"
                  disabled={readOnly || !divideSplit.ok}
                  onClick={() =>
                    setDivideNewPieceIndex((current) => {
                      const active = current ?? (divideSplit.ok ? divideSplit.defaultNewPieceIndex : 0);
                      return active === 0 ? 1 : 0;
                    })
                  }
                >
                  <ArrowLeftRight size={15} /> Swap
                </button>
                <button
                  className="compact"
                  disabled={readOnly || (divideLine.length === 0 && !divideIslandPoint)}
                  onClick={clearDivideDraft}
                >
                  Clear
                </button>
              </div>
              <p className="hint">Draw a cut or click a separate island. Use Swap to choose the new side.</p>
              {visibleDivideError ? <div className="tool-error">{visibleDivideError}</div> : null}
              <label className="field">
                <span>Name</span>
                <input
                  value={newCountryName}
                  disabled={readOnly}
                  onChange={(event) => setNewCountryName(event.target.value)}
                  placeholder="Required"
                />
              </label>
              <label className="field color-field">
                <span>Color</span>
                <input
                  type="color"
                  value={newCountryColor}
                  disabled={readOnly}
                  onInput={(event) => setNewCountryColor(event.currentTarget.value)}
                  onChange={(event) => setNewCountryColor(event.target.value)}
                />
              </label>
              <button
                className="primary wide"
                disabled={readOnly || !divideSplit.ok || !newCountryName.trim()}
                onClick={createCountryFromDivide}
              >
                <Split size={16} /> Create country
              </button>
            </div>
          ) : null}

          {mode === "merge" ? (
            <div className="tool-card">
              <div className="section-heading">SELECTED COUNTRIES</div>
              {mergeSelectedEntities.length > 0 ? (
                renderCountryList({
                  entities: mergeSelectedEntities,
                  onSelect: zoomToEntity,
                  onRemove: removeMergeCountry,
                })
              ) : (
                <div className="empty-state">Click countries on the map to merge them</div>
              )}
              <div className="switch-row">
                <button
                  className="compact"
                  disabled={mergeSelection.size === 0}
                  onClick={() => {
                    setMergeSelection(new Set());
                    setMergeName("");
                  }}
                >
                  Clear
                </button>
              </div>
              <label className="field">
                <span>Name</span>
                <input
                  value={mergeName}
                  disabled={readOnly}
                  onChange={(event) => setMergeName(event.target.value)}
                  placeholder="Generated if blank"
                />
              </label>
              <button
                className="primary wide"
                disabled={readOnly || mergeSelection.size < 2}
                onClick={mergeCountries}
              >
                <GitMerge size={16} /> Merge selected
              </button>
            </div>
          ) : null}

          <div className="attribution">{data.attribution}</div>
        </aside>
        ) : null}
      </section>

      {share ? (
        <div className="dialog-backdrop" role="presentation" onClick={() => setShare(null)}>
          <section className="share-dialog" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
            <div>
              <h2>Share map</h2>
              <p>Shared links open read-only by default. Use Remix/Edit to make a copy.</p>
            </div>
            <input readOnly value={share.url} onFocus={(event) => event.currentTarget.select()} />
            <div className={`url-size ${share.size.level}`}>
              URL size: {share.size.bytes.toLocaleString()} bytes
            </div>
            <div className="dialog-actions">
              <button onClick={copyShareUrl}>
                <Copy size={16} /> Copy link
              </button>
              <a href={share.url} target="_blank" rel="noreferrer">
                <Eye size={16} /> View
              </a>
              <a href={share.editableUrl} target="_blank" rel="noreferrer">
                <PaintBucket size={16} /> Editable
              </a>
            </div>
          </section>
        </div>
      ) : null}
    </main>
  );
}

function ToolButton({
  active,
  icon,
  label,
  onClick,
}: {
  active: boolean;
  icon: React.ReactNode;
  label: string;
  onClick: () => void;
}) {
  return (
    <button className={active ? "active" : ""} onClick={onClick} title={label} aria-label={label}>
      {icon}
    </button>
  );
}

function PanelHeader({ mode, readOnly }: { mode: EditMode; readOnly: boolean }) {
  return (
    <div className="panel-header">
      <div>
        <span>{readOnly ? "Viewer" : "Editor"}</span>
        <h1>{modeLabel(mode)}</h1>
      </div>
      {readOnly ? <Eye size={20} /> : null}
    </div>
  );
}

function modeLabel(mode: EditMode) {
  switch (mode) {
    case "inspect":
      return "Inspect";
    case "transfer":
      return "Transfer regions";
    case "divide":
      return "Divide country";
    case "merge":
      return "Merge countries";
  }
}

function getProjectedPathOptions(preferManualFill = false) {
  return {
    coordinatePrecision: svgPathCoordinatePrecision,
    seamBreakDistance: projectedSeamBreakDistance,
    preferManualFill,
  };
}

function makeDefaultMergeName(snapshot: EditorSnapshot, selection: Set<string>): string {
  const names = [...selection]
    .map((id) => snapshot.entities[id]?.name)
    .filter(Boolean)
    .slice(0, 3);
  if (names.length === 0) {
    return "";
  }
  return `${names.join(" + ")} Union`;
}

function visitPositions(geometry: Geometry, visitor: (position: Position) => void) {
  if (geometry.type === "Polygon") {
    for (const ring of geometry.coordinates) {
      for (const position of ring) visitor(position);
    }
  } else if (geometry.type === "MultiPolygon") {
    for (const polygon of geometry.coordinates) {
      for (const ring of polygon) {
        for (const position of ring) visitor(position);
      }
    }
  }
}

function projectedGeometriesBounds(geometries: Geometry[], projection: GeoProjection): ProjectedBounds | null {
  return geometries.reduce<ProjectedBounds | null>((combined, geometry) => {
    const bounds = projectedGeometryBounds(geometry, projection);
    return bounds ? mergeBounds(combined, bounds) : combined;
  }, null);
}

function projectedGeometryBounds(geometry: Geometry, projection: GeoProjection): ProjectedBounds | null {
  let bounds: ProjectedBounds | null = null;

  visitPositions(geometry, (position) => {
    const projected = projection([position[0], position[1]]);
    if (!projected || !Number.isFinite(projected[0]) || !Number.isFinite(projected[1])) return;
    bounds = mergeBounds(bounds, {
      minX: projected[0],
      minY: projected[1],
      maxX: projected[0],
      maxY: projected[1],
    });
  });

  return bounds;
}

function mergeBounds(a: ProjectedBounds | null, b: ProjectedBounds): ProjectedBounds {
  if (!a) return b;
  return {
    minX: Math.min(a.minX, b.minX),
    minY: Math.min(a.minY, b.minY),
    maxX: Math.max(a.maxX, b.maxX),
    maxY: Math.max(a.maxY, b.maxY),
  };
}

function getSvgPoint(svg: SVGSVGElement, clientX: number, clientY: number): SvgPoint {
  const point = svg.createSVGPoint();
  point.x = clientX;
  point.y = clientY;
  const matrix = svg.getScreenCTM();
  if (!matrix) return { x: 0, y: 0 };
  const transformed = point.matrixTransform(matrix.inverse());
  return { x: transformed.x, y: transformed.y };
}

function getMapPoint(svg: SVGSVGElement, clientX: number, clientY: number, zoom: ZoomState): SvgPoint {
  const point = getSvgPoint(svg, clientX, clientY);
  return {
    x: (point.x - zoom.x) / zoom.k,
    y: (point.y - zoom.y) / zoom.k,
  };
}

function svgLineToPath(points: SvgPoint[]): string {
  if (points.length < 2) return "";
  return points.map((point, index) => `${index === 0 ? "M" : "L"}${formatPoint([point.x, point.y])}`).join("");
}

function formatPoint(point: [number, number]): string {
  return `${point[0].toFixed(svgPathCoordinatePrecision)},${point[1].toFixed(svgPathCoordinatePrecision)}`;
}

function formatZoomTransform(zoom: ZoomState): string {
  return `translate(${zoom.x} ${zoom.y}) scale(${zoom.k})`;
}

function makeSvgElementId(prefix: string, value: string): string {
  let hash = 0;
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }
  const safeValue = value.replace(/[^A-Za-z0-9_-]/g, "_");
  return `${prefix}-${safeValue}-${Math.abs(hash).toString(36)}`;
}

function getEventRegionId(target: EventTarget): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest("[data-region-id]")?.getAttribute("data-region-id") ?? null;
}

function getEventEntityId(target: EventTarget): string | null {
  if (!(target instanceof Element)) {
    return null;
  }
  return target.closest("[data-entity-id]")?.getAttribute("data-entity-id") ?? null;
}

function getRegionIdAtClientPoint(clientX: number, clientY: number): string | null {
  return document
    .elementFromPoint(clientX, clientY)
    ?.closest("[data-region-id]")
    ?.getAttribute("data-region-id") ?? null;
}

function zoomAroundPoint(current: ZoomState, cursor: SvgPoint, factor: number): ZoomState {
  const nextScale = clamp(current.k * factor, minZoom, maxZoom);
  const scaleRatio = nextScale / current.k;

  return {
    k: nextScale,
    x: cursor.x - (cursor.x - current.x) * scaleRatio,
    y: cursor.y - (cursor.y - current.y) * scaleRatio,
  };
}

function normalizeWheelDelta(delta: number, deltaMode: number, pageSize: number): number {
  if (deltaMode === WheelEvent.DOM_DELTA_LINE) {
    return delta * 16;
  }
  if (deltaMode === WheelEvent.DOM_DELTA_PAGE) {
    return delta * pageSize;
  }
  return delta;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function sameStringSet(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const values = new Set(a);
  return b.every((value) => values.has(value));
}

function shouldKeepDetailedRegionsForUnion(
  entityId: string,
  baseEntityId: string,
): boolean {
  if (entityId !== baseEntityId) return false;
  return baseGeometryUnionSensitiveEntityIds.has(baseEntityId);
}

function shouldUseStableBaseRenderGeometry(
  entityId: string,
  regionIds: string[],
  baseEntityById: Map<string, { regionIds: string[] }>,
  baseCountryByEntityId: Map<string, { geometry: Geometry }>,
): boolean {
  const baseEntity = baseEntityById.get(entityId);
  return Boolean(
    baseGeometryUnionSensitiveEntityIds.has(entityId) &&
    baseEntity &&
    baseCountryByEntityId.has(entityId) &&
    regionIds.some((regionId) => baseEntity.regionIds.includes(regionId)),
  );
}

function ownsTransferredRegions(
  entityId: string,
  regionIds: string[],
  baseOwnerByRegionId: Map<string, string>,
): boolean {
  return regionIds.some((regionId) => {
    const baseOwnerId = baseOwnerByRegionId.get(regionId);
    return Boolean(baseOwnerId && baseOwnerId !== entityId);
  });
}

function buildStableBaseRenderGeometry({
  baseCountryByEntityId,
  baseEntityById,
  baseOwnerByRegionId,
  entityId,
  regionGeometryById,
  regionIds,
  subtractGeoJsonGeometries,
  unionGeoJsonGeometries,
}: {
  baseCountryByEntityId: Map<string, { geometry: Geometry }>;
  baseEntityById: Map<string, { regionIds: string[] }>;
  baseOwnerByRegionId: Map<string, string>;
  entityId: string;
  regionGeometryById: Map<string, Geometry>;
  regionIds: string[];
  subtractGeoJsonGeometries: GeometrySplitModule["subtractGeoJsonGeometries"];
  unionGeoJsonGeometries: GeometrySplitModule["unionGeoJsonGeometries"];
}): Geometry | null {
  const baseEntity = baseEntityById.get(entityId);
  const baseCountry = baseCountryByEntityId.get(entityId);
  if (!baseEntity || !baseCountry) return null;

  const ownedRegionIds = new Set(regionIds);
  const missingBaseGeometries = baseEntity.regionIds
    .filter((regionId) => !ownedRegionIds.has(regionId))
    .map((regionId) => regionGeometryById.get(regionId))
    .filter((geometry): geometry is Geometry => Boolean(geometry));
  const foreignGeometries = regionIds
    .filter((regionId) => baseOwnerByRegionId.get(regionId) !== entityId)
    .map((regionId) => regionGeometryById.get(regionId))
    .filter((geometry): geometry is Geometry => Boolean(geometry));

  const stableBaseGeometry =
    missingBaseGeometries.length > 0
      ? subtractGeoJsonGeometries(baseCountry.geometry, missingBaseGeometries)
      : baseCountry.geometry;

  if (!stableBaseGeometry) return foreignGeometries.length > 0 ? unionGeoJsonGeometries(foreignGeometries) : null;
  if (foreignGeometries.length === 0) return stableBaseGeometry;
  return unionGeoJsonGeometries([stableBaseGeometry, ...foreignGeometries]);
}

function shouldSkipRenderGapClosing(
  entityId: string,
  regionIds: string[],
  baseOwnerByRegionId: Map<string, string>,
): boolean {
  if (ownsTransferredRegions(entityId, regionIds, baseOwnerByRegionId)) return false;
  return regionIds.some((regionId) => {
    const baseOwnerId = baseOwnerByRegionId.get(regionId);
    return Boolean(baseOwnerId && baseGeometryUnionSensitiveEntityIds.has(baseOwnerId));
  });
}

function hasTransferredOwnershipChanges(
  entityId: string,
  regionIds: string[],
  baseEntityById: Map<string, { regionIds: string[] }>,
  baseOwnerByRegionId: Map<string, string>,
): boolean {
  if (ownsTransferredRegions(entityId, regionIds, baseOwnerByRegionId)) return true;

  const ownedRegionIds = new Set(regionIds);
  const baseEntity = baseEntityById.get(entityId);
  return Boolean(baseEntity?.regionIds.some((regionId) => !ownedRegionIds.has(regionId)));
}

function pruneMapCache<K, V>(cache: Map<K, V>, activeKeys: Set<K>, maxEntries: number) {
  if (cache.size <= maxEntries) return;

  for (const key of cache.keys()) {
    if (activeKeys.has(key)) continue;
    cache.delete(key);
    if (cache.size <= maxEntries) return;
  }
}
