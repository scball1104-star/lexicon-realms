"""Pixel sculpting kit for Lexicon Realms mob sprites (and icons).

Shapes are filled with MATERIAL strings (letters dark -> light, e.g. 'abcd') and shaded by a fixed light from the
upper left (the same light as the player sheets and LQ's field art). '0' is an outline pixel; each mob's palette maps
'0' to its own deep colour (LQ rule: outline with the material's darkest step, never pure black).

A canvas is a numpy char array. Coordinates are floats in pixel units; pixel (x, y) covers [x, x+1) x [y, y+1).
Nothing here is random, so every build is byte-identical.
"""
import math
import numpy as np
import lrpix as X

LIGHT = np.array([-0.52, -0.72, 0.46], np.float32)
LIGHT /= np.linalg.norm(LIGHT)


def canvas(w, h):
    return np.full((h, w), '.', dtype='<U1')


def inside(cv, x, y):
    return 0 <= y < cv.shape[0] and 0 <= x < cv.shape[1]


def setp(cv, x, y, ch):
    x, y = int(math.floor(x)), int(math.floor(y))
    if inside(cv, x, y):
        cv[y, x] = ch


def getp(cv, x, y):
    x, y = int(math.floor(x)), int(math.floor(y))
    return cv[y, x] if inside(cv, x, y) else None


def level(mat, lam, lo=-0.15, hi=0.85):
    n = len(mat)
    t = (lam - lo) / (hi - lo)
    i = int(round(t * (n - 1)))
    return mat[max(0, min(n - 1, i))]


def _apply(cv, pix, sep):
    """pix: {(x,y): ch}. sep=True draws a '0' line where the new shape meets pixels already drawn."""
    if sep:
        for (x, y) in pix:
            for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                q = (x + dx, y + dy)
                if q in pix or not inside(cv, *q):
                    continue
                if cv[q[1], q[0]] not in '.':
                    cv[q[1], q[0]] = '0'
    for (x, y), ch in pix.items():
        if inside(cv, x, y):
            cv[y, x] = ch


def ell(cv, cx, cy, rx, ry, mat, sep=False, clip=None, flat=None, bias=0.0, z=0.7):
    """shaded ellipsoid. clip(x, y) -> False drops a pixel. flat = force one letter. bias shifts the light."""
    pix = {}
    for y in range(int(math.floor(cy - ry - 1)), int(math.ceil(cy + ry + 1))):
        for x in range(int(math.floor(cx - rx - 1)), int(math.ceil(cx + rx + 1))):
            u = (x + 0.5 - cx) / max(rx, 0.01)
            v = (y + 0.5 - cy) / max(ry, 0.01)
            d = u * u + v * v
            if d > 1.0:
                continue
            if clip is not None and not clip(x, y):
                continue
            if flat is not None:
                pix[(x, y)] = flat
                continue
            nz = math.sqrt(max(0.0, 1 - d)) * z
            n = np.array([u, v, nz], np.float32)
            n /= (np.linalg.norm(n) or 1)
            pix[(x, y)] = level(mat, float(n @ LIGHT) + bias)
    _apply(cv, pix, sep)
    return pix


def cap(cv, p0, p1, r0, r1, mat, sep=False, bias=0.0, flat=None):
    """tapered capsule from p0 (radius r0) to p1 (radius r1), shaded as a cylinder"""
    (x0, y0), (x1, y1) = p0, p1
    vx, vy = x1 - x0, y1 - y0
    L2 = vx * vx + vy * vy or 1e-6
    rmax = max(r0, r1)
    pix = {}
    for y in range(int(math.floor(min(y0, y1) - rmax - 1)), int(math.ceil(max(y0, y1) + rmax + 1))):
        for x in range(int(math.floor(min(x0, x1) - rmax - 1)), int(math.ceil(max(x0, x1) + rmax + 1))):
            px, py = x + 0.5, y + 0.5
            t = max(0.0, min(1.0, ((px - x0) * vx + (py - y0) * vy) / L2))
            qx, qy = x0 + vx * t, y0 + vy * t
            r = r0 + (r1 - r0) * t
            dx, dy = px - qx, py - qy
            dd = math.hypot(dx, dy)
            if dd > r + 0.02:
                continue
            if flat is not None:
                pix[(x, y)] = flat
                continue
            s = dd / max(r, 0.01)
            nx, ny = (dx / dd * s, dy / dd * s) if dd > 1e-6 else (0.0, 0.0)
            nz = math.sqrt(max(0.0, 1 - s * s))
            lam = nx * LIGHT[0] + ny * LIGHT[1] + nz * LIGHT[2]
            pix[(x, y)] = level(mat, float(lam) + bias)
    _apply(cv, pix, sep)
    return pix


