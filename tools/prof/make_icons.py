# Profession item icons (professions build step 1): assets/icons/prof16.png + .json, 16x16 in the items16 style (the
# neutral slate frame, a dark-outlined sprite). Code-drawn pixel art: each item names a shape and two colours in
# src/data/professions.js (`art`, iconSpecs()); this script reads them through node and draws.
#
#   python tools/prof/make_icons.py
import json, os, subprocess, sys
from PIL import Image

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.normpath(os.path.join(HERE, '..', '..'))
OUT_PNG = os.path.join(ROOT, 'assets', 'icons', 'prof16.png')
OUT_JSON = os.path.join(ROOT, 'assets', 'icons', 'prof16.json')

# 12x12 sprites. a = main colour, b = light, d = dark shade of main, w = white, k = outline (also added round every shape)
SHAPES = {
    'ore': [
        '............', '....kkkk....', '...kdaaak...', '..kdabaadk..', '.kddaaabadk.', '.kdaabdaaak.',
        '.kdbaaadbak.', '.kddaabaadk.', '..kddaaddk..', '...kkddkk...', '.....kk.....', '............'],
    'bar': [
        '............', '............', '....kkkkkk..', '...kbbbbbbk.', '..kbbbbbbak.', '.kkkkkkkkak.',
        '.kaaaaaaakk.', '.kaaaaaadk..', '.kddddddk...', '..kkkkkk....', '............', '............'],
    'stone': [
        '............', '............', '....kkkk....', '..kkbbaakk..', '.kbbaaaaadk.', '.kbaaaaaadk.',
        '.kaaaaaaddk.', '.kdaaaaddk..', '..kddddkk...', '...kkkk.....', '............', '............'],
    'sand': [
        '............', '............', '............', '.....kk.....', '....kbbk....', '...kbaabk...',
        '..kbaabaak..', '.kbaaaaaabk.', '.kaaabaaadk.', 'kdddddddddk.', '.kkkkkkkkk..', '............'],
    'herb': [
        '............', '.....kk.....', '....kbbk.kk.', '...kbaak.kbk', '.kk.kaak.kak', 'kbak.kak.kak',
        'kaak.kak.kk.', '.kaakdakk...', '..kkdddk....', '....kdk.....', '....kdk.....', '.....k......'],
    'gem': [
        '............', '....kkkk....', '...kbwbak...', '..kbwbbaak..', '.kbbbbaaadk.', '.kaaaaaaadk.',
        '..kaaaaadk..', '...kaaadk...', '....kadk....', '.....kk.....', '............', '............'],
    'vial': [
        '............', '.....kk.....', '....kwwk....', '....kkkk....', '....kwbk....', '...kwbbbk...',
        '...kwbbbk...', '...kbbbbk...', '...kbbbbk...', '....kkkk....', '............', '............'],
    'potion': [
        '............', '.....kk.....', '....kddk....', '....kkkk....', '....kwbk....', '...kwbbbk...',
        '..kwaaaaak..', '..kaaaaaak..', '..kaaaaadk..', '..kdaaaddk..', '...kkkkkk...', '............'],
    'elixir': [
        '.....kk.....', '....kddk....', '....kkkk....', '....kwbk....', '....kwbk....', '....kbak....',
        '...kwaaak...', '...kaaaak...', '...kaaaak...', '...kaaadk...', '...kdddddk..', '....kkkkk...'],
    'flask': [
        '............', '....kkkk....', '....kddk....', '..kkkkkkkk..', '.kwbbbbbbbk.', '.kwaaaaaaak.',
        '.kbaabbaaak.', '.kaabwwbaak.', '.kaaabbaadk.', '.kdaaaaaddk.', '..kkkkkkkk..', '............'],
    'meat': [
        '............', '............', '...kkkkk....', '..kbbaaak...', '.kbaaaaaak..', '.kaaaabaaakk',
        '.kaabbaaadkw', '.kdaaaaaddkw', '..kddaddk.kk', '...kkkkk....', '............', '............'],
    'food': [
        '............', '............', '....kkkk....', '...kbbbbk...', '..kbaabbak..', '..kaabaaak..',
        '.kkkkkkkkkk.', 'kwwwwwwwwwwk', '.kdddddddk..', '..kkkkkkk...', '............', '............'],
    'feast': [
        '............', '...kk..kk...', '..kbak.kbk..', '.kbaaakbak..', '.kaabaakak..', '.kaaaadkkk..',
        'kkkkkkkkkkk.', 'kwwwwwwwwwk.', 'kdddddddddk.', '.kkkkkkkkk..', '............', '............'],
    'bandage': [
        '............', '............', '...kkkkkk...', '..kwwwwwbk..', '.kwaaaaaabk.', '.kwwwwwwwbk.',
        '.kwaaaaaabk.', '.kwwwwwwwbk.', '..kbbbbbbk..', '...kkkkkk...', '............', '............'],
    'pattern': [
        '............', '.kkkkkkkkk..', 'kbbbbbbbbbk.', 'kbkkkkkkkbk.', '.kbbbbbbbk..', '.kbaaaaabk..',
        '.kbbbbbbbk..', '.kbaaaabbk..', '.kbbbbbbbk..', 'kbkkkkkkkbk.', 'kbbbbbbbbbk.', '.kkkkkkkkk..'],
    'whet': [
        '............', '............', '............', '.......kkk..', '.....kkbbak.', '...kkbbaadk.',
        '.kkbbaaadk..', 'kbbaaaddk...', 'kaaaddkk....', '.kddkk......', '..kk........', '............'],
    'jar': [
        '............', '...kkkkkk...', '...kddddk...', '..kkkkkkkk..', '..kwbbbbak..', '..kbaaaaak..',
        '..kbaaaaak..', '..kaaaaaak..', '..kaaaaadk..', '..kdddddddk.', '...kkkkkk...', '............'],
    'sack': [
        '............', '....k..k....', '....kkkk....', '...kbbbbk...', '...kkddkk...', '..kbbbbaak..',
        '.kbbbbaaaak.', '.kbbbaaaaak.', '.kbaaaaaadk.', '.kdaaaaaddk.', '..kkkkkkkk..', '............'],
    'oil': [
        '............', '......kk....', '.....kddk...', '....kkkkkk..', '...kwbbbbak.', '..kwbaaaaak.',
        '..kbaaaaaak.', '..kaaaaaadk.', '..kaaaaaddk.', '...kddddkk..', '....kkkk....', '............'],
    'pick': [
        '............', '..kkkkkkk...', '.kbbbbbbbbk.', 'kbk.kddk.kbk', '.k..kddk..k.', '....kddk....',
        '....kddk....', '....kddk....', '....kddk....', '....kddk....', '....kddk....', '.....kk.....'],
    'sickle': [
        '............', '.....kkkk...', '....kbbbbk..', '...kbk..kbk.', '...kk....kb.', '.........kbk',
        '........kbk.', '...k..kkbk..', '..kdkkkkk...', '.kdk........', 'kdk.........', '.k..........'],
    'anvil': [
        '............', '............', 'kkkkkkkkkk..', 'kbbbbbbbbbkk', '.kaaaaaaaaak', '..kkaaaakk..',
        '....kaak....', '....kaak....', '...kaaaak...', '..kaaaaaak..', '..kkkkkkkk..', '............'],
    'book': [
        '............', '.kkkkkkkkk..', 'kaaaaaaaabk.', 'kabbbbbbabk.', 'kabaaaabab.k', 'kabbbbbbabk.',
        'kaaaaaaaabk.', 'kaaaaaaaabk.', 'kaaaaaaaabk.', 'kddddddddwk.', '.kkkkkkkkk..', '............'],
    # build step 2
    'hide': [
        '............', '.kk......kk.', 'kbak....kabk', '.kaakkkkaak.', '..kaabbaak..', '..kabaaabk..',
        '..kaaaaaak..', '..kaabaaak..', '.kaaaaaadak.', 'kbak.kk.kabk', '.kk......kk.', '............'],
    'cloth': [
        '............', '............', '.kkkkkkkkk..', 'kbbbbbbbbbk.', 'kaaaaaaaaak.', '.kaaaaaaaaak',
        '.kbbbbbbbbbk', 'kaaaaaaaaak.', 'kdddddddddk.', '.kkkkkkkkk..', '............', '............'],
    'bolt': [
        '............', '............', '...kkkkkk...', '..kbbbbbbk..', '.kbaaaaaabk.', '.kaaaaaaaak.',
        '.kaaaaaaaak.', '.kdaaaaaadk.', '..kddddddk..', '...kkkkkk...', '............', '............'],
    'fish': [
        '............', '............', '....kkkk....', '..kkbbbbk.k.', '.kbaaaaabkbk', 'kwkaaaaaaakk',
        'kaaaabaaaakk', '.kdaaaaadkbk', '..kkddddk.k.', '....kkkk....', '............', '............'],
    'scroll': [
        '............', '..kkkkkkkk..', '.kwbbbbbbwk.', '..kbaaaabk..', '..kbbbbbbk..', '..kbaaabbk..',
        '..kbbbbbbk..', '..kbaaaabk..', '..kbbbbbbk..', '.kwbbbbbbwk.', '..kkkkkkkk..', '............'],
    'bag': [
        '............', '....kkkk....', '...kd..dk...', '..kkkkkkkk..', '.kbbbbbbbbk.', '.kaaaaaaaak.',
        '.kaaawwaaak.', '.kaaawwaaak.', '.kaaaaaaaak.', '.kdddddddak.', '..kkkkkkkk..', '............'],
    'quiver': [
        '..w..w..w...', '..k..k..k...', '..kk.k.kk...', '..kakkkak...', '..kbaaabk...', '..kaaaaak...',
        '..kaabaak...', '..kaaaaak...', '..kaabaak...', '..kdaaadk...', '...kkkkk....', '............'],
    'patch': [
        '............', '..kkkkkkkk..', '.kbwbwbwbwk.', '.kwaaaaaabk.', '.kbabbbbawk.', '.kwabaababk.',
        '.kbabaababk.', '.kwabbbbabk.', '.kbaaaaaawk.', '.kwbwbwbwbk.', '..kkkkkkkk..', '............'],
    'knife': [
        '............', '.........kk.', '........kwk.', '.......kwbk.', '......kwbk..', '.....kwbk...',
        '....kwbk....', '..kkkbk.....', '..kaakk.....', '.kaak.......', '.kdk........', '..k.........'],
}

