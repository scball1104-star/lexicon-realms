// The online co-op screens that need real text fields (a room code, copy-paste codes, chat): small HTML panels over the
// canvas, in the game's colours. Everything here carries data-overlay, and ui.js ignores keys and clicks that start
// inside it, so typing a code never walks the hero or opens a menu. The canvas HUD draws the rest (party frames,
// name plates, chat lines). Player-facing text: plain words, no em dashes.

const CSS = `
#net-ui { position: fixed; inset: 0; pointer-events: none; z-index: 20; font: 15px/1.35 system-ui, -apple-system, "Segoe UI", sans-serif; color: #f6f4ee; }
#net-ui * { box-sizing: border-box; }
#net-ui .net-scrim { position: absolute; inset: 0; background: rgba(8, 6, 14, 0.55); pointer-events: auto; z-index: 2; }
#net-ui .net-box { position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%); width: min(440px, calc(100vw - 24px));
  max-height: calc(100dvh - 24px); overflow: auto; background: #1b1528; border: 2px solid #8a76b8; border-radius: 6px; padding: 14px 16px;
  pointer-events: auto; box-shadow: 0 6px 24px rgba(0,0,0,0.6); z-index: 3; }
#net-ui h2 { margin: 0 0 8px; font-size: 18px; color: #ffd75a; font-weight: 700; }
#net-ui p { margin: 6px 0; color: #e8e2d4; }
#net-ui .net-dim { color: #a79fb8; font-size: 13px; }
#net-ui .net-code { font: 700 32px/1.1 ui-monospace, Consolas, monospace; letter-spacing: 6px; color: #fff7d6; background: #120e1c;
  border: 1px solid #5a4c7c; border-radius: 4px; padding: 6px 10px; display: inline-block; margin: 4px 0; user-select: all; }
#net-ui input, #net-ui textarea { width: 100%; font: 16px/1.3 ui-monospace, Consolas, monospace; color: #fff7d6; background: #120e1c;
  border: 1px solid #6a5a8e; border-radius: 4px; padding: 8px; margin: 4px 0; }
#net-ui input.net-codein { font-size: 24px; letter-spacing: 5px; text-transform: uppercase; text-align: center; }
#net-ui textarea { height: 76px; resize: vertical; font-size: 12px; word-break: break-all; }
#net-ui .net-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 10px; }
#net-ui button { font: 600 15px system-ui, -apple-system, "Segoe UI", sans-serif; color: #f6f4ee; background: #2b3f6e; border: 1px solid #8fb3e8;
  border-radius: 4px; padding: 8px 14px; min-height: 38px; cursor: pointer; pointer-events: auto; }
#net-ui button.net-go { background: #2f5a35; border-color: #8fd39a; }
#net-ui button.net-quiet { background: #2a2338; border-color: #6a5a8e; }
#net-ui button:disabled { opacity: 0.5; cursor: default; }
#net-ui .net-status { min-height: 20px; margin-top: 8px; color: #cfe3ff; }
#net-ui .net-status.err { color: #ffb08a; }
#net-ui .net-status.ok { color: #a8f0b0; }
#net-ui details { margin-top: 10px; border-top: 1px solid #3a3050; padding-top: 8px; }
#net-ui summary { cursor: pointer; color: #cfc6e4; }
#net-ui .net-bar { position: absolute; left: 50%; transform: translateX(-50%); top: max(4px, env(safe-area-inset-top)); display: flex; gap: 6px;
  align-items: center; background: rgba(20, 16, 30, 0.88); border: 1px solid #6a5a8e; border-radius: 5px; padding: 3px 6px; pointer-events: auto;
  font-size: 13px; white-space: nowrap; }
#net-ui .net-bar button { min-height: 26px; padding: 2px 9px; font-size: 13px; }
#net-ui .net-chat { position: absolute; left: max(8px, env(safe-area-inset-left)); bottom: max(8px, env(safe-area-inset-bottom)); width: min(380px, calc(100vw - 16px));
  display: flex; gap: 6px; pointer-events: auto; }
#net-ui .net-chat input { margin: 0; font-family: system-ui, -apple-system, "Segoe UI", sans-serif; }
`;

