/**
 * Offline preparation only. Requires ffmpeg, ffprobe and cwebp on PATH.
 * Source JPGs are format conversions of the public-domain Natural Earth TIFFs:
 *   SR_50M.zip       -> relief.jpg
 *   NE2_50M_SR_W.zip -> natural-earth-2.jpg
 * Usage: node scripts/prepare-map-theme-assets.mjs [source-directory]
 * See public/map-themes/SOURCES.md for the original downloads and licenses.
 * Nothing is reprojected or read back from a canvas in the application.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { geoNaturalEarth1 } from "d3-geo";
import { pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const sourceDirectory = resolve(process.argv[2] ?? join(root, "output/theme-study/assets"));
const targetDirectory = join(root, "public/map-themes");
const temporaryDirectory = mkdtempSync(join(tmpdir(), "altborder-map-themes-"));
const map = JSON.parse(readFileSync(join(root, "public/data/map-data.json"), "utf8"));
const projection = geoNaturalEarth1().fitExtent([[16, 18], [984, 538]], {
  type: "FeatureCollection",
  features: map.regions.map(({ geometry }) => ({ type: "Feature", properties: {}, geometry })),
});
const viewBox = { width: 1000, height: 560 };
const overviewWidth = 2400;
const maxBuffer = 300 * 1024 * 1024;

function readRaster(name, pixelFormat, channels) {
  const file = join(sourceDirectory, name);
  const dimensions = execFileSync("ffprobe", ["-v", "error", "-select_streams", "v:0", "-show_entries", "stream=width,height", "-of", "csv=s=x:p=0", file], { encoding: "utf8" });
  const [width, height] = dimensions.trim().split("x").map(Number);
  const pixels = execFileSync("ffmpeg", ["-v", "error", "-i", file, "-f", "rawvideo", "-pix_fmt", pixelFormat, "pipe:1"], { maxBuffer });
  if (pixels.length !== width * height * channels) throw new Error(`Invalid raster: ${file}`);
  return { pixels, width, height, channels };
}

function sample(raster, longitude, latitude, channel) {
  const x = Math.max(0, Math.min(raster.width - 1, (longitude + 180) / 360 * raster.width - 0.5));
  const y = Math.max(0, Math.min(raster.height - 1, (90 - latitude) / 180 * raster.height - 0.5));
  const left = Math.floor(x), top = Math.floor(y);
  const right = Math.min(left + 1, raster.width - 1), bottom = Math.min(top + 1, raster.height - 1);
  const fx = x - left, fy = y - top;
  const a = raster.pixels[(top * raster.width + left) * raster.channels + channel];
  const b = raster.pixels[(top * raster.width + right) * raster.channels + channel];
  const c = raster.pixels[(bottom * raster.width + left) * raster.channels + channel];
  const d = raster.pixels[(bottom * raster.width + right) * raster.channels + channel];
  return (a + (b - a) * fx) * (1 - fy) + (c + (d - c) * fx) * fy;
}

function buildRaster(name, density, relief, terrain) {
  const width = viewBox.width * density, height = viewBox.height * density;
  const output = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y += 1) {
    const mapY = (y + 0.5) / density;
    const [, latitude] = projection.invert([projection.translate()[0], mapY]);
    // Natural Earth is pseudocylindrical: latitude is constant on each row,
    // and longitude varies linearly along it. Invert just once per scanline.
    if (!Number.isFinite(latitude) || Math.abs(latitude) > 90) continue;
    const west = projection([-180, latitude])[0], east = projection([180, latitude])[0];
    for (let x = Math.max(0, Math.ceil(west * density - 0.5)); x < Math.min(width, east * density - 0.5); x += 1) {
      const longitude = ((x + 0.5) / density - west) / (east - west) * 360 - 180;
      const index = (y * width + x) * 4;
      if (name === "ocean") {
        const luminance = sample(terrain, longitude, latitude, 0) * 0.2126
          + sample(terrain, longitude, latitude, 1) * 0.7152
          + sample(terrain, longitude, latitude, 2) * 0.0722;
        const water = Math.max(0, Math.min(1, (luminance - 65) / 150));
        output[index] = 28 + water * 79;
        output[index + 1] = 45 + water * 84;
        output[index + 2] = 70 + water * 86;
        output[index + 3] = 255;
        continue;
      }
      const value = sample(relief, longitude, latitude, 0);
      const light = value > 180;
      const alpha = Math.min(175, Math.abs(value - 180) * (light ? 1.5 : 2.4)) / 255 * (name === "hoi4" ? 0.85 : 0.15);
      let coefficient = 1 - alpha;
      if (name === "hoi4") {
        const luminance = sample(terrain, longitude, latitude, 0) * 0.2126
          + sample(terrain, longitude, latitude, 1) * 0.7152
          + sample(terrain, longitude, latitude, 2) * 0.0722;
        coefficient *= 0.55 + 0.45 * Math.min(255, luminance * 1.15) / 255;
      }
      // Combine the mockup's multiply terrain and relief into one source-over
      // RGBA image. The result shades any political color without baking it in.
      const combinedAlpha = 1 - coefficient;
      const gray = combinedAlpha > 0 && light ? alpha / combinedAlpha * 255 : 0;
      output[index] = output[index + 1] = output[index + 2] = gray;
      output[index + 3] = combinedAlpha * 255;
    }
  }
  const png = join(temporaryDirectory, `${name}.png`);
  execFileSync("ffmpeg", ["-v", "error", "-f", "rawvideo", "-pixel_format", "rgba", "-video_size", `${width}x${height}`, "-i", "pipe:0", "-frames:v", "1", png], { input: output, maxBuffer });
  const quality = name === "ocean" ? "84" : "70";
  const alphaQuality = name === "ocean" ? "90" : "60";
  execFileSync("cwebp", ["-quiet", "-q", quality, "-alpha_q", alphaQuality, "-m", "6", "-mt", png, "-o", join(targetDirectory, `${name}.webp`)], { maxBuffer });
  // Derive the overview from the shipping texture so it can also be rebuilt
  // without downloading and reprojecting the Natural Earth source rasters.
  execFileSync("cwebp", ["-quiet", "-resize", String(overviewWidth), "0", "-q", "80", "-alpha_q", "60", "-m", "6", "-mt", join(targetDirectory, `${name}.webp`), "-o", join(targetDirectory, `${name}-overview.webp`)], { maxBuffer });
  console.log(`Prepared ${name}: ${width} × ${height}`);
}

try {
  mkdirSync(targetDirectory, { recursive: true });
  const relief = readRaster("relief.jpg", "gray", 1);
  const terrain = readRaster("natural-earth-2.jpg", "rgb24", 3);
  buildRaster("ocean", 4, relief, terrain);
  buildRaster("hoi4", 6, relief, terrain);
  buildRaster("eu4", 6, relief, terrain);
  writeFileSync(join(root, "src/mapThemeRaster.json"), `${JSON.stringify({ ...viewBox, overviewWidth, scale: projection.scale(), translate: projection.translate() }, null, 2)}\n`);
  await import(pathToFileURL(join(root, "scripts/prepare-map-theme-tiles.mjs")).href);
} finally {
  rmSync(temporaryDirectory, { recursive: true, force: true });
}
