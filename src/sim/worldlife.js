// The open world's life (2026-11-22): rare named foes, rest XP, story cards and Night at the Stones. Pure and
// deterministic: no clock reads, no Math.random. Data: content.rares / rareRules (src/data/rares.js), content.rest,
// content.worldEvents, quest `story` tags (src/data/worldlife.js). world.js and progression.js call it at fixed points:
//
//   const L = createWorldLife(C)          C: the combat context (state, content, emit, rng, get, prog)
//   L.onMobDeath(m)                       after progression's onDeath: a rare picks its respawn time and next spot
//   L.extraLoot(mob, p, drop)             after rollKill: a rare's named item + a blue piece (gold 1 in 20); event gear
//   L.killBonus(p, mob, kx)               kill XP extras: { xp, extra: { rested?, event? } } or null
//   L.restore(e, spec)                    addPlayer: the rest bank from the save, plus the time away (spec.offlineSecs)
//   L.saveOf(e)                           saveFields: { xp } (the bank) or null when empty
//   L.hudOf(e)                            the HUD block: { banked, cap, resting, killMult }
//   L.tick(events)                        once per step, after the quests: event start / end, story cards, rest notes
//
// Rares: one mob each (a normal content spawn at its first spot). On death its respawn is 30 to 60 min of sim time and
// its next spot one of the others, both from hashString(seed, template, kill count): the same seed and the same kills
// give the same times and spots, and the world's rng stream is not touched. Rest XP: e.restXp (an integer, state).
import { hashString } from './hash.js';
import { isNight } from './clock.js';
import { SUB, TILE } from './constants.js';
import { rollGear } from './loot.js';

const tileToSub = (tx, ty) => [tx * TILE + TILE / 2, (ty + 1) * TILE - SUB];
const feet = (e) => [Math.floor(e.x / TILE), Math.floor((e.y - 1) / TILE)];

function weighted(rng, weights) {
  const keys = Object.keys(weights).sort();
  const total = keys.reduce((s, k) => s + weights[k], 0);
  let x = rng.next() * total;
  for (const k of keys) { x -= weights[k]; if (x < 0) return k; }
  return keys[keys.length - 1];
}

/** Two numbers in [0, 1) from a key (deterministic, independent of the world rng). */
export function hash01(key) {
  const h = hashString(key);
  return [parseInt(h.slice(0, 8), 16) / 4294967296, parseInt(h.slice(8, 16), 16) / 4294967296];
}

