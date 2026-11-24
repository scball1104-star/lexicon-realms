// Quest scenes (wave 6, PLAN item 9, approved by Scott 2026-11-24; brief D:\LQOnline\wave6\questpres\BRIEF.md): the pace
// the words of a talk arrive at, and how the voice murmur splits them. Pure (tests run it in Node). One `pace()` drives
// both the letters on screen (talk_ui.js) and the murmur under them (src/audio/talk_voice.js), so they stay together.
//
//   pace(text)      -> { total, at(sec) chars shown, time(i) when letter i shows }   45 letters a second, a short rest at
//                      a comma and a longer one at the end of a sentence
//   phrases(text)   -> [{ text, start, end, mark: '.' | ',' | '?' | '!' }]   up to each comma or end of sentence
//
// The words are never changed: this only says WHEN each letter of the quest's own text shows.

export const LETTERS_PER_SEC = 45;

export function pace(text) {
  const s = String(text || '');
  const marks = new Array(s.length);
  let t = 0;
  for (let i = 0; i < s.length; i++) {
    marks[i] = t;
    const c = s[i], nx = s[i + 1] || ' ';
    t += 1 / LETTERS_PER_SEC;
    if (nx === ' ' && (c === ',' || c === ';' || c === ':')) t += 0.12;
    if (nx === ' ' && (c === '.' || c === '!' || c === '?')) t += 0.3;
  }
  return {
    total: t,
    /** letters shown `sec` seconds in (a binary search: long texts are paced every frame) */
    at(sec) {
      let lo = 0, hi = marks.length;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (marks[mid] <= sec) lo = mid + 1; else hi = mid; }
      return lo;
    },
    time: (i) => (marks.length ? marks[Math.max(0, Math.min(marks.length - 1, i))] : 0),
  };
}

export function phrases(text) {
  const s = String(text || '');
  const out = [];
  let a = 0;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (/[.,;:!?]/.test(c) && (s[i + 1] === ' ' || i === s.length - 1)) {
      if (s.slice(a, i + 1).trim()) out.push({ text: s.slice(a, i + 1).trim(), start: a, end: i + 1, mark: c === ';' || c === ':' ? ',' : c });
      a = i + 1;
    }
  }
  if (a < s.length && s.slice(a).trim()) out.push({ text: s.slice(a).trim(), start: a, end: s.length, mark: '.' });
  return out;
}
