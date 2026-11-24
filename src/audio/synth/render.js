// Lexicon Realms synth: render once, play many times (the phone plan in the audio brief). Music themes and every
// in-game sound are rendered on an OfflineAudioContext in the background into plain AudioBuffers; the game then only
// plays buffers, which costs about what playing a sound file costs. Browser only; every function resolves to null
// when OfflineAudioContext is missing, so callers fall back to today's files.
//
//   await renderTheme(spec, 'day' | 'night' | 'combat', { sampleRate })   -> { buffer, loopEnd, ms } | null
//   wavUrl(buffer)                         -> a blob: URL of 16-bit WAV (the LQ engine streams and decodes it like a file)
//   const bank = createBank({ sampleRate, seed });  await bank.render(names);  bank.get(name) -> AudioBuffer | null
//   BANK_NAMES                             every sound the game uses, by name
import { createCore } from './core.js';
import { createSequencer, textureArrangement, combatArrangement } from './sequencer.js';
import { SFX } from './sfx.js';
import { VOICES, BARK_SHAPES } from './voices.js';
import { makeRng } from './rng.js';

const hasOffline = () => typeof OfflineAudioContext !== 'undefined';
const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

/** Add what rang on past the loop point back onto its start, so the loop has no seam and the reverb carries over. */
function foldTail(buf, loopLen, sr) {
  const n = Math.floor(loopLen * sr);
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = n; i < d.length; i++) d[i - n] += d[i];
  }
  const out = new AudioBuffer({ length: n, numberOfChannels: buf.numberOfChannels, sampleRate: sr });
  for (let c = 0; c < buf.numberOfChannels; c++) out.copyToChannel(buf.getChannelData(c).subarray(0, n), c);
  return out;
}

function scaleTo(buf, peakMax) {
  let pk = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; } }
  if (pk > peakMax) { const g = peakMax / pk; for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; } }
  return pk;
}

/** Level a loop to a target RMS (dBFS), never past peakMax. The game's own tracks sit near -16 LUFS. */
function levelTo(buf, targetDb, peakMax) {
  let pk = 0, s = 0, n = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; s += d[i] * d[i]; n++; } }
  const rms = Math.sqrt(s / Math.max(1, n));
  if (!(rms > 0)) return 0;
  const g = Math.min(Math.pow(10, targetDb / 20) / rms, peakMax / pk);
  for (let c = 0; c < buf.numberOfChannels; c++) { const d = buf.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] *= g; }
  return 20 * Math.log10(rms * g);
}
// target loudness by kind of loop: calm places a little under today's tracks, a fight a little over
export const THEME_RMS_DB = { day: -19, night: -21, under: -21.5, combat: -17 };

/**
 * One theme loop. spec (synth_places.js): { seed, tonic, dayMode, nightMode, eighth, beats, nightTempo, under, outdoors }.
 * day: explore layer; night: the night layer (underground themes always use it); combat: the same tune with the
 * combat layer on top (the game's battle track for that place).
 */
export async function renderTheme(spec, variant = 'day', { sampleRate = 32000 } = {}) {
  if (!hasOffline()) return null;
  const t0 = nowMs();
  const night = variant === 'night' || (spec.under && variant !== 'combat');
  const arr = variant === 'combat' ? combatArrangement() : textureArrangement({ perc: !spec.under });
  const slow = night && !spec.under ? spec.nightTempo : 1;
  const barLen = (spec.eighth / slow) * spec.beats;
  const loopLen = arr.length * barLen;
  const ctx = new OfflineAudioContext(2, Math.ceil((loopLen + 4) * sampleRate), sampleRate);
  const S = createCore(ctx, { seed: spec.seed ^ (variant === 'night' ? 0x51 : variant === 'combat' ? 0xc0 : 0), reverbDecay: spec.under ? 3.6 : night ? 3.2 : 2.6 });
  const theme = { ...spec, nightTempo: spec.nightTempo || 0.8 };
  const seq = createSequencer(S, theme, { night: night && !spec.under, crickets: !!spec.outdoors });
  const mix = variant === 'combat'
    ? (spec.under ? { explore: 0, night: 1, combat: 1 } : { explore: 1, night: 0, combat: 1 })
    : night ? { explore: 0, night: 1, combat: 0 } : { explore: 1, night: 0, combat: 0 };
  seq.render(arr, 0.05, [{ bar: 0, mix }]);   // a hair after 0: humanised notes may land a few ms early
  const raw = await ctx.startRendering();
  const buffer = foldTail(raw, loopLen, sampleRate);
  const rmsDb = levelTo(buffer, THEME_RMS_DB[variant === 'combat' ? 'combat' : spec.under ? 'under' : night ? 'night' : 'day'], 0.89);
  return { buffer, loopEnd: buffer.duration, rmsDb, ms: Math.round(nowMs() - t0), stats: { notes: S.stats.notes, peakVoices: S.stats.peakVoices } };
}

