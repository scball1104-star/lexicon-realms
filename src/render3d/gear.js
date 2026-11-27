// Gear: which outfit parts, dyes, helms, capes and weapons a hero wears, from the player's class, look and EQUIPPED
// items (snapshot `equip`), plus the code-built pieces the free packs do not have. The code-built pieces are ported
// from the approved hero mockup (D:\LQOnline\mockups3d_hero\js\gear.js).
//
//   heroSpec(cls, look, equip, items) -> spec   (spec.sig changes whenever the hero would look different)
//   npcSpec(template, sprite)         -> spec   (townsfolk and trainers wear the same outfits)
//   await dress(L, ch, spec, layer)   -> { lights: [{ obj, color, k }] }  weapons, helm, cape, rare effects onto an assembled body
import * as THREE from '../vendor/three/three.module.min.js';
import { mergeGeometries } from '../vendor/three/addons/utils/BufferGeometryUtils.js';
import { addCape, dyeMaterial } from './hero.js';
import { radial, woodTex, leatherTex, woolTex, seeded } from './textures.js';
import { LOOKS, HAIRS, HEIGHTS, appFor, lookWithApp } from '../data/appearance.js';   // wave 6: the customization kit
import { legendsWorn, dressLegend, LEGEND_ITEMS } from './legend_kit.js';   // the five skill legendaries' looks (2026-11-27)

const RAR_GLOW = { magic: '#6f8cff', rare: '#ffb050', epic: '#a335ee', legendary: '#ff8a2a', set: '#3cdc6a' };
const RANK = { common: 0, magic: 1, rare: 2, epic: 2, legendary: 3, set: 3 };      // epic (purple, 2026-11-22): a rare's look, its own glow

// ---------- the five classes, three looks each (the art lane's look notes: assets/sprites/chars/<cls>.json) ----------
const SKIN = { light: '#fff0e4', medium: '#d8a283', dark: '#8f5d45' };
// today's three looks per class now live in src/data/appearance.js (wave 6: the UI and the sim read them too), unchanged
export { LOOKS };
const ALT_MAP = { peasant2: 'tex/T_Peasant_2_BaseColor.jpg', ranger3: 'tex/T_Ranger_3_BaseColor.jpg' };
const CLASS_ARMOR = { warden: 'plate', mender: 'cloth', scribe: 'cloth', wayfinder: 'mail', inkblade: 'leather' };
const CLASS_WEAPONS = { warden: ['sword', 'shield'], mender: ['rod', 'bell'], scribe: ['quill', 'book'], wayfinder: ['bow', null], inkblade: ['dagger', 'dagger'] };

/** One equip entry -> { id, rarity, armor, weapon } (unknown ids still give the slot's class default). */
function itemOf(entry, items, cls, slot) {
  if (!entry) return null;
  const id = typeof entry === 'string' ? entry : entry.item;
  const inst = typeof entry === 'string' ? null : entry.inst || null;
  const def = (items && items[id]) || {};
  const rarity = (inst && inst.rarity) || def.rarity || 'common';
  let armor = (inst && inst.armorType) || def.armorType || null;
  if (Array.isArray(armor)) armor = armor.includes(CLASS_ARMOR[cls]) ? CLASS_ARMOR[cls] : armor[0];
  if (armor === 'class' || (!armor && ['head', 'chest', 'legs', 'feet', 'hands'].includes(slot))) armor = CLASS_ARMOR[cls];
  let weapon = (inst && inst.weaponType) || def.weaponType || null;
  if (Array.isArray(weapon)) weapon = weapon.find((w) => CLASS_WEAPONS[cls].includes(w)) || weapon[0];
  if (!weapon && (slot === 'main' || slot === 'two')) weapon = CLASS_WEAPONS[cls][0];
  if (!weapon && slot === 'off') weapon = CLASS_WEAPONS[cls][1];
  return { id, rarity, armor, weapon, rank: RANK[rarity] || 0 };
}

function slotDye(base, it) {
  const d = { ...(base || { hue: 0, sat: 1, val: 1 }) };
  if (!it) return d;
  if (it.rank === 1) d.rim = [RAR_GLOW.magic, 0.1, 3.0];
  if (it.rank >= 2) { d.val = (d.val || 1) * 0.6; d.metalGlow = [RAR_GLOW[it.rarity] || RAR_GLOW.rare, 1.0]; d.rim = [RAR_GLOW[it.rarity] || RAR_GLOW.rare, 0.22, 3.0]; }
  return d;
}

