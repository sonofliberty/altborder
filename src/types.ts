import type { Geometry, LineString, MultiLineString } from "geojson";

export type EditMode = "inspect" | "transfer" | "divide" | "merge";

export type CountryEntity = {
  id: string;
  name: string;
  color: string;
  regionIds: string[];
  isCustom?: boolean;
};

export type RegionRecord = {
  id: string;
  name: string;
  ownerId?: string;
  type: string;
  geometry: Geometry;
};

type BaseCountryRecord = {
  entityId: string;
  geometry: Geometry;
};

export type SubdivisionBorderRecord = {
  id: string;
  ownerId: string;
  regionIds: [string, string];
  geometry: LineString | MultiLineString;
};

export type MapData = {
  version: number;
  attribution: string;
  baseCountries: BaseCountryRecord[];
  countries: CountryEntity[];
  regions: RegionRecord[];
  subdivisionBorders: SubdivisionBorderRecord[];
};

export type EditorSnapshot = {
  title: string;
  description: string;
  entities: Record<string, CountryEntity>;
  regionOwners: Record<string, string>;
  regionNameOverrides: Record<string, string>;
  customRegions: Record<string, RegionRecord>;
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
  description: string;
  customCounter: number;
  entityChanges: Record<string, CountryEntity>;
  regionOwnerChanges: Array<[regionId: string, ownerId: string]>;
  regionNameOverrides?: Record<string, string>;
  customRegions?: RegionRecord[];
};