OUTLINE = (0x14, 0x10, 0x1e, 255)


def hex2rgb(h):
    h = h.lstrip('#')
    return tuple(int(h[i:i + 2], 16) for i in (0, 2, 4))


def shade(rgb, k):
    return tuple(max(0, min(255, int(c * k))) for c in rgb)


def frame_cell():
    im = Image.new('RGBA', (16, 16), OUTLINE)
    px = im.load()
    top, bot = hex2rgb('#403c58'), hex2rgb('#261f37')
    for y in range(16):
        for x in range(16):
            if x == 0 or y == 0 or x == 15 or y == 15:
                continue
            if y == 1 or x == 1:
                px[x, y] = (0xb3, 0xb6, 0xc4, 255)
            elif y == 14 or x == 14:
                px[x, y] = (0x4c, 0x44, 0x5c, 255)
            else:
                t = (y - 2) / 11
                px[x, y] = tuple(int(top[i] + (bot[i] - top[i]) * t) for i in range(3)) + (255,)
    px[1, 14] = px[14, 1] = (0x8e, 0x89, 0x97, 255)
    return im


def draw(shape, c1, c2):
    im = frame_cell()
    px = im.load()
    a, b = hex2rgb(c1), hex2rgb(c2)
    pal = {'a': a, 'b': b, 'd': shade(a, 0.62), 'w': (0xff, 0xff, 0xf4), 'k': OUTLINE[:3]}
    rows = SHAPES.get(shape) or SHAPES['stone']
    filled = set()
    for y, row in enumerate(rows):
        for x, ch in enumerate(row):
            if ch == '.':
                continue
            px[x + 2, y + 2] = pal[ch] + (255,)
            if ch != 'k':
                filled.add((x + 2, y + 2))
    # a dark outline round every coloured pixel (the items16 look)
    for (x, y) in list(filled):
        for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            q = (x + dx, y + dy)
            if 2 <= q[0] <= 13 and 2 <= q[1] <= 13 and q not in filled:
                px[q] = OUTLINE
    return im


def main():
    specs = json.loads(subprocess.run(
        ['node', '-e', "import('./src/data/professions.js').then((m) => process.stdout.write(JSON.stringify(m.iconSpecs())))"],
        cwd=ROOT, capture_output=True, text=True, timeout=60, check=True).stdout)
    names = sorted(specs)
    cols = 16
    rows = (len(names) + cols - 1) // cols
    sheet = Image.new('RGBA', (cols * 16, rows * 16), (0, 0, 0, 0))
    frames = {}
    for i, n in enumerate(names):
        shape, c1, c2 = specs[n]
        x, y = (i % cols) * 16, (i // cols) * 16
        sheet.paste(draw(shape, c1, c2), (x, y))
        frames[n] = [x, y, 16, 16]
    sheet.save(OUT_PNG)
    with open(OUT_JSON, 'w', newline='\n') as f:
        json.dump({'image': 'prof16.png', 'size': [16, 16], 'frames': frames,
                   'note': 'GENERATED by tools/prof/make_icons.py: profession items (code-drawn, PLACEHOLDER art).'}, f, indent=1)
    print(f'prof16: {len(names)} icons -> {OUT_PNG}')


if __name__ == '__main__':
    sys.exit(main())