/** The look of a hero from class, look index and equipped items. */
export function heroSpec(cls, look, equip = {}, items = null, app = null) {
  const C = LOOKS[cls] ? cls : 'warden';
  // wave 6: a hero's own appearance (src/data/appearance.js) laid over its look; no app = today's look, unchanged
  const a = appFor(C, look, app);
  const lk = a ? lookWithApp(LOOKS[C][Math.max(0, Math.min(2, look | 0))], a) : LOOKS[C][Math.max(0, Math.min(2, look | 0))];
  const sx = lk.base === 'female' ? 'Female' : 'Male';
  const it = {};
  for (const s of ['main', 'off', 'two', 'head', 'chest', 'legs', 'feet', 'hands', 'trinket']) it[s] = itemOf(equip && equip[s], items, C, s);
  const main = it.two || it.main;
  const chest = it.chest;
  const ranger = (a) => a === 'plate' || a === 'mail' || a === 'leather';
  const outfit = (a) => (ranger(a) ? 'Ranger' : 'Peasant');
  // plate's common starter chest is the padded jerkin: Peasant cut; magic and up plate is the Ranger kit with a pauldron
  const chestCut = chest ? (chest.armor === 'plate' && chest.rank === 0 ? 'Peasant' : outfit(chest.armor)) : (C === 'wayfinder' || C === 'inkblade' ? 'Ranger' : 'Peasant');
  const parts = {
    body: `${sx}_${chestCut}_Body`,
    arms: `${sx}_${it.hands ? outfit(it.hands.armor) : chestCut}_Arms`,
    legs: `${sx}_${it.legs ? outfit(it.legs.armor) : chestCut}_Legs`,
    feet: it.feet && ranger(it.feet.armor) ? (sx === 'Male' ? 'Male_Ranger_Feet_Boots' : 'Female_Ranger_Feet') : chestCut === 'Ranger' ? (sx === 'Male' ? 'Male_Ranger_Feet_Boots' : 'Female_Ranger_Feet') : `${sx}_Peasant_Feet`,
    head: null, shoulders: null,
  };
  const plateUp = (chest && chest.armor === 'plate' && chest.rank >= 1) || (it.head && it.head.armor === 'plate' && it.head.rank >= 1);
  if (plateUp || (chest && chest.armor === 'mail' && chest.rank >= 2)) parts.shoulders = sx === 'Male' ? 'Male_Ranger_Acc_Pauldron' : 'Female_Ranger_Acc_Pauldrons';
  let helm = null, hood = false;
  if (it.head) {
    if (it.head.armor === 'plate' || it.head.armor === 'mail') helm = { style: it.head.rank >= 2 ? 'great' : 'nasal', rank: it.head.rank, rarity: it.head.rarity };
    else hood = true;
  } else if (lk.helmed) helm = { style: 'nasal', rank: 0, rarity: 'common' };
  if (lk.hood && !helm) hood = true;
  // the skill legendaries (legend_kit.js): the Cowl is its own code-built hood, so no Ranger hood under it
  const legend = legendsWorn(equip);
  const cowl = legend.includes('unwritten_cowl') && it.head && it.head.id === 'unwritten_cowl';
  if (cowl) { helm = null; hood = true; }
  if (hood && !cowl) parts.head = sx === 'Male' ? 'Male_Ranger_Head_Hood' : 'Female_Ranger_Head_Hood';
  const dye = {}, map = {};
  const per = { body: chest, arms: it.hands || chest, legs: it.legs, feet: it.feet, head: it.head, shoulders: chest };
  for (const s of Object.keys(parts)) {
    if (!parts[s]) continue;
    const cut = /Ranger/.test(parts[s]) ? 'ranger' : 'peasant';
    const rare = per[s] && per[s].rank >= 2;
    if (rare) map[s] = cut === 'ranger' ? ALT_MAP.ranger3 : ALT_MAP.peasant2;
    else if (lk.map && cut === 'peasant') map[s] = ALT_MAP[lk.map];
    dye[s] = slotDye(lk.dye, per[s]);
  }
  const topRank = Math.max(chest ? chest.rank : 0, it.head ? it.head.rank : 0);
  const cape = chest && chest.rank >= 1 ? { color: lk.cape, rank: chest.rank, rarity: chest.rarity } : null;
  const weapons = CLASS_WEAPONS[C];
  const spec = {
    kind: 'hero', cls: C, base: lk.base, hair: helm || hood ? null : lk.hair, beard: lk.beard || null, hairColor: lk.hairColor,
    skinTint: SKIN[lk.skin], parts, dye, map, helm,
    cape, main: main ? { kind: main.weapon || weapons[0], rank: main.rank, rarity: main.rarity } : null,
    off: it.off ? { kind: it.off.weapon || weapons[1], rank: it.off.rank, rarity: it.off.rarity } : null,
    trinket: it.trinket && it.trinket.rank >= 2 ? RAR_GLOW[it.trinket.rarity] || RAR_GLOW.rare : null,
    topRank, scale: 1,
  };
  spec.sig = JSON.stringify([C, look | 0, parts, map, dye, helm, cape, spec.main, spec.off, spec.trinket]);
  if (legend.length) { spec.legend = legend; spec.sig = JSON.stringify([spec.sig, legend]); }   // only then: every other spec stays as it was
  if (a) {     // the kit's finish (custom_kit.js) tones the skin, so no tint; height is the body's scale
    Object.assign(spec, { skinTint: null, app: a, codeHair: spec.hair ? HAIRS[a.hair].code || null : null, scale: HEIGHTS[a.height] });
    spec.sig = JSON.stringify([spec.sig, a]);
  }
  return spec;
}

