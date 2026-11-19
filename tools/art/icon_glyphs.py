"""Icon glyphs for Lexicon Realms: ability, talent and item icons are built from these.

Each glyph is a function g(d) drawing in NORMALISED coordinates (0..1 across the glyph box) through a Draw context,
so one design renders at 16x16 (12 px glyph box) and 24x24 (18 px box). Light from the upper left, like the sprites.
Materials are letter strings from ICON_PAL (dark -> light); '0' is the outline.
"""
import math
import mobkit as K

ICON_PAL = {
    '0': 'shadow:0', '@': 'shadow:2', '#': 'shadow:3',
    'a': 'metal:0', 'b': 'metal:1', 'c': 'metal:2', 'd': 'metal:3', 'e': 'metal:4',
    'f': 'gold:1', 'g': 'gold:2', 'h': 'gold:3', 'i': 'gold:4', 'j': 'gold:5',
    'k': 'wood:1', 'l': 'wood:2', 'm': 'wood:3', 'n': 'wood:4',
    'o': 'fire:1', 'p': 'fire:2', 'q': 'fire:3', 'r': 'fire:4', 's': 'fire:5',
    't': 'grass:2', 'u': 'grass:3', 'v': 'grass:4', 'w': 'grass:5',
    'x': 'cloth_blue:2', 'y': 'cloth_blue:4',
    '1': 'ink:1', '2': 'ink:2', '3': 'ink:3', '4': 'ink:4',
    '5': 'magic_cyan:1', '6': 'magic_cyan:2', '7': 'magic_cyan:3', '8': 'magic_cyan:4',
    'A': 'magic_violet:0', 'B': 'magic_violet:1', 'C': 'magic_violet:2', 'D': 'magic_violet:3', 'E': 'magic_violet:4',
    'F': 'roof_red:1', 'G': 'roof_red:2', 'H': 'roof_red:3', 'I': 'roof_red:4',
    'J': 'water:2', 'K': 'water:3', 'L': 'water:4', 'M': 'water:5',
    'N': 'sand:0', 'O': 'sand:1', 'P': 'sand:2', 'Q': 'sand:3',
    'R': 'stone_warm:2', 'S': 'stone_warm:3', 'T': 'stone_warm:4', 'U': 'stone_warm:5',
    'V': 'roof_green:1', 'W': 'roof_green:2', 'X': 'roof_green:3', 'Y': 'roof_green:4',
    'Z': 'blossom:2', 'z': 'skin_light:2', '%': 'skin_light:3', '&': 'stone_cool:3', '*': 'stone_cool:4',
}
STEEL, GOLD, WOOD, FIRE, HEAL = 'abcde', 'fghij', 'klmn', 'opqrs', 'tuvw'
BLUE, INK, CYAN, VIOLET, RED = 'xy', '2347', '5678', 'ABCDE', 'FGHI'
WATER, PARCH, STONE, LEAF, DARK = 'JKLM', 'NOPQ', 'RSTU', 'VWXY', '@#&*'


class Draw:
    def __init__(self, cv, ox, oy, n):
        self.cv, self.ox, self.oy, self.n = cv, ox, oy, n

    def P(self, u, v):
        return (self.ox + u * self.n, self.oy + v * self.n)

    def ell(self, u, v, ru, rv, mat, **k):
        x, y = self.P(u, v)
        return K.ell(self.cv, x, y, max(ru * self.n, 0.7), max(rv * self.n, 0.7), mat, **k)

    def cap(self, u0, v0, u1, v1, r0, r1, mat, **k):
        return K.cap(self.cv, self.P(u0, v0), self.P(u1, v1), max(r0 * self.n, 0.55), max(r1 * self.n, 0.55), mat, **k)

    def poly(self, pts, mat, **k):
        return K.poly(self.cv, [self.P(u, v) for u, v in pts], mat, **k)

    def line(self, u0, v0, u1, v1, ch):
        return K.line(self.cv, self.P(u0, v0), self.P(u1, v1), ch)

    def px(self, u, v, ch):
        x, y = self.P(u, v)
        K.setp(self.cv, x, y, ch)

    def ring(self, u, v, r, ch, a0=0, a1=360, step=None):
        n = int(max(8, r * self.n * 7))
        for k in range(n + 1):
            t = math.radians(a0 + (a1 - a0) * k / n)
            self.px(u + math.cos(t) * r, v + math.sin(t) * r, ch)


# ------------------------------------------------------------------------------------------------- weapons
def sword(d, blade=STEEL, guard=GOLD, flip=False):
    f = (lambda u: 1 - u) if flip else (lambda u: u)
    d.cap(f(0.34), 0.66, f(0.9), 0.1, 0.075, 0.045, blade)
    d.line(f(0.4), 0.56, f(0.86), 0.1, blade[-1])
    d.cap(f(0.16), 0.54, f(0.46), 0.84, 0.06, 0.06, guard)
    d.cap(f(0.28), 0.72, f(0.13), 0.87, 0.05, 0.05, WOOD)
    d.ell(f(0.1), 0.9, 0.075, 0.075, guard)


def greatsword(d):
    d.cap(0.3, 0.7, 0.9, 0.1, 0.11, 0.06, STEEL)
    d.line(0.38, 0.58, 0.86, 0.1, 'e')
    d.cap(0.12, 0.52, 0.48, 0.88, 0.07, 0.07, GOLD)
    d.cap(0.26, 0.74, 0.1, 0.9, 0.06, 0.06, WOOD)


def shield(d, face='xy', rim=GOLD, emblem=None):
    d.poly([(0.16, 0.1), (0.84, 0.1), (0.84, 0.5), (0.5, 0.94), (0.16, 0.5)], rim)
    d.poly([(0.24, 0.18), (0.76, 0.18), (0.76, 0.48), (0.5, 0.82), (0.24, 0.48)], face)
    if emblem == 'cross':
        d.cap(0.5, 0.24, 0.5, 0.7, 0.05, 0.05, GOLD)
        d.cap(0.3, 0.38, 0.7, 0.38, 0.05, 0.05, GOLD)
    elif emblem == 'dot':
        d.ell(0.5, 0.42, 0.11, 0.11, GOLD)
    elif emblem == 'crack':
        d.line(0.52, 0.16, 0.42, 0.4, '0')
        d.line(0.42, 0.4, 0.56, 0.56, '0')
        d.line(0.56, 0.56, 0.48, 0.8, '0')


