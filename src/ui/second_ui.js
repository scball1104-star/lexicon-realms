// Phone as a second screen, the drawing (wave 9 second lane; docs/NET.md "Phone as a second screen"):
//   - the phone: no world and no HUD; a tab rail on the left (Map, Bags, Quests, Chat, Unpair) and the game's own
//     640x360 window designs (menus.js drawMap, drawCharacter + drawBags, drawQuestLog) placed at 1:1 when they fit, so
//     the skin, the item cards and the tooltips come for free. Chat is the log with times, Type and the quick phrases.
//   - the PC: the pairing panel (an HTML panel like the invite one, with the QR code and the link as text), the Allow
//     ask, and a small Phone chip left of the minimap while a phone is paired (click: Unpair phone, twice).
// Drawn with the g.* calls. Every player-facing word comes from src/net/second.js WORDS (ALL DRAFTS).
//
//   const S = createSecondUI({ g, st, log })      ui.js makes it; src/net/second_coop.js drives S.state and S.setActions
//   S.draw(ctx, env, m, L, regions, drawTab)      the whole phone layer; drawTab(id) draws that tab's windows (ui.js)
//   S.pcChip(ctx, L, regions)                     the PC's Phone chip
//   openPairPanel(nui, opts) -> { setLink, setLeft, status, close, open }     askPanel(nui, { hero, answer })
import { WORDS } from '../net/second.js';
import { qrEncode, qrDraw } from '../net/qr.js';
import { PHRASES } from '../net/talk.js';
import { menuRect } from './layout.js';

const TABS = ['map', 'bags', 'quests', 'chat'];
const OPEN = { map: ['map'], bags: ['character', 'bags'], quests: ['quests'], chat: [] };   // the windows each tab holds
const LOG_COLOR = { system: 'gold', combat: 'gray', damage_in: 'red', damage_out: 'white', heal: 'green', party: 'blue', say: 'white', loot: 'green', xp: 'violet', error: 'red' };