/** 16-bit PCM WAV in a Blob URL. */
export function wavUrl(buf) {
  if (typeof Blob === 'undefined' || typeof URL === 'undefined' || !URL.createObjectURL) return null;
  const ch = buf.numberOfChannels, n = buf.length, sr = buf.sampleRate;
  const ab = new ArrayBuffer(44 + n * ch * 2);
  const v = new DataView(ab);
  const str = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  str(0, 'RIFF'); v.setUint32(4, 36 + n * ch * 2, true); str(8, 'WAVE'); str(12, 'fmt ');
  v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, ch, true); v.setUint32(24, sr, true);
  v.setUint32(28, sr * ch * 2, true); v.setUint16(32, ch * 2, true); v.setUint16(34, 16, true); str(36, 'data'); v.setUint32(40, n * ch * 2, true);
  const data = []; for (let c = 0; c < ch; c++) data.push(buf.getChannelData(c));
  let o = 44;
  for (let i = 0; i < n; i++) for (let c = 0; c < ch; c++) { const s = Math.max(-1, Math.min(1, data[c][i])); v.setInt16(o, s < 0 ? s * 32768 : s * 32767, true); o += 2; }
  return URL.createObjectURL(new Blob([ab], { type: 'audio/wav' }));
}

// ---------------------------------------------------------------- the sound bank

const SURFACES = ['grass', 'dirt', 'stone', 'wood', 'water'];
export const FAMILIES = ['boar', 'wolf', 'bird', 'insect', 'ooze', 'spirit', 'construct', 'humanoid', 'small'];
const MOODS = ['aggro', 'hurt', 'death', 'flee'];
const VOICE_BANDS = [0.12, 0.45, 0.8];

// name -> { variants, slot (seconds per variant), play(S, t, i) }
const RECIPES = {};
for (const s of SURFACES) RECIPES[`step:${s}`] = { variants: 4, slot: 0.45, play: (S, t) => SFX.footstep(S, t, { surface: s }) };
for (const f of FAMILIES) for (const m of MOODS) RECIPES[`voice:${f}:${m}`] = { variants: 2, slot: f === 'boar' && m === 'aggro' ? 1.9 : 1.6, play: (S, t) => VOICES.voiceOf(S, t, { family: f, mood: m }) };
for (const sh of BARK_SHAPES) VOICE_BANDS.forEach((v, k) => { RECIPES[`bark:${sh}:${k}`] = { variants: 2, slot: 0.9, play: (S, t, i) => VOICES.npcBark(S, t, { voice: v, shape: sh, seed: 9001 + k * 31 + i }) }; });
Object.assign(RECIPES, {
  door: { variants: 2, slot: 2.4, play: (S, t) => SFX.door(S, t) },
  chest: { variants: 1, slot: 2.6, play: (S, t) => SFX.chest(S, t) },
  locked: { variants: 2, slot: 0.8, play: (S, t) => VOICES.locked(S, t) },
  fizzle: { variants: 2, slot: 0.6, play: (S, t) => VOICES.fizzle(S, t) },
  whiff: { variants: 2, slot: 0.5, play: (S, t) => VOICES.whiff(S, t) },
  mobheal: { variants: 1, slot: 1.0, play: (S, t) => VOICES.mobHeal(S, t) },
  'chime:area': { variants: 3, slot: 2.2, play: (S, t, i) => VOICES.chime(S, t, { notes: [[74, 78, 81], [76, 79, 83], [71, 74, 78]][i] }) },
  'chime:rest': { variants: 1, slot: 2.4, play: (S, t) => VOICES.chime(S, t, { notes: [69, 74, 78, 81] }) },
});
// seamless loops: rendered a second long and folded back onto themselves
const LOOPS = {
  'loop:fire': { len: 6, play: (S, t, len) => SFX.fire(S, t, { dur: len + 1.2, loop: true }) },
  'loop:water': { len: 8, play: (S, t, len) => SFX.water(S, t, { dur: len + 1.2, size: 1.3, loop: true }) },
  'work:mine': { len: 2.4, play: (S, t, len) => VOICES.workLoop(S, t, { kind: 'mine', dur: len }) },
  'work:herb': { len: 2.4, play: (S, t, len) => VOICES.workLoop(S, t, { kind: 'herb', dur: len }) },
  'work:craft': { len: 2.4, play: (S, t, len) => VOICES.workLoop(S, t, { kind: 'craft', dur: len }) },
  'work:fish': { len: 3.2, play: (S, t, len) => VOICES.workLoop(S, t, { kind: 'fish', dur: len }) },
};
export const BANK_NAMES = [...Object.keys(RECIPES), ...Object.keys(LOOPS)];
export const BANK_LOOPS = new Set(Object.keys(LOOPS));
const BANK_GAIN = 1.6;   // the montage was levelled about +4 dB; this sits the bank beside the game's sound files

