"""Player-character sheets for Lexicon Realms: 5 classes x 3 looks.

    python tools/art/build_chars.py            # all classes, contact sheets, lineup, walk gif
    python tools/art/build_chars.py warden     # one class

Output per class: assets/sprites/chars/<class>.png + .json (+ <class>_emissive.png: only the glowing
pixels, for an additive glow pass). Frames are 32x40, origin [16,39] = the point between the feet.
Rows: one per (look, dir), 12 columns: idle 0-1, walk 0-3, attack 0-2, cast 0-1, hurt 0; last row: dead.
Frame names: look{n}_{anim}_{dir}_{i}. Right is the mirrored left (the weapon stays in the near hand).
"""
import os, sys, math, copy
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrpix as X
import lrdoll as D
import lr_parts as P

DIRS = ['down', 'left', 'right', 'up']
ANIMS = [('idle', 2), ('walk', 4), ('attack', 3), ('cast', 2), ('hurt', 1)]
FPS = {'idle': 2, 'walk': 8, 'attack': 12, 'cast': 6, 'hurt': 8, 'dead': 1}
LOOP = {'idle': True, 'walk': True, 'attack': False, 'cast': True, 'hurt': False, 'dead': False}


def R(name, *idx):
    return ['%s:%d' % (name, i) for i in idx]


SKIN = {'light': R('skin_light', 0, 1, 2, 3), 'med': R('skin_med', 0, 1, 2, 3),
        'dark': R('skin_dark', 1, 2, 3, 4)}
HAIR = {'brown': R('hair_brown', 1, 2, 3, 4), 'black': R('shadow', 0, 1, 2, 3), 'blonde': R('gold', 1, 2, 3, 4),
        'auburn': R('roof_red', 1, 2, 3, 4), 'grey': R('stone_cool', 1, 2, 3, 4), 'white': R('metal', 1, 2, 3, 4),
        'violet': R('hair_violet', 1, 2, 3, 4), 'dark': R('hair_brown', 0, 1, 2, 3)}
STEEL = ['metal:0', 'metal:1', 'metal:2', 'metal:3']
EYES = ['ink:2', 'ink:2']

# glow ramps per class (deep, base, hot)
GLOW = {'warden': ['gold:3', 'gold:4', 'gold:5'], 'mender': ['grass:4', 'grass:5', 'gold:5'],
        'scribe': ['magic_cyan:2', 'magic_cyan:3', 'magic_cyan:4'], 'wayfinder': ['grass:4', 'grass:5', 'gold:5'],
        'inkblade': ['magic_violet:2', 'magic_violet:3', 'magic_violet:4']}

# ------------------------------------------------------------------ classes and looks
CLASSES = {
 'warden': {'body': 'plate', 'legs': 'greaves', 'sleeve': 'metal', 'hand': 'metal', 'caps': 'pauldron',
            'main': 'sword', 'off': 'shield', 'cape': True},
 'mender': {'body': 'robe', 'legs': 'robe', 'sleeve': 'top', 'hand': 'skin', 'cuff': 'sec',
            'main': 'staff', 'off': None},
 'scribe': {'body': 'robe', 'legs': 'robe', 'sleeve': 'top', 'hand': 'skin', 'cuff': 'sec',
            'main': 'quill', 'off': 'tome', 'strap': True},
 'wayfinder': {'body': 'tunic', 'legs': 'trousers', 'sleeve': 'top', 'hand': 'shoes', 'cuff': None,
               'main': None, 'off': 'bow', 'quiver': True, 'strap': True},
 'inkblade': {'body': 'tunic', 'legs': 'trousers', 'sleeve': 'top', 'hand': 'shoes', 'cuff': None,
              'main': 'dagger', 'off': 'dagger'},
}


def look(head, skin, hair, top, sec, bottom, shoes, accent, extra=None, **kw):
    pal = {'skin': SKIN[skin], 'hair': HAIR[hair], 'top': top, 'sec': sec, 'bottom': bottom, 'shoes': shoes,
           'accent': accent, 'eyes': EYES, 'metal': STEEL, 'wood': R('wood', 2, 3, 4),
           'hat': R('shadow', 0, 1, 2, 3), 'cape': R('cloth_blue', 0, 1, 2, 3)}
    if extra:
        pal.update(extra)
    d = {'head': head, 'pal': pal}
    d.update(kw)
    return d


