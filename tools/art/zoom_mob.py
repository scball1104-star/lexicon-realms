"""zoom_mob.py <atlas path under assets/sprites/mobs without .json> [frame names...] -> out/_zoom_mob.png at Z (6)x.
No names: idle/walk/attack of down, left, up."""
import sys, json, os
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
mid = sys.argv[1]
root = os.path.join(here, '..', '..', 'assets', 'sprites', 'mobs')
im = Image.open(os.path.join(root, mid + '.png')).convert('RGBA')
js = json.load(open(os.path.join(root, mid + '.json')))
names = sys.argv[2:] or [f'{a}_{d}_{i}' for d in ('down', 'left', 'up') for a, n in (('idle', 1), ('walk', 4), ('attack', 3), ('hurt', 1)) for i in range(n)]
S = int(os.environ.get('Z', 6))
W, H = js['cell']
cols = int(os.environ.get('C', 9))
rows = (len(names) + cols - 1) // cols
out = Image.new('RGBA', (cols * W * S, rows * H * S), (70, 110, 60, 255))
for k, n in enumerate(names):
    x, y, w, h = js['frames'][n]
    t = im.crop((x, y, x + w, y + h)).resize((w * S, h * S), Image.NEAREST)
    out.paste(t, ((k % cols) * W * S, (k // cols) * H * S), t)
out.save(os.path.join(here, 'out', '_zoom_mob.png'))
