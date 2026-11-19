// Player character art for the UI: the art agent's class atlases (assets/sprites/chars/<class>.json, 32x40 cells,
// feet origin [16, 39], frames look{n}_{anim}_{dir}_{i}, anims idle 2 / walk 4 / attack 3 / cast 2 / hurt 1 / dead).
// Falls back to Lexicon Quest's hero field sprite when an atlas is missing. There are no creation portraits yet, so
// portraits are a crop of the sprite's head and shoulders at 1x (no scaling: one pixel density).

const ANIM_FPS = { idle: 2, walk: 8, attack: 12, cast: 6, hurt: 8 };

export function createCharArt(art) {
  const tops = new Map();
  /** First opaque row of a frame (where the head starts), measured once from the pixels. */
  function inkTop(f) {
    const key = `${f.sx},${f.sy}`;
    if (tops.has(key)) return tops.get(key);
    let top = 0;
    try {
      const c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
      const g = c.getContext('2d'); g.drawImage(f.img, f.sx, f.sy, f.w, f.h, 0, 0, f.w, f.h);
      const d = g.getImageData(0, 0, f.w, f.h).data;
      outer: for (let y = 0; y < f.h; y++) for (let x = 0; x < f.w; x++) if (d[(y * f.w + x) * 4 + 3] > 0) { top = y; break outer; }
    } catch { top = 0; }
    tops.set(key, top);
    return top;
  }
  function frame(cls, look, anim, dir, t) {
    const a = art.chars[cls];
    if (a) {
      const name = `look${look + 1}_${anim}_${dir}`;
      const an = a.json.anims && a.json.anims[name];
      const frames = an ? an.frames : [`${name}_0`];
      const fps = an ? an.fps : ANIM_FPS[anim] || 4;
      const f = a.json.frames[frames[Math.floor(t * fps) % frames.length]] || a.json.frames[`look${look + 1}_idle_down_0`];
      if (f) return { img: a.img, sx: f[0], sy: f[1], w: f[2], h: f[3], ox: a.json.origin[0], oy: a.json.origin[1] };
    }
    // fallback: LQ hero (party_field), walk 1,0,2,0
    const n = anim === 'walk' ? [1, 0, 2, 0][Math.floor(t * 8) % 4] : 0;
    const f = art.party.frames[`hero_${dir}_${n}`] || art.party.frames.hero_down_0;
    const o = art.party.origin || [12, 31];
    return { img: art.partyImg, sx: f[0], sy: f[1], w: f[2], h: f[3], ox: o[0], oy: o[1] };
  }
  return {
    has: (cls) => !!art.chars[cls],
    looks(cls) { const a = art.chars[cls]; return a && a.json.looks ? Object.values(a.json.looks) : []; },
    /** Draw with the feet at (fx, fy). */
    draw(ctx, cls, look, anim, dir, t, fx, fy) {
      const f = frame(cls, look, anim, dir, t);
      ctx.drawImage(f.img, f.sx, f.sy, f.w, f.h, Math.round(fx - f.ox), Math.round(fy - f.oy), f.w, f.h);
      return f;
    },
    /** Head-and-shoulders crop into a w x h box (dark backdrop + 1 px bevel like LQ's 32 px portraits). */
    portrait(ctx, cls, look, x, y, w = 32, h = 32) {
      ctx.fillStyle = '#14101e'; ctx.fillRect(x, y, w, h);
      ctx.fillStyle = '#251d34'; ctx.fillRect(x + 1, y + 1, w - 2, h - 2);
      ctx.fillStyle = '#3b3354'; ctx.fillRect(x + 1, y + 1, w - 2, 1);
      const f = frame(cls, look, 'idle', 'down', 0);
      const iw = w - 2, ih = h - 2;
      // the head sits near the top of the cell: take the top `ih` rows from 2 px above the first opaque row
      const top = Math.max(0, inkTop(f) - (w >= 24 ? 2 : 0));
      const sw = Math.min(iw, f.w), sx = f.sx + Math.floor((f.w - sw) / 2);
      ctx.drawImage(f.img, sx, f.sy + top, sw, Math.min(ih, f.h - top), x + 1 + Math.floor((iw - sw) / 2), y + 1, sw, Math.min(ih, f.h - top));
    },
    /** 10x10 head for small frames. */
    head(ctx, cls, look, x, y) { this.portrait(ctx, cls, look, x, y, 12, 12); },
  };
}
