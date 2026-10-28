import { spawnSync } from "node:child_process";
import { copyFile, mkdir, mkdtemp, readFile, rm, symlink, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const root = dirname(dirname(fileURLToPath(import.meta.url)));

it("preserves existing map bundles when ADM1 sources fail or return no features", async () => {
  const fixture = await mkdtemp(join(tmpdir(), "altborder-map-data-test-"));
  try {
    await mkdir(join(fixture, "scripts"));
    await mkdir(join(fixture, "src"));
    await copyFile(join(root, "src/polygonOverlay.mjs"), join(fixture, "src/polygonOverlay.mjs"));
    await mkdir(join(fixture, "public/data"), { recursive: true });
    await symlink(join(root, "node_modules"), join(fixture, "node_modules"));
    await copyFile(join(root, "scripts/build-map-data.mjs"), join(fixture, "scripts/build-map-data.mjs"));
    await copyFile(join(root, "scripts/restore-country-components.mjs"), join(fixture, "scripts/restore-country-components.mjs"));
    await copyFile(join(root, "src/color-scheme.json"), join(fixture, "src/color-scheme.json"));
    const bundleNames = ["map-data.json", "map-data.packed.json"];
    for (const name of bundleNames) {
      await writeFile(join(fixture, "public/data", name), `existing ${name}\n`);
    }
    await writeFile(join(fixture, "mock-fetch.mjs"), `
      globalThis.fetch = async (url) => {
        if (url.includes("/USA/ADM1/")) throw new Error("fixture download failure");
        const body = url.includes("/api/")
          ? { gjDownloadURL: "https://fixture.invalid/empty.geojson" }
          : { type: "FeatureCollection", features: [] };
        return { ok: true, json: async () => body };
      };
    `);

    const result = spawnSync(process.execPath, [
      "--import", join(fixture, "mock-fetch.mjs"),
      join(fixture, "scripts/build-map-data.mjs"),
    ], { cwd: fixture, encoding: "utf8", timeout: 20_000 });

    expect(result.error).toBeUndefined();
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("Map data was not written");
    expect(result.stderr).toContain("USA: fixture download failure");
    expect(result.stderr).toContain("MEX: No ADM1 features were returned.");
    for (const name of bundleNames) {
      expect(await readFile(join(fixture, "public/data", name), "utf8")).toBe(`existing ${name}\n`);
    }
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}, 25_000);

it.each(["prepare:data", "prepare:flags"])("%s packs the updated country flags", async (command) => {
  const fixture = await mkdtemp(join(tmpdir(), "altborder-flag-data-test-"));
  try {
    await mkdir(join(fixture, "scripts"));
    await mkdir(join(fixture, "public/data"), { recursive: true });
    await symlink(join(root, "node_modules"), join(fixture, "node_modules"));
    await symlink(join(root, "src"), join(fixture, "src"));
    for (const script of ["pack-map-data.mjs", "sync-flag-assets.mjs", "prepare-map-rendering.mjs", "map-render-preparation.ts"]) {
      await copyFile(join(root, "scripts", script), join(fixture, "scripts", script));
    }
    const source = {
      version: 2,
      attribution: "fixture",
      countries: [{ id: "USA", name: "United States", color: "#ffffff", regionIds: [] }],
      baseCountries: [],
      regions: [],
      boundaryEdges: [],
    };
    await writeFile(join(fixture, "public/data/map-data.json"), JSON.stringify(source));
    await writeFile(join(fixture, "scripts/build-map-data.mjs"), `
      import fs from "node:fs";
      fs.writeFileSync("public/data/map-data.json", ${JSON.stringify(JSON.stringify(source))});
    `);
    const { scripts } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
    const result = spawnSync("sh", ["-c", scripts[command]], {
      cwd: fixture, encoding: "utf8", timeout: 10_000,
    });

    expect(result.error).toBeUndefined();
    expect(result.status, result.stderr).toBe(0);
    const unpacked = JSON.parse(await readFile(join(fixture, "public/data/map-data.json"), "utf8"));
    const packed = JSON.parse(await readFile(join(fixture, "public/data/map-data.packed.json"), "utf8"));
    expect(packed.countries).toEqual(unpacked.countries);
    expect(packed.countries[0].flag).toEqual({ kind: "builtin", id: "us" });
  } finally {
    await rm(fixture, { recursive: true, force: true });
  }
}, 15_000);
