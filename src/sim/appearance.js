// Hero appearance in the sim (wave 6 item 8, the customization kit): the free mirror and the `set_app` command.
// The appearance itself is plain data (src/data/appearance.js): every field a small index, clamped here, so a command
// or a co-op friend's hero can only ever name a look that exists. Deterministic: no randomness, no clock.
//
//   const AP = createAppearance({ content, emit, get, distPx, reach, openReach, tileToSub })
//   AP.spawnMirrors(add, nextId)   one object entity per content.mirrors entry (`mirror: { id, place }`)
//   AP.open(e, mirror)             interact: out of combat, alive, in reach -> emit mirror_open (the UI opens the Look panel)
//   AP.set(e, cmd)                 { t: 'set_app', app }: at the mirror the hero opened -> e.app, emit app_set
//   AP.restore(e, spec)            addPlayer: spec.app (a save, a new hero) clamped onto the hero
// the sim imports only its own modules: the tables arrive as content.appearance (src/data/appearance.js appearanceContent)
const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
/** The same rule as src/data/appearance.js clampApp: each field clamped to its table, a missing or junk one from `fill`. */
export function clampAppSim(raw, sizes, fill) {
  if (!isObj(raw) || !sizes) return null;
  const out = { v: 1 };
  for (const [k, n] of Object.entries(sizes)) {
    const base = fill && Number.isInteger(fill[k]) ? Math.max(0, Math.min(n - 1, fill[k])) : (k === 'build' ? 1 : k === 'height' ? 2 : 0);
    const v = Number(raw[k]);
    out[k] = Number.isFinite(v) ? Math.max(0, Math.min(n - 1, Math.trunc(v))) : base;
  }
  return out;
}

export function createAppearance({ content, emit, get, distPx, reach, openReach, tileToSub }) {
  const AC = content.appearance || null;
  const fillOf = (e) => (AC && AC.fill[e.cls] ? AC.fill[e.cls][Math.max(0, Math.min(2, e.look | 0))] : null);
  const clamp = (raw, e) => (AC ? clampAppSim(raw, AC.sizes, fillOf(e)) : null);
  const fail = (e, id, reason) => { emit({ type: 'interact_fail', src: e.id, id, reason }); return false; };
  return {
    spawnMirrors(add, nextId) {
      for (const m of content.mirrors || []) {
        if (!content.zones[m.zone]) continue;
        const [x, y] = tileToSub(m.x, m.y);
        add({ id: nextId(), kind: 'object', zone: m.zone, x, y, dir: 'down', moving: false, name: m.name || 'Standing Mirror', level: 1, faction: 'neutral',
          sprite: 'mirror', template: m.id, hp: 1, hpMax: 1, res: null, target: null, cast: null, auras: [], cd: {}, gcdUntil: 0, dead: false,
          stats: { str: 0, agi: 0, int: 0, spi: 0, sta: 0, armor: 0 }, mirror: { id: m.id, place: m.place || null } });
      }
    },
    open(e, m) {
      if (distPx(e, m) > (openReach || reach)) return fail(e, m.id, 'range');
      if (e.dead) return fail(e, m.id, 'dead');
      if (e.inCombat) return fail(e, m.id, 'combat');
      e.mirrorAt = m.id;
      emit({ type: 'mirror_open', src: e.id, id: m.id, mirror: m.mirror.id });
      return true;
    },
    set(e, cmd) {
      const m = e.mirrorAt != null ? get(e.mirrorAt) : null;
      if (!m || !m.mirror || m.zone !== e.zone || distPx(e, m) > reach) return fail(e, cmd && cmd.mirror != null ? cmd.mirror : null, 'range');
      if (e.inCombat) return fail(e, m.id, 'combat');
      const a = clamp(cmd && cmd.app, e);
      if (!a) return fail(e, m.id, 'bad_app');
      e.app = a;
      emit({ type: 'app_set', id: e.id, mirror: m.id });
      return true;
    },
    restore(e, spec) {
      const a = spec && spec.app ? clamp(spec.app, e) : null;
      if (a) e.app = a;
    },
  };
}
