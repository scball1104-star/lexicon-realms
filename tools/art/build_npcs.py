"""NPC art for Lexicon Realms (polish pass 2026-11-19): field sprites, 12x12 target-frame heads, 32x32 dialog portraits.

    python tools/art/build_npcs.py

Every NPC in src/data/npcs.js gets:
  (a) a field sprite in assets/sprites/lq/npcs.png/.json (LQ townsfolk format: 24x32 cells, origin [12, 31], frames
      <sprite>_<down|left|right|up>_<0|1|2|blink>, anims <sprite>_walk_<dir> / <sprite>_idle_<dir>). The sheet is LQ's
      npcs atlas (copied byte for byte from LQ:assets/sprites/npcs.png/json, every existing frame keeps its rect) with
      bands APPENDED below it:
        - LQ's x1_npcs blocks for Brindle, Tamsin and Odo, copied pixel for pixel (npc_brindle, npc_tamsin, npc_odo);
        - new Realms townsfolk kitbashed from LQ grids, the way LQ makes its own variants: npc_sloe (Tess's grid in ink
          and plum, a violet scarf over the lower face), npc_sorrel (Hob's head, re-haired russet, on Cobb's body in
          peat-brown work clothes, a red neckerchief), npc_penny (Nella's grid: dark skin, dark hair, Pell's gold),
          npc_quill (the scholar's grid: grey hair, spectacles, a green pilgrim robe).
  (b) assets/portraits/npc_heads.png/.json: frames head_<npc id>, 12x12 (a 1 px #14101e frame around a 10x10 head on
      #251d34), LQ ui/heads.png format. Mira and Bram are LQ's own heads, copied; the others are hand-pixeled 10x10
      chibi faces in the style of LQ's party heads (HERO/MIRA/BRAM grids in LQ tools/art/sprites/build_heads.py),
      in the colours of the NPC's field sprite.
  (c) assets/portraits/npc_portraits.png/.json: frames <npc id>_32 (32x32, LQ <name>_32 format with its bevel). NPCs
      that have an LQ portrait use LQ's, copied (mael mira bram hazel iris tess hob garrick pell nella pip); the rest
      are painted with build_portraits.paint in their field sprite's colours.
Both JSONs carry `npcs`: npc id -> frame name, and `sprite`: npc id -> field sprite key, so the UI looks up by npc id.
Deterministic: run twice, byte-identical.
"""
import os, sys, json
import numpy as np
from PIL import Image, ImageDraw, ImageFont

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import lrpix as X
import build_portraits as BP

LQS = os.path.join(X.LQ, 'assets', 'sprites')
LQUI = os.path.join(X.LQ, 'assets', 'ui')
SPR = os.path.join(X.ROOT, 'assets', 'sprites', 'lq')
POR = os.path.join(X.ROOT, 'assets', 'portraits')
DIRS = ['down', 'left', 'right', 'up']
COLS = ['0', '1', '2', 'blink']

# npc id -> field sprite key (the target of the integrator's mapping; src/data/npcs.js `sprite`)
SPRITE = {
    'mael': 'npc_elder', 'hob': 'npc_innkeeper', 'holt': 'npc_guard', 'hazel': 'npc_parent', 'iris': 'npc_scholar',
    'tess': 'npc_tess', 'sloe': 'npc_sloe', 'mira': 'mira', 'bram': 'bram', 'oren': 'npc_baker', 'garrick': 'npc_smith',
    'pell': 'npc_shopkeeper', 'cobb': 'npc_farmer', 'nella': 'npc_ferry', 'lark': 'npc_child_b', 'wick': 'npc_child_a',
    'pip': 'npc_bellkeeper', 'edda': 'npc_old_woman', 'penny': 'npc_penny', 'quill': 'npc_quill',
    'lark_escort': 'npc_child_b', 'brindle': 'npc_brindle', 'tamsin': 'npc_tamsin', 'odo': 'npc_odo',
    'sorrel': 'npc_sorrel',
}
LQ_PORTRAIT = ['mael', 'mira', 'bram', 'hazel', 'iris', 'tess', 'hob', 'garrick', 'pell', 'nella', 'pip']
ALIAS = {'lark_escort': 'lark'}


# ============================================================================================ field sprites
def hx(c):
    c = X.color(c) if not c.startswith('#') else c
    return tuple(int(c[i:i + 2], 16) for i in (1, 3, 5))


