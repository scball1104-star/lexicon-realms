"""Polish-pass contact sheets (2026-11-19) -> tools/art/out/polish_*.png

    python tools/art/polish_sheets.py

Before = the atlases as they were before the pass (copied to out/_before/{mobs,chars,icons}); after = assets/.
Each sheet is composed at 1x on the real ground tiles (LQ terrain.png grass and dirt variants, as tiles.json lists
them), with the Warden for scale, then scaled 3x nearest-neighbour, so what you see is what the game shows at 3x.
Rows alternate grass and dirt. Deterministic.
"""
import os, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont
import lrpix as X

ROOT = X.ROOT
BEFORE = os.path.join(X.OUT, '_before')
TILES = json.load(open(os.path.join(ROOT, 'assets', 'tiles', 'tiles.json'), encoding='utf-8'))
TERRAIN = Image.open(os.path.join(ROOT, 'assets', 'tiles', 'terrain.png')).convert('RGBA')
S = 3
_cache = {}


def atlas(kind, name, before):
    key = (kind, name, before)
    if key not in _cache:
        base = os.path.join(BEFORE, kind) if before else os.path.join(ROOT, 'assets', 'sprites', kind)
        _cache[key] = (json.load(open(os.path.join(base, name + '.json'), encoding='utf-8')),
                       Image.open(os.path.join(base, name + '.png')).convert('RGBA'))
    return _cache[key]


def frame(kind, name, fr, before=False):
    j, im = atlas(kind, name, before)
    x, y, w, h = j['frames'][fr]
    return im.crop((x, y, x + w, y + h))


def ground(w, h, terrain):
    vs = TILES['terrains'][terrain]['variants']
    g = Image.new('RGBA', (w, h))
    for ty in range(0, h, 16):
        for tx in range(0, w, 16):
            vx, vy = vs[((tx // 16) * 7 + (ty // 16) * 3) % len(vs)]
            g.paste(TERRAIN.crop((vx, vy, vx + 16, vy + 16)), (tx, ty))
    return g


def sheet(path, title, rows, cell=(44, 48), label_w=70):
    """rows: [(label, [before frames], [after frames])] of PIL images (feet at the bottom of the cell)"""
    n = max(len(b) for _, b, _ in rows)
    cw, ch = cell
    W = label_w + 36 + n * cw + 12 + n * cw + 8
    H = 14 + len(rows) * ch
    W, H = (W + 15) // 16 * 16, (H + 15) // 16 * 16
    img = Image.new('RGBA', (W, H))
    for r in range(len(rows)):
        g = ground(W, ch, 'grass' if r % 2 == 0 else 'dirt')
        img.paste(g, (0, 14 + r * ch))
    img.paste(Image.new('RGBA', (W, 14), (36, 40, 56, 255)), (0, 0))
    warden = frame('chars', 'warden', 'look1_idle_down_0')
    for r, (label, bf, af) in enumerate(rows):
        y = 14 + r * ch
        img.alpha_composite(warden, (label_w, y + ch - 2 - warden.height))
        for k, f in enumerate(bf):
            img.alpha_composite(f, (label_w + 36 + k * cw + (cw - f.width) // 2, y + ch - 2 - f.height))
        x2 = label_w + 36 + n * cw + 12
        for k, f in enumerate(af):
            img.alpha_composite(f, (x2 + k * cw + (cw - f.width) // 2, y + ch - 2 - f.height))
    big = img.resize((W * S, H * S), Image.NEAREST).convert('RGB')
    d = ImageDraw.Draw(big)
    font = ImageFont.load_default()
    d.text((6, 8), title, fill=(250, 250, 230), font=font)
    d.text(((label_w + 36) * S, 26), 'BEFORE', fill=(255, 210, 160), font=font)
    d.text(((label_w + 36 + n * cw + 12) * S, 26), 'AFTER', fill=(190, 255, 190), font=font)
    for r, (label, _, _) in enumerate(rows):
        y = (14 + r * ch) * S + 8
        d.rectangle((4, y - 2, 4 + 6 * len(label) + 4, y + 11), fill=(20, 20, 30))
        d.text((6, y), label, fill=(250, 250, 230), font=font)
    big.save(os.path.join(X.OUT, path))
    print(path)


def mob_rows(ids, frames):
    rows = []
    for mid in ids:
        rows.append((mid, [frame('mobs', mid, f, True) for f in frames], [frame('mobs', mid, f) for f in frames]))
    return rows


def main():
    sheet('polish_slimes.png', 'slimes at 3x on grass and dirt (warden for scale): idle down 0/1 (squash-stretch), walk down 1-2, idle left, attack left 1, hurt down',
          mob_rows(['ink_slime', 'ink_slime', 'ink_slime_deep', 'ink_slime_deep', 'ink_blot', 'ink_blot'],
                   ['idle_down_0', 'idle_down_1', 'walk_down_1', 'walk_down_2', 'idle_left_0', 'attack_left_1', 'hurt_down_0']),
          cell=(32, 44))
    beasts = ['briar_wolf', 'thornback_wolf', 'mist_wolf', 'gorse_boar', 'fold_ram']
    rows = []
    for b in beasts:
        rows += mob_rows([b, b], ['idle_down_0', 'walk_down_1', 'attack_down_1', 'idle_up_0', 'walk_up_2', 'idle_left_0'])
    sheet('polish_beasts.png', 'four-legged beasts at 3x: idle down, walk down, bite down, idle up, walk up, side (unchanged except the ram)',
          rows, cell=(44, 36))
    rows = mob_rows(['gorse_crow', 'gorse_crow'], ['walk_left_0', 'walk_left_1', 'walk_left_2', 'walk_down_0', 'walk_down_2', 'idle_up_0', 'death_left_2'])
    rows += mob_rows(['page_wraith', 'ink_wraith', 'barrow_shade'], ['idle_left_0', 'walk_left_1', 'attack_left_1', 'cast_left_1', 'death_left_1', 'idle_down_0', 'idle_up_0'])
    sheet('polish_crow_wraiths.png', 'crow (bigger, broad wings: up, mid, DOWN-stroke) and wraith side sleeves + death pile at 3x',
          rows, cell=(36, 44))
    rows = []
    for c in ('warden', 'mender', 'scribe', 'wayfinder', 'inkblade'):
        fr = [f'look{n}_dead_down_0' for n in (1, 2, 3)]
        rows.append((c, [frame('chars', c, f, True) for f in fr], [frame('chars', c, f) for f in fr]))
    sheet('polish_dead.png', 'player dead pose (down), looks 1-3, at 3x: was the stand rotated, now a drawn lying pose',
          rows, cell=(36, 42))


if __name__ == '__main__':
    main()
