// World life pass (wave 7, plan item 12; src/render3d/townlife_plan.js + townlife3d.js): townsfolk with day and night
// routines, crowds in the squares, critters, and showers that send people indoors. Cosmetic only: the plan comes from
// the sim's own tile map, nobody walks on or next to a quest NPC or the square dressing, quest NPCs never move, the walks
// are a pure function of time, Low quality and phones get fewer, and the sim never sees any of it.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as THREE from '../../src/vendor/three/three.module.min.js';
import { assert, eq } from './_helpers.mjs';
import { ZONES } from '../../src/data/maps/index.js';
import { planSquare, terrainGrid, START_TOWNS } from '../../src/render3d/ground_plan.js';
import { CRIT, DESK, LITE, critterOut, lifeCaps, lifeTowns, loopPose, OPT, planTown, showerAt, showerZone, wantOut } from '../../src/render3d/townlife_plan.js';
import { createTownLife } from '../../src/render3d/townlife3d.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const TILES = JSON.parse(fs.readFileSync(path.join(ROOT, 'assets', 'tiles', 'tiles.json'), 'utf8'));
const src = (f) => fs.readFileSync(path.join(ROOT, f), 'utf8');
const TOWNS = [...Object.keys(START_TOWNS), 'world'];
const cache = new Map();
function plansOf(id, opts = { dress: true }) {
  const key = id + JSON.stringify(opts);
  if (!cache.has(key)) cache.set(key, lifeTowns(ZONES[id]).map((r) => planTown(ZONES[id], r, TILES, opts)).filter(Boolean));
  return cache.get(key);
}
const npcNear = (zone, x, y, r) => (zone.npcs || []).some((n) => Math.max(Math.abs(n.x - x), Math.abs(n.y - y)) <= r);
const sampleTimes = (F) => { const out = []; const L = Math.min(F.loop, 400); for (let t = 0; t < L; t += 0.7) out.push(t); return out; };

