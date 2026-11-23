// The Barrow Deep Halls (dungeon, levels 26 to 30; cap 30, Scott 2026-11-22 "Go with all of it"; BUILDS_2 5.5 "the
// Wethers' Barrow, deep halls (the Barrow grown down)"). Its foes and their one new ability. Plain data: registered into
// src/data/mobs.js MOBS / MOB_SPRITES on import, the way src/data/rootbound.js registers the Rootbound's (stats from the
// PROGRESSION 3 curve at the template's low level; the copy and the spawn level set the rest). The place itself is
// src/data/dungeons.js `barrow_deep`; the map tools/maps/zone_barrow_deep.mjs; the quests src/data/dungeon_quests.js.
//
// Under the drove roads the Barrow kept digging. The flock the Bellwether led in is still being driven down there, the
// cairns are still being counted, and at the bottom the Barrow-King sits on the oldest count of all.
import { MOBS, MOB_SPRITES, mobStats } from './mobs.js';

const T = (o) => o;

export const DH_MOB_ABILITIES = {
  // the Drove-Herd's stampede: a line on the ground in front of it, then it charges down the line (step out of it)
  mob_drove_stampede: { id: 'mob_drove_stampede', name: 'Stampede', school: 'physical', castTime: 1.4, telegraph: 'line', cooldown: 11, gcd: true, target: 'enemy',
    range: { min: 0, max: 96 }, area: { shape: 'line', width: 24, radius: 112, at: 'self' },
    effects: [{ type: 'move', kind: 'charge', distance: 112, speed: 260 }, { type: 'damage', to: 'enemies', mobHit: 2.2, canCrit: false },
      { type: 'aura', to: 'enemies', aura: { id: 'drove_trampled', name: 'Trampled', kind: 'debuff', duration: 3, flags: ['slow'], mods: [{ stat: 'speed', mul: 0.6 }] } }] },
};

