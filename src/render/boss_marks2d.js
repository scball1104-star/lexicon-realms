// Boss fight ground marks in 2D (wave 10 dbosses BUILD; the 3D twin is src/render3d/boss_marks3d.js; the sim is
// src/sim/boss_mech.js, the snapshot snap.bossMarks in px). Drawn under every actor, after today's red telegraphs:
//   share gold ring with pips (heroes inside), mark violet ring, letter a floor letter (green answered, gold next),
//   tether a teal line, red a boss's own red move (circle, line or cone) filling as it comes.
const COL = { share: [255, 198, 64], mark: [178, 107, 255], letter: [244, 234, 208], next: [255, 226, 122], done: [125, 255, 176], tether: [63, 224, 200], red: [255, 58, 32] };
const rgba = (c, a) => `rgba(${c[0]},${c[1]},${c[2]},${a})`;

export function drawBossMarks2d(g, marks, cam, zoneId, now = 0) {
  let n = 0;
  for (const m of marks || []) {
    if (m.zone !== zoneId) continue;
    const x = m.x - cam.x, y = m.y - cam.y, R = m.r || 16;
    n++;
    if (m.kind === 'tether') {
      g.strokeStyle = rgba(COL.tether, 0.6 + 0.3 * Math.sin(now * 8)); g.lineWidth = 2;
      g.beginPath(); g.moveTo(x, y); g.lineTo(m.to.x - cam.x, m.to.y - cam.y); g.stroke();
      continue;
    }
    if (m.kind === 'red') {
      const path = (r) => {
        g.beginPath();
        const d = m.dir || 0, cs = Math.cos(d), sn = Math.sin(d);
        if (m.shape === 'line') { const wd = (m.w || 16) / 2; g.moveTo(x - sn * wd, y + cs * wd); g.lineTo(x + sn * wd, y - cs * wd); g.lineTo(x + sn * wd + cs * r, y - cs * wd + sn * r); g.lineTo(x - sn * wd + cs * r, y + cs * wd + sn * r); g.closePath(); }
        else if (m.shape === 'cone') { const a = ((m.angle || 90) * Math.PI) / 360; g.moveTo(x, y); g.arc(x, y, r, d - a, d + a); g.closePath(); }
        else g.arc(x, y, r, 0, Math.PI * 2);
      };
      path(R); g.fillStyle = rgba(COL.red, 0.2); g.fill(); g.strokeStyle = rgba(COL.red, 0.95); g.lineWidth = 1; g.stroke();
      path(Math.max(1, R * (m.k || 0))); g.fillStyle = rgba(COL.red, 0.3); g.fill();
      continue;
    }
    const c = m.kind === 'letter' ? (m.done ? COL.done : m.next ? COL.next : COL.letter) : COL[m.kind] || COL.share;
    g.beginPath(); g.arc(x, y, R, 0, Math.PI * 2); g.fillStyle = rgba(c, m.kind === 'letter' && m.next ? 0.3 : 0.16); g.fill();
    g.strokeStyle = rgba(c, 0.95); g.lineWidth = 2; g.stroke();
    if (m.kind === 'share' || m.kind === 'mark') { g.beginPath(); g.arc(x, y, Math.max(1, R * (m.k || 0)), 0, Math.PI * 2); g.fillStyle = rgba(c, 0.3); g.fill(); }
    if (m.kind === 'share' && m.of) for (let j = 0; j < Math.min(4, m.of); j++) {
      const a = -Math.PI / 2 + (j - (m.of - 1) / 2) * 0.42;
      g.beginPath(); g.arc(x + Math.cos(a) * R * 0.78, y + Math.sin(a) * R * 0.78, 2, 0, Math.PI * 2); g.fillStyle = j < (m.n || 0) ? rgba(c, 1) : 'rgba(90,74,42,1)'; g.fill();
    }
    if (m.kind === 'letter') {
      g.font = 'bold 14px Georgia, serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
      g.fillStyle = 'rgba(10,8,16,0.9)'; g.fillText(m.letter || '?', x + 1, y + 2);
      g.fillStyle = rgba(c, 1); g.fillText(m.letter || '?', x, y + 1);
      g.textAlign = 'left'; g.textBaseline = 'alphabetic';
    }
  }
  return n;
}
