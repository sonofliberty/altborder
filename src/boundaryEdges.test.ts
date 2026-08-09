import { describe, expect, it } from "vitest";
import { batchBoundaryPaths, classifyBoundaryEdge } from "./boundaryEdges";

const internalEdge = {
  regionIds: ["left", "right"] as [string, string],
};

describe("boundary edge classification", () => {
  it("renders an edge between different owners as a country border", () => {
    expect(classifyBoundaryEdge(internalEdge, { left: "AAA", right: "BBB" })).toBe("country");
  });

  it("renders an edge between equal owners as an administrative border", () => {
    expect(classifyBoundaryEdge(internalEdge, { left: "AAA", right: "AAA" })).toBe("administrative");
  });

  it("turns an internal edge into a country border after separation", () => {
    expect(classifyBoundaryEdge(internalEdge, { left: "AAA", right: "CUSTOM_001" })).toBe("country");
  });

  it("turns a former country border into an administrative border after merge", () => {
    expect(classifyBoundaryEdge(internalEdge, { left: "CUSTOM_001", right: "CUSTOM_001" })).toBe(
      "administrative",
    );
  });

  it("renders an edge with an ocean side as a coastline", () => {
    expect(classifyBoundaryEdge({ regionIds: ["left", null] }, { left: "AAA" })).toBe("coastline");
  });

  it("hides a shared edge when either region is inactive", () => {
    expect(classifyBoundaryEdge(internalEdge, { left: "AAA", right: "" })).toBe("hidden");
    expect(classifyBoundaryEdge(internalEdge, { left: "AAA" })).toBe("hidden");
  });

  it("does not read inherited owner values", () => {
    expect(classifyBoundaryEdge({ regionIds: ["toString", "toString"] }, {})).toBe("hidden");
  });
});

describe("boundary path batching", () => {
  const edges = [
    { id: "coast", regionIds: ["left", null] as [string, null], pathData: "COAST" },
    { id: "country", regionIds: ["left", "foreign"] as [string, string], pathData: "COUNTRY" },
    { id: "admin", regionIds: ["left", "right"] as [string, string], pathData: "ADMIN" },
    { id: "inactive", regionIds: ["left", "missing"] as [string, string], pathData: "HIDDEN" },
  ];
  const owners = { left: "AAA", right: "AAA", foreign: "BBB" };

  it("puts each visible edge in one path", () => {
    expect(batchBoundaryPaths(edges, owners)).toEqual({
      administrativePath: "ADMIN",
      activeAdministrativePath: "",
      coastlinePath: "COAST",
      countryPath: "COUNTRY",
      selectedCountryPath: "",
    });
  });

  it("moves active administrative lines into the active path", () => {
    const paths = batchBoundaryPaths(edges, owners, { activeAdministrativeEntityId: "AAA" });
    expect(paths.administrativePath).toBe("");
    expect(paths.activeAdministrativePath).toBe("ADMIN");
  });

  it("builds one selected-country path from political borders and coastlines", () => {
    const paths = batchBoundaryPaths(edges, owners, { selectedEntityId: "AAA" });
    expect(paths.selectedCountryPath).toBe("COASTCOUNTRY");
  });

  it("changes a former country border to an administrative line after transfer", () => {
    const paths = batchBoundaryPaths(edges, { ...owners, foreign: "AAA" });
    expect(paths.countryPath).toBe("");
    expect(paths.administrativePath).toBe("COUNTRYADMIN");
  });
});
