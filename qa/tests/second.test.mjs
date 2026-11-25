// Phone as a second screen (wave 9 second; docs/NET.md "Phone as a second screen"; src/net/second.js, qr.js): the QR
// encoder's maths against the standard's known values, the pairing link (room code + key after the #, nothing else),
// the pairing desk (one key, 2 minutes, one use, Allow, resume, one phone), the phone's short command list, and a PC and
// a phone over a pipe: nothing before Allow, the hero's frames after, commands filtered, the quest pick, unpair.
import { assert, eq } from './_helpers.mjs';
import { createWorld } from '../../src/sim/world.js';
import { buildContent } from '../../src/data/maps/index.js';
import { gfMul, rsDivisor, rsRemainder, formatBits, qrEncode, codewords } from '../../src/net/qr.js';
import { pairLink, readPair, phoneCommandOk, createPairDesk, newPairKey, sameKey, PAIR_TTL_MS, WORDS, createSecondHost, createSecondPhone, PHONE_EVERY } from '../../src/net/second.js';
import { inviteLink, readInvite } from '../../src/net/dropin.js';

const C = buildContent();
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/** Two ends of a reliable, ordered pipe (the data channel), delivering at once (as dropin.test.mjs). */
function pipe() {
  const mk = () => ({ h: { message: [], close: [] }, early: [], open: true });
  const a = mk(), b = mk();
  const link = (me, other) => ({
    get open() { return me.open; }, stats: {}, get buffered() { return 0; },
    send(obj) { if (!me.open) return false; const m = JSON.parse(JSON.stringify(obj)); if (other.h.message.length) for (const f of other.h.message) f(m); else other.early.push(m); return true; },
    on(ev, fn) { me.h[ev].push(fn); if (ev === 'message') for (const m of me.early.splice(0)) fn(m); },
    close(why = 'closed') { if (!me.open) return; me.open = false; other.open = false; for (const f of me.h.close) f(why); for (const f of other.h.close) f(why); },
  });
  return [link(a, b), link(b, a)];
}

/** A PC with a solo hero and a pairing desk; the phone end over a pipe. */
function rig() {
  const world = createWorld({ seed: 11, content: C });
  const id = world.addPlayer({ name: 'Ash', cls: 'wayfinder' });
  world.step();
  const desk = createPairDesk();
  const got = { cmds: [], ui: [], chat: [], asks: [], paired: 0, gone: [] };
  const host = createSecondHost({ desk, hero: () => (world.get(id) ? { id, name: world.get(id).name } : null), state: () => ({ nav: null, untracked: [], coop: false }),
    on: { ask: (answer) => got.asks.push(answer), paired: () => got.paired++, gone: (w) => got.gone.push(w), cmd: (c) => got.cmds.push(c), ui: (nav, un) => got.ui.push([nav, un]), chat: (t) => got.chat.push(t) } });
  let snap = world.snapshot();
  const tick = (n = 1) => { for (let i = 0; i < n; i++) { const ev = world.step(); snap = world.snapshot(); host.frame(snap, ev); } };
  return { world, id, desk, host, got, tick, snap: () => snap };
}
function phoneOn(r, pair, on = {}) {
  const [a, b] = pipe();
  r.host.addLink(a);
  const seen = { ask: 0, welcome: null, end: null, lines: [] };
  const p = createSecondPhone({ link: b, pair, on: { ask: () => seen.ask++, welcome: (w) => { seen.welcome = w; }, end: (why) => { seen.end = why; }, line: (l) => seen.lines.push(l), ...on } });
  return { p, seen, a, b };
}

