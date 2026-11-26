// Word doors (wave 8, glyphdoor; data in src/data/word_doors.js, map data in zone.dungeon.wordDoors). Pure: imports
// only from src/sim/. CONTRACTS section 6 "Word doors".
//
//   const WD = createWordDoors(X)   X = { state, content, emit, get, add, remove, nextId, tileToSub, distPx, rng,
//                                         rollGear, bagAdd, onBag }
//   WD.tick()                        once per world step: a dungeon copy whose map has word doors gets them (once), and
//                                    a lent glyph goes home the moment its hero is not in the copy
//   WD.shutCells(zid)                the Set of cells (tx + ty * 4096) that block movement in that copy, or null
//   WD.interact(e, t)                a found letter (pick it up) or the slab (the panel opens: an event, no state)
//   WD.handles(t) / WD.command(e, cmd)
//   WD.openChest(e, t)               the coffer behind an open door (once per hero, like the copy's cache)
//   WD.publicOf(t)                   the snapshot view of a slab or a found letter (never the word itself)
//   WD.saveLent(e, out)              saveFields: glyphs the hero has lent to a door are written back into out.gbag, so a
//                                    log-out (or a closed tab) mid-word never loses one
//
// Commands
//   wdoor_set { door, letter, from: 'found' | 'pouch' }   set one letter in the next empty cut. 'found' = a letter you
//                                    picked up in this copy; 'pouch' = a glyph from your pouch, lent (it comes back)
//   wdoor_take { door, slot }        take back a letter you set
// When every cut is full the slab reads the word: right, it opens for the whole copy; wrong, every letter goes back to
// whoever set it, the try is counted and the next clue line (or a lit letter) shows. Nothing is ever lost.
//
// Determinism: which word, and where the found letters lie, come from a hash of (door, copy, the tick the copy was
// made), never from the world's random stream, so adding a door changes no other roll in a copy. Only the coffer's
// gear roll uses the world rng, exactly as the copy's cache does.
import { hashSeed, createRng } from './rng.js';
import { bagCount, bagRemove, pouchAdd } from './loot.js';

const TICK_HZ = 20;
const CELL = (x, y) => x + y * 4096;
const CMDS = new Set(['wdoor_set', 'wdoor_take']);
const zoneBase = (id) => { const s = String(id); const i = s.indexOf('#'); return i < 0 ? s : s.slice(0, i); };
const glyphId = (L) => `glyph_${String(L).toLowerCase()}`;

