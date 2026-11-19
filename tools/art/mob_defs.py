"""Mob definitions: palette (letters -> LQ master-palette refs, sampled from the LQ field sprite of the same creature
where one exists), cell, body plan and extras. Ids are the mob ids of docs/design/ZONES_QUESTS.md (2.3, 3.1, 4.1).
`lq` = the closest Lexicon Quest sprites (field / battle), for the world agent's mapping table."""
import mob_rigs as R
import mob_rigs2 as R2

MOBS = {}


def mob(mid, rig, **kw):
    kw['draw'] = (lambda cv, v, a, i, W, H: getattr(rig, v)(cv, a, i, W, H)) if isinstance(rig, R.Quad) else \
                 (lambda cv, v, a, i, W, H: rig(cv, v, a, i, W, H))
    MOBS[mid] = kw


CAST = [('cast', 2)]
SPECIAL = [('special', 2)]

# ---------------------------------------------------------------------------------------------------- wolves
def wolf_pal(outline, fur4, extra):
    p = {'0': outline, 'n': 'ink:1', 'w': 'stone_warm:5', 'Y': 'fire:4'}
    p.update(dict(zip('rRxX', fur4)))
    p.update(extra)
    return p


WOLF = dict(cell=(40, 32), family='beast')
mob('briar_wolf', R.make_wolf('rRxX', 'rrR', 'xXu', 'n', 'Y', 'w', 'r', R.back_tufts('leaf', ('gGH', 'h', 'Y'))),
    name='Briar Wolf', **WOLF,
    pal=wolf_pal('wood:0', ['wood:1', 'wood:2', 'wood:3', 'wood:4'],
                 {'g': 'grass:1', 'G': 'grass:2', 'H': 'grass:3', 'h': 'grass:4', 'u': 'stone_warm:4'}),
    lq={'field': 'enemies_field:briar_wolf', 'battle': 'enemies_battle:briar_wolf'})
mob('thornback_wolf', R.make_wolf('rRxX', 'rrR', 'xXu', 'n', 'Y', 'w', 'r', R.back_tufts('thorn', ('gGH', 'h', None))),
    name='Thornback Wolf', **WOLF,
    pal=wolf_pal('shadow:0', ['shadow:1', 'shadow:3', 'stone_cool:3', 'stone_cool:4'],
                 {'g': 'grass:0', 'G': 'roof_green:2', 'H': 'stone_warm:5', 'h': 'metal:4', 'u': 'stone_cool:5'}),
    lq={'field': 'enemies_field:thornback_wolf', 'battle': 'enemies_battle:thornback_wolf'})
mob('mist_wolf', R.make_wolf('rRxX', 'rrR', 'xXu', 'n', 'Y', 'w', 'r', R.back_tufts('crystal', ('gGH', 'h', None))),
    name='Mist Wolf', **WOLF, emissive='h',
    pal=wolf_pal('shadow:0', ['shadow:3', 'stone_cool:3', 'stone_cool:4', 'stone_cool:5'],
                 {'g': 'water:2', 'G': 'water:3', 'H': 'water:4', 'h': 'metal:4', 'u': 'metal:3'}),
    lq={'field': 'enemies_field:mist_wolf', 'battle': 'enemies_battle:mist_wolf'})

# ------------------------------------------------------------------------------------------------- boar, ram
mob('gorse_boar', R.make_boar('bBcC', 'bbB', 'pP', 'n', 'E', 'w', 'bBc', R.back_tufts('thorn', ('gG', 'Y', None))),
    name='Gorse Boar', family='beast', cell=(40, 32), extra=SPECIAL,
    pal={'0': 'wood:0', 'b': 'earth:1', 'B': 'earth:2', 'c': 'earth:3', 'C': 'earth:4', 'p': 'stone_warm:2',
         'P': 'stone_warm:3', 'n': 'wood:0', 'E': 'fire:3', 'w': 'stone_warm:5', 'g': 'grass:1', 'G': 'grass:2',
         'Y': 'gold:4'},
    notes='special = boar_charge telegraph (1.0 s: pawing, head low); play it, then the walk anim at charge speed.',
    lq={'field': None, 'battle': None, 'closest': 'enemies_field:briar_wolf (a beast of the same size; LQ has no boar)'})
