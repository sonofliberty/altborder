"""Build the round 2 selection sheet from the generated concept boards."""
from pathlib import Path

OUT = Path(__file__).resolve().parent
OPTIONS = [
    ('D · Faultline', 'Custom lettering with a red border cut.', 'd-faultline.png'),
    ('E · Contour', 'A flowing ab symbol with a map-like boundary.', 'e-contour.png'),
    ('F · Own World', 'An invented flag for a world you can change.', 'f-own-world.png'),
]

sections = ''.join(
    f'<section><h2>{title}</h2><p>{description}</p>'
    f'<img src="{filename}" alt="{title}: AltBorder logo concept, with color and reverse versions" width="1536" height="1024"></section>'
    for title, description, filename in OPTIONS
)
html = f'''<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>AltBorder logos: round 2</title><style>
*{{box-sizing:border-box}}html,body{{margin:0;background:transparent}}
body{{font-family:var(--font-sans,system-ui,sans-serif);color:var(--foreground,#172126)}}
section{{margin:0 0 28px}}section:last-child{{margin-bottom:0}}
h2{{margin:0 0 7px;font-size:20px;line-height:1.3;letter-spacing:-.02em;font-weight:650}}
p{{margin:0 0 14px;font-size:14px;line-height:1.5;color:var(--muted-foreground,#485951)}}
img{{display:block;width:100%;height:auto;border-radius:var(--radius,14px)}}
::selection{{background:var(--primary);color:var(--primary-foreground)}}
@media(max-width:480px){{h2{{font-size:19px}}p{{font-size:13px}}}}
</style></head><body><main>{sections}</main></body></html>'''
(OUT / 'mockups.html').write_text(html)
print(OUT / 'mockups.html')