export const DH_MOBS = {
  deep_wether: T({ name: 'Deep Wether', level: [26, 29], family: 'spirit', kind: 'normal', behavior: 'aggressive', aggroRadius: 80, speed: 64, wander: 1, flee: null,
    abilities: [{ id: 'mob_ram_charge' }], loot: { junk: 'tangled_wool', table: [] } }),
  drove_shade: T({ name: 'Drove Shade', level: [26, 29], family: 'spirit', kind: 'caster', behavior: 'aggressive', aggroRadius: 96, speed: 60, wander: 1, flee: null,
    abilities: [{ id: 'mob_chilling_touch' }], loot: { junk: 'grave_dust', table: [] } }),
  cairn_ward: T({ name: 'Cairn Ward', level: [27, 29], family: 'construct', kind: 'armored', traits: ['armored'], behavior: 'aggressive', aggroRadius: 72, speed: 48, wander: 0, flee: null,
    abilities: [{ id: 'mob_shell_up' }], loot: { junk: 'grave_dust', table: [] } }),
  the_long_uncounted: T({ name: 'The Long Uncounted', level: [26, 29], family: 'spirit', kind: 'weak', behavior: 'aggressive', aggroRadius: 96, speed: 60, wander: 0, flee: null,
    abilities: [], loot: { junk: 'grave_dust', table: [] } }),
  // the bosses
  deep_drove_herd: T({ name: 'The Drove-Herd', level: [27, 27], family: 'spirit', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96,
    speed: 64, wander: 0, leash: 320, flee: null, attackSpeed: 2.2,
    card: 'THE DROVE-HERD. A whole flock, driven down so long it became one beast.', deathLine: 'The herd scatters into a hundred thin shadows, and is gone.',
    abilities: [{ id: 'mob_drove_stampede' }, { id: 'mob_ram_charge' }],
    fight: { phases: [{ at: 0.5, yell: 'The herd turns, and the stragglers come running.', summon: { mob: 'the_long_uncounted', level: 26, count: 2 } }],
      frenzy: { after: 100, yell: 'The Drove-Herd lowers a hundred heads.', mods: [{ stat: 'damageDone', mul: 1.4 }, { stat: 'attackSpeed', mul: 1.25 }] } },
    loot: { junk: 'tangled_wool', table: [], gear: 'elite' } }),
  deep_cairn_counter: T({ name: 'The Cairn-Counter', level: [28, 28], family: 'spirit', kind: ['elite', 'caster'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96,
    speed: 56, wander: 0, leash: 320, flee: null,
    card: 'THE CAIRN-COUNTER. One stone for every drover who never came home.', deathLine: 'The last stone drops from its hand. The cairn is finished.',
    abilities: [{ id: 'mob_tally_rain' }, { id: 'mob_chilling_touch' }],
    fight: { phases: [{ at: 0.5, yell: 'Another stone. Another name. Yours.', summon: { mob: 'the_long_uncounted', level: 27, count: 2 } }],
      frenzy: { after: 100, yell: 'It counts faster, and the stones fall faster.', mods: [{ stat: 'damageDone', mul: 1.4 }, { stat: 'castTime', mul: 0.8 }] } },
    loot: { junk: 'grave_dust', table: [], gear: 'elite' } }),
  deep_barrow_king: T({ name: 'The Barrow-King', level: [30, 30], family: 'spirit', kind: ['elite'], elite: true, boss: true, behavior: 'elite', aggroRadius: 96,
    speed: 56, wander: 0, leash: 320, flee: null, attackSpeed: 2.4,
    card: 'THE BARROW-KING. The first name ever counted, and the last to be let go.', deathLine: 'The crown rolls to the edge of the count, and the count is done.',
    abilities: [{ id: 'mob_reeve_slam' }, { id: 'mob_reeve_sweep' }, { id: 'mob_drove_stampede', cooldown: 16 }],
    fight: { phases: [{ at: 0.5, yell: 'KNEEL AND BE COUNTED.', summon: { mob: 'the_long_uncounted', level: 28, count: 2 } }],
      frenzy: { after: 150, yell: 'THE COUNT IS NEVER DONE.', mods: [{ stat: 'damageDone', mul: 1.5 }, { stat: 'attackSpeed', mul: 1.3 }] } },
    loot: { junk: 'grave_dust', table: [], gear: 'elite' } }),
};

// Sprites the renderers already draw (no new art): the barrow's ram and shade, the tower's construct
const DH_SPRITES = {
  deep_wether: { sprite: 'fold_ram', lq: 'glassback' },
  drove_shade: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  cairn_ward: { sprite: 'tower_sentinel', lq: 'glass_sentinel' },
  the_long_uncounted: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  deep_drove_herd: { sprite: 'fold_ram', lq: 'glassback' },
  deep_cairn_counter: { sprite: 'barrow_shade', lq: 'borrowed_shadow' },
  deep_barrow_king: { sprite: 'barrow_shade', lq: 'echo_warden' },
};

// Boss tuning (the dungeon clear bot's knobs, qa/sim/dungeon_bot.mjs; src/data/mobs.js BOSS_TUNE's shape)
export const DH_TUNE = {
  deep_drove_herd: { hpMult: 0.7, dmgMult: 0.3 },
  deep_cairn_counter: { hpMult: 0.7, dmgMult: 0.3 },
  deep_barrow_king: { hpMult: 0.6, dmgMult: 0.28 },
};

for (const [id, m] of Object.entries(DH_MOBS)) {
  MOB_SPRITES[id] = DH_SPRITES[id];
  MOBS[id] = m;
  m.id = id; m.sprite = DH_SPRITES[id].sprite; m.spriteLq = DH_SPRITES[id].lq; m.faction = 'hostile'; m.school = 'physical';
  m.elite = !!m.elite; m.leash = m.leash || 640;
  if (DH_TUNE[id]) { Object.assign(m, DH_TUNE[id]); m.leash = Math.max(m.leash, 480); }
  m.xp = null;
  const st = mobStats(id, m.level[0]);
  Object.assign(m, { hp: st.hp, damage: st.damage, attackSpeed: st.attackSpeed, armor: st.armor });
  m.loot.gold = st.gold;
  m.respawn = m.elite ? 360 : m.kind === 'weak' ? 60 : 90;
}
