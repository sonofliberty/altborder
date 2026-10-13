import type { Geometry, LineString, MultiLineString } from "geojson";

export type EditMode = "inspect" | "transfer" | "divide" | "merge";

export type DivideMethod = "line" | "draw" | "island";

export type MapThemeId = "hoi4" | "eu4";

export type CountryFlag =
  | { kind: "builtin"; id: string }
  | { kind: "custom"; dataUrl: string };

export type CountryEntity = {
  id: string;
  name: string;
  color: string;
  colorIsCustom?: boolean;
  regionIds: string[];
  isCustom?: boolean;
  flag?: CountryFlag;
};

export type RegionRecord = {
  id: string;
  name: string;
  ownerId?: string;
  type: string;
  geometry: Geometry;
};

export type RegionDivision =
  | { regionId: string; kind: "keep"; landAddition?: Geometry }
  | { regionId: string; kind: "move"; landAddition?: Geometry }
  | { regionId: string; kind: "split"; existingGeometry: Geometry; newGeometry: Geometry };

type BaseCountryRecord = {
  entityId: string;
  geometry: Geometry;
};

export type BoundaryEdgeRecord = {
  id: string;
  regionIds: [string, string | null];
  geometry: LineString | MultiLineString;
};

export type MapData = {
  version: number;
  attribution: string;
  baseCountries: BaseCountryRecord[];
  countries: CountryEntity[];
  regions: RegionRecord[];
  boundaryEdges: BoundaryEdgeRecord[];
};

export type EditorSnapshot = {
  title: string;
  mapTheme?: MapThemeId;
  entities: Record<string, CountryEntity>;
  regionOwners: Record<string, string>;
  regionNameOverrides: Record<string, string>;
  customRegions: Record<string, RegionRecord>;
  regionLandAdditions?: Record<string, Geometry>;
  customCounter: number;
};

export type HistoryState = {
  present: EditorSnapshot;
  past: EditorSnapshot[];
  future: EditorSnapshot[];
};

export type ScenarioPayload = {
  version: 1;
  title: string;
  mapTheme?: MapThemeId;
  customCounter: number;
  entityChanges: Record<string, CountryEntity>;
  regionOwnerChanges: Array<[regionId: string, ownerId: string]>;
  regionNameOverrides?: Record<string, string>;
  customRegions?: RegionRecord[];
  regionLandAdditions?: Record<string, Geometry>;
};
