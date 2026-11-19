"""
BENDO BIO — génère les illustrations SVG des produits et des rayons (public/produits, public/rayons).
Style plat cohérent : fond clair arrondi, ombre au sol, reflets. Relancer : python3 tools/generer_illustrations.py
"""
import math, os, random

OUT = os.path.join(os.path.dirname(__file__), '..', 'public')

def svg(body, bg=('#f3f8ee', '#dcebd3')):
    return f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 400" role="img">
<defs>
  <radialGradient id="bg" cx="50%" cy="40%" r="70%"><stop offset="0" stop-color="{bg[0]}"/><stop offset="1" stop-color="{bg[1]}"/></radialGradient>
  <radialGradient id="shine" cx="35%" cy="30%" r="60%"><stop offset="0" stop-color="#fff" stop-opacity=".55"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient>
</defs>
<rect width="400" height="400" rx="36" fill="url(#bg)"/>
<ellipse cx="200" cy="335" rx="135" ry="20" fill="#000" opacity=".08"/>
{body}
</svg>'''

def g(content, x=0, y=0, s=1, r=0):
    return f'<g transform="translate({x} {y}) rotate({r}) scale({s})">{content}</g>'

# ---------------------------------------------------------------- légumes / fruits
def tomato(color='#e0402b', dark='#b02a1a'):
    return (f'<circle r="62" fill="{color}"/><path d="M-60 8 A62 62 0 0 0 60 8 A62 54 0 0 1 -60 8Z" fill="{dark}" opacity=".35"/>'
            f'<ellipse cx="-20" cy="-22" rx="22" ry="14" fill="#fff" opacity=".35"/>'
            '<path d="M0-58 L12-74 L8-56 L30-64 L14-48 L32-40 L8-44 L0-30 L-8-44 L-32-40 L-14-48 L-30-64 L-8-56 L-12-74Z" fill="#3f8a2e"/>'
            '<rect x="-3" y="-82" width="6" height="16" rx="3" fill="#2f6e22"/>')

def carrot():
    return ('<path d="M-26-70 C-10-74 14-74 26-70 C22-10 8 60 0 96 C-8 60 -22-10 -26-70Z" fill="#f08a24"/>'
            '<path d="M-14-40 h12 M4-14 h12 M-10 12 h10 M2 38 h8" stroke="#c96a12" stroke-width="4" stroke-linecap="round"/>'
            '<path d="M-6-68 C-30-120 -20-130 -4-100 M0-70 C0-130 14-136 8-96 M6-68 C30-118 38-110 14-86" stroke="#3f8a2e" stroke-width="9" fill="none" stroke-linecap="round"/>')

def eggplant():
    return ('<path d="M-10-60 C40-70 70-10 50 50 C35 95 -20 100 -45 70 C-70 40 -45 0 -30-30 C-25-45 -20-55 -10-60Z" fill="#5b2a86"/>'
            '<ellipse cx="22" cy="-10" rx="14" ry="34" fill="#fff" opacity=".18" transform="rotate(-25 22 -10)"/>'
            '<path d="M-30-48 C-20-80 10-80 20-60 C5-58 0-50 -6-40 C-12-48 -20-52 -30-48Z" fill="#3f8a2e"/>'
            '<path d="M-2-74 C0-90 6-100 14-104" stroke="#2f6e22" stroke-width="8" fill="none" stroke-linecap="round"/>')

def garlic():
    return ('<path d="M0-70 C-10-40 -70-30 -70 20 C-70 60 -30 74 0 74 C30 74 70 60 70 20 C70-30 10-40 0-70Z" fill="#f6f1e6" stroke="#d8cdb6" stroke-width="3"/>'
            '<path d="M0-40 C-14 0 -14 40 -6 72 M0-40 C14 0 14 40 6 72 M-30-10 C-44 20 -40 50 -26 68 M30-10 C44 20 40 50 26 68" stroke="#d8cdb6" stroke-width="3" fill="none"/>'
            '<path d="M-4-70 C-6-86 6-86 4-70" fill="#cdbf9f"/><path d="M-30 74 q30 10 60 0" stroke="#bfae8a" stroke-width="3" fill="none"/>')

def onion():
    return ('<path d="M0-74 C-6-50 -70-40 -70 14 C-70 58 -34 74 0 74 C34 74 70 58 70 14 C70-40 6-50 0-74Z" fill="#c9852f"/>'
            '<path d="M0-60 C-30-20 -40 30 -20 72 M0-60 C30-20 40 30 20 72 M0-60 V74" stroke="#9c5f1c" stroke-width="3" fill="none" opacity=".7"/>'
            '<ellipse cx="-26" cy="-4" rx="14" ry="26" fill="#fff" opacity=".2"/>'
            '<path d="M-4-72 C-8-96 -2-108 4-110 C6-96 6-84 4-72Z" fill="#b5893f"/>')

def potato(c='#c99a5b'):
    dots = ''.join(f'<circle cx="{x}" cy="{y}" r="3" fill="#8a6235"/>' for x, y in [(-30,-10),(10,-20),(28,12),(-8,20),(-40,18)])
    return f'<path d="M-62-8 C-60-40 -10-48 30-40 C62-34 70 0 60 24 C48 50 -10 52 -40 40 C-62 30 -64 14 -62-8Z" fill="{c}"/><ellipse cx="-14" cy="-22" rx="26" ry="10" fill="#fff" opacity=".2"/>{dots}'

def lime(cut=False):
    if cut:
        segs = ''.join(f'<path d="M0 0 L{48*math.cos(a):.1f} {48*math.sin(a):.1f} A48 48 0 0 1 {48*math.cos(a+0.9):.1f} {48*math.sin(a+0.9):.1f}Z" fill="#b8e07a" stroke="#eaf7c9" stroke-width="3"/>' for a in [i*2*math.pi/7 for i in range(7)])
        return f'<circle r="58" fill="#4c9a2a"/><circle r="52" fill="#eaf7c9"/>{segs}<circle r="6" fill="#eaf7c9"/>'
    return '<ellipse rx="60" ry="54" fill="#4c9a2a"/><ellipse cx="-18" cy="-18" rx="20" ry="12" fill="#fff" opacity=".3"/><circle cx="58" cy="0" r="5" fill="#3a7a1f"/>'

def cucumber():
    spots = ''.join(f'<circle cx="{x}" cy="{y}" r="3" fill="#9fd07a"/>' for x, y in [(-70,-6),(-40,8),(-10,-8),(20,6),(50,-6),(80,4)])
    return f'<rect x="-110" y="-28" width="220" height="56" rx="28" fill="#2f7a2a"/><rect x="-100" y="-20" width="200" height="12" rx="6" fill="#fff" opacity=".18"/>{spots}<rect x="104" y="-8" width="16" height="16" rx="5" fill="#5b8f2e"/>'

def bean():
    return '<path d="M-120 0 C-60-30 40-30 120 -6 C40-12 -60-10 -120 6Z" fill="#4f9d2a" stroke="#3a7a1f" stroke-width="3"/><path d="M-90-6 C-40-18 30-18 90-8" stroke="#8fcf5f" stroke-width="3" fill="none"/>'

def cabbage():
    return ('<circle r="78" fill="#7cbf4e"/><path d="M-78 0 C-60-60 60-60 78 0 C60-30 -60-30 -78 0Z" fill="#a3d977"/>'
            '<path d="M0-78 C-20-30 -20 30 0 78 M0-40 C-30-30 -50-10 -60 10 M0-10 C30-4 50 10 58 26 M0 20 C-26 26 -44 40 -52 54" stroke="#e6f5d6" stroke-width="4" fill="none" stroke-linecap="round"/>'
            '<path d="M-78 10 C-70 70 70 70 78 10 C60 60 -60 60 -78 10Z" fill="#5a9c35"/>')

def pepper(c='#3d9a2b', dark='#2b7a1d'):
    return (f'<path d="M-58-30 C-70 20 -50 72 -20 74 C-8 75 -4 66 0 66 C4 66 8 75 20 74 C50 72 70 20 58-30 C50-60 20-56 0-50 C-20-56 -50-60 -58-30Z" fill="{c}"/>'
            f'<path d="M-6-46 C-20 0 -16 50 -8 70 M6-46 C20 0 16 50 8 70" stroke="{dark}" stroke-width="5" fill="none" opacity=".5"/>'
            '<ellipse cx="-30" cy="-6" rx="10" ry="26" fill="#fff" opacity=".3"/>'
            '<path d="M-14-50 C-10-62 10-62 14-50 Z" fill="#2f6e22"/><path d="M0-56 C0-74 8-84 18-86" stroke="#2f6e22" stroke-width="9" fill="none" stroke-linecap="round"/>')

def chili(c='#e8501e'):
    return f'<path d="M0-50 C24-48 30-10 18 30 C10 56 -4 70 -14 72 C-4 50 -6 10 -14-30 C-16-44 -10-50 0-50Z" fill="{c}"/><ellipse cx="6" cy="-16" rx="5" ry="18" fill="#fff" opacity=".35"/><path d="M-6-50 C-4-62 8-62 10-50 Z" fill="#2f6e22"/><path d="M2-58 C4-70 12-76 18-76" stroke="#2f6e22" stroke-width="5" fill="none" stroke-linecap="round"/>'

def broccoli():
    heads = ''.join(f'<circle cx="{x}" cy="{y}" r="{r}" fill="#2f7a2a"/><circle cx="{x-r/3:.0f}" cy="{y-r/3:.0f}" r="{r/2.5:.0f}" fill="#4f9d3a"/>' for x, y, r in [(-40,-30,34),(0,-50,38),(40,-30,34),(-20,-10,30),(22,-10,30)])
    return f'<path d="M-16 0 L-26 80 H26 L16 0Z" fill="#9ccc65"/><path d="M-16 30 L-40 10 M16 30 L40 10" stroke="#9ccc65" stroke-width="12" stroke-linecap="round"/>{heads}'

def apple():
    return '<path d="M0-40 C30-70 80-50 74 0 C70 50 30 76 0 64 C-30 76 -70 50 -74 0 C-80-50 -30-70 0-40Z" fill="#d93a2f"/><ellipse cx="-30" cy="-20" rx="16" ry="24" fill="#fff" opacity=".28"/><path d="M0-42 C2-62 6-72 12-80" stroke="#6b3e1d" stroke-width="7" fill="none" stroke-linecap="round"/><path d="M8-66 C30-90 56-80 54-66 C36-56 18-58 8-66Z" fill="#3f8a2e"/>'

def parsley():
    leaves = ''.join(g('<path d="M0 0 C-14-10 -18-28 -6-36 C0-48 14-46 18-34 C30-30 30-12 18-6 C12 6 0 6 0 0Z" fill="#3f9a33"/><path d="M0 0 L8-30" stroke="#2f7a24" stroke-width="2"/>', x, y, 1, r) for x, y, r in [(-40,-70,-30),(-10,-90,0),(24,-78,25),(-50,-30,-50),(40,-40,40),(0,-50,10)])
    return f'<path d="M-30 90 L-8-40 M0 90 L0-60 M30 90 L8-40 M-14 90 L-30-20 M14 90 L30-20" stroke="#5aa33f" stroke-width="5" stroke-linecap="round"/>{leaves}<rect x="-26" y="40" width="52" height="14" rx="4" fill="#c99a5b"/>'

def eggs():
    e = ''.join(f'<ellipse cx="{x}" cy="{y}" rx="24" ry="30" fill="{c}"/><ellipse cx="{x-8}" cy="{y-10}" rx="7" ry="10" fill="#fff" opacity=".5"/>' for x, y, c in [(-60,-10,'#f2e1c4'),(0,-14,'#e8cfa5'),(60,-10,'#f6ead3'),(-60,30,'#e8cfa5'),(0,26,'#f6ead3'),(60,30,'#f2e1c4')])
    return f'<path d="M-100 0 H100 L90 70 H-90Z" fill="#c9b08a"/><path d="M-100 0 H100" stroke="#a88f68" stroke-width="4"/>{e}'

def basket():
    weave = ''.join(f'<path d="M{-90+i*20} 0 v70" stroke="#9c6b34" stroke-width="3"/>' for i in range(10))
    return (f'<path d="M-80-10 C-80-90 80-90 80-10" stroke="#9c6b34" stroke-width="10" fill="none"/>'
            + g(tomato(), -40, -30, .55) + g(eggplant(), 10, -40, .5, 20) + g(carrot(), 50, -30, .5, 30)
            + f'<path d="M-100-10 H100 L86 70 H-86Z" fill="#c48a45"/>{weave}<path d="M-100 20 H100 M-96 46 H96" stroke="#9c6b34" stroke-width="3"/>')

# ---------------------------------------------------------------- volaille
def hen(body='#a0522d', wing='#7a3b1c', tail='#3d2a1a', speckle=False, feet='#e0a030', feather_feet=False):
    sp = ''.join(f'<circle cx="{x}" cy="{y}" r="4" fill="#555" opacity=".5"/>' for x, y in [(-20,0),(0,14),(20,4),(-6,-10),(14,26),(-24,24)]) if speckle else ''
    ff = '<path d="M-26 58 q-14 20 -2 26 q10-6 14-20 M18 58 q-6 22 8 26 q8-8 4-22" fill="#ddd" stroke="#bbb"/>' if feather_feet else ''
    return (f'<path d="M50-20 C80-60 96-30 88 0 C82 20 70 30 60 34" fill="{tail}"/>'
            f'<path d="M-56-30 C-70 10 -50 60 0 62 C50 62 74 30 64-10 C56-40 20-36 0-30 C-20-24 -40-50 -56-30Z" fill="{body}"/>{sp}'
            f'<path d="M-10 0 C10-10 44-6 50 20 C30 30 0 26 -10 0Z" fill="{wing}"/>'
            f'<circle cx="-56" cy="-46" r="24" fill="{body}"/><path d="M-70-70 q6-14 12-4 q6-12 12 0 q8-8 10 6 C-50-64 -64-62 -70-70Z" fill="#d7262d"/>'
            '<path d="M-80-46 L-96-40 L-80-36Z" fill="#f0b030"/><path d="M-76-34 q4 14 10 4" fill="#d7262d"/><circle cx="-62" cy="-50" r="4" fill="#222"/>'
            f'<path d="M-16 60 v24 m-8 0 h16 M14 60 v24 m-8 0 h16" stroke="{feet}" stroke-width="5" stroke-linecap="round"/>{ff}')

def roast():
    return ('<ellipse cx="0" cy="40" rx="120" ry="26" fill="#fff" stroke="#e5e5e5" stroke-width="4"/>'
            '<path d="M-70 20 C-80-40 -20-70 20-60 C70-50 90-10 70 26 C40 44 -40 44 -70 20Z" fill="#f2d3a7"/>'
            '<path d="M60 0 C90-14 110 0 104 16 C96 28 78 24 66 18Z M-60 10 C-92 0 -108 16 -100 30 C-92 40 -74 32 -62 24Z" fill="#ecc795"/>'
            '<circle cx="106" cy="10" r="8" fill="#fff"/><circle cx="-104" cy="26" r="8" fill="#fff"/>'
            '<ellipse cx="-10" cy="-30" rx="40" ry="14" fill="#fff" opacity=".35"/>'
            '<path d="M-40 34 q10 8 20 0 M0 36 q10 8 20 0" stroke="#d9b07a" stroke-width="3" fill="none"/>')

def duck(body='#fafafa', wing='#e2e2e2', head='#fafafa', bill='#f08a24'):
    return (f'<path d="M-70 0 C-80 50 -20 64 30 60 C80 56 96 20 86-10 C80-30 60-20 50-10 C30 0 -10-10 -40-10 C-56-10 -66-8 -70 0Z" fill="{body}" stroke="#ddd" stroke-width="2"/>'
            f'<path d="M-30 10 C0 0 40 4 56 26 C30 40 -10 36 -30 10Z" fill="{wing}"/>'
            f'<path d="M-60-6 C-64-40 -60-70 -40-74 C-16-78 -10-50 -24-30 C-30-20 -40-10 -60-6Z" fill="{head}" stroke="#ddd" stroke-width="2"/>'
            f'<path d="M-44-64 C-60-62 -80-58 -84-50 C-70-46 -56-50 -44-54Z" fill="{bill}"/><circle cx="-36" cy="-60" r="4" fill="#222"/>'
            '<path d="M-10 58 v16 m-10 0 h20 M20 58 v16 m-10 0 h20" stroke="#f08a24" stroke-width="6" stroke-linecap="round"/>')

def chick(c='#ffd23f'):
    return (f'<ellipse cx="6" cy="20" rx="56" ry="48" fill="{c}"/><circle cx="-30" cy="-30" r="34" fill="{c}"/>'
            '<path d="M-20-62 q4-14 10-2 q6-12 8 2" stroke="#e6b800" stroke-width="4" fill="none"/>'
            '<path d="M-62-32 L-80-26 L-62-20Z" fill="#f08a24"/><circle cx="-40" cy="-36" r="5" fill="#222"/><circle cx="-38" cy="-38" r="1.6" fill="#fff"/>'
            '<path d="M10 10 C30 0 50 10 50 30 C34 34 18 28 10 10Z" fill="#f2c200"/>'
            '<path d="M-6 66 v12 m-8 0 h16 M20 66 v12 m-8 0 h16" stroke="#f08a24" stroke-width="5" stroke-linecap="round"/>')

def egg_single():
    return '<ellipse rx="26" ry="32" fill="#f2e1c4"/><ellipse cx="-8" cy="-10" rx="7" ry="10" fill="#fff" opacity=".5"/>'

# ---------------------------------------------------------------- catalogue
P = {
  # légumes existants
  'tomates': g(tomato('#e0402b'), 140, 210) + g(tomato('#f08a24', '#c96a12'), 260, 200, .9) + g(tomato('#7cbf4e', '#4f9d3a'), 200, 270, .8),
  'oignons': g(onion(), 150, 220) + g(onion(), 260, 230, .85, 10),
  'carottes': g(carrot(), 150, 210, 1, -20) + g(carrot(), 210, 210, 1, 0) + g(carrot(), 270, 210, 1, 20),
  'aubergines': g(eggplant(), 160, 210, 1, -10) + g(eggplant(), 250, 220, .9, 25),
  'brocoli': g(broccoli(), 200, 220, 1.3),
  'ail': g(garlic(), 150, 220, .9) + g(garlic(), 250, 220, 1),
  'pommes': g(apple(), 150, 220, .9) + g(apple(), 260, 220, 1),
  'persil': g(parsley(), 200, 220, 1.4),
  'oeufs': g(eggs(), 200, 230, 1.3),
  # nouveaux légumes / fruits
  'haricots-verts': ''.join(g(bean(), 200, 160 + i*30, 1, (i-2)*6) for i in range(5)),
  'chou': g(cabbage(), 200, 215, 1.4),
  'poivrons-verts': g(pepper(), 150, 215) + g(pepper(), 260, 225, .9, 12),
  'poivrons-rouges': g(pepper('#d93a2f', '#a82418'), 150, 215) + g(pepper('#e0402b', '#a82418'), 260, 225, .9, 12),
  'piments': ''.join(g(chili(c), x, y, 1, r) for x, y, r, c in [(130,220,-20,'#e8501e'),(180,210,-5,'#f08a24'),(230,215,10,'#d7262d'),(280,225,25,'#e8501e')]),
  'pommes-de-terre': g(potato(), 150, 220) + g(potato('#d4a86a'), 260, 230, .85, 20) + g(potato('#bf8c4e'), 210, 270, .7, -15),
  'citrons-verts': g(lime(), 140, 210, .9) + g(lime(), 240, 200, .85) + g(lime(True), 210, 270, .9),
  'concombres': g(cucumber(), 200, 190, 1, -15) + g(cucumber(), 200, 260, .9, 8),
  # volaille
  'poulet-bicyclette': g(hen(), 210, 220, 1.5),
  'poulet-pret-a-cuire': g(roast(), 200, 220, 1.3),
  'poulet-brahma': g(hen('#f2f2f2', '#d0d0d0', '#333', True, '#e0a030', True), 210, 215, 1.55),
  'poulet-chair': g(roast(), 200, 220, 1.2),
  'canard': g(duck(), 210, 220, 1.5),
  'canard-pret-a-cuire': g(roast(), 200, 220, 1.4),
  'caneton': g(chick('#ffe066'), 150, 220, 1) + g(chick('#ffd23f'), 260, 230, .85),
  'poussin-chair': g(chick(), 200, 220, 1.4),
  'poussin-bicyclette': g(chick('#e3b23c'), 150, 220, 1.05) + g(chick('#c98a2c'), 260, 230, .85),
  'pondeuse': g(hen('#8b4513', '#5e2d0c', '#2a1a10'), 190, 210, 1.4) + g(egg_single(), 310, 290, 1),
}
R = {  # rayons
  'legumes': g(carrot(), 140, 210, .9, -20) + g(tomato(), 240, 190, .8) + g(eggplant(), 260, 270, .7, 30),
  'fruits': g(apple(), 150, 220, .9) + g(lime(True), 260, 230, .9),
  'herbes': g(parsley(), 200, 220, 1.4),
  'laitiers': g(eggs(), 200, 230, 1.3),
  'epicerie': g(basket(), 200, 240, 1.4),
  'poulets': g(hen(), 210, 220, 1.5),
  'canards': g(duck(), 210, 220, 1.5),
  'poussins': g(chick(), 140, 230, 1) + g(chick('#ffe066'), 260, 230, .9),
}
for name, body in P.items():
    open(os.path.join(OUT, 'produits', f'{name}.svg'), 'w').write(svg(body))
for name, body in R.items():
    open(os.path.join(OUT, 'rayons', f'{name}.svg'), 'w').write(svg(body, ('#fff8ec', '#f6e3c6')))
print(len(P), 'produits,', len(R), 'rayons')
