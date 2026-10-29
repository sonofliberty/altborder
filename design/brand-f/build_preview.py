from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
BRAND = ROOT / 'public/brand'
def asset(name):
    return str(BRAND / name)

icons = ''.join(f'<div><img src="{asset("favicon.svg")}" width="{size}" height="{size}" alt="AltBorder icon at {size} pixels"><span>{size}px</span></div>' for size in [16,24,32,48])
html = f'''<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>AltBorder · Own World</title><style>
*{{box-sizing:border-box}}html,body{{margin:0;background:transparent}}body{{color:var(--foreground,#172126);font-family:var(--font-sans,system-ui,sans-serif)}}
.hero{{background:#123f29;padding:58px 28px;border-radius:var(--radius,14px);margin-bottom:16px}}.hero img{{display:block;width:100%;height:auto;max-width:610px;margin:auto}}
.variants{{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:22px}}.variant{{border-radius:var(--radius,14px);padding:24px 20px;background:#faf6e9}}.variant.dark{{background:#172126}}.variant img{{display:block;width:100%;height:auto}}.variant span{{display:block;font-size:12px;margin-top:15px;color:#123f29}}.variant.dark span{{color:#faf6e9}}
.icons{{display:flex;gap:32px;align-items:flex-end}}.icons>div{{display:flex;flex-direction:column;align-items:center;gap:9px}}.icons span{{font-size:12px;color:var(--muted-foreground,#485951)}}
@media(max-width:480px){{.hero{{padding:36px 16px}}.variants{{gap:12px}}.variant{{padding:20px 12px}}.icons{{gap:26px}}}}
</style></head><body><main><div class="hero"><img src="{asset('altborder-logo-light.svg')}" width="1390" height="335" alt="AltBorder: orange and cream flag, with a curved border and custom lettering"></div>
<div class="variants"><div class="variant"><img src="{asset('altborder-logo-forest.svg')}" width="1390" height="335" alt="One-color forest-green logo"><span>One color · light surface</span></div><div class="variant dark"><img src="{asset('altborder-logo-white.svg')}" width="1390" height="335" alt="One-color white logo"><span>One color · dark surface</span></div></div><div class="icons">{icons}</div></main></body></html>'''
(HERE / 'preview.html').write_text(html)
print(HERE / 'preview.html')
