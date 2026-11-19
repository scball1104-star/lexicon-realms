"""Spell / impact effect sheets for Lexicon Realms -> assets/fx/fx.png + fx.json.

    python tools/art/build_fx.py

Pixel art from the LQ master palette, no anti-aliasing. Bright cores and no dark outlines, so every effect
reads on its own AND takes an additive glow pass well. Directional effects face RIGHT and also ship
rotated copies (90-degree steps are pixel-exact); the arrow has 8 hand-placed directions.
Each effect: frames '<fx>_<i>' (or '<fx>_<dir>_<i>'), its own cell size, origin = the effect's anchor.
"""
import os, sys, math
import numpy as np
from PIL import Image

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrpix as X

C = {k: X.rgbf(v) for k, v in {
    'white': 'metal:4', 'steel': 'metal:3', 'ice': 'ice:2', 'ice2': 'ice:1', 'blue': 'water:3',
    'g5': 'gold:5', 'g4': 'gold:4', 'g3': 'gold:3', 'g2': 'gold:2',
    'grass5': 'grass:5', 'grass4': 'grass:4', 'grass3': 'grass:3',
    'ink0': 'ink:0', 'ink1': 'ink:1', 'ink2': 'ink:2', 'ink3': 'ink:3', 'ink4': 'ink:4',
    'cy4': 'magic_cyan:4', 'cy3': 'magic_cyan:3', 'cy2': 'magic_cyan:2',
    'v4': 'magic_violet:4', 'v3': 'magic_violet:3', 'v2': 'magic_violet:2', 'v1': 'magic_violet:1',
    'f5': 'fire:5', 'f4': 'fire:4', 'f3': 'fire:3', 'f2': 'fire:2',
    'wood': 'wood:3', 'woodl': 'wood:4', 'woodd': 'wood:2', 'iron': 'stone_cool:3', 'irond': 'stone_cool:1',
    'ironl': 'stone_cool:4', 'feather': 'sand:3',
}.items()}


def cv(w, h):
    return X.blank(w, h)


def put(a, x, y, col):
    x, y = int(round(x)), int(round(y))
    if 0 <= y < a.shape[0] and 0 <= x < a.shape[1]:
        a[y, x, :3] = C[col]
        a[y, x, 3] = 1


def put_if_empty(a, x, y, col):
    x, y = int(round(x)), int(round(y))
    if 0 <= y < a.shape[0] and 0 <= x < a.shape[1] and a[y, x, 3] == 0:
        put(a, x, y, col)


def line(a, p0, p1, col):
    from lrdoll import line_pts
    for (x, y) in line_pts(p0, p1):
        put(a, x, y, col)


def sparkle(a, x, y, size, c_core='white', c_arm='g4'):
    put(a, x, y, c_core)
    for k in range(1, size + 1):
        cc = c_arm if k < size else c_arm
        for dx, dy in ((k, 0), (-k, 0), (0, k), (0, -k)):
            put(a, x + dx, y + dy, cc)


def ring_pts(cx, cy, rx, ry, n=None):
    n = n or int(max(rx, ry) * 8) + 8
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        p = (int(round(cx + rx * math.cos(t))), int(round(cy + ry * math.sin(t))))
        if p not in pts:
            pts.append(p)
    return pts


# ------------------------------------------------------------------ effects
def slash():
    """sword slash arc, facing right, origin = the swinger's hand side (left-centre)"""
    W, H = 32, 32
    out = []
    spans = [(-80, -10), (-80, 70), (-40, 80), (20, 80)]
    for f, (a0, a1) in enumerate(spans):
        a = cv(W, H)
        for r, col in ((13, 'white'), (12, 'ice'), (11, 'ice2'), (14, 'ice'), (10, 'blue')):
            if f == 3 and r in (13, 14):
                continue
            if f == 2 and r == 10:
                continue
            for k in range(0, 101):
                t = a0 + (a1 - a0) * k / 100
                # taper: thick in the middle of the sweep, thin at both ends
                u = (t - a0) / max(1, (a1 - a0))
                thick = math.sin(math.pi * u)
                if r in (10, 14) and thick < 0.5:
                    continue
                if r == 11 and thick < 0.25:
                    continue
                put(a, 6 + r * math.cos(math.radians(t)), 16 + r * math.sin(math.radians(t)), col)
        if f == 3:
            for (x, y) in ((18, 7), (21, 19), (16, 26)):
                put(a, x, y, 'ice')
        out.append(a)
    return out, (6, 16)


