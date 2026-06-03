# AltBorder Web App Spec

## Product Summary

AltBorder is a simple interactive web app where users reshape national borders on a world map and share the resulting alternate world. The experience should feel playful, fast, and visual: open the map, rename countries, split existing countries into new ones from administrative regions, transfer regions between countries, name the scenario, and share a link.

The first version should favor fun and clarity over geographic precision. It is not a GIS editor. It is a lightweight map toy with enough structure to make the result understandable and shareable.

## Goals

- Let users create alternate national borders on a recognizable world map.
- Let users rename existing countries.
- Let users spawn new countries by converting administrative regions into countries.
- Let users transfer administrative regions from one country to another.
- Start with strong administrative-region coverage for major countries, with whole-country fallback regions elsewhere.
- Make basic edits obvious without instructions.
- Preserve country identity through colors, labels, and selection states.
- Generate shareable links that recreate the edited map.
- Support browsing shared maps in read-only mode.
- Keep the app usable on desktop first, with mobile viewing support.

## Non-Goals For MVP

- Real legal, historical, demographic, or population modeling.
- Precise GIS topology editing.
- User accounts.
- Collaborative editing.
- Public gallery or scenario discovery.
- Server-side map rendering.
- Full mobile editing workflow.
- Undo history across sessions.
- Editing disputed territories as a separate political model.
- PNG/image export.

## Target Users

- Casual users making joke maps or alternate-history maps.
- Geography and map enthusiasts.
- Social media users sharing quick visual ideas.
- Educators or creators who need lightweight “what if” maps.

## Core User Flows

### Create A Map

1. User opens the app and sees the world map.
2. User selects a country.
3. User chooses an edit mode.
4. User changes borders.
5. User names the scenario.
6. User clicks share.
7. App creates a shareable URL.

### View A Shared Map

1. User opens a shared URL.
2. App loads the altered borders and scenario title.
3. Map opens in read-only mode by default.
4. User can click Remix/Edit to duplicate the shared map into editable mode.

## Editing Model

The app should support four MVP edit modes.

### 1. Transfer Territory

The user selects a source country, then a target country, then clicks administrative regions of the source country to transfer to the target.

MVP simplification:
- Use first-level administrative regions where available, such as states, provinces, departments, oblasts, or governorates.
- Transfer whole administrative regions, not arbitrary freehand cuts.
- Any region can be transferred to any country or custom country, regardless of distance or adjacency.
- Transferred regions inherit the target country color and ownership.
- Countries without usable administrative regions can fall back to a single whole-country region for MVP.

Expected controls:
- Source country selector.
- Target country selector.
- Region multi-select.
- Brush-select for selecting many adjacent regions.
- Apply / cancel.

### 2. Merge Countries

The user selects two or more countries and merges them into one country.

Behavior:
- Merged countries share one color.
- A merged country has a generated name by default, editable by the user.
- Internal borders can be hidden or shown with a toggle.

### 3. Rename And Recolor

The user can rename a country, newly spawned country, or merged entity and change its color.

Behavior:
- Label updates immediately.
- Color updates on the map and legend.
- Shared links preserve names and colors.

### 4. Divide Country

The user selects an existing country and converts one or more of its administrative regions into a new country.

MVP simplification:
- Use administrative regions inside the selected country rather than arbitrary freehand GIS cuts.
- The user clicks regions to assign them to a new country.
- The user must enter a name before creating the new country.
- The new country receives a generated ID and default color.
- The user can immediately recolor the new country.
- The original country keeps all unselected regions.

Expected controls:
- Source country selector.
- Required new country name input.
- New country color picker.
- Region multi-select.
- Brush-select for selecting many adjacent regions.
- Create / cancel.

Behavior:
- New countries behave like normal editable entities after creation.
- New countries cannot be created without a non-empty name.
- New countries can be created from one administrative region or many.
- New countries can be created from regions that do not touch each other.
- New countries can receive transferred territory.
- New countries can be merged with other countries.
- Shared links preserve new country geometry, name, color, and ownership.

## Optional Post-MVP Edit Modes

- Split administrative regions into smaller custom regions.
- Draw freehand borders.
- Draw entirely new borders.
- Delete a country by assigning all territory to neighbors.
- Add custom capitals or markers.
- Add annotations or labels.
- Export map as PNG or other image format.
- Timeline mode for multiple map states.

## Map Interaction

Desktop MVP:
- Pan by dragging empty map space.
- Zoom with mouse wheel and zoom buttons.
- Click country to select.
- Hover country to highlight.
- Use toolbar buttons for modes.
- Use side panel for selected country details.

Mobile MVP:
- Pinch to zoom.
- Drag to pan.
- Tap country to inspect.
- Shared-map viewing should work well.
- Editing can be limited or simplified.

## UI Structure

### Main Screen

- Full-screen world map.
- Top bar with app name, scenario title, undo/redo, reset, share.
- Left or floating toolbar for edit modes.
- Right side panel for country/entity details.
- Bottom status bar for selected country and current mode.

### Side Panel

When a country or entity is selected:
- Name.
- Current owner/entity.
- Color picker.
- Merge action.
- Divide country action.
- Transfer source/target fields.
- Area summary if feasible.

### Share Dialog

- Scenario title input.
- Optional short description.
- Copy link button.
- Read-only preview link.
- Remix/edit toggle.

## Visual Design Direction

- The map is the product; it should occupy nearly the entire screen.
- Use distinct country colors with enough contrast.
- Show country labels by default.
- Show region labels only in transfer/divide modes or at high zoom.
- Keep UI chrome quiet and compact.
- Use familiar icon buttons for map tools.
- Avoid heavy decorative panels or marketing-style landing sections.
- First viewport should be the usable editor.

## Data Model

### Base Map

Use simplified world countries plus first-level administrative regions.

MVP dataset decision:
- Use geoBoundaries Open as the source for first-level administrative regions.
- Use ADM1 boundaries for editable regions.
- Preprocess geoBoundaries into a curated major-country subset for initial app load.
- Use whole-country fallback regions for countries not included in the initial ADM1 subset.
- Provide visible attribution for geoBoundaries because the source requires attribution.
- Natural Earth may be used for a lightweight country basemap if needed, but geoBoundaries is the source of editable administrative regions.

Initial ADM1 coverage:
- United States
- Canada
- Mexico
- Brazil
- Argentina
- United Kingdom
- France
- Germany
- Italy
- Spain
- Russia
- India
- China
- Japan
- Australia
- Indonesia
- Turkey
- Iran
- Saudi Arabia
- South Africa
- Nigeria
- Egypt

Each base country should include:
- Stable country ID, preferably ISO 3166-1 alpha-3 where available.
- Display name.
- Geometry.
- Default color.
- List of administrative region IDs owned by default.

Each administrative region should include:
- Stable region ID.
- Parent country ID.
- Display name.
- Region level, initially first-level only.
- Region type, such as state, province, department, oblast, or governorate.
- Geometry.
- Default owner country ID.

MVP data rule:
- Administrative regions are the smallest editable territory unit.
- MVP should prioritize strong first-level administrative-region coverage for major countries.
- If a country has no usable administrative regions in the dataset, represent it as one whole-country region.
- The data model should leave room for second-level or custom sub-region splits later.
- The app should avoid mixing datasets in a way that leaves gaps or overlaps between country and region geometry.

### Scenario

A scenario stores only the differences from the base map.

Example shape:

```json
{
  "version": 1,
  "title": "Big Patagonia",
  "description": "",
  "entities": {
    "ARG": {
      "name": "Greater Argentina",
      "color": "#5B8DEF"
    },
    "CUSTOM_001": {
      "name": "New Patagonia",
      "color": "#E76F51",
      "createdFrom": "ARG"
    }
  },
  "createdCountries": [
    {
      "entityId": "CUSTOM_001",
      "name": "New Patagonia",
      "color": "#E76F51",
      "source": "ARG",
      "regionIds": ["ARG-RN", "ARG-CH", "ARG-SC"]
    }
  ],
  "ownershipChanges": [
    {
      "regionId": "CHL-LL",
      "from": "CHL",
      "to": "ARG"
    }
  ],
  "merges": [
    {
      "entityId": "CUSTOM_001",
      "members": ["ARG", "URY"],
      "name": "Rio Union",
      "color": "#4DAA57"
    }
  ]
}
```

## Sharing

MVP sharing should work without accounts.

Preferred approach:
- Encode compressed scenario data in the URL hash for small maps.
- Example: `/map#s=<compressed-scenario>`.
- Store scenario title and description only inside the share URL payload.
- No backend required for MVP.
- Keep typical compressed scenario URLs under about 4 KB.
- Warn or offer another sharing path if a generated URL approaches about 8 KB.

Fallback for larger scenarios:
- Add a small API later that stores scenario JSON and returns a short ID.
- Example: `/s/abc123`.
- Short links are not required on day one unless real scenarios routinely exceed the practical URL-size target.
- Public gallery/indexing is not part of MVP.

Requirements:
- Shared links must be deterministic.
- Opening a link must reproduce the same map.
- Opening a shared link defaults to read-only mode.
- Read-only shared maps provide a clear Remix/Edit action.
- Scenario schema must include a version field for migrations.
- App should gracefully reject invalid or oversized scenario payloads.

## Technical Direction

Recommended stack:
- React or Next.js for UI.
- MapLibre GL JS, Leaflet, or D3 for map rendering.
- TopoJSON for compact world geometry.
- `lz-string` or similar compression for URL-safe scenario payloads.
- Client-side state management with Zustand, Redux Toolkit, or local React state for MVP.

Rendering recommendation:
- Use SVG/D3 if the first version emphasizes simple polygon editing and direct manipulation.
- Use MapLibre if the first version emphasizes smooth map navigation and future tile support.

For MVP, SVG/D3 is likely simpler because borders, labels, hover states, and polygon ownership changes are easier to inspect and manipulate directly.

## Functional Requirements

- Load a simplified world map.
- Display countries with stable colors.
- Select countries by clicking.
- Select administrative regions inside a country.
- Show selected country details.
- Rename selected country/entity.
- Recolor selected country/entity.
- Convert one or more administrative regions into a new custom country.
- Require a country name before creating a new custom country.
- Rename newly created countries after creation.
- Recolor newly created countries.
- Merge selected countries.
- Transfer administrative regions between countries.
- Select regions by clicking one at a time.
- Select many regions with a brush-selection interaction.
- Undo and redo all editable changes during a session, including scenario title, country/entity names, colors, merges, transfers, and new-country creation.
- Reset to default world map.
- Serialize scenario to URL.
- Deserialize scenario from URL.
- Open shared maps in read-only mode.
- Allow remixing a shared map.

## Non-Functional Requirements

- Initial app load should feel quick on a typical laptop connection.
- Map interactions should remain responsive after dozens of edits.
- Shared URLs should stay reasonably short for typical scenarios.
- The app should not require login.
- The app should avoid sending map edits to a server in MVP.
- Invalid shared data should show a friendly error and offer to start fresh.

## Accessibility

- Toolbar buttons need text labels or accessible labels.
- Country selection state must not rely on color alone.
- Region selection state must not rely on color alone.
- Keyboard users should be able to tab through controls.
- Dialogs should trap focus.
- Read-only shared maps should expose title and description as text.

## Edge Cases

- Countries with tiny geometries should remain selectable through search.
- Island nations need selection behavior that treats separate islands as one country.
- Merging countries with many islands should not break labels or selection.
- Some countries may have no available administrative regions and should be represented by one whole-country fallback region.
- Administrative region datasets may contain naming inconsistencies, overlaps, gaps, or disputed areas.
- The base map should use a neutral/common public dataset as-is rather than manually modeling political disputes in MVP.
- New countries may contain separated regions; contiguity is not required in MVP.
- Region transfers do not require adjacency; far-apart transfers are allowed.
- Region labels should not appear outside transfer/divide modes or low-zoom contexts where they would clutter the map.
- URL payload may exceed browser limits for very large scenarios.
- Invalid scenario versions need a migration or rejection path.
- Undo/redo should cover all editable changes but remain scoped to the current session.

## MVP Milestones

### Milestone 1: Static Map Viewer

- Render world map.
- Load administrative region geometry.
- Pan and zoom.
- Hover and select countries.
- Hover and select regions when a region edit mode is active.
- Show country details.

### Milestone 2: Basic Editing

- Rename country.
- Recolor country.
- Merge countries.
- Create custom country entity state.
- Reset map.
- Undo/redo.

### Milestone 3: Divide Countries And Transfer Territory

- Define administrative regions as editable territory units.
- Select regions inside one country to spawn a new country.
- Require a name before spawning a new country.
- Rename and recolor spawned countries after creation.
- Click regions to transfer ownership.
- Brush-select multiple regions.
- Update colors and labels.
- Preserve changes in scenario state.

### Milestone 4: Sharing

- Serialize scenario.
- Compress into URL.
- Load shared scenario.
- Add read-only and remix modes.

### Milestone 5: Polish

- Improve labels.
- Add search.
- Add share dialog.
- Handle invalid links.
- Test desktop and mobile viewing.

## Open Questions

- In real testing, how often do edited maps exceed the 4 KB typical URL target or 8 KB warning threshold?

## Recommended MVP Decision

Build the first version as a client-only React app using SVG/D3 and simplified country plus first-level geoBoundaries Open ADM1 TopoJSON. Use URL-hash sharing with compressed scenario diffs while typical generated URLs stay under about 4 KB, and defer backend short links unless real scenarios exceed that limit often. Implement rename, recolor, merge, undo/redo, required-name administrative-region country creation, click and brush region selection, and administrative-region transfer. Start with strong major-country coverage and whole-country fallbacks elsewhere. Use a neutral public base dataset as-is. Defer accounts, galleries, freehand border drawing, custom sub-region splitting, and server-side short links until the core toy is fun.
