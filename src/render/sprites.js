// Entity sprites. Resolves an entity to a frame:
//   player characters   assets/sprites/chars/<cls>.json (art wave): 32x40 cells, origin 16,39, frames
//                       look{n}_{idle|walk|attack|cast|hurt|dead}_{dir}_{i}, plus <cls>_emissive.png (glow pixels) and
//                       points[frame].hand (where projectiles start). Used for kind 'player' (sprite 'hero') with `cls`,
//                       and for any sprite key '<cls>' or '<cls>_a|b|c' (looks 1..3).
//   'hero'              fallback while a class atlas is not loaded: LQ party_field.json hero_<dir>_<0|1|2>, 24x32
//   'npc_*'             npcs.json <id>_<dir>_<n>, 24x32
//   anything else       enemies_field.json <id>_<0|1>, frames face LEFT (flipped when facing right), 2-frame idle
//
// frameFor(e, t, st) -> { img, sx, sy, w, h, ox, oy, flip, emissive?, emSx?, hand?: [x, y] } or null
//   st (optional, from the fx runtime): { attackT0, hurtT0, now } so a character plays attack / hurt frames.
// `extra` is the renderer's lazy loader ({ img(name) | null, json(name) | null }) for sheets not in the asset manifest.

export const CLASS_IDS = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
const LOOK_LETTER = { a: 1, b: 2, c: 3 };

/** Which class atlas and look an entity uses, or null (pure, tested). */
export function charKey(e) {
  if (!e) return null;
  const m = /^(warden|mender|scribe|wayfinder|inkblade)(?:_([abc]))?$/.exec(e.sprite || '');
  if (m) return { cls: m[1], look: m[2] ? LOOK_LETTER[m[2]] : Math.max(1, Math.min(3, (e.look | 0) + 1)) };
  if (e.kind === 'player' && CLASS_IDS.includes(e.cls)) return { cls: e.cls, look: Math.max(1, Math.min(3, (e.look | 0) + 1)) };
  return null;
}

/** Character animation name and frame index at time t (pure, tested). */
export function charAnim(e, t, st = null) {
  if (e.dead) return { anim: 'dead', dir: 'down', i: 0 };
  const dir = e.dir || 'down';
  const now = st && st.now != null ? st.now : t;
  if (st && st.attackT0 != null && now - st.attackT0 < 0.25) return { anim: 'attack', dir, i: Math.min(2, Math.floor((now - st.attackT0) * 12)) };
  if (st && st.hurtT0 != null && now - st.hurtT0 < 0.14) return { anim: 'hurt', dir, i: 0 };
  if (e.cast) return { anim: 'cast', dir, i: Math.floor(t * 6) % 2 };
  if (e.moving) return { anim: 'walk', dir, i: Math.floor(t * 8) % 4 };
  return { anim: 'idle', dir, i: Math.floor(t * 2) % 2 };
}

export function createSpriteBook(assets, extra = null) {
  const party = assets.json('party_field'), npcs = assets.json('npcs'), foes = assets.json('enemies_field');
  const partyImg = assets.img('party_field'), npcImg = assets.img('npcs'), foeImg = assets.img('enemies_field');
  const charSheet = (cls) => {
    if (assets.has(`char_${cls}`)) return { j: assets.json(`char_${cls}`), img: assets.img(`char_${cls}`), em: assets.has(`char_${cls}_em`) ? assets.img(`char_${cls}_em`) : null };
    if (!extra) return null;
    const j = extra.json(`sprites/chars/${cls}.json`), img = extra.img(`sprites/chars/${cls}.png`);
    if (!j || !img) return null;
    return { j, img, em: extra.img(`sprites/chars/${cls}_emissive.png`) };
  };

  /** { img, sx, sy, w, h, ox, oy, flip } for an entity at time t (s). */
  function frameFor(e, t, st = null) {
    const dir = e.dir || 'down';
    const ck = charKey(e);
    if (ck) {
      const s = charSheet(ck.cls);
      if (s) {
        const a = charAnim(e, t, st);
        const name = `look${ck.look}_${a.anim}_${a.dir}_${a.i}`;
        const f = s.j.frames[name] || s.j.frames[`look${ck.look}_idle_${dir}_0`] || s.j.frames.look1_idle_down_0;
        const o = s.j.origin || [16, 39];
        const pt = s.j.points && s.j.points[name];
        return { img: s.img, sx: f[0], sy: f[1], w: f[2], h: f[3], ox: o[0], oy: o[1], flip: false, emissive: s.em,
          hand: pt && pt.hand ? pt.hand : [dir === 'left' ? 9 : dir === 'right' ? 23 : 16, 23] };
      }
    }
    if (e.sprite === 'hero' || (party.frames[`${e.sprite}_down_0`])) {
      const base = e.sprite === 'hero' ? 'hero' : e.sprite;
      const n = e.moving ? [1, 0, 2, 0][Math.floor(t * 8) % 4] : 0;
      const f = party.frames[`${base}_${dir}_${n}`] || party.frames[`${base}_down_0`];
      return { img: partyImg, sx: f[0], sy: f[1], w: f[2], h: f[3], ox: party.origin[0], oy: party.origin[1], flip: false };
    }
    if (npcs.sprites[e.sprite]) {
      const s = npcs.sprites[e.sprite];
      const n = e.moving ? [1, 0, 2, 0][Math.floor(t * 6) % 4] : 0;
      const f = npcs.frames[`${e.sprite}_${dir}_${n}`] || npcs.frames[`${e.sprite}_down_0`];
      const o = s.origin || npcs.origin;
      return { img: npcImg, sx: f[0], sy: f[1], w: f[2], h: f[3], ox: o[0], oy: o[1], flip: false };
    }
    const s = foes.sprites[e.sprite];
    if (s) {
      const fps = e.moving ? 8 : 3;
      const n = Math.floor(t * fps + (e.id % 7) * 0.37) % 2;
      const f = foes.frames[`${e.sprite}_${n}`] || foes.frames[`${e.sprite}_0`];
      return { img: foeImg, sx: f[0], sy: f[1], w: f[2], h: f[3], ox: s.origin[0], oy: s.origin[1], flip: e.dir === 'right' };
    }
    return null;
  }
  return { frameFor };
}

/** A pixel-hard ellipse (filled, no anti-aliasing) on its own small canvas: shadows and target rings. */
export function pixelEllipse(w, h, color, ring = false) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  g.fillStyle = color;
  const rx = w / 2, ry = h / 2;
  const inside = (x, y, sx, sy) => ((x + 0.5 - rx) / sx) ** 2 + ((y + 0.5 - ry) / sy) ** 2 <= 1;
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const a = inside(x, y, rx, ry);
    if (!a) continue;
    if (ring && inside(x, y, rx - 1.2, ry - 1.2)) continue;
    g.fillRect(x, y, 1, 1);
  }
  return c;
}
