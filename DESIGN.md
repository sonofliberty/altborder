---
name: "AltBorder"
description: "Two political map themes with the existing dark and gold editor."
colors:
  editor-text: "#dddcd3"
  editor-text-strong: "#f3eedf"
  editor-muted: "#a8b0ad"
  editor-subtle: "#909c99"
  editor-app-bg: "#111b20"
  editor-surface: "#172126"
  editor-surface-elevated: "#1e2b30"
  editor-surface-muted: "#253338"
  editor-border: "#314047"
  editor-border-strong: "#485951"
  editor-input-border: "#697b73"
  editor-primary: "#c8ac73"
  editor-primary-hover: "#e0c48a"
  editor-primary-soft: "#34352c"
  editor-primary-ink: "#1b211f"
  editor-focus: "#e0c48a"
  editor-danger-bg: "#38282a"
  editor-danger-border: "#805052"
  editor-danger-text: "#f0b1ad"
  editor-warning-bg: "#373225"
  editor-warning-text: "#e6cb8e"
  editor-success-bg: "#23382f"
  editor-success-text: "#abd5b7"
  map-ocean: "#344959"
  map-coast: "#273645"
  map-country-border: "#282c32"
  map-region-border: "#282c32"
  map-label: "#252a30"
  map-label-outline: "#d9d7cd"
  map-ocean-label: "#edf0ee"
  map-graticule: "#c7d1d6"
  map-country-olive: "#85887b"
  map-country-blue: "#7a8eaa"
  map-country-rose: "#aa7e7d"
  map-country-sand: "#a69b78"
  map-country-sage: "#739087"
  map-country-violet: "#8e8499"
  map-hoi4-ocean: "#253248"
  map-hoi4-coast: "#34404c"
  map-hoi4-country-border: "#202630"
  map-hoi4-region-border: "#10151b"
  map-hoi4-label: "#202731"
  map-hoi4-label-outline: "#d8d9d3"
  map-hoi4-ocean-label: "#c1c9d6"
  map-hoi4-ocean-label-outline: "#29364a"
  map-hoi4-graticule: "#9aafc8"
  map-hoi4-region-label: "#e5e5de"
  map-hoi4-region-label-outline: "#222d30"
  map-hoi4-country-olive: "#777c6b"
  map-hoi4-country-blue: "#53779b"
  map-hoi4-country-rose: "#99738b"
  map-hoi4-country-sand: "#a99b66"
  map-hoi4-country-green: "#52755a"
  map-hoi4-country-violet: "#766f84"
  map-hoi4-country-clay: "#a07d6d"
  map-hoi4-country-gray: "#929da5"
  map-eu4-ocean: "#548798"
  map-eu4-coast: "#626b60"
  map-eu4-country-border: "#4c4b41"
  map-eu4-region-border: "#4b4d40"
  map-eu4-label: "#172324"
  map-eu4-label-outline: "#f1e4b7"
  map-eu4-ocean-label: "#183540"
  map-eu4-ocean-label-outline: "#a6c5c4"
  map-eu4-graticule: "#c9e0db"
  map-eu4-region-label: "#273c34"
  map-eu4-region-label-outline: "#f1e8cd"
  map-eu4-coastal-shelf: "#bee2d5"
  map-eu4-country-sand: "#c5bc8b"
  map-eu4-country-blue: "#547bd1"
  map-eu4-country-rose: "#dd8dad"
  map-eu4-country-yellow: "#ebcc55"
  map-eu4-country-green: "#52ac79"
  map-eu4-country-violet: "#b795bf"
  map-eu4-country-clay: "#bc7d61"
  map-eu4-country-gray: "#9db6bb"
typography:
  map-country:
    fontFamily: "\"Barlow Map\", sans-serif"
    fontWeight: 600
    letterSpacing: "0.035em"
  map-eu4-country:
    fontFamily: "\"Cinzel Map\", serif"
    fontWeight: 500
    letterSpacing: "0.075em"
  map-ocean:
    fontFamily: "\"Barlow Map\", sans-serif"
    fontSize: "9px"
    fontWeight: 600
    letterSpacing: "0.16em"
  map-eu4-ocean:
    fontFamily: "\"Cinzel Map\", serif"
    fontSize: "9px"
    fontWeight: 500
    letterSpacing: "0.19em"
  editor-body:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
  editor-title:
    fontFamily: "\"Palatino Linotype\", \"Book Antiqua\", Palatino, Georgia, serif"
    fontSize: "19px"
    fontWeight: 400
    lineHeight: 1.2
  editor-headline:
    fontFamily: "\"Palatino Linotype\", \"Book Antiqua\", Palatino, Georgia, serif"
    fontSize: "31px"
    fontWeight: 400
    lineHeight: 1.1
  editor-label:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "12px"
    fontWeight: 650
  editor-hint:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.5
  editor-tool-heading:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.4
  editor-status:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "14px"
    fontWeight: 400
  editor-wordmark:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 650
    letterSpacing: "0.16em"
