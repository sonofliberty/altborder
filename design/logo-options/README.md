# AltBorder logo options

These are three proposed logos. No option is selected or installed in the app.

| Option | Idea | Lettering |
| --- | --- | --- |
| A · Border A | A border cuts through the letter A. | Barlow Semibold |
| B · New Territory | Two map pieces form a new shape. | Barlow Semibold |
| C · Alternate Atlas | A changing border inside a world. | Cinzel Medium |

Open `mockups.html` to compare the options. `desktop.png` and `mobile.png` show the checked renders at 728px and 390px. Each option includes a large logo, a one-color logo, symbols at 16px, 24px, and 32px, and an app-header mockup.

Each option has color, dark-ink, and white SVG logos, plus color and dark-ink symbols. SVG lettering uses paths, so the files do not need installed fonts. The files have transparent backgrounds. The color and white logos are for dark surfaces.

The symbols are original vector geometry. The colors come from the existing AltBorder palette. The lettering comes from the supplied Barlow and Cinzel fonts. Their license files are in `public/fonts/Barlow-OFL.txt` and `public/fonts/Cinzel-OFL.txt`.

`map-context.jpg` is a crop of the existing `.impeccable/review/desktop.png`. It gives visual context only. It is not part of any logo. The PNG sheets are renders of `mockups.html`; they are not AI-generated images.

To rebuild the SVG files and HTML:

```sh
uv run --with fonttools python design/logo-options/build_mockups.py
```

The production app and its design system remain unchanged. Choose an option before adding a logo to them.
