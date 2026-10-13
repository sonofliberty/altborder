import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

type DecodeRequest = { source: string; resolve: () => void; reject: (error: Error) => void };

describe("map texture decode scheduling", () => {
  let requests: DecodeRequest[];

  beforeEach(() => {
    vi.resetModules();
    requests = [];
    vi.stubGlobal("Image", class {
      src = "";
      decode(): Promise<void> {
        return new Promise((resolve, reject) => requests.push({ source: this.src, resolve, reject }));
      }
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("limits bitmap decoding to two cells and shares overlapping camera requests", async () => {
    const { decodeMapThemeRaster } = await import("./mapThemeAssets");
    const first = decodeMapThemeRaster("first.webp");
    expect(decodeMapThemeRaster("first.webp")).toBe(first);
    const second = decodeMapThemeRaster("second.webp");
    const third = decodeMapThemeRaster("third.webp");
    expect(requests.map((request) => request.source)).toEqual(["first.webp", "second.webp"]);
    requests[0].resolve();
    await first;
    await Promise.resolve();
    expect(requests.map((request) => request.source)).toEqual(["first.webp", "second.webp", "third.webp"]);
    requests[1].resolve();
    requests[2].resolve();
    await Promise.all([second, third]);
    await decodeMapThemeRaster("first.webp");
    expect(requests).toHaveLength(3);
  });

  it("releases failed requests so an overview can remain visible and a later camera can retry", async () => {
    const { decodeMapThemeRaster } = await import("./mapThemeAssets");
    const first = decodeMapThemeRaster("missing.webp");
    requests[0].reject(new Error("Image unavailable"));
    await expect(first).rejects.toThrow("Image unavailable");
    await Promise.resolve();
    const retry = decodeMapThemeRaster("missing.webp");
    expect(requests).toHaveLength(2);
    requests[1].resolve();
    await expect(retry).resolves.toBeUndefined();
  });
});
