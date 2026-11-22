// Group play HUD: a MOCK render for the visual brief (D:\LQOnline\group_ui\BRIEF.md). Not game code: nothing in src/
// imports this. It sets up a real party scene in the running sim (three heroes, a foe), then draws the proposed pieces
// with src/ui/group_ui.js (the code the game will use) and the game's own art over the live HUD. The numbers in the
// pieces (cast, threat, buffs, trade, rez) are MOCK DATA; the stamp in the corner says so.
//
//   const m = await import('/qa/ui/group/group_mock.js'); await m.install({ kind: 'fight' | 'trade' | 'death' })
import { createGfx } from '../../../src/ui/gfx.js';
import { loadUiArt } from '../../../src/ui/uiassets.js';
import { BitmapFont } from '../../../src/core/font.js';
import { hudLayout } from '../../../src/ui/layout.js';
import { targetCast, threatTag, buffRow, partyExtras, deathPanel, tradeWindow, readyCheck } from '../../../src/ui/group_ui.js';

const view = (id, qty = 1, extra = {}) => {
  const R = window.__realms;
  const d = R.content.items[id] || { name: id, icon: 'icon_bag' };
  return { resolved: true, item: id, id, qty, name: d.name, icon: d.icon, rarity: extra.rarity || d.rarity || 'common', kind: d.kind, ...extra };
};

function scene(kind) {
  const R = window.__realms, w = R.world;
  const me = w.get(R.playerId);
  w.setLevel(me.id, 12);
  w.setParty(me.id, me.id);
  const tx = Math.floor(me.x / 256), ty = Math.floor((me.y - 1) / 256);
  const a = w.addPlayer({ name: 'Bramble', cls: 'warden', look: 2, party: me.id, zone: me.zone, x: tx - 2, y: ty - 1, level: 12 });
  const b = w.addPlayer({ name: 'Wren', cls: 'mender', look: 1, party: me.id, zone: me.zone, x: tx + 2, y: ty + 1, level: 11 });
  const fa = w.get(a), fb = w.get(b);
  if (kind === 'fight') {
    const mid = w.spawnMob({ mob: 'ink_wraith', zone: me.zone, x: tx, y: ty - 4, level: 12 });
    const m = w.get(mid);
    m.hp = Math.round(m.hpMax * 0.58);
    w.enqueue(me.id, { t: 'target', id: mid });
    R.step(1);
    fa.hp = Math.round(fa.hpMax * 0.71); fb.hp = Math.round(fb.hpMax * 0.93);
    w.internals.ai.engage(m, fa);
    m.threat[fa.id] = 1000; m.threat[me.id] = 920; m.threat[fb.id] = 300;
    R.step(1);
  } else if (kind === 'death') {
    me.dead = true; me.hp = 0; me.respawnAt = null; me.target = null;
    R.step(1);
    me.dead = true; me.hp = 0;
    fa.hp = Math.round(fa.hpMax * 0.4);
  } else {
    R.step(1);
  }
  return { me, fa, fb };
}

