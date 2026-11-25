// Photo mode rig (wave 8 photo lane, approved by Scott 2026-11-24: D:/LQOnline/wave8/photo/BRIEF.md). Pure: no DOM, no
// clock, no rng, so node can test it. The controls are photo_ui.js; the renderer reads view.photo (renderer3d.js).
//
// Photo mode is RENDER-ONLY. It writes three things on this client's own `view` and nothing else:
//   view.tod      the time of day this client draws (daycycle.js already treats it as a local override)
//   view.weather  the weather this client draws (sky_rig.js weatherState; null = the world's own, showers and all)
//   view.photo    { dx, dz, clean }: the free camera's step away from the hero (m) and "no labels, no rings"
// The sim, the day clock, the save and co-op never see any of them: a friend's game keeps its own sky and time.
// While it is open main.js passes the sim no command from the keys, mouse or stick but `stop` (the hero stands still);
// a pose is an ordinary emote command, so friends DO see it.
//
//   photoGate(player, ctx)     -> { ok } | { ok: false, say, why }   may photo mode open now?
//   stillGate(player, ctx)     -> null | why                         should an open photo mode close itself now?
//   timeLabel(f) / clockText(f)                                      the slider's name and clock for a day fraction
//   leash(dx, dz, max)         -> [dx, dz] clamped to a circle of `max` m round the hero
//   panStep(dx, dy, yawDeg, m) -> [wx, wz]  a held key turned by the camera yaw, in metres on the ground
//   heldPan(held, yawDeg, dt)  -> [wx, wz]  the held W A S D (or arrows) for one frame at PAN_MPS
//   dragPan(ddx, ddy, yawDeg, dist, hudH) -> [wx, wz]  one finger dragged on the phone (the ground follows the finger)
//   postcardLayout(w, h)       -> { mat, line, plaque: { s, x, y }, stamp: { x, y, s } }   in output px
//   postcardFile(place, date)  -> 'lexicon-realms-<place>-<yyyy-mm-dd>-<hhmm>.png'
//   caption(place) / subLine(f, weatherId)                           the plaque's two lines
//   SAY, CAPTION, TIME_NAMES, WEATHERS, POSES                        every player-facing word (DRAFTS: Scott has not written them)

export const LEASH_M = 30;            // the free camera may wander this far from the hero (scenery stays built round the focus)
export const LEASH_PLACE_M = 8;       // inside a dungeon or cave: the fixed camera, a short step only
export const PAN_MPS = 6;             // held keys move the camera this many metres a second

// The time slider's marks: a day fraction 0..1 (daycycle.js: 0 midnight, 0.5 noon).
export const TIME_MARKS = [0.255, 0.5, 0.72, 0.775, 0.95];

// Weather chips: null = the world's own (Live). The rest are sky_rig.js kinds.
export const WEATHERS = [
  { id: null, label: 'Live' }, { id: 'clear', label: 'Clear' }, { id: 'cloudy', label: 'Cloudy' },
  { id: 'rain', label: 'Rain' }, { id: 'storm', label: 'Storm' }, { id: 'mist', label: 'Mist' },
];

// Poses: the wave 7 emotes, sent as the ordinary sim command (friends DO see a pose: it is the hero, not the camera)
export const POSES = [
  { id: 'wave', label: 'Wave', cmd: { t: 'emote', id: 'wave' } },
  { id: 'cheer', label: 'Cheer', cmd: { t: 'emote', id: 'cheer' } },
  { id: 'dance', label: 'Dance', cmd: { t: 'emote', id: 'dance' } },
  { id: 'sit', label: 'Sit', cmd: { t: 'sit' } },
];

// ---- DRAFT player-facing words (none written by Scott). One place, so the report can list them and Scott can edit them.
export const SAY = {
  combat: 'Not in combat. Photo mode opens when the fight is over.',
  dead: 'Not while you are down.',
  flying: 'Not while flying.',
  loading: 'Wait for the world to load.',
  closedCombat: 'Photo mode closed: you are in combat.',
  closedDead: 'Photo mode closed: you are down.',
  saved: 'Postcard saved.',
  shared: 'Postcard shared.',
  only3d: 'Photo mode needs the 3D view (Settings: Graphics).',
};
export const WORDS = {
  title: 'Photo mode',
  only: 'Only you see the time and weather you pick.',
  under: 'No sky down here: only the camera moves.',
  deskHint: 'Right-drag: turn   Wheel: zoom   W A S D: move the camera',
  phoneHint: 'Two fingers: turn and zoom. One finger: move.',
  hiddenHint: 'H: show the controls',
  time: 'Time', weather: 'Weather', pose: 'Pose', sky: 'Sky', live: 'Live',
  hide: 'Hide', save: 'Save', done: 'Done', show: 'Show', share: 'Share', back: 'Back',
  deskHide: 'Hide (H)', deskSave: 'Save (Enter)', deskDone: 'Done (Esc)',
  ready: 'Your postcard is ready.',
  stamp1: 'LEXICON', stamp2: 'REALMS',
  ring: 'Photo',                                   // the sixth button on the phone's emote ring
};
export const CAPTION = (place) => (place ? `Greetings from ${place}` : 'Lexicon Realms');
export const TIME_NAMES = ['Night', 'Dawn', 'Morning', 'Noon', 'Afternoon', 'Golden hour', 'Dusk'];