// ---------- townsfolk ----------
const NPC_LOOKS = {
  mael: { base: 'male', hair: 'Hair_Long', beard: 'Hair_Beard', hairColor: '#c8c8c8', out: 'Peasant', map: 'peasant2', dye: { hue: 0.08, sat: 0.4, val: 1.3 }, main: 'rod', cape: '#4a3a6a' },
  hob: { base: 'male', hair: 'Hair_SimpleParted', beard: 'Hair_Beard', hairColor: '#3a2416', out: 'Peasant', dye: { hue: 0.03, sat: 0.8, val: 0.8 } },
  holt: { base: 'male', hair: null, beard: 'Hair_Beard', hairColor: '#3a2a1a', out: 'Ranger', shoulders: true, helm: 'nasal', dye: { hue: 0.62, sat: 0.6, val: 0.7 }, main: 'sword', off: 'shield', cape: '#2c3f6a' },
  hazel: { base: 'female', hair: 'Hair_Buns', hairColor: '#6a4428', out: 'Peasant', map: 'peasant2', dye: { hue: 0.25, sat: 0.6, val: 1.1 }, main: 'rod' },
  iris: { base: 'female', hair: 'Hair_Long', hairColor: '#2a1a14', out: 'Peasant', dye: { hue: 0.78, sat: 0.8, val: 0.55 }, off: 'book' },
  tess: { base: 'female', hair: 'Hair_Long', hairColor: '#b07a3a', out: 'Ranger', dye: null, main: 'bow' },
  sloe: { base: 'female', hair: null, out: 'Ranger', hood: true, dye: { hue: 0.6, sat: 0.4, val: 0.4 }, main: 'dagger', off: 'dagger' },
  garrick: { base: 'male', hair: 'Hair_Buzzed', beard: 'Hair_Beard', hairColor: '#2a1a10', out: 'Peasant', dye: { hue: 0.0, sat: 0.3, val: 0.45 }, main: 'sword' },
  oren: { base: 'male', hair: 'Hair_SimpleParted', hairColor: '#a07040', out: 'Peasant', map: 'peasant2', dye: { hue: 0.0, sat: 0.2, val: 1.7 } },
  pell: { base: 'male', hair: 'Hair_SimpleParted', beard: 'Hair_Beard', hairColor: '#5a4030', out: 'Peasant', dye: { hue: 0.1, sat: 0.7, val: 0.9 } },
  edda: { base: 'female', hair: 'Hair_Buns', hairColor: '#d0d0d0', out: 'Peasant', map: 'peasant2', dye: { hue: 0.85, sat: 0.4, val: 0.9 } },
  lark: { base: 'female', hair: 'Hair_Buns', hairColor: '#c08040', out: 'Peasant', dye: { hue: 0.5, sat: 0.6, val: 1.0 }, scale: 0.66 },
  lark_escort: { base: 'female', hair: 'Hair_Buns', hairColor: '#c08040', out: 'Peasant', dye: { hue: 0.5, sat: 0.6, val: 1.0 }, scale: 0.66 },
  wick: { base: 'male', hair: 'Hair_SimpleParted', hairColor: '#e0c080', out: 'Peasant', dye: { hue: 0.3, sat: 0.6, val: 1.0 }, scale: 0.66 },
  wynn: { base: 'female', hair: 'Hair_Buns', hairColor: '#8a5a30', out: 'Ranger', dye: { hue: 0.08, sat: 0.5, val: 0.75 } },   // mounts: the Stable Master
  odo: { base: 'male', hair: 'Hair_Long', beard: 'Hair_Beard', hairColor: '#9a9a9a', out: 'Ranger', dye: { hue: 0.1, sat: 0.4, val: 0.7 }, main: 'rod', cape: '#4a4a3a' },
  // cap 35: Ferrick the miller (src/data/weir_works.js), a big bearded man in a flour-grey smock; wet through in the cave
  mr_ferrick: { base: 'male', hair: 'Hair_Buzzed', beard: 'Hair_Beard', hairColor: '#6a5a48', out: 'Peasant', map: 'peasant2', dye: { hue: 0.1, sat: 0.2, val: 1.2 }, scale: 1.08 },
  mr_ferrick_hurt: { base: 'male', hair: 'Hair_Buzzed', beard: 'Hair_Beard', hairColor: '#4a3e32', out: 'Peasant', map: 'peasant2', dye: { hue: 0.1, sat: 0.25, val: 0.95 }, scale: 1.08 },
};
export function npcSpec(template, sprite = '') {
  let lk = NPC_LOOKS[template];
  if (!lk) {
    // anyone else: a townsperson from a stable hash of the template id
    let h = 0;
    for (const c of String(template || sprite)) h = (h * 31 + c.charCodeAt(0)) >>> 0;
    const { r } = seeded(h + 1);
    const fem = /penny|nella|mira|tamsin|brindle|old_woman|child_b/.test(`${template} ${sprite}`) || r() < 0.4;
    const hairs = fem ? ['Hair_Long', 'Hair_Buns'] : ['Hair_SimpleParted', 'Hair_Buzzed'];
    lk = { base: fem ? 'female' : 'male', hair: hairs[Math.floor(r() * 2)], beard: !fem && r() < 0.5 ? 'Hair_Beard' : null,
      hairColor: ['#3a2416', '#6a4428', '#b07a3a', '#1a1410', '#8a8a8a'][Math.floor(r() * 5)], out: 'Peasant', map: r() < 0.5 ? 'peasant2' : null,
      dye: { hue: r(), sat: 0.4 + r() * 0.5, val: 0.7 + r() * 0.6 } };
  }
  const sx = lk.base === 'female' ? 'Female' : 'Male';
  const parts = { body: `${sx}_${lk.out}_Body`, arms: `${sx}_${lk.out}_Arms`, legs: `${sx}_${lk.out}_Legs`,
    feet: lk.out === 'Ranger' ? (sx === 'Male' ? 'Male_Ranger_Feet_Boots' : 'Female_Ranger_Feet') : `${sx}_Peasant_Feet`,
    head: lk.hood ? `${sx}_Ranger_Head_Hood` : null, shoulders: lk.shoulders ? (sx === 'Male' ? 'Male_Ranger_Acc_Pauldron' : 'Female_Ranger_Acc_Pauldrons') : null };
  const dye = {}, map = {};
  for (const s of Object.keys(parts)) if (parts[s]) { if (lk.dye) dye[s] = { ...lk.dye }; if (lk.map && /Peasant/.test(parts[s])) map[s] = ALT_MAP[lk.map]; }
  const spec = { kind: 'npc', cls: null, base: lk.base, hair: lk.hair, beard: lk.beard || null, hairColor: lk.hairColor, skinTint: SKIN[['light', 'medium', 'dark'][(String(template).length) % 3]],
    parts, dye, map, helm: lk.helm ? { style: lk.helm, rank: 0, rarity: 'common' } : null, cape: lk.cape ? { color: lk.cape, rank: 0 } : null,
    main: lk.main ? { kind: lk.main, rank: 0, rarity: 'common' } : null, off: lk.off ? { kind: lk.off, rank: 0, rarity: 'common' } : null,
    trinket: null, topRank: 0, scale: lk.scale || 1 };
  spec.sig = 'npc:' + template;
  return spec;
}

