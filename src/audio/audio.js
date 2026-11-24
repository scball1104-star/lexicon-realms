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
//   audio.ui(kind)                      'open' | 'close' | 'click' | 'tab' | 'cursor' | 'confirm' | 'cancel' | 'error' | 'buy' | 'coin' | 'equip' | 'sell'
//   audio.attach(bus, { playerId: () => id, cls: () => cls, zoneMusic: (zoneId) => musicId })
//                                       sim events -> sounds (sfx_table.js); the player's `zone` / `respawn` switch music
//   audio.frame(nowMs, { me, snap, place, zone, fresh })
//                                       wave 5, once per drawn frame: the place's music (beds.js musicFor, a start realm's
//                                       own track) and ambience bed (bedFor: every realm, road, dungeon), the battle track
//                                       (combat_music.js), and where friends stand (their sounds fall off with distance)
//   audio.debug()                       engine state (drivers, QA) plus { battle, field, bed }
//
// Never throws: missing files, a locked context (autoplay blocked), muted or zero volumes, or no WebAudio (node) all
// make the calls silent no-ops.
import { createAudio as createEngine } from './engine.js';
import { soundsFor, JINGLE_RANK, UI_SOUNDS, UI_VOLUME, MUSIC_ALIAS, FRIEND, friendGain, friendPan } from './sfx_table.js';
import { musicFor, bedFor, placeKey, ZONE_BEDS } from './beds.js';
import { createCombatMusic } from './combat_music.js';
import { createSynthGame } from './synth_game.js';
import { synthPlaceFor } from './synth_places.js';
import { createTalkVoice } from './talk_voice.js';   // wave 6 quest scenes: the voice murmur and the flourish sounds

const KEY_GAP_MS = 1200;          // keyed sounds (fail buzzers) at most this often, unless the sound names its own gap
const BATTLE = 'battle';
const BATTLE_IN_S = 1.5, BATTLE_OUT_S = 2.5;
const ROAD_MS = 8000;             // a synth road theme only after this long on a road (no flapping at region edges)

// the four world regions' beds, kept under this name for older readers (the look-dev audio inventory)
export const ZONE_AMBIENCE = Object.fromEntries(['willowmere', 'valley', 'downs', 'moor'].map((k) => [k, ZONE_BEDS[k].id]));

