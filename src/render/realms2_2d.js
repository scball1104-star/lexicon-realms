// The realms2 start realms' signature mechanics in the 2D view (wave 3, 2026-11-22). Pure drawing from the snapshot and
// the shared helpers in src/data/realms2.js (the sim runs the same rules: src/sim/realms2.js).
//
//   drawRealms2Ground(g, snap, posOf, cam, zoneId)        under every actor: the watch's lantern cones on the cobbles
//   drawRealms2Over(g, snap, posOf, cam, zoneId, W, H, followId, now)   over the world: fog banks, the sandstorm
//
// The Nameless Hollow: each grey watchman throws a cone of warm light the way he faces (the cone the sim sees with), and
// the drifting fog banks show as soft grey clouds. Saffron Haven: in a storm the view goes ochre except a small clear
// ring round the hero (the sight the storm leaves), with streaks of sand blowing east toward the wall.
import { R2, R2_RULES, stormAt, fogBanksAt, DIR_VEC } from '../data/realms2.js';

const WATCH = new Set(Object.entries(R2.mobs).filter(([, m]) => m.watch).map(([id]) => id));
const TILE = 16;

export function drawRealms2Ground(g, snap, posOf, cam, zoneId) {
  const Wt = R2_RULES.watch;
  if (zoneId !== Wt.zone || !snap) return 0;
  const len = Wt.coneTiles * TILE, half = (Wt.halfAngle * Math.PI) / 180;
  let n = 0;
  g.save();
  for (const e of snap.entities) {
    if (e.kind !== 'mob' || e.dead || e.zone !== zoneId || !WATCH.has(e.template)) continue;
    const p = posOf(e.id) || [e.x, e.y];
    const x = p[0] - cam.x, y = p[1] - cam.y;
    if (x < -len || y < -len || x > g.canvas.width + len || y > g.canvas.height + len) continue;
    const v = DIR_VEC[e.dir] || DIR_VEC.down, a = Math.atan2(v[1], v[0]);
    const grad = g.createRadialGradient(x, y, 4, x, y, len);
    grad.addColorStop(0, 'rgba(255,214,120,0.6)'); grad.addColorStop(0.7, 'rgba(255,190,90,0.34)'); grad.addColorStop(1, 'rgba(255,170,70,0)');
    g.fillStyle = grad;
    g.beginPath(); g.moveTo(x, y); g.arc(x, y, len, a - half, a + half); g.closePath(); g.fill();
    n++;
  }
  g.restore();
  return n;
}

export function drawRealms2Over(g, snap, posOf, cam, zoneId, W, H, followId, now) {
  if (!snap) return null;
  const tick = snap.tick || 0;
  if (zoneId === R2_RULES.watch.zone) {
    g.save();
    for (const f of fogBanksAt(tick)) {
      const x = f.x * TILE - cam.x, y = f.y * TILE - cam.y, r = f.r * TILE;
      if (x < -r * 1.5 || y < -r * 1.5 || x > W + r * 1.5 || y > H + r * 1.5) continue;
      for (let i = 0; i < 4; i++) {
        const ox = Math.sin(now * 0.3 + i * 1.7) * r * 0.35, oy = Math.cos(now * 0.25 + i * 2.3) * r * 0.25;
        const grad = g.createRadialGradient(x + ox, y + oy, 2, x + ox, y + oy, r * (0.8 + 0.15 * i));
        grad.addColorStop(0, 'rgba(196,200,214,0.42)'); grad.addColorStop(1, 'rgba(196,200,214,0)');
        g.fillStyle = grad; g.fillRect(x + ox - r * 1.2, y + oy - r * 1.2, r * 2.4, r * 2.4);
      }
    }
    g.restore();
    return { fog: true };
  }
  if (zoneId === R2_RULES.storm.zone) {
    const st = stormAt(tick);
    if (st.k <= 0) return { storm: 0, phase: st.phase };
    const me = followId != null ? snap.entities.find((e) => e.id === followId) : null;
    const p = me ? (posOf(me.id) || [me.x, me.y]) : [cam.x + W / 2, cam.y + H / 2];
    const x = p[0] - cam.x, y = p[1] - cam.y - 8;
    const clear = (R2_RULES.storm.sightTiles + (1 - st.k) * 20) * TILE;
    g.save();
    const grad = g.createRadialGradient(x, y, clear * 0.35, x, y, clear * 1.25);
    grad.addColorStop(0, 'rgba(214,160,80,0)'); grad.addColorStop(1, `rgba(198,138,62,${(0.86 * st.k).toFixed(3)})`);
    g.fillStyle = grad; g.fillRect(0, 0, W, H);
    // blowing sand: streaks drifting east
    g.fillStyle = `rgba(250,220,160,${(0.5 * st.k).toFixed(3)})`;
    for (let i = 0; i < 90; i++) {
      const sx = ((i * 97.3 + now * (260 + (i % 7) * 30) - cam.x * 0.3) % (W + 40) + W + 40) % (W + 40) - 20;
      const sy = ((i * 53.9 + Math.sin(now + i) * 6 - cam.y * 0.3) % H + H) % H;
      g.fillRect(Math.round(sx), Math.round(sy), 6 + (i % 5) * 2, 1);
    }
    g.restore();
    return { storm: st.k, phase: st.phase };
  }
  return null;
}
