"""Paper-doll engine for Lexicon Realms player characters.

Same method as Lexicon Quest's townsfolk (LQ next/tools/art/sprites/build_npcs.py): grids are drawn in
MATERIAL letters, every look maps materials to master-palette ramps, and '0' outlines are coloured from
the darkest step of the neighbouring material. New here: arms and weapons are drawn procedurally from
pose points (so attack and cast poses are cheap), and frames are 32x40 so swings fit.

Coordinates: grids are authored in LQ body coordinates (24 x 32, feet on row 31). The frame canvas is
32 x 40 and body (0,0) sits at canvas (OX, OY) = (4, 8). Origin (feet) = canvas (16, 39).
"""
import math
from collections import Counter
import numpy as np
import lrpix as X

CW, CH = 32, 40
OX, OY = 4, 8
ORIGIN = (16, 39)

# material classes: letters in order deep -> light (LQ legend plus cape and a 3-step glow)
CLASSES = (('skin', 'wsST'), ('hair', 'ahHI'), ('top', 'kcCD'), ('sec', 'lbBV'), ('bottom', 'qpP'),
           ('shoes', 'rRx'), ('accent', 'gGY'), ('eyes', 'EF'), ('metal', 'mMNO'), ('wood', 'uUX'),
           ('glow', 'zZW'), ('hat', 'novy'), ('cape', 'deft'))
CLASS_OF = {}
for cls, chars in CLASSES:
    for i, ch in enumerate(chars):
        CLASS_OF[ch] = (cls, i)
LET = {cls: chars for cls, chars in CLASSES}
EMISSIVE = {'glow'}


def canvas():
    return np.full((CH, CW), '.', dtype='<U1')


def grid(txt):
    rows = X.grid_from_text(txt) if isinstance(txt, str) else txt
    w = max(len(r) for r in rows)
    a = np.full((len(rows), w), '.', dtype='<U1')
    for y, r in enumerate(rows):
        for x, ch in enumerate(r):
            a[y, x] = ch
    return a


def place(cv, g, x, y):
    """overlay grid g (char array or text) with its (0,0) at BODY coords (x, y)"""
    if isinstance(g, str):
        g = grid(g)
    H, W = cv.shape
    for yy in range(g.shape[0]):
        for xx in range(g.shape[1]):
            ch = g[yy, xx]
            if ch == '.':
                continue
            cy, cx = yy + y + OY, xx + x + OX
            if 0 <= cy < H and 0 <= cx < W:
                cv[cy, cx] = ch


def over(dst, src, dx=0, dy=0):
    """overlay char canvas src onto dst with a canvas offset"""
    H, W = dst.shape
    ys, xs = np.nonzero(src != '.')
    for y, x in zip(ys, xs):
        yy, xx = y + dy, x + dx
        if 0 <= yy < H and 0 <= xx < W:
            dst[yy, xx] = src[y, x]


def setp(cv, x, y, ch):
    """set one pixel at BODY coords"""
    cy, cx = int(y) + OY, int(x) + OX
    if 0 <= cy < CH and 0 <= cx < CW:
        cv[cy, cx] = ch


def getp(cv, x, y):
    cy, cx = int(y) + OY, int(x) + OX
    if 0 <= cy < CH and 0 <= cx < CW:
        return cv[cy, cx]
    return None


def line_pts(p0, p1):
    x0, y0 = int(round(p0[0])), int(round(p0[1]))
    x1, y1 = int(round(p1[0])), int(round(p1[1]))
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    out = []
    while True:
        out.append((x0, y0))
        if x0 == x1 and y0 == y1:
            break
        e2 = 2 * err
        if e2 >= dy:
            err += dy; x0 += sx
        if e2 <= dx:
            err += dx; y0 += sy
    return out


def ring(cv, pts, protect=(), skip_near=None, skip_r=0):
    """4-neighbour outline around a set of BODY-coord pixels; protect = letters never overwritten"""
    s = set(pts)
    for (x, y) in pts:
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if q in s:
                continue
            if skip_near is not None and abs(q[0] - skip_near[0]) + abs(q[1] - skip_near[1]) <= skip_r:
                continue
            cur = getp(cv, *q)
            if cur is None or cur in protect:
                continue
            setp(cv, q[0], q[1], '0')