export function createAudio(opts = {}) {
  const hasWindow = typeof window !== 'undefined' && typeof document !== 'undefined';
  const noop = () => {};
  if (!hasWindow) {
    return { unlock: () => Promise.resolve(false), setVolumes: noop, music: noop, zone: noop, ambience: noop, sfx: noop, ui: noop, jingle: noop,
      frame: noop, setSynth: noop, talk: noop, attach: () => noop, debug: () => ({ available: false }), ready: Promise.resolve(null) };
  }
  let base = opts.base == null ? 'assets/audio/' : String(opts.base);
  if (base && !base.endsWith('/')) base += '/';
  let eng = null;
  try { eng = createEngine({ basePath: base, manifestUrl: 'manifest.json', ...(opts.engine || {}) }); } catch (e) { console.warn('[audio] engine failed:', e); }
  const safe = (fn) => (...a) => { try { return eng ? fn(...a) : undefined; } catch (e) { console.warn('[audio]', e); return undefined; } };
  const ready = eng ? Promise.resolve(eng.init(opts.manifest || undefined)).catch((e) => { console.warn('[audio] init:', e); return null; }) : Promise.resolve(null);

  const zoneTrack = (zoneId, map) => { const m = map ? map(zoneId) : zoneId; return MUSIC_ALIAS[m] || m || null; };
  const lastKey = new Map();
  let pendingJingle = null;
  // music: the field track the place asks for, and the battle track on top of it
  const cm = createCombatMusic();
  let field = null, battleOver = null, bedKey = null, placeK = null;
  // the latest snapshot's heroes: who is a friend and where they stand (their sounds fall off with distance)
  let meNow = null;
  const ents = new Map();
  // wave 5b: the synth beside the LQ engine (synth_game.js): themes for places with no track of their own, live sounds
  const syn = eng ? createSynthGame({ engine: eng, onTrackReady: () => { synthPick = true; } }) : null;
  let synthPick = false, synthField = false, roadSince = null, family = null;
  const talkVoice = createTalkVoice(syn);   // wave 6 quest scenes: audio.talk({ say: { npc, text } } | { stop } | { flourish })
  const nowMs = () => (typeof performance !== 'undefined' ? performance.now() : Date.now());

  function playField(id, fade = 1.0) {
    field = id || null;
    if (cm.state === 'battle' || cm.state === 'holding') return;          // the battle track keeps playing; this is for after
    ready.then(safe(() => { if (!field) eng.stopMusic(0.8); else eng.music(field, { fade }); }));
  }
  function battle(action) {
    if (action === 'start') {
      battleOver = field;
      // a synth place fights to its own theme's combat layer once that loop is rendered, else the shipped battle track
      const own = field && field.startsWith('synth:') ? field.replace(/:(day|night)$/, ':combat') : null;
      const track = own && syn && syn.hasTrack(own) ? own : BATTLE;
      ready.then(safe(() => eng.pushMusic(track, { fade: BATTLE_IN_S, fadeIn: BATTLE_IN_S })));
    } else if (action === 'stop') {
      const back = field, was = battleOver;
      battleOver = null;
      ready.then(safe(() => {
        eng.popMusic(BATTLE_OUT_S);
        // the place changed during the fight, or nothing was under the battle track (it started before unlock)
        if (back && (back !== was || !eng.currentMusic())) eng.music(back, { fade: BATTLE_OUT_S });
        else if (!back) eng.stopMusic(BATTLE_OUT_S);
      }));
    }
  }
  function setBed(b) {
    const k = b ? `${b.id}@${b.volume}` : '';
    if (k === bedKey) return;
    const sameFile = !!(bedKey && b && bedKey.split('@')[0] === b.id);
    bedKey = k;
    ready.then(safe(() => {
      if (sameFile) eng.ambience(null, { fade: 1.5 });                    // same loop at a new level: fade one out, one in
      eng.ambience(b ? b.id : null, { fade: 2.0, volume: b ? b.volume : 1 });
    }));
  }

  const api = {
    ready,
    unlock: safe(() => eng.unlock()),
    setVolumes: safe((v = {}) => { eng.setVolumes({ master: v.master, music: v.music, sfx: v.sfx, ambience: v.ambience ?? v.sfx }); if (syn) syn.setVolumes(v); }),
    /** The Settings switch: false falls back to today's sounds and tracks everywhere. */
    setSynth: (on) => { try { if (syn) { syn.setEnabled(on); synthPick = true; } } catch (e) { console.warn('[audio] synth', e); } },
    // after the manifest is in (a track asked for at boot would otherwise resolve against an empty manifest)
    music: (id, o) => {
      const t = id ? MUSIC_ALIAS[id] || id : null;
      if (t === 'title' || !t) { battle(cm.reset()); placeK = null; }     // quit to the title: no battle track under it
      playField(t, o && o.fade != null ? o.fade : 1.0);
    },
    zone: (zoneId, map, realmZone) => {
      api.music(musicFor({ zoneId: realmZone || zoneId, track: zoneTrack(zoneId, map) }));
      setBed(bedFor({ zoneId: realmZone || zoneId, region: zoneId }));
    },
    /** A looping bed under the music (fix wave 2026-11-19, CRITIQUE_1 item 25: no zone had any). null stops it. */
    ambience: (id) => { bedKey = id ? `${id}@1` : ''; ready.then(safe(() => eng.ambience(id || null, { fade: 1.5 }))); },
    sfx: safe((id, o) => eng.sfx(id, o)),
    ui: (kind) => { const id = UI_SOUNDS[kind]; if (id) api.sfx(id, { volume: UI_VOLUME[kind] ?? 0.8 }); },
    /** Quest scenes (talk_voice.js): { say: { npc, text } } starts the murmur, { stop: true } ends it, { flourish: kind }. */
    talk: (m = {}) => { try { if (m.say) talkVoice.say(m.say); else if (m.stop) talkVoice.stop(); else if (m.flourish) talkVoice.flourish(m.flourish, m); } catch (e) { console.warn('[audio] talk', e); } },
    jingle: safe((id, o = {}) => eng.jingle(id, { duckMusic: o.duck ?? 0.3, volume: o.volume ?? 1 })),
    debug: () => ({ ...(eng ? eng.debugState() : { available: false }), battle: cm.state, field, bed: bedKey, synth: syn ? syn.debug() : null }),

    /** Once per drawn frame (main.js render): place music and bed, the battle track, friends' positions. */
    frame(t, { me = null, snap = null, place = null, zone = null, fresh = false } = {}) {
      try {
        meNow = me;
        ents.clear();
        if (snap && snap.entities) for (const e of snap.entities) if (e.kind === 'player') ents.set(e.id, e);
        if (syn) syn.frame(t == null ? nowMs() : t, { me, snap, zone });
        talkVoice.frame(t == null ? nowMs() : t);   // wave 6 quest scenes: the murmur's phrases on time
        if (!me) return;
        if (place && zone) {
          const k = placeKey(fresh ? null : placeK, { zoneId: me.zone, region: place.region });
          // a synth theme for a place with no track of its own (synth_places.js); while it renders, today's track plays
          const tNow = t == null ? nowMs() : t;
          if (me.zone === 'world' && !place.region) { if (roadSince == null) roadSince = tNow; } else roadSince = null;
          const spec = syn && syn.enabled ? synthPlaceFor({ zoneId: me.zone, zoneKind: zone.kind, zoneName: zone.name, region: place.region, onRoad: roadSince != null && tNow - roadSince > ROAD_MS }) : null;
          const sid = spec ? syn.theme(spec, snap && snap.night ? 'night' : 'day') : null;
          if (sid) {
            placeK = k; synthField = true;
            if (field !== sid) playField(sid, 2.0);
            syn.theme(spec, 'combat');                                  // its combat layer, ready for the first fight
          } else if (synthField || synthPick) {
            synthField = false; synthPick = false;
            placeK = k;
            const track = place.region ? place.music : zone.music;
            const want = musicFor({ zoneId: me.zone, track: MUSIC_ALIAS[track] || track });
            if (field !== want && !(spec && field)) playField(want, 2.0);    // keep what plays while a synth loop renders
          } else if (k !== placeK) {
            placeK = k;
            const track = place.region ? place.music : zone.music;
            playField(musicFor({ zoneId: me.zone, track: MUSIC_ALIAS[track] || track }));
          }
          setBed(bedFor({ zoneId: me.zone, zoneKind: zone.kind, region: place.region, night: !!(snap && snap.night) }));
        }
        battle(cm.update(!!me.inCombat && !me.dead, t == null ? nowMs() : t));
      } catch (e) { console.warn('[audio] frame', e); }
    },

    // followPlace: the game picks music by the area you stand in (one world, src/main.js), so zone / respawn events
    // do not switch it here
    attach(bus, { playerId = () => null, cls = () => null, zoneMusic = null, followPlace = false, mobFamily = null } = {}) {
      family = mobFamily;
      const isPlayer = (id) => ents.has(id);
      const clsOf = (id) => { const e = ents.get(id); return e ? e.cls : null; };
      return bus.on('*', (ev) => {
        try {
          const me = playerId();
          if (me == null) return;
          if (!followPlace && ((ev.type === 'zone' && ev.id === me) || (ev.type === 'respawn' && ev.id === me && ev.zone))) api.zone(ev.to || ev.zone, zoneMusic);
          const t = nowMs();
          const myZone = meNow ? meNow.zone : null;
          // the battle track: real fights only (combat_music.js)
          if (ev.type === 'damage' && (ev.src === me || ev.dst === me) && !ev.periodic && ev.amount > 0) cm.hit(t);
          if (ev.type === 'boss' && ev.kind === 'pull' && (!myZone || ev.zone === myZone)) cm.boss(t);
          // the synth's sounds first: a door's rattle or a chest can stand in for the table's sound (replace)
          const replaced = syn ? syn.event(ev, { me, isPlayer: ents.size ? isPlayer : null, family }) : false;
          if (replaced) return;
          for (const s of soundsFor(ev, { me, cls: cls(), zone: myZone, isPlayer: ents.size ? isPlayer : null, clsOf })) {
            let vol = s.volume != null ? s.volume : 1, pan = 0;
            if (s.from != null) {
              const f = ents.get(s.from);
              if (!f || !meNow) continue;
              const g = friendGain(f.x - meNow.x, f.y - meNow.y, f.zone === meNow.zone);
              if (g <= 0) continue;
              vol *= FRIEND.volume * g;
              pan = friendPan(f.x - meNow.x);
            }
            if (s.kind === 'jingle') {
              if (s.from != null) { api.jingle(s.id, { volume: vol, duck: 0.7 }); continue; }   // a friend's level: softer, barely ducks
              // one jingle per tick: the bus publishes a whole tick synchronously, so a microtask sees all of it
              if (!pendingJingle) { pendingJingle = s.id; queueMicrotask(() => { const j = pendingJingle; pendingJingle = null; api.jingle(j); }); }
              else if ((JINGLE_RANK[s.id] || 0) > (JINGLE_RANK[pendingJingle] || 0)) pendingJingle = s.id;
              continue;
            }
            if (s.key) {
              if (t - (lastKey.get(s.key) || -1e9) < (s.gap || KEY_GAP_MS)) continue;
              lastKey.set(s.key, t);
            }
            api.sfx(s.id, pan ? { volume: vol, pan } : (s.volume != null || s.from != null ? { volume: vol } : undefined));
          }
        } catch (e) { console.warn('[audio] event', e); }
      });
    },
  };
  return api;
}