def staff_rod(d, orb=HEAL):
    d.cap(0.2, 0.92, 0.66, 0.34, 0.05, 0.05, WOOD)
    d.cap(0.62, 0.38, 0.78, 0.22, 0.07, 0.07, GOLD)
    d.ell(0.8, 0.18, 0.13, 0.13, orb)
    d.px(0.76, 0.13, orb[-1])


def quill(d, glow=CYAN):
    d.poly([(0.84, 0.06), (0.6, 0.18), (0.3, 0.62), (0.4, 0.66), (0.72, 0.32)], 'RSTU')
    d.line(0.8, 0.1, 0.34, 0.64, 'S')
    d.cap(0.34, 0.64, 0.16, 0.9, 0.04, 0.03, 'abc')
    d.px(0.14, 0.92, glow[-1])
    d.px(0.1, 0.9, glow[-2])


def book(d, cover='FGHI', open_=False):
    if open_:
        d.poly([(0.06, 0.3), (0.5, 0.38), (0.5, 0.86), (0.06, 0.78)], PARCH)
        d.poly([(0.5, 0.38), (0.94, 0.3), (0.94, 0.78), (0.5, 0.86)], PARCH)
        d.line(0.5, 0.38, 0.5, 0.86, 'N')
        for k in range(3):
            d.line(0.14, 0.46 + k * 0.1, 0.4, 0.5 + k * 0.1, '2')
            d.line(0.6, 0.5 + k * 0.1, 0.86, 0.46 + k * 0.1, '2')
    else:
        d.poly([(0.2, 0.12), (0.8, 0.12), (0.8, 0.9), (0.2, 0.9)], cover)
        d.poly([(0.72, 0.16), (0.84, 0.16), (0.84, 0.86), (0.72, 0.86)], PARCH)
        d.ell(0.46, 0.46, 0.12, 0.14, GOLD)
        d.line(0.26, 0.14, 0.26, 0.88, cover[0])


def bow(d, drawn=False):
    d.line(0.62, 0.1, 0.62, 0.9, 'e')
    for k in range(13):
        t = -1 + k / 6
        u = 0.64 - math.cos(t * 1.2) * 0.4
        d.cap(u, 0.5 + t * 0.42, u, 0.5 + t * 0.42, 0.075, 0.075, 'lmn')
    d.cap(0.24, 0.44, 0.24, 0.56, 0.08, 0.08, 'GHI')


def arrow(d, u0=0.12, v0=0.88, u1=0.86, v1=0.14, head=STEEL, flet='GHI'):
    d.line(u0, v0, u1, v1, 'm')
    dx, dy = u1 - u0, v1 - v0
    L = math.hypot(dx, dy)
    ux, uy = dx / L, dy / L
    px, py = -uy, ux
    d.poly([(u1 + ux * 0.06, v1 + uy * 0.06), (u1 - ux * 0.16 + px * 0.09, v1 - uy * 0.16 + py * 0.09),
            (u1 - ux * 0.16 - px * 0.09, v1 - uy * 0.16 - py * 0.09)], head)
    for s in (1, -1):
        d.line(u0 + ux * 0.04, v0 + uy * 0.04, u0 + ux * 0.14 + px * 0.08 * s, v0 + uy * 0.14 + py * 0.08 * s, flet[-1])


def dagger(d, u=0.3, v=0.8, ang=-45, L=0.62, blade=STEEL, flip=False):
    a = math.radians(ang)
    ux, uy = math.cos(a), math.sin(a)
    if flip:
        ux = -ux
    tip = (u + ux * L, v + uy * L)
    d.cap(u + ux * 0.16, v + uy * 0.16, tip[0], tip[1], 0.07, 0.025, blade)
    d.cap(u + ux * 0.13 - uy * 0.11, v + uy * 0.13 + ux * 0.11, u + ux * 0.13 + uy * 0.11, v + uy * 0.13 - ux * 0.11, 0.04, 0.04, 'Dg')
    d.cap(u, v, u + ux * 0.1, v + uy * 0.1, 0.045, 0.045, '12')


def twin_daggers(d):
    dagger(d, 0.12, 0.88, -45, 0.86)
    dagger(d, 0.88, 0.88, -45, 0.86, flip=True)


def hand_bell(d, mat=GOLD):
    d.cap(0.5, 0.06, 0.5, 0.28, 0.06, 0.06, WOOD)
    d.poly([(0.36, 0.28), (0.64, 0.28), (0.82, 0.74), (0.18, 0.74)], mat)
    d.ell(0.5, 0.74, 0.34, 0.08, mat)
    d.ell(0.5, 0.84, 0.08, 0.08, 'abc')


def potion(d, liquid='FGHI', shape='round'):
    d.cap(0.5, 0.08, 0.5, 0.26, 0.09, 0.09, WOOD)
    d.ell(0.5, 0.62, 0.3, 0.3, 'JKLM' if liquid == 'glass' else liquid)
    d.ell(0.5, 0.62, 0.3, 0.3, liquid, clip=lambda x, y: y >= d.oy + 0.52 * d.n)
    d.cap(0.5, 0.24, 0.5, 0.34, 0.1, 0.1, 'cde')
    d.px(0.38, 0.5, 'e')
    d.px(0.36, 0.56, 'e')