def limb(cv, pts, w, sleeve='top', hand='skin', cuff=None, joint_r=2, protect=()):
    """Procedural arm: polyline pts (shoulder ... hand) at width w (2 or 3), lit from the upper left.
    The last ~2 px are the hand (skin letters, or another material for gloves); cuff = material of a
    1-px band just above the hand. The outline ring skips the shoulder joint so it merges with the torso."""
    sl, hd = LET[sleeve], LET[hand]
    pix = {}
    end = pts[-1]
    segs = list(zip(pts[:-1], pts[1:]))
    offs = {3: (-1, 0, 1), 2: (0, 1)}[w]
    for (a, b) in segs:
        vx, vy = b[0] - a[0], b[1] - a[1]
        L = math.hypot(vx, vy) or 1
        nx, ny = -vy / L, vx / L               # a normal
        if nx + ny > 0:                         # make it point to the upper left (the lit side)
            nx, ny = -nx, -ny
        horiz = abs(vx) > abs(vy)
        for (cx, cy) in line_pts(a, b):
            for o in offs:
                px, py = (cx, cy + o) if horiz else (cx + o, cy)
                s = (px - cx) * nx + (py - cy) * ny
                d_end = max(abs(px - end[0]), abs(py - end[1]))
                along = (px - end[0]) * vx / L + (py - end[1]) * vy / L   # <= 0 before the hand
                if d_end <= 1 and along > -1.5:
                    mat = hd; lv = 2 if s > 0.3 else 1
                    if hand == 'skin':
                        lv = 3 if (s > 0.3 and w == 3) else (2 if s > -0.3 else 1)
                elif cuff and along > -2.6:
                    mat = LET[cuff]; lv = 2 if s > 0.3 else 1
                else:
                    mat = sl
                    if w == 3:
                        lv = 3 if s > 0.3 else (2 if s > -0.3 else 1)
                    else:
                        lv = 2 if s > 0 else 1
                lv = min(lv, len(mat) - 1)
                pix[(px, py)] = mat[lv]
    for (x, y), ch in pix.items():
        setp(cv, x, y, ch)
    ring(cv, list(pix.keys()), protect=protect, skip_near=pts[0], skip_r=joint_r)
    return pix


def colourize(cv, pal):
    """char canvas -> (rgba, emissive rgba). pal: class -> list of 'ramp:i' refs (deep -> light)."""
    H, W = cv.shape
    img = X.blank(W, H)
    emi = X.blank(W, H)
    cache = {}
    for y in range(H):
        for x in range(W):
            ch = cv[y, x]
            if ch in ('.', '0'):
                continue
            cls, i = CLASS_OF[ch]
            refs = pal[cls]
            ref = refs[min(i, len(refs) - 1)]
            if ref not in cache:
                cache[ref] = X.rgbf(ref)
            img[y, x, :3] = cache[ref]
            img[y, x, 3] = 1
            if cls in EMISSIVE:
                emi[y, x] = img[y, x]
    outl = {}
    for y in range(H):
        for x in range(W):
            if cv[y, x] != '0':
                continue
            cnt = Counter()
            for dy, dx, wgt in ((-1, 0, 2), (1, 0, 2), (0, -1, 2), (0, 1, 2), (-1, -1, 1), (-1, 1, 1), (1, -1, 1), (1, 1, 1)):
                yy, xx = y + dy, x + dx
                if 0 <= yy < H and 0 <= xx < W and cv[yy, xx] not in '.0':
                    cls = CLASS_OF[cv[yy, xx]][0]
                    if cls == 'eyes':
                        cls = 'skin'
                    cnt[cls] += wgt
            cls = cnt.most_common(1)[0][0] if cnt else 'hair'
            if cls not in outl:
                outl[cls] = X.outline_for(pal[cls])
            img[y, x, :3] = outl[cls]
            img[y, x, 3] = 1
    return img, emi


# ------------------------------------------------------------------ walk helpers on char canvases
def shift_rows(cv, y0, y1, dy):
    """move canvas rows [y0, y1) by dy (down positive); vacated rows become empty. Canvas coords."""
    out = cv.copy()
    seg = cv[y0:y1].copy()
    out[y0:y1] = '.'
    for i in range(seg.shape[0]):
        yy = y0 + i + dy
        if 0 <= yy < CH:
            row = seg[i]
            m = row != '.'
            out[yy][m] = row[m]
    return out


def front_step(body, hip, legs, drop, raised, bob=1):
    """LQ walk.front_step on a char canvas (canvas coords). Body above the hip bobs down `bob`; each leg
    (x0, x1) is compressed by dropping rows: 1 row for the planted leg, 2 for the raised one."""
    out = canvas()
    above = body.copy(); above[hip:] = '.'
    over(out, above, 0, bob)
    for li, (x0, x1) in enumerate(legs):
        dr = drop['raise' if li == raised else 'plant']
        rows = [r for r in range(hip, CH) if r not in dr]
        strip = body[rows, x0:x1 + 1]
        top = hip + bob
        out[top:, x0:x1 + 1] = '.'
        n = min(len(rows), CH - top)
        for i in range(n):
            r = strip[i]
            m = r != '.'
            out[top + i, x0:x1 + 1][m] = r[m]
    return out


def side_step(body, legs_grid, y_top, x0, x1, bob=1):
    """replace the leg block (canvas rows y_top..end, cols x0..x1) with a hand-drawn step grid"""
    out = canvas()
    above = body.copy(); above[y_top:] = '.'
    over(out, above, 0, bob)
    g = grid(legs_grid)
    out[y_top:, x0:x1 + 1] = '.'
    for yy in range(g.shape[0]):
        for xx in range(g.shape[1]):
            ch = g[yy, xx]
            cy, cx = CH - g.shape[0] + yy, xx + OX
            if ch != '.' and x0 <= cx <= x1 and 0 <= cy < CH:
                out[cy, cx] = ch
    return out
