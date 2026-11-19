"""Character-creation portraits for Lexicon Realms -> assets/portraits/portraits.png + .json

    python tools/art/build_portraits.py

15 portraits (5 classes x 3 looks), 32x32 like LQ's `<name>_32` portraits (sprites/portraits.png): head and shoulders
on a deep-blue field with a light top-left rim. LQ's portraits are painted and then reduced, so these are painted the
same way: smooth shaded shapes at 4x (128 px), box-reduced to 32 px. Colours are the look's own ramps from
build_chars.py (skin, hair, outfit), so a portrait matches its sprite. Deterministic.
Frame ids: `<class>_look<n>` (and `<class>_look<n>_64`, a 2x reduction for the creation screen's big preview).
"""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrpix as X

DST = os.path.join(X.ROOT, 'assets', 'portraits')
os.makedirs(DST, exist_ok=True)
SS = 128
LIGHT = np.array([-0.5, -0.65, 0.58])
LIGHT /= np.linalg.norm(LIGHT)


def R(name, *idx):
    return [X.color('%s:%d' % (name, i)) for i in idx]


SKIN = {'light': R('skin_light', 0, 1, 2, 3), 'med': R('skin_med', 0, 1, 2, 3), 'dark': R('skin_dark', 1, 2, 3, 4)}
HAIR = {'brown': R('hair_brown', 1, 2, 3, 4), 'black': R('shadow', 0, 1, 2, 3), 'blonde': R('gold', 1, 2, 3, 4),
        'auburn': R('roof_red', 1, 2, 3, 4), 'grey': R('stone_cool', 1, 2, 3, 4, 5), 'white': R('metal', 1, 2, 3, 4),
        'violet': R('hair_violet', 1, 2, 3, 4)}
EYE = {'brown': '#6e3d2c', 'blue': '#3e88ca', 'green': '#5a9032', 'grey': '#8e8997', 'amber': '#c38334',
       'violet': '#9062c3', 'dark': '#482826'}
STEEL = R('metal', 0, 1, 2, 3)

# class, look -> description (matches assets/sprites/chars/<class>.json "looks")
LOOKS = {
 ('warden', 1): dict(skin='light', hair='brown', style='short', beard=True, eye='blue', top=R('cloth_blue', 0, 1, 2, 3),
                     sec=R('cloth_blue', 1, 2, 3, 4), outfit='plate', masc=True),
 ('warden', 2): dict(skin='med', hair='auburn', style='pony', eye='green', top=R('roof_red', 1, 2, 3, 4),
                     sec=R('roof_red', 1, 2, 3, 4), outfit='plate'),
 ('warden', 3): dict(skin='dark', hair='black', style='helm', eye='brown', top=R('roof_green', 1, 2, 3, 4),
                     sec=R('roof_green', 1, 2, 3, 4), outfit='plate', masc=True),
 ('mender', 1): dict(skin='light', hair='blonde', style='long', eye='green', top=R('sand', 0, 1, 2, 3),
                     sec=R('grass', 2, 3, 4, 5), outfit='robe'),
 ('mender', 2): dict(skin='dark', hair='black', style='short', beard='short', eye='brown', top=R('metal', 1, 2, 3, 4),
                     sec=R('gold', 1, 2, 3, 4), outfit='robe', masc=True),
 ('mender', 3): dict(skin='med', hair='grey', style='bun', eye='grey', top=R('roof_green', 1, 2, 3, 4),
                     sec=R('sand', 0, 1, 2, 3), outfit='robe', older=True),
 ('scribe', 1): dict(skin='light', hair='brown', style='spiky', eye='blue', top=R('roof_blue', 0, 1, 2, 3),
                     sec=R('gold', 1, 2, 3, 4), outfit='coat', masc=True),
 ('scribe', 2): dict(skin='dark', hair='black', style='bun', eye='dark', top=R('cloth_purple', 1, 2, 3, 4),
                     sec=R('sand', 0, 1, 2, 3), outfit='coat'),
 ('scribe', 3): dict(skin='med', hair='auburn', style='long', eye='amber', top=R('roof_red', 0, 1, 2, 3),
                     sec=R('metal', 1, 2, 3, 4), outfit='coat'),
 ('wayfinder', 1): dict(skin='light', hair='blonde', style='pony', eye='green', top=R('roof_green', 1, 2, 3, 4),
                        sec=R('wood', 2, 3, 4, 5), outfit='jerkin'),
 ('wayfinder', 2): dict(skin='med', hair='brown', style='short', beard='full', eye='brown', top=R('earth', 1, 2, 3, 4),
                        sec=R('roof_green', 1, 2, 3, 4), outfit='jerkin', masc=True),
 ('wayfinder', 3): dict(skin='dark', hair='black', style='long', eye='dark', top=R('roof_red', 1, 2, 3, 4),
                        sec=R('earth', 1, 2, 3, 4), outfit='jerkin'),
 ('inkblade', 1): dict(skin='light', hair='black', style='hood', mask=R('roof_red', 1, 2, 3, 4), eye='grey',
                       top=R('ink', 1, 2, 3, 4), sec=R('roof_red', 1, 2, 3, 4), hood=R('shadow', 0, 1, 2, 3),
                       outfit='leather', masc=True),
 ('inkblade', 2): dict(skin='med', hair='violet', style='pony', mask=R('roof_green', 1, 2, 3, 4), eye='violet',
                       top=R('stone_cool', 0, 1, 2, 3), sec=R('roof_green', 1, 2, 3, 4), outfit='leather'),
 ('inkblade', 3): dict(skin='dark', hair='white', style='spiky', eye='amber', top=R('cloth_purple', 0, 1, 2, 3),
                       sec=R('shadow', 1, 2, 3, 3), outfit='leather', masc=True),
}