rounded:
  theme-option: "3px"
  control: "4px"
  card: "8px"
  swatch: "5px"
  flag: "2px"
spacing:
  tight: "3px"
  field-gap: "6px"
  nav-gap: "8px"
  panel-small: "12px"
  panel: "16px"
  header-gap: "24px"
components:
  editor-button:
    backgroundColor: "{colors.editor-surface-elevated}"
    textColor: "{colors.editor-text}"
    rounded: "{rounded.control}"
    padding: "0px 11px"
  editor-button-primary:
    backgroundColor: "{colors.editor-primary}"
    textColor: "{colors.editor-primary-ink}"
    rounded: "{rounded.control}"
    padding: "0px 11px"
  editor-button-primary-hover:
    backgroundColor: "{colors.editor-primary-hover}"
  editor-input:
    backgroundColor: "{colors.editor-surface-elevated}"
    textColor: "{colors.editor-text}"
    rounded: "{rounded.control}"
    padding: "7px 9px"
  editor-mode-nav:
    backgroundColor: "{colors.editor-app-bg}"
    rounded: "{rounded.control}"
    padding: "3px"
  editor-tool-card:
    backgroundColor: "{colors.editor-surface-elevated}"
    rounded: "{rounded.card}"
    padding: "{spacing.panel-small}"
  editor-country-swatch:
    rounded: "{rounded.swatch}"
    height: "34px"
    width: "34px"
  map-hoi4:
    backgroundColor: "{colors.map-hoi4-ocean}"
    textColor: "{colors.map-hoi4-label}"
    typography: "{typography.map-country}"
  map-eu4:
    backgroundColor: "{colors.map-eu4-ocean}"
    textColor: "{colors.map-eu4-label}"
    typography: "{typography.map-eu4-country}"
  map-theme-selector:
    backgroundColor: "{colors.editor-surface}"
    rounded: "{rounded.control}"
    padding: "3px 3px 3px 12px"
  map-theme-option:
    textColor: "{colors.editor-text}"
    typography: "{typography.editor-label}"
    rounded: "{rounded.theme-option}"
    padding: "0px 10px"
  map-theme-option-selected:
    backgroundColor: "{colors.editor-primary}"
    textColor: "{colors.editor-primary-ink}"
  map-theme-option-selected-hover:
    backgroundColor: "{colors.editor-primary-hover}"
---

# Design System: AltBorder

## Overview

**Creative North Star: "Two political maps, one editor"**

HOI4 uses dark blue water, muted country colors, strong terrain relief, thin borders, and outlined Barlow names. EU4 uses brighter political colors, pale coastal water, fine borders, subtle relief, and spaced Cinzel names. These are original AltBorder styles informed by the two games. HOI4 is the default theme.

The editor keeps its dark surfaces, warm gold actions, serif titles, and compact controls. The map combines SVG geometry with projected raster layers. A theme changes the map appearance. Country ownership, geometry, names, and explicit colors stay intact.

**Key Characteristics:**

- Two distinct map palettes with thin country borders.
- Strong HOI4 relief and subtle EU4 relief over live country fills.
- Uppercase Barlow or Cinzel country names without map flags.
- Existing dark editor with warm gold controls and a two-choice map theme control.

## Colors

The HOI4 palette is muted and dark. The EU4 palette is brighter, with clear political colors. The editor uses dark green-gray surfaces and warm gold controls. The frontmatter contains the exact color values.

### Primary

- **Editor gold:** Primary actions, the selected theme, active control marks, and focus. The brighter hover color marks interaction.
- **HOI4 country palette:** Olive, blue, rose, sand, green, violet, clay, and gray form the fallback palette.
- **EU4 country palette:** Sand, blue, rose, yellow, green, violet, clay, and gray form the fallback palette.

