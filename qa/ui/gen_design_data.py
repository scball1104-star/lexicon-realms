r"""Generate src/ui/design_data.js (UI display text for classes, abilities and talents) from the design docs.

    python qa/ui/gen_design_data.py

Source: docs/design/CLASSES.md and docs/design/TALENTS.md (the design agent's tables). The UI shows names, roles,
descriptions, costs, cast times, cooldowns, tooltips and talent trees from this file until src/data/classes.js,
abilities.js and talents.js exist; then main.js passes those through `ui.setGameData()` and they win field by field.
Re-run this script whenever the docs change. Prints GEN_DONE: classes=<n> abilities=<n> talents=<n>.
"""
import json, os, re, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..'))
CLASSES_MD = os.path.join(ROOT, 'docs', 'design', 'CLASSES.md')
TALENTS_MD = os.path.join(ROOT, 'docs', 'design', 'TALENTS.md')
OUT = os.path.join(ROOT, 'src', 'ui', 'design_data.js')

ORDER = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade']
ROLE = {'warden': 'Tank', 'mender': 'Healer', 'scribe': 'Ranged caster', 'wayfinder': 'Ranged, bow and traps', 'inkblade': 'Melee, stealth'}
ABILITY_ICON = {
    'warden_strike': 'icon16_sword', 'warden_shield_bash': 'icon_shield', 'warden_taunt': 'icon_taunt',
    'warden_second_wind': 'icon_regen', 'warden_sweeping_blow': 'icon_combo', 'warden_oath_of_iron': 'icon_oath',
    'mender_kindle': 'icon16_light', 'mender_mend': 'icon_regen', 'mender_brand': 'icon_burn',
    'mender_warding_word': 'icon_protect', 'mender_steady_name': 'icon_kept', 'mender_chorus': 'icon_star',
    'scribe_inkbolt': 'icon_quill', 'scribe_scrawl': 'icon_scroll', 'scribe_full_stop': 'icon_stun',
    'scribe_underline': 'icon_book', 'scribe_scatter_letters': 'icon_magic', 'scribe_bracket': 'icon_sigil',
    'wayfinder_quick_shot': 'icon16_bow', 'wayfinder_pinning_shot': 'icon_bow', 'wayfinder_briar_trap': 'icon_leaf',
    'wayfinder_light_foot': 'icon_haste', 'wayfinder_aimed_shot': 'icon_focus', 'wayfinder_volley': 'icon_thunder',
    'inkblade_nick': 'icon_sword', 'inkblade_spill': 'icon_poison', 'inkblade_fade': 'icon_nameless',
    'inkblade_ink_in_the_eyes': 'icon_blind', 'inkblade_bleed_line': 'icon_burn', 'inkblade_inkstep': 'icon_flee',
}
# the approved still 3 shows these Warden nodes with these icons
STILL_ICONS = {
    'iron_skin': 'icon_shield', 'stout_heart': 'icon_armor', 'hold_the_line': 'icon_protect', 'challenge': 'icon_taunt',
    'last_stand': 'icon_helm', 'rebuke': 'icon_reflect', 'unbreakable': 'icon_oath', 'keen_edge': 'icon16_sword',
    'follow_through': 'icon_combo', 'rising_wrath': 'icon_fury', 'sworn_strike': 'icon_sigil', 'clear_mind': 'icon_focus',
    'bright_steel': 'icon_star', 'oathbreaker': 'icon_thunder', 'steady_flame': 'icon16_lantern', 'warm_light': 'icon_regen',
    'beacon': 'icon16_light', 'kept_name': 'icon_kept', 'guiding_step': 'icon_haste', 'hearthward': 'icon_leaf',
    'dawnbringer': 'icon_light',
}
KEYWORD_ICONS = [
    ('armor', 'icon_armor'), ('block', 'icon_shield'), ('crit', 'icon_star'), ('taunt', 'icon_taunt'),
    ('stealth', 'icon_nameless'), ('fade', 'icon_nameless'), ('trap', 'icon_leaf'), ('briar', 'icon_leaf'),
    ('poison', 'icon_poison'), ('absorb', 'icon_protect'), ('ward', 'icon_protect'), ('mana', 'icon_ether'),
    ('focus', 'icon_focus'), ('resolve', 'icon_fury'), ('move speed', 'icon_haste'), ('leap', 'icon_haste'),
    ('root', 'icon_stun'), ('slow', 'icon_chill'), ('stun', 'icon_stun'), ('cooldown', 'icon_gear'),
    ('heal', 'icon_regen'), ('hp', 'icon_regen'), ('range', 'icon_bow'), ('mark', 'icon_quill'), ('ink', 'icon_quill'),
    ('light', 'icon_light'), ('kindle', 'icon_fire'), ('brand', 'icon_burn'), ('bleed', 'icon_burn'),
    ('chorus', 'icon_star'), ('cast', 'icon_magic'), ('damage', 'icon_sword'),
]


def cells(line):
    return [c.strip() for c in line.strip().strip('|').split('|')]


def clean(s):
    s = re.sub(r'\*\*\[play\]\*\*\s*', '', s)
    s = s.replace('**', '')
    s = re.sub(r'`([^`]*)`', lambda m: m.group(1).replace(' ', ''), s)   # `6 + L` -> 6+L (one rank token)
    return s.strip()


