import { describe, expect, it } from "vitest";
import atlas from "./mapThemeTiles.json";

declare const require: (id: string) => { readFileSync: (path: URL) => Uint8Array };
const { readFileSync } = require("node:fs");

function losslessWebpSize(bytes: Uint8Array): { width: number; height: number } {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const text = new TextDecoder();
  if (text.decode(bytes.subarray(0, 4)) !== "RIFF" || text.decode(bytes.subarray(8, 12)) !== "WEBP") {
    throw new Error("Invalid detail tile");
  }
  for (let position = 12; position + 8 < bytes.length;) {
    const length = view.getUint32(position + 4, true);
    if (text.decode(bytes.subarray(position, position + 4)) === "VP8L") {
      expect(bytes[position + 8]).toBe(0x2f);
      const bits = view.getUint32(position + 9, true);
      return { width: (bits & 0x3fff) + 1, height: ((bits >>> 14) & 0x3fff) + 1 };
    }
    position += 8 + length + (length & 1);
  }
  throw new Error("Detail tile must preserve the source pixels with lossless WebP");
}

describe("shipping detail texture cells", () => {
  it.each(Object.keys(atlas.textures) as Array<keyof typeof atlas.textures>)("ships each padded %s cell within a small bitmap budget", (name) => {
    const { width, height } = atlas.textures[name];
    for (let row = 0; row * atlas.tileSize < height; row += 1) {
      for (let column = 0; column * atlas.tileSize < width; column += 1) {
        const bytes = readFileSync(new URL(`../public/map-themes/tiles/${name}/${column}-${row}.webp`, import.meta.url));
        const actual = losslessWebpSize(bytes);
        const left = Math.max(0, column * atlas.tileSize - atlas.bleed);
        const top = Math.max(0, row * atlas.tileSize - atlas.bleed);
        expect(actual).toEqual({
          width: Math.min(width, (column + 1) * atlas.tileSize + atlas.bleed) - left,
          height: Math.min(height, (row + 1) * atlas.tileSize + atlas.bleed) - top,
        });
        expect(actual.width * actual.height * 4).toBeLessThan(4.1 * 1024 ** 2);
      }
    }
  });
});
