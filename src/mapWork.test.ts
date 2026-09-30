import { describe, expect, it, vi } from "vitest";
import { mapInBatches } from "./mapWork";

describe("batched map work", () => {
  it("keeps all results in order across browser yields", async () => {
    const work = mapInBatches([3, 1, 2], (value) => value * 2, () => false, 0);
    await expect(work).resolves.toEqual([6, 2, 4]);
  });

  it("discards obsolete geometry and stops processing after cancellation", async () => {
    let cancelled = false;
    const project = vi.fn((value: number) => value * 2);
    const work = mapInBatches([1, 2, 3], project, () => cancelled, 0);
    expect(project).toHaveBeenCalledTimes(1);
    cancelled = true;
    await expect(work).resolves.toBeNull();
    expect(project).toHaveBeenCalledTimes(1);
  });

  it("does no work when a render is already obsolete", async () => {
    const project = vi.fn();
    await expect(mapInBatches([1], project, () => true)).resolves.toBeNull();
    expect(project).not.toHaveBeenCalled();
  });
});
