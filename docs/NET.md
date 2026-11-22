# Online co-op (NET)

Built 2026-11-22. Up to 4 friends play together: one hosts in their browser, the others join with a short room code.
No game server of ours. For Scott and his friends, not a public release.

## How friends connect

**Room code (the normal way)**

1. The host opens Lexicon Realms, picks a hero on Choose your hero and presses **Host a game**. Their hero enters the
   world and a panel shows a 5-letter room code (for example `BYV57`). They press Play and keep the tab open.
2. Each friend opens Lexicon Realms on their own PC or phone, picks their own hero, presses **Join a game**, types the
   code and presses Join. A second or two later they stand beside the host.
3. Everyone plays. Enter (or the Chat button) opens a chat line. Party frames show friends' health; names float over
   their heads; the top bar (on a phone, under the party frames) shows the room, the player count, Chat and Leave.
4. A friend presses **Leave** to go back to their character list. The host presses **End game** (twice when friends
   are in) to send everyone home and keep playing alone.

**Join codes (when room codes do not work)**

1. The friend presses Join a game, opens "Use join codes", presses **Make my join code**, copies it and sends it to
   the host by any text message.
2. The host presses the Room button on the bar, opens "A friend sent you a join code", pastes it, presses **Make reply
   code**, copies the reply and sends it back.
3. The friend pastes the reply and presses Connect. Each code is about 570 characters.

Nothing to set up. No accounts, no downloads, nothing for the owner to configure.

## Signalling: how two browsers find each other

WebRTC data channels run browser to browser, but the two sides must first swap one "offer" and one "answer" (SDP text
with ICE candidates, which include IP addresses). Options weighed:

| Option | Verdict |
|---|---|
| a. Copy-paste codes | Built. Zero services, always works when the networks allow a direct connection. Clunky (two texts per friend). |
| b1. PeerJS cloud broker (0.peerjs.com), spoken directly without the PeerJS library | Tried 2026-11-22, not used: it accepts the connection and replies OPEN, then closes the socket as soon as an OFFER is sent (seen from Node and from Chrome, with our own ids and with server-issued ids). |
| b2. Free public MQTT brokers over secure WebSocket (HiveMQ `broker.hivemq.com:8884`, EMQX `broker.emqx.io:8084`) | **Built, the default.** No account, no library: MQTT 3.1.1 is spoken directly (about 60 lines in `src/net/transport.js`). Both brokers are used at once, so one being down does not matter. |
| b3. A Cloudflare Worker / Durable Object of our own | Not needed now. It would need the owner's Cloudflare account; it is the fallback if the public brokers ever go away. |
| c. STUN | Google's public STUN (`stun.l.google.com:19302`), normal practice, no account. |
| c. TURN (relay for strict networks) | Not used: it costs money or needs an account. Known limit, below. |

**What passes through the MQTT brokers:** only the offer and answer for each join (a few KB), plus random ids. The
topic is a SHA-256 hash of the room code, and every message is AES-GCM encrypted with a key derived from the room code
(PBKDF2, 100,000 rounds), so the broker, or anyone watching its public feed, sees ciphertext on a meaningless topic. No
names, heroes, saves, chat or game data ever go through a broker; all of that goes peer to peer over the WebRTC data
channel, which WebRTC encrypts (DTLS). Google STUN sees each player's public IP address, as any STUN does.

The public brokers are free test services with no promise of uptime. If both are down, the host panel says room codes
are not working and opens the join-code box; the joining side says the same.

Swappable: `src/net/transport.js` defines a Signal (`open(id)`, `send(dst, msg)`, `on('message')`, `close()`).
`signalFor(kind, code)` picks MQTT (default), `local` (BroadcastChannel, two tabs on one PC) or `relay` (the test
driver carries messages). `?net=local` or `?net=relay` in the link selects them; `?stun=0` turns STUN off.

No library was added. Everything is browser-native (RTCPeerConnection, WebSocket, WebCrypto, CompressionStream).

## Game model

- **Host-authoritative.** The host's tab runs the one sim (`src/sim/`), at 20 Hz as always. Guests do not run the sim.
- **Guests send commands**: the same command objects local input and menus make (`{ t: 'move' }`, `cast`, `equip`,
  `quest_accept`, ...), batched per tick with a sequence number. The host queues them into the world like its own.
  The only command a guest may not send is one that touches the host's device-wide Shared chest tab.
- **Host sends frames** every tick (20 Hz) to each guest (`src/net/frames.js`): entities new to the guest's view in
  full, then only the changed fields of the ones it has; the guest's own HUD block when it changes; projectiles; and
  this tick's events the guest may see. Positions travel as whole sixteenths of a pixel. The guest's own hero is sent in
  full; friends are trimmed (no bags, quests, talents); foes only within 60 tiles; another hero's private lines (their
  XP, loot, vendor, quest log) never reach other guests.
- **Guest playback**: frames rebuild a normal snapshot, so the renderer, HUD and menus run unchanged. The game loop takes
  one frame per tick and the renderer interpolates as it does solo. Two or more frames behind, it jumps to the newest
  and keeps every event.