def poly(cv, pts, mat, sep=False, flat=None, bias=0.0):
    """filled polygon; shaded by a gentle top-left gradient over its bounding box"""
    xs = [p[0] for p in pts]
    ys = [p[1] for p in pts]
    x0, x1, y0, y1 = min(xs), max(xs), min(ys), max(ys)
    pix = {}
    n = len(pts)
    for y in range(int(math.floor(y0)), int(math.ceil(y1)) + 1):
        for x in range(int(math.floor(x0)), int(math.ceil(x1)) + 1):
            px, py = x + 0.5, y + 0.5
            c = False
            j = n - 1
            for i in range(n):
                xi, yi = pts[i]
                xj, yj = pts[j]
                if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / ((yj - yi) or 1e-9) + xi:
                    c = not c
                j = i
            if not c:
                continue
            if flat is not None:
                pix[(x, y)] = flat
                continue
            u = ((px - x0) / max(x1 - x0, 1)) * 2 - 1
            v = ((py - y0) / max(y1 - y0, 1)) * 2 - 1
            lam = 0.55 - 0.45 * u - 0.55 * v
            pix[(x, y)] = level(mat, lam * 0.8 + bias, lo=-0.3, hi=1.0)
    _apply(cv, pix, sep)
    return pix


def line_pts(p0, p1):
    x0, y0 = int(math.floor(p0[0])), int(math.floor(p0[1]))
    x1, y1 = int(math.floor(p1[0])), int(math.floor(p1[1]))
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
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy
    return out


def line(cv, p0, p1, ch, sep=False):
    pix = {p: ch for p in line_pts(p0, p1)}
    _apply(cv, pix, sep)
    return pix


def stamp(cv, txt, x0, y0, skip='.'):
    """hand-pixeled detail; rows of letters, '.' leaves the pixel"""
    rows = [r for r in txt.strip('\n').split('\n')]
    for j, row in enumerate(rows):
        for i, ch in enumerate(row):
            if ch != skip:
                setp(cv, x0 + i, y0 + j, ch)


def outline(cv, keep_inner=True):
    """outer outline: every empty pixel touching a filled one (4-neighbour) becomes '0'"""
    H, W = cv.shape
    filled = (cv != '.') & (cv != '0')
    add = np.zeros_like(filled)
    add[1:, :] |= filled[:-1, :]
    add[:-1, :] |= filled[1:, :]
    add[:, 1:] |= filled[:, :-1]
    add[:, :-1] |= filled[:, 1:]
    cv[(cv == '.') & add] = '0'
    return cv


def clean_outline(cv):
    """drop outline pixels that touch no fill on any of 8 sides (stray corners)"""
    H, W = cv.shape
    for y in range(H):
        for x in range(W):
            if cv[y, x] != '0':
                continue
            ok = False
            for dy in (-1, 0, 1):
                for dx in (-1, 0, 1):
                    yy, xx = y + dy, x + dx
                    if (dx or dy) and 0 <= yy < H and 0 <= xx < W and cv[yy, xx] not in '.0':
                        ok = True
            if not ok:
                cv[y, x] = '.'
    return cv


def mirror(cv):
    return cv[:, ::-1].copy()


def shift(cv, dx, dy):
    H, W = cv.shape
    out = canvas(W, H)
    ys, xs = np.nonzero(cv != '.')
    for y, x in zip(ys, xs):
        if 0 <= y + dy < H and 0 <= x + dx < W:
            out[y + dy, x + dx] = cv[y, x]
    return out


def colourize(cv, pal, emissive=''):
    """pal: letter -> 'ramp:i' or '#hex'. Returns (rgba, emissive rgba)."""
    H, W = cv.shape
    img = X.blank(W, H)
    emi = X.blank(W, H)
    cache = {}
    for y in range(H):
        for x in range(W):
            ch = cv[y, x]
            if ch == '.':
                continue
            ref = pal[ch]
            if ref not in cache:
                cache[ref] = X.rgbf(ref)
            img[y, x, :3] = cache[ref]
            img[y, x, 3] = 1
            if ch in emissive:
                emi[y, x] = img[y, x]
    return img, emi


def dither_fade(img, keep, phase=0):
    """remove pixels in an ordered pattern, keeping `keep` (0..1) of them; for death fades"""
    bayer = np.array([[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]], np.float32) / 16
    H, W = img.shape[:2]
    out = img.copy()
    for y in range(H):
        for x in range(W):
            if bayer[(y + phase) % 4, (x + phase) % 4] >= keep:
                out[y, x, 3] = 0
    return out


def tint(img, ref, k):
    """mix colour toward ref by k (keeps alpha)"""
    c = X.rgbf(ref)
    out = img.copy()
    m = out[..., 3] > 0
    out[m, :3] = out[m, :3] * (1 - k) + c * k
    return out