def load(name):
    j = json.load(open(os.path.join(LQS, name + '.json'), encoding='utf-8'))
    im = Image.open(os.path.join(LQS, name + '.png')).convert('RGBA')
    return j, np.array(im)


def block(j, a, key):
    """the 96x128 block of a humanoid (4 dirs x stand, stepA, stepB, blink) as an RGBA array"""
    out = np.zeros((128, 96, 4), np.uint8)
    for r, d in enumerate(DIRS):
        for c, n in enumerate(COLS):
            x, y, w, h = j['frames'][f'{key}_{d}_{n}']
            out[r * 32:r * 32 + 32, c * 24:c * 24 + 24] = a[y:y + 32, x:x + 24]
    return out


def recolor(blk, rules):
    """rules: list of (row0, row1, {src hex: dst ref}) applied per 32-row frame, rows in frame coordinates"""
    out = blk.copy()
    for r in range(4):
        for c in range(4):
            f = out[r * 32:r * 32 + 32, c * 24:c * 24 + 24]
            src = blk[r * 32:r * 32 + 32, c * 24:c * 24 + 24]
            for (y0, y1, mp, dirs) in rules:
                if dirs and DIRS[r] not in dirs:
                    continue
                for s, d in mp.items():
                    sv = np.array(hx(s), np.uint8)
                    m = (src[y0:y1, :, :3] == sv).all(-1) & (src[y0:y1, :, 3] > 0)
                    f[y0:y1][m, :3] = hx(d)
    return out


def R(*pairs):
    return dict(pairs)


def make_sloe(j, a):
    b = block(j, a, 'npc_tess')
    hair = R(('#482826', 'hair_violet:1'), ('#6e3d2c', 'hair_violet:2'), ('#8f5533', 'hair_violet:3'),
             ('#b87942', 'hair_violet:4'), ('#331a1b', 'shadow:0'))
    tunic = R(('#4f9e6e', 'stone_cool:1'), ('#317aa1', 'shadow:1'), ('#2ec4d0', 'stone_cool:3'),
              ('#1d3775', 'ink:1'), ('#0f2051', 'shadow:0'),
              ('#482826', 'roof_purple:1'), ('#6e3d2c', 'roof_purple:2'), ('#8f5533', 'roof_purple:3'),
              ('#b87942', 'roof_purple:4'))
    boots = R(('#482826', 'shadow:1'), ('#6e3d2c', 'shadow:2'), ('#8f5533', 'shadow:3'), ('#b87942', 'stone_cool:3'),
              ('#331a1b', 'shadow:0'))
    # the scarf: the lower face (rows 10-12) in violet, on the three facings that show a face
    scarf = R(('#e8b585', 'magic_violet:1'), ('#cc875b', 'magic_violet:0'), ('#a66142', 'roof_purple:1'),
              ('#fae2cb', 'magic_violet:2'), ('#37140c', 'ink:1'))
    return recolor(b, [(0, 14, hair, None), (10, 13, scarf, ('down', 'left', 'right')), (13, 24, tunic, None),
                       (24, 32, boots, None)])


def make_sorrel(j, a):
    head = block(j, a, 'npc_innkeeper')
    body = block(j, a, 'npc_farmer')
    out = body.copy()
    for r in range(4):
        for c in range(4):
            y = r * 32
            out[y:y + 14, c * 24:c * 24 + 24] = head[y:y + 14, c * 24:c * 24 + 24]
    hair = R(('#2d1b1f', 'wood:0'), ('#482826', 'roof_red:1'), ('#6e3d2c', 'roof_red:2'), ('#8f5533', 'roof_red:3'),
             ('#b87942', 'roof_red:4'))
    shirt = R(('#1c3730', 'wood:0'), ('#285743', 'earth:1'), ('#397951', 'earth:2'), ('#4f9e6e', 'earth:3'),
              ('#112623', 'wood:0'), ('#3d111c', 'wood:0'), ('#87332e', 'roof_red:2'), ('#b34532', 'roof_red:3'))
    trousers = R(('#896042', 'stone_warm:2'), ('#6a4532', 'stone_warm:1'))
    o = recolor(out, [(0, 14, hair, None), (13, 24, shirt, None), (24, 28, trousers, None)])
    # red neckerchief knot at the collar (down facing)
    for c in range(4):
        f = o[0:32, c * 24:c * 24 + 24]
        for (x, y, ref) in ((10, 14, 'roof_red:3'), (11, 14, 'roof_red:4'), (12, 14, 'roof_red:3'), (13, 14, 'roof_red:2'),
                            (11, 15, 'roof_red:2'), (12, 15, 'roof_red:3')):
            if f[y, x, 3]:
                f[y, x, :3] = hx(ref)
    return o


