// Mount rules (2026-11-22, D:/LQOnline/mounts/BRIEF.md). Pure (no DOM, no clock, no randomness): the data arrives as
// content.mounts and the summons as content.abilities (src/data/mounts.js via src/data/maps/index.js buildContent).
//
// Riding is an aura: the summon (a 1.5 s cast, `requires: { outOfCombat, rideable }`) puts the mount's riding aura on
// the hero (flag 'mounted', a speed mod, no end, broken by damage). Casting it again gets you off (`toggle`).
// Getting off on an attack or a cast is combat.js breakStealth (any action breaks a 'mounted' aura); on a hit, the
// aura's own breakOn 'damage'; at a door (the zone is not open land), on a flight, the Lantern Stone, a gather or craft,
// sitting or death, tickPlayer below.
//
//   const M = createMounts(C)               C: the world's context (state, content, emit, combat, ...)
//   rideable(zone)                          open land? zone.mounts (true | false) wins, else zone.kind 'field' (the default)
//   M.isMountItem(itemId)                   a stable good (items kind 'mount')
//   M.buy(e, def)                           a vendor buy of one (world.js vendorBuy): checks, then teaches the summon
//   M.command(e, cmd)                       'mount' { kind? }: on your mount, get off; else summon `kind` (or your pick)
//   M.mountOf(e)                            the kind ridden, or null
//   M.dismount(e, reason)                   get off now (emits aura_remove and `dismount { id, kind, reason }`)
//   M.tickPlayer(e)                         the door, flight, stone, work, sit and death rules
//   M.restore(e, spec) / M.saveOf(e)        save fields: mounts (owned kinds), mountPick; missing = none
//   M.publicOf(e)                           snapshot fields: mount (kind | null), mounts (owned)
//
// Events: mount_learn { id, kind, name, ability }, mount_fail { id, reason: none | known | level | combat | indoors },
// dismount { id, kind, reason: cancel | action | damage | indoors | flight | cast | sit | dead }.

export const MOUNT_FLAG = 'mounted';         // the riding aura's flag (src/data/mounts.js MOUNT_FLAG says the same)

/** Is a zone open land a hero may ride on? The zone flag `mounts` wins; otherwise any 'field' zone (the world, the
 *  Rootbound, later realms) is, and a dungeon, cave or interior is not. */
export function rideable(zone) {
  if (!zone) return false;
  if (zone.mounts != null) return !!zone.mounts;
  return (zone.kind || 'field') === 'field';
}

export function createMounts(C) {
  const { content, emit } = C;
  const MT = content.mounts || null;
  const kinds = (MT && MT.kinds) || {};
  const FLAG = (MT && MT.flag) || MOUNT_FLAG;
  const mountAura = (e) => (e.auras || []).find((a) => a.def && a.def.flags && a.def.flags.includes(FLAG)) || null;
  const owned = (e) => (MT ? MT.order.filter((k) => (e.known || []).includes(kinds[k].ability)) : []);

  function isMountItem(id) { return !!(MT && MT.byItem[id]); }
  function mountOf(e) { const a = mountAura(e); return a ? (a.def.mount || (MT && MT.byAbility[a.id]) || null) : null; }

  function learn(e, k) {
    const m = kinds[k];
    if (!m) return false;
    // the first mount goes on the bar like a skill; later ones wait in the spare skills (Z rides the last one bought)
    const another = (e.bar || []).some((x) => x && MT.byAbility[x]);
    if (C.prog && !another) C.prog.learn(e, m.ability);
    else {
      if (!(e.known || []).includes(m.ability)) (e.known = e.known || []).push(m.ability);
      if (Array.isArray(e.barOff) && !e.barOff.includes(m.ability)) e.barOff.push(m.ability);
    }
    e.mountPick = k;
    emit({ type: 'mount_learn', id: e.id, kind: k, name: m.name, ability: m.ability });
    return true;
  }

  /** A vendor buy (world.js has checked the range, the stock entry and the gold): returns a fail reason or null. */
  function buy(e, def) {
    const k = MT && MT.byItem[def.id];
    if (!k) return 'no_item';
    if ((e.known || []).includes(kinds[k].ability)) return 'known';
    if ((def.reqLevel || 1) > (e.level || 1)) return 'level';
    learn(e, k);
    return null;
  }

  function dismount(e, reason) {
    const a = mountAura(e);
    if (!a) return false;
    const k = mountOf(e);
    if (C.combat) C.combat.removeAura(e, a, reason === 'cancel' ? 'cancel' : 'break');
    else e.auras.splice(e.auras.indexOf(a), 1);
    emit({ type: 'dismount', id: e.id, kind: k, reason });
    return true;
  }

  function command(e, cmd) {
    const fail = (reason) => { emit({ type: 'mount_fail', id: e.id, reason }); return false; };
    if (!MT || !C.combat) return fail('none');
    if (mountOf(e)) return dismount(e, 'cancel');
    const have = owned(e);
    if (!have.length) return fail('none');
    const want = cmd && cmd.kind && have.includes(cmd.kind) ? cmd.kind : have.includes(e.mountPick) ? e.mountPick : have[have.length - 1];
    if (e.inCombat) return fail('combat');
    if (!rideable(C.zoneOf(e))) return fail('indoors');
    e.mountPick = want;
    return C.combat.cast(e, { t: 'cast', ability: kinds[want].ability });
  }

  function tickPlayer(e) {
    if (!MT) return;
    // a summon finishing: remember the pick (Z summons the last one ridden)
    const k = mountOf(e);
    if (!k) return;
    if (e.mountPick !== k) e.mountPick = k;
    if (e.dead) return void dismount(e, 'dead');
    if (!rideable(C.zoneOf(e))) return void dismount(e, 'indoors');         // through a door: off at the step
    if (e.flight) return void dismount(e, 'flight');
    if (e.hearth || e.work || (e.cast && !(MT.byAbility[e.cast.ability]))) return void dismount(e, 'cast');
    if (e.sitting) return void dismount(e, 'sit');
  }

  function restore(e, spec) {
    if (!MT || !spec) return;
    const list = Array.isArray(spec.mounts) ? spec.mounts.filter((k) => kinds[k]) : [];
    for (const k of list) if (!(e.known || []).includes(kinds[k].ability)) { e.known.push(kinds[k].ability); }
    if (spec.mountPick && kinds[spec.mountPick]) e.mountPick = spec.mountPick;
  }
  function saveOf(e) {
    const list = owned(e);
    return list.length ? { mounts: list, ...(e.mountPick ? { mountPick: e.mountPick } : {}) } : {};
  }
  function publicOf(e) {
    const list = owned(e);
    return { mount: mountOf(e), ...(list.length ? { mounts: list } : {}) };
  }

  return { isMountItem, mountOf, buy, command, dismount, tickPlayer, restore, saveOf, publicOf, owned, rideable };
}
