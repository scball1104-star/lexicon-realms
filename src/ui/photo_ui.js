// Photo mode and postcards (wave 8 photo lane, approved by Scott 2026-11-24: D:/LQOnline/wave8/photo/BRIEF.md).
// Drawn with the g.* calls, so the UI skin and Text size apply. Render-only: see photo_rig.js for the contract.
//
//   const P = createPhotoUI({ g, st, send, say, hooks })
//     hooks.capture()  -> a canvas with the 3D frame just drawn (renderer3d.js capture), or null
//     hooks.is3d() hooks.ready() hooks.flying() hooks.under() (no sky: a dungeon or cave) hooks.place3d() (the short leash)
//     hooks.place() -> the area name for the caption     hooks.liveTod() -> the live day fraction under the slider
//     hooks.cam()      -> the horizon camera state { yaw, pitch, dist } (main.js lends it while photo mode is open)
//     hooks.releaseMove(codes) lets go of held movement keys (ui.js, through the input driver API)
//   P.open(player) / P.close(why)      P.on      P.view -> { tod, weather, photo } for main.js to put on `view`
//   P.draw(ctx, L, regions, m)         the controls (nothing else of the HUD is drawn while photo mode is open)
//   P.key(ev, m, binds) -> true when used     P.keyUp(ev) (never swallows)     P.save() -> the postcard     P.compose()
//
// Desktop: P (rebindable, Options: Keys) opens and closes it; H hides the panel; Enter saves a postcard (a PNG download);
// Esc closes. The camera: right-drag turns, the wheel zooms, held W A S D or the arrows move the camera, never the hero.
// Phone: the emote ring's Photo button opens it; two fingers turn and zoom, one finger moves the camera; Save makes the
// postcard and shows it with Share (the phone's share sheet needs a tap of its own), Back returns to the scene.
import { effectiveBinds, actionFor } from './keymap.js';
import { markPage } from './page_marks.js';   // wave 9 fixes
import { photoGate, stillGate, closeLine, timeLabel, clockText, subLine, leash, heldPan, dragPan, postcardLayout, postcardFile, stampDate,
  WEATHERS, POSES, CAPTION, SAY, WORDS, TIME_MARKS, LEASH_M, LEASH_PLACE_M, PAN_KEYS } from './photo_rig.js';

