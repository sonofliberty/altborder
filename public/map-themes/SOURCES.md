# Map theme assets

These are original AltBorder map styles informed by the political maps in
Hearts of Iron IV and Europa Universalis IV. No game artwork, textures or fonts
are included. Current AltBorder borders and country names remain authoritative.

## Geographic textures

Natural Earth raster data is public domain:
https://www.naturalearthdata.com/about/terms-of-use/

- Shaded Relief, 1:50m:
  https://www.naturalearthdata.com/downloads/50m-raster-data/50m-shaded-relief/
  Original archive: https://naciscdn.org/naturalearth/50m/raster/SR_50M.zip
- Natural Earth II with Shaded Relief and Water, 1:50m:
  https://www.naturalearthdata.com/downloads/50m-raster-data/50m-natural-earth-2/
  Original archive: https://naciscdn.org/naturalearth/50m/raster/NE2_50M_SR_W.zip

`ocean.webp` is tinted Natural Earth II, projected to AltBorder's Natural Earth
projection. `hoi4.webp` combines land luminance and strong relief in a single
transparent layer. `eu4.webp` contains low-opacity relief. Both land textures
are clipped to the current country fills at runtime, after any territory edits.
Political colors are not baked into the textures.

To regenerate, convert the original TIFFs to full-size `relief.jpg` and
`natural-earth-2.jpg` in a local source directory. Run:

    node scripts/prepare-map-theme-assets.mjs /path/to/source-directory

The preparation script requires ffmpeg, ffprobe and cwebp. The app build does
not require these tools. Committed WebP files are ready to serve. Land textures
are 6000 × 3360; the ocean is 4000 × 2240. Projection parameters are stored in
`src/mapThemeRaster.json`. The app adjusts scale and translation to the active
map projection and performs no raster reprojection in the browser.

Each texture also has a 2400 × 1344 `-overview.webp` variant, derived from its
full-size WebP with cwebp (`-resize 2400 0 -q 80 -alpha_q 60 -m 6 -mt`). The
world view uses these smaller files. Full detail loads when the settled zoom,
canvas size, and device pixel ratio require more than 2400 horizontal pixels.
The overview stays visible until the detail image has decoded, including if
the detail request fails. Zooming back out restores the overview texture.

## Fonts

Barlow Semibold (600) and Cinzel Medium (500), from Google Fonts:

- https://fonts.google.com/specimen/Barlow
- https://github.com/google/fonts/tree/main/ofl/barlow
- https://fonts.google.com/specimen/Cinzel
- https://github.com/google/fonts/tree/main/ofl/cinzel

Both are distributed under the SIL Open Font License 1.1. Original license
texts are included beside the self-hosted font files in `public/fonts`.
The browser uses WOFF2 copies, converted from the supplied TTF files with
FontTools and Brotli. The conversion retains every glyph and font metric.
To regenerate, load each TTF with `fontTools.ttLib.TTFont`, set `flavor` to
`"woff2"`, and save beside the source with the `.woff2` extension.

## Visual references

- https://store.steampowered.com/app/394360/Hearts_of_Iron_IV/
- https://store.steampowered.com/app/236850/Europa_Universalis_IV/

HOI4 uses muted colors, outlined names, strong relief and thin borders. EU4
uses bright colors, serif names, subtle relief and pale coastal water.
