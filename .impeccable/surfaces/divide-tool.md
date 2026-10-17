---
version: 1
slug: "divide-tool"
primary_target: "src/EditorSidePanel.tsx"
related_targets: ["src/App.tsx", "src/styles.css", "src/editorHud.css", "src/mapZoom.ts", "src/types.ts"]
---

# Divide tool

## Direction contract

THESIS: The selected country owns a compact floating tool panel. Transfer and Divide keep their next action visible without a full-height sidebar.

OWN-WORLD: Preserve AltBorder's dark surfaces, gold actions, sans-serif controls, real flags, and existing map themes. Use a clear country heading, flat tool tabs, and one action footer.

STORY: Find or select a country, choose Transfer or Divide, preview the land change, then apply it. Keep Undo, region lists, keyboard cuts, and all existing editor functions.

FIRST VIEWPORT: A full-width map sits under a compact header. Country search is at the top left. A roughly 326px panel floats at the right with country, mode tabs, settings, and a fixed action footer. The panel becomes a collapsible bottom sheet on phones. Map guidance follows the current step. Motion is a short, reduced-motion-aware panel transition; map gestures stay independent.

FORM: User chose A, Tools by the country, on 2026-10-17. Grounded candidate 6; seed fe07ec9d. Code-led. Approved layout references: output/playwright/hud-study/a-transfer-desktop.png, a-divide-desktop.png, a-transfer-phone.png, and a-divide-phone.png. Preserve real behavior beyond the sample states.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

## Divide behavior

Mode: Operate. Scope: divide interaction and its guidance. Preserve the existing dark editor, gold actions, map appearance, geometry operations, history, and shared-link format.

Delight thesis: Users should feel in control of a new border because each point and side choice is visible before they create a country.

Default to a two-point cut with a live dashed line and endpoint marks. Keep freehand, island, and keyboard cuts available. Explain the current step on the map and in the panel. A completed preview lets users choose a side without replacing the cut. Use the existing creation feedback and Undo. Use no new image assets or decorative motion.

Keep untouched subdivisions. Transfer whole subdivisions with their original IDs. Split only intersected subdivisions, keeping their names and local borders. Verify creation, undo, redo, repeated cuts, and shared-link restoration.

## HUD terminology

- Region: an editable area inside a country. Transfer moves selected regions to the Destination country.
- Select / Deselect: add a region to the transfer selection or remove it from that selection. These actions do not delete land.
- Brush: drag across regions to select them.
- Reset border: clear the current Divide draft or preview.
- Switch side: choose the other part of the divided country while keeping the border.
- Show tools / Hide tools: expand or close the phone tool body.

Use region for one area and regions for all other counts. Keep map instructions usable with a mouse or touch. Error messages name the next available recovery action.

## Responsive behavior

Phones use the bottom sheet. Portrait tablets keep the floating country panel and full-height map. Short landscape screens retain the panel with less header detail. Keep the main action visible while other controls scroll.

After a region is selected on a phone, keep the destination visible and put selection controls under Edit. In a ready Divide preview, remove repeated step guidance. On very short landscape screens, put the next text field first.

Give a focused phone form the available height while the software keyboard is open. Country search closes the sheet body while typing. Selecting a country opens its tools again. Use targets of at least 44px and 16px text inputs on touch screens.

In short landscape mode, a form with keyboard focus fills the visible viewport above the software keyboard. Hide its heading, tabs, and background map during text entry. Keep the action in place when focus moves to it.
