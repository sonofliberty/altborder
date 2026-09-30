---
name: "AltBorder"
description: "Political Command map with the existing dark editor."
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
typography:
  map-country:
    fontFamily: "\"Trebuchet MS\", Arial, sans-serif"
    fontWeight: 700
  map-ocean:
    fontFamily: "\"Palatino Linotype\", \"Book Antiqua\", Palatino, Georgia, serif"
    fontSize: "9px"
    fontWeight: 400
    letterSpacing: "0.12em"
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
  editor-wordmark:
    fontFamily: "Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif"
    fontSize: "15px"
    fontWeight: 650
    letterSpacing: "0.16em"
rounded:
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
  political-map:
    backgroundColor: "{colors.map-ocean}"
    textColor: "{colors.map-label}"
    typography: "{typography.map-country}"
---

# Design System: AltBorder

## Overview

**Creative North Star: "Political Command — map only"**

The map uses muted country colors, a dark slate-blue sea, strong country borders, and uppercase country names. The user selected Political Command from working map previews. The map is drawn with SVG and code. This change adds no shipping raster images.

The editor keeps its existing dark surfaces, warm gold actions, serif titles, and compact controls. The map direction does not replace the editor identity. The map must remain easy to read while the user changes countries and regions.

**Key Characteristics:**

- Strong country borders with less visible region borders at low zoom.
- Six default country colors with exact custom scenario colors.
- Uppercase sans-serif country names without map flags.
- Existing dark editor with warm gold controls.

## Colors

The map uses muted political colors. The unchanged editor uses dark green-gray surfaces and warm gold controls. Token names begin with `map-` or `editor-` to show their scope. The frontmatter contains the exact color values.

### Primary

- **Editor gold:** Primary actions, active control marks, and focus. The brighter hover color marks interaction.
- **Map country palette:** Olive, blue, rose, sand, sage, and violet identify default countries. These colors have equal status; they do not represent action priority.

### Neutral

- **Dark slate-blue sea:** Map background and ocean fill.
- **Dark map outlines:** Coastlines and country borders. Region borders use lower opacity.
- **Country name ink and pale outline:** Dark letters with a pale edge remain visible over the country fills.
- **Pale ocean names:** Full-opacity text on the sea. Do not reduce its opacity.
- **Editor surfaces and text:** Dark backgrounds, light text, muted supporting text, and visible control borders retain the existing editor appearance.

### State colors

The existing editor uses separate danger, warning, and success colors. Keep these for their current feedback states.

**The Map Scope Rule.** Apply Political Command to the map. Keep the existing editor identity.

**The Scenario Color Rule.** Apply the default palette before scenario colors. Keep every explicit scenario color exact.

## Typography

**Country font:** Trebuchet MS, then Arial and sans-serif. Country names use bold uppercase letters. Label size and spacing depend on the available country area. The fitting code uses map-space sizes from (0.5) to (24), then applies the current screen-size limit. Do not replace this with one fixed label size.

**Ocean font:** The existing atlas serif stack, in italic. Ocean labels stay centered and retain their spacing. They are hidden on narrow screens.

**Editor font:** The existing system sans-serif stack for controls and text. The atlas serif stack remains in scenario titles, country headings, and supporting atlas text. The frontmatter records the existing type roles; it does not prescribe a new body size.

**The Map Name Rule.** Use uppercase sans-serif country names on the map. Keep flags in the editor.

## Layout

The map fills its available canvas. The existing desktop editor has a header (68px) and a side panel (340px). Panel spacing is usually (16px). Present map uses the available workspace without the editing panel.

At widths up to (900px), the editor panel moves below the map. At widths up to (640px), panel padding becomes (12px) and ocean labels are hidden. Short screen rules reduce the panel height further. Keep the existing touch and landscape rules in the stylesheet.

Country names fit within their country geometry. The label layout checks several positions and small rotations. It does not reserve space for a flag. Map geometry and editor control placement remain as implemented.

## Elevation & Depth

The map uses flat country fills, dark boundaries, and pale text outlines. It has no added terrain image or raster texture. The graticule remains a low-opacity guide.

The editor keeps its existing header, panel, and dialog shadows. The sidecar records their exact values. Selection outlines and transfer feedback retain their existing order above the map. Reduced-motion rules continue to control their animation.

## Shapes

Country shapes come from the map geometry. Borders use rounded joins and non-scaling strokes. Country border width increases from (1.55px) to a maximum of (1.8px) as zoom increases.

The editor keeps small control corners, larger tool-card corners, and near-square flag frames. The frontmatter records these radii. Do not apply card corners to map geometry.

## Components

### Political map

Use the six-color default palette and the country assignment helper. Build country adjacency from shared region boundaries. Assign colors in a stable order so every pair of neighboring default countries has different colors. Named country colors are preferences and change when a neighbor requires it. Custom countries remain unchanged by that helper; scenario colors are restored after the default palette.

Country outlines remain stronger than region outlines. Below zoom (2.4), region borders use opacity (0.08) and width (0.4px). From zoom (2.4), opacity becomes (0.28). From zoom (5.5), opacity becomes (0.58) and width (0.55px). Active region borders use opacity (0.7) and width (0.6px).

Country names have a pale stroke (0.1em) behind the dark fill. They contain no flags. Ocean labels use full opacity. The graticule uses opacity (0.09) and width (0.6px).

### Editor buttons

Standard buttons use elevated dark surfaces and a visible border. Primary buttons use gold with dark text. The normal minimum control height is (38px). Hover changes the surface and border; focus adds an outline (3px) with an offset (2px). Disabled controls use opacity (0.54). Keep the existing larger touch targets.

### Editor inputs

Inputs use the elevated editor surface, a visible input border, and padding (7px 9px). Hover and focus change the border to gold. Placeholder text uses the subtle editor text color.

### Editor mode navigation

Four compact tabs share one dark container. The active mode has a gold bottom mark, a muted gold surface, and brighter text. This appearance stays separate from country fills.

### Editor cards and country markers

Tool cards use an elevated surface, a thin border, and padding (12px). Country swatches show the actual country color. Flags remain in country summaries and appearance controls.

## Do's and Don'ts

### Do:

- Do use the six map country colors for the default map.
- Do keep custom country colors exact when a scenario is restored.
- Do show more region detail as the user zooms in.
- Do keep ocean labels at full opacity where they are visible.
- Do keep selection feedback, keyboard focus, and reduced-motion behavior.

### Don't:

- Don't apply the map palette or country font to editor controls.
- Don't add flags to country names on the map.
- Don't use the default palette to replace explicit scenario colors.
- Don't add raster textures as part of this map direction.
