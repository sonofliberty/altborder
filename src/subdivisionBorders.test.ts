import { describe, expect, it } from "vitest";
import { isSubdivisionBorderVisible } from "./subdivisionBorders";

describe("subdivision border visibility", () => {
  const border = {
    regionIds: ["left", "right"] as [string, string],
  };

  it("shows borders between regions with the same current owner", () => {
    expect(isSubdivisionBorderVisible(border, { left: "AAA", right: "AAA" })).toBe(true);
  });

  it("hides borders after one side transfers to a different owner", () => {
    expect(isSubdivisionBorderVisible(border, { left: "AAA", right: "BBB" })).toBe(false);
  });

  it("hides borders when one referenced region is missing", () => {
    expect(isSubdivisionBorderVisible(border, { left: "AAA" })).toBe(false);
  });

  it("hides borders whose region ids resolve only through inherited object properties", () => {
    expect(isSubdivisionBorderVisible({ regionIds: ["toString", "toString"] }, {})).toBe(false);
  });
});