def make_penny(j, a):
    b = block(j, a, 'npc_ferry')
    hair = R(('#c38334', 'shadow:2'), ('#eba14d', 'shadow:3'), ('#f9d77a', 'stone_cool:3'), ('#8f5533', 'shadow:1'),
             ('#3b1a0d', 'shadow:0'))
    skin = R(('#e8b585', 'skin_dark:4'), ('#cc875b', 'skin_dark:3'), ('#a66142', 'skin_dark:2'), ('#fae2cb', 'skin_med:2'))
    dress = R(('#1d2a67', 'gold:1'), ('#2c4797', 'gold:2'), ('#4064b9', 'gold:3'), ('#6891d9', 'gold:4'),
              ('#131b4e', 'wood:1'))
    return recolor(b, [(0, 14, hair, None), (0, 24, skin, None), (13, 32, dress, None)])


def make_quill(j, a):
    b = block(j, a, 'npc_scholar')
    hair = R(('#1a1334', 'stone_cool:1'), ('#292657', 'stone_cool:2'), ('#3f4186', 'stone_cool:4'),
             ('#7162bd', 'stone_cool:5'))
    robe = R(('#1d2a67', 'roof_green:1'), ('#2c4797', 'roof_green:2'), ('#4064b9', 'roof_green:3'),
             ('#6891d9', 'roof_green:4'), ('#131b4e', 'foliage_dark:0'))
    return recolor(b, [(0, 9, hair, None), (13, 32, robe, None)])


NEW = [('npc_brindle', 'Brindle'), ('npc_tamsin', 'Tamsin'), ('npc_odo', 'Odo'),
       ('npc_sloe', 'Sloe'), ('npc_sorrel', 'Sorrel'), ('npc_penny', 'Penny'), ('npc_quill', 'Quill')]


