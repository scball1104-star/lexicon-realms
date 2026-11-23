// Travel on screen (big world piece 1, 2026-11-22): the Lantern Stone's cast bar, the flight bar while a kite carries
// you, the flight master's page in the npc window, and the travel messages. Both renderers (it draws on the game canvas
// in HUD px, after the HUD, like src/ui/loading.js). The rules are src/sim/travel.js; the data src/data/travel.js.
//
//   const tv = createTravelUi({ font, content })
//   tv.draw(ctx, renderer, snap, playerId)            the stone's cast bar or the flight bar (nothing otherwise)
//   tv.message(ev, playerId) -> string | null          a toast line for a travel event of this hero
//   drawFlightPage(ctx, env, m, st, regions, act, r, button, bottom)   the npc window's 'flight' page (dialog.js)
//   flightOptions(d, m) -> [{ icon, label, color, on }]               the main page's travel choices (dialog.js)

const FLIGHT_FAIL = {
  level: 'The kites carry heroes from level 6.', gold: 'You do not have enough gold for that flight.', not_known: 'You have not been to that flight point yet.',
  combat: 'Not while you are fighting.', range: 'Too far from the kitemaster.', flying: 'You are already flying.',
};
const RIDE_FAIL = { range: 'Too far away to climb aboard.', combat: 'Not while you are fighting.', flying: 'You are already on your way.' };
const HOME_FAIL = { range: 'Too far from the innkeeper.', not_inn: 'Only an innkeeper can do that.' };
const STONE_FAIL = { cooldown: 'The Lantern Stone is still dim. It needs time to gather its light.', combat: 'Not while you are fighting.', flying: 'Not while you are flying.' };

export function createTravelUi({ font, content }) {
  const pts = (content.travel && content.travel.flight.points) || {};
  const rides = (content.travel && content.travel.rides) || {};    // wave 3: the ore cart, the ferry
  let buf = null, bctx = null;

  function message(ev, me) {
    if (ev.id !== me) return null;
    switch (ev.type) {
      case 'home': return `${cap(ev.name)} is now your home. Your Lantern Stone will bring you here.`;
      case 'home_fail': return HOME_FAIL[ev.reason] || null;
      case 'hearth_stop': return ev.reason === 'move' ? 'You moved. The Lantern Stone goes dark.' : ev.reason === 'combat' ? 'The fight breaks the Lantern Stone\'s light.' : null;
      case 'hearth': return `The Lantern Stone brings you home to ${ev.name}.`;
      case 'flight_point': return `New flight point: ${ev.name}.`;
      case 'flight_fail': return FLIGHT_FAIL[ev.reason] || 'The kite will not fly there.';
      case 'flight_start': return `The Lantern Kite takes you to ${ev.name}. (${ev.cost} gold)`;
      case 'flight_end': return rides[ev.to] ? `You arrive at ${ev.name}.` : `You land at ${ev.name}.`;
      case 'ride_start': return ev.vehicle === 'ferry' ? `The ferry pushes off for ${ev.name}.` : `The ore cart rattles off toward ${ev.name}.`;
      case 'ride_fail': return RIDE_FAIL[ev.reason] || null;
      case 'inventory_fail': return ev.item === 'lantern_stone' ? STONE_FAIL[ev.reason] || null : null;
      case 'door_locked': return `The stair will not open for you. It waits for a hero of level ${ev.need}.`;   // cap 30: a level-gated door
      default: return null;
    }
  }

  /** A bar in the lower middle of the HUD: the stone's cast filling, or the flight's progress with where to. */
  function draw(ctx, renderer, snap, me) {
    const p = me != null && snap ? snap.entities.find((e) => e.id === me) : null;
    if (!p || (!p.hearth && !p.flight)) return;
    const L = renderer.layout;
    const hw = L.hudW, hh = L.hudH;
    const W = 200, H = p.flight ? 30 : 22;
    if (!buf || buf.width !== W || buf.height !== H) { buf = document.createElement('canvas'); buf.width = W; buf.height = H; bctx = buf.getContext('2d'); bctx.imageSmoothingEnabled = false; }
    const g = bctx;
    g.clearRect(0, 0, W, H);
    g.fillStyle = 'rgba(14,10,22,0.86)'; g.fillRect(0, 0, W, H);
    g.fillStyle = '#c9a24c'; g.fillRect(0, 0, W, 1); g.fillRect(0, H - 1, W, 1); g.fillRect(0, 0, 1, H); g.fillRect(W - 1, 0, 1, H);
    let k, label, sub = null;
    if (p.hearth) {
      k = Math.max(0, Math.min(1, (snap.tick - p.hearth.start) / Math.max(1, p.hearth.end - p.hearth.start)));
      label = `Lantern Stone  ${Math.max(0, (p.hearth.end - snap.tick) / 20).toFixed(1)} s`;
    } else {
      k = p.flight.k;
      const rd = p.flight.ride ? rides[p.flight.to] : null;
      const to = rd || pts[p.flight.to], from = pts[p.flight.from];
      label = `${rd ? (p.flight.ride === 'ferry' ? 'Ferry to' : 'Ore cart to') : 'Flying to'} ${to ? to.name.split(',')[0] : p.flight.to}`;
      sub = rd ? `${Math.max(0, Math.round((p.flight.end - snap.tick) / 20))} s left`
        : `${from ? from.name.split(',')[0] : ''} to ${to ? to.name.split(',')[0] : ''}   ${Math.max(0, Math.round((p.flight.end - snap.tick) / 20))} s left`;
    }
    g.fillStyle = '#3a3448'; g.fillRect(6, H - 8, W - 12, 4);
    g.fillStyle = p.flight ? '#8fc0ff' : '#f9d77a'; g.fillRect(6, H - 8, Math.round((W - 12) * k), 4);
    if (font) {
      font.draw(g, label, W / 2, 3, { align: 'center', color: 'gold', outline: '#0a0810' });
      if (sub) font.draw(g, sub, W / 2, 13, { align: 'center', color: '#c8c0d8', outline: '#0a0810' });
    }
    const x = Math.round((hw - W) / 2), y = Math.round(hh * (p.flight ? 0.12 : 0.7));
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(buf, 0, 0, W, H, L.ox + x * L.base, L.oy + y * L.base, W * L.base, H * L.base);
    ctx.restore();
  }

  return { message, draw };
}

