"""Before/after of the four talent glyphs reworked in the 2026-11-19 polish pass -> out/polish_icons.png.

Reads the BEFORE icons from out/_before/icons/talents16.png (a copy of the sheet taken before the pass) and the AFTER
icons from assets/icons/talents16.png, by talent id, at 1x and 6x, on the HUD window blue. Deterministic.
    python tools/art/polish_icons_preview.py
"""
import os, json
from PIL import Image, ImageDraw, ImageFont
import lrpix as X

IDS = ['bell_bell_hum', 'bell_alarm_bell', 'hearth_many_names', 'blot_ink_veins', 'oathblade_sword_sworn']
BEFORE = os.path.join(X.OUT, '_before', 'icons')
AFTER = os.path.join(X.ROOT, 'assets', 'icons')


def load(root):
    j = json.load(open(os.path.join(root, 'talents16.json')))
    return Image.open(os.path.join(root, 'talents16.png')).convert('RGBA'), j['frames']


def find(frames, tid):
    for k in frames:
        if k == tid or k.endswith('_' + tid) or k.endswith(tid):
            return k
    return None


def main():
    bi, bf = load(BEFORE)
    ai, af = load(AFTER)
    S = 6
    font = ImageFont.load_default()
    cw = 16 * S * 2 + 16 * 2 + 60
    out = Image.new('RGB', (cw * len(IDS) + 10, 16 * S + 70), (29, 42, 103))
    d = ImageDraw.Draw(out)
    d.text((6, 4), 'talent glyphs, before | after, at 6x and 1x (HUD blue)', fill=(240, 240, 220), font=font)
    for k, tid in enumerate(IDS):
        x = 6 + k * cw
        for j, (im, fr) in enumerate(((bi, bf), (ai, af))):
            key = find(fr, tid)
            if not key:
                d.text((x, 30), 'missing ' + tid, fill=(255, 120, 120), font=font)
                continue
            fx, fy, fw, fh = fr[key]
            t = im.crop((fx, fy, fx + fw, fy + fh))
            out.paste(t.resize((fw * S, fh * S), Image.NEAREST), (x + j * (16 * S + 8), 20), t.resize((fw * S, fh * S), Image.NEAREST))
            out.paste(t, (x + j * 20, 20 + 16 * S + 6), t)
        d.text((x, 16 * S + 50), tid, fill=(240, 240, 220), font=font)
    out.save(os.path.join(X.OUT, 'polish_icons.png'))
    print('polish_icons.png')


if __name__ == '__main__':
    main()