# ----------------------------------------------------------------------------------------------- armour slots
def armor(d, slot, kind):
    mats = {'plate': STEEL, 'mail': '&*cd', 'leather': WOOD, 'cloth': {'x': 'xy'}.get('x')}
    m = {'plate': STEEL, 'mail': 'b&*d', 'leather': 'klmn', 'cloth': 'ABCD'}[kind]
    trim = {'plate': GOLD, 'mail': 'klm', 'leather': 'NOP', 'cloth': GOLD}[kind]
    if slot == 'head':
        if kind == 'cloth':
            d.poly([(0.5, 0.06), (0.86, 0.72), (0.14, 0.72)], m)
            d.ell(0.5, 0.74, 0.4, 0.1, trim)
        elif kind == 'leather':
            d.ell(0.5, 0.52, 0.36, 0.34, m, clip=lambda x, y: y <= d.oy + 0.7 * d.n)
            d.poly([(0.14, 0.62), (0.86, 0.62), (0.9, 0.86), (0.1, 0.86)], m)
            d.ell(0.5, 0.64, 0.22, 0.14, ['0'], flat='0')
        else:
            d.ell(0.5, 0.5, 0.36, 0.38, m, clip=lambda x, y: y <= d.oy + 0.8 * d.n)
            d.line(0.24, 0.5, 0.76, 0.5, '0')
            d.cap(0.5, 0.14, 0.5, 0.78, 0.05, 0.05, trim)
            if kind == 'mail':
                for k in range(3):
                    d.px(0.3 + k * 0.2, 0.7, '0')
    elif slot == 'chest':
        d.poly([(0.16, 0.18), (0.36, 0.1), (0.64, 0.1), (0.84, 0.18), (0.9, 0.46), (0.74, 0.46), (0.72, 0.9),
                (0.28, 0.9), (0.26, 0.46), (0.1, 0.46)], m)
        d.cap(0.4, 0.12, 0.5, 0.3, 0.04, 0.04, trim)
        d.cap(0.6, 0.12, 0.5, 0.3, 0.04, 0.04, trim)
        d.line(0.3, 0.8, 0.7, 0.8, trim[1])
        if kind == 'mail':
            for yy in (0.45, 0.6):
                for k in range(4):
                    d.px(0.34 + k * 0.1, yy + (k % 2) * 0.05, '0')
        if kind == 'plate':
            d.line(0.5, 0.34, 0.5, 0.76, 'a')
    elif slot == 'legs':
        d.poly([(0.2, 0.08), (0.8, 0.08), (0.86, 0.9), (0.58, 0.9), (0.5, 0.36), (0.42, 0.9), (0.14, 0.9)], m)
        d.line(0.22, 0.18, 0.78, 0.18, trim[1])
        if kind == 'plate':
            d.ell(0.3, 0.56, 0.1, 0.08, 'cde')
            d.ell(0.7, 0.56, 0.1, 0.08, 'cde')
    elif slot == 'feet':
        d.poly([(0.3, 0.08), (0.62, 0.08), (0.62, 0.6), (0.92, 0.72), (0.92, 0.9), (0.24, 0.9), (0.26, 0.6)], m)
        d.line(0.3, 0.16, 0.62, 0.16, trim[1])
        d.line(0.24, 0.84, 0.92, 0.84, '0')
    elif slot == 'hands':
        d.poly([(0.28, 0.9), (0.28, 0.5), (0.18, 0.36), (0.26, 0.3), (0.36, 0.42), (0.36, 0.14), (0.46, 0.12),
                (0.48, 0.38), (0.52, 0.1), (0.62, 0.12), (0.6, 0.4), (0.68, 0.16), (0.78, 0.2), (0.74, 0.5),
                (0.74, 0.9)], m)
        d.line(0.28, 0.76, 0.74, 0.76, trim[1])
    elif slot == 'trinket':
        d.ring(0.5, 0.36, 0.22, 'h', 200, 340)
        d.line(0.3, 0.24, 0.5, 0.52, 'g')
        d.line(0.7, 0.24, 0.5, 0.52, 'g')
        d.ell(0.5, 0.66, 0.2, 0.22, m if kind != 'plate' else CYAN)


# --------------------------------------------------------------------------------------------------- symbols
def flame(d, mat=FIRE, u=0.5, v=0.58, s=1.0):
    d.ell(u, v + 0.12 * s, 0.26 * s, 0.26 * s, mat, bias=0.2)
    d.poly([(u - 0.24 * s, v + 0.08 * s), (u + 0.06 * s, v - 0.46 * s), (u + 0.24 * s, v + 0.06 * s)], mat, bias=0.1)
    d.ell(u, v + 0.18 * s, 0.11 * s, 0.14 * s, mat[-2:], bias=0.4)


def sparkle(d, u, v, r, ch='e', arm='i'):
    d.px(u, v, ch)
    for k in range(1, max(2, int(r * d.n)) + 1):
        for du, dv in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            d.px(u + du * k / d.n, v + dv * k / d.n, arm)


def heart(d, mat='FGHI'):
    d.ell(0.32, 0.36, 0.2, 0.2, mat)
    d.ell(0.68, 0.36, 0.2, 0.2, mat)
    d.poly([(0.13, 0.42), (0.87, 0.42), (0.5, 0.88)], mat)
    d.px(0.26, 0.3, 'I')


def cross(d, mat=HEAL):
    d.poly([(0.38, 0.1), (0.62, 0.1), (0.62, 0.38), (0.9, 0.38), (0.9, 0.62), (0.62, 0.62), (0.62, 0.9), (0.38, 0.9),
            (0.38, 0.62), (0.1, 0.62), (0.1, 0.38), (0.38, 0.38)], mat)


def drop(d, mat=INK, u=0.5, v=0.6, s=1.0):
    d.ell(u, v + 0.08 * s, 0.28 * s, 0.28 * s, mat)
    d.poly([(u - 0.25 * s, v), (u, v - 0.48 * s), (u + 0.25 * s, v)], mat)
    d.px(u - 0.12 * s, v, mat[-1])


def letter(d, ch, u, v, mat='8', s=1.0):
    """tiny block letters (3x5 at 16 px): A, a few more"""
    glyphs = {'A': ['.#.', '#.#', '###', '#.#', '#.#'], 'Q': ['###', '#.#', '#.#', '##.', '..#'],
              'L': ['#..', '#..', '#..', '#..', '###'], 'T': ['###', '.#.', '.#.', '.#.', '.#.'],
              'N': ['#.#', '###', '###', '#.#', '#.#'], 'I': ['###', '.#.', '.#.', '.#.', '###'],
              '!': ['#', '#', '#', '.', '#'], ';': ['.', '#', '.', '#', '#'], '(': ['.#', '#.', '#.', '#.', '.#'],
              '"': ['#.#', '#.#', '...', '...', '...']}
    g = glyphs[ch]
    px = max(1, int(s * d.n / 12))
    x0, y0 = d.P(u, v)
    for j, row in enumerate(g):
        for i, c in enumerate(row):
            if c == '#':
                for a in range(px):
                    for b in range(px):
                        K.setp(d.cv, x0 + i * px + a, y0 + j * px + b, mat)


