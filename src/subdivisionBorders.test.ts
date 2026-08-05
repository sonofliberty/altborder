import { describe, expect, it } from "vitest";
import {
  batchSubdivisionBorderPathsByOwner,
  getSubdivisionBorderSamplePoint,
  isSubdivisionBorderVisible,
} from "./subdivisionBorders";

describe("subdivision border path batching", () => {
  it("groups paths by owner while preserving owner and path order", () => {
    expect(
      batchSubdivisionBorderPathsByOwner([
        { ownerId: "AAA", regionIds: ["a1", "a2"], pathData: "M0,0L1,1" },
        { ownerId: "BBB", regionIds: ["b1", "b2"], pathData: "M2,2L3,3" },
        { ownerId: "AAA", regionIds: ["a2", "a3"], pathData: "M4,4L5,5" },
      ]),
    ).toEqual([
      {
        ownerId: "AAA",
        regionIds: ["a1", "a2", "a3"],
        pathData: "M0,0L1,1M4,4L5,5",
      },
      {
        ownerId: "BBB",
        regionIds: ["b1", "b2"],
        pathData: "M2,2L3,3",
      },
    ]);
  });

  it("returns no batches when no visible borders are supplied", () => {
    expect(batchSubdivisionBorderPathsByOwner([])).toEqual([]);
  });

  it("preserves the complete path data from each owner", () => {
    const borders = [
      { ownerId: "AAA", regionIds: ["a1", "a2"] as [string, string], pathData: "M0,0L1,1" },
      { ownerId: "AAA", regionIds: ["a2", "a3"] as [string, string], pathData: "M2,2L3,3" },
    ];

    const [batch] = batchSubdivisionBorderPathsByOwner(borders);

    expect(batch.pathData).toBe(borders.map((border) => border.pathData).join(""));
    expect(batch.pathData.length).toBe(
      borders.reduce((total, border) => total + border.pathData.length, 0),
    );
  });

  it("batches only borders retained by visibility filtering", () => {
    const borders = [
      { ownerId: "AAA", regionIds: ["left", "right"] as [string, string], pathData: "VISIBLE" },
      { ownerId: "AAA", regionIds: ["right", "moved"] as [string, string], pathData: "HIDDEN" },
    ];
    const regionOwners = { left: "AAA", right: "AAA", moved: "BBB" };

    const batches = batchSubdivisionBorderPathsByOwner(
      borders.filter((border) => isSubdivisionBorderVisible(border, regionOwners)),
    );

    expect(batches).toEqual([
      { ownerId: "AAA", regionIds: ["left", "right"], pathData: "VISIBLE" },
    ]);
  });
});

describe("subdivision border visibility", () => {
  const border = {
    ownerId: "AAA",
    regionIds: ["left", "right"] as [string, string],
  };

  it("shows borders between regions with the same current owner", () => {
    expect(isSubdivisionBorderVisible(border, { left: "AAA", right: "AAA" })).toBe(true);
  });

  it("hides borders after one side transfers to a different owner", () => {
    expect(isSubdivisionBorderVisible(border, { left: "AAA", right: "BBB" })).toBe(false);
  });

  it("hides inherited borders after both sides transfer to a new owner", () => {
    expect(isSubdivisionBorderVisible(border, { left: "CUSTOM_001", right: "CUSTOM_001" })).toBe(false);
  });

  it("shows inherited borders inside the original country's divide remainder", () => {
    const ownerRemainderGeometries = new Map([
      [
        "AAA",
        [
          {
            type: "Polygon" as const,
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
              ],
            ],
          },
        ],
      ],
    ]);

    expect(
      isSubdivisionBorderVisible(
        { ...border, samplePoint: [5, 5] },
        { left: "", right: "" },
        { ownerRemainderGeometries },
      ),
    ).toBe(true);
  });

  it("hides inherited borders outside the original country's divide remainder", () => {
    const ownerRemainderGeometries = new Map([
      [
        "AAA",
        [
          {
            type: "Polygon" as const,
            coordinates: [
              [
                [0, 0],
                [10, 0],
                [10, 10],
                [0, 10],
                [0, 0],
              ],
            ],
          },
        ],
      ],
    ]);

    expect(
      isSubdivisionBorderVisible(
        { ...border, samplePoint: [15, 5] },
        { left: "", right: "" },
        { ownerRemainderGeometries },
      ),
    ).toBe(false);
  });

  it("hides borders when one referenced region is missing", () => {
    expect(isSubdivisionBorderVisible(border, { left: "AAA" })).toBe(false);
  });

  it("hides borders whose region ids resolve only through inherited object properties", () => {
    expect(isSubdivisionBorderVisible({ ownerId: "AAA", regionIds: ["toString", "toString"] }, {})).toBe(false);
  });

  it("samples the midpoint of the longest subdivision border segment", () => {
    expect(
      getSubdivisionBorderSamplePoint({
        type: "MultiLineString",
        coordinates: [
          [
            [0, 0],
            [1, 0],
          ],
          [
            [2, 0],
            [8, 0],
          ],
        ],
      }),
    ).toEqual([5, 0]);
  });
});
