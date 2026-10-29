"""Build the selected F identity from smoothed vector traces of the approved concept."""
from pathlib import Path
from xml.etree import ElementTree as ET

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
PUBLIC = ROOT / 'public/brand'
PUBLIC.mkdir(parents=True, exist_ok=True)
NS = {'s': 'http://www.w3.org/2000/svg'}
ORANGE, FOREST, CREAM = '#ff7a14', '#123f29', '#faf6e9'

def traced_paths(filename):
    return [p.attrib['d'] for p in ET.parse(HERE / 'source' / filename).findall('.//s:path', NS)]

orange_path = traced_paths('flag-orange-trace.svg')[0]
# The largest lower shape is the second ivory path. The other paths are a fine
# edge highlight and a letter outside the crop. Neither belongs in the flat mark.
lower_path = traced_paths('flag-ivory-trace.svg')[1]
letters = traced_paths('wordmark-trace.svg')

def flag(top, bottom):
    return f'<g transform="translate(0 335) scale(.1 -.1)"><path fill="{top}" d="{orange_path}"/><path fill="{bottom}" d="{lower_path}"/></g>'

def svg(body, viewbox, title='AltBorder'):
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="{viewbox}" role="img" aria-labelledby="title"><title id="title">{title}</title>{body}</svg>\n'

def logo(top, bottom, ink):
    text = ''.join(f'<path d="{p}"/>' for p in letters)
    return svg(flag(top,bottom) + f'<g transform="translate(435 278) scale(.1 -.1)" fill="{ink}">{text}</g>', '0 0 1390 335')

for name, colors in {
    'light': (ORANGE,CREAM,CREAM),
    'dark': (ORANGE,FOREST,FOREST),
    'forest': (FOREST,FOREST,FOREST),
    'white': ('#ffffff','#ffffff','#ffffff'),
}.items():
    (PUBLIC / f'altborder-logo-{name}.svg').write_text(logo(*colors))

for name, colors in {
    'color': (ORANGE,CREAM),
    'forest': (FOREST,FOREST),
    'white': ('#ffffff','#ffffff'),
}.items():
    (PUBLIC / f'altborder-mark-{name}.svg').write_text(svg(flag(*colors),'0 0 420 335'))

favicon = f'<rect width="64" height="64" rx="13" fill="{FOREST}"/><g transform="translate(6.8 12) scale(.12)">{flag(ORANGE,CREAM)}</g>'
(PUBLIC / 'favicon.svg').write_text(svg(favicon,'0 0 64 64','AltBorder flag'))
print(f'Wrote 8 SVG assets to {PUBLIC}')