/** May photo mode open now? ctx: { is3d, flying, ready }. Out of combat only (Scott 2026-11-24). */
export function photoGate(player, ctx = {}) {
  if (!ctx.is3d) return { ok: false, why: 'only3d', say: SAY.only3d };
  if (!player || ctx.ready === false) return { ok: false, why: 'loading', say: SAY.loading };
  if (player.dead) return { ok: false, why: 'dead', say: SAY.dead };
  if (player.inCombat) return { ok: false, why: 'combat', say: SAY.combat };
  if (ctx.flying) return { ok: false, why: 'flying', say: SAY.flying };
  return { ok: true };
}

/** An open photo mode closes itself when the hero is pulled into a fight, dies, flies or changes zone (null: stay open). */
export function stillGate(player, ctx = {}) {
  if (!player) return 'gone';
  if (player.dead) return 'dead';
  if (player.inCombat) return 'combat';
  if (ctx.flying) return 'flying';
  if (ctx.zone != null && ctx.zone0 != null && ctx.zone !== ctx.zone0) return 'zone';
  return null;
}
/** The line an automatic close says in the chat (null: nothing to say). */
export const closeLine = (why) => (why === 'combat' ? SAY.closedCombat : why === 'dead' ? SAY.closedDead : null);

const wrap = (f) => (f >= 0 && f < 1 ? f : ((f % 1) + 1) % 1);
export function timeLabel(f) {
  f = wrap(f);
  if (f < 0.215 || f >= 0.83) return 'Night';
  if (f < 0.3) return 'Dawn';
  if (f < 0.42) return 'Morning';
  if (f < 0.6) return 'Noon';
  if (f < 0.68) return 'Afternoon';
  if (f < 0.755) return 'Golden hour';
  return 'Dusk';
}
export function clockText(f) {
  const m = Math.floor(wrap(f) * 24 * 60);
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
}
/** The plaque's second line: the time name, and the weather when one was picked ("Night, storm"). */
export function subLine(f, weatherId) {
  const w = WEATHERS.find((x) => x.id === weatherId);
  return `${timeLabel(f)}${w && w.id ? `, ${w.label.toLowerCase()}` : ''}`;
}
export const caption = (place) => CAPTION(place);

export function leash(dx, dz, max = LEASH_M) {
  const d = Math.hypot(dx, dz);
  if (d <= max || d === 0) return [dx, dz];
  return [(dx / d) * max, (dz / d) * max];
}

/** A direction (dx, dy: screen right, screen down) turned by the horizon camera's yaw (0 looks north), in metres.
 *  The same turn as horizon_input.js camRelMove, without the snap to 8 ways. */
export function panStep(dx, dy, yawDeg, metres) {
  if (!dx && !dy) return [0, 0];
  const l = Math.hypot(dx, dy), y = (yawDeg * Math.PI) / 180, c = Math.cos(y), s = Math.sin(y);
  const ux = dx / l, uy = dy / l;
  return [(ux * c - uy * s) * metres, (ux * s + uy * c) * metres];
}

const HELD = { KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1], KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0] };
export const PAN_KEYS = Object.keys(HELD);
/** The held keys (a Set or array of codes) for one frame of dt seconds. */
export function heldPan(held, yawDeg, dt) {
  let dx = 0, dy = 0;
  for (const c of held) if (HELD[c]) { dx += HELD[c][0]; dy += HELD[c][1]; }
  dx = Math.sign(dx); dy = Math.sign(dy);
  return panStep(dx, dy, yawDeg, PAN_MPS * Math.max(0, Math.min(0.1, dt)));
}
/** One finger dragged (ddx, ddy) HUD px on the phone: the ground follows the finger, scaled by the camera distance. */
export function dragPan(ddx, ddy, yawDeg, dist, hudH) {
  const m = Math.hypot(ddx, ddy) * (Math.max(4, dist || 10) * 1.6) / Math.max(120, hudH || 360);
  return panStep(-ddx, -ddy, yawDeg, m);
}

/** Where the frame, the plaque and the stamp go on a w x h postcard (output px). s: the pixel art's whole-number scale. */
export function postcardLayout(w, h) {
  const s = Math.max(2, Math.floor(Math.min(w / 640, h / 360) * 1.3));
  const mat = Math.max(8, Math.round(Math.min(w, h) * 0.032));
  return {
    s, mat, line: Math.max(1, Math.round(s / 2)),
    plaque: { s, x: mat + 3 * s, y: h - mat - 3 * s },     // bottom-left corner of the plaque (it grows up and right)
    stamp: { s, x: w - mat - 3 * s, y: mat + 3 * s },       // top-right corner of the stamp
  };
}

export function postcardFile(place, date) {
  const slug = String(place || 'realms').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'realms';
  const d = date instanceof Date ? date : new Date(date || 0);
  const p2 = (n) => String(n).padStart(2, '0');
  return `lexicon-realms-${slug}-${d.getFullYear()}-${p2(d.getMonth() + 1)}-${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.png`;
}

/** The stamp's date line, from the player's own clock ("NOV 24, 2026"). */
export function stampDate(date) {
  const M = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC'];
  const d = date instanceof Date ? date : new Date(date || 0);
  return `${M[d.getMonth()]} ${d.getDate()}, ${d.getFullYear()}`;
}

/** The commands main.js may pass the sim from the keys, mouse and stick while photo mode is open: `stop` only. Pure. */
export const photoInput = (cmds) => cmds.filter((c) => c && c.t === 'stop');