HATS = ('hat_wide', 'chef', 'turban', 'cap', 'helm_round', 'hood_cloth')


def hexf(h):
    return np.array(X.hex2rgb(h), np.float32) / 255


def ramp_at(ramp, t):
    """smooth position t (0 dark .. 1 light) along a list of hex colours"""
    cols = [hexf(c) for c in ramp]
    t = min(max(t, 0.0), 1.0) * (len(cols) - 1)
    i = int(math.floor(t))
    if i >= len(cols) - 1:
        return cols[-1]
    f = t - i
    return cols[i] * (1 - f) + cols[i + 1] * f


class Canvas:
    def __init__(self):
        yy, xx = np.mgrid[0:SS, 0:SS].astype(np.float32)
        self.x, self.y = xx + 0.5, yy + 0.5
        self.rgb = np.zeros((SS, SS, 3), np.float32)

    def shade(self, mask, ramp, cx, cy, rx, ry, lo=-0.2, hi=0.95, flat=None, gain=1.0):
        u = (self.x - cx) / rx
        v = (self.y - cy) / ry
        d = np.clip(u * u + v * v, 0, 1)
        nz = np.sqrt(1 - d)
        lam = (u * LIGHT[0] + v * LIGHT[1] + nz * LIGHT[2]) * gain
        t = np.clip((lam - lo) / (hi - lo), 0, 1)
        if flat is not None:
            t = np.full_like(t, flat)
        cols = np.stack([ramp_at(ramp, float(tt)) for tt in np.linspace(0, 1, 33)])
        idx = np.clip((t * 32).round().astype(int), 0, 32)
        self.rgb[mask] = cols[idx[mask]]

    def ell(self, cx, cy, rx, ry, ramp, clip=None, **k):
        m = ((self.x - cx) / rx) ** 2 + ((self.y - cy) / ry) ** 2 <= 1
        if clip is not None:
            m &= clip
        self.shade(m, ramp, cx, cy, rx, ry, **k)
        return m

    def poly(self, pts, ramp, cx=None, cy=None, rx=None, ry=None, clip=None, **k):
        im = Image.new('L', (SS, SS), 0)
        ImageDraw.Draw(im).polygon(pts, fill=255)
        m = np.asarray(im) > 0
        if clip is not None:
            m &= clip
        xs = [p[0] for p in pts]
        ys = [p[1] for p in pts]
        cx = cx if cx is not None else (min(xs) + max(xs)) / 2
        cy = cy if cy is not None else (min(ys) + max(ys)) / 2
        rx = rx or (max(xs) - min(xs)) / 2 + 1
        ry = ry or (max(ys) - min(ys)) / 2 + 1
        self.shade(m, ramp, cx, cy, rx, ry, **k)
        return m

    def line(self, pts, col, w):
        im = Image.new('L', (SS, SS), 0)
        ImageDraw.Draw(im).line(pts, fill=255, width=w, joint='curve')
        m = np.asarray(im) > 0
        self.rgb[m] = hexf(col) if isinstance(col, str) else col
        return m

    def dot(self, cx, cy, r, col):
        m = (self.x - cx) ** 2 + (self.y - cy) ** 2 <= r * r
        self.rgb[m] = hexf(col) if isinstance(col, str) else col
        return m


