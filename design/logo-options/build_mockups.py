"""Build original AltBorder logo concepts. Run with: uv run --with fonttools python this-file."""
from pathlib import Path
from base64 import b64encode
from fontTools.ttLib import TTFont
from fontTools.pens.svgPathPen import SVGPathPen
from fontTools.pens.transformPen import TransformPen
import json

ROOT = Path(__file__).resolve().parents[2]
OUT = Path(__file__).resolve().parent
GOLD, IVORY, INK = '#c8ac73', '#f3eedf', '#172126'

def lettering(text, face, size, tracking, color):
    font = TTFont(ROOT / 'public/fonts' / face)
    glyphs = font.getGlyphSet()
    cmap = font.getBestCmap()
    scale = size / font['head'].unitsPerEm
    x, paths = 0, []
    for char in text:
        name = cmap[ord(char)]
        pen = SVGPathPen(glyphs, ntos=lambda value: f'{value:.2f}'.rstrip('0').rstrip('.') if value else '0')
        glyphs[name].draw(TransformPen(pen, (scale, 0, 0, -scale, x, size)))
        paths.append(f'<path d="{pen.getCommands()}"/>')
        x += glyphs[name].width * scale + tracking
    return f'<g fill="{color}">{"".join(paths)}</g>', x - tracking

def symbol(kind, primary=GOLD, secondary=IVORY, key='mark'):
    if kind == 'a':
        # A territory border cuts through a custom A silhouette.
        return f'''<defs><mask id="{key}"><rect width="64" height="64" fill="white"/><path d="M37 3 30 22 36 28 29 37 35 44 31 61" fill="none" stroke="black" stroke-width="3.5" stroke-linejoin="miter"/></mask></defs><path mask="url(#{key})" fill="{primary}" fill-rule="evenodd" d="M4 58 25 6H39L60 58H46L41 45H23L18 58ZM27 34H37L32 21Z"/>'''
    if kind == 'b':
        return f'''<path fill="{primary}" d="M7 8H39L31 21 39 29 25 43H7Z"/><path fill="{secondary}" d="M45 21H58V56H26L34 43 26 35Z"/>'''
    return f'''<circle cx="32" cy="32" r="25" fill="none" stroke="{primary}" stroke-width="4"/><path d="M35 7 27 20 37 30 26 43 31 57M8 32H29M38 32H56" fill="none" stroke="{primary}" stroke-width="4" stroke-linejoin="round"/>'''

def icon(kind, size=64, mono=False, key='mark', color=INK):
    return f'<svg xmlns="http://www.w3.org/2000/svg" width="{size}" height="{size}" viewBox="0 0 64 64" aria-hidden="true">{symbol(kind, color if mono else GOLD, color if mono else IVORY, key)}</svg>'

def lockup(kind, mono=False, key='logo', color=INK):
    face = 'cinzel-medium.ttf' if kind == 'c' else 'barlow-semibold.ttf'
    size = 46 if kind == 'c' else 52
    paths, width = lettering('ALTBORDER', face, size, 1.1 if kind == 'c' else 1.7, color if mono else IVORY)
    mark = symbol(kind, color if mono else GOLD, color if mono else IVORY, key)
    return f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width+92:.2f} 76" role="img" aria-label="AltBorder logo"><g transform="translate(0 4)">{mark}</g><g transform="translate(86 3)">{paths}</g></svg>'

concepts = [
    ('a', 'A · Border A', 'A border cuts through the letter A. Compact and bold.', 'border-a'),
    ('b', 'B · New Territory', 'Two map pieces form a new shape. Clear and playful.', 'new-territory'),
    ('c', 'C · Alternate Atlas', 'A changing border inside a world. A classic atlas style.', 'alternate-atlas'),
]

sections = []
definitions = []
def shared_lockup(kind, mono=False, key='logo'):
    import re
    svg = lockup(kind, mono, key)
    viewbox = re.search(r'viewBox="([^"]+)"', svg).group(1)
    body = svg[svg.index('>')+1:-6]
    definitions.append(f'<symbol id="{key}-shared" viewBox="{viewbox}">{body}</symbol>')
    return f'<svg viewBox="{viewbox}" role="img" aria-label="AltBorder logo"><use href="#{key}-shared"/></svg>'

