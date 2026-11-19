"""zoom.py <class> <frame names...> -> out/_zoom.png at 8x (a quick look tool)"""
import sys, json, os
from PIL import Image
here = os.path.dirname(os.path.abspath(__file__))
cls = sys.argv[1]
root = os.path.join(here, '..', '..', 'assets', 'sprites', 'chars')
im = Image.open(os.path.join(root, cls + '.png')).convert('RGBA')
js = json.load(open(os.path.join(root, cls + '.json')))
names = sys.argv[2:]
S = int(os.environ.get('Z', 8))
out = Image.new('RGBA', (len(names) * 32 * S, 40 * S), (70, 110, 60, 255))
for k, n in enumerate(names):
    x, y, w, h = js['frames'][n]
    t = im.crop((x, y, x + w, y + h)).resize((w * S, h * S), Image.NEAREST)
    out.paste(t, (k * 32 * S, 0), t)
out.save(os.path.join(here, 'out', '_zoom.png'))
