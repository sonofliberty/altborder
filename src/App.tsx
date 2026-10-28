import { startTransition, useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  Check,
  Copy,
  Eye,
  Globe2,
  Hand,
  Maximize2,
  Minimize2,
  Minus,
  MoreHorizontal,
  PaintBucket,
  Plus,
  RotateCcw,
  Share2,
  Undo2,
  Redo2,
  X,
} from "lucide-react";
import { geoGraticule, geoNaturalEarth1, geoPath } from "d3-geo";
import { getCompleteBaseCountryGroups } from "./countryRenderGroups";
import { shouldUseStableBaseRenderGeometry } from "./countryRenderGeometry";
import { CountryGeometryWorkerClient } from "./countryGeometryWorkerClient";
import { withRegionLandAddition } from "./regionLandGeometry";
import type { Geometry, Position } from "geojson";
import type { GeoProjection } from "d3-geo";
import type {
  BoundaryEdgeRecord,
  CountryFlag,
  DivideMethod,
  EditMode,
  EditorSnapshot,
  HistoryState,
  MapThemeId,
  RegionRecord,
} from "./types";
import {
  getCountryFlag,
  makeFlagOptions,
  neutralCountryFlag,
} from "./countryFlags";
import {
  applyScenarioPayload,
  cloneSnapshot,
  createInitialSnapshot,
  createScenarioPayload,
  divideCountry,
  allocateCustomEntityId,
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
import type {
  DivideWorkerResult,
  GeometryWorkerRequest,
  GeometryWorkerResponse,
} from "./geometryWorker";
import type { FittedCountryLabel } from "./labelLayout";
import { countryLabelMaxScreenFontSize, countryLabelMinScreenFontSize } from "./labelConstants";
import {
  filterLabels,
  getCountryLabelMinScreenFontSize,
  getCountryLabelScale,
  getLabelBox,
} from "./mapLabelDisplay";
import { cameraViewportTransform, interpolateZoom, svgViewportBounds, svgViewportPoint, zoomFromTouchPair, zoomToBounds, type ProjectedBounds } from "./mapZoom";
import { applyPoliticalMapPalette, getAdministrativeBorderZoomClass, getCountryBorderStrokeWidth } from "./mapVisualStyle";
import { getMapTheme, getThemedEntities, setEntityColor, setMapTheme } from "./mapThemes";
import { MapThemeSelector } from "./MapThemeSelector";
import { MapThemeCoasts, MapThemeLand, MapThemeOcean } from "./MapThemeLayers";
import { MapChangeBorders, MapChangeOverlay } from "./MapChangeOverlay";
import { createMapChange, getTransferReveal, type MapChangeAnimation } from "./mapChange";
import { clipMapThemeCountryPaths, clipMapThemePolygonPath } from "./mapThemeClip";
import { clipProjectedLinePath } from "./projectedLineClipping";
import mapThemeRaster from "./mapThemeRaster.json";
import { preloadMapThemeAssets } from "./mapThemeAssets";
import { boundsIntersect, projectedViewportBounds, shouldCullPaths, shouldRefreshCullingZoom } from "./mapCulling";
import { findRegionAtProjectedPoint } from "./geometryHitTest";
import { customCountryAccentColor, getFallbackCountryColor } from "./colorRuntime";
import {
  getNeighborTargetEntityIds,
  getSelectedTransferRegions,
  getValidTransferFocus,
  isValidTransferTarget,
  orderTransferTargetEntities,
} from "./transferContext";
import { batchBoundaryPaths, batchBoundaryTransitionPaths, type BatchedBoundaryPaths, type ProjectedBoundaryEdge } from "./boundaryEdges";
import { buildSelectedRegionAdjacency } from "./regionAdjacency";
import { CountrySearchSelect, EditorSidePanel } from "./EditorSidePanel";
import { mapInBatches, yieldToMainThread } from "./mapWork";
import { decodePackedMapDataInBatches } from "./mapDataPacking";
import { prepareMapRendering, type PreparedMapRendering } from "./mapPreparation";
import {
  geometryToSvgPath,
  projectGeometryToPathData,
  projectGeometryStrokeToPathData,
  projectedGeometryBounds,
  type ProjectedPathData,
} from "./projectedPath";
import { getCountryLabelCacheKey } from "./countryLabelGeometry";
import {
  removePolygonalGeometryHoles,
  removeSmallPolygonalGeometryComponents,
} from "./geometrySimplify";

const viewportWidth = 1000;
const viewportHeight = 560;
const emptyProjection = geoNaturalEarth1();
const minZoom = 0.8;
const maxZoom = 30;
const divideLinePointSpacing = 0.45;
const countryRenderGapTolerance = 0.02;
const acquiredRegionRenderGapTolerance = 0.08;
const mapRenderSimplifyTolerance = 0.07;
const countryUnderlayUpdateDelayMs = 0;
const projectedSeamBreakDistance = viewportWidth * 0.22;
const projectedPathCacheVersion = "shared-boundary-linework-v32";
const baseGeometryUnionSensitiveEntityIds = new Set(["BOL", "BRA", "RUS", "USA"]);
const composedFillSensitiveEntityIds = new Set(["RUS"]);
const sliverProneBaseGeometryEntityIds = new Set(["BOL"]);
const sliverComponentMinAreaRatio = 0.0005;
const pathCullingMinZoom = 2.1;
const pathCullingOverscanRatio = 0.42;
const svgPathCoordinatePrecision = 2;
const simplifiedCountryLayerMaxZoom = 1.35;
const wheelZoomMaxDelta = 80;
const wheelZoomSensitivity = 0.001;
const regionLabelScreenFontSize = 11;
const oceanLabels = [
  { name: "Pacific Ocean", coordinates: [-132, 0] as [number, number] },
  { name: "North Atlantic", coordinates: [-38, 23] as [number, number] },
  { name: "South Atlantic", coordinates: [-22, -35] as [number, number] },
  { name: "Indian Ocean", coordinates: [75, -28] as [number, number] },
];
const emptyDivideWorkerResult: DivideWorkerResult = {
  split: { ok: false, reason: "" },
  territories: null,
};

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

type TransferConfirmation = {
  id: number;
  message: string;
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
  geometry: Geometry;
  pathData: string;
  bounds: ProjectedBounds;
  sealInternalSeams: boolean;
};

type ProjectedBoundaryEdgeWithBounds = ProjectedBoundaryEdge & {
  bounds: ProjectedBounds;
};

const compactLayoutQuery = "(max-width: 767px) and (min-height: 501px), (max-width: 539px)";

export default function App() {
  const [preparedMap, setPreparedMap] = useState<PreparedMapRendering | null>(null);
  const data = preparedMap?.data ?? null;
  const projection = preparedMap?.projection ?? emptyProjection;
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
  const [divideMethod, setDivideMethod] = useState<DivideMethod>("line");
  const [divideCursor, setDivideCursor] = useState<SvgPoint | null>(null);
  const [keyboardCutActive, setKeyboardCutActive] = useState(false);
  const [keyboardCutCursor, setKeyboardCutCursor] = useState<SvgPoint | null>(null);
  const [divideIslandPoint, setDivideIslandPoint] = useState<Position | null>(null);
  const [isDrawingDivideLine, setIsDrawingDivideLine] = useState(false);
  const [divideNewPieceIndex, setDivideNewPieceIndex] = useState<0 | 1 | null>(null);
  const [divideError, setDivideError] = useState("");
  const [divideIsCalculating, setDivideIsCalculating] = useState(false);
  const [readOnly, setReadOnly] = useState(false);
  const [isPresenting, setIsPresenting] = useState(false);
  const [mobilePanelExpanded, setMobilePanelExpanded] = useState(false);
  const [keyboardVisible, setKeyboardVisible] = useState(false);
  const [compactLayout, setCompactLayout] = useState(() => window.matchMedia(compactLayoutQuery).matches);
  const [mapNavigationEnabled, setMapNavigationEnabled] = useState(false);
  const [share, setShare] = useState<ShareState | null>(null);
  const [copyFeedback, setCopyFeedback] = useState<{ kind: "success" | "error"; message: string } | null>(null);
  const [loadError, setLoadError] = useState("");
  const [transferConfirmation, setTransferConfirmation] = useState<TransferConfirmation | null>(null);
  const [mapChange, setMapChange] = useState<MapChangeAnimation | null>(null);
  const [zoom, setZoom] = useState<ZoomState>({ x: 0, y: 0, k: 1 });
  const [mapViewScale, setMapViewScale] = useState(1);
  const [mapViewMeasured, setMapViewMeasured] = useState(false);
  const [mapViewportSize, setMapViewportSize] = useState({ width: viewportWidth, height: viewportHeight });
  const [settledZoom, setSettledZoom] = useState<ZoomState>({ x: 0, y: 0, k: 1 });
  const [cullingZoom, setCullingZoom] = useState<ZoomState>({ x: 0, y: 0, k: 1 });
  const [isMapMoving, setIsMapMoving] = useState(false);
  const [projectedBoundaries, setProjectedBoundaries] = useState<{
    edges: ProjectedBoundaryEdgeWithBounds[];
    regionOwners: Record<string, string> | null;
  }>({ edges: [], regionOwners: null });
  const projectedBoundaryEdges = projectedBoundaries.edges;
  const [countryRender, setCountryRender] = useState<{
    underlays: CountryUnderlay[];
    regionOwners: Record<string, string> | null;
  }>({ underlays: [], regionOwners: null });
  const countryUnderlays = countryRender.underlays;
  const [countryLabelLayouts, setCountryLabelLayouts] = useState<FittedCountryLabel[]>([]);
  const [customBoundaries, setCustomBoundaries] = useState<{
    edges: BoundaryEdgeRecord[];
    regionOwners: Record<string, string> | null;
  }>({ edges: [], regionOwners: null });
  const customBoundaryEdges = customBoundaries.edges;
  const [inspectFocusedRegionId, setInspectFocusedRegionId] = useState("");
  const [transferFocusedRegionId, setTransferFocusedRegionId] = useState("");
  const [neighborTargetEntityIds, setNeighborTargetEntityIds] = useState<Set<string>>(new Set());
  const [divideWorkerResult, setDivideWorkerResult] = useState<DivideWorkerResult>(emptyDivideWorkerResult);
  const mapSvgRef = useRef<SVGSVGElement | null>(null);
  const mapSurfaceRef = useRef<HTMLDivElement | null>(null);
  const mapCameraRef = useRef<HTMLDivElement | null>(null);
  const mapViewportClipId = `map-viewport-${useId()}`;
  const countryLabelsRef = useRef<SVGGElement | null>(null);
  const oceanLabelRefs = useRef<(SVGTextElement | null)[]>([]);
  const presentationToggleRef = useRef<HTMLButtonElement | null>(null);
  const actionsMenuRef = useRef<HTMLDetailsElement | null>(null);
  const shareTriggerRef = useRef<HTMLButtonElement | null>(null);
  const shareDialogRef = useRef<HTMLDialogElement | null>(null);
  const shareUrlRef = useRef<HTMLInputElement | null>(null);
  const zoomRef = useRef<ZoomState>({ x: 0, y: 0, k: 1 });
  const cullingZoomRef = useRef<ZoomState>({ x: 0, y: 0, k: 1 });
  const renderedZoomRef = useRef<ZoomState>({ x: 0, y: 0, k: 1 });
  const mapViewportSizeRef = useRef({ width: viewportWidth, height: viewportHeight });
  const pendingZoomFrameRef = useRef<number | null>(null);
  const zoomAnimationFrameRef = useRef<number | null>(null);
  const zoomAnimationTargetRef = useRef<ZoomState | null>(null);
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
  const touchPointersRef = useRef(new Map<number, SvgPoint>());
  const touchGestureRef = useRef<{
    start: [SvgPoint, SvgPoint];
    zoom: ZoomState;
  } | null>(null);
  const touchSequenceNavigatedRef = useRef(false);
  const touchDivideDraftRef = useRef<{
    line: SvgPoint[];
    cursor: SvgPoint | null;
    island: Position | null;
    piece: 0 | 1 | null;
    error: string;
    drawing: boolean;
    keyboardActive: boolean;
    keyboardCursor: SvgPoint | null;
  } | null>(null);
  const divideDrawRef = useRef<{ pointerId: number; moved: boolean } | null>(null);
  const divideTapRef = useRef<{ pointerId: number; x: number; y: number; moved: boolean } | null>(null);
  const keyboardCutFinishRef = useRef(false);
  const countryLabelLayoutCacheRef = useRef(new Map<string, FittedCountryLabel | null>());
  const countryUnderlayCacheRef = useRef(new Map<string, CountryUnderlay>());
  const countryUnderlaysInitializedRef = useRef(false);
  const baseProjectedRegionCacheRef = useRef(new Map<string, ProjectedPathData>());
  const baseRegionBoundsCacheRef = useRef(new Map<string, ProjectedBounds | null>());
  const baseProjectedRegionDetailStrokeCacheRef = useRef(new Map<string, string>());
  const metadataEditKeyRef = useRef<string | null>(null);
  const geometryWorkerRequestIdRef = useRef(0);
  const countryGeometryClientRef = useRef<CountryGeometryWorkerClient | null>(null);
  const mapChangeIdRef = useRef(0);

  const getCountryGeometryClient = useCallback(() => {
    countryGeometryClientRef.current ??= new CountryGeometryWorkerClient();
    return countryGeometryClientRef.current;
  }, []);

  useEffect(() => () => {
    countryGeometryClientRef.current?.dispose();
    countryGeometryClientRef.current = null;
  }, []);

  useEffect(() => {
    baseProjectedRegionCacheRef.current.clear();
    baseRegionBoundsCacheRef.current.clear();
    baseProjectedRegionDetailStrokeCacheRef.current.clear();
    countryUnderlayCacheRef.current.clear();
  }, []);

  useEffect(() => {
    const query = window.matchMedia(compactLayoutQuery);
    const update = () => setCompactLayout(query.matches);
    query.addEventListener("change", update);
    return () => query.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;
    const update = () => {
      // Use the visible area when a phone's keyboard covers the layout viewport.
      if (viewport.scale <= 1.01) {
        document.documentElement.style.setProperty("--app-height", `${viewport.height}px`);
        setKeyboardVisible(window.innerHeight - viewport.height > 120);
      }
    };
    update();
    viewport.addEventListener("resize", update);
    return () => {
      viewport.removeEventListener("resize", update);
      document.documentElement.style.removeProperty("--app-height");
    };
  }, []);

  useEffect(() => {
    if (!keyboardVisible) return;
    const focused = document.activeElement;
    if (!(focused instanceof HTMLElement)) return;
    if (focused.closest(".map-country-search")) {
      if (compactLayout) setMobilePanelExpanded(false);
      return;
    }
    if (!focused.closest(".hud-panel")) return;
    const frame = requestAnimationFrame(() => {
      const field = focused.closest(".field") ?? focused;
      field.scrollIntoView({ block: "start" });
    });
    return () => cancelAnimationFrame(frame);
  }, [keyboardVisible, compactLayout]);

  useEffect(() => {
    zoomRef.current = zoom;
  }, [zoom]);

  useEffect(() => {
    const svg = mapSvgRef.current;
    if (!svg) return;
    const stage = svg.closest(".map-stage");
    if (!stage) return;
    const observer = new ResizeObserver(([entry]) => {
      mapViewportSizeRef.current = { width: entry.contentRect.width, height: entry.contentRect.height };
      setMapViewportSize(mapViewportSizeRef.current);
      const scale = Math.min(entry.contentRect.width / viewportWidth, entry.contentRect.height / viewportHeight);
      if (scale > 0) {
        setMapViewScale(scale);
        setMapViewMeasured(true);
      }
    });
    observer.observe(stage);
    return () => observer.disconnect();
  }, [data]);

  useEffect(() => {
    const surface = mapSurfaceRef.current;
    if (!surface) return;
    // React's wheel listener is passive. Keep input on a fixed surface while the map moves.
    const preventPageScroll = (event: WheelEvent) => event.preventDefault();
    surface.addEventListener("wheel", preventPageScroll, { passive: false });
    return () => surface.removeEventListener("wheel", preventPageScroll);
  }, [data]);

  const applyZoomToDom = useCallback((nextZoom: ZoomState) => {
    const camera = mapCameraRef.current;
    if (camera) {
      const { width, height } = mapViewportSizeRef.current;
      const delta = cameraViewportTransform(nextZoom, renderedZoomRef.current, width, height);
      camera.style.transform = `translate3d(${delta.x}px, ${delta.y}px, 0) scale(${delta.k})`;
    }
    const { width, height } = mapViewportSizeRef.current;
    if (shouldRefreshCullingZoom(cullingZoomRef.current, nextZoom, viewportWidth, viewportHeight, pathCullingOverscanRatio, svgViewportBounds(width, height))) {
      cullingZoomRef.current = nextZoom;
      startTransition(() => setCullingZoom(nextZoom));
    }
  }, []);

  useLayoutEffect(() => {
    renderedZoomRef.current = cullingZoom;
    countryLabelsRef.current?.style.setProperty("--map-camera-scale", String(cullingZoom.k));
    for (const label of oceanLabelRefs.current) {
      label?.setAttribute("transform", `scale(${1 / cullingZoom.k})`);
    }
    applyZoomToDom(zoomRef.current);
  }, [applyZoomToDom, cullingZoom, mapViewScale, mapViewportSize]);

  useEffect(() => {
    applyZoomToDom(zoom);
  }, [applyZoomToDom, zoom]);

  useEffect(() => {
    return () => {
      if (pendingZoomFrameRef.current !== null) {
        window.cancelAnimationFrame(pendingZoomFrameRef.current);
      }
      if (zoomAnimationFrameRef.current !== null) {
        window.cancelAnimationFrame(zoomAnimationFrameRef.current);
      }
      if (mapMovingTimerRef.current !== null) {
        window.clearTimeout(mapMovingTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!transferConfirmation) return;
    const timer = window.setTimeout(() => setTransferConfirmation(null), 2200);
    return () => window.clearTimeout(timer);
  }, [transferConfirmation]);

  useEffect(() => {
    if (!share || isPresenting || !shareDialogRef.current || shareDialogRef.current.open) return;
    shareDialogRef.current.showModal();
    shareUrlRef.current?.focus();
  }, [isPresenting, share]);

  useEffect(() => {
    if (!isPresenting) return;
    const handlePresentationKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape" || event.defaultPrevented) return;
      event.preventDefault();
      setIsPresenting(false);
      presentationToggleRef.current?.focus();
    };
    window.addEventListener("keydown", handlePresentationKeyDown);
    return () => window.removeEventListener("keydown", handlePresentationKeyDown);
  }, [isPresenting]);

  useEffect(() => {
    const dismissActionsMenu = (event: PointerEvent) => {
      const menu = actionsMenuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    };
    document.addEventListener("pointerdown", dismissActionsMenu);
    return () => document.removeEventListener("pointerdown", dismissActionsMenu);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let clearPreloads: (() => void) | undefined;

    async function load() {
      try {
        const encoded = readShareFromHash(window.location.hash);
        const [response, decoded] = await Promise.all([
          fetch(`${import.meta.env.BASE_URL}data/map-data.packed.json`),
          encoded !== null ? decodeSharePayload(encoded) : null,
        ]);
        if (cancelled) return;
        if (!response.ok) {
          throw new Error(`${response.status} ${response.statusText}`);
        }
        const packedMapData: { renderPreparation?: unknown } = await response.json();
        const decodedMapData = await decodePackedMapDataInBatches(packedMapData, () => cancelled);
        if (!decodedMapData || cancelled) return;
        await yieldToMainThread();
        if (cancelled) return;
        const mapData = applyPoliticalMapPalette(decodedMapData);
        await yieldToMainThread();
        if (cancelled) return;
        let initial = createInitialSnapshot(mapData);
        let shouldReadOnly = false;

        if (encoded !== null) {
          if (decoded?.ok) {
            initial = applyScenarioPayload(mapData, decoded.payload);
            shouldReadOnly = !hashRequestsEdit(window.location.hash);
          } else if (decoded) {
            setLoadError(decoded.error);
          }
        }

        // Keep textures off the map-data download path. Their requests can
        // overlap geometry preparation once the map body is available.
        clearPreloads = preloadMapThemeAssets(getMapTheme(initial.mapTheme).id);
        const prepared = await prepareMapRendering(
          mapData,
          [[16, 18], [viewportWidth - 16, viewportHeight - 22]],
          mapRenderSimplifyTolerance,
          () => cancelled,
          packedMapData.renderPreparation,
        );
        if (!prepared || cancelled) return;

        if (!cancelled) {
          setPreparedMap(prepared);
          setHistory({ present: initial, past: [], future: [] });
          setReadOnly(shouldReadOnly);
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
      clearPreloads?.();
    };
  }, []);

  const snapshot = history?.present ?? null;
  const regionOwners = snapshot?.regionOwners;
  const mapTheme = getMapTheme(snapshot?.mapTheme);
  const detailedMapRaster = mapViewMeasured && mapViewScale * settledZoom.k * window.devicePixelRatio * viewportWidth > mapThemeRaster.overviewWidth;
  const storedEntities = snapshot?.entities;
  const entities = useMemo(
    () => data && storedEntities ? getThemedEntities(data, { entities: storedEntities, mapTheme: mapTheme.id }) : undefined,
    [data, storedEntities, mapTheme.id],
  );
  const regionNameOverrides = useMemo(() => snapshot?.regionNameOverrides ?? {}, [snapshot?.regionNameOverrides]);

  const customRegionRecords = useMemo(() => {
    return Object.values(snapshot?.customRegions ?? {});
  }, [snapshot?.customRegions]);

  const regionLandAdditions = useMemo(() => snapshot?.regionLandAdditions ?? {}, [snapshot?.regionLandAdditions]);

  const effectiveRegions = useMemo(() => {
    if (!data) return [];
    return [...data.regions, ...customRegionRecords]
      .map((region) => withRegionLandAddition(region, regionLandAdditions[region.id]));
  }, [customRegionRecords, data, regionLandAdditions]);

  const modifiedRegionRecords = useMemo(() => {
    const customIds = new Set(customRegionRecords.map((region) => region.id));
    return effectiveRegions.filter((region) => customIds.has(region.id) || Boolean(regionLandAdditions[region.id]));
  }, [customRegionRecords, effectiveRegions, regionLandAdditions]);

  useEffect(() => {
    if (!regionOwners || modifiedRegionRecords.length === 0) {
      setCustomBoundaries((current) => current.edges.length === 0 ? current : { edges: [], regionOwners: null });
      return;
    }
    // Custom edges must be clipped to the matching completed country shapes.
    // Starting with old underlays caused a second border adjustment later.
    if (countryRender.regionOwners !== regionOwners) return;

    let cancelled = false;
    const activeRegions = effectiveRegions.filter((region) => Boolean(regionOwners[region.id]));
    const modifiedOwners = new Set(modifiedRegionRecords.map((region) => regionOwners[region.id]));
    const worker = new Worker(new URL("./geometryWorker.ts", import.meta.url), { type: "module" });
    const requestId = geometryWorkerRequestIdRef.current + 1;
    geometryWorkerRequestIdRef.current = requestId;
    const handleMessage = (event: MessageEvent<GeometryWorkerResponse>) => {
      if (cancelled || event.data.id !== requestId || event.data.kind !== "custom-boundaries") return;
      setCustomBoundaries({ edges: event.data.edges, regionOwners });
    };
    const request: GeometryWorkerRequest = {
      id: requestId,
      kind: "custom-boundaries",
      activeRegions,
      customRegionIds: modifiedRegionRecords.map((region) => region.id),
      regionOwners,
      countryGeometries: Object.fromEntries(countryUnderlays
        .filter((underlay) => modifiedOwners.has(underlay.id))
        .map((underlay) => [underlay.id, underlay.geometry])),
    };
    worker.addEventListener("message", handleMessage);
    worker.postMessage(request);

    return () => {
      cancelled = true;
      worker.removeEventListener("message", handleMessage);
      worker.terminate();
    };
  }, [modifiedRegionRecords, effectiveRegions, regionOwners, countryUnderlays, countryRender.regionOwners]);

  const regionById = useMemo(() => {
    return new Map(effectiveRegions.map((region) => [region.id, region]));
  }, [effectiveRegions]);

  const renderRegionTopologyGeometryById = useMemo(() => {
    const geometries = new Map(preparedMap?.topologyGeometryById);
    for (const region of modifiedRegionRecords) {
      geometries.set(region.id, removePolygonalGeometryHoles(region.geometry));
    }
    return geometries;
  }, [modifiedRegionRecords, preparedMap]);

  const getRegionDisplayName = useCallback((regionId: string): string => {
    return regionNameOverrides[regionId] || regionById.get(regionId)?.name || regionId;
  }, [regionById, regionNameOverrides]);

  const baseEntityById = useMemo(() => {
    if (!data) return new Map();
    return new Map(data.countries.map((country) => [country.id, country]));
  }, [data]);

  const flagOptions = useMemo(() => makeFlagOptions(data?.countries ?? []), [data]);

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
    const geometries = new Map(preparedMap?.renderGeometryById);
    for (const region of modifiedRegionRecords) {
      geometries.set(region.id, renderRegionTopologyGeometryById.get(region.id) ?? region.geometry);
    }
    return geometries;
  }, [modifiedRegionRecords, preparedMap, renderRegionTopologyGeometryById]);

  useEffect(() => {
    countryUnderlayCacheRef.current.clear();
    countryLabelLayoutCacheRef.current.clear();
  }, [modifiedRegionRecords]);

  const renderBaseCountryByEntityId = useMemo(() => {
    if (!data) return new Map<string, { geometry: Geometry }>();
    return new Map(
      data.baseCountries.map((country) => [
        country.entityId,
        {
          geometry: country.geometry,
        },
      ]),
    );
  }, [data]);

  const graticuleGeometry = useMemo(() => geoGraticule().step([20, 20])(), []);
  const graticulePath = useMemo(
    () => data ? geoPath(projection)(graticuleGeometry) ?? "" : "",
    [data, graticuleGeometry, projection],
  );
  const projectedOceanLabels = useMemo(() => {
    if (!data) return [];
    return oceanLabels.flatMap((label) => {
      const point = projection(label.coordinates);
      return point ? [{ name: label.name, x: point[0], y: point[1] }] : [];
    });
  }, [data, projection]);

  useEffect(() => {
    baseProjectedRegionCacheRef.current.clear();
    baseRegionBoundsCacheRef.current.clear();
    baseProjectedRegionDetailStrokeCacheRef.current.clear();
  }, [data, projection, regionLandAdditions]);

  const customProjectedRegionById = useMemo(() => {
    const projectedRegions = new Map<string, ProjectedPathData>();
    for (const region of modifiedRegionRecords) {
      const geometry = renderRegionTopologyGeometryById.get(region.id) ?? region.geometry;
      const projected = projectGeometryToPathData(geometry, projection, getProjectedPathOptions());
      if (projected) {
        projectedRegions.set(region.id, projected);
      }
    }
    return projectedRegions;
  }, [modifiedRegionRecords, projection, renderRegionTopologyGeometryById]);

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

  const getBaseDetailedRegionStrokePath = useCallback((regionId: string) => {
    const cacheKey = `${projectedPathCacheVersion}|detail-stroke|${regionId}`;
    const cached = baseProjectedRegionDetailStrokeCacheRef.current.get(cacheKey);
    if (cached !== undefined) return cached;

    const geometry = renderRegionTopologyGeometryById.get(regionId);
    if (!geometry) return "";
    const projected = projectGeometryStrokeToPathData(geometry, projection, getProjectedPathOptions());
    const strokePath = projected?.strokePathData ?? projected?.pathData ?? "";
    baseProjectedRegionDetailStrokeCacheRef.current.set(cacheKey, strokePath);
    return strokePath;
  }, [projection, renderRegionTopologyGeometryById]);

  const getRegionPath = useCallback((regionId: string) => {
    return customProjectedRegionById.get(regionId)?.pathData ?? getBaseProjectedRegion(regionId)?.pathData ?? "";
  }, [customProjectedRegionById, getBaseProjectedRegion]);

  const getRegionStrokePath = useCallback((regionId: string, preferDetailedStroke = false) => {
    const projected = customProjectedRegionById.get(regionId) ?? getBaseProjectedRegion(regionId);
    if (preferDetailedStroke) {
      const detailedStrokePath = customProjectedRegionById.has(regionId)
        ? projected?.strokePathData
        : getBaseDetailedRegionStrokePath(regionId);
      if (detailedStrokePath) return detailedStrokePath;
    }
    return projected?.strokePathData ?? projected?.pathData ?? "";
  }, [customProjectedRegionById, getBaseDetailedRegionStrokePath, getBaseProjectedRegion]);

  const getRegionBounds = useCallback((regionId: string) => {
    const customBounds = customProjectedRegionById.get(regionId)?.bounds;
    if (customBounds) return customBounds;
    const cached = baseRegionBoundsCacheRef.current.get(regionId);
    if (cached !== undefined) return cached;
    const geometry = renderRegionGeometryById.get(regionId) ?? regionById.get(regionId)?.geometry;
    const bounds = geometry ? projectedGeometryBounds(geometry, projection) : null;
    baseRegionBoundsCacheRef.current.set(regionId, bounds);
    return bounds;
  }, [customProjectedRegionById, projection, regionById, renderRegionGeometryById]);

  useEffect(() => {
    let cancelled = false;
    void mapInBatches(
      [...(data?.boundaryEdges ?? []), ...customBoundaryEdges],
      (edge): ProjectedBoundaryEdgeWithBounds | null => {
        const projected = projectGeometryToPathData(edge.geometry, projection, getProjectedPathOptions());
        return projected ? {
          id: edge.id,
          regionIds: edge.regionIds,
          pathData: projected.strokePathData,
          bounds: projected.bounds,
        } : null;
      },
      () => cancelled,
    ).then((edges) => {
      if (!cancelled && edges) setProjectedBoundaries({
        edges: edges.filter((edge): edge is ProjectedBoundaryEdgeWithBounds => edge !== null),
        regionOwners: customBoundaries.regionOwners,
      });
    });
    return () => { cancelled = true; };
  }, [customBoundaryEdges, customBoundaries.regionOwners, data?.boundaryEdges, projection]);

  const logicalViewportBounds = useMemo(() => svgViewportBounds(mapViewportSize.width, mapViewportSize.height), [mapViewportSize]);

  const renderViewportBounds = useMemo(() => {
    return projectedViewportBounds({
      height: viewportHeight,
      overscanRatio: pathCullingOverscanRatio,
      width: viewportWidth,
      zoom: cullingZoom,
      viewport: logicalViewportBounds,
    });
  }, [cullingZoom, logicalViewportBounds]);

  const shouldCullMapPaths = shouldCullPaths({
    isMapMoving,
    minZoom: pathCullingMinZoom,
    zoomScale: cullingZoom.k,
  });

  const visibleRegions = useMemo(() => {
    if (!shouldCullMapPaths) return effectiveRegions;
    return effectiveRegions.filter((region) => {
      const bounds = getRegionBounds(region.id);
      return Boolean(bounds && boundsIntersect(bounds, renderViewportBounds));
    });
  }, [effectiveRegions, getRegionBounds, renderViewportBounds, shouldCullMapPaths]);

  const hitTestRegions = useMemo(() => effectiveRegions.map((region) => ({
    id: region.id,
    geometry: region.geometry,
    bounds: getRegionBounds(region.id),
  })), [effectiveRegions, getRegionBounds]);

  const findRegionAtMapPoint = useCallback((point: SvgPoint) => {
    return findRegionAtProjectedPoint(
      [point.x, point.y],
      hitTestRegions,
      (position) => projection([position[0], position[1]]),
      regionOwners ?? {},
    );
  }, [hitTestRegions, projection, regionOwners]);

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

  const entityOptions = useMemo(() => {
    if (!entities) return [];
    return activeEntityIds
      .map((entityId) => entities[entityId])
      .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [activeEntityIds, entities]);

  const selectedEntity = selectedEntityId ? entities?.[selectedEntityId] : undefined;
  const targetEntity = targetEntityId ? entities?.[targetEntityId] : undefined;
  const hasValidTransferTarget = Boolean(
    entities &&
    isValidTransferTarget({
      targetEntityId,
      selectedEntityId,
      entities,
    }),
  );
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
      const groupedRegionIds = getCompleteBaseCountryGroups(regionIds, baseEntityById, baseOwnerByRegionId);
      const consumedRegionIds = new Set<string>();
      const geometries: Geometry[] = [];

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
          ? renderRegionTopologyGeometryById.get(regionId) ?? regionById.get(regionId)?.geometry
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
    renderRegionTopologyGeometryById,
    regionIdsByEntityId,
  ]);

  useEffect(() => {
    if (!data) {
      setCountryRender({ underlays: [], regionOwners: null });
      countryUnderlaysInitializedRef.current = false;
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const geometryClient = getCountryGeometryClient();
    const updateDelay = countryUnderlaysInitializedRef.current ? countryUnderlayUpdateDelayMs : 0;
    const timeout = window.setTimeout(() => {
      void (async () => {
        if (cancelled) return;

        const activeCacheKeys = new Set<string>();
        const nextUnderlays: CountryUnderlay[] = [];
        const jobs = activeEntityIds.map((entityId) => {
          const regionIds = regionIdsByEntityId.get(entityId) ?? [];
          const hasOwnershipChanges = hasTransferredOwnershipChanges(entityId, regionIds, baseEntityById, baseOwnerByRegionId);
          return { entityId, regionIds, hasOwnershipChanges, needsWorker: !baseEntityById.has(entityId) || hasOwnershipChanges };
        }).sort((a, b) => Number(a.needsWorker) - Number(b.needsWorker));
        let publishedInitialUnderlays = false;

        let chunkDeadline = performance.now() + 8;
        for (const { entityId, regionIds, hasOwnershipChanges, needsWorker } of jobs) {
          // A large changed country must not delay the rest of a shared map.
          if (needsWorker && !publishedInitialUnderlays && !countryUnderlaysInitializedRef.current && nextUnderlays.length > 0) {
            setCountryRender({ underlays: [...nextUnderlays], regionOwners: null });
            publishedInitialUnderlays = true;
          }
          if (performance.now() >= chunkDeadline) {
            await yieldToMainThread();
            chunkDeadline = performance.now() + 8;
          }
          if (cancelled) return;
          const cacheKey = `${projectedPathCacheVersion}|${entityId}|${regionIds.join(",")}`;
          activeCacheKeys.add(cacheKey);
          const cached = countryUnderlayCacheRef.current.get(cacheKey);
          if (cached) {
            nextUnderlays.push(cached);
            continue;
          }

          const renderGeometries = renderGeometriesByEntityId.get(entityId) ?? [];
          if (!baseEntityById.has(entityId)) {
            const union = await geometryClient.unionOwned(renderGeometries, controller.signal);
            if (cancelled) return;
            const projected = union ? projectGeometryToPathData(union, projection, getProjectedPathOptions(false, true)) : null;
            if (union && projected) {
              const underlay = {
                id: entityId,
                geometry: union,
                pathData: projected.pathData,
                bounds: projected.bounds,
                sealInternalSeams: false,
              };
              countryUnderlayCacheRef.current.set(cacheKey, underlay);
              nextUnderlays.push(underlay);
            }
            continue;
          }

          const geometry = await (async () => {
            if (
              shouldUseStableBaseRenderGeometry(entityId, regionIds, baseEntityById, baseCountryByEntityId, baseGeometryUnionSensitiveEntityIds, regionOwners ?? {})
            ) {
              if (!hasOwnershipChanges) return baseCountryByEntityId.get(entityId)?.geometry;
              return geometryClient.stableBase({
                baseCountryByEntityId,
                baseEntityById,
                baseOwnerByRegionId,
                entityId,
                regionGeometryById: renderRegionTopologyGeometryById,
                regionIds,
                regionOwners: regionOwners ?? {},
                unionGapTolerance: acquiredRegionRenderGapTolerance,
              }, controller.signal);
            }

            if (renderGeometries.length <= 1) return renderGeometries[0];

            if (shouldSkipRenderGapClosing(entityId, regionIds, baseOwnerByRegionId)) {
              return geometryClient.union(renderGeometries, undefined, controller.signal);
            }
            return geometryClient.union(
              renderGeometries,
              ownsTransferredRegions(entityId, regionIds, baseOwnerByRegionId)
                ? acquiredRegionRenderGapTolerance
                : countryRenderGapTolerance,
              controller.signal,
            );
          })();

          if (cancelled) return;
          if (!geometry) continue;

          const displayGeometry = sliverProneBaseGeometryEntityIds.has(entityId)
            ? removeSmallPolygonalGeometryComponents(geometry, sliverComponentMinAreaRatio)
            : geometry;
          const renderGeometry = displayGeometry;
          const projected = projectGeometryToPathData(
            renderGeometry,
            projection,
            getProjectedPathOptions(false, entityId === "RUS"),
          );
          if (!projected) continue;
          const composedFill = hasOwnershipChanges && composedFillSensitiveEntityIds.has(entityId)
            ? combineProjectedPathData(
                (renderGeometriesByEntityId.get(entityId) ?? [])
                  .map((regionGeometry) =>
                    projectGeometryToPathData(
                      regionGeometry,
                      projection,
                      getProjectedPathOptions(false, true),
                    ),
                  ),
              )
            : null;

          const underlay = {
            id: entityId,
            geometry: renderGeometry,
            pathData: composedFill?.pathData ?? projected.pathData,
            bounds: projected.bounds,
            sealInternalSeams: Boolean(composedFill),
          };
          countryUnderlayCacheRef.current.set(cacheKey, underlay);
          nextUnderlays.push(underlay);
        }

        pruneMapCache(countryUnderlayCacheRef.current, activeCacheKeys, 420);
        if (!cancelled) {
          countryUnderlaysInitializedRef.current = true;
          setCountryRender({ underlays: nextUnderlays, regionOwners: regionOwners ?? null });
        }
      })().catch(() => {
        if (!cancelled) setLoadError("Could not update the map. Reload the page and try again.");
      });
    }, updateDelay);

    return () => {
      cancelled = true;
      controller.abort();
      window.clearTimeout(timeout);
    };
  }, [
    activeEntityIds,
    baseCountryByEntityId,
    baseEntityById,
    baseOwnerByRegionId,
    data,
    getCountryGeometryClient,
    projection,
    renderRegionTopologyGeometryById,
    regionIdsByEntityId,
    regionOwners,
    renderGeometriesByEntityId,
  ]);

  useEffect(() => {
    if (!data || !entities) {
      setCountryLabelLayouts([]);
      return;
    }

    let cancelled = false;
    const controller = new AbortController();
    const geometryClient = getCountryGeometryClient();
    const activeCacheKeys = new Set<string>();
    const labels: FittedCountryLabel[] = [];
    const modifiedRegionIds = new Set(modifiedRegionRecords.map((region) => region.id));
    const entityMap = entities;
    const entityIds = [...activeEntityIds].sort((a, b) => {
      const regionCountDifference = (regionIdsByEntityId.get(b)?.length ?? 0) - (regionIdsByEntityId.get(a)?.length ?? 0);
      if (regionCountDifference !== 0) return regionCountDifference;
      return (entityMap[b]?.name ?? b).localeCompare(entityMap[a]?.name ?? a);
    });
    let index = 0;

    function sortedLabels() {
      return [...labels].sort((a, b) => {
        if (a.priority !== b.priority) return a.priority - b.priority;
        return a.id.localeCompare(b.id);
      });
    }

    function flushLabels() {
      pruneMapCache(countryLabelLayoutCacheRef.current, activeCacheKeys, 680);
      if (!cancelled) {
        setCountryLabelLayouts(sortedLabels());
      }
    }

    function work() {
      void (async () => {
        let layoutCountryLabelFn: typeof import("./labelLayout").layoutCountryLabel | undefined;
        await yieldToMainThread();
        if (cancelled) return;

        let chunkDeadline = performance.now() + 7;

        while (index < entityIds.length) {
          // Nested timers are throttled in background tabs. Message tasks keep
          // this pass responsive without adding a delay to each label batch.
          if (performance.now() >= chunkDeadline) {
            await yieldToMainThread();
            chunkDeadline = performance.now() + 7;
          }
          if (cancelled) return;
          const entityId = entityIds[index];
          index += 1;
          const entity = entityMap[entityId];
          if (!entity) continue;
          const regionIds = regionIdsByEntityId.get(entity.id) ?? [];
          const cacheKey = getCountryLabelCacheKey(entity.id, entity.name, regionIds);
          activeCacheKeys.add(cacheKey);
          const cached = countryLabelLayoutCacheRef.current.get(cacheKey);
          if (cached !== undefined) {
            if (cached) labels.push(cached);
            continue;
          }

          const baseCountry = baseCountryByEntityId.get(entity.id);
          const baseEntity = baseEntityById.get(entity.id);
          const hasBaseOwnership = baseEntity && !hasTransferredOwnershipChanges(
            entity.id, regionIds, baseEntityById, baseOwnerByRegionId,
          );
          // The shipped layouts use the same base geometry and projection.
          // Changed countries still run the normal fitting code below.
          if (hasBaseOwnership && entity.name === baseEntity.name
            && !regionIds.some((id) => modifiedRegionIds.has(id)) && preparedMap?.baseCountryLabels.has(entity.id)) {
            const preparedLabel = preparedMap.baseCountryLabels.get(entity.id) ?? null;
            countryLabelLayoutCacheRef.current.set(cacheKey, preparedLabel);
            if (preparedLabel) labels.push(preparedLabel);
            continue;
          }
          let geometries: Geometry[];
          if (baseCountry && hasBaseOwnership) {
            geometries = [baseCountry.geometry];
          } else if (!baseCountry || !baseEntityById.has(entity.id)) {
            geometries = renderGeometriesByEntityId.get(entity.id) ?? [];
          } else {
            if (cancelled) return;
            geometries = await geometryClient.labelGeometry({
              baseCountryByEntityId,
              baseEntityById,
              baseOwnerByRegionId,
              entityId: entity.id,
              fallbackGeometries: renderGeometriesByEntityId.get(entity.id) ?? [],
              regionById,
              regionIds,
              unionGapTolerance: acquiredRegionRenderGapTolerance,
            }, controller.signal);
          }
          if (cancelled) return;
          if (geometries.length === 0) continue;

          layoutCountryLabelFn ??= (await import("./labelLayout")).layoutCountryLabel;
          if (cancelled) return;
          const label = layoutCountryLabelFn({
            id: entity.id,
            name: entity.name,
            geometries,
            project: (position) => projection([position[0], position[1]]),
          });
          countryLabelLayoutCacheRef.current.set(cacheKey, label);
          if (label) labels.push(label);
        }

        if (cancelled) return;
        flushLabels();
      })().catch(() => {
        if (!cancelled) setLoadError("Could not update the map labels. Reload the page and try again.");
      });
    }

    work();

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [
    activeEntityIds,
    baseCountryByEntityId,
    baseEntityById,
    baseOwnerByRegionId,
    data,
    entities,
    getCountryGeometryClient,
    modifiedRegionRecords,
    preparedMap,
    projection,
    regionById,
    regionIdsByEntityId,
    renderGeometriesByEntityId,
  ]);

  const countryLabels = useMemo(() => {
    const displayScale = settledZoom.k;
    const minScreenFontSize = getCountryLabelMinScreenFontSize(countryLabelMinScreenFontSize, displayScale);
    const rawLabels = countryLabelLayouts.filter((label) => label.fontSize * displayScale >= minScreenFontSize);

    return filterLabels(rawLabels, settledZoom, {
      maxLabels: displayScale < 1.8 ? 44 : displayScale < 4 ? 120 : 240,
      minGap: displayScale < 2.2 ? 5 : displayScale < 4 ? 1.5 : 0,
      viewportBounds: logicalViewportBounds,
      getSortText: (label) => label.displayName,
      getBoxSize: (label) => getCountryLabelBoxSize(label, displayScale, mapViewScale),
    });
  }, [countryLabelLayouts, logicalViewportBounds, mapViewScale, settledZoom]);

  const regionLabels = useMemo<SimpleMapLabel[]>(() => {
    if (!regionOwners) return [];
    if (!activeModeUsesRegions) return [];
    if (isMapMoving) return [];
    if (zoom.k < 1.55 && selectedRegions.size === 0) return [];

    const selectedOwnerIds = new Set(
      [...selectedRegions].map((regionId) => regionOwners[regionId]).filter(Boolean),
    );
    const shouldShowAllVisible = zoom.k >= 5.5;

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
      minGap: 4 / mapViewScale,
      viewportBounds: logicalViewportBounds,
      reservedBoxes: countryLabels.map((label) => getLabelBox(label, zoom, getCountryLabelBoxSize(label, zoom.k, mapViewScale))),
      getSortText: (label) => label.name,
      getBoxSize: (label) => ({
        width: Math.max(18, label.name.length * regionLabelScreenFontSize * 0.6) / mapViewScale,
        height: (regionLabelScreenFontSize + 3) / mapViewScale,
      }),
    });
  }, [
    activeModeUsesRegions,
    countryLabels,
    getRegionBounds,
    logicalViewportBounds,
    mapViewScale,
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
  const inspectFocusedRegionRow = inspectFocusedRegion
    ? {
        id: inspectFocusedRegion.id,
        displayName: getRegionDisplayName(inspectFocusedRegion.id),
        type: inspectFocusedRegion.type,
      }
    : undefined;

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

    const selectedRegionIds = [...selectedRegions];
    const regionAdjacency = buildSelectedRegionAdjacency(
      [...(data?.boundaryEdges ?? []), ...customBoundaryEdges],
      selectedRegionIds,
    );
    setNeighborTargetEntityIds(getNeighborTargetEntityIds({
      selectedRegionIds,
      selectedEntityId,
      regionAdjacency,
      regionOwners,
    }));
  }, [customBoundaryEdges, data?.boundaryEdges, mode, regionOwners, selectedEntityId, selectedRegions]);

  const mergeSelectedEntities = useMemo(() => {
    if (!entities) return [];
    return [...mergeSelection]
      .map((entityId) => entities[entityId])
      .filter((entity): entity is NonNullable<typeof entity> => Boolean(entity))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [entities, mergeSelection]);

  const mergeAvailableOptions = useMemo(
    () => entityOptions.filter((entity) => !mergeSelection.has(entity.id)),
    [entityOptions, mergeSelection],
  );

  const transferTargetGroups = useMemo(() => {
    return orderTransferTargetEntities({
      entityOptions,
      selectedEntityId,
      neighborEntityIds: selectedRegions.size > 0 ? neighborTargetEntityIds : new Set(),
    });
  }, [entityOptions, neighborTargetEntityIds, selectedEntityId, selectedRegions.size]);

  const transferTargetOptions = useMemo(() => {
    return [
      ...transferTargetGroups.neighborTargets.map((entity) => ({ ...entity, meta: "Neighbor" })),
      ...transferTargetGroups.otherTargets,
    ];
  }, [transferTargetGroups]);

  const useLowZoomTransferCountryLayer =
    mode === "transfer" && settledZoom.k < simplifiedCountryLayerMaxZoom;

  const addRegionByBrush = useCallback((regionId: string) => {
    if (!snapshot || readOnly || isPresenting || !brushEnabled || !isBrushDown || !activeModeUsesRegions) return;
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
    isPresenting,
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

  useEffect(() => {
    if (
      mode !== "divide" ||
      isDrawingDivideLine ||
      (!divideIslandPoint && divideLineCoordinates.length < 2)
    ) {
      setDivideWorkerResult(emptyDivideWorkerResult);
      setDivideIsCalculating(false);
      return;
    }

    let cancelled = false;
    const worker = new Worker(new URL("./geometryWorker.ts", import.meta.url), { type: "module" });
    const requestId = geometryWorkerRequestIdRef.current + 1;
    geometryWorkerRequestIdRef.current = requestId;
    setDivideWorkerResult(emptyDivideWorkerResult);
    setDivideIsCalculating(true);
    const handleMessage = (event: MessageEvent<GeometryWorkerResponse>) => {
      if (cancelled || event.data.id !== requestId || event.data.kind !== "divide") return;
      setDivideWorkerResult(event.data.result);
      setDivideIsCalculating(false);
    };
    const request: GeometryWorkerRequest = {
      id: requestId,
      kind: "divide",
      regions: selectedEntitySplitRegions,
      subdivisions: selectedEntityRegions,
      cutLine: divideLineCoordinates,
      islandPoint: divideIslandPoint,
      regionLandAdditions,
    };
    worker.addEventListener("message", handleMessage);
    worker.postMessage(request);

    return () => {
      cancelled = true;
      worker.removeEventListener("message", handleMessage);
      worker.terminate();
    };
  }, [
    divideIslandPoint,
    divideLineCoordinates,
    isDrawingDivideLine,
    mode,
    selectedEntitySplitRegions,
    selectedEntityRegions,
    regionLandAdditions,
  ]);

  const divideSplit = divideWorkerResult.split;
  const activeDivideNewPieceIndex =
    divideSplit.ok ? divideNewPieceIndex ?? divideSplit.defaultNewPieceIndex : null;
  const divideTerritories =
    divideSplit.ok && activeDivideNewPieceIndex !== null
      ? divideWorkerResult.territories?.[activeDivideNewPieceIndex] ?? null
      : null;
  const divideExistingPath = useMemo(() => divideTerritories
    ? geometryToSvgPath(divideTerritories.existingGeometry, projection, getProjectedPathOptions())
    : "", [divideTerritories, projection]);
  const divideNewPath = useMemo(() => divideTerritories
    ? geometryToSvgPath(divideTerritories.newGeometry, projection, getProjectedPathOptions())
    : "", [divideTerritories, projection]);
  const visibleDividePaths = useMemo(() => ({
    existing: clipMapThemePolygonPath(divideExistingPath, shouldCullMapPaths ? renderViewportBounds : undefined),
    new: clipMapThemePolygonPath(divideNewPath, shouldCullMapPaths ? renderViewportBounds : undefined),
  }), [divideExistingPath, divideNewPath, renderViewportBounds, shouldCullMapPaths]);
  const visibleMapChangePieces = useMemo(() => mapChange?.pieces.map((piece) => ({
    ...piece,
    path: clipMapThemePolygonPath(piece.path, shouldCullMapPaths ? renderViewportBounds : undefined),
  })) ?? [], [mapChange, renderViewportBounds, shouldCullMapPaths]);
  const visibleMapChangeBackground = useMemo(() => mapChange?.backgroundPieces.map((piece) => ({
    ...piece,
    path: clipMapThemePolygonPath(piece.path, shouldCullMapPaths ? renderViewportBounds : undefined),
  })) ?? [], [mapChange, renderViewportBounds, shouldCullMapPaths]);
  const mapChangeGeometryReady = countryRender.regionOwners === regionOwners &&
    (modifiedRegionRecords.length === 0 || projectedBoundaries.regionOwners === regionOwners);
  useEffect(() => {
    if (!mapChange?.sweepComplete || mapChange.settling || !mapChangeGeometryReady) return;
    setMapChange((current) => current?.id === mapChange.id ? { ...current, settling: true } : current);
  }, [mapChange, mapChangeGeometryReady]);

  const finishMapChangeSweep = useCallback((id: number) => {
    setMapChange((current) => current?.id === id && !current.sweepComplete ? { ...current, sweepComplete: true } : current);
  }, []);

  const finishMapChange = useCallback((id: number) => {
    setMapChange((current) => current?.id === id ? null : current);
  }, []);
  const divideLinePath = svgLineToPath(
    keyboardCutActive && keyboardCutCursor && divideLine.length > 0
      ? [...divideLine, keyboardCutCursor]
      : divideMethod === "line" && isDrawingDivideLine && divideCursor && divideLine.length === 1
        ? [...divideLine, divideCursor]
      : divideLine,
  );
  const divideAwaitingEnd = divideMethod === "line" && isDrawingDivideLine && !keyboardCutActive;
  const visibleDivideError = divideError || (!divideSplit.ok ? divideSplit.reason : "");
  const divideMapHint = keyboardCutActive
    ? "Place border points with the arrow keys and Enter."
    : divideIsCalculating
      ? "Checking your new border..."
      : divideTerritories
        ? "Choose which side becomes the new country."
        : divideMethod === "island"
          ? "Select an island to make it a country."
          : divideMethod === "draw"
            ? "Draw a line across the country, with both ends outside."
            : divideAwaitingEnd
              ? "Place the second point outside the opposite edge."
              : "Place the first point just outside the country.";
  useEffect(() => {
    if (!keyboardCutFinishRef.current || (!divideSplit.ok && !divideSplit.reason)) return;
    keyboardCutFinishRef.current = false;
    if (divideSplit.ok) {
      document.getElementById("divide-country-name")?.focus();
    } else {
      focusKeyboardCutStart();
    }
  }, [divideSplit]);
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

    if (targetEntityId && targetEntityId === selectedEntityId) {
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

  function commit(
    mutator: (draft: EditorSnapshot) => EditorSnapshot | void,
    options: { preserveGeometryCaches?: boolean } = {},
  ) {
    if (!history || readOnly) return;
    finishMetadataEdit();
    const draft = cloneSnapshot(history.present);
    const result = mutator(draft) ?? draft;
    const next = updateEntityRegions(result);
    if (!options.preserveGeometryCaches) {
      clearGeometryRenderCaches();
    }
    setShare(null);
    setHistory({
      present: next,
      past: [...history.past, history.present].slice(-80),
      future: [],
    });
  }

  function commitMetadata(editKey: string, mutator: (current: EditorSnapshot) => EditorSnapshot) {
    if (readOnly) return;
    const continuesCurrentEdit = metadataEditKeyRef.current === editKey;
    metadataEditKeyRef.current = editKey;
    setShare(null);
    setHistory((currentHistory) => {
      if (!currentHistory) return currentHistory;
      const next = mutator(currentHistory.present);
      if (next === currentHistory.present) return currentHistory;
      return {
        present: next,
        past: continuesCurrentEdit
          ? currentHistory.past
          : [...currentHistory.past, currentHistory.present].slice(-80),
        future: [],
      };
    });
  }

  function finishMetadataEdit() {
    metadataEditKeyRef.current = null;
  }

  function changeMapTheme(theme: MapThemeId) {
    if (theme === mapTheme.id) return;
    finishMetadataEdit();
    setMapChange(null);
    setShare(null);
    setHistory((current) => {
      if (!current) return current;
      const present = setMapTheme(current.present, theme);
      if (present === current.present) return current;
      // A shared-map viewer can change the display without entering edit mode.
      return {
        present,
        past: readOnly ? current.past : [...current.past, current.present].slice(-80),
        future: [],
      };
    });
  }

  function showMapChange(
    pieces: MapChangeAnimation["pieces"],
    reveal: MapChangeAnimation["reveal"],
    bounds: ProjectedBounds,
  ) {
    if (!pieces.some((piece) => piece.path)) return;
    const id = ++mapChangeIdRef.current;
    setMapChange((previous) => createMapChange({
      id,
      pieces,
      reveal,
      bounds,
      previousRegionOwners: regionOwners ?? {},
    }, previous));
  }

  function togglePresentation() {
    finishMetadataEdit();
    setMapChange(null);
    setIsBrushDown(false);
    setIsDrawingDivideLine(false);
    divideDrawRef.current = null;
    keyboardCutFinishRef.current = false;
    panRef.current = null;
    setShare(null);
    setIsPresenting((current) => !current);
  }

  function updateScenarioTitle(title: string) {
    commitMetadata("scenario-title", (current) => {
      if (current.title === title) return current;
      return { ...current, title };
    });
  }

  function undo() {
    if (!history || readOnly || history.past.length === 0) return;
    const previous = history.past[history.past.length - 1];
    clearHistoryTransientState();
    setHistory({
      present: previous,
      past: history.past.slice(0, -1),
      future: [history.present, ...history.future],
    });
  }

  function redo() {
    if (!history || readOnly || history.future.length === 0) return;
    const next = history.future[0];
    clearHistoryTransientState();
    setHistory({
      present: next,
      past: [...history.past, history.present],
      future: history.future.slice(1),
    });
  }

  function resetMap() {
    if (!data || !history || readOnly) return;
    const initial = createInitialSnapshot(data);
    clearHistoryTransientState();
    setHistory({
      present: initial,
      past: [...history.past, history.present],
      future: [],
    });
    setSelectedRegions(new Set());
    setTransferFocusedRegionId("");
    setMergeSelection(new Set());
    setTargetEntityId("");
  }

  function selectMode(nextMode: EditMode) {
    setMobilePanelExpanded(true);
    setMapNavigationEnabled(false);
    if (nextMode === mode) return;
    finishMetadataEdit();
    setMode(nextMode);
    setSelectedRegions(new Set());
    setTransferFocusedRegionId("");
    setMergeSelection(new Set());
    setIsBrushDown(false);
    setBrushEnabled(false);
    setShare(null);
    clearDivideDraft();
  }

  function clearMapSelection() {
    finishMetadataEdit();
    setSelectedEntityId("");
    setTargetEntityId("");
    setSelectedRegions(new Set());
    setTransferFocusedRegionId("");
    setMergeSelection(new Set());
    setIsBrushDown(false);
    setMergeName("");
    clearDivideDraft();
  }

  function clearHistoryTransientState() {
    finishMetadataEdit();
    setMapChange(null);
    setTransferConfirmation(null);
    setShare(null);
    setIsBrushDown(false);
    clearGeometryRenderCaches();
    clearDivideDraft();
  }

  function clearGeometryRenderCaches(affectedEntities?: ReadonlySet<string>) {
    if (affectedEntities) {
      for (const [key, underlay] of countryUnderlayCacheRef.current) {
        if (affectedEntities.has(underlay.id)) countryUnderlayCacheRef.current.delete(key);
      }
      for (const [key, label] of countryLabelLayoutCacheRef.current) {
        if (!label || affectedEntities.has(label.id)) countryLabelLayoutCacheRef.current.delete(key);
      }
      return;
    }
    countryUnderlayCacheRef.current.clear();
    countryLabelLayoutCacheRef.current.clear();
  }

  function clearDivideDraft() {
    keyboardCutFinishRef.current = false;
    setDivideLine([]);
    setDivideCursor(null);
    divideTapRef.current = null;
    divideDrawRef.current = null;
    setKeyboardCutActive(false);
    setKeyboardCutCursor(null);
    setDivideIslandPoint(null);
    setDivideNewPieceIndex(null);
    setDivideError("");
    setIsDrawingDivideLine(false);
    setDivideWorkerResult(emptyDivideWorkerResult);
    setDivideIsCalculating(false);
  }

  function changeDivideMethod(nextMethod: DivideMethod) {
    clearDivideDraft();
    setDivideMethod(nextMethod);
    setMapNavigationEnabled(false);
  }

  function changeSelectedEntity(entityId: string) {
    finishMetadataEdit();
    setSelectedEntityId(entityId);
    setInspectFocusedRegionId("");
    setSelectedRegions(new Set());
    setTransferFocusedRegionId("");
    setTargetEntityId("");
    setMergeSelection(new Set());
    clearDivideDraft();
    if (entityId) {
      setMobilePanelExpanded(true);
      zoomToEntity(entityId);
    }
  }

  function applyZoom(nextZoom: ZoomState) {
    zoomRef.current = nextZoom;
    applyZoomToDom(nextZoom);
    setZoom(nextZoom);
    setSettledZoom(nextZoom);
    cullingZoomRef.current = nextZoom;
    setCullingZoom(nextZoom);
  }

  function cancelZoomAnimation() {
    zoomAnimationTargetRef.current = null;
    if (zoomAnimationFrameRef.current === null) return;
    window.cancelAnimationFrame(zoomAnimationFrameRef.current);
    zoomAnimationFrameRef.current = null;
  }

  function animateZoomTo(nextZoom: ZoomState, duration = 380) {
    cancelZoomAnimation();
    flushZoomFrame();
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      applyZoom(nextZoom);
      settleMapMoving(0);
      return;
    }

    const startZoom = { ...zoomRef.current };
    zoomAnimationTargetRef.current = nextZoom;
    const startTime = window.performance.now();
    markMapMoving();

    const step = (time: number) => {
      const progress = Math.min(1, (time - startTime) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      const frameZoom = interpolateZoom(startZoom, nextZoom, eased);
      zoomRef.current = frameZoom;
      applyZoomToDom(frameZoom);

      if (progress < 1) {
        zoomAnimationFrameRef.current = window.requestAnimationFrame(step);
        return;
      }

      zoomAnimationFrameRef.current = null;
      zoomAnimationTargetRef.current = null;
      zoomRef.current = nextZoom;
      applyZoomToDom(nextZoom);
      settleMapMoving(0);
    };

    zoomAnimationFrameRef.current = window.requestAnimationFrame(step);
  }

  function zoomBy(factor: number) {
    const current = zoomAnimationTargetRef.current ?? zoomRef.current;
    animateZoomTo(zoomAroundPoint(current, { x: viewportWidth / 2, y: viewportHeight / 2 }, factor), 220);
  }

  function resetMapView() {
    animateZoomTo({ x: 0, y: 0, k: 1 });
  }

  function zoomToRegion(regionId: string) {
    const region = regionById.get(regionId);
    if (!region) return;
    const bounds = projectedGeometryBounds(region.geometry, projection);
    if (!bounds) return;
    animateZoomTo(zoomToBounds(bounds, 54, editorMapBounds()));
  }

  function zoomToEntity(entityId: string) {
    if (!entityId) return;
    const geometries = renderGeometriesByEntityId.get(entityId) ?? [];
    const bounds = projectedGeometriesBounds(geometries, projection);
    if (!bounds) return;
    animateZoomTo(zoomToBounds(bounds, 44, editorMapBounds()));
  }

  function editorMapBounds(): ProjectedBounds | undefined {
    if (compactLayout || isPresenting) return undefined;
    const size = mapViewportSizeRef.current;
    const scale = Math.min(size.width / viewportWidth, size.height / viewportHeight);
    if (scale <= 0) return undefined;
    const bounds = svgViewportBounds(size.width, size.height);
    const panelWidth = document.querySelector(".hud-panel")?.getBoundingClientRect().width ?? 326;
    return { ...bounds, minY: bounds.minY + 32 / scale, maxY: bounds.maxY - 48 / scale, maxX: bounds.maxX - (panelWidth + 48) / scale };
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
    commitMetadata(`region-name:${inspectFocusedRegionId}`, (current) =>
      renameRegion(current, inspectFocusedRegionId, name),
    );
  }

  function separateRegion(regionId: string) {
    if (!snapshot || !history || !regionId || readOnly) return;
    finishMetadataEdit();
    const regionName = getRegionDisplayName(regionId);
    const result = separateRegionAsCountry(
      snapshot,
      regionId,
      regionName,
      getFallbackCountryColor(regionName),
    );
    if (!result) return;

    const bounds = getRegionBounds(regionId);
    if (bounds) {
      showMapChange([{
        path: getRegionPath(regionId),
        fromColor: entities?.[regionOwners?.[regionId] ?? ""]?.color ?? "#d7d2c8",
        toColor: result.snapshot.entities[result.entityId].color,
      }], {
        kind: "point",
        x: (bounds.minX + bounds.maxX) / 2,
        y: (bounds.minY + bounds.maxY) / 2,
        extent: Math.hypot(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) + 4,
      }, bounds);
    }

    setShare(null);
    clearGeometryRenderCaches();
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
    setTransferConfirmation({ id: Date.now(), message: `${regionName} is now a country` });
  }

  function handleRegionClick(regionId: string) {
    if (!snapshot) return;
    if (mode === "inspect" || readOnly) setMobilePanelExpanded(true);
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
      setTargetEntityId("");
      setSelectedRegions(new Set([regionId]));
      setTransferFocusedRegionId(regionId);
      return;
    }

    setTransferFocusedRegionId(selectedRegions.has(regionId) ? "" : regionId);
    toggleRegion(regionId);
  }

  function handleEntityClick(entityId: string) {
    if (mode === "inspect" || readOnly) setMobilePanelExpanded(true);
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
      setTargetEntityId("");
      setSelectedRegions(new Set());
      setTransferFocusedRegionId("");
    }
  }

  function selectAllTransferRegions() {
    if (readOnly || selectedEntityRegionIds.length === 0) return;
    setSelectedRegions(new Set(selectedEntityRegionIds));
    setTransferFocusedRegionId(selectedEntityRegionIds[0] ?? "");
  }

  function clearTransferSelection() {
    setSelectedRegions(new Set());
    setTransferFocusedRegionId("");
    setTargetEntityId("");
    setIsBrushDown(false);
  }

  function toggleTransferRegion(regionId: string) {
    if (readOnly || !selectedEntityRegionIds.includes(regionId)) return;
    setSelectedRegions((current) => {
      const next = new Set(current);
      if (next.has(regionId)) next.delete(regionId);
      else next.add(regionId);
      return next;
    });
    setTransferFocusedRegionId(regionId);
    zoomToRegion(regionId);
  }

  function startKeyboardCut() {
    if (readOnly || mode !== "divide" || !selectedEntityId) return;
    clearDivideDraft();
    const currentZoom = zoomRef.current;
    setKeyboardCutCursor({
      x: (viewportWidth / 2 - currentZoom.x) / currentZoom.k,
      y: (viewportHeight / 2 - currentZoom.y) / currentZoom.k,
    });
    setKeyboardCutActive(true);
    setIsDrawingDivideLine(true);
    window.requestAnimationFrame(() => mapSvgRef.current?.focus());
  }

  function finishKeyboardCut() {
    if (!keyboardCutActive || divideLine.length < 2) return;
    keyboardCutFinishRef.current = true;
    setKeyboardCutActive(false);
    setKeyboardCutCursor(null);
    setIsDrawingDivideLine(false);
    window.requestAnimationFrame(focusKeyboardCutStart);
  }

  function cancelKeyboardCut() {
    clearDivideDraft();
    window.requestAnimationFrame(focusKeyboardCutStart);
  }

  function handleMapKeyDown(event: React.KeyboardEvent<SVGSVGElement>) {
    if (!keyboardCutActive && mode === "divide" && event.key === "Escape") {
      event.preventDefault();
      clearDivideDraft();
      return;
    }
    if (!keyboardCutActive || !keyboardCutCursor) return;
    if (event.key.startsWith("Arrow")) {
      event.preventDefault();
      const svg = mapSvgRef.current;
      const viewScale = svg
        ? Math.min(svg.clientWidth / viewportWidth, svg.clientHeight / viewportHeight)
        : 1;
      const currentZoom = zoomRef.current;
      const step = (event.shiftKey ? 32 : 10) / Math.max(viewScale * currentZoom.k, 0.01);
      const dx = event.key === "ArrowLeft" ? -step : event.key === "ArrowRight" ? step : 0;
      const dy = event.key === "ArrowUp" ? -step : event.key === "ArrowDown" ? step : 0;
      const { width, height } = mapViewportSizeRef.current;
      const viewport = svgViewportBounds(width, height);
      const minX = (viewport.minX - currentZoom.x) / currentZoom.k;
      const maxX = (viewport.maxX - currentZoom.x) / currentZoom.k;
      const minY = (viewport.minY - currentZoom.y) / currentZoom.k;
      const maxY = (viewport.maxY - currentZoom.y) / currentZoom.k;
      setKeyboardCutCursor({
        x: clamp(keyboardCutCursor.x + dx, minX, maxX),
        y: clamp(keyboardCutCursor.y + dy, minY, maxY),
      });
      return;
    }
    if (event.key === "Enter") {
      event.preventDefault();
      setDivideLine((current) => [...current, keyboardCutCursor]);
      return;
    }
    if (event.key === "Backspace") {
      event.preventDefault();
      setDivideLine((current) => current.slice(0, -1));
      return;
    }
    if (event.key.toLowerCase() === "f") {
      event.preventDefault();
      finishKeyboardCut();
      return;
    }
    if (event.key === "Escape") {
      event.preventDefault();
      cancelKeyboardCut();
    }
  }

  function swapDivideSides() {
    setDivideNewPieceIndex((current) => {
      const active = current ?? (divideSplit.ok ? divideSplit.defaultNewPieceIndex : 0);
      return active === 0 ? 1 : 0;
    });
  }

  function handleDivideMapTap(point: SvgPoint) {
    if (divideIsCalculating) return;
    if (divideSplit.ok) {
      const pieceId = findRegionAtProjectedPoint(
        [point.x, point.y],
        divideSplit.pieces.map((piece, index) => ({
          id: String(index),
          geometry: piece.geometry,
          bounds: projectedGeometryBounds(piece.geometry, projection),
        })),
        (position) => projection(position as [number, number]),
      );
      if (pieceId !== null) setDivideNewPieceIndex(Number(pieceId) as 0 | 1);
      return;
    }
    if (divideMethod === "island") {
      const position = projection.invert?.([point.x, point.y]);
      clearDivideDraft();
      if (position && Number.isFinite(position[0]) && Number.isFinite(position[1])) {
        setDivideIslandPoint(position);
      }
      return;
    }
    if (divideAwaitingEnd && divideLine[0]) {
      const start = divideLine[0];
      if (Math.hypot(point.x - start.x, point.y - start.y) * zoomRef.current.k * mapViewScale < 8) {
        setDivideError("Place the second point farther from the first point.");
        return;
      }
      setDivideLine([start, point]);
      setDivideCursor(null);
      setDivideError("");
      setIsDrawingDivideLine(false);
    } else {
      clearDivideDraft();
      setDivideLine([point]);
      setDivideCursor(point);
      setIsDrawingDivideLine(true);
    }
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

  function addMergeCountry(entityId: string) {
    if (!snapshot || !snapshot.entities[entityId] || readOnly) return;
    const selection = new Set(mergeSelection).add(entityId);
    const geometries = [...selection].flatMap((id) => renderGeometriesByEntityId.get(id) ?? []);
    const bounds = projectedGeometriesBounds(geometries, projection);
    if (bounds) animateZoomTo(zoomToBounds(bounds, 44));
    setMergeSelection((current) => {
      if (current.has(entityId)) return current;
      const next = new Set(current).add(entityId);
      setMergeName(makeDefaultMergeName(snapshot, next));
      return next;
    });
    setSelectedEntityId(entityId);
  }

  function clearMergeSelection() {
    setMergeSelection(new Set());
    setMergeName("");
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
    if (!snapshot || !entities || !hasValidTransferTarget || selectedRegions.size === 0 || readOnly) return;
    finishMetadataEdit();
    const regionIds = [...selectedRegions];
    const nextSelectedEntityId = targetEntityId;
    const destinationName = entities[nextSelectedEntityId]?.name ?? nextSelectedEntityId;
    const regionBounds = regionIds.reduce<ProjectedBounds | null>((combined, regionId) => {
      const bounds = getRegionBounds(regionId);
      return bounds ? mergeBounds(combined, bounds) : combined;
    }, null);
    if (regionBounds) {
      const destinationBounds = projectedGeometriesBounds(
        renderGeometriesByEntityId.get(nextSelectedEntityId) ?? [],
        projection,
      );
      const reveal = getTransferReveal(
        regionIds,
        nextSelectedEntityId,
        regionOwners ?? {},
        projectedBoundaryEdges,
        regionBounds,
        destinationBounds,
      );
      showMapChange(regionIds.map((regionId) => ({
        path: getRegionPath(regionId),
        fromColor: entities[regionOwners?.[regionId] ?? ""]?.color ?? "#d7d2c8",
        toColor: entities[nextSelectedEntityId]?.color ?? "#d7d2c8",
      })), reveal, regionBounds);
    }
    setShare(null);
    if (regionIds.some((id) => snapshot.customRegions[id])) {
      clearGeometryRenderCaches();
    } else {
      clearGeometryRenderCaches(new Set([nextSelectedEntityId, ...regionIds.map((id) => snapshot.regionOwners[id])]));
    }
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
    setTargetEntityId("");
    setTransferConfirmation({
      id: Date.now(),
      message: `Transferred ${regionIds.length} ${regionIds.length === 1 ? "region" : "regions"} to ${destinationName}`,
    });
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
    const result = divideCountry(snapshot, selectedEntity.id, regionById, territories.regionDivisions, name, color);
    if (!result) return;
    const newBounds = projectedGeometryBounds(territories.newGeometry, projection);
    if (newBounds) {
      const diagonal = Math.hypot(newBounds.maxX - newBounds.minX, newBounds.maxY - newBounds.minY);
      showMapChange([{
        path: divideNewPath,
        fromColor: selectedEntity.color,
        toColor: color,
      }], divideLinePath
        ? { kind: "edge", path: divideLinePath, extent: diagonal * 2 + 4 }
        : {
          kind: "point",
          x: (newBounds.minX + newBounds.maxX) / 2,
          y: (newBounds.minY + newBounds.maxY) / 2,
          extent: diagonal + 4,
        }, newBounds);
    }
    commit(() => result.snapshot, { preserveGeometryCaches: true });

    setSelectedEntityId(result.entityId);
    setSelectedRegions(new Set());
    setNewCountryName("");
    clearDivideDraft();
    setTransferConfirmation({ id: Date.now(), message: `${name} is now a country` });
  }

  function mergeCountries() {
    if (!snapshot || mergeSelection.size < 2 || readOnly) return;
    const members = [...mergeSelection].filter((id) => snapshot.entities[id]);
    if (members.length < 2) return;
    const name = mergeName.trim() || makeDefaultMergeName(snapshot, new Set(members));
    let newEntityId = "";

    commit((draft) => {
      newEntityId = allocateCustomEntityId(draft);
      const regionIds = Object.entries(draft.regionOwners)
        .filter(([, ownerId]) => members.includes(ownerId))
        .map(([regionId]) => regionId);
      draft.entities[newEntityId] = {
        id: newEntityId,
        name,
        color: getFallbackCountryColor(name),
        flag: { ...neutralCountryFlag },
        regionIds,
        isCustom: true,
      };
      for (const regionId of regionIds) {
        draft.regionOwners[regionId] = newEntityId;
      }
      return draft;
    }, { preserveGeometryCaches: true });

    setSelectedEntityId(newEntityId);
    setMergeSelection(new Set());
    setMergeName("");
    setTransferConfirmation({ id: Date.now(), message: `Merged ${members.length} countries as ${name}` });
  }

  function updateSelectedName(name: string) {
    const entityId = selectedEntityId;
    if (!entityId || readOnly) return;
    commitMetadata(`entity-name:${entityId}`, (current) => {
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
    commitMetadata(`entity-color:${entityId}`, (current) => setEntityColor(current, entityId, color));
  }

  function updateSelectedFlag(flag: CountryFlag) {
    const entityId = selectedEntityId;
    if (!entityId || readOnly) return;
    commit((draft) => {
      const entity = draft.entities[entityId];
      if (!entity) return draft;
      draft.entities[entityId] = { ...entity, flag: { ...flag } };
      return draft;
    }, { preserveGeometryCaches: true });
  }

  function resetSelectedFlag() {
    const entityId = selectedEntityId;
    if (!entityId || readOnly) return;
    const baseEntity = baseEntityById.get(entityId);
    updateSelectedFlag(baseEntity ? getCountryFlag(baseEntity) : neutralCountryFlag);
  }

  async function makeShare() {
    if (!data || !snapshot) return;
    const encoded = await encodeSharePayload(createScenarioPayload(data, snapshot));
    const url = makeShareUrl(encoded);
    setCopyFeedback(null);
    setShare({
      url,
      editableUrl: makeEditableUrl(encoded),
      size: describeUrlSize(url),
    });
  }

  async function copyShareUrl() {
    if (!share) return;
    try {
      if (!navigator.clipboard?.writeText) throw new Error("Clipboard access is unavailable.");
      await navigator.clipboard.writeText(share.url);
      setCopyFeedback({ kind: "success", message: "Link copied." });
    } catch {
      shareUrlRef.current?.focus();
      shareUrlRef.current?.select();
      setCopyFeedback({ kind: "error", message: "Could not copy the link. Select and copy the link above." });
    }
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
    cancelZoomAnimation();
    zoomRef.current = nextZoom;
    if (pendingZoomFrameRef.current !== null) {
      return;
    }
    pendingZoomFrameRef.current = window.requestAnimationFrame(() => {
      pendingZoomFrameRef.current = null;
      applyZoomToDom(zoomRef.current);
    });
  }

  function flushZoomFrame() {
    if (pendingZoomFrameRef.current !== null) {
      window.cancelAnimationFrame(pendingZoomFrameRef.current);
      pendingZoomFrameRef.current = null;
    }
    applyZoomToDom(zoomRef.current);
  }

  function syncZoomStateNow() {
    flushZoomFrame();
    setZoom(zoomRef.current);
    cullingZoomRef.current = zoomRef.current;
    setCullingZoom(zoomRef.current);
  }

  function markMapMoving() {
    mapSvgRef.current?.classList.add("is-moving");
    mapCameraRef.current?.style.setProperty("will-change", "transform");
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
      mapCameraRef.current?.style.removeProperty("will-change");
      isMapMovingRef.current = false;
      setSettledZoom(zoomRef.current);
      cullingZoomRef.current = zoomRef.current;
      setCullingZoom(zoomRef.current);
      setIsMapMoving(false);
    }, delay);
  }

  function handlePointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (zoomAnimationFrameRef.current !== null) {
      cancelZoomAnimation();
      syncZoomStateNow();
      settleMapMoving();
    }
    if (event.pointerType === "touch") {
      event.preventDefault();
      event.currentTarget.setPointerCapture(event.pointerId);
      touchPointersRef.current.set(event.pointerId, getSvgPoint(event.currentTarget, event.clientX, event.clientY));
      if (touchPointersRef.current.size === 1) {
        touchSequenceNavigatedRef.current = false;
        touchDivideDraftRef.current = {
          line: divideLine,
          cursor: divideCursor,
          island: divideIslandPoint,
          piece: divideNewPieceIndex,
          error: divideError,
          drawing: isDrawingDivideLine,
          keyboardActive: keyboardCutActive,
          keyboardCursor: keyboardCutCursor,
        };
      } else {
        const startsGesture = !touchSequenceNavigatedRef.current;
        touchSequenceNavigatedRef.current = true;
        panRef.current = null;
        divideDrawRef.current = null;
        divideTapRef.current = null;
        setIsBrushDown(false);
        const draft = touchDivideDraftRef.current;
        if (startsGesture && draft) {
          setDivideLine(draft.line);
          setDivideCursor(draft.cursor);
          setDivideIslandPoint(draft.island);
          setDivideNewPieceIndex(draft.piece);
          setDivideError(draft.error);
          setIsDrawingDivideLine(draft.drawing);
          setKeyboardCutActive(draft.keyboardActive);
          setKeyboardCutCursor(draft.keyboardCursor);
        }
        const [first, second] = [...touchPointersRef.current.values()];
        touchGestureRef.current = { start: [first, second], zoom: { ...zoomRef.current } };
        markMapMoving();
        return;
      }
    }
    if (event.button === 1 || ((isPresenting || mapNavigationEnabled) && event.button === 0)) {
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

    if (mode === "inspect" || (event.pointerType === "touch" && (readOnly || mode === "merge" || (mode === "transfer" && !brushEnabled) || (mode === "divide" && !selectedEntityId)))) {
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
      if (keyboardCutActive) clearDivideDraft();
      mapSvgRef.current?.focus({ preventScroll: true });
      const ownerId = regionId && snapshot ? snapshot.regionOwners[regionId] : "";
      if (!selectedEntityId && ownerId) {
        setSelectedEntityId(ownerId);
        clearDivideDraft();
        return;
      }
      if (selectedEntityId) {
        if (divideMethod !== "draw" || divideSplit.ok || divideIsCalculating) {
          divideTapRef.current = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, moved: false };
          event.currentTarget.setPointerCapture(event.pointerId);
          return;
        }
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
      if (event.pointerType === "touch") return;
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

  function handlePointerMove(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") {
      if (!touchPointersRef.current.has(event.pointerId)) return;
      touchPointersRef.current.set(event.pointerId, getSvgPoint(event.currentTarget, event.clientX, event.clientY));
      if (touchGestureRef.current && touchPointersRef.current.size >= 2) {
        const [first, second] = [...touchPointersRef.current.values()];
        queueZoomUpdate(zoomFromTouchPair(touchGestureRef.current.zoom, touchGestureRef.current.start, [first, second]));
        return;
      }
      // After a pinch, ignore the remaining finger until the full gesture ends.
      if (touchSequenceNavigatedRef.current) return;
      if (brushEnabled && activeModeUsesRegions && !readOnly && !mapNavigationEnabled && !isPresenting) {
        const point = getMapPoint(event.currentTarget, event.clientX, event.clientY, zoomRef.current);
        const regionId = findRegionAtMapPoint(point);
        setIsBrushDown(true);
        if (regionId) addRegionByBrush(regionId);
        return;
      }
    }
    if (divideTapRef.current) {
      if (Math.hypot(event.clientX - divideTapRef.current.x, event.clientY - divideTapRef.current.y) > 8) {
        divideTapRef.current.moved = true;
      }
    }
    if (divideAwaitingEnd && !mapNavigationEnabled && !isPresenting) {
      setDivideCursor(getMapPoint(event.currentTarget, event.clientX, event.clientY, zoomRef.current));
    }
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
    const start = getSvgPoint(event.currentTarget, panRef.current.x, panRef.current.y);
    const current = getSvgPoint(event.currentTarget, event.clientX, event.clientY);
    if (Math.hypot(event.clientX - panRef.current.x, event.clientY - panRef.current.y) > 3) {
      panRef.current.moved = true;
      markMapMoving();
    }
    queueZoomUpdate({
      ...panRef.current.zoom,
      x: panRef.current.zoom.x + current.x - start.x,
      y: panRef.current.zoom.y + current.y - start.y,
    });
  }

  function handlePointerUp(event: React.PointerEvent<HTMLDivElement>) {
    if (event.pointerType === "touch") {
      touchPointersRef.current.delete(event.pointerId);
      releasePointerCaptureIfHeld(event.currentTarget, event.pointerId);
      if (touchSequenceNavigatedRef.current) {
        if (touchPointersRef.current.size >= 2) {
          const [first, second] = [...touchPointersRef.current.values()];
          touchGestureRef.current = { start: [first, second], zoom: { ...zoomRef.current } };
        } else {
          touchGestureRef.current = null;
        }
        if (touchPointersRef.current.size === 0) {
          touchSequenceNavigatedRef.current = false;
          touchDivideDraftRef.current = null;
          syncZoomStateNow();
          settleMapMoving();
        }
        return;
      }
      touchDivideDraftRef.current = null;
      if (brushEnabled && activeModeUsesRegions && !readOnly && !mapNavigationEnabled && !isPresenting && !isBrushDown && event.type !== "pointercancel") {
        const regionId = findRegionAtMapPoint(getMapPoint(event.currentTarget, event.clientX, event.clientY, zoomRef.current));
        if (regionId) handleRegionClick(regionId);
      }
    }
    if (divideTapRef.current) {
      const { pointerId, moved } = divideTapRef.current;
      divideTapRef.current = null;
      releasePointerCaptureIfHeld(event.currentTarget, pointerId);
      if (!moved && event.type !== "pointercancel") {
        handleDivideMapTap(getMapPoint(event.currentTarget, event.clientX, event.clientY, zoomRef.current));
      }
      return;
    }
    if (divideDrawRef.current && event.type === "pointercancel") {
      divideDrawRef.current = null;
      setIsDrawingDivideLine(false);
      clearDivideDraft();
      return;
    }
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
      releasePointerCaptureIfHeld(event.currentTarget, pointerId);
      return;
    }

    setIsBrushDown(false);
    if (panRef.current) {
      const { entityId, moved, regionId, selectOnRelease } = panRef.current;
      if (!moved && selectOnRelease && event.type !== "pointercancel") {
        if (regionId) {
          handleRegionClick(regionId);
        } else if (entityId) {
          handleEntityClick(entityId);
        } else {
          clearMapSelection();
        }
      }
      panRef.current = null;
      releasePointerCaptureIfHeld(event.currentTarget, event.pointerId);
      syncZoomStateNow();
      settleMapMoving();
    }
  }

  function handleWheel(event: React.WheelEvent<HTMLDivElement>) {
    markMapMoving();
    const deltaX = normalizeWheelDelta(event.deltaX, event.deltaMode, viewportWidth);
    const deltaY = normalizeWheelDelta(event.deltaY, event.deltaMode, viewportHeight);
    if (event.shiftKey) {
      queueZoomUpdate({
        ...zoomRef.current,
        x: zoomRef.current.x - deltaX / mapViewScale,
        y: zoomRef.current.y - deltaY / mapViewScale,
      });
      settleMapMoving(180);
      return;
    }
    const cursor = getSvgPoint(event.currentTarget, event.clientX, event.clientY);
    const clampedDeltaY = clamp(deltaY, -wheelZoomMaxDelta, wheelZoomMaxDelta);
    const factor = Math.exp(-clampedDeltaY * wheelZoomSensitivity);
    // Wheel input already supplies a stream of small steps. Repeated easing
    // makes the camera lag behind it and continue moving after the user stops.
    queueZoomUpdate(zoomAroundPoint(zoomRef.current, cursor, factor));
    settleMapMoving(180);
  }

  const visibleCountryUnderlays = useMemo(() => {
    if (!shouldCullMapPaths) return countryUnderlays;
    return clipMapThemeCountryPaths(
      countryUnderlays.filter((underlay) => boundsIntersect(underlay.bounds, renderViewportBounds)),
      renderViewportBounds,
    );
  }, [countryUnderlays, renderViewportBounds, shouldCullMapPaths]);

  const countryUnderlayById = useMemo(() => {
    return new Map(countryUnderlays.map((underlay) => [underlay.id, underlay]));
  }, [countryUnderlays]);

  const countryUnderlayElements = useMemo(() => {
    if (!entities) return [];
    return visibleCountryUnderlays.map((underlay) => {
      const color = entities[underlay.id]?.color ?? "#D7D2C8";
      return (
        <path
          key={underlay.id}
          id={makeSvgElementId("country-shape", underlay.id)}
          className={[
            "country-underlay",
            underlay.sealInternalSeams ? "country-underlay-composed" : "",
            !activeModeUsesRegions || useLowZoomTransferCountryLayer ? "country-underlay-interactive" : "",
          ].join(" ")}
          data-entity-id={underlay.id}
          d={underlay.pathData}
          fill={color}
          fillRule="evenodd"
          stroke={color}
        >
          <title>{entities[underlay.id]?.name}</title>
        </path>
      );
    });
  }, [
    activeModeUsesRegions,
    entities,
    useLowZoomTransferCountryLayer,
    visibleCountryUnderlays,
  ]);

  const administrativeBorderZoomClass = getAdministrativeBorderZoomClass(zoom.k);
  const useDetailedRegionBorderStrokes = administrativeBorderZoomClass !== "map-admin-borders-default";

  const regionsToRender = useMemo(() => {
    if (!regionOwners) return [];
    if (!activeModeUsesRegions) {
      return visibleRegions.filter((region) => selectedEntityId && regionOwners[region.id] === selectedEntityId);
    }
    return useLowZoomTransferCountryLayer
      ? visibleRegions.filter((region) => selectedEntityId && regionOwners[region.id] === selectedEntityId)
      : visibleRegions;
  }, [
    activeModeUsesRegions,
    regionOwners,
    selectedEntityId,
    useLowZoomTransferCountryLayer,
    visibleRegions,
  ]);

  const regionInteractionElements = useMemo(() => {
    if (!entities || !regionOwners || isMapMoving || isPresenting) return [];

    return regionsToRender.map((region) => {
      const regionId = region.id;
      const ownerId = regionOwners[regionId];
      const owner = entities[ownerId];
      if (!ownerId || !owner) return null;
      const isEditableRegion = activeModeUsesRegions && (!selectedEntityId || selectedEntityId === ownerId);

      const regionClasses = [
        "region",
        isEditableRegion ? "region-editable" : "",
      ].join(" ");
      return (
        <g key={regionId} className="region-layer">
          <path
            d={getRegionPath(regionId)}
            data-region-id={regionId}
            className={regionClasses}
            fill="transparent"
            fillRule={customProjectedRegionById.has(regionId) ? "nonzero" : "evenodd"}
            onPointerEnter={() => addRegionByBrush(regionId)}
          >
            <title>
              {getRegionDisplayName(regionId)} · {owner.name}
            </title>
          </path>
        </g>
      );
    });
  }, [
    activeModeUsesRegions,
    addRegionByBrush,
    getRegionDisplayName,
    getRegionPath,
    entities,
    customProjectedRegionById,
    isMapMoving,
    isPresenting,
    regionOwners,
    selectedEntityId,
    regionsToRender,
  ]);

  const boundaryRenderPaths = useMemo(() => {
    if (!regionOwners) return null;
    const visibleEdges = shouldCullMapPaths
      ? projectedBoundaryEdges.filter((edge) => boundsIntersect(edge.bounds, renderViewportBounds))
      : projectedBoundaryEdges;
    const activeAdministrativeEntityId =
      !isPresenting && selectedEntityId && (mode === "transfer" || mode === "divide")
        ? selectedEntityId
        : undefined;
    const options = {
      activeAdministrativeEntityId,
      selectedEntityId: isPresenting ? undefined : selectedEntityId || undefined,
    };
    const result = mapChange
      ? batchBoundaryTransitionPaths(visibleEdges, mapChange.previousRegionOwners, regionOwners, options)
      : { stable: batchBoundaryPaths(visibleEdges, regionOwners, options), previous: null, next: null };
    if (mapChange) {
      result.stable.selectedCountryPath = batchBoundaryPaths(
        visibleEdges, mapChange.settling ? regionOwners : mapChange.previousRegionOwners, options,
      ).selectedCountryPath;
    }
    const clip = (paths: BatchedBoundaryPaths | null) => !paths || !shouldCullMapPaths ? paths
      : Object.fromEntries(Object.entries(paths).map(([kind, pathData]) =>
        [kind, clipProjectedLinePath(pathData, renderViewportBounds)])) as BatchedBoundaryPaths;
    return { stable: clip(result.stable)!, previous: clip(result.previous), next: clip(result.next) };
  }, [
    isPresenting,
    mapChange,
    mode,
    projectedBoundaryEdges,
    regionOwners,
    selectedEntityId,
    renderViewportBounds,
    shouldCullMapPaths,
  ]);
  const boundaryPaths = boundaryRenderPaths?.stable;

  const boundaryElements = boundaryPaths ? (
    <g
      className="boundary-lines"
      style={{ color: selectedEntity?.color ?? customCountryAccentColor }}
      aria-hidden="true"
    >
      {boundaryPaths.coastlinePath ? (
        <path className="coastline-line" d={boundaryPaths.coastlinePath} fill="none" />
      ) : null}
      {boundaryPaths.administrativePath ? (
        <path
          className="administrative-border-line"
          d={boundaryPaths.administrativePath}
          fill="none"
        />
      ) : null}
      {boundaryPaths.activeAdministrativePath ? (
        <path
          className="administrative-border-line administrative-border-active"
          d={boundaryPaths.activeAdministrativePath}
          fill="none"
        />
      ) : null}
      {boundaryPaths.countryPath ? (
        <path
          className="country-border-line"
          d={boundaryPaths.countryPath}
          fill="none"
          strokeWidth={getCountryBorderStrokeWidth(zoom.k)}
        />
      ) : null}
      {boundaryPaths.selectedCountryPath ? (
        <g key={selectedEntityId} className="selected-country-boundary-highlight">
          <path
            className="selected-country-aura selected-country-aura-outer"
            d={boundaryPaths.selectedCountryPath}
            fill="none"
          />
          <path
            className="selected-country-aura selected-country-aura-inner"
            d={boundaryPaths.selectedCountryPath}
            fill="none"
          />
          <path className="selected-country-outline" d={boundaryPaths.selectedCountryPath} fill="none" />
        </g>
      ) : null}
    </g>
  ) : null;

  const selectedRegionOverlayElements = useMemo(() => {
    if (selectedRegions.size === 0) return [];
    return visibleRegions
      .filter((region) => selectedRegions.has(region.id))
      .map((region) => (
        <g key={region.id} className="selected-region-overlay">
          <path
            className="selected-region-tint"
            d={clipMapThemePolygonPath(getRegionPath(region.id), shouldCullMapPaths ? renderViewportBounds : undefined)}
            fillRule={customProjectedRegionById.has(region.id) ? "nonzero" : "evenodd"}
            aria-hidden="true"
          />
          <path
            className="selected-region-outline"
            d={shouldCullMapPaths
              ? clipProjectedLinePath(getRegionStrokePath(region.id, useDetailedRegionBorderStrokes), renderViewportBounds)
              : getRegionStrokePath(region.id, useDetailedRegionBorderStrokes)}
            fill="none"
            aria-hidden="true"
          />
        </g>
      ));
  }, [customProjectedRegionById, getRegionPath, getRegionStrokePath, selectedRegions, renderViewportBounds, shouldCullMapPaths, useDetailedRegionBorderStrokes, visibleRegions]);

  const selectedCountryOverlayElement = useMemo(() => {
    if (!selectedEntityId) return null;
    const underlay = countryUnderlayById.get(selectedEntityId);
    if (!underlay) return null;
    const pathData = shouldCullMapPaths
      ? clipMapThemePolygonPath(underlay.pathData, renderViewportBounds)
      : underlay.pathData;
    if (!pathData) return null;

    return (
      <g
        key={selectedEntityId}
        className="selected-country-overlay"
        data-entity-id={selectedEntityId}
        style={{ color: selectedEntity?.color ?? customCountryAccentColor }}
        aria-hidden="true"
      >
        <path
          className="selected-country-tint"
          d={pathData}
          fillRule="evenodd"
          aria-hidden="true"
        />
      </g>
    );
  }, [countryUnderlayById, selectedEntity?.color, selectedEntityId, renderViewportBounds, shouldCullMapPaths]);

  if (loadError && !data) {
    return (
      <main className="app-shell centered">
        <div className="error-panel" role="alert">
          <Globe2 aria-hidden="true" />
          <h1>AltBorder</h1>
          <p>{loadError}</p>
          <button onClick={() => window.location.reload()}><RotateCcw size={16} aria-hidden="true" /> Try again</button>
        </div>
      </main>
    );
  }

  if (!data || !snapshot) {
    return (
      <main className="app-shell centered">
        <div className="loading-panel" role="status">
          <Globe2 aria-hidden="true" />
          <span>Loading map data</span>
        </div>
      </main>
    );
  }

  return (
    <main className={`app-shell${isPresenting ? " is-presenting" : ""}${mobilePanelExpanded ? " editor-expanded" : " editor-collapsed"}${keyboardVisible ? " keyboard-open" : ""}`}>
      <header className="topbar">
        <div className="topbar-main">
          <div className="brand">
            <Globe2 aria-hidden="true" />
            <span className="brand-wordmark">
              <strong>AltBorder</strong>
              <span className="brand-tagline">History is optional.</span>
            </span>
          </div>
          <label className="title-field">
            {readOnly || isPresenting ? (
              <strong className="scenario-title-text" title={snapshot.title || "Untitled Border Experiment"}>
                {snapshot.title || "Untitled Border Experiment"}
              </strong>
            ) : (
              <input
                aria-label="Scenario"
                value={snapshot.title}
                onChange={(event) => updateScenarioTitle(event.target.value)}
                onBlur={finishMetadataEdit}
              />
            )}
          </label>
        </div>
        <div className="topbar-actions">
          <button
            ref={presentationToggleRef}
            className="presentation-toggle"
            onClick={togglePresentation}
            aria-pressed={isPresenting}
            aria-label={isPresenting ? readOnly ? "Exit presentation" : "Back to editor" : "Present map"}
            title={isPresenting ? "Exit presentation (Escape)" : "Present map"}
          >
            {isPresenting ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            <span>{isPresenting ? readOnly ? "Exit presentation" : "Back to editor" : "Present map"}</span>
          </button>
          {!isPresenting && (readOnly ? (
            <button className="primary" onClick={remix}>
              <PaintBucket size={16} /> Remix/Edit
            </button>
          ) : (
            <div className="history-actions">
              <button className="icon-button" onClick={undo} disabled={history!.past.length === 0} title="Undo" aria-label="Undo">
                <Undo2 size={16} />
              </button>
              <button className="icon-button" onClick={redo} disabled={history!.future.length === 0} title="Redo" aria-label="Redo">
                <Redo2 size={16} />
              </button>
            </div>
          ))}
          {!readOnly && !isPresenting ? (
            <details
              ref={actionsMenuRef}
              className="topbar-menu"
              onBlur={(event) => {
                if (!event.currentTarget.contains(event.relatedTarget)) event.currentTarget.open = false;
              }}
              onKeyDown={(event) => {
                if (event.key !== "Escape" || !event.currentTarget.open) return;
                event.preventDefault();
                event.currentTarget.open = false;
                event.currentTarget.querySelector("summary")?.focus();
              }}
            >
              <summary title="More actions" aria-label="More actions">
                <MoreHorizontal size={18} />
              </summary>
              <div className="topbar-menu-popover">
                <div className="mobile-scenario-actions">
                  <label className="field">
                    <span>Scenario</span>
                    <input aria-label="Scenario" value={snapshot.title} onChange={(event) => updateScenarioTitle(event.target.value)} onBlur={finishMetadataEdit} />
                  </label>
                  <button onClick={() => { if (actionsMenuRef.current) actionsMenuRef.current.open = false; togglePresentation(); }}><Maximize2 size={16} /> Present map</button>
                  <button onClick={redo} disabled={history!.future.length === 0}><Redo2 size={16} /> Redo</button>
                </div>
                <button onClick={() => {
                  if (actionsMenuRef.current) actionsMenuRef.current.open = false;
                  resetMap();
                }}>
                  <RotateCcw size={16} /> Reset map
                </button>
              </div>
            </details>
          ) : null}
          {!isPresenting ? (
            <button ref={shareTriggerRef} className="primary" onClick={makeShare}>
              <Share2 size={16} /> Share
            </button>
          ) : null}
        </div>
      </header>

      <section className="workspace">
        <section className="map-stage" data-map-theme={mapTheme.id} aria-label={isPresenting ? "World map presentation" : "World map editor"}>
          {!isPresenting ? (
            <div className="map-country-search">
              <CountrySearchSelect label="Find a country" value={selectedEntityId} options={entityOptions} onChange={changeSelectedEntity} placeholder="Find a country" />
            </div>
          ) : null}
          {loadError && !isPresenting ? (
            <div className="inline-error" role="alert">
              <span>{loadError}</span>
              <button onClick={startFreshAfterLoadError}>Start fresh</button>
            </div>
          ) : null}
          <div
            ref={mapSurfaceRef}
            className={[
              "map-surface",
              brushEnabled && activeModeUsesRegions && !isPresenting ? "brush-map" : "",
              mode === "divide" && !readOnly && !isPresenting && !mapNavigationEnabled ? "divide-map" : "",
            ].join(" ")}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={handlePointerUp}
            onPointerCancel={handlePointerUp}
            onAuxClick={(event) => event.preventDefault()}
            onWheel={handleWheel}
          >
          <div ref={mapCameraRef} className="map-camera">
          <svg
            ref={mapSvgRef}
            data-map-theme={mapTheme.id}
            viewBox={`0 0 ${viewportWidth} ${viewportHeight}`}
            style={{
              "--map-region-label-size": `${regionLabelScreenFontSize / mapViewScale}px`,
              "--map-view-scale": mapViewScale,
              "--map-country-label-max": countryLabelMaxScreenFontSize,
            } as CSSProperties}
            className={[
              "map",
              administrativeBorderZoomClass,
              brushEnabled && activeModeUsesRegions && !isPresenting ? "brush-map" : "",
              mode === "divide" && !readOnly && !isPresenting && !mapNavigationEnabled ? "divide-map" : "",
            ].join(" ")}
            role={keyboardCutActive ? "application" : "img"}
            aria-label={keyboardCutActive ? "Keyboard cut map" : isPresenting || readOnly ? "World map" : "Editable world map"}
            aria-describedby={keyboardCutActive ? "keyboard-cut-help" : undefined}
            tabIndex={keyboardCutActive || (mode === "divide" && !readOnly && !isPresenting) ? 0 : undefined}
            onKeyDown={handleMapKeyDown}
          >
            <rect width={viewportWidth} height={viewportHeight} className="ocean" />
            <defs>
              <clipPath id={mapViewportClipId} clipPathUnits="userSpaceOnUse">
                <rect x={renderViewportBounds.minX} y={renderViewportBounds.minY} width={renderViewportBounds.maxX - renderViewportBounds.minX} height={renderViewportBounds.maxY - renderViewportBounds.minY} />
              </clipPath>
            </defs>
            <g transform={formatZoomTransform(cullingZoom)} clipPath={`url(#${mapViewportClipId})`}>
              <MapThemeOcean theme={mapTheme.id} projection={projection} detail={detailedMapRaster} viewportBounds={renderViewportBounds} />
              <path
                className="atlas-graticule"
                d={graticulePath}
                fill="none"
                vectorEffect="non-scaling-stroke"
                pointerEvents="none"
                aria-hidden="true"
              />
              <g className="ocean-label-layer" pointerEvents="none" aria-hidden="true">
                {projectedOceanLabels.map((label, index) => (
                  <g key={label.name} transform={`translate(${label.x} ${label.y})`}>
                    <text
                      ref={(element) => { oceanLabelRefs.current[index] = element; }}
                      className="ocean-label"
                      transform={`scale(${1 / zoom.k})`}
                      textAnchor="middle"
                      dominantBaseline="middle"
                    >
                      {label.name}
                    </text>
                  </g>
                ))}
              </g>
              <MapThemeCoasts theme={mapTheme.id} coastlinePath={boundaryPaths?.coastlinePath ?? ""} />
              <g aria-hidden="true">
                {countryUnderlayElements}
              </g>
              {!isPresenting && mapChange ? (
                <MapChangeOverlay
                  key={`fill-${mapChange.id}`}
                  change={mapChange}
                  pieces={visibleMapChangePieces}
                  backgroundPieces={visibleMapChangeBackground}
                  viewport={renderViewportBounds}
                  screenScale={cullingZoom.k * mapViewScale}
                  onSweepComplete={finishMapChangeSweep}
                  onComplete={finishMapChange}
                />
              ) : null}
              <MapThemeLand theme={mapTheme.id} projection={projection} detail={detailedMapRaster} viewportBounds={renderViewportBounds} countryPaths={visibleCountryUnderlays} />
              {!isPresenting && selectedCountryOverlayElement}
              {boundaryElements}
              {!isPresenting && mapChange && boundaryRenderPaths?.previous && boundaryRenderPaths.next ? (
                <MapChangeBorders
                  key={`borders-${mapChange.id}`}
                  previous={boundaryRenderPaths.previous}
                  next={boundaryRenderPaths.next}
                  settling={mapChange.settling}
                />
              ) : null}
              <g pointerEvents={isPresenting ? "none" : undefined}>
                {regionInteractionElements}
              </g>
              {!isPresenting ? (
                <g className="selected-region-overlays" aria-hidden="true">
                  {selectedRegionOverlayElements}
                </g>
              ) : null}
              {!isPresenting && divideTerritories ? (
                <g className="divide-preview" aria-hidden="true">
                  <path className="divide-existing-preview" d={visibleDividePaths.existing} />
                  <path className="divide-new-preview" d={visibleDividePaths.new} fill={newCountryColor} />
                </g>
              ) : null}
              {!isPresenting && divideLinePath ? (
                <path className={`divide-line${divideAwaitingEnd ? " divide-line-pending" : ""}`} d={divideLinePath} aria-hidden="true" />
              ) : null}
              {!isPresenting && divideLine.length > 0 ? (
                <g className="divide-endpoints" aria-hidden="true">
                  {[divideLine[0], ...(divideLine.length > 1 ? [divideLine[divideLine.length - 1]] : [])].map((point, index) => (
                    <circle key={index} cx={point.x} cy={point.y} r={4 / Math.max(cullingZoom.k * mapViewScale, 0.01)} />
                  ))}
                </g>
              ) : null}
              {!isPresenting && keyboardCutActive && keyboardCutCursor ? (
                <circle
                  className="keyboard-cut-cursor"
                  cx={keyboardCutCursor.x}
                  cy={keyboardCutCursor.y}
                  r={7 / cullingZoom.k}
                  aria-hidden="true"
                />
              ) : null}
              <g
                ref={countryLabelsRef}
                className="country-labels"
                style={{ "--map-camera-scale": zoom.k } as CSSProperties}
              >
                {countryLabels.map((label) => (
                  <g
                    key={label.id}
                    transform={`translate(${label.x} ${label.y}) rotate(${label.angle})`}
                  >
                    <g className="country-label-content" style={{ "--country-label-size": label.fontSize } as CSSProperties}>
                      <text
                        className="country-label"
                        x={0}
                        y={0}
                        fontSize={label.fontSize}
                        letterSpacing={label.letterSpacing}
                        textLength={label.textLength}
                        lengthAdjust="spacingAndGlyphs"
                        textAnchor="middle"
                        dominantBaseline="middle"
                      >
                        {label.displayName}
                      </text>
                    </g>
                  </g>
                ))}
              </g>
              <g className="region-labels" display={isPresenting ? "none" : undefined}>
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
          </div>
          </div>
          {mode === "divide" && selectedEntity && !readOnly && !isPresenting ? (
            <div className="divide-map-guide">
              <span>{mapNavigationEnabled ? "Turn off Move map to set the border." : divideMapHint}</span>
              {divideLine.length > 0 || divideIslandPoint ? (
                <button className="compact" onClick={clearDivideDraft} aria-label="Reset border" title="Reset border"><RotateCcw size={14} aria-hidden="true" /></button>
              ) : null}
            </div>
          ) : null}
          {mode === "transfer" && selectedEntity && !readOnly && !isPresenting ? (
            <div className="transfer-map-guide" role="status">
              <span>{mapNavigationEnabled ? "Turn off Move map to select regions." : brushEnabled ? "Drag across regions to select them." : "Select a region. Select it again to deselect it."}</span>
            </div>
          ) : null}
          <div className="map-theme-control">
            <MapThemeSelector theme={mapTheme.id} onChange={changeMapTheme} />
          </div>
          <div className="map-controls" role="group" aria-label="Map zoom controls">
            <button onClick={() => zoomBy(1.25)} disabled={zoom.k >= maxZoom} title="Zoom in" aria-label="Zoom in">
              <Plus size={17} />
            </button>
            <button onClick={() => zoomBy(1 / 1.25)} disabled={zoom.k <= minZoom} title="Zoom out" aria-label="Zoom out">
              <Minus size={17} />
            </button>
            <button onClick={resetMapView} title="Show whole world" aria-label="Show whole world">
              <Globe2 size={17} />
            </button>
            {!isPresenting ? (
              <button className="map-pan-toggle" onClick={() => setMapNavigationEnabled((value) => !value)} aria-label="Move map" aria-pressed={mapNavigationEnabled} title="Move map">
                <Hand size={17} />
              </button>
            ) : null}
          </div>
          <p className="map-touch-hint">Pinch to zoom. Use two fingers to move.</p>
          {isPresenting ? (
            <div className="presentation-caption" aria-hidden="true">
              <strong className="presentation-caption-brand">AltBorder</strong>
              <span>History is optional.</span>
            </div>
          ) : null}
          {transferConfirmation && !isPresenting ? (
            <div key={transferConfirmation.id} className="transfer-confirmation" role="status">
              <span aria-hidden="true"><Check size={16} /></span>
              {transferConfirmation.message}
            </div>
          ) : null}
        </section>

        {!isPresenting ? (
          <EditorSidePanel
          mode={mode}
          compactLayout={compactLayout}
          mobileExpanded={mobilePanelExpanded}
          onToggleMobilePanel={() => setMobilePanelExpanded((value) => !value)}
          onChangeMode={selectMode}
          readOnly={readOnly}
          attribution={data.attribution}
          entityOptions={entityOptions}
          selectedEntity={selectedEntity}
          selectedEntityId={selectedEntityId}
          onSelectEntity={changeSelectedEntity}
          onUpdateEntityName={updateSelectedName}
          onUpdateEntityColor={updateSelectedColor}
          flagOptions={flagOptions}
          defaultEntityFlag={selectedEntity && baseEntityById.has(selectedEntity.id)
            ? getCountryFlag(baseEntityById.get(selectedEntity.id))
            : neutralCountryFlag}
          onUpdateEntityFlag={updateSelectedFlag}
          onResetEntityFlag={resetSelectedFlag}
          onFinishMetadataEdit={finishMetadataEdit}
          inspectFocusedRegion={inspectFocusedRegionRow}
          inspectRegionRows={inspectRegionRows}
          onFocusInspectRegion={focusInspectRegion}
          onUpdateFocusedRegionName={updateFocusedRegionName}
          brushEnabled={brushEnabled}
          onToggleBrush={() => setBrushEnabled((value) => !value)}
          onSelectAllTransferRegions={selectAllTransferRegions}
          onClearTransferSelection={clearTransferSelection}
          selectedTransferRegions={selectedTransferRegions}
          transferRegionRows={inspectRegionRows}
          onToggleTransferRegion={toggleTransferRegion}
          focusedTransferRegion={focusedTransferRegion}
          onFocusTransferRegion={focusTransferRegion}
          onSeparateRegion={separateRegion}
          transferTargetOptions={transferTargetOptions}
          targetEntityId={targetEntityId}
          onSelectTransferTarget={setTargetEntityId}
          canTransfer={Boolean(targetEntity && hasValidTransferTarget && selectedRegions.size > 0)}
          onApplyTransfer={applyTransfer}
          divideCanSwap={divideSplit.ok}
          divideHasDraft={divideLine.length > 0 || Boolean(divideIslandPoint)}
          divideError={visibleDivideError}
          divideIsCalculating={divideIsCalculating}
          divideMethod={divideMethod}
          divideAwaitingEnd={divideAwaitingEnd}
          onChangeDivideMethod={changeDivideMethod}
          newCountryName={newCountryName}
          newCountryColor={newCountryColor}
          onSwapDivideSides={swapDivideSides}
          onClearDivideDraft={clearDivideDraft}
          onChangeNewCountryName={setNewCountryName}
          onChangeNewCountryColor={setNewCountryColor}
          canCreateDividedCountry={Boolean(divideSplit.ok && newCountryName.trim())}
          onCreateDividedCountry={createCountryFromDivide}
          keyboardCutActive={keyboardCutActive}
          keyboardCutPointCount={divideLine.length}
          onStartKeyboardCut={startKeyboardCut}
          onFinishKeyboardCut={finishKeyboardCut}
          onCancelKeyboardCut={cancelKeyboardCut}
          mergeAvailableOptions={mergeAvailableOptions}
          mergeSelectedEntities={mergeSelectedEntities}
          mergeName={mergeName}
          onAddMergeEntity={addMergeCountry}
          onZoomToMergeEntity={zoomToEntity}
          onRemoveMergeEntity={removeMergeCountry}
          onClearMergeSelection={clearMergeSelection}
          onChangeMergeName={setMergeName}
          canMerge={mergeSelection.size >= 2}
          onMerge={mergeCountries}
          />
        ) : null}
      </section>

      {share && !isPresenting ? (
        <dialog
          ref={shareDialogRef}
          className="share-dialog"
          aria-labelledby="share-dialog-title"
          aria-describedby="share-dialog-description"
          onClose={() => {
            setShare(null);
            shareTriggerRef.current?.focus();
          }}
          onKeyDown={(event) => {
            if (event.key !== "Tab") return;
            const focusable = Array.from(event.currentTarget.querySelectorAll<HTMLElement>("button, input, a[href]"));
            if (focusable.length === 0) return;
            event.preventDefault();
            const currentIndex = focusable.indexOf(document.activeElement as HTMLElement);
            const nextIndex = event.shiftKey
              ? (currentIndex - 1 + focusable.length) % focusable.length
              : (currentIndex + 1) % focusable.length;
            focusable[nextIndex].focus();
          }}
          onClick={(event) => {
            if (event.target !== event.currentTarget) return;
            const bounds = event.currentTarget.getBoundingClientRect();
            if (event.clientX < bounds.left || event.clientX > bounds.right || event.clientY < bounds.top || event.clientY > bounds.bottom) {
              event.currentTarget.close();
            }
          }}
        >
            <div className="share-dialog-header">
              <div>
                <h2 id="share-dialog-title">Share map</h2>
                <p id="share-dialog-description">Shared links open read-only by default. Use Remix/Edit to make a copy.</p>
              </div>
              <button className="icon-button" aria-label="Close Share dialog" onClick={() => shareDialogRef.current?.close()}>
                <X size={17} aria-hidden="true" />
              </button>
            </div>
            <label className="field">
              <span>Share link</span>
              <input ref={shareUrlRef} readOnly value={share.url} onFocus={(event) => event.currentTarget.select()} />
            </label>
            <div className={`url-size ${share.size.level}`}>
              URL size: {share.size.bytes.toLocaleString()} bytes
            </div>
            <div className="dialog-actions">
              <button className="primary" onClick={() => void copyShareUrl()}>
                <Copy size={16} /> Copy link
              </button>
              <a href={share.url} target="_blank" rel="noreferrer">
                <Eye size={16} /> View
              </a>
              <a href={share.editableUrl} target="_blank" rel="noreferrer">
                <PaintBucket size={16} /> Editable
              </a>
            </div>
            {copyFeedback ? (
              <p className={copyFeedback.kind === "error" ? "copy-feedback error" : "copy-feedback"} role={copyFeedback.kind === "error" ? "alert" : "status"}>
                {copyFeedback.message}
              </p>
            ) : null}
        </dialog>
      ) : null}
    </main>
  );
}

function getProjectedPathOptions(preferManualFill = false, preferD3Fill = false) {
  return {
    coordinatePrecision: svgPathCoordinatePrecision,
    preferD3Fill,
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

function projectedGeometriesBounds(geometries: Geometry[], projection: GeoProjection): ProjectedBounds | null {
  return geometries.reduce<ProjectedBounds | null>((combined, geometry) => {
    const bounds = projectedGeometryBounds(geometry, projection);
    return bounds ? mergeBounds(combined, bounds) : combined;
  }, null);
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

function getCountryLabelBoxSize(label: FittedCountryLabel, scale: number, viewScale: number) {
  scale *= getCountryLabelScale(label.fontSize, scale, viewScale);
  const angle = (label.angle * Math.PI) / 180;
  const cos = Math.abs(Math.cos(angle));
  const sin = Math.abs(Math.sin(angle));
  const width = Math.max(10, label.width * scale);
  const height = Math.max(5, label.height * scale);
  return {
    width: width * cos + height * sin,
    height: width * sin + height * cos,
  };
}

function getSvgPoint(surface: Element, clientX: number, clientY: number): SvgPoint {
  const stage = surface.closest(".map-stage");
  return stage ? svgViewportPoint(clientX, clientY, stage.getBoundingClientRect()) : { x: 0, y: 0 };
}

function getMapPoint(surface: Element, clientX: number, clientY: number, zoom: ZoomState): SvgPoint {
  const point = getSvgPoint(surface, clientX, clientY);
  return {
    x: (point.x - zoom.x) / zoom.k,
    y: (point.y - zoom.y) / zoom.k,
  };
}

function focusKeyboardCutStart() {
  const button = document.getElementById("keyboard-cut-start");
  const disclosure = button?.closest("details");
  if (disclosure) disclosure.open = true;
  button?.focus();
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

function releasePointerCaptureIfHeld(element: Element, pointerId: number): void {
  if (element.hasPointerCapture(pointerId)) {
    element.releasePointerCapture(pointerId);
  }
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

function combineProjectedPathData(projectedPaths: Array<ProjectedPathData | null>): ProjectedPathData | null {
  let pathData = "";
  let strokePathData = "";
  let bounds: ProjectedPathData["bounds"] | null = null;

  for (const projected of projectedPaths) {
    if (!projected) continue;
    pathData += projected.pathData;
    strokePathData += projected.strokePathData;
    bounds = bounds
      ? {
          minX: Math.min(bounds.minX, projected.bounds.minX),
          minY: Math.min(bounds.minY, projected.bounds.minY),
          maxX: Math.max(bounds.maxX, projected.bounds.maxX),
          maxY: Math.max(bounds.maxY, projected.bounds.maxY),
        }
      : projected.bounds;
  }

  return pathData && bounds ? { pathData, strokePathData, bounds } : null;
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