def eye(d, iris=CYAN, ink=False):
    d.poly([(0.06, 0.5), (0.3, 0.28), (0.7, 0.28), (0.94, 0.5), (0.7, 0.72), (0.3, 0.72)], 'RSTU' if not ink else 'STU')
    d.ell(0.5, 0.5, 0.18, 0.2, iris)
    d.ell(0.5, 0.5, 0.07, 0.08, ['0'], flat='0')
    d.px(0.44, 0.42, 'e')


def boot(d, mat=WOOD):
    d.poly([(0.32, 0.1), (0.62, 0.1), (0.62, 0.56), (0.92, 0.7), (0.92, 0.88), (0.26, 0.88), (0.28, 0.56)], mat)
    d.line(0.32, 0.2, 0.62, 0.2, mat[-1])


def wind(d, u=0.0, v=0.0, ch='e'):
    for k, (y, L) in enumerate(((0.3, 0.3), (0.5, 0.42), (0.7, 0.26))):
        d.line(0.06 + u, y + v, 0.06 + L + u, y + v, ch if k != 1 else 'd')


def ring_aura(d, ch='i', r=0.42):
    d.ring(0.5, 0.5, r, ch)


def swirl(d, mat='v'):
    for k in range(22):
        t = k / 21 * math.pi * 2.6
        r = 0.08 + k * 0.016
        d.px(0.5 + math.cos(t) * r, 0.5 + math.sin(t) * r, mat if k > 4 else 'w')


def lantern(d, glow=FIRE, frame=STEEL):
    d.ring(0.5, 0.14, 0.08, 'b', 180, 360)
    d.poly([(0.32, 0.22), (0.68, 0.22), (0.6, 0.3), (0.4, 0.3)], frame)
    d.poly([(0.3, 0.3), (0.7, 0.3), (0.7, 0.76), (0.3, 0.76)], 'qrs' if glow == FIRE else glow)
    flame(d, glow, 0.5, 0.56, 0.5)
    for x in (0.3, 0.5, 0.7):
        d.line(x, 0.3, x, 0.76, frame[1])
    d.poly([(0.26, 0.76), (0.74, 0.76), (0.7, 0.88), (0.3, 0.88)], frame)


def sun(d, mat=GOLD, rays=True, r=0.22):
    if rays:
        for k in range(8):
            a = math.radians(k * 45 + 22)
            d.line(0.5 + math.cos(a) * (r + 0.07), 0.5 + math.sin(a) * (r + 0.07),
                   0.5 + math.cos(a) * (r + 0.24), 0.5 + math.sin(a) * (r + 0.24), mat[-2])
    d.ell(0.5, 0.5, r, r, mat, bias=0.2)


def moon(d, mat='cde'):
    d.ell(0.5, 0.5, 0.36, 0.36, mat)
    d.ell(0.66, 0.38, 0.3, 0.3, ['0'], flat='.')


def chain(d, broken=False):
    for k in range(4):
        u = 0.16 + k * 0.22
        if broken and k == 2:
            continue
        d.ring(u, 0.5 + (k % 2) * 0.0, 0.12, 'c' if k % 2 else 'b')
    if broken:
        d.px(0.6, 0.38, 'i')
        d.px(0.64, 0.62, 'i')
        sparkle(d, 0.62, 0.5, 0.1, 'j', 'i')


def fist(d, mat=STEEL):
    d.poly([(0.22, 0.3), (0.78, 0.3), (0.82, 0.62), (0.7, 0.8), (0.3, 0.8), (0.2, 0.62)], mat)
    for k in range(3):
        d.line(0.36 + k * 0.14, 0.32, 0.36 + k * 0.14, 0.5, '0')
    d.poly([(0.32, 0.8), (0.68, 0.8), (0.66, 0.94), (0.34, 0.94)], 'klm')


def burst(d, mat='ij', n=8, r0=0.14, r1=0.44, u=0.5, v=0.5):
    for k in range(n):
        a = math.radians(k * 360 / n)
        d.line(u + math.cos(a) * r0, v + math.sin(a) * r0, u + math.cos(a) * r1, v + math.sin(a) * r1, mat[k % len(mat)])


def chevrons(d, n=3, mat='qrs', up=True):
    for k in range(n):
        y = 0.7 - k * 0.24 if up else 0.3 + k * 0.24
        dy = -0.18 if up else 0.18
        d.cap(0.18, y, 0.5, y + dy, 0.06, 0.06, mat)
        d.cap(0.5, y + dy, 0.82, y, 0.06, 0.06, mat)


def clock(d, mat='cde'):
    d.ell(0.5, 0.5, 0.38, 0.38, mat)
    d.line(0.5, 0.5, 0.5, 0.24, '0')
    d.line(0.5, 0.5, 0.7, 0.58, '0')


def hourglass(d):
    d.poly([(0.24, 0.12), (0.76, 0.12), (0.5, 0.5), (0.76, 0.88), (0.24, 0.88), (0.5, 0.5)], 'MLK')
    d.poly([(0.36, 0.7), (0.64, 0.7), (0.72, 0.84), (0.28, 0.84)], PARCH)
    d.cap(0.18, 0.1, 0.82, 0.1, 0.05, 0.05, WOOD)
    d.cap(0.18, 0.9, 0.82, 0.9, 0.05, 0.05, WOOD)


def scroll(d, text=True):
    d.poly([(0.16, 0.2), (0.84, 0.2), (0.84, 0.8), (0.16, 0.8)], PARCH)
    d.cap(0.12, 0.18, 0.88, 0.18, 0.07, 0.07, 'NOP')
    d.cap(0.12, 0.82, 0.88, 0.82, 0.07, 0.07, 'NOP')
    if text:
        for k in range(3):
            d.line(0.26, 0.36 + k * 0.14, 0.74 - (k == 2) * 0.2, 0.36 + k * 0.14, '2')


def bubble(d, mat='JKLM'):
    d.ring(0.5, 0.5, 0.42, 'L')
    d.ring(0.5, 0.5, 0.36, 'K', 180, 290)
    d.px(0.3, 0.3, 'M')
    d.px(0.26, 0.36, 'M')