// ---------- materials ----------
const M = {
  steel: () => new THREE.MeshStandardMaterial({ color: '#b9c0c8', roughness: 0.3, metalness: 0.9 }),
  darkSteel: () => new THREE.MeshStandardMaterial({ color: '#4a4652', roughness: 0.32, metalness: 0.85 }),
  bronze: () => new THREE.MeshStandardMaterial({ color: '#a06b38', roughness: 0.4, metalness: 0.8 }),
  wood: (c) => new THREE.MeshStandardMaterial({ color: '#ffffff', map: woodTex(c), roughness: 0.8 }),
  leather: (c) => new THREE.MeshStandardMaterial({ color: '#ffffff', map: leatherTex(c), roughness: 0.85 }),
};
const castAll = (g) => { g.traverse((m) => { if (m.isMesh) m.castShadow = true; }); return g; };
/** Merge the rigid meshes of a code-built gear piece that look alike (same material kind, colour, map, side,
 *  emissive) into one mesh each: a quiver of arrows is 3 draw calls instead of 37. Sprites and Points stay. */
function compact(g) {
  g.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(g.matrixWorld).invert(), m4 = new THREE.Matrix4();
  const groups = new Map(), drop = [];
  g.traverse((m) => {
    if (!m.isMesh) return;
    const t = m.material;
    const k = [t.type, t.color && t.color.getHexString(), t.map ? t.map.uuid : '', t.side, t.emissive ? t.emissive.getHexString() : '', t.emissiveIntensity || 0, t.metalness, t.roughness].join('|');
    if (!groups.has(k)) groups.set(k, { mat: t, geos: [], cast: false });
    const e = groups.get(k);
    const geo = (m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone());
    for (const n of Object.keys(geo.attributes)) if (!['position', 'normal', 'uv'].includes(n)) geo.deleteAttribute(n);
    if (!geo.attributes.uv) geo.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geo.attributes.position.count * 2), 2));
    geo.applyMatrix4(m4.multiplyMatrices(inv, m.matrixWorld));
    e.geos.push(geo); e.cast = e.cast || m.castShadow; drop.push(m);
  });
  for (const m of drop) { m.parent.remove(m); m.geometry.dispose(); }
  for (const e of groups.values()) {
    const geo = mergeGeometries(e.geos, false);
    if (!geo) continue;
    const mesh = new THREE.Mesh(geo, e.mat); mesh.castShadow = e.cast; mesh.receiveShadow = true; g.add(mesh);
  }
  return g;
}

async function propMesh(L, name, { dye = null, scale = 1 } = {}) {
  const g = await L.gltf(`props/${name}.gltf`, { shareMaterials: false });
  const o = g.scene.clone(true);
  o.traverse((m) => { if (!m.isMesh) return; m.castShadow = true; m.receiveShadow = true; m.material = m.material.clone(); if (dye) dyeMaterial(m.material, dye); });
  o.scale.setScalar(scale);
  return o;
}

export function wield(ch, obj, hand = 'R', { pos = null, rot = null } = {}) {
  const p = pos || (hand === 'R' ? [0.03, 0.09, 0.03] : [-0.03, 0.09, 0.03]);
  const r = rot || [Math.PI / 2, 0, 0];
  const s = ch.socket(hand === 'R' ? 'hand_r' : 'hand_l', { pos: p, rot: r });
  s.add(obj);
  return s;
}

