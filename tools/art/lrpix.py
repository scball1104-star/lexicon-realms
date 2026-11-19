"""Pixel helpers for Lexicon Realms art builds.

Vendored (copied, trimmed) from Lexicon Quest `next/tools/art/sprites/pix.py` and `pal.py` so this repo
never imports across repos. Images are numpy float32 HxWx4 arrays in 0..1 (straight alpha).
Colours come from `lq_palette.json` (a copy of LQ `next/assets/palette.json`), referenced as 'ramp:index'.
"""
import os, json, math
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(HERE, 'out')
CHARS_DST = os.path.join(ROOT, 'assets', 'sprites', 'chars')
FX_DST = os.path.join(ROOT, 'assets', 'fx')
LQ = r'D:\LexiconQuest\next'          # read only: reference sprites for the lineup
for d in (OUT, CHARS_DST, FX_DST):
    os.makedirs(d, exist_ok=True)

with open(os.path.join(HERE, 'lq_palette.json'), encoding='utf-8') as f:
    PALETTE = json.load(f)


def color(ref):
    """'ramp:i' -> '#hex'; '#hex' passes through"""
    if ref.startswith('#'):
        return ref
    name, i = ref.split(':')
    return PALETTE['ramps'][name][int(i)]


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def rgbf(ref):
    return np.array(hex2rgb(color(ref)), np.float32) / 255


def srgb_to_lin(c):
    c = np.asarray(c, np.float32)
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


def lin_to_srgb(c):
    c = np.clip(np.asarray(c, np.float32), 0, 1)
    return np.where(c <= 0.0031308, c * 12.92, 1.055 * np.power(c, 1 / 2.4) - 0.055)


_M1 = np.array([[0.4122214708, 0.5363325363, 0.0514459929],
                [0.2119034982, 0.6806995451, 0.1073969566],
                [0.0883024619, 0.2817188376, 0.6299787005]], np.float32)
_M2 = np.array([[0.2104542553, 0.7936177850, -0.0040720468],
                [1.9779984951, -2.4285922050, 0.4505937099],
                [0.0259040371, 0.7827717662, -0.8086757660]], np.float32)


def to_oklab(rgb):
    lms = np.cbrt(np.maximum(srgb_to_lin(rgb) @ _M1.T, 0))
    return lms @ _M2.T


def from_oklab(lab):
    lms = (np.asarray(lab, np.float32) @ np.linalg.inv(_M2).T) ** 3
    return lin_to_srgb(lms @ np.linalg.inv(_M1).T)


def darken(c, s, tgt):
    """darken colour c by s (0..1) toward a deep indigo, in OKLab (LQ outline rule)"""
    lab = to_oklab(np.asarray(c, np.float32).reshape(1, 3))[0]
    tl = to_oklab(np.asarray(tgt, np.float32).reshape(1, 3))[0]
    L = lab[0] * (1 - s) + tl[0] * s * 0.6
    ab = lab[1:] * (1 - s * 0.55) + tl[1:] * s * 0.55
    return np.clip(from_oklab(np.array([[L, ab[0], ab[1]]], np.float32))[0], 0, 1)


def outline_for(refs):
    """outline colour for a material: its darkest step, pushed darker/cooler if still light (LQ rule)"""
    cols = [rgbf(r) for r in refs]
    labs = [to_oklab(c.reshape(1, 3))[0] for c in cols]
    i = int(np.argmin([l[0] for l in labs]))
    c, L = cols[i], labs[i][0]
    tgt = rgbf(PALETTE.get('darkest', '#14101e'))
    if L > 0.22:
        c = darken(c, min(0.75, (L - 0.12) * 1.6), tgt)
    return c


def to_pil(a):
    return Image.fromarray((np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8), 'RGBA')


def from_pil(im):
    return np.asarray(im.convert('RGBA')).astype(np.float32) / 255.0


def blank(w, h):
    return np.zeros((h, w, 4), np.float32)


def paste(dst, src, x, y):
    h, w = src.shape[:2]
    H, W = dst.shape[:2]
    x0, y0 = max(x, 0), max(y, 0)
    x1, y1 = min(x + w, W), min(y + h, H)
    if x1 <= x0 or y1 <= y0:
        return dst
    s = src[y0 - y:y1 - y, x0 - x:x1 - x]
    d = dst[y0:y1, x0:x1]
    a = s[..., 3:4]
    out_a = a + d[..., 3:4] * (1 - a)
    rgb = np.where(out_a > 0, (s[..., :3] * a + d[..., :3] * d[..., 3:4] * (1 - a)) / np.maximum(out_a, 1e-6), 0)
    dst[y0:y1, x0:x1] = np.concatenate([rgb, out_a], -1)
    return dst


def flip_x(a):
    return a[:, ::-1].copy()


def grid_from_text(txt):
    lines = txt.split('\n')
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    return lines


def upscale(a, s):
    return to_pil(a).resize((a.shape[1] * s, a.shape[0] * s), Image.NEAREST)


def write_json(path, obj):
    with open(path, 'w', encoding='utf-8', newline='\n') as f:
        f.write(json.dumps(obj, indent=1))
        f.write('\n')


def save_png(a, path):
    """lossless; indexed when the sheet has 256 colours or fewer (as LQ's atlases)"""
    q = (np.clip(a, 0, 1) * 255 + 0.5).astype(np.uint8)
    q[q[..., 3] == 0] = 0
    flat = q.reshape(-1, 4)
    uniq, inv = np.unique(flat, axis=0, return_inverse=True)
    if len(uniq) <= 256:
        im = Image.new('P', (q.shape[1], q.shape[0]))
        pal = uniq[:, :3].reshape(-1).tolist() + [0] * (768 - len(uniq) * 3)
        im.putpalette(pal)
        im.putdata(inv.reshape(-1).tolist())
        trns = bytes(int(v) for v in uniq[:, 3]) + b'\xff' * (256 - len(uniq))
        im.save(path, transparency=trns, optimize=True)
    else:
        Image.fromarray(q, 'RGBA').save(path, optimize=True)


def contact(items, path, scale=4, cols=8, bg=(52, 74, 58), label=True, cellpad=6, title=None):
    """items: list of (label, rgba). Labelled contact sheet at integer scale, nearest neighbour."""
    font = ImageFont.load_default()
    ws = [it[1].shape[1] * scale for it in items]
    hs = [it[1].shape[0] * scale for it in items]
    cw = max(ws) + cellpad * 2
    chh = max(hs) + cellpad * 2 + (12 if label else 0)
    cols = min(cols, len(items))
    rows = (len(items) + cols - 1) // cols
    top = 18 if title else 0
    img = Image.new('RGB', (cw * cols, chh * rows + top), bg)
    d = ImageDraw.Draw(img)
    if title:
        d.text((4, 3), title, fill=(240, 240, 220), font=font)
    for i, (lab, a) in enumerate(items):
        cx, cy = (i % cols) * cw, (i // cols) * chh + top
        tile = to_pil(a).resize((a.shape[1] * scale, a.shape[0] * scale), Image.NEAREST)
        x = cx + (cw - tile.size[0]) // 2
        y = cy + cellpad + (max(hs) - tile.size[1])
        img.paste(tile, (x, y), tile)
        if label:
            d.text((cx + 3, cy + chh - 13), str(lab)[:int(cw / 6)], fill=(235, 235, 210), font=font)
    img.save(path)
    return path
