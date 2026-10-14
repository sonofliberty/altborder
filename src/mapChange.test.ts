import { describe, expect, it } from "vitest";
import { createMapChange, getTransferReveal } from "./mapChange";

const bounds = { minX: 0, minY: 0, maxX: 100, maxY: 10 };
const owners = { west: "AAA", east: "AAA", neighbor: "BBB" };
const piece = { path: "M0,0L10,0L10,10Z", fromColor: "#111111", toColor: "#222222" };
const change = {
  id: 1, pieces: [piece], bounds, previousRegionOwners: owners,
  reveal: { kind: "edge" as const, path: "M0,0V10", extent: 204 },
};

describe("territory transfer feedback", () => {
  it("starts at the destination's shared border without using selected internal edges", () => {
    const reveal = getTransferReveal(["west", "east"], "BBB", owners, [
      { id: "internal", regionIds: ["west", "east"], pathData: "INTERNAL", bounds },
      { id: "destination", regionIds: ["west", "neighbor"], pathData: "SHARED", bounds: { ...bounds, maxX: 0 } },
    ], bounds, null);
    expect(reveal.kind).toBe("edge");
    if (reveal.kind === "edge") expect(reveal.path).toBe("SHARED");
    expect(reveal.extent / 2).toBeGreaterThan(100);
  });

  it("finishes covering a winding border that spans the territory's bounds", () => {
    const reveal = getTransferReveal(["west"], "BBB", owners, [
      { id: "winding", regionIds: ["west", "neighbor"], pathData: "M0,0V10H100", bounds },
    ], bounds, null);
    // The corner at (100, 0) is ten units from this shared border.
    expect(reveal.extent / 2).toBeGreaterThan(10);
  });

  it("approaches disconnected territory from the destination's side", () => {
    const reveal = getTransferReveal(["west"], "BBB", owners, [], bounds, {
      minX: 200, minY: 0, maxX: 300, maxY: 10,
    });
    expect(reveal).toEqual({ kind: "edge", path: "M100,0V10", extent: 204 });
  });

  it("keeps earlier destination colors and ownership during rapid transfers", () => {
    const first = createMapChange(change, null);
    const second = createMapChange({
      ...change, id: 2,
      pieces: [{ ...piece, fromColor: "#222222", toColor: "#333333" }],
      bounds: { minX: 50, minY: -10, maxX: 150, maxY: 20 },
      previousRegionOwners: { ...owners, west: "BBB" },
    }, first);
    expect(second.backgroundPieces).toEqual([piece]);
    expect(second.previousRegionOwners).toBe(owners);
    expect(second.bounds).toEqual({ minX: 0, minY: -10, maxX: 150, maxY: 20 });
    expect(second.pieces[0].toColor).toBe("#333333");
    expect(first.backgroundPieces).toEqual([]);
    expect(first.pieces).toEqual([piece]);
  });

  it("preserves layer order when repeated transfers return land to an earlier color", () => {
    const first = createMapChange(change, null);
    const second = createMapChange({ ...change, id: 2, pieces: [{ ...piece, toColor: "#333333" }] }, first);
    const third = createMapChange({ ...change, id: 3 }, second);
    expect(third.backgroundPieces.map(({ toColor }) => toColor)).toEqual(["#222222", "#333333"]);
    expect(third.pieces[0].toColor).toBe("#222222");
  });
});
