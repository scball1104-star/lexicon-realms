// Riddles friends write (wave 9 riddles; D:/LQOnline/wave9/riddles/BRIEF.md). Pure: no DOM, no clock, no Math.random,
// imports only from src/sim/, so node tests run it and the sim calls it on a command. The limits and the blocked list come
// in (content.riddleRules / riddleBlocked from src/data/riddle_words.js): const RB = createRiddleRules(R, BLOCKED).
//
// A riddle trail: 1 to 5 stones in the open world. Each stone has a clue (2 lines), an optional hint line and an answer
// word (3 to 8 letters). The author writes it in the editor; it travels as a link (#riddle=r1.<code>) or a file holding
// the same code. No server ever sees it.
//
//   check(text)               -> null | 'bad' | 'contact'     the word check (author's device on write, reader's on read)
//   validate(draft, place)    -> [] | [{ k, field, why }]     shape, limits, words, placement (place(stone) -> why | null)
//   pack(draft)               -> 'r1.<base64url>'             answers SEALED, stone 2 on LOCKED with the answer before it
//   unpack(code)              -> riddle | { error }           never throws; refuses long, cut or odd links
//   tryWord(riddle, k, word)  -> { ok, stone?, end? }         right = the seal matches AND the next part opens
//   riddleId(code)            -> 'r' + hash                    the same code gives the same id on every device
//
// Spoilers: the link carries hashSeed(salt, k, ANSWER) for each answer, never the word. Stone k+1 (its place, clue and
// hint) and the last words are XORed with a key stream from that answer, so reading the link shows only stone 1. It keeps
// honest friends honest; it is not a lock (a coder could guess 8 letters by brute force).
import { hashSeed, createRng } from './rng.js';

