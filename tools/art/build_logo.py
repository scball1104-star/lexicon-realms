"""The "Lexicon Realms" title logo -> assets/icons/realms_logo.png + .json

    python tools/art/build_logo.py

In the spirit of LQ's logo (next/assets/ui/logo.png): bevelled cream-to-gold capitals with a dark warm outline and a
deep-blue drop shadow, first letters taller. Under it, Realms' own mark: a lantern (the respawn lanterns, the Watch)
between two ink-quill flourishes, instead of LQ's subtitle ribbon. Letters are DejaVu Serif Bold (free licence,
vendored in tools/art/fonts with its LICENSE) rendered without anti-aliasing, then pixel-shaded here. Deterministic.
"""
import os, sys, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrpix as X
import mobkit as K
import icon_glyphs as G

FONT = os.path.join(X.HERE, 'fonts', 'DejaVuSerif-Bold.ttf')
DST = os.path.join(X.ROOT, 'assets', 'icons')


def hexf(h):
    return np.array(X.hex2rgb(h), np.float32) / 255


def text_mask(words, big=34, small=26, gap=10):
    fb = ImageFont.truetype(FONT, big)
    fs = ImageFont.truetype(FONT, small)
    W, H = 420, 60
    im = Image.new('L', (W, H), 0)
    d = ImageDraw.Draw(im)
    d.fontmode = '1'
    x = 4
    base = 46
    for wi, w in enumerate(words):
        for i, ch in enumerate(w):
            f = fb if i == 0 else fs
            asc = f.getbbox('H')[1]
            hgt = f.getbbox('H')[3] - asc
            d.text((x, base - hgt - asc), ch, font=f, fill=255)
            x += f.getbbox(ch)[2] - f.getbbox(ch)[0] + (2 if i == 0 else 1)
        x += gap
    m = np.asarray(im) > 0
    ys, xs = np.nonzero(m)
    return m[ys.min():ys.max() + 1, xs.min():xs.max() + 1]


def dilate(m, r=1):
    out = m.copy()
    for dy in range(-r, r + 1):
        for dx in range(-r, r + 1):
            if abs(dx) + abs(dy) <= r:
                out |= np.roll(np.roll(m, dy, 0), dx, 1)
    return out


def build():
    m = text_mask(['LEXICON', 'REALMS'])
    h, w = m.shape
    P = 6
    H, W = h + P * 2 + 26, w + P * 2
    M = np.zeros((H, W), bool)
    M[P:P + h, P:P + w] = m
    img = X.blank(W, H)
    # shadow (deep blue, down-right), outline (warm dark), then the face
    sh = dilate(np.roll(np.roll(M, 2, 0), 1, 1), 2)
    ol = dilate(M, 1) | dilate(M, 2) & ~M
    img[sh] = np.append(hexf('#1a1334'), 1)
    img[dilate(M, 2)] = np.append(hexf('#2d1b1f'), 1)
    img[dilate(M, 1)] = np.append(hexf('#482826'), 1)
    stops = [hexf(c) for c in ('#fff7d6', '#f9d77a', '#eba14d', '#c38334', '#8f5533')]
    ys, xs = np.nonzero(M)
    top, bot = ys.min(), ys.max()
    for y, x in zip(ys, xs):
        t = (y - top) / max(bot - top, 1)
        # a horizon band, as LQ: light above the middle, a hard step to warm gold below
        if t < 0.48:
            c = stops[0] * (1 - t / 0.48) + stops[1] * (t / 0.48)
        else:
            tt = (t - 0.48) / 0.52
            c = stops[2] * (1 - tt) + stops[3] * tt
        if y > 0 and not M[y - 1, x]:
            c = stops[0] * 0.5 + np.array([1, 1, 1]) * 0.5
        elif y + 1 < H and not M[y + 1, x]:
            c = stops[4]
        elif x + 1 < W and not M[y, x + 1]:
            c = c * 0.78 + stops[4] * 0.22
        img[y, x] = np.append(c, 1)
    # the mark: a lantern between two ink flourishes
    cv = K.canvas(W, 26)
    cx = W // 2
    d = G.Draw(cv, cx - 9, 2, 18)
    G.lantern(d)
    for s in (-1, 1):
        for k in range(70):
            t = k / 69
            x = cx + s * (14 + t * (W * 0.32))
            y = 13 + math.sin(t * math.pi * 2.0) * 2.5 * (1 - t) - t * 1.0
            K.setp(cv, x, y, 'i' if k % 9 else 'j')
            K.setp(cv, x, y + 1, 'g')
        K.setp(cv, cx + s * (16 + W * 0.32), 12, 'j')
    K.outline(cv)
    mark, _ = K.colourize(cv, G.ICON_PAL)
    X.paste(img, mark, 0, h + P * 2 - 4)
    X.save_png(img, os.path.join(DST, 'realms_logo.png'))
    X.write_json(os.path.join(DST, 'realms_logo.json'), {
        'image': 'realms_logo.png', 'size': [W, H],
        'note': 'Title-screen logo, 1x pixel art: draw at an integer scale, nearest neighbour (3x at 1080p). '
                'Lives in assets/icons because the art lane owns that folder; the UI lane may copy it to assets/ui.'})
    # preview on LQ title-ish backgrounds
    prev = Image.new('RGB', (W * 3 + 20, H * 3 * 2 + 30 + H + 8), (14, 21, 59))
    pd = ImageDraw.Draw(prev)
    pd.rectangle([0, H * 3 + 15, W * 3 + 20, H * 6 + 30], fill=(90, 132, 60))
    t = X.upscale(img, 3)
    prev.paste(t, (10, 8), t)
    prev.paste(t, (10, H * 3 + 22), t)
    t1 = X.to_pil(img)
    prev.paste(t1, (10, H * 6 + 34), t1)
    prev.save(os.path.join(X.OUT, 'logo_3x.png'))
    print('logo', W, H)


if __name__ == '__main__':
    build()
