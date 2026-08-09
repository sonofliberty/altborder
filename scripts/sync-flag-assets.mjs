import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import countries from "i18n-iso-countries";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");
const mapDataPath = path.join(root, "public/data/map-data.json");
const outputDirectory = path.join(root, "public/flags/4x3");
const sourceDirectory = path.join(root, "node_modules/flag-icons/flags/4x3");
const specialFlagIds = new Map([
  ["XKX", "xk"],
  ["NE-N-Cyprus", "northern-cyprus"],
  ["NE-Somaliland", "somaliland"],
]);

const data = JSON.parse(await fs.readFile(mapDataPath, "utf8"));
const usedFlagIds = new Set();

for (const country of data.countries) {
  const flagId = getFlagId(country.id);
  country.flag = { kind: "builtin", id: flagId };
  usedFlagIds.add(flagId);
}

await fs.writeFile(mapDataPath, `${JSON.stringify(data)}\n`, "utf8");
await fs.mkdir(outputDirectory, { recursive: true });

for (const flagId of usedFlagIds) {
  if (flagId === "northern-cyprus" || flagId === "somaliland") continue;
  await fs.copyFile(path.join(sourceDirectory, `${flagId}.svg`), path.join(outputDirectory, `${flagId}.svg`));
}

await fs.copyFile(
  path.join(root, "node_modules/flag-icons/LICENSE"),
  path.join(root, "public/flags/LICENSE-flag-icons.txt"),
);

console.log(`Added flag IDs and synced ${usedFlagIds.size} bundled country flags`);

function getFlagId(entityId) {
  const specialFlagId = specialFlagIds.get(entityId);
  if (specialFlagId) return specialFlagId;

  const naturalEarthMatch = /^NE-(\d{3})$/.exec(entityId);
  const alpha2 = naturalEarthMatch
    ? countries.numericToAlpha2(naturalEarthMatch[1])
    : countries.alpha3ToAlpha2(entityId);
  if (!alpha2) {
    throw new Error(`No flag mapping for country entity ${entityId}`);
  }
  return alpha2.toLowerCase();
}
