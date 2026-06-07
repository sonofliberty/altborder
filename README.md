# AltBorder

AltBorder is a client-only React map editor for making alternate-border scenarios. It lets users inspect countries, rename and recolor entities, transfer administrative regions, divide countries into new custom countries, merge countries, and share the resulting map as a compressed URL.

The app is intentionally a lightweight visual editor, not a GIS tool. Administrative regions are the smallest editable territory unit, and shared scenarios store only differences from the bundled base map.

## Features

- Full-screen SVG world map with pan and zoom.
- Inspect mode for country and region details.
- Rename and recolor countries or custom entities.
- Transfer regions between countries.
- Divide countries into new custom countries.
- Merge multiple countries into one entity.
- Undo, redo, and reset for the current editing session.
- Share links that encode the scenario in the URL hash.
- Read-only shared-map mode with Remix/Edit support.

## Tech Stack

- React 19
- TypeScript
- Vite
- SVG map rendering with `d3-geo`
- Geometry helpers from `jsts`, Turf, and TopoJSON tooling
- URL compression with `lz-string`
- Vitest and ESLint

## Getting Started

Install dependencies:

```sh
pnpm install
```

Start the local development server:

```sh
pnpm dev
```

Vite serves the app on `http://localhost:5173/` by default.

## Common Commands

```sh
pnpm dev
```

Run the local Vite development server.

```sh
pnpm build
```

Run TypeScript project checks and build the production bundle.

```sh
pnpm lint
```

Run ESLint.

```sh
pnpm test
```

Run the Vitest suite once.

```sh
pnpm preview
```

Preview the production build locally.

```sh
pnpm deadcode
```

Run Knip for unused code and dependency checks.

## Map Data

The committed map bundle lives at `public/data/map-data.json`. It currently contains:

- 237 country records
- 1,964 editable region records
- precomputed subdivision border geometry

Attribution from the app:

> Administrative regions from geoBoundaries Open (CC BY 4.0). Fallback country geometry from geoBoundaries ADM0 where configured, otherwise world-atlas / Natural Earth public domain data.

To rebuild the map data:

```sh
pnpm prepare:data
```

This runs `scripts/build-map-data.mjs`, which downloads and caches geoBoundaries data under `.cache/geoboundaries`, combines it with fallback country geometry, simplifies it, and writes the app-ready JSON bundle.

## Sharing Model

AltBorder does not need a backend for normal sharing. The app serializes scenario diffs, compresses them, and stores them in the URL hash:

```text
/#s=<compressed-scenario>
```

Shared links open in read-only mode by default. Adding `edit=1` opens the scenario in editable mode.

## Project Structure

```text
src/App.tsx                    Main React app and editor UI
src/state.ts                   Scenario state, history, edits, serialization helpers
src/share.ts                   URL hash encoding and decoding
src/labelLayout.ts             Country label fitting
src/countryLabelGeometry.ts    Label geometry preparation
src/geometrySplit.ts           Divide-country geometry operations
src/projectedPath.ts           SVG path projection helpers
src/subdivisionBorders.ts      Internal border rendering helpers
src/map*.ts                    Map culling, labels, zoom, and visual rules
src/styles.css                 App styling
public/data/map-data.json      Bundled map dataset
scripts/build-map-data.mjs     Map data preparation
scripts/deploy-pages.mjs       GitHub Pages deployment
```

## Deployment

Deploy the app to GitHub Pages:

```sh
pnpm deploy:pages
```

The deploy script builds with `--base=/altborder/`, copies `dist` into a temporary checkout of the `gh-pages` branch, commits any deployment changes, and pushes `gh-pages`.

## Development Notes

- Keep public URL formats and scenario payloads stable unless a migration is added.
- Prefer visual/layout changes in CSS plus small JSX adjustments.
- The map is full-bleed and unframed; editor UI should stay compact and practical.
- Run `pnpm lint`, `pnpm test`, and `pnpm build --base=/altborder/` before deployment-facing changes.