def build_field():
    j, a = load('npcs')
    xj, xa = load('x1_npcs')
    blocks = {'npc_brindle': block(xj, xa, 'npc_brindle'), 'npc_tamsin': block(xj, xa, 'npc_tamsin'),
              'npc_odo': block(xj, xa, 'npc_odo'), 'npc_sloe': make_sloe(j, a), 'npc_sorrel': make_sorrel(j, a),
              'npc_penny': make_penny(j, a), 'npc_quill': make_quill(j, a)}
    H0, W = a.shape[:2]
    bands = (len(NEW) + 2) // 3
    sheet = np.zeros((H0 + bands * 128, W, 4), np.uint8)
    sheet[:H0] = a
    meta = json.loads(json.dumps(j))
    for k, (key, name) in enumerate(NEW):
        bx, by = (k % 3) * 96, H0 + (k // 3) * 128
        sheet[by:by + 128, bx:bx + 96] = blocks[key]
        meta['sprites'][key] = {'name': name, 'cell': [24, 32], 'origin': [12, 31], 'dirs': DIRS}
        for r, d in enumerate(DIRS):
            for c, n in enumerate(COLS):
                meta['frames'][f'{key}_{d}_{n}'] = [bx + c * 24, by + r * 32, 24, 32]
            meta['anims'][f'{key}_walk_{d}'] = {'frames': [f'{key}_{d}_1', f'{key}_{d}_0', f'{key}_{d}_2', f'{key}_{d}_0'],
                                               'fps': 6, 'loop': True}
            meta['anims'][f'{key}_idle_{d}'] = {'frames': [f'{key}_{d}_0'] * 26 + [f'{key}_{d}_blink', f'{key}_{d}_0'],
                                               'fps': 8, 'loop': True}
    meta['layout'] += (' LEXICON REALMS (tools/art/build_npcs.py, 2026-11-19): LQ npcs.png is unchanged above row '
                       f'{H0}; below it, Realms bands in the same block format: npc_brindle, npc_tamsin, npc_odo '
                       '(copied from LQ x1_npcs), then npc_sloe, npc_sorrel, npc_penny, npc_quill (Realms townsfolk '
                       'kitbashed from LQ grids).')
    Image.fromarray(sheet, 'RGBA').save(os.path.join(SPR, 'npcs.png'), optimize=True)
    X.write_json(os.path.join(SPR, 'npcs.json'), meta)
    return meta, sheet


def field_frame(meta, sheet, party, key, d='down', n='0'):
    if key in ('mira', 'bram'):
        pj, pa = party
        x, y, w, h = pj['frames'][f'{key}_{d}_0']
        return pa[y:y + h, x:x + w]
    x, y, w, h = meta['frames'][f'{key}_{d}_{n}']
    return sheet[y:y + h, x:x + w]


# ================================================================================================= heads
# 10x10 chibi heads in the manner of LQ's party heads. Letters: a-e hair (dark -> light), u skin, t skin shade,
# E eye, F eye glint below, p q r beard (dark -> light), H I J hat (dark -> light), K hat jewel/band, M N scarf,
# G spectacle rims.
HEAD = {
 'long': '''
...aaaa...
..aeddda..
.aeddddcda
adddcddcca
adcuuuucba
.cuEuuEuc.
.cuFuuFub.
.btuuuutb.
..atuuta..
...aaaa...''',
 'short': '''
...aaaa...
..acddca..
.acdddccb.
acddcccbba
abcuuuucba
.buEuuEub.
.tuFuuFut.
..tuuuut..
...tuut...
..........''',
 'pony': '''
...aaaa...
..adddca..
.adddccbab
adddcccbac
abcuuuucbc
.buEuuEubc
.tuFuuFutb
..tuuuut..
...tuut...
..........''',
 'bun': '''
...bccb...
...cdec...
..acddca..
.adddccba.
abcuuuucba
.buEuuEub.
.tuFuuFut.
..tuuuut..
...tuut...
..........''',
 'bald': '''
...tttt...
..tuuuut..
.tuuuuuut.
.tuuuuuut.
bbuuuuuubb
.buEuuEub.
.buFuuFub.
..tuuuut..
...tuut...
..........''',
 'helm': '''
...HHHH...
..HIJJIH..
.HIIJJIIH.
HHHHHHHHHH
.HuuuuuuH.
.tuEuuEut.
.tuFuuFut.
..tuuuut..
...tuut...
..........''',
 'cap': '''
...HHHH...
..HIJJIH..
.HIIJIIIH.
.HIIIIIIH.
HKKKKKKKKH
.tuEuuEut.
.tuFuuFut.
..tuuuut..
...tuut...
..........''',
 'hat_wide': '''
...HIIH...
..HIJJIH..
..HIIIIH..
HHKKKKKKHH
.aHHHHHHa.
.tuEuuEut.
.tuFuuFut.
..tuuuut..
...tuut...
..........''',
 'chef': '''
..HIJJJI..
..HIJJJIH.
..HIIIIH..
..HKKKKH..
.auuuuuua.
.tuEuuEut.
.tuFuuFut.
..tuuuut..
...tuut...
..........''',
 'turban': '''
..HIJJIH..
.HIJJKJIH.
HIIJJJJIIH
HHIIIIIIHH
.tuuuuuut.
.tuEuuEut.
.tuFuuFut.
..tuuuut..
...tuut...
..........''',
 'hood': '''
...HHHH...
..HIJJIH..
.HIJIIJIH.
HIHHHHHHIH
HIHuuuuHIH
HHuEuuEuHH
HHuFuuFuHH
.HtuuuutH.
..HtuutH..
...HHHH...''',
}
BEARD = {   # rows 6.. overlays; '.' keeps the base
 'full': ['.puFuuFup.', '.pqtuutqp.', '..pqrrqp..', '...pqqp...'],
 'short': [None, '.ptuuuutp.', '..pqqqqp..', '...pqqp...'],
 'sides': [None, '.pt....tp.', '..p....p..', None],
}
MASK = ['.MuFuuFuM.', '.MMNNNNMM.', '..MNNNNM..', '...MMMM...']
GLASSES = (5, '.GuEGGEuG.')

HAIR = {
 'brown': ['hair_brown:0', 'hair_brown:1', 'hair_brown:2', 'hair_brown:3', 'hair_brown:4'],
 'red': ['roof_red:1', 'roof_red:2', 'roof_red:3', 'roof_red:4', 'roof_red:5'],
 'russet': ['wood:0', 'roof_red:1', 'roof_red:2', 'roof_red:3', 'roof_red:4'],
 'blonde': ['gold:1', 'gold:2', 'gold:3', 'gold:4', 'gold:5'],
 'grey': ['stone_cool:1', 'stone_cool:2', 'stone_cool:3', 'stone_cool:4', 'stone_cool:5'],
 'white': ['stone_warm:2', 'stone_warm:3', 'stone_warm:4', 'stone_warm:5', 'metal:4'],
 'navy': ['ink:0', 'ink:1', 'ink:2', 'ink:3', 'ink:4'],
 'plum': ['hair_violet:0', 'hair_violet:1', 'hair_violet:2', 'hair_violet:3', 'hair_violet:4'],
 'black': ['shadow:0', 'shadow:1', 'shadow:2', 'shadow:3', 'stone_cool:3'],
}
SKIN = {'light': ('skin_light:2', 'skin_light:1'), 'med': ('skin_med:2', 'skin_med:1'), 'dark': ('skin_dark:4', 'skin_dark:3')}
HATC = {
 'steel': ['metal:0', 'metal:1', 'metal:2', 'metal:3'], 'straw': ['sand:0', 'sand:1', 'sand:2', 'earth:3'],
 'white': ['stone_warm:3', 'stone_warm:4', 'stone_warm:5', 'gold:3'], 'turban': ['stone_warm:3', 'stone_warm:5', 'metal:4', 'roof_red:3'],
 'green': ['roof_green:1', 'roof_green:2', 'roof_green:3', 'roof_green:4'], 'wool': ['stone_cool:2', 'stone_cool:3', 'stone_cool:4', 'stone_cool:2'],
}

# npc id -> head spec: style, hair, skin, eye, beard (style, hair ramp), hat, mask, glasses
SPEC = {
 'mael':    dict(style='hood', hair='white', skin='light', eye='ink:2', beard=('full', 'white'), hat='green'),
 'hob':     dict(style='short', hair='brown', skin='light', eye='ink:2', beard=('full', 'brown')),
 'holt':    dict(style='helm', hair='brown', skin='light', eye='ink:2', hat='steel'),
 'hazel':   dict(style='long', hair='red', skin='light', eye='roof_green:2'),
 'iris':    dict(style='bun', hair='navy', skin='light', eye='ink:2', glasses=True),
 'tess':    dict(style='pony', hair='brown', skin='light', eye='ink:2'),
 'sloe':    dict(style='short', hair='plum', skin='light', eye='magic_violet:2', mask=True),
 'oren':    dict(style='chef', hair='brown', skin='light', eye='ink:2', beard=('full', 'brown'), hat='white'),
 'garrick': dict(style='bald', hair='white', skin='light', eye='ink:2', beard=('full', 'white')),
 'pell':    dict(style='turban', hair='black', skin='dark', eye='shadow:0', beard=('full', 'black'), hat='turban'),
 'cobb':    dict(style='hat_wide', hair='brown', skin='light', eye='ink:2', hat='straw'),
 'nella':   dict(style='long', hair='blonde', skin='light', eye='ink:2'),
 'lark':    dict(style='pony', hair='blonde', skin='light', eye='ink:2'),
 'wick':    dict(style='short', hair='brown', skin='light', eye='ink:2'),
 'pip':     dict(style='bald', hair='grey', skin='light', eye='ink:2', beard=('short', 'grey')),
 'edda':    dict(style='bun', hair='grey', skin='light', eye='ink:2'),
 'penny':   dict(style='long', hair='black', skin='dark', eye='shadow:0'),
 'quill':   dict(style='bun', hair='grey', skin='light', eye='ink:2', glasses=True),
 'brindle': dict(style='cap', hair='white', skin='light', eye='ink:2', beard=('full', 'white'), hat='wool'),
 'tamsin':  dict(style='bun', hair='grey', skin='light', eye='ink:2'),
 'odo':     dict(style='bald', hair='grey', skin='light', eye='ink:2', beard=('sides', 'grey')),
 'sorrel':  dict(style='short', hair='russet', skin='light', eye='ink:2', beard=('short', 'russet')),
}


def head_grid(sp):
    rows = [list(r) for r in X.grid_from_text(HEAD[sp['style']])]
    rows = [r + ['.'] * (10 - len(r)) for r in rows]
    if sp.get('beard'):
        for k, ov in enumerate(BEARD[sp['beard'][0]]):
            if ov:
                for x, ch in enumerate(ov):
                    if ch != '.':
                        rows[6 + k][x] = ch
    if sp.get('mask'):
        for k, ov in enumerate(MASK):
            for x, ch in enumerate(ov):
                if ch != '.':
                    rows[6 + k][x] = ch
    if sp.get('glasses'):
        y, ov = GLASSES
        for x, ch in enumerate(ov):
            if ch == 'G':
                rows[y][x] = ch
    return rows


def head_img(sp):
    hair = HAIR[sp['hair']]
    leg = dict(zip('abcde', hair))
    leg['u'], leg['t'] = SKIN[sp['skin']]
    leg['E'] = sp['eye']
    leg['F'] = 'water:3' if sp['eye'] in ('ink:2',) else 'stone_cool:4'
    if sp.get('beard'):
        b = HAIR[sp['beard'][1]]
        leg.update({'p': b[1], 'q': b[2], 'r': b[3]})
    if sp.get('hat'):
        h = HATC[sp['hat']]
        leg.update({'H': h[0], 'I': h[1], 'J': h[2], 'K': h[3]})
    leg.update({'M': 'roof_purple:2', 'N': 'magic_violet:1', 'G': 'metal:2'})
    out = X.blank(12, 12)
    out[..., :3] = X.rgbf('#14101e')
    out[..., 3] = 1
    out[1:11, 1:11, :3] = X.rgbf('#251d34')
    for y, row in enumerate(head_grid(sp)):
        for x, ch in enumerate(row):
            if ch != '.':
                out[1 + y, 1 + x, :3] = X.rgbf(leg[ch])
    return out


def lq_head(name):
    j = json.load(open(os.path.join(LQUI, 'heads.json'), encoding='utf-8'))
    im = X.from_pil(Image.open(os.path.join(LQUI, 'heads.png')))
    x, y, w, h = j['frames'][f'head_{name}']
    return im[y:y + h, x:x + w]


def build_heads(ids):
    imgs = {}
    for nid in ids:
        src = ALIAS.get(nid, nid)
        imgs[nid] = lq_head(src) if src in ('mira', 'bram') else head_img(SPEC[src])
    uniq = [n for n in ids if n not in ALIAS]
    cols = 8
    sheet = X.blank(cols * 12, ((len(uniq) + cols - 1) // cols) * 12)
    frames, npcs = {}, {}
    for k, nid in enumerate(uniq):
        x, y = (k % cols) * 12, (k // cols) * 12
        X.paste(sheet, imgs[nid], x, y)
        frames[f'head_{nid}'] = [x, y, 12, 12]
    for nid in ids:
        npcs[nid] = f'head_{ALIAS.get(nid, nid)}'
    X.save_png(sheet, os.path.join(POR, 'npc_heads.png'))
    X.write_json(os.path.join(POR, 'npc_heads.json'), {
        'image': 'npc_heads.png', 'cell': [12, 12], 'origin': [0, 0], 'frameColor': '#14101e', 'backColor': '#251d34',
        'inner': [1, 1, 10, 10], 'frames': frames, 'npcs': npcs, 'sprite': {n: SPRITE[n] for n in ids},
        'notes': 'Target-frame / nameplate heads for every NPC in src/data/npcs.js, LQ ui/heads.png format: 12x12 '
                 'including a 1 px #14101e frame around a 10x10 head on #251d34; draw top-left at the slot. Look up '
                 'by npc id: npcs[<npc id>] -> frame name (lark_escort shares lark). head_mira / head_bram are LQ\'s '
                 'own; the rest are hand-pixeled 10x10 chibi heads in each NPC\'s field-sprite colours (front facing, '
                 'like LQ\'s party heads). Built by tools/art/build_npcs.py.'})
    return imgs


# ============================================================================================= portraits
def R4(name, *idx):
    return [X.color('%s:%d' % (name, i)) for i in idx]


BP.HAIR.update({'red': R4('roof_red', 1, 2, 3, 4), 'russet': R4('roof_red', 1, 2, 3, 4), 'navy': R4('ink', 1, 2, 3, 4),
                'plum': R4('hair_violet', 1, 2, 3, 4)})
PAINT = {
 'holt':    dict(skin='light', hair='brown', style='helm_round', under='short', hat=R4('metal', 0, 1, 2, 3), eye='blue',
                 top=R4('cloth_blue', 1, 2, 3, 4), sec=R4('gold', 1, 2, 3, 4), outfit='jerkin', masc=True),
 'sloe':    dict(skin='light', hair='plum', style='short', eye='violet', mask=R4('magic_violet', 0, 1, 2, 3),
                 top=R4('stone_cool', 0, 1, 2, 3), sec=R4('roof_purple', 1, 2, 3, 4), outfit='leather'),
 'oren':    dict(skin='light', hair='brown', style='chef', under='short', hat=R4('stone_warm', 3, 4, 5, 5) + [X.color('metal:4')],
                 beard='full', eye='brown', top=R4('earth', 1, 2, 3, 4), sec=R4('stone_warm', 3, 4, 5, 5), outfit='robe',
                 masc=True),
 'cobb':    dict(skin='light', hair='brown', style='hat_wide', under='short', hat=R4('sand', 0, 1, 2, 3), eye='brown',
                 top=R4('roof_green', 1, 2, 3, 4), sec=R4('earth', 1, 2, 3, 4), outfit='jerkin', masc=True),
 'lark':    dict(skin='light', hair='blonde', style='pony', eye='blue', top=R4('blossom', 0, 1, 2, 3),
                 sec=R4('cloth_blue', 1, 2, 3, 4), outfit='coat'),
 'wick':    dict(skin='light', hair='brown', style='short', eye='brown', top=R4('roof_red', 1, 2, 3, 4),
                 sec=R4('earth', 1, 2, 3, 4), outfit='coat', masc=True),
 'edda':    dict(skin='light', hair='grey', style='bun', eye='grey', top=R4('cloth_purple', 1, 2, 3, 4),
                 sec=R4('earth', 1, 2, 3, 4), outfit='robe', older=True),
 'penny':   dict(skin='dark', hair='black', style='long', eye='dark', top=R4('gold', 1, 2, 3, 4),
                 sec=R4('stone_warm', 3, 4, 5, 5), outfit='robe'),
 'quill':   dict(skin='light', hair='grey', style='bun', eye='grey', glasses=True, top=R4('roof_green', 1, 2, 3, 4),
                 sec=R4('gold', 1, 2, 3, 4), outfit='robe', masc=True, older=True),
 'brindle': dict(skin='light', hair='white', style='cap', under='none', hat=R4('stone_cool', 2, 3, 4, 5), beard='full',
                 eye='grey', top=R4('earth', 1, 2, 3, 4), sec=R4('stone_cool', 2, 3, 4, 5), outfit='jerkin', masc=True,
                 older=True),
 'tamsin':  dict(skin='light', hair='grey', style='bun', eye='brown', top=R4('stone_warm', 3, 4, 5, 5),
                 sec=R4('roof_red', 1, 2, 3, 4), outfit='robe', older=True),
 'odo':     dict(skin='light', hair='grey', style='bald', beard='short', eye='blue', top=R4('stone_cool', 1, 2, 3, 4),
                 sec=R4('gold', 1, 2, 3, 4), outfit='robe', masc=True, older=True),
 'sorrel':  dict(skin='light', hair='russet', style='short', beard='short', eye='brown', top=R4('earth', 1, 2, 3, 4),
                 sec=R4('roof_red', 2, 3, 4, 5), outfit='jerkin', masc=True),
}


def lq_portrait(name):
    j = json.load(open(os.path.join(LQS, 'portraits.json'), encoding='utf-8'))
    im = X.from_pil(Image.open(os.path.join(LQS, 'portraits.png')))
    x, y, w, h = j['frames'][j['portraits'][name]['32']]
    return im[y:y + h, x:x + w]


def build_portraits(ids):
    imgs, source = {}, {}
    for nid in ids:
        src = ALIAS.get(nid, nid)
        if src in imgs:
            imgs[nid] = imgs[src]
            continue
        if src in LQ_PORTRAIT:
            imgs[nid] = lq_portrait(src)
            source[src] = 'LQ portraits.png (%s_32), copied' % src
        else:
            imgs[nid] = BP.finish(BP.paint(PAINT[src]), 32)
            source[src] = 'painted (build_npcs.PAINT, build_portraits.paint) in the field sprite colours'
    uniq = [n for n in ids if n not in ALIAS]
    cols = 8
    sheet = X.blank(cols * 32, ((len(uniq) + cols - 1) // cols) * 32)
    frames, npcs = {}, {}
    for k, nid in enumerate(uniq):
        x, y = (k % cols) * 32, (k // cols) * 32
        X.paste(sheet, imgs[nid], x, y)
        frames[f'{nid}_32'] = [x, y, 32, 32]
    for nid in ids:
        npcs[nid] = f'{ALIAS.get(nid, nid)}_32'
    X.save_png(sheet, os.path.join(POR, 'npc_portraits.png'))
    X.write_json(os.path.join(POR, 'npc_portraits.json'), {
        'image': 'npc_portraits.png', 'frames': frames, 'npcs': npcs, 'sprite': {n: SPRITE[n] for n in ids},
        'sources': source,
        'notes': 'Dialog-window portraits for every NPC in src/data/npcs.js, 32x32 like LQ\'s <name>_32 (bevel '
                 'included). Look up by npc id: npcs[<npc id>] -> frame name (<id>_32; lark_escort shares lark). '
                 'Same frame naming as assets/ui/portraits.json, so ui gfx.portrait(ctx, id, x, y, 32) works once this '
                 'atlas is merged into (or tried before) art.portraits. Built by tools/art/build_npcs.py.'})
    return imgs


# =============================================================================================== preview
def preview(ids, meta, sheet, heads, ports):
    pj = json.load(open(os.path.join(X.ROOT, 'assets', 'sprites', 'lq', 'party_field.json'), encoding='utf-8'))
    pa = np.array(Image.open(os.path.join(X.ROOT, 'assets', 'sprites', 'lq', 'party_field.png')).convert('RGBA'))
    S = 3
    font = ImageFont.load_default()
    uniq = [n for n in ids if n not in ALIAS]
    cw, ch = 24 * S + 12 * S + 32 * S + 24 * S * 2 + 50, 34 * S + 14
    cols = 4
    out = Image.new('RGB', (cw * cols + 10, ch * ((len(uniq) + cols - 1) // cols) + 24), (90, 132, 60))
    d = ImageDraw.Draw(out)
    d.text((6, 4), 'every NPC at 3x: field sprite (down, left), 12x12 head, 32x32 portrait. Grass = the game ground.',
           fill=(250, 250, 230), font=font)
    for k, nid in enumerate(uniq):
        x, y = 6 + (k % cols) * cw, 22 + (k // cols) * ch
        key = SPRITE[nid]
        for j2, dd in enumerate(('down', 'left')):
            fr = field_frame(meta, sheet, (pj, pa), key, dd)
            t = Image.fromarray(fr, 'RGBA').resize((fr.shape[1] * S, fr.shape[0] * S), Image.NEAREST)
            out.paste(t, (x + j2 * (24 * S), y), t)
        hx0 = x + 48 * S + 4
        out.paste(X.upscale(heads[nid], S), (hx0, y + 4))
        out.paste(X.upscale(ports[nid], S), (hx0 + 12 * S + 6, y))
        d.text((hx0, y + 12 * S + 10), nid, fill=(250, 250, 230), font=font)
        d.text((hx0, y + 12 * S + 22), key, fill=(225, 235, 200), font=font)
    out.save(os.path.join(X.OUT, 'polish_npcs.png'))
    # 1x strip on the HUD blue: heads and portraits at true size
    strip = Image.new('RGB', (len(uniq) * 36 + 8, 60), (29, 42, 103))
    for k, nid in enumerate(uniq):
        strip.paste(X.to_pil(heads[nid]), (4 + k * 36, 4))
        strip.paste(X.to_pil(ports[nid]), (4 + k * 36, 22))
    strip.save(os.path.join(X.OUT, 'polish_npcs_1x.png'))


def npc_ids():
    """ids in src/data/npcs.js order (parsed, so a new NPC shows up as a KeyError here, not silently)"""
    import re
    src = open(os.path.join(X.ROOT, 'src', 'data', 'npcs.js'), encoding='utf-8').read()
    return re.findall(r"^\s{2}(\w+): \{\s*$", src, re.M)


def main():
    ids = npc_ids()
    missing = [n for n in ids if n not in SPRITE]
    assert not missing, f'NPCs with no art spec: {missing}'
    os.makedirs(POR, exist_ok=True)
    meta, sheet = build_field()
    heads = build_heads(ids)
    ports = build_portraits(ids)
    preview(ids, meta, sheet, heads, ports)
    print('npcs:', len(ids), 'ids,', len(NEW), 'field sprites added, heads + portraits')


if __name__ == '__main__':
    main()
