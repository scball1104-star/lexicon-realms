// The loading card for dungeons and caves (render lane, dungeons build 2026-11-22). Both renderers.
//
//   const card = createLoadingCard({ font })
//   card.onZone(ev, { zones, renderer })      the local hero's 'zone' event (main.js, on the tick it happens, so the card
//                                             is up before the frame that would draw the new place)
//   card.draw(ctx, renderer, nowMs)           over everything, on the game canvas in device px (after the HUD)
//   card.active                               true while it shows; card.info: what it shows (drivers)
//
// Into a place: always (name, "Dungeon, levels 10 to 12" or "Cave, ...", one line of flavour when the zone has one, a
// progress bar). It stays at least MIN_MS, and until the renderer says the place is drawn and smooth (renderer.zoneLoad:
// { to, k 0..1, ready }; the 3D renderer builds and warms the scene behind it, the 2D one is ready after its first
// frame), then fades in FADE_MS. Out of a place: only when the renderer still has to build or warm the world
// (renderer.zoneReady(to) false); usually leaving is instant and no card shows.
const MIN_MS = 700;
const FADE_MS = 250;
const MAX_MS = 20000;                 // never stuck: a card that waited this long fades anyway
const base = (id) => { const s = String(id); const i = s.indexOf('#'); return i < 0 ? s : s.slice(0, i); };
const isPlace = (z) => !!z && (z.kind === 'dungeon' || z.kind === 'cave');