def footprints(d, mat='BCD'):
    for k, (u, v) in enumerate(((0.3, 0.78), (0.62, 0.54), (0.36, 0.3), (0.68, 0.08))):
        d.ell(u, v + 0.06, 0.08, 0.11, mat)
        d.px(u - 0.06, v - 0.06, mat[-1])


def hood_face(d, mat=VIOLET, fade=False):
    d.poly([(0.5, 0.06), (0.86, 0.52), (0.92, 0.94), (0.08, 0.94), (0.14, 0.52)], mat)
    d.ell(0.5, 0.52, 0.2, 0.2, ['1'], flat='1')
    d.px(0.42, 0.5, '8')
    d.px(0.58, 0.5, '8')
    if fade:
        for y in range(d.cv.shape[0]):
            for x in range(d.cv.shape[1]):
                if (x + y) % 2 == 0 and y > d.oy + 0.5 * d.n and d.cv[y, x] not in '.0':
                    d.cv[y, x] = '.'


def bracket(d, mat=CYAN):
    for s in (1, -1):
        u0 = 0.5 - s * 0.36
        d.cap(u0, 0.12, u0, 0.88, 0.06, 0.06, mat)
        d.cap(u0, 0.12, u0 + s * 0.16, 0.12, 0.06, 0.06, mat)
        d.cap(u0, 0.88, u0 + s * 0.16, 0.88, 0.06, 0.06, mat)


def trap(d, sprung=False):
    d.ell(0.5, 0.66, 0.38, 0.14, STEEL)
    for k in range(5):
        u = 0.18 + k * 0.16
        if sprung:
            d.line(u, 0.62, 0.5 + (u - 0.5) * 0.3, 0.2, 'd')
        else:
            d.line(u, 0.62, u + (u - 0.5) * 0.2, 0.42, 'd')
    d.ell(0.5, 0.66, 0.1, 0.06, 'fgh')


def thorns(d, mat=LEAF):
    for k in range(3):
        u = 0.2 + k * 0.3
        d.cap(u, 0.92, u + 0.08, 0.2, 0.06, 0.03, mat)
        d.line(u + 0.02, 0.6, u - 0.1, 0.5, mat[-1])
        d.line(u + 0.05, 0.4, u + 0.17, 0.32, mat[-1])


def vine_loop(d):
    d.ring(0.5, 0.56, 0.3, 'W')
    d.ring(0.5, 0.56, 0.24, 'X', 200, 340)
    for a in (40, 160, 280):
        t = math.radians(a)
        d.ell(0.5 + math.cos(t) * 0.3, 0.56 + math.sin(t) * 0.3, 0.08, 0.06, LEAF)


def target_mark(d, mat='GHI'):
    d.ring(0.5, 0.5, 0.36, 'H')
    d.ring(0.5, 0.5, 0.18, 'I')
    d.px(0.5, 0.5, 'I')
    for (u, v, u2, v2) in ((0.5, 0.02, 0.5, 0.2), (0.5, 0.8, 0.5, 0.98), (0.02, 0.5, 0.2, 0.5), (0.8, 0.5, 0.98, 0.5)):
        d.line(u, v, u2, v2, 'e')


def splash(d, mat=INK):
    d.ell(0.5, 0.56, 0.24, 0.22, mat)
    for k in range(7):
        a = math.radians(k * 51 + 10)
        d.ell(0.5 + math.cos(a) * 0.38, 0.56 + math.sin(a) * 0.32, 0.06 + (k % 2) * 0.03, 0.06 + (k % 2) * 0.03, mat)
    d.px(0.42, 0.48, mat[-1])


def pool(d, mat=INK):
    d.ell(0.5, 0.7, 0.42, 0.18, mat)
    d.ell(0.5, 0.68, 0.26, 0.08, mat[-2:])
    drop(d, mat, 0.5, 0.32, 0.5)


def wave(d, mat=INK, rows=2):
    for r in range(rows):
        for k in range(16):
            u = 0.06 + k * 0.058
            d.px(u, 0.42 + r * 0.26 + math.sin(k * 0.8) * 0.08, mat[-1 - (r % 2)])
            d.px(u, 0.46 + r * 0.26 + math.sin(k * 0.8) * 0.08, mat[-2 - (r % 2)])


def bell_waves(d, mat=GOLD):
    hand_bell(d, mat)
    for r in (0.36, 0.48):
        d.ring(0.5, 0.5, r, 'j', 200, 250)
        d.ring(0.5, 0.5, r, 'j', 290, 340)


def shout(d, mat='GHI'):
    d.poly([(0.08, 0.36), (0.36, 0.36), (0.62, 0.14), (0.62, 0.86), (0.36, 0.64), (0.08, 0.64)], STEEL)
    for r in (0.18, 0.3):
        d.ring(0.66, 0.5, r, 'I', -50, 50)


def heart_swirl(d):
    heart(d, 'FGHI')
    d.ring(0.5, 0.52, 0.44, 'v', 150, 360)
    d.px(0.9, 0.42, 'w')


def anvil(d):
    d.poly([(0.08, 0.34), (0.86, 0.34), (0.92, 0.46), (0.7, 0.5), (0.62, 0.7), (0.78, 0.86), (0.22, 0.86),
            (0.38, 0.7), (0.3, 0.5)], STEEL)


def tower(d):
    d.poly([(0.32, 0.2), (0.68, 0.2), (0.74, 0.92), (0.26, 0.92)], 'RSTU')
    d.poly([(0.26, 0.12), (0.74, 0.12), (0.74, 0.24), (0.26, 0.24)], 'RST')
    flame(d, FIRE, 0.5, 0.1, 0.35)
    d.ell(0.5, 0.48, 0.07, 0.1, 'qrs')


def hearth(d):
    d.poly([(0.1, 0.24), (0.9, 0.24), (0.9, 0.92), (0.1, 0.92)], 'RST')
    d.poly([(0.24, 0.44), (0.76, 0.44), (0.76, 0.92), (0.24, 0.92)], ['0'], flat='@')
    flame(d, FIRE, 0.5, 0.76, 0.55)
    d.cap(0.06, 0.22, 0.94, 0.22, 0.06, 0.06, WOOD)


