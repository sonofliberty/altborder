/// <reference lib="webworker" />

import type { Position } from "geojson";
import type { BoundaryEdgeRecord, RegionRecord } from "./types";
import {
  buildCustomBoundaryEdges,
  buildDivideTerritories,
  separateCountryIsland,
  splitCountryGeometry,
  type CountrySplit,
} from "./geometrySplit";

export type DivideWorkerResult = {
  split: CountrySplit;
  territories: Array<ReturnType<typeof buildDivideTerritories>> | null;
};

export type GeometryWorkerRequest =
  | {
      id: number;
      kind: "custom-boundaries";
      activeRegions: RegionRecord[];
      customRegionIds: string[];
    }
  | {
      id: number;
      kind: "divide";
      regions: RegionRecord[];
      cutLine: Position[];
      islandPoint: Position | null;
    };

export type GeometryWorkerResponse =
  | {
      id: number;
      kind: "custom-boundaries";
      edges: BoundaryEdgeRecord[];
    }
  | {
      id: number;
      kind: "divide";
      result: DivideWorkerResult;
    };

self.addEventListener("message", (event: MessageEvent<GeometryWorkerRequest>) => {
  const request = event.data;
  if (request.kind === "custom-boundaries") {
    const response: GeometryWorkerResponse = {
      id: request.id,
      kind: request.kind,
      edges: buildCustomBoundaryEdges(request.activeRegions, new Set(request.customRegionIds)),
    };
    self.postMessage(response);
    return;
  }

  const split = request.islandPoint
    ? separateCountryIsland(request.regions, request.islandPoint)
    : splitCountryGeometry(request.regions, request.cutLine);
  const response: GeometryWorkerResponse = {
    id: request.id,
    kind: request.kind,
    result: {
      split,
      territories: split.ok
        ? [buildDivideTerritories(split, 0), buildDivideTerritories(split, 1)]
        : null,
    },
  };
  self.postMessage(response);
});
