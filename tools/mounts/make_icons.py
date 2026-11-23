# Mount icons (2026-11-22, src/data/mounts.js): assets/icons/mounts16.png + .json (16x16, the items16 look) and
# mounts24.png + .json (24x24, the bar size: the same art at 2x in a 24 frame). Code-drawn pixel art, no source files.
#
#   python tools/mounts/make_icons.py
import json, os
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT = os.path.join(ROOT, 'assets', 'icons')

# 12x12 heads in profile, facing left. a = coat, b = light, d = dark coat, m = mane, t = tack (the blanket colour),
# s = steel, w = white, k = outline
HORSE = [
    '............', '.......kk...', '......kmmk..', '....kkammmk.', '...kaaaammk.', '..kaaaaaamk.',
    '.kbaakaaamk.', 'kbaaatttaak.', 'kdaakkaaaak.', '.kkk.kaaaak.', '.....kdaadk.', '.....kkkkk..']
CHARGER = [
    '............', '.......kk...', '......kmmk..', '....kssammk.', '...kssaammk.', '..kaasaaamk.',
    '.kbaakaaamk.', 'kbaaatttaak.', 'kdaakkaaaak.', '.kkk.kssssk.', '.....kssssk.', '.....kkkkk..']
STAG = [
    '.k.k...k.k..', '.kwk...kwk..', '..kwk.kwk...', '...kwkwk....', '....kaak....', '...kaaaak...',
    '..kbaakaak..', '.kbaaaaaak..', '.kdaatttak..', '..kkkaaaak..', '.....kaadk..', '.....kkkk...']
ICONS = {
    'mount_bay_horse': (HORSE, '#8a5530', '#c08858', '#2a1a10', '#2f5a8a'),
    'mount_grey_charger': (CHARGER, '#a9a7a2', '#e0ded8', '#e8e6e0', '#7a1f24'),
    'mount_moor_stag': (STAG, '#8a6a48', '#c0a078', '#4a3a2a', '#4a3a6a'),
}
OUTLINE = (0x14, 0x10, 0x1e, 255)


def rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(c, k):
    return tuple(max(0, min(255, int(v * k))) for v in c)


def frame(n):
    im = Image.new('RGBA', (n, n), OUTLINE)
    px = im.load()
    top, bot = rgb('#403c58'), rgb('#261f37')
    for y in range(1, n - 1):
        for x in range(1, n - 1):
            if y == 1 or x == 1:
                px[x, y] = (0xb3, 0xb6, 0xc4, 255)
            elif y == n - 2 or x == n - 2:
                px[x, y] = (0x4c, 0x44, 0x5c, 255)
            else:
                t = (y - 2) / max(1, n - 5)
                px[x, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
    return im


def art(rows, coat, light, mane, tack):
    a = rgb(coat)
    pal = {'a': a, 'b': rgb(light), 'd': shade(a, 0.62), 'm': rgb(mane), 't': rgb(tack), 's': (0xb8, 0xbc, 0xc4),
           'w': (0xf0, 0xea, 0xd8), 'k': OUTLINE[:3]}
    im = Image.new('RGBA', (12, 12), (0, 0, 0, 0))
    px = im.load()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch != '.':
                px[x, y] = pal[ch] + (255,)
    return im


def main():
    names = sorted(ICONS)
    for size, scale, off in ((16, 1, 2), (24, 2, 0)):
        sheet = Image.new('RGBA', (len(names) * size, size), (0, 0, 0, 0))
        frames = {}
        for i, n in enumerate(names):
            cell = frame(size)
            a = art(*ICONS[n])
            if scale != 1:
                a = a.resize((12 * scale, 12 * scale), Image.NEAREST)
            cell.alpha_composite(a, (off, off))
            if size == 24:   # keep the frame's edge over the 2x art
                f = frame(size).load(); c = cell.load()
                for k in range(size):
                    for (x, y) in ((k, 0), (k, size - 1), (0, k), (size - 1, k), (k, 1), (1, k), (k, size - 2), (size - 2, k)):
                        c[x, y] = f[x, y]
            sheet.paste(cell, (i * size, 0))
            frames[n] = [i * size, 0, size, size]
        key = 'mounts%d' % size
        sheet.save(os.path.join(OUT, key + '.png'))
        with open(os.path.join(OUT, key + '.json'), 'w', newline='\n') as f:
            json.dump({'image': key + '.png', 'size': [size, size], 'frames': frames,
                       'note': 'mount icons, code-drawn by tools/mounts/make_icons.py'}, f, indent=1)
            f.write('\n')
        print(f'{key}: {len(names)} icons')


if __name__ == '__main__':
    main()
