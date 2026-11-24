// The synth in the game (wave 5b): plays pre-rendered synth buffers beside the LQ engine. Browser only.
// Scott approved the synth on 2026-11-24 ("Audio is a go"); the audio brief's defaults are in synth_places.js.
//
//   const syn = createSynthGame({ engine, onTrackReady })
//   syn.setEnabled(bool)  syn.setVolumes({ master, sfx })      the Settings switch and sliders
//   syn.theme(spec, variant) -> engine music id when its loop is rendered, else null (and it starts rendering)
//   syn.event(ev, { me, isPlayer, family })                    -> true when a synth sound stood in for the table's
//   syn.frame(nowMs, { me, snap, zone })                       footsteps, fire and water nearby, work loops
//   syn.debug()
//
// Cost (the phone plan): nothing is synthesized while you play. Music loops and a bank of about 140 short sounds are
// rendered once on an OfflineAudioContext in the background (one at a time), then played as buffers: one buffer
// source, one gain and one panner per sound, at most MAX_VOICES at once. Never throws: no WebAudio, a locked context,
// the switch off or zero volume all make every call a no-op.
import { createBank, renderTheme, wavUrl, BANK_NAMES } from './synth/render.js';
import { synthTrackId, surfaceOf } from './synth_places.js';
import { synthSoundsFor } from './synth_table.js';
import { friendGain, friendPan } from './sfx_table.js';

const TILE = 16;
const MAX_VOICES = 10;
const BANK_DELAY_MS = 6000;         // let the game load and settle first
const BANK_GAP_MS = 120;            // a pause between bank renders, so a phone never spends long frames on it
const MUSIC_KEEP = 6;               // rendered loops kept (blob URLs); older ones are released
const FRIEND_STEP = { volume: 0.4, minGain: 0.25, max: 3 };
const NEAR = { fire: 8 * TILE, water: 6 * TILE };
// phones and touch screens render the music loops at a lower rate (less work, less memory; the synth has little up there)
const LITE = typeof matchMedia === 'function' && (() => { try { return matchMedia('(pointer: coarse)').matches; } catch { return false; } })();