def heal():
    """green-gold rising sparkles and leaf-crosses over a body (24x40, origin at the feet)"""
    W, H = 24, 40
    seeds = [(5, 36, 0), (17, 34, 1), (11, 38, 2), (8, 30, 3), (15, 28, 4), (12, 33, 5)]
    out = []
    for f in range(6):
        a = cv(W, H)
        # soft ground ring at the start
        if f < 3:
            for (x, y) in ring_pts(12, 37, 8 - f, 2):
                put(a, x, y, 'grass4' if f else 'grass5')
        for (x, y0, ph) in seeds:
            t = (f + ph) % 6
            y = y0 - t * 5
            if y < 2:
                continue
            if (t + ph) % 3 == 0:
                sparkle(a, x, y, 2, 'g5', 'grass5')
            elif (t + ph) % 3 == 1:
                put(a, x, y, 'g5'); put(a, x - 1, y, 'grass4'); put(a, x + 1, y, 'grass4'); put(a, x, y - 1, 'grass4'); put(a, x, y + 1, 'grass4')
            else:
                put(a, x, y, 'g4'); put(a, x, y + 1, 'grass3')
        out.append(a)
    return out, (12, 39)


GLYPHS = [  # 3x4 letter-like runes (the written word, glowing)
    ["010", "101", "111", "101"],   # A
    ["110", "101", "110", "101"],   # R
    ["111", "100", "110", "111"],   # E
    ["101", "111", "010", "010"],   # Y-ish rune
    ["111", "010", "010", "010"],   # T
]


def glyph(a, x, y, gi, col='cy4', col2='cy3'):
    g = GLYPHS[gi % len(GLYPHS)]
    for yy, row in enumerate(g):
        for xx, ch in enumerate(row):
            if ch == '1':
                put(a, x + xx, y + yy, col if yy < 2 else col2)


def ink_bolt():
    """projectile: a deep blue-black ink drop with a glowing letter, trailing drips (faces right)"""
    W, H = 20, 12
    out = []
    for f in range(3):
        a = cv(W, H)
        cx, cy = 13, 6
        for y in range(H):
            for x in range(W):
                d = ((x - cx) / 5.0) ** 2 + ((y - cy) / 4.2) ** 2
                if d <= 1:
                    put(a, x, y, 'ink1' if d > 0.55 else 'ink0')
        # rim light on the leading top edge
        for (x, y) in ((14, 2), (15, 2), (16, 3), (17, 4), (17, 5)):
            put(a, x, y, 'ink3')
        put(a, 15, 3, 'ink4')
        for (x, y) in ring_pts(cx, cy, 6, 5.2):
            if x > cx - 3:
                put_if_empty(a, x, y, 'ink3' if (x + y + f) % 3 else 'cy2')
        glyph(a, 11, 4, f, 'cy4', 'cy3')
        # tail drips, wobbling per frame
        tail = [(7, 6 + (f % 2)), (5, 5 + ((f + 1) % 3) - 1), (3, 6 + ((f + 2) % 3) - 1), (1, 6)]
        for i, (x, y) in enumerate(tail):
            put(a, x, y, 'ink1' if i < 2 else 'ink2')
            if i == 0:
                put(a, x + 1, y, 'ink1')
        put(a, 4 + f, 3 if f != 1 else 9, 'cy2')
        out.append(a)
    return out, (13, 6)


def ink_splash():
    W, H = 32, 32
    out = []
    drops = [(0, 1.0), (50, 0.8), (100, 1.1), (150, 0.9), (200, 1.0), (250, 0.85), (300, 1.05), (340, 0.75)]
    for f in range(5):
        a = cv(W, H)
        cx, cy = 16, 16
        if f < 2:
            rr = 4 + f * 2
            for y in range(H):
                for x in range(W):
                    d = math.hypot(x - cx, (y - cy) * 1.1)
                    if d <= rr:
                        put(a, x, y, 'ink0' if d < rr - 1.5 else 'ink2')
        for (ang, sp) in drops:
            dist = (3 + f * 3.2) * sp
            x = cx + dist * math.cos(math.radians(ang))
            y = cy + dist * math.sin(math.radians(ang)) + f * f * 0.3
            size = 2 if f < 3 else 1
            for dx in range(size):
                for dy in range(size):
                    put(a, x + dx, y + dy, 'ink1' if f < 3 else 'ink2')
        # letters fly out and fade
        if 1 <= f <= 4:
            for k, ang in enumerate((30, 160, 270)):
                dist = 4 + f * 2.5
                x = cx + dist * math.cos(math.radians(ang)) - 1
                y = cy + dist * math.sin(math.radians(ang)) - 2 - f
                glyph(a, x, y, k + f, 'cy4' if f < 3 else 'cy3', 'cy3' if f < 3 else 'cy2')
        if f == 0:
            sparkle(a, cx, cy, 2, 'cy4', 'cy3')
        out.append(a)
    return out, (16, 16)