export function helm(style = 'nasal', { color = '#a9b1bb', trim = '#c9a24c', glow = null } = {}) {
  const g = new THREE.Group();
  const steel = new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.85 });
  const gold = new THREE.MeshStandardMaterial({ color: trim, roughness: 0.3, metalness: 0.9 });
  const pts = [];
  for (let i = 0; i <= 10; i++) { const a = i / 10 * Math.PI / 2; pts.push(new THREE.Vector2(Math.cos(a) * 0.128 + 0.001, Math.sin(a) * 0.15)); }
  const dome = new THREE.Mesh(new THREE.LatheGeometry(pts.reverse(), 18), steel); dome.scale.set(1, 1, 1.14); g.add(dome);
  const band = new THREE.Mesh(new THREE.CylinderGeometry(0.134, 0.134, 0.032, 18, 1, true), gold); band.scale.set(1, 1, 1.14); band.position.y = 0.012; g.add(band);
  const ridge = new THREE.Mesh(new THREE.TorusGeometry(0.131, 0.009, 6, 18, Math.PI), gold); ridge.rotation.y = Math.PI / 2; ridge.scale.set(1, 1.12, 1.14); g.add(ridge);
  if (style === 'nasal') {
    const nose = new THREE.Mesh(new THREE.BoxGeometry(0.024, 0.11, 0.014), steel); nose.position.set(0, -0.045, 0.152); nose.rotation.x = -0.12; g.add(nose);
    for (const sx of [-1, 1]) {
      const cheek = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.12, 0.11, 10, 1, true, sx > 0 ? 1.15 : Math.PI * 2 - 2.05, 0.9), steel);
      cheek.scale.set(1, 1, 1.14); cheek.position.y = -0.06; g.add(cheek);
    }
  } else {
    const face = new THREE.Mesh(new THREE.CylinderGeometry(0.134, 0.122, 0.19, 18, 1, true, -Math.PI * 0.64, Math.PI * 1.28), steel);
    face.scale.set(1, 1, 1.14); face.position.y = -0.094; g.add(face);
    const slitMat = new THREE.MeshBasicMaterial({ color: glow || '#ffb347' });
    const slit = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.016, 0.03), slitMat); slit.position.set(0, -0.035, 0.146); g.add(slit);
    const vslit = new THREE.Mesh(new THREE.BoxGeometry(0.014, 0.07, 0.03), slitMat); vslit.position.set(0, -0.075, 0.146); g.add(vslit);
    for (const sx of [-1, 1]) {
      const curve = new THREE.CatmullRomCurve3([new THREE.Vector3(sx * 0.12, 0.06, 0), new THREE.Vector3(sx * 0.18, 0.08, -0.02), new THREE.Vector3(sx * 0.21, 0.14, -0.06), new THREE.Vector3(sx * 0.2, 0.2, -0.11)]);
      const geo = new THREE.TubeGeometry(curve, 12, 0.024, 7);
      const p = geo.attributes.position;
      for (let i = 0; i < p.count; i++) { const t = Math.floor(i / 8) / 12; const c = curve.getPointAt(Math.min(1, t)); const k = 1 - t * 0.85; p.setXYZ(i, c.x + (p.getX(i) - c.x) * k, c.y + (p.getY(i) - c.y) * k, c.z + (p.getZ(i) - c.z) * k); }
      geo.computeVertexNormals();
      g.add(new THREE.Mesh(geo, gold));
    }
  }
  return compact(castAll(g));
}
export function dagger({ len = 0.46, glow = null, steel = '#c2c8cf' } = {}) {
  const g = new THREE.Group(); const bl = len * 0.62;
  const shape = new THREE.Shape();
  shape.moveTo(0, 0); shape.lineTo(0.022, 0.01); shape.quadraticCurveTo(0.026, bl * 0.55, 0.0, bl); shape.quadraticCurveTo(-0.018, bl * 0.6, -0.02, 0.01); shape.lineTo(0, 0);
  const blade = new THREE.Mesh(new THREE.ExtrudeGeometry(shape, { depth: 0.004, bevelEnabled: true, bevelThickness: 0.003, bevelSize: 0.004, bevelSegments: 1 }),
    new THREE.MeshStandardMaterial({ color: steel, roughness: 0.22, metalness: 0.95, emissive: glow || '#000', emissiveIntensity: glow ? 1.4 : 0 }));
  blade.position.set(0, 0.012, -0.002); g.add(blade);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.012, 0.018), M.darkSteel()); g.add(guard);
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.013, len * 0.3, 8), M.leather('#2a1e18')); grip.position.y = -len * 0.15; g.add(grip);
  const pom = new THREE.Mesh(new THREE.SphereGeometry(0.017, 8, 6), M.darkSteel()); pom.position.y = -len * 0.31; g.add(pom);
  g.userData.blade = blade;
  return castAll(g);
}
export function bow({ h = 1.32, wood = '#6b4527', glow = null } = {}) {
  const g = new THREE.Group(); const half = h / 2; const pts = [];
  for (let i = 0; i <= 16; i++) { const t = i / 16 * 2 - 1; const y = t * half; const a = Math.abs(t); pts.push(new THREE.Vector3(0, y, 0.16 * (1 - a * a) - (a > 0.82 ? (a - 0.82) * 0.5 : 0))); }
  const curve = new THREE.CatmullRomCurve3(pts);
  const limbMat = M.wood(wood);
  if (glow) { limbMat.emissive = new THREE.Color(glow); limbMat.emissiveIntensity = 0.6; }
  g.add(new THREE.Mesh(new THREE.TubeGeometry(curve, 32, 0.016, 6), limbMat));
  const grip = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.16, 8), M.leather('#2b1d14')); grip.position.z = 0.16; g.add(grip);
  const top = curve.getPointAt(1), bot = curve.getPointAt(0);
  const d = bot.clone().sub(top);
  const str = new THREE.Mesh(new THREE.CylinderGeometry(0.0025, 0.0025, d.length(), 4), new THREE.MeshBasicMaterial({ color: glow || '#d9d2c0' }));
  str.position.copy(top).addScaledVector(d, 0.5); g.add(str);
  return compact(castAll(g));
}
export function arrowMesh({ len = 0.7, glow = null } = {}) {
  const g = new THREE.Group();
  const shaft = new THREE.Mesh(new THREE.CylinderGeometry(0.006, 0.006, len, 5), M.wood('#9a7a52')); shaft.position.y = len / 2; g.add(shaft);
  const head = new THREE.Mesh(new THREE.ConeGeometry(0.016, 0.06, 4), glow ? new THREE.MeshBasicMaterial({ color: glow }) : M.steel()); head.position.y = len + 0.02; g.add(head);
  const fl = new THREE.MeshStandardMaterial({ color: '#d8d2c4', side: THREE.DoubleSide, roughness: 0.9 });
  for (let i = 0; i < 3; i++) { const f = new THREE.Mesh(new THREE.PlaneGeometry(0.03, 0.1), fl); f.position.y = 0.07; f.rotation.y = i * Math.PI * 2 / 3; f.translateX(0.015); g.add(f); }
  return g;
}
export function quiver({ n = 7 } = {}) {
  const { R } = seeded(4242);
  const g = new THREE.Group();
  const mat = M.leather('#4b3122'); mat.side = THREE.DoubleSide;
  const body = new THREE.Mesh(new THREE.CylinderGeometry(0.065, 0.05, 0.52, 10, 1, true), mat); body.position.y = 0.26; g.add(body);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.065, 0.008, 6, 12), M.bronze()); rim.rotation.x = Math.PI / 2; rim.position.y = 0.52; g.add(rim);
  for (let i = 0; i < n; i++) { const a = arrowMesh({ len: 0.7 }); a.position.set(R(-0.035, 0.035), 0.0, R(-0.035, 0.035)); a.rotation.set(R(-0.08, 0.08), R(0, 6), R(-0.08, 0.08)); g.add(a); }
  return compact(castAll(g));
}
const iron = () => new THREE.MeshStandardMaterial({ color: '#2a2522', roughness: 0.5, metalness: 0.7 });
export function lanternStaff({ h = 1.75, light = '#ffc46b', glass = '#ffe2a8', k = 2.6 } = {}) {
  const g = new THREE.Group();
  const staff = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.024, h, 8), M.wood('#5a3d24')); staff.position.y = h / 2 - 1.0; g.add(staff);
  const hook = new THREE.Mesh(new THREE.TorusGeometry(0.09, 0.012, 6, 12, Math.PI * 1.3), iron()); hook.position.set(0.07, h - 0.97, 0); hook.rotation.z = -0.3; g.add(hook);
  const lan = new THREE.Group(); lan.position.set(0.16, h - 1.17, 0); g.add(lan);
  const gm = new THREE.MeshStandardMaterial({ color: glass, emissive: light, emissiveIntensity: k, roughness: 0.25 });
  lan.add(new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.15, 8), gm));
  for (let i = 0; i < 4; i++) { const b = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.18, 0.012), iron()); const a = i / 4 * Math.PI * 2 + 0.4; b.position.set(Math.cos(a) * 0.064, 0, Math.sin(a) * 0.064); lan.add(b); }
  const cap = new THREE.Mesh(new THREE.ConeGeometry(0.085, 0.09, 8), iron()); cap.position.y = 0.12; lan.add(cap);
  const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,236,190,0.95)', 'rgba(255,180,80,0.35)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  halo.scale.setScalar(0.9); lan.add(halo);
  g.userData.lantern = lan; g.userData.halo = halo;
  g.traverse((m) => { if (m.isMesh) m.castShadow = m.material !== gm; });
  return g;
}
function handBell({ glow = null } = {}) {
  const g = new THREE.Group();
  const pts = []; for (let i = 0; i <= 8; i++) { const t = i / 8; pts.push(new THREE.Vector2(0.02 + 0.055 * t * t, 0.12 * (1 - t))); }
  const mat = new THREE.MeshStandardMaterial({ color: '#d4a64a', roughness: 0.3, metalness: 0.9, emissive: glow || '#000', emissiveIntensity: glow ? 0.8 : 0 });
  const bell = new THREE.Mesh(new THREE.LatheGeometry(pts, 12), mat); bell.rotation.x = Math.PI; bell.position.y = 0.02; g.add(bell);
  const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.12, 6), M.wood('#5a3d24')); handle.position.y = -0.04; g.add(handle);
  return castAll(g);
}
function quillPen({ glow = '#8fdcff' } = {}) {
  const g = new THREE.Group();
  const vane = new THREE.Shape(); vane.moveTo(0, 0); vane.quadraticCurveTo(0.06, 0.22, 0.012, 0.46); vane.quadraticCurveTo(-0.03, 0.25, 0, 0);
  const m = new THREE.MeshStandardMaterial({ color: '#f2ede0', roughness: 0.8, side: THREE.DoubleSide, emissive: glow, emissiveIntensity: 0.15 });
  const f = new THREE.Mesh(new THREE.ShapeGeometry(vane, 8), m); f.position.y = 0.04; g.add(f);
  const nib = new THREE.Mesh(new THREE.ConeGeometry(0.008, 0.07, 5), new THREE.MeshStandardMaterial({ color: '#1a1240', metalness: 0.6, roughness: 0.3 })); nib.rotation.x = Math.PI; nib.position.y = 0.0; g.add(nib);
  return castAll(g);
}
const glyphTexes = new Map();
function glyphTex(col, v) {
  const k = col + v;
  if (!glyphTexes.has(k)) {
    const c = document.createElement('canvas'); c.width = c.height = 64;
    const gg = c.getContext('2d'); gg.strokeStyle = col; gg.lineWidth = 4; gg.lineCap = 'round'; gg.shadowColor = col; gg.shadowBlur = 7;
    gg.beginPath();
    if (v) { gg.moveTo(20, 15); gg.lineTo(32, 49); gg.lineTo(44, 15); gg.moveTo(23, 32); gg.lineTo(41, 32); } else { gg.arc(32, 32, 15, 0.4, 5.2); gg.moveTo(32, 17); gg.lineTo(32, 47); }
    gg.stroke();
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; glyphTexes.set(k, t);
  }
  return glyphTexes.get(k);
}
export function glyphRing({ r = 0.32, n = 6, col = '#8fdcff', size = 0.13 } = {}) {
  const g = new THREE.Group();
  for (let i = 0; i < n; i++) {
    const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: glyphTex(col, i % 2), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, color: col }));
    const a = i / n * Math.PI * 2; s.position.set(Math.cos(a) * r, Math.sin(a * 2) * 0.04, Math.sin(a) * r); s.scale.setScalar(size); g.add(s);
  }
  const core = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(200,240,255,1)', 'rgba(60,120,255,0.4)'), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  core.scale.setScalar(0.28); g.add(core);
  return g;
}