export async function install(sc) {
  const R = window.__realms;
  const font = await new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => fetch('assets/ui/font.json').then((r) => r.json()).then((j) => resolve(new BitmapFont(j, img, { id: 'main' })), reject);
    img.onerror = reject;
    img.src = 'assets/ui/font.png';
  });
  const art = await loadUiArt({ font });
  const g = createGfx(art);
  const { me, fa, fb } = scene(sc.kind);
  const act = { send: () => {}, toast: () => {} };
  const stamp = (ctx, L) => {
    const t = 'MOCK DATA (group play brief)';
    const tw = g.textW(t) + 10;
    g.window(ctx, L.W - tw - 4, L.H - 30, tw, 15, 'thin', 'violet', 0.9);
    g.text(ctx, t, L.W - 9, L.H - 29, 'cream', { align: 'right' });
  };
  const orig = R.ui.draw;
  R.ui.draw = (ctx, ...rest) => {
    orig(ctx, ...rest);
    const lay = R.renderer.layout;
    const L = { ...hudLayout({ touch: false, W: lay.hudW, H: lay.hudH }), minHit: 15 };
    const regions = [];
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    try {
      if (sc.kind === 'fight') {
        targetCast(g, ctx, L.targetCast, { name: 'Ink Tide', icon: 'icon_magic', frac: 0.55, left: 1.1, kind: 'cast', interruptible: true });
        threatTag(g, ctx, L.threat.x, L.threat.y, { pct: 92, top: false, aggro: fa.id, list: [{ id: fa.id }, { id: me.id }] }, { tank: false });
        buffRow(g, ctx, L.buffs.x, L.buffs.y, [
          { id: 'wayfinder_hawk_eye', name: 'Hawk Eye', icon: 'icon_focus', kind: 'buff', left: 1500 },
          { id: 'mender_renew', name: 'Renew (from Wren)', icon: 'icon_regen', kind: 'buff', left: 9 },
          { id: 'warden_rally', name: 'Rallying Cry (from Bramble)', icon: 'icon_oath', kind: 'buff', left: 24 },
          { id: 'mob_ink_soak', name: 'Ink Soaked', icon: 'icon_poison', kind: 'debuff', left: 4, stacks: 2 },
          { id: 'mob_chill', name: 'Chilled', icon: 'icon_chill', kind: 'debuff', left: 7 },
        ], regions);
        // the second still card: what the other two states look like (cannot interrupt; it is on you)
        const ex = { x: L.threat.x, y: 60, w: 150 };
        g.text(ctx, 'Also (same spots):', ex.x, ex.y - 13, 'cream', { shadow: true });
        targetCast(g, ctx, ex, { name: 'Counting Sweep', icon: 'icon_magic', frac: 0.3, left: 0.9, kind: 'cast', interruptible: false });
        threatTag(g, ctx, ex.x, ex.y + 22, { pct: 100, top: true, aggro: me.id, list: [{ id: me.id }] }, { tank: false });
        threatTag(g, ctx, ex.x + 82, ex.y + 22, { pct: 70, top: false, aggro: me.id, list: [{ id: me.id }] }, { tank: true });
      } else if (sc.kind === 'trade') {
        const grp = { trade: {
          with: fa.id, name: 'Bramble',
          mine: { ready: true, gold: 12, items: [view('hi_potion', 5), view('garricks_gate_sword', 1, { rarity: 'magic', bind: 'equip' }), view('watch_iron_helm', 1, { rarity: 'magic', bind: 'equip' })] },
          theirs: { ready: true, gold: 0, items: [view('garricks_ash_bow', 1, { rarity: 'magic', bind: 'equip' }), view('ether', 3)] },
          bag: [view('potion', 4), view('watchtower_bow', 1, { rarity: 'rare', bind: 'pickup', noTrade: 'pickup' }),
            view('reeves_tally_ring', 1, { rarity: 'legendary', bind: 'pickup', noTrade: 'pickup' }),
            view('old_fold_helm', 1, { rarity: 'magic', bind: 'equip', soulbound: true, noTrade: 'soulbound' }),
            view('moor_longbow', 1, { rarity: 'magic', bind: 'equip' }), view('ether', 6), view('hi_potion', 5, { offered: true }), view('gate_sword', 1)],
          note: 'Watchtower Bow binds when picked up: it cannot be traded.',
        } };
        tradeWindow(g, ctx, { g, L }, { gold: 140, player: { name: me.name } }, grp, {}, regions, act);
        readyCheckSmall(g, ctx, L);
      } else if (sc.kind === 'death') {
        const grp = { death: { waitLeft: 263, choice: 'wait', rez: { name: 'Wren', spell: 'Rekindle', left: 6.2, total: 10 } }, party: [] };
        deathPanel(g, ctx, L, grp, regions, act);
        // the other side: Wren's view of a dead friend's party frame with the Rez button (drawn here for the brief)
        const pr = { x: 4, y: 200, w: 150, h: 32 };
        g.text(ctx, "Wren's party frame for Lark:", pr.x, pr.y - 13, 'cream', { shadow: true });
        g.window(ctx, pr.x, pr.y, pr.w, pr.h);
        g.text(ctx, 'Lark', pr.x + 22, pr.y + 2, 'dim');
        g.text(ctx, 'Lv 12', pr.x + pr.w - 7, pr.y + 2, 'gold', { align: 'right' });
        g.gauge(ctx, pr.x + 22, pr.y + 14, pr.w - 30, 0, 'hp', true);
        partyExtras(g, ctx, pr, { id: me.id, name: me.name, dead: true }, { canRez: true, ash: 0, party: [{ id: me.id }] }, regions, act);
        const pr2 = { x: 4, y: 252, w: 150, h: 32 };
        g.text(ctx, 'While the rez is cast:', pr2.x, pr2.y - 13, 'cream', { shadow: true });
        g.window(ctx, pr2.x, pr2.y, pr2.w, pr2.h);
        g.text(ctx, 'Lark', pr2.x + 22, pr2.y + 2, 'dim');
        g.gauge(ctx, pr2.x + 22, pr2.y + 14, pr2.w - 30, 0, 'hp', true);
        partyExtras(g, ctx, pr2, { id: me.id, name: me.name, dead: true }, { canRez: true, party: [{ id: me.id, rezBy: fb.id, rezLeft: 6.2 }] }, regions, act);
      }
      stamp(ctx, L);
    } finally { ctx.restore(); }
    window.__grpmock = { L: { W: L.W, H: L.H }, regions: regions.length };
  };
  return true;
}

function readyCheckSmall() { /* the ready check is a text popup (see the brief); not in the stills */ }
export { readyCheck };
