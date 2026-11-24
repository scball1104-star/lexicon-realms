// Sim event -> synth sound (wave 5b), as data beside sfx_table.js. Pure: no DOM, no audio; node-tested
// (qa/tests/synth_game.test.mjs). Names are bank names in src/audio/synth/render.js.
//
//   synthSoundsFor(ev, ctx) -> [{ name, at?, volume?, key?, gap?, replace? }]
//     at       entity id the sound comes from (audio places it by distance and pans it; null: at you)
//     replace  true: the synth sound stands in for the sfx_table sound of the same event (a door's rattle, not a buzzer)
//   ctx: { me, isPlayer(id), ent(id) -> { kind, template, x, y, zone } | null, family(template) -> data family }
//
// Busy events stay quiet on purpose: target, spawn, despawn, aura, aura_remove, bar, bar_fail, combo, xp, copy_new,
// copy_reset, group_scale, loot_pending, script, class (they fire too often, or a sound would say nothing new).
import { familyVoice } from './synth_places.js';
import { seedFromText } from './synth/rng.js';

const SHAPES = ['hey', 'hm', 'huh', 'aha', 'oh', 'mmhm'];

/** An NPC keeps one voice and a habit: band 0..2 and a favourite shape from its template name. */
export function npcVoice(template) {
  const s = seedFromText(String(template || 'npc'));
  return { band: s % 3, shape: SHAPES[(s >>> 3) % SHAPES.length], alt: SHAPES[(s >>> 7) % SHAPES.length] };
}

export function synthSoundsFor(ev, ctx = {}) {
  const me = ctx.me;
  if (me == null || !ev) return [];
  const out = [];
  const add = (name, extra = {}) => out.push({ name, ...extra });
  const heroOf = (id) => id != null && (id === me || (ctx.isPlayer && ctx.isPlayer(id)));
  const ent = (id) => (ctx.ent ? ctx.ent(id) : null);
  const fam = (id) => { const e = ent(id); return e ? familyVoice(e.template, ctx.family ? ctx.family(e.template) : '') : null; };
  const voice = (id, mood, extra) => { const f = fam(id); if (f) add(`voice:${f}:${mood}`, { at: id, ...extra }); };
  switch (ev.type) {
    case 'threat':        // a foe turns on you or a friend: its voice (once in a while per foe)
      if (heroOf(ev.top)) voice(ev.mob, 'aggro', { key: `ag${ev.mob}`, gap: 9000 });
      break;
    case 'damage': {      // a foe you or a friend hit: a hurt sound now and then
      const d = ent(ev.dst);
      if (!d || d.kind !== 'mob' || !heroOf(ev.src) || ev.periodic || !(ev.amount > 0) || ev.result === 'immune') break;
      voice(ev.dst, 'hurt', { volume: 0.6, key: `hu${ev.dst}`, gap: 2600 });
      break;
    }
    case 'death':
      if (ev.kind === 'mob' && (heroOf(ev.killer) || heroOf(ev.tagger))) voice(ev.id, 'death');
      break;
    case 'flee': case 'mob_emote':     // mob_emote with an id is the flee line
      if (ev.id != null) voice(ev.id, 'flee', { key: `fl${ev.id}`, gap: 4000 });
      break;
    case 'evade':                      // it gives up and walks home: a short grumble
      voice(ev.id, 'aggro', { volume: 0.4, key: `ev${ev.id}`, gap: 9000 });
      break;
    case 'yell': {
      const e = ent(ev.id);
      if (!e) break;
      if (e.kind === 'npc') { const v = npcVoice(e.template); add(`bark:aha:${v.band}`, { at: ev.id, key: `y${ev.id}`, gap: 3000 }); }
      else voice(ev.id, 'aggro', { volume: 0.9, key: `y${ev.id}`, gap: 3000 });
      break;
    }
    case 'interact': {                 // you speak to someone: they answer without words
      if (ev.src !== me || !ev.npc) break;
      const v = npcVoice(ev.npc);
      add(`bark:${v.shape}:${v.band}`, { at: ev.id, key: 'talk', gap: 900 });
      break;
    }
    case 'quest_dialog': {
      if (ev.id !== me) break;
      const v = npcVoice(ev.npc);
      add(`bark:${ev.offers && ev.offers.length ? v.shape : v.alt}:${v.band}`, { at: ev.ent, key: 'talk', gap: 900 });
      break;
    }
    case 'windup_miss':
      if (ev.target === me) add('whiff', { volume: 0.8 });
      break;
    case 'cast_stop':
      if (ev.src === me && ev.reason && ev.reason !== 'done') add('fizzle', { volume: 0.6, key: 'fizzle', gap: 500 });
      break;
    case 'mob_heal_cast':
      add('mobheal', { at: ev.id, volume: 0.7, key: `mh${ev.id}`, gap: 1500 });
      break;
    case 'area':
      if (ev.id === me && ev.name) add('chime:area', { volume: 0.55, key: 'area', gap: 30000 });
      break;
    case 'rest':
      if (ev.id === me) add('chime:rest', { volume: 0.6, key: 'rest', gap: 20000 });
      break;
    case 'door_locked':
      if (ev.id === me) add('locked', { replace: true, key: 'locked', gap: 1200 });
      break;
    case 'chest_open':
      if (ev.id === me || ev.src === me) add('chest', { replace: true });
      break;
    case 'zone':                       // through a door or a gate (not a flight, a hearth stone or a respawn)
      if (ev.id === me && !ev.why && !ev.ride && ev.from !== ev.to && ev.kind) add('door', { volume: 0.8 });
      break;
    default: break;
  }
  return out;
}
