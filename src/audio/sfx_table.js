// Sim event -> sound, as data (CONTRACTS section 11). Pure: no DOM, no audio; node-tested (qa/tests/audio.test.mjs).
//
//   soundsFor(ev, { me, cls }) -> [{ kind: 'sfx' | 'jingle', id, volume?, key? }]
//
// Events that involve the local player make a sound (their own hits, hits on them, their kills, their loot).
// Wave 5 (audio quick wins): a friend's (another hero's) hits, heals, spells, shots, level up and rez are audible too,
// marked `from: <their id>`; audio.js scales those by FRIEND.volume and the distance falloff (friendGain) and pans them.
// `key` is the throttle key for sounds that can repeat fast (cast_fail buzzer), `gap` its spacing in ms (default 1200).
// Ids are assets/audio/manifest.json ids (copied from Lexicon Quest).
//
// ctx: { me, cls, zone?, isPlayer?(id), clsOf?(id) }: isPlayer says an id is a hero (a friend when it is not me).

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
const GOOD_RARITY = new Set(['magic', 'rare', 'epic', 'legendary', 'set']);   // wave 10 dloot: epic (purple) gets the jingle too

const prefixOf = (ability) => String(ability || '').split('_')[0];
const auraId = (a) => String(a && a.id ? a.id : a || '');

// friends: quieter than your own sounds, and gone past FRIEND.far px (falloff in friendGain)
export const FRIEND = { volume: 0.5, near: 96, far: 640, pan: 0.6, panPx: 360, hitGap: 160 };

/** Distance falloff for a friend's sound: 1 within `near` px, 0 past `far` or in another zone, a smooth curve between. */
export function friendGain(dx, dy, sameZone = true) {
  if (!sameZone) return 0;
  const d = Math.hypot(dx || 0, dy || 0);
  if (d <= FRIEND.near) return 1;
  if (d >= FRIEND.far) return 0;
  const k = 1 - (d - FRIEND.near) / (FRIEND.far - FRIEND.near);
  return +(k * k).toFixed(4);
}
/** Stereo pan for a friend's sound from their offset to you (left negative). */
export function friendPan(dx) { return Math.max(-FRIEND.pan, Math.min(FRIEND.pan, (dx || 0) / FRIEND.panPx)); }

// failures that just buzz (the UI log says why)
const FAIL_TYPES = new Set(['interact_fail', 'train_fail', 'inventory_fail', 'talent_fail', 'trade_fail', 'group_fail', 'glyph_fail', 'home_fail',
  'mount_fail', 'ride_fail', 'flight_fail', 'prof_fail', 'door_locked', 'cmd_reject']);

/** A friend's own action, quieter and placed in the world (audio.js applies FRIEND.volume and the falloff). */
function friendSounds(ev, ctx, f, sfx, jingle) {
  const fx = (id, extra = {}) => sfx(id, { from: f, ...extra });
  switch (ev.type) {
    case 'damage': {
      if (ev.src !== f || ev.periodic || ev.result === 'immune' || !(ev.amount > 0)) break;
      if (ctx.isPlayer(ev.dst)) break;                                   // a splash on another hero: no sound
      const gap = { key: `f${f}:hit`, gap: FRIEND.hitGap };
      if (ev.crit) { fx('crit', { volume: 0.8, ...gap }); break; }
      if (HEAVY.has(ev.ability)) { fx('hit_heavy', gap); break; }
      const school = SCHOOL_HIT[ev.school];
      if (school) { fx(school, { volume: 0.8, ...gap }); break; }
      const p = prefixOf(ev.ability);
      const cls = CLASS_HIT[p] ? p : (ctx.clsOf ? ctx.clsOf(f) : null);
      fx(CLASS_HIT[cls] || 'hit_light', gap);
      break;
    }
    case 'heal':
      if (ev.src === f && !ev.periodic && ev.amount > 0) fx('heal', { volume: 0.8, key: `f${f}:heal`, gap: 300 });
      break;
    case 'cast_start': {
      if (ev.src !== f) break;
      if (CAST_START[ev.ability]) { fx(CAST_START[ev.ability], { volume: 0.8 }); break; }
      const p = prefixOf(ev.ability);
      if (p === 'scribe' && ev.castTicks > 0) fx('page_flutter', { volume: 0.6 });
      else if (p === 'mender' && ev.castTicks > 0) fx('buff', { volume: 0.4 });
      break;
    }
    case 'projectile':
      if (ev.src === f && (prefixOf(ev.ability) === 'wayfinder' || (ev.ability === 'auto' && ctx.clsOf && ctx.clsOf(f) === 'wayfinder'))) fx('bow_shot', { volume: 0.8, key: `f${f}:shot`, gap: 200 });
      break;
    case 'level':
      if (ev.id === f) jingle('level_up', { from: f, volume: 0.6 });
      break;
    case 'death':
      if (ev.id === f) fx('debuff', { volume: 0.9 });                     // a friend went down
      break;
    case 'rez':
      if (ev.kind === 'done' && (ev.src === f || ev.id === f)) fx('revive');
      else if (ev.kind === 'start' && ev.src === f) fx('buff', { volume: 0.6 });
      break;
    case 'aura_add':
      if (ev.dst === f && ev.src === f && /^mount_/.test(auraId(ev.aura))) fx('equip', { volume: 0.7 });   // a friend mounts up
      break;
    default: break;
  }
}

