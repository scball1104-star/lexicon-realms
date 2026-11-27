// The Millrace (cap 35, stage 1, 2026-11-27; docs/handoff/briefs/BRIEF_cap35_millrace.md sections 2 and 3): the zone
// loads as its own outdoor zone, Ferrick's chain on the Downs road is a level 30 gate both ways, the shallows slow a
// hero by 15% while deep water blocks (except the catwalks and the fords), the kite point at Ferrick's Mill unlocks at
// the kitemaster and flies only for a level 30 hero, and no other zone's levels moved. Sim only: createWorld on the
// real content.
import { assert, eq, content } from './_harness.mjs';
import { createWorld } from '../../src/sim/index.js';
import { OUTDOOR, ZONES, PLACES, REGIONS } from '../../src/data/maps/index.js';
import { flightRoute } from '../../src/data/travel.js';
import { MR_NPCS, MILLRACE_MIN_LEVEL } from '../../src/data/millrace.js';
import { GATE, WORLD_GATE, WEIR_WORKS_DOOR, CAMPS, HUB } from '../../tools/maps/zone_millrace.mjs';
import { reach } from '../../tools/maps/kit.mjs';

const T = 256;                                    // sim units a tile
const tile = (e) => [Math.floor(e.x / T), Math.floor((e.y - 1) / T)];
const put = (e, zone, x, y) => { e.zone = zone; e.x = x * T + T / 2; e.y = (y + 1) * T - 16; e.mx = 0; e.my = 0; };
function run(w, n, pred = null) {
  const out = [];
  for (let i = 0; i < n; i++) { const ev = w.step(); out.push(...ev); if (pred && ev.some(pred)) break; }
  return out;
}
const npcOf = (w, template) => w.state.ents.find((e) => e.kind === 'npc' && e.template === template);
/** Only the Millrace's and the travel people (no camps elsewhere: they slow every step and are not needed). */
let CM = null;
function contentMill() {
  if (CM) return CM;
  const C = content();
  CM = { ...C, spawns: C.spawns.filter((s) => s.npc), nightSpawns: [] };
  return CM;
}
const world = (seed = 3) => createWorld({ seed, content: contentMill() });
const legendId = (z, x, y) => z.legend[z.ground[y][x]];
const overlayAt = (z, x, y) => (z.overlays || []).filter((o) => o.x === x && o.y === y).map((o) => o.t);

