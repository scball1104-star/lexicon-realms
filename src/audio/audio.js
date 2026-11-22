// Lexicon Realms audio (CONTRACTS section 11): music by zone, SFX from sim events, UI sounds. Listens to the bus,
// never feeds anything back into the sim. The WebAudio engine is Lexicon Quest's (./engine.js, unchanged).
//
//   const audio = createAudio({ base: 'assets/audio/' })        // manifest at base + 'manifest.json'
//   audio.unlock()                      call from the first user gesture (the engine also listens for one itself);
//                                       music asked for before that starts on unlock, SFX before it are dropped
//   audio.setVolumes({ master, music, sfx })   linear 0..1
//   audio.music(id | null)              crossfade to a track id (manifest `music`); null fades out
//   audio.zone(zoneId)                  music for a zone (zone data `music`, through MUSIC_ALIAS)
//   audio.sfx(id, opts?)                one sound (manifest `sfx`)
//   audio.ui(kind)                      'open' | 'close' | 'cursor' | 'confirm' | 'cancel' | 'error' | 'buy' | 'coin' | 'equip' | 'sell'
//   audio.attach(bus, { playerId: () => id, cls: () => cls, zoneMusic: (zoneId) => musicId })
//                                       sim events -> sounds (sfx_table.js); the player's `zone` / `respawn` switch music
//   audio.debug()                       engine state (drivers, QA)
//
// Never throws: missing files, a locked context or no WebAudio (node) all make the calls silent no-ops.
import { createAudio as createEngine } from './engine.js';
import { soundsFor, JINGLE_RANK, UI_SOUNDS, MUSIC_ALIAS } from './sfx_table.js';

const KEY_GAP_MS = 1200;          // keyed sounds (fail buzzers) at most this often

export function createAudio(opts = {}) {
  const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
  const noop = () => {};
  if (!hasWindow) {
    return { unlock: () => Promise.resolve(false), setVolumes: noop, music: noop, zone: noop, ambience: noop, sfx: noop, ui: noop,
      attach: () => noop, debug: () => ({ available: false }), ready: Promise.resolve(null) };
  }
  let base = opts.base == null ? 'assets/audio/' : String(opts.base);
  if (base && !base.endsWith('/')) base += '/';
  let eng = null;
  try { eng = createEngine({ basePath: base, manifestUrl: 'manifest.json', ...(opts.engine || {}) }); } catch (e) { console.warn('[audio] engine failed:', e); }
  const safe = (fn) => (...a) => { try { return eng ? fn(...a) : undefined; } catch (e) { console.warn('[audio]', e); return undefined; } };
  const ready = eng ? Promise.resolve(eng.init(opts.manifest || undefined)).catch((e) => { console.warn('[audio] init:', e); return null; }) : Promise.resolve(null);

  // area -> ambience bed (Lexicon Quest's ambience loops, copied into assets/audio/ambience); one world: keyed by area
  const ZONE_AMBIENCE = { willowmere: 'river_birds', valley: 'river_birds', downs: 'wind_valley', moor: 'moor_wind' };
  const zoneTrack = (zoneId, map) => { const m = map ? map(zoneId) : zoneId; return MUSIC_ALIAS[m] || m || null; };
  const lastKey = new Map();
  let pendingJingle = null;

  const api = {
    ready,
    unlock: safe(() => eng.unlock()),
    setVolumes: safe((v = {}) => eng.setVolumes({ master: v.master, music: v.music, sfx: v.sfx, ambience: v.ambience ?? v.sfx })),
    // after the manifest is in (a track asked for at boot would otherwise resolve against an empty manifest)
    music: (id, o) => { ready.then(safe(() => { if (!id) eng.stopMusic(0.8); else eng.music(MUSIC_ALIAS[id] || id, { fade: 1.0, ...(o || {}) }); })); },
    zone: (zoneId, map) => { api.music(zoneTrack(zoneId, map)); api.ambience(ZONE_AMBIENCE[zoneId] || null); },
    /** A looping bed under the music (fix wave 2026-11-19, CRITIQUE_1 item 25: no zone had any). null stops it. */
    ambience: (id) => { ready.then(safe(() => eng.ambience(id || null, { fade: 1.5 }))); },
    sfx: safe((id, o) => eng.sfx(id, o)),
    ui: (kind) => { const id = UI_SOUNDS[kind]; if (id) api.sfx(id, { volume: 0.8 }); },
    jingle: safe((id) => eng.jingle(id, { duckMusic: 0.3 })),
    debug: () => (eng ? eng.debugState() : { available: false }),
    // followPlace: the game picks music by the area you stand in (one world, src/main.js), so zone / respawn events
    // do not switch it here
    attach(bus, { playerId = () => null, cls = () => null, zoneMusic = null, followPlace = false } = {}) {
      return bus.on('*', (ev) => {
        try {
          const me = playerId();
          if (me == null) return;
          if (!followPlace && ((ev.type === 'zone' && ev.id === me) || (ev.type === 'respawn' && ev.id === me && ev.zone))) api.zone(ev.to || ev.zone, zoneMusic);
          for (const s of soundsFor(ev, { me, cls: cls() })) {
            if (s.kind === 'jingle') {
              // one jingle per tick: the bus publishes a whole tick synchronously, so a microtask sees all of it
              if (!pendingJingle) { pendingJingle = s.id; queueMicrotask(() => { const j = pendingJingle; pendingJingle = null; api.jingle(j); }); }
              else if ((JINGLE_RANK[s.id] || 0) > (JINGLE_RANK[pendingJingle] || 0)) pendingJingle = s.id;
              continue;
            }
            if (s.key) {
              const t = performance.now();
              if (t - (lastKey.get(s.key) || -1e9) < KEY_GAP_MS) continue;
              lastKey.set(s.key, t);
            }
            api.sfx(s.id, s.volume != null ? { volume: s.volume } : undefined);
          }
        } catch (e) { console.warn('[audio] event', e); }
      });
    },
  };
  return api;
}
