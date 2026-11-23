"""Build assets3d/ from the CC0 packs on this PC (no downloads). Re-run after changing the inventory below.

    python assets3d/_build/build_assets3d.py

Copies only the glTF files the 3D renderer uses, shrinks every texture (Pillow: resize, JPEG for opaque maps, PNG for
maps with real alpha) into one shared folder assets3d/tex/, rewrites each .gltf to point there, cuts the Universal
Animation Library down to the clips the game plays (rotations only, plus the pelvis and root positions), and writes
assets3d/manifest.json and assets3d/LICENSES.md (every file, its source pack and its license).
"""
import json, os, shutil, struct
from PIL import Image

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
OUT = os.path.join(ROOT, 'assets3d')
HERO = r'D:\LQOnline\mockups3d_hero\vendor'
POLY = r'D:\LQOnline\mockups3d_b\vendor\quaternius_polypizza'
ITCH = r'D:\LQOnline\vendor_itch\x'

PACKS = {
    'ubc': ('Universal Base Characters (Quaternius, free tier)', 'Universal Base Characters', 'CC0 1.0'),
    'hair': ('Universal Base Characters (Quaternius, free tier): hair', 'Universal Base Characters', 'CC0 1.0'),
    'mco': ('Modular Character Outfits - Fantasy (Quaternius, free tier)', 'Modular Character Outfits - Fantasy', 'CC0 1.0'),
    'props': ('Fantasy Props MegaKit (Quaternius, free tier)', 'Fantasy Props MegaKit', 'CC0 1.0'),
    'village': ('Medieval Village MegaKit (Quaternius, free tier)', 'Medieval Village MegaKit', 'CC0 1.0'),
    'nature': ('Stylized Nature MegaKit (Quaternius, free tier)', 'Stylized Nature MegaKit', 'CC0 1.0'),
    'ual': ('Universal Animation Library (Quaternius, free tier)', 'Universal Animation Library', 'CC0 1.0'),
    'animals': ('Quaternius Animated Animal Pack via poly.pizza', None, 'CC0 1.0'),
    'monsters': ('Quaternius Ultimate Monsters Bundle via poly.pizza', None, 'CC0 1.0'),
    'dungeon': ('Fantasy Props MegaKit (Quaternius, free tier): dungeon props', 'Fantasy Props MegaKit', 'CC0 1.0'),
    'cave': ('Stylized Nature MegaKit (Quaternius, free tier): cave props', 'Stylized Nature MegaKit', 'CC0 1.0'),
}