mob('fold_ram', R.make_ram('XxWw', 'XXx', 'fFg', 'fF', 'ff', 'hHj', 'k', 'E', 'n'),
    name='Fold Ram', family='beast', cell=(40, 32), extra=SPECIAL,
    pal={'0': 'shadow:1', 'X': 'stone_warm:2', 'x': 'stone_warm:3', 'W': 'stone_warm:4', 'w': 'stone_warm:5',
         'f': 'stone_cool:1', 'F': 'stone_cool:2', 'g': 'stone_cool:3', 'h': 'path:1', 'H': 'path:3', 'j': 'sand:2',
         'k': 'earth:1', 'E': 'gold:4', 'n': 'shadow:1'},
    notes='special = ram_charge (head down, lunge); passive grazer otherwise. On-model with LQ x1 animal_sheep '
          '(same wool and face colours) plus curled horns.',
    lq={'field': 'x1_npcs:animal_sheep_tufted', 'battle': None})

# ------------------------------------------------------------------------------------------------------ oozes
mob('ink_slime', R2.Ooze(body='abcd', glint='W', spot='Y', specks=[(0.2, -0.2), (0.45, 0.1), (-0.2, 0.35)],
                         eye='e', eye_hi='E', core='kKL'),
    name='Ink Slime', family='ooze', cell=(28, 24),
    pal={'0': 'foliage_dark:0', 'a': 'grass:0', 'b': 'roof_green:2', 'c': 'roof_green:3', 'd': 'roof_green:4',
         'W': 'magic_cyan:3', 'Y': 'fire:4', 'e': 'foliage_dark:0', 'E': 'magic_cyan:4', 'k': 'magic_cyan:2',
         'K': 'magic_cyan:3', 'L': 'magic_cyan:4'},
    lq={'field': 'enemies_field:ink_slime', 'battle': 'enemies_battle:ink_slime'})
mob('ink_slime_deep', R2.Ooze(body='abcd', glint='W', spot='Y', specks=[(0.2, -0.2), (0.45, 0.1), (-0.2, 0.35)],
                              eye='e', eye_hi='E', core='kKL'),
    name='Ink Slime (levels 3-4)', family='ooze', cell=(28, 24), variant_of='ink_slime',
    pal={'0': 'shadow:0', 'a': 'foliage_dark:0', 'b': 'grass:0', 'c': 'roof_green:2', 'd': 'roof_green:3',
         'W': 'magic_cyan:2', 'Y': 'gold:3', 'e': 'shadow:0', 'E': 'magic_cyan:3', 'k': 'magic_cyan:2',
         'K': 'magic_cyan:3', 'L': 'magic_cyan:4'},
    notes='tier 2 colours of ink_slime (ZONES_QUESTS 2.3 levels 3-4): darker, older ink.',
    lq={'field': 'enemies_field:ink_slime', 'battle': 'enemies_battle:ink_slime'})
mob('ink_blot', R2.Ooze(body='abcd', glint='W', spot='Y', specks=[(0.3, -0.3), (-0.1, 0.3)], eye='e', eye_hi='E',
                        core='kKL', size=(6.6, 5.2)),
    name='Ink Blot', family='ooze', cell=(28, 28), extra=CAST, emissive='kKL',
    pal={'0': 'shadow:0', 'a': 'ink:1', 'b': 'ink:2', 'c': 'ink:3', 'd': 'roof_purple:3', 'W': 'cloth_purple:5',
         'Y': 'magic_cyan:3', 'e': 'shadow:0', 'E': 'magic_cyan:4', 'k': 'magic_cyan:2', 'K': 'magic_cyan:3',
         'L': 'magic_cyan:4'},
    notes='cast = ink_spit (2.0 s): the ink drop gathers above it; spawn the bolt at points.cast.',
    lq={'field': 'enemies_field:ink_blot', 'battle': 'enemies_battle:ink_blot'})

# ------------------------------------------------------------------------------------------------------ scarabs
SCARAB = R2.Scarab(shell='abcd', moss='mM', leg='gGH', head='gGH', eye='Y', glint='W')
mob('moss_scarab', SCARAB, name='Moss Scarab', family='insect', cell=(28, 22), extra=SPECIAL,
    pal={'0': 'foliage_dark:0', 'a': 'roof_green:1', 'b': 'roof_green:2', 'c': 'roof_green:3', 'd': 'roof_green:4',
         'm': 'grass:4', 'M': 'grass:5', 'g': 'gold:1', 'G': 'gold:2', 'H': 'gold:3', 'Y': 'gold:4', 'W': 'magic_cyan:3'},
    notes='special = shell_up (tucked into its shell, -30% damage taken 4 s).',
    lq={'field': 'enemies_field:moss_scarab', 'battle': 'enemies_battle:moss_scarab'})