export function createWordDoors(X) {
  const { state, content, emit, get } = X;
  const R = content.wordDoorRules || {};
  const DEFS = content.wordDoors || {};
  const zones = content.zones;
  const now = () => state.tick;
  const fail = (e, cmd, reason, extra = {}) => { emit({ type: 'wdoor_fail', id: e.id, cmd: cmd.t, reason, ...extra }); return false; };
  const shutCache = new WeakMap();     // the copy's wd object -> its blocking Set (rebuilt when a door opens)

  /** The copy's word door state: state.copies[zid].wd[doorId] (goes with the copy when it resets). */
  function doorsOf(zid) { const c = (state.copies || {})[zid]; return c && c.wd ? c.wd : null; }
  const giveGlyph = (p, L) => { if (!p) return; if (!p.gbag) p.gbag = []; pouchAdd(p.gbag, glyphId(L), 1); };

  function init(zid, c) {
    const z = zones[zid];
    const list = (z && z.dungeon && z.dungeon.wordDoors) || [];
    c.wd = {};
    for (const d of list) {
      const def = DEFS[d.id];
      if (!def || !def.words || !def.words.length) continue;
      const h = createRng(hashSeed(`wdoor:${d.id}:${zid}:${c.made}`));
      const wi = Math.floor(h.next() * def.words.length);
      const word = def.words[wi].word;
      // the found letters: one per letter of the word, on distinct spots, in a hashed order
      const spots = (d.stones || []).map((s, i) => ({ s, k: h.next(), i })).sort((a, b) => a.k - b.k || a.i - b.i).slice(0, word.length);
      const stones = [];
      word.split('').forEach((L, i) => {
        if (!spots[i]) return;            // wave 10 dbosses: a name-stone has no found letters (pouch glyphs only)
        const [x, y] = X.tileToSub(spots[i].s[0], spots[i].s[1]);
        const ent = X.add({ id: X.nextId(), kind: 'object', zone: zid, x, y, dir: 'down', moving: false, name: `Lintel stone (${L})`, level: 1, faction: 'neutral',
          sprite: 'glyph_stone', template: 'wdoor_stone', hp: 1, hpMax: 1, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
          wstone: { door: d.id, letter: L } });
        stones.push(ent.id);
      });
      const [sx, sy] = X.tileToSub(d.face.x, d.face.y);
      const slab = X.add({ id: X.nextId(), kind: 'object', zone: zid, x: sx + (d.face.w > 1 ? 128 : 0), y: sy, dir: 'down', moving: false, name: def.name, level: 1, faction: 'neutral',
        sprite: 'word_door', template: 'wdoor_slab', hp: 1, hpMax: 1, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
        wdoor: { door: d.id } });
      // wave 10 dbosses: a name-stone (src/data/boss_fights.js) has no coffer
      const [cx, cy] = d.chest ? X.tileToSub(d.chest.x, d.chest.y) : [0, 0];
      const chest = !d.chest ? null : X.add({ id: X.nextId(), kind: 'object', zone: zid, x: cx, y: cy, dir: 'down', moving: false, name: d.chest.name, level: 1, faction: 'neutral',
        sprite: 'chest_gold', template: d.chest.id, hp: 1, hpMax: 1, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
        node: { item: null, respawn: 0, channel: 0, perPlayer: true, readyAt: 0, secret: { id: d.chest.id } },
        dchest: { place: zoneBase(zid), opened: [], kind: 'word', door: d.id } });
      c.wd[d.id] = { word: wi, len: word.length, slots: new Array(word.length).fill(null), tries: 0, quietUntil: 0, open: false,
        carried: {}, face: { ...d.face }, slab: slab.id, chest: chest ? chest.id : null, stones, cells: (d.cells || []).map(([x, y]) => CELL(x, y)) };
      if (now() > 0) for (const id of [...stones, slab.id, ...(chest ? [chest.id] : [])]) emit({ type: 'spawn', id, template: (get(id) || {}).template, zone: zid, kind: 'object' });
    }
  }

  function tick() {
    if (now() % TICK_HZ !== 0) return;
    for (const [zid, c] of Object.entries(state.copies || {})) {
      if (c.wd) {
        for (const d of Object.values(c.wd)) {
          if (d.open) continue;
          // a lent glyph goes home the moment its hero is not in the copy (left, logged out): a reset never eats one
          for (;;) {
            const gone = d.slots.findIndex((s) => s && s.src === 'pouch' && !((get(s.by) || {}).zone === zid));
            if (gone < 0) break;
            giveGlyph(get(d.slots[gone].by), d.slots[gone].letter);
            d.slots.splice(gone, 1); d.slots.push(null);
          }
        }
        continue;
      }
      const z = zones[zid];
      if (z && z.dungeon && z.dungeon.wordDoors && z.dungeon.wordDoors.length) init(zid, c);
    }
  }
  function shutCells(zid) {
    const wd = doorsOf(zid);
    if (!wd) return null;
    const key = Object.values(wd).map((d) => (d.open ? 1 : 0)).join('');
    const hit = shutCache.get(wd);
    if (hit && hit.key === key) return hit.set;
    let s = null;
    for (const d of Object.values(wd)) if (!d.open) { s = s || new Set(); for (const k of d.cells) s.add(k); }
    shutCache.set(wd, { key, set: s });
    return s;
  }

  const wordOf = (id, d) => DEFS[id].words[d.word].word;
  function interact(e, t) {
    if (t.wstone) {
      const wd = doorsOf(t.zone); const d = wd && wd[t.wstone.door];
      if (!d) return false;
      d.carried[t.id] = { letter: t.wstone.letter, by: e.id };
      X.remove(t);
      emit({ type: 'wdoor', kind: 'found', id: e.id, door: t.wstone.door, letter: t.wstone.letter, zone: t.zone });
      emit({ type: 'despawn', id: t.id, template: t.template, zone: t.zone, kind: 'object' });
      return true;
    }
    if (t.wdoor) { emit({ type: 'wdoor', kind: 'look', id: e.id, door: t.wdoor.door, slab: t.id }); return true; }
    return false;
  }

  function near(e, d) { const s = get(d.slab); return s && s.zone === e.zone && X.distPx(e, s) <= (R.reachPx || 56); }
  function set(e, cmd) {
    const wd = doorsOf(e.zone); const d = wd && wd[cmd.door];
    if (!d) return fail(e, cmd, 'no_door');
    if (d.open) return fail(e, cmd, 'open');
    if (!near(e, d)) return fail(e, cmd, 'range');
    if (now() < d.quietUntil) return fail(e, cmd, 'quiet');
    const L = String(cmd.letter || '').toUpperCase();
    if (!/^[A-Z]$/.test(L)) return fail(e, cmd, 'bad_letter');
    const i = d.slots.indexOf(null);
    if (i < 0) return fail(e, cmd, 'full');
    if (cmd.from === 'pouch') {
      const gid = glyphId(L);
      if (bagCount({ gbag: e.gbag }, gid) < 1) return fail(e, cmd, 'no_glyph', { letter: L });
      bagRemove({ gbag: e.gbag }, gid, 1);                // lent: it goes back on a wrong word, an open, a take, or a leave
      d.slots[i] = { letter: L, by: e.id, src: 'pouch' };
    } else {
      const k = Object.keys(d.carried).find((s) => d.carried[s].by === e.id && d.carried[s].letter === L && !d.slots.some((x) => x && x.stone === s));
      if (k == null) return fail(e, cmd, 'not_carried', { letter: L });
      d.slots[i] = { letter: L, by: e.id, src: 'found', stone: k };
    }
    emit({ type: 'wdoor', kind: 'set', id: e.id, door: cmd.door, slot: i, letter: L, zone: e.zone });
    if (d.slots.every(Boolean)) read(e, cmd.door, d);
    return true;
  }
  function giveBack(d) {
    for (const s of d.slots) if (s && s.src === 'pouch') giveGlyph(get(s.by), s.letter);
    d.slots = d.slots.map(() => null);
  }
  function take(e, cmd) {
    const wd = doorsOf(e.zone); const d = wd && wd[cmd.door];
    if (!d || d.open) return fail(e, cmd, 'no_door');
    const s = d.slots[cmd.slot | 0];
    if (!s) return fail(e, cmd, 'empty');
    if (s.by !== e.id) return fail(e, cmd, 'not_yours');
    if (s.src === 'pouch') giveGlyph(e, s.letter);
    // close the gap so the letters stay in order
    d.slots.splice(cmd.slot | 0, 1); d.slots.push(null);
    emit({ type: 'wdoor', kind: 'take', id: e.id, door: cmd.door, slot: cmd.slot | 0, letter: s.letter, zone: e.zone });
    return true;
  }
  function read(e, id, d) {
    const spelled = d.slots.map((s) => s.letter).join('');
    const word = wordOf(id, d);
    if (spelled === word) {
      giveBack(d);
      d.slots = word.split('').map((L) => ({ letter: L, by: null, src: 'read' }));
      d.open = true;
      emit({ type: 'wdoor', kind: 'open', id: e.id, door: id, word, zone: e.zone, line: DEFS[id].words[d.word].opened || null });
      return;
    }
    d.tries++;
    d.quietUntil = now() + Math.round((R.wrongCooldownSec || 4) * TICK_HZ);
    giveBack(d);
    emit({ type: 'wdoor', kind: 'wrong', id: e.id, door: id, spelled, tries: d.tries, zone: e.zone });
  }
  /** How many leading letters the slab lights after `tries` wrong words (never the whole word). */
  function lit(d) {
    const a = R.showFirstAfter || 2, b = R.showNextEvery || 2;
    if (d.tries < a) return 0;
    return Math.min(d.len - 1, 1 + Math.floor((d.tries - a) / b));
  }

  function openChest(e, t) {
    const c = t.dchest, place = (content.dungeons || {})[c.place];
    const wd = doorsOf(t.zone); const d = wd && wd[c.door];
    if (!place || !d || !d.open) { emit({ type: 'interact_fail', src: e.id, id: t.id, reason: 'empty' }); return false; }
    if (c.opened.includes(e.id)) { emit({ type: 'interact_fail', src: e.id, id: t.id, reason: 'used' }); return false; }
    const ch = place.chest || { gold: [5, 10], rarity: 'magic', ilvl: (place.levels || [1, 1])[1] };
    const rarity = (place.daily && place.daily.rarity) || ch.rarity;          // the place's own tables: the daily's rarity at the cache's level
    const gear = X.rollGear({ content, rng: X.rng }, { ilvl: ch.ilvl, source: 'chest_gold', cls: e.cls, rarity });
    if (gear && X.bagAdd(e, gear.item, 1, gear.inst, content) < 1) { emit({ type: 'interact_fail', src: e.id, id: t.id, reason: 'bag_full' }); return false; }
    const gold = X.rng.int(ch.gold[0], Math.max(ch.gold[0], ch.gold[1]));
    e.gold = (e.gold || 0) + gold;
    c.opened.push(e.id);
    emit({ type: 'chest_open', id: e.id, from: t.id, place: c.place, kind: 'word', gold });
    emit({ type: 'loot', id: e.id, from: t.id, gold, items: gear ? [{ item: gear.item, qty: 1, inst: gear.inst }] : [] });
    emit({ type: 'gold', id: e.id, amount: gold, total: e.gold, source: 'dungeon' });
    if (X.onBag) X.onBag(e);
    return true;
  }

  function publicOf(t) {
    if (t.wstone) return { wstone: { door: t.wstone.door, letter: t.wstone.letter } };
    if (!t.wdoor) return null;
    const wd = doorsOf(t.zone); const d = wd && wd[t.wdoor.door];
    if (!d) return null;
    const def = DEFS[t.wdoor.door], W = def.words[d.word];
    const n = lit(d), word = W.word;
    return { wdoor: {
      door: t.wdoor.door, name: def.name, look: def.look, len: d.len, face: d.face, open: d.open, tries: d.tries,
      quiet: now() < d.quietUntil ? d.quietUntil : 0,
      slots: d.slots.map((s) => (s ? { letter: s.letter, by: s.by, src: s.src } : null)),
      clue: W.clue.slice(0, d.tries > 0 ? 2 : 1), draft: !!W.draft,
      lit: word.slice(0, n),                       // the leading letters the slab shows after wrong words
      carried: Object.values(d.carried).map((c) => ({ letter: c.letter, by: c.by })),
      left: d.stones.filter((id) => get(id)).length,   // found letters still lying in the copy
      opened: d.open ? W.opened || null : null,
      // wave 10 dbosses: a name-stone's hint line, once anyone in the copy has cleared its boss `hintAfter` times
      ...(def.hint && state.ents.some((p) => p.kind === 'player' && p.zone === t.zone && ((((p.dungeons || {}).clears || {})[def.boss]) || 0) >= (def.hintAfter || 3)) ? { hint: def.hint } : {}),
      ...(def.nameStone ? { nameStone: def.boss } : {}),
    } };
  }

  /** saveFields: the glyphs this hero has lent to any door go back into the save's pouch (the door keeps them until it
   *  gives them back in the world; a save is a copy, so nothing is doubled). */
  function saveLent(e, out) {
    let add = null;
    for (const c of Object.values(state.copies || {})) for (const d of Object.values(c.wd || {})) {
      if (d.open) continue;
      for (const s of d.slots) if (s && s.src === 'pouch' && s.by === e.id) { add = add || []; add.push(s.letter); }
    }
    if (!add) return;
    out.gbag = out.gbag ? out.gbag.map((g) => ({ ...g })) : [];
    for (const L of add) pouchAdd(out.gbag, glyphId(L), 1);
  }

  return { tick, shutCells, interact, openChest, publicOf, saveLent, handles: (t) => CMDS.has(t),
    command: (e, cmd) => (cmd.t === 'wdoor_set' ? set(e, cmd) : cmd.t === 'wdoor_take' ? take(e, cmd) : false) };
}