INV = {
    'ubc': ['Superhero_Male_FullBody', 'Superhero_Female_FullBody'],
    'hair': ['Hair_SimpleParted', 'Hair_Beard', 'Hair_Buns', 'Hair_Long', 'Hair_Buzzed', 'Hair_BuzzedFemale'],
    'mco': [s + '_' + o + '_' + p for s in ('Male', 'Female') for o in ('Peasant', 'Ranger') for p in ('Body', 'Arms', 'Legs')]
           + ['Male_Peasant_Feet', 'Female_Peasant_Feet', 'Male_Ranger_Feet_Boots', 'Female_Ranger_Feet',
              'Male_Ranger_Head_Hood', 'Female_Ranger_Head_Hood', 'Male_Ranger_Acc_Pauldron', 'Female_Ranger_Acc_Pauldrons'],
    'props': ['Sword_Bronze', 'Shield_Wooden', 'Book_7', 'Barrel', 'Barrel_Apples', 'Crate_Wooden', 'Stall_Cart_Empty',
              'Stall_Empty', 'Bench', 'Bag', 'Anvil', 'Chest_Wood', 'Bucket_Wooden_1', 'FarmCrate_Apple', 'Banner_1'],
    'village': ['Wall_UnevenBrick_Straight', 'Wall_UnevenBrick_Window_Wide_Round', 'Wall_UnevenBrick_Door_Round',
                'Wall_Plaster_Straight', 'Wall_Plaster_Window_Wide_Flat', 'Wall_Plaster_WoodGrid', 'Wall_Plaster_Door_Round',
                'Wall_Plaster_Window_Wide_Round', 'Corner_Exterior_Wood', 'Corner_Exterior_Brick', 'Window_Wide_Round1',
                'Window_Wide_Flat1', 'Door_1_Round', 'Roof_RoundTiles_4x4', 'Roof_RoundTiles_4x6', 'Roof_RoundTiles_4x8',
                'Roof_RoundTiles_6x6', 'Roof_RoundTiles_6x8', 'Roof_RoundTiles_6x10', 'Roof_RoundTiles_8x8',
                'Roof_RoundTiles_8x10', 'Roof_RoundTiles_8x12', 'Roof_Tower_RoundTiles', 'Floor_UnevenBrick', 'Floor_WoodDark',
                'Prop_WoodenFence_Single', 'Prop_Wagon', 'Prop_Chimney', 'Prop_Crate'],
    'nature': ['CommonTree_%d' % i for i in range(1, 6)] + ['Pine_%d' % i for i in range(1, 6)]
              + ['TwistedTree_1', 'TwistedTree_3', 'DeadTree_1', 'DeadTree_3', 'Bush_Common', 'Bush_Common_Flowers',
                 'Rock_Medium_1', 'Rock_Medium_2', 'Rock_Medium_3', 'Pebble_Round_1', 'Pebble_Round_3',
                 'Grass_Common_Short', 'Grass_Wispy_Tall', 'Flower_3_Group', 'Flower_4_Group', 'Fern_1'],
}
# Dungeons and caves (render lane, 2026-11-22): straight from the itch kits on this PC (CC0), into dungeon/ and cave/.
# `python assets3d/_build/build_assets3d.py --dungeon` adds only these to the current folder (no full rebuild).
ITCH_INV = {
    'dungeon': ('Fantasy Props MegaKit/Exports/glTF', ['Torch_Metal', 'CandleStick_Triple', 'CandleStick_Stand', 'Vase_2', 'Vase_4',
                                                     'Vase_Rubble_Medium', 'Coin_Pile', 'Coin_Pile_2', 'Chain_Coil', 'Cage_Small', 'Chalice']),
    'cave': ('Stylized Nature MegaKit/glTF', ['Mushroom_Common', 'Mushroom_Laetiporus']),
}
ANIMALS = {'Wolf': 'Animated-Animal-Pack/Wolf_P1gU3Qkr9r.glb', 'Deer': 'Animated-Animal-Pack/Deer_T6Cs7tmMHJ.glb',
           'Horse': 'Animated-Animal-Pack/Horse_qvTrSG9pZF.glb', 'Stag': 'Animated-Animal-Pack/Stag_tQdzbZ1Cmw.glb'}   # mounts 2026-11-22
ANIMAL_PAGES = {'Wolf': 'https://poly.pizza/m/P1gU3Qkr9r', 'Deer': 'https://poly.pizza/m/T6Cs7tmMHJ',
                'Horse': 'https://poly.pizza/m/qvTrSG9pZF', 'Stag': 'https://poly.pizza/m/tQdzbZ1Cmw'}
# CC0 monsters (poly.pizza). Only the Ghost Skull: the Orc models of that bundle are left out by Scott's decision.
MONSTERS = {'Ghost_Skull': 'Ultimate-Monsters-Bundle/Ghost_Skull_TX8r9WBXpe.glb'}
MONSTER_PAGES = {'Ghost_Skull': 'https://poly.pizza/m/TX8r9WBXpe'}
CLIPS = ['Idle_Loop', 'Walk_Loop', 'Jog_Fwd_Loop', 'Sword_Attack', 'Sword_Idle', 'Spell_Simple_Shoot',
         'Spell_Simple_Idle_Loop', 'Hit_Chest', 'Death01', 'Sitting_Idle_Loop', 'Punch_Jab', 'Punch_Cross',
         'Crouch_Idle_Loop', 'Crouch_Fwd_Loop', 'Idle_Torch_Loop', 'Pistol_Aim_Neutral', 'Pistol_Shoot', 'Idle_Talking_Loop']

CHAR_TEX = ('T_Peasant', 'T_Ranger', 'T_Superhero', 'T_Regular')


