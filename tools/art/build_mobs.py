"""Mob sheets for Lexicon Realms real-time combat -> assets/sprites/mobs/<id>.png + .json (+ _emissive.png).

    python tools/art/build_mobs.py            # every mob, contact sheets, index
    python tools/art/build_mobs.py briar_wolf # one mob

Every mob family in docs/design/ZONES_QUESTS.md, drawn on-model from Lexicon Quest's field and battle art of the
same creatures, in four facings with real-time anims. Same atlas shape as the player sheets (assets/sprites/chars):
frames '{anim}_{dir}_{i}' -> [x, y, w, h], anims '{anim}_{dir}' -> {frames, fps, loop}, origin = the feet point,
hitFrame.attack = 1. Rows: one per dir (down, left, right, up); columns idle 0-1, walk 0-3, attack 0-2, hurt 0,
death 0-2, then the mob's extras (cast 0-1, special 0-1). Right is the mirrored left.
"""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrpix as X
import mobkit as K
import mob_defs as M

DST = os.path.join(X.ROOT, 'assets', 'sprites', 'mobs')
os.makedirs(DST, exist_ok=True)
DIRS = ['down', 'left', 'right', 'up']
BASE = [('idle', 2), ('walk', 4), ('attack', 3), ('hurt', 1), ('death', 3)]
FPS = {'idle': 3, 'walk': 8, 'attack': 10, 'hurt': 8, 'death': 6, 'cast': 6, 'special': 6}
LOOP = {'idle': True, 'walk': True, 'attack': False, 'hurt': False, 'death': False, 'cast': True, 'special': True}


def render(mob, anim, d, i):
    W, H = mob['cell']
    cv = K.canvas(W, H)
    view = {'down': 'down', 'left': 'side', 'right': 'side', 'up': 'up'}[d]
    pts = mob['draw'](cv, view, anim, i, W, H) or {}
    K.outline(cv)
    K.clean_outline(cv)
    if d == 'right':
        cv = K.mirror(cv)
        pts = {k: [W - 1 - v[0], v[1]] for k, v in pts.items()}
    img, emi = K.colourize(cv, mob['pal'], mob.get('emissive', ''))
    if anim == 'death' and i == 2:
        img = K.dither_fade(K.tint(img, mob['pal']['0'], 0.35), 0.5)
        emi = np.zeros_like(emi)
    return img, emi, pts


def anim_list(mob):
    return BASE + [(a, n) for a, n in mob.get('extra', [])]