mob('moss_scarab_moor', SCARAB, name='Moor Scarab', family='insect', cell=(28, 22), extra=SPECIAL,
    variant_of='moss_scarab',
    pal={'0': 'shadow:0', 'a': 'roof_purple:1', 'b': 'roof_purple:2', 'c': 'roof_purple:3', 'd': 'roof_purple:4',
         'm': 'blossom:1', 'M': 'blossom:2', 'g': 'stone_warm:1', 'G': 'stone_warm:2', 'H': 'stone_warm:3',
         'Y': 'gold:4', 'W': 'cloth_purple:5'},
    notes='High Moor colours of moss_scarab (ZONES_QUESTS 4.1 "Moor Scarab", level 11): heather shell.',
    lq={'field': 'enemies_field:moss_scarab', 'battle': 'enemies_battle:moss_scarab'})

# ------------------------------------------------------------------------------------------------------- crow
mob('gorse_crow', R2.Bird(body='bBcC', wing='bBc', far='bb', beak='kKl', eye='Y', sheen='s', leg='k'),
    name='Gorse Crow', family='beast', cell=(32, 32), flying=True, hover=R2.Bird.HOVER,
    pal={'0': 'shadow:0', 'b': 'shadow:1', 'B': 'ink:2', 'c': 'ink:3', 'C': 'ink:4', 'k': 'stone_cool:2',
         'K': 'stone_cool:3', 'l': 'stone_cool:4', 'Y': 'gold:4', 's': 'magic_violet:1'},
    notes='flying: the body is drawn ~8 px above the feet point in every frame (death 1-2 lie on the ground); '
          'draw the ground shadow at the origin. walk = the flight flap loop.',
    lq={'field': None, 'battle': None, 'closest': 'enemies_field:glint_wisp (a small flyer; LQ has no crow)'})

# ------------------------------------------------------------------------------------------------------ wraiths
WRAITH = dict(family='spirit', cell=(32, 40), extra=CAST)
mob('page_wraith', R2.Wraith(hood='iIj', cloak='lmno', far='lm', face='f', eye='eE', eye_hi='E', text='t', claw='j',
                             glow='gGH', wisp='o'),
    name='Page Wraith', **WRAITH, emissive='EgGH',
    pal={'0': 'ink:0', 'i': 'ink:1', 'I': 'ink:2', 'j': 'ink:3', 'l': 'path:1', 'm': 'path:3', 'n': 'sand:2',
         'o': 'sand:3', 'f': 'shadow:1', 'e': 'magic_cyan:3', 'E': 'magic_cyan:4', 't': 'ink:2',
         'g': 'magic_cyan:2', 'G': 'magic_cyan:3', 'H': 'magic_cyan:4'},
    notes='cast = paper_cut (2.0 s); spawn at points.cast. A parchment cloak written in ink lines.',
    lq={'field': 'enemies_field:page_wraith', 'battle': 'enemies_battle:page_wraith'})
mob('ink_wraith', R2.Wraith(hood='iIjJ', cloak='iIjJ', far='iI', face='f', eye='eE', eye_hi='E', mask='sS', trim='v',
                            claw='J', glow='pPq', wisp='v'),
    name='Ink Wraith', **WRAITH, emissive='EpPq',
    pal={'0': 'ink:0', 'i': 'ink:1', 'I': 'ink:2', 'j': 'ink:3', 'J': 'ink:4', 'f': 'shadow:0', 's': 'stone_cool:4',
         'S': 'metal:3', 'e': 'magic_cyan:2', 'E': 'magic_cyan:3', 'v': 'magic_violet:2', 'p': 'magic_violet:2',
         'P': 'magic_violet:3', 'q': 'magic_violet:4'},
    notes='cast = ink_tide (2.5 s, ground circle at the target).',
    lq={'field': 'enemies_field:ink_wraith', 'battle': 'enemies_battle:ink_wraith'})
mob('barrow_shade', R2.Wraith(hood='aHk', cloak='cCdD', far='cC', face='f', eye='eE', eye_hi='E', trim='t', claw='C',
                              glow='gGL', wisp='d'),
    name='Barrow Shade', **WRAITH, emissive='EeGL',
    pal={'0': 'foliage_dark:0', 'a': '#31594c', 'H': '#5a8c72', 'k': '#90bf9f', 'c': '#5a8c72', 'C': '#90bf9f',
         'd': '#c2e2c8', 'D': '#e3f4e2', 'f': '#1f3b37', 'e': 'grass:5', 'E': '#f5fcf0', 't': 'water:5',
         'g': 'water:4', 'G': 'water:5', 'L': 'ice:3'},
    notes='cast = chilling_touch (2.0 s); frost glow in the hands. The emissive sheet holds the eyes (night spawns).',
    lq={'field': 'x1_enemies_field:barrow_shade', 'battle': 'x1_enemies_battle:barrow_shade'})