def tex_rule(n):
    if 'Eye' in n:
        return 128
    if 'Normal' in n:
        return 512 if n.startswith(CHAR_TEX) or n.startswith('T_Hair') else 256
    if 'ORM' in n or 'Roughness' in n:
        return 256
    if n.startswith(CHAR_TEX) or n.startswith('T_Trim_'):
        return 1024
    return 512


done_tex = {}
files = []   # (relpath, source, pack)


def add_file(rel, src, pack):
    files.append((rel.replace('\\', '/'), src, pack))


def convert_image(src, pack):
    base = os.path.splitext(os.path.basename(src))[0]
    if base in done_tex:
        return done_tex[base]
    im = Image.open(src)
    alpha = False
    if im.mode in ('RGBA', 'LA', 'P'):
        im = im.convert('RGBA')
        alpha = im.getchannel('A').getextrema()[0] < 250
    size = tex_rule(base)
    w, h = im.size
    if max(w, h) > size:
        k = size / max(w, h)
        im = im.resize((max(1, round(w * k)), max(1, round(h * k))), Image.LANCZOS)
    os.makedirs(os.path.join(OUT, 'tex'), exist_ok=True)
    if alpha:
        rel = 'tex/' + base + '.png'
        im.save(os.path.join(OUT, rel), optimize=True)
        mime = 'image/png'
    else:
        rel = 'tex/' + base + '.jpg'
        im.convert('RGB').save(os.path.join(OUT, rel), quality=90 if 'Normal' in base else 85, optimize=True)
        mime = 'image/jpeg'
    add_file(rel, src, pack)
    done_tex[base] = (rel, mime)
    return done_tex[base]


def texture_indices(o, acc):
    if isinstance(o, dict):
        for k, v in o.items():
            if k.endswith('Texture') and isinstance(v, dict) and 'index' in v:
                acc.add(v['index'])
            texture_indices(v, acc)
    elif isinstance(o, list):
        for v in o:
            texture_indices(v, acc)
    return acc


