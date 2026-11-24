// Boss intro card (wave 6 BUILD, bosscard lane; brief D:\LQOnline\wave6\questpres\BRIEF.md still 3b, approved by Scott
// 2026-11-24: "first pull per run, 2.5 s, play never pauses"). Render and UI only: it reads sim events and the snapshot,
// never writes the sim, takes no input and never pauses.
//
//   const bc = createBossCard({ content, zoneNames })
//   bc.onEvent(ev, { snap, playerId, enabled })   a boss { kind: 'pull' } event (src/sim/dungeons.js), or a threat event
//                                                 on a foe whose template has a `card` line (named foes with no boss
//                                                 script). enabled: Settings "Quest scenes" (options.questScenes !== false)
//   bc.frame(tSec, snap, playerId) -> view.bossCam or null   once a frame before the 3D draw (src/render3d/boss_cam.js)
//   bc.draw(ctx, g, L, tSec) -> drawn?            the card on the HUD layer (ui.js, after the HUD, under the menus;
//                                                 ui.js holds its toasts, the area names among them, while it is up)
//   bc.active / bc.debug()                        drivers and tests
//
// Which pulls: the FIRST pull of each boss per run. A dungeon or cave copy that resets spawns its foes again with new
// entity ids, so the key (zone + entity id) is new each run; a wipe and a retry on the same boss is not a new run.
// Only foes with a `card` line in src/data/mobs.js, only in the hero's zone and within 40 m of the hero.
// Every word on the card is Scott's: the `card` line as written (split at its first ". " into the name and the line,
// never shortened: long lines wrap), the level, the rank word the target frame already uses, and the place's name.

export const CARD_SEC = 2.5;      // on screen, fade in and out included
export const FADE_IN = 0.35;
export const FADE_OUT = 0.45;
export const CAM_IN = 0.55;       // the push-in eases in over this, and back out over CAM_OUT at the end
export const CAM_OUT = 0.6;
const NEAR_PX = 40 * 16;
const PX = 16;

/** Line heights in ONE place (the uiskin lane's g.textScope / g.lh replace these at merge for Large text). */
export function lineH(g) {
  return { title: (g && g.lhLarge) || 16, body: (g && g.lh) || 10 };
}

/** The card's name and line from a `card` string: split at the first ". ", both kept word for word. */
export function splitCard(card) {
  const s = String(card || '');
  const cut = s.indexOf('. ');
  return cut > 0 ? { title: s.slice(0, cut), line: s.slice(cut + 2) } : { title: s, line: '' };
}

/** The rank word: the words the target frame already shows (hud.js: Boss, Elite, Rare). */
export function rankWord(tpl) {
  if (!tpl) return '';
  if (tpl.boss) return tpl.elite ? 'Elite boss' : 'Boss';
  if (tpl.rare) return tpl.elite ? 'Rare elite' : 'Rare';
  return tpl.elite ? 'Elite' : '';
}

const smooth = (k) => { const t = Math.max(0, Math.min(1, k)); return t * t * (3 - 2 * t); };

/** 0..1 how far the card is shown at `age` s (fade in, hold, fade out at `len`). */
export function cardAlpha(age, len = CARD_SEC) {
  if (age < 0 || age >= len) return 0;
  return Math.min(smooth(age / FADE_IN), smooth((len - age) / FADE_OUT));
}
/** 0..1 how far the camera is pushed in at `age` s. */
export function camWeight(age, len = CARD_SEC) {
  if (age < 0 || age >= len) return 0;
  return Math.min(smooth(age / CAM_IN), smooth((len - age) / CAM_OUT));
}

/** Where the card sits on the HUD layer L (ui.js layout): desktop above the cast bar; phones low on the left, over the
 *  passive chat lines and clear of the ability cluster (the middle of a phone screen is where the two stand). */
export function cardRect(L, h) {
  if (L.touch) {
    const left = L.cluster && L.cluster.length ? Math.min(...L.cluster.map((b) => b.x)) : L.W - 150;
    const w = Math.max(160, Math.min(320, left - 12));
    const bottom = L.xp ? L.xp.y - 2 : L.H - 12;
    return { x: 6, y: Math.max(4, bottom - h), w, h };
  }
  const w = Math.min(460, L.W - 24);
  const castY = L.cast ? L.cast.y : L.H - 64;
  return { x: Math.floor((L.W - w) / 2), y: Math.max(4, Math.min(Math.floor(L.H * 0.7), castY - 6 - h)), w, h };
}

/** The screen rows (NDC, -1 bottom .. 1 top) the hero and the boss must stay between: above the card, below the frames. */
export function cardBand(L, h = 50) {
  const r = cardRect(L, h);
  const ndc = (y) => 1 - (2 * y) / L.H;
  const hi = L.touch ? ndc(30) : ndc(20);       // phones: under the menu buttons; desktop: the top middle is clear
  return { lo: Math.min(hi - 0.3, ndc(r.y) + 0.06), hi };
}