LOOKS = {
 'warden': [
  look('short', 'light', 'brown', R('cloth_blue', 0, 1, 2, 3), R('cloth_blue', 1, 2, 3, 4), STEEL,
       R('wood', 1, 2, 3), R('gold', 2, 3, 4), beard='short', desc='masc, light skin, brown hair and beard, blue tabard',
       extra={'cape': R('cloth_blue', 0, 1, 2, 3), 'sec': R('cloth_blue', 1, 2, 3, 4)}),
  look('pony', 'med', 'auburn', R('roof_red', 1, 2, 3, 4), R('roof_red', 1, 2, 3, 4), STEEL,
       R('wood', 1, 2, 3), R('gold', 2, 3, 4), desc='fem, medium skin, auburn ponytail, crimson tabard',
       extra={'cape': R('roof_red', 1, 2, 3, 4)}),
  look('short', 'dark', 'black', R('roof_green', 1, 2, 3, 4), R('roof_green', 1, 2, 3, 4), STEEL,
       R('wood', 0, 1, 2), R('metal', 1, 2, 3), hat='helmet', desc='helmed, dark skin, forest-green tabard',
       extra={'cape': R('roof_green', 1, 2, 3, 4)}),
 ],
 'mender': [
  look('long', 'light', 'blonde', R('sand', 0, 1, 2, 3), R('grass', 2, 3, 4, 5), R('sand', 0, 1, 2),
       R('wood', 1, 2, 3), R('gold', 2, 3, 4), desc='fem, light skin, long blonde hair, cream robe, green stole'),
  look('short', 'dark', 'black', R('metal', 1, 2, 3, 4), R('gold', 1, 2, 3, 4), R('metal', 1, 2, 3),
       R('wood', 1, 2, 3), R('gold', 2, 3, 4), beard='short', desc='masc, dark skin, short beard, white robe, gold stole'),
  look('bun', 'med', 'grey', R('roof_green', 1, 2, 3, 4), R('sand', 0, 1, 2, 3), R('roof_green', 1, 2, 3),
       R('wood', 1, 2, 3), R('gold', 2, 3, 4), desc='fem, medium skin, grey bun, sage robe, cream stole'),
 ],
 'scribe': [
  look('spiky', 'light', 'brown', R('roof_blue', 0, 1, 2, 3), R('gold', 1, 2, 3, 4), R('roof_blue', 0, 1, 2),
       R('wood', 1, 2, 3), R('gold', 2, 3, 4), desc='masc, light skin, spiky brown hair, ink-blue coat, gold trim'),
  look('bun', 'dark', 'black', R('cloth_purple', 1, 2, 3, 4), R('sand', 0, 1, 2, 3), R('cloth_purple', 0, 1, 2),
       R('wood', 1, 2, 3), R('gold', 2, 3, 4), desc='fem, dark skin, black bun, plum coat, parchment trim'),
  look('long', 'med', 'auburn', R('roof_red', 0, 1, 2, 3), R('metal', 1, 2, 3, 4), R('roof_red', 0, 1, 2),
       R('wood', 1, 2, 3), R('metal', 1, 2, 3), desc='fem, medium skin, long auburn hair, wine-red coat, silver trim'),
 ],
 'wayfinder': [
  look('pony', 'light', 'blonde', R('roof_green', 1, 2, 3, 4), R('wood', 2, 3, 4, 5), R('earth', 1, 2, 3),
       R('wood', 1, 2, 3), R('gold', 2, 3, 4), desc='fem, light skin, blonde ponytail, green jerkin',
       extra={'cape': R('wood', 1, 2, 3, 4)}),
  look('short', 'med', 'brown', R('earth', 1, 2, 3, 4), R('roof_green', 1, 2, 3, 4), R('roof_green', 0, 1, 2),
       R('wood', 0, 1, 2), R('metal', 1, 2, 3), beard='full', desc='masc, medium skin, full beard, leather jerkin',
       extra={'cape': R('wood', 1, 2, 3, 4)}),
  look('long', 'dark', 'black', R('roof_red', 1, 2, 3, 4), R('earth', 1, 2, 3, 4), R('earth', 1, 2, 3),
       R('wood', 0, 1, 2), R('gold', 2, 3, 4), desc='fem, dark skin, long black hair, russet jerkin',
       extra={'cape': R('wood', 1, 2, 3, 4)}),
 ],
 'inkblade': [
  look('short', 'light', 'black', R('ink', 1, 2, 3, 4), R('roof_red', 1, 2, 3, 4), R('stone_cool', 0, 1, 2),
       R('shadow', 0, 1, 2), R('roof_red', 2, 3, 4), hat='cowl', desc='hooded and masked, charcoal hood, ink-blue leathers, crimson sash',
       extra={'hat': R('stone_cool', 0, 1, 2, 3)}),
  look('pony', 'med', 'violet', R('stone_cool', 0, 1, 2, 3), R('roof_green', 1, 2, 3, 4), R('ink', 1, 2, 3),
       R('shadow', 0, 1, 2), R('roof_green', 2, 3, 4), mask='mask', desc='fem, medium skin, violet ponytail, slate leathers, green mask and sash',
       extra={'hat': R('roof_green', 1, 2, 3, 4)}),
  look('spiky', 'dark', 'white', R('cloth_purple', 0, 1, 2, 3), R('shadow', 1, 2, 3, 3), R('shadow', 0, 1, 2),
       R('shadow', 0, 1, 2), R('metal', 1, 2, 3), desc='masc, dark skin, white spiky hair, plum leathers'),
 ],
}

# ------------------------------------------------------------------ geometry (LQ body coords)
SHOULDER = {'down': {'main': (5, 17), 'off': (18, 17)},
            'up': {'main': (18, 17), 'off': (5, 17)},
            'left': {'main': (9, 16), 'off': (12, 16)}}
HANG = {'down': {'main': (5, 22), 'off': (18, 22)},
        'up': {'main': (18, 22), 'off': (5, 22)},
        'left': {'main': (9, 22), 'off': (12, 21)}}
W_ARM = {'down': 3, 'up': 3, 'left': 2}


def arm(d, side, hand, elbow=None, layer=None):
    """an arm from the shoulder to `hand` (optionally via an elbow)"""
    sh = SHOULDER[d][side]
    pts = [sh] + ([elbow] if elbow else []) + [hand]
    if layer is None:
        layer = 'back' if (d == 'left' and side == 'off') else 'front'
    return {'pts': pts, 'layer': layer}


def P_(**kw):
    base = {'main': None, 'off': None, 'wmain': None, 'woff': None, 'glow': [], 'bob': 0, 'lean': (0, 0),
            'closed': False, 'head_dx': 0}
    base.update(kw)
    return base


# ---- weapon drawing (procedural, LQ outline rule) --------------------------------------------
def dirv(ang):
    a = math.radians(ang)
    return math.cos(a), math.sin(a)


def wpts(p, ang, n0, n1):
    vx, vy = dirv(ang)
    return D.line_pts((p[0] + vx * n0, p[1] + vy * n0), (p[0] + vx * n1, p[1] + vy * n1))


def draw_sword(cv, p, ang, L=8):
    vx, vy = dirv(ang)
    blade = wpts(p, ang, 2, 2 + L)
    pix = []
    for i, q in enumerate(blade):
        ch = 'O' if i < len(blade) - 1 else 'N'
        D.setp(cv, q[0], q[1], ch); pix.append(q)
    # crossguard perpendicular at 1.5
    gx, gy = p[0] + vx * 1.4, p[1] + vy * 1.4
    nx, ny = -vy, vx
    for k, ch in ((-1, 'G'), (0, 'Y'), (1, 'g')):
        q = (int(round(gx + nx * k)), int(round(gy + ny * k)))
        D.setp(cv, q[0], q[1], ch); pix.append(q)
    pm = (int(round(p[0] - vx * 1.2)), int(round(p[1] - vy * 1.2)))
    D.setp(cv, pm[0], pm[1], 'G'); pix.append(pm)
    D.ring(cv, pix, protect=('S', 's', 'T', 'w'))
    return blade[-1]


def draw_dagger(cv, p, ang, L=4):
    vx, vy = dirv(ang)
    blade = wpts(p, ang, 2, 1 + L)
    pix = []
    for i, q in enumerate(blade):
        D.setp(cv, q[0], q[1], 'O' if i < len(blade) - 1 else 'N'); pix.append(q)
    g = (int(round(p[0] + vx * 1.2)), int(round(p[1] + vy * 1.2)))
    D.setp(cv, g[0], g[1], 'G'); pix.append(g)
    D.ring(cv, pix, protect=('S', 's', 'T', 'w', 'r', 'R', 'x'))
    return blade[-1]


def draw_staff(cv, p, ang, up=12, down=8):
    """shaft through the hand; head (orb in prongs) at the `up` end"""
    shaft = wpts(p, ang, -down, up)
    pix = []
    for q in shaft:
        D.setp(cv, q[0], q[1], 'U'); pix.append(q)
    vx, vy = dirv(ang)
    tip = (p[0] + vx * (up + 1.5), p[1] + vy * (up + 1.5))
    hx, hy = int(round(tip[0])), int(round(tip[1]))
    orb = [(hx, hy, 'Z'), (hx + 1, hy, 'z'), (hx, hy + 1, 'z'), (hx + 1, hy + 1, 'z'), (hx, hy - 1, 'W')]
    orb = [(hx - 1, hy - 1, 'W'), (hx, hy - 1, 'Z'), (hx - 1, hy, 'Z'), (hx, hy, 'z')]
    for (x, y, ch) in orb:
        D.setp(cv, x, y, ch); pix.append((x, y))
    # gold prongs either side of the orb
    for (x, y) in ((hx - 2, hy), (hx + 1, hy), (hx - 2, hy - 1), (hx + 1, hy - 1)):
        D.setp(cv, x, y, 'G'); pix.append((x, y))
    D.ring(cv, pix, protect=('S', 's', 'T', 'w'))
    return (hx, hy - 1)