const cap = (s) => (s ? s[0].toUpperCase() + s.slice(1) : s);

/** The npc window's main-page choices for an innkeeper and a flight master (dialog.js). */
export function flightOptions(d, act) {
  const out = [];
  if (d.inn) {
    if (d.inn.home) out.push({ icon: 'icon_lantern', label: 'This inn is your home.', color: 'gray', on: () => {} });
    else out.push({ icon: 'icon_lantern', label: 'Make this inn your home.', color: 'white', on: () => { act.send({ t: 'set_home', npc: d.ent }); d.inn = { ...d.inn, home: true }; } });
  }
  if (d.flight) out.push({ icon: 'icon_feather', label: 'Show me where the kites fly.', color: 'white', on: () => { d.page = 'flight'; d.scroll = 0; } });
  // wave 3: a ride (the ore cart, the ferry): one route, free, any level
  if (d.ride) out.push({ icon: 'icon_feather', label: d.ride.label, color: 'white', on: () => { act.send({ t: 'ride', npc: d.ent }); act.closeDialog(); } });
  return out;
}

/** The flight master's page: every point, the ones you know lit, with cost and time; Fly sends the command. */
export function drawFlightPage(ctx, env, m, d, regions, act, r, button, bottom, back) {
  const { g } = env;
  const f = d.flight;
  const x0 = r.x + 10, w0 = r.w - 20;
  let y = r.y + 26;
  g.text(ctx, `Kites from ${f.name.split(',')[0]}`, x0, y, 'gold', { large: true }); y += 16;
  const lvl = (m.player && m.player.level) || 1;
  if (lvl < f.minLevel) { g.text(ctx, `The kites carry heroes from level ${f.minLevel}. Come back then.`, x0, y, 'gray'); y += 12; }
  else { g.text(ctx, 'Pick a lit point. You cannot act while you fly.', x0, y, 'gray'); y += 12; }
  const rowH = Math.max(16, env.L.minHit || 0);
  const gold = m.gold || 0;
  for (const p of f.to) {
    if (y + rowH > bottom - 4) break;
    const can = p.known && lvl >= f.minLevel && gold >= (p.cost || 0);
    g.rect(ctx, x0, y, w0, rowH - 1, 'rgba(20,16,30,0.35)');
    g.iconIn(ctx, 'icon_feather', x0 + 1, y, 16, rowH - 1, p.known ? 1 : 0.35);
    g.text(ctx, g.clip(p.name, w0 - 120), x0 + 20, y + Math.floor((rowH - 11) / 2), p.known ? 'cream' : 'dim');
    if (p.known) {
      g.text(ctx, `${p.cost} gold, ${p.secs} s`, x0 + w0 - 52, y + Math.floor((rowH - 11) / 2), gold >= p.cost ? 'gold' : 'red', { align: 'right' });
      button(x0 + w0 - 46, y, 46, 'Fly', can ? 'green' : 'gray', () => { if (can) { act.send({ t: 'fly', npc: d.ent, to: p.id }); act.closeDialog(); } }, can ? 'forest' : 'slate');
    } else g.text(ctx, 'Not visited', x0 + w0 - 4, y + Math.floor((rowH - 11) / 2), 'dim', { align: 'right' });
    y += rowH + 1;
  }
  back();
}