def sunrise(d):
    d.ell(0.5, 0.74, 0.3, 0.3, GOLD, clip=lambda x, y: y < d.oy + 0.72 * d.n)
    for k in range(5):
        a = math.radians(200 + k * 35)
        d.line(0.5 + math.cos(a) * 0.36, 0.72 + math.sin(a) * 0.36, 0.5 + math.cos(a) * 0.5, 0.72 + math.sin(a) * 0.5, 'i')
    d.cap(0.06, 0.78, 0.94, 0.78, 0.05, 0.05, 'xy')


def leaf(d, mat=HEAL):
    d.ell(0.5, 0.46, 0.22, 0.36, mat)
    d.line(0.5, 0.14, 0.5, 0.92, mat[0])


def roots(d):
    boot(d, WOOD)
    for k in range(3):
        u = 0.32 + k * 0.22
        d.line(u, 0.9, u - 0.06 + k * 0.06, 1.0, 'W')


def dash_lines(d, mat='d'):
    for k in range(3):
        d.line(0.04, 0.3 + k * 0.2, 0.3, 0.3 + k * 0.2, mat)


def skull(d):
    d.ell(0.5, 0.42, 0.32, 0.3, 'RSTU')
    d.poly([(0.32, 0.6), (0.68, 0.6), (0.64, 0.86), (0.36, 0.86)], 'RSTU')
    d.ell(0.38, 0.44, 0.08, 0.08, ['0'], flat='0')
    d.ell(0.62, 0.44, 0.08, 0.08, ['0'], flat='0')
    d.line(0.44, 0.78, 0.56, 0.78, '0')


def coin(d, n=3):
    for k in range(n):
        d.ell(0.38, 0.8 - k * 0.15, 0.3, 0.11, GOLD, sep=True)
    d.ell(0.72, 0.6, 0.2, 0.26, GOLD, sep=True)
    d.ell(0.72, 0.6, 0.1, 0.14, 'gh')
    d.px(0.66, 0.46, 'j')


def bread(d):
    d.ell(0.5, 0.58, 0.4, 0.26, 'lmnP')
    for k in range(3):
        d.line(0.3 + k * 0.18, 0.44, 0.38 + k * 0.18, 0.56, 'l')


def hen(d):
    d.ell(0.5, 0.6, 0.32, 0.26, 'RSTU')
    d.ell(0.26, 0.34, 0.14, 0.14, 'RSTU')
    d.poly([(0.12, 0.34), (0.02, 0.4), (0.12, 0.42)], 'hi')
    d.ell(0.26, 0.2, 0.06, 0.06, 'GHI')
    d.poly([(0.78, 0.4), (0.94, 0.3), (0.86, 0.58)], 'STU')
    d.px(0.24, 0.32, '0')
    d.line(0.44, 0.86, 0.42, 0.96, 'h')
    d.line(0.58, 0.86, 0.6, 0.96, 'h')


def crate(d, mat=WOOD):
    d.poly([(0.12, 0.2), (0.88, 0.2), (0.88, 0.88), (0.12, 0.88)], mat)
    d.line(0.12, 0.2, 0.88, 0.88, mat[0])
    d.line(0.14, 0.54, 0.86, 0.54, mat[0])


def fleece(d):
    for (u, v) in ((0.3, 0.4), (0.52, 0.32), (0.72, 0.44), (0.4, 0.62), (0.64, 0.64), (0.24, 0.62)):
        d.ell(u, v, 0.18, 0.16, 'RSTU', sep=True)


def hide(d):
    d.poly([(0.2, 0.22), (0.8, 0.22), (0.92, 0.46), (0.8, 0.92), (0.2, 0.92), (0.08, 0.46)], 'klm')
    d.poly([(0.3, 0.32), (0.7, 0.32), (0.78, 0.5), (0.7, 0.82), (0.3, 0.82), (0.22, 0.5)], '#&*')
    for k in range(4):
        u = 0.26 + k * 0.16
        d.poly([(u - 0.06, 0.36), (u + 0.06, 0.36), (u + 0.02, 0.02)], 'TU', sep=True)


def hay(d):
    d.poly([(0.2, 0.3), (0.8, 0.3), (0.9, 0.9), (0.1, 0.9)], 'gh')
    for k in range(6):
        d.line(0.16 + k * 0.13, 0.34, 0.12 + k * 0.14, 0.86, 'i')
    drop(d, INK, 0.62, 0.62, 0.4)


def button(d):
    d.ell(0.5, 0.5, 0.36, 0.36, 'klmn')
    for (u, v) in ((0.4, 0.4), (0.6, 0.4), (0.4, 0.6), (0.6, 0.6)):
        d.px(u, v, '0')
    d.px(0.3, 0.28, 'n')


def tusk(d):
    for k in range(8):
        t = k / 7
        d.cap(0.2 + t * 0.6, 0.86 - math.sin(t * 2.4) * 0.6, 0.2 + t * 0.6, 0.86 - math.sin(t * 2.4) * 0.6,
              0.11 - t * 0.07, 0.11 - t * 0.07, 'STU')


def chime(d):
    d.cap(0.5, 0.06, 0.5, 0.2, 0.04, 0.04, 'b')
    d.cap(0.34, 0.22, 0.66, 0.22, 0.05, 0.05, 'bc')
    for k, L in enumerate((0.56, 0.7, 0.48)):
        u = 0.36 + k * 0.14
        d.cap(u, 0.26, u, 0.26 + L, 0.05, 0.05, 'cde')


def page(d, letter_ch=None):
    d.poly([(0.2, 0.08), (0.7, 0.08), (0.84, 0.22), (0.84, 0.92), (0.2, 0.92)], PARCH)
    d.poly([(0.7, 0.08), (0.84, 0.22), (0.7, 0.22)], 'NO')
    for k in range(4):
        d.line(0.3, 0.32 + k * 0.14, 0.74 - (k == 3) * 0.2, 0.32 + k * 0.14, '2')


def underline_glyph(d, mat=CYAN):
    letter(d, 'A', 0.32, 0.1, '8', 1.4)
    d.cap(0.1, 0.86, 0.9, 0.86, 0.06, 0.06, mat)


def fullstop(d):
    d.ell(0.5, 0.5, 0.24, 0.24, INK)
    d.ring(0.5, 0.5, 0.42, '7')
    d.px(0.42, 0.42, '4')


