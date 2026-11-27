// The skill legendaries' looks (src/render3d/legend_kit.js, legend3d.js; BRIEF_legendary_visuals.md, approved by
// Scott 2026-11-27): the pieces and their idle tells exist only while the item is worn, every skill tell keeps to the
// budget (at most 1 extra fx recipe and 40 particles on High), Low quality is a flat orange tint with no particles, and
// Inkwalk's "?" shows only to the Inkblade and her party. Also the data the tells read (the hammers' spiral in the
// snapshot, the charge pips, the Rod's toll).
import * as THREE from '../../src/vendor/three/three.module.min.js';
import { assert, eq } from './_helpers.mjs';
import { castNow, fixtureContent } from '../sim/_fixtures.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent } from '../../src/data/maps/index.js';
import { SKILL_LEGENDARIES } from '../../src/data/legendary_powers.js';
import { soundsFor } from '../../src/audio/sfx_table.js';

function stubDocument() {
  if (globalThis.document) return;
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx, style: {} }) };
}
stubDocument();
const { legendsWorn, LEGEND_ITEMS, LEGEND_ORANGE, LOW_TINT, TELL_BUDGET, tollingHammersLook, emberLandRing, emberChains, dustTrail, inkCut, tetherRope } = await import('../../src/render3d/legend_kit.js');
const { createLegend3d, inkwalkMarks, TELL_PARTICLES, TELL_RECIPES } = await import('../../src/render3d/legend3d.js');
const { heroSpec, dress } = await import('../../src/render3d/gear.js');

const CONTENT = buildContent();
const ITEMS = CONTENT.items;
const ROWS = SKILL_LEGENDARIES.map((r) => ({ id: r[0], slot: r[2] === 'two' ? 'main' : r[2], cls: { tolling_rod: 'mender', errata: 'scribe', unwritten_step: 'inkblade', second_fall: 'warden', far_tether: 'wayfinder' }[r[7]] }));
const wearing = (row) => ({ [row.slot]: { item: row.id, inst: { ilvl: ITEMS[row.id].level, rarity: 'legendary', affixes: [] } } });

/** A bare skeleton with the bones the gear sockets use (hero.js parent chain), standing in for an assembled hero. */
function fakeHero() {
  const o = new THREE.Group(), bones = {};
  const mk = (n, parent, p = [0, 0.1, 0]) => { const b = new THREE.Bone(); b.name = n; b.position.set(...p); (parent ? bones[parent] : o).add(b); bones[n] = b; return b; };
  mk('root', null, [0, 0, 0]); mk('pelvis', 'root', [0, 0.95, 0]); mk('spine_01', 'pelvis'); mk('spine_02', 'spine_01'); mk('spine_03', 'spine_02'); mk('neck_01', 'spine_03'); mk('Head', 'neck_01');
  for (const s of ['l', 'r']) { const x = s === 'l' ? 0.2 : -0.2; mk('upperarm_' + s, 'spine_03', [x, 0, 0]); mk('lowerarm_' + s, 'upperarm_' + s, [x, 0, 0]); mk('hand_' + s, 'lowerarm_' + s, [x, 0, 0]); mk('thigh_' + s, 'pelvis', [x / 2, 0, 0]); mk('calf_' + s, 'thigh_' + s, [0, -0.43, 0]); mk('foot_' + s, 'calf_' + s, [0, -0.45, 0]); }
  const ch = { o, bones, mats: [], post: [], fx: [], live: { speed: 2, res: { cur: 80, max: 100 } } };
  ch.socket = (b, { pos = [0, 0, 0], rot = [0, 0, 0], scale = 1 } = {}) => { const h = new THREE.Group(); h.position.set(...pos); h.rotation.set(...rot); h.scale.setScalar(scale); bones[b].add(h); return h; };
  return ch;
}
const L = { gltf: async () => ({ scene: new THREE.Group() }) };     // the class props (sword, shield, book): empty here
const pieces = (o) => { const out = []; o.traverse((m) => { if (m.userData && m.userData.legend) out.push(m.userData.legend); }); return out; };
const pointsIn = (o) => { const out = []; o.traverse((m) => { if (m.isPoints) out.push(m); }); return out; };
async function dressed(cls, equip, opts) {
  const spec = heroSpec(cls, 0, equip, ITEMS);
  const ch = fakeHero(), layer = new THREE.Group();
  const out = await dress(L, ch, spec, layer, opts);
  for (let f = 0; f < 30; f++) for (const fn of ch.fx) fn(1 / 30, ch, f / 30);
  return { spec, ch, layer, out };
}

