/** Derive exact, padded detail tiles from the shipping WebP textures. */
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const atlas = JSON.parse(readFileSync(join(root, "src/mapThemeTiles.json"), "utf8"));
const directory = join(root, "public/map-themes");

for (const [name, { width, height }] of Object.entries(atlas.textures)) {
  const source = join(directory, `${name}.webp`);
  const size = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", source], { encoding: "utf8" }).trim();
  if (size !== `${width}x${height}`) throw new Error(`${name} dimensions differ from the tile atlas: ${size}`);
  const target = join(directory, "tiles", name);
  mkdirSync(target, { recursive: true });
  let count = 0;
  for (let row = 0; row * atlas.tileSize < height; row += 1) {
    for (let column = 0; column * atlas.tileSize < width; column += 1) {
      const left = Math.max(0, column * atlas.tileSize - atlas.bleed);
      const top = Math.max(0, row * atlas.tileSize - atlas.bleed);
      const right = Math.min(width, (column + 1) * atlas.tileSize + atlas.bleed);
      const bottom = Math.min(height, (row + 1) * atlas.tileSize + atlas.bleed);
      // Lossless crops retain the approved texture's RGBA pixels. The two-pixel
      // border lets interpolation sample neighboring cells without edge seams.
      execFileSync("cwebp", ["-quiet", "-crop", String(left), String(top), String(right - left), String(bottom - top), "-lossless", "-exact", "-z", "6", source, "-o", join(target, `${column}-${row}.webp`)], { maxBuffer: 1024 * 1024 });
      count += 1;
    }
  }
  console.log(`Prepared ${name}: ${count} detail tiles`);
}
