// Depths, the friends' board (wave 10 dtiers; brief D:/LQOnline/wave10/dtiers/BRIEF.md). Device side only: the sim never
// sees it. Records come from three places: this hero's own runs (the HUD block), friends in this game (co-op: every friend
// is in the host's world, so the HUD block carries their runs too) and board links (`#depths=...`), kept on this device.
//
//   encodeBoard(rec) / decodeBoard(hash)   the `#depths=` link both ways; a forged or broken link is refused
//   readLink(loc) / clearLink(win)         read a link at load (like #join= and #note=), then take it off the address bar
//   mergeBoard(board, rec)                 keep each friend's best per place per week (deeper wins; then the faster time)
//   readStore(store) / writeStore(store, s)  localStorage `lexicon_realms.depths` v1 (never in the hero save)
//   boardRows(...)                         the rows the board draws, this week or best ever
export const DEPTHS_KEY = 'lexicon_realms.depths';
export const PLACES = ['barrow', 'watchtower', 'barrow_deep', 'rootcellar', 'smugglers_cut', 'tarn_hollow', 'larch_mine'];
const CLASSES = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];
const NAME = /^[A-Za-z]{2,12}$/;
const KEEP = 60;                         // board records kept on a device (newest weeks first)

function h32(s) { let a = 0x811c9dc5; for (let i = 0; i < s.length; i++) { a ^= s.charCodeAt(i); a = Math.imul(a, 0x01000193); } return (a >>> 0).toString(36); }
const b64u = (s) => btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const unb64u = (s) => atob(s.replace(/-/g, '+').replace(/_/g, '/'));

/** rec: { name, cls, week, runs: [{ place, depth, secs, lit, with: [names] }] } -> 'depths=<data>.<check>' (after the #). */
export function encodeBoard(rec) {
  const r = (rec.runs || []).filter((x) => PLACES.includes(x.place)).slice(0, PLACES.length)
    .map((x) => [PLACES.indexOf(x.place), x.depth | 0, x.secs | 0, x.lit ? 1 : 0, (x.with || []).filter((n) => NAME.test(n)).slice(0, 3).join(' ')]);
  const data = b64u(JSON.stringify([1, rec.name, CLASSES.indexOf(rec.cls), rec.week | 0, r]));
  return `depths=${data}.${h32(data)}`;
}
export function decodeBoard(hash) {
  const m = /(?:^|[#&])depths=([A-Za-z0-9_-]{8,900})\.([0-9a-z]{1,8})(?:&|$)/.exec(String(hash || ''));
  if (!m || h32(m[1]) !== m[2]) return null;
  let b;
  try { b = JSON.parse(unb64u(m[1])); } catch { return null; }
  if (!Array.isArray(b) || b[0] !== 1 || typeof b[1] !== 'string' || !NAME.test(b[1]) || !Array.isArray(b[4]) || !Number.isInteger(b[3])) return null;
  const runs = [];
  for (const x of b[4]) {
    if (!Array.isArray(x) || !PLACES[x[0]] || !Number.isInteger(x[1]) || x[1] < 1 || x[1] > 99 || !(x[2] >= 60 && x[2] < 6 * 3600)) return null;
    const w = String(x[4] || '').split(' ').filter(Boolean);
    if (w.some((n) => !NAME.test(n))) return null;
    runs.push({ place: PLACES[x[0]], depth: x[1], secs: x[2] | 0, lit: !!x[3], with: w });
  }
  return { name: b[1], cls: CLASSES[b[2]] || null, week: b[3], runs };
}
export function readLink(loc = globalThis.location) { try { return decodeBoard(loc && loc.hash); } catch { return null; } }
export function hasLink(loc = globalThis.location) { return /(?:^|[#&])depths=/.test(String((loc && loc.hash) || '')); }
export function clearLink(win = globalThis.window) {
  try { if (win && hasLink(win.location)) win.history.replaceState(win.history.state, '', `${win.location.pathname}${win.location.search}`); } catch { /* an old browser keeps it */ }
}

/** Best per (week, place, name): deeper wins, then the faster time. Mutates and returns board. */
export function mergeBoard(board, rec) {
  const B = board || {};
  for (const r of rec.runs || []) {
    const k = `${rec.week}:${r.place}:${rec.name}`;
    const old = B[k];
    if (!old || r.depth > old.depth || (r.depth === old.depth && r.secs < old.secs)) B[k] = { place: r.place, depth: r.depth, secs: r.secs, lit: !!r.lit, with: [...(r.with || [])], name: rec.name, cls: rec.cls || null, week: rec.week };
  }
  const keys = Object.keys(B);
  if (keys.length > KEEP) keys.sort((a, b) => (B[a].week - B[b].week) || (B[a].depth - B[b].depth)).slice(0, keys.length - KEEP).forEach((k) => delete B[k]);
  return B;
}
export function readStore(store) {
  try { const o = JSON.parse(store.getItem(DEPTHS_KEY) || 'null'); return o && o.v === 1 && o.board && typeof o.board === 'object' ? o : { v: 1, board: {} }; } catch { return { v: 1, board: {} }; }
}
export function writeStore(store, s) { try { store.setItem(DEPTHS_KEY, JSON.stringify(s)); } catch { /* private window: this session only */ } }

/** The board's rows: one per (place, depth, time, who) so friends who ran together show once. mode 'week' | 'ever'. */
export function boardRows(board, week, mode = 'week', me = null) {
  const list = Object.values(board || {}).filter((r) => (mode === 'week' ? r.week === week : true));
  const best = {};
  for (const r of list) {
    const k = mode === 'ever' ? `${r.place}:${r.name}` : `${r.place}:${r.name}`;
    if (!best[k] || r.depth > best[k].depth || (r.depth === best[k].depth && r.secs < best[k].secs)) best[k] = r;
  }
  const seen = new Set(), out = [];
  for (const r of Object.values(best).sort((a, b) => PLACES.indexOf(a.place) - PLACES.indexOf(b.place) || b.depth - a.depth || a.secs - b.secs)) {
    const who = [r.name, ...(r.with || [])].filter((n, i, a) => a.indexOf(n) === i).sort();
    const key = `${r.place}:${r.depth}:${r.secs}:${who.join(',')}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ place: r.place, depth: r.depth, secs: r.secs, lit: !!r.lit, who, me: me != null && who.includes(me), week: r.week });
  }
  return out;
}
