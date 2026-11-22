// The HUD's read-only view of the game (docs/CONTRACTS.md section 10). Built once per rendered frame from the latest
// snapshot; the HUD and menus read ONLY this (never the sim, never the renderer). Frozen so nobody writes back.
//
//   const vm = buildViewModel(snap, playerId, { zoneNames, log, tickHz })

const unit = (e, tick, tickHz) => e && {
  id: e.id, name: e.name, level: e.level, kind: e.kind, faction: e.faction, cls: e.cls || null,
  hp: e.hp, hpMax: e.hpMax, hpFrac: e.hpMax ? e.hp / e.hpMax : 0,
  res: e.res ? { kind: e.res.kind, cur: e.res.cur, max: e.res.max, frac: e.res.max ? e.res.cur / e.res.max : 0 } : null,
  dead: e.dead,
  cast: e.cast ? { ...e.cast, frac: e.cast.endTick > e.cast.startTick ? (tick - e.cast.startTick) / (e.cast.endTick - e.cast.startTick) : 1 } : null,
  auras: e.auras.map((a) => ({ ...a })),
  gcdLeft: Math.max(0, e.gcdUntil - tick) / tickHz,
};

export function buildViewModel(snap, playerId, { zoneNames = {}, log = [], tickHz = 20, place = null } = {}) {
  const byId = new Map(snap.entities.map((e) => [e.id, e]));
  const me = byId.get(playerId) || null;
  const target = me && me.target != null ? byId.get(me.target) : null;
  const vm = {
    tick: snap.tick,
    player: me ? { ...unit(me, snap.tick, tickHz), xp: me.xp || 0, zone: me.zone } : null,
    target: target ? unit(target, snap.tick, tickHz) : null,
    // online co-op (docs/NET.md): the other heroes of my party, up to 3, in id order (solo: none, no party id)
    party: me && me.party != null ? snap.entities.filter((e) => e.kind === 'player' && e.id !== me.id && e.party === me.party).slice(0, 3)
      .map((e) => ({ ...unit(e, snap.tick, tickHz), look: e.look || 0, zone: e.zone })) : [],
    // one world: `place` (src/data/maps/compose.js placeAt) names the area you stand in; area is its id
    zone: me ? { id: me.zone, name: (place && place.name) || zoneNames[me.zone] || me.zone, area: place ? place.id : null } : null,
    cooldowns: me ? Object.fromEntries(Object.entries(me.cd).map(([k, until]) => [k, Math.max(0, until - snap.tick) / tickHz])) : {},
    log: log.slice(-50),
    // the sim's rule-derived HUD block (CONTRACTS 10.1): bar, cast, xp, talents, gold, bag, equip, quests, markers
    hud: (snap.hud && playerId != null && snap.hud[playerId]) || null,
  };
  return deepFreeze(vm);
}

function deepFreeze(o) {
  if (o && typeof o === 'object' && !Object.isFrozen(o)) { Object.freeze(o); for (const v of Object.values(o)) deepFreeze(v); }
  return o;
}