Country colors have equal status. Named countries use the approved assignments in `src/mapThemes.ts`. Other base countries use the theme's eight-color fallback palette, assigned in a stable order that avoids colors already used by adjacent countries.

### Neutral

- **Theme seas and coastlines:** HOI4 has dark blue water and a dark coast. EU4 has blue-green water, a fine coast, and pale coastal shelves.
- **Theme outlines:** Country and region boundaries use separate theme colors and widths.
- **Theme name ink and outline:** Country, ocean, and region text use separate ink and outline pairs for each theme.
- **Editor surfaces and text:** Dark backgrounds, light text, muted supporting text, and visible control borders retain the existing editor appearance.

### State colors and compatibility

The editor uses separate danger, warning, and success colors. Keep these for their current feedback states.

The six `map-country-*` colors remain the canonical base-state palette in `src/mapVisualStyle.ts`. They support change detection and old shared scenarios. The unqualified `map-ocean`, `map-coast`, border, label, and graticule colors record the base CSS fallbacks. They do not define the active map theme. Active appearance uses `map-hoi4-*` or `map-eu4-*` tokens. The loaded theme stylesheet is authoritative for rendered coast and border values.

**The Map Scope Rule.** Apply theme colors and map fonts to the map. Keep the existing editor identity.

**The Scenario Color Rule.** Derive default display colors from the selected theme and the canonical base map. Preserve custom countries and explicit entity colors, including an explicit choice equal to the stored base color. Raster shading may change their visible tone without changing their stored fill color.

## Typography

**HOI4 map font:** Self-hosted Barlow Semibold, registered as Barlow Map, with a sans-serif fallback. Country names use uppercase letters, weight (600), and spacing (0.035em). Their pale outline is (0.075em).

**EU4 map font:** Self-hosted Cinzel Medium, registered as Cinzel Map, with a serif fallback. Country names use uppercase letters, weight (500), and spacing (0.075em). Their pale outline is (0.025em).

Country label size and position depend on the available country area. The fitting code uses map-space sizes from (0.5) to (24), then applies the current screen-size limit. Keep this geometry fitting and its text-length adjustment. Do not replace it with one fixed label size. Theme CSS supplies the effective weight and letter spacing.

**Ocean names:** Use the current theme font at (9px), in normal style. HOI4 uses spacing (0.16em) and an outline (0.13em). EU4 uses spacing (0.19em) and an outline (0.065em). Keep full fill opacity. Ocean names are hidden on narrow screens.

**Editor font:** The existing system sans-serif stack for controls and text. The atlas serif stack remains in scenario titles, country headings, and supporting atlas text. The frontmatter records the existing type roles; it does not prescribe a new body size. Region labels retain the editor sans-serif and use theme ink and outline colors. The base Trebuchet country font is a legacy CSS fallback, not the font for either active theme.

**The Map Name Rule.** Use the selected theme's uppercase country names on the map. Keep flags in the editor.

## Layout

The map fills its available canvas. The existing desktop editor has a header (68px) and a side panel (340px). Panel spacing is usually (16px). Present map uses the available workspace without the editing panel.

On phones and portrait tablets up to (900px), the editor opens below the map. It starts closed with country context and all four mode controls visible. Show editor opens the scrollable tools; Show more map closes them. Selecting a mode opens its tools, and selecting a country in Inspect opens its details. The open panel uses half of the workspace, or more space when the keyboard is open. Short landscape screens from (600px) to (900px) keep a (300px) side panel.

Mobile controls have a minimum touch size of (44px). Search selection dismisses the touch keyboard. The layout uses the visual viewport and safe-area insets. At widths up to (640px), ocean labels are hidden. Pinch zoom and two-finger panning work in every mode. Move map enables single-finger or mouse panning without editing; choosing a mode returns to editing.

The map theme control sits above the zoom controls. Its desktop position is (16px) from the left and (70px) from the bottom. Up to (900px), or with a coarse pointer, it uses the left safe-area inset with a minimum of (12px), and a bottom offset of (72px). It remains available in shared and presentation views.

When the map canvas is at most (240px) high and (600px) wide, place the theme control beside the zoom controls at the lower right. Hide its decorative label, retain its accessible legend, and keep each option at least (44px) wide. Use (12px) bottom and safe-area right insets. Keep Divide instructions at the top with (8px) clearance. Hide the general touch hint while the Divide guide is visible.

