// A small QR code encoder (byte mode, versions 1 to 10, error correction M), so the PC can show its pairing link as a
// code the phone's camera opens (wave 9 second screen, docs/NET.md "Phone as a second screen"). Pure, no DOM, no
// library: written from the QR standard (ISO/IEC 18004). qa/tests/second.test.mjs checks the Reed-Solomon maths and the
// format bits against the standard's known values. Not yet scanned by a real phone camera: Scott's phone is the first
// test after it ships (the link as text under it always works).
//
//   const q = qrEncode('https://site/#pair=ABCDE.KEY')   -> { size, version, mask, dark(x, y) } | null (too long)
//   qrDraw(ctx, q, x, y, px)                             dark modules on a light square with the 4-module quiet zone

const ECC_M = { bits: 0, perBlock: [0, 10, 16, 26, 18, 24, 16, 18, 22, 22, 26], blocks: [0, 1, 1, 1, 2, 2, 4, 4, 4, 5, 5] };

function rawModules(ver) {
  let n = (16 * ver + 128) * ver + 64;
  if (ver >= 2) {
    const na = Math.floor(ver / 7) + 2;
    n -= (25 * na - 10) * na - 55;
    if (ver >= 7) n -= 36;
  }
  return n;
}
const dataCodewords = (ver) => Math.floor(rawModules(ver) / 8) - ECC_M.perBlock[ver] * ECC_M.blocks[ver];

// ---------------------------------------------------------------- Reed-Solomon over GF(256), poly 0x11D
export function gfMul(x, y) {
  let z = 0;
  for (let i = 7; i >= 0; i--) { z = (z << 1) ^ ((z >>> 7) * 0x11d); z ^= ((y >>> i) & 1) * x; }
  return z & 0xff;
}
export function rsDivisor(degree) {
  const r = new Array(degree).fill(0);
  r[degree - 1] = 1;
  let root = 1;
  for (let i = 0; i < degree; i++) {
    for (let j = 0; j < r.length; j++) { r[j] = gfMul(r[j], root); if (j + 1 < r.length) r[j] ^= r[j + 1]; }
    root = gfMul(root, 0x02);
  }
  return r;
}
export function rsRemainder(data, divisor) {
  const r = new Array(divisor.length).fill(0);
  for (const b of data) {
    const f = b ^ r.shift();
    r.push(0);
    divisor.forEach((c, i) => { r[i] ^= gfMul(c, f); });
  }
  return r;
}

/** The 15 format bits for error level bits (M = 0) and a mask, BCH coded and XORed with 0x5412. */
export function formatBits(eclBits, mask) {
  const data = (eclBits << 3) | mask;
  let rem = data;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  return ((data << 10) | rem) ^ 0x5412;
}
function versionBits(ver) {
  let rem = ver;
  for (let i = 0; i < 12; i++) rem = (rem << 1) ^ ((rem >>> 11) * 0x1f25);
  return (ver << 12) | rem;
}
function alignPositions(ver, size) {
  if (ver === 1) return [];
  const na = Math.floor(ver / 7) + 2;
  const step = Math.ceil((ver * 4 + 4) / (na * 2 - 2)) * 2;
  const out = [6];
  for (let pos = size - 7; out.length < na; pos -= step) out.splice(1, 0, pos);
  return out;
}
const MASKS = [
  (x, y) => (x + y) % 2 === 0, (x, y) => y % 2 === 0, (x) => x % 3 === 0, (x, y) => (x + y) % 3 === 0,
  (x, y) => (Math.floor(x / 3) + Math.floor(y / 2)) % 2 === 0, (x, y) => ((x * y) % 2) + ((x * y) % 3) === 0,
  (x, y) => (((x * y) % 2) + ((x * y) % 3)) % 2 === 0, (x, y) => (((x + y) % 2) + ((x * y) % 3)) % 2 === 0,
];

