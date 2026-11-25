// Dungeons and caves (dungeons build, 2026-11-22; CONTRACTS "Dungeons and caves"). Pure: no clock, no Math.random.
//
//   const DG = createDungeons(D)     D = { state, content, emit, rng, get, add, remove, spawnMob, nextId, tileToSub, grantXp,
//                                          killXp(level), stats?, combat?, ai? }
//   DG.isPlace(zid)                  is this zone (or copy) a dungeon or a cave
//   DG.enter(p, base) -> zid         the party's copy of `base` (made, or reset after 30 minutes empty) and its lantern
//   DG.leave(p, fromZid)             back on the world: the lantern the hero had outside comes back
//   DG.tick()                        once per world step: copies with nobody inside for 30 minutes reset
//   DG.onKill(mob, p, drop)          boss drops for the killer, the last boss's rare, legendary roll and the daily chest
//   DG.openChest(p, t)               a copy's chest (once per hero) or the daily chest (its hero, once per day)
//   DG.bossTick(m) / DG.bossReset(m) the boss script (phases by health, frenzy timer); ai.js calls them
//   DG.info(zid)                     { id, base, kind, name, levels, label } for the snapshot, the zone event and the HUD
//   DG.loadSpec(spec)                a save made inside a place loads at the place's door on the world
//
// A copy is the place's zone data under the zone id `<place>#<key>`; key = the party (p.party), today the hero's id.
// Every rule that compares zones keeps two copies apart with no extra code. Foes in a copy never respawn: a boss killed
// stays dead in that copy. The copy resets (every entity in it goes, and the place spawns fresh on the next entry) when no
// hero has been inside for DUNGEON_RULES.resetSec of sim time.
import { createBossMech } from './boss_mech.js';   // wave 10 dbosses: boss fights that need the party
export const COPY_SEP = '#';
export const zoneBase = (id) => { const s = String(id); const i = s.indexOf(COPY_SEP); return i < 0 ? s : s.slice(0, i); };
const WRAPPED = new WeakSet();
/** A zones table where zones['barrow#12'] reads ZONES.barrow (src/data/maps/copies.js has the same). */
export function withCopies(zones) {
  if (!zones || WRAPPED.has(zones)) return zones;
  const own = (t, k) => Object.prototype.hasOwnProperty.call(t, k);
  const p = new Proxy(zones, {
    get(t, k) { if (typeof k !== 'string' || own(t, k)) return t[k]; const b = zoneBase(k); return b !== k && own(t, b) ? t[b] : t[k]; },
    has(t, k) { if (typeof k !== 'string') return k in t; const b = zoneBase(k); return k in t || (b !== k && own(t, b)); },
  });
  WRAPPED.add(p);
  return p;
}

const TICK_HZ = 20;
const T = (sec) => Math.round((sec || 0) * TICK_HZ);
const LETTERS = 'abcdefghijklmnopqrstuvwxyz', VOWELS = 'aeiou';

import { createDloot, lootSummary } from './dloot.js';   // wave 10 dloot
import { itemName } from './loot.js';