def copy_gltf(pack, name, sdir=None):
    sdir = sdir or os.path.join(HERO, pack)
    j = json.load(open(os.path.join(sdir, name + '.gltf'), encoding='utf-8'))
    # the kit files list every texture of their set: keep only the images a material points at
    used_tex = texture_indices(j.get('materials', []), set())
    used_img = {j['textures'][t]['source'] for t in used_tex if t < len(j.get('textures', []))}
    for i, img in enumerate(j.get('images', [])):
        if i not in used_img or 'uri' not in img:
            continue
        rel, mime = convert_image(os.path.join(sdir, img['uri']), pack)
        img['uri'] = '../' + rel
        img['mimeType'] = mime
    # an image nobody uses is replaced by the first used one (keeps indices valid, never fetched)
    first = next((img['uri'] for i, img in enumerate(j.get('images', [])) if i in used_img), None)
    for i, img in enumerate(j.get('images', [])):
        if i not in used_img:
            img['uri'] = first or 'data:image/png;base64,'
    os.makedirs(os.path.join(OUT, pack), exist_ok=True)
    for b in j['buffers']:
        uri = b['uri']
        shutil.copyfile(os.path.join(sdir, uri), os.path.join(OUT, pack, uri))
        add_file(pack + '/' + uri, os.path.join(sdir, uri), pack)
    with open(os.path.join(OUT, pack, name + '.gltf'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(j, f, separators=(',', ':'))
    add_file(pack + '/' + name + '.gltf', os.path.join(sdir, name + '.gltf'), pack)


def read_glb(path):
    b = open(path, 'rb').read()
    jl = struct.unpack('<I', b[12:16])[0]
    j = json.loads(b[20:20 + jl])
    off = 20 + jl
    bl = struct.unpack('<I', b[off:off + 4])[0]
    return j, b[off + 8:off + 8 + bl]


def write_glb(path, j, binary):
    js = json.dumps(j, separators=(',', ':')).encode('utf-8')
    js += b' ' * ((4 - len(js) % 4) % 4)
    binary += b'\0' * ((4 - len(binary) % 4) % 4)
    total = 12 + 8 + len(js) + 8 + len(binary)
    with open(path, 'wb') as f:
        f.write(struct.pack('<III', 0x46546C67, 2, total))
        f.write(struct.pack('<II', len(js), 0x4E4F534A))
        f.write(js)
        f.write(struct.pack('<II', len(binary), 0x004E4942))
        f.write(binary)


def build_ual():
    src = os.path.join(HERO, 'ual', 'UAL1_Standard.glb')
    j, binary = read_glb(src)
    names = [n.get('name') for n in j['nodes']]
    new_acc, new_bv, out = [], [], bytearray()
    amap = {}

    def take(ai):
        if ai in amap:
            return amap[ai]
        a = j['accessors'][ai]
        bv = j['bufferViews'][a['bufferView']]
        comp = {'SCALAR': 1, 'VEC3': 3, 'VEC4': 4}[a['type']]
        assert a['componentType'] == 5126 and not bv.get('byteStride')
        start = bv.get('byteOffset', 0) + a.get('byteOffset', 0)
        data = binary[start:start + a['count'] * comp * 4]
        while len(out) % 4:
            out.append(0)
        new_bv.append({'buffer': 0, 'byteOffset': len(out), 'byteLength': len(data)})
        out.extend(data)
        na = {k: v for k, v in a.items() if k not in ('bufferView', 'byteOffset')}
        na['bufferView'] = len(new_bv) - 1
        new_acc.append(na)
        amap[ai] = len(new_acc) - 1
        return amap[ai]

    anims = []
    for an in j['animations']:
        if an['name'] not in CLIPS:
            continue
        samplers, channels = [], []
        for ch in an['channels']:
            node, path = ch['target'].get('node'), ch['target']['path']
            if path == 'scale':
                continue
            if path == 'translation' and names[node] not in ('pelvis', 'root'):
                continue
            s = an['samplers'][ch['sampler']]
            samplers.append({'input': take(s['input']), 'output': take(s['output']), 'interpolation': s.get('interpolation', 'LINEAR')})
            channels.append({'sampler': len(samplers) - 1, 'target': {'node': node, 'path': path}})
        anims.append({'name': an['name'], 'samplers': samplers, 'channels': channels})
    missing = set(CLIPS) - {a['name'] for a in anims}
    assert not missing, missing
    nodes = [{k: v for k, v in n.items() if k not in ('mesh', 'skin')} for n in j['nodes']]
    out_j = {'asset': {'version': '2.0', 'generator': 'Lexicon Realms build_assets3d.py (UAL clips only)'},
             'scene': 0, 'scenes': j['scenes'], 'nodes': nodes, 'animations': anims, 'accessors': new_acc,
             'bufferViews': new_bv, 'buffers': [{'byteLength': len(out)}]}
    os.makedirs(os.path.join(OUT, 'ual'), exist_ok=True)
    write_glb(os.path.join(OUT, 'ual', 'UAL_clips.glb'), out_j, bytes(out))
    add_file('ual/UAL_clips.glb', src, 'ual')


def write_licenses(total):
    lines = ['# assets3d: sources and licenses', '',
             'Every file in this folder (except this file, `manifest.json` and `_build/`) is listed below with the pack it came',
             'from and that pack\'s license. All of them are **CC0 1.0** (public domain dedication). Nothing was downloaded to',
             'build this folder: the packs were already on this PC. `_build/build_assets3d.py` made every file (textures resized',
             'and re-encoded with Pillow, the animation library cut to the clips the game plays).', '',
             '**Not included, by decision:** the Elf, Orc, Imp and Puglin models (Quaternius Asset License, not CC0). The 3D',
             'renderer builds its own stand-ins in code instead.', '',
             'three.js r170 (MIT) is vendored separately in `src/vendor/three/` with its license.', '',
             '## Packs', '',
             '| Folder | Pack | License | Source on this PC |', '|---|---|---|---|']
    for k, (title, itch, lic) in PACKS.items():
        where = os.path.join(ITCH, itch) if itch else POLY
        lines.append('| `%s/` | %s | %s | `%s` |' % (k, title, lic, where))
    lines += ['| `tex/` | textures of the packs above (each row below names its pack) | CC0 1.0 | as its pack |', '',
              'The four animals are Quaternius models published on poly.pizza as CC0 1.0: Wolf ' + ANIMAL_PAGES['Wolf'] +
              ', Deer ' + ANIMAL_PAGES['Deer'] + ', Horse ' + ANIMAL_PAGES['Horse'] + ' (the Bay Horse and Grey Charger mounts), Stag ' +
              ANIMAL_PAGES['Stag'] + ' (the Moor Stag mount).', '',
              'The Ghost Skull (the barrow shade) is a Quaternius model published on poly.pizza as CC0 1.0: ' +
              MONSTER_PAGES['Ghost_Skull'] + '. The other foes are built in code (src/render3d/creatures.js).', '',
              'Total size: %.1f MB in %d files.' % (total / 1048576, len(files)), '',
              '## Files', '', '| File | Pack | License |', '|---|---|---|']
    for rel, src, pack in sorted(files):
        lines.append('| `%s` | %s | %s |' % (rel, PACKS[pack][0], PACKS[pack][2]))
    with open(os.path.join(OUT, 'LICENSES.md'), 'w', encoding='utf-8', newline='\n') as f:
        f.write('\n'.join(lines) + '\n')


def main():
    for d in list(INV) + list(ITCH_INV) + ['ual', 'animals', 'monsters', 'tex']:
        p = os.path.join(OUT, d)
        if os.path.isdir(p):
            shutil.rmtree(p)
    for pack, names in INV.items():
        for n in names:
            copy_gltf(pack, n)
    # alternate colour maps of the outfit pack: the renderer uses them as dyes (no glTF points at them)
    for t in ('T_Peasant_2_BaseColor.png', 'T_Ranger_3_BaseColor.png'):
        convert_image(os.path.join(HERO, 'mco', t), 'mco')
    copy_itch()
    build_ual()
    os.makedirs(os.path.join(OUT, 'animals'), exist_ok=True)
    for n, rel in ANIMALS.items():
        src = os.path.join(POLY, rel)
        shutil.copyfile(src, os.path.join(OUT, 'animals', n + '.glb'))
        add_file('animals/' + n + '.glb', src, 'animals')
    os.makedirs(os.path.join(OUT, 'monsters'), exist_ok=True)
    for n, rel in MONSTERS.items():
        src = os.path.join(POLY, rel)
        shutil.copyfile(src, os.path.join(OUT, 'monsters', n + '.glb'))
        add_file('monsters/' + n + '.glb', src, 'monsters')
    write_index()


def copy_itch():
    for pack, (sub, names) in ITCH_INV.items():
        for n in names:
            copy_gltf(pack, n, os.path.join(ITCH, sub))


def write_index():
    total = sum(os.path.getsize(os.path.join(OUT, f)) for f, _, _ in files)
    man = {'v': 1, 'bytes': total, 'files': sorted(f for f, _, _ in files)}
    with open(os.path.join(OUT, 'manifest.json'), 'w', encoding='utf-8', newline='\n') as f:
        json.dump(man, f, indent=0)
    write_licenses(total)
    print('ASSETS3D_BUILT: files=%d bytes=%d mb=%.1f' % (len(files), total, total / 1048576))


def add_dungeon():
    """Add the dungeon and cave props to the folder as it stands: the files already listed keep their bytes (a texture
    that is already in tex/ is reused, never re-encoded), then manifest.json and LICENSES.md are rewritten."""
    by_title = {v[0]: k for k, v in PACKS.items()}
    for line in open(os.path.join(OUT, 'LICENSES.md'), encoding='utf-8'):
        if line.startswith('| `') and line.count('|') == 4:
            rel, title = line.split('|')[1].strip().strip('`'), line.split('|')[2].strip()
            if '/' in rel and title in by_title and not rel.startswith(tuple(p + '/' for p in ITCH_INV)):
                add_file(rel, None, by_title[title])
    for f in os.listdir(os.path.join(OUT, 'tex')):
        done_tex[os.path.splitext(f)[0]] = ('tex/' + f, 'image/png' if f.endswith('.png') else 'image/jpeg')
    for d in ITCH_INV:
        p = os.path.join(OUT, d)
        if os.path.isdir(p):
            shutil.rmtree(p)
    copy_itch()
    write_index()


if __name__ == '__main__':
    import sys
    if '--dungeon' in sys.argv:
        add_dungeon()
    else:
        main()
