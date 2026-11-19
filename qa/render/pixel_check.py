"""Pixel integrity: every 3x3 block of a 1920x1080 shot (base scale 3, zoom 1) must be one colour.
    python qa/render/pixel_check.py qa/out/render/*.png     prints RENDER_PIXELS: <file> blocks=<n> mixed=<n>"""
import sys
import numpy as np
from PIL import Image

bad_total = 0
for p in sys.argv[1:]:
    a = np.asarray(Image.open(p).convert('RGB')).astype(np.int16)
    h, w = a.shape[0] // 3 * 3, a.shape[1] // 3 * 3
    b = a[:h, :w].reshape(h // 3, 3, w // 3, 3, 3)
    ref = b[:, :1, :, :1, :]
    mixed = int(np.any(np.abs(b - ref) > 0, axis=(1, 3, 4)).sum())
    bad_total += mixed
    print(f'RENDER_PIXELS: {p} blocks={(h // 3) * (w // 3)} mixed={mixed}')
sys.exit(1 if bad_total else 0)