def letters_burst(d):
    for (ch, u, v) in (('A', 0.1, 0.1), ('Q', 0.6, 0.06), ('T', 0.66, 0.56), ('L', 0.08, 0.58), ('I', 0.38, 0.32)):
        letter(d, ch, u, v, '8' if ch != 'I' else '7', 12 / d.n)


def squiggle(d, mat='7'):
    for k in range(24):
        t = k / 23
        u = 0.08 + t * 0.84
        v = 0.5 + math.sin(t * 9) * 0.22
        d.px(u, v, mat)
        d.px(u, v + 1 / d.n, '6')


def inkbolt(d):
    drop(d, INK, 0.44, 0.58, 1.0)
    letter(d, 'A', 0.32, 0.48, '8', 1.0)
    d.line(0.72, 0.36, 0.94, 0.14, '7')
    d.line(0.76, 0.5, 0.96, 0.4, '6')


def eye_ink(d):
    eye(d, INK)
    for k in range(3):
        d.px(0.3 + k * 0.2, 0.78 + (k % 2) * 0.08, '2')
        d.px(0.3 + k * 0.2, 0.86 + (k % 2) * 0.08, '1')


def drip_line(d, mat='FGH'):
    d.cap(0.08, 0.3, 0.92, 0.3, 0.06, 0.06, mat)
    for k, L in enumerate((0.3, 0.5, 0.24, 0.4)):
        u = 0.18 + k * 0.2
        d.cap(u, 0.3, u, 0.3 + L, 0.04, 0.03, mat)
        d.ell(u, 0.34 + L, 0.05, 0.06, mat)


def two_marks(d, mat='GHI'):
    d.cap(0.24, 0.2, 0.48, 0.8, 0.06, 0.04, mat)
    d.cap(0.56, 0.2, 0.8, 0.8, 0.06, 0.04, mat)


def crossed_swords(d):
    sword(d)
    sword(d, flip=True)


def banner(d, mat='xy'):
    d.cap(0.24, 0.06, 0.24, 0.94, 0.04, 0.04, WOOD)
    d.poly([(0.28, 0.1), (0.84, 0.1), (0.72, 0.34), (0.84, 0.58), (0.28, 0.58)], mat)
    d.ell(0.5, 0.33, 0.08, 0.08, GOLD)


def wall(d):
    for r in range(3):
        for k in range(3 + (r % 2)):
            u = 0.08 + k * 0.28 - (r % 2) * 0.14
            d.poly([(u, 0.2 + r * 0.24), (u + 0.26, 0.2 + r * 0.24), (u + 0.26, 0.42 + r * 0.24), (u, 0.42 + r * 0.24)],
                   'RST', sep=True)


def feather(d, mat='MLK'):
    d.ell(0.52, 0.42, 0.2, 0.36, mat)
    d.line(0.62, 0.08, 0.3, 0.94, 'J')


def snare_loop(d):
    d.ring(0.56, 0.42, 0.24, 'm')
    d.line(0.4, 0.6, 0.12, 0.92, 'm')
    d.line(0.42, 0.62, 0.14, 0.94, 'l')


def hedge(d):
    for k, u in enumerate((0.2, 0.5, 0.8)):
        d.ell(u, 0.5 - (k == 1) * 0.1, 0.22, 0.3, LEAF, sep=True)
    d.poly([(0.04, 0.7), (0.96, 0.7), (0.96, 0.92), (0.04, 0.92)], 'VWX')
    for k in range(5):
        d.px(0.14 + k * 0.18, 0.34 + (k % 2) * 0.2, 'w')


def road(d):
    d.poly([(0.42, 0.04), (0.58, 0.04), (0.94, 0.96), (0.06, 0.96)], 'NOP')
    for k in range(3):
        d.line(0.5, 0.18 + k * 0.28, 0.5, 0.28 + k * 0.28, 'Q')


def compass(d):
    d.ell(0.5, 0.5, 0.42, 0.42, GOLD)
    d.ell(0.5, 0.5, 0.32, 0.32, PARCH)
    d.poly([(0.5, 0.14), (0.58, 0.5), (0.42, 0.5)], 'GHI')
    d.poly([(0.5, 0.86), (0.58, 0.5), (0.42, 0.5)], 'bcd')


def bandage(d):
    d.cap(0.16, 0.76, 0.84, 0.24, 0.17, 0.17, 'RSTU')
    d.cap(0.42, 0.42, 0.58, 0.58, 0.07, 0.07, 'GH')
    for k in range(3):
        d.px(0.3 + k * 0.18, 0.66 - k * 0.14, 'S')


def lungs(d):
    d.ell(0.32, 0.56, 0.2, 0.32, 'FGHI')
    d.ell(0.68, 0.56, 0.2, 0.32, 'FGHI')
    d.cap(0.5, 0.06, 0.5, 0.32, 0.05, 0.05, 'Td')
    wind(d, 0.0, -0.16)


def needle(d):
    d.cap(0.12, 0.88, 0.86, 0.14, 0.04, 0.02, STEEL)
    d.ring(0.8, 0.2, 0.06, '0')
    d.ring(0.5, 0.5, 0.3, 'i', 100, 260)


def mask(d, mat='GHI'):
    d.poly([(0.08, 0.3), (0.92, 0.3), (0.86, 0.62), (0.56, 0.7), (0.5, 0.6), (0.44, 0.7), (0.14, 0.62)], mat)
    d.ell(0.3, 0.46, 0.1, 0.06, ['0'], flat='0')
    d.ell(0.7, 0.46, 0.1, 0.06, ['0'], flat='0')


def blot(d, mat=INK):
    for (u, v, r) in ((0.5, 0.5, 0.3), (0.26, 0.32, 0.14), (0.74, 0.36, 0.13), (0.3, 0.74, 0.12), (0.72, 0.72, 0.15)):
        d.ell(u, v, r, r, mat, sep=False)
    d.px(0.4, 0.4, mat[-1])


def veins(d, mat=INK):
    d.ell(0.5, 0.5, 0.42, 0.42, 'z%')
    for k in range(4):
        a = math.radians(30 + k * 80)
        d.line(0.5, 0.5, 0.5 + math.cos(a) * 0.36, 0.5 + math.sin(a) * 0.36, '2')
        d.line(0.5 + math.cos(a) * 0.2, 0.5 + math.sin(a) * 0.2, 0.5 + math.cos(a + 0.6) * 0.32, 0.5 + math.sin(a + 0.6) * 0.32, '3')