export function createWorldLife(C) {
  const { state, content, emit } = C;
  const RARES = content.rares || {};
  const RR = content.rareRules || {};
  const REST = content.rest || null;
  const EVENTS = content.worldEvents || [];
  const P = C.P;
  const xpToNext = (L) => (L >= P.maxLevel ? 0 : P.xpToNext[L] || 0);
  const ctx = { content, rng: C.rng };

  // ---------------------------------------------------------------- rares
  const rareOf = (m) => (m && m.kind === 'mob' ? RARES[m.template] || null : null);
  /** The respawn delay (ticks) and the next spot index of a rare after its n-th death. */
  function rareRoll(template, n, from) {
    const R = RARES[template];
    const [u, v] = hash01(`${state.seed}:${template}:${n}`);
    const [lo, hi] = R.respawn || [1800, 3600];
    const ticks = Math.round((lo + u * (hi - lo)) * 20);
    const k = R.spots.length;
    let spot = from;
    if (k > 1) { const j = Math.floor(v * (k - 1)); spot = j >= from ? j + 1 : j; }
    return { ticks, spot };
  }
  function onMobDeath(m) {
    const R = rareOf(m);
    if (!R || m.spawn.temporary) return;
    m.rareKills = (m.rareKills || 0) + 1;
    const { ticks, spot } = rareRoll(m.template, m.rareKills, m.rareSpot || 0);
    m.respawnAt = state.tick + ticks;
    m.rareSpot = spot;
    const [x, y] = tileToSub(R.spots[spot][0], R.spots[spot][1]);
    m.spawn.x = x; m.spawn.y = y;
  }

  /** A gear instance of a fixed item for this hero (armor kind / weapon type rolled to class, as a quest reward is). */
  function fixedInstance(p, itemId) {
    const def = content.items[itemId];
    if (!def) return null;
    const cg = (content.classGear || {})[p.cls];
    const inst = { ilvl: def.level, rarity: def.rarity, affixes: [] };
    if (def.armorType === 'class') inst.armorType = cg ? cg.armor : 'cloth';
    else if (Array.isArray(def.armorType)) inst.armorType = cg && def.armorType.includes(cg.armor) ? cg.armor : def.armorType[0];
    if (Array.isArray(def.weaponType)) inst.weaponType = cg ? (def.weaponType.find((w) => cg.weapons.includes(w)) || def.weaponType[0]) : def.weaponType[0];
    return inst;
  }
  // the looter's own class always (classBias 1), so the guaranteed piece is one they can wear
  const ownCtx = () => ({ content: { ...content, dropRules: { ...content.dropRules, classBias: 1 } }, rng: C.rng });
  function extraLoot(mob, p, drop) {
    if (!p || p.kind !== 'player') return;
    const R = rareOf(mob);
    if (R && mob.level - p.level > -5) {
      if (content.items[R.item]) drop.items.push({ item: R.item, qty: 1, inst: fixedInstance(p, R.item) });
      const rar = C.rng.chance(RR.upgradeChance ?? 0.05) ? (RR.upgradeRarity || 'rare') : (RR.extraRarity || 'magic');
      drop.items.push(rollGear(ownCtx(), { ilvl: mob.level, source: 'normal', cls: p.cls, rarity: rar }));
    }
    const ev = eventOf(mob);
    if (ev && ev.gear && mob.level - p.level > -5 && C.rng.chance(ev.gear.chance)) {
      drop.items.push(rollGear(ownCtx(), { ilvl: mob.level, source: 'normal', cls: p.cls, rarity: weighted(C.rng, ev.gear.weights) }));
    }
  }

  // ---------------------------------------------------------------- world events (Night at the Stones)
  const eventActive = (ev) => (ev.when === 'night' ? isNight(state.tick) : true);
  function eventOf(m) {
    if (!m || m.kind !== 'mob' || !m.spawn || !m.spawn.group) return null;
    for (const ev of EVENTS) if ((ev.groups || []).includes(m.spawn.group) && eventActive(ev)) return ev;
    return null;
  }

  // ---------------------------------------------------------------- rest XP
  function restCap(e) { return REST && e.level < P.maxLevel ? Math.round(REST.capLevels * xpToNext(e.level)) : 0; }
  /** Would the hero rest here: inside a safe area (a town, a hub) or within REST.lanternTiles of a lantern. */
  function restingNow(e) {
    if (!REST || !e || e.kind !== 'player' || e.dead) return false;
    const z = content.zones[e.zone];
    if (!z) return false;
    const [tx, ty] = feet(e);
    for (const a of z.areas || []) if (a.safe && tx >= a.x && ty >= a.y && tx < a.x + a.w && ty < a.y + a.h) return true;
    const r = REST.lanternTiles || 0;
    for (const l of z.lanterns || []) if (Math.hypot(l.x - tx, l.y - ty) <= r) return true;
    return false;
  }
  function restore(e, spec) {
    if (!REST || !e || e.kind !== 'player') return;
    const saved = spec && spec.rest && Number.isFinite(+spec.rest.xp) ? Math.max(0, Math.round(+spec.rest.xp)) : 0;
    const cap = restCap(e);
    let bank = Math.min(cap, saved);
    let gained = 0;
    const secs = spec && Number.isFinite(+spec.offlineSecs) ? Math.max(0, Math.min(+spec.offlineSecs, REST.maxOfflineHours * 3600)) : 0;
    if (secs > 0 && cap > 0 && restingNow(e)) {
      const add = Math.round((secs / 3600) * REST.levelsPerHour * xpToNext(e.level));
      gained = Math.max(0, Math.min(cap, bank + add) - bank);
      bank += gained;
    }
    e.restXp = bank;
    if (gained > 0 || bank > 0) e.restNote = { gained, bank };
  }
  function saveOf(e) { return e && e.restXp > 0 ? { xp: e.restXp } : null; }
  function hudOf(e) {
    if (!REST) return null;
    return { banked: e.level < P.maxLevel ? e.restXp || 0 : 0, cap: restCap(e), resting: restingNow(e), killMult: REST.killMult };
  }

  function killBonus(p, m, kx) {
    if (!p || p.kind !== 'player' || !(kx > 0)) return null;
    let xp = 0;
    const extra = {};
    const ev = eventOf(m);
    if (ev && ev.xpBonus) { const b = Math.round(kx * ev.xpBonus); if (b > 0) { xp += b; extra.event = b; extra.eventId = ev.id; } }
    if (REST && p.restXp > 0 && p.level < P.maxLevel) {
      const b = Math.min(p.restXp, Math.round(kx * ((REST.killMult || 2) - 1)));
      if (b > 0) { p.restXp -= b; xp += b; extra.rested = b; }
    }
    return xp > 0 ? { xp, extra } : null;
  }

  // ---------------------------------------------------------------- once per step
  function tick(events) {
    // the event clock: announce a change of night and day (not the first tick of a world)
    if (EVENTS.length) {
      const night = isNight(state.tick);
      if (state.lifeNight == null) state.lifeNight = night;
      else if (state.lifeNight !== night) {
        state.lifeNight = night;
        for (const ev of EVENTS) if (ev.when === 'night') emit({ type: 'world_event', event: ev.id, name: ev.name, on: night, region: ev.region, text: night ? ev.text.start : ev.text.end });
      }
    }
    // the story card when the last step of a chain is handed in
    const n = events.length;
    for (let i = 0; i < n; i++) {
      const ev = events[i];
      if (ev.type !== 'quest' || ev.kind !== 'turnin') continue;
      const q = (content.quests || {})[ev.quest];
      if (q && q.story && q.story.end) emit({ type: 'story', id: ev.id, quest: ev.quest, chain: q.story.id, title: q.story.end.title, lines: [...q.story.end.lines] });
    }
    // the rest note of a hero who just came back (addPlayer runs between steps, so it is said on the first one)
    for (const e of state.ents) {
      if (e.kind !== 'player' || !e.restNote) continue;
      emit({ type: 'rest', id: e.id, gained: e.restNote.gained, banked: e.restNote.bank, cap: restCap(e) });
      e.restNote = null;
    }
  }

  return { onMobDeath, extraLoot, killBonus, restore, saveOf, hudOf, tick, restingNow, restCap, rareRoll, eventOf, isRare: (m) => !!rareOf(m) };
}
