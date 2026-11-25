// Party chronicle: the journal, the story writer and the link (wave 9 chronicle lane; brief D:/LQOnline/wave9/chronicle/
// BRIEF.md, approved by Scott 2026-11-25 with the lane's recommendations). Pure: no DOM, no sim writes (node tests run it).
//
// After a night of play the game writes "the story so far" from the night's own sim events, with stills of the big
// moments that the 3D renderer captured as they happened. Every sentence comes from LINES below, filled with hero names
// and names the game already has (foe, place, item, quest and mount names from src/data). LINES and WORDS are DRAFTS:
// Scott has not written them yet; this file is the one place to rewrite them.
//
//   const J = createJournal({ get, players, heroId, placeOf, content, startMs, id })
//     get(id) -> an entity of the current snapshot (host, guest and solo alike); players() -> the heroes in it
//   J.onEvent(ev, tick) -> null | { moment, delay }     a big moment: take a still `delay` ticks from now
//   J.keepShot(moment, still)                            the still came back (a JPEG data URL), or null (no picture)
//   J.session                                            { id, startMs, startTick, heroes, moments, counts }
//   J.worth()                                            a night worth a page (at least one moment that counts)
//   writeStory(session, { endMs, openPlace, readerFrom }) -> { title, sub, open, chapters, also, close }
//   await packLink(session, opts) -> '#chron=...'        await readLink(hash, { known }) -> { S, from, endMs, openPlace } | null
//
// Which moments, and how much each counts (WEIGHT): a dungeon or cave boss falls 100, a legendary 90, a rare beast 70, a
// word door opened 60, a mount 45, a level 40 (every 5th 55), a story quest 40, a friend brought back 35, a dungeon or cave
// first reached 30, a secret 30, a wipe 25. At most SHOTS stills a night; a stronger moment lets the weakest still go.

export const SHOTS = 6;            // stills kept per night
export const SHOT_GAP = 20 * 20;   // ticks between two stills, unless the new one weighs WEIGHT_ANYTIME or more
export const WEIGHT_ANYTIME = 80;
export const STILL_W = 960, STILL_H = 540, STILL_Q = 0.82;   // a still: 960x540 JPEG
export const QUIET_END_MIN = 30;   // 30 minutes with no moment ends the night (kept, no page)
export const PAGE_MIN_MIN = 5;     // a night shorter than 5 minutes never opens the page by itself (a quick look at the bags)
export const MAX_CHAPTERS = 40;    // moments kept a night (the link carries at most this many)

export const WEIGHT = { boss: 100, legendary: 90, rare: 70, wdoor: 60, mount: 45, level: 40, level5: 55, quest: 40, rez: 35,
  place: 30, secret: 30, wipe: 25, join: 0, run: 20 };   // run: wave 10 dflow, a dungeon or cave cleared (one line; the boss has the still)
// how long after the event the still is taken (ticks at 20 Hz): a kill waits for the body to settle and the heroes to turn
export const DELAY = { run: 40, boss: 16, rare: 16, legendary: 4, wdoor: 10, mount: 6, level: 2, level5: 2, quest: 2, rez: 8, place: 30, secret: 2, wipe: 4 };

