// Sim event -> sound, as data (CONTRACTS section 11). Pure: no DOM, no audio; node-tested (qa/tests/audio.test.mjs).
//
//   soundsFor(ev, { me, cls }) -> [{ kind: 'sfx' | 'jingle', id, volume?, key? }]
//
// Only events that involve the local player make a sound (their own hits, hits on them, their kills, their loot),
// so a busy world is not noise. `key` is the throttle key for sounds that can repeat fast (cast_fail buzzer).
// Ids are assets/audio/manifest.json ids (copied from Lexicon Quest).

// abilities that land heavy (a bigger impact sound)
export const HEAVY = new Set(['warden_shield_bash', 'warden_sweeping_blow', 'inkblade_spill', 'wayfinder_aimed_shot']);

// the swing sound of a player's own melee hit, by class (auto-attack and class strikes)
export const CLASS_HIT = {
  warden: 'sword_slash', inkblade: 'sword_slash', wayfinder: 'hit_light', mender: 'staff_hit', scribe: 'staff_hit',
};

// spell schools that have their own impact sound
export const SCHOOL_HIT = { ink: 'ink_gurgle', light: 'fire', fire: 'fire', shadow: 'debuff' };

// cast starts and instant casts with their own sound (the caster is the local player)
export const CAST_START = {
  warden_taunt: 'oath_ring',
  warden_second_wind: 'buff', warden_oath_of_iron: 'buff',
  wayfinder_light_foot: 'buff', inkblade_fade: 'buff',
};

// aura ids (substring) -> the sound when it lands on the local player or the local player puts it on a foe
export const AURA_SOUNDS = [
  { match: 'stun', id: 'stun' },
  { match: 'poison', id: 'poison' },
  { match: 'root', id: 'debuff' }, { match: 'snare', id: 'debuff' }, { match: 'pinned', id: 'debuff' },
];

// cast_fail reasons that are just key mashing (no buzzer)
const QUIET_FAIL = new Set(['gcd', 'busy']);
const GOOD_RARITY = new Set(['magic', 'rare', 'legendary', 'set']);

const prefixOf = (ability) => String(ability || '').split('_')[0];
const auraId = (a) => String(a && a.id ? a.id : a || '');

export function soundsFor(ev, ctx = {}) {
  const me = ctx.me;
  if (me == null || !ev) return [];
  const out = [];
  const sfx = (id, extra = {}) => out.push({ kind: 'sfx', id, ...extra });
  const jingle = (id) => out.push({ kind: 'jingle', id });
  switch (ev.type) {
    case 'damage': {
      if (ev.src !== me && ev.dst !== me) break;
      if (ev.result === 'immune') break;
      if (ev.result === 'block') { sfx('defend'); break; }
      if (ev.periodic) break;                                   // DoT ticks stay quiet
      if (ev.crit) { sfx('crit'); break; }
      if (HEAVY.has(ev.ability)) { sfx('hit_heavy'); break; }
      if (ev.src === me) {
        const school = SCHOOL_HIT[ev.school];
        if (school) { sfx(school, { volume: 0.8 }); break; }
        const p = prefixOf(ev.ability);
        const cls = CLASS_HIT[p] ? p : ctx.cls;               // 'auto' uses the player's own class
        sfx(CLASS_HIT[cls] || 'hit_light');
        break;
      }
      sfx('hit_light', { volume: 0.85 });                       // something hit me
      break;
    }
    case 'heal':
      if ((ev.src === me || ev.dst === me) && !ev.periodic && ev.amount > 0) sfx('heal', { volume: 0.8 });
      break;
    case 'aura_add': {
      if (ev.dst !== me && ev.src !== me) break;
      const id = auraId(ev.aura);
      const hit = AURA_SOUNDS.find((a) => id.includes(a.match));
      if (hit) sfx(hit.id, { volume: 0.8 });
      break;
    }
    case 'cast_start': {
      if (ev.src !== me) break;
      if (CAST_START[ev.ability]) { sfx(CAST_START[ev.ability]); break; }
      if (prefixOf(ev.ability) === 'scribe' && ev.castTicks > 0) sfx('page_flutter', { volume: 0.7 });
      else if (prefixOf(ev.ability) === 'mender' && ev.castTicks > 0) sfx('buff', { volume: 0.45 });
      break;
    }
    case 'projectile': {
      if (ev.src !== me) break;
      const p = prefixOf(ev.ability);
      if (p === 'wayfinder' || (ev.ability === 'auto' && ctx.cls === 'wayfinder')) sfx('bow_shot');
      break;
    }
    case 'cast_fail':
      if (ev.src === me && !QUIET_FAIL.has(ev.reason)) sfx('buzzer', { volume: 0.6, key: 'cast_fail' });
      break;
    case 'interact_fail': case 'train_fail': case 'inventory_fail': case 'talent_fail':
      if ((ev.src ?? ev.id) === me) sfx('buzzer', { volume: 0.6, key: 'fail' });
      break;
    case 'death':
      if (ev.id !== me && (ev.tagger === me || ev.killer === me)) sfx('enemy_die', { volume: 0.8 });
      break;
    case 'respawn':
      if (ev.id === me) sfx('lantern_reveal');
      break;
    case 'level':
      if (ev.id === me) jingle('level_up');
      break;
    case 'quest':
      if (ev.id !== me) break;
      if (ev.kind === 'turnin') jingle('quest_done');
      else if (ev.kind === 'complete') sfx('confirm');
      else if (ev.kind === 'accept') sfx('page_flutter', { volume: 0.8 });
      else if (ev.kind === 'progress') sfx('cursor', { volume: 0.7 });
      else if (ev.kind === 'fail') sfx('buzzer');
      break;
    case 'loot': {
      if (ev.id !== me) break;
      const good = (ev.items || []).some((it) => it.inst && GOOD_RARITY.has(it.inst.rarity));
      if (good) jingle('item_get');
      else if (ev.gold) sfx('coin');
      else if ((ev.items || []).length) sfx('cursor');
      break;
    }
    case 'gold':
      if (ev.id === me && ev.source !== 'loot' && ev.amount > 0) sfx('coin');
      break;
    case 'train': case 'talent':
      if (ev.id === me) sfx('confirm');
      break;
    case 'respec_paid':
      if (ev.id === me) sfx('coin');
      break;
    case 'inventory':
      if (ev.id !== me) break;
      if (ev.kind === 'equip' || ev.kind === 'unequip') sfx('equip');
      else if (ev.kind === 'use') sfx('item_use');
      else if (ev.kind === 'buy') sfx('buy');
      else if (ev.kind === 'sell' || ev.kind === 'buyback') sfx('coin');
      break;
    default: break;
  }
  return out;
}

// when several jingles land in one tick (a turn-in that levels you), only the best one plays
export const JINGLE_RANK = { level_up: 3, quest_done: 2, item_get: 1 };

// UI sounds (audio.ui(kind))
export const UI_SOUNDS = {
  open: 'menu_open', close: 'menu_close', cursor: 'cursor', confirm: 'confirm', cancel: 'cancel', error: 'buzzer',
  buy: 'buy', coin: 'coin', equip: 'equip', sell: 'coin',
};

// zone music id -> track (zones name LQ track ids directly; this is for anything renamed)
export const MUSIC_ALIAS = { downs: 'the_downs', moor: 'high_moor', town: 'willowmere' };