export function createDungeons(D) {
  const { state, content, emit, rng } = D;
  const PL = content.dungeons || {};
  const R = content.dungeonRules || { resetSec: 1800, questMinuteKills: 4 };
  const now = () => state.tick;
  const zones = content.zones;
  const copies = () => (state.copies = state.copies || {});
  const DL = createDloot(content);   // wave 10 dloot: boss drops (src/sim/dloot.js)
  // wave 10 dbosses: gates, marks, the red slot, the Last Count, Unspoken (src/sim/boss_mech.js, src/data/boss_fights.js)
  const BM = content.bossFights && content.bossRules && D.combat ? createBossMech({ state, content, emit, get: D.get, combat: D.combat, summon: (m, s, b) => summon(m, s, b), dun: (p) => dun(p) }) : null;

  const placeOf = (zid) => PL[zoneBase(zid)] || null;
  function isPlace(zid) { const z = zid != null ? zones[zid] : null; return !!(z && (z.kind === 'dungeon' || z.kind === 'cave')); }
  const copyKey = (p) => (p.party != null ? `party${p.party}` : String(p.id));
  const world = () => zones[content.worldId || 'world'];

  function info(zid) {
    if (!isPlace(zid)) return null;
    const z = zones[zid], base = zoneBase(zid), d = z.dungeon || {};
    return { id: zid, base, kind: z.kind, name: z.name, levels: z.levels ? [...z.levels] : null, label: d.label || '' };
  }
  /** The world tile outside a place's door (where its exit and a load from inside put you). */
  function doorOut(base) {
    const dr = ((world() || {}).doors || []).find((x) => x.id === base);
    if (dr) return dr.out;
    const z = zones[base];
    const j = z && (z.joins || [])[0];
    return j ? [j.tx, j.ty] : [content.start.x, content.start.y];
  }
  function nearestWorldLantern(x, y) {
    const W = world();
    let best = null, bd = Infinity;
    for (const l of (W && W.lanterns) || []) { const d = (l.x - x) ** 2 + (l.y - y) ** 2; if (d < bd) { bd = d; best = l; } }
    return best ? { zone: W.id, id: best.id, x: best.x, y: best.y } : null;
  }

  // ---------------------------------------------------------------- copies
  function spriteFor(mob, level) {
    const ms = (content.mobSprites || {})[mob];
    if (!ms) return null;
    let out = ms.sprite;
    for (const [L, v] of Object.entries(ms.byLevel || {})) if (level >= +L) out = v;
    return out;
  }
  function spawnCopy(zid) {
    const z = zones[zid];
    for (const s of z.spawns || []) {
      const m = D.spawnMob({ ...s, zone: zid, respawn: null, sprite: spriteFor(s.mob, s.level) || undefined });
      m.spawn.noRespawn = true;
      m.spawn.copy = zid;
      if (s.boss) m.spawn.boss = true;
      if (s.held) m.spawn.held = s.held;           // wave 10 drift: a rift's held room (src/sim/rift.js wakes it)
      const gt = s.boss && placeOf(zid) && placeOf(zid).guardianTune;   // wave 10 drift: the dtiers hook on a rift's guardian (never below 1)
      if (gt && D.stats) { m.spawn.tune = { hp: gt.hp || 1, dmg: gt.dmg || 1 }; D.stats().recalc(m); m.hp = m.hpMax; }   // wave 10 drift
      // the place's trash tuning (dungeons.js `trash`: a solo hero pulls these one pack at a time); bosses tune in mobs.js
      const tune = !s.boss && placeOf(zid) && placeOf(zid).trash;
      if (tune && D.stats) { m.spawn.tune = { hp: tune.hp || 1, dmg: tune.dmg || 1 }; D.stats().recalc(m); m.hp = m.hpMax; }
    }
    for (const c of (z.dungeon && z.dungeon.chests) || []) addChest(zid, c.x, c.y, c.id, c.name || 'Chest', { kind: 'cache' });
  }
  function addChest(zid, tx, ty, template, name, dchest) {
    const [x, y] = D.tileToSub(tx, ty);
    const e = D.add({
      id: D.nextId(), kind: 'object', zone: zid, x, y, dir: 'down', moving: false, name, level: 1, faction: 'neutral',
      sprite: 'chest_gold', template, hp: 1, hpMax: 1, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
      node: { item: null, respawn: 0, channel: 0, perPlayer: true, readyAt: 0, secret: { id: template } },
      dchest: { place: zoneBase(zid), opened: [], ...dchest },
    });
    if (now() > 0) emit({ type: 'spawn', id: e.id, template, zone: zid, kind: 'object' });
    return e;
  }
  function destroy(zid, reason = 'reset') {
    for (const e of [...state.ents]) if (e.zone === zid && e.kind !== 'player') D.remove(e);
    delete copies()[zid];
    emit({ type: 'copy_reset', zone: zid, place: zoneBase(zid), reason });
  }
  const resetTicks = () => T(R.resetSec || 1800);
  function ensureCopy(base, p) {
    const zid = `${base}${COPY_SEP}${copyKey(p)}`;
    const c = copies()[zid];
    if (c && c.emptySince != null && now() - c.emptySince >= resetTicks()) destroy(zid);
    if (!copies()[zid]) {
      copies()[zid] = { base, key: copyKey(p), made: now(), emptySince: null, cleared: false };
      spawnCopy(zid);
      emit({ type: 'copy_new', zone: zid, place: base });
    }
    copies()[zid].emptySince = null;
    return zid;
  }
  function tick() {
    if (now() % TICK_HZ !== 0) return;
    const all = copies();
    for (const zid of Object.keys(all)) {
      const c = all[zid];
      const inside = state.ents.some((e) => e.kind === 'player' && e.zone === zid);
      if (inside) c.emptySince = null;
      else if (c.emptySince == null) c.emptySince = now();
      else if (now() - c.emptySince >= resetTicks()) destroy(zid);
    }
  }
  /** A hero steps through a door into `base`: their copy, with the inside lantern bound (the outside one is kept). */
  function enter(p, base) {
    const zid = ensureCopy(zoneBase(base), p);
    if (p.lantern && !isPlace(p.lantern.zone)) p.lanternOut = { ...p.lantern };
    const l = (zones[zid].lanterns || [])[0];
    if (l) {
      p.lantern = { zone: zid, id: l.id, x: l.x, y: l.y };
      emit({ type: 'lantern', id: p.id, zone: zid, lantern: l.id, name: l.name || l.id, auto: true });
    }
    if (D.onEnter) D.onEnter(p, zid);              // wave 10 dflow: level sync, the seat and the run record (src/sim/delve.js)
    return zid;
  }
  function leave(p) {
    if (D.onLeave) D.onLeave(p);                   // wave 10 dflow: back to the hero's own level
    if (p.lanternOut) { p.lantern = p.lanternOut; delete p.lanternOut; }
    else if (p.lantern && isPlace(p.lantern.zone)) { const L = nearestWorldLantern(Math.floor(p.x / 256), Math.floor((p.y - 1) / 256)); if (L) p.lantern = L; }
  }
  /** addPlayer: a save made inside a place loads at that place's door outside (the copy is not kept across a load). */
  function loadSpec(spec) {
    if (!spec) return spec;
    let out = spec;
    // wave 10 dflow: a friend who rejoins the party's game while it is inside a copy comes back into that copy
    // (coop.js puts the guest beside the host; world.addPlayer then calls enter for the lantern, the sync and the seat)
    const own = spec.zone != null && spec.party != null && copies()[spec.zone] && copies()[spec.zone].key === `party${spec.party}`;
    if (own) return spec;
    if (spec.zone != null && isPlace(spec.zone)) {
      const [x, y] = doorOut(zoneBase(spec.zone));
      // a place whose door stands in another outdoor zone (the Larch Mine in Larchhill) loads outside it, there
      const ex = ((zones[zoneBase(spec.zone)] || {}).joins || [])[0];
      const outZone = ex && zones[ex.to] && !(world() && ex.to === world().id) && !((world() || {}).doors || []).some((d) => d.id === zoneBase(spec.zone)) ? ex.to : null;
      out = { ...out, zone: outZone || (world() ? world().id : content.start.zone), x, y };
    }
    if (spec.lantern && isPlace(spec.lantern.zone)) {
      const L = spec.lanternOut && !isPlace(spec.lanternOut.zone) ? spec.lanternOut : nearestWorldLantern(...doorOut(zoneBase(spec.lantern.zone)));
      out = { ...out, lantern: L || undefined };
      if (!L) delete out.lantern;
    }
    return out;
  }

  // ---------------------------------------------------------------- loot
  const items = () => content.items || {};
  function fits(id, cls) {
    const def = items()[id];
    if (!def) return false;
    if (def.classes && !def.classes.includes(cls)) return false;
    const cg = (content.classGear || {})[cls];
    if (!cg) return true;
    if (def.kind === 'weapon') return (Array.isArray(def.weaponType) ? def.weaponType : [def.weaponType]).some((w) => cg.weapons.includes(w));
    if (def.kind === 'armor' && def.slot !== 'trinket') {
      const a = def.armorType;
      if (a === 'class') return true;
      if (Array.isArray(a)) return a.includes(cg.armor);
      return a === cg.armor;                    // the class's own armor kind (a plate wearer is not offered cloth)
    }
    return true;
  }
  const dayOf = () => state.day | 0;
  function dun(p) { if (!p.dungeons || typeof p.dungeons !== 'object') p.dungeons = { day: dayOf(), done: [], miss: 0 }; return p.dungeons; }
  function doneToday(p, base) { const d = p.dungeons; return !!(d && d.day === dayOf() && (d.done || []).includes(base)); }

  function onKill(mob, p, drop) {
    const place = placeOf(mob.zone);
    if (!place || !isPlace(mob.zone) || !p || p.kind !== 'player') return;
    const tpl = mob.template;
    const mt = (content.mobs || {})[tpl] || {};
    if (mt.fight || mt.boss || mt.rare) {
      if (BM) BM.onDeath(mob);                        // wave 10 dbosses: a clear of this boss for each hero in the copy
      emit({ type: 'boss', id: mob.id, kind: 'death', template: tpl, zone: mob.zone, ...(mt.deathLine ? { text: mt.deathLine } : {}) });
      if (mob.ai && mob.ai.boss) for (const aid of mob.ai.boss.adds || []) { const a = D.get(aid); if (a && !a.dead && a.ai && a.ai.mode !== 'combat') { D.remove(a); emit({ type: 'despawn', id: a.id, template: a.template, zone: a.zone, kind: 'mob' }); } }
    }
    if (!(place.bosses || []).includes(tpl)) return;
    // wave 10 dloot (src/sim/dloot.js, D:/LQOnline/wave10/dloot/BRIEF.md): the boss's named piece, set piece, epic and the
    // legendary roll come from this hero's own seed (the copy, the hero, the boss, their kills of it in this copy), with
    // rolled lines, quality, Illuminated, smart loot and the per place Tally. The world's shared stream is not drawn from.
    {
      const c0 = copies()[mob.zone];
      const kills = c0 ? (c0.kills = c0.kills || {}) : {};
      const kk = `${p.id}:${tpl}`;
      const n = kills[kk] || 0;
      kills[kk] = n + 1;
      const d = dun(p);
      if (!d.tally) d.tally = {};
      if (d.tally[place.id] == null) d.tally[place.id] = d.miss || 0;     // a hero from before the Tally: the old count seeds each place once
      const out = DL.bossDrop({ seed: DL.seedFor({ world: state.seed, zid: mob.zone, made: c0 ? c0.made : 0, hero: p.id, tpl, n }), place: place.id, tpl,
        hero: { cls: p.cls, equip: p.equip, bag: p.bag, pendingLoot: p.pendingLoot, track: p.build && p.build.track }, tally: d.tally[place.id] });
      for (const it of out.items) drop.items.push(it);
      if (out.legend) {
        d.tally[place.id] = out.tally;
        d.miss = out.tally;                                              // the old field mirrors the last place's count (old readers)
        if (out.legend.got) emit({ type: 'legendary', id: p.id, item: out.legend.item, place: place.id, chance: out.legend.chance, misses: out.legend.misses,
          illum: !!(out.items.find((x) => x.item === out.legend.item) || { inst: {} }).inst.illum });
      }
      if (c0) { const L = (c0.loot = c0.loot || {}); (L[p.id] = L[p.id] || []).push(...out.items.map((x) => ({ item: x.item, inst: x.inst, from: tpl }))); }
      emit({ type: 'dloot', id: p.id, place: place.id, zone: mob.zone, from: mob.id, boss: tpl, items: out.items.map((x) => ({ item: x.item, name: itemName(content, x), rarity: x.inst.rarity, illum: !!x.inst.illum, q: x.inst.q })),
        ...(out.legend ? { tally: out.tally, sure: DL.rules.tally.sure, chance: out.legend.chance } : {}) });
    }
    if (tpl !== place.last) return;
    const c = copies()[mob.zone];
    if (c) c.cleared = true;
    const first = !!place.daily && !doneToday(p, place.id);
    emit({ type: 'dungeon_clear', id: p.id, place: place.id, zone: mob.zone, first });
    if (first) {
      const [tx, ty] = [Math.floor(mob.spawn.x / 256) + 1, Math.floor((mob.spawn.y - 1) / 256)];
      const z = zones[mob.zone];
      const ok = (x, y) => z.collision[y] && z.collision[y][x] === '.';
      const spot = [[tx, ty], [tx - 2, ty], [tx, ty + 1], [tx + 1, ty + 1], [tx - 1, ty - 1]].find(([x, y]) => ok(x, y)) || [tx - 1, ty];
      addChest(mob.zone, spot[0], spot[1], `${place.id}_daily`, 'First Clear of the Day', { kind: 'daily', for: p.id });
    }
  }

  function chestFail(p, t, reason) { emit({ type: 'interact_fail', src: p.id, id: t.id, reason }); return false; }
  function openChest(p, t) {
    const c = t.dchest, place = PL[c.place];
    if (!place) return chestFail(p, t, 'empty');
    if (c.opened.includes(p.id)) return chestFail(p, t, 'used');
    const C2 = content.dropRules ? { ...content, dropRules: { ...content.dropRules, classBias: 1 } } : content;
    if (c.kind === 'daily') {
      if (c.for != null && c.for !== p.id) return chestFail(p, t, 'not_yours');
      if (doneToday(p, c.place)) return chestFail(p, t, 'used');
      const dl = place.daily;
      const gear = D.rollGear({ content: C2, rng }, { ilvl: dl.ilvl, source: 'chest_gold', cls: p.cls, rarity: dl.rarity });
      if (gear && D.bagAdd(p, gear.item, 1, gear.inst, content) < 1) return chestFail(p, t, 'bag_full');
      const gold = rng.int(dl.gold[0], Math.max(dl.gold[0], dl.gold[1]));
      const glyphs = [];
      for (let i = 0; i < (dl.glyphs || 0); i++) {
        const vowel = rng.chance(0.2);
        const pool = vowel ? VOWELS : LETTERS.split('').filter((L) => !VOWELS.includes(L)).join('');
        const id = `glyph_${pool[rng.int(0, pool.length - 1)]}`;
        if (items()[id]) { D.bagAdd(p, id, 1, null, content); glyphs.push(id); }
      }
      p.gold = (p.gold || 0) + gold;
      const d = dun(p);
      if (d.day !== dayOf()) { d.day = dayOf(); d.done = []; }
      d.done.push(c.place);
      c.opened.push(p.id);
      const xp = Math.round((dl.xpMinutes || 0) * (R.questMinuteKills || 4) * D.killXp(p.level));
      emit({ type: 'chest_open', id: p.id, from: t.id, place: c.place, kind: 'daily', gold, xp, glyphs });
      emit({ type: 'loot', id: p.id, from: t.id, gold, items: [...(gear ? [{ item: gear.item, qty: 1, inst: gear.inst }] : []), ...glyphs.map((g) => ({ item: g, qty: 1 }))] });
      emit({ type: 'gold', id: p.id, amount: gold, total: p.gold, source: 'dungeon' });
      if (xp > 0) D.grantXp(p, xp, 'dungeon', { place: c.place });
      if (D.onBag) D.onBag(p);
      return true;
    }
    const ch = place.chest || { gold: [5, 10], rarity: 'magic', ilvl: (place.levels || [1, 1])[1] };
    const gear = D.rollGear({ content: C2, rng }, { ilvl: ch.ilvl, source: 'chest_iron', cls: p.cls, rarity: ch.rarity });
    if (gear && D.bagAdd(p, gear.item, 1, gear.inst, content) < 1) return chestFail(p, t, 'bag_full');
    const gold = rng.int(ch.gold[0], Math.max(ch.gold[0], ch.gold[1]));
    p.gold = (p.gold || 0) + gold;
    c.opened.push(p.id);
    emit({ type: 'chest_open', id: p.id, from: t.id, place: c.place, kind: 'cache', gold });
    emit({ type: 'loot', id: p.id, from: t.id, gold, items: gear ? [{ item: gear.item, qty: 1, inst: gear.inst }] : [] });
    emit({ type: 'gold', id: p.id, amount: gold, total: p.gold, source: 'dungeon' });
    if (D.onBag) D.onBag(p);
    return true;
  }

  // ---------------------------------------------------------------- boss scripts (mobs.js `fight`)
  // phases: [{ at: 0.5, yell, summon: { mob, level, count, from? } }] once each as health falls past `at`;
  // frenzy: { after: s, yell, mods } a lasting buff `after` s into the fight. Both restart when the boss resets.
  function bossTick(m) {
    const f = ((content.mobs || {})[m.template] || {}).fight;
    if (!f || (!f.phases && !f.frenzy) || m.dead) return;
    const b = m.ai.boss || (m.ai.boss = { t0: now(), phases: [], frenzy: false, adds: [] });
    if (b.t0 === now()) emit({ type: 'boss', id: m.id, kind: 'pull', template: m.template, zone: m.zone });
    (f.phases || []).forEach((ph, i) => {
      if (b.phases.includes(i) || m.hp / m.hpMax > ph.at) return;
      b.phases.push(i);
      if (ph.yell) emit({ type: 'yell', id: m.id, text: ph.yell });
      emit({ type: 'boss', id: m.id, kind: 'phase', phase: i + 1, at: ph.at, template: m.template, zone: m.zone });
      if (ph.summon) summon(m, ph.summon, b);
    });
    if (f.frenzy && !b.frenzy && now() - b.t0 >= T(f.frenzy.after)) {
      b.frenzy = true;
      if (D.combat) D.combat().applyAura(m, m, { id: 'boss_frenzy', name: 'Frenzy', icon: 'frenzy', kind: 'buff', duration: null, mods: f.frenzy.mods || [] }, {});
      if (f.frenzy.yell) emit({ type: 'yell', id: m.id, text: f.frenzy.yell });
      emit({ type: 'boss', id: m.id, kind: 'frenzy', template: m.template, zone: m.zone });
    }
    if (BM) BM.tick(m, b);                            // wave 10 dbosses
  }
  function summon(m, s, b) {
    const z = zones[m.zone];
    let at = null;
    if (s.from && z.script) for (const sc of Object.values(z.script)) if (sc && Array.isArray(sc[s.from])) at = sc[s.from];
    const bx = at ? at[0] : Math.floor(m.x / 256), by = at ? at[1] : Math.floor((m.y - 1) / 256);
    const free = (x, y) => z.collision[y] && z.collision[y][x] === '.';
    const foe = m.ai && m.ai.target != null ? D.get(m.ai.target) : null;
    for (let i = 0; i < (s.count || 1); i++) {
      const ring = [[2, 0], [-2, 0], [0, 2], [0, -2], [2, 2], [-2, -2], [2, -2], [-2, 2]];
      let [x, y] = [bx + ring[i % ring.length][0], by + ring[i % ring.length][1]];
      if (!free(x, y)) [x, y] = [bx, by];
      const a = D.spawnMob({ zone: m.zone, mob: s.mob, level: s.level || m.level, x, y, wander: 0, temporary: true });
      a.bossAdd = m.id;
      b.adds.push(a.id);
      const tune = placeOf(m.zone) && placeOf(m.zone).trash;
      // a boss's adds are lighter again than its trash (`adds`, default x0.6): they are a distraction, not a second boss
      const ad = (placeOf(m.zone) || {}).adds || { hp: 0.6, dmg: 0.6 };
      if (tune && D.stats) { a.spawn.tune = { hp: (tune.hp || 1) * ad.hp, dmg: (tune.dmg || 1) * ad.dmg }; D.stats().recalc(a); a.hp = a.hpMax; }
      if (foe && !foe.dead && foe.zone === a.zone && D.ai) { a.threat[foe.id] = 1; D.ai().engage(a, foe, false); }
    }
  }
  /** The boss evaded (its foes died or ran): its script starts over, and the adds it called go with it. */
  function bossReset(m) {
    const mt = (content.mobs || {})[m.template] || {};
    if (!mt.fight && !mt.boss) return;                // every other foe evades as it always did
    const b = m.ai && m.ai.boss;
    if (m.ai) m.ai.used = {};                       // once-triggers (the Sentinel's Order Given) work again on the next pull
    // adds a boss ability called (the Sentinel's Order Given: temporary foes near the boss) go too
    for (const a of [...state.ents]) {
      if (a.kind !== 'mob' || a === m || a.dead || !a.spawn || !a.spawn.temporary || a.zone !== m.zone || a.bossAdd != null) continue;
      if (Math.hypot(a.x - m.spawn.x, a.y - m.spawn.y) / 256 > 24) continue;
      D.remove(a); emit({ type: 'despawn', id: a.id, template: a.template, zone: a.zone, kind: 'mob', reason: 'boss_reset' });
    }
    if (!b) return;
    for (const aid of b.adds || []) { const a = D.get(aid); if (a && !a.dead) { D.remove(a); emit({ type: 'despawn', id: a.id, template: a.template, zone: a.zone, kind: 'mob', reason: 'boss_reset' }); } }
    if (BM) BM.reset(m);                              // wave 10 dbosses
    m.ai.boss = null;
    emit({ type: 'boss', id: m.id, kind: 'reset', template: m.template, zone: m.zone });
  }

  /** wave 10 dloot, for a run summary (dflow): the boss pieces each hero got in a copy, { heroId: [{ item, inst, from }] },
   *  and lootSummary (src/sim/dloot.js) of one hero's list. Kept on the copy (state.copies[zid].loot) until it resets. */
  function lootOf(zid) { const c = copies()[zid]; return c && c.loot ? JSON.parse(JSON.stringify(c.loot)) : {}; }
  function lootSummaryOf(zid, id) { return lootSummary(content, (lootOf(zid)[id]) || []); }
  return { bossView: (m) => (BM ? BM.view(m) : null), bossMarks: () => (BM ? BM.marks() : []),   // wave 10 dbosses
    isPlace, placeOf, info, enter, leave, tick, onKill, openChest, bossTick, bossReset, loadSpec, doorOut, destroy, doneToday, fits,
    copies: () => copies(), lootOf, lootSummaryOf };
}