export const tests = [
  {
    name: 'millrace: its own outdoor zone, 128 x 88, field, mounts, levels 30 to 35, style mill; the four areas, a safe hub, four lanterns',
    fn() {
      const C = content(), Z = C.zones.millrace;
      assert(OUTDOOR.millrace && Z, 'the Millrace is loaded');
      eq(`${Z.w}x${Z.h}`, '128x88', 'size');
      eq(Z.kind, 'field'); eq(Z.mounts, true); eq(Z.levels.join(','), '30,35'); eq(Z.style, 'mill'); eq(Z.music, 'the_downs');
      eq(C.zoneNames.millrace, 'The Millrace');
      for (const id of ['mr_chain_road', 'mr_mill', 'mr_flood', 'mr_weir', 'mr_fords']) assert(Z.areas.some((a) => a.id === id), `area ${id}`);
      assert(Z.areas.find((a) => a.id === 'mr_mill').safe, 'the hub is safe');
      assert(Z.regions.some((r) => r.kind === 'town' && r.id === 'mr_mill'), 'the hub is a town region');
      eq(Z.lanterns.map((l) => l.id).sort().join(','), 'mr_chain_road,mr_flood,mr_mill,mr_weir');
      const seen = reach(Z, Z.arrival[0], Z.arrival[1]);
      const ok = (x, y) => Z.collision[y][x] === '.' && seen[y * Z.w + x] === 1;
      for (const l of Z.lanterns) { assert(ok(l.x, l.y), `lantern ${l.id} reachable`); eq(Z.collision[l.post[1]][l.post[0]], '#', `lantern ${l.id} post`); }
      // the hub: the mill, the inn, provisions, the kitemaster, the bounty board, the lantern on the plaza
      const P = HUB.plaza, onPlaza = (x, y) => x >= P.x0 && x <= P.x1 && y >= P.y0 && y <= P.y1;
      for (const t of ['x1_loomhouse', 'inn', 'item_shop']) assert(Z.decor.some((d) => d.t === t && d.x >= 74 && d.x <= 112 && d.y >= 30 && d.y <= 41), `${t} on the hub's north row`);
      for (const n of ['mr_clerk', 'mr_hand', 'mr_child', 'mr_vendor']) { const s = Z.npcs.find((q) => q.npc === n); assert(s && MR_NPCS[n] && ok(s.x, s.y), `${n} placed and reachable`); }
      for (const n of ['mr_innkeeper', 'mr_kitemaster']) { const s = C.spawns.find((q) => q.npc === n); assert(s && s.zone === 'millrace' && onPlaza(s.x, s.y), `${n} on the plaza`); }
      assert(C.travel.inns.mr_innkeeper && C.travel.inns.mr_innkeeper.zone === 'millrace', 'the inn is a home');
      assert(MR_NPCS.mr_vendor.vendor.items.every((v) => C.items[v.item]), 'the vendor sells real items');
      const lan = Z.lanterns.find((l) => l.id === 'mr_mill'); assert(onPlaza(lan.x, lan.y), 'the hub lantern stands on the plaza');
      const [bx, by] = Z.spots.bountyBoard;
      eq(Z.collision[by][bx], '#', 'the bounty board stands (solid)');
      assert(Z.millProps.some((p) => p.t === 'mr_board' && p.x === bx && p.y === by), 'the bounty board is drawn there');
      // the code-built wheel stands in the race (deep water) beside the mill
      const wh = Z.millProps.find((p) => p.t === 'mr_wheel');
      assert(wh && legendId(Z, wh.x, wh.y) === 'water' && Z.collision[wh.y][wh.x] === '~', 'the wheel stands in deep water');
      const mill = Z.decor.find((d) => d.t === 'x1_loomhouse');
      assert(Math.abs(mill.x - wh.x) <= 6 && Math.abs(mill.y - wh.y) <= 4, 'the wheel is beside the mill');
      // no em or en dashes in anything this lane wrote
      const texts = [...Z.signs.map((s) => s.text), ...Object.values(MR_NPCS).flatMap((n) => [n.name, n.title || '', ...n.talk]), Z.name, OUTDOOR.millrace.flavour];
      for (const t of texts) assert(!/[\u2013\u2014]/.test(t), `no dashes: ${t}`);
    },
  },
  {
    name: 'millrace: the Weir Works door spot (mill undercroft) is walkable, reachable and in the hub; the camp spots are marked 8 to 12 tiles apart, levels 30 to 35, no foes yet',
    fn() {
      const Z = ZONES.millrace, seen = reach(Z, Z.arrival[0], Z.arrival[1]);
      const ok = (x, y) => Z.collision[y][x] === '.' && seen[y * Z.w + x] === 1;
      const d = Z.spots.weirWorksDoor;
      eq(JSON.stringify([d.x, d.y, d.w, d.h, d.out]), JSON.stringify([WEIR_WORKS_DOOR.x, WEIR_WORKS_DOOR.y, WEIR_WORKS_DOOR.w, WEIR_WORKS_DOOR.h, WEIR_WORKS_DOOR.out]));
      for (let y = d.y; y < d.y + d.h; y++) for (let x = d.x; x < d.x + d.w; x++) { assert(ok(x, y), `door cell ${x},${y}`); eq(Z.collision[y][x + 1], '#', `the mill wall behind ${x},${y}`); }
      assert(ok(d.out[0], d.out[1]), 'the door\'s out cell');
      assert(Z.millProps.some((p) => p.t === 'mr_undercroft' && p.x === d.x + 1 && p.y === d.y), 'the undercroft door is drawn in the mill wall');
      assert(!PLACES.weir_works && !Z.joins.some((j) => j.door), 'the cave itself is not built in this lane');
      const hub = Z.areas.find((a) => a.id === 'mr_mill');
      assert(d.x >= hub.x && d.x < hub.x + hub.w && d.y >= hub.y && d.y < hub.y + hub.h, 'the door spot is in the hub');
      eq(Z.spawns.length, 0, 'no foes placed by the zone lane');
      eq(Z.camps.length, CAMPS.length);
      for (const c of Z.camps) {
        assert(ok(c.x, c.y), `camp ${c.id} at ${c.x},${c.y} reachable`);
        assert(c.level >= 30 && c.level <= 35, `camp ${c.id} level ${c.level}`);
        const a = Z.areas.find((q) => q.id === c.area);
        assert(a && c.x >= a.x && c.x < a.x + a.w && c.y >= a.y && c.y < a.y + a.h, `camp ${c.id} in ${c.area}`);
        let near = Infinity;
        for (const o of Z.camps) if (o !== c) { const dd = Math.hypot(o.x - c.x, o.y - c.y); assert(dd >= 8, `camps ${c.id} and ${o.id} only ${dd.toFixed(1)} apart`); near = Math.min(near, dd); }
        assert(near <= 12, `camp ${c.id}: nearest camp ${near.toFixed(1)} tiles (want 8 to 12)`);
      }
      assert(Z.camps.some((c) => c.elite && c.level === 34 && c.area === 'mr_weir'), 'the elite spot at the Upper Weir, level 34');
    },
  },
  {
    name: 'millrace: Ferrick`s chain is a level 30 gate: a level 29 hero is held at the chain, a level 30 hero walks into the Millrace and back out',
    fn() {
      const C = content(), W = C.zones.world;
      const gate = W.joins.find((j) => j.to === 'millrace');
      assert(gate && gate.minLevel === MILLRACE_MIN_LEVEL && gate.region === 'downs', 'the world join to the Millrace (the Downs) asks for level 30');
      eq(`${gate.tx},${gate.ty}`, GATE.arrive.join(','), 'lands on the Chain Road');
      assert(!W.hooks.some((h) => h.to === 'x1_millrace'), 'the old closed hook is gone');
      const board = W.signs.find((s) => s.id === 'drovers_chain');
      assert(board && /THE WEIR BROKE AND NOBODY CAME/.test(board.text), 'Ferrick`s board stays');
      assert(W.decor.some((d) => d.t === 'x1_drovers_chain' && d.region === 'downs'), 'Ferrick`s chain stays across the road');
      const back = ZONES.millrace.joins.find((j) => j.to === 'world');
      eq(`${back.tx},${back.ty}`, WORLD_GATE.arrive.join(','), 'the way back lands north of the chain');
      const w = world();
      const lo = w.addPlayer({ name: 'Low', cls: 'warden', zone: 'world', x: gate.x + 1, y: gate.y - 2, level: 29 });
      w.enqueue(lo, { t: 'move', dx: 0, dy: 1 });
      const evs = run(w, 80);
      w.enqueue(lo, { t: 'stop' });
      assert(!evs.some((x) => x.type === 'zone' && x.id === lo), 'level 29: no way through');
      assert(evs.some((x) => x.type === 'door_locked' && x.id === lo && x.door === 'millrace' && x.need === 30), 'level 29: told the chain waits for level 30');
      eq(w.get(lo).zone, 'world');
      assert(tile(w.get(lo))[1] <= gate.y, 'level 29: still north of the chain');
      const hi = w.addPlayer({ name: 'High', cls: 'mender', zone: 'world', x: gate.x + 1, y: gate.y - 2, level: 30 });
      w.enqueue(hi, { t: 'move', dx: 0, dy: 1 });
      let ev = run(w, 120, (x) => x.type === 'zone' && x.id === hi).find((x) => x.type === 'zone' && x.id === hi);
      w.enqueue(hi, { t: 'stop' }); run(w, 2);
      assert(ev && ev.from === 'world' && ev.to === 'millrace', `level 30: through the chain into the Millrace (${JSON.stringify(ev)})`);
      eq(tile(w.get(hi)).join(','), GATE.arrive.join(','), 'lands on the Chain Road');
      w.enqueue(hi, { t: 'move', dx: 0, dy: 1 });
      ev = run(w, 160, (x) => x.type === 'zone' && x.id === hi).find((x) => x.type === 'zone' && x.id === hi);
      w.enqueue(hi, { t: 'stop' });
      assert(ev && ev.to === 'world', 'and south out again to the Downs');
      eq(tile(w.get(hi)).join(','), WORLD_GATE.arrive.join(','), 'north of the chain');
    },
  },
  {
    name: 'millrace wade rule: the shallows slow a hero by about 15%, the catwalks and dry ground do not, the fords wade, deep water blocks',
    fn() {
      const Z = ZONES.millrace;
      eq(JSON.stringify(Z.wade), JSON.stringify({ terrains: ['shallow'], slow: 0.15 }), 'the zone carries the rule as data');
      // every shallow cell is walkable; every deep cell blocks unless a catwalk deck is on it
      let shallow = 0, deep = 0, open = 0;
      for (let y = 0; y < Z.h; y++) for (let x = 0; x < Z.w; x++) {
        const id = legendId(Z, x, y);
        if (id === 'shallow') { shallow++; assert(Z.collision[y][x] !== '~', `shallow ${x},${y} is never water-blocked`); if (Z.collision[y][x] === '.') open++; }
        if (id === 'water') { deep++; assert(Z.collision[y][x] !== '.', `deep ${x},${y} blocks`); }   // '~' (or a cottage standing in it)
      }
      assert(shallow > 800 && deep > 800, `plenty of both (${shallow} shallow, ${deep} deep)`);
      assert(open / shallow > 0.9, `the shallows are walkable but for the cottages standing in them (${open} of ${shallow})`);
      const decks = (Z.overlays || []).filter((o) => /^bridge_/.test(o.t));
      assert(decks.length > 100, `catwalks: ${decks.length} deck cells`);
      for (const o of decks) eq(Z.collision[o.y][o.x], '.', `deck ${o.x},${o.y} walkable`);
      for (const [x0, y0, x1, y1] of Z.spots.fords) {
        let n = 0;
        for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (legendId(Z, x, y) === 'shallow') n++;
        assert(n >= 20, `the ford at ${x0},${y0}: ${n} wading cells across the race`);
      }

      const w = world();
      const id = w.addPlayer({ name: 'Wade', cls: 'mender', zone: 'millrace', x: GATE.arrive[0], y: GATE.arrive[1], level: 30 });
      const e = w.get(id);
      const wading = () => e.auras.find((a) => a.id === 'realm_wading');
      const walk = (x, y, dx, n) => {
        put(e, 'millrace', x, y); run(w, 22);            // stand: the rule looks every half second
        const x0 = e.x;
        w.enqueue(id, { t: 'move', dx, dy: 0 }); run(w, n); w.enqueue(id, { t: 'stop' }); run(w, 1);
        return Math.abs(e.x - x0);
      };
      // the Flood Lanes, row 49: a long run of shallows
      for (let x = 6; x <= 18; x++) eq(legendId(Z, x, 49), 'shallow', `flood row 49, ${x}`);
      put(e, 'millrace', 6, 49); run(w, 22);
      const a = wading();
      assert(a && a.def.mods[0].stat === 'speed' && Math.abs(a.def.mods[0].mul - 0.85) < 1e-9, 'standing in the shallows: wading, speed x 0.85');
      const wet = walk(6, 49, 1, 40);
      assert(wading(), 'still wading after the walk');
      // the plaza, row 48: dry planks
      for (let x = 79; x <= 89; x++) eq(legendId(Z, x, 48), 'plaza', `plaza row 48, ${x}`);
      const dryRun = walk(79, 48, 1, 40);
      assert(!wading(), 'on the plaza: no wading');
      const k = wet / dryRun;
      assert(k > 0.8 && k < 0.9, `the shallows slow by about 15% (${(100 * (1 - k)).toFixed(1)}%)`);
      // a catwalk over the race: dry
      const cw = decks.find((o) => o.y === 44 && o.x >= 70 && o.x <= 76);
      assert(cw && ['water', 'shallow'].includes(legendId(Z, cw.x, cw.y - 1)) && ['water', 'shallow'].includes(legendId(Z, cw.x, cw.y + 2)), 'the catwalk crosses the race');
      put(e, 'millrace', cw.x, cw.y); run(w, 22);
      assert(!wading(), 'on a catwalk: no wading');
      // a lower ford: wade it
      const [fx0, fy0, fx1] = Z.spots.fords[0];
      let fx = fx0; while (fx <= fx1 && legendId(Z, fx, fy0 + 1) !== 'shallow') fx++;
      put(e, 'millrace', Math.min(fx + 4, fx1), fy0 + 1); run(w, 22);
      assert(wading(), 'on the ford: wading');
      // deep water blocks: from the bank by the mill, walk west into the race
      const by = 48;
      let bx = HUB.plaza.x0;
      while (bx > 60 && !(Z.collision[by][bx] === '.' && Z.collision[by][bx - 1] === '~')) bx--;
      assert(bx > 60 && legendId(Z, bx - 1, by) === 'water', `the race's deep water west of the plaza on row ${by} (x ${bx - 1})`);
      put(e, 'millrace', bx, by); run(w, 2);
      w.enqueue(id, { t: 'move', dx: -1, dy: 0 }); run(w, 40); w.enqueue(id, { t: 'stop' }); run(w, 1);
      eq(tile(e)[0], bx, 'the deep race holds the hero at its edge');
    },
  },
  {
    name: 'millrace kite: talking to the kitemaster unlocks Ferrick`s Mill; from Willowmere and Thornfold it flies there for a level 30 hero, not below',
    fn() {
      const C = content();
      const pt = C.travel.flight.points.ferricks_mill;
      assert(pt && pt.zone === 'millrace' && pt.minLevel === 30, 'the point, level 30');
      eq(`${pt.land[0]},${pt.land[1]}`, HUB.land.join(','), 'lands on the plaza');
      for (const from of ['willowmere', 'thornfold']) {
        const r = flightRoute(from, 'ferricks_mill');
        assert(r && r.legs.map((l) => l.zone).join(',') === 'world,millrace', `${from}: a route over the Downs into the Millrace`);
        assert(C.travel.routes[`${from}>ferricks_mill`] && C.travel.routes[`ferricks_mill>${from}`], `${from}: both ways`);
      }
      const w = world();
      const id = w.addPlayer({ name: 'Kite', cls: 'scribe', zone: 'millrace', x: GATE.arrive[0], y: GATE.arrive[1], level: 30, gold: 100 });
      const e = w.get(id);
      assert(!(e.flights || []).includes('ferricks_mill'), 'not known before');
      const km = npcOf(w, 'mr_kitemaster');
      e.zone = km.zone; e.x = km.x + T; e.y = km.y;
      w.enqueue(id, { t: 'interact', id: km.id });
      const evs = run(w, 3);
      assert(evs.some((x) => x.type === 'flight_point' && x.id === id && x.point === 'ferricks_mill'), 'the kitemaster unlocks the point');
      assert(e.flights.includes('ferricks_mill'), 'known now');
      // fly back in from Willowmere
      const fm = npcOf(w, 'fm_willowmere');
      e.flights.push('willowmere');
      e.zone = fm.zone; e.x = fm.x + T; e.y = fm.y;
      w.enqueue(id, { t: 'fly', npc: fm.id, to: 'ferricks_mill' });
      const fl = run(w, 2400, (x) => x.type === 'flight_end');
      assert(fl.some((x) => x.type === 'flight_start' && x.id === id), 'the kite takes off');
      assert(fl.some((x) => x.type === 'zone' && x.id === id && x.to === 'millrace'), 'the flight changes zone at the chain');
      assert(fl.some((x) => x.type === 'flight_end' && x.id === id), 'and lands');
      eq(e.zone, 'millrace'); eq(tile(e).join(','), HUB.land.join(','), 'on the plaza');
      // a level 29 hero who somehow knows the point cannot fly there
      const lo = w.addPlayer({ name: 'Lo', cls: 'scribe', zone: 'world', x: 10, y: 10, level: 29, gold: 100, flights: ['willowmere', 'ferricks_mill'] });
      const L = w.get(lo);
      L.zone = fm.zone; L.x = fm.x + T; L.y = fm.y;
      w.enqueue(lo, { t: 'fly', npc: fm.id, to: 'ferricks_mill' });
      const f2 = run(w, 3);
      assert(f2.some((x) => x.type === 'flight_fail' && x.id === lo && x.reason === 'dest_level' && x.need === 30), 'level 29: the kite will not fly there');
      eq(L.zone, 'world');
    },
  },
  {
    name: 'millrace: no other zone`s levels changed (every zone, area and region level as on main before the Millrace)',
    fn() {
      // FNV-1a of every other zone's levels, its areas' and regions' levels, and the four world areas' levels, computed on
      // origin/main ca94df7 (before this lane). The brief: do not re-level Willowmere, the Downs, the Moor, the start
      // realms, Larchhill or Drovers' Reach.
      const ids = Object.keys({ ...OUTDOOR, ...PLACES, world: 1 }).filter((i) => i !== 'millrace').sort();
      const out = {};
      for (const id of ids) {
        const z = ZONES[id];
        out[id] = { levels: z.levels || null, areas: (z.areas || []).map((a) => `${a.id}:${a.levels ? a.levels.join('-') : ''}`).join(','), regions: (z.regions || []).map((a) => `${a.id}:${a.levels ? a.levels.join('-') : ''}`).join(',') };
      }
      for (const [k, v] of Object.entries(REGIONS)) out[`region:${k}`] = { levels: v.levels || null };
      const s = JSON.stringify(out);
      let h = 2166136261;
      for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
      eq(h.toString(16), 'ac685b1e', 'the other zones\' levels');
      eq(ZONES.drovers_reach.levels.join(','), '25,30'); eq(ZONES.larchhill.levels.join(','), '20,25'); eq(REGIONS.downs.levels.join(','), '5,13');
      // no camp outside the Millrace moved past the live cap of 30
      for (const sp of content().spawns) if (sp.zone !== 'millrace' && sp.mob && sp.level) assert(sp.level <= 30, `${sp.mob} in ${sp.zone} at ${sp.level}`);
    },
  },
];
