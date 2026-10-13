---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css","src/mapVisualStyle.ts","src/labelLayout.ts","src/mapThemes.ts","src/MapThemeLayers.tsx","src/mapThemeLayers.css","src/MapThemeSelector.tsx","src/mapThemeSelector.css","src/main.tsx"]
---

# World map

Mode: Operate. Scope: map appearance and its theme control. Keep editor identity, map geometry, scenario links, and editing tools intact. The user approved two game-inspired map themes on 2026-10-12, with thinner HOI4 borders.

## Direction contract

THESIS: Two visibly distinct political maps let a person choose between the dark terrain of HOI4 and the bright political colors of EU4.

OWN-WORLD: HOI4 uses dark blue water, muted country colors, strong terrain relief, thin borders, and outlined Barlow names. EU4 uses brighter colors, light coastal water, fine borders, subtle relief, and spaced Cinzel names. The existing dark and gold editor remains unchanged.

STORY: Choose HOI4 or EU4, edit countries and regions, and share the chosen appearance. Custom colors remain explicit. Switching themes does not change ownership, geometry, or names.

FIRST VIEWPORT: The map fills the existing canvas. A compact two-choice theme control sits above the zoom controls on desktop and phone, including shared and presentation views. Country fills and map labels change together. Terrain follows the map projection and current land paths. HOI4 country borders use a fixed 0.95px non-scaling stroke; EU4 uses 0.8px. HOI4 borders are thinner than the approved mockup, without its wide dark bands. Editing feedback stays above all theme layers.

FORM: Explicit user-pinned HOI4 and EU4 directions, approved from revised code-rendered mockups. Build path: code. Approved reference: output/theme-study/comparison-v2.png; user correction: thinner HOI4 borders. Existing direction seed key: 19df7bdf; the user's two named themes replace its single-theme choice.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