def build(mid):
    mob = M.MOBS[mid]
    W, H = mob['cell']
    al = anim_list(mob)
    ncol = sum(n for _, n in al)
    sheet = X.blank(ncol * W, 4 * H)
    esheet = X.blank(ncol * W, 4 * H)
    frames, anims, points, rows = {}, {}, {}, {}
    any_emi = False
    for r, d in enumerate(DIRS):
        col = 0
        for anim, n in al:
            names = []
            for i in range(n):
                img, emi, pts = render(mob, anim, d, i)
                name = f'{anim}_{d}_{i}'
                x, y = col * W, r * H
                X.paste(sheet, img, x, y)
                X.paste(esheet, emi, x, y)
                any_emi = any_emi or emi[..., 3].any()
                frames[name] = [x, y, W, H]
                if pts and anim in ('attack', 'cast', 'special'):
                    points[name] = pts
                rows.setdefault(d, []).append((name, img))
                names.append(name)
                col += 1
            anims[f'{anim}_{d}'] = {'frames': names, 'fps': mob.get('fps', {}).get(anim, FPS[anim]), 'loop': LOOP[anim]}
    X.save_png(sheet, os.path.join(DST, f'{mid}.png'))
    meta = {'image': f'{mid}.png', 'mob': mid, 'name': mob['name'], 'family': mob['family'],
            'cell': [W, H], 'origin': [W // 2, H - 1],
            'anchor_note': f'origin = feet point (ground row) in every frame; draw at (x - {W // 2}, y - {H - 1}), '
                           'integer positions, nearest neighbour',
            'layout': 'one row per dir (down, left, right, up); columns ' +
                      ', '.join(f'{a} 0-{n - 1}' for a, n in al) + '. Right is the mirrored left.',
            'hitFrame': {'attack': 1}, 'windupFrame': {'attack': 0},
            'frames': frames, 'anims': anims}
    if points:
        meta['points'] = points
    for k in ('hover', 'flying', 'stationary', 'notes', 'scale_note', 'lq'):
        if k in mob:
            meta[k] = mob[k]
    if any_emi:
        X.save_png(esheet, os.path.join(DST, f'{mid}_emissive.png'))
        meta['emissive'] = f'{mid}_emissive.png'
    X.write_json(os.path.join(DST, f'{mid}.json'), meta)
    return rows, meta


def contact(mid, rows):
    items = []
    for d in DIRS:
        items += rows[d]
    mob = M.MOBS[mid]
    ncol = len(rows['down'])
    X.contact(items, os.path.join(X.OUT, f'mob_{mid}_4x.png'), scale=4, cols=ncol, bg=(58, 84, 56),
              title=f'{mid} ({mob["name"]}) at 4x: rows down/left/right/up; ' +
                    ', '.join(f'{a} {n}' for a, n in anim_list(mob)))


def overview(all_rows):
    """every mob's idle-down and attack strike (left) at 1x and 3x on LQ-grass, beside a player for scale"""
    S = 3
    pad = 6
    items = []
    for mid, rows in all_rows.items():
        d = dict(rows['down'])
        l = dict(rows['left'])
        items.append((mid, [d['idle_down_0'], l['walk_left_0'], l['attack_left_0'], l['attack_left_1'],
                            dict(rows['up'])['idle_up_0']]))
    hero = None
    try:
        im = Image.open(os.path.join(X.CHARS_DST, 'warden.png')).convert('RGBA')
        js = json.load(open(os.path.join(X.CHARS_DST, 'warden.json')))
        x, y, w, h = js['frames']['look1_idle_down_0']
        hero = X.from_pil(im.crop((x, y, x + w, y + h)))
    except Exception:
        pass
    font = ImageFont.load_default()
    colw = max(max(i.shape[1] for i in its) for _, its in items)
    rowh = max(max(i.shape[0] for i in its) for _, its in items)
    cols = 5
    cw = (colw * S + pad) * cols + 120 + (32 * S if hero is not None else 0)
    img = Image.new('RGB', (cw, (rowh * S + pad + 4) * len(items) + 24), (90, 132, 60))
    dr = ImageDraw.Draw(img)
    dr.text((4, 4), 'mobs at 3x on grass: idle down, walk left, attack wind-up, attack strike, idle up (warden for scale)',
            fill=(250, 250, 230), font=font)
    y = 20
    for mid, its in items:
        dr.text((4, y + 4), mid, fill=(250, 250, 230), font=font)
        x = 120
        if hero is not None:
            t = X.upscale(hero, S)
            img.paste(t, (x, y + rowh * S - t.size[1]), t)
            x += 32 * S
        for a in its:
            t = X.upscale(a, S)
            img.paste(t, (x, y + rowh * S - t.size[1]), t)
            x += colw * S + pad
        y += rowh * S + pad + 4
    img.save(os.path.join(X.OUT, 'mobs_overview_3x.png'))


def write_index(metas):
    idx = {'note': 'Lexicon Realms mob atlases (build: python tools/art/build_mobs.py). lq = the closest Lexicon Quest '
                   'field sprite (and battle sprite) the world agent mapped before these existed.',
           'mobs': {}}
    for mid, meta in metas.items():
        mob = M.MOBS[mid]
        idx['mobs'][mid] = {'atlas': f'{mid}.json', 'name': mob['name'], 'family': mob['family'],
                            'cell': meta['cell'], 'origin': meta['origin'],
                            'anims': sorted({k.rsplit('_', 1)[0] for k in meta['anims']}),
                            'lq': mob.get('lq', {}), 'variant_of': mob.get('variant_of')}
    X.write_json(os.path.join(DST, 'mobs_index.json'), idx)


def main(argv):
    ids = argv or list(M.MOBS)
    all_rows, metas = {}, {}
    for mid in ids:
        rows, meta = build(mid)
        contact(mid, rows)
        all_rows[mid] = rows
        metas[mid] = meta
        print('built', mid, len(meta['frames']), 'frames')
    if not argv:
        overview(all_rows)
        write_index(metas)


if __name__ == '__main__':
    main(sys.argv[1:])
