// Mounts (2026-11-22, D:/LQOnline/mounts/BRIEF.md section 7): Wynn's three mounts, buying teaches the summon, the
// 1.5 s summon out of a fight, the speed, every get-off rule (attack, cast, hit, the door, a flight), refused indoors
// (a zone flag, not a list of names), saves keep them, co-op frames carry the ridden mount, Z and the phone horseshoe.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/index.js';
import { buildContent, WORLD } from '../../src/data/maps/index.js';
import { MOUNTS, MOUNT_ORDER, MOUNT_NPC_SPAWNS, STABLE, MOUNT_ITEMS, MOUNT_ABILITIES, MOUNT_NPCS } from '../../src/data/mounts.js';
import { rideable } from '../../src/sim/mounts.js';
import { spotFree } from '../../src/sim/collision.js';
import { framesFor, createFrameState, applyFrame } from '../../src/net/frames.js';
import { guestCommandOk } from '../../src/net/session.js';
import { routeKey, ACTION_BY_ID } from '../../src/ui/keymap.js';
import { helpSections } from '../../src/ui/help.js';
import { hudLayout, inRect } from '../../src/ui/layout.js';
import { eventLines } from '../../src/ui/eventlog.js';
import { mountLift, drawMount2d, MOUNT_LIFT_PX } from '../../src/render/mount2d.js';

const C = buildContent();
const world = (seed = 7) => createWorld({ seed, content: C });
function run(w, n, pred = null) {
  const out = [];
  for (let i = 0; i < n; i++) { const ev = w.step(); out.push(...ev); if (pred && ev.some(pred)) break; }
  return out;
}
const npcOf = (w, template) => w.state.ents.find((e) => e.kind === 'npc' && e.template === template);
const besideNpc = (w, id, n) => { const e = w.get(id); e.zone = n.zone; e.x = n.x + 16 * 16; e.y = n.y; };
const ROAD = { zone: 'world', x: 160, y: 120 };   // the North Road, open ground
/** A hero on the North Road who owns `kinds` (in the save's way: the known summons). */
function rider(kinds = ['bay_horse'], extra = {}) {
  const w = world();
  const id = w.addPlayer({ name: 'Rook', cls: 'warden', level: 20, gold: 0, ...ROAD, known: kinds.map((k) => MOUNTS[k].ability), ...extra });
  const e0 = w.get(id);                               // no foe near the test road (a rare can roll its spawn here)
  for (const m of w.state.ents) if (m.kind === 'mob' && m.zone === e0.zone && (Math.hypot(m.x - e0.x, m.y - e0.y) < 40 * 16 || /^rare_/.test(m.template))) { m.dead = true; m.hp = 0; m.respawnAt = 1e9; }
  run(w, 25);                                         // past the first global cooldown
  return { w, id, e: w.get(id) };
}
function summon(w, id, kind = null) {
  w.enqueue(id, { t: 'mount', ...(kind ? { kind } : {}) });
  return run(w, 40, (x) => x.type === 'aura_add' && x.dst === id && /^mount_/.test(x.aura));
}
/** Pixels walked in one second east (20 ticks), from standing. */
function pace(w, id) {
  const e = w.get(id), x0 = e.x;
  w.enqueue(id, { t: 'move', dx: 1, dy: 0 });
  run(w, 20);
  w.enqueue(id, { t: 'stop' }); w.step();
  return (e.x - x0) / 16;
}
const nearestFoe = (w, e) => w.state.ents.filter((m) => m.kind === 'mob' && !m.dead && m.zone === e.zone && m.faction === 'hostile')
  .sort((a, b) => Math.hypot(a.x - e.x, a.y - e.y) - Math.hypot(b.x - e.x, b.y - e.y))[0];