# --------------------------------------------------------------------------------------------------- constructs
SENT_PAL = {'0': 'shadow:0', 's': 'stone_cool:1', 'S': 'stone_cool:2', 't': 'stone_cool:3', 'T': 'stone_cool:4',
            'i': 'metal:0', 'I': 'metal:1', 'J': 'metal:2', 'g': 'gold:2', 'G': 'gold:3', 'Y': 'gold:4',
            'l': 'gold:3', 'L': 'gold:4', 'm': 'fire:4', 'M': 'fire:5', 'd': 'shadow:2', 'D': 'shadow:3'}
mob('tower_sentinel', R2.Construct(1.0, stone='sStT', far='sS', iron='iIJ', trim='gGY', lamp='lLmM', lamp_dark='dD',
                                   slit='mM'),
    name='Tower Sentinel', family='construct', cell=(40, 44), extra=SPECIAL, emissive='lLmM', pal=SENT_PAL,
    notes='special = lamp_sweep telegraph (1.5 s: the chest lamp flares, a fan of light ahead); points.lamp = the cone apex.',
    lq={'field': 'enemies_field:glass_sentinel', 'battle': 'enemies_battle:glass_sentinel',
        'closest': 'x1_enemies_field:millstone_golem (stone construct)'})
mob('sentinel_long_watch', R2.Construct(1.5, stone='sStT', far='sS', iron='iIJ', trim='gGY', lamp='lLmM',
                                        lamp_dark='dD', slit='mM', cloak='cCk', cloth='bBK', crest=True),
    name='Sentinel of the Long Watch', family='construct', cell=(64, 64), extra=SPECIAL, emissive='lLmM',
    pal={'0': 'ink:0', 's': 'shadow:3', 'S': 'stone_cool:3', 't': 'stone_cool:4', 'T': 'stone_cool:5',
         'i': 'ink:1', 'I': 'ink:2', 'J': 'ink:3', 'g': 'gold:2', 'G': 'gold:3', 'Y': 'gold:4',
         'l': 'gold:4', 'L': 'fire:4', 'm': 'fire:5', 'M': 'gold:5', 'd': 'shadow:2', 'D': 'shadow:3',
         'c': 'roof_blue:1', 'C': 'roof_blue:2', 'k': 'roof_blue:3', 'b': 'cloth_blue:2', 'B': 'cloth_blue:3',
         'K': 'cloth_blue:4'},
    notes='ELITE, 1.5x the Tower Sentinel: indigo iron, gold trim, a tattered Keeper-blue cloak and tabard, a tall '
          'watchman crest, a bigger lamp. special = Lamp Sweep telegraph (1.5 s); points.lamp = cone apex. '
          "Odo's chime stun: play hurt, then idle under the stun-stars fx.",
    lq={'field': 'enemies_field:echo_warden', 'battle': 'bosses_battle:echo_warden',
        'closest': 'x1_bosses_battle:millstone_golem (the X1 elite construct)'})
mob('watch_lamp', R2.Lamp(stone='sStT', iron='iIJ', flame='lLmM', glass='qQ', glass_dark='dD', smoke='k'),
    name='Watch Lamp', family='construct', cell=(24, 44), extra=CAST, stationary=True, emissive='lLmMqQ',
    pal={'0': 'shadow:0', 's': 'stone_cool:1', 'S': 'stone_cool:2', 't': 'stone_cool:3', 'T': 'stone_cool:4',
         'i': 'metal:0', 'I': 'metal:1', 'J': 'metal:2', 'l': 'fire:2', 'L': 'fire:3', 'm': 'fire:4', 'M': 'fire:5',
         'q': 'fire:3', 'Q': 'gold:4', 'd': 'shadow:2', 'D': 'shadow:3', 'k': 'stone_cool:3'},
    notes='stationary: walk is the idle flicker (kept for format parity). cast = kindle_watch (3.0 s, interruptible); '
          'hurt doubles as the interrupt flinch. Four facings differ only in the cage bars.',
    lq={'field': None, 'battle': None, 'closest': 'props:lamp_post_lit (+ lamp_glow)'})
