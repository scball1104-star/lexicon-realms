// Replay files (wave 8, replay lane; D:/LQOnline/wave8/replay/BRIEF.md). Pure helpers, no DOM (node tests run them).
//
// A recording is the world's own replay log (CONTRACTS 2.3) for one fight: the full state at the pull (world.serialize())
// plus every system action and command after it, in the order the client made them. The sim is deterministic at 20 Hz,
// so the real sim rebuilds the fight tick for tick. A small check every 5 s (a hash of the heroes and the boss) tells a
// good copy from a game that changed since.
//
//   file = { v, kind, build, stateV, meta, startTick, len, start, ops, check: { every, h: [hash...] } }       a live replay
//   file = { v, kind, build, stateV, meta, startTick, len, baked: { every, frames: [frame...] } }               "Keep forever"
//   ops: [tick, 'c', id, cmd] a command, [tick, 'j', spec] addPlayer, [tick, 'l', id] removePlayer,
//        [tick, 'p', id, party] setParty, [tick, 'd', day] setDay, [tick, 's', shared] setShared.
//        `tick` is world.tick when the call was made: it applies before the step that makes tick + 1.
//   meta: { id, when (ms), kind 'boss' | 'rare' | 'fight', title, place, hero: { id, name, cls, level }, heroes, result
//          'kill' | 'wipe' | 'fight', secs, killAt (s or null), friend }
import { hashString } from '../sim/hash.js';

export const REPLAY_V = 1;
export const KIND = 'lexicon-realms-replay';
export const HZ = 20;
export const CHECK_EVERY = 100;          // a check every 5 s
export const TAIL_TICKS = 100;           // a recording runs on 5 s after the kill or the wipe
export const MAX_TICKS = 20 * 60 * 15;   // never longer than 15 minutes
export const EXT = '.lrreplay';

/** The check at one moment: the heroes and the recording's boss, their full sim state (cooldowns and charges too). */
export function checkHash(state, bossId) {
  const ents = state.ents.filter((e) => e.kind === 'player' || e.id === bossId);
  return hashString(JSON.stringify([state.tick, ents]));
}

export const mmss = (ticks) => { const s = Math.max(0, Math.round(ticks / HZ)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };

/** Size in words a player reads: "940 B", "61 KB", "1.2 MB". */
export function sizeText(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${Math.round(n / 1024)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}

/** Is this object a replay file this build can read? Returns null when fine, else the reason in plain words. */
export function badFile(f) {
  if (!f || typeof f !== 'object' || f.kind !== KIND) return 'That is not a replay file.';
  if (f.v !== REPLAY_V) return 'That replay was made by a different version of the game.';
  if (!f.meta || !Number.isFinite(f.len) || f.len <= 0) return 'That replay file is damaged.';
  if (f.baked) { if (!Array.isArray(f.baked.frames) || f.baked.frames.length < f.len) return 'That replay file is damaged.'; return null; }
  if (typeof f.start !== 'string' || !Array.isArray(f.ops) || !f.check || !Array.isArray(f.check.h)) return 'That replay file is damaged.';
  return null;
}

// ---- gzip with the browser's own CompressionStream (no package); node 18+ has it too
async function pipe(bytes, stream) {
  const out = await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer();
  return new Uint8Array(out);
}
/** A replay file -> gzipped bytes. */
export async function pack(file) {
  const raw = new TextEncoder().encode(JSON.stringify(file));
  if (typeof CompressionStream === 'undefined') return raw;
  return pipe(raw, new CompressionStream('gzip'));
}
/** Gzipped (or plain JSON) bytes -> the replay file object, or throws. */
export async function unpack(bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  const gz = b.length > 2 && b[0] === 0x1f && b[1] === 0x8b;
  const raw = gz ? await pipe(b, new DecompressionStream('gzip')) : b;
  return JSON.parse(new TextDecoder().decode(raw));
}
