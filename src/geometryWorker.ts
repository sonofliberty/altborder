/// <reference lib="webworker" />

import type { Geometry, Position } from "geojson";
import { completeDivisionLand } from "./divisionLandCoverage";
import type { BoundaryEdgeRecord, RegionDivision, RegionRecord } from "./types";
import {
  buildCustomBoundaryEdges,
  buildDivideTerritories,
  divideRegions,
  separateCountryIsland,
  splitCountryGeometry,
  type CountrySplit,
} from "./geometrySplit";

export type DivideWorkerResult = {
  split: CountrySplit;
  territories: Array<ReturnType<typeof buildDivideTerritories> & { regionDivisions: RegionDivision[] }> | null;
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
      subdivisions: RegionRecord[];
      cutLine: Position[];
      islandPoint: Position | null;
      regionLandAdditions?: Record<string, Geometry>;
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
  let result: DivideWorkerResult;
  try {
    result = {
      split,
      territories: split.ok
        ? [buildDivideTerritories(split, 0), buildDivideTerritories(split, 1)].map((territory) => {
            const regionDivisions = completeDivisionLand(request.subdivisions,
              divideRegions(request.subdivisions, territory.newGeometry,
                request.islandPoint ? { island: true } : { cutLine: request.cutLine }),
              territory, request.regionLandAdditions);
            if (!regionDivisions.some((region) => region.kind !== "keep") ||
                !regionDivisions.some((region) => region.kind !== "move")) {
              throw new Error("The cut must leave regions on both sides.");
            }
            return { ...territory, regionDivisions };
          })
        : null,
    };
  } catch {
    result = {
      split: { ok: false, reason: "Could not preserve the regions with this cut. Try a different border." },
      territories: null,
    };
  }
  const response: GeometryWorkerResponse = {
    id: request.id,
    kind: request.kind,
    result,
  };
  self.postMessage(response);
});
