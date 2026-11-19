// Entity sprites (placeholder art = Lexicon Quest field sprites). Resolves an entity's `sprite` id to a frame:
//   'hero'          party_field.json  hero_<dir>_<0|1|2>, 24x32, origin 12,31; walk cycle 1,0,2,0 at 8 fps
//   'npc_*'         npcs.json         <id>_<dir>_<n>, 24x32, origin 12,31
//   anything else   enemies_field.json <id>_<0|1>, frames face LEFT (flipped when facing right), 2-frame idle
// When assets/sprites/chars/ lands (art agent), add its atlas here; entities keep the same `sprite` field.

export function createSpriteBook(assets) {
  const party = assets.json('party_field'), npcs = assets.json('npcs'), foes = assets.json('enemies_field');
  const partyImg = assets.img('party_field'), npcImg = assets.img('npcs'), foeImg = assets.img('enemies_field');

  /** { img, sx, sy, w, h, ox, oy, flip } for an entity at time t (s). */
  function frameFor(e, t) {
    const dir = e.dir || 'down';
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