export function createBank({ sampleRate = 32000, seed = 2411 } = {}) {
  const bufs = new Map();
  const stats = { ms: 0, seconds: 0, rendered: 0, failed: 0 };
  const r = makeRng(seed);
  async function renderOne(name) {
    if (bufs.has(name)) return true;
    const L = LOOPS[name], R = RECIPES[name];
    if (!L && !R) return false;
    const t0 = nowMs();
    const lead = 0.12;   // breath onsets start a little before their beat
    try {
      if (L) {
        const ctx = new OfflineAudioContext(1, Math.ceil((L.len + 1.6) * sampleRate), sampleRate);
        const S = createCore(ctx, { seed: seed ^ name.length * 977, reverbDecay: 1.0 });
        S.music.gain.value = 0; S.sfx.send.value = 0.05;
        L.play(S, 0.02, L.len);
        const raw = await ctx.startRendering();
        const b = foldTail(raw, L.len, sampleRate);
        for (let i = 0; i < b.length; i++) b.getChannelData(0)[i] *= BANK_GAIN;
        scaleTo(b, 0.9);
        bufs.set(name, [b]);
        stats.seconds += L.len;
      } else {
        const n = R.variants, slot = R.slot;
        const ctx = new OfflineAudioContext(1, Math.ceil(n * slot * sampleRate), sampleRate);
        const S = createCore(ctx, { seed: (seed + Math.floor(r() * 1e6)) >>> 0, reverbDecay: 1.1 });
        S.music.gain.value = 0;
        for (let i = 0; i < n; i++) R.play(S, i * slot + lead, i);
        const raw = await ctx.startRendering();
        const d = raw.getChannelData(0), per = Math.floor(slot * sampleRate), skip = Math.floor(lead * 0.4 * sampleRate);
        const list = [];
        for (let i = 0; i < n; i++) {
          const b = new AudioBuffer({ length: per - skip, numberOfChannels: 1, sampleRate });
          const seg = d.slice(i * per + skip, (i + 1) * per);
          for (let k = 0; k < seg.length; k++) seg[k] *= BANK_GAIN;
          // fade the last 40 ms so a reverb tail cut at the slot end does not click
          const f = Math.floor(0.04 * sampleRate); for (let k = 0; k < f; k++) seg[seg.length - 1 - k] *= k / f;
          b.copyToChannel(seg, 0);
          scaleTo(b, 0.9);
          list.push(b);
        }
        bufs.set(name, list);
        stats.seconds += n * slot;
      }
      stats.rendered++;
      return true;
    } catch (e) { stats.failed++; return false; } finally { stats.ms += nowMs() - t0; }
  }
  return {
    stats,
    has: (name) => bufs.has(name),
    /** One variant (a different one each call, seeded). */
    get(name) { const l = bufs.get(name); return l ? l[Math.floor(r() * l.length)] : null; },
    /** Render names one after another (so it never takes more than one core), in the order given. */
    async render(names = BANK_NAMES, { gapMs = 0 } = {}) {
      if (!hasOffline()) return false;
      for (const n of names) {
        await renderOne(n);
        if (gapMs > 0) await new Promise((res) => setTimeout(res, gapMs));   // spread the one-time cost thin
      }
      return true;
    },
  };
}