def face_mask(c, cx, cy, rx, ry):
    v = (c.y - cy) / ry
    rxx = rx * (1 - 0.32 * np.clip(v, 0, 1) ** 1.6)
    return ((c.x - cx) / rxx) ** 2 + v ** 2 <= 1


def paint(L):
    c = Canvas()
    # field: LQ's portrait blue, lighter toward the top left
    top, bot = hexf('#1d2a67'), hexf('#0e153b')
    t = np.clip((c.y + c.x * 0.3) / (SS * 1.3), 0, 1)[..., None]
    c.rgb[:] = top * (1 - t) + bot * t
    skin, hair = SKIN[L['skin']], HAIR[L['hair']]
    top_r, sec = L['top'], L['sec']
    FX, FY, FRX, FRY = 64, 60, 21, 26
    hat = L['style'] if L['style'] in HATS else None      # head-wear styles (NPC portraits, 2026-11-19)
    style = L.get('under', 'none') if hat else L['style']
    # back hair (long, pony tail behind, hood)
    if style == 'long':
        c.poly([(36, 40), (92, 40), (100, 118), (28, 118)], hair, cx=64, cy=70, rx=40, ry=50)
    if style == 'hood':
        c.ell(64, 62, 38, 44, L['hood'], gain=0.9)
    # shoulders and outfit
    sh = c.ell(64, 128, 58, 36, top_r)
    if L['outfit'] == 'plate':
        for sx in (-1, 1):
            c.ell(64 + sx * 42, 108, 18, 12, STEEL, lo=0.0, hi=1.3)
        c.poly([(46, 96), (82, 96), (78, 128), (50, 128)], top_r)
        c.poly([(56, 96), (72, 96), (64, 108)], STEEL)
    elif L['outfit'] == 'robe':
        for sx in (-1, 1):
            c.poly([(64 + sx * 8, 92), (64 + sx * 18, 92), (64 + sx * 14, 128), (64 + sx * 4, 128)], sec)
    elif L['outfit'] == 'coat':
        for sx in (-1, 1):
            c.poly([(64 + sx * 4, 90), (64 + sx * 22, 88), (64 + sx * 18, 104), (64 + sx * 6, 116)], sec)
    elif L['outfit'] == 'jerkin':
        c.poly([(30, 92), (40, 90), (98, 128), (86, 128)], sec)
        c.dot(80, 112, 3.5, '#c38334')
    elif L['outfit'] == 'leather':
        c.poly([(40, 112), (88, 108), (88, 116), (40, 120)], sec)
    # neck
    c.poly([(54, 72), (74, 72), (76, 98), (52, 98)], skin, cx=60, cy=84, rx=16, ry=16, hi=1.3)
    if L['outfit'] in ('robe', 'coat', 'leather', 'jerkin'):
        c.poly([(48, 94), (80, 94), (72, 104), (56, 104)], top_r if L['outfit'] != 'robe' else sec)
    # ears and face
    for sx in (-1, 1):
        c.ell(FX + sx * 21, 63, 4.5, 7, skin)
    fm = face_mask(c, FX, FY, FRX, FRY)
    c.shade(fm, skin, FX - 4, FY - 6, FRX + 2, FRY, lo=0.0, hi=1.0)
    # cheek warmth and jaw shadow
    for sx in (-1, 1):
        m = ((c.x - (FX + sx * 11)) / 6) ** 2 + ((c.y - 70) / 4) ** 2 <= 1
        c.rgb[m] = c.rgb[m] * 0.82 + hexf('#e06b39') * 0.18
    # eyes
    eye_y = 62
    for sx in (-1, 1):
        ex = FX + sx * 9
        m = ((c.x - ex) / 6.6) ** 2 + ((c.y - eye_y) / 4.2) ** 2 <= 1
        c.rgb[m] = hexf('#e2e0de')
        c.dot(ex + 0.5, eye_y + 0.5, 4.0, EYE[L['eye']])
        c.dot(ex + 0.5, eye_y + 0.5, 2.0, '#14101e')
        c.dot(ex - 1.2, eye_y - 1.4, 1.4, '#f6f4ee')
        c.line([(ex - 7, eye_y - 1), (ex - 3, eye_y - 4.6), (ex + 3, eye_y - 4.6), (ex + 7, eye_y - 1)],
               ramp_at(skin, 0) * 0.45, 4)
        if not L.get('masc'):
            c.line([(ex + sx * 4, eye_y - 3), (ex + sx * 8, eye_y - 5)], '#251d34', 2)
        bw = 4 if L.get('masc') else 3
        c.line([(ex - 6, eye_y - 8 + (sx < 0) * 0), (ex, eye_y - 10), (ex + 6, eye_y - 8)], ramp_at(hair, 0.15), bw)
    # nose and mouth
    c.line([(FX + 3, 64), (FX + 4, 72), (FX + 1, 74)], ramp_at(skin, 0.15), 2)
    c.dot(FX - 3, 74, 1.4, ramp_at(skin, 0.1))
    mouth_y = 81 if not L.get('older') else 82
    lip = ramp_at(skin, 0.0) * 0.6 + hexf('#87332e') * 0.4
    c.line([(FX - 6, mouth_y), (FX, mouth_y + 1), (FX + 6, mouth_y)], lip, 3 if not L.get('masc') else 2)
    if not L.get('masc'):
        c.ell(FX, mouth_y + 3, 4, 1.8, [X.color('roof_red:2'), X.color('roof_red:3')], flat=0.6)
    if L.get('older'):
        c.line([(FX - 13, 70), (FX - 10, 76)], ramp_at(skin, 0.2), 2)
        c.line([(FX + 13, 70), (FX + 10, 76)], ramp_at(skin, 0.2), 2)
    # beard
    if L.get('beard'):
        full = L['beard'] in (True, 'full')
        bm = face_mask(c, FX, FY, FRX + 1, FRY + (4 if full else 1)) & (c.y > (70 if full else 76))
        mouth_hole = ((c.x - FX) / 7) ** 2 + ((c.y - (mouth_y + 1)) / 2.4) ** 2 <= 1
        c.shade(bm & ~mouth_hole, hair, FX, 84, 20, 16, lo=0.15, hi=2.2)
        c.line([(FX - 9, 77), (FX - 2, 75), (FX + 2, 75), (FX + 9, 77)], ramp_at(hair, 0.35), 4)
        c.line([(FX - 6, mouth_y), (FX, mouth_y + 1), (FX + 6, mouth_y)], lip, 2)
    # masks (inkblade)
    if L.get('mask') is not None:
        mm = face_mask(c, FX, FY, FRX + 2, FRY + 3) & (c.y > 67)
        c.shade(mm, L['mask'], FX - 4, 74, 24, 14)
        c.line([(FX - 22, 68), (FX + 22, 68)], ramp_at(L['mask'], 0.0), 2)
    # hair front
    cap_cy, cap_rx, cap_ry = 48, 25, 23
    if style in ('short', 'spiky', 'long', 'pony', 'bun'):
        fringe = {'short': lambda x: 46 + 3 * np.sin((x - 40) / 9) + np.clip(np.abs(x - 64) - 14, 0, 99) * 0.9,
                  'spiky': lambda x: 47 + 4 * np.abs(np.sin((x - 40) / 4.5)) + np.clip(np.abs(x - 64) - 15, 0, 99) * 1.0,
                  'long': lambda x: 44 + np.clip(np.abs(x - 64) - 8, 0, 99) * 1.6,
                  'pony': lambda x: 45 + np.clip(np.abs(x - 64) - 12, 0, 99) * 1.2 + 2 * np.sin((x - 60) / 6),
                  'bun': lambda x: 44 + np.clip(np.abs(x - 64) - 12, 0, 99) * 1.4}[style]
        m = (((c.x - 64) / cap_rx) ** 2 + ((c.y - cap_cy) / cap_ry) ** 2 <= 1) & (c.y < fringe(c.x))
        c.shade(m, hair, 60, 40, 28, 26, lo=-0.25, hi=0.9)
        if style == 'spiky':
            for k in range(5):
                x0 = 44 + k * 8
                c.poly([(x0, 34), (x0 + 9, 32), (x0 + 3 + (k % 2) * 3, 22 + (k % 3) * 3)], hair, cx=60, cy=34, rx=28, ry=18)
        if style == 'long':
            for sx in (-1, 1):
                c.poly([(64 + sx * 18, 44), (64 + sx * 27, 46), (64 + sx * 28, 112), (64 + sx * 19, 104)], hair,
                       cx=60, cy=70, rx=36, ry=44)
        if style == 'pony':
            c.ell(92, 50, 8, 12, hair)
            c.poly([(90, 54), (100, 56), (104, 96), (94, 92)], hair, cx=92, cy=70, rx=16, ry=28)
        if style == 'bun':
            c.ell(64, 24, 12, 10, hair)
        # strand lines
        for k in range(5):
            x0 = 46 + k * 8
            c.line([(x0, 32), (x0 + 3, 44)], ramp_at(hair, 0.15), 1)
        c.line([(52, 30), (62, 27)], ramp_at(hair, 1.0), 2)
    if style == 'helm':
        c.ell(64, 50, 27, 25, STEEL, clip=c.y < 56, lo=0.0, hi=1.3)
        c.poly([(37, 50), (47, 50), (45, 80), (38, 76)], STEEL)
        c.poly([(81, 50), (91, 50), (90, 76), (83, 80)], STEEL)
        c.poly([(61, 50), (67, 50), (66, 70), (62, 70)], STEEL)
        c.line([(38, 52), (90, 52)], '#2e2b4c', 2)
        c.line([(64, 26), (64, 48)], X.color('gold:4'), 3)
    if style == 'hood':
        hm = (((c.x - 64) / 30) ** 2 + ((c.y - 50) / 30) ** 2 <= 1) & ~((((c.x - 64) / 20) ** 2 + ((c.y - 64) / 22) ** 2) <= 1)
        c.shade(hm & (c.y < 90), L['hood'], 58, 40, 32, 34)
    if style == 'bald':
        for sx in (-1, 1):
            m = (((c.x - (64 + sx * 21)) / 5.5) ** 2 + ((c.y - 58) / 10) ** 2 <= 1)
            c.shade(m, hair, 60, 54, 26, 20, lo=-0.25, hi=0.9)
        c.line([(54, 38), (62, 35)], ramp_at(skin, 1.0), 3)
    if L.get('glasses'):
        for sx in (-1, 1):
            ex = FX + sx * 9
            c.line([(ex - 7, 57), (ex + 7, 57), (ex + 7, 67), (ex - 7, 67), (ex - 7, 57)], '#b3b6c4', 2)
        c.line([(FX - 2, 60), (FX + 2, 60)], '#b3b6c4', 2)
    if hat:
        H = L['hat']
        if hat == 'hat_wide':
            c.ell(64, 42, 50, 9, H, lo=-0.4, hi=1.2)
            c.poly([(40, 42), (88, 42), (82, 14), (46, 14)], H, cx=60, cy=26, rx=28, ry=20)
            c.line([(41, 36), (87, 36)], ramp_at(H, 0.1), 4)
        elif hat == 'chef':
            c.poly([(42, 46), (86, 46), (90, 14), (38, 14)], H, cx=58, cy=28, rx=30, ry=24)
            c.ell(64, 16, 30, 13, H, lo=-0.2, hi=1.1)
            c.poly([(40, 40), (88, 40), (88, 48), (40, 48)], H, flat=0.3)
            c.line([(52, 20), (50, 38)], ramp_at(H, 0.4), 2)
            c.line([(72, 20), (74, 38)], ramp_at(H, 0.4), 2)
        elif hat == 'turban':
            m = (((c.x - 64) / 32) ** 2 + ((c.y - 38) / 22) ** 2 <= 1) & (c.y < 50)
            c.shade(m, H, 58, 30, 32, 24, lo=-0.3, hi=1.0)
            for k in range(3):
                c.line([(36 + k * 6, 46 - k * 9), (92 - k * 4, 30 + k * 6)], ramp_at(H, 0.35), 2)
            c.ell(64, 34, 4.5, 5, L.get('jewel', [X.color('roof_red:2'), X.color('roof_red:4')]), lo=-0.3, hi=1.0)
        elif hat in ('cap', 'helm_round'):
            m = (((c.x - 64) / 28) ** 2 + ((c.y - 48) / 25) ** 2 <= 1) & (c.y < 50)
            c.shade(m, H, 58, 38, 30, 26, lo=-0.25, hi=1.1)
            c.poly([(35, 46), (93, 46), (93, 53), (35, 53)], H, flat=0.25 if hat == 'cap' else 0.6)
            if hat == 'helm_round':
                c.line([(64, 24), (64, 46)], ramp_at(H, 1.0), 3)
        elif hat == 'hood_cloth':
            hm = (((c.x - 64) / 33) ** 2 + ((c.y - 54) / 34) ** 2 <= 1) & ~(face_mask(c, FX, FY + 2, FRX - 1, FRY - 2))
            c.shade(hm & (c.y < 100), H, 56, 40, 34, 36)
    # light rim, LQ style: a pale line on the top and left edge
    img = Image.fromarray((np.clip(c.rgb, 0, 1) * 255).astype(np.uint8), 'RGB')
    return img


