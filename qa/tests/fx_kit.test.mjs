// FX kit and anim kit (src/render3d/fx_kit.js, fx_recipes.js, anim_kit.js; approved 2026-11-23): every player ability
// has an effect line, every recipe a line names exists and is well formed, and the anim kit's combat blend never pops.
import { assert, eq } from './_helpers.mjs';
import * as THREE from '../../src/vendor/three/three.module.min.js';
import { ABILITIES } from '../../src/data/abilities.js';
import { CLASSES } from '../../src/data/classes.js';
import { RECIPES, ABILITY_FX, AURA_FX, SPRITE_FX, PROJ_FX } from '../../src/render3d/fx_recipes.js';
import { createAnimKit, pose, mirrorPose, BONES } from '../../src/render3d/anim_kit.js';
import { TILE, SCHOOL_COLORS } from '../../src/render3d/fx_kit.js';

const TYPES = new Set(['burst', 'flash', 'ring', 'decal', 'stream', 'arc', 'beam', 'shield', 'projectile', 'light', 'screen', 'hitflash', 'spawn']);

/** A bare skeleton with the anim kit's bones (and the hero.js parent chain), standing in for an assembled hero. */
function fakeHero() {
  const o = new THREE.Group(), bones = {};
  const mk = (n, parent, p = [0, 0.1, 0]) => { const b = new THREE.Bone(); b.name = n; b.position.set(...p); (parent ? bones[parent] : o).add(b); bones[n] = b; return b; };
  mk('root', null, [0, 0, 0]); mk('pelvis', 'root', [0, 0.95, 0]);
  mk('spine_01', 'pelvis'); mk('spine_02', 'spine_01'); mk('spine_03', 'spine_02'); mk('neck_01', 'spine_03'); mk('Head', 'neck_01');
  for (const s of ['l', 'r']) {
    const x = s === 'l' ? 0.2 : -0.2;
    mk('clavicle_' + s, 'spine_03', [x / 4, 0, 0]); mk('upperarm_' + s, 'clavicle_' + s, [x, 0, 0]); mk('lowerarm_' + s, 'upperarm_' + s, [x, 0, 0]); mk('hand_' + s, 'lowerarm_' + s, [x, 0, 0]);
    mk('thigh_' + s, 'pelvis', [x / 2, 0, 0]); mk('calf_' + s, 'thigh_' + s, [0, -0.43, 0]); mk('foot_' + s, 'calf_' + s, [0, -0.45, 0]);
  }
  return { o, bones, applyPost: null };
}

export const tests = [
  {
    name: 'fx kit: every class ability in abilities.js has an effect line, and every named recipe exists',
    fn() {
      const classIds = new Set(Object.values(CLASSES).flatMap((c) => c.abilities.map((a) => a.id)));
      for (const [id, ab] of Object.entries(ABILITIES)) {
        if (!ab.cls) continue;
        assert(ABILITY_FX[id], `${id} has an ABILITY_FX line`);
        assert(classIds.has(id), `${id} belongs to a class list`);
      }
      const names = [];
      for (const v of Object.values(ABILITY_FX)) for (const k of ['cast', 'release', 'proj', 'hit', 'self', 'ground', 'swing']) if (v[k]) names.push(v[k]);
      names.push(...Object.values(AURA_FX), ...Object.values(SPRITE_FX), ...Object.values(PROJ_FX));
      names.push('hit_crit', 'miss_puff', 'levelup', 'loot_sparkle', 'death_burst', 'charge_mob', 'charge_school', 'release_flash', 'aura_down', 'taunt', 'buff_ring', 'ground_ring', 'swing_arc', 'swing_dagger');
      for (const n of names) assert(RECIPES[n], `recipe ${n} exists`);
    },
  },
  {
    name: 'fx kit: recipes are well formed (layer types, tiles, colours, projectile hits)',
    fn() {
      const tiles = (t) => (Array.isArray(t) ? t : t ? [t] : []);
      for (const [name, r] of Object.entries(RECIPES)) {
        assert(Array.isArray(r.layers) && r.layers.length, `${name} has layers`);
        for (const L of r.layers) {
          assert(TYPES.has(L.type), `${name}: layer type ${L.type}`);
          for (const t of tiles(L.tile)) assert(TILE[t] != null, `${name}: tile ${t}`);
          if (typeof L.color === 'string' && !L.color.startsWith('#')) assert(SCHOOL_COLORS.ink[L.color], `${name}: colour key ${L.color}`);
          if (L.type === 'projectile' && L.hit) assert(RECIPES[L.hit], `${name}: hit ${L.hit}`);
          if (L.type === 'spawn') assert(RECIPES[L.recipe], `${name}: spawn ${L.recipe}`);
          for (const H of [...(L.head || []), ...[].concat(L.shed || [])]) for (const t of tiles(H.tile)) assert(TILE[t] != null, `${name}: head/shed tile ${t}`);
        }
      }
    },
  },
  {
    name: 'anim kit: a mirrored pose mirrors back, and the combat blend over the clips never pops',
    fn() {
      const p = pose({ R_upperarm: [-1.2, 0.3, 0.5], spine_01: [0.2, 0.4, 0.1], root: [0.1, -0.1, 0.2], L_grip: 0.3 });
      const back = mirrorPose(mirrorPose(p));
      for (let i = 0; i < p.length; i++) assert(Math.abs(back[i] - p[i]) < 1e-6, `mirror twice at ${i}`);
      eq(BONES.length, 20, 'twenty animated bones');
      const ch = fakeHero();
      const A = createAnimKit(THREE, ch, { cls: 'warden' });
      const dt = 1 / 60;
      let last = 0, maxStep = 0, peak = 0, maxTurn = 0;
      const prev = BONES.map((n) => ch.bones[n].quaternion.clone());
      for (let f = 0; f < 240; f++) {
        const t = f * dt;
        for (const n of BONES) ch.bones[n].quaternion.identity();            // what a clip would pose
        const w = A.overlay(dt, { t, attackT: 0.5, hurtT: 2.6, moving: false, castT: null });
        maxStep = Math.max(maxStep, Math.abs(w - last)); peak = Math.max(peak, w); last = w;
        // the strike itself is meant to be fast (0.07 s); everywhere else, blending in and out and the hit reaction, no jumps
        const strike = t > 0.72 && t < 0.97;
        BONES.forEach((n, i) => { if (!strike) maxTurn = Math.max(maxTurn, ch.bones[n].quaternion.angleTo(prev[i])); prev[i].copy(ch.bones[n].quaternion); });
      }
      assert(peak > 0.9, `the swing takes over (peak ${peak.toFixed(2)})`);
      assert(maxStep < 0.35, `the blend weight moves smoothly (largest step ${maxStep.toFixed(3)})`);
      assert(last < 0.05, `and hands back to the clips (${last.toFixed(3)})`);
      assert(maxTurn < 0.35, `outside the strike no bone jumps more than 0.35 rad in a frame (${maxTurn.toFixed(3)})`);
    },
  },
];
