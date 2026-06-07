import { describe, expect, it } from "vitest";
import {
  filterLabels,
  getCountryLabelMinScreenFontSize,
} from "./mapLabelDisplay";

describe("country label display thresholds", () => {
  it("lowers the readable-size threshold as the map zooms in", () => {
    expect(getCountryLabelMinScreenFontSize(7, 1)).toBe(7);
    expect(getCountryLabelMinScreenFontSize(7, 4)).toBe(3.8);
    expect(getCountryLabelMinScreenFontSize(7, 30)).toBe(3.8);
  });
});

describe("filterLabels", () => {
  it("keeps the higher-priority label when country labels overlap", () => {
    const labels = [
      { id: "czechia", name: "CZECHIA", x: 10, y: 10, priority: 5 },
      { id: "germany", name: "GERMANY", x: 10.2, y: 10.1, priority: 100 },
      { id: "france", name: "FRANCE", x: 40, y: 10, priority: 5 },
    ];

    const filtered = filterLabels(labels, { x: 0, y: 0, k: 8 }, {
      maxLabels: 10,
      minGap: 6,
      getSortText: (label) => label.name,
      getBoxSize: (label) => ({
        width: label.name.length * 9,
        height: 16,
      }),
    });

    expect(filtered.map((label) => label.id)).toEqual(["france", "germany"]);
  });

  it("honors the maximum label count", () => {
    const labels = [
      { id: "a", x: 0, y: 0, priority: 3 },
      { id: "b", x: 20, y: 0, priority: 2 },
      { id: "c", x: 40, y: 0, priority: 1 },
    ];

    const filtered = filterLabels(labels, { x: 0, y: 0, k: 1 }, {
      maxLabels: 2,
      minGap: 0,
      getBoxSize: () => ({ width: 4, height: 4 }),
    });

    expect(filtered.map((label) => label.id)).toEqual(["a", "b"]);
  });

  it("does not let offscreen labels consume the visible label budget", () => {
    const labels = [
      { id: "offscreen", x: 200, y: 10, priority: 100 },
      { id: "visible", x: 20, y: 10, priority: 1 },
    ];

    const filtered = filterLabels(labels, { x: 0, y: 0, k: 1 }, {
      maxLabels: 1,
      minGap: 0,
      viewportWidth: 100,
      viewportHeight: 40,
      getBoxSize: () => ({ width: 20, height: 10 }),
    });

    expect(filtered.map((label) => label.id)).toEqual(["visible"]);
  });

  it("returns deterministic label ids for identical inputs", () => {
    const labels = [
      { id: "alpha", x: 10, y: 10, priority: 3 },
      { id: "bravo", x: 12, y: 10, priority: 2 },
      { id: "charlie", x: 40, y: 10, priority: 1 },
    ];
    const options = {
      maxLabels: 10,
      minGap: 2,
      getBoxSize: () => ({ width: 18, height: 10 }),
    };

    const first = filterLabels(labels, { x: 0, y: 0, k: 1 }, options);
    const second = filterLabels(labels, { x: 0, y: 0, k: 1 }, options);

    expect(second.map((label) => label.id)).toEqual(first.map((label) => label.id));
  });
});
