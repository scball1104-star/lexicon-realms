// Lexicon Realms synth: seeded randomness. Audio only (never the sim's rng): the same seed gives the same theme
// on every machine, so a realm's music is stable and a party's letters can be turned into a seed.
//
//   const r = makeRng(seedFromText('Willowmere'));
//   r()            0..1
//   r.range(a, b)  float in [a, b)
//   r.int(a, b)    integer in [a, b]
//   r.pick(list)   one item
//   r.chance(p)    true with probability p

/** FNV-1a hash of a string to a 32-bit unsigned seed. "Music made from your letters" starts here. */
export function seedFromText(text) {
  let h = 0x811c9dc5;
  const s = String(text || '');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32: small, fast, good enough for music. */
export function makeRng(seed) {
  let a = (seed >>> 0) || 1;
  const r = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  r.range = (lo, hi) => lo + (hi - lo) * r();
  r.int = (lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  r.pick = (list) => list[Math.floor(r() * list.length)];
  r.chance = (p) => r() < p;
  r.fork = (salt) => makeRng((seed ^ seedFromText(String(salt))) >>> 0);
  return r;
}