export function createLoadingCard({ font }) {
  let card = null;
  let buf = null, bctx = null;
  const text = new Map();
  function words(s, color, scale = 1) {
    const k = `${s}|${color}`;
    if (!text.has(k)) {
      const w = Math.max(8, font.measure(s) + 4), h = font.lineHeight + 4;
      const c = document.createElement('canvas'); c.width = w; c.height = h;
      const g = c.getContext('2d'); g.imageSmoothingEnabled = false;
      font.draw(g, s, 2, 2, { color, outline: '#0a0810' });
      text.set(k, { c, w, h });
    }
    const t = text.get(k);
    return { c: t.c, w: t.w * scale, h: t.h * scale };
  }

  function onZone(ev, { zones, renderer }) {
    const to = zones[ev.to], from = zones[ev.from];
    const into = isPlace(to), out = isPlace(from) && !into;
    if (!into && !out) return;
    if (out && !(renderer && typeof renderer.zoneReady === 'function' && !renderer.zoneReady(ev.to))) { card = null; return; }
    const z = into ? to : from, d = (z && z.dungeon) || {};
    const kind = (into ? ev.kind : null) || z.kind;
    const levels = (into && ev.levels) || d.levels || z.levels || null;
    const label = (into && ev.label) || d.label || (levels ? `${kind === 'cave' ? 'Cave' : 'Dungeon'}, levels ${levels[0]} to ${levels[1]}` : (kind === 'cave' ? 'Cave' : 'Dungeon'));
    const name = (into && ev.name) || d.name || z.name || '';
    const flavour = d.flavour || d.line || z.flavour || ev.flavour || '';
    card = { t0: performance.now(), to: base(ev.to), into, kind, info: { name, label, flavour, kind, into }, shownK: 0, fadeAt: null, ready: false };
  }

  function draw(ctx, renderer, nowMs = performance.now()) {
    if (!card) return;
    const now = performance.now();
    const el = now - card.t0;
    const zl = renderer && renderer.zoneLoad;
    // 2D (no zoneLoad): ready once a frame of the new zone has been drawn, which happened before this call
    const mine = !zl || base(zl.to) === card.to;
    const k = !zl ? 1 : mine ? (zl.ready ? 1 : zl.k || 0) : 0;
    const ready = !zl || (mine && zl.ready);
    card.ready = ready;
    card.shownK = Math.max(card.shownK, Math.min(k, card.shownK + 0.08 + k * 0.1));
    if (card.fadeAt == null && !card.hold && ((ready && el >= MIN_MS) || el >= MAX_MS)) card.fadeAt = now;
    const fade = card.fadeAt == null ? 1 : 1 - (now - card.fadeAt) / FADE_MS;
    if (fade <= 0) { card.doneAt = now; last = card; card = null; return; }
    const L = renderer.layout;
    const W = ctx.canvas.width, H = ctx.canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = Math.max(0, Math.min(1, fade));
    // the whole canvas: dark, a little warmer in the middle
    const grd = ctx.createLinearGradient(0, 0, 0, H);
    grd.addColorStop(0, '#07060a'); grd.addColorStop(0.55, '#120e16'); grd.addColorStop(1, '#050406');
    ctx.fillStyle = grd; ctx.fillRect(0, 0, W, H);
    // the card itself in HUD px, scaled like the HUD
    const hw = L.hudW, hh = L.hudH;
    if (!buf || buf.width !== hw || buf.height !== hh) { buf = document.createElement('canvas'); buf.width = hw; buf.height = hh; bctx = buf.getContext('2d'); bctx.imageSmoothingEnabled = false; }
    const g = bctx;
    g.clearRect(0, 0, hw, hh);
    const cx = Math.round(hw / 2), cy = Math.round(hh * 0.42);
    const glow = g.createRadialGradient(cx, cy + 40, 4, cx, cy + 40, 150);
    glow.addColorStop(0, card.kind === 'cave' ? 'rgba(120,170,160,0.16)' : 'rgba(255,140,60,0.22)'); glow.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = glow; g.fillRect(0, 0, hw, hh);
    const fw = Math.min(144, Math.floor(hw / 2) - 14);
    if (card.kind === 'cave') {
      // a rough rock arch
      g.fillStyle = '#2a2622';
      for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); const x = cx + Math.cos(a) * fw, y = cy + 56 - Math.sin(a) * 128; const r = 10 + ((i * 7) % 5) * 2; g.fillRect(Math.round(x - r), Math.round(y - r), r * 2, r * 2); }
      g.fillStyle = '#3a342e';
      for (let i = 0; i <= 12; i++) { const a = Math.PI * (i / 12); const x = cx + Math.cos(a) * fw, y = cy + 56 - Math.sin(a) * 128; g.fillRect(Math.round(x - 6), Math.round(y - 9), 10, 3); }
    } else {
      // a doorway of dressed stone: two uprights and a lintel
      g.fillStyle = '#2a2620'; g.fillRect(cx - fw + 12, cy - 62, 16, 118); g.fillRect(cx + fw - 28, cy - 62, 16, 118); g.fillRect(cx - fw, cy - 76, fw * 2, 16);
      g.fillStyle = '#3a342c'; g.fillRect(cx - fw, cy - 76, fw * 2, 3); g.fillRect(cx - fw + 12, cy - 60, 3, 116); g.fillRect(cx + fw - 28, cy - 60, 3, 116);
    }
    const { name, label, flavour, into } = card.info;
    if (!into) {
      const t = words(`Leaving ${name}`, 'gold', 2); g.drawImage(t.c, Math.round(cx - t.w / 2), cy - 12, t.w, t.h);
    } else {
      const big = words(name, 'gold', 1), sc = big.w * 2 <= fw * 2 - 40 ? 2 : 1;
      const t1 = words(name, 'gold', sc), t2 = words(label, '#e0d8f0', 1);
      g.drawImage(t1.c, Math.round(cx - t1.w / 2), cy - 36, t1.w, t1.h);
      g.drawImage(t2.c, Math.round(cx - t2.w / 2), cy + 2);
      if (flavour) { const t3 = words(flavour, '#a8a0b8', 1); g.drawImage(t3.c, Math.round(cx - Math.min(t3.w, hw - 8) / 2), cy + 64); }
    }
    const bw = Math.min(220, hw - 40), bx = Math.round(cx - bw / 2), by = Math.round(hh * 0.8);
    g.fillStyle = '#14101e'; g.fillRect(bx - 2, by - 2, bw + 4, 8);
    g.fillStyle = '#3a3448'; g.fillRect(bx, by, bw, 4);
    g.fillStyle = '#f9d77a'; g.fillRect(bx, by, Math.round(bw * card.shownK), 4);
    const status = ready ? 'Ready' : into ? (card.kind === 'cave' ? 'Feeling the way in...' : 'Lighting the torches...') : 'Finding the way out...';
    const ts = words(status, 'gray', 1); g.drawImage(ts.c, Math.round(cx - ts.w / 2), by + 8);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, hw, hh, L.ox, L.oy, hw * L.base, hh * L.base);
    ctx.restore();
  }

  let last = null;
  return {
    onZone, draw,
    get active() { return !!card; },
    get info() { return card ? { ...card.info, shownMs: Math.round(performance.now() - card.t0), k: card.shownK, ready: card.ready } : null; },
    get last() { return last ? { ...last.info, t0: last.t0, doneAt: last.doneAt, ms: Math.round(last.doneAt - last.t0) } : null; },
    /** Drivers (stills): show the card for a zone and hold it until hide(). */
    show(info, ms = 600000) { card = { t0: performance.now() - 0, to: '__hold', into: true, kind: info.kind || 'dungeon', info: { into: true, flavour: '', ...info }, shownK: info.k ?? 0.72, fadeAt: null, ready: false, hold: ms }; },
    hide() { card = null; },
  };
}