for kind, title, description, slug in concepts:
    for suffix, mono, color in [('color', False, INK), ('black', True, INK), ('white', True, IVORY)]:
        (OUT / f'{slug}-{suffix}.svg').write_text(lockup(kind, mono, f'{slug}-{suffix}', color))
    (OUT / f'{slug}-icon.svg').write_text(icon(kind, key=f'{slug}-icon'))
    (OUT / f'{slug}-icon-black.svg').write_text(icon(kind, mono=True, key=f'{slug}-icon-black'))
    sections.append(f'''<section aria-labelledby="title-{kind}">
      <h2 id="title-{kind}">{title}</h2><p>{description}</p>
      <div class="specimen">
        <div class="hero">{shared_lockup(kind, key=kind+'hero')}<span>History is optional.</span></div>
        <div class="proofs"><div class="mono">{shared_lockup(kind, True, kind+'mono')}<span>One color</span></div>
          <div class="sizes">{''.join(f'<div>{icon(kind, size, mono=True, key=kind+str(size))}<span>{size} px</span></div>' for size in [16,24,32])}</div></div>
        <div class="context"><div class="toolbar"><div class="toolbar-logo"><svg viewBox="0 0 {float(lockup(kind).split('viewBox="0 0 ')[1].split(' ')[0])} 76" role="img" aria-label="AltBorder logo"><use href="#{kind}hero-shared"/></svg></div><span class="scenario">Your alternate world</span><span class="share">Share</span></div><div class="map"><span>In the app header · mockup</span></div></div>
      </div>
    </section>''')

css = '''
*{box-sizing:border-box}html,body{margin:0;background:transparent}body{font-family:var(--font-sans,system-ui,sans-serif);color:var(--foreground,#172126)}
main{width:100%}section{margin:0 0 30px}section:last-child{margin-bottom:0}h2{font-size:19px;font-weight:650;line-height:1.25;margin:0 0 7px;letter-spacing:-.02em}p{font-size:13px;line-height:1.5;color:var(--muted-foreground,#485951);margin:0 0 14px}
.specimen{border-radius:var(--radius,16px);overflow:hidden;background:#172126}.hero{height:170px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;padding:24px}.hero>svg{width:365px;max-width:90%;height:auto;overflow:visible}.hero>span{color:#b8beb8;font-size:11px;letter-spacing:.08em}
.proofs{background:#f3eedf;color:#172126;min-height:89px;padding:15px 27px;display:flex;align-items:center;justify-content:space-between;gap:20px}.mono{display:flex;flex-direction:column;gap:4px;align-items:flex-start}.mono>svg{width:185px;max-width:100%}.mono>span,.sizes span{font-size:11px;color:#515c58}.sizes{display:flex;align-items:flex-end;gap:24px}.sizes>div{display:flex;flex-direction:column;align-items:center;gap:6px}.sizes svg{display:block}
.toolbar{height:48px;display:flex;align-items:center;gap:20px;padding:0 19px;background:#172126}.toolbar-logo{width:149px;display:flex;align-items:center}.toolbar-logo>svg{width:100%;height:auto}.scenario{border-left:1px solid #485951;padding-left:20px;color:#dddcd3;font-size:11px}.share{margin-left:auto;background:#c8ac73;color:#1b211f;font-size:11px;font-weight:650;padding:6px 13px;border-radius:4px}.map{height:43px;background:url('MAP_IMAGE') center 40%/cover;display:flex;align-items:center;justify-content:flex-end;padding:0 13px}.map>span{background:#172126;color:#dddcd3;padding:4px 7px;font-size:11px;border-radius:3px}
::selection{background:#c8ac73;color:#172126}@media(max-width:480px){.hero{height:149px;padding:18px}.hero>svg{max-width:100%}.proofs{padding:14px 16px;gap:14px}.mono>svg{width:150px}.sizes{gap:12px}.toolbar{gap:12px;padding:0 13px}.toolbar-logo{width:140px}.scenario{display:none}p{font-size:12px}.sizes span{font-size:11px}}
'''
# Use a narrow crop of the existing app screenshot as context only.
css = css.replace('MAP_IMAGE', './map-context.jpg')
defs = '<svg xmlns="http://www.w3.org/2000/svg" width="0" height="0" style="position:absolute" aria-hidden="true"><defs>'+''.join(definitions)+'</defs></svg>'
html = f'<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>AltBorder logo options</title><style>{css}</style></head><body>{defs}<main>{"".join(sections)}</main></body></html>'
(OUT / 'mockups.html').write_text(html)
(OUT / 'concepts.json').write_text(json.dumps([{'id': k.upper(), 'name': t[4:], 'description': d, 'file': f'{s}-color.svg'} for k,t,d,s in concepts], indent=2)+'\n')
print(f'Wrote three concepts and mockups to {OUT}')