export function createNetUI({ doc = document } = {}) {
  const style = doc.createElement('style');
  style.textContent = CSS;
  doc.head.appendChild(style);
  const root = doc.createElement('div');
  root.id = 'net-ui';
  root.setAttribute('data-overlay', 'net');
  doc.body.appendChild(root);
  // keys typed in a panel stay in the panel (src/input and main.js listen on window)
  for (const t of ['keydown', 'keyup', 'keypress']) root.addEventListener(t, (ev) => ev.stopPropagation());
  for (const t of ['mousedown', 'mouseup', 'touchstart', 'touchend', 'wheel', 'contextmenu']) root.addEventListener(t, (ev) => ev.stopPropagation(), { passive: true });

  const el = (tag, props = {}, kids = []) => {
    const e = doc.createElement(tag);
    for (const [k, v] of Object.entries(props)) {
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v);
      else if (k === 'data') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv; else e[k] = v;
    }
    for (const c of [].concat(kids)) if (c) e.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    return e;
  };
  async function copy(text, btn) {
    let ok = false;
    try { await navigator.clipboard.writeText(text); ok = true; } catch { ok = false; }
    if (!ok) {
      const ta = el('textarea', { value: text });
      root.appendChild(ta); ta.select();
      try { ok = doc.execCommand('copy'); } catch { ok = false; }
      ta.remove();
    }
    if (btn) { const was = btn.textContent; btn.textContent = ok ? 'Copied' : 'Select and copy it'; setTimeout(() => { btn.textContent = was; }, 1600); }
    return ok;
  }

  let box = null;
  /** One panel at a time. build(body, api) fills it; api: { status(text, kind), close(), el, copy } */
  function panel({ title, id = 'net-panel', modal = true, build, onClose = null }) {
    close();
    const scrim = modal ? el('div', { class: 'net-scrim' }) : null;
    const body = el('div');
    const status = el('div', { class: 'net-status', id: `${id}-status` });
    const b = el('div', { class: 'net-box', id }, [el('h2', { text: title }), body, status]);
    const wrap = el('div', {}, [scrim, b]);
    root.appendChild(wrap);
    const api = {
      el, copy, body, root: b,
      status(text, kind = '') { status.textContent = text || ''; status.className = `net-status${kind ? ` ${kind}` : ''}`; },
      close() { if (box === api) { wrap.remove(); box = null; if (onClose) onClose(); } },
      get open() { return box === api; },
    };
    box = api;
    b.addEventListener('keydown', (ev) => { if (ev.key === 'Escape') api.close(); });
    build(body, api);
    return api;
  }
  function close() { if (box) box.close(); }

  /** A plain message with an OK button. */
  function message(title, text) {
    return new Promise((res) => {
      panel({ title, id: 'net-msg', onClose: res, build: (body, api) => {
        for (const line of [].concat(text)) body.appendChild(el('p', { text: line }));
        const ok = el('button', { class: 'net-go', text: 'OK', onclick: () => api.close() });
        body.appendChild(el('div', { class: 'net-row' }, [ok]));
        setTimeout(() => ok.focus(), 0);
      } });
    });
  }

  // ---- the in-game bar (top centre) and chat line
  // where the bar sits: top centre by default; spot() -> { left, top } (css px) moves it (the phone HUD has its menu
  // buttons along the top, so there it goes under the party frames)
  let bar = null, spot = () => null;
  function placeBar() {
    if (!bar) return;
    const s = spot();
    if (s) Object.assign(bar.style, { left: `${Math.round(s.left)}px`, top: `${Math.round(s.top)}px`, transform: 'none' });
    else Object.assign(bar.style, { left: '', top: '', transform: '' });
  }
  function setBar(parts) {
    if (bar) { bar.remove(); bar = null; }
    if (!parts) return;
    bar = el('div', { class: 'net-bar', id: 'net-bar' }, parts.filter(Boolean).map((p) => (p.on ? el('button', { text: p.label, id: p.id || '', class: p.cls || '', onclick: p.on }) : el('span', { text: p.label, id: p.id || '' }))));
    root.appendChild(bar);
    placeBar();
  }
  setInterval(placeBar, 1000);
  window.addEventListener('resize', () => setTimeout(placeBar, 50));
  let chat = null;
  function openChat(onSend) {
    if (chat) { chat.querySelector('input').focus(); return; }
    const inp = el('input', { type: 'text', maxLength: 140, placeholder: 'Say something to your party', id: 'net-chat-input', autocomplete: 'off' });
    const done = () => { if (chat) { chat.remove(); chat = null; } };
    const send = () => { const t = inp.value; done(); if (t.trim()) onSend(t); };
    inp.addEventListener('keydown', (ev) => { if (ev.key === 'Enter') { ev.preventDefault(); send(); } else if (ev.key === 'Escape') done(); });
    inp.addEventListener('blur', () => setTimeout(() => { if (chat && doc.activeElement !== inp) done(); }, 150));
    chat = el('div', { class: 'net-chat' }, [inp, el('button', { text: 'Send', onmousedown: (ev) => ev.preventDefault(), onclick: send })]);
    root.appendChild(chat);
    setTimeout(() => inp.focus(), 0);
  }

  return { el, panel, close, message, copy, setBar, openChat, setBarSpot(fn) { spot = fn || (() => null); placeBar(); }, get chatOpen() { return !!chat; }, get panelOpen() { return !!box; }, root };
}
