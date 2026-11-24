// Quest scenes (wave 6, PLAN item 9, approved by Scott 2026-11-24): the voice murmur under a talk and the two flourish
// sounds, played from the synth's sound bank (src/audio/synth/murmur.js recipes, synth_game.js play). Browser side only
// does buffer playback; the timing comes from the same pace() the letters use (src/ui/talk_pace.js).
//
//   const tv = createTalkVoice(syn)          syn: synth_game.js (null: every call is a no-op)
//   tv.say({ npc, text })                    start the murmur for this text now (any murmur already going stops)
//   tv.stop()                                stop it (the text was shown in full, or the talk ended)
//   tv.flourish('accept' | 'turnin')
//   tv.frame(nowMs)                          starts each phrase on time
//   voiceOf(npc) -> { band, rate }           one voice per npc, seeded from its id (pure)
//
// Quiet on purpose, one voice per npc, and silent whenever Synth sound is off (syn.play refuses then).
import { pace, phrases } from '../ui/talk_pace.js';
import { MURMUR_LENS, murmurName } from './synth/murmur.js';
import { makeRng, seedFromText } from './synth/rng.js';

const LEVEL = 0.32;           // the murmur sits under everything else
const FLOURISH_LEVEL = 0.55;

export function voiceOf(npc) {
  const r = makeRng(seedFromText(String(npc || 'someone')));
  const v = r();
  return { band: v < 0.5 ? 0 : 1, rate: 0.9 + r() * 0.22 };
}

/** The phrases of a text as [{ at (s from the start), dur, mark, len (bank length index) }]. Pure. */
export function murmurPlan(text) {
  const P = pace(text);
  return phrases(text).map((ph) => {
    const at = P.time(ph.start), dur = Math.max(0.3, P.time(ph.end - 1) - at + 0.06);
    let len = 0;
    for (let i = 0; i < MURMUR_LENS.length; i++) if (MURMUR_LENS[i] <= dur + 0.2) len = i;
    return { at, dur, mark: ph.mark === '?' ? '?' : '.', len };
  });
}

export function createTalkVoice(syn) {
  let cur = null;               // { plan, t0, i, voice, live: [{ h, end }] }
  const now = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());
  function fade(h, delay = 0) {
    if (!h || !h.gain) return;
    try {
      const c = h.gain.context, t = c.currentTime + Math.max(0, delay);
      h.gain.gain.cancelScheduledValues(t); h.gain.gain.setValueAtTime(h.gain.gain.value, t); h.gain.gain.linearRampToValueAtTime(0, t + 0.08);
      h.src.stop(t + 0.1);
    } catch { /* never break the game for a sound */ }
  }
  function stop() { if (cur) for (const l of cur.live) fade(l.h); cur = null; }
  return {
    say({ npc, text } = {}) {
      stop();
      if (!syn || !syn.enabled || !text) return;
      cur = { plan: murmurPlan(text), t0: now(), i: 0, voice: voiceOf(npc), live: [] };
    },
    stop,
    flourish(kind) {
      if (!syn || !syn.enabled) return;
      try { syn.play(`flourish:${kind === 'turnin' ? 'turnin' : 'accept'}`, { vol: FLOURISH_LEVEL }); } catch { /* */ }
    },
    frame(tMs = now()) {
      if (!cur) return;
      if (!syn || !syn.enabled) { stop(); return; }
      const s = (tMs - cur.t0) / 1000;
      while (cur.i < cur.plan.length && cur.plan[cur.i].at <= s) {
        const p = cur.plan[cur.i++];
        if (s - p.at > 0.25) continue;            // a frame hitch: skip a late phrase rather than pile them up
        // one bank piece per phrase, the longest that fits; a phrase longer than the longest piece goes on with another
        const piece = MURMUR_LENS[p.len] / cur.voice.rate;   // seconds the piece lasts at this voice's rate
        const more = p.dur - piece > 0.4;
        const h = syn.play(murmurName(cur.voice.band, p.len, more ? '.' : p.mark), { vol: LEVEL, rate: cur.voice.rate });
        if (!h) continue;
        cur.live.push({ h, end: tMs + Math.min(piece, p.dur) * 1000 });
        if (piece > p.dur + 0.05) fade(h, p.dur);           // the piece runs past the phrase: fade out at its end
        if (more) cur.plan.splice(cur.i, 0, { at: p.at + piece, dur: p.dur - piece, mark: p.mark, len: lenFor(p.dur - piece) });
      }
      cur.live = cur.live.filter((l) => l.end > tMs - 500);
      if (cur.i >= cur.plan.length && !cur.live.length) cur = null;
    },
    get busy() { return !!cur; },
  };
}

function lenFor(dur) {
  let len = 0;
  for (let i = 0; i < MURMUR_LENS.length; i++) if (MURMUR_LENS[i] <= dur + 0.2) len = i;
  return len;
}