def parse_classes(md):
    out, abil = {}, {}
    cur = None
    lines = md.split('\n')
    for i, ln in enumerate(lines):
        m = re.match(r'^## \d+\. (\w+) \((.*)\)\s*$', ln)
        if m and m.group(1).lower() in ORDER:
            cid = m.group(1).lower()
            cur = out[cid] = {'id': cid, 'name': m.group(1), 'role': ROLE[cid], 'kit': m.group(2), 'lore': [], 'abilities': []}
            continue
        if ln.startswith('## '):
            cur = None
        if not cur:
            continue
        if ln.startswith('> '):
            cur['lore'].append(clean(ln[2:]))
        elif ln.startswith('- Resource:'):
            r = re.search(r'\*\*(\w[\w ]*)\*\*', ln)
            cur['resource'] = (r.group(1) if r else 'mana').lower()
        elif ln.startswith('- Plays like:'):
            cur['plays'] = clean(ln[len('- Plays like:'):])
        elif ln.startswith('- Armor:'):
            cur['gear'] = clean(ln[2:])
        elif re.match(r'^\| (sta|str|agi|int|spi) \|', ln):
            c = cells(ln)
            cur.setdefault('base', {})[c[0]] = float(c[1]); cur.setdefault('growth', {})[c[0]] = float(c[2])
        elif ln.startswith('| `') and cur:
            c = cells(ln)
            if len(c) < 9: continue
            aid = c[0].strip('`')
            a = {'id': aid, 'cls': cur['id'], 'name': c[1], 'learnLevel': int(re.sub(r'\D', '', c[2]) or 1), 'cost': clean(c[3]),
                 'cast': c[4], 'cooldown': c[5], 'gcd': c[6], 'range': clean(c[7]), 'text': clean(c[8]),
                 'icon': ABILITY_ICON.get(aid, 'icon_magic')}
            abil[aid] = a
            cur['abilities'].append(aid)
    return out, abil


def parse_talents(md):
    out = {}
    cls = branch = None
    for ln in md.split('\n'):
        m = re.match(r'^## \d+\. (\w+)\s*$', ln)
        if m and m.group(1).lower() in ORDER:
            cls = m.group(1).lower(); out[cls] = {'branches': [], 'talents': {}}; branch = None; continue
        if ln.startswith('## '):
            cls = None; continue
        if not cls: continue
        m = re.match(r'^### \d+\.\d+ ([\w\' -]+?)(?: \((.*)\))?\s*$', ln)
        if m:
            name = m.group(1).strip()
            bid = name.lower().replace(' ', '_').replace("'", '')
            branch = {'id': bid, 'name': name, 'focus': m.group(2) or ''}
            out[cls]['branches'].append(branch); continue
        if branch and re.match(r'^\| \d', ln):
            c = cells(ln)
            if len(c) < 5: continue
            tid = c[1].strip('`')
            raw = c[4]
            short = tid.split('_', 2)[-1] if tid.count('_') >= 2 else tid
            short = tid[len(cls) + 1 + len(branch['id']) + 1:] if tid.startswith(f'{cls}_{branch["id"]}_') else short
            icon = STILL_ICONS.get(short) if cls == 'warden' else None
            if not icon:
                low = (c[2] + ' ' + raw).lower()
                icon = next((ic for k, ic in KEYWORD_ICONS if k in low), 'icon_magic')
            out[cls]['talents'][tid] = {
                'id': tid, 'branch': branch['id'], 'tier': int(c[0]), 'maxRanks': int(c[3]), 'requires': None,
                'name': c[2], 'icon': icon, 'play': '[play]' in raw, 'text': clean(raw),
            }
    return out


def main():
    cmd = open(CLASSES_MD, encoding='utf-8').read()
    tmd = open(TALENTS_MD, encoding='utf-8').read()
    classes, abilities = parse_classes(cmd)
    talents = parse_talents(tmd)
    missing = [c for c in ORDER if c not in classes or c not in talents]
    if missing:
        print('GEN_FAIL: missing', missing); sys.exit(1)
    for c in ORDER:
        classes[c]['lore'] = ' '.join(classes[c]['lore'])
    rule = re.search(r'tier 1, 2, 3, 4, 5 open at \*\*([\d, ]+) points', tmd)
    tiers = [int(x) for x in rule.group(1).split(',')] if rule else [0, 2, 4, 6, 8]
    data = {'source': 'docs/design/CLASSES.md + TALENTS.md', 'order': ORDER, 'classes': classes,
            'abilities': abilities, 'talents': talents, 'tierPoints': tiers, 'firstTalentLevel': 5}
    body = json.dumps(data, indent=1, ensure_ascii=False)
    if '—' in body:
        print('GEN_FAIL: an em dash reached player-facing text'); sys.exit(1)
    js = ('// GENERATED by qa/ui/gen_design_data.py from docs/design/CLASSES.md and TALENTS.md. Do not hand-edit; re-run.\n'
          '// UI display data only (names, text, icons, tree shape). When src/data/classes.js, abilities.js and talents.js\n'
          '// exist, main.js hands them to ui.setGameData() and they override this file field by field.\n'
          f'export const DESIGN_DATA = {body};\n')
    open(OUT, 'w', encoding='utf-8', newline='\n').write(js)
    n_t = sum(len(t['talents']) for t in talents.values())
    print(f'GEN_DONE: classes={len(classes)} abilities={len(abilities)} talents={n_t}')


if __name__ == '__main__':
    main()