ARROW_ANGLES = [0, 45, 90, 135, 180, 225, 270, 315]
ARROW_DIRS = ['e', 'se', 's', 'sw', 'w', 'nw', 'n', 'ne']


def arrow():
    """8 directions, 16x16, origin = centre. Shaft wood, iron head, pale fletching."""
    W = 16
    frames = {}
    for ang, nm in zip(ARROW_ANGLES, ARROW_DIRS):
        a = cv(W, W)
        vx, vy = math.cos(math.radians(ang)), math.sin(math.radians(ang))
        c = 7.5
        tip = (c + vx * 6, c + vy * 6)
        tail = (c - vx * 6, c - vy * 6)
        line(a, tail, tip, 'wood')
        # head
        put(a, tip[0], tip[1], 'ironl')
        put(a, tip[0] - vx, tip[1] - vy, 'iron')
        nx, ny = -vy, vx
        for s in (-1, 1):
            put(a, tip[0] - vx * 1.6 + nx * s, tip[1] - vy * 1.6 + ny * s, 'irond')
        # fletching
        for k in (0, 1):
            for s in (-1, 1):
                put(a, tail[0] + vx * k + nx * s, tail[1] + vy * k + ny * s, 'feather')
        frames[nm] = a
    return frames, (8, 8)


def trap():
    """bear-trap snap: open jaws, closing, shut with a spark, settle (24x16, origin bottom-centre)"""
    W, H = 24, 16
    out = []
    for f in range(4):
        a = cv(W, H)
        if f == 0:
            pass
        # base plate
        for x in range(6, 18):
            put(a, x, 13, 'irond'); put(a, x, 12, 'iron')
        put(a, 11, 11, 'ironl'); put(a, 12, 11, 'ironl')
        open_ = [7, 3, 0, 0][f]
        if f == 0:
            for (x, y) in ring_pts(12, 9, 8, 3.5):
                put(a, x, y, 'iron' if y > 9 else 'ironl')
            for (x, y) in ring_pts(12, 9, 6, 2.2):
                if (x + y) % 2 == 0:
                    put(a, x, y, 'steel')
            for x in range(10, 15):
                put(a, x, 9, 'irond')
            put(a, 12, 9, 'g3')
            out.append(a)
            continue
        for s in (-1, 1):
            # each jaw is an arc of teeth rising from the plate
            for k in range(7):
                x = 12 + s * (6 - k)
                y = 12 - k * (1 if open_ else 1) - (0 if open_ else 0)
                ang = math.radians(open_ * 10)
                jx = 12 + s * (6 * math.cos(ang) - k * math.cos(ang) * 0.9)
                jy = 12 - (k * 0.9 + 6 * math.sin(ang) * 0.6)
                put(a, jx, jy, 'ironl' if k % 2 else 'iron')
                if k % 2 == 0:
                    put(a, jx, jy - 1, 'steel')
        if f == 2:
            sparkle(a, 12, 6, 3, 'white', 'g4')
            put(a, 6, 4, 'g3'); put(a, 18, 5, 'g3')
        if f == 3:
            put(a, 9, 7, 'g2'); put(a, 15, 8, 'g2')
        out.append(a)
    return out, (12, 15)


def flurry():
    """dagger flurry: quick crossing violet-white streaks (32x32, origin centre)"""
    W, H = 32, 32
    strokes = [((6, 8), (24, 22)), ((24, 7), (8, 24)), ((5, 16), (27, 15)), ((10, 5), (20, 27))]
    out = []
    for f in range(4):
        a = cv(W, H)
        for k, (p0, p1) in enumerate(strokes):
            age = f - k
            if age < 0 or age > 2:
                continue
            col_core = ['white', 'v4', 'v3'][age]
            col_edge = ['v4', 'v3', 'v2'][age]
            # draw a tapered streak: offset copies for thickness in the middle
            line(a, p0, p1, col_edge)
            mx, my = (p0[0] + p1[0]) / 2, (p0[1] + p1[1]) / 2
            q0 = ((p0[0] + mx) / 2, (p0[1] + my) / 2)
            q1 = ((p1[0] + mx) / 2, (p1[1] + my) / 2)
            line(a, q0, q1, col_core)
            if age == 0:
                sparkle(a, p1[0], p1[1], 1, 'white', 'v4')
        out.append(a)
    return out, (16, 16)