Country names fit within their country geometry. The label layout checks several positions and small rotations. It does not reserve space for a flag. Map geometry and editor control placement remain as implemented.

## Elevation & Depth

Projected raster layers add geographic texture. The ocean raster sits below country fills, at opacity (0.6) for HOI4 and (0.17) for EU4. Theme land rasters sit above country fills and are clipped to the current land paths. HOI4 carries strong shaded relief; EU4 carries subtle relief. Raster alpha is part of the prepared assets. Political colors are not baked into the textures.

EU4 adds three pale coastal shelf strokes below the country fills. Their outer, middle, and inner widths are (18px), (10px), and (4px), with opacity (0.08), (0.12), and (0.18). The graticule keeps width (0.6px), with opacity (0.035) for HOI4 and (0.07) for EU4. Country outlines and selection feedback stay above the land texture. Transfer color sweeps sit below the terrain so land detail remains visible throughout the change.

The editor keeps its existing header, panel, and dialog shadows. The sidecar records their exact values. Reduced-motion rules continue to control editing feedback. Theme changes add no decorative animation.

**The Live Land Rule.** Align raster layers to the active map projection and clip land textures to the current country paths. Theme layers must not take pointer input. Preserve asset provenance in `public/map-themes/SOURCES.md` and the supplied font licenses.

Clip the ocean texture to the projected world outline, so raster pixels outside the poles and map edges cannot show.

Use 2400px overview textures until the settled zoom, canvas size, and device pixel ratio require more pixels. Load only the visible 1024px detail tiles, with a small margin for map movement. Keep each overview area visible until its detail tile loads and decodes. A failed detail request must retain the overview. Both levels use the same projection, colors, and clipping paths.

During zoom and pan, move the cached map with a CSS transform. Refresh projected paths when the camera leaves the prepared area or changes scale substantially. Clip fills, borders, and texture masks to the visible stage plus its movement margin, including the space around the centered SVG viewBox. Keep polygon operations in cancellable workers so edits do not block camera input.

## Shapes

Country shapes come from the map geometry. Borders use rounded joins and non-scaling strokes. Country border width is (0.95px) for HOI4 and (0.8px) for EU4. Both themes use a coastline width of (0.6px). Theme CSS overrides the legacy country-width presentation attribute; do not restore its heavier zoom-based border as the active theme rule.

The editor keeps small control corners, larger tool-card corners, and near-square flag frames. The frontmatter records these radii. Do not apply card corners to map geometry.

## Components

### Political map

Use the selected theme's named country assignments and adjacency-aware fallback palette. Compute display colors from the immutable map baseline. Theme switching must not write derived default colors back into entity state. Preserve custom countries, explicit color markers, and colors that differ from the canonical baseline. A saved theme is an optional `mapTheme` field in the existing version (1) scenario payload. An absent theme uses HOI4; EU4 is stored explicitly.

Country outlines remain stronger than region outlines. Region detail increases at zoom (2.4) and (5.5):

| Theme | Below 2.4 | 2.4 to below 5.5 | From 5.5 |
| --- | --- | --- | --- |
| HOI4 | 0.35px, opacity 0.1 | 0.35px, opacity 0.19 | 0.45px, opacity 0.3 |
| EU4 | 0.4px, opacity 0.16 | 0.4px, opacity 0.34 | 0.5px, opacity 0.53 |

Active region borders use width (0.6px) and opacity (0.7) in both themes. Country labels contain no flags. Ocean labels retain full opacity where visible. Theme land and sea textures move with the existing zoom group; they do not change hit areas or country geometry.

Use an alpha mask bounded by the prepared viewport for land textures. Paint each current country path separately with its even-odd fill rule. This preserves overlapping land and holes without the browser combining all country paths into one clip during zoom.

### Map theme control

A fieldset named Map theme contains native radio inputs for HOI4 and EU4. Keep one radio group, its visible label, full theme-name tooltips, and keyboard focus. The selected option uses editor gold and dark text; hover uses the brighter gold. Other options use editor text and gain a muted surface with a gold border on hover.

The fieldset has a thin editor border, corners (4px), and padding (3px 3px 3px 12px). Options have corners (3px), minimum width (50px), padding (0px 10px), and the standard control height (38px). At widths up to (900px), or with a coarse pointer, their minimum height is (44px). Focus uses an outline (3px) with offset (2px). Forced-colors mode marks the checked radio with a Highlight border and inset outline.