def storm(d):
    for k in range(3):
        d.ring(0.5, 0.5, 0.14 + k * 0.14, '234'[k], k * 40, 250 + k * 40)
    d.line(0.66, 0.2, 0.5, 0.5, '8')
    d.line(0.5, 0.5, 0.6, 0.56, '8')
    d.line(0.6, 0.56, 0.42, 0.88, '7')


def quotes(d, mat='8'):
    letter(d, '"', 0.18, 0.2, mat, 2.0 if d.n >= 18 else 1.6)


def semicolon(d):
    letter(d, ';', 0.4, 0.14, '8', 2.4 if d.n >= 18 else 1.6)


def paren(d):
    letter(d, '(', 0.18, 0.14, '8', 2.4 if d.n >= 18 else 1.6)
    letter(d, '(', 0.56, 0.14, '7', 2.4 if d.n >= 18 else 1.6)


def comma(d):
    d.ell(0.5, 0.42, 0.18, 0.18, INK)
    d.cap(0.6, 0.5, 0.4, 0.86, 0.08, 0.04, INK)


def capital(d):
    letter(d, 'A', 0.2, 0.1, '8', 2.4 if d.n >= 18 else 2.0)
    d.px(0.84, 0.12, 'j')


def exclam(d):
    letter(d, '!', 0.4, 0.1, 'I', 2.4 if d.n >= 18 else 2.0)


def indent(d):
    for k in range(4):
        d.line(0.1 + (0.3 if k == 0 else 0), 0.2 + k * 0.2, 0.9, 0.2 + k * 0.2, '2' if k else '7')
    d.poly([(0.06, 0.12), (0.26, 0.2), (0.06, 0.28)], CYAN)


def blank_page(d):
    d.poly([(0.2, 0.08), (0.84, 0.08), (0.84, 0.92), (0.2, 0.92)], 'PQ')
    d.line(0.32, 0.12, 0.32, 0.88, 'G')


def blotter(d):
    d.poly([(0.08, 0.5), (0.5, 0.2), (0.92, 0.5), (0.5, 0.8)], 'RSTU')
    d.cap(0.4, 0.42, 0.6, 0.36, 0.08, 0.08, WOOD)
    d.ell(0.6, 0.62, 0.08, 0.06, INK)


def pause_glyph(d):
    d.cap(0.34, 0.2, 0.34, 0.8, 0.09, 0.09, CYAN)
    d.cap(0.66, 0.2, 0.66, 0.8, 0.09, 0.09, CYAN)


def repeat_glyph(d):
    d.ring(0.5, 0.5, 0.34, '7', 20, 320)
    d.poly([(0.82, 0.38), (0.94, 0.62), (0.68, 0.6)], CYAN)


def ruler(d):
    d.cap(0.1, 0.86, 0.9, 0.14, 0.1, 0.1, 'NOPQ')
    for k in range(5):
        u = 0.22 + k * 0.14
        v = 0.76 - k * 0.12
        d.line(u, v, u + 0.05, v + 0.05, 'k')


def inkwell(d):
    d.poly([(0.22, 0.4), (0.78, 0.4), (0.86, 0.9), (0.14, 0.9)], '1234')
    d.poly([(0.36, 0.26), (0.64, 0.26), (0.64, 0.42), (0.36, 0.42)], 'abc')
    d.line(0.66, 0.26, 0.9, 0.04, 'T')
    d.px(0.3, 0.5, '8')


def signature(d):
    for k in range(18):
        t = k / 17
        d.px(0.08 + t * 0.84, 0.56 + math.sin(t * 12) * 0.18 * (1 - t * 0.5), '3')
    drop(d, INK, 0.82, 0.78, 0.35)


def overwrite(d):
    page(d)
    d.cap(0.16, 0.8, 0.88, 0.2, 0.07, 0.07, INK)


def seep(d):
    page(d)
    for k, (u, L) in enumerate(((0.34, 0.2), (0.56, 0.3))):
        d.cap(u, 0.6, u, 0.6 + L, 0.06, 0.05, INK)


def smudge(d):
    for k in range(4):
        d.ell(0.26 + k * 0.16, 0.5 + (k % 2) * 0.08, 0.16, 0.12 - k * 0.02, '234')


# ------------------------------------------------------------------------------------------------ badges
def badge(d, kind):
    """a small corner mark (bottom-right) that tells a rank-theme node from its neighbours"""
    n = d.n
    s = 5 if n < 16 else 7
    x0 = int(d.ox + n - s + (1 if n < 16 else 2))
    y0 = int(d.oy + n - s + (1 if n < 16 else 2))
    pat = {
        'up': ['..#..', '.###.', '#####', '..#..', '..#..'],
        'plus': ['..#..', '..#..', '#####', '..#..', '..#..'],
        'star': ['..#..', '#.#.#', '.###.', '#.#.#', '..#..'],
        'clock': ['.###.', '#.#.#', '#.###', '#...#', '.###.'],
        'dot': ['.....', '.###.', '.###.', '.###.', '.....'],
        'chev': ['#..#.', '.#..#', '..#..', '.#..#', '#..#.'],
        'x2': ['#.#..', '.#...', '#.#.#', '....#', '...##'],
        'down': ['..#..', '..#..', '#####', '.###.', '..#..'],
    }[kind]
    col = {'up': 'w', 'plus': 'w', 'star': 'j', 'clock': 'M', 'dot': 'I', 'chev': 'M', 'x2': 'j', 'down': 'I'}[kind]
    sc = 1 if n < 16 else 1
    pts = [(i, j) for j, row in enumerate(pat) for i, c in enumerate(row) if c == '#']
    off = 0 if n < 16 else 1
    for (i, j) in pts:
        for dx in (-1, 0, 1):
            for dy in (-1, 0, 1):
                x, y = x0 + i + dx + off, y0 + j + dy + off
                if K.inside(d.cv, x, y) and (i + dx, j + dy) not in pts:
                    d.cv[y, x] = '0'
    for (i, j) in pts:
        K.setp(d.cv, x0 + i + off, y0 + j + off, col)