def finish(img, n):
    small = img.crop((22, 18, 106, 102)).resize((n, n), Image.BOX)
    a = np.asarray(small).astype(np.float32) / 255
    rim = hexf('#b3b6c4')
    a = a.copy()
    a[0, :, :] = rim
    a[:, 0, :] = rim
    a[-1, :, :] = hexf('#0e153b')
    a[:, -1, :] = hexf('#0e153b')
    out = np.concatenate([a, np.ones((n, n, 1), np.float32)], -1)
    return out


def main():
    order = [(c, l) for c in ('warden', 'mender', 'scribe', 'wayfinder', 'inkblade') for l in (1, 2, 3)]
    sheet32 = X.blank(32 * 15, 32 + 64)
    frames = {}
    imgs = {}
    for k, (cls, l) in enumerate(order):
        big = paint(LOOKS[(cls, l)])
        p32 = finish(big, 32)
        p64 = finish(big, 64)
        X.paste(sheet32, p32, k * 32, 0)
        frames[f'{cls}_look{l}'] = [k * 32, 0, 32, 32]
        imgs[(cls, l)] = (p32, p64)
    big_sheet = X.blank(64 * 15, 64)
    for k, (cls, l) in enumerate(order):
        X.paste(big_sheet, imgs[(cls, l)][1], k * 64, 0)
        frames[f'{cls}_look{l}_64'] = [k * 64, 32, 64, 64]
    full = X.blank(64 * 15, 32 + 64)
    X.paste(full, sheet32[:32, :32 * 15], 0, 0)
    X.paste(full, big_sheet, 0, 32)
    X.save_png(full, os.path.join(DST, 'portraits.png'))
    X.write_json(os.path.join(DST, 'portraits.json'), {
        'image': 'portraits.png', 'frames': frames,
        'note': '<class>_look<n> = 32x32 (LQ <name>_32 scale) for the player frame; _64 for the character-creation '
                'preview. Looks match assets/sprites/chars/<class>.json "looks".'})
    # preview: each portrait at 4x beside its sprite at 4x (idle down)
    font = ImageFont.load_default()
    cw, ch = 32 * 4 + 32 * 4 + 64 + 30, 40 * 4 + 24
    out = Image.new('RGB', (cw * 3, ch * 5 + 20), (40, 44, 60))
    d = ImageDraw.Draw(out)
    d.text((4, 4), 'portraits 32x32 at 4x, the 64 version at 1x, and the sprite (idle down) at 4x', fill=(240, 240, 220), font=font)
    for k, (cls, l) in enumerate(order):
        x, y = (l - 1) * cw + 6, (k // 3) * ch + 20
        p32, p64 = imgs[(cls, l)]
        t = X.upscale(p32, 4)
        out.paste(t, (x, y))
        t64 = X.to_pil(p64)
        out.paste(t64, (x + 32 * 4 + 6, y))
        try:
            import json
            sp = Image.open(os.path.join(X.CHARS_DST, cls + '.png')).convert('RGBA')
            js = json.load(open(os.path.join(X.CHARS_DST, cls + '.json')))
            fx, fy, fw, fh = js['frames'][f'look{l}_idle_down_0']
            s = sp.crop((fx, fy, fx + fw, fy + fh)).resize((fw * 4, fh * 4), Image.NEAREST)
            out.paste(s, (x + 32 * 4 + 6 + 64 + 4, y - 20), s)
        except Exception as e:
            print('sprite missing', e)
        d.text((x, y + 32 * 4 + 4), f'{cls}_look{l}', fill=(235, 235, 210), font=font)
    out.save(os.path.join(X.OUT, 'portraits_vs_sprites.png'))
    print('portraits: 15')


if __name__ == '__main__':
    main()
