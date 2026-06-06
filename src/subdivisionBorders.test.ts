import { describe, expect, it } from "vitest";
import { getSubdivisionBorderSamplePoint, isSubdivisionBorderVisible } from "./subdivisionBorders";

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
