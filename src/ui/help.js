// The Help window (Scott, 2026-11-19: "H should open a Help screen with all the controls"). Every control in one
// place, grouped so a player can learn them or find the one they need. The PC column follows the player's own key
// bindings; on a phone the touch controls show instead. Pure drawing, no state of its own.

import { scrollLines } from './textscroll.js';   // Large text: the help list scrolls (wave 6 uiskin)
import { frame } from './menus.js';
import { effectiveBinds, keyLabel } from './keymap.js';

const k = (b, id) => keyLabel(b[id]);

/** Sections of [what, PC, phone]. A function gets the effective binds. */
export function helpSections(binds) {
  const b = effectiveBinds(binds || {});
  const menus = ['character', 'bags', 'quests', 'talents', 'map'].map((id) => k(b, id)).join(' ');
  return [
    { title: 'Moving', rows: [
      ['Walk', `${k(b, 'move_up')} ${k(b, 'move_left')} ${k(b, 'move_down')} ${k(b, 'move_right')} or arrows`, 'Drag the left thumb'],
      ['Walk to a spot', null, 'Tap the ground'],
      ['Speed', 'Always full speed', 'Always full speed'],
      ['Sit and rest', k(b, 'sit'), 'Out of a fight you heal on your own'],
      ['Ride a mount', `${k(b, 'mount')} (buy one from Wynn in Willowmere)`, 'Horseshoe button'],
    ] },
    { title: 'Fighting', rows: [
      ['Pick a foe', `Click it, or ${k(b, 'next_target')}`, 'Tap it, or Next'],
      ['Attack', 'Right-click the foe', 'Sword button (bottom right)'],
      ['Skills', `${k(b, 'slot1')} to ${k(b, 'slot8')}`, 'Skill buttons'],
      ['Skill info', 'Point at its icon', 'Hold its icon'],
      ['Cooldown', 'Shadow sweeps over the icon', 'Same'],
      ['Potions', `Drag one from Bags to a slot, then ${k(b, 'slot1')} to ${k(b, 'slot8')}`, 'Tap it in Bags, Put on bar, tap a slot'],
      ['Move a skill', 'Drag its slot to another; two swap', 'Out of a fight: hold it, Move, tap a slot'],
      ['Take it off', 'Drag it off the bar. Items: right-click', 'Hold its slot, then Take off bar'],
      ['Spare skills', 'Character window: drag one to a slot', 'Character: tap one, Put on bar'],
    ] },
    { title: 'People and quests', rows: [
      ['Talk', `${k(b, 'interact')}, or right-click them`, 'Tap them, or Talk'],
      ['Gold !', 'A quest to take', ''],
      ['Gold ?', 'Ready to hand in', ''],
      ['Grey ! or ?', 'Later, or still in progress', ''],
      ['Item info', 'Point at it in Bags', 'Tap it; tap again to use'],
      ['Quest log', k(b, 'quests'), '! button'],
    ] },
    { title: 'Where to go', rows: [
      ['Map', `${k(b, 'map')}: bright circles for the quest you picked`, 'Map button: same'],
      ['Pick a quest', 'Click its tracker line, or Show on map', 'Tap its tracker line'],
      ['Gold arrow', 'At your feet: points the way', 'Same'],
    ] },
    { title: 'Menus and view', rows: [
      ['Windows', `${menus}`, 'Buttons along the top'],
      ['Help', k(b, 'help') || 'H', '? button'],
      ['Options, close', 'Esc', 'Gear button'],
      ['Zoom', '+ and -', 'Options'],
    ] },
    { title: 'Your bars', rows: [
      ['Green', 'Health. Rest or a healer refills it', ''],
      ['Mana', 'Mender, Scribe: refills over time', ''],
      ['Resolve', 'Warden: fills as you hit and get hit', ''],
      ['Focus', 'Wayfinder, Inkblade: refills fast', ''],
      ['If you fall', 'You wake at the last lantern', ''],
    ] },
  ];
}

