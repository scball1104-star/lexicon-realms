// The UI's own art loader (assets/ui/ + the class sprite atlases for the creation preview). Separate from
// src/core/assets.js so the HUD owns its files: copied from Lexicon Quest next/assets/ui (Scott's art) on 2026-11-19,
// plus logo_realms.png (qa/ui/make_logo.py).
//
//   const art = await loadUiArt({ font })     font: the BitmapFont main.js already built from assets/ui/font.json
import { BitmapFont, setNamedColors } from '../core/font.js';

export const CLASS_IDS = ['warden', 'mender', 'scribe', 'wayfinder', 'inkblade'];

const IMAGES = {
  ui: 'assets/ui/ui.png', window: 'assets/ui/window.png', large: 'assets/ui/font_large.png', num: 'assets/ui/font_num.png',
  heads: 'assets/ui/heads.png', portraits: 'assets/ui/portraits.png', logo: 'assets/ui/logo_realms.png',
  backdrop: 'assets/ui/title_backdrop.png', party: 'assets/sprites/lq/party_field.png',
};
const JSON_FILES = {
  ui: 'assets/ui/ui.json', window: 'assets/ui/window.json', large: 'assets/ui/font_large.json', num: 'assets/ui/font_num.json',
  numBig: 'assets/ui/font_num_big.json', heads: 'assets/ui/heads.json', portraits: 'assets/ui/portraits.json',
  party: 'assets/sprites/lq/party_field.json',
};

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`ui image failed to load: ${url}`));
    img.src = url;
  });
}
async function loadJson(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`ui json failed to load: ${url} (${r.status})`);
  return r.json();
}
const optional = (p) => p.catch(() => null);

export async function loadUiArt({ font }) {
  const img = {}, js = {};
  await Promise.all([
    ...Object.entries(IMAGES).map(([k, u]) => loadImage(u).then((v) => { img[k] = v; })),
    ...Object.entries(JSON_FILES).map(([k, u]) => loadJson(u).then((v) => { js[k] = v; })),
  ]);
  // class atlases (art agent): optional, the preview falls back to the LQ hero sprite
  const chars = {};
  await Promise.all(CLASS_IDS.map(async (c) => {
    const [j, i] = await Promise.all([optional(loadJson(`assets/sprites/chars/${c}.json`)), optional(loadImage(`assets/sprites/chars/${c}.png`))]);
    if (j && i) chars[c] = { json: j, img: i };
  }));
  // the Realms icon atlases (art lane, assets/icons/): optional, the HUD falls back to ui.png icons
  const icons = {};
  await Promise.all(['abilities24', 'abilities16', 'talents16', 'items16', 'prof16', 'mounts16', 'mounts24'].map(async (k) => {
    const [j, i] = await Promise.all([optional(loadJson(`assets/icons/${k}.json`)), optional(loadImage(`assets/icons/${k}.png`))]);
    if (j && i) icons[k] = { json: j, img: i };
  }));
  // npc heads and portraits (art lane, INTEGRATION_TODO 16): keyed by npc id through each json's `npcs` map; optional
  const npcArt = {};
  await Promise.all([['heads', 'npc_heads'], ['portraits', 'npc_portraits']].map(async ([k, f]) => {
    const [j, i] = await Promise.all([optional(loadJson(`assets/portraits/${f}.json`)), optional(loadImage(`assets/portraits/${f}.png`))]);
    if (j && i) npcArt[k] = { json: j, img: i };
  }));
  setNamedColors(js.ui.textColors);
  setNamedColors(js.ui.rarity);
  const large = new BitmapFont(js.large, img.large, { id: 'large', fallback: font });
  return {
    ui: js.ui, uiImg: img.ui, win: js.window, winImg: img.window,
    font, large, num: js.num, numBig: js.numBig, numImg: img.num,
    heads: js.heads, headsImg: img.heads, portraits: js.portraits, portraitsImg: img.portraits,
    logo: img.logo, backdrop: img.backdrop, party: js.party, partyImg: img.party, chars, icons, npcArt,
  };
}
