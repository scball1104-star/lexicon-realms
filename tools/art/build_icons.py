"""Ability, talent and item icons for Lexicon Realms -> assets/icons/*.png + .json

    python tools/art/build_icons.py

abilities16 / abilities24 : the 30 class abilities (ids from docs/design/CLASSES.md section 7) plus one auto-attack per
                            class (`<class>_auto`), class-coloured bevel frames, 16x16 and 24x24 (the bar size).
talents16                 : all 162 talent nodes (ids from docs/design/TALENTS.md), class frame, branch background,
                            gold frame on tier-5 capstones, a gold corner notch on [play] nodes.
talent_emblems24          : 3 branch emblems per class (`<class>_<branch>`).
items16                   : weapon types, armour slots x 4 kinds, consumables, bags, quest items, gold.
JSON: {"image", "size", "frames": {id: [x, y, w, h]}, ...}. Light from the upper left everywhere.
"""
import os, sys, re, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrpix as X
import mobkit as K
import icon_glyphs as G
from icon_glyphs import (STEEL, GOLD, WOOD, FIRE, HEAL, BLUE, INK, CYAN, VIOLET, RED, WATER, PARCH, STONE, LEAF)

DST = os.path.join(X.ROOT, 'assets', 'icons')
os.makedirs(DST, exist_ok=True)
DOCS = os.path.join(X.ROOT, 'docs', 'design')

# frame ramps: (outer dark, bevel dark, bevel mid, bevel light), background (top, bottom)
CLASS_FRAME = {
    'warden': (['#14101e', '#1d2a67', '#4064b9', '#6891d9'], ['#1d2a67', '#0e153b']),
    'mender': (['#14101e', '#2a532f', '#5a9032', '#b6cc58'], ['#251d34', '#14101e']),
    'scribe': (['#14101e', '#317aa1', '#2ec4d0', '#8af0e8'], ['#292657', '#1a1334']),
    'wayfinder': (['#14101e', '#6e3d2c', '#b87942', '#d69c57'], ['#2e2b4c', '#14101e']),
    'inkblade': (['#14101e', '#522a84', '#9062c3', '#bc94e2'], ['#1b2332', '#14101e']),
    'item': (['#14101e', '#4c445c', '#8e8997', '#b3b6c4'], ['#2e2b4c', '#251d34']),
    'gold': (['#14101e', '#c38334', '#eba14d', '#f9d77a'], None),
}
BRANCH_BG = [['#571f28', '#2d1b1f'], ['#285743', '#1b2332'], ['#2c4797', '#0e153b']]


def hexf(h):
    return np.array(X.hex2rgb(h), np.float32) / 255


