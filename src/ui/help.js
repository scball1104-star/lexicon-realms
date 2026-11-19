// The Help window (Scott, 2026-11-19: "H should open a Help screen with all the controls"). Every control in one
// place, grouped so a player can learn them or find the one they need. The PC column follows the player's own key
// bindings; on a phone the touch controls show instead. Pure drawing, no state of its own.

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
    ] },
    { title: 'Fighting', rows: [
      ['Pick a foe', `Click it, or ${k(b, 'next_target')}`, 'Tap it, or Next'],
      ['Attack', 'Right-click the foe', 'Sword button (bottom right)'],
      ['Skills', `${k(b, 'slot1')} to ${k(b, 'slot6')}`, 'Skill buttons'],
      ['Skill info', 'Point at its icon', 'Hold its icon'],
      ['Cooldown', 'Shadow sweeps over the icon', 'Same'],
    ] },
    { title: 'People and quests', rows: [
      ['Talk', `${k(b, 'interact')}, or right-click them`, 'Tap them, or Talk'],
      ['Gold !', 'A quest to take', ''],
      ['Gold ?', 'Ready to hand in', ''],
      ['Grey ! or ?', 'Later, or still in progress', ''],
      ['Item info', 'Point at it in Bags', 'Tap it; tap again to use'],
      ['Quest log', `${k(b, 'quests')}, or click the tracker`, '! button, or tracker'],
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

export function drawHelp(ctx, env, st, regions, act, binds) {
  const { g } = env;
  const touch = !!env.L.touch;
  const r = { x: 24, y: 12, w: 592, h: 336 };
  frame(ctx, env, r, 'Help: controls', regions, act, 'help');
  g.text(ctx, touch ? 'Phone controls' : 'Keyboard and mouse (your own key bindings)', r.x + r.w - 30, r.y + 8, 'dim', { align: 'right' });
  const secs = helpSections(binds);
  const colW = 280, gap = 12, lw = 82;
  const cols = [[secs[0], secs[1], secs[3]], [secs[2], secs[4]]];
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