export function createPhotoUI({ g, st, send, say = () => {}, hooks = {} }) {
  const P = {
    on: false, tod: null, weather: null, dx: 0, dz: 0, panel: true, zone0: null, note: null, last: null, pose: 0,
    held: new Set(), lastT: null, preview: null,
  };
  const note = (text, secs = 2.5) => { P.note = { text, until: (st.now || 0) + secs }; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = Math.max(1, w); c.height = Math.max(1, h); return c; };
  const H = (k, d) => (hooks[k] ? hooks[k]() : d);
  // wave 9 fixes: the page's own HTML over the canvas (the co-op bar with its Chat button, the chat line: src/net/netui.js)
  // steps aside too, through a class on <html> that netui.js's CSS reads
  const htmlMark = (on) => markPage('lr-photo', on);

  function open(player) {
    const gate = photoGate(player, { is3d: H('is3d', true), flying: H('flying', false), ready: H('ready', true) });
    if (!gate.ok) { say('error', gate.say); return false; }
    Object.assign(P, { on: true, dx: 0, dz: 0, panel: true, zone0: H('zone', null), note: null, tod: null, weather: null, preview: null, lastT: null });
    P.held.clear();
    st.photo = P; st.emoteRing = null; st.longTip = null;
    htmlMark(true);
    if (hooks.releaseMove) hooks.releaseMove(PAN_KEYS);     // a key held as it opens must not keep the hero walking
    send({ t: 'stop' });
    return true;
  }
  function close(why) {
    const was = P.on;
    Object.assign(P, { on: false, tod: null, weather: null, dx: 0, dz: 0, preview: null });
    P.held.clear();
    st.photo = null; st.longTip = null;
    htmlMark(false);
    const line = was ? closeLine(why) : null;
    if (line) say('error', line);
  }
  const leashM = () => (H('place3d', false) ? LEASH_PLACE_M : LEASH_M);
  function nudge(wx, wz) { [P.dx, P.dz] = leash(P.dx + wx, P.dz + wz, leashM()); }

  function compose(photo, opts = {}) {
    const w = photo.width, h = photo.height, Lc = postcardLayout(w, h), s = Lc.s;
    const out = mk(w, h), c = out.getContext('2d');
    c.imageSmoothingEnabled = false;
    // the cream mat and an ink line, the photo inside
    c.fillStyle = '#efe4c8'; c.fillRect(0, 0, w, h);
    const m = Lc.mat;
    c.drawImage(photo, m, m, w - 2 * m, h - 2 * m);
    c.fillStyle = '#14101e';
    const ln = Lc.line;
    c.fillRect(m - ln, m - ln, w - 2 * m + 2 * ln, ln); c.fillRect(m - ln, h - m, w - 2 * m + 2 * ln, ln);
    c.fillRect(m - ln, m - ln, ln, h - 2 * m + 2 * ln); c.fillRect(w - m, m - ln, ln, h - 2 * m + 2 * ln);
    c.fillStyle = 'rgba(20,16,30,0.25)'; c.fillRect(0, h - Math.max(2, ln * 2), w, Math.max(2, ln * 2));
    // the plaque: the game's own window frame and font, drawn small and scaled up by a whole number (pixel-crisp)
    const title = opts.title || CAPTION(null), sub = opts.sub || '';
    const tw = Math.max(g.textW(title, true), g.textW(sub)) + 22, th = sub ? 34 : 22;
    const pc = mk(tw, th), pg = pc.getContext('2d');
    pg.imageSmoothingEnabled = false;
    g.window(pg, 0, 0, tw, th, 'std', opts.scheme || 'ember', 0.96);
    g.text(pg, title, Math.round(tw / 2), 4, 'gold', { align: 'center', large: true });
    if (sub) g.text(pg, sub, Math.round(tw / 2), 21, 'cream', { align: 'center' });
    c.drawImage(pc, 0, 0, tw, th, Lc.plaque.x, Lc.plaque.y - th * s, tw * s, th * s);
    // the stamp: a small thin window with the game's name and the day the picture was taken (the player's own clock)
    const st1 = WORDS.stamp1, st2 = WORDS.stamp2, st3 = opts.date || '';
    const sw = Math.max(g.textW(st1), g.textW(st3)) + 12, sh = st3 ? 38 : 28;
    const sc = mk(sw, sh), sg = sc.getContext('2d');
    sg.imageSmoothingEnabled = false;
    g.window(sg, 0, 0, sw, sh, 'thin', 'crimson', 0.94);
    g.text(sg, st1, Math.round(sw / 2), 5, 'cream', { align: 'center' });
    g.text(sg, st2, Math.round(sw / 2), 15, 'gold', { align: 'center' });
    if (st3) g.text(sg, st3, Math.round(sw / 2), 26, 'gray', { align: 'center' });
    const ss = Math.max(1, s - 1);
    c.save(); c.translate(Lc.stamp.x - (sw * ss) / 2, Lc.stamp.y + (sh * ss) / 2); c.rotate(0.06);
    c.drawImage(sc, 0, 0, sw, sh, -(sw * ss) / 2, -(sh * ss) / 2, sw * ss, sh * ss);
    c.restore();
    return out;
  }

  /** Take the shot: the 3D frame only (the panel is never in it), framed. Returns { canvas, file, title, sub } or null. */
  function save(opts = {}) {
    const shot = hooks.capture ? hooks.capture() : null;
    if (!shot) return null;
    const place = H('place', null);
    const f = P.tod != null && !H('under', false) ? P.tod : H('liveTod', 0.5);
    const title = opts.title || CAPTION(place);
    const sub = opts.sub != null ? opts.sub : H('under', false) ? '' : subLine(f, P.weather);
    const when = opts.when || new Date();
    const card = compose(shot, { title, sub, date: opts.date || stampDate(when), scheme: opts.scheme });
    P.last = { canvas: card, file: postcardFile(place, when), title, sub };
    return P.last;
  }
  const blobOf = (card) => new Promise((res) => { try { card.canvas.toBlob(res, 'image/png'); } catch { res(null); } });
  /** PC (and a phone with no share sheet): a PNG download. */
  async function download(card) {
    const blob = await blobOf(card);
    if (!blob) return false;
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = card.file;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    note(SAY.saved);
    return true;
  }
  const canShareFiles = () => typeof navigator !== 'undefined' && typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && typeof File === 'function';
  /** Save pressed: the PC downloads at once; the phone shows the postcard with Share, the file made ready before that tap. */
  function saveAndDeliver(touch) {
    const card = save();
    if (!card) return null;
    if (!touch || !canShareFiles()) { download(card); return card; }
    const pv = { card, file: null, t0: st.now || 0 };
    P.preview = pv;
    blobOf(card).then((blob) => {
      if (!blob || P.preview !== pv) return;
      const file = new File([blob], card.file, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) pv.file = file; else { P.preview = null; download(card); }
    });
    return card;
  }
  function share() {
    const pv = P.preview;
    if (!pv || !pv.file) return false;
    // called straight from the tap (touch.js -> ui.press), so the share sheet has the gesture it needs
    navigator.share({ files: [pv.file], title: pv.card.title }).then(() => { note(SAY.shared); if (P.preview === pv) P.preview = null; }).catch(() => { /* cancelled: the preview stays */ });
    return true;
  }

  // ---- the controls
  function slider(ctx, regions, x, y, w, h, v, set, off) {
    g.gauge(ctx, x, y + Math.floor(h / 2) - 3, w, v, 'mp');
    g.rect(ctx, x + Math.round(v * (w - 4)), y + Math.floor(h / 2) - 5, 4, 9, off ? '#8a86a0' : '#fff7d6');
    if (!off) regions.push({ rect: { x, y, w, h }, kind: 'slider', label: 'photo:time', drag: (hx) => set(Math.max(0, Math.min(1, (hx - x) / w))) });
  }
  function chip(ctx, regions, x, y, label, on, act, h, minW = 0, off = false) {
    const w = Math.max(minW, g.textW(label) + 10);
    g.window(ctx, x, y, w, h, 'thin', on && !off ? 'ember' : 'slate', on ? 0.97 : 0.85);
    g.text(ctx, label, x + Math.round(w / 2), y + Math.round((h - g.lh) / 2) + 1, off ? 'gray' : on ? 'gold' : 'cream', { align: 'center' });
    if (!off) regions.push({ rect: { x, y, w, h }, kind: 'button', label: `photo:${label}`, on: act });
    return w;
  }
  /** The whole screen under the controls: clicks and taps on the world do nothing (the hero stays put), one finger on the
   *  phone moves the camera, and the horizon camera's right-drag, wheel and two fingers still reach it (camThrough). */
  function backdrop(regions, L) {
    regions.push({ rect: { x: 0, y: 0, w: L.W, h: L.H }, kind: 'photo_pan', id: 'photo', camThrough: true,
      scrollDrag: L.touch ? (ddx, ddy, rec) => {
        const prev = rec.photoPrev || [0, 0];
        rec.photoPrev = [ddx, ddy];
        const cam = H('cam', null);
        const [wx, wz] = dragPan(ddx - prev[0], ddy - prev[1], cam ? cam.yaw : 0, cam ? cam.dist : 10, L.H);
        nudge(wx, wz);
      } : null });
  }

  function draw(ctx, L, regions, m) {
    const p = m && m.player;
    const why = stillGate(p, { zone: H('zone', null), zone0: P.zone0, flying: H('flying', false) });
    if (why) { close(why); return false; }
    // held keys move the camera (desktop), turned to the horizon camera's yaw
    const t = st.now || 0, dt = P.lastT == null ? 0 : t - P.lastT;
    P.lastT = t;
    if (P.held.size) { const cam = H('cam', null); const [wx, wz] = heldPan(P.held, cam ? cam.yaw : 0, dt); nudge(wx, wz); }
    backdrop(regions, L);
    if (P.preview) drawPreview(ctx, L, regions);
    else if (P.panel) (L.touch ? drawPhone : drawDesk)(ctx, L, regions);
    else if (!L.touch) g.text(ctx, WORDS.hiddenHint, L.W - 6, L.H - g.lh - 3, 'gray', { align: 'right', alpha: 0.7 });
    else { const hit = L.minHit || 24; chip(ctx, regions, L.W - hit - 20, L.H - hit - 4, WORDS.show, false, () => { P.panel = true; }, hit, hit + 16); }
    if (P.note && P.note.until > t) {
      const tw = g.textW(P.note.text) + 16, x = Math.round((L.W - tw) / 2), y = Math.round(L.H * 0.18);
      g.window(ctx, x, y, tw, g.lh + 8, 'thin', 'ember', 0.97);
      g.text(ctx, P.note.text, L.W / 2, y + 4, 'gold', { align: 'center' });
    }
    return true;
  }
  const liveF = () => H('liveTod', 0.5);
  function drawDesk(ctx, L, regions) {
    const under = H('under', false);
    const w = Math.min(L.W - 16, 470), rh = g.ls(16), h = 14 + rh * 4 + 8;
    const x = Math.round((L.W - w) / 2), y = L.H - h - 8;
    g.window(ctx, x, y, w, h, 'std', 'blue', 0.9);
    const lx = x + 10, cx = x + 70, cw = w - 80;
    let ry = y + 8;
    g.text(ctx, WORDS.title, lx, ry + 2, 'gold');
    g.text(ctx, under ? WORDS.under : WORDS.only, x + w - 10, ry + 2, 'gray', { align: 'right' });
    ry += rh;
    const f = P.tod != null ? P.tod : liveF();
    g.text(ctx, WORDS.time, lx, ry + 3, under ? 'gray' : 'white');
    const sw = cw - 160;
    slider(ctx, regions, cx, ry, sw, rh, f, (v) => { P.tod = v; }, under);
    g.text(ctx, `${clockText(f)} ${timeLabel(f)}`, cx + sw + 8, ry + 3, P.tod == null || under ? 'gray' : 'cream');
    chip(ctx, regions, x + w - 10 - 34, ry, WORDS.live, P.tod == null, () => { P.tod = null; }, rh - 2, 34, under);
    for (const f0 of TIME_MARKS) g.rect(ctx, cx + Math.round(f0 * (sw - 4)) + 1, ry + rh - 3, 2, 2, '#8a86a0');
    ry += rh;
    g.text(ctx, WORDS.weather, lx, ry + 3, under ? 'gray' : 'white');
    let wx = cx;
    for (const it of WEATHERS) wx += chip(ctx, regions, wx, ry, it.label, P.weather === it.id, () => { P.weather = it.id; }, rh - 2, 0, under) + 3;
    ry += rh;
    g.text(ctx, WORDS.pose, lx, ry + 3, 'white');
    let px = cx;
    for (const it of POSES) px += chip(ctx, regions, px, ry, it.label, false, () => send({ ...it.cmd }), rh - 2) + 3;
    let bx = x + w - 10;
    const btn = (label, act, hot) => { const bw = g.textW(label) + 12; bx -= bw; chip(ctx, regions, bx, ry, label, hot, act, rh - 2, bw); bx -= 4; };
    btn(WORDS.deskDone, () => close('done'), false);
    btn(WORDS.deskSave, () => saveAndDeliver(false), true);
    btn(WORDS.deskHide, () => { P.panel = false; }, false);
    g.scrim(ctx, 6, 6, g.textW(WORDS.deskHint) + 12, g.lh + 6, 120);
    g.text(ctx, WORDS.deskHint, 12, 9, 'cream');
  }
  function drawPhone(ctx, L, regions) {
    const under = H('under', false);
    const hit = L.minHit || 24, pad = 4;
    const h = hit * 2 + pad * 3, w = L.W - 8, x = 4, y = L.H - h - 2;
    g.window(ctx, x, y, w, h, 'std', 'blue', 0.88);
    const f = P.tod != null ? P.tod : liveF();
    let ry = y + pad;
    // row 1: the time slider, its clock and name, Live
    const lab = `${clockText(f)} ${timeLabel(f)}`;
    const lw = Math.max(g.textW('00:00 Golden hour'), g.textW(lab)) + 6;
    const liveW = Math.max(hit + 8, g.textW(WORDS.live) + 12);
    const sw = w - lw - liveW - 24;
    slider(ctx, regions, x + 8, ry, sw, hit, f, (v) => { P.tod = v; }, under);
    g.text(ctx, lab, x + 14 + sw, ry + Math.round((hit - g.lh) / 2) + 1, P.tod == null || under ? 'gray' : 'cream');
    chip(ctx, regions, x + w - 6 - liveW, ry, WORDS.live, P.tod == null, () => { P.tod = null; }, hit, liveW, under);
    ry += hit + pad;
    // row 2: the sky (one button steps through), the pose (each tap the next), then Hide, Save, Done on the right
    const wi = Math.max(0, WEATHERS.findIndex((it) => it.id === P.weather));
    let bx = x + 6;
    const btn = (label, act, hot, minW = hit + 8, off = false) => { bx += chip(ctx, regions, bx, ry, label, hot, act, hit, minW, off) + 4; };
    btn(`${WORDS.sky}: ${WEATHERS[wi].label}`, () => { P.weather = WEATHERS[(wi + 1) % WEATHERS.length].id; }, P.weather != null, g.textW(`${WORDS.sky}: Cloudy`) + 12, under);
    btn(WORDS.pose, () => { const i = P.pose % POSES.length; send({ ...POSES[i].cmd }); P.pose = (i + 1) % POSES.length; }, false);
    const right = [[WORDS.done, () => close('done'), false], [WORDS.save, () => saveAndDeliver(true), true], [WORDS.hide, () => { P.panel = false; }, false]];
    let rx = x + w - 6;
    for (const [label, act, hot] of right) { const bw = Math.max(hit + 10, g.textW(label) + 12); rx -= bw; chip(ctx, regions, rx, ry, label, hot, act, hit, bw); rx -= 4; }
    const hint = under ? WORDS.under : WORDS.phoneHint;
    const hw = g.textW(hint) + 12;
    g.scrim(ctx, Math.round((L.W - hw) / 2), 4, hw, g.lh + 6, 120);
    g.text(ctx, hint, L.W / 2, 7, 'cream', { align: 'center' });
  }
  /** The phone's postcard, shown before the share sheet: Share (a tap of its own), Back. */
  function drawPreview(ctx, L, regions) {
    const pv = P.preview, cv = pv.card.canvas, hit = L.minHit || 24;
    const bh = hit, maxW = L.W - 24, maxH = L.H - bh - g.lh - 34;
    const k = Math.min(maxW / cv.width, maxH / cv.height), iw = Math.round(cv.width * k), ih = Math.round(cv.height * k);
    const ww = iw + 12, wh = ih + g.lh + bh + 22, x = Math.round((L.W - ww) / 2), y = Math.max(2, Math.round((L.H - wh) / 2));
    g.window(ctx, x, y, ww, wh, 'std', 'blue', 0.95);
    g.text(ctx, WORDS.ready, L.W / 2, y + 5, 'gold', { align: 'center' });
    const sm = ctx.imageSmoothingEnabled;
    ctx.imageSmoothingEnabled = true; ctx.drawImage(cv, x + 6, y + g.lh + 9, iw, ih); ctx.imageSmoothingEnabled = sm;
    const by = y + g.lh + ih + 14, bw = Math.max(hit + 24, g.textW(WORDS.share) + 16);
    chip(ctx, regions, Math.round(L.W / 2) - bw - 4, by, WORDS.share, true, () => share(), bh, bw, !pv.file);
    chip(ctx, regions, Math.round(L.W / 2) + 4, by, WORDS.back, false, () => { P.preview = null; }, bh, bw);
  }

  /** keydown in play, before the emote ring and the key routing. Open: every key but the zoom keys is photo mode's. */
  function key(ev, m, binds) {
    const p = m && m.player;
    const act = actionFor(ev.code, effectiveBinds(binds || {}));
    if (!P.on) {
      if (act === 'photo' && !ev.repeat) { if (!st.dialog && !st.mirror) open(p); return true; }
      return false;
    }
    if (['Equal', 'NumpadAdd', 'Minus', 'NumpadSubtract'].includes(ev.code)) return false;   // the horizon camera's zoom keys
    if (PAN_KEYS.includes(ev.code)) { P.held.add(ev.code); return true; }   // the camera, never the hero
    if (ev.repeat) return true;
    if (P.preview && (ev.code === 'Escape' || ev.code === 'Enter')) { P.preview = null; return true; }
    if (act === 'photo' || ev.code === 'Escape') { close('done'); return true; }
    if (ev.code === 'KeyH') { P.panel = !P.panel; return true; }
    if (ev.code === 'Enter' || ev.code === 'NumpadEnter') { saveAndDeliver(false); return true; }
    return true;                                 // every other key is quiet while photo mode is open
  }
  function keyUp(ev) { P.held.delete(ev.code); }

  return {
    open, close, compose, save, saveAndDeliver, share, download, key, keyUp, draw,
    get on() { return P.on; },
    get state() { return P; },
    /** What main.js puts on `view` this frame (null: photo mode is shut and the view is today's). Underground the time and
     *  weather stay the place's own (it has no sky). */
    get view() {
      if (!P.on) return null;
      const under = H('under', false);
      return { tod: under ? null : P.tod, weather: under ? null : P.weather, photo: { dx: P.dx, dz: P.dz, clean: true } };
    },
  };
}