export function createRiddleRules(R, BLOCKED = []) {
  const LEET = { 4: 'a', '@': 'a', 3: 'e', 1: 'i', '!': 'i', 0: 'o', 5: 's', $: 's', 7: 't' };
  /** Words as the check sees them: lower case, leet folded, letters only. */
  function words(text) {
    const s = String(text || '').toLowerCase().replace(/[4@31!05$7]/g, (c) => LEET[c]);
    return s.split(/[^a-z]+/).filter(Boolean);
  }
  const BLOCK = new Set(BLOCKED.map((w) => String(w).toLowerCase().replace(/[^a-z]/g, '')).filter(Boolean));
  // a word is blocked when, with long runs cut to two letters ("asssss" -> "ass") or every run cut to one ("stuuupid" ->
  // "stupid"), it is on the list as written. The list is never squeezed, so "ass" never blocks "as" nor "coon" "con"
  const hit = (w) => BLOCK.has(w) || BLOCK.has(w.replace(/(.)\1{2,}/g, '$1$1')) || BLOCK.has(w.replace(/(.)\1+/g, '$1'));
  function check(text) {
    const raw = String(text || '');
    if (/https?:|www\.|\.(com|net|org|io|gg|ly|me)\b|@\w|\d[\d\s().-]{5,}\d/i.test(raw)) return 'contact';
    const ws = words(raw);
    if (ws.some(hit)) return 'bad';
    // s p a c e d letters: join runs of single letters ("d a m n") and look again
    const joined = []; let run = '';
    for (const w of ws) { if (w.length === 1) run += w; else { if (run.length > 2) joined.push(run); run = ''; } }
    if (run.length > 2) joined.push(run);
    return joined.some(hit) ? 'bad' : null;
  }

  const A_Z = /^[A-Z]+$/;
  function validate(d, place = () => null) {
    const out = [];
    const bad = (k, field, why) => out.push({ k, field, why });
    const txt = (k, field, s, max) => { if (String(s || '').length > max) bad(k, field, 'long'); const c = check(s); if (c) bad(k, field, c); };
    txt(-1, 'by', d.by, R.byMax); txt(-1, 'title', d.title, R.titleMax); txt(-1, 'end', d.end, R.endMax);
    if (!String(d.title || '').trim()) bad(-1, 'title', 'empty');
    const st = d.stones || [];
    if (!st.length) bad(-1, 'stones', 'none');
    if (st.length > R.maxStones) bad(-1, 'stones', 'many');
    st.forEach((s, k) => {
      const a = String(s.answer || '');
      if (!A_Z.test(a) || a.length < R.answerMin || a.length > R.answerMax) bad(k, 'answer', 'shape');
      else if (check(a)) bad(k, 'answer', 'bad');
      const c = s.clue || [];
      if (!c.length || !String(c[0] || '').trim() || c.length > R.clueLines) bad(k, 'clue', 'shape');
      c.forEach((ln) => txt(k, 'clue', ln, R.clueMax));
      if (s.hint) txt(k, 'hint', s.hint, R.hintMax);
      if (!R.zones.includes(s.zone)) bad(k, 'place', 'zone');
      else {
        const why = place(s);
        if (why) bad(k, 'place', why);
        for (let j = 0; j < k; j++) if (st[j].zone === s.zone && Math.hypot(st[j].tx - s.tx, st[j].ty - s.ty) < R.minApartTiles) bad(k, 'place', 'close');
      }
    });
    return out;
  }

  // ---- bytes, base64url, the key stream -------------------------------------------------------------------------------
  const enc = (s) => new TextEncoder().encode(s), dec = (b) => new TextDecoder('utf-8', { fatal: true }).decode(b);
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64(bytes) {
    let s = '';
    for (let i = 0; i < bytes.length; i += 3) {
      const n = (bytes[i] << 16) | ((bytes[i + 1] || 0) << 8) | (bytes[i + 2] || 0);
      s += B64[(n >> 18) & 63] + B64[(n >> 12) & 63] + (i + 1 < bytes.length ? B64[(n >> 6) & 63] : '') + (i + 2 < bytes.length ? B64[n & 63] : '');
    }
    return s;
  }
  function unb64(s) {
    if (!/^[A-Za-z0-9_-]*$/.test(s)) throw new Error('chars');
    const out = [];
    for (let i = 0; i < s.length; i += 4) {
      const v = [0, 1, 2, 3].map((j) => (i + j < s.length ? B64.indexOf(s[i + j]) : 0));
      const n = (v[0] << 18) | (v[1] << 12) | (v[2] << 6) | v[3];
      out.push((n >> 16) & 255);
      if (i + 2 < s.length) out.push((n >> 8) & 255);
      if (i + 3 < s.length) out.push(n & 255);
    }
    return new Uint8Array(out);
  }
  function xor(bytes, key) {
    const r = createRng(key), o = new Uint8Array(bytes.length);
    for (let i = 0; i < bytes.length; i++) o[i] = bytes[i] ^ Math.floor(r.next() * 256);
    return o;
  }
  const seal = (salt, k, word) => hashSeed(`seal:${salt}:${k}:${word}`).toString(36);
  const keyOf = (salt, k, word) => hashSeed(`key:${salt}:${k}:${word}`);
  const lock = (salt, k, word, obj) => b64(xor(enc(JSON.stringify(obj)), keyOf(salt, k, word)));
  function unlock(salt, k, word, s) { try { return JSON.parse(dec(xor(unb64(s), keyOf(salt, k, word)))); } catch { return null; } }

  const stoneBody = (s) => ({ z: s.zone, x: s.tx | 0, y: s.ty | 0, c: (s.clue || []).slice(0, R.clueLines), ...(s.hint ? { h: s.hint } : {}) });

  function pack(d) {
    const st = d.stones;
    const head = { v: 1, by: String(d.by).slice(0, R.byMax), t: String(d.title).slice(0, R.titleMax), n: st.length };
    const salt = hashSeed(JSON.stringify([head, stoneBody(st[0]), st.map((s) => s.answer.length)]));
    const body = { ...head, s0: stoneBody(st[0]), q: st.map((s, k) => [s.answer.length, seal(salt, k, s.answer)]), lk: [] };
    for (let k = 1; k < st.length; k++) body.lk.push(lock(salt, k - 1, st[k - 1].answer, stoneBody(st[k])));
    body.e = lock(salt, st.length - 1, st[st.length - 1].answer, { e: String(d.end || '').slice(0, R.endMax) });
    const raw = b64(enc(JSON.stringify(body)));
    return `r1.${raw}.${hashSeed(raw).toString(36)}`;
  }

  function unpack(code) {
    const c = String(code || '').trim();
    if (c.length > R.linkMax) return { error: 'long' };
    const m = /^r1\.([A-Za-z0-9_-]+)\.([0-9a-z]+)$/.exec(c);
    if (!m) return { error: 'shape' };
    if (hashSeed(m[1]).toString(36) !== m[2]) return { error: 'cut' };          // a link cut short, or changed by hand
    let b;
    try { b = JSON.parse(dec(unb64(m[1]))); } catch { return { error: 'shape' }; }
    const okStone = (s) => s && R.zones.includes(s.z) && Number.isInteger(s.x) && Number.isInteger(s.y) && Array.isArray(s.c) && s.c.length >= 1 && s.c.length <= R.clueLines
      && s.c.every((l) => typeof l === 'string' && l.length <= R.clueMax) && (s.h == null || (typeof s.h === 'string' && s.h.length <= R.hintMax));
    if (!b || b.v !== 1 || typeof b.by !== 'string' || typeof b.t !== 'string' || !Number.isInteger(b.n) || b.n < 1 || b.n > R.maxStones) return { error: 'shape' };
    if (!okStone(b.s0) || !Array.isArray(b.q) || b.q.length !== b.n || !Array.isArray(b.lk) || b.lk.length !== b.n - 1 || typeof b.e !== 'string') return { error: 'shape' };
    if (!b.q.every((q) => Array.isArray(q) && Number.isInteger(q[0]) && q[0] >= R.answerMin && q[0] <= R.answerMax && typeof q[1] === 'string')) return { error: 'shape' };
    const salt = hashSeed(JSON.stringify([{ v: 1, by: b.by, t: b.t, n: b.n }, b.s0, b.q.map((q) => q[0])]));
    return { id: riddleId(c), by: b.by.slice(0, R.byMax), title: b.t.slice(0, R.titleMax), n: b.n, first: b.s0, lens: b.q.map((q) => q[0]), _q: b.q, _lk: b.lk, _e: b.e, _salt: salt,
      flagged: [b.by, b.t, ...b.s0.c, b.s0.h || ''].some((t) => check(t)) };
  }

  /** A guess at stone k (0-based). Right only when the seal matches and the locked part opens with it. */
  function tryWord(r, k, word) {
    const w = String(word || '').toUpperCase();
    if (!A_Z.test(w) || w.length !== r.lens[k]) return { ok: false };
    if (seal(r._salt, k, w) !== r._q[k][1]) return { ok: false };
    if (k < r.n - 1) {
      const s = unlock(r._salt, k, w, r._lk[k]);
      if (!s || !R.zones.includes(s.z)) return { ok: false };
      return { ok: true, stone: { ...s, c: s.c.map((l) => (check(l) ? null : l)), h: s.h && check(s.h) ? null : s.h } };   // null = shown as the hidden line
    }
    const e = unlock(r._salt, k, w, r._e);
    if (!e) return { ok: false };
    return { ok: true, end: check(e.e) ? null : e.e };
  }

  function riddleId(code) { return `r${hashSeed(String(code)).toString(36)}`; }
  return { check, validate, pack, unpack, tryWord, riddleId, rules: R };
}