export function createSecondUI({ g, st, log }) {
  // on: this tab is a phone second screen; status: 'connecting' | 'ask' | 'paired'; pcPaired: this PC has a phone
  const S = { on: false, tab: 'map', status: 'connecting', hero: '', coop: false, pcPaired: false, chipArmed: 0, pressed: null };
  let A = {};

  function button(ctx, regions, x, y, w, h, label, { on = false, tone = 'blue', act = () => {}, id = null } = {}) {
    g.window(ctx, x, y, w, h, 'thin', on ? 'forest' : tone, on ? 0.98 : 0.92);
    if (on) g.rect(ctx, x + 2, y + h - 3, w - 4, 2, '#f9d77a');
    g.text(ctx, g.clip(label, w - 6), x + Math.floor(w / 2), y + Math.floor(h / 2) - g.mid(6), on ? 'gold' : 'cream', { align: 'center' });
    regions.push({ rect: { x, y, w, h }, kind: 'button', id, on: act, label });
  }

  function rail(ctx, L, regions) {
    const w = Math.max(66, (L.minHit || 0) + 18), hit = Math.max(L.minHit || 0, 30);
    g.rect(ctx, 0, 0, w, L.H, '#120e1c');
    g.rect(ctx, w - 1, 0, 1, L.H, '#5e3f1c');
    g.rect(ctx, 8, 11, 6, 6, '#8fd39a');                       // live: paired to this hero's PC
    g.text(ctx, g.clip(WORDS.phoneRail, w - 22), 18, 8, 'cream');
    let y = 28;
    const step = Math.min(hit + 14, Math.floor((L.H - 28 - hit - 10) / TABS.length));
    TABS.forEach((id, i) => {
      button(ctx, regions, 5, y, w - 10, step - 6, WORDS.tabs[i], { on: S.tab === id, id: `second-tab-${id}`, act: () => { S.tab = id; st.itemPick = null; } });
      y += step;
    });
    button(ctx, regions, 5, L.H - hit - 6, w - 10, hit, WORDS.phoneUnpair, { tone: 'violet', id: 'second-unpair', act: () => { if (A.unpair) A.unpair(); } });
    return w;
  }

  /** The windows a tab draws, as one box on the 640x360 design: what they covered last frame (a skin or a phone may
   *  draw a window larger than its menuRect), else layout.js menuRect. */
  const seen = {};
  function box(tab) {
    if (seen[tab]) return seen[tab];
    const rs = OPEN[tab].map((id) => menuRect(id));
    const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
  }
  /** The tab's windows right of the rail: 1:1 when they fit (crisp pixel text), shrunk only when they do not; regions
   *  mapped back to layer px. The pointer goes in as design px, as ui.js centred() does on desktop. */
  function design(ctx, env, L, regions, x0, drawFn) {
    const b = box(S.tab), aw = L.W - x0 - 8, ah = L.H - g.lh - 8;
    const s = Math.min(1, aw / b.w, ah / b.h);
    const ox = Math.round(x0 + 4 + (aw - b.w * s) / 2 - b.x * s), oy = Math.round(Math.max(2, (ah - b.h * s) / 2) - b.y * s);
    const n0 = regions.length, swap = { L: env.L, hover: env.hover };
    env.L = { ...L, W: 640, H: 360 };
    env.hover = env.hover ? { ...env.hover, x: (env.hover.x - ox) / s, y: (env.hover.y - oy) / s } : null;
    ctx.save(); ctx.translate(ox, oy); ctx.scale(s, s);
    try { drawFn(); } finally { ctx.restore(); env.L = swap.L; env.hover = swap.hover; }
    const wins = regions.slice(n0).filter((r) => r.kind === 'window');
    if (wins.length) {
      const x = Math.min(...wins.map((r) => r.rect.x)), y = Math.min(...wins.map((r) => r.rect.y));
      seen[S.tab] = { x, y, w: Math.max(...wins.map((r) => r.rect.x + r.rect.w)) - x, h: Math.max(...wins.map((r) => r.rect.y + r.rect.h)) - y };
    }
    for (let i = n0; i < regions.length; i++) {
      const r = regions[i];
      regions[i] = { ...r, rect: { x: Math.round(r.rect.x * s + ox), y: Math.round(r.rect.y * s + oy), w: Math.round(r.rect.w * s), h: Math.round(r.rect.h * s) },
        ...(r.drag ? { drag: (hx) => r.drag((hx - ox) / s) } : {}) };
    }
  }

  function hint(ctx, L, x0, text) {
    const w = Math.min(L.W - x0 - 16, g.textW(text) + 16);
    const x = x0 + Math.floor((L.W - x0 - w) / 2), y = L.H - g.lh - 6;
    g.rect(ctx, x, y - 2, w, g.lh + 4, 'rgba(18,14,28,0.85)');
    g.text(ctx, g.clip(text, w - 8), x + Math.floor(w / 2), y, 'dim', { align: 'center' });
  }

  function chatTab(ctx, L, regions, x0) {
    const pad = 10, x = x0 + pad, w = L.W - x0 - pad * 2;
    const hit = Math.max(L.minHit || 0, 30);
    const top = 8, bottom = S.coop ? L.H - hit - 16 : L.H - 8;
    g.window(ctx, x, top, w, bottom - top, 'std', 'blue', 0.95);
    const rows = Math.max(1, Math.floor((bottom - top - 16) / g.lh) - (S.coop ? 0 : 1));
    let y = top + 8;
    if (!S.coop) { g.text(ctx, g.clip(WORDS.chatSolo, w - 16), x + 8, y, 'dim'); y += g.lh; }
    for (const l of log.slice(-rows)) {
      const t = l.talk, time = t && t.at ? `${t.at} ` : '';
      let tx = x + 8;
      const room = () => x + w - 8 - tx;
      if (time) { g.text(ctx, time, tx, y, 'dim'); tx += g.textW(time); }
      if (t && t.kind === 'whisper') g.text(ctx, g.clip(t.out ? `To ${t.to}: ${t.body}` : `${t.from} whispers: ${t.body}`, room()), tx, y, '#d6a8ff');
      else if (t && t.from) {
        const who = `${t.from}: `;
        g.text(ctx, who, tx, y, t.me ? '#a8f0b0' : '#8fb8ff');
        tx += g.textW(who);
        g.text(ctx, g.clip(t.body || '', room()), tx, y, 'white');
      } else g.text(ctx, g.clip(l.text, room()), tx, y, LOG_COLOR[l.ch] || 'white');
      y += g.lh;
    }
    if (!S.coop) return;
    // the say row: Type (the phone keyboard) and the quick phrases that fit, a tap each
    let bx = x;
    const by = L.H - hit - 8;
    const typeW = g.textW(WORDS.type) + 26;
    button(ctx, regions, bx, by, typeW, hit, WORDS.type, { tone: 'forest', id: 'second-type', act: () => { if (A.type) A.type(); } });
    bx += typeW + 6;
    for (const p of PHRASES) {
      const pw = g.textW(p) + 18;
      if (bx + pw > x + w) break;
      button(ctx, regions, bx, by, pw, hit, p, { on: S.pressed === p, id: `second-say-${PHRASES.indexOf(p)}`, act: () => { S.pressed = p; if (A.say) A.say(p); } });
      bx += pw + 6;
    }
  }

  function status(ctx, L, regions) {
    const w = Math.min(380, L.W - 24), hit = Math.max(L.minHit || 0, 30), h = Math.min(L.H - 16, g.lh * 4 + hit + 52);
    const x = Math.floor((L.W - w) / 2), y = Math.floor((L.H - h) / 2);
    g.window(ctx, x, y, w, h, 'std', 'blue', 0.97);
    g.text(ctx, WORDS.phoneTitle, x + w / 2, y + 12, 'gold', { align: 'center' });
    g.text(ctx, g.clip(WORDS.panelTitle, w - 16), x + w / 2, y + 12 + g.lh + 6, 'cream', { align: 'center' });
    const ask = S.status === 'ask';
    g.text(ctx, ask ? WORDS.phoneAsk : WORDS.phoneConnecting, x + w / 2, y + 12 + g.lh * 2 + 16, ask ? 'gold' : 'white', { align: 'center' });
    const dots = Math.floor((st.now || 0) * 2) % 4;
    for (let i = 0; i < 3; i++) g.rect(ctx, x + w / 2 - 12 + i * 10, y + 12 + g.lh * 3 + 22, 5, 5, i < dots ? '#ffd75a' : '#3a3050');
    const bw = 120;
    button(ctx, regions, x + (w - bw) / 2, y + h - hit - 8, bw, hit, WORDS.notNow, { tone: 'violet', id: 'second-cancel', act: () => { if (A.cancel) A.cancel(); } });
  }

  return {
    state: S,
    get on() { return S.on; },
    setActions(a) { A = a || {}; },
    /** The whole phone layer. drawTab(id): draw that tab's game windows (ui.js passes the menus.js calls). */
    draw(ctx, env, m, L, regions, drawTab) {
      g.rect(ctx, 0, 0, L.W, L.H, '#0b0a12');
      if (S.status !== 'paired' || !m || !m.player) { st.open.clear(); status(ctx, L, regions); return; }
      // the tab's windows are the open ones (hit tests, item cards and the phone's 'win' layer follow st.open)
      const want = OPEN[S.tab];
      if (want.length !== st.open.size || want.some((id) => !st.open.has(id))) { st.open.clear(); for (const id of want) st.open.add(id); }
      const x0 = rail(ctx, L, regions);
      if (S.tab === 'chat') { chatTab(ctx, L, regions, x0); return; }
      design(ctx, env, L, regions, x0, () => drawTab(S.tab));
      hint(ctx, L, x0, S.tab === 'map' ? WORDS.mapHint : S.tab === 'bags' ? WORDS.bagsHint : WORDS.questsHint);
    },
    /** The PC: a small Phone chip left of the minimap while a phone is paired; a click arms Unpair phone, a second does it. */
    pcChip(ctx, L, regions) {
      if (!S.pcPaired) return;
      const armed = (st.now || 0) - S.chipArmed < 4;
      const label = armed ? WORDS.unpair : WORDS.chip, w = g.textW(label) + 22, h = Math.max(16, g.lh + 4);
      const mm = L.minimap || { x: L.W - 100, y: 18 };
      const x = Math.max(4, mm.x - w - 26), y = mm.y + 2;
      g.window(ctx, x, y, w, h, 'thin', armed ? 'violet' : 'forest', 0.95);
      g.rect(ctx, x + 6, y + Math.floor(h / 2) - 2, 4, 4, '#8fd39a');
      g.text(ctx, label, x + 14, y + Math.floor(h / 2) - g.mid(6), 'cream');
      regions.push({ rect: { x, y, w, h }, kind: 'button', id: 'second-chip', label: WORDS.unpair, tip: WORDS.unpair,
        on: () => { if (armed) { S.chipArmed = 0; if (A.pcUnpair) A.pcUnpair(); } else S.chipArmed = st.now || 0; } });
    },
  };
}

