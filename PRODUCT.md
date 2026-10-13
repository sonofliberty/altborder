# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

The primary users are people who explore alternate history for fun. They want to try different borders and country identities, see the result, and share their scenario with other people.

The primary audience and the lasting product rules below were confirmed by the project owner during init on 2026-09-25. Descriptions of current features come from the existing app and project documentation.

## Product Purpose

AltBorder lets a person create their own version of the world map. A user can change country identities, move territory, divide countries, and merge countries into a new entity.

Success means that a casual user can create a scenario, correct an unwanted change, and send a link that another person can open and explore. The editor must stay easy to use.

## Positioning

AltBorder is a lightweight editor for alternate-border scenarios. Its scope is creative map experiments.

A scenario is carried in a compressed URL. Normal editing and sharing must continue to work without an account or an application backend. A recipient can view the shared map or use Remix/Edit to change a copy.

## Operating Context

- The app runs in a web browser on desktop, tablet, and phone screens.
- A user starts from the bundled world map or opens a shared scenario.
- The main workflow is to find a country, inspect or change it, review the map, and share the result.
- The editor has four modes: Inspect, Transfer, Divide, and Merge.
- Present map hides the editing panel so the user can show the result.
- Edits and undo history belong to the current browser session. The shared URL carries the scenario between sessions or browsers. Do not imply that the app automatically saves changes to an account or server.

## Capabilities and Constraints

### Current capabilities

- Pan and zoom around the world map. Find countries by name or select them on the map.
- Choose HOI4 or EU4 map appearance in the editor, a shared map, or Present map. HOI4 is the default. Theme changes preserve territory, names, and explicit country colors.
- Inspect countries and their regions. Change country names, colors, and flags, and rename regions.
- Choose a bundled flag or upload a supported image.
- Transfer selected regions to another country, or separate a region as a new country.
- Divide a country with a drawn cut or a keyboard cut. A separate island can also become a new country.
- Divide also supports a two-point cut. Unchanged subdivisions keep their geometry and names. Only subdivisions crossed by the new border are split.
- Merge selected countries into one entity.
- Undo, redo, and reset edits in the current session.
- Open shared scenarios in read-only mode by default. Remix/Edit makes the scenario editable.
- Use keyboard search, keyboard mode selection, visible focus marks, touch controls, and reduced-motion support.

### Lasting rules

- Normal editing and sharing must not require an account or an application backend.
- Keep the editor easy for casual users to understand and use.
- Existing shared links must keep working. Changes to the URL format or scenario schema require a compatibility plan or migration.

### Data and storage model

- The app loads a bundled base map. Normal territory transfers use its administrative regions.
- Divide can create custom region geometry. Do not assume that every editable region must remain one of the original administrative regions.
- Shared scenarios store changes to the base map, including custom entities and regions. They do not store a separate full world map.
- The current share format uses the URL fragment `#s=<compressed-scenario>`. The `edit=1` fragment parameter opens an editable scenario.
- Version (1) scenarios can carry an optional `mapTheme` value. Links without a theme use HOI4. An explicit country-color marker preserves a user choice even when it equals the canonical base color. Theme display colors are derived from the base map and are not stored as bulk entity edits.
- Share length depends on the changes stored in the scenario. The app reports the URL size; do not promise a fixed link length.
- Loading the app and bundled assets requires access to their host. Offline installation and automatic persistence are not established product capabilities.

## Evidence on Hand

- `README.md` describes the editor, its workflows, map data, and sharing model.
- `src/App.tsx` and `src/EditorSidePanel.tsx` contain the current user flows and product copy.
- `src/state.ts`, `src/share.ts`, and `src/types.ts` define edits, history, and scenario compatibility.
- `public/data/map-data.json` contains the base map. `public/data/map-data.packed.json` is the bundle loaded by the app.
- The app displays source attribution for geoBoundaries Open and the fallback world-atlas / Natural Earth data. Preserve the attribution when map data or its presentation changes.
- `public/flags/SOURCES.md` and `public/flags/LICENSE-flag-icons.txt` record the flag sources and supplied license information.
- `src/mapThemes.ts` defines theme display colors. `src/MapThemeLayers.tsx` and its stylesheet define map textures and text. `public/map-themes/SOURCES.md` records the raster and font sources; supplied font licenses are in `public/fonts`.
- The existing app is the evidence for current behavior. Init does not establish usage figures, performance claims, or accessibility certification.

## Product Principles

1. Make it easy to try an alternate-history idea and see its effect on the map.
2. Keep ordinary editing and sharing available without accounts or a backend.
3. Support experimentation with clear actions and reversible edits.
4. Keep shared scenarios useful over time by preserving link compatibility.
5. Keep viewing a shared map distinct from editing a copy.

## Open Decisions

- No formal accessibility conformance target has been set.
- Additional interface languages and a formal browser support policy have not been set.