export const tests = [
  { name: 'mounts data: the three the brief names, at its prices, levels and speeds; Wynn sells them on the riverside lane', fn() {
    eq(MOUNT_ORDER.join(','), 'bay_horse,moor_stag,grey_charger', 'three mounts');
    eq(`${MOUNTS.bay_horse.level}/${MOUNTS.bay_horse.price}/${MOUNTS.bay_horse.speed}`, '10/100/0.6', 'Bay Horse: level 10, 100 gold, +60%');
    for (const k of ['moor_stag', 'grey_charger']) eq(`${MOUNTS[k].level}/${MOUNTS[k].price}/${MOUNTS[k].speed}`, '20/1000/1', `${k}: level 20, 1,000 gold, +100%`);
    for (const k of MOUNT_ORDER) {
      eq(C.items[MOUNTS[k].item].price, MOUNTS[k].price, `${k} price in content`);
      eq(C.abilities[MOUNTS[k].ability].castTime, 1.5, `${k} summon is 1.5 s`);
    }
    eq(JSON.stringify(C.npcs.wynn.vendor.items.map((s) => s.item)), JSON.stringify(MOUNT_ORDER.map((k) => MOUNTS[k].item)), 'Wynn sells the three');
    const sp = C.spawns.find((s) => s.npc === 'wynn');
    assert(sp && sp.zone === 'world', 'Wynn spawns in the world');
    assert(spotFree(C.zones.world, sp.x, sp.y), 'her tile is walkable');
    eq(MOUNT_NPC_SPAWNS[0].region, 'willowmere', 'in Willowmere');
    for (const [t, x, y] of STABLE.decor) assert(WORLD.decor.some((d) => d.t === t && d.x === x && d.y === y), `yard decor ${t}`);
    const text = JSON.stringify([MOUNTS, MOUNT_ITEMS, MOUNT_ABILITIES, MOUNT_NPCS]);
    assert(!/[\u2013\u2014]/.test(text), 'no em or en dashes in mount text');
  } },

  { name: 'buying: level and gold gates, it teaches the summon (no bag item), and a second buy is refused', fn() {
    const w = world();
    const id = w.addPlayer({ name: 'Buy', cls: 'mender', ...ROAD, level: 9, gold: 1200 });
    const e = w.get(id);
    const wy = npcOf(w, 'wynn');
    besideNpc(w, id, wy);
    w.enqueue(id, { t: 'interact', id: wy.id });
    const shop = run(w, 2).find((x) => x.type === 'interact' && x.src === id);
    eq(JSON.stringify(shop.vendor.items.map((x) => x.reqLevel)), '[10,20,20]', 'the shop window shows the real levels');
    const buy = (index) => { w.enqueue(id, { t: 'buy', npc: wy.id, index }); return run(w, 1); };
    let ev = buy(0);
    assert(ev.some((x) => x.type === 'inventory_fail' && x.reason === 'level'), 'level 9 cannot buy the Bay Horse');
    eq(e.gold, 1200, 'no gold taken');
    w.setLevel(id, 10);
    ev = buy(0);
    assert(ev.some((x) => x.type === 'mount_learn' && x.kind === 'bay_horse'), 'mount_learn');
    eq(e.gold, 1100, '100 gold');
    assert(e.known.includes('mount_bay_horse'), 'the summon is known');
    assert(!e.bag.some((s) => /^mount_/.test(s.item)), 'no bag item');
    ev = buy(0);
    assert(ev.some((x) => x.type === 'inventory_fail' && x.reason === 'known'), 'a second Bay Horse is refused');
    eq(e.gold, 1100, 'and costs nothing');
    ev = buy(1);
    assert(ev.some((x) => x.type === 'inventory_fail' && x.reason === 'level'), 'the Moor Stag needs level 20');
    w.setLevel(id, 20); e.gold = 999;
    ev = buy(2);
    assert(ev.some((x) => x.type === 'inventory_fail' && x.reason === 'gold'), '999 gold is not enough for the Grey Charger');
    e.gold = 1000;
    ev = buy(2);
    assert(ev.some((x) => x.type === 'mount_learn' && x.kind === 'grey_charger'), 'Grey Charger bought');
    eq(e.gold, 0, '1,000 gold');
    eq(e.bar.filter((x) => x && /^mount_/.test(x)).join(','), 'mount_bay_horse', 'only the first mount takes a bar slot');
    assert(e.barOff.includes('mount_grey_charger'), 'the second waits in the spare skills');
    const snap = w.snapshot().entities.find((x) => x.id === id);
    eq(JSON.stringify(snap.mounts), '["bay_horse","grey_charger"]', 'snapshot lists the owned mounts');
  } },

  { name: 'summon: a 1.5 s cast, then +60% (Bay Horse) or +100% (level 20); Z again gets you off', fn() {
    const { w, id, e } = rider(['bay_horse', 'moor_stag']);
    const walk = pace(w, id);
    w.enqueue(id, { t: 'mount', kind: 'bay_horse' });
    const ev = run(w, 40, (x) => x.type === 'aura_add' && x.dst === id);
    const st = ev.find((x) => x.type === 'cast_start' && x.ability === 'mount_bay_horse');
    const on = ev.find((x) => x.type === 'aura_add' && x.aura === 'mount_bay_horse');
    assert(st && on, 'cast then aura');
    eq(on.tick - st.tick, 30, '30 ticks = 1.5 s');
    eq(w.snapshot().entities.find((x) => x.id === id).mount, 'bay_horse', 'snapshot mount');
    const horse = pace(w, id);
    assert(Math.abs(horse / walk - 1.6) < 0.06, `Bay Horse pace ${horse} vs walk ${walk}`);
    w.enqueue(id, { t: 'mount' }); w.step();
    eq(w.internals.mounts.mountOf(e), null, 'Z again: off');
    summon(w, id, 'moor_stag');
    eq(w.internals.mounts.mountOf(e), 'moor_stag', 'on the stag');
    const stag = pace(w, id);
    assert(Math.abs(stag / walk - 2) < 0.08, `Moor Stag pace ${stag} vs walk ${walk}`);
    eq(e.mountPick, 'moor_stag', 'Z remembers the last one ridden');
  } },

  { name: 'no summon in combat, and none without a mount', fn() {
    const { w, id, e } = rider();
    e.inCombat = true;
    w.enqueue(id, { t: 'mount' });
    let ev = run(w, 2);
    assert(ev.some((x) => x.type === 'mount_fail' && x.reason === 'combat'), 'mount_fail combat');
    e.inCombat = true;
    w.enqueue(id, { t: 'cast', ability: 'mount_bay_horse' });
    ev = run(w, 2);
    assert(ev.some((x) => x.type === 'cast_fail' && x.reason === 'combat'), 'the summon itself refuses in a fight');
    const w2 = world();
    const id2 = w2.addPlayer({ name: 'Foot', cls: 'warden', ...ROAD });
    w2.enqueue(id2, { t: 'mount' });
    assert(run(w2, 2).some((x) => x.type === 'mount_fail' && x.reason === 'none'), 'no mount owned');
  } },

  { name: 'get off: casting a skill, starting an attack, being hit', fn() {
    // a cast (the Mender's Mend on herself)
    let { w, id, e } = rider(['bay_horse'], { cls: 'mender' });
    summon(w, id);
    w.enqueue(id, { t: 'cast', ability: 'mender_mend', target: id });
    let ev = run(w, 3);
    assert(ev.some((x) => x.type === 'cast_start' && x.ability === 'mender_mend'), `Mend started: ${JSON.stringify(ev.filter((x) => x.src === id))}`);
    eq(w.internals.mounts.mountOf(e), null, 'a cast gets you off');
    let foe;
    // an attack
    ({ w, id, e } = rider());
    summon(w, id);
    foe = nearestFoe(w, e);
    w.enqueue(id, { t: 'attack', id: foe.id });
    w.step();
    eq(w.internals.mounts.mountOf(e), null, 'an attack gets you off');
    // a hit
    ({ w, id, e } = rider());
    summon(w, id);
    foe = nearestFoe(w, e);
    w.internals.combat.dealDamage(foe, e, 5, { melee: true });
    w.step();
    eq(w.internals.mounts.mountOf(e), null, 'a hit gets you off');
    // a heal does not
    ({ w, id, e } = rider());
    summon(w, id);
    e.hp = e.hpMax - 20;
    w.internals.combat.heal(e, e, 10, { canCrit: false });
    w.step();
    eq(w.internals.mounts.mountOf(e), 'bay_horse', 'a heal leaves you riding');
  } },

  { name: 'indoors: refused in a dungeon, cave or interior (zone flag); walking through a dungeon door gets you off; the Rootbound is open land', fn() {
    assert(rideable(C.zones.world) && rideable(C.zones.rootbound), 'the world and the Rootbound');
    for (const z of ['barrow', 'watchtower', 'rootcellar', 'smugglers_cut', 'tarn_hollow']) assert(!rideable(C.zones[z]), `${z} is not`);
    assert(!rideable({ kind: 'interior' }), 'a building interior is not');
    assert(rideable({ kind: 'field' }) && rideable({}), 'a new field zone is (no list of names)');
    assert(!rideable({ kind: 'field', mounts: false }) && rideable({ kind: 'cave', mounts: true }), 'the zone flag wins');
    // through the Barrow's door, riding
    let { w, id, e } = rider(['bay_horse'], { level: 11 });
    const door = WORLD.doors.find((d) => d.id === 'barrow');
    e.x = door.out[0] * 256 + 128; e.y = (door.out[1] + 1) * 256 - 16;
    summon(w, id);
    eq(w.internals.mounts.mountOf(e), 'bay_horse', 'riding at the door');
    w.enqueue(id, { t: 'move', dx: 0, dy: -1 });
    const ev = run(w, 60, (x) => x.type === 'zone' && x.id === id);
    assert(ev.some((x) => x.type === 'zone' && x.id === id), 'went in');
    w.step();
    assert(C.zones[e.zone] && !rideable(C.zones[e.zone]) || /barrow/.test(e.zone), `inside: ${e.zone}`);
    eq(w.internals.mounts.mountOf(e), null, 'off at the door');
    w.enqueue(id, { t: 'stop' });
    w.enqueue(id, { t: 'mount' });
    assert(run(w, 3).some((x) => x.type === 'mount_fail' && x.reason === 'indoors'), 'no summon inside');
    w.enqueue(id, { t: 'cast', ability: 'mount_bay_horse' });
    assert(run(w, 3).some((x) => x.type === 'cast_fail' && x.reason === 'indoors'), 'the summon refuses indoors too');
    // the Rootbound (another outdoor zone): riding works
    ({ w, id, e } = rider(['bay_horse'], { zone: 'rootbound', x: 296, y: 70 }));
    summon(w, id);
    eq(w.internals.mounts.mountOf(e), 'bay_horse', 'riding in the Rootbound');
  } },

  { name: 'a flight gets you off; sitting does too', fn() {
    let { w, id, e } = rider(['bay_horse'], { gold: 50, flights: ['willowmere', 'thornfold'] });
    const wm = npcOf(w, 'fm_willowmere');
    besideNpc(w, id, wm);
    summon(w, id);
    eq(w.internals.mounts.mountOf(e), 'bay_horse', 'riding to the kite');
    w.enqueue(id, { t: 'fly', npc: wm.id, to: 'thornfold' });
    const ev = run(w, 3);
    assert(ev.some((x) => x.type === 'flight_start'), 'flying');
    eq(w.internals.mounts.mountOf(e), null, 'off for the flight');
    assert(ev.some((x) => x.type === 'dismount' && x.reason === 'flight'), 'dismount flight');
    ({ w, id, e } = rider());
    summon(w, id);
    w.enqueue(id, { t: 'sit' }); run(w, 2);
    eq(w.internals.mounts.mountOf(e), null, 'sitting gets you off');
  } },

  { name: 'saves keep owned mounts and the last one ridden; old saves load with none', fn() {
    const { w, id, e } = rider(['bay_horse', 'grey_charger']);
    summon(w, id, 'grey_charger');
    const save = JSON.parse(JSON.stringify({ known: e.known, level: e.level, ...w.saveFields(id) }));
    eq(JSON.stringify(save.mounts), '["bay_horse","grey_charger"]', 'saved');
    eq(save.mountPick, 'grey_charger', 'pick saved');
    // a save that kept only the mounts list (known lost) still teaches them back
    const w2 = world(9);
    const id2 = w2.addPlayer({ name: 'Rook', cls: 'warden', ...ROAD, level: 20, mounts: save.mounts, mountPick: save.mountPick });
    const e2 = w2.get(id2);
    assert(e2.known.includes('mount_bay_horse') && e2.known.includes('mount_grey_charger'), 'restored');
    run(w2, 25);
    summon(w2, id2);
    eq(w2.internals.mounts.mountOf(e2), 'grey_charger', 'Z summons the saved pick');
    const id3 = w2.addPlayer({ name: 'Old', cls: 'warden', ...ROAD, mounts: ['unicorn'] });
    assert(!('mounts' in w2.saveFields(id3)), 'an unknown kind is dropped; nothing saved');
  } },

  { name: 'co-op: the host sim runs a guest\'s mount command, and other heroes\' frames show the mount (the owned list stays private)', fn() {
    const w = world(11);
    const host = w.addPlayer({ name: 'Host', cls: 'warden', ...ROAD, level: 20, party: 1 });
    const guest = w.addPlayer({ name: 'Guest', cls: 'scribe', zone: 'world', x: 161, y: 120, level: 20, party: 1, known: ['mount_moor_stag'] });
    run(w, 25);
    assert(guestCommandOk({ t: 'mount' }), 'a guest may send mount');
    const tx = framesFor(host), rx = createFrameState(host);
    applyFrame(rx, tx.frame(w.snapshot(), []));
    w.enqueue(guest, { t: 'mount' });
    let snap = null;
    for (let i = 0; i < 40; i++) { const ev = w.step(); snap = applyFrame(rx, tx.frame(w.snapshot(), ev)); }
    const g = snap.entities.find((x) => x.id === guest);
    eq(g.mount, 'moor_stag', 'the host sees the guest riding');
    assert(!('mounts' in g), 'the owned list is trimmed for other heroes');
    w.enqueue(guest, { t: 'mount' });
    const ev = w.step();
    snap = applyFrame(rx, tx.frame(w.snapshot(), ev));
    eq(snap.entities.find((x) => x.id === guest).mount, null, 'and sees them get off');
  } },

  { name: 'controls: Z rides (rebindable), the Help window says so, the phone horseshoe sits above slot 8 clear of the cluster', fn() {
    eq(ACTION_BY_ID.mount.key, 'KeyZ', 'Z');
    eq(JSON.stringify(routeKey('KeyZ', true, {})), JSON.stringify({ kind: 'ui', action: 'mount' }), 'Z is a ui action');
    eq(routeKey('KeyV', true, { mount: 'KeyV' }).action, 'mount', 'rebound to V');
    const rows = helpSections({}).flatMap((s) => s.rows);
    const ride = rows.find((r) => /Ride/.test(r[0]));
    assert(ride && /Z/.test(ride[1]) && /Horseshoe/.test(ride[2]), `help row ${JSON.stringify(ride)}`);
    for (const [W, H] of [[640, 360], [740, 360], [520, 360]]) {
      const L = hudLayout({ touch: true, minHit: 30, W, H });
      const b = L.mountBtn;
      assert(b && b.x >= 0 && b.y >= 0 && b.x + b.w <= W && b.y + b.h <= H, `on screen at ${W}x${H}`);
      for (const c of L.cluster) assert(!inRect(c, b.x + b.w / 2, b.y + b.h / 2), `clear of ${c.id}`);
      const s8 = L.cluster.find((c) => c.id === 'slot8');
      eq(b.x, s8.x, 'above slot 8 (the bar\'s left end)'); eq(b.y + b.h, s8.y, 'just above it');
    }
    eq(hudLayout({ touch: false }).mountBtn, undefined, 'no horseshoe on the PC (Z)');
  } },

  { name: 'log lines and the 2D sprite: learn, refused, off at the door; the hero sits up on the horse', fn() {
    const me = 3;
    assert(/Press Z/.test(eventLines({ type: 'mount_learn', id: me, name: 'Bay Horse' }, { me })[0].text), 'learn line');
    assert(/Wynn/.test(eventLines({ type: 'mount_fail', id: me, reason: 'none' }, { me })[0].text), 'none line');
    assert(/door/.test(eventLines({ type: 'dismount', id: me, reason: 'indoors' }, { me })[0].text), 'door line');
    eq(eventLines({ type: 'dismount', id: me, reason: 'damage' }, { me }).length, 0, 'a hit is not logged');
    eq(mountLift({ mount: 'bay_horse' }), MOUNT_LIFT_PX, 'lifted'); eq(mountLift({ mount: null }), 0, 'on foot');
    eq(mountLift({ mount: 'bay_horse', flight: { up: 1 } }), 0, 'the kite wins');
    let n = 0;
    const g = { fillStyle: '', fillRect() { n++; } };
    for (const k of MOUNT_ORDER) for (const d of ['left', 'right', 'up', 'down']) { n = 0; drawMount2d(g, 50, 50, k, d, 0.3, true, 'under'); assert(n > 5, `${k} ${d} draws`); }
  } },
];
