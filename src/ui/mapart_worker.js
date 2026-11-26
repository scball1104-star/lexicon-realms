// Map art worker (BRIEF.md section 5): bakes vellum map pieces off the main thread, so a bake never stalls a frame.
//   in:  { t: 'zone', zi, fields }                       a zone's tile data (mapart.js zoneFields), once per zone
//        { t: 'bake', id, zi, ppt, tx0, ty0, tw, th }    one piece (a 32x32-tile minimap chunk or a world map view)
//   out: { t: 'done', id, w, h, buf, ms }                RGBA pixels (buf is transferred, not copied)
//        { t: 'fail', id, err }
import { prepare, bakeVellum } from './mapart.js';

const prepared = new Map();      // zi -> prepare() result (the last three zones)
const fields = new Map();

self.onmessage = (ev) => {
  const m = ev.data;
  if (m.t === 'zone') { fields.set(m.zi, m.fields); return; }
  if (m.t !== 'bake') return;
  try {
    let P = prepared.get(m.zi);
    if (!P) {
      const F = fields.get(m.zi);
      if (!F) throw new Error(`zone ${m.zi} not sent`);
      P = prepare(F);
      prepared.set(m.zi, P);
      while (prepared.size > 3) prepared.delete(prepared.keys().next().value);
    }
    const t0 = performance.now();
    const img = bakeVellum(P, m.ppt, m.tx0, m.ty0, m.tw, m.th);
    const buf = img.data.buffer;
    self.postMessage({ t: 'done', id: m.id, w: img.w, h: img.h, buf, ms: performance.now() - t0 }, [buf]);
  } catch (e) {
    self.postMessage({ t: 'fail', id: m.id, err: String(e && e.message || e) });
  }
};