Selecting a theme changes the map immediately. Editable scenarios record that choice in Undo history. A shared-map viewer can change the display without entering edit mode. Sharing includes the selected theme through the existing scenario format.

### Editor buttons

Standard buttons use elevated dark surfaces and a visible border. Primary buttons use gold with dark text. The normal minimum control height is (38px). Hover changes the surface and border; focus adds an outline (3px) with an offset (2px). Disabled controls use opacity (0.54). Keep the existing larger touch targets.

### Editor inputs

Inputs use the elevated editor surface, a visible input border, and padding (7px 9px). Hover and focus change the border to gold. Placeholder text uses the subtle editor text color.

### Editor mode navigation

Four compact tabs share one dark container. The active mode has a gold bottom mark, a muted gold surface, and brighter text. This appearance stays separate from country fills.

### Editor cards and country markers

Tool cards use an elevated surface, a thin border, and padding (12px). Country swatches show the actual country color. Flags remain in country summaries and appearance controls.

### Divide workflow

Divide starts with Two points. The user selects one point on each side of the country. A gold dashed line follows the pointer after the first point. Solid lines and fixed-size endpoint marks show a completed cut. Draw and Island remain explicit choices. Keyboard controls open in a disclosure.

The panel shows two steps: Set border and Create country. A short guide stays on the map when the phone panel is closed or scrolled. A valid preview shows the new country's color, a success mark, and the name and color fields. The user can select either piece on the map or use Other side. These actions keep the border intact. Start over clears the draft. Creation requires a name, uses the existing map-change feedback, and stays reversible with Undo.

Keep the workflow on the existing panel surface. Instructions use the editor sans-serif at (13px), headings at (15px), and success text at (14px). Method controls use the normal button height and reach (44px) on touch layouts. Step numbers identify the two actions in this sequence. Endpoint marks and status changes add no looping animation.

Divide preserves administrative subdivisions. Regions outside the new country stay unchanged. Whole regions inside it change ownership. Only intersected regions receive clipped geometry, and both pieces keep the region name, including a user rename. Use the existing scenario format to store these pieces.

Keep all land shown in the divide preview. Store missing administrative land as small additions to existing region IDs. Split regions carry their added land in their geometry. These additions follow transfers, later cuts, Undo, Redo, and shared links. Country fills use a polygon union so overlapping subdivisions cannot create gaps. Remove collapsed rings before saving split geometry; keep valid small fragments at their original precision.

When a custom country with one region is annexed, keep its country name as the region name. Preserve an explicit region rename. Keep the original country fill when it still owns all its original regions, even after it acquires a custom region.

### Territory change motion

Transfer color starts at the shared destination border. Disconnected territory uses the side nearest the destination. A (680ms) sweep decelerates with `cubic-bezier(0.22, 0.68, 0.3, 1)`. Its gold front stays (1.6px) wide on screen at every zoom. Bound SVG masks to the changed territory and the prepared viewport. Keep terrain, coastlines, labels, and input targets live.

Keep the destination color visible until the matching country shapes and custom boundaries finish. Calculate custom boundaries against those completed shapes. Then fade the color cover and crossfade only changed political and administrative edges over (220ms). Use animation completion and geometry readiness to remove the effect. A fixed cleanup timer must not expose old shapes or cause a late border adjustment.

Rapid transfers keep earlier destination colors below the latest sweep, in transfer order. Undo, Redo, and theme changes clear obsolete feedback. Native transfers retain unrelated geometry caches. Reduced motion uses a (180ms) color fade and a (140ms) border handoff, with no traveling front.

## Do's and Don'ts

### Do:

- Do use the selected theme for default country display colors.
- Do keep the six-color canonical baseline for state and shared-link compatibility.
- Do keep country borders thin: HOI4 (0.95px) and EU4 (0.8px).
- Do preserve explicit country color values when themes change or scenarios load.
- Do show more region detail as the user zooms in.
- Do keep ocean labels at full opacity where they are visible.
- Do keep selection feedback, keyboard focus, and reduced-motion behavior.

### Don't:

- Don't apply the map palette or country font to editor controls.
- Don't add flags to country names on the map.
- Don't use the default palette to replace explicit scenario colors.
- Don't bake political colors into the terrain rasters.
- Don't replace live map geometry or input targets with raster artwork.