def stealth():
    """stealth shimmer: an overlay for a 32x40 character cell (origin = feet). Violet dither columns rise."""
    W, H = 32, 40
    out = []
    for f in range(4):
        a = cv(W, H)
        for x in range(7, 25):
            for y in range(6, 40):
                band = (y + f * 3 + (x * 5) % 7) % 9
                if band == 0 and (x + y) % 2 == 0:
                    put(a, x, y, 'v3')
                elif band == 1 and (x + y + f) % 4 == 0:
                    put(a, x, y, 'v2')
        for k in range(3):
            x = 9 + (k * 6 + f * 4) % 15
            y = 34 - ((f * 6 + k * 11) % 28)
            put(a, x, y, 'v4')
            put(a, x, y - 1, 'v3')
        out.append(a)
    return out, (16, 39)


def taunt():
    """taunt shout: expanding gold-red ground ring and shout marks (48x32, origin = feet centre)"""
    W, H = 48, 40
    out = []
    for f in range(5):
        a = cv(W, H)
        rx, ry = 6 + f * 4.5, 2 + f * 1.5
        cols = [('g5', 'f4'), ('g4', 'f3'), ('g4', 'f3'), ('f3', 'f2'), ('f2', 'f2')][f]
        for (x, y) in ring_pts(24, 30, rx, ry):
            put(a, x, y, cols[0])
        for (x, y) in ring_pts(24, 30, rx - 1.5, max(1, ry - 0.8)):
            if f < 3:
                put_if_empty(a, x, y, cols[1])
        # shout marks above the head: three short strokes radiating up
        if f < 4:
            o = f
            o -= 4
            for (x0, y0, x1, y1) in ((24, 6 - o, 24, 3 - o), (18 - o, 8 - o, 16 - o, 6 - o), (30 + o, 8 - o, 32 + o, 6 - o)):
                line(a, (x0, max(0, y0)), (x1, max(0, y1)), 'f4' if f < 2 else 'f3')
                put(a, x0, max(0, y0), 'g5')
        out.append(a)
    return out, (24, 30)


def levelup():
    """level-up burst: gold column, ring, rays and sparkles (48x56, origin = feet)"""
    W, H = 48, 64
    out = []
    for f in range(6):
        a = cv(W, H)
        cx, fy = 24, 52
        # ground ring expanding
        rx = 4 + f * 3.5
        for (x, y) in ring_pts(cx, fy, rx, rx * 0.3):
            put(a, x, y, 'g5' if f < 3 else 'g3')
        # light column (2-3 px) rising then thinning
        top = max(2, fy - 12 - f * 9)
        if f < 5:
            for y in range(top, fy):
                put(a, cx, y, 'g5' if f < 3 else 'g4')
                if f < 3:
                    put(a, cx - 1, y, 'g4'); put(a, cx + 1, y, 'g4')
                    if (y + f) % 4 == 0:
                        put(a, cx - 2, y, 'g3'); put(a, cx + 2, y, 'g3')
        # rays from the chest at frames 1-3
        if 1 <= f <= 4:
            L = 6 + f * 3
            for ang in range(0, 360, 45):
                vx, vy = math.cos(math.radians(ang)), math.sin(math.radians(ang)) * 0.8
                for k in range(L - 4, L):
                    put(a, cx + vx * k, 32 + vy * k, 'g5' if k == L - 1 and f < 4 else 'g3')
        # sparkles drifting up
        for k, (sx, sy) in enumerate(((14, 40), (33, 36), (19, 26), (30, 22), (24, 14))):
            y = sy - f * 3
            if f >= k % 3 and y > 1:
                sparkle(a, sx, y, 2 if (f + k) % 2 else 1, 'g5', 'g4')
        out.append(a)
    return out, (24, 52)