def draw_quill(cv, p, ang, L=6):
    vx, vy = dirv(ang)
    nx, ny = -vy, vx
    if nx + ny > 0:
        nx, ny = -nx, -ny
    pts = wpts(p, ang, 1, L)
    pix = []
    for i, q in enumerate(pts):
        D.setp(cv, q[0], q[1], 'W' if i == len(pts) - 1 else 'Z'); pix.append(q)
        if 1 <= i < len(pts) - 1:
            v = (int(round(q[0] + nx)), int(round(q[1] + ny)))
            if v not in pix:
                D.setp(cv, v[0], v[1], 'z'); pix.append(v)
    nib = (int(round(p[0] - vx)), int(round(p[1] - vy)))
    D.setp(cv, nib[0], nib[1], 'm'); pix.append(nib)
    D.ring(cv, pix, protect=('S', 's', 'T', 'w'))
    return pts[-1]


def draw_bow(cv, p, face, drawn=0.0, string_to=None, vertical=True, span=7):
    """bow through grip p. face = +-1 (x direction the bow bulges toward, vertical) or +-1 in y (horizontal).
    string_to: point the string is pulled to (else straight between the tips)."""
    pix = []
    pts = []
    for t in range(-span, span + 1):
        u = t / span
        bulge = (1 - u * u) * (2.2 + drawn)
        if vertical:
            pts.append((int(round(p[0] + face * bulge)), p[1] + t))
        else:
            pts.append((p[0] + t, int(round(p[1] + face * bulge))))
    seen = []
    for i, q in enumerate(pts):
        if q in seen:
            continue
        ch = 'X' if abs(i - span) <= 1 else ('U' if abs(i - span) < span - 1 else 'u')
        D.setp(cv, q[0], q[1], ch); seen.append(q)
    a, b = pts[0], pts[-1]
    # tips curl back
    if vertical:
        tips = [(a[0] - face, a[1]), (b[0] - face, b[1])]
    else:
        tips = [(a[0], a[1] - face), (b[0], b[1] - face)]
    for q in tips:
        D.setp(cv, q[0], q[1], 'u'); seen.append(q)
    D.ring(cv, seen, protect=('S', 's', 'T', 'w', 'r', 'R', 'x'))
    # string (no outline, light)
    s0, s1 = tips
    if string_to:
        sp = D.line_pts(s0, string_to) + D.line_pts(string_to, s1)
    else:
        sp = D.line_pts(s0, s1)
    for q in sp:
        if D.getp(cv, *q) in ('.', '0', None) or True:
            if q not in seen:
                D.setp(cv, q[0], q[1], 'N')
    return pts


def draw_arrow(cv, p0, p1):
    pts = D.line_pts(p0, p1)
    for i, q in enumerate(pts):
        D.setp(cv, q[0], q[1], 'N' if i == 0 else ('X' if i < len(pts) - 2 else 'Z'))