def frame_img(S, cls, bg=None, gold=False):
    ramp, cbg = CLASS_FRAME[cls]
    if gold:
        ramp = CLASS_FRAME['gold'][0]
    bg = bg or cbg
    a = X.blank(S, S)
    top, bot = hexf(bg[0]), hexf(bg[1])
    for y in range(S):
        t = y / (S - 1)
        a[y, :, :3] = top * (1 - t) + bot * t
        a[y, :, 3] = 1
    # a soft lit corner (upper left) inside the well
    for y in range(2, S // 2):
        for x in range(2, S // 2):
            if x + y < S // 2:
                a[y, x, :3] = a[y, x, :3] * 0.8 + hexf(ramp[2]) * 0.2
    o, dk, md, lt = (hexf(c) for c in ramp)
    a[0, :, :3] = o; a[-1, :, :3] = o; a[:, 0, :3] = o; a[:, -1, :3] = o
    a[1, 1:-1, :3] = lt
    a[1:-1, 1, :3] = lt
    a[-2, 1:-1, :3] = dk
    a[1:-1, -2, :3] = dk
    a[1, -2, :3] = md
    a[-2, 1, :3] = md
    if S >= 24:
        a[2, 2:-2, :3] = a[2, 2:-2, :3] * 0.5 + md * 0.5
        a[2:-2, 2, :3] = a[2:-2, 2, :3] * 0.5 + md * 0.5
    a[..., 3] = 1
    return a


def glyph_img(S, fn, badge=None):
    cv = K.canvas(S, S)
    n = 12 if S == 16 else 18
    off = (S - n) // 2
    d = G.Draw(cv, off, off, n)
    fn(d)
    K.outline(cv)
    # keep the outline inside the bevel
    cv[0, :] = '.'; cv[-1, :] = '.'; cv[:, 0] = '.'; cv[:, -1] = '.'
    if badge:
        G.badge(d, badge)
    img, _ = K.colourize(cv, G.ICON_PAL)
    return img


def compose(S, fn, cls='item', badge=None, bg=None, gold=False, notch=False):
    a = frame_img(S, cls, bg, gold)
    X.paste(a, glyph_img(S, fn, badge), 0, 0)
    if notch:
        g = hexf('#f9d77a')
        for (x, y) in ((1, 1), (2, 1), (1, 2), (3, 1), (1, 3)):
            a[y, x, :3] = g
        a[2, 2, :3] = hexf('#fff7d6')
    return a


# ------------------------------------------------------------------------------------------- glyph registry
def both(*fns):
    def f(d):
        for fn in fns:
            fn(d)
    return f


def small(fn, u, v, s):
    """draw fn scaled by s with its box at (u, v) of the parent box"""
    def f(d):
        fn(G.Draw(d.cv, d.ox + u * d.n, d.oy + v * d.n, d.n * s))
    return f


def arc_swing(d, mat='cde'):
    for k in range(18):
        t = math.radians(200 + k * 8)
        d.cap(0.5 + math.cos(t) * 0.4, 0.62 + math.sin(t) * 0.4, 0.5 + math.cos(t) * 0.4, 0.62 + math.sin(t) * 0.4,
              0.03 + k * 0.004, 0.03 + k * 0.004, mat)


def volley(d):
    for k, u in enumerate((0.22, 0.5, 0.78)):
        G.arrow(d, u + 0.08, 0.06 + k * 0.06, u - 0.06, 0.78 + (k % 2) * 0.12)


def bag(d, mat=WOOD, flap='NOP'):
    d.ell(0.5, 0.62, 0.38, 0.3, mat)
    d.poly([(0.22, 0.4), (0.78, 0.4), (0.7, 0.6), (0.3, 0.6)], flap)
    d.ring(0.5, 0.28, 0.14, mat[1], 180, 360)
    d.px(0.5, 0.56, 'h')


def honey_roll(d):
    d.ell(0.5, 0.58, 0.38, 0.28, 'lmnP')
    d.ring(0.5, 0.56, 0.18, 'l', 0, 300)
    d.ring(0.5, 0.56, 0.08, 'l', 0, 300)
    d.ell(0.7, 0.34, 0.1, 0.1, 'hij')


def word_card(d):
    G.scroll(d, False)
    G.letter(d, 'N', 0.36, 0.34, '2', 1.0)
    G.letter(d, 'A', 0.6, 0.34, '2', 1.0) if d.n < 16 else G.letter(d, 'A', 0.58, 0.34, '2', 1.0)
    G.sparkle(d, 0.8, 0.22, 0.1, 'j', 'i')


def quill_copy(d):
    G.page(d)
    G.quill(G.Draw(d.cv, d.ox + 0.3 * d.n, d.oy + 0.0, d.n * 0.7))


def slime_ink(d):
    d.poly([(0.3, 0.3), (0.7, 0.3), (0.76, 0.86), (0.24, 0.86)], 'JKL')
    d.ell(0.5, 0.7, 0.24, 0.14, 'VWXY')
    d.cap(0.42, 0.14, 0.58, 0.14, 0.08, 0.08, WOOD)


def hen_item(d):
    G.hen(d)


def gold_coins(d):
    G.coin(d, 3)


def chime_piece(d):
    d.cap(0.3, 0.2, 0.6, 0.86, 0.09, 0.09, 'cde')
    d.line(0.38, 0.24, 0.66, 0.84, 'e')
    d.line(0.56, 0.46, 0.72, 0.4, '0')
    G.sparkle(d, 0.78, 0.2, 0.12, 'j', 'i')


def antidote(d):
    G.potion(d, 'tuvw')
    G.leaf(G.Draw(d.cv, d.ox + 0.56 * d.n, d.oy + 0.0, d.n * 0.44))


def ink_dagger(d):
    G.splash(d)
    G.dagger(d, 0.22, 0.86, -55, 0.62)


def hood_dagger(d):
    G.hood_face(d)
    G.dagger(d, 0.56, 0.94, -60, 0.5)


def double_hood(d):
    G.hood_face(G.Draw(d.cv, d.ox + 0.3 * d.n, d.oy + 0.08 * d.n, d.n * 0.7), '1234')
    G.hood_face(G.Draw(d.cv, d.ox, d.oy + 0.24 * d.n, d.n * 0.7))


def page_hood(d):
    G.page(d)
    G.hood_face(G.Draw(d.cv, d.ox + 0.3 * d.n, d.oy + 0.36 * d.n, d.n * 0.6))


def lamp_moon(d):
    G.lantern(G.Draw(d.cv, d.ox - 0.08 * d.n, d.oy + 0.24 * d.n, d.n * 0.76))
    G.moon(G.Draw(d.cv, d.ox + 0.5 * d.n, d.oy, d.n * 0.5), 'JKLM')


def sword_swirl(d):
    G.sword(d)
    d.ring(0.5, 0.5, 0.42, 'q', 200, 330)
    d.poly([(0.84, 0.18), (0.94, 0.3), (0.76, 0.32)], FIRE)


def sword_dash(d):
    G.sword(G.Draw(d.cv, d.ox + 0.2 * d.n, d.oy, d.n * 0.8))
    G.dash_lines(d, 'e')


def sword_shine(d):
    G.sword(d)
    G.sparkle(d, 0.66, 0.32, 0.18, 'e', 'j')


def shield_burst(d):
    G.shield(d, emblem='dot')
    G.burst(G.Draw(d.cv, d.ox + 0.5 * d.n, d.oy + 0.5 * d.n, d.n * 0.5), 'ij', 6, 0.18, 0.48)


def shield_thorn(d):
    G.shield(d, 'VWX', 'abcd')
    for (u, v) in ((0.1, 0.24), (0.9, 0.24), (0.06, 0.46), (0.94, 0.46), (0.5, 0.98)):
        d.px(u, v, 'e')


def fist_aura(d):
    G.fist(d)
    d.ring(0.5, 0.56, 0.47, 'i', 180, 360)


def chev_red(d):
    G.chevrons(d, 3, 'FGHI')


def heart_bubble(d):
    G.heart(G.Draw(d.cv, d.ox + 0.2 * d.n, d.oy + 0.2 * d.n, d.n * 0.6))
    G.bubble(d)


def bubble_cross(d):
    G.cross(G.Draw(d.cv, d.ox + 0.24 * d.n, d.oy + 0.24 * d.n, d.n * 0.52))
    G.bubble(d)


def two_cross(d):
    G.cross(G.Draw(d.cv, d.ox, d.oy + 0.3 * d.n, d.n * 0.6))
    G.cross(G.Draw(d.cv, d.ox + 0.4 * d.n, d.oy, d.n * 0.6))


def scrolls3(d):
    """polish 2026-11-19: three rolled scrolls stacked like logs (two below, one on top), each a parchment roll with
    a dark rolled end and a red tie, so the three read apart at 16 px (three overlapping flat scrolls were mud)"""
    for (u0, v0) in ((0.06, 0.66), (0.5, 0.66), (0.28, 0.32)):
        d.cap(u0 + 0.06, v0, u0 + 0.38, v0, 0.13, 0.13, 'NOPQ', sep=True)
        d.ell(u0 + 0.06, v0, 0.07, 0.13, 'MN', flat='N')
        d.px(u0 + 0.06, v0, 'O')
        d.line(u0 + 0.26, v0 - 0.12, u0 + 0.26, v0 + 0.12, 'G')


def well(d):
    d.poly([(0.14, 0.5), (0.86, 0.5), (0.86, 0.92), (0.14, 0.92)], 'RST')
    d.ell(0.5, 0.5, 0.36, 0.1, WATER)
    d.cap(0.14, 0.12, 0.14, 0.5, 0.04, 0.04, WOOD)
    d.cap(0.86, 0.12, 0.86, 0.5, 0.04, 0.04, WOOD)
    d.cap(0.1, 0.12, 0.9, 0.12, 0.05, 0.05, WOOD)
    G.drop(d, WATER, 0.5, 0.3, 0.3)


def moon_q(d):
    G.moon(d, 'JKLM')
    d.px(0.7, 0.7, 'e')


def hearth_star(d):
    G.hearth(d)
    G.sparkle(d, 0.5, 0.36, 0.14, 'j', 'i')


def coal(d):
    d.ell(0.5, 0.62, 0.34, 0.24, ['@', '#', 'o', 'p'])
    for (u, v) in ((0.36, 0.56), (0.56, 0.5), (0.66, 0.66)):
        d.px(u, v, 'r')
    G.flame(d, FIRE, 0.52, 0.34, 0.4)


def brand(d):
    d.ring(0.5, 0.5, 0.42, 'h')
    G.flame(d, FIRE, 0.5, 0.56, 0.75)


def fire_sword(d):
    G.sword(d, 'pqrs', 'fgh')


def sun_eye(d):
    G.sun(d, GOLD, True, 0.2)
    d.ell(0.5, 0.5, 0.08, 0.1, ['0'], flat='0')


def flame_wind(d):
    G.flame(d, FIRE, 0.62, 0.6, 0.85)
    G.wind(d, -0.04, 0.0)


def ash(d):
    d.ell(0.5, 0.74, 0.4, 0.16, ['@', '#', '&', '*'])
    for (u, v) in ((0.3, 0.68), (0.6, 0.62), (0.72, 0.74)):
        d.px(u, v, 'r')
    for k in range(3):
        d.px(0.3 + k * 0.2, 0.36 - k * 0.08, '*')
        d.px(0.36 + k * 0.2, 0.2 - k * 0.04, '&')


def pyre(d):
    for k in range(3):
        d.cap(0.16, 0.86 - k * 0.08, 0.84, 0.78 - k * 0.08, 0.06, 0.06, WOOD)
    G.flame(d, FIRE, 0.5, 0.42, 0.9)


def flame_cross(d):
    G.flame(d, FIRE, 0.42, 0.62, 0.85)
    G.cross(G.Draw(d.cv, d.ox + 0.5 * d.n, d.oy + 0.48 * d.n, d.n * 0.5))


def bell_bubble(d):
    G.hand_bell(G.Draw(d.cv, d.ox + 0.2 * d.n, d.oy + 0.18 * d.n, d.n * 0.62))
    G.bubble(d)


def roof_shelter(d):
    d.poly([(0.06, 0.52), (0.5, 0.12), (0.94, 0.52)], 'FGHI')
    d.poly([(0.2, 0.5), (0.8, 0.5), (0.8, 0.9), (0.2, 0.9)], 'RSTU')
    d.poly([(0.42, 0.62), (0.58, 0.62), (0.58, 0.9), (0.42, 0.9)], ['0'], flat='@')


def bell_shield(d):
    G.shield(d, 'xy', GOLD)
    G.hand_bell(G.Draw(d.cv, d.ox + 0.26 * d.n, d.oy + 0.16 * d.n, d.n * 0.5))


def sanctuary(d):
    G.sunrise(d)
    G.hand_bell(G.Draw(d.cv, d.ox + 0.3 * d.n, d.oy, d.n * 0.42))


def wind_down(d):
    G.wind(d)


def bold_a(d):
    G.letter(d, 'A', 0.14, 0.1, '8', 2.4 if d.n >= 18 else 2.0)
    G.letter(d, 'A', 0.22, 0.1, '7', 2.4 if d.n >= 18 else 2.0)


def stroke(d):
    d.cap(0.14, 0.8, 0.86, 0.2, 0.14, 0.08, INK)
    d.line(0.2, 0.7, 0.8, 0.22, '4')


def long_squiggle(d):
    G.squiggle(d)
    d.poly([(0.84, 0.3), (0.98, 0.5), (0.84, 0.7)], CYAN)


def target_arrow(d):
    G.target_mark(d)
    G.arrow(d, 0.06, 0.94, 0.5, 0.5)


def arrow_dash(d):
    G.arrow(d, 0.3, 0.7, 0.92, 0.08)
    G.dash_lines(G.Draw(d.cv, d.ox, d.oy + 0.3 * d.n, d.n), 'e')


def pin_arrow(d):
    G.arrow(d, 0.7, 0.06, 0.36, 0.66)
    d.ell(0.32, 0.82, 0.3, 0.08, 'VWX')
    d.ring(0.32, 0.7, 0.16, 'W', 0, 180)


def arrow_boot(d):
    G.boot(G.Draw(d.cv, d.ox, d.oy + 0.36 * d.n, d.n * 0.64))
    G.arrow(d, 0.3, 0.5, 0.94, 0.06)


def two_arrows(d):
    G.arrow(d, 0.08, 0.76, 0.76, 0.08)
    G.arrow(d, 0.24, 0.92, 0.92, 0.24)


def arrow_pierce(d):
    d.poly([(0.38, 0.1), (0.62, 0.1), (0.62, 0.9), (0.38, 0.9)], 'klm')
    G.arrow(d, 0.06, 0.5, 0.96, 0.5)


def arrow_road(d):
    G.road(d)
    G.arrow(d, 0.24, 0.94, 0.7, 0.1)


def arrow_down(d):
    G.arrow(d, 0.5, 0.04, 0.5, 0.7)
    G.thorns(G.Draw(d.cv, d.ox, d.oy + 0.5 * d.n, d.n * 0.5))
    G.thorns(G.Draw(d.cv, d.ox + 0.5 * d.n, d.oy + 0.5 * d.n, d.n * 0.5))


def traps2(d):
    G.trap(G.Draw(d.cv, d.ox, d.oy - 0.1 * d.n, d.n * 0.6))
    G.trap(G.Draw(d.cv, d.ox + 0.4 * d.n, d.oy + 0.34 * d.n, d.n * 0.6))


def briar_trap(d):
    G.trap(d)
    G.thorns(G.Draw(d.cv, d.ox + 0.1 * d.n, d.oy - 0.02 * d.n, d.n * 0.5))


def trap_sprung(d):
    G.trap(d, True)
    G.sparkle(d, 0.5, 0.26, 0.14, 'e', 'i')


def wall_green(d):
    G.hedge(d)


def coat(d):
    G.armor(d, 'chest', 'mail')
    G.wind(G.Draw(d.cv, d.ox, d.oy, d.n * 0.6), 0, 0)


def dagger_one(d):
    G.dagger(d, 0.2, 0.84, -45, 0.78)


def boot_wind(d):
    G.boot(G.Draw(d.cv, d.ox + 0.2 * d.n, d.oy + 0.1 * d.n, d.n * 0.8))
    G.wind(d, -0.04, 0.08)


def nick(d):
    G.dagger(d, 0.16, 0.86, -45, 0.72)
    d.cap(0.7, 0.6, 0.86, 0.86, 0.05, 0.03, 'GHI')


def fade(d):
    G.hood_face(d, VIOLET, True)


def footprints_road(d):
    G.footprints(d)


def bleed(d):
    G.drip_line(d, 'FGHI')
    G.dagger(G.Draw(d.cv, d.ox + 0.4 * d.n, d.oy - 0.05 * d.n, d.n * 0.6), 0.1, 0.5, -20, 0.8)


def inkstep(d):
    G.footprints(d, 'CDE')
    G.burst(G.Draw(d.cv, d.ox + 0.4 * d.n, d.oy - 0.1 * d.n, d.n * 0.6), 'DE', 6, 0.12, 0.4)


def splash_dagger(d):
    ink_dagger(d)


def potion_ink(d):
    G.potion(d, '1234')
    G.skull(G.Draw(d.cv, d.ox + 0.3 * d.n, d.oy + 0.44 * d.n, d.n * 0.4))


def inkwell_dagger(d):
    G.inkwell(d)
    G.dagger(d, 0.3, 0.3, -100, 0.0)
    G.dagger(G.Draw(d.cv, d.ox + 0.3 * d.n, d.oy - 0.02 * d.n, d.n * 0.7), 0.5, 0.0, 70, 0.5)


def fist_violet(d):
    G.fist(d, 'ABCD')


def hood_star(d):
    G.hood_face(d, '1234')


def heal_spark(d):
    G.cross(d)
    G.sparkle(d, 0.78, 0.2, 0.14, 'e', 'w')


def steady_name(d):
    G.leaf(d)
    d.ring(0.5, 0.52, 0.44, 'w', 120, 420)


def warding(d):
    bubble_cross(d)


def strike(d):
    G.sword(d)
    G.burst(G.Draw(d.cv, d.ox + 0.5 * d.n, d.oy, d.n * 0.5), 'ij', 6, 0.2, 0.46)


def sweeping(d):
    arc_swing(d)
    G.sword(G.Draw(d.cv, d.ox + 0.2 * d.n, d.oy + 0.28 * d.n, d.n * 0.72))


def oath_iron(d):
    G.fist(d)
    d.ring(0.5, 0.56, 0.47, 'i')
    d.ring(0.5, 0.56, 0.4, 'h', 200, 340)


def kindle(d):
    G.flame(d)


def chorus(d):
    G.bell_waves(d)


def scrawl(d):
    G.squiggle(d)


def scatter(d):
    G.letters_burst(d)


def quick_shot(d):
    arrow_dash(d)


def aimed_shot(d):
    target_arrow(d)


GL = {k: v for k, v in globals().items() if callable(v)}
for k in dir(G):
    fn = getattr(G, k)
    if callable(fn) and k not in ('Draw', 'badge', 'letter', 'sparkle') and k not in GL:
        GL[k] = fn
GL.update({
    'plate': lambda d: G.armor(d, 'chest', 'plate'),
    'shield_cross': lambda d: G.shield(d, emblem='cross'),
    'shield_crack': lambda d: G.shield(d, emblem='crack'),
    'crossed': G.crossed_swords, 'chain_broken': lambda d: G.chain(d, True), 'candle': lambda d: (
        d.poly([(0.38, 0.5), (0.62, 0.5), (0.62, 0.92), (0.38, 0.92)], 'RSTU'), G.flame(d, FIRE, 0.5, 0.32, 0.6)),
    'arc': arc_swing, 'twin': G.twin_daggers, 'drip': lambda d: G.drip_line(d, INK), 'target': G.target_mark,
    'vine': G.vine_loop, 'snare': G.snare_loop, 'pause': G.pause_glyph, 'repeat': G.repeat_glyph,
    'underline': G.underline_glyph, 'exclam': G.exclam, 'bell': G.hand_bell, 'moon': moon_q, 'hood': hood_star,
})


# --------------------------------------------------------------------------------------------------- abilities
ABILITY = {
    'warden_auto': 'sword', 'warden_strike': 'strike', 'warden_shield_bash': 'shield_burst', 'warden_taunt': 'shout',
    'warden_second_wind': 'heart_swirl', 'warden_sweeping_blow': 'sweeping', 'warden_oath_of_iron': 'oath_iron',
    'mender_auto': 'staff_rod', 'mender_kindle': 'kindle', 'mender_mend': 'heal_spark', 'mender_brand': 'brand',
    'mender_warding_word': 'warding', 'mender_steady_name': 'steady_name', 'mender_chorus': 'chorus',
    'scribe_auto': 'quill', 'scribe_inkbolt': 'inkbolt', 'scribe_scrawl': 'scrawl', 'scribe_full_stop': 'fullstop',
    'scribe_underline': 'underline', 'scribe_scatter_letters': 'scatter', 'scribe_bracket': 'bracket',
    'wayfinder_auto': 'bow', 'wayfinder_quick_shot': 'quick_shot', 'wayfinder_pinning_shot': 'pin_arrow',
    'wayfinder_briar_trap': 'briar_trap', 'wayfinder_light_foot': 'boot_wind', 'wayfinder_aimed_shot': 'aimed_shot',
    'wayfinder_volley': 'volley',
    'inkblade_auto': 'twin', 'inkblade_nick': 'nick', 'inkblade_spill': 'splash_dagger', 'inkblade_fade': 'fade',
    'inkblade_ink_in_the_eyes': 'eye_ink', 'inkblade_bleed_line': 'bleed', 'inkblade_inkstep': 'inkstep',
}

# ----------------------------------------------------------------------------------------------------- talents
# node suffix -> glyph[, badge]. Within one class every (glyph, badge) pair is unique (checked below).
TALENT = {
 'warden': {
  'bulwark_iron_skin': 'plate up', 'bulwark_steady_shield': 'shield up', 'bulwark_stout_heart': 'heart up',
  'bulwark_hold_the_line': 'banner', 'bulwark_challenge': 'shout star', 'bulwark_rooted_stance': 'roots',
  'bulwark_last_stand': 'shield_crack', 'bulwark_rebuke': 'shield_thorn', 'bulwark_weathered': 'heart_swirl up',
  'bulwark_unbreakable': 'fist_aura', 'bulwark_shieldbearers_vow': 'shield_burst',
  'oathblade_keen_edge': 'sword star', 'oathblade_weapon_weight': 'greatsword', 'oathblade_follow_through': 'sword_swirl',
  'oathblade_rising_wrath': 'chev_red', 'oathblade_sworn_strike': 'sword_dash', 'oathblade_momentum': 'chevrons',
  'oathblade_clear_mind': 'arc clock', 'oathblade_bright_steel': 'sword_shine', 'oathblade_finishing_cut': 'skull',
  'oathblade_oathbreaker': 'chain_broken', 'oathblade_sword_sworn': 'crossed',
  'lantern_steady_flame': 'candle', 'lantern_lantern_glow': 'lantern', 'lantern_warm_light': 'sun',
  'lantern_beacon': 'tower', 'lantern_kept_name': 'scroll', 'lantern_lamp_in_the_dark': 'lamp_moon',
  'lantern_guiding_step': 'boot up', 'lantern_hearthward': 'hearth', 'lantern_dawnbringer': 'sunrise',
  'lantern_the_lantern_holds': 'lantern plus'},
 'mender': {
  'hearth_gentle_hands': 'heal_spark up', 'hearth_quick_words': 'scroll chev', 'hearth_spoken_for': 'bubble up',
  'hearth_hearthside': 'hearth', 'hearth_name_twice': 'two_cross', 'hearth_kept_close': 'heart_bubble',
  'hearth_quiet_mind': 'moon', 'hearth_deep_well': 'well', 'hearth_bell_of_rest': 'hourglass',
  'hearth_hearthfire': 'hearth_star', 'hearth_many_names': 'scrolls3',
  'kindling_bright_coal': 'coal', 'kindling_long_burn': 'flame clock', 'kindling_hungry_flame': 'flame up',
  'kindling_searing': 'brand star', 'kindling_firebrand': 'fire_sword', 'kindling_daze_of_light': 'sun_eye',
  'kindling_bellows': 'flame_wind', 'kindling_ash_and_ember': 'ash', 'kindling_pyre_word': 'pyre',
  'kindling_flame_that_mends': 'flame_cross',
  'bell_clear_voice': 'bell up', 'bell_ringing_ward': 'bell_bubble', 'bell_still_air': 'wind_down down',
  'bell_toll': 'bell clock', 'bell_alarm_bell': 'bell_waves star', 'bell_bell_hum': 'bell_waves',
  'bell_shelter': 'roof_shelter', 'bell_sounding': 'bell_waves up', 'bell_ward_keeper': 'bubble star',
  'bell_bellward': 'bell_shield', 'bell_sanctuary_peal': 'sanctuary'},
 'scribe': {
  'quill_sharp_nib': 'quill star', 'quill_fast_hand': 'quill chev', 'quill_bold_type': 'bold_a',
  'quill_heavy_stroke': 'stroke', 'quill_run_on_sentence': 'long_squiggle', 'quill_exclamation': 'exclam',
  'quill_underscore': 'underline up', 'quill_clean_copy': 'page', 'quill_final_draft': 'page star',
  'quill_capital_letter': 'capital', 'quill_footnote': 'scroll star',
  'margin_wide_margin': 'ruler', 'margin_blotting_paper': 'blotter', 'margin_long_pause': 'pause',
  'margin_tight_bracket': 'bracket up', 'margin_blank_margin': 'blank_page', 'margin_comma': 'comma',
  'margin_indent': 'indent', 'margin_reread': 'repeat', 'margin_steady_line': 'fullstop up',
  'margin_parenthetical': 'paren', 'margin_semicolon': 'semicolon',
  'wet_ink_seeping': 'seep', 'wet_ink_spatter': 'splash', 'wet_ink_drying_slow': 'drop clock',
  'wet_ink_splash': 'splash up', 'wet_ink_smudge': 'smudge', 'wet_ink_pooling_ink': 'pool',
  'wet_ink_ink_to_paper': 'inkbolt up', 'wet_ink_inkwell': 'inkwell', 'wet_ink_overwrite': 'overwrite',
  'wet_ink_wet_signature': 'signature'},
 'wayfinder': {
  'fletch_true_aim': 'target', 'fletch_draw_weight': 'bow up', 'fletch_long_eye': 'eye',
  'fletch_fletchers_pace': 'arrow chev', 'fletch_running_shot': 'arrow_boot', 'fletch_double_nock': 'two_arrows',
  'fletch_piercing_point': 'arrow_pierce', 'fletch_steady_breath': 'lungs', 'fletch_called_shot': 'target star',
  'fletch_long_road_shot': 'arrow_road', 'fletch_thread_the_needle': 'needle',
  'snare_hardened_briar': 'thorns up', 'snare_quick_set': 'trap chev', 'snare_clinging_thorns': 'vine',
  'snare_pinning_point': 'arrow_down', 'snare_trap_line': 'traps2', 'snare_thrown_snare': 'snare',
  'snare_thornbite': 'thorns star', 'snare_bramble_patch': 'hedge', 'snare_long_bramble': 'thorns clock',
  'snare_snarecraft': 'trap_sprung', 'snare_hedge_wall': 'wall',
  'roadwise_footsure': 'boot up', 'roadwise_weathered': 'coat', 'roadwise_road_wit': 'compass',
  'roadwise_mile_eater': 'road', 'roadwise_path_sense': 'compass star', 'roadwise_second_breath': 'lungs plus',
  'roadwise_field_dressing': 'bandage', 'roadwise_close_quarters': 'dagger_one', 'roadwise_steady_feet': 'roots',
  'roadwise_long_way_round': 'road clock', 'roadwise_unseen_road': 'footprints'},
 'inkblade': {
  'edge_fine_edge': 'dagger_one star', 'edge_ambidexter': 'twin', 'edge_quick_hands': 'dagger_one chev',
  'edge_deep_spill': 'splash_dagger up', 'edge_running_ink': 'drip', 'edge_second_cut': 'two_marks',
  'edge_keen_cut': 'dagger_one up', 'edge_relentless': 'chevrons', 'edge_twinned': 'twin x2',
  'edge_inkstorm': 'storm', 'edge_last_word': 'skull',
  'shade_quiet_feet': 'footprints down', 'shade_dim': 'moon', 'shade_opening_line': 'hood star',
  'shade_hold_breath': 'lungs', 'shade_unwritten': 'blank_page', 'shade_blinding_spill': 'eye_ink',
  'shade_slip': 'footprints chev', 'shade_shadow_hands': 'fist_violet', 'shade_ambush': 'hood_dagger',
  'shade_between_the_lines': 'page_hood', 'shade_inkdouble': 'double_hood',
  'blot_seeping_cut': 'drip up', 'blot_stain': 'blot', 'blot_thick_ink': 'drop up', 'blot_dark_pool': 'pool',
  'blot_inkwell_cut': 'inkwell_dagger', 'blot_ink_poison': 'potion_ink', 'blot_spreading_stain': 'blot up',
  'blot_black_tide': 'wave', 'blot_lasting_mark': 'two_marks clock', 'blot_blot_out': 'blot star',
  'blot_ink_veins': 'veins'},
}
EMBLEM = {'warden_bulwark': 'shield_cross', 'warden_oathblade': 'sword', 'warden_lantern': 'lantern',
          'mender_hearth': 'hearth', 'mender_kindling': 'flame', 'mender_bell': 'bell',
          'scribe_quill': 'quill', 'scribe_margin': 'bracket', 'scribe_wet_ink': 'drop',
          'wayfinder_fletch': 'arrow', 'wayfinder_snare': 'trap', 'wayfinder_roadwise': 'compass',
          'inkblade_edge': 'twin', 'inkblade_shade': 'hood', 'inkblade_blot': 'blot'}


def read_talents():
    """[(class, branch_index, tier, id, name, play)] in TALENTS.md order"""
    out = []
    cls, branch = None, -1
    for line in open(os.path.join(DOCS, 'TALENTS.md'), encoding='utf-8'):
        m = re.match(r'## \d+\. (\w+)', line)
        if m and m.group(1).lower() in TALENT:
            cls, branch = m.group(1).lower(), -1
        if re.match(r'### \d+\.\d+ ', line):
            branch += 1
        m = re.match(r'\| ([1-5]) \| `([a-z_]+)` \| ([^|]+) \| (\d) \| (.*)', line)
        if m and cls:
            out.append((cls, branch, int(m.group(1)), m.group(2), m.group(3).strip(), '[play]' in m.group(5)))
    return out


# --------------------------------------------------------------------------------------------------- items
ITEMS = {
    'weapon_sword': 'sword', 'weapon_shield': 'shield_cross', 'weapon_staff': lambda d: G.staff_rod(d, CYAN),
    'weapon_rod': 'staff_rod', 'weapon_quill': 'quill', 'weapon_bell': 'bell', 'weapon_book': 'book',
    'weapon_bow': 'bow', 'weapon_dagger': 'dagger_one', 'weapon_daggers': 'twin',
    'potion': lambda d: G.potion(d, 'FGHI'), 'hi_potion': lambda d: (G.potion(d, 'GHIr'), G.sparkle(d, 0.8, 0.2, 0.12, 'j', 'i')),
    'ether': lambda d: G.potion(d, 'JKLM'), 'hi_ether': lambda d: (G.potion(d, 'KLM8'), G.sparkle(d, 0.8, 0.2, 0.12, 'e', '8')),
    'antidote': antidote, 'honey_roll': honey_roll,
    'travel_satchel': bag, 'drovers_pack': lambda d: bag(d, 'klmn', 'GHI'), 'loom_bag': lambda d: bag(d, 'ABCD', 'hij'),
    'gold': gold_coins, 'slime_ink': slime_ink,
    'stray_hen': hen_item, 'pells_crate': 'crate', 'quills_copy': quill_copy, 'thornback_hide': 'hide',
    'fold_fleece': 'fleece', 'ink_soaked_hay': 'hay', 'pocket_button': 'button', 'boar_tusk': 'tusk',
    'chime_piece': chime_piece, 'odos_chime_word': word_card,
}
for slot in ('head', 'chest', 'legs', 'feet', 'hands'):
    for kind in ('plate', 'mail', 'leather', 'cloth'):
        ITEMS[f'armor_{slot}_{kind}'] = (lambda s, k: (lambda d: G.armor(d, s, k)))(slot, kind)
ITEMS['armor_trinket'] = lambda d: G.armor(d, 'trinket', 'cloth')


def resolve(spec):
    if callable(spec):
        return spec, None
    parts = spec.split()
    return GL[parts[0]], (parts[1] if len(parts) > 1 else None)


# ------------------------------------------------------------------------------------------------- sheets
def sheet(entries, S, name, cols=16, extra=None):
    rows = (len(entries) + cols - 1) // cols
    a = X.blank(cols * S, rows * S)
    frames = {}
    for k, (iid, img) in enumerate(entries):
        x, y = (k % cols) * S, (k // cols) * S
        X.paste(a, img, x, y)
        frames[iid] = [x, y, S, S]
    X.save_png(a, os.path.join(DST, name + '.png'))
    meta = {'image': name + '.png', 'size': [S, S], 'frames': frames}
    if extra:
        meta.update(extra)
    X.write_json(os.path.join(DST, name + '.json'), meta)
    return entries


def preview(groups, path, title, cols=12):
    """each icon at 1x and 4x, on the dark backdrop and on the HUD window blue"""
    font = ImageFont.load_default()
    bgs = [(20, 16, 30), (44, 71, 151)]
    S = groups[0][1].shape[0]
    cw = max(S * 5 + 16, 110)
    ch = S * 4 + S + 30
    rows = (len(groups) + cols - 1) // cols
    img = Image.new('RGB', (cw * cols, (ch * rows) * 2 + 40), (30, 30, 40))
    d = ImageDraw.Draw(img)
    d.text((4, 4), title + ' (top half on dark, bottom half on the HUD window blue #2c4797; 4x and 1x)', fill=(240, 240, 220), font=font)
    for half, bg in enumerate(bgs):
        y0 = 20 + half * (ch * rows + 10)
        d.rectangle([0, y0, cw * cols, y0 + ch * rows], fill=bg)
        for k, (iid, a) in enumerate(groups):
            x = (k % cols) * cw + 4
            y = y0 + (k // cols) * ch + 4
            t = X.upscale(a, 4)
            img.paste(t, (x, y), t)
            t1 = X.to_pil(a)
            img.paste(t1, (x + S * 4 + 4, y + S * 3), t1)
            d.text((x, y + S * 4 + S - 6), iid[:cw // 6], fill=(235, 235, 210), font=font)
    img.save(path)


def main():
    # abilities
    for S in (16, 24):
        ents = []
        for aid, spec in ABILITY.items():
            fn, b = resolve(spec)
            ents.append((aid, compose(S, fn, aid.split('_')[0], b)))
        sheet(ents, S, f'abilities{S}', 7, {'note': 'ids = CLASSES.md ability ids, plus <class>_auto (auto-attack). '
                                              'Cooldown sweep is drawn by the UI over the icon.'})
        preview(ents, os.path.join(X.OUT, f'icons_abilities{S}.png'), f'ability icons {S}x{S}', 7)
    # talents
    nodes = read_talents()
    assert len(nodes) == 162, len(nodes)
    seen = {}
    ents = []
    for cls, br, tier, tid, name, play in nodes:
        suf = tid[len(cls) + 1:]
        spec = TALENT[cls][suf]
        key = (cls, spec)
        assert key not in seen, f'{tid} reuses {spec} of {seen.get(key)}'
        seen[key] = tid
        fn, b = resolve(spec)
        ents.append((tid, compose(16, fn, cls, b, BRANCH_BG[br], gold=(tier == 5), notch=play)))
    meta = {'note': 'ids = TALENTS.md node ids. Frame = class colour (gold on tier-5 capstones); background = branch '
                    '(1st crimson, 2nd forest, 3rd midnight); gold corner notch = [play] node; corner badge marks a '
                    'rank theme (up = bigger number, clock = cooldown/duration, star = crit/empowered, chev = speed, '
                    'plus = heal, down = less, x2 = doubled).'}
    sheet(ents, 16, 'talents16', 11, meta)
    by_cls = {}
    for e, n in zip(ents, nodes):
        by_cls.setdefault(n[0], []).append(e)
    for cls, es in by_cls.items():
        preview(es, os.path.join(X.OUT, f'icons_talents_{cls}.png'), f'{cls} talents 16x16 (TALENTS.md order: branch 1, 2, 3; tiers 1 to 5)', 11)
    em = []
    for eid, spec in EMBLEM.items():
        fn, b = resolve(spec)
        cls = eid.split('_')[0]
        br = list(k for k in EMBLEM if k.startswith(cls + '_')).index(eid)
        em.append((eid, compose(24, fn, cls, b, BRANCH_BG[br])))
    sheet(em, 24, 'talent_emblems24', 3)
    preview(em, os.path.join(X.OUT, 'icons_talent_emblems24.png'), 'talent branch emblems 24x24', 6)
    # items
    ents = []
    for iid, spec in ITEMS.items():
        fn, b = resolve(spec)
        ents.append((iid, compose(16, fn, 'item', b)))
    sheet(ents, 16, 'items16', 12, {'note': 'neutral slate frame; the UI tints the frame by rarity (LQ colours). '
                                             'armor_<slot>_<plate|mail|leather|cloth>; weapon_<type>.'})
    preview(ents, os.path.join(X.OUT, 'icons_items16.png'), 'item icons 16x16', 12)
    print('icons:', len(ABILITY), 'abilities x2,', len(nodes), 'talents,', len(EMBLEM), 'emblems,', len(ITEMS), 'items')


if __name__ == '__main__':
    main()