- **Heroes**: a guest sends its stored hero (the same save the select screen keeps) on join. The host checks the name
  and class, places it beside the host's hero and adds it with the existing `addPlayer` path (logged in `joins`, with
  `party`). Every 5 s, and on leaving, the host sends back the guest's hero as a save; the guest stores it on its own
  device. So progress is kept even if the host drops (at most 5 s lost), and the host's world stays the host's.
- **Party**: everyone in the room is one party: `e.party` on each player, set by `addPlayer({ party })` and
  `world.setParty(id, party)` (a logged system action). The party id is the host's hero id. A kill is shared with every
  party member who is alive, in the same zone and within 40 tiles of the foe (`PARTY_SHARE_PX`): each gets their own
  kill XP (for their level, not split), their own quest kill credit and their own loot roll. The tagger rule is
  unchanged.
- **Dungeons** (being built on main with "own copy per party"): key the copy on `e.party`. Solo heroes have no `party`
  field at all, so solo state, hashes and saves are unchanged; a dungeon can treat a hero without a party as a party
  of one.
- **Chat**: Enter (or Chat) opens a text line; the host relays each line to everyone. "<name> joined the party." and
  "<name> left." lines appear for everyone.
- **Version check**: host and guests must run the same build (`version.json`); a guest on another build is told to
  reload. The game does not auto-reload mid co-op game.

## Measured (qa/integrate/coop.py, localhost, 4 players, 2026-11-22)

| What | Result |
|---|---|
| Host to each guest | about 7.3 KiB/s while the host walks and a guest fights (about 60 kbit/s); idle is less |
| Guest to host | under 0.1 KiB/s (commands and a ping every 2 s) |
| Guest key press to own hero drawn moving | median 95 to 143 ms over runs (host's own: 30 to 47 ms) |
| Guest command to the host's frame confirming it | median 30 to 62 ms |
| Room code to joined, live through the public brokers with STUN | about 2 s (room opens in under 1 s) |
| Wrong room code | "No game found" after 12 s |

The guest's extra delay is one trip to the host and back plus up to one tick on each side. Over the internet add the
real round trip between the two homes (typically 20 to 80 ms in one country).

## Known limits

- **Strict networks.** With STUN only (no TURN relay), two players behind strict NATs (some phone carriers, some
  offices, some campus networks) cannot connect directly. The join then fails with "could not connect"; trying a
  phone hotspot often helps. Fixing this for good needs a TURN service (paid, or an account).
- **Host leaving ends the game.** The host's tab is the world. If the host ends the game or closes the tab, guests get
  "The host ended the game. Your hero is saved..." and return to their character list. If the host's connection just
  dies, guests see "Lost the connection to the host" after up to 8 s; their hero keeps everything up to the last 5 s save.
- **Host in a background tab** keeps ticking (a Web Worker timer replaces the paused animation loop). A **phone host**
  is a poor host: iPhone and Android suspend a background browser tab, which freezes the world for everyone.
- **Guest phone in the background**: the phone stops answering; after 45 s of silence the host removes the hero (saved
  as of the last 5 s save). Coming back shows "Lost the connection to the host".
- **The world is the host's.** Night, respawns, the bounty boards' day and the Lantern Chest's Shared tab are the host's.
  Guests cannot use the host's Shared tab; their own hero tab of the chest travels with their hero.
- **Trust.** The host trusts each friend's hero data (no anti-cheat). Fine for friends; not for strangers.
- **Room code clash** on the public brokers is possible in theory (28 million codes); a clash would show as the wrong
  host answering.
- **Wrong-code wait**: there is no "no such room" reply on MQTT, so a wrong code waits 12 s.

## Files

- `src/net/transport.js`: data channel link (chunking, close detection), offer / answer, copy-paste codes, the MQTT,
  local and relay signals, `hostRoom` / `joinRoom`.
- `src/net/session.js`: the protocol (hello, welcome, cmd, f, save, chat, sys, ping, refuse, bye), host and guest.
- `src/net/frames.js`: per-guest delta frames and the guest's rebuild (pure, node-tested).
- `src/net/coop.js`: lobby flows and what `main.js` calls each tick.
- `src/net/netui.js`: the HTML panels, the in-game bar and the chat line (`data-overlay`; `ui.js` ignores input inside).
- `src/sim/world.js`, `src/sim/progression.js`, `src/sim/constants.js`: party id, `setParty`, kill sharing.
- `src/main.js`: guest playback in `tick()`, host hooks around `world.step()`, name plates, save hooks.
- `src/ui/ui.js`, `src/ui/title.js`, `src/ui/uivm.js`, `src/core/viewmodel.js`: Host / Join buttons, party frames,
  name plates, `ui.saveHero`, overlay input guard.
- Tests: `qa/tests/coop.test.mjs` (kill sharing, setParty, frames), `qa/integrate/coop.py` (browsers; `--live` for the
  real brokers).