def build():
    items = []      # (name, img, origin)
    fx_meta = {}

    def add(fx, frames, origin, fps, loop, note, dirs=None):
        names = []
        if dirs is None:
            for i, f in enumerate(frames):
                n = f'{fx}_{i}'; items.append((n, f, origin)); names.append(n)
            fx_meta[fx] = {'frames': names, 'cell': [frames[0].shape[1], frames[0].shape[0]], 'origin': list(origin),
                           'fps': fps, 'loop': loop, 'note': note}
        else:
            fx_meta[fx] = {'dirs': {}, 'fps': fps, 'loop': loop, 'note': note}
            for d, fr in dirs.items():
                nn = []
                for i, (f, org) in enumerate(fr):
                    n = f'{fx}_{d}_{i}'; items.append((n, f, org)); nn.append(n)
                fx_meta[fx]['dirs'][d] = nn
                fx_meta[fx]['cell'] = [fr[0][0].shape[1], fr[0][0].shape[0]]

    def rot_dirs(frames, origin):
        """right, down, left, up copies by 90-degree rotation (pixel exact)"""
        W, H = frames[0].shape[1], frames[0].shape[0]
        ox, oy = origin
        res = {'right': [(f, origin) for f in frames]}
        res['down'] = [(np.rot90(f, -1).copy(), (H - 1 - oy, ox)) for f in frames]
        res['left'] = [(f[:, ::-1].copy(), (W - 1 - ox, oy)) for f in frames]
        res['up'] = [(np.rot90(f, 1).copy(), (oy, W - 1 - ox)) for f in frames]
        return res

    fr, org = slash()
    add('slash', None, None, 16, False, 'sword slash arc; origin = the swing pivot (the hand)', dirs=rot_dirs(fr, org))
    fr, org = heal()
    add('heal', fr, org, 10, False, 'holy/heal sparkles rising over a body; origin = feet')
    fr, org = ink_bolt()
    add('ink_bolt', None, None, 10, True, 'Scribe ink bolt projectile, glowing letter inside; origin = drop centre',
        dirs=rot_dirs(fr, org))
    fr, org = ink_splash()
    add('ink_splash', fr, org, 12, False, 'ink bolt impact: droplets and letters fly out; origin = impact point')
    frs, org = arrow()
    fx_meta['arrow'] = {'dirs': {}, 'fps': 1, 'loop': False, 'cell': [16, 16],
                        'note': 'one frame per direction e..ne (screen angles 0..315 step 45); origin = centre'}
    for d, f in frs.items():
        n = f'arrow_{d}'; items.append((n, f, org)); fx_meta['arrow']['dirs'][d] = [n]
    fr, org = trap()
    add('trap_snap', fr, org, 12, False, 'Wayfinder trap: open, closing, snap (spark), shut; origin = ground centre')
    fr, org = flurry()
    add('flurry', fr, org, 16, False, 'Inkblade dagger flurry streaks; origin = centre of the target')
    fr, org = stealth()
    add('stealth', fr, org, 8, True, 'stealth shimmer overlay for a 32x40 character cell; origin = feet (16,39)')
    fr, org = taunt()
    add('taunt', fr, org, 12, False, 'Warden taunt: ground ring + shout marks; origin = feet')
    fr, org = levelup()
    add('levelup', fr, org, 10, False, 'level-up burst: column, ring, rays, sparkles; origin = feet')

    # shelf-pack, tallest first
    order = sorted(range(len(items)), key=lambda i: (-items[i][1].shape[0], i))
    Wsheet, pad = 256, 1
    x = y = rowh = 0
    pos = {}
    for i in order:
        n, f, o = items[i]
        h, w = f.shape[:2]
        if x + w > Wsheet:
            x = 0; y += rowh + pad; rowh = 0
        pos[n] = (x, y); x += w + pad; rowh = max(rowh, h)
    sheet = X.blank(Wsheet, y + rowh)
    frames, origins = {}, {}
    for n, f, o in items:
        px, py = pos[n]
        sheet[py:py + f.shape[0], px:px + f.shape[1]] = f
        frames[n] = [px, py, f.shape[1], f.shape[0]]
        origins[n] = [int(o[0]), int(o[1])]
    X.save_png(sheet, os.path.join(X.FX_DST, 'fx.png'))
    meta = {'image': 'fx.png', 'note': 'Draw at integer positions, nearest neighbour; additive glow optional. '
            'Directional fx face right in their _right frames; _down/_left/_up are exact rotations.',
            'frames': frames, 'origins': origins, 'fx': fx_meta}
    X.write_json(os.path.join(X.FX_DST, 'fx.json'), meta)
    # contact: on a dark and on a grass background
    cs = [(n, f) for n, f, o in items]
    X.contact(cs, os.path.join(X.OUT, 'fx_contact.png'), scale=4, cols=10, bg=(30, 32, 44), title='fx at 4x (dark bg)')
    X.contact(cs, os.path.join(X.OUT, 'fx_contact_grass.png'), scale=3, cols=12, bg=(90, 144, 50), title='fx at 3x (grass)')
    return meta


if __name__ == '__main__':
    m = build()
    print('fx frames', len(m['frames']))