/** The hints switch (wave 7 onboarding, src/ui/onboard.js): a small button at the foot of Help, not a Settings row (the
 *  phone's Settings screen is full). Returns its height so the list above can stop short of it. */
export function hintsSwitch(ctx, env, r, regions, act, options) {
  const { g } = env;
  if (!options || !act || !act.setOption) return 0;
  const on = options.hints !== false;
  const label = `Hints: ${on ? 'On' : 'Off'}`;
  const bh = Math.max(16, Math.min(env.L.minHit || 0, 24)), bw = Math.max(76, g.textW(label) + 16);
  const b = { x: r.x + r.w - bw - 10, y: r.y + r.h - bh - 6, w: bw, h: bh };
  g.window(ctx, b.x, b.y, b.w, b.h, 'thin', on ? 'forest' : 'slate', 0.95);
  g.text(ctx, label, b.x + Math.floor(b.w / 2), b.y + Math.floor((b.h - g.lh) / 2) + 1, 'cream', { align: 'center' });
  regions.push({ rect: b, kind: 'button', label: 'help:hints', on: () => act.setOption('hints', !on),
    tip: { title: label, sub: on ? 'Short tips the first time you need a thing. Click to turn them off.' : 'Click to turn the first-time tips back on.' } });
  return bh + 6;
}

export function drawHelp(ctx, env, st, regions, act, binds, options = null) {
  const { g } = env;
  const touch = !!env.L.touch;
  const r = { x: 24, y: 12, w: 592, h: 336 };
  frame(ctx, env, r, 'Help: controls', regions, act, 'help');
  const foot = hintsSwitch(ctx, env, r, regions, act, options);   // wave 7: the hints switch
  g.text(ctx, touch ? 'Phone controls' : 'Keyboard and mouse (your own key bindings)', r.x + r.w - 30, r.y + 8, 'dim', { align: 'right' });
  const secs = helpSections(binds);
  if (g.big) {
    // Large text (gfx.js g.big): one column, every row's text wrapped, the whole list scrolls (wheel or finger drag)
    const lw = 150, x = r.x + 12, hw = r.w - 24 - lw - 10, lines = [];
    for (const s of [secs[0], secs[1], secs[4], secs[2], secs[3], secs[5]]) {
      lines.push({ t: s.title, c: 'gold', x: 0 });
      for (const [what, pc, ph] of s.rows) {
        if (!touch && pc == null) continue;
        const how = touch ? (ph === 'Same' ? pc : ph || pc) : pc;
        g.wrap(how, hw).forEach((ln, k) => lines.push({ t: ln, c: 'cream', x: lw, what: k === 0 ? what : null }));
      }
    }
    scrollLines(ctx, g, regions, st, 'help', lines, { x, y: r.y + 30, w: r.w - 24, h: r.h - 38 - foot }, g.lh, (o, lx, ly) => {
      if (o.what) g.text(ctx, g.clip(o.what, lw - 14), lx + 8, ly, 'white');
      g.text(ctx, o.t, lx + o.x, ly, o.c);
    }, '#f9d77a');
    return;
  }
  const colW = 280, gap = 12, lw = 82;
  const cols = [[secs[0], secs[1], secs[4]], [secs[2], secs[3], secs[5]]];
  cols.forEach((col, ci) => {
    const x = r.x + 10 + ci * (colW + gap);
    let y = r.y + 28;
    for (const s of col) {
      g.text(ctx, s.title, x, y, 'gold'); y += 13;
      for (const [what, pc, ph] of s.rows) {
        if (!touch && pc == null) continue;
        const how = touch ? (ph === 'Same' ? pc : ph || pc) : pc;
        g.text(ctx, what, x + 6, y, 'white');
        g.text(ctx, g.clip(how, colW - lw - 8), x + lw, y, 'cream');
        y += 11;
      }
      y += 6;
    }
  });
}