/** The data codewords with error correction, blocks interleaved (the order they are laid in the symbol). */
export function codewords(bytes, ver) {
  const cap = dataCodewords(ver);
  const bits = [];
  const put = (v, n) => { for (let i = n - 1; i >= 0; i--) bits.push((v >>> i) & 1); };
  put(0b0100, 4);
  put(bytes.length, ver <= 9 ? 8 : 16);
  for (const b of bytes) put(b, 8);
  put(0, Math.min(4, cap * 8 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; data.length < cap; pad ^= 0xec ^ 0x11) data.push(pad);
  const nb = ECC_M.blocks[ver], el = ECC_M.perBlock[ver], raw = Math.floor(rawModules(ver) / 8);
  const nShort = nb - (raw % nb), shortLen = Math.floor(raw / nb);
  const div = rsDivisor(el), blocks = [];
  for (let i = 0, k = 0; i < nb; i++) {
    const dat = data.slice(k, k + shortLen - el + (i < nShort ? 0 : 1));
    k += dat.length;
    const ecc = rsRemainder(dat, div);
    if (i < nShort) dat.push(0);
    blocks.push(dat.concat(ecc));
  }
  const out = [];
  for (let i = 0; i < blocks[0].length; i++) for (let j = 0; j < blocks.length; j++) if (i !== shortLen - el || j >= nShort) out.push(blocks[j][i]);
  return out;
}

function penalty(m, size) {
  let p = 0;
  for (let pass = 0; pass < 2; pass++) {
    for (let a = 0; a < size; a++) {
      let run = 1;
      for (let b = 1; b <= size; b++) {
        const same = b < size && (pass ? m[b][a] === m[b - 1][a] : m[a][b] === m[a][b - 1]);
        if (same) run++; else { if (run >= 5) p += run - 2; run = 1; }
      }
    }
  }
  for (let y = 0; y + 1 < size; y++) for (let x = 0; x + 1 < size; x++) { const c = m[y][x]; if (c === m[y][x + 1] && c === m[y + 1][x] && c === m[y + 1][x + 1]) p += 3; }
  let dark = 0;
  for (const row of m) for (const c of row) if (c) dark++;
  p += Math.floor(Math.abs(dark * 20 - size * size * 10) / (size * size)) * 10;
  return p;
}

export function qrEncode(text) {
  const bytes = [...new TextEncoder().encode(String(text))];
  let ver = 1;
  while (ver <= 10 && dataCodewords(ver) * 8 < 4 + (ver <= 9 ? 8 : 16) + bytes.length * 8) ver++;
  if (ver > 10) return null;
  const size = ver * 4 + 17;
  const mod = Array.from({ length: size }, () => new Array(size).fill(false));
  const fn = Array.from({ length: size }, () => new Array(size).fill(false));
  const set = (x, y, d) => { mod[y][x] = d; fn[y][x] = true; };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [size - 4, 3], [3, size - 4]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)), x = cx + dx, y = cy + dy;
      if (x >= 0 && x < size && y >= 0 && y < size) set(x, y, d !== 2 && d !== 4);
    }
  }
  const al = alignPositions(ver, size), last = al.length - 1;
  for (let i = 0; i < al.length; i++) for (let j = 0; j < al.length; j++) {
    if ((i === 0 && j === 0) || (i === 0 && j === last) || (i === last && j === 0)) continue;
    for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(al[i] + dx, al[j] + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  }
  const drawFormat = (mask) => {
    const b = formatBits(ECC_M.bits, mask), bit = (i) => ((b >>> i) & 1) === 1;
    for (let i = 0; i <= 5; i++) set(8, i, bit(i));
    set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
    for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
    for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
    for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
    set(8, size - 8, true);
  };
  drawFormat(0);
  if (ver >= 7) {
    const vb = versionBits(ver);
    for (let i = 0; i < 18; i++) { const d = ((vb >>> i) & 1) === 1, a = size - 11 + (i % 3), b = Math.floor(i / 3); set(a, b, d); set(b, a, d); }
  }
  const cw = codewords(bytes, ver);
  let k = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let v = 0; v < size; v++) for (let j = 0; j < 2; j++) {
      const x = right - j, up = ((right + 1) & 2) === 0, y = up ? size - 1 - v : v;
      if (!fn[y][x] && k < cw.length * 8) { mod[y][x] = ((cw[k >>> 3] >>> (7 - (k & 7))) & 1) === 1; k++; }
    }
  }
  let best = null;
  for (let mask = 0; mask < 8; mask++) {
    const m = mod.map((row, y) => row.map((d, x) => (fn[y][x] ? d : d !== MASKS[mask](x, y))));
    const keep = mod.map((r) => r.slice());
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) mod[y][x] = m[y][x];
    drawFormat(mask);
    const p = penalty(mod, size);
    if (!best || p < best.p) best = { p, mask, m: mod.map((r) => r.slice()) };
    for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) mod[y][x] = keep[y][x];
  }
  const m = best.m;
  return { size, version: ver, mask: best.mask, dark: (x, y) => !!(m[y] && m[y][x]) };
}

/** Draw on a 2D canvas: a light square with the quiet zone, dark modules, px css px per module. */
export function qrDraw(ctx, q, x, y, px, { dark = '#14101e', light = '#f6f0de' } = {}) {
  const full = (q.size + 8) * px;
  ctx.fillStyle = light; ctx.fillRect(x, y, full, full);
  ctx.fillStyle = dark;
  for (let yy = 0; yy < q.size; yy++) for (let xx = 0; xx < q.size; xx++) if (q.dark(xx, yy)) ctx.fillRect(x + (xx + 4) * px, y + (yy + 4) * px, px, px);
  return full;
}
