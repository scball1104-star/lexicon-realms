r"""Build the Lexicon Realms title logo (assets/ui/logo_realms.png) in Lexicon Quest's logo style.

    python qa/ui/make_logo.py [--font georgiab.ttf] [--preview out.png]

"LEXICON" is cropped unchanged from Lexicon Quest's own logo (Scott's art, D:\LexiconQuest READ ONLY).
"REALMS" is new: Cambria Bold rasterised 1-bit at the same cap height, then painted with the LQ logo's exact
row palette (outline, brown rim, white highlight, cream to gold to orange bands, 4-row soft drop shadow).
"""
import argparse, os
from PIL import Image, ImageDraw, ImageFont

LQ = r'D:\LexiconQuest\next\assets\ui\logo.png'
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
INK = (20, 16, 30, 255); RIM = (72, 40, 38, 255); SHADOW = (20, 16, 30, 150); HI = (246, 244, 238, 255)
# interior colour by row offset from the letter top (row 0 = first rim row), measured from the LQ logo
BANDS = [((255, 247, 214, 255), 5), ((249, 215, 122, 255), 8), ((235, 161, 77, 255), 3), ((195, 131, 52, 255), 5),
         ((235, 161, 77, 255), 6), ((143, 85, 51, 255), 1)]


def band(r):
    for col, n in BANDS:
        if r < n: return col
        r -= n
    return BANDS[-1][0]


def word(text, font_path, cap):
    size = cap
    for _ in range(40):                               # find a font size whose cap height is `cap`
        f = ImageFont.truetype(font_path, size)
        bb = f.getbbox('E')
        if bb[3] - bb[1] >= cap: break
        size += 1
    bb = f.getbbox(text)
    w, h = bb[2] - bb[0] + 4, bb[3] - bb[1] + 4
    m = Image.new('L', (w, h), 0)
    ImageDraw.Draw(m).text((2 - bb[0], 2 - bb[1]), text, font=f, fill=255)
    return m.point(lambda v: 255 if v >= 128 else 0)


def paint(mask, track=0):
    w, h = mask.size
    M = mask.load()
    inside = lambda x, y: 0 <= x < w and 0 <= y < h and M[x, y]
    pad = 6
    out = Image.new('RGBA', (w + pad * 2, h + pad * 2), (0, 0, 0, 0))
    O = out.load()
    top = min(y for y in range(h) for x in range(w) if M[x, y])
    # shadow (4 rows under, soft)
    for y in range(h):
        for x in range(w):
            if not M[x, y]: continue
            for dy in range(2, 6):
                for dx in (-1, 0, 1):
                    X, Y = x + pad + dx, y + pad + dy
                    if O[X, Y][3] == 0: O[X, Y] = SHADOW
    # outline
    for y in range(h):
        for x in range(w):
            if not M[x, y]: continue
            for dx in (-1, 0, 1):
                for dy in (-1, 0, 1):
                    if not inside(x + dx, y + dy): O[x + pad + dx, y + pad + dy] = INK
    # body
    for y in range(h):
        for x in range(w):
            if not M[x, y]: continue
            edge = any(not inside(x + dx, y + dy) for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))
            if edge: c = RIM
            elif not inside(x, y - 2) or (inside(x, y - 1) and not inside(x, y - 2)): c = HI
            else: c = band(y - top - 1)
            O[x + pad, y + pad] = c
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--font', default=r'C:/Windows/Fonts/cambriab.ttf')
    ap.add_argument('--out', default=os.path.join(ROOT, 'assets', 'ui', 'logo_realms.png'))
    ap.add_argument('--preview', default=None)
    a = ap.parse_args()
    lq = Image.open(LQ).convert('RGBA')
    lexicon = lq.crop((1, 1, 154, 59))                 # "LEXICON", untouched
    realms = paint(word('REALMS', a.font, 29))
    rb = realms.getbbox()
    realms = realms.crop(rb)
    lb = lexicon.getbbox(); lexicon = lexicon.crop(lb)
    gap = 7                                           # one line, like Lexicon Quest's own logo
    W = lexicon.width + gap + realms.width
    H = max(lexicon.height, realms.height)
    logo = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    logo.alpha_composite(lexicon, (0, H - lexicon.height))
    logo.alpha_composite(realms, (lexicon.width + gap, H - realms.height))
    logo.save(a.out)
    print('LOGO_DONE:', a.out, logo.size)
    if a.preview:
        bg = Image.new('RGBA', (W + 20, H + 20), (37, 40, 70, 255)); bg.alpha_composite(logo, (10, 10))
        bg.resize((bg.width * 4, bg.height * 4), Image.NEAREST).save(a.preview)


if __name__ == '__main__':
    main()