export function createSynthGame({ engine = null, onTrackReady = null } = {}) {
  const ok = typeof window !== 'undefined' && typeof OfflineAudioContext !== 'undefined';
  let enabled = true;
  const vols = { master: 1, sfx: 0.8 };
  let out = null, outCtx = null, voices = 0;
  const played = {};               // sounds started, by kind (debug, QA)
  const bank = ok ? createBank() : null;
  let bankStarted = false, bankDone = false, t0 = null;
  // music
  const tracks = new Map();         // id -> { url, loopEnd } once rendered
  const pending = new Set();
  const queue = [];
  let rendering = false;
  const lastKey = new Map();
  // per-frame state
  let snapNow = null, entMap = null, meNow = null;
  const steps = new Map();          // hero id -> { x, y, t, next }
  const loops = new Map();          // key -> { src, gain, pan, level }
  let scanAt = 0, hearths = null, hearthZone = null;

  const ctxNow = () => { try { return engine && engine.context; } catch { return null; } };
  function bus() {
    const c = ctxNow();
    if (!c) return null;
    if (out && outCtx === c) return out;
    try { out = c.createGain(); out.connect(c.destination); outCtx = c; applyVol(); return out; } catch { out = null; return null; }
  }
  function applyVol() { if (out) try { out.gain.value = enabled ? vols.master * vols.sfx : 0; } catch { /* */ } }

  function startBank() {
    if (!bank || bankStarted) return;
    bankStarted = true;
    // the most heard first: footsteps, then barks and voices, then the rest
    const order = [...BANK_NAMES].sort((a, b) => rank(a) - rank(b));
    bank.render(order, { gapMs: BANK_GAP_MS }).then(() => { bankDone = true; }, () => { bankDone = true; });
  }
  const rank = (n) => (n.startsWith('step:') ? 0 : n.startsWith('bark:') ? 1 : n.startsWith('voice:boar') ? 2 : n.startsWith('voice:') ? 3 : n.startsWith('loop:') ? 4 : 5);

  /** Play a bank sound. vol 0..1, pan -1..1. A looping sound returns its nodes. */
  function play(name, { vol = 1, pan = 0, loop = false, rate = 1 } = {}) {
    if (!enabled || vol <= 0.001) return null;
    const o = bus(); const c = outCtx;
    if (!o || !bank) return null;
    const buf = bank.get(name);
    if (!buf) return null;
    if (!loop && voices >= MAX_VOICES) return null;
    try {
      const s = c.createBufferSource(); s.buffer = buf; s.loop = loop; s.playbackRate.value = rate;
      const g = c.createGain(); g.gain.value = vol;
      const p = c.createStereoPanner ? c.createStereoPanner() : null;
      s.connect(g);
      if (p) { p.pan.value = Math.max(-1, Math.min(1, pan)); g.connect(p); p.connect(o); } else g.connect(o);
      if (!loop) { voices++; s.onended = () => { voices--; try { s.disconnect(); g.disconnect(); if (p) p.disconnect(); } catch { /* */ } }; }
      s.start();
      const kind = name.split(':')[0]; played[kind] = (played[kind] || 0) + 1;
      return { src: s, gain: g, pan: p };
    } catch { return null; }
  }

  // ---------------------------------------------------------------- music
  function pump() {
    if (rendering || !queue.length) return;
    const { id, spec, variant } = queue.shift();
    rendering = true;
    renderTheme(spec, variant, { sampleRate: LITE ? 22050 : 32000 }).then((r) => {
      rendering = false; pending.delete(id);
      if (!r) return;
      const url = wavUrl(r.buffer);
      if (!url || !engine || !engine.manifest) return;
      engine.manifest.music[id] = { src: url, volume: 0.95, loopStart: 0, loopEnd: r.loopEnd, duration: r.loopEnd, fallback: null, synth: true };
      tracks.set(id, { url, loopEnd: r.loopEnd, ms: r.ms });
      while (tracks.size > MUSIC_KEEP) {
        const [old, t] = tracks.entries().next().value;
        if (engine.currentMusic && engine.currentMusic() === old) break;
        tracks.delete(old); delete engine.manifest.music[old];
        try { URL.revokeObjectURL(t.url); } catch { /* */ }
      }
      if (onTrackReady) onTrackReady(id);
      pump();
    }, () => { rendering = false; pending.delete(id); pump(); });
  }
  function theme(spec, variant = 'day') {
    if (!ok || !enabled || !spec) return null;
    const id = synthTrackId(spec, variant);
    if (tracks.has(id)) { const t = tracks.get(id); tracks.delete(id); tracks.set(id, t); return id; }   // keep it fresh in the LRU
    if (!pending.has(id)) { pending.add(id); queue.push({ id, spec, variant: id.split(':').pop() }); pump(); }
    return null;
  }

  // ---------------------------------------------------------------- events
  function entOf(id) {
    if (!snapNow || id == null) return null;
    if (!entMap) { entMap = new Map(); for (const e of snapNow.entities || []) entMap.set(e.id, e); }
    return entMap.get(id) || null;
  }
  function gainAt(id) {
    if (id == null || !meNow) return { g: 1, pan: 0 };
    const e = entOf(id);
    if (!e) return { g: 0.6, pan: 0 };
    const dx = e.x - meNow.x;
    return { g: friendGain(dx, e.y - meNow.y, e.zone === meNow.zone), pan: friendPan(dx) };
  }
  function event(ev, { me, isPlayer = null, family = null } = {}) {
    if (!enabled || !ok) return false;
    let replaced = false;
    try {
      const list = synthSoundsFor(ev, { me, isPlayer: isPlayer || ((id) => { const e = entOf(id); return !!e && e.kind === 'player'; }), ent: entOf, family });
      const t = typeof performance !== 'undefined' ? performance.now() : Date.now();
      for (const s of list) {
        if (s.key) { if (t - (lastKey.get(s.key) || -1e9) < (s.gap || 1000)) continue; lastKey.set(s.key, t); }
        const { g, pan } = gainAt(s.at);
        if (g <= 0) continue;
        const played = play(s.name, { vol: (s.volume ?? 1) * g, pan, rate: 0.96 + Math.random() * 0.08 });
        if (played && s.replace) replaced = true;
      }
    } catch (e) { /* never break the game for a sound */ }
    return replaced;
  }

  // ---------------------------------------------------------------- per frame
  function tileAt(zone, x, y) {
    const tx = Math.floor(x / TILE), ty = Math.floor((y - 1) / TILE);
    const row = zone && zone.ground && zone.ground[ty];
    return row ? zone.legend[row[tx]] : null;
  }
  function footsteps(t, zone) {
    let friends = 0;
    for (const e of snapNow.entities || []) {
      if (e.kind !== 'player' || e.dead || e.zone !== meNow.zone) continue;
      const mine = e.id === meNow.id;
      const s = steps.get(e.id) || { x: e.x, y: e.y, t, next: t + 200, v: 0 };
      const dt = Math.max(1, t - s.t);
      const d = Math.hypot(e.x - s.x, e.y - s.y);
      s.v = s.v * 0.7 + ((d / dt) * 1000) * 0.3;                  // px per second, smoothed
      s.x = e.x; s.y = e.y; s.t = t;
      steps.set(e.id, s);
      const walking = s.v > 18 && !e.mount && !e.flight && !e.sitting;
      if (!walking) { s.next = t + 120; continue; }
      if (t < s.next) continue;
      s.next = t + Math.max(260, Math.min(560, (30 / s.v) * 1000));
      let vol = 0.55, pan = 0;
      if (!mine) {
        const dx = e.x - meNow.x, g = friendGain(dx, e.y - meNow.y, true);
        if (g < FRIEND_STEP.minGain || friends >= FRIEND_STEP.max) continue;
        friends++; vol *= FRIEND_STEP.volume * g; pan = friendPan(dx);
      }
      play(`step:${surfaceOf(tileAt(zone, e.x, e.y))}`, { vol, pan, rate: 0.93 + Math.random() * 0.14 });
    }
  }
  function setLoop(key, name, level, pan = 0) {
    let L = loops.get(key);
    if (level <= 0.002) {
      if (L) { try { L.gain.gain.setTargetAtTime(0, outCtx.currentTime, 0.3); } catch { /* */ } if (!L.off) L.off = Date.now(); if (Date.now() - L.off > 3000) { try { L.src.stop(); L.src.disconnect(); } catch { /* */ } loops.delete(key); } }
      return;
    }
    if (!L) { const p = play(name, { vol: 0, loop: true }); if (!p) return; L = p; loops.set(key, L); }
    L.off = 0;
    try { L.gain.gain.setTargetAtTime(level, outCtx.currentTime, 0.4); if (L.pan) L.pan.pan.setTargetAtTime(pan, outCtx.currentTime, 0.4); } catch { /* */ }
  }
  function nearby(t, zone) {
    if (t < scanAt) return;
    scanAt = t + 400;
    // fire: the hearths dressed into the map (decor x1_hearth), by distance
    if (hearthZone !== zone) { hearthZone = zone; hearths = (zone.decor || []).filter((d) => d.t === 'x1_hearth').map((d) => ({ x: (d.x + 0.5) * TILE, y: (d.y + 0.5) * TILE })); }
    let best = null, bd = 1e9;
    for (const h of hearths) { const d = Math.hypot(h.x - meNow.x, h.y - meNow.y); if (d < bd) { bd = d; best = h; } }
    const fk = bd < NEAR.fire ? 1 - bd / NEAR.fire : 0;
    setLoop('fire', 'loop:fire', 0.55 * fk * fk, best ? friendPan(best.x - meNow.x) : 0);
    // water: the nearest water tile within reach (rivers, the falls, the tarns)
    const R = Math.ceil(NEAR.water / TILE), cx = Math.floor(meNow.x / TILE), cy = Math.floor((meNow.y - 1) / TILE);
    let wd = 1e9, wx = 0;
    for (let dy = -R; dy <= R; dy++) {
      const row = zone.ground && zone.ground[cy + dy];
      if (!row) continue;
      for (let dx = -R; dx <= R; dx++) {
        const id = zone.legend[row[cx + dx]];
        if (id === 'water' || id === 'shallow' || id === 'x1_tarn') { const d = Math.hypot(dx, dy) * TILE; if (d < wd) { wd = d; wx = dx; } }
      }
    }
    const wk = wd < NEAR.water ? 1 - wd / NEAR.water : 0;
    setLoop('water', 'loop:water', 0.4 * wk, Math.max(-0.6, Math.min(0.6, wx / R)));
  }
  function workLoops() {
    const seen = new Set();
    for (const e of snapNow.entities || []) {
      if (e.kind !== 'player' || !e.work || e.zone !== meNow.zone) continue;
      const k = e.work.kind === 'gather' ? (e.work.prof === 'herbalism' ? 'herb' : 'mine') : e.work.kind === 'fish' ? 'fish' : 'craft';
      const g = e.id === meNow.id ? 1 : friendGain(e.x - meNow.x, e.y - meNow.y, true) * 0.5;
      const key = `work${e.id}`; seen.add(key);
      setLoop(key, `work:${k}`, 0.5 * g, e.id === meNow.id ? 0 : friendPan(e.x - meNow.x));
    }
    for (const key of loops.keys()) if (key.startsWith('work') && !seen.has(key)) setLoop(key, null, 0);
  }
  function frame(t, { me = null, snap = null, zone = null } = {}) {
    if (!ok) return;
    if (t0 == null) t0 = t;
    if (!bankStarted && enabled && t - t0 > BANK_DELAY_MS) startBank();   // switched off: nothing is rendered
    snapNow = snap; entMap = null; meNow = me;
    if (!enabled || !me || !snap || !zone || !bus()) { for (const k of [...loops.keys()]) setLoop(k, null, 0); return; }
    try { footsteps(t, zone); nearby(t, zone); workLoops(); } catch (e) { /* never break the game for a sound */ }
  }

  return {
    get enabled() { return enabled && ok; },
    setEnabled(on) { enabled = on !== false; applyVol(); if (!enabled) for (const k of [...loops.keys()]) { const L = loops.get(k); try { L.src.stop(); } catch { /* */ } loops.delete(k); } },
    setVolumes(v = {}) { if (v.master != null) vols.master = v.master; if (v.sfx != null) vols.sfx = v.sfx; applyVol(); },
    theme, event, frame, play,
    hasTrack: (id) => tracks.has(id),
    debug: () => ({ available: ok, enabled, bankDone, bank: bank ? { ...bank.stats } : null, tracks: [...tracks.entries()].map(([id, t]) => ({ id, loopEnd: +t.loopEnd.toFixed(1), ms: t.ms })), pending: [...pending], voices, played: { ...played }, loops: [...loops.keys()] }),
  };
}
