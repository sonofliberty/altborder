---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css","src/mapVisualStyle.ts","src/labelLayout.ts"]
---

# World map

Mode: Operate. Scope: map appearance only. Keep editor controls, map geometry, scenario links, and editing tools intact. The user selected Political Command on 2026-09-28 from three working map previews.

## Direction contract

THESIS: A clear political strategy map with muted country fills and strong boundaries, based on HOI4.

OWN-WORLD: Dark slate-blue sea, six muted country colors, dark outlines, and pale-edged uppercase sans-serif country names. The existing editor remains unchanged.

STORY: Find a country, select its territory, change the map, and share the result. Custom country colors must remain exact.

FIRST VIEWPORT: The existing world map fills the editor canvas. Country borders lead; region borders stay quiet until zoomed in. Default country colors must differ across every shared border. Map labels omit flags; flags remain available in the editor. Selection and transfer retain their existing feedback and reduced-motion behavior.

FORM: Political Command, the user-selected first grounded option. Seed key: 19df7bdf. The explicit HOI4 brief controls the map style. Build path: code. Reference: output/map-options/political.png.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance
