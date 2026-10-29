# AltBorder: Own World

The project owner selected option F, Own World, from the second logo round.

The logo pairs a flowing flag with the custom AltBorder lettering from the selected concept. A curved border separates two invented territories. The final SVG artwork uses flat fills. The fine edge highlight in the concept image is removed so the border stays clear at small sizes.

## Files

The production SVG files are in `public/brand/`:

- `altborder-logo-light.svg`: orange and cream, for dark surfaces. Used in the app header.
- `altborder-logo-dark.svg`: orange and forest green, for light surfaces.
- `altborder-logo-forest.svg`: one color, for light surfaces.
- `altborder-logo-white.svg`: one color, for dark surfaces.
- `altborder-mark-color.svg`, `altborder-mark-forest.svg`, `altborder-mark-white.svg`: the flag without lettering.
- `favicon.svg`: the flag on a forest-green square. PNG versions are supplied at 32px and 180px.

Transparent PNG logos at 2780px wide and a 512px app icon are in `design/brand-f/png/`.

## Use

Keep the aspect ratio. Do not stretch the flag or lettering. Use the complete logo at widths of 138px or more. Use the flag below this width. Leave clear space equal to at least one quarter of the flag height on all sides.

Logo colors:

| Color | Value |
| --- | --- |
| Orange | `#ff7a14` |
| Forest green | `#123f29` |
| Cream | `#faf6e9` |

These colors belong to the logo. The map themes and editor controls retain their own colors.

## Source and build

The selected concept is `design/logo-options/round-2/f-own-world.png`. It was made with the built-in ImageGen tool; its exact prompt is `f-own-world.prompt.txt` beside it. The owner selected F in this conversation.

The lettering and flag contours were traced from that concept with Potrace, with smooth curves and flat colors. Lettering is stored as paths and needs no font. `source/` contains the trace inputs and SVG paths. `build_assets.py` builds the production SVG files from these paths.

```sh
python3 design/brand-f/build_assets.py
```

No logo-specific runtime package is required.