export function soundsFor(ev, ctx = {}) {
  const me = ctx.me;
  if (me == null || !ev) return [];
  const out = [];
  const sfx = (id, extra = {}) => out.push({ kind: 'sfx', id, ...extra });
  const jingle = (id, extra = {}) => out.push({ kind: 'jingle', id, ...extra });
  // another hero's own action (never mine, never a mob's): quieter, with distance
  if (ctx.isPlayer && ev.type !== 'join' && ev.type !== 'leave') {
    const f = [ev.src, ev.id, ev.dst].find((x) => x != null && x !== me && ctx.isPlayer(x));
    const mine = ev.src === me || ev.id === me || ev.dst === me;
    if (f != null && !mine) { friendSounds(ev, ctx, f, sfx, jingle); return out; }
  }
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
      if (/^mount_/.test(id)) { if (ev.dst === me) sfx('equip'); break; }   // mounted up (the summon cast finished)
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
    case 'death':
      if (ev.id !== me && (ev.tagger === me || ev.killer === me)) sfx('enemy_die', { volume: 0.8 });
      else if (ev.id === me) sfx('debuff');
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
      if ((ev.items || []).some((it) => it.inst && it.inst.rarity === 'legendary')) jingle('quest_done');   // wave 10 dloot: a legendary gets the bigger fanfare
      else if (good) jingle('item_get');
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
    // ---- wave 5: group, travel, mounts, dungeons, professions and the rest (only the 41 files on disk)
    case 'rez':
      if (ev.src !== me && ev.id !== me) break;
      if (ev.kind === 'done') sfx('revive');
      else if (ev.kind === 'start') sfx('buff', { volume: 0.6 });
      else if (ev.kind === 'stop') sfx('cancel', { volume: 0.6 });
      break;
    case 'death_wait':
      if (ev.id === me && ev.kind === 'release') sfx('cancel', { volume: 0.6 });
      break;
    case 'cheat_death':
      if (ev.id === me) sfx('defend');
      break;
    case 'trade':
      if (ev.id !== me) break;
      if (ev.kind === 'open') sfx('menu_open');
      else if (ev.kind === 'done') sfx('buy');
      else if (ev.kind === 'ready') sfx('confirm', { volume: 0.7 });
      else if (ev.kind === 'change') sfx('cursor', { volume: 0.6 });
      else if (ev.kind === 'close' && ev.reason !== 'done') sfx('menu_close');
      break;
    case 'ready_check':
      if (ev.id !== me) break;
      if (ev.kind === 'start') sfx('oath_ring');
      else if (ev.kind === 'answer') sfx(ev.yes ? 'confirm' : 'cancel', { volume: 0.7 });
      else if (ev.kind === 'done') sfx(ev.allYes ? 'lantern_reveal' : 'buzzer', { volume: 0.8 });
      break;
    case 'quest_share':
      if (ev.id === me) sfx('page_flutter', { volume: ev.kind === 'offer' ? 0.9 : 0.6 });
      break;
    case 'join':
      if (ev.id !== me) sfx('confirm', { volume: 0.7 });               // a friend arrives
      break;
    case 'leave':
      if (ev.id !== me) sfx('cancel', { volume: 0.7 });
      break;
    case 'flight_start':
      if (ev.id === me) sfx('buff');
      break;
    case 'flight_end':
      if (ev.id === me) sfx('lantern_reveal', { volume: 0.8 });
      break;
    case 'flight_point':
      if (ev.id === me) sfx('oath_ring', { volume: 0.8 });
      break;
    case 'ride_start':
      if (ev.id === me) sfx('buff', { volume: 0.8 });
      break;
    case 'mount_learn':
      if (ev.id === me) jingle('item_get');
      break;
    case 'dismount':
      if (ev.id === me) sfx('cancel', { volume: 0.5 });
      break;
    case 'hearth_start':
      if (ev.id === me) sfx('page_flutter', { volume: 0.6 });
      break;
    case 'hearth':
      if (ev.id === me) sfx('lantern_reveal');
      break;
    case 'hearth_stop':
      if (ev.id === me && ev.reason !== 'done') sfx('cancel', { volume: 0.5 });
      break;
    case 'home':
      if (ev.id === me) sfx('confirm');
      break;
    case 'lantern':
      if (ev.id === me && !ev.auto) sfx('lantern_reveal', { volume: 0.8 });
      break;
    case 'boss':
      if (ctx.zone && ev.zone !== ctx.zone) break;                      // a boss in another copy or zone
      if (ev.kind === 'pull') sfx('oath_ring');
      else if (ev.kind === 'phase') sfx('crit', { volume: 0.7 });
      else if (ev.kind === 'death') sfx('enemy_die');
      break;
    case 'dungeon_clear':
      if (ev.id === me) jingle('quest_done');
      break;
    case 'chest_open':
      if (ev.id === me && !ev.chest) sfx('item_use');                  // a dungeon chest or cache (a Lantern Chest window: the UI's open sound)
      break;
    case 'chest':
      if (ev.id === me) sfx('equip', { volume: 0.6 });
      break;
    case 'legendary': case 'secret_found':
      if (ev.id === me) jingle('item_get');
      break;
    case 'loot_lost':
      if (ev.id === me) sfx('buzzer', { volume: 0.5, key: 'fail' });
      break;
    case 'glyph':
      if (ev.id === me) sfx(ev.kind === 'socket' ? 'oath_ring' : 'cancel', { volume: 0.8 });
      break;
    case 'prof':
      if (ev.id !== me) break;
      if (ev.kind === 'recipe') sfx('page_flutter');
      else if (ev.kind === 'unlearn') sfx('cancel');
      else sfx('confirm');
      break;
    case 'prof_skill':
      if (ev.id === me) sfx('cursor', { volume: 0.6 });
      break;
    case 'prof_work':
      if (ev.id === me && ev.phase === 'done') sfx('item_use', { volume: 0.8 });
      break;
    case 'story': case 'quest_hook':
      if (ev.id === me) sfx('page_flutter', { volume: 0.7 });
      break;
    case 'windup':
      if (ev.target === me) sfx('debuff', { volume: 0.5, key: 'windup', gap: 600 });   // a foe winds up at you: look out
      break;
    case 'windup_break':
      if (ev.target === me) sfx('stun', { volume: 0.7 });
      break;
    case 'school_lock':
      if (ev.by === me) sfx('stun', { volume: 0.7 });                   // your interrupt landed
      break;
    case 'chime':
      sfx('oath_ring', { volume: 0.6, key: 'chime', gap: 2000 });
      break;
    case 'world_event':
      if (ev.on) sfx('lantern_reveal', { volume: 0.5 });
      break;
    case 'leap':
      if (ev.id === me) sfx(ev.kind === 'blink' ? 'buff' : 'defend', { volume: 0.6 });
      break;
    case 'sit':
      if (ev.id === me && ev.food) sfx('item_use', { volume: 0.6 });
      break;
    default:
      if (FAIL_TYPES.has(ev.type) && (ev.src ?? ev.id) === me) sfx('buzzer', { volume: 0.6, key: 'fail' });
      break;
  }
  return out;
}

// when several jingles land in one tick (a turn-in that levels you), only the best one plays
export const JINGLE_RANK = { level_up: 3, quest_done: 2, item_get: 1 };

// UI sounds (audio.ui(kind))
export const UI_SOUNDS = {
  open: 'menu_open', close: 'menu_close', cursor: 'cursor', confirm: 'confirm', cancel: 'cancel', error: 'buzzer',
  buy: 'buy', coin: 'coin', equip: 'equip', sell: 'coin', tab: 'cursor', click: 'cursor',
};
// per-kind volume for audio.ui() (a plain button click stays under the open / close sounds)
export const UI_VOLUME = { click: 0.45, tab: 0.6, cursor: 0.6 };

// zone music id -> track (zones name LQ track ids directly; this is for anything renamed)
export const MUSIC_ALIAS = { downs: 'the_downs', moor: 'high_moor', town: 'willowmere' };