export const tests = [
  {
    name: 'town life: every start town and Willowmere gets a plan with townsfolk, doors and critters, within the caps',
    fn() {
      for (const id of TOWNS) {
        const ps = plansOf(id);
        assert(ps.length >= 1, `${id}: a town plan`);
        for (const P of ps) {
          assert(P.folk.length >= 6 && P.folk.length <= DESK.folk, `${id} ${P.id}: ${P.folk.length} townsfolk`);
          assert(P.critters.length >= 3 && P.critters.length <= DESK.critters, `${id} ${P.id}: ${P.critters.length} critters`);
          assert(P.doors.length >= 1, `${id} ${P.id}: doors`);
          if (id !== 'world') assert(P.folk.length >= 25, `${id}: a start town's square fills (${P.folk.length})`);
        }
      }
      for (const id of Object.keys(START_TOWNS)) {
        const [P] = plansOf(id, { folk: LITE.folk, critters: LITE.critters, dress: false });
        assert(P.folk.length <= LITE.folk && P.critters.length <= LITE.critters, `${id}: Low quality caps (${P.folk.length}, ${P.critters.length})`);
      }
      eq(lifeTowns(ZONES.barrow || { kind: 'dungeon' }).length, 0, 'no town life underground');
    },
  },
  {
    name: 'town life: every walk stays on open floor, never on or next to a quest NPC, never on the square dressing',
    fn() {
      for (const id of TOWNS) {
        const zone = ZONES[id];
        const dress = new Set();
        if (START_TOWNS[id]) for (const it of planSquare(zone, terrainGrid(zone, TILES), TILES).items) for (const [x, y] of it.tiles) dress.add(y * zone.w + x);
        for (const P of plansOf(id)) {
          for (const F of P.folk) {
            for (const t of sampleTimes(F)) {
              const p = loopPose(F, t);
              const tx = Math.floor(p.x), ty = Math.floor(p.z);
              assert(zone.collision[ty][tx] === '.', `${id} ${F.kind} ${F.id} at t=${t.toFixed(1)} on a solid tile ${tx},${ty}`);
              assert(!npcNear(zone, tx, ty, 1), `${id} ${F.kind} ${F.id} at t=${t.toFixed(1)} next to a quest NPC (${tx},${ty})`);
              assert(!dress.has(ty * zone.w + tx), `${id} ${F.kind} ${F.id} walks through the square dressing at ${tx},${ty}`);
            }
            // a standing person (a group, the inn door) stands 2+ tiles from any quest NPC: the marks stay readable
            if (F.loop >= 1e8) assert(!npcNear(zone, Math.floor(F.legs[0].x), Math.floor(F.legs[0].z), 1), `${id} ${F.id} stands by an NPC`);
            // home is always reachable from the loop (the walk home on a shower or at nightfall)
            const p = loopPose(F, 13.7);
            assert(P.toDoor(F.home, Math.floor(p.x), Math.floor(p.z)), `${id} ${F.id}: no way home`);
          }
          for (const C of P.critters) assert(zone.collision[Math.floor(C.z)][Math.floor(C.x)] === '.', `${id} critter ${C.id} on a solid tile`);
        }
      }
    },
  },
  {
    name: 'town life: quest NPCs never move and the zone is not changed by planning (cosmetic only)',
    fn() {
      for (const id of TOWNS) {
        const before = JSON.stringify({ npcs: ZONES[id].npcs, collision: ZONES[id].collision, decor: ZONES[id].decor.length });
        cache.delete(id + JSON.stringify({ dress: true }));
        plansOf(id);
        eq(JSON.stringify({ npcs: ZONES[id].npcs, collision: ZONES[id].collision, decor: ZONES[id].decor.length }), before, `${id}: zone data unchanged`);
      }
      // the renderer side never reaches the sim: no import of src/sim, no world or command calls
      for (const f of ['src/render3d/townlife_plan.js', 'src/render3d/townlife3d.js']) {
        const s = src(f);
        assert(!/from '\.\.\/sim\//.test(s) && !/\/sim\//.test(s.match(/^import .*$/gm).join('\n')), `${f} imports the sim`);
        assert(!/Math\.random|Date\.now/.test(s.replace(/\/\/.*$/gm, '')), `${f}: no Math.random or wall clock (stills repeat)`);
      }
      assert(!/townlife3d|showerAt/.test(src('src/sim/world.js')), 'the sim does not know about town life');
    },
  },
  {
    name: 'town life: plans and walks are deterministic (same zone, same plan; loopPose is pure)',
    fn() {
      const a = planTown(ZONES.valewyn, lifeTowns(ZONES.valewyn)[0], TILES, { dress: true });
      const b = planTown(ZONES.valewyn, lifeTowns(ZONES.valewyn)[0], TILES, { dress: true });
      eq(JSON.stringify(a.folk), JSON.stringify(b.folk), 'folk');
      eq(JSON.stringify(a.critters), JSON.stringify(b.critters), 'critters');
      for (const F of a.folk.slice(0, 10)) eq(JSON.stringify(loopPose(F, 123.4)), JSON.stringify(loopPose(F, 123.4 + F.loop)), `loop ${F.id} wraps`);
      // walkers really walk: over a loop each one moves several metres and its legs swing
      const walker = a.folk.find((F) => F.kind === 'walk');
      const ps = sampleTimes(walker).map((t) => loopPose(walker, t));
      assert(ps.some((p) => p.walking) && ps.some((p) => !p.walking), 'walks and dwells');
      assert(Math.max(...ps.map((p) => Math.hypot(p.x - ps[0].x, p.z - ps[0].z))) > 4, 'goes somewhere');
    },
  },
  {
    name: 'town life: day and night routines, and rain sends most people indoors',
    fn() {
      for (const id of Object.keys(START_TOWNS)) {
        const [P] = plansOf(id);
        const out = (f, r = 0) => P.folk.filter((F) => wantOut(F, f, r));
        const noon = out(0.45), night = out(0.95), rain = out(0.45, 1), dawn = out(0.2);
        assert(noon.length >= P.folk.length - 6, `${id}: most are out at noon (${noon.length}/${P.folk.length})`);
        assert(night.length <= P.folk.length * 0.3 && night.length >= 2, `${id}: few are out at night (${night.length})`);
        assert(night.some((F) => F.opts & OPT.LANTERN), `${id}: the night watch carries a lantern`);
        assert(!noon.some((F) => F.kind === 'watch'), `${id}: the watch sleeps by day`);
        assert(rain.length <= P.folk.length * 0.3, `${id}: rain sends most indoors (${rain.length} stay)`);
        assert(dawn.length < noon.length, `${id}: fewer before dawn`);
        const pig = P.critters.find((C) => C.kind === CRIT.PIGEON), cat = P.critters.find((C) => C.kind === CRIT.CAT);
        assert(pig && critterOut(pig, 0.45) && !critterOut(pig, 0.95) && !critterOut(pig, 0.45, 1), `${id}: pigeons by day, not at night or in rain`);
        assert(cat && critterOut(cat, 0.95) && !critterOut(cat, 0.45, 1), `${id}: cats day and night, in from the rain`);
      }
    },
  },
  {
    name: 'town life: passing showers come from the sim tick (every client agrees), fair on the first day, none in the desert or under cover',
    fn() {
      const vw = ZONES.valewyn;
      for (let t = 0; t < 48000 * 0.68; t += 100) eq(showerAt(t, vw), 0, 'day 0 is fair');
      let n = 0, N = 0;
      for (let t = 0; t < 48000 * 20; t += 100) { const r = showerAt(t, vw); assert(r >= 0 && r <= 1, 'rain 0..1'); eq(r, showerAt(t, vw), 'pure'); N++; if (r > 0) n++; }
      assert(n / N > 0.03 && n / N < 0.2, `showers are passing, not constant (${(n / N).toFixed(3)} of the time)`);
      for (const id of ['saffron', 'rootbound', 'hollow']) { assert(!showerZone(ZONES[id]), `${id}: no showers`); let any = 0; for (let t = 0; t < 48000 * 10; t += 500) any += showerAt(t, ZONES[id]); eq(any, 0, id); }
      assert(showerZone(ZONES.world) && showerZone(ZONES.emberpeak), 'the open world and Emberpeak get showers');
      const r3 = src('src/render3d/renderer3d.js');
      assert(/view\.weather == null && q\.get\('showers'\) !== '0' \? showerAt\(snap\.tick, zone\)/.test(r3), 'renderer3d.js: a set weather (?weather=) wins, ?showers=0 turns them off');
    },
  },
  {
    name: 'town life: Low quality and phones get the lite counts and no shadow pass; ?life=off turns it off',
    fn() {
      const Q = (v) => ({ get: (k) => (k === 'life' ? v : null) });
      const d = lifeCaps({ low: false, shadows: true }, Q(null)), l = lifeCaps({ low: true, shadows: false }, Q(null));
      eq(d.folk, DESK.folk, 'desktop folk'); eq(l.folk, LITE.folk, 'lite folk'); eq(l.critters, LITE.critters, 'lite critters');
      assert(d.shadows && !l.shadows, 'shadows on desktop only');
      eq(lifeCaps({ low: false }, Q('off')), null, '?life=off');
      eq(lifeCaps({ low: false, shadows: true }, Q('low')).folk, LITE.folk, '?life=low');
      eq(createTownLife(THREE, new THREE.Scene(), { quality: {}, q: Q('off') }), null, 'no kit when off');
    },
  },
  {
    name: 'town life: the 3D kit is two instanced meshes, cheap per person, and fills a square by day and empties it by night',
    fn() {
      const scene = new THREE.Scene();
      const life = createTownLife(THREE, scene, { quality: { low: false, shadows: true }, tilesDb: TILES });
      const tri = (g) => g.index.count / 3;
      assert(tri(life.mesh.geometry) < 900, `a person is ${tri(life.mesh.geometry)} triangles`);
      assert(tri(life.critterMesh.geometry) < 800, `the critter mesh is ${tri(life.critterMesh.geometry)} triangles`);
      const zone = ZONES.valewyn, reg = lifeTowns(zone)[0];
      const focus = new THREE.Vector3(reg.x + reg.w / 2, 0, reg.y + reg.h / 2);
      const day = { ...life.frame({ zone, snap: { entities: [] }, f: 0.45, rain: 0, now: 12, focus }) };
      assert(day.folk >= 25 && day.critters >= 8, `day: ${day.folk} people, ${day.critters} critters`);
      eq(life.mesh.count, day.folk, 'instances drawn = people out');
      const night = { ...life.frame({ zone, snap: { entities: [] }, f: 0.95, rain: 0, now: 13, focus }) };
      assert(night.folk < day.folk / 3 && night.folk >= 2, `night: ${night.folk} out`);
      const wet = { ...life.frame({ zone, snap: { entities: [] }, f: 0.45, rain: 1, now: 14, focus }) };
      assert(wet.folk < day.folk / 3, `rain: ${wet.folk} out`);
      // far from any town: nothing drawn
      const far = life.frame({ zone, snap: { entities: [] }, f: 0.45, rain: 0, now: 15, focus: new THREE.Vector3(5, 0, 5) });
      eq(far.folk + far.critters, 0, 'nothing far from a town');
      assert(!life.mesh.visible && !life.critterMesh.visible, 'no draw call when empty');
      // a pinned clock gives the same instances every time (stills repeat)
      life.frame({ zone, snap: { entities: [] }, f: 0.45, rain: 0, now: 12, focus });
      const a = Array.from(life.mesh.instanceMatrix.array.slice(0, 16 * 20));
      life.frame({ zone, snap: { entities: [] }, f: 0.45, rain: 0, now: 12, focus });
      eq(JSON.stringify(Array.from(life.mesh.instanceMatrix.array.slice(0, 16 * 20))), JSON.stringify(a), 'same clock, same pose');
      const lite = createTownLife(THREE, new THREE.Scene(), { quality: { low: true, shadows: false }, tilesDb: TILES });
      const ld = lite.frame({ zone, snap: { entities: [] }, f: 0.45, rain: 0, now: 12, focus });
      assert(ld.folk <= LITE.folk && ld.critters <= LITE.critters && !lite.mesh.castShadow, `lite: ${ld.folk} people, no shadow pass`);
    },
  },
  {
    name: 'town life: walking home at nightfall, then back out in the morning (the door walk, not a pop)',
    fn() {
      const life = createTownLife(THREE, new THREE.Scene(), { quality: { low: false, shadows: false }, tilesDb: TILES });
      const zone = ZONES.emberpeak, reg = lifeTowns(zone)[0];
      const focus = new THREE.Vector3(reg.x + reg.w / 2, 0, reg.y + reg.h / 2);
      let now = 10, f = 0.74, seenDoors = 0;
      life.frame({ zone, snap: { entities: [] }, f, now, focus });
      for (let i = 0; i < 2000; i++) { now += 0.1; f += 0.00008; const d = life.frame({ zone, snap: { entities: [] }, f, now, focus }); seenDoors = Math.max(seenDoors, d.doors); }
      assert(seenDoors >= 5, `people walk home as the evening comes (${seenDoors} at once)`);
      const late = { ...life.dev };
      assert(late.inside > late.out, `late evening: ${late.inside} inside, ${late.out} out`);
    },
  },
];