export function createBossCard({ content = {}, zoneNames = {} } = {}) {
  const mobs = content.mobs || {};
  const seen = new Set();
  let pending = null;     // a pull waiting for the next frame's clock
  let cur = null;         // { id, zone, tpl, info, t0, len }
  let lastT = 0;

  function infoFor(e) {
    const tpl = mobs[e.template] || {};
    const { title, line } = splitCard(tpl.card);
    const place = (zoneNames && zoneNames[e.zone]) || '';
    return { template: e.template, card: tpl.card, title, line, level: e.level || null, rank: rankWord(tpl), place, big: !!tpl.boss };
  }

  function onEvent(ev, { snap = null, playerId = null, enabled = true } = {}) {
    if (!ev || !snap || playerId == null) return false;
    let id = null;
    if (ev.type === 'boss' && ev.kind === 'pull') id = ev.id;
    else if (ev.type === 'threat' && ev.top != null) id = ev.mob;
    else return false;
    const e = snap.entities.find((x) => x.id === id);
    const me = snap.entities.find((x) => x.id === playerId);
    if (!e || !me || e.kind !== 'mob' || e.dead || me.dead || e.zone !== me.zone) return false;
    const tpl = mobs[e.template];
    if (!tpl || !tpl.card) return false;
    if (Math.hypot(e.x - me.x, e.y - me.y) > NEAR_PX) return false;
    const key = `${e.zone}|${e.id}`;
    if (seen.has(key)) return false;
    seen.add(key);
    if (!enabled || cur || pending) return false;     // Settings off, or a card already up: this pull is not carded
    pending = { id: e.id, zone: e.zone, info: infoFor(e) };
    return true;
  }

  function frame(tSec, snap, playerId) {
    lastT = tSec;
    if (pending) { cur = { ...pending, t0: tSec, len: CARD_SEC }; pending = null; }
    if (!cur) return null;
    if (tSec < cur.t0) cur.t0 = tSec;    // a clock that went back (drivers' redraw times): start from here
    const age = tSec - cur.t0;
    const me = snap && playerId != null ? snap.entities.find((x) => x.id === playerId) : null;
    const b = snap ? snap.entities.find((x) => x.id === cur.id) : null;
    // the hero died, left, or the boss is gone: fade out early (never longer than the planned end)
    if ((!me || !b || me.dead || b.dead || me.zone !== cur.zone || b.zone !== cur.zone) && cur.len - age > FADE_OUT) cur.len = Math.max(age, 0) + FADE_OUT;
    if (age >= cur.len) { cur = null; return null; }
    if (!me || !b || me.zone !== cur.zone) return null;
    return { k: camWeight(age, cur.len), hero: { x: me.x, y: me.y }, boss: { x: b.x, y: b.y, h: (cur.info.big ? 4.2 : 3.2) * PX }, band: cur.band || null };
  }

  function draw(ctx, g, L, tSec) {
    if (!cur) return false;
    const age = tSec - cur.t0;
    const a = cardAlpha(age, cur.len);
    if (a <= 0) return false;
    const info = cur.info;
    const lh = lineH(g);
    const w0 = cardRect(L, 0).w;
    const lines = info.line ? g.wrap(info.line, w0 - 16) : [];
    const sub = [info.level ? `Level ${info.level}` : null, info.rank || null, info.place || null].filter(Boolean).join('   ');
    const h = 6 + lh.title + lines.length * lh.body + (sub ? lh.body + 2 : 0) + 6;
    const r = cardRect(L, h);
    ctx.save();
    ctx.globalAlpha = a;
    // a dark band with soft ends, then gold rules that draw outwards from the middle
    const ext = L.touch ? Math.min(40, r.x) : 40;   // phones: the card starts at the left edge
    const grd = ctx.createLinearGradient(r.x - ext, 0, r.x + r.w + 40, 0);
    const dk = L.touch ? 1 : 0.86;     // dark enough that the chat lines under it do not read through
    grd.addColorStop(0, `rgba(8,6,14,${L.touch ? dk : 0})`); grd.addColorStop(0.1, `rgba(8,6,14,${dk})`); grd.addColorStop(0.9, `rgba(8,6,14,${dk})`); grd.addColorStop(1, 'rgba(8,6,14,0)');
    ctx.fillStyle = grd;
    ctx.fillRect(r.x - ext, r.y, r.w + ext + 40, r.h);
    const rule = Math.round((r.w / 2) * smooth(age / 0.5)), cx = Math.round(r.x + r.w / 2);
    ctx.fillStyle = '#c99a3c';
    ctx.fillRect(cx - rule, r.y, rule * 2, 1);
    ctx.fillRect(cx - rule, r.y + r.h - 1, rule * 2, 1);
    ctx.restore();
    let y = r.y + 5;
    g.text(ctx, info.title, cx, y, 'gold', { align: 'center', large: true, alpha: a });
    y += lh.title;
    for (const ln of lines) { g.text(ctx, ln, cx, y, 'cream', { align: 'center', alpha: a }); y += lh.body; }
    if (sub) g.text(ctx, sub, cx, y + 2, 'gray', { align: 'center', alpha: a });
    cur.rect = r;
    cur.band = cardBand(L, h);
    return true;
  }

  return {
    onEvent, frame, draw,
    /** the band the camera keeps the two in (set by the last draw; a sensible default before it) */
    band(L) { return cur && cur.band ? cur.band : L ? cardBand(L) : null; },
    get active() { return !!(cur || pending); },
    debug() { return { card: cur ? { ...cur.info, t0: cur.t0, len: cur.len, rect: cur.rect || null, band: cur.band || null, age: +(lastT - cur.t0).toFixed(3) } : null, pending: !!pending, seen: [...seen] }; },
    reset() { seen.clear(); cur = null; pending = null; },
  };
}