// ---- every word the game writes (DRAFTS: Scott has not written these). {slots} are filled; a list picks one per night.
export const WORDS = {
  title: 'The story so far', lastTime: 'Last time',
  sub: '{date}, {mins}, {party}',
  kept: 'Kept for the chronicle',
  also: 'Also on this night',
  savePicture: 'Save picture', share: 'Share', copyLink: 'Copy link', watch: 'Watch the fight', close: 'Close',
  earlier: 'Earlier nights', back: 'Back', open: 'Open', listTitle: 'Chronicle', listNone: 'No nights kept yet. Play a while: big moments are kept by themselves.',
  listFoot: 'Kept on this device, the last 12 nights.', chapters: (n) => `${n} ${n === 1 ? 'chapter' : 'chapters'}`,
  linkCopied: 'Link copied. It holds the words only, no pictures.', linkShared: 'Link shared.',
  pictureSaved: 'Picture saved.', pictureShared: 'Picture shared.', making: 'Making the picture...',
  readerSub: 'Shared by {from}. Words only: ask them for the picture.',
  notReadable: 'That chronicle link is damaged or from a newer game.', stillsOff: 'Stills: Off', stillsOn: 'Stills: On',
  noStill: 'No picture: stills are taken in 3D.', noReplay: 'That fight is no longer kept in Replays.',
  file: 'lexicon-realms-chronicle-{date}.jpg',
};
export const LINES = {
  open_party: ['{party} met in {place}.', 'In {place}, {party} took up the road together.'],
  open_solo: ['{hero} set out from {place}.', '{hero} took the road from {place} alone.'],
  joined: ['{name} joined the party.'],
  boss: ['In {place}, {party} brought down {foe}.', '{foe} fell to {party} in {place}, {secs} after the first blow.'],
  rare: ['Out in {place}, {party} hunted down {foe}, a rare beast.', '{foe} had roamed {place} a long time. {party} ended that.'],
  wipe: ['{foe} sent {party} back to the lantern. They will be back.'],
  legendary: ['{hero} found {item}. A legendary, the first of its kind in this party.'],
  wdoor: ['{hero} spelled {word}, and the door in {place} opened.'],
  mount: ['{hero} learned to ride: {mount}.'],
  level: ['{hero} reached level {level}.'],
  level5: ['{hero} reached level {level}, stronger than when the night began.'],
  quest: ['{hero} finished {quest}.'],
  rez: ['{by} brought {hero} back to their feet.'],
  place: ['{party} reached {place} for the first time.'],
  secret: ['{hero} found a secret in {place}.'],
  close: ['{kills} fell and {gold} gold was found. To be continued.'],
  run: ['{party} cleared {place} in {secs}, with {falls}.'],   // wave 10 dflow: from the run summary (delve_done)
};
/** wave 10 dflow: the chronicle's line for a cleared run (tests, and the run summary's own footer). */
export function journalRunLine(slots) { return fill(LINES.run[0], slots); }
export const fallsText = (n) => (n ? `${n} ${n === 1 ? 'fall' : 'falls'}` : 'no falls');
export const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// ---- helpers
export function hash32(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
/** Fill a template. A name that starts with "The" reads "the" inside a sentence ("Out in the High Moor"). */
export function fill(tpl, slots) {
  return tpl.replace(/\{(\w+)\}/g, (m, k, at) => { if (slots[k] == null) return m; const v = String(slots[k]); return at > 0 && /^The /.test(v) ? `t${v.slice(1)}` : v; });
}
export function pick(list, seed, i) { return list[hash32(`${seed}:${i}`) % list.length]; }
export function andList(names) {
  const n = [...new Set(names.filter(Boolean))];
  if (n.length <= 1) return n[0] || '';
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}
export const secsText = (s) => (s < 60 ? `${s} ${s === 1 ? 'second' : 'seconds'}` : `${Math.floor(s / 60)} min ${s % 60} s`);
export function dateText(ms) { const d = new Date(ms); return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`; }
export function isoDay(ms) { const d = new Date(ms); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; }
// A hero name in a link: what the hero-name rules allow (letters, space, ' and -), at most 16. Anything else drops the link.
export const NAME_OK = /^[A-Za-z][A-Za-z '\-]{0,15}$/;
const TILE = 256;

// ---- the journal: reads the night's sim events (main.js bus.on('*'): the host, a guest and solo alike)
export function createJournal({ get, players = () => [], heroId, placeOf, content = {}, startMs = 0, id = 's0' }) {
  const mobs = content.mobs || {}, rares = content.rares || {};
  const S = { id, startMs, startTick: null, lastMomentMs: startMs, heroes: {}, moments: [], counts: { kills: 0, gold: 0 }, seen: {} };
  const firstHit = new Map(), pulled = new Map();
  const hero = (p) => { if (p && p.kind === 'player' && p.name) S.heroes[p.name] = { name: p.name, cls: p.cls, level: p.level }; };
  const near = (e, R = 40 * TILE) => {   // my party round e: heroes in my party within 40 tiles
    const me = get(heroId());
    const out = [];
    for (const p of players()) {
      if (!p || p.zone !== e.zone) continue;
      if (me && p.id !== me.id && (p.party == null || p.party !== me.party)) continue;
      if (Math.hypot(p.x - e.x, p.y - e.y) <= R) { out.push(p.name); hero(p); }
    }
    return out;
  };
  const inParty = (pid) => { const me = get(heroId()); const p = get(pid); return !!(p && me && (p.id === me.id || (p.party != null && p.party === me.party))); };
  const nameOf = (tpl) => (mobs[tpl] || {}).name || tpl;

  function add(kind, slots, at, tick, extra = {}) {
    const w = WEIGHT[kind] ?? 10;
    S.lastMomentMs = Date.now();
    // a level twice in a row for the same hero: one line, the higher level
    const last = S.moments[S.moments.length - 1];
    if (kind.startsWith('level') && last && last.kind.startsWith('level') && last.slots.hero === slots.hero) {
      Object.assign(last, { kind, w: Math.max(last.w, w), slots, tick });
      return null;
    }
    if (S.moments.length >= MAX_CHAPTERS) return null;
    const m = { kind, w, tick, at: at ? { zone: at.zone, x: at.x, y: at.y } : null, slots, ...extra, shot: null, wantShot: false };
    S.moments.push(m);
    if (!w) return null;
    // a still? the strongest SHOTS, never two inside SHOT_GAP unless this one is big
    const shots = S.moments.filter((x) => x.shot || x.wantShot);
    const lastShot = shots.reduce((a, x) => Math.max(a, x.tick), -1e9);
    if (w < WEIGHT_ANYTIME && tick - lastShot < SHOT_GAP) return null;
    if (shots.length >= SHOTS) {
      const weakest = shots.reduce((a, x) => (x.w < a.w ? x : a));
      if (weakest.w >= w) return null;
      weakest.shot = null; weakest.wantShot = false;   // its still is let go
    }
    m.wantShot = true;
    return { moment: m, delay: DELAY[kind] ?? 6 };
  }

  function onEvent(ev, tick) {
    if (!ev || typeof ev !== 'object') return null;
    if (S.startTick == null) S.startTick = tick;
    const t = ev.type;
    if (t === 'damage') { if (typeof ev.dst === 'number' && !firstHit.has(ev.dst)) firstHit.set(ev.dst, tick); return null; }
    if (t === 'join') { const p = get(ev.id); hero(p); if (p && p.id !== heroId() && inParty(p.id)) return add('join', { name: p.name }, p, tick); return null; }
    if (t === 'boss' && ev.kind === 'pull') { pulled.set(ev.id, tick); return null; }
    if (t === 'gold') { if (ev.id === heroId() && ev.amount > 0) S.counts.gold += ev.amount; return null; }
    if (t === 'boss' && ev.kind === 'reset') {
      const m = get(ev.id);
      if (!m) return null;
      const party = near(m, 60 * TILE);
      if (!party.length) return null;
      return add('wipe', { foe: nameOf(ev.template), place: placeOf(m), party: andList(party) }, m, tick, { foe: ev.template });
    }
    if (t === 'death' && ev.kind === 'mob') {
      const t0 = pulled.get(ev.id) ?? firstHit.get(ev.id);
      firstHit.delete(ev.id); pulled.delete(ev.id);
      const m = get(ev.id);
      if (!m) return null;
      const by = ev.tagger != null ? ev.tagger : ev.killer;
      if (by == null || !inParty(by)) return null;
      S.counts.kills++;
      const mt = mobs[ev.template] || {};
      const inPlace = String(m.zone || '').includes('#');            // a dungeon or cave copy ('rootcellar#party12')
      const isBoss = !!(mt.boss || (inPlace && (mt.elite || mt.rare)));
      const isRare = !isBoss && !!(mt.rare || rares[ev.template]);
      if (!isBoss && !isRare) return null;
      const secs = Math.max(1, Math.round((tick - (t0 ?? tick)) / 20));
      return add(isBoss ? 'boss' : 'rare', { foe: nameOf(ev.template), place: placeOf(m), party: andList(near(m)), secs: secsText(secs) }, m, tick, { foe: ev.template, mobId: ev.id });
    }
    if (t === 'level') { const p = get(ev.id); if (!p || !inParty(p.id)) return null; hero(p); return add(ev.level % 5 === 0 ? 'level5' : 'level', { hero: p.name, level: ev.level }, p, tick); }
    if (t === 'legendary') { const p = get(ev.id); if (!p || !inParty(p.id)) return null; const it = (content.items || {})[ev.item] || {}; return add('legendary', { hero: p.name, item: it.name || ev.item }, p, tick, { item: ev.item }); }
    if (t === 'wdoor' && ev.kind === 'open') { const p = get(ev.id); if (!p || !inParty(p.id)) return null; return add('wdoor', { hero: p.name, word: String(ev.word || '').toUpperCase(), place: placeOf(p) }, p, tick); }
    if (t === 'mount_learn') { const p = get(ev.id); if (!p || !inParty(p.id)) return null; return add('mount', { hero: p.name, mount: ev.name }, p, tick); }
    if (t === 'quest' && ev.kind === 'turnin') {
      const p = get(ev.id), q = (content.quests || {})[ev.quest] || {};
      if (!p || !inParty(p.id) || !(q.story || q.place || q.elite)) return null;     // story, dungeon and elite quests only
      return add('quest', { hero: p.name, quest: q.name || ev.quest }, p, tick, { quest: ev.quest });
    }
    if (t === 'rez' && ev.kind === 'done') { const a = get(ev.src), b = get(ev.id); if (!a || !b || !inParty(b.id)) return null; return add('rez', { by: a.name, hero: b.name }, b, tick); }
    if (t === 'secret_found') { const p = get(ev.id); if (!p || !inParty(p.id)) return null; return add('secret', { hero: p.name, place: placeOf(p) }, p, tick); }
    // wave 10 dflow: the run summary feeds the chronicle: a dungeon or cave cleared, its time and falls (src/sim/delve.js)
    if (t === 'delve_done' && ev.id === heroId()) {
      const p = get(ev.id);
      const party = andList((ev.heroes || []).filter((n) => typeof n === 'string')) || (p ? p.name : '');
      return add('run', { party, place: ev.name || placeOf(p || {}), secs: secsText(Math.max(1, ev.secs | 0)), falls: fallsText(ev.falls | 0) }, p, tick, { place: ev.place });
    }
    if (t === 'zone' && ev.id === heroId()) {
      const key = String(ev.to).split('#')[0];
      if (S.seen[key]) return null;
      S.seen[key] = 1;
      if (ev.kind !== 'dungeon' && ev.kind !== 'cave') return null;     // places with a door: dungeons and caves
      const p = get(ev.id);
      if (!p) return null;
      return add('place', { party: p.name, place: ev.name || placeOf(p) }, p, tick, { zoneTo: key });
    }
    return null;
  }
  /** The still came back. A place's party is counted now, when the friends have stepped through after the hero. */
  function keepShot(m, still) {
    if (!m || !m.wantShot) return;
    m.shot = still || null;
    if (m.kind === 'place') { const me = get(heroId()); if (me) { const p = near(me); if (p.length) m.slots.party = andList(p); } }
  }
  const worth = () => S.moments.some((m) => m.w > 0);
  return { onEvent, keepShot, worth, session: S, hero };
}

// ---- the story: the opening line, the moments with stills as chapters (time order), the rest as one-liners, the close
export function writeStory(S, { endMs = null, openPlace = '', readerFrom = null } = {}) {
  const names = Object.values(S.heroes).map((h) => h.name);
  const seed = S.id;
  const party = andList(names);
  const mins = Math.max(1, Math.round(((endMs || S.startMs) - S.startMs) / 60000));
  const out = { title: WORDS.title, sub: fill(WORDS.sub, { date: dateText(S.startMs), mins: `${mins} ${mins === 1 ? 'minute' : 'minutes'}`, party }), open: '', chapters: [], also: [], close: '' };
  if (readerFrom) out.reader = fill(WORDS.readerSub, { from: readerFrom });
  out.open = fill(pick(names.length > 1 ? LINES.open_party : LINES.open_solo, seed, 'open'), { party, hero: names[0] || '', place: openPlace });
  S.moments.forEach((m, i) => {
    const text = fill(pick(LINES[m.kind === 'join' ? 'joined' : m.kind] || ['{hero}'], seed, i), m.slots);
    if (m.shot || m.wantShot) out.chapters.push({ kind: m.kind, text, shot: m.shot || null, replay: m.replay || null, place: m.slots.place || m.slots.hero || '' });
    else out.also.push(text);
  });
  const k = S.counts.kills | 0;
  out.close = fill(pick(LINES.close, seed, 'close'), { kills: `${k} ${k === 1 ? 'foe' : 'foes'}`, gold: S.counts.gold | 0 });
  return out;
}

// ---- what the store keeps of a night (no live references): the session as plain data
export function toRow(S, { endMs, openPlace, finished }) {
  return { id: S.id, startMs: S.startMs, endMs, openPlace, finished: !!finished, heroes: S.heroes, counts: S.counts,
    moments: S.moments.map((m) => ({ kind: m.kind, w: m.w, tick: m.tick, slots: m.slots, wantShot: !!(m.shot || m.wantShot), replay: m.replay || null, mobId: m.mobId ?? null, shot: m.shot || null })) };
}
export function fromRow(r) {
  return { S: { id: r.id, startMs: r.startMs, heroes: r.heroes || {}, counts: r.counts || { kills: 0, gold: 0 }, moments: (r.moments || []).map((m) => ({ ...m })) },
    endMs: r.endMs, openPlace: r.openPlace || '' };
}

// ---- the link: the words' ingredients (kinds, names, numbers), never the pictures and never typed text
const b64u = (bytes) => { let s = ''; for (const b of bytes) s += String.fromCharCode(b); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const unb64u = (s) => { const t = atob(s.replace(/-/g, '+').replace(/_/g, '/')); return Uint8Array.from(t, (c) => c.charCodeAt(0)); };
async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
export const LINK_KEY = 'chron';
export const LINK_MAX = 8000;

export function linkPayload(S, { from, endMs, openPlace }) {
  return { v: 1, f: from, d: S.startMs, m: Math.max(1, Math.round(((endMs || S.startMs) - S.startMs) / 60000)), o: openPlace || '',
    h: Object.values(S.heroes).map((h) => [h.name, h.cls, h.level]), k: [S.counts.kills | 0, S.counts.gold | 0],
    c: S.moments.map((m) => [m.kind, m.slots, m.shot || m.wantShot ? 1 : 0]) };
}
export async function packLink(S, opts) {
  const raw = new TextEncoder().encode(JSON.stringify(linkPayload(S, opts)));
  return `#${LINK_KEY}=${b64u(await pipe(raw, new CompressionStream('deflate-raw')))}`;
}

// slot rules for a link from someone else: names must be hero names; game names must be names the game has (known)
const NAME_SLOTS = new Set(['hero', 'by', 'name']);
const GAME_SLOTS = new Set(['foe', 'place', 'item', 'quest', 'mount']);
function slotOk(k, v, known) {
  if (k === 'level') return Number.isInteger(v) && v >= 1 && v <= 99;
  if (typeof v !== 'string' || v.length > 48) return false;
  if (NAME_SLOTS.has(k)) return NAME_OK.test(v);
  if (k === 'party') return v.split(/, | and /).every((n) => NAME_OK.test(n));
  if (k === 'word') return /^[A-Z]{1,12}$/.test(v);
  if (k === 'falls') return /^(no falls|\d{1,3} falls?)$/.test(v);   // wave 10 dflow
  if (k === 'secs') return /^(\d{1,2} seconds?|\d{1,3} min \d{1,2} s)$/.test(v);
  if (GAME_SLOTS.has(k)) return known ? known(v) : !/[<>{}\\]/.test(v);
  return false;
}
/** A #chron= hash -> { S, from, endMs, openPlace } for the story writer (no pictures), or null when it is not readable. */
export async function readLink(hash, { known = null } = {}) {
  const m = new RegExp(`(?:^#|&)${LINK_KEY}=([A-Za-z0-9_-]+)`).exec(String(hash || ''));
  if (!m || m[1].length > LINK_MAX) return null;
  let P;
  try { P = JSON.parse(new TextDecoder().decode(await pipe(unb64u(m[1]), new DecompressionStream('deflate-raw')))); } catch { return null; }
  if (!P || P.v !== 1 || !Array.isArray(P.h) || !Array.isArray(P.c) || !Array.isArray(P.k) || P.h.length > 8 || P.c.length > MAX_CHAPTERS) return null;
  if (!P.h.every((h) => Array.isArray(h) && NAME_OK.test(String(h[0]))) || !NAME_OK.test(String(P.f))) return null;
  if (!Number.isFinite(P.d) || !Number.isFinite(P.m) || P.m < 1 || P.m > 24 * 60) return null;
  if (P.o && (typeof P.o !== 'string' || (known ? !known(P.o) : P.o.length > 48))) return null;
  for (const c of P.c) {
    if (!Array.isArray(c) || !LINES[c[0] === 'join' ? 'joined' : c[0]] || !c[1] || typeof c[1] !== 'object') return null;
    for (const [k, v] of Object.entries(c[1])) if (!slotOk(k, v, known)) return null;
  }
  const S = { id: `link${P.d}`, startMs: P.d, heroes: {}, moments: [], counts: { kills: P.k[0] | 0, gold: P.k[1] | 0 } };
  for (const h of P.h) S.heroes[h[0]] = { name: h[0], cls: String(h[1] || ''), level: h[2] | 0 };
  S.moments = P.c.map((c, i) => ({ kind: c[0], w: WEIGHT[c[0]] ?? 10, tick: i, slots: c[1], wantShot: !!c[2], shot: null }));
  return { S, from: P.f, endMs: P.d + P.m * 60000, openPlace: P.o || '' };
}

/** The game's own names a link may use (foes, places, items, quests, mounts): built once from content. */
export function knownNames(content) {
  const set = new Set();
  const addAll = (o, k = 'name') => { for (const v of Object.values(o || {})) if (v && typeof v[k] === 'string') set.add(v[k]); };
  addAll(content.mobs); addAll(content.items); addAll(content.quests); addAll(content.mounts && content.mounts.kinds);
  for (const z of Object.values(content.zones || {})) { if (z && z.name) set.add(z.name); for (const a of (z && z.areas) || []) if (a.name) set.add(a.name); }
  for (const v of Object.values(content.zoneNames || {})) if (typeof v === 'string') set.add(v);
  return (s) => set.has(s);
}