export const tests = [
  {
    name: 'legend looks: the five items are known, and only a worn one shows (spec, signature, pieces, idle tells)',
    async fn() {
      eq(Object.keys(LEGEND_ITEMS).sort().join(), SKILL_LEGENDARIES.map((r) => r[0]).sort().join(), 'every skill legendary has a look');
      for (const row of ROWS) {
        const bare = await dressed(row.cls, {});
        eq(bare.spec.legend, undefined, `${row.cls} without it: no legend on the spec`);
        eq(pieces(bare.ch.o).length, 0, `${row.cls} without it: no legendary piece`);
        eq(Object.keys(bare.out.legendTells).length, 0, `${row.cls} without it: no idle tell`);
        const w = await dressed(row.cls, wearing(row));
        eq(JSON.stringify(w.spec.legend), JSON.stringify([row.id]), `${row.id} on the spec`);
        assert(w.spec.sig !== bare.spec.sig, `${row.id} changes the signature (the body is rebuilt)`);
        assert(pieces(w.ch.o).includes(row.id), `${row.id}: its piece is on the body`);
        const t = w.out.legendTells[row.id];
        assert(t && t.moving, `${row.id}: an idle tell that moves on High`);
        const pts = pointsIn(w.layer).reduce((s, p) => s + p.userData.particles, 0);
        eq(pts, t.particles, `${row.id}: its idle particles are the ones counted`);
        assert(t.particles <= 3, `${row.id}: the idle tell is small (${t.particles} particles)`);
        // another item in the same slot: the look goes again
        const other = Object.values(ITEMS).find((it) => it.slot === ITEMS[row.id].slot && it.rarity !== 'legendary' && !it.power);
        if (other) eq((await dressed(row.cls, { [row.slot]: { item: other.id, inst: { rarity: 'rare' } } })).spec.legend, undefined, `${row.id}: replaced, gone`);
      }
      eq(JSON.stringify(legendsWorn({ main: 'the_tolling_rod', feet: { item: 'second_fall_sabatons' }, head: null })), JSON.stringify(['second_fall_sabatons', 'the_tolling_rod']), 'both entry shapes');
    },
  },
  {
    name: 'legend looks: the Cowl is its own deep hood (no Ranger hood, no hair, no helm) with a black inside and two eyes',
    async fn() {
      const row = ROWS.find((r) => r.id === 'unwritten_cowl');
      const w = await dressed('inkblade', wearing(row));
      eq(w.spec.parts.head, null, 'no CC0 hood under it'); eq(w.spec.hair, null, 'no hair'); eq(w.spec.helm, null, 'no helm');
      let cowl = null; w.ch.o.traverse((m) => { if (m.userData.legend === 'unwritten_cowl') cowl = m; });
      let black = 0, eyes = 0;
      cowl.traverse((m) => { if (m.isMesh && m.material.isMeshBasicMaterial && m.material.color.getHex() === 0x050408) black++; if (m.isMesh && m.material.isMeshBasicMaterial && m.material.color.getHex() === 0x9c9ca8) eyes++; });
      assert(black >= 2, 'a flat ink-black inside and face'); eq(eyes, 2, 'two faint grey eyes');
      assert(w.out.gearMats.length >= 3, 'the hood fades with her in Inkwalk (its materials are handed to the body)');
    },
  },
  {
    name: 'legend looks: Low quality is a flat orange tint (no particles, nothing moving) for every idle tell',
    async fn() {
      for (const row of ROWS) {
        const w = await dressed(row.cls, wearing(row), { low: true });
        eq(pointsIn(w.layer).length, 0, `${row.id}: no particles on Low`);
        const t = w.out.legendTells[row.id];
        assert(t && t.particles === 0 && !t.moving, `${row.id}: a still tell on Low`);
        let tinted = 0;
        w.ch.o.traverse((m) => { if (m.isMesh && m.material.emissive && !m.userData.keepColor && pieces(m).length === 0) { /* not a legend root */ } });
        w.ch.o.traverse((m) => { if (m.userData.legend) m.traverse((k) => { if (k.isMesh && k.material.emissive && !k.userData.keepColor && k.material.emissive.getHexString() === LEGEND_ORANGE.slice(1)) tinted++; }); });
        assert(tinted > 0, `${row.id}: tinted the legendary orange`);
      }
      assert(LOW_TINT > 0 && LOW_TINT < 1, 'a flat tint, not a glow');
    },
  },
  {
    name: 'legend looks: every skill tell keeps to the budget (1 recipe, 40 particles on High) and has none on Low',
    fn() {
      for (const [k, n] of Object.entries(TELL_PARTICLES)) assert(n <= TELL_BUDGET.particles, `${k}: ${n} particles`);
      for (const [k, n] of Object.entries(TELL_RECIPES)) assert(n <= TELL_BUDGET.recipes, `${k}: ${n} recipes`);
      const built = { tolling: tollingHammersLook({ n: 5 }), second_fall: emberLandRing(2.5), chains: emberChains(1), far_tether: dustTrail(30), rope: tetherRope(), cut: inkCut() };
      for (const [k, o] of Object.entries(built)) {
        const n = pointsIn(o).reduce((s, p) => s + p.userData.particles, 0);   // (traverse includes o itself)
        assert(n <= TELL_BUDGET.particles, `${k} builds ${n} particles`);
        if (TELL_PARTICLES[k] != null) eq(n, TELL_PARTICLES[k], `${k}: the table says what it builds`);
      }
      for (const o of [tollingHammersLook({ n: 5 }, { low: true }), emberLandRing(2.5, { low: true }), emberChains(1, { low: true }), tetherRope({ low: true }), inkCut({ low: true })]) eq(pointsIn(o).length, 0, 'Low: no particles');
    },
  },
  {
    name: 'legend looks: the skill tells run from the sim\'s events and auras, within budget, and only for the wearer',
    fn() {
      for (const low of [false, true]) {
        const scene = new THREE.Scene();
        const G = createLegend3d(scene, { low });
        const ents = [
          { id: 1, kind: 'player', zone: 'z', x: 0, y: 0, cls: 'warden', equip: wearing(ROWS.find((r) => r.id === 'second_fall_sabatons')), auras: [] },
          { id: 2, kind: 'player', zone: 'z', x: 32, y: 0, cls: 'wayfinder', equip: wearing(ROWS.find((r) => r.id === 'far_tether_bow')), auras: [] },
          { id: 3, kind: 'player', zone: 'z', x: 64, y: 0, cls: 'inkblade', equip: wearing(ROWS.find((r) => r.id === 'unwritten_cowl')), auras: [{ id: 'inkblade_inkwalk', startTick: 0, until: 40 }] },
          { id: 4, kind: 'player', zone: 'z', x: 96, y: 0, cls: 'warden', equip: {}, auras: [] },
          { id: 10, kind: 'mob', zone: 'z', x: 16, y: 16, faction: 'hostile', elite: true, auras: [{ id: 'lg_second_fall_root', src: 1, startTick: 0, until: 30 }, { id: 'scribe_rewritten', src: 9, startTick: 0, until: 120 }] },
          { id: 11, kind: 'mob', zone: 'z', x: 48, y: 16, faction: 'hostile', auras: [{ id: 'lg_far_tether_root', src: 2, startTick: 0, until: 27 }] },
        ];
        const actors = new Map(ents.map((e) => [e.id, { e, root: Object.assign(new THREE.Group(), {}), height: 1.6, yaw: 0, body: null }]));
        for (const a of actors.values()) a.root.position.set(a.e.x / 16, 0, a.e.y / 16);
        const at = (id, w) => { const a = actors.get(id); if (!a) return null; const p = a.root.position.clone(); if (w === 'chest' || w === 'hand') p.y += 1; return p; };
        const A = { get: (id) => actors.get(id) || null };
        const hint = { attackT0: null };
        G.feed([{ type: 'b2_proc', id: 1, what: 'land', ability: 'warden_ember_leap' }, { type: 'b2_proc', id: 4, what: 'land', ability: 'warden_ember_leap' }], 0, at, (id) => (actors.get(id) || {}).e);
        eq(G.counts.rings, 1, `${low ? 'Low' : 'High'}: one ring, for the Warden in the Sabatons only`);
        let peak = 0;
        for (let f = 0; f < 60; f++) {
          const now = f / 20;
          if (f === 10) hint.attackT0 = now;
          G.update({ tick: f, entities: ents }, 0, { viewerId: 3, zone: 'z' }, A, now, 0.05, at, (id) => (id === 3 ? hint : null));
          if (f === 2) { const c = G.counts; eq(c.chains, 1, 'chains on the pinned foe'); eq(c.ropes, 1, 'the tether'); eq(c.pools, 1, 'the shadow pool'); eq(c.marks, 2, 'a "?" over each foe near her'); }
          if (f === 11) assert(G.counts.cuts >= 1, 'a blade cut out of the pool on her strike');
          const pts = pointsIn(G.layer).filter((p) => p.visible && p.userData.particles).reduce((s, p) => s + p.userData.particles, 0);
          peak = Math.max(peak, pts);
          if (low) eq(pts, 0, `Low: no particles (frame ${f})`);
        }
        assert(peak <= TELL_BUDGET.particles * 2, `High: two tells at once stay within their budgets (${peak})`);
        eq(G.counts.rings, 0, 'the ring cooled and went (1.5 s and the fade)');
        eq(G.counts.ropes, 0, 'the rope snapped away after the root');
      }
    },
  },
  {
    name: 'legend looks: Inkwalk\'s "?" is for the Inkblade and her party only, while she wears the Cowl',
    fn() {
      const cowl = wearing(ROWS.find((r) => r.id === 'unwritten_cowl'));
      const walk = [{ id: 'inkblade_inkwalk' }];
      const base = () => [
        { id: 1, kind: 'player', zone: 'z', x: 0, y: 0, party: 7, equip: cowl, auras: walk },
        { id: 2, kind: 'player', zone: 'z', x: 0, y: 0, party: 7, equip: {}, auras: [] },
        { id: 3, kind: 'player', zone: 'z', x: 0, y: 0, party: null, equip: {}, auras: [] },
        { id: 4, kind: 'player', zone: 'z', x: 0, y: 0, party: 8, equip: {}, auras: [] },
        { id: 20, kind: 'mob', zone: 'z', x: 40, y: 0, faction: 'hostile' },
        { id: 21, kind: 'mob', zone: 'z', x: 16 * 20, y: 0, faction: 'hostile' },
        { id: 22, kind: 'mob', zone: 'z', x: 20, y: 0, faction: 'hostile', dead: true },
        { id: 23, kind: 'mob', zone: 'other', x: 20, y: 0, faction: 'hostile' },
        { id: 24, kind: 'npc', zone: 'z', x: 20, y: 0, faction: 'friendly' },
      ];
      const S = (ents) => ({ tick: 1, entities: ents });
      eq(JSON.stringify(inkwalkMarks(S(base()), 1)), '[20]', 'the Inkblade herself: the near living foe only');
      eq(JSON.stringify(inkwalkMarks(S(base()), 2)), '[20]', 'her party');
      eq(JSON.stringify(inkwalkMarks(S(base()), 3)), '[]', 'a hero not in a party: nothing');
      eq(JSON.stringify(inkwalkMarks(S(base()), 4)), '[]', 'another party: nothing');
      const noCowl = base(); noCowl[0] = { ...noCowl[0], equip: {} };
      eq(JSON.stringify(inkwalkMarks(S(noCowl), 1)), '[]', 'Inkwalk without the Cowl: no mark');
      const still = base(); still[0] = { ...still[0], auras: [] };
      eq(JSON.stringify(inkwalkMarks(S(still), 1)), '[]', 'the Cowl but not in Inkwalk: no mark');
      const solo = base(); solo[0] = { ...solo[0], party: null };
      eq(JSON.stringify(inkwalkMarks(S(solo), 2)), '[]', 'out of the party, her old friend sees nothing');
    },
  },
  {
    name: 'legend looks: the data the tells read (the hammers\' spiral in the snapshot, charge pips, the Rod\'s toll)',
    fn() {
      const content = { ...fixtureContent({ builds2: true, items: CONTENT.items }), classGear: CONTENT.classGear, armorTypes: CONTENT.armorTypes };
      const spiralOf = (wear) => {
        const w = createWorld({ seed: 3, content });
        const pid = w.addPlayer({ name: 'Bell', cls: 'mender', zone: 'arena', x: 10, y: 15, level: 15, gearMode: 'design' });
        const p = w.get(pid), C = w.internals;
        C.prog.learn(p, 'mender_tolling_hammers'); p.build.firstKill = true;
        if (wear) { p.gearMode = null; p.equip = { main: { item: wear, inst: { ilvl: 12, rarity: 'legendary', affixes: [] } } }; }
        C.data.forget(p.id); C.stats.recalc(p); p.res.cur = p.res.max; w.step();
        castNow(w, pid, 'mender_tolling_hammers');
        const o = w.snapshot().entities.find((e) => e.kind === 'object' && e.objType === 'mender_tolling_hammers');
        return o && o.spiral;
      };
      const plain = spiralOf(null), rod = spiralOf('the_tolling_rod');
      assert(plain && rod, 'the hammers carry their spiral');
      eq(plain.n, 3, 'three hammers'); eq(rod.n, 5, 'five with the Rod');
      eq(rod.reach, plain.reach * 1.5, 'half again as far');
      const w = createWorld({ seed: 3, content });
      const pid = w.addPlayer({ name: 'Brann', cls: 'warden', zone: 'arena', x: 10, y: 15, level: 15, gearMode: 'design' });
      const p = w.get(pid), C = w.internals;
      C.prog.learn(p, 'warden_ember_leap'); p.build.firstKill = true;
      p.gearMode = null; p.equip = { feet: { item: 'second_fall_sabatons', inst: { ilvl: 20, rarity: 'legendary', affixes: [] } } };
      if (!p.bar.includes('warden_ember_leap')) p.bar[5] = 'warden_ember_leap';
      C.data.forget(p.id); C.stats.recalc(p); w.step();
      const slot = w.snapshot().hud[pid].bar.find((s) => s.ability === 'warden_ember_leap');
      eq(slot.chargesMax, 2, 'Ember Leap shows two pips'); eq(slot.charges, 2, 'both ready');
      const ev = { type: 'cast_start', src: 1, ability: 'mender_tolling_hammers', castTicks: 0 };
      const toll = (wears) => soundsFor(ev, { me: 1, cls: 'mender', wears: () => wears }).find((s) => s.id === 'oath_ring');
      assert(toll(true) && toll(true).pitch < 1, 'the Rod: a lower bell toll on the cast');
      eq(toll(false), undefined, 'without it: no toll');
      const friend = soundsFor({ ...ev, src: 2 }, { me: 1, cls: 'warden', isPlayer: (id) => id === 2 || id === 1, wears: () => true }).find((s) => s.id === 'oath_ring');
      assert(friend && friend.from === 2, 'a friend\'s toll is placed at the friend');
    },
  },
];
