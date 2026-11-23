// Creature kit (src/render3d/creature_kit.js): every foe template has a recipe, and every recipe builds headless
// (three.js runs in node; canvas painting is stubbed) into a cheap body: a few skinned meshes, a sane height, an
// update that runs through idle, walk, attack, hurt, cast and death without throwing.
import * as THREE from '../../src/vendor/three/three.module.min.js';
import { buildContent } from '../../src/data/maps/index.js';
import { RECIPES, ZONES } from '../../src/render3d/creature_recipes.js';

/** A canvas 2D context that accepts every call (paint is not checked here, only that the build runs). */
function stubDocument() {
  if (globalThis.document) return;
  const grad = { addColorStop() {} };
  const ctx = new Proxy({}, { get: (t, k) => (k in t ? t[k] : (k === 'createLinearGradient' || k === 'createRadialGradient' ? () => grad : () => {})), set: (t, k, v) => { t[k] = v; return true; } });
  globalThis.document = { createElement: () => ({ width: 1, height: 1, getContext: () => ctx, style: {} }) };
}

export const tests = [
  { name: 'every mob template has a kit recipe, and every recipe a mob', fn() {
    const c = buildContent();
    const ids = Object.keys(c.mobs);
    const missing = ids.filter((i) => !RECIPES[i]), extra = Object.keys(RECIPES).filter((i) => !c.mobs[i]);
    if (missing.length || extra.length) throw new Error(`missing ${missing.join(',')} extra ${extra.join(',')}`);
    const zoned = new Set(Object.values(ZONES).flat());
    const unzoned = ids.filter((i) => !zoned.has(i));
    if (unzoned.length) throw new Error('not in a lineup zone: ' + unzoned.join(','));
  } },
  { name: 'every recipe builds headless into a cheap, animated body', async fn() {
    stubDocument();
    const { buildCreature } = await import('../../src/render3d/creature_kit.js');
    const bad = [];
    for (const [id, r] of Object.entries(RECIPES)) {
      try {
        const twice = [buildCreature(THREE, r), buildCreature(THREE, r)];
        const b = twice[1];
        let skinned = 0, sprites = 0, verts = 0, other = 0;
        b.o.traverse((m) => { if (m.isSkinnedMesh) { skinned++; verts += m.geometry.attributes.position.count; } else if (m.isSprite) sprites++; else if (m.isMesh && m.visible && m.geometry.attributes.position.count) other++; });
        if (!(b.height > 0.25 && b.height < 6)) bad.push(`${id}: height ${b.height}`);
        if (skinned < 1 || skinned > 22) bad.push(`${id}: ${skinned} skinned meshes`);
        if (sprites > 24) bad.push(`${id}: ${sprites} sprites`);
        if (other > 6) bad.push(`${id}: ${other} unmerged meshes`);
        if (verts > 60000) bad.push(`${id}: ${verts} vertices`);
        // the second build of a recipe shares the first one's geometry
        const g0 = []; twice[0].o.traverse((m) => m.isSkinnedMesh && g0.push(m.geometry)); const g1 = []; b.o.traverse((m) => m.isSkinnedMesh && g1.push(m.geometry));
        if (g0.length !== g1.length || g0.some((g, i) => g !== g1[i])) bad.push(`${id}: geometry not shared between builds`);
        if (!g1.every((g) => g.userData.shared)) bad.push(`${id}: shared geometry not marked shared`);
        for (const st of [{ t: 1 }, { t: 2, moving: true, speed: 3 }, { t: 3, attackT: 2.9 }, { t: 4, hurtT: 3.95 }, { t: 5, cast: true }, { t: 6, deadT: 5.5 }, { t: 9, deadT: 5.5 }]) b.update(1 / 60, { moving: false, speed: 0, attackT: null, hurtT: null, deadT: null, cast: false, ...st });
        if (!b.mats.length || !b.mats.every((m) => m.isMaterial)) bad.push(`${id}: no materials`);
      } catch (e) { bad.push(`${id}: ${String(e && e.stack || e).split('\n').slice(0, 3).join(' | ')}`); }
    }
    if (bad.length) throw new Error(bad.length + ' bad: ' + bad.slice(0, 12).join('\n'));
  } },
  { name: 'humanoid recipes build their dress in pieces for the rigged human (piecesOnly)', async fn() {
    stubDocument();
    const { buildCreature } = await import('../../src/render3d/creature_kit.js');
    const { humanSpec } = await import('../../src/render3d/foe_human.js');
    const bad = [];
    for (const [id, r] of Object.entries(RECIPES)) {
      if (r.body !== 'humanoid') continue;
      try {
        const k = buildCreature(THREE, { ...r, piecesOnly: true });
        const bones = k.pieces.map((p) => p.bone);
        for (const b of ['hand_r', 'hand_l', 'Head', 'pelvis', 'spine_03']) if (!bones.includes(b)) bad.push(`${id}: no ${b} piece`);
        let sk = 0; k.container.traverse((m) => { if (m.isSkinnedMesh) sk++; });
        if (sk > 16) bad.push(`${id}: ${sk} skinned meshes in the dress`);
        k.update(1 / 60, { t: 1, moving: true, speed: 2, attackT: 0.9, hurtT: 0.95, deadT: null });
        const sp = humanSpec(r);
        if (!sp.parts.body || !sp.parts.legs) bad.push(`${id}: spec without an outfit`);
        k.release();
      } catch (e) { bad.push(`${id}: ${String(e && e.stack || e).split(String.fromCharCode(10)).slice(0, 3).join(' | ')}`); }
    }
    if (bad.length) throw new Error(bad.slice(0, 12).join(String.fromCharCode(10)));
  } },
];