export const tests = [
  {
    name: 'second: the QR encoder matches the standard (Reed-Solomon, format bits, both copies, the blocks)',
    fn() {
      // the well-known "HELLO WORLD" 1-Q example: 13 data codewords, 13 error correction codewords
      assert(same(rsRemainder([32, 91, 11, 120, 209, 114, 220, 77, 67, 64, 236, 17, 236], rsDivisor(13)), [168, 72, 22, 82, 217, 54, 156, 0, 46, 15, 180, 122, 16]), 'RS HELLO WORLD');
      eq(gfMul(1, 77), 77, 'gf 1'); eq(gfMul(0, 9), 0, 'gf 0');
      // the standard's format table: M mask 0, L mask 0, H mask 7
      eq(formatBits(0, 0), 0b101010000010010, 'M0'); eq(formatBits(1, 0), 0b111011111000100, 'L0'); eq(formatBits(2, 7), 0b000100000111011, 'H7');
      for (const s of ['https://example.github.io/lexicon-realms/#pair=BYV57.QW3ERTYU7PAS2DFG', 'x', 'A'.repeat(150)]) {
        const q = qrEncode(s), n = q.size, d = (x, y) => q.dark(x, y);
        let f1 = 0, f2 = 0;
        [[8, 0], [8, 1], [8, 2], [8, 3], [8, 4], [8, 5], [8, 7], [8, 8], [7, 8], [5, 8], [4, 8], [3, 8], [2, 8], [1, 8], [0, 8]].forEach(([x, y], i) => { if (d(x, y)) f1 |= 1 << i; });
        for (let i = 0; i < 8; i++) if (d(n - 1 - i, 8)) f2 |= 1 << i;
        for (let i = 8; i < 15; i++) if (d(8, n - 15 + i)) f2 |= 1 << i;
        eq(f1, f2, `format copies agree (${s.length})`);
        eq(formatBits(0, q.mask), f1, `level M, the chosen mask (${s.length})`);
        assert(d(0, 0) && d(6, 6) && !d(1, 1) && d(3, 3) && d(n - 1, 0) && d(0, n - 1) && !d(7, 7), 'finder patterns');
        assert(d(8, n - 8), 'the dark module');
        for (let i = 8; i < n - 8; i++) eq(d(i, 6), i % 2 === 0, 'timing row');
      }
      const bytes = [...new TextEncoder().encode('https://example.github.io/lexicon-realms/#pair=BYV57.QW3ERTYU7PAS2DFG')];
      const cw = codewords(bytes, 5);
      eq(cw.length, 134, 'version 5 codewords');
      const b0 = [], b1 = [], e0 = [], e1 = [];
      for (let i = 0; i < 86; i++) (i % 2 ? b1 : b0).push(cw[i]);
      for (let i = 86; i < 134; i++) ((i - 86) % 2 ? e1 : e0).push(cw[i]);
      assert(same(rsRemainder(b0, rsDivisor(24)), e0) && same(rsRemainder(b1, rsDivisor(24)), e1), 'each block divides by the generator');
      eq(qrEncode('A'.repeat(400)), null, 'too long: null (the link as text still shows)');
      // a live page address with a long path still fits
      assert(qrEncode('https://someone.github.io/lexicon-realms/index.html?net=local&stun=0#pair=BYV57.QW3ERTYU7PAS2DFG').version <= 10, 'fits');
    },
  },
  {
    name: 'second: the pairing link holds the room code and the key after the #, and nothing personal',
    fn() {
      const loc = { origin: 'https://ex.github.io', pathname: '/lr/', search: '?net=local&name=Scott&dev=1' };
      const key = newPairKey();
      assert(/^[A-HJKMNP-Z2-9]{16}$/.test(key), 'key: 16 letters of the room-code alphabet');
      const link = pairLink(loc, 'byv57', key);
      eq(link, `https://ex.github.io/lr/?net=local#pair=BYV57.${key}`, 'the link');
      assert(!/scott|dev/i.test(link), 'no name, no dev switch');
      assert(same(readPair({ hash: link.slice(link.indexOf('#')) }), { code: 'BYV57', key }), 'read back');
      eq(readPair({ hash: '#join=BYV57' }), null, 'an invite link is not a pairing link');
      eq(readInvite({ hash: `#pair=BYV57.${key}` }), null, 'a pairing link is not an invite');
      eq(readPair({ hash: '#pair=BYV57.SHORT' }), null, 'short key');
      eq(pairLink(loc, 'XX', key), null, 'bad code');
      assert(inviteLink(loc, 'BYV57').endsWith('#join=BYV57'), 'invite links unchanged');
    },
  },
  {
    name: 'second: the phone may equip, use, sort and arrange the bar, and nothing else',
    fn() {
      for (const t of ['equip', 'unequip', 'use_item', 'bag', 'quest_share', 'bar_set']) assert(phoneCommandOk({ t }), t);
      for (const t of ['move', 'stop', 'cast', 'target', 'interact', 'buy', 'sell', 'buyback', 'chest_take', 'chest_store', 'chest_move', 'trade_offer', 'trade_open',
        'learn_talent', 'respec', 'train', 'mount', 'ride', 'fly', 'wdoor_set', 'rez', 'quest_accept', 'quest_turnin', 'quest_abandon', 'prof_craft', 'emote', 'sit', 'loot_take'])
        assert(!phoneCommandOk({ t }), `no ${t}`);
      assert(!phoneCommandOk(null) && !phoneCommandOk({}) && !phoneCommandOk('equip') && !phoneCommandOk([{ t: 'equip' }]), 'junk');
    },
  },
  {
    name: 'second: the pairing desk: one key, 2 minutes, one use, Allow, resume, one phone at a time',
    fn() {
      let t = 1000, n = 0;
      const desk = createPairDesk({ now: () => t, pick: (k) => (n++ * 7) % k });
      const o = desk.offer();
      eq(desk.hello({ pair: 'A'.repeat(16) }), 'no', 'wrong key');
      eq(desk.hello({}), 'no', 'the room code alone is not enough');
      eq(desk.hello({ pair: o.key }), 'ask', 'the right key asks the player');
      eq(desk.hello({ pair: o.key }), 'no', 'a second ask waits');
      const al = desk.allow();
      assert(al && al.token.length === 16 && desk.paired, 'Allow gives a token');
      eq(desk.hello({ pair: o.key }), 'no', 'the key is spent');
      eq(desk.hello({ resume: al.token }), 'resume', 'resume');
      eq(desk.hello({ resume: 'B'.repeat(16) }), 'no', 'a wrong token');
      desk.offer();
      eq(desk.hello({ pair: desk.offered.key }), 'no', 'a second phone while one is paired');
      desk.unpair();
      eq(desk.hello({ resume: al.token }), 'no', 'unpaired: the token is dead');
      const o2 = desk.offer();
      t += PAIR_TTL_MS;
      eq(desk.hello({ pair: o2.key }), 'no', 'expired'); eq(desk.offered, null, 'nothing offered');
      const o3 = desk.offer();
      eq(desk.hello({ pair: o3.key }), 'ask', 'ask'); desk.refuse();
      eq(desk.hello({ pair: o3.key }), 'no', 'No: the key stays spent'); assert(!desk.paired, 'not paired');
      assert(sameKey('ABC', 'ABC') && !sameKey('ABC', 'ABD') && !sameKey('', '') && !sameKey('AB', 'ABC'), 'sameKey');
    },
  },
  {
    name: 'second: a PC and a phone: nothing before Allow, then the hero at 5 a second, commands filtered, unpair',
    fn() {
      const r = rig();
      const o = r.desk.offer();
      const ph = phoneOn(r, { key: o.key });
      eq(ph.seen.ask, 1, 'the phone is told to wait for Allow');
      eq(r.got.asks.length, 1, 'the PC asks');
      r.tick(8);
      eq(ph.p.nextFrame(), null, 'no frames before Allow');
      ph.p.sendCmds([{ t: 'equip', bagSlot: 0 }]);
      eq(r.got.cmds.length, 0, 'no commands before Allow');
      r.got.asks[0](true);
      assert(ph.seen.welcome && ph.seen.welcome.id === r.id && ph.seen.welcome.host === 'Ash' && ph.seen.welcome.token, 'welcome: the hero, its name, a token');
      eq(r.got.paired, 1, 'paired');
      r.tick(PHONE_EVERY * 3);
      const f = ph.p.nextFrame();
      assert(f && f.snap.hud[r.id], 'the hero\'s own HUD block arrives');
      const me = f.snap.entities.find((e) => e.id === r.id);
      assert(me && Array.isArray(me.bag) && me.equip, 'the hero arrives whole (bags, gear)');
      eq(ph.p.nextFrame(), null, 'all taken');
      ph.p.sendCmds([{ t: 'move', dx: 1, dy: 0 }, { t: 'equip', bagSlot: 0, item: 'x' }, { t: 'cast', slot: 1 }, { t: 'buy', npc: 1 }, { t: 'bar_set', slot: 2, entry: null }]);
      eq(r.got.cmds.map((c) => c.t).join(','), 'equip,bar_set', 'only the phone\'s list reaches the PC');
      // a hand-made message past the phone's own filter is filtered on the PC too
      ph.b.send({ t: 'cmd', c: [{ t: 'sell', npc: 2, bag: 0 }, { t: 'use_item', bag: 1 }] });
      eq(r.got.cmds.map((c) => c.t).join(','), 'equip,bar_set,use_item', 'the PC filters as well');
      ph.p.syncUi('wm_name_twice', new Set(['a']));
      ph.p.syncUi('wm_name_twice', new Set(['a']));
      eq(r.got.ui.length, 1, 'the quest pick goes once (only on a change)');
      assert(same(r.got.ui[0], ['wm_name_twice', ['a']]), 'nav and tracker');
      ph.p.chat('On my way');
      eq(r.got.chat[0], 'On my way', 'a chat line');
      r.host.line({ ch: 'party', text: '[Party] Bryn: hi', talk: { kind: 'party', from: 'Bryn', body: 'hi' } });
      eq(ph.seen.lines[0].talk.from, 'Bryn', 'party lines reach the phone');
      ph.p.leave();
      eq(ph.seen.end, 'unpaired', 'Unpair on the phone');
      assert(!r.desk.paired, 'the PC forgets it');
    },
  },
  {
    name: 'second: a wrong key, a No and a second phone are refused; a resume comes back without Allow',
    fn() {
      const r = rig();
      const o = r.desk.offer();
      const bad = phoneOn(r, { key: 'A'.repeat(16) });
      eq(bad.seen.end, 'pair', 'wrong key: refused');
      eq(r.got.asks.length, 0, 'no ask for a wrong key');
      const no = phoneOn(r, { key: o.key });
      r.got.asks[0](false);
      eq(no.seen.end, 'pair', 'No: refused');
      const o2 = r.desk.offer();
      const ok = phoneOn(r, { key: o2.key });
      r.got.asks[1](true);
      const token = ok.seen.welcome.token;
      const second = phoneOn(r, { key: o2.key });
      eq(second.seen.end, 'pair', 'a second phone (and a spent key) is refused');
      assert(!ok.seen.end, 'the paired phone stays');
      ok.a.close('lost');                   // the phone slept: the link drops
      const back = phoneOn(r, { resume: token });
      assert(back.seen.welcome && back.seen.welcome.id === r.id, 'resume: back without a new code');
      eq(r.got.asks.length, 2, 'and without asking again');
      r.host.unpair('host_left');
      eq(back.seen.end, 'host_left', 'the PC closing the game ends the phone');
    },
  },
  {
    name: 'second: the phone words are plain (no em dashes) and the Options button is short',
    fn() {
      const all = JSON.stringify(WORDS) + WORDS.panelLeft(112) + WORDS.askBody('Ash');
      assert(!all.includes(String.fromCharCode(0x2014)), 'no em dash');
      eq(WORDS.panelLeft(112), 'Code ends in 1:52', 'the timer');
      assert(WORDS.optionsButton.length <= 14, 'fits the Options title bar');
    },
  },
];