/** Particles streaming off a moving point (embers off a blade, motes off a lantern). World space, in `layer`. */
export function emberTrail(anchor, layer, { n = 60, color = '#ffb060', inner = 'rgba(255,240,200,1)', mid = 'rgba(255,140,40,0.8)', size = 0.06, rise = 0.6, spread = 0.18, life = 1.0, span = [0.25, 1.0] } = {}) {
  const { R } = seeded(777);
  const geo = new THREE.BufferGeometry();
  const P0 = new Float32Array(n * 3), age = new Float32Array(n), vel = new Float32Array(n * 3);
  geo.setAttribute('position', new THREE.BufferAttribute(P0, 3));
  const pts = new THREE.Points(geo, new THREE.PointsMaterial({ size, map: radial(inner, mid), color, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
  pts.frustumCulled = false; layer.add(pts);
  const tmp = new THREE.Vector3();
  const respawn = (i) => { tmp.set(R(-0.02, 0.02), R(span[0], span[1]), R(-0.02, 0.02)); anchor.localToWorld(tmp); P0[i * 3] = tmp.x; P0[i * 3 + 1] = tmp.y; P0[i * 3 + 2] = tmp.z; age[i] = 0; vel[i * 3] = R(-spread, spread); vel[i * 3 + 1] = R(0.3, 1) * rise; vel[i * 3 + 2] = R(-spread, spread); };
  let warm = false;
  const step = (dt) => {
    if (!warm) { warm = true; for (let i = 0; i < n; i++) { respawn(i); age[i] = R(0, life); } }
    for (let i = 0; i < n; i++) { age[i] += dt; for (let k = 0; k < 3; k++) P0[i * 3 + k] += vel[i * 3 + k] * dt; if (age[i] > life) respawn(i); }
    geo.attributes.position.needsUpdate = true;
  };
  return { pts, step };
}

/** Keep a held item upright in the world (a staff stays vertical whatever the hand does). */
export function upright(ch, sock, tilt = 0) {
  const pq = new THREE.Quaternion(), yaw = new THREE.Quaternion(), tq = new THREE.Quaternion().setFromEuler(new THREE.Euler(tilt, 0, 0));
  ch.post.push(() => {
    sock.parent.getWorldQuaternion(pq); ch.o.getWorldQuaternion(yaw);
    sock.quaternion.copy(pq.invert().multiply(yaw.multiply(tq)));
  });
}

/** Weapons, helm, cape and rare effects onto an assembled body. Returns the light requests and the swing blade.
 *  opts.low (Low quality): a worn skill legendary is a flat orange tint, its idle tell still (legend_kit.js). */
export async function dress(L, ch, spec, layer, { low = false } = {}) {
  const out = { lights: [], blade: null, gearMats: [], legendTells: {} };
  const glowOf = (w) => (w && w.rank >= 2 ? RAR_GLOW[w.rarity] || RAR_GLOW.rare : null);
  const mn = spec.main, off = spec.off;
  const legendHand = (spec.legend || []).some((id) => LEGEND_ITEMS[id].slot === 'main' || LEGEND_ITEMS[id].slot === 'two');
  if (spec.legend) {
    const lg = dressLegend(ch, spec, layer, { low, wield, upright });
    out.lights.push(...lg.lights); out.gearMats = lg.gearMats; out.legendTells = lg.tells;
    if ((spec.legend || []).includes('far_tether_bow')) { const qv = quiver(); const qs = ch.socket('spine_03', { pos: [0.1, 0.05, -0.18], rot: [0.25, 0, -0.35] }); qs.add(qv); }
    if ((spec.legend || []).includes('errata_quill')) {
      const ring = glyphRing({ col: RAR_GLOW.legendary }); const rs = ch.socket('hand_l', { pos: [0, 0.14, 0.05] }); rs.add(ring);
      ch.fx.push((dt, c, t) => { ring.rotation.y = t * 0.9; });
      out.glyphs = ring;
    }
  }
  if (mn && !legendHand) {
    const gc = glowOf(mn);
    if (mn.kind === 'sword') {
      const sw = await propMesh(L, 'Sword_Bronze', mn.rank === 0 ? {} : mn.rank === 1 ? { dye: { hue: 0.55, sat: 0.1, val: 1.3 } } : { dye: { hue: 0.6, sat: 0.3, val: 0.55, metalGlow: [gc, 3.2] } });
      if (mn.rank >= 2) sw.scale.setScalar(1.15);
      wield(ch, sw, 'R'); out.blade = sw;
      if (gc) { const t = emberTrail(sw, layer, { n: 70, span: [0.15, 1.0], color: gc }); ch.fx.push(t.step); out.lights.push({ obj: sw, color: gc, k: 3, y: 0.7 }); }
    } else if (mn.kind === 'dagger') {
      const d = dagger({ glow: gc }); wield(ch, d, 'R'); out.blade = d;
      if (gc) { const t = emberTrail(d, layer, { n: 40, span: [0.05, 0.3], color: gc, size: 0.05 }); ch.fx.push(t.step); out.lights.push({ obj: d, color: gc, k: 2 }); }
    } else if (mn.kind === 'rod') {
      const st = lanternStaff({ light: gc || '#ffc46b', k: gc ? 4 : 2.6 }); const ss = wield(ch, st, 'L'); upright(ch, ss, 0.12);
      out.lights.push({ obj: st.userData.lantern, color: gc || '#ffc46b', k: gc ? 4 : 2.5, lantern: true });
      const t = emberTrail(st.userData.lantern, layer, { n: 24, color: '#ffe0a0', size: 0.045, rise: 0.25, spread: 0.12, life: 1.6, span: [-0.05, 0.05] }); ch.fx.push(t.step);
    } else if (mn.kind === 'quill') {
      const q = quillPen({ glow: gc || '#8fdcff' }); wield(ch, q, 'L', { pos: [-0.02, 0.08, 0.02], rot: [Math.PI / 2, 0, 0] });
      const ring = glyphRing({ col: gc || '#8fdcff' }); const rs = ch.socket('hand_l', { pos: [0, 0.14, 0.05] }); rs.add(ring);
      ch.fx.push((dt, c, t) => { ring.rotation.y = t * 0.9; });
      out.glyphs = ring;
    } else if (mn.kind === 'bow') {
      const b = bow({ glow: gc }); wield(ch, b, 'L', { pos: [0.0, 0.08, 0.03], rot: [0, 0, 0] });
      const qv = quiver(); const qs = ch.socket('spine_03', { pos: [0.1, 0.05, -0.18], rot: [0.25, 0, -0.35] }); qs.add(qv);
      if (gc) out.lights.push({ obj: b, color: gc, k: 1.5 });
    }
  }
  if (off) {
    const gc = glowOf(off);
    if (off.kind === 'shield') {
      const sh = await propMesh(L, 'Shield_Wooden', off.rank === 0 ? {} : off.rank === 1 ? { dye: { hue: 0.03, sat: 0.45, val: 0.7 } } : { dye: { hue: 0.0, sat: 1.1, val: 0.45, metalGlow: [gc, 0.5] } });
      sh.scale.setScalar(off.rank === 0 ? 1.0 : 1.18);
      const s = ch.socket('lowerarm_l', { pos: [0.0, 0.16, 0.0] }); s.add(sh);
    } else if (off.kind === 'dagger') {
      wield(ch, dagger({ glow: gc }), 'L');
    } else if (off.kind === 'book') {
      const bk = await propMesh(L, 'Book_7', { dye: { hue: 0.0, sat: 0.6, val: 0.7, ...(gc ? { metalGlow: [gc, 1.5] } : {}) } }); bk.scale.setScalar(1.25);
      wield(ch, bk, 'R', { pos: [0.02, 0.1, -0.06], rot: [0, 0, Math.PI / 2] });
    } else if (off.kind === 'bell') {
      wield(ch, handBell({ glow: gc }), 'R', { pos: [0.03, 0.08, 0.03], rot: [0, 0, 0] });
    }
  }
  if (spec.helm) {
    const h = spec.helm;
    const gc = h.rank >= 2 ? RAR_GLOW[h.rarity] || RAR_GLOW.rare : null;
    const hm = helm(h.style, h.style === 'great' ? { color: '#3d3846', trim: '#c08a3a', glow: gc || '#ffb347' } : h.rank === 1 ? { color: '#c0c6ce' } : {});
    const hs = ch.socket('Head', { pos: [0, 0.165, 0.01], scale: 0.9 }); hs.add(hm);
  }
  if (spec.cape) {
    const c = spec.cape;
    const gc = c.rank >= 2 ? RAR_GLOW[c.rarity] || RAR_GLOW.rare : null;
    addCape(ch, layer, { map: woolTex(c.color, gc || '#c9a24c', c.rank >= 1 ? gc || '#c9a24c' : null), len: c.rank >= 2 ? 1.15 : 1.08, bottom: c.rank >= 2 ? 0.7 : 0.62, emissive: gc });
  }
  if (spec.trinket) {
    const mote = new THREE.Sprite(new THREE.SpriteMaterial({ map: radial('rgba(255,255,255,1)', 'rgba(255,255,255,0.3)'), color: spec.trinket, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true }));
    mote.scale.setScalar(0.18);
    const piv = ch.socket('spine_03', {}); piv.add(mote);
    ch.fx.push((dt, c, t) => { mote.position.set(Math.cos(t * 2.1) * 0.45, 0.1 + Math.sin(t * 3.3) * 0.08, Math.sin(t * 2.1) * 0.45); });
  }
  return out;
}