// ---------------------------------------------------------------- the PC's HTML panels (netui.js style)
const CSS = `
#net-ui .second-qr { display: flex; gap: 14px; align-items: center; margin: 6px 0; min-height: 120px; }
#net-ui .second-qr canvas { image-rendering: pixelated; border-radius: 4px; flex: none; }
#net-ui .second-steps { margin: 0; padding-left: 18px; color: #e8e2d4; font-size: 14px; }
#net-ui .second-steps li { margin: 3px 0; }
#net-ui .second-left { font-variant-numeric: tabular-nums; color: #ffd75a; }
`;
let styled = false;

/** The pairing panel. opts: { onNew(), onClose() }. setLink(url | null, text): the QR and the link (null: a line of text). */
export function openPairPanel(nui, { onNew = () => {}, onClose = () => {} } = {}) {
  if (!styled && typeof document !== 'undefined') { const s = document.createElement('style'); s.textContent = CSS; document.head.appendChild(s); styled = true; }
  let qrBox = null, linkIn = null, leftEl = null, copyBtn = null, cur = null;
  const api = nui.panel({ title: WORDS.panelTitle, id: 'second-pair', onClose, build: (body, p) => {
    const { el } = nui;
    qrBox = el('div', { class: 'second-qr', id: 'second-qr' });
    linkIn = el('input', { id: 'second-link', value: '', readOnly: true, onfocus: (ev) => ev.target.select() });
    leftEl = el('p', { class: 'second-left', id: 'second-left', text: '' });
    copyBtn = el('button', { text: WORDS.copyLink, class: 'net-go', id: 'second-copy', disabled: true, onclick: () => { if (cur) nui.copy(cur, copyBtn); } });
    body.append(el('p', { text: WORDS.panelLead }), qrBox, el('p', { class: 'net-dim', text: WORDS.panelOr }), linkIn,
      el('p', { class: 'net-dim', text: WORDS.panelSafe }), leftEl,
      el('div', { class: 'net-row' }, [copyBtn,
        el('button', { text: WORDS.newCode, id: 'second-new', onclick: () => onNew() }),
        el('button', { text: WORDS.close, class: 'net-quiet', id: 'second-close', onclick: () => p.close() })]));
  } });
  return {
    setLink(url, text = '') {
      const { el } = nui;
      cur = url || null;
      qrBox.textContent = '';
      linkIn.value = url || '';
      copyBtn.disabled = !url;
      if (!url) { qrBox.appendChild(el('p', { class: 'net-dim', text })); return; }
      const q = qrEncode(url);
      if (!q) { qrBox.appendChild(el('p', { class: 'net-dim', text: WORDS.panelOr })); return; }
      const px = 4, full = (q.size + 8) * px;
      const cv = el('canvas', { width: full, height: full, id: 'second-qr-canvas' });
      cv.style.width = `${full}px`; cv.style.height = `${full}px`;
      qrDraw(cv.getContext('2d'), q, 0, 0, px);
      cv.dataset.version = String(q.version);
      cv.dataset.size = String(q.size);
      qrBox.append(cv, el('ol', { class: 'second-steps' }, WORDS.steps.map((s) => el('li', { text: s }))));
    },
    setLeft(text) { if (leftEl) leftEl.textContent = text; },
    status: (t, k) => api.status(t, k),
    close: () => api.close(),
    get open() { return api.open; },
  };
}

/** The Allow ask. answer(yes) once. */
export function askPanel(nui, { hero = '', answer = () => {} }) {
  let done = false;
  const reply = (yes) => { if (done) return; done = true; answer(yes); };
  return nui.panel({ title: WORDS.askTitle, id: 'second-ask', onClose: () => reply(false), build: (body, api) => {
    const { el } = nui;
    body.append(el('p', { text: WORDS.askBody(hero) }),
      el('div', { class: 'net-row' }, [
        el('button', { text: WORDS.allow, class: 'net-go', id: 'second-allow', onclick: () => { reply(true); api.close(); } }),
        el('button', { text: WORDS.no, class: 'net-quiet', id: 'second-no', onclick: () => { reply(false); api.close(); } }),
      ]));
  } });
}