def draw_grid(cv, key_grid, cx, cy):
    g = D.grid(key_grid)
    D.place(cv, g, cx - g.shape[1] // 2, cy - g.shape[0] // 2)


TOME = {'front': """
000000
0bBBV0
0BZBB0
0BBBb0
0lOOO0
000000
""", 'open': """
.0000000.
0OOO0OOO0
0OZO0OZO0
0OOO0OOO0
0bBBBBBb0
.0000000.
""", 'side': """
000
0B0
0Z0
0B0
0O0
000
"""}


def glow_burst(cv, p, size):
    x, y = p
    if size == 0:
        pts = [(x, y, 'W'), (x - 1, y, 'Z'), (x + 1, y, 'Z'), (x, y - 1, 'Z'), (x, y + 1, 'Z')]
    else:
        pts = [(x, y, 'W'), (x - 1, y, 'W'), (x + 1, y, 'Z'), (x, y - 1, 'W'), (x, y + 1, 'Z'),
               (x - 1, y - 1, 'Z'), (x + 1, y - 1, 'Z'), (x - 1, y + 1, 'Z'), (x + 1, y + 1, 'z'),
               (x - 2, y, 'z'), (x + 2, y, 'z'), (x, y - 2, 'z'), (x, y + 2, 'z')]
    for (a, b, ch) in pts:
        D.setp(cv, a, b, ch)


# ------------------------------------------------------------------ poses
def stand_pose(cls, d):
    """idle / walk base pose: arms hanging, weapons at rest"""
    C = CLASSES[cls]
    p = P_()
    p['main'] = arm(d, 'main', HANG[d]['main'])
    p['off'] = arm(d, 'off', HANG[d]['off'])
    hm, ho = HANG[d]['main'], HANG[d]['off']
    if cls == 'warden':
        p['wmain'] = ('sword', hm, {'down': 112, 'up': 68, 'left': 118}[d], 'front' if d != 'up' else 'front')
        p['woff'] = ('shield', ho, None, 'front' if d != 'left' else 'front')
        if d == 'left':
            p['off'] = arm(d, 'off', (6, 19), layer='back')
            p['woff'] = ('shield', (5, 19), None, 'mid')
    elif cls == 'mender':
        if d == 'left':
            p['main'] = arm(d, 'main', (3, 21), (7, 20))
            p['wmain'] = ('staff', (3, 21), 270, 'front')
        else:
            p['wmain'] = ('staff', hm, 270, 'front' if d != 'up' else 'back')
    elif cls == 'scribe':
        p['wmain'] = ('quill', hm, {'down': 250, 'up': 290, 'left': 230}[d], 'front')
        if d == 'left':
            p['off'] = arm(d, 'off', (7, 20), layer='back')
            p['woff'] = ('tome', (6, 20), 'side', 'mid')
        else:
            p['off'] = arm(d, 'off', (ho[0] + (-1 if d == 'down' else 1), 21))
            p['woff'] = ('tome', (ho[0] + (-1 if d == 'down' else 1), 21), 'front', 'front' if d == 'down' else 'back')
    elif cls == 'wayfinder':
        if d == 'left':
            p['off'] = arm(d, 'off', (6, 20), layer='back')
            p['woff'] = ('bow', (6, 20), -1, 'mid')
        else:
            p['woff'] = ('bow', ho, 1 if d == 'down' else -1, 'front' if d == 'down' else 'back')
    elif cls == 'inkblade':
        p['wmain'] = ('dagger', hm, {'down': 100, 'up': 80, 'left': 110}[d], 'front')
        if d == 'left':
            p['off'] = arm(d, 'off', (12, 21), layer='back')
            p['woff'] = ('dagger', (11, 21), 120, 'back')
        else:
            p['woff'] = ('dagger', ho, {'down': 80, 'up': 100}[d], 'front')
    return p


def walk_pose(cls, d, i):
    p = stand_pose(cls, d)
    if i in (0, 2):
        p['bob'] = 1
        s = 1 if i == 0 else -1
        for side, k in (('main', s), ('off', -s)):
            a = p[side]
            if a is None:
                continue
            hx, hy = a['pts'][-1]
            if d == 'left':
                a['pts'][-1] = (hx - k if side == 'main' else hx, hy)
            else:
                a['pts'][-1] = (hx, hy + (k if k > 0 else 0))
        for wk, side in (('wmain', 'main'), ('woff', 'off')):
            w = p[wk]
            if w and p[side] and w[1] == HANG[d][side] if p[side] else False:
                p[wk] = (w[0], p[side]['pts'][-1], w[2], w[3])
        if p['wmain'] and p['main']:
            w = p['wmain']; p['wmain'] = (w[0], p['main']['pts'][-1], w[2], w[3])
    return p


def idle_pose(cls, d, i):
    p = stand_pose(cls, d)
    if i == 1:
        p['breathe'] = 1
    return p


def hurt_pose(cls, d):
    p = stand_pose(cls, d)
    p['closed'] = True
    if d == 'down':
        p['lean'] = (0, -1)
        p['main'] = arm(d, 'main', (3, 19)); p['off'] = arm(d, 'off', (20, 19))
    elif d == 'up':
        p['lean'] = (0, 1)
        p['main'] = arm(d, 'main', (20, 19)); p['off'] = arm(d, 'off', (3, 19))
    else:
        p['lean'] = (1, 0)
        p['main'] = arm(d, 'main', (12, 20))
    for wk, side in (('wmain', 'main'), ('woff', 'off')):
        w = p[wk]
        if w and p[side] and w[0] not in ('shield', 'tome', 'bow'):
            p[wk] = (w[0], p[side]['pts'][-1], w[2], w[3])
        elif w and p[side] and d != 'left':
            p[wk] = (w[0], p[side]['pts'][-1], w[2], w[3])
    return p


def attack_pose(cls, d, i):
    p = stand_pose(cls, d)
    if cls == 'warden':
        if d == 'down':
            hand, ang, lay = [((3, 11), 262, 'front'), ((8, 21), 75, 'front'), ((12, 23), 140, 'front')][i]
            el = [(2, 15), None, None][i]
        elif d == 'up':
            hand, ang, lay = [((20, 11), 278, 'back'), ((14, 12), 268, 'back'), ((8, 15), 215, 'back')][i]
            el = [(21, 15), (17, 14), None][i]
        else:
            hand, ang, lay = [((12, 11), 290, 'front'), ((4, 17), 185, 'front'), ((6, 22), 135, 'front')][i]
            el = [(12, 14), (7, 17), None][i]
        p['main'] = arm(d, 'main', hand, el, layer='front' if lay == 'front' else 'back')
        p['wmain'] = ('sword', hand, ang, lay)
        p['hand'] = hand
    elif cls == 'mender':
        if d == 'down':
            hand, ang = [((5, 15), 270), ((6, 23), 262), ((5, 22), 255)][i]
        elif d == 'up':
            hand, ang = [((18, 15), 270), ((16, 16), 250), ((17, 18), 260)][i]
        else:
            hand, ang = [((3, 16), 270), ((4, 18), 205), ((6, 19), 220)][i]
        p['main'] = arm(d, 'main', hand)
        p['wmain'] = ('staff', hand, ang, 'front' if d != 'up' else 'back')
        p['hand'] = hand
    elif cls == 'scribe':
        if d == 'down':
            hand, ang = [((6, 15), 235), ((3, 19), 200), ((7, 22), 120)][i]
        elif d == 'up':
            hand, ang = [((17, 15), 305), ((20, 18), 340), ((16, 21), 60)][i]
        else:
            hand, ang = [((11, 14), 300), ((4, 17), 190), ((6, 21), 150)][i]
        p['main'] = arm(d, 'main', hand)
        p['wmain'] = ('quill', hand, ang, 'front')
        p['hand'] = hand
        if i == 2:
            p['glow'] = [(hand[0] + round(dirv(ang)[0] * 6), hand[1] + round(dirv(ang)[1] * 6), 0)]
    elif cls == 'wayfinder':
        if d == 'left':
            # far hand holds the bow forward, near hand draws the string
            p['off'] = arm(d, 'off', (3, 17), layer='back')
            pull = [(7, 17), (11, 17), (12, 16)][i]
            p['main'] = arm(d, 'main', pull)
            p['woff'] = ('bow', (2, 17), -1, 'mid', {'drawn': [0.4, 1.2, 0.0][i], 'string_to': pull if i < 2 else None,
                                                      'arrow': (pull, (-2, 17)) if i < 2 else None})
            p['hand'] = (-1, 17)
        else:
            sgn = 1 if d == 'down' else -1
            cy = 19 if d == 'down' else 16
            p['off'] = arm(d, 'off', (13 + sgn * 0, cy + sgn * 2) if False else ((14, cy) if d == 'down' else (11, 13)))
            pull = [(11, cy), (11, cy - 3 * sgn), (8 if d == 'down' else 15, cy - 4 * sgn)][i]
            p['main'] = arm(d, 'main', pull)
            bowp = (12, cy + 2 * sgn) if d == 'down' else (12, 12)
            p['woff'] = ('bow', bowp, sgn, 'front',
                         {'vertical': False, 'drawn': [0.4, 1.2, 0.0][i], 'string_to': (12, pull[1]) if i < 2 else None,
                          'arrow': ((12, pull[1]), (12, bowp[1] + 4 * sgn)) if i < 2 else None})
            p['hand'] = (12, bowp[1] + 4 * sgn)
    elif cls == 'inkblade':
        if d == 'down':
            m, o = [((7, 15), (16, 15)), ((14, 23), (17, 14)), ((4, 18), (9, 23))][i]
            am, ao = [(250, 290), (60, 290), (200, 120)][i]
        elif d == 'up':
            m, o = [((16, 15), (7, 15)), ((10, 14), (6, 15)), ((19, 18), (13, 12))][i]
            am, ao = [(290, 250), (260, 250), (340, 280)][i]
        else:
            m, o = [((11, 14), (13, 15)), ((4, 19), (12, 16)), ((10, 21), (4, 18))][i]
            am, ao = [(290, 300), (175, 300), (130, 185)][i]
        p['main'] = arm(d, 'main', m)
        p['off'] = arm(d, 'off', o, layer='back' if d == 'left' else ('back' if d == 'up' and i == 2 else 'front'))
        p['wmain'] = ('dagger', m, am, 'front')
        p['woff'] = ('dagger', o, ao, 'back' if d == 'left' else 'front')
        p['hand'] = m
    return p


def cast_pose(cls, d, i):
    p = stand_pose(cls, d)
    big = i
    if d == 'down':
        hm, ho = (3, 15), (20, 15)
    elif d == 'up':
        hm, ho = (20, 15), (3, 15)
    else:
        hm, ho = (6, 15), (4, 17)
    p['main'] = arm(d, 'main', hm, layer='front')
    p['off'] = arm(d, 'off', ho, layer='back' if d == 'left' else 'front')
    gl = []
    if cls == 'warden':
        p['wmain'] = ('sword', hm, 270, 'front' if d != 'up' else 'back')
        p['woff'] = ('shield', ho, None, 'front') if d != 'left' else ('shield', (3, 18), None, 'mid')
        if d == 'left':
            p['off'] = arm(d, 'off', (4, 18), layer='back')
        gl = [(hm[0], hm[1] - 11, big)]
    elif cls == 'mender':
        p['wmain'] = ('staff', hm, 270, 'front' if d != 'up' else 'back')
        gl = [(hm[0], hm[1] - 14, big), (ho[0], ho[1] - 1, big)]
    elif cls == 'scribe':
        if d == 'left':
            p['off'] = arm(d, 'off', (4, 15), layer='back')
            p['woff'] = ('tome', (3, 15), 'side', 'mid')
            gl = [(2, 11 - big, big), (hm[0], hm[1] - 3, 0)]
        else:
            p['off'] = arm(d, 'off', (12 + (3 if d == 'down' else -3), 17))
            p['woff'] = ('tome', (12, 17), 'open', 'front' if d == 'down' else 'back')
            gl = [(12, 13 - big if d == 'down' else 12 - big, big)]
        p['wmain'] = ('quill', hm, 270, 'front')
    elif cls == 'wayfinder':
        p['woff'] = ('bow', ho, 1 if d != 'up' else -1, 'front' if d != 'left' else 'mid') if d != 'left' else ('bow', (3, 17), -1, 'mid')
        if d == 'left':
            p['off'] = arm(d, 'off', (4, 17), layer='back')
        gl = [(hm[0], hm[1] - 2, big)]
    elif cls == 'inkblade':
        p['wmain'] = ('dagger', hm, 270, 'front')
        p['woff'] = ('dagger', ho, 270, 'front' if d != 'left' else 'back')
        gl = [(hm[0], hm[1] - 5, big), (ho[0], ho[1] - 5, big)] if d != 'left' else [(hm[0], hm[1] - 5, big)]
    p['glow'] = gl
    p['hand'] = hm
    return p


def pose_for(cls, anim, d, i):
    if anim == 'idle':
        return idle_pose(cls, d, i)
    if anim == 'walk':
        return walk_pose(cls, d, i)
    if anim == 'attack':
        return attack_pose(cls, d, i)
    if anim == 'cast':
        return cast_pose(cls, d, i)
    if anim == 'hurt':
        return hurt_pose(cls, d)
    return stand_pose(cls, d)


# ------------------------------------------------------------------ compose
def head_layer(lk, d, closed=False):
    cv = D.canvas()
    D.place(cv, P.HEADS[lk['head']][d], 0, 0)
    if lk.get('beard') and d in P.BEARDS[lk['beard']]:
        D.place(cv, P.BEARDS[lk['beard']][d], 0, P.BEARD_Y)
    if lk.get('mask') and d in P.MASKS[lk['mask']]:
        D.place(cv, P.MASKS[lk['mask']][d], 0, P.MASK_Y[d])
    if lk.get('hat'):
        D.place(cv, P.HATS[lk['hat']][d], 0, P.HAT_DY.get(lk['hat'], 0))
    if closed:
        cv[cv == 'E'] = '#'
        cv[cv == 'F'] = 'E'
        cv[cv == '#'] = 'S'
    return cv


def body_layer(cls, d, anim, i):
    C = CLASSES[cls]
    cv = D.canvas()
    D.place(cv, P.BODIES[C['body']][d], 0, 13)
    if C.get('strap') and d in ('down', 'up'):
        for (x, y) in (P.STRAP_DOWN if d == 'down' else P.STRAP_UP):
            if D.getp(cv, x, y) not in ('0', '.', 'G', 'g', 'Y'):
                D.setp(cv, x, y, 'B' if (x + y) % 2 else 'b')
    stepping = anim == 'walk' and i in (0, 2)
    if not stepping:
        return cv, 0
    which = 'A' if i == 0 else 'B'
    if C['legs'] == 'robe':
        feet = P.ROBE_FEET_SIDE if d == 'left' else P.ROBE_FEET
        g = D.grid(feet[which])
        y0 = D.CH - 2
        cv[y0:, :] = '.'
        for yy in range(g.shape[0]):
            for xx in range(g.shape[1]):
                if g[yy, xx] != '.':
                    cv[y0 + yy, xx + D.OX] = g[yy, xx]
        # hem sway
        s = 1 if which == 'A' else -1
        if d == 'up':
            s = -s
        seg = cv[D.OY + 22:D.OY + 30].copy()
        cv[D.OY + 22:D.OY + 30] = '.'
        for r in range(seg.shape[0]):
            k = s if r >= 3 else 0
            for x in range(D.CW):
                if seg[r, x] != '.' and 0 <= x + k < D.CW:
                    cv[D.OY + 22 + r, x + k] = seg[r, x]
        return cv, 0
    if d == 'left':
        legs = P.SIDE_LEGS[C['legs']][which]
        return D.side_step(cv, legs, D.CH - 7, D.OX + 2, D.OX + 19, bob=1), 1
    hip = D.OY + 24
    legs = [(D.OX + 7, D.OX + 11), (D.OX + 12, D.OX + 16)]
    drop = {'plant': [D.OY + 26], 'raise': [D.OY + 25, D.OY + 27]}
    raised = 1 if which == 'A' else 0
    if d == 'up':
        raised = 1 - raised
    return D.front_step(cv, hip, legs, drop, raised, bob=1), 1


def draw_weapon(cv, w, cls):
    kind, p, a, layer = w[:4]
    opt = w[4] if len(w) > 4 else {}
    if kind == 'sword':
        return draw_sword(cv, p, a, L=8 if a is None or not (150 < a < 210) else 7)
    if kind == 'dagger':
        return draw_dagger(cv, p, a)
    if kind == 'staff':
        return draw_staff(cv, p, a)
    if kind == 'quill':
        return draw_quill(cv, p, a)
    if kind == 'shield':
        return None
    if kind == 'bow':
        pts = draw_bow(cv, p, a, drawn=opt.get('drawn', 0.0), string_to=opt.get('string_to'),
                       vertical=opt.get('vertical', True))
        if opt.get('arrow'):
            draw_arrow(cv, opt['arrow'][1], opt['arrow'][0])
        return None
    return None


def draw_shield(cv, d, p, where):
    if d == 'down':
        D.place(cv, P.SHIELD['face'], p[0] - 3, p[1] - 5)
    elif d == 'up':
        D.place(cv, P.SHIELD['back'], p[0] - 3, p[1] - 5)
    else:
        D.place(cv, P.SHIELD['side'], p[0] - 3, p[1] - 4)


def draw_tome(cv, mode, p):
    g = D.grid(TOME[mode])
    D.place(cv, g, p[0] - g.shape[1] // 2, p[1] - g.shape[0] // 2)


def compose(cls, lk, anim, d, i):
    C = CLASSES[cls]
    p = pose_for(cls, anim, d, i)
    body, bob = body_layer(cls, d, anim, i)
    bob = max(bob, p.get('bob', 0))
    br = p.get('breathe', 0)
    lean = p['lean']
    up_dy = bob + br                  # head/arms vertical offset
    cv = D.canvas()

    def shifted(pt):
        return (pt[0] + lean[0], pt[1] + up_dy + lean[1])

    def do_arm(a):
        if a is None:
            return
        pts = [shifted(q) for q in a['pts']]
        D.limb(cv, pts, D.W_ARM[d] if hasattr(D, 'W_ARM') else W_ARM[d], sleeve=C['sleeve'], hand=C['hand'],
               cuff=C.get('cuff'))

    def do_w(w):
        if w is None:
            return
        w = list(w)
        w[1] = shifted(w[1])
        if w[0] == 'shield':
            draw_shield(cv, d, w[1], w[3])
        elif w[0] == 'tome':
            draw_tome(cv, w[2], w[1])
        else:
            if len(w) > 4 and w[4]:
                o = dict(w[4])
                if o.get('string_to'):
                    o['string_to'] = shifted(o['string_to'])
                if o.get('arrow'):
                    o['arrow'] = (shifted(o['arrow'][0]), shifted(o['arrow'][1]))
                w[4] = o
            draw_weapon(cv, tuple(w), cls)

    # 1. behind everything: cape (up/left), quiver (up/left), back-layer weapons and arms
    if C.get('cape') and d == 'left':
        g, x, y = P.CAPE[d]
        D.place(cv, g, x + lean[0], y + up_dy + lean[1])
    if C.get('quiver') and d in ('down', 'left'):
        g, x, y = P.QUIVER[d]
        D.place(cv, g, x + lean[0], y + up_dy + lean[1])
    for wk in ('wmain', 'woff'):
        if p[wk] and p[wk][3] == 'back':
            do_w(p[wk])
    for side in ('main', 'off'):
        if p[side] and p[side]['layer'] == 'back':
            do_arm(p[side])
    # 2. body (legs + torso), with lean on the rows above the hip
    if lean != (0, 0):
        hipc = D.OY + 24
        top = body.copy(); top[hipc:] = '.'
        low = body.copy(); low[:hipc] = '.'
        body = D.canvas(); D.over(body, low); D.over(body, top, lean[0], lean[1])
    elif br:
        pass
    D.over(cv, body)
    if C.get('quiver') and d == 'up':
        g, x, y = P.QUIVER['up']
        D.place(cv, g, x + lean[0], y + up_dy + lean[1])
    if C.get('cape') and d == 'up':
        g, x, y = P.CAPE['up']
        D.place(cv, g, x + lean[0], y + up_dy + lean[1])
    # 3. head
    hd = head_layer(lk, d, p['closed'])
    D.over(cv, hd, lean[0] + p.get('head_dx', 0), up_dy + lean[1])
    # 4. mid layer (things held in front of the body but under the near arm), then front
    for wk in ('wmain', 'woff'):
        if p[wk] and p[wk][3] == 'mid':
            do_w(p[wk])
    order = ['off', 'main'] if d != 'up' else ['main', 'off']
    for side in order:
        a = p[side]
        if a and a['layer'] == 'front':
            # a shield / tome / bow held in this hand is drawn after the arm, weapons before the hand
            wk = 'wmain' if side == 'main' else 'woff'
            w = p[wk]
            if w and w[3] == 'front' and w[0] in ('sword', 'dagger', 'staff', 'quill'):
                do_w(w)
                do_arm(a)
            else:
                do_arm(a)
                if w and w[3] == 'front':
                    do_w(w)
        else:
            wk = 'wmain' if side == 'main' else 'woff'
            w = p[wk]
            if w and w[3] == 'front':
                do_w(w)
    # shoulder caps over the arms
    if C.get('caps'):
        for (g, x, y) in P.CAPS[C['caps']].get(d, []):
            D.place(cv, g, x + lean[0], y + up_dy + lean[1])
    for (x, y, s) in p['glow']:
        q = shifted((x, y))
        glow_burst(cv, q, s)
    hand = shifted(p['hand']) if p.get('hand') else None
    return cv, hand


def frame(cls, lk, anim, d, i):
    dd = 'left' if d == 'right' else d
    cv, hand = compose(cls, lk, anim, dd, i)
    pal = dict(lk['pal'])
    pal['glow'] = GLOW[cls]
    img, emi = D.colourize(cv, pal)
    if hand:
        hand = [hand[0] + D.OX, hand[1] + D.OY]
    if d == 'right':
        img, emi = X.flip_x(img), X.flip_x(emi)
        if hand:
            hand = [D.CW - 1 - hand[0], hand[1]]
    return img, emi, hand


def dead_frame(cls, lk):
    """Polish 2026-11-19: a drawn lying pose, not the down stand rotated (whose light came from the wrong side and
    whose head read as a ball). The profile (left view: closed eyes, no arms) is laid on its back by a TRANSPOSE,
    which keeps the upper-left light (lit top stays lit, lit front becomes the lit top edge): head on the left, face
    up. The legs are shortened by a few columns so the body fits the 32 px cell, the near arm flops out onto the
    ground toward the viewer, hand open, and the weapon lies dropped beside it."""
    C = CLASSES[cls]
    cv = D.canvas()
    if C.get('cape'):
        g, x, y = P.CAPE['left']
        D.place(cv, g, x, y)
    body, _ = body_layer(cls, 'left', 'idle', 0)
    D.over(cv, body)
    D.over(cv, head_layer(lk, 'left', closed=True))
    if C.get('caps'):
        for (g, x, y) in P.CAPS[C['caps']].get('left', []):
            D.place(cv, g, x, y)
    ys, xs = np.nonzero(cv != '.')
    crop = cv[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    lay = crop.T.copy()                               # head left, face up, light still upper left
    # shorten the legs: drop columns from the shins until it fits with a margin
    h, w = lay.shape
    head_w = 13
    drop = max(0, w - 30)
    if drop:
        keep = [c for c in range(w)]
        legs = list(range(w - 7, w - 2))              # shin columns (feet stay)
        for c in legs[:drop]:
            keep.remove(c)
        lay = lay[:, keep]
        h, w = lay.shape
    out = D.canvas()
    x0 = (D.CW - w) // 2
    y0 = D.CH - h - 3
    for yy in range(h):
        for xx in range(w):
            if lay[yy, xx] != '.':
                out[y0 + yy, x0 + xx] = lay[yy, xx]
    # the near arm flopped out onto the ground toward the viewer (body coords for limb())
    sx, sy = x0 + head_w + 2 - D.OX, y0 + h - 3 - D.OY
    hx, hy = sx + 6, D.CH - 2 - D.OY
    D.limb(out, [(sx, sy), (sx + 1, hy - 1), (hx, hy)], 3, sleeve=C['sleeve'], hand=C['hand'], cuff=C.get('cuff'))
    pal = dict(lk['pal']); pal['glow'] = GLOW[cls]
    wcv = D.canvas()
    W = C['main'] or C['off']
    gx, gy = hx, D.CH - 2 - D.OY                      # body coords, the ground row in front of the body
    if W == 'sword':
        draw_sword(wcv, (gx + 2, gy), 0, L=7)
    elif W == 'staff':
        draw_staff(wcv, (gx + 1, gy), 0, up=11, down=1)
    elif W == 'quill':
        draw_tome(wcv, 'front', (gx + 6, gy - 1)); draw_quill(wcv, (gx + 1, gy), 20)
    elif W == 'bow':
        draw_bow(wcv, (gx + 7, gy - 1), -1, vertical=False, span=6)
    elif W == 'dagger':
        draw_dagger(wcv, (gx + 2, gy), 10); draw_dagger(wcv, (x0 - D.OX - 2, gy), 170)
    img, emi = D.colourize(out, pal)
    wimg, wemi = D.colourize(wcv, pal)
    res = X.blank(D.CW, D.CH)
    X.paste(res, wimg, 0, 0)
    X.paste(res, img, 0, 0)
    emi_out = X.blank(D.CW, D.CH)
    X.paste(emi_out, wemi, 0, 0)
    X.paste(emi_out, emi, 0, 0)
    return res, emi_out


def dead_frame_wave1(cls, lk):
    p_img, p_emi, _ = frame(cls, lk, 'hurt', 'down', 0)
    # a fresh stand with closed eyes and arms at the sides, no weapon, lying down (rotated)
    C = CLASSES[cls]
    cv = D.canvas()
    body, _ = body_layer(cls, 'down', 'idle', 0)
    D.over(cv, body)
    D.over(cv, head_layer(lk, 'down', closed=True))
    for side in ('main', 'off'):
        a = arm('down', side, HANG['down'][side])
        D.limb(cv, a['pts'], 3, sleeve=C['sleeve'], hand=C['hand'], cuff=C.get('cuff'))
    if C.get('caps'):
        for (g, x, y) in P.CAPS[C['caps']]['down']:
            D.place(cv, g, x, y)
    pal = dict(lk['pal']); pal['glow'] = GLOW[cls]
    img, emi = D.colourize(cv, pal)
    ys, xs = np.nonzero(img[..., 3] > 0)
    crop = img[ys.min():ys.max() + 1, xs.min():xs.max() + 1]
    rot = np.rot90(crop, 1)            # head to the left
    out = X.blank(D.CW, D.CH)
    h, w = rot.shape[:2]
    x0 = max(0, (D.CW - w) // 2)
    rot = rot[:, :D.CW]
    out[D.CH - h:D.CH, x0:x0 + rot.shape[1]] = rot[:, :D.CW - x0]
    # the dropped weapon beside the body
    wcv = D.canvas()
    W = C['main'] or C['off']
    if W == 'sword':
        draw_sword(wcv, (21, 22), 0, L=6)
    elif W == 'staff':
        draw_staff(wcv, (14, 21), 180, up=10, down=10)
    elif W == 'quill':
        draw_tome(wcv, 'front', (21, 21)); draw_quill(wcv, (15, 22), 200)
    elif W == 'bow':
        draw_bow(wcv, (12, 20), -1, vertical=False, span=6)
    elif W == 'dagger':
        draw_dagger(wcv, (20, 22), 10); draw_dagger(wcv, (3, 23), 170)
    wimg, wemi = D.colourize(wcv, pal)
    res = X.blank(D.CW, D.CH)
    X.paste(res, wimg, 0, 0)
    X.paste(res, out, 0, 0)
    emi_out = X.blank(D.CW, D.CH)
    X.paste(emi_out, wemi, 0, 0)
    return res, emi_out


# ------------------------------------------------------------------ build
def build_class(cls):
    rows = []        # list of rows of (name, img, emi)
    points = {}
    for n, lk in enumerate(LOOKS[cls], 1):
        for d in DIRS:
            row = []
            for anim, cnt in ANIMS:
                for i in range(cnt):
                    img, emi, hand = frame(cls, lk, anim, d, i)
                    name = f'look{n}_{anim}_{d}_{i}'
                    row.append((name, img, emi))
                    if hand and anim in ('attack', 'cast'):
                        points[name] = {'hand': hand}
            rows.append(row)
    dead = []
    for n, lk in enumerate(LOOKS[cls], 1):
        img, emi = dead_frame(cls, lk)
        dead.append((f'look{n}_dead_down_0', img, emi))
    rows.append(dead)
    cols = 12
    sheet = X.blank(cols * D.CW, len(rows) * D.CH)
    esheet = X.blank(cols * D.CW, len(rows) * D.CH)
    frames = {}
    for r, row in enumerate(rows):
        for c, (name, img, emi) in enumerate(row):
            x, y = c * D.CW, r * D.CH
            sheet[y:y + D.CH, x:x + D.CW] = img
            esheet[y:y + D.CH, x:x + D.CW] = emi
            frames[name] = [x, y, D.CW, D.CH]
    anims = {}
    for n in range(1, len(LOOKS[cls]) + 1):
        for d in DIRS:
            for anim, cnt in ANIMS:
                fr = [f'look{n}_{anim}_{d}_{i}' for i in range(cnt)]
                if anim == 'walk':
                    pass
                anims[f'look{n}_{anim}_{d}'] = {'frames': fr, 'fps': FPS[anim], 'loop': LOOP[anim]}
        anims[f'look{n}_dead_down'] = {'frames': [f'look{n}_dead_down_0'], 'fps': 1, 'loop': False}
    X.save_png(sheet, os.path.join(X.CHARS_DST, f'{cls}.png'))
    X.save_png(esheet, os.path.join(X.CHARS_DST, f'{cls}_emissive.png'))
    meta = {
        'image': f'{cls}.png',
        'emissive': f'{cls}_emissive.png',
        'class': cls,
        'cell': [D.CW, D.CH],
        'origin': list(D.ORIGIN),
        'anchor_note': 'origin = feet point (between the feet, on the ground row) in every frame; draw at '
                       '(x - 16, y - 39) at integer positions, nearest neighbour',
        'layout': 'one row per (look, dir) in order look1 down/left/right/up, look2 ..., look3 ...; columns idle 0-1, '
                  'walk 0-3 (stepA, stand, stepB, stand), attack 0-2 (windup, strike, follow-through), cast 0-2, hurt 0. '
                  'Last row: dead (down only) for look1..3. Right frames are the mirrored left.',
        'looks': {f'look{n}': lk.get('desc', '') for n, lk in enumerate(LOOKS[cls], 1)},
        'hitFrame': {'attack': 1},
        'frames': frames,
        'points': points,
        'anims': anims,
    }
    X.write_json(os.path.join(X.CHARS_DST, f'{cls}.json'), meta)
    return rows, meta


def contact_class(cls, rows):
    items = []
    for row in rows:
        for (name, img, emi) in row:
            lab = name.replace('look', 'L').replace('_down', ' dn').replace('_left', ' lt').replace('_right', ' rt').replace('_up', ' up')
            items.append((lab, img))
    X.contact(items, os.path.join(X.OUT, f'{cls}_contact.png'), scale=4, cols=12,
              title=f'{cls}: per row one look x dir; idle 0-1, walk 0-3, attack 0-2, cast 0-1, hurt (4x)')


def walk_gif(all_rows):
    """3x animated walk + attack check for every look, all dirs"""
    frames = []
    looks = []
    for cls, rows in all_rows.items():
        for r in range(0, len(rows) - 1, 4):
            looks.append(rows[r:r + 4])
    S = 2
    for k in range(8):
        W = len(DIRS) * 2 * D.CW * S
        Hh = len(looks) * D.CH * S
        canvas = Image.new('RGB', (W, Hh), (86, 128, 70))
        for li, lrows in enumerate(looks):
            for di, row in enumerate(lrows):
                d = dict((n.split('_', 1)[1], img) for n, img, e in row)
                key = [k2 for k2 in d if k2.startswith('walk_')]
                wimg = row[2 + (k % 4)][1]
                aimg = row[6 + min(k % 4, 2)][1] if k % 4 < 3 else row[0][1]
                for j, im in enumerate((wimg, aimg)):
                    t = X.upscale(im, S)
                    canvas.paste(t, ((di * 2 + j) * D.CW * S, li * D.CH * S), t)
        frames.append(canvas)
    frames[0].save(os.path.join(X.OUT, 'walk_attack_check.gif'), save_all=True, append_images=frames[1:],
                   duration=140, loop=0)
    # also a static strip of the walk cycles (A, stand, B, stand) per look, down + left
    items = []
    for li, lrows in enumerate(looks):
        for di in (0, 1):
            row = lrows[di]
            for j in range(4):
                items.append(('' if j else row[0][0].split('_')[0] + ' ' + DIRS[di], row[2 + j][1]))
    X.contact(items, os.path.join(X.OUT, 'walk_strip_4x.png'), scale=3, cols=16, title='walk cycles (A, stand, B, stand), down and left, 3x')


def lineup(all_rows):
    """all 15 looks (down, stand) beside LQ's hero and Mira at 1x and 3x on a grass tile"""
    sprites = []
    pf = Image.open(os.path.join(X.LQ, 'assets', 'sprites', 'party_field.png')).convert('RGBA')
    import json
    pj = json.load(open(os.path.join(X.LQ, 'assets', 'sprites', 'party_field.json')))
    for nm in ('hero_down_0', 'mira_down_0', 'bram_down_0'):
        x, y, w, h = pj['frames'][nm]
        im = X.blank(D.CW, D.CH)
        X.paste(im, X.from_pil(pf.crop((x, y, x + w, y + h))), 4, 8)
        sprites.append(im)
    for cls, rows in all_rows.items():
        for r in range(0, len(rows) - 1, 4):
            sprites.append(rows[r][0][1])
    # grass tile from LQ tiles if present, else flat grass
    tile = None
    pth = os.path.join(X.LQ, 'assets', 'tiles', 'terrain.png')
    if os.path.exists(pth):        # the LQ grass fill variants (tiles.json terrains.grass.variants)
        ter = Image.open(pth).convert('RGBA')
        tiles = [ter.crop((x, 144, x + 16, 160)) for x in (0, 16, 32, 48, 64, 80)]
        tile = tiles[0]
    n = len(sprites)
    Wd = n * 26 + 8
    base = Image.new('RGBA', (Wd, 48), (90, 144, 50, 255))
    if tile is not None:
        for ty in range(0, 48, 16):
            for tx in range(0, Wd, 16):
                base.paste(tiles[(tx * 7 + ty * 3) // 16 % 6 if (tx // 16 + ty // 16) % 3 == 0 else 0], (tx, ty))
    for k, im in enumerate(sprites):
        t = X.to_pil(im)
        base.paste(t, (4 + k * 26 - 3, 4), t)
    big = base.resize((Wd * 3, 48 * 3), Image.NEAREST)
    out = Image.new('RGB', (Wd * 3, 48 + 6 + 48 * 3), (40, 40, 40))
    out.paste(base, (0, 0)); out.paste(big, (0, 54))
    out.save(os.path.join(X.OUT, 'lineup_1x_3x.png'))
    # every look's attack strike and cast (down and left) at 3x on the same grass
    acts = []
    for cls, rows in all_rows.items():
        for r in range(0, len(rows) - 1, 4):
            for rr, col in ((r, 7), (r + 1, 7), (r, 10), (r + 1, 10)):
                acts.append(rows[rr][col][1])
    per = 20
    nrow = (len(acts) + per - 1) // per
    sheet = Image.new('RGBA', (per * 34, nrow * 42), (90, 144, 50, 255))
    if tile is not None:
        for ty in range(0, nrow * 42, 16):
            for tx in range(0, per * 34, 16):
                sheet.paste(tiles[0], (tx, ty))
    for k, im in enumerate(acts):
        t = X.to_pil(im)
        sheet.paste(t, ((k % per) * 34 + 1, (k // per) * 42 + 1), t)
    sheet.resize((sheet.size[0] * 3, sheet.size[1] * 3), Image.NEAREST).save(os.path.join(X.OUT, 'lineup_actions_3x.png'))
    # 1x actions lineup (attack strike + cast) at 3x for readability
    return tile is not None


def main(argv):
    only = argv[1:] or list(CLASSES)
    all_rows = {}
    for cls in only:
        rows, meta = build_class(cls)
        contact_class(cls, rows)
        all_rows[cls] = rows
        print(cls, len(meta['frames']), 'frames')
    if len(only) == len(CLASSES):
        walk_gif(all_rows)
        print('lineup tile:', lineup(all_rows))


if __name__ == '__main__':
    main(sys.argv)
