# Lexicon Realms: contracts

The shapes every module agrees on. `docs/DESIGN.md` says what the game is; this file says what the data and the
messages look like. Written 2026-11-19 by the foundation wave.

Status words: **LIVE** = the foundation code implements it and tests cover it. **SPEC** = agreed shape, not built yet;
the next wave builds to it. If you need to change a shape, change it here in the same change as the code, and say so
in your report.

Rules that hold everywhere:

- Ids are lowercase `snake_case` strings for content (`briar_wolf`, `warden_shield_slam`), integers for runtime
  entities (`11`). Content ids never change once a save can hold them.
- Time inside the sim is **ticks** (20 per second). Data files may write seconds (`cooldown: 8`); the sim converts
  with `Math.round(sec * 20)` when it loads the data. Never store a wall-clock time in state.
- Distances in data are **pixels** (16 px = 1 tile). Positions in zone data are **tiles**.
- Player-facing text lives in data, never in code. No em dashes in any text.

---

## 1. Module map (LIVE)

| Path | Owns | May import |
|---|---|---|
| `src/sim/` | rules, state, ticks, events | `src/sim/` only. Data arrives as the `content` argument |
| `src/data/` | plain data modules (this file, section 7) | `src/data/` only |
| `src/render/` | draws snapshots: tiles, sprites, camera, zoom, lighting, particles | `src/render/` (and `src/core/` helpers) |
| `src/input/` | keyboard + mouse to command objects | nothing from sim |
| `src/ui/` | HUD and menus; reads the view model only | `src/ui/`, `src/core/font.js` |
| `src/audio/` | music and sfx; listens to the event bus | `src/audio/` |
| `src/core/` | loop, assets, bus, view model, font | `src/core/` |
| `src/main.js` | wiring | everything |

`qa/tests/architecture.test.mjs` enforces the sim rule (imports and banned globals: `Date.now`, `Math.random`,
`document`, `window`, `performance`, timers, `fetch`, `localStorage`).

---

## 2. Commands (LIVE)

Every player action is a command object. Input produces them; the sim applies them at the start of the next tick, in
the order they were enqueued. Remote players (phase 2) use exactly the same path.

### 2.1 Envelope

```js
world.enqueue(entityId, cmd)          // local
{ tick, id, cmd }                     // on the wire and in a replay log (tick = the tick that applies it)
```

### 2.2 Command kinds

| `t` | Fields | Effect | Events |
|---|---|---|---|
| `move` | `dx, dy` each -1, 0 or 1 | sets the held direction; the actor keeps walking until `stop` or a new `move`. Moving breaks a cast-time spell or channel (not Run-on Sentence) and stands you up | none (position shows in the snapshot) |
| `stop` | | clears the held direction | none |
| `target` | `id` (entity id or `null`) | sets or clears the target. Must be in the same zone and not self. A new target drops your Ink Marks; a non-hostile target stops auto-attack | `target`, or `cmd_reject` reason `bad_target` |
| `cast` | `ability` (id) **or** `slot` (1..12), `target` (id or null, default = current target), `at` ({x, y} px, ground-targeted only) | starts an ability (section 5.7). `slot` resolves through the caster's `bar`. A physical ability at a foe (or any Wayfinder shot) also starts auto-attack | `cast_start`, `cast_stop`, `cast_fail`, `projectile`, `damage`, `heal`, `aura_add` ... (LIVE) |
| `attack` | `id` (default target), `stop` | start (or stop) auto-attack on a hostile (right-click) | `target` if it changed (LIVE) |
| `interact` | `id` | talk to an NPC (a trainer adds `trainer: { cls, offer, respecCost }` to the event; the quest module then emits `quest_dialog`), or use a quest node object. Range 40 px | `interact`, `quest_dialog`, or `interact_fail` reason `range` (LIVE) |
| `cancel` | | cancel the current cast or channel | `cast_stop` reason `cancel` (LIVE) |
| `cancel_aura` | `aura` | drop a helpful aura on self (stealth, a stance) | `aura_remove` reason `cancel` (LIVE) |
| `sit` | | out of combat only: after 1 s, +6% max health and mana per second (Honey Roll: 10%) until you move | `sit` (LIVE) |
| `train` | `ability`, `npc` (optional) | learn an ability at your class trainer (range 40 px): level and gold (PROGRESSION 6.3); it goes on the first free bar slot | `train` or `train_fail` reason `range`/`level`/`gold`/`known`/`unknown` (LIVE) |
| `learn_talent` | `talent` | anywhere; needs a free point, the tier open in its branch, and ranks left | `talent` kind `learn`, or `talent_fail` reason `points`/`tier`/`max`/`requires`/`unknown` (LIVE) |
| `unlearn_talent` | `talent`, `npc` (optional) | at your trainer: one rank back, refused if a deeper node needs it. Pays the respec price once per trainer visit | `respec_paid`, `talent` kind `unlearn`, or `talent_fail` reason `range`/`dependency`/`gold` (LIVE) |
| `respec` | `npc` (optional) | at your trainer: refund every point. First respec free, then `10 + 5 x level` gold; one payment covers the visit | `respec_paid`, `talent` kind `respec` (LIVE) |
| `quest_accept` / `quest_turnin` / `quest_abandon` | `quest`, `choice` (reward index), `npc` (entity id, optional) | the quest module (section 7.7). Accept and turn-in need the quest's giver / turn-in npc within 64 px in your zone (fix pass 1): `npc` names the dialog's entity, else any npc of that template in reach counts | `quest`, or `cmd_reject` reason `range` (LIVE) |
| `loot_take` | `index` (optional, into `hud.pendingLoot`) | take loot that did not fit your bag when it dropped (all of it that fits, or the one row) | `loot` with `from: null, pendingLeft`, or `inventory_fail` reason `bag_full`/`no_item` (LIVE, fix pass 1) |
| `equip` | `uid`, or `bag` (bag index) + `item`, or `item`; `slot` (`'main'` / `'off'`, optional) | a `bag` item goes onto the belt (`player.bags`, at most 4; `inventory_fail` `bags_full`). Otherwise wear an item from the bag (class, required level, weapon and armor type checked; armor not in combat). A two-hand weapon clears the off hand; the old piece goes to the bag. A weapon whose type has `offOk` (daggers) for a two-weapon class (`auto.offHand`, the Inkblade) goes in `slot`, or without it in the weaker hand (main on a tie); any other `slot` that is not the item's own is refused (`slot`) | `inventory` kind `equip`, or `inventory_fail` (LIVE) |
| `unequip` | `slot` | back to the bag (needs a free slot) | `inventory` kind `unequip`, or `inventory_fail` reason `empty`/`bag_full` (LIVE) |
| `use_item` | `bag` or `item` | a consumable's `use`: `heal_pct`, `mana_pct`, `rest_food` (sits you down), `dispel`; shared cooldown by `use.group` (`cd['item:<group>']`) | `heal`, `inventory` kind `use`, or `inventory_fail` reason `cooldown`/`full`/`level`/`not_usable` (LIVE) |
| `buy` | `npc` (entity id), `index` (stock row) or `item`, `qty` (stackables, 1..20) | at a vendor (range 40 px): gold and bag-space checks, then the item goes in the bag. Price: consumables and bags at `price`, gear at 4 x value (PROGRESSION 4.8 / 6.2) | `inventory` kind `buy` + `gold`, or `inventory_fail` reason `range`/`gold`/`bag_full`/`no_item` (LIVE, integration wave) |
| `sell` | `npc`, `uid` **or** `bag` (bag index) + `item` **or** `item`, `qty` (default the whole stack) | the vendor pays value x qty; quest items are never in the bag (section 7.4); the sale joins the buyback list (last 6). A bag index with neither `item` nor `uid` is refused (`no_item`): the list may have shifted since the client read it (fix pass 1). The same slot rule holds for `equip` and `use_item` | `inventory` kind `sell` + `gold`, or `inventory_fail` reason `no_value`/`no_item` (LIVE) |
| `buyback` | `npc`, `index` (into `hud.buyback`) | buy a sold item back for what it paid | `inventory` kind `buyback` (LIVE) |
| `chest_store` / `chest_take` / `chest_move` / `chest_row` / `chest_sort` | `chest` (entity id), `tab` (`'hero'` / `'shared'`), a bag slot (`uid` / `bag` + `item`) or a chest slot (`index` + `item`) or `glyph`, `qty` | the Lantern Chest (section "Storage" at the end) | `chest`, or `inventory_fail` (LIVE, 2026-11-20) |
| `set_app` | `app` (an appearance: every field a small index, src/data/appearance.js) | the free mirror (section "Appearance" at the end); only at a mirror the hero opened, out of combat; clamped, missing fields from the hero's look | `app_set`, or `interact_fail` (wave 6, 2026-11-24) |

Without combat content (no `classes` / `abilities` / `progression` in `content`), `cast` is the foundation stub: it
checks the global cooldown and emits `cast_start` then `cast_stop` reason `stub`; mobs only wander.

Unknown or malformed commands never throw: they emit `cmd_reject` with `reason` (`no_actor`, `bad_command`,
`unknown_command`, `bad_target`, `dead`, `not_interactable`, `combat`, `no_aura`).

### 2.3 Replay log

`main.js` keeps `[tick, entityId, cmd]` for the session (`window.__realms.commandLog`); in online co-op the host logs its
friends' commands there too, and `setParty` calls in `window.__realms.net.sysLog` (`{ tick, sys: 'party', id, party }`).
Seed + `addPlayer` calls + this log reproduce the session exactly (`qa/tests/sim.test.mjs` proves it over 2,000 ticks; `qa/sim/` over full fights
of every class and a 4,000-tick five-player session on the real map).

### 2.4 World API (LIVE)

```js
createWorld({ seed, content, systems })        // systems: optional [{ id, tick(world, events) }] run after each tick
restoreWorld(json, content, systems)
w.addPlayer({ name, cls, look, zone, x, y, level, xp, gold, talents, known, bar, bag, bags, equip, quests, questsDone,
              nodesUsed, respecs, lantern, gearMode: 'items' | 'design', designGear,
              qbag, pendingLoot, hp, res, cdLeft, auras,     // restores a saved character (the last six: w.saveFields)
              party })                                       // online co-op: the room's party id (docs/NET.md); solo: none
w.setParty(id, party)                           // co-op system action: party id on a hero (null: out). Party members alive,
                                                // in the foe's zone and within PARTY_SHARE_PX (40 tiles) of a kill each get
                                                // their own kill XP, quest credit and loot roll (xp event `party: true`).
                                                // The snapshot carries `party` (null solo) on every player. Dungeons key
                                                // their copies on it.
w.saveFields(id)                                // fix pass 1: the sim-owned part of a save, plain JSON:
                                                //   { qbag, pendingLoot, hp, res: { kind, cur }, cdLeft: { abilityOrItemKey: ticks left },
                                                //     auras: [{ id, left (ticks | null), stacks, def }] (own lasting buffs only), escorts: [quest ids] }
                                                // main.js merges it into its save and passes the whole save back to addPlayer.
                                                // Missing fields restore as before (full health and mana, no cooldowns).
                                                // An escort quest in the save restarts fresh on addPlayer: the escort npc
                                                // respawns at its start (`spawn` event) and the quest stays active; the
                                                // client never needs to strip `escort` ids (harmless if it still does).
w.removePlayer(id)                              // log-out: mobs forget them; their traps and escorts go. Event `leave` { id, name }
w.grantXp(id, amount, reason = 'quest', extra)  // the one way to give XP from outside combat (quests, exploration)
w.setLevel(id, L), w.learnAll(id), w.setTalents(id, talents)   // tests, the balance harness, a debug console
w.spawnMob({ mob, zone, x, y, level, wander, respawn, temporary })
w.emit(ev)                                      // a system adds an event to this tick
w.quests                                        // the quest module (tracker, marker, status queries)
w.internals                                     // rule modules, for tests and qa/sim/duel.mjs only
```

`gearMode` `items` (default when `content.items` exists) wears `equip` through `loot.js resolveItem`; `design` gives
the PROGRESSION 9.1 expected kit at `designGear` (default: the player's level), used by the balance harness.

---

## 3. Entity schema (LIVE)

Internal state is the same object plus a few internal fields; positions inside the sim are integer SUB units
(1/16 px). The snapshot (section 4) reports pixels.

```js
{
  id: 11,                       // stable integer, never reused in a world
  kind: 'player' | 'mob' | 'npc' | 'object',      // object: placed traps and zones (`obj`), quest nodes (`node`)
  zone: 'willowmere',
  x: 328, y: 399,               // feet point, px (snapshot). Feet box: 10 px wide, 6 px deep above the feet
  dir: 'down' | 'left' | 'right' | 'up',
  moving: false,
  name: 'Scott', level: 1,
  faction: 'player' | 'hostile' | 'neutral' | 'friendly',
  sprite: 'hero', template: 'briar_wolf',
  hp: 100, hpMax: 100,
  res: { kind: 'mana' | 'resolve' | 'focus', cur: 100, max: 100 } | null,   // cur may be fractional (regen per tick)
  stats: { str, agi, int, spi, sta, armor },          // base + growth + gear + talents
  derived: { ap, sp, crit, block, hpMax, gearSpeed },
  target: 23 | null,
  cast: { ability, target, at, startTick, endTick, kind: 'cast' | 'channel', nextTick } | null,
  auras: [{ id, src, stacks, startTick, until, nextTick, absorb, name, icon, kind, flags }],   // until null = no end
  cd: { warden_shield_bash: 312, 'item:potion': 900 },  // id -> tick it is ready again
  gcdUntil: 0,
  dead: false,
  // players
  cls, look, xp, xpToLevel, bar: ['warden_strike', ...], known: [...], talents: { id: ranks }, gold,
  combo: { target, n, until } | null,                 // Inkblade Ink Marks on `target` (CLASSES 7)
  lantern: { zone, id, x, y }, inCombat, autoOn, sitting,
  emote: { id: 'jump' | 'wave' | 'cheer' | 'dance', tick } | null,   // wave 7 anim (src/sim/emotes.js): cosmetic ONLY, no rng,
                                                      // position or stats; command { t: 'emote', id }; ends on a move (not a jump),
                                                      // combat, a cast, death, a mount, sitting, work, or its time; jump 0.8 s cooldown
  // npcs (snapshot): job: 'smith' | 'baker' | 'guard' (wave 7 anim work loop, render3d/emote_kit.js): e.job wins, else the
  //   NPC data's `job` (src/data/npcs.js); a townsfolk routine sets e.job (null: no loop) to switch it
  bag: [{ item, qty, inst? }], bags: ['starter_satchel'], equip: { main, off, head, chest, legs, feet, hands, trinket },
  quests: { id: { state, counts, escort? } }, questsDone: [ids],
  // mobs (snapshot): elite, mobKind, rank: 'normal' | 'weak' | 'elite' | 'boss', aggro (target id while fighting), aiMode
  // mobs (internal): spawn: { zone, x, y, level, respawn, night, temporary }, ai: { mode, target, ... }, threat: { id: n }
  // objects (snapshot): owner, objType, radius, armed, until | node: { item, channel }
}
```

---

## 4. Snapshot schema (LIVE)

`world.snapshot()` returns plain JSON (round trip tested):

```js
{ v: 2, tick: 1234, dayTime: 0.41, night: false,
  entities: [ /* section 3 public fields, in id order */ ],
  projectiles: [{ id, src, dst, ability, zone, x, y }],        // in flight (ability 'auto' for Auto Shot)
  hud: { [playerId]: { /* section 10.1 */ } } }
```

- Leaves out internal state: `ai`, `spawn`, `threat` (a summary is in `hud.target.threat`), aura definitions, held move
  direction. `STATE_VERSION` is 2 (combat state).
- `dayTime` is the sim's clock (`src/sim/clock.js`: one day = 48,000 ticks from 7:40); `src/render/daycycle.js` reads
  it first, so night spawns and the sky agree.
- Phase 2 (net): the host sends the command stream plus a snapshot every N ticks and on join; clients interpolate
  between snapshots exactly as the local renderer does. A late joiner can instead take `world.serialize()` (full
  state) and run the same commands (`restoreWorld(json, content)`, tested mid-fight).
- `world.hash()` (16 hex chars over the full state) is the desync check.

---

## 5. Abilities and effects (LIVE, combat wave 2026-11-19: `src/data/abilities.js`, `src/sim/combat.js`)

One schema for all five classes. An ability is a list of **effects** with a targeting rule; complex behaviour comes
from composing effects and auras, never from per-ability code. Where code is truly needed, an effect may name a
`script` (a registered function in `src/sim/scripts.js`), but every ability below needs none.

### 5.1 Ability

```js
// src/data/abilities.js
export const ABILITIES = {
  warden_shield_slam: {
    id: 'warden_shield_slam', name: 'Shield Slam', icon: 'shield_slam', cls: 'warden',
    learnLevel: 4, rank: 1,
    school: 'physical' | 'ink' | 'light' | 'nature' | 'shadow' | ...,   // for resistances and immunities
    cost: { kind: 'resolve', amount: 15 } | [{ kind, amount }] | null,   // amount may be { pctBase: 0.08 }
    castTime: 0,                 // seconds; 0 = instant
    channel: null | { duration: 3, ticks: 3 },   // effects fire per channel tick instead of on completion
    cooldown: 8, gcd: true,      // gcd: false for off-GCD abilities (taunt, interrupt); gcd: 0.5 for a short one
    range: { min: 0, max: 40 },  // px; melee = 40
    target: 'enemy' | 'ally' | 'self' | 'any' | 'ground' | 'none',
    requires: {                  // all optional; failing one -> cast_fail reason
      weapon: 'shield' | 'bow' | 'dagger', stealthed: true, behind: true, facing: true,
      combo: 1, targetHpBelow: 0.2, aura: 'warden_stance_guard', notMoving: true,
    },
    moveInterrupts: true,        // moving cancels a cast/channel (default true when castTime > 0)
    projectile: null | { speed: 240 },          // px/s; effects land on arrival (a ranged arrow, a bolt)
    area: null | { shape: 'circle' | 'cone' | 'line', radius: 48, angle: 90, width: 16, at: 'target' | 'self' | 'ground', maxTargets: 5 },
    threatMult: 1,
    effects: [ /* section 5.2, applied in order */ ],
    ranks: null,                 // optional per-rank overrides: [{ learnLevel, effects / cost overrides }]
    text: 'Slam the target with your shield for {dmg} damage and daze it.',   // {placeholders} filled by the tooltip
  },
};
```

### 5.2 Effects

Every effect has `type` and optional `to: 'target' | 'self' | 'area' | 'caster_party'` (default: the ability's
target, or every unit in `area`), `chance` (0..1) and `if` (a `requires`-style condition).

| type | Fields | Covers |
|---|---|---|
| `damage` | `amount: [min, max]`, `coef: { stat: 'ap' \| 'sp' \| 'weapon', k }`, `school`, `weapon: 1.0` (x weapon damage), `canCrit`, `bonus: { behind: 0.2, stealthed: 0.5, perCombo: 0.25 }` | strikes, bolts, arrows, backstab |
| `heal` | `amount`, `coef`, `canCrit`, `overhealToShield: false` | heals |
| `aura` | `aura: { ... }` (5.3) | buffs, debuffs, DoTs, HoTs, shields, CC, stealth, stances |
| `dispel` | `kinds: ['magic','poison','curse','bleed']`, `count`, `hostile: false` | cleanse, purge |
| `interrupt` | `lockout: 4` (s, that school) | kicks, silences |
| `threat` | `amount`, `mult`, `taunt: true` (sets top threat + forces target for `duration`) | taunt, threat drops |
| `resource` | `kind`, `amount` (negative drains), `pct` | rage-like builders, mana return |
| `combo` | `add: 1` or `consume: true` | Inkblade points |
| `move` | `kind: 'charge' \| 'leap' \| 'blink' \| 'knockback' \| 'pull'`, `distance`, `speed` | charges, disengage |
| `summon` | `object: { ... }` (5.4) | traps, totems, a decoy |
| `cooldown` | `ability` or `school`, `reduce` (s) or `reset: true` | talent procs |
| `script` | `name`, `args` | escape hatch, needs review |

### 5.3 Auras

```js
aura: {
  id: 'inkblade_stealth', name: 'Stealth', icon: 'stealth',
  kind: 'buff' | 'debuff', dispel: 'magic' | 'poison' | 'curse' | 'bleed' | null,
  duration: 10 | null,           // s; null = until removed
  maxStacks: 1, refresh: 'duration' | 'stack' | 'none', unique: 'per_caster' | 'global',
  period: 2,                     // s, for DoTs/HoTs; `tick` effects fire each period
  tick: [{ type: 'damage', amount: [4, 6], coef: { stat: 'sp', k: 0.1 } }],
  mods: [{ stat: 'armor' | 'ap' | 'speed' | 'damageTaken' | 'healingDone' | 'threat' | 'castTime' | ..., add: 0, mul: 1.3 }],
  absorb: { amount, coef } | null,          // damage shield
  flags: ['stun', 'root', 'slow', 'silence', 'disarm', 'incapacitate', 'fear', 'stealth', 'immune', 'taunted'],
  breakOn: ['damage', 'action', 'move'],    // incapacitate breaks on damage; stealth breaks on action
  onExpire: [ /* effects */ ], onBreak: [ /* effects */ ], onHitTaken: [ /* effects */ ], procs: [ /* 5.5 */ ],
}
```

Crowd control light (DESIGN section 2) = `flags` `stun`, `root`, `slow` (with a `slow` add or a `speed` mul), `incap`. Diminishing
returns: the same CC family on the same target within 15 s lasts 1, 1/2, 1/4, then immune (LIVE, 5.7).

### 5.4 Placed objects (traps and similar)

```js
object: {
  id: 'wayfinder_snare_trap', sprite: 'trap_snare', at: 'self' | 'ground',
  armTime: 1, duration: 30, max: 1,          // s; max live per caster
  trigger: { radius: 12, who: 'hostile', once: true },
  effects: [{ type: 'aura', aura: { id: 'snared', kind: 'debuff', duration: 6, flags: ['root'] } }],
}
```

### 5.5 Procs (talents and gear)

```js
{ on: 'hit' | 'crit' | 'dodge' | 'block' | 'cast' | 'damageTaken' | 'kill' | 'periodic', ability?: id, school?: s,
  chance: 0.2, icd: 6, effects: [...] }
```

### 5.6 The five classes as data (proof the schema is enough)

| Class (DESIGN) | Resource | How its kit is expressed |
|---|---|---|
| Warden, tank, sword + shield | `resolve` (gains on hit dealt/taken via a class `resourceRules` entry, decays out of combat) | strikes = `damage` + `threat mult`; taunt = `threat taunt` off-GCD; shield wall = self `aura` with `mods damageTaken mul 0.6`; stun = `aura flags stun`; `requires weapon shield` |
| Mender, healer | `mana` | `heal`, HoT = `aura` with `period` + `tick heal`; ward = `aura absorb`; cleanse = `dispel`; group heal = `area` circle `to caster_party` |
| Scribe, ranged caster | `mana` | bolts = `castTime` + `projectile` + `damage school ink`; DoT = `aura period tick damage`; root/slow = `aura flags`; channel = `channel` |
| Wayfinder, bow + traps | `focus` (regen per tick) | shots = `requires weapon bow`, `projectile`, `damage weapon 1.0`; traps = `summon object` with `trigger`; disengage = `move leap` backwards |
| Inkblade, twin daggers, stealth | `focus` + `combo` | stealth = `aura flags stealth breakOn action` + `speed mul 0.7`; openers `requires stealthed behind`; builders `combo add 1`; finishers `requires combo 1`, `bonus perCombo`, `combo consume`; poisons = `procs on hit` applying a `dispel poison` debuff |

### 5.7 Combat rules the sim owns (LIVE: `src/sim/combat.js`, `ai.js`, `progression.js`, tests in `qa/sim/`)

- **GCD** 1.0 s (20 ticks), started at cast start; `gcd: false` skips it and does not start it.
- **Casting**: validation order dead, stunned/incapacitated, silenced (non-physical), busy (already casting), toggle
  off, GCD, cooldown/charges, target, `requires`, range, line of sight, resource, moving. Cast-time spells pay and
  start their cooldown on completion; channels and instants at start. Moving breaks a cast-time spell or channel
  (`cast_stop` `move`); a stun, incapacitate or silence breaks it (`interrupt`); damage pushes a cast back 0.25 s, at
  most twice per cast (talents cut it, Warding Word stops it); an `interrupt` effect locks that spell's whole school 3 s (2026-11-22).
- **Range and sight**: feet point to feet point in px; line of sight samples the segment every 4 px against `'#'` cells
  (water and ledges do not block).
- **Projectiles** (`projectile.speed` px/s) home on the target; effects land on arrival; a dead target drops them.
  Speeds: Kindle and Inkbolt 240, arrows and Auto Shot 480, mob bolts 200.
- **Auto-attack**: per-hand swing timer from the weapon speed (Inkblade off hand 50% on its own timer); paused while
  casting; Wayfinder Auto Shot (range 9) only while standing still. Warden +10 Resolve per auto hit.
- **Hit table**: one roll: block (Warden only, front 180 degrees, melee: -50% damage, +5 Resolve), then crit (players
  5% + mods, x1.5), else hit. Since 2026-11-22 a table runs first when content carries `hitTable` (miss, dodge, parry,
  glancing, foe crits): see "Combat core" at the end.
- **Mitigation**: physical damage x (1 - min(0.6, armor / (armor + 40 x attacker level + 100))); armored mobs a further
  -30%; level gap -5% per level the target is above you, +5% below (max 4); rounded, never below 1; absorbs eat it next.
- **Threat**: damage x ability `threatMult` x class `threatMult` (Warden Guard 1.5) x `threat` mods; healing 0.5 per
  point split over the mobs holding the healer or the target; taunt = top +10% and a 3 s forced target (a caster stops
  casting and walks in). A mob switches targets at 110% (challenger in melee) or 130% (beyond).
- **CC**: stun, incapacitate (breaks on damage), root (breaks once it has taken 20% of max health), slow (highest wins;
  armored mobs ignore slows under 30%). Diminishing returns per family (stun, root, incap): 1, 1/2, 1/4, immune, the
  window resets 15 s after the last application. Elites take half stuns; `eliteDuration` / `eliteImmune` per aura.
- **Stealth**: `flags: ['stealth']` with `breakOn: action, damage (, move)`; mobs notice a stealthed player within
  24 px + 8 px per level they are above (talents shrink it). The first attack out of stealth carries `opener`.
- **Combat state**: in combat while a mob holds you on its threat table or for 5 s after damage to or from you. Leaving
  combat starts `cooldownFromCombatEnd` cooldowns (Fade). Events `combat { id, on }`.
- **Regen**: mana 0.4 x Spirit per second in combat, twice out of combat, 6% of max sitting; Focus +5 / +10 per second;
  Resolve -5 per second after 3 s out of combat; health +1% per second after 5 s out of combat, 6% sitting.
- **Mob AI** modes: `idle` / `walk` / `home` (wander), `combat` (chase to 20 px, swing every `attackSpeed` s, use
  abilities, casters stand and cast inside bolt range with sight and walk in without it, `stationary` mobs never move),
  `flee` (once, at `flee` health, 4 s, toward a same-family friend that joins), `reset` (leash: 40 tiles from spawn
  or 10 s without reaching or being hurt by its target; evading, full heal, threat cleared, walks home).
  Chasing (and walking home) goes straight when the line is clear, else along an A* tile path round walls, fences and
  water (`src/sim/path.js`, 8-way, no corner cutting, bounded search, deterministic). A chasing mob with no path to its
  target for 2 s, or that has not moved for 3 s (not rooted or held by a blocking object), evades at once (fix pass 2).
- **Smarter foes** (2026-11-22, `src/sim/ai.js`, tuning `src/sim/mob_rules.js`, data `src/data/patrols.js`, tests
  `qa/sim/mobai.test.mjs`): the 10 s leash clock also resets while a hero on its threat list keeps hurting it. **Wind-up**:
  every melee swing sets `m.windup = { kind: 'swing' | 'heavy' | 'cast', start, at, target }` (snapshot `windup`, event
  `windup`); a swing glints 0.4 s and keeps the fight's rhythm, a heavy blow glints 0.6 s, plants its feet and lands only in
  reach; losing control in the glint spoils the blow (`windup_break`); a telegraphed cast mirrors its cast as kind 'cast'.
  **Patrols**: `spawn.patrol = { id, mode, route, slot, even? }` (`even: n`, fix20: the n members stand evenly round the route), mode `patrol`, placed on a clock (`src/sim/patrol.js`), leash
  and walk home to the pull spot (`ai.anchor`), join a fight within 4 tiles. **Camp link**: a pull brings camp mates (same
  `group`) within 3.5 tiles in sight, any family. **Flee** also for family `humanoid` at 15%, event `mob_emote` ("X runs
  away in fear!"), calls up to 3 friends on the way. **Casters** back off a hero in their face (after 3 s, once per 8 s).
  **Healers** (template `healer: { ability, below, every }`) cast an interruptible heal on the most hurt friend.
  Aggro radius 80 px (or the template's) +-8 px per level of gap, 32 to 128, needs sight; `aggroRadius: 0` or
  `behavior: 'passive'` only fights back. Social: an engaged mob pulls same-family mobs within 3 tiles that can see it.
  Mob ability entries: `passive` (applied at spawn), `trigger: { hpBelow, once } | { onFlee } | { meleeHit } |
  { hitFromRange }`, otherwise used when in range and off cooldown (`chance`, `cooldown` on the entry).
- **Respawn**: at the spawn point and the spawn's own `level`, after `spawn.respawn` / template `respawn` / 90 s
  (weak 60, elite 360); never while a player within 12 tiles is in combat. `temporary` adds (escort ambush, Order Given)
  are removed instead. `night` spawns exist only at night by the sim clock (`src/sim/clock.js`).
- **Zone scripts**: the Long Watch (moor `script.long_watch`, template `fight.odoChime`): while the Sentinel fights, Odo
  rings every 20 s (`chime` event) and it is stunned 2 s; adds come from `script.long_watch.adds_from`.
- **Death**: a dead player wakes 3 s later at the last lantern touched (within 1 tile of its cell), full health and
  resource (Resolve 0), nothing lost; mobs drop them from their threat tables. A killed mob gives XP and loot to its
  tagger (first player to hurt it), then feeds the quest module (section 7.7).
- **XP**: `w.grantXp`; kill XP `(20 + 4 x mob level)` x the PROGRESSION 2.1 gap table x elite 2.5 / weak 0.6; levels
  1 to 15 from `progression.xpToNext`; a level-up recomputes stats and refills health and mana; at 15, 1 gold per 50 XP.

### 5.8 Schema additions (LIVE; OPEN_QUESTIONS Q10 accepted)

- Numbers: `amount` / `cost.amount` may be `{ base, perLevel }` (at the caster's level), a number or `[min, max]`.
  Damage and heal effects also take `weapon: k` (k x one weapon swing W), `coef: { stat: 'ap' | 'sp', k }`,
  `mobHit: k` (k x the mob's swing), `pctMaxHp`, `pctOfDamage`, `pctOfHeal`, `pctOfAbsorb`, `scaleCombo` (x Ink Marks),
  `mult`, `perHit` (x targets hit by this cast), `fromData` (a DoT sized from the hit that applied it), `noArmor`,
  `noThreat`, `periodic`, `ability` (the id the event reports).
- `to`: `target`, `self`, `caster`, `holder`, `attacker`, `enemies` / `allies` (the cast's `area`),
  `enemies_near_holder` (`radius`), `other_near_target` (`radius`), `allies_near` (`radius`).
- Ability fields: `selfMods` (conditional mods on the ability itself, e.g. Inkbolt -0.5 s at an Underlined target),
  `toggle` (casting again removes its aura), `charges`, `keepsStealth`, `cooldownFromCombatEnd`, `area.shape: 'line'`
  (`length`, `width`), `area.includeTarget`, `channel.walkSpeed`, `requires.combo / notMoving / outOfCombat /
  targetNoAura`, `passive` and `trigger` (mob abilities).
- Aura fields: `immune: ['stun' | 'slow' | 'knockback']`, `breakOn`, `ignoreOwnPeriodic`, `noRootBreak`, `drFamily`
  (null = no DR), `eliteDuration`, `eliteImmune`, `limitPerCaster`, `opener: { bonus, combo }`, `comboBonus`,
  `consumeOn: { cast }`, `scaleCombo`, `fromDamage`, `upkeep: { every }`, `onExpire`, `onBreak`, `onHitTaken`,
  `procs` (`on: 'hitTaken'`, `fromCaster`), flags `nopushback`, `silence`, `taunted`, `untargetable`.
- Mod stats: `armor`, `block`, `blockResolve`, `maxHp`, `crit` (`school: 'spell'` = any non-physical), `damageDone`,
  `damageTaken`, `healingDone`, `healingTaken`, `threat`, `speed` (add and mul), `slow` (highest wins), `manaMax`,
  `manaRegen`, `focusRegen`, `hpRegenPct`, `autoResolve`, `autoSpeed`, `attackSpeed` (mobs), `offHand`, `castTime`,
  `cost`, `range`, `leech`, `comboMax`, `comboDuration`, `comboRefund`, `openerBonus`, `stealthNotice`, `noticeRange`,
  `pushback`. Filters: `ability` (id or list; `'auto'` = auto-attack), `school`, `periodic`, `when`.
- `when` / `if` conditions: `targetHpBelow`, `selfHpBelow`, `targetRooted`, `targetAura` (+ `fromSelf`), `attackerAura`,
  `still` (s), `notCasting`, `outOfCombat`, `stealthed`, `opener`, `targetWithin` (px), `holderIsCaster`, `absorbUsed`,
  `melee`.
- Procs: `on: 'hit' | 'crit' | 'cast' | 'block' | 'damageTaken' | 'kill' | 'periodic' | 'heal' | 'trapRoot'`, `ability`,
  `chance`, `icd`, `when`. An aura effect with `proc: 'trapRoot'` fires that proc for its caster.
- Effects added: `summon` with `mob` (mob adds: `mob`, `level`, `count`, `from` = a zone script spot); `move` kinds
  `leap` (`dir: 'back' | 'moving'`, else toward the target), `charge`, `blink_behind`, `blink`, `knockback`
  (`distance`, `time` or `speed`); placed objects take `pulse` + `period` + `maxTargets`, `inside` / `insideAllies`
  (applied every tick to units inside), `blocks` (mobs cannot walk in), `at: 'here'` (the trap's own spot).

### 5.9 Talent scripts (play rules in `src/sim/scripts.js`, listed for review)

`sworn_strike`, `oathbreaker`, `kept_name`, `the_lantern_holds` (Warden); `name_twice`, `many_names`, `firebrand`,
`pyre_word`, `bellward` (Mender); `capital_letter`, `footnote`, `overwrite`, `smudge` (Scribe); `running_shot`,
`double_nock`, `snarecraft`, `path_sense`, `unseen_road` (Wayfinder); `second_cut`, `last_word`, `unwritten`,
`between_the_lines`, `inkdouble`, `blot_out`, `ink_veins` (Inkblade). Every other node is pure data (mods, ability
patches, procs). Each script has a test in `qa/sim/talents.test.mjs`.

---

## 6. Zone (map) data (LIVE: terrain, joins, collision, areas, lanterns, spawns, npcs, nodes, signs, hooks)

One module per zone in `src/data/maps/<id>.js`, registered in `src/data/maps/index.js` (`ZONES`). Every zone module is
**generated** by `node tools/maps/build_world.mjs` (world wave, 2026-11-19); never hand-edit one, change the generator.
Every zone comes from `tools/maps/zone_<id>.mjs`: Willowmere (48 x 32, Realms' own town since the 2026-11-21 relayout;
it was Lexicon Quest's map as is before), the valley (96 x 64), Shepherd's Downs (`downs`, 144 x 96) and the High Moor
(`moor`, 160 x 100).
`tools/dev/import_lq_maps.mjs` now exports `importLqMap(id)` and, run directly, rebuilds the whole world.

```js
export default {
  id: 'valley', name: 'Willowmere Valley', kind: 'town' | 'field' | 'interior',
  w: 96, h: 64,                         // tiles
  music: 'valley', lighting: { tint: 'none', dark: 0 },
  // render-only (LQ tile format; ids resolve in assets/tiles/tiles.json, trimmed by the build; sheets include x1.png)
  under: 'grass', legend: { '.': 'grass', ... }, ground: ['....', ...],
  overlays: [{ t, x, y }], decor: [{ t, x, y, state? }], overhead: [{ t, x, y }],
  // sim
  collision: ['....##~~', ...],         // one char per tile: '.' walk, '#' solid, '~' water, 'v' '>' '<' one-way ledges (S, E, W)
  joins: [{ x, y, w, h, to: 'willowmere', tx, ty, dir }],   // stepping into the rect moves a player to (tx, ty) in `to`
  arrival: [1, 52],                     // a walkable cell; every quest spot is checked reachable from it (qa/world)
  levels: [1, 6],
  areas: [{ id, name, x, y, w, h, levels?: [a, b], safe?: true, banner?: false }],   // explore objectives + zone banner
  lanterns: [{ id, name, x, y, post: [px, py], bound?: true }],   // (x, y): the walkable touch and respawn cell;
                                        // post: the lit lamp_post decor (a light source); bound: bound at creation
  spawns: [{ mob, level, x, y, wander, respawn, group, night?: true, leash? }],   // level is THIS spawn's level (a family
                                        // like moss_scarab lives at 2 in the valley and 11 on the moor): respawns keep it
  npcs: [{ npc: 'mael', x, y, dir }],
  nodes: [{ id, item, x, y, respawn, name, sprite, channel?: s, perPlayer?: true, at?: [x, y] }],   // collect nodes
  signs: [{ id, x, y, text, hook? }],   // readable things (the sign decor is solid; read it from the next cell)
  hooks: [{ id, to, x, y, text }],      // closed roads (OPEN_QUESTIONS Q19): a standing cell in front of the blocker
  script: { long_watch: { elite, odo_post, adds_from, lamps, leash } },   // moor only: spots for the elite fight
  secrets: [{ id, name, kind: 'waterfall' | 'rockface' | 'bushwall', passage: [[x, y], ...], nook: { x, y, w, h },
              hint: [x, y], chest: { id, x, y, gold: [lo, hi], name, text, levels } }],   // landscape pass 2026-11-20:
                                        // passage cells are walkable in `collision` but drawn solid (water over a cliff
                                        // face, a cliff face, a bush); the nook is sealed; the chest is an object entity
                                        // (sprite chest_gold, node.secret) opened once per hero (p.nodesUsed), giving gold
                                        // and one rare piece rolled for the hero's class; event secret_found
  lq: { npcs, enemies, doors, marks, start },   // willowmere only: LQ's own spots, for reference
};
```

Joins are data: a join whose `to` zone is not in `ZONES` is just the map edge.

### 6.1 One world (LIVE, Scott 2026-11-21)

The four area modules above are still generated one by one in their own local tiles (`REGIONS` in
`src/data/maps/index.js`), but the sim runs ONE zone. `src/data/maps/compose.js` `composeWorld(REGIONS, wilds)` lays
them out on a 296 x 196 map (`src/data/maps/layout.js` `REGION_AT`: area id -> top-left corner; moor [0, 0], downs
[0, 100], willowmere [144, 126], valley [200, 102]) with `src/data/maps/wilds.js` between them (generated:
`tools/maps/zone_wilds.mjs`; the North Road from the Downs (143, 20) to the valley (0, 18), Gate Road South from the
town gate (20, 31) to the valley (0, 52), forest elsewhere).

- `ZONES = { world }` plus the dungeons and caves (section "Dungeons and caves" at the end); the world zone has the section 6 shape with `id: 'world'`, `arrival` = the town arrival, and
  `regions: [{ id, name, kind, x, y, w, h, levels, music, lighting, under }]` (one per area, world tiles).
- Every list item (spawns, npcs, nodes, lanterns, areas, signs, hooks, secrets, decor, overlays, overhead) is moved by
  its area's corner and tagged `region: '<area>'` (wilds decor: `region: null`). Each area also adds an area
  `region_<id>` covering it (the banner; `safe` for the town). `script.long_watch` spots are moved too.
- Joins between areas are dropped: you walk across the seam, no `zone` event. Joins to unbuilt zones (`east_road`,
  `x1_*`) stay as walled edges, tagged with their region.
- Helpers: `regionAt(zone, tx, ty)` (area id or null for the wilds), `regionInfo`, `underAt`; `toWorld(area, tx, ty)`
  and `toWorldPx(area, px, py)` turn area-local tiles / pixels into world ones (unknown ids pass through).

Loaded seams (old joins, now walked): Willowmere's south gate and west gate (Orchard Lane), valley west edge <-> Downs
east edge, Downs Ridge gap <-> moor south edge. Closed, and walled so the edge cannot be reached: valley east ->
`east_road` (the fallen oak), Downs south -> `x1_millrace` (Ferrick's chain) and `x1_larchhill` (the shut gate), moor
east -> `x1_terrace` (the rooted stile). `qa/world/zones.test.mjs` walks every old seam and both roads both ways and checks
reachability, pits and the closed edges; `node tools/maps/build_world.mjs --out <dir> --no-assets` checks the composed
world too (`BUILD_WORLD_OK`).

## 7. Data modules (SPEC, the design and content waves fill these)

All are plain ES modules exporting one frozen-able object keyed by id. The sim receives them through
`createWorld({ seed, content })`:

```js
content = { zones, zoneNames, classes, abilities, talents, mobs, items, quests, npcs, spawns, start, worldId, regionAt }
```

One world (6.1): `zones` is `{ world }`, `worldId: 'world'`, `regionAt` is `REGION_AT` (area id -> corner).
`zoneNames` names the world and each area id. `buildContent()` moves area-authored data onto the world once: spawns,
named bounty spawns and Lantern Chests (tiles), quest and bounty `where` circles (pixels), escort `from` / `to` and
ambush `at` (tiles); each converted ref keeps its area as `region`. An objective with an area `zone` becomes
`{ zone: 'world', region: '<area>' }`: a kill then counts only mobs whose spawn tile is in that area
(`src/sim/quests.js` regionOfMob). Spawn `pack` tags (`src/data/packs.js`) are keyed by area. `start` is the world
arrival. `world.addPlayer(spec)` still takes an area spec (`{ zone: 'valley', x, y }` in that area's tiles, and the same
for `spec.lantern`): it is moved onto the world map first (old saves, links, tests). Quest tracker `where` circles carry
`region` when known. A `target` / `attack` command on an entity beyond `TARGET_RANGE_PX` is rejected (`bad_target`), as
another zone's was. Walking into an area whose lanterns you have not bound binds its nearest lantern (auto), as entering
a zone did.

`src/data/maps/index.js` `buildContent()` builds it today with PLACEHOLDER mobs, NPCs and spawns; when the files
below exist, `buildContent()` imports them and the placeholders are deleted.

### 7.1 `src/data/classes.js` (LIVE, combat wave)

Copied from CLASSES.md section 7. Armor kinds `plate | mail | leather | cloth`; weapon types add `rod`, `quill`, `bell`,
`book` (`src/data/progression.js WEAPON_TYPES`).

```js
export const CLASSES = {
  warden: {
    id: 'warden', name: 'Warden', role: 'tank', armor: 'plate', weapons: ['sword', 'shield'],
    resource: { kind: 'resolve', max: 100, start: 0, regen: 0, decayOoc: 5, decayDelay: 3, onHitDealt: 10, onHitTaken: 3, onBlock: 5 },
    // mana users: { kind: 'mana', maxBase: 50, maxPerInt: 15, start: 'max', regenPerSpi: 0.4, regenOocMult: 2, sitPct: 0.06 }
    // focus users: { kind: 'focus', max: 100, start: 'max', regen: 5 }
    base: { hp: 60, str: 12, agi: 7, int: 4, spi: 6, sta: 12 },   // base.hp = the flat hp bonus (60 Warden, 30 others)
    perLevel: { hp: 0, str: 1.5, agi: 0.5, int: 0.2, spi: 0.4, sta: 1.5 },   // stat = floor(base + perLevel * (L - 1))
    hpPerSta: 10, apPerStr: 2 /* or apPerAgi */, spPerInt, critBase: 0.05, blockBase: 0.10, threatMult: 1.5, mainStat: 'str',
    autoNeedsStill /* Wayfinder */, offHandMult /* Inkblade */, combo: { max: 3, duration: 20 } /* Inkblade */,
    auto: { weapon: 'sword', range: 40, projectile?, offHand? },
    abilities: [{ id: 'warden_strike', level: 1 }, ...],     // learn levels 1, 1, 3, 6, 10, 14
    startBar: ['warden_strike', 'warden_shield_bash'], talentTree: 'warden', trainer: 'holt',
    startGear: { main: 'gate_sword', off: 'plank_shield', chest: 'padded_jerkin' }, looks: [{ id, sprite }],
  },
};
```

`src/data/progression.js PROGRESSION` holds every progression number the sim reads (XP table, kill XP and gap table,
trainer costs, respec, talent tier step, the mob curve and kinds, mob AI distances, combat constants, rest, death,
design gear). `content.progression` is required for combat.

### 7.2 `src/data/talents.js` (LIVE, combat wave)

```js
export const TALENTS = {
  warden: {
    branches: [{ id: 'bulwark', name: 'Bulwark' }, { id: 'oathblade', name: 'Oathblade' }, { id: 'lantern', name: 'Lantern' }],
    talents: {
      warden_bulwark_iron_skin: {
        id, branch: 'bulwark', tier: 1,        // tier n unlocks at (n - 1) * 2 points spent in this branch (Q10)
        maxRanks: 3, requires: null | { talent, ranks }, name, icon, text, play: false,   // play = a [play] node
        byRank: [                              // the whole effect AT rank r is byRank[r - 1] (a rank replaces the last)
          { mods: [{ stat: 'armor', mul: 1.04 }] }, { mods: [{ stat: 'armor', mul: 1.08 }] }, { mods: [{ stat: 'armor', mul: 1.12 }] },
        ],
        // a rank may hold: mods: [...] (5.8 stats), modAbility: [{ id, path, add | mul | set | push }], procs: [...], script
      },
    },
  },
};
```

`modAbility.path` walks the ability's data with dots; `#key` picks an array element by its `key` (e.g.
`effects.#stun.aura.duration`); `mul` on an object multiplies every number in it (`cost.amount`). 162 nodes, 60 [play].
Points: 1 per level from level 5 (11 at 15). Respec at a trainer: first free, then `10 + 5 * level` (PROGRESSION 6.4).

### 7.3 `src/data/mobs.js` (LIVE, world wave)

```js
export const MOBS = {
  briar_wolf: {
    id, name: 'Briar Wolf', level: [3, 5],          // the FAMILY's range; each spawn names its own level (section 6)
    sprite: 'briar_wolf', spriteLq: 'briar_wolf',    // MOB_SPRITES: the Realms atlas (assets/sprites/mobs/) and the
                                                     // closest LQ field enemy as fallback; a spawn carries `sprite`
                                                     // (mobSprite(id, level): ink_slime_deep from 3, moss_scarab_moor from 10)
    faction: 'hostile', family: 'beast', kind: 'normal' | 'weak' | 'caster' | 'armored' | ['elite', 'armored'],
    behavior: 'aggressive' | 'passive' | 'flees' | 'elite', social?, flying?, stationary?, patrol?,
    hp, damage, armor, attackSpeed,                  // at level[0]; mobStats(id, level) is the formula (PROGRESSION 3)
    aggroRadius: 80, leash: 640, speed: 72, wander: 3, flee: 0.2 | null, elite: false, respawn: 90,
    abilities: [{ id: 'mob_wolf_lunge', chance?, cooldown? }],   // mobs.js MOB_ABILITIES, merged over abilities.js
                                                     // MOB_ABILITIES as content.mobAbilities (effects use `mobHit`)
    xp: null,                                        // null = the level formula
    loot: { gold: [1, 4], junk: 'wolf_pelt',         // junk 35% (PROGRESSION 6.1); gear by kind (items.js DROP_RULES)
            table: [{ item: 'thornback_hide', chance: 0.6, quest: 'wm_rhythm_of_the_forge', minLevel? }], gear?: 'elite' },
    // elite only: card, deathLine, script: 'long_watch', fight: { odoChime, lamps, adds }, hpOverride: 1945
  },
};
export function mobStats(id, level)   // { level, hp, damage, attackSpeed, armor, xp, gold }
```

### 7.4 `src/data/items.js` (LIVE, world wave)

Rarity ids are Lexicon Quest's (OPEN_QUESTIONS Q9): `common` `#e8e8e8`, `magic` `#6f8cff`, `rare` `#ffd34d`,
`epic` `#a335ee` (purple, 2026-11-22), `legendary` `#ff8a2a`, `set` `#3cdc6a` (`RARITY`). No `uncommon`.

```js
export const ITEMS = {
  garricks_iron_rod: {
    id, name, icon, rarity: 'magic', kind: 'weapon' | 'armor' | 'consumable' | 'quest' | 'junk' | 'bag',
    slot: 'main' | 'off' | 'two' | 'head' | 'chest' | 'legs' | 'feet' | 'hands' | 'trinket' | null,
    weaponType: 'sword' | 'shield' | 'dagger' | 'bow' | 'rod' | 'quill' | 'bell' | 'book' | ['rod', 'quill'],
    armorType: 'plate' | 'mail' | 'leather' | 'cloth' | 'class' | ['mail', 'leather'],   // 'class' and lists resolve per class
    damage: [3, 6], speed: 3.0, armor: 0 | null, stats: { int: 1, main?: 2, sp?, crit?, speed?, mana? },   // main = class stat
    level: 6 /* ilvl */, reqLevel: 4, classes: null | ['mender', 'scribe'], reward?: true, base?: true,
    use: null | { kind: 'heal_pct' | 'mana_pct' | 'rest_food' | 'dispel', amount, cooldown, group },
    stack: 1, value: 12, price?: 4 /* vendor price of consumables and bags */, bagSlots: 0,
  },
};
// also RARITY, AFFIXES (PROGRESSION 4.7), DROP_RULES (4.6), WEAPON_TYPES, ARMOR_TYPES, CLASS_GEAR, BASE_GEAR
// (gear_<armor>_<slot>, gear_<weapon>, gear_trinket: random drops and vendor stock; they always carry an instance)
```

A bag slot is `{ item, qty, inst? }`; gear carries `inst: { ilvl, rarity, affixes: [{ id, value }], armorType?, weaponType? }`.
`src/sim/loot.js` `resolveItem(content, slot, cls)` gives the finished item (armor, damage, resolved stats, affixes,
value); a reward that "rolls to class" is fixed to the receiver's class when it is given. Vendors buy at `value`, sell
at 4 x value (or `price`). `player.bags` = the bag item ids worn (default `['starter_satchel']`, 12 slots).

Fix pass 1 (PLAYTEST_BOT bugs 4 and 16): quest items (`kind: 'quest'`) never take a bag slot: they live in
`player.qbag` (no limit), and `bagCount` / `bagRemove` read both lists, so a quest item always fits. Every bag and quest
bag slot has a `uid` (an integer, per character, never reused; saved with the bag) that commands may name. Loot that
does not fit the bag when it drops goes to `player.pendingLoot` (`[{ item, qty, inst?, from, at }]`, at most 24; past
that the oldest junk goes, with a `loot_lost` event) until the player takes it (`loot_take`).

### 7.5 `src/data/quests.js` (LIVE, world wave)

```js
export const QUESTS = {
  wm_cobbs_hens: {
    id, num: 3, name, level: 2, minLevel: 1, zone: 'valley', giver: 'cobb', turnIn: 'cobb',
    requires: { quests: ['wm_name_twice'], cls: null, level: 1 }, chain: { id: 'valley', step: 3 },
    objectives: [   // every objective also has `label` (the tracker text)
      { kind: 'kill', mob: 'briar_wolf', count: 8 },
      { kind: 'collect', item: 'stray_hen', count: 5 },                          // mob drops or zone `nodes`
      { kind: 'deliver', item: 'pells_crate', to: 'penny' },                     // the item is given on accept
      { kind: 'explore', zone: 'valley', area: 'the_fork' },
      { kind: 'escort', npc: 'lark_escort', from: { zone, x, y }, to: { zone, x, y, r }, fail: 'death',
        ambush: [{ at: { x, y, r }, mobs: [{ mob, level }] }] },
      { kind: 'talk', npc: 'mael' },
    ],
    // fix pass 1 (critique 9): EVERY objective also has `where: [{ zone, x, y, r }]` (PIXELS, a circle; one or more)
    // where it is done: the camp, the nodes, the area or the npc. Authored in tiles with quests.js at(zone, tx, ty, rTiles);
    // tools/maps/quest_where.mjs suggests them from the zone data. They reach the HUD tracker rows as `where`.
    rewards: { xp: 350, gold: 13, items: [], choice: ['cobbs_old_boots'] }, rewardRarity: 'magic', elite?: true,
    text: { offer, progress, complete }, giveOnAccept: [{ item, qty }], hook?: { lines: [...] },
  },
};
export const QUEST_ORDER = [/* 24 ids */];
export const COMING_LATER = { id: 'east_road_later', name: 'The East Road', text: 'Coming later.' };
```

### 7.6 `src/data/npcs.js` (LIVE, world wave)

```js
export const NPCS = {
  mael: { id, name: 'Elder Mael', sprite: 'npc_elder', title: null, faction: 'friendly',
          roles: ['quest' | 'trainer' | 'vendor' | 'innkeeper' | 'escort' | 'ambient'], vendor: null | { items: [{ item, ilvl? }] },
          trainer: null | { cls: 'warden' }, innkeeper: false, escort?: { follow: 2, hpPct: 0.4 }, talk: ['line', ...], lq: 'mael' },
};
```

Placement lives in each zone's `npcs`. Sprites `npc_brindle`, `npc_tamsin`, `npc_odo` are in LQ's `x1_npcs` sheet, not
yet copied into assets (art lane).

### 7.7 Quest system wiring (`src/sim/quests.js`; world.js calls it) (LIVE: world.js calls every point below, combat wave)

`createQuests(Q)` with `Q = { state, content, emit, rng, get(id), ents(), grantXp(e, amount, reason, extra), addEntity(e),
nextId(), spawnMob?(spec) }`. world.js calls it at these points (pure, deterministic; all state lives on entities):

| world.js point | call |
|---|---|
| after `spawnContent()` | `QS.spawnObjects()` (every zone node becomes a `kind: 'object'` entity with `node: { item, ... }`) |
| `interact` on an npc or an object | `QS.interact(player, target)` (an npc emits `quest_dialog`) |
| `quest_accept` / `quest_turnin` / `quest_abandon` | `QS.accept(p, quest)` / `QS.turnIn(p, quest, choice)` / `QS.abandon(p, quest)` |
| a mob dies (credit to its tagger) | `QS.onKill(player, mob)`, then `rollKill({ content, rng, questNeeds: QS.needsItem }, mob, player)` (loot.js) |
| a player's bag changes (loot, vendor) | `QS.onBag(player)` |
| after a player moves or changes zone | `QS.onMove(player)` (explore objectives, the `area` banner event) |
| a player takes damage | `QS.onDamaged(player)` (breaks a node channel) |
| once per tick, after entities | `QS.tick()` (node channels and respawns, escort follow, ambushes, arrival) |
| HUD | `QS.marker(p, npcId)`: `'!'` available, `'?'` ready, `'!grey'` trivial (5+ levels under you), `'!soon'` too low, `'?grey'` in progress; `QS.tracker(p)` |

Player fields: `quests: { id: { state: 'active' | 'ready', counts: [..], escort? } }`, `questsDone: [ids]`, `nodesUsed`,
`area`, `questChannel`. Max 20 in the log. Quest XP goes through combat's `grantXp(e, amount, 'quest')` after the
PROGRESSION 2.2 gap multiplier; without `Q.grantXp` the module emits the `xp` event instead (a one-line hook).
Events: `quest` (accept, progress, complete, turnin, abandon, fail), `quest_dialog { npc, offers, turnins, progress, soon,
rewards: { questId: { xp, gold, items, choice: [{ item, inst (as this class would get it: armorType / weaponType), usable, reqLevel }] } } }`
(fix pass 1: the dialog shows the armor kind the class really gets and greys out what it cannot use),
`quest_hook { lines, later }`, `area { zone, area, name, levels, safe }`, `loot`, `gold`, `spawn` / `despawn` (nodes).

## 8. Events (LIVE)

`world.step()` returns the tick's events; every event has `tick` and `type`. `main.js` publishes them on the bus.

| type | Fields |
|---|---|
| `join` / `leave` | `id, name` / `id` |
| `zone` | `id, from, to, x, y` (tiles) (also after a respawn in another zone) |
| `target` | `src, id` (null = cleared), `reason?: 'lost'` |
| `interact` / `interact_fail` | `src, id, npc, trainer?: { cls, offer: [{ ability, level, cost, known, canLearn }], respecCost }, vendor?: { npc, items: [{ index, item, inst, name, icon, rarity, kind, slot, reqLevel, price, stack }] }` / `src, id, reason` |
| `cmd_reject` | `id, cmd, reason` |
| `cast_start` | `src, ability, target, castTicks, channel?` (castTicks 0 = instant) |
| `cast_stop` | `src, ability, target, reason: 'done' \| 'interrupt' \| 'move' \| 'cancel' \| 'target' \| 'resource' \| 'death' \| 'stub'` |
| `cast_fail` | `src, ability, reason: 'gcd' \| 'cooldown' \| 'range' \| 'resource' \| 'los' \| 'requires' \| 'combo' \| 'silenced' \| 'stunned' \| 'moving' \| 'busy' \| 'combat' \| 'target' \| 'unknown' \| 'dead'` |
| `projectile` | `id, src, dst, ability ('auto' for Auto Shot), speed` (px/s; the damage lands on arrival) |
| `damage` | `src, dst, ability \| 'auto', school, amount, crit, result: 'hit' \| 'block' \| 'immune' \| 'miss' \| 'dodge' \| 'parry' \| 'resist', absorbed, blocked, overkill, periodic`, and only when set: `glancing: true`, `resisted: n` (a partial resist) |
| `heal` | `src, dst, ability, amount, overheal, crit, periodic` |
| `aura_add` / `aura_remove` | `dst, src, aura, stacks, until, refresh?` / `dst, aura, src, reason: 'expire' \| 'dispel' \| 'break' \| 'death' \| 'cancel' \| 'consume' \| 'moved'` |
| `combo` | `id, target, n` (Ink Marks) |
| `leap` | `id, kind: 'leap' \| 'blink', dx, dy` |
| `threat` | `mob, top` (when the top of a mob's threat list changes; `top: null` on reset) |
| `evade` / `flee` / `yell` / `chime` | `id` / `id` / `id, text` / `id (the Sentinel), npc: 'odo'` |
| `combat` | `id, on` (a player enters or leaves combat) |
| `death` | `id, killer, template, kind, tagger` |
| `respawn` | `id, zone, x, y (tiles), lantern` |
| `cheat_death` | `id, talent` (The Lantern Holds) |
| `xp` | `id, amount, source: 'kill' \| 'quest' \| 'explore', gold? (at the cap), mob?, quest?` |
| `level` | `id, level, hpMax, talentPoints (free), trainable: [ability ids learnable at this level], trainer: { npc, name, zone, x, y } \| null (where to learn them), firstTalentAt: 5 \| null (before the first talent point)` |
| `gold` | `id, amount, total, source: 'loot' \| 'xp_cap' \| ...` |
| `loot` | `id, from, gold, items: [{ item, qty, inst? }], pending?: [{ item, qty, inst? }]` (what did not fit; `from: null` + `pendingLeft` when taken with `loot_take`) |
| `loot_pending` / `loot_lost` | `id, items: [{ item, qty }], total` (loot waiting for room) / `id, item, qty` (the pending list overflowed) |
| `train` / `train_fail` | `id, ability, cost, gold, npc` / `id, ability, reason` |
| `talent` / `talent_fail` / `respec_paid` | `id, talent, ranks, kind: 'learn' \| 'unlearn' \| 'respec', free` / `id, talent, reason` / `id, cost, gold` |
| `inventory` / `inventory_fail` | `id, kind: 'equip' \| 'unequip' \| 'use' \| 'buy' \| 'sell' \| 'buyback', slot?, item, qty?, cost? (buy), gold? (sell), npc?` / `id, cmd, item, reason` |
| `sit` | `id, food?` |
| `quest`, `quest_dialog`, `quest_hook`, `area` | section 7.7 |
| `spawn` / `despawn` | `id, template, zone, kind ('mob' \| 'object'), owner?, x?, y?, radius?, reason?` (objects: traps, zones, hedges, ink trails, quest nodes; `reason: 'day'` for night mobs) |
| `lantern` | `id (player), zone, lantern, name, auto?` (a new lantern bound: walking within 48 px of it, or `auto: true` = the nearest lantern of a zone you just entered while bound elsewhere) |

---

## 9. Renderer interface (LIVE)

`src/render/renderer.js` is the only 2D-specific module. A 3D renderer replaces it by implementing the same object:

```js
const r = createRenderer(canvas, assets, { zones, abilities })   // abilities: content.abilities (+ mobAbilities), optional
r.draw(prevSnap, snap, alpha, view)   // view: { zone, followId, zoom: 1 | 1.5 | 2, targetId, time (s),
                                      //         fx: 'low' | 'high' (default high), tod: 0..1 (sky clock override),
                                      //         weather: 'clear' | 'rain' | 'leaves' | 'pollen' | { rain, leaves, pollen } }
r.feed(events)                        // this tick's sim events, every tick, after world.step() (spell fx, numbers, corpses)
r.drawHud(fn)                         // fn(ctx, layout): HUD on a hudW x hudH layer (640x360 in 2D) composited at the base integer scale
r.pick(devX, devY) -> id | null       // entity under a canvas device-pixel point (click targeting; quest nodes too)
r.devToWorld(devX, devY) -> [wx, wy]  // world px under a device-pixel point (ground-targeted casts)
r.worldToHud(wx, wy) -> [hx, hy]      // nameplates, floating combat text
r.layout                              // { base, ox, oy, hudW, hudH (the HUD layer), ws, viewW, viewH, dispW, dispH, worldOx, worldOy, touch }
r.dev                                 // { clock: null | s (freeze the effect clock for drivers), stats: { ms, avg, n }, sky }
r.loading                             // sheets still loading (drivers wait for 0 before a screenshot)
```

LIVE since the integration wave (2026-11-19):

- Weather: `view.weather` wins, else the zone's `weather` field, else clear. `view.tod` overrides the sim clock.
- Horizon camera (wave 5b, approved by Scott 2026-11-24, 3D only, an option): `view.cam` is null (today's fixed north-up camera, the default) or the `createHorizonCam` state `{ mode: 'horizon', yaw, pitch, dist, lite, minPitch }` (src/render3d/horizon_cam.js), set by `?cam=horizon|fixed` or Options `cam`. While it is on: `input.setMoveTransform(fn)` turns held keys to the camera, snapped to the sim's 8 directions (up to 22.5 degrees off the camera; src/input/horizon_input.js); `devToWorld` meets the visible ground (`groundY`) and returns null for the sky or past 60 m; `worldToHud(a.x, a.y - h)` above an anchor goes up the body, not north; draw distance per tier (`H_TIER`, measured 2026-11-24: desktop High 100 m full detail, far version to 240 m, fog to 220 m, bodies to 50 m; phones and Low 56/100/100 m, bodies to 30 m, and the tilt stops at 10 degrees); `SEE.uNearR` fades static scenery near the lens (0 = off); the ground kit's grass ring follows `kit.view` (null = today). The sim never sees it.
- Horizon camera level of detail (wave 8, lod lane, src/render3d/lod_kit.js): `horizonLod(hpose, camPos)` is null for today's camera, else `{ x, z, smallR, treeR, prepass, preR }` (`LOD_TIER`: desktop High 42/38 m with the prepass to 60 m, phones and Low 26/26 m, no prepass), held on `renderer.dev.lod`. `zone.cull(x, z, r, farR, lod = null)`: with a plan, small props draw only within `smallR` m of the camera and kit tree bark past `treeR` m swaps to its trimmed geometry (`loGeometry`), and the cell's opaque see-through pieces get three.js layer `PRE_LAYER` (7); without one (today) cull runs as before and `unLodCell` puts any touched cell back. `createPrepass(renderer, scene, camera, { precompile })` wraps `renderer.render` once; while `.active` a render of (scene, camera) draws those pieces depth only (same see-through discard), then the real pass with twins (no discard, `EqualDepth`, no depth write); off it calls straight through. Materials patched by zone3d.js `seeThrough` carry `userData.lrSee`. Drivers: `dev.lodOff` / `dev.preOff` turn either half off for an A/B, `dev.pre` = `{ calls, objects, warming }`.
- Quest scenes (wave 6, approved by Scott 2026-11-24, 3D, on by default; Options `questScenes: false` = today's npc window and camera): `view.talk` is null or `{ kind: 'talk', hero: { x, y }, speaker: { x, y }, flip, aside, hideLabels }` (world px), set each frame from `ui.talkView(snap)` (src/ui/talk_ui.js). The 3D renderer eases to it (src/render3d/talk_cam.js: over the clear shoulder onto the speaker, 0.6 s in, 0.35 s out; indoors and below ground only a push-in at today's angle onto the point between the two) and back to the player's own camera, which it never writes; `hideLabels` hides the door labels. Input never follows it (moves stay relative to the player's own camera), and a move, Esc, a hit or walking off ends a talk. The npc window's quest page becomes the talk panel (paced text, same Accept / Complete / Back / Goodbye. labels and `reward` regions); trainer, vendor and flight pages are unchanged. Sound: `audio.talk({ say: { npc, text } } | { stop } | { flourish })` (src/audio/talk_voice.js, bank recipes src/audio/synth/murmur.js), silent with Synth sound off. The boss intro card is the bosscard lane's and reads the same `questScenes` option.
- Boss intro card (wave 6 bosscard lane, approved by Scott 2026-11-24, questpres brief still 3b): `view.bossCam` is null (today's camera, every default view) or `{ k, hero: { x, y }, boss: { x, y, h }, band }` (world px; k 0..1 the push-in), set each frame by main.js from `createBossCard` (src/ui/boss_card.js) on the first pull of each boss per run (sim `boss` `pull` event, or the first `threat` on a foe with a `card` line; key zone + entity id, so a reset copy shows it again and a retry does not). renderer3d.js eases its camera towards `bossFrame` (src/render3d/boss_cam.js: same facing, a little lower, the hero and the boss kept inside `band`, never writing `view.cam`) and hides the door labels while k > 0; the 2D renderer only hides the door labels. The card (about 2.5 s, no input, never pauses) draws through `ui.bossCard = fn(ctx, g, L, t)` after the HUD, under the windows; it shows the `card` line word for word, the level, the target frame's rank word and the place. Off when `options.questScenes === false`. The sim never sees it.
  Wave 5 (sky lane, 2026-11-24): `'storm'` (2D: rain; 3D: rain, lightning) and `'mist'`/`'fog'` (3D: fog pulled in) are
  also accepted. 3D sky, light rig and weather: `src/render3d/sky_kit.js` (+ `sky_rig.js` pure numbers, `weather3d.js`
  rain), one `skyKit.frame()` call after `applySky`; tiers by `skyTier()`: `?q3d=low`, `?sky=off` or `view.fx 'low'` =
  today's flat sky exactly, phones = dome and light rig without rain or hills, desktop = all. Underground has no sky.
  Drivers: `renderer.dev.skyKit` (last frame's phase, weather, flash, tier), `renderer.dev.skyFlash` forces a flash.
- Spell effects come only from `r.feed(events)` through `src/render/fx_table.js` (looks, no speeds) and `fxplan.js`.
  A bolt or arrow flies from the sim's `projectile` event at the event's `speed` (the ability data), so it lands on the
  tick the sim's `damage` lands; `snap.projectiles` with no event visual (late join) are drawn as a small bolt at the
  sim's interpolated spot.
- 3D effects and hero combat animation (FX kit, approved 2026-11-23): `src/render3d/fx3d.js` turns the same plan into
  FX kit recipes (`fx_kit.js` engine, `fx_recipes.js` data: `ABILITY_FX` has one line per class ability, checked by
  `qa/tests/fx_kit.test.mjs`; mobs and new skills fall back by school and shape). It reads sim events only, writes
  nothing back; light requests stay `{ pos, color, k }` for the renderer's capped pool; `F.screen` (camera kick,
  hit-stop) fires only for the player's own crits and heavy blows, and `options.shake = false` turns the kick off.
  Hit-stop slows body animation only, never the sim. Heroes: the clip library plays idle, walk and run; `anim_kit.js`
  `overlay()` blends the swing, cast charge and release, bow draw, hit reaction and death over them (actors.js).
  Foe hit tint goes through `body.mats` (emissive, restored after); creature code is not touched.
- Combat feel pass (wave 6, approved 2026-11-24): `src/render3d/feel_recipes.js` (pure rules and the weight layer) and
  `src/render/feel_numbers.js`. Every hit the player lands plays a weight layer (small, medium or large by the hit
  against the player's own last 12 hits; Low quality and phones only the small one), a body flash dimmed or tinted on
  pale bodies, and a hit stop of 30 to 75 ms (90 ms crit; autos 45 ms, 60 ms crit): render only, body animation at 4%,
  the 20 Hz sim never waits. The kick stays for crits and heavy blows, scaled by the foe's height (up to 1.7x).
  `options.shake = false` ("Screen shake and hit stop") turns off both the kick and the hit stop. 3D numbers: own and
  hits-on-you 2x, crits 3x then 2x, friends 1x grey (phones: own 1x); a number waits for its 3D bolt (`fx3.pending`,
  at most 0.8 s), never overlaps another, stops rising at the toast line. `?feel=0` keeps the look from before.
- Mob atlases `assets/sprites/mobs/<id>.json` (17, `sprites.js MOB_ATLASES`), keyed by `entity.sprite`, then
  `entity.template`; LQ `enemies_field` is the fallback while one loads. idle / walk (not `stationary`), attack
  (windupFrame then hitFrame, 0.3 s, from the `damage` event), cast while `e.cast`, hurt 0.14 s, death. `emissive`
  sheets go through the additive glow pass. A hit flashes the sprite white for 0.1 s (cached silhouette).
- Corpses: a mob whose `death` event the renderer saw stays `CORPSE_SECS` (4 s): the death anim plays and holds, then
  fades over the last 1.5 s. Never picked, no ring. Mobs already dead on the first frame draw nothing.
- Objects (`kind: 'object'`, `src/render/objects.js`): ground zones (`zone_letters`, `zone_semicolon`, `zone_peal`,
  `zone_bramble`, `zone_ink`, any `zone_*` or unknown key with a `radius`) are a dithered disc of exactly `radius` px
  under the actors; `trap_briar` (dim until `armed`), `hedge` (a ring of bushes at `radius`), `ink_double` (the
  owner's pose in ink) are y-sorted. Quest nodes draw their `sprite` (an LQ npc/animal, a `props.json` or `tiles.json`
  object, else a bundle) with a gold glint and are pickable.

- Desktop: internal view 640x360, letterboxed at the largest integer `base` scale. The world is drawn at integer `ws =
  round(base * zoom)` (at 1080p: 3, 5, 6 for zoom 1, 1.5, 2). Keys `+` / `-` change zoom.
- Desktop wide HUD (2026-11-21, Scott: "the HUD is too close the center of the screen"): the HUD layer covers the area the
  world is drawn in. 2D: the letterboxed 640x360 display rect (unchanged). 3D (`layoutFor(..., { fill: true })`, the 3D
  world fills the canvas): the whole canvas at the same integer `base`, `hudW = floor(devW / base)`, `hudH = floor(devH
  / base)` (957x460 at 1915x920; 640x360 exactly at 1920x1080 and 1280x720). `src/ui/layout.js` `hudLayout({ W, H })`
  anchors each desktop box to its own edge (frames top left, zone label + minimap + tracker top right, bar and cast bar
  bottom centre, XP bar along the bottom, chat bottom left; at 640x360 the stills' numbers). Windows, the npc window,
  talents, title screens and prompts stay 640x360 designs centred on the layer (`designOrigin`, ui.js `centred`: the
  design sees a 640x360 `env.L` and the pointer in design px; regions come back in layer px).
- Touch (fix wave 1, 2026-11-19, CRITIQUE_1 item 8; `view.touch`, `view.dpr`, `view.hud`): no bars. The world fills the
  canvas at integer `ws`; the HUD layer is `hudW x hudH` (the screen's aspect) at its own integer `base`: `view.hud =
  'big'` (play, about 1.75 css px per HUD px, at least 200 HUD px tall; 506x234 at 844x390 dpr 3) or `'win'` (a menu
  window or the title is open: the largest scale that holds 640x360; those 640x360 designs are centred on it).
  `layout.base` / `ox` / `oy` always mean the HUD layer (drivers: HUD px -> device px = `ox + hx * base`). Phones open at
  zoom 1.5 until the player picks a zoom (`options.zoomSet`).
- Camera: may run up to 46 HUD px (desktop) / 18 (touch) past the map's bottom edge, so a hero at a south gate is
  never under the ability bar.
- See-through (fix wave 1, `src/render/occlude.js`): a tall prop drawn over the player fades to 40%; overhead (roofs,
  canopy) over the player fades in a 40 px disc; the player, other players and the target get a 1-px outline when a
  prop or the overhead covers them. At night (lamps > 0.35) foes get a faint red rim, the player a cream one. The target
  ring is 2 px and pulses, with a chevron over the target's head.
- `r.anchorOf(id).h` is feet to the first opaque row of the frame (the head), so marks sit on heads.
- Zone grade: a render-side table (`moor`: greyer, cooler, drifting mist); a zone's own `grade: { desat, tint, mist }`
  wins when the map lane adds one.
- Interpolation: an entity in both snapshots and the same zone is drawn at `prev + (cur - prev) * alpha`, rounded
  to whole pixels. A zone change fades from black (0.35 s).
- Sprite keys: `hero` (LQ party_field, placeholder for player characters), `npc_*` (LQ npcs.json), any LQ field enemy
  id (enemies_field.json). The art wave adds `assets/sprites/chars/` atlases; register them in
  `src/render/sprites.js` `frameFor()` and keep the entity `sprite` field as the key.
- LIVE (render wave): lighting, particles, weather, day/night, spell visuals keyed by event through
  `src/render/fx_table.js` (see above).

---

## 10. HUD view model (LIVE, grows with combat)

The HUD reads one frozen object per frame, built by `src/core/viewmodel.js` `buildViewModel(snap, playerId, opts)`.
It never reads the sim or the renderer.

```js
{
  tick,
  player: { id, name, level, cls, hp, hpMax, hpFrac, res: { kind, cur, max, frac } | null, dead,
            cast: { ability, frac, ... } | null, auras: [...], gcdLeft (s), xp, zone },
  target: { same unit shape } | null,
  party: [],                                  // phase 2
  zone: { id, name },
  cooldowns: { abilityId: secondsLeft },
  log: ['Entered Willowmere Valley.', ...],   // last 50 lines (chat/log box)
  // SPEC: bar: [{ slot, ability, icon, key, cdLeft, cdTotal, usable, inRange }], xpToLevel, quests: tracker rows,
  //       minimap: { zone, x, y, markers }, castBar, floating: [...], prompts (quest offer, loot window)
}
```

HUD layout target: the approved stills (`D:\LQOnline\mockups\out\still1_questing.png` and siblings).

**Decided (HUD agent, 2026-11-19): the HUD layer stays 640x360, the same pixel density as the world. No 1280x720 layer.**
(2026-11-21: same pixel density, but in 3D the layer grows to the window at that scale; see section 9 "Desktop wide HUD".)
The stills only look finer because the LQ font is small (1 px strokes, 7 px caps) next to chunky world art: their builder
(`D:\LQOnline\mockups\lqui.py`, "all drawing is at 1x on a 640x360 frame", then a 3x nearest upscale) draws every HUD
pixel at 640x360. So the HUD draws through `renderer.drawHud` at the base integer scale (3x at 1080p, 2x at 1280x720),
matches the stills pixel for pixel, and keeps one pixel density (DESIGN 5.2). Pointer math: HUD px =
(device px - layout.ox) / layout.base. Phone: 44 css px hit areas = `ceil(44 / (base / devicePixelRatio))` HUD px
(`src/ui/layout.js` `hitPx`), so touch buttons grow in HUD px instead of the layer changing resolution.

How the HUD gets the SPEC fields today: `src/ui/uivm.js` `buildHudModel(vm, snap, { state })` adds them under the names
above, taking each from the view model when present and otherwise building it (bar from the class's learned abilities,
range from snapshot positions, `xpToLevel` from PROGRESSION.md, minimap markers from the snapshot) or from the UI's local
PLACEHOLDER state (quests, bag, equip, gold, talents). When `buildViewModel` grows a field, the HUD uses it with no change.
Extra SPEC fields the HUD reads (same names): `bag: { size, items: [{ item, qty } | null] }`, `equip: { slot: { item } }`,
`gold`, `talents: { id: ranks }` (also accepted on the player entity), `quests: [{ id, name, level, zone, state:
'available'|'active', done, tracked, giver, turnIn, objectives: [{ text, cur, need }], rewards, text }]`, `stats`,
target `elite` / `boss` (or `rank`). UI commands it sends (LIVE since the combat wave, section 2.2):
`learn_talent {talent}`, `unlearn_talent {talent}` (new, one rank back), `respec`, `quest_abandon {quest}`,
`equip {bagSlot, item}`, `unequip {slot}`, `use_item {bagSlot, item}`.

### 10.1 The sim's HUD block (LIVE, combat wave): `snapshot.hud[playerId]`

The sim builds everything rule-derived the HUD needs, already in seconds and fractions (`src/sim/hud.js`), so the HUD
never re-derives a rule. `buildViewModel` passes it through as `vm.hud` (LIVE); `src/ui/uivm.js` `fromSimHud` builds the HUD model from it (bar, cast bar, xp, talent points, gold, bag, equip, quests, minimap marks). The UI-local PLACEHOLDER path is kept only for `?uidemo` and worlds without combat content.

```js
{
  id, gcdLeft, gcdTotal: 1,
  cast: { ability, name, icon, kind: 'cast' | 'channel', frac, left, total, target } | null,   // channel frac runs down
  res: { kind, cur, max },
  auras: [{ id, name, icon, kind, stacks, left, total, src, mine, absorb, dispel }],             // left null = no end
  bar: [{ slot, ability, name, icon, known, cdLeft, cdTotal, charges, cost, costKind, usable, inRange, castTime, offGcd }],
  combo: { target, n, max, left } | null,            // Ink Marks (dots in the target frame)
  counters: { capital, pyre: { target, n } } | null, // Capital Letter count ("the bar shows the count")
  target: { id, name, level, kind, faction, hp, hpMax, dead, elite, mobKind, res, cast, auras, hostile, target,
            threat: { pct (your threat as % of the top), top (you have aggro), aggro, list: [{ id, amount }] } } | null,
  xp: { cur, need, level, cap }, talents: { total, spent, free, byBranch }, gold,
  inCombat, autoOn, dead, respawnIn, lantern, sitting, showAggroRings (Path Sense), stats, derived,
  quests: QS.tracker(player) rows, npcMarkers: { npcEntityId: '!' | '?' | '!grey' | '!soon' | '?grey' },
  //   tracker row (fix pass 1): { quest, name, level, ready, rows: [{ label, cur, need, done, where: [{ zone, x, y, r }] }],
  //     turnIn: { npc, name, where: [{ zone, x, y, r: 24 }] } }   px circles: draw rows' `where` on the map and minimap
  //     while not done, and `turnIn.where` (the `?`) once `ready`
  bag: { size, bags, items: [item view] }, equip: { slot: item view }, buyback: [item view + price],   // integration wave
  questBag: [item view], pendingLoot: [item view + index],    // fix pass 1: quest items (no slots) and loot waiting for room
  // item view = loot.js resolveItem as plain JSON: { item, qty, resolved: true, id, name, icon, rarity, kind, slot, level,
  //   reqLevel, value (sell price), classes, weaponType?, armorType?, damage?, speed?, armor?, stats?, use?, text?, inst?,
  //   uid (fix pass 1: send it back as the command's `uid`) }
}
```

The UI commands listed above are LIVE (section 2.2); `equip` / `use_item` accept `bagSlot` or `bag`. `sell` also
sends `inst` (the bag item's `inst.id`) when the item view has one.

Fix wave 1 (2026-11-19), what the HUD reads and draws:
- Quest marks: `hud.npcMarkers` drawn in code on the head (gold `!` / `?`, grey `!grey` / `?grey`), clickable (talk).
  After a `level` event with `trainable` + `trainer`, the trainer wears a gold `!` until you train (or 2 minutes).
- Quest places: tracker rows' `rows[i].where` (px circles, unfinished objectives) and `turnIn.where` once `ready` are
  converted to tiles (`uivm.js questWheres`) and drawn as gold circles on the minimap and the world map; the minimap
  edge arrow points at the first tracked quest's nearest place; the tracker adds one line (the zone area holding it,
  or "Return to <turnIn.name>"). The world map labels every named zone area.
- Log: ability names from `content.abilities` and `content.mobAbilities` (never an id; auto = "attack"); resource
  words Resolve / Focus / Mana; every `cast_fail` but `gcd` / `dead` is one quiet line at most every 2.5 s. A `loot`
  event's `pending` logs "No room for X: it waits in your bags window"; `loot_pending` toasts, `loot_lost` logs.
- Bags (fix pass 1 wiring): a strip over the bags window shows "Loot waiting: N" with Take (`loot_take`) and the quest
  items (`hud.questBag`). `equip` / `use_item` / `sell` send `uid` (plus `bag` + `item`); an Inkblade dagger asks
  Main hand / Off hand and sends `slot`. `quest_accept` / `quest_turnin` send `npc: dialog.ent`. Reward choices the
  sim marks `usable: false` (quest_dialog `rewards`) are greyed with the reason; the default pick is the first usable.
- Save: `state` also carries `world.saveFields(id)` (qbag, pendingLoot, hp, res, cdLeft, auras, escorts); the whole
  spec goes back to `addPlayer`. `lantern` events toast "Lantern bound: <name>".
- Ability tooltips: `{dmg}` / `{heal}` / `{dot}` / `{hot}` / `{absorb}` in the content text, computed at your level,
  `hud.derived` (ap, sp) and the main-hand `damage` / `speed` (mirrors combat.js rawAmount).
- Item tooltips compare against the worn piece (green / red deltas). Money is "N gold" everywhere.

---

## 11. Audio hooks (LIVE, integration wave: `src/audio/`)

`src/audio/` subscribes to the bus (`src/core/bus.js`): `bus.on('damage', fn)`, `bus.on('*', fn)`. Events are
shared and read-only. Music follows the player's zone (`zone` event + zone `music` id). A data table
`src/audio/sfx_table.js` maps `event type + ability/school/result` to an sfx id; Lexicon Quest's Suno themes and SFX
are the source (`D:\LexiconQuest\next\assets\audio`). Audio never feeds anything back into the sim.

**Synth** (wave 5b, LIVE, Scott 2026-11-24 "Audio is a go"): `src/audio/synth/` makes music and sound with WebAudio, no
samples. `audio.js` owns it through `synth_game.js`; nothing else imports it. Everything is rendered once on an
OfflineAudioContext in the background and played as buffers (themes go to the LQ engine as blob-URL music entries
`synth:<place>:day|night|combat`; a bank of short sounds plays on its own gain into the context). `synth_places.js`
(pure): the synth sits beside today's tracks, a theme only where a place has none of its own (the Hollow, dungeons,
caves, roads after 8 s). `synth_table.js` (pure): sim event -> synth sound; `replace: true` stands in for the
sfx_table sound. `audio.setSynth(bool)` is the Settings switch (`options.synth`, default on; `?synth=0|1` for QA).

---

## 12. Dev loop (LIVE)

```
node qa/run.mjs                       all tests (prints REALMS_QA: pass=<n> fail=<n>)
python tools/dev/serve.py             http://127.0.0.1:8790
python qa/shot.py --scenario all      headless screenshots into qa/out/ (boot, walk, collide, zoom, target)
node tools/dev/import_lq_maps.mjs     re-import Willowmere + the valley from Lexicon Quest (add ids to import more)
```

Dev URL options: `?seed=`, `?zoom=1|1.5|2`, `?zone=valley&x=6&y=33` (start spot), `?paused=1` (drivers step the sim
with `window.__realms.step(n)`).

---

## 13. Integration (LIVE, integration wave 2026-11-19)

**main.js tick**: `input.poll({ snap, playerId, pick, toWorld: renderer.devToWorld })` and UI commands -> `world.enqueue`;
`world.step()`; `bus.publish(events)` (UI log, audio); `renderer.feed(events)` (effects, corpses, hurt flashes).
`renderer.anchorOf(id)` + `worldToHud` place the quest marks (`hud.npcMarkers`) over npc heads on the HUD layer.

**Input** (`src/input/input.js`, `createInput(win, canvas, { abilities })`): left click = target; right click on a
hostile mob = `attack` (target + auto-attack); right click on an NPC or a quest node = `target` + `interact`; touch tap
(`tap` intent) = target, and talk / use for NPCs and nodes. A `cast` whose ability has `target: 'ground'` carries
`at: { x, y }` (world px): the mouse on desktop, on a phone (`input.setTouch(true)`) the current target's feet or 48 px
in front of the player. The Interact key (F) / Talk button picks the nearest NPC with a `!` or `?` within reach first,
then the current target when it is an NPC within reach, else the nearest NPC or quest node. `X` = `sit` (keymap action
`sit`; in combat the UI says "You can't rest in combat." and sends nothing).
Fix wave 1 (2026-11-19): **Tab** orders foes attacking you (`target` or `aggro` is you) nearest first, then the rest
by distance (a foe in front counts 40% nearer), within `TAB_RANGE_PX` 280. **GCD**: a `cast` pressed with
`hud.gcdLeft <= 0.4` s waits and goes out the tick the GCD ends; an earlier press is dropped (no `cast_fail gcd`, no
log line). **Walking by tap**: a `tap` on empty ground walks there with ordinary `move` / `stop` commands (keys or the
stick cancel it; gives up after 1 s without progress); a tap on an NPC out of reach, or a `talk` intent (a click / tap
on a quest mark: `{ k: 'talk', id }`), walks to 34 px and then sends `interact`.

**Save** (`src/ui/save.js`, schema v1, `lexicon_realms.chars`): each character keeps the select-screen summary
(`level, xp, zone, zoneName, x, y`) plus `state` = the full character for `addPlayer` restore:
`{ v: 1, name, cls, look, level, xp, gold, zone, tx, ty, bag, bags, equip, known, bar, talents, quests, questsDone,
nodesUsed, respecs, lantern }` (positions in tiles; a dead hero saves at their lantern; an escort in progress restarts).
Fix pass 1 (sim lane, for the UI lane to wire): merge `world.saveFields(id)` into `state` (`qbag, pendingLoot, hp, res,
cdLeft, auras, escorts`) and keep passing the whole saved spec to `addPlayer`; the sim restores health, resource,
cooldowns and lasting buffs from it, and respawns any escort at its start.
Saved every 5 s, on tab hide, on unload and on quit to select. `hinted: true` once the controls card was shown.

Onboarding hints (wave 7, PLAN item 13, src/ui/onboard.js): a stored hero carries `tips: [id]`, the hints it has done (`move talk follow target ability interrupt loot rez`); a hero with `hinted` and no `tips` is from before hints and has done them all. `options.hints === false` (the switch in Help, never a Settings row) shows none. While a new hero has hints to see, the old controls card is not shown. UI only: the hints read the HUD model, the snapshot and sim events (`interact`, `quest accept`, `cast_start`, `school_lock`, `loot`, `rez start`), never write the sim, take no input but their own x (a thumb-sized corner on a phone; a foe under the box stays tappable) and hide while a window, the npc window, the boss card, a banner or a death is up. Drivers: `window.__realms.ui.onboard.state`.
Quit to select = `world.removePlayer(id)` in place (no page reload).

**URL options**: `?tod=0..1` (freeze the time of day), `?weather=clear|rain|leaves|pollen`, `?fx=low|high` (overrides
the option) -> `view.tod / view.weather / view.fx`; the options menu sets `view.fx` and the audio volumes.
`?dev=1` (DEV ONLY, never linked): `window.__realms.dev = { xp(n), level(L), gold(n), hp(n) }` for drivers.
`window.__realms.fps()` = `{ fps, p95ms, n }` over the last 240 animation frames.

**Audio** ambience (fix wave 1): `audio.zone()` also starts a looping bed: Willowmere and the valley `river_birds`, the
Downs `wind_valley`, the Moor `moor_wind` (LQ loops copied to `assets/audio/ambience/`); `audio.ambience(null)` on quit.

**Audio** (`src/audio/audio.js`, `engine.js` = LQ's engine, `sfx_table.js`): unlocked on the first pointerdown /
keydown / touchstart; title theme on the title screen, zone `music` themes in the world, event sfx for the local player.

**Deploy**: `index.html` at the repo root loads `src/main.js` and `assets/` by relative paths, so any static host serves
the repo root. `.github/workflows/pages.yml` runs `node qa/run.mjs` and publishes `index.html`, `src/` and `assets/` to
GitHub Pages on push to `main` (Pages must be set to "GitHub Actions" in the repo settings once).

**Playthrough checks** (need `python tools/dev/serve.py`): `python qa/integrate/playthrough.py` (desktop, real keys and
mouse, prints `INTEGRATE_DONE:`), `python qa/integrate/phone.py` (844x390 phone, real touch, prints `PHONE_DONE:`).
## Combat role pass additions (2026-11-19, LIVE)

- Spawns may carry `pack` (from `src/data/packs.js`, added by `allSpawns()` in `src/data/maps/index.js`); the snapshot shows it as `o.pack`.
- Pack members take the `PROGRESSION.packs` multipliers on health, damage and XP (pair 0.85 / 0.75 / 0.85, three 0.66 / 0.5 / 0.65). Pulling one member pulls its camp within 6 tiles.
- `enemies_near_holder` target lists honour `maxTargets`.
- Ability tooltips carry `lines` (plain-language number lines: damage or healing per hit, damage per second, area and foe limit, control effects).

## Class identity pass additions (2026-11-19, LIVE)

Scott, 2026-11-19: "Each class should have its own unique strength(s) and weakness(es). Skills can make super-strengths or compensate for weaknesses."

- Mob templates may list `traits` (`armored`, `caster`, `fast`, `heavy`, `tough`); kind `armored` and kind `caster` carry their trait without listing it. Every trait is a rule in `PROGRESSION.mobTraits`.
- `recalcMob` turns traits into fields on `e.mob`: `traits`, `plating` (flat cut off each physical non-periodic hit, `base + perLevel x L`), `speedMult`, `snareMult` (root and slow duration share), `unblockable`, `drain` (`{ resourceKind: amount }` knocked out per hit), and the tough hp, damage and xp multipliers. The old `mobKinds.armored.physReduce` is 0.
- `classes[cls].passives = { mods, procs }` apply to every hero of the class (`src: 'class'`), talents or not. `classes[cls].identity = { strong, weak }` is the two lines the class card shows.
- New mod stats: `platingIgnore` (share of plating skipped, 0 to 1), `snareFast` (share of the fast trait's lost snare time given back, 0 to 1), `drainResist` (flat off a heavy drain).
- New `when` conditions: `targetTrait`, `attackerTrait`, `targetCasting`, `inCombatFor` (seconds; reads `e.combatSince`, set when a hero enters combat).
- Talent branches carry `kind` (`strength`, `counter` or `flavor`, one of each per class) and `purpose` (at most 28 characters, shown in the talents window).
- A move effect `kind: 'blink'` cast on self with no attacker goes away from where the mob faces (its foe), not toward it.

## Builds 2 phase 1 additions (2026-11-19, ON for the Mender)

Approved design: `docs/design/BUILDS_2.md`. ON since Scott approved the talents screen stills (2026-11-19):
`content.progression.builds2 = { enabled: true, classes: ['mender'] }` (`src/data/progression.js`). A Mender runs
Builds 2; every other class runs today's talents, and its `b2_*` commands refuse with `b2_fail { reason: 'off' }`.

- **Window:** `src/ui/talents2.js` replaces `talents.js` for a hero whose HUD model has `builds2` (`uivm.js` adds
  `m.builds2 = { ...hud.builds2, build }`). Data-driven from `BUILDS2[cls]` and `SKILL_PICKS[cls]`: a class joins by
  adding its tracks there and its id to `builds2.classes`. Region labels for drivers: `b2node:<node>`,
  `b2pick:<level>:<ability>`, `b2:Spend suggested`, `b2:Undo (n)`, `b2:learn`, `b2:card_close`, `b2:close`, `b2:tab:<id>`.
- **Level event:** a Builds 2 hero's `level` event carries `b2: true, b2Free` (before auto-spend); the UI words the
  prompt from it and rewrites it when `b2_talent kind 'auto'` follows.

- **Data:** `src/data/builds2.js`: `BUILDS2[cls] = { tracks, nodes, signatures, builds, defaultBuild, baseline }`,
  `SKILL_PICKS` (all five classes), `RULES`, `B2_ABILITIES` (the Blessings; joined to the sim's ability table only when
  the flag is on). `content.builds2 = { rules, classes, skillPicks, abilities }` (`buildContent`).
- **Entity:** `e.build` (always; the save shape) and `e.b2` (true when the flag is on and the class has tracks). Node
  effects reuse the talent effect engine (`src/sim/data.js` reads `e.build.ranks` when `e.b2`).
- **Rules:** `src/sim/builds2.js` (`C.b2`): 1 point per level from 1; tier n needs (n - 1) x 2 in its track; tier 3 fork
  exclusive; keystones need level 10, 1 slot at 10, 2 at 25, 3 at 40; undo the last 3 points free out of combat; respec
  free once when flagged, free at a lantern under 10, at the trainer from 10 (first free, then 10 + 5 x level, cap 250);
  skill picks at 1 (after the first kill), 3, 6; the other skill bought back at the trainer; auto-spend to level 5.
- **Commands:** `b2_learn { node }`, `b2_undo`, `b2_respec { npc? }`, `b2_pick { level, ability }`, `b2_leaning { build }`,
  `b2_auto { on }`, `b2_suggest`. **Events:** `b2_talent`, `b2_fail`, `b2_pick`, `b2_pick_ready`, `b2_respec`,
  `b2_leaning`, `b2_auto`, `b2_brand_jump`. HUD: `hud.builds2` (null while off). Snapshot: `b2`, `build`.
- **Effect engine additions:** conds `combatUnder`, `targetIsSelf`, `solo`, `cooling`; mod flag `direct`; stats
  `overflowShield`, `leechLowest`, `autoSp`, `brandJump`; recipients `allies_near_target`, `lowest_ally`, `my_target`,
  `excludeHolder`; `resource.pctOfMax`; object `pulseAllies`; proc and `consumeOn` ability lists; aura `recalc: true`;
  script `all_light` (Pure Light) and effect script `unbroken`.
- **Save v2** (`src/ui/save.js`): `SAVE_VERSION 2`; v1 migrates (every field kept, `state.v = 2`, `state.build` with a
  flagged free respec, old talents kept in `build.legacyTalents`); the v1 blob is copied once to `<key>.v1`; a corrupt or
  newer blob still goes to `<key>.bad`. `main.js` saves `state.v: 2` and passes `build` to `addPlayer`.

## Builds 2 phase 2 additions (2026-11-19, ON for every class)

Design: `docs/design/BUILDS_2.md` 4.1, 4.3, 4.4, 4.5 with the `BUILDS_2_PLAY.md` 1.3 amendments (Inkblade keystone costs,
the axis chips, the Iron Sweep tweak) and 1.4 (every named build spelled out). The flag:
`content.progression.builds2 = { enabled: true, classes: ['mender', 'warden', 'scribe', 'wayfinder', 'inkblade'] }`.
No class shows the old talents window now; `src/data/talents.js` (the 162 nodes) and `src/ui/talents.js` stay as dead
data and code (save v1 heroes keep their old ranks in `build.legacyTalents`; the old tests still exercise them with the
fixture flag off).

- **Data:** one file per class, `src/data/builds2_warden.js`, `_scribe`, `_wayfinder`, `_inkblade` (shared helpers in
  `builds2_kit.js`), joined in `src/data/builds2.js`. Each exports `{ tracks, nodes, signatures, signatureAxis, builds,
  defaultBuild, baseline }` and its new abilities (the 16 pick skills, the +skill nodes' skills, the 12 signatures), which
  `B2_ABILITIES` merges. A named build carries `picks` (1, 3, 6, 14), `signature` and `signatures` (its order), `forks`,
  `keystone`, a 15-point `path`, optional `buy` ({ level: ability }, a pick bought back at the trainer) and `answers`
  ({ trait: fromLevel }, BUILDS_2_PLAY 3.3's solo answer to its class's struggle, read by `qa/sim/builds2.mjs --struggle`).
- **Signature pick:** `RULES.signatureLevels` [10, 20, 35]. `B.picksOpen` adds `{ level: 10, options, signature: true, axis }`
  while the hero has fewer signatures than levels reached; `b2_pick { level: 10, ability }` takes one into `build.sigs`.
  Only `ready` signatures are offered (all fifteen are ready; the Mender's three were built 2026-11-19, below).
- **+skill nodes:** a node rank may carry `grant: abilityId`; `data.talentInfo(e).grants` lists them and `B.syncGrants`
  (run on every change and on attach) learns them, records them in `build.granted`, and removes one (known and bar) when
  the node goes, unless a pick, a purchase or a signature also gives it. Event `b2_grant { id, ability, on }`.
- **Attach:** a hero who reaches Builds 2 with trainer skills gets the picks it already covers recorded (the other side,
  when known too, counts as bought), so no pick is offered for a skill it has.
- **Window:** `src/ui/talents2.js` `pickSlots(cls)` (the skill picks and the level 10 signature slot, three options),
  `slotTaken(build, slot)`. Desktop slots size by option count; a phone with five slots goes compact (the level beside
  the icons, no name line). The hero's name gives way to a long leaning name. Region label `b2pick:10:<ability>`.
- **Effect engine additions** (src/sim/combat.js, stats.js):
  - mod stats `weaponMul` (every swing), `autoWeaponMul` (auto-attacks), `noOffHand`, `cleave` + `cleavePct` + `cleaveRange`
    (a direct hit also lands on more foes), `stormShots` (physical shots become nature), `dodge` (a dodged hit does
    nothing, `result: 'dodge'`, fires `dodge` procs; capped at 60%), `spellArmor` (armor on spells), `armorMul` (on the
    holder's armor), `hitResolve`, `resDrain`, `crowdResolve`, `snareDuration` (the hero's roots and slows), `castMove`
    (cast while walking at that speed share), `hastyNote`, `moveShot`, `snapShot`, `manaShield`, `ruthless`, plus the proc
    field `icdStat` (Cut the Word's `cutWordIcd`).
  - mod filters `notAbility`, `perNear: { radius, max }` (per foe near), aura-mod `selfOnly` / `othersOnly` (the attacker is
    / is not the aura's caster). Proc filters `school` ('spell' = non-physical) and `direct` (skip cleave hits).
  - conds `resAbove`, `targetBeyond`, `targetSnared`, `targetHeld`, `targetAlone`, `selfAura`, `noScript`.
  - recipients `enemies_in_line` (`length`, `width`: through the target), `enemies_near_self` (`radius`).
  - effects: `threat { drop: true }` (foes keep the hero at almost no threat and look away), `resource.pctOfCost` (of the
    proc's ability), `move` kinds `pull` (the target to the caster), `blink_to` (to `at`), `leap` with `dir: 'point'`;
    damage `forceCrit` (Capital Letter).
  - ability fields `onCast` (effects on the caster at cast time), `bounce: { count, radius }` (a projectile hops to the
    nearest foe it has not hit; `projectile` events carry `from`), `land` + `landRadius` + `landResolve` and `arrive` (effects
    where a leap or charge ends; the move effect needs `to: 'self'`), `requires.notElite`.
  - aura fields `hitCharges` + `hitAbility` (a buff that lasts that many hits), `scaleStacks` (a tick per stack).
  - placed objects: `pet: { period, range, speed, fly, still, effects, interrupt: { every, lockout } }` (follows its owner,
    hits the owner's target with the owner's numbers), `hpPct` (health as a share of the owner's), `hits` (dies after that
    many hits), `holdThreat` (foes fighting the owner are taunted to it), `copy` (it repeats the owner's direct hits at that
    share), `rearm` (a trap re-arms that many times). Mobs strike an object with `hpPct` or `hits` (`dealDamage` to an object).
  - costs: `payPlan` / `pay`: a cost can be paid in health (Blood Ink when the mana runs out, Bottomless Well always;
    event `b2_proc { what: 'hp_cost' }`); `freeCast` (Dancing Bow).
- **AI** (src/sim/ai.js): mode `charmed` (Rewrite: `m.charmedBy`, faction 'player' for its time, it fights its old side;
  kills credit the charmer); a foe whose only threat is an untargetable hero waits (`'lost'`) instead of resetting; a held
  foe that its target keeps hurting does not leash (CONTRACTS 5.7 "or being hurt by its target"; `m.lastHurt`).
- **Play rules:** `src/sim/scripts_b2.js` (hooked from scripts.js): `b2_moving_wall`, `b2_oathbreaker`, `b2_gatekeeper`,
  `b2_spellbreaker` (Warden); `b2_capital`, `b2_shorthand_master`, `b2_blood_ink`, `b2_bottomless`, effect scripts
  `b2_paragraph`, `b2_rewrite`, `b2_rewrite_end` (Scribe); `b2_point_blank`, `b2_hunting_spear`, `b2_dancing_bow`,
  `b2_kick_and_shoot`, effect script `b2_grapple`, the Kestrel's Dive (Wayfinder); `b2_vanish`, `b2_silence`, `b2_spellthief`,
  `b2_unwritten`, effect scripts `b2_never_seen`, `b2_spread_marks` (Inkblade). Spare Ink Marks live on foes as the aura
  `inkblade_marks` (stacks); a new combo on that foe starts from them. Event `b2_proc { id, what }` for the rest.
- **Baselines** (`BUILDS2[cls].baseline`): Warden move -5%, +2 Resolve a second per foe in melee beyond the first, damage
  -25% to a foe alone (tuned); Wayfinder move +5%, shots within 2 tiles -20% (Point Blank lifts it), damage -10% (tuned);
  Inkblade damage -8% (tuned). The Inkblade's Cut the Word proc reads `icdStat` and stops on an ordinary hit with Unwritten.
- **Gate:** `node qa/sim/builds2.mjs` covers all five classes (15 named builds x levels 1 to 15); `--struggle` checks each
  class's BUILDS_2_PLAY struggle foe on qa/sim/matchup.mjs's measure. Tests: `qa/sim/builds2_classes.test.mjs`.

## Builds 2: the Mender's signatures and the 8-slot bar (2026-11-19, LIVE)

- **Mender signatures** (`src/data/builds2.js` `MENDER_SIGNATURE_ABILITIES`, merged into `B2_ABILITIES`; chip
  `signatureAxis: 'Hammers vs Water vs Spirit'`; each named build carries `signatures`):
  - **Tolling Hammers**: a placed object with `script: 'b2_tolling_hammers'` and `hammers`, `from`, `reach`, `turn`,
    `hitRadius`, `effects` (one hit). `src/sim/scripts_b2.js` `objectTick` (called from scripts.js `objectTick`) keeps it on
    its owner, spirals the hammers out and lands `effects` once per hammer per foe; the hit is multiplied by the owner's
    `healingDone` mul when above 1 ("every 1% of healing bonus adds 1%"). Per hit tuned to `1.8 + 0.78 L + 0.135 SP`
    (BUILDS_2: `6 + 2.6 L + 0.45 SP`): a foe takes three hits a cast, about 90% of the design's one-hit number.
  - **Riptide Step**: effect script `b2_riptide`; ability fields `flow: { distance, width, time }` and
    `pass: { foes, allies }`. She flows the way she walks (else faces), stopping short of a wall (forced move); foes within
    `width / 2` of the line get `pass.foes` (a 40% slow, 3 s), friends (not herself) `pass.allies` (a heal). Event
    `b2_proc { what: 'riptide', hits }`.
  - **Kindred Light**: a pet (`hpPct 0.4`, `holdThreat`) with the new pet field `owner: { every, effects }` (effects on the
    owner every `every` s while she is hurt: 2% max health). A recast while the spirit is out refreshes its time and keeps
    its health (`beforeFire` skip; `b2_proc { what: 'kindred_refresh' }`).
  - Tooltips (`src/ui/gamedata.js`): `{dmg}` reads a pet's bite, `{heal}` reads `pass`; number lines for hammers, pets, `flow`.
- **Skill bar: 8 slots** (BUILDS_2 open question 4, Scott "yes to all"). `BAR_SLOTS = 8` (`src/sim/constants.js`); `e.bar` is
  the dense list of ids in slot order, at most 8; `prog.learn` puts a new skill in the first free slot. `prog.fillBar` on
  `addPlayer`: a restored bar that was full at the old 6 slots takes the known skills it left off, in learn order. Desktop:
  keys 1 to 8 (`keymap.js` `slot7`, `slot8`; `input.js` Digit1 to Digit8), `layout.js` `BAR.n = 8` (205..434 on the
  640 layer). Phone: the cluster is six buttons wide, two tall: skills 1 to 6 where they were, Talk and Next beside them,
  7 over Attack, 8 at the outer end of the bottom row; 44 css px; the chat narrows to fit. Save: `src/ui/save.js`
  `BAR_SLOTS`, `padBar` (exactly 8 entries, `null` = empty); `main.js` saves `padBar(e.bar)`; v1 and old v2 bars pad on load.

### TODO (data only, later phases)

- **Signatures 2 and 3** (levels 20 and 35): the pick rule is built; each class's other two signatures are real skills
  already, but levels past 15 do not exist yet.
- **Grapple points** in zone maps (`grapple: true` objects) for Grapple Line's "pull yourself to a point"; today it targets
  foes only.
- **Furnace Form's size +30%** and every signature's own look: the renderers draw them with existing fx (projectile, leap,
  aura and object looks; pets and doubles use the `ink_double` object look, the Ellipsis dots the trap look, the Paragraph
  the hedge look, the dust cloud `zone_peal`). No new renderer event types were needed; `b2_proc`, `b2_grant` are ignored
  by the renderers.
- **Level 25 picks** (BUILDS_2_PLAY 1.3: Slag Brand / Hammerfall, Run-On Sentence / Full Caps, Tanglewire / Broadhead, Gall
  Ink / Opened Vein, Sanctuary Toll / Inner Bell): written and live since cap 30 (below, "Cap 30").
- **Flourishes, class hooks (Ring Block, Bright Thread, Punctuate, Snap Draw, Clean Spill), setup states and cross-class
  combos, party keystones, Many Hands** (BUILDS_2_PLAY 2, 4): a later phase. Hook room left: node `byRank` effects take
  any extra field, and setup states can be auras on foes like `inkblade_marks`.
- **Skill bar:** done, 8 slots from level 1 (above). BUILDS_2 3.2's "7 at 10, 8 at 20" unlock is not used: Scott approved
  the 8-slot bar as one change.

## Items on the skill bar (2026-11-19, LIVE)

Scott: "Let me equip potions and other items on buttons on the phone or number keys on the pc."

- **Bar entries:** a slot holds an ability id, `item:<itemId>` (any item with `use` in `src/data/items.js`) or `null`.
  A bar with no item entries stays the dense list it always was (old saves load unchanged); once an item is on it every
  slot keeps its place (`null` holes, trailing nulls trimmed). `prog.restoreBar` (addPlayer), `prog.fillBar` (skips a bar
  with items), `prog.dropFromBar` (Builds 2 un-grant), `prog.learn` fills the first hole first.
- **Command `bar_set { slot (1..8), entry }`** (`prog.barSet`): entry a known ability, `item:<id>`, or null. The entry
  already on the bar swaps with the slot; an ability it pushes out moves to the first empty slot (off the bar when there
  is none); null clears an item slot and a known skill that is off the bar takes the slot back. A skill slot cannot be
  cleared (superseded 2026-11-20: see Moving skills on the bar). Events `bar { id, slot, entry, bar }` / `bar_fail { id, slot, entry, reason: slot | empty | ability | unknown | not_usable }`.
- **Using it:** `cast { slot }` on an item slot runs `use_item { item }` (stock, level, `cd['item:<group>']`, the potion
  group shared); the client (`input.js`) sends `use_item { item }` itself, off the GCD. No stock: `inventory_fail`
  reason `no_item`, the UI toasts "No Potion left.".
- **HUD:** `hud.bar[i]` for an item slot is `{ slot, ability: null, item, name, icon, count (all stacks), cdLeft, cdTotal,
  usable, inRange: true, offGcd: true }`; empty slots are `{ slot, ability: null, known: false }`. The slot draws the
  icon, the count (0 in red, the icon greyed) and the cooldown sweep.
- **Placing it:** PC: drag a usable item from Bags onto a bar slot; right-click the slot to take it off. Phone: the bag
  item card has Put on bar, then tap a gold-outlined bar slot (or Cancel); a long press on the slot pins the item card
  with Take off bar (item slots fire on release so the long press does not use one). Save v2: `padBar` keeps the strings.

## Moving skills on the bar (2026-11-20, LIVE)

Scott: "Add the ability to rearrange skills on the bar."

- **Command `bar_set { slot, from }`** (move form, `prog.barSet`): whatever is on slot `from` (skill or item) goes to
  `slot`; an occupied slot swaps, an empty one just takes it. `from` empty: `bar_fail` reason `empty`; out of 1..8: `slot`.
- **Taking a skill off:** `bar_set { slot, entry: null }` on a skill slot empties it (no longer `bar_fail ability`). The
  skill stays in `known` and is listed in `e.barOff`; `prog.learn` of a skill already known does not put it back (a new
  skill always goes on), `fillBar`'s 6 to 8 slot top-up skips it, and clearing an item slot does not pull it back.
  `bar_set { slot, entry: <ability> }` puts a known skill back (it leaves `barOff`). A spare skill dropped on a slot that
  holds a skill swaps with it (the old one goes to the spare list); an item placed on a skill slot still pushes the skill
  to the first empty slot, as before. The `bar` event now also carries `off: [...barOff]`.
- **Places kept:** a bar keeps every slot in place when it holds an item OR has an empty slot before a filled one (a moved
  or removed skill); otherwise it is the dense list of old saves (`restoreBar`, `fillBar`, `dropFromBar` all use this).
- **Save v2:** `world.saveFields` adds `barOff: [ids]` only when it is not empty; `main.js specFor` passes it back and
  `prog.restoreBarOff` keeps known ids that are not on the bar. An old save (dense bar, no `barOff`) loads exactly as before.
- **HUD:** `hud.spare: [{ ability, name, icon, off }]`, the known skills not on the bar; the UI model has `m.spare`.
- **PC:** hold a bar slot and move the pointer more than 3 HUD px: a drag. Let go on another slot: move or swap; let go
  away from the bar row (not in a gap between slots): taken off. A plain click casts on release (a drag has to be ruled
  out first); the number keys still cast on key down. Right-click on an item slot takes the item off; right-click on a
  skill slot casts it as before, so a skill only comes off by a deliberate drag. Character window, Spare skills: drag one
  onto a slot.
- **Phone:** a long press on a bar slot pins its card: Move, Close, Take off bar. Move outlines the slots in gold with a
  Cancel prompt; tap a slot to move or swap. Items always fire on release; a skill fires on release while out of a fight
  (so the long press never casts it) and on touch down in a fight, as before, where a long press only shows its tooltip.
  Character window, Spare skills: tap one for its card with Put on bar, then tap a gold slot.

## Storage: the Lantern Chest and the glyph pouch (2026-11-20, LIVE)

Design: `D:\LQOnline\storage_stills\BRIEF.md` (approved 2026-11-20, every open question at its recommended default).
Code: `src/sim/storage.js` (rules), `src/data/storage.js` (sizes, prices, where chests stand, the 26 glyph records),
`src/ui/chest.js` (window, glyph stones, pouch strip).

- **Chest objects**: `content.lanternChests` (`src/data/storage.js` LANTERN_CHESTS, added by `buildContent`) become
  `kind: 'object'` entities with `chest: { id, place }` (snapshot) and `sprite: 'lantern_chest'`, spawned after the quest
  nodes. Today one, at the Willowmere inn (only Willowmere has an inn). `interact` on one (Talk, F, a tap, a right-click,
  like an npc) checks reach (40 px), death and combat (`interact_fail` reason `range` / `dead` / `combat`), sets the
  hero's `chestAt` and emits `chest_open { src, id, chest, place }`.
- **Tabs**: `tab` is `'hero'` (this hero only, `player.chest`) or `'shared'` (every hero on the device, `state.shared`).
  A tab is `{ rows, items: [{ item, qty, inst? }], glyphs: [{ item, qty }] }`; capacity `start + rows x rowSize` up to
  `max` (`content.storage`: hero 30 + rows at 100 / 300 / 800 gold, max 60; shared 30 + rows at 300 / 900 / 2,000, max
  60). Glyphs in a tab use no slots. Quest items never go in (they live in the quest bag).
- **Commands** (every one names `chest`; reach 64 px, alive, out of combat, else `inventory_fail` `range` / `combat`;
  a dead hero's commands are `cmd_reject` `dead`):
  `chest_store` bag slot (or `glyph`) -> tab (stacks merge; `chest_full`, `no_item`, `quest`); `chest_take` tab slot
  (`index` + `item`, the item must still be there) or `glyph` -> bags or pouch (`bag_full`); `chest_move` to the other
  tab; `chest_row` buys the tab's next row (one at a time, the buyer pays; `gold`, `max`); `chest_sort` merges stacks
  and orders by kind (`STORAGE.sortKinds`), rarity (best first), name, item level. Event
  `chest { id, kind: 'store' | 'take' | 'move' | 'row' | 'sort', tab, to?, item, qty, glyph?, cost?, size?, shared }`
  (`shared: true` when the Shared tab changed) plus `gold` (source `chest_row`) for a row.
- **HUD**: `hud.storage` = `{ chest, place, hero: tab view, shared: tab view }` while the hero stands within 64 px of the
  chest they opened, else `null` (tab view: `{ size, rows, max, nextPrice, items: [item view], glyphs: [{ item, qty,
  letter }] }`). `hud.glyphBag` = `[{ item, qty, letter }]` always.
- **Glyphs**: items `glyph_a` .. `glyph_z`, `kind: 'glyph'`, `letter`, `vowel`, `rule` (the lone stat rule; numbers are
  left to the Builds 2 balance pass), `words`. `bagAdd` puts them in the glyph pouch `player.gbag` (one stack per letter,
  A to Z, no limit; never a bag slot); `bagCount` / `bagRemove` read it. No drops are wired; `?dev=1` has
  `__realms.dev.glyphs('ASH', n)`. Socketing and spelled words are a later build.
- **Save**: `world.saveFields(id)` adds `chest` (the hero tab) and `gbag` (the pouch); `addPlayer` takes them back;
  missing = empty, so every older save loads unchanged. SAVE_VERSION / STATE_VERSION are NOT bumped. The Shared tab is
  never in a hero save: `world.shared()` / `world.setShared(obj)` (malformed parts dropped), and main.js keeps it under
  `lexicon_realms.shared` `{ v: 1, rows, items, glyphs }` (`src/ui/save.js` loadShared / saveShared; a corrupt or newer
  blob is copied to `<key>.bad` and the tab starts empty). main.js saves the Shared key (when `shared`) and the hero on
  every `chest` event, and reloads the tab when another browser tab writes the key.
- **UI**: desktop: right-click a chest item takes it, Shift + right-click moves it to the other tab, a drag onto the bags
  takes it; right-click (or a drag onto the chest) stores a bag item, Shift + right-click straight to Shared; glyph stones
  move whole (Ctrl + right-click: one). Phone: a tap pins the item's card (chest: Take, Move to <tab>, Close; bag: Store,
  Store in Shared, Close), a second tap does the main action; the grid and the glyph strips scroll with a drag
  (`scrollDrag` regions, `src/input/touch.js`). A row costs gold: its button asks once ("Again") before buying.

## Dungeons and caves (2026-11-22, LIVE; Scott: "make it all live to try", D:/LQOnline/dungeons/BRIEF.md)

Data: `src/data/dungeons.js` (`DUNGEONS`, `DUNGEON_RULES`), the zones `src/data/maps/<id>.js` (generated by
`tools/maps/zone_<id>.mjs` with `tools/maps/dungeon_kit.mjs`; `node tools/maps/build_world.mjs` builds and checks them),
the doors `src/data/maps/doors.js`, the quests `src/data/dungeon_quests.js`, the bosses and their moves in `src/data/mobs.js`
(`fight`, `BOSS_TUNE`), the named loot and the Watchtower sets in `src/data/items.js` (`dungeon`, `set`, `SETS`). Sim:
`src/sim/dungeons.js`.

- **Zones.** `ZONES = { world, barrow, watchtower, rootcellar, smugglers_cut, tarn_hollow }`. A place is a section 6 zone
  with `kind: 'dungeon' | 'cave'`, `lighting.dark` 0.55 / 0.45, and `dungeon: { id, kind, name, levels, label, chests }`.
  Halls 4 to 8 wide, rock (`#`) elsewhere. `allSpawns()` skips places: their foes spawn per copy.
- **Doors.** A join pair. The world gets one join per place (`{ x, y, w, h, to: <place>, tx, ty, door: <place> }`) and a
  `doors` list for the renderers: `{ id, to, name, kind, levels, label: 'Dungeon, levels 10 to 12', x, y, w, h, out,
  region }`. The place's own exit join (`to: 'world'`) lands on `out`. Doors (world tiles): the Wethers' Barrow 27..29,107
  (the barrow mound's doorway, opened in `zone_downs.mjs`), the Watchtower 117..118,7, Rootcellar Den 291,128, Smugglers'
  Cut 180,168, Tarn Hollow 42,47. `build_world.mjs` checks every door walkable and on foot from the town, its `out` too,
  and inside each place every boss, spawn, chest and the lantern reachable from the entry with no pits.
- **Copies.** A copy is the place's zone data under the zone id `<place>#<key>`, key = the party (`p.party`; there is no
  party yet, so today the hero's id). `content.zones` is wrapped (`withCopies`, `src/data/maps/copies.js` and the sim's
  own) so `zones['barrow#12']` reads `ZONES.barrow`; every rule that compares zone ids keeps copies apart. Stepping
  through a door calls `DG.enter`: the copy is made if missing (its spawns, `respawn: null`, `spawn.noRespawn`; its chests)
  or reset first if nobody has been inside for `DUNGEON_RULES.resetSec` (1800 s) of sim time; `DG.tick` also resets empty
  copies every second. Reset = every entity in the copy goes (event `copy_reset`). Foes in a copy never respawn
  (`progression.onDeath`), so a boss stays dead until the copy resets. `state.copies = { zid: { base, key, made,
  emptySince, cleared } }` is in the saved world state. **Chosen because** it keeps determinism (all in sim ticks, no
  clock) and needs no new zone objects at runtime; online play later only has to set `p.party`.
- **Inside lantern.** Entering binds the place's lantern in the copy (`p.lantern`), keeping the outside one in
  `p.lanternOut`; death inside wakes you there; leaving gives the outside one back.
- **Save and load.** A hero saved inside a place (or dead inside) loads at that place's door outside on the world, with an
  outside lantern (`DG.loadSpec` in `addPlayer`). Simplest: the copy is not kept across a load.
- **Boss scripts** (`mobs.js fight`, `DG.bossTick` from `ai.js combat`, `DG.bossReset` from `ai.js reset`):
  `phases: [{ at, yell, summon: { mob, level, count, from? } }]` once each as health falls past `at`; `frenzy: { after,
  yell, mods }` a lasting aura `boss_frenzy` `after` s into the fight. Adds are temporary, tagged `bossAdd`, tuned by the
  place's `trash` x `adds`; a reset removes them and starts the script over. Moves with a cast time show a `telegraph`
  ('circle' on a fixed ground spot, 'cone' in front, 'line'). Events: `boss { id, kind: 'pull' | 'phase' | 'frenzy' |
  'reset' | 'death', template, zone, phase?, text? }`, `yell`. `ai.js`: a boss or named foe (`boss` / `rare`) uses a
  cast-time ability with reach from its ability list (other foes keep the old caster-bolt rule).
- **Loot** (`DG.onKill`, after `rollKill`, for the tagger): a boss in `drops` adds one piece from its pool the killer's class
  can use (magic, blue); the Watchtower's bosses add their set piece for the killer's class (`setSlot`); the last boss adds
  a rare from `rare` and rolls `legendary` at `legend.chance + legend.step x misses` (0.10 + 0.005 per miss; the count is
  `p.dungeons.miss`, saved, reset on a drop; event `legendary`). Events: `dungeon_clear { id, place, zone, first }`.
- **Daily chest.** The first clear of a place per day (the bounty boards' day, `state.day` / `world.setDay`) leaves
  "First Clear of the Day" by the last boss for the killer: gold, `glyphs` letter glyphs, a gear roll of `rarity` at `ilvl`,
  and bonus XP = `xpMinutes` x 4 x kill XP at the hero's level (`grantXp` reason 'dungeon'). Opening it records
  `p.dungeons = { day, done: [places], miss }` (saved in `saveFields`, restored by `addPlayer`; `main.js specFor` passes
  `dungeons`). Each copy also has a cache chest (once per hero). Chests are `kind: 'object'` with `node.secret` (drawn as
  the secret caches are) and `dchest`; the snapshot's `node.openedBy` and `node.chest { kind, place, for }`; event
  `chest_open`.
- **Snapshot.** `snap.places = { zid: { id, base, kind, name, levels, label } }` for each place a hero stands in;
  `hud[pid].zone = { id, base, kind, name, levels, label? }` always; the `zone` event adds `kind, base, name, levels, label`
  when the target is a place.
- **Sets.** `SETS[id] = { name, cls, track, armor, pieces: { head, legs, chest }, bonus: { 2: { text, mods }, 3: {...} } }`;
  `stats.recalc` counts worn pieces into `e.sets`, `data.talentInfo` adds the bonus mods while they are worn.
- **Side quests.** `content.sideQuests` (the dungeon and cave quests) are offered after the chain and the bounties; the main
  chain (`questOrder`, 24) is unchanged. An `explore` objective in a place matches its copies.
- **Tuning.** `BOSS_TUNE` (hpMult, dmgMult) and each place's `trash` / `adds` are set by `node qa/sim/dungeon_bot.mjs`
  (every class's named builds clear solo; gate: deaths <= 2), also run in the suite as `qa/sim/dungeon_bot.test.mjs`.
## World life: rares, rest XP, story chains, Night at the Stones (2026-11-22, LIVE)

Data: `src/data/rares.js`, `src/data/story_chains.js`, `src/data/world_events.js`, glued by `src/data/worldlife.js`
`applyWorldLife(content)` (the last step of `buildContent()`). Rules: `src/sim/worldlife.js` (`C.life`). Tests:
`qa/sim/worldlife.test.mjs`.

- **Rares**: 8 mob templates (`rare: true`, traits `tough` + `rare`; `content.progression.mobTraits.rare` = x1.25 hp, x1.4
  xp on top of tough). One content spawn each at its first spot; `content.rares[mobId] = { spots: [[x, y]] (world tiles),
  respawn: [s, s], item }`. On death the respawn is 30 to 60 min of sim time and the next spot another one, from
  `hashString(seed:template:killCount)` (the world rng is not drawn). Loot on top of `rollKill`: the rare's own item (blue,
  rolled to the class) plus one random piece for the looter's class, `magic`, or `rare` 1 in 20 (`content.rareRules`).
  Snapshot: mob entities carry `rare: true`; the HUD target view model carries `rare`.
- **Rest XP**: player field `restXp` (state). `addPlayer` spec takes `rest: { xp }` (missing = 0) and `offlineSecs` (the
  client's time away; main.js saves `savedAt` ms in the hero state, outside the sim); time away banks
  `content.rest.levelsPerHour` x xpToNext(level) per hour while the hero stands in a `safe` area or within
  `lanternTiles` of a lantern, capped at `capLevels` (1.5) levels; none at the cap. `saveFields` adds `rest: { xp }` when
  the bank is not empty. Kill XP pays `killMult` (2) while banked; the `xp` event carries `rested` (and `event`,
  `eventId` for Night at the Stones). HUD block: `hud.rest = { banked, cap, resting, killMult }`. No SAVE_VERSION change.
- **Story chains**: quests on a chain carry `story: { id, name, step, of, end? }`; `content.storyLater[questId]` = the later
  steps. `status()` counts a required quest as done when a later step of its chain is done or held. Turning in a last
  step emits `story { id, quest, chain, title, lines }`.
- **Night at the Stones**: `content.worldEvents`; six more `night` shades (group `stones_night`) in the ring; kills of the
  event's groups at night pay `xpBonus` and roll extra gear; `world_event { event, name, on, region, text }` at dusk and
  dawn (never on a world's first tick). State field `lifeNight`.
- Events added: `story`, `world_event`, `rest { id, gained, banked, cap }` (on the first step after a rested hero joins).

## Combat core: the hit table, resistances, school lockout, epic, item powers (2026-11-22, LIVE)

- **Content**: `hitTable` (src/data/hittable.js `HIT_CONTENT`) and `resist` (src/data/resist.js `RESIST_CONTENT`), both
  set by `buildContent()`. Content without them fights by the old rules (the qa fixtures default to off so the formula
  tests keep exact numbers; `fixtureContent({ hitTable: true })`, `duelWorld({ hitTable: true })` and qa/sim/builds2.mjs
  turn it on; `NO_HIT_TABLE=1 node qa/sim/builds2.mjs` compares).
- **What is on the table**: an ability's own direct, single-target damage (`dealDamage` info `avoidable`, set by
  `applyOne` when the context has an ability and no area, aura tick, copy or `fx.cannotMiss`), auto-attacks and foes'
  melee swings. Never: DoT ticks, area attacks, procs, cleaves, pets and traps, scripts. One roll on its own stream
  (`state.hitRng`, forked from the seed, saved with the state): miss, then dodge, then parry, then glancing; then block
  and crit as before. `kind` = `melee` | `ranged` | `spell` (any non-physical school; a spell's miss is `result:
  'resist'`). Miss by level gap both ways (`miss`, `spellMiss`, `foeMiss`). Foes dodge weapon blows from any side,
  armed foes (`ARMED` or a template's `armed: true`) parry blows from the front. Heroes dodge from the front (2% +
  agility x 0.05% + the `dodge` mod), the Warden and the Inkblade parry blows from the front (3% + the `parry` mod).
  Glancing: a hero's melee auto-attack on a foe above them. Foes crit (5%, elites 8%, bosses 10%; never area attacks).
  A missed blow still makes 1 threat and tags the foe; the defender's `dodge` / `parry` procs fire; the Warden keeps her
  Resolve for a blow she turned. Riders (`ridersOnAvoid`): a debuff, interrupt or Ink Mark later in the same effect list
  skips the target that avoided the blow. A skill that missed refunds 80% of the Resolve or Focus it cost. A stealth
  opener (`opener`) is on the table like any blow. Heroes' weapon blows carry an equal-level pay (`equalLevelPay`,
  `payLevels`), the Inkblade's dual-wield auto-attacks miss 6% more (`dualWieldMiss`).
- **Resistances**: a foe's `mob.resist` (family, then template, then the template's own `resist`), a hero's
  `derived.resist` from the gear affixes `resInk` `resShadow` `resLight` `resFire` `resNature` `resAll` (percentage points)
  plus the `resist` mod. Any non-physical damage (ticks too) rolls a band of 0, 25, 50 or 75% around that average.
- **Interrupts** lock the whole school of the interrupted spell (physical casts: only themselves): `e.schoolLock = {
  school: untilTick }`, every known ability of that school gets the lock as its cooldown, `castAbility` fails with
  `reason: 'locked'`. Event `school_lock { id, school, ability, until, by }`. The 110% melee / 130% ranged threat rule to
  pull aggro was already live (`P.combat.threatSwitchMelee`, `threatSwitchRanged`, src/sim/ai.js `pickTarget`).
- **Epic** rarity: 4 to 5 affixes (3 prefixes, 2 suffixes), sell x3.2. Drops: `DROP_RULES.bands` (BUILDS_2 6.8, by the
  dropper's level, `loot.js bandRule`): elites 2 / 4 / 8 / 12% epic by band, normal kills from level 20; the dungeons'
  last bosses' pool (`rare` in src/data/dungeons.js) is epic; a world rare's 1 in 20 extra piece is epic (src/data/rares.js).
- **Item powers** (src/data/legendary_powers.js): an item's `power = { id, name, text, mods, procs }`; worn items' ids are
  on `e.powers` (stats.js recalcPlayer); `stats.mod` adds the mods, `combat.procs` the procs (ICD key `power_<id>:<on>`,
  or `icdKey`). Proc `on` adds `parry`; effect `resource` takes `kind: 'any'`. The five legendaries: Reeve's Tally Ring,
  Bellwether's Last Toll (the Barrow), The Unsleeping Eye, Mantle of the Last Wick (the Watchtower), Hollowfang's
  Mistwalkers (Tarn Hollow, new legendary roll). `legendary` in src/data/dungeons.js may be a list (one the killer can use).
## Big world piece 1: outdoor zones, the Lantern Stone, flight, the Rootbound (2026-11-22, LIVE; D:/LQOnline/world3/BRIEF.md)

- **Outdoor zones of their own.** `src/data/maps/index.js OUTDOOR` (today: `rootbound`, 576 x 384) are zones beside the
  world, joined at a pass: a join pair like a door (the world's from the wilds, `wilds.joins`, composed in by compose.js;
  the zone's back). The sim needs nothing new (`checkJoin`). Generated by `tools/maps/build_world.mjs` from
  `zone_<id>.mjs` with the big-zone kit (`tools/maps/bigzone_kit.mjs`); the build checks both ends of each pass. Zone
  fields the 3D view reads: `cavern` (no sun, dark fog, lamps lit), `canopy: 'roots'`, `style: 'library'`, `regions` (the
  town camera), `flavour` (the card). `decor[].deep: n` = one canopy crown standing for n x n trees.
- **Loads.** Any zone change shows the loading card (`src/ui/loading.js`; kind `pass` for outdoor to outdoor) and the 3D
  renderer holds the swap behind it until the land near the hero is built and warm. A zone bigger than 150 x 150 builds in
  parts by distance from where the hero lands (`zone3d.js PART_R`: 100 m first, then 200 m, then the rest; `z.more`),
  each 48 m cell also gets a cheap merged far version (`cull(x, z, r, farR)`), small instanced props switch off past
  `SMALL_R` (70 m). A neighbour behind a pass is built once the hero is within `PASS_PREBUILD_R` (60 m) of it.
- **Commands.** `set_home { npc }` (an innkeeper in reach: `home` / `home_fail` reason `range`, `not_inn`);
  `fly { npc, to }` (a flight master in reach: `flight_start { from, to, cost, ticks, name }` + `gold`, or `flight_fail`
  reason `not_master`, `range`, `flying`, `combat`, `level`, `unknown`, `not_known`, `no_route`, `gold`). While flying every
  command but `move` / `stop` (ignored) is refused with `cmd_reject` reason `flying`. `use_item` on the Lantern Stone
  (`use.kind 'hearth'`, never used up) starts a 10 s cast: `hearth_start { endTick, to }`, broken by moving, combat or a
  cast (`hearth_stop { reason }`), then `hearth { zone, x, y, inn, name }` and a 30 minute cooldown (`cd['item:lantern_stone']`).
  Talking to a flight master unlocks its point (`flight_point { point, name }`); the `interact` event carries `inn { id,
  name, home }` and `flight { point, name, minLevel, known, to: [{ id, name, known, cost, secs }] }`. A flight moves the
  hero along `content.travel.routes['a>b'].legs` (a `zone` event at a pass), adds the aura `lr_flight` (flags
  `untargetable`, `stealth`, `immune`), and lands beside the master (`flight_end`).
- **addPlayer spec / saves.** `home: { inn }`, `flights: [pointIds]` (both optional, unknown ids dropped; `saveFields`
  writes them once used); `lanternStone: true` (main.js: every hero carries one; a bag full puts it in the waiting loot)
  and `newHero: true` (also on bar slot 8). No SAVE_VERSION change. The hero record may carry `start: 'realm' | 'willowmere'`
  (set on creation); main.js starts a `realm` hero at `content.startRealms[cls]` (the Scribe: the Rootbound). A hero on a
  kite saves at the landing.
- **Snapshot.** Player entities: `home { inn, name } | null`, `flights`, `hearth { start, end }` while casting,
  `flight { from, to, start, end, k, up }` while flying (`up` 0..1: off the ground). Friends' frames keep them.
- **Content.** `content.travel = { stone, inns, defaultHome, flight, routes }` (`src/data/travel.js travelContent`);
  `content.startRealms`; the Rootbound's foes, people, items, 14 quests (`sideQuests`), rare (`src/data/rootbound.js`).

## Polish: start realms, consumables, random legendaries, minor powers, live affixes, humanoids, caves (2026-11-22)

- **Quests `standsFor: [questId]`** (src/sim/quests.js): when a quest that stands for another is done, the other counts as
  done for its status and for every `requires.quests` (unless the hero holds it in the log, then it can still be handed
  in). The Rootbound's `rb_up_the_root_stair` stands for Hob's `wm_name_twice`: a hero who started in the Rootbound opens
  the valley chain and the Willowmere board at Mael, and is not paid twice (the realm's `rb_speak_and_be_kept` pays as Hob's).
- **Flat-stat aura mods** (src/sim/stats.js recalcPlayer): `{ stat: 'str' | 'agi' | 'int' | 'spi' | 'sta', add }` and
  `{ stat: 'main', add }` (the class's main stat) on any aura add points to the sheet; the aura needs `recalc: true`.
  Battle elixirs (+2 / 4 / 6 / 8 main), the damage flasks (+8 / +10 main) and Well Fed (+1 to +3 Stamina and main by the
  food's tier) use them (src/data/professions.js). Guardian elixirs, whetstones, oil and potions keep their shares.
- **Affix `combat`** (src/data/items.js AFFIXES, src/sim/affixes.js): `{ kind: 'dps' }` adds to that weapon's swing,
  `{ kind: 'leech', per }` heals `value x per` of direct damage dealt, `{ kind: 'onHit', chance, per, school, ability }`
  deals `value x per` damage of `school` on a direct hit (no crit; info `gearFx`, which never procs again). recalcPlayer
  puts `e.gearFx = { leech, onHit } | null` and `e.minors` on the hero; the weapon's min and max carry the dps.
- **Minor powers** (`content.rarity.rare.minor` and `.epic.minor` = `{ fromIlvl: 15, chance: 0.1, powers }`,
  src/data/legendary_powers.js MINOR_POWERS): `rollGear` may put `inst.minor = id` on a rare or epic; `resolveItem` adds the
  power's `text` and `minor`; worn ids on `e.minors`; `stats.mod` adds their mods and `combat.procs` their procs (ICD key
  `minor_<id>:<on>`), like a legendary power.
- **Random legendaries** (`content.rarity.legendary.random` = `{ fromLevel, rare, boss, ilvlOver }`, src/sim/legend_drops.js):
  after a kill's dungeon drops, a world rare or a boss that is not a place's own legendary roller rolls once per hero
  sharing the kill; own rng stream (`state.legendRng`). Event `legendary { id, item, source: 'rare' | 'boss', template, chance }`.
- **Humanoids**: a foe template with `family: 'humanoid'` runs at `MOB_RULES.flee.humanoid` (15%) and calls its kind
  (src/sim/ai.js fleeAt); no foe in today's data is humanoid (all are beasts, spirits, constructs, oozes or insects).
  New bandit or cultist foes only need the family.
- **Caves in 3D** (src/render3d/cave3d.js dressCave, called by dungeon3d.js dressPlace for `kind: 'cave'`): floor patches,
  gravel, stalagmites, glow fungus with additive light pools, puddles, by hashXY of the cell (no rng); cave walls take
  vertex colours from `caveTint` (dungeon3d.js). dressPlace may now return a Group (the fire glow plus the fungus glows).

## Mounts (2026-11-22, LIVE; D:/LQOnline/mounts/BRIEF.md, Scott said go with its recommended answers)

- **Data.** `src/data/mounts.js`: `MOUNTS` (bay_horse: level 10, 100 gold, +60%; moor_stag and grey_charger: level 20,
  1,000 gold, +100%), their summons (`MOUNT_ABILITIES`, ids `mount_<kind>`, merged into `content.abilities`), the stable's
  goods (`MOUNT_ITEMS`, ids `mount_<kind>`, items kind `'mount'`, merged into `content.items`), Wynn the Stable Master
  (npc `wynn`, a vendor of the three, spawned at world 182,142 on the riverside lane), `STABLE` (her yard's decor, added to
  the world's decor in `src/data/maps/index.js`, and the animals the 3D view stands there). `content.mounts =
  mountsContent()`: `{ kinds, order, byItem, byAbility, flag: 'mounted', stable }`.
- **Rules** (`src/sim/mounts.js`, `C.mounts`). Riding is an aura (`mount_<kind>`, flag `mounted`, `mods: speed add`, no
  end, `breakOn: ['damage']`). The summon: a 1.5 s cast, `toggle` (cast again: off), `requires: { outOfCombat: true,
  rideable: true }` (new requires key: `cast_fail` reason `indoors`). **Rideable** = `zone.mounts` if set, else
  `zone.kind === 'field'` (`rideable(zone)`): the world, the Rootbound and any later outdoor zone ride; a dungeon, cave or
  interior does not. A zone may set `mounts: false | true` to override. You get off: on any cast or attack
  (`combat.breakStealth` with why `action` | `attack` removes a `mounted` aura), on a hit (damage over 0), and in
  `tickPlayer`: the zone is not rideable (a door), a flight, the Lantern Stone, a gather or craft, sitting, death.
- **Buying.** `buy { npc, index }` on a `mount` item: level (`reqLevel`) and gold checked, no bag item; the summon is
  learned (the first one onto the bar like a skill, later ones into the spare skills, `barOff`). Events `mount_learn
  { id, kind, name, ability }`; `inventory_fail` reasons `level`, `gold`, `known` (already owned).
- **Command `mount { kind? }`** (Z, the phone horseshoe): riding: get off; else summon `kind` if owned, else the last one
  ridden (`e.mountPick`), else the newest. `mount_fail { id, reason: none | combat | indoors }`. `dismount { id, kind,
  reason: cancel | indoors | flight | cast | sit | dead }` (a hit or a cast shows as `aura_remove` reason `break`).
- **Snapshot.** Player entities: `mount: kind | null` (friends' frames keep it: co-op shows the mount on other screens),
  `mounts: [kinds]` when any are owned (trimmed from friends' frames, `src/net/frames.js TRIM`).
- **Saves.** `saveFields` adds `mounts: [kinds]` and `mountPick` once one is owned (the summons are in `known` too);
  `main.js specFor` passes them back; unknown kinds drop. No SAVE_VERSION change.
- **Client.** Keymap action `mount` (default `KeyZ`, a ui action); `hudLayout({ touch }).mountBtn` (above slot 8), drawn
  and pressable (region kind `mount`) only when `m.player.mounts` is not empty; `m.player.mount`, `m.player.mounts`.
  Icons: `assets/icons/mounts16`, `mounts24` (`tools/mounts/make_icons.py`). 2D: `src/render/mount2d.js` (the hero lifted
  `MOUNT_LIFT_PX`). 3D: `src/render3d/mount3d.js` (`createMount`, `createRider`, `createYard`), `renderer.dev.actor(id).mount`.

## The 20 to 30 band zones: Larchhill, the Larch Mine, Drovers' Reach (2026-11-22, band lane; D:/LQOnline/world3/BRIEF.md 2, 4, 5)

- **Zones.** `OUTDOOR.larchhill` (20 to 25) and `OUTDOOR.drovers_reach` (25 to 30), 1088 x 704 each, generated from
  `tools/maps/zone_larchhill.mjs` / `zone_drovers_reach.mjs` (big-zone kit plus `tools/maps/band_kit.mjs`: the hub town,
  rivers with fords, scatter, camp dressing). Larchhill joins the world at the Downs' old Larchhill gate (downs 19..21, 95,
  now open; the `x1_larchhill` hook is gone) and Drovers' Reach at Drovers' Gap (Larchhill's west edge). **An outdoor
  zone may join another outdoor zone**: `build_world.mjs` checks every pass both ways and that every outdoor zone has a
  chain of joins from the world.
- **A door in an outdoor zone.** A `DUNGEONS` entry may carry `door.zone` (default the world): `withDoors(zone, ...)` adds
  only the doors whose `door.zone` is that zone's id (index.js applies it to Larchhill), the place's exit join goes back
  to `door.zone` (`zone_larch_mine.mjs`), and `DG.loadSpec` loads a save made inside it at the door in that zone. The
  Larch Mine (cave, 21 to 23, `src/data/band_dungeons.js`, merged into `DUNGEONS`).
- **Content.** `src/data/band_content.js applyBand(content)` (called at the end of buildContent): the band's foes
  (`src/data/band20.js`, registered onto `MOBS`, abilities onto `MOB_ABILITIES`; families beast, insect, humanoid, spirit),
  people, items, 43 side quests (`src/data/larchhill.js`, `drovers_reach.js`), four rares (`content.rares`), and two
  night events (`content.worldEvents` entries with `zone`; their night spawns in that zone). `band20.js BAND_LOOT` is the
  band's loot tier table (reward and vendor item levels); `bandXpToNext` mirrors BUILDS_2 5.2 past 20 for quest XP.
  Inns and flight points: `src/data/band_travel.js`, spread into `src/data/travel.js`.
- **The Moor band (quests20, 2026-11-23).** `src/data/moor_band.js`: `placeMoorBand(WORLD)` (once, in index.js) adds its
  people to `WORLD.npcs`, quest nodes to `WORLD.nodes` and unbannered explore areas to `WORLD.areas` (moor tiles through
  `toWorld`); `applyMoorBand(content, worldQuests)` (last in buildContent) adds 25 side quests (levels 13 to 20, after the
  chain and the bounties), their people and quest items, and quest-drop rows on existing moor foes' loot tables (`quest`
  set, so they drop only while needed). Story-chain tags (`story: { id, name, step, of, end }`) are carried on the quests
  themselves, not in `STORY_CHAINS`; `end` fires the same `story` card.

## Professions step 2 and Inscriptions (2026-11-22, wave 3 lane prof2)

- Data: `src/data/professions2.js` (Skinning, Leatherwork, Tailoring, Inscription, Fishing; the 90 to 150 recipes;
  cloth, hide and fish tables; the Willowmere trainers Hesper, Maudie, Old Fen, Corwen; boss Patterns of all five
  places), merged by `src/data/professions.js`. `content.professions` gains `skin`, `cloth`, `meatFallback`, `fish`.
- Commands: `prof_fish {}` (cast at water within 5 tiles); `prof_craft { recipe, qty, letter }` (a recipe with
  `letters` makes `glyph_<letter>` to order); `interact` on a dead mob whose snapshot has `skin: { skill }` skins it.
  `state.prof.skinned` lists skinned corpses. Work kind `fish` (workView `at` = the water tile). New fail reasons:
  `not_skinnable`, `no_water`, `got_away`, `combat`, `bad_letter`.
- Inscriptions (BUILDS_2 6.4): `src/data/glyphs.js` (`content.glyphs`), `src/sim/glyphs.js`. A weapon or armor bag
  slot gets `inst.margins` the first time it enters a bag (from a hash of item and uid, no rng); `inst.glyphs` holds
  the letters in margin order. Commands `glyph_socket { uid | equip, index, letter }` and `glyph_remove { uid | equip,
  index, npc }` (a smith, for gold). Events `glyph`, `glyph_fail` (private). HUD item views carry `glyph`
  ({ margins, glyphs, word, wordText, letterText, draft }). stats.js reads worn letters and words into `e.glyphPw`
  (power records: mods, procs, `immune`, `moveCharges`); combat adds the `absorb` proc trigger and the
  `interruptLock` mod; data.js `ability()` adds `e.moveCharges` to a movement skill's charges.

## Wave 3 start realms, lane realms1: Emberpeak and Valewyn (2026-11-22; WORLD_2.md 1.1 and 1.2)

- **Zones.** `emberpeak` and `valewyn` (576 x 384, `OUTDOOR` in `src/data/maps/index.js`), generated from
  `tools/maps/zone_emberpeak.mjs` / `zone_valewyn.mjs` with the big-zone kit. No walking pass: they are reached by a ride
  or a kite (`build_world.mjs RIDE_REALMS` skips the pass check for them). Data: `src/data/emberpeak.js`,
  `src/data/valewyn.js`, gathered by `src/data/start_realms2.js` (`applyRealms2(out)` at the end of buildContent;
  `REALMS2_START` spread into `START_REALMS`; `REALMS2_TRAVEL` spread into `src/data/travel.js`).
- **Start choice.** `START_REALMS.warden` = Emberpeak, `START_REALMS.mender` = Valewyn (`welcome`: the line ui.js says).
- **Rides.** `content.travel.rides[id] = { id, npc, vehicle: 'cart' | 'ferry', label, name, zone, land, legs, tiles, speed,
  ticks }` (`RIDE` speedMult 1.5, lift 3 s). An npc with `ride: <id>` offers it: the `interact` event carries
  `ride { id, label, name, vehicle, secs }`; command `ride { npc }` -> `ride_start { ride, name, ticks, vehicle }` or
  `ride_fail` (reason `not_ride`, `range`, `flying`, `combat`). It moves like a flight (`e.flight` with `ride`, the
  `lr_flight` aura, a `zone` event per leg, `flight_end` at `land`), free, any level; the snapshot's `flight.ride` is
  the vehicle and `flight.up` stays 0 (no kite). A hero on a ride saves at its landing (main.js).
- **Signatures** (`src/sim/realm_mech.js`, deterministic on `state.tick`; `lavaAt` / `tideAt` are pure, kept in step with a copy in `src/data/realm_cycles.js` for
  the renderers). Zone fields: `lava { ch, cycle, hot, burnPct, crossings }` (a hero on a glowing crossing cell takes
  `damage { ability: 'realm_lava' }`), `gate { quest, area, waves, pause, giveUp }` (the camps in `waves` stay hidden,
  `realmParked`, until a hero with the quest steps into `area`; `state.realm[zone].gate` keeps the phase),
  `tide { ch, period, slow }` (aura `realm_wading` on the flats at high water; mobs with `realmGate: 'tide'` rise at
  level 0.6 and sink below 0.4; zone nodes with `tide: 'high' | 'low'` open only then). Messages are `quest_hook`.
- **Looks.** Zone fields `grade` (2D tint), `palette` (3D ground colours by terrain id), `style: 'forge'` (3D: the ink
  water is lava), `realmProps [{ t, x, y }]` (code-built props, `src/render3d/realm3d.js`); `src/render/realm2d.js` paints
  the lava, the crossings, the tide and the ride vehicles in 2D.

## Wave 3 realms2: Saffron Haven and the Nameless Hollow (2026-11-22; WORLD_2.md 1.4 and 1.5)

- **Zones.** `OUTDOOR.saffron` and `OUTDOOR.hollow` (576 x 384 each, `src/data/realms2.js R2_OUTDOOR`, generated from
  `tools/maps/zone_saffron.mjs` / `zone_hollow.mjs`; the list is `tools/maps/zone_realms2.mjs`). Each leaves by a **one-way
  join** onto the world: a join with `ride: '<line>'` needs no world join back (build_world.mjs allows it), the way home is
  the Lantern Kite (`saffron_haven`, `blank_sign` flight points, routes from `willowmere`) or the Lantern Stone. The `zone`
  event carries `ride` (the line) and the loading card shows it as its flavour. Zone fields: `chimes: [[x, y]]` (Saffron's
  storm shelter), `fog: [{ id, route, r, speed }]` (the Hollow's drifting banks), `areas[].shelter`, `canopy: 'dunes' |
  'roofs'`, `style: 'saffron'` (domed houses), `atmos` (an outdoor dark mood, the CAVERN shape: `renderer3d.js`), `grade`.
- **content.realms2** (`R2_RULES`: `storm`, `watch`). Sim: `src/sim/realms2.js` (`C.realms2`: `tick()`, `sense(m, p, r)` called
  at the end of `ai.js aggroRadius`). Mob template flags: `stormRider` (sees further in a storm), `watch` (sees only in
  its lantern cone, the way it faces, or within `bumpTiles`; raises the alarm), `spotter` (squawks `squawkSec` after its
  fight starts and alarms the watch). A quest objective may carry `unseen: true`: the watch seeing the hero resets it.
  Events: `mob_emote { text, to }` (storm warnings, the alarm, the fog), `yell { id, text }` (the alarm). Pure helpers for
  renderers and tests: `src/data/realms2.js stormAt(tick)`, `fogBanksAt(tick)` (the sim mirrors them).
- **Start realms.** `START_REALMS.wayfinder` (Saffron Haven) and `START_REALMS.inkblade` (the Nameless Hollow) come from
  `R2_START_REALMS`; an entry may carry `welcome` (the first chat line, `src/ui/ui.js`).

## Cap 30: the 20 to 30 band, level 25 picks, the gear tier, the Barrow Deep Halls (2026-11-22, LIVE)

- **Cap.** `PROGRESSION.maxLevel` 30; `xpToNext` / `xpAtLevel` to 30 (BUILDS_2 5.2's rule: 226,920 XP at 30); the UI's
  placeholder table (`src/ui/gamedata.js`) matches. XP at the cap still turns into gold (1 per 50).
- **Level 25 pick.** `src/data/builds2_cap30.js` joins one more pick per class onto `SKILL_PICKS` (`PICK_LEVELS` [1, 3, 6,
  14, 25]; `RULES.buyBack[25]` 400 gold, a DRAFT price) and ten more points per named build (`PAST_20`), the suggested 25
  pick (`b.picks[25]`), two second-signature reorders (`SIG2_OF`) and two struggle answers (`ANSWERS_OF`).
- **Passive skills.** An ability with `passive: { mods, procs, modAbility }` (an object; a mob ability's `passive: true` is
  unchanged) works while known: `src/sim/data.js talentInfo` adds it like a talent rank (the talent key carries the known
  passives). `prog.learn` and `fillBar` never put it on the bar; `castAbility` refuses it for a player (`cast_fail` reason
  `passive`). `b2_pick` carries `passive: true` for one.
- **Second signature.** The pick rule was already there (levels 10, 20, 35); the talents window's signature slot now takes
  the open one at 20 (`b2_pick { level: 20 }`). `pickSlots(cls, level)`: from level 20 the 25 slot joins the strip and the
  level 1 slot leaves it (five slots, the approved geometry); `pickSlots(cls)` (no level) lists every slot for lookups.
  `talents2Layout(R, cls, { level })`.
- **Gear tier.** `src/data/gear_tier3.js`: `DROP_RULES.named` = [{ from, to, chance, items }] (`loot.js rollKill`: a foe of
  a band level rolls `chance` for one of the band's pieces after its gear roll; no roll outside a band, so drops below 21
  are unchanged); `DROP_RULES.affixTierTop` [3, 6, 9, 12, 20, 23, 26, 30] (`rollAffixes`: tiers 6 to 8 above ilvl 20; an
  affix's values list has 8 tiers; `items.js affixTier`). Two legendary powers, `kings_due` and `drovers_horn`.
- **Level-gated doors.** A dungeon's `door.minLevel` goes on its world join and `doors` entry (`src/data/maps/doors.js`);
  `world.js checkJoin` leaves a lower hero on the tile and emits `door_locked { id, door, need }` (at most once every 5 s;
  `e.doorSaidAt`). `src/ui/travelui.js` words it.
- **The Barrow Deep Halls.** `DUNGEONS.barrow_deep` (levels 26 to 30, door at the cairn in the Standing Stones on the Downs,
  `minLevel` 26), map `tools/maps/zone_barrow_deep.mjs` -> `src/data/maps/barrow_deep.js`, foes and the `mob_drove_stampede`
  ability in `src/data/deep_halls.js` (registered into MOBS on import, like the Rootbound's; `src/data/maps/index.js`
  imports it and merges `DH_MOB_ABILITIES`), quests `dg_deep_drove_roads` and `dg_deep_kings_count` (side quests, giver
  Tamsin). Gated by `qa/sim/dungeon_bot.mjs` at 28 and 30.
- **Questbot.** `qa/bot/lib/bot.mjs` plays Builds 2 (`b2_leaning`, `b2_pick`, `b2_suggest`, the class bots of
  `qa/sim/builds2.mjs`), takes the sim's quest order (chain, bounties, side quests; dungeon quests only with
  `opts.dungeons`), hunts a kill objective in its region, and `qa/bot/lib/nav.mjs` never steps on a dungeon door it is not
  going to and routes a copy (`place#key`) as its place.

## The creature kit: every foe's 3D body (2026-11-23, LIVE; Scott approved the stills: "Ok to go ahead")

- **Kit.** `src/render3d/creature_kit.js` `buildCreature(THREE, recipe)` -> `{ o, height, update(dt, st), mats, lights,
  release() }`, the same body contract as `createCreature` (st: `{ t, moving, speed, attackT, hurtT, deadT, cast }`).
  Bodies: quadruped, insect, biped (rock golems), humanoid (people and ghosts), serpent, flyer (birds; insects with
  `proportions.insect`), blob, lantern, book, vortex. `rig()` merges every mesh into one rigidly skinned mesh per material
  whose bones are the pivots the animation moves; merged geometry is cached by recipe id (`geometry.userData.shared`,
  freed least recently used past 40 recipes once no foe of it is out, via `release()` in `actors.js detach`), canvas
  textures by content (256 px body, 128 px limbs). Hurt is a short warm rim, not a tint.
- **Recipes.** `src/render3d/creature_recipes.js` `RECIPES[templateId]` for every mob template (110), `ZONES` for the
  lineup stills. `createCreature(L, template, sprite, { elite, rank, kit = true })` builds from the recipe when one
  exists (its `size` already says rare or elite: no extra scale), else the old `familyOf` path (kept, with the GLB
  loader). `qa/tests/creature_kit.test.mjs` checks every template has a recipe and every recipe builds headless.
- **Stills.** `python tools/art/creature_kit/stills.py --zones all` -> `qa/out/creature_kit/zone_<zone>.png` (every foe
  of a zone at in-game size); `--solo <id>` close-ups.
- **Humanoid foes** (2026-11-23, second pass): every `body: 'humanoid'` recipe is built by `src/render3d/foe_human.js`
  `buildHumanFoe(L, THREE, recipe)` on the heroes' rigged human (`hero.js assemble`, shared glTF via SkeletonUtils.clone,
  `recipe.human` = base, outfit, hair, `cracks` glow; dyes from the palette) with the kit's dress
  (`buildCreature(THREE, { ...recipe, piecesOnly: true })` -> pieces hung on `Head`, `hand_*`, `lowerarm_*`,
  `upperarm_*`, `pelvis`, `spine_03`, all one skinned mesh per material) and the library clips (idle, walk, jog, attack,
  hit, death). Ghosts: see-through body, legs hidden under the kit hem, a depth-only pass first. Body `family: 'human'`
  (actors.js detach keeps its shared glTF geometry). If its files fail, createCreature falls back to the kit body.

## Audio quick wins (2026-11-24, wave 5 lane audio1; D:/LQOnline/wave5/lookdev/PLAN.md item 1)

Only the 41 files already in `assets/audio` (no new sounds). The engine (`src/audio/engine.js`) is unchanged.
- **`audio.frame(nowMs, { me, snap, place, zone, fresh })`**, once per drawn frame from `main.js render()` (it replaces
  the old `audio.zone(musicArea, ...)` call there; `fresh: true` after a hero enters). It picks the field track when the
  zone or the world region changes (`beds.js placeKey`; the roads keep the music you came with; a dungeon now plays its
  own zone track instead of keeping the outdoor one), the ambience bed every frame (`bedFor`), the battle track
  (`combat_music.js`) and the heroes' positions for friends' sounds. Without a hero, `audio.frame(nowMs, { snap })`.
- **Music** (`src/audio/beds.js`): `REALM_MUSIC` gives each start realm its own track (Rootbound willowmere, Valewyn
  valley, Saffron Haven the_downs, Emberpeak high_moor, the Hollow title: a DRAFT for Scott, one line each); every other
  zone keeps its data `music`. **Battle** (`combat_music.js createCombatMusic`): the battle track pushes over the field
  track (`engine.pushMusic`, 1.5 s crossfade) when the hero is in combat for 2.5 s with 3 or more hits dealt or taken in
  6 s, or at once on a `boss` pull in the hero's zone; it holds 5 s after combat ends, plays at least 12 s, then pops
  back (2.5 s) to where the field track was. `audio.music('title')` (quit) resets it.
- **Ambience** (`beds.js bedFor`): every world region, the roads (`wind_valley` 0.55), every realm and band zone, and
  dungeons (`moor_wind` 0.3) and caves (`wind_valley` 0.28) quieter and darker; at night a `river_birds` bed becomes a soft
  wind. Beds play on the ambience bus (the SFX slider).
- **Events** (`sfx_table.js soundsFor(ev, ctx)`): ctx may add `zone`, `isPlayer(id)` and `clsOf(id)`. Rez, level, trade,
  ready check, quest share, join and leave, flight, rides, mounts (the `mount_*` aura), hearth, lanterns, bosses
  (pull, phase, death), dungeon clear, chests, legendaries, secrets, glyphs, professions, windups at you, interrupts,
  chimes, world events and every `*_fail` now sound (69 of the 98 event types make a sound, plus `combat` and `zone`
  heard as music; `qa/lookdev/audio_inventory.mjs` counts them). A friend's (another hero's) hits, heals, spells, shots,
  level up, rez, death and mount come back marked `from: id`; audio.js plays them at `FRIEND.volume` (0.5) times
  `friendGain(dx, dy, sameZone)` (1 within 96 px, a squared falloff to 0 at 640 px, 0 in another zone) and pans them
  (`friendPan`). A sound may carry `gap` (ms) for its throttle `key`.
- **Menu sounds** (`src/audio/ui_sounds.js createUiSounds(play)`): `ui.js` calls `uiSnd.frame(st)` at the top of
  `draw()` and `uiSnd.press(label)` when a region's `on` runs; the observer plays one sound a frame: open / close (a
  window, dialog, chest or confirm box), open on a title-screen change, error (a create error or a "You can't..." toast),
  tab (a pressed label with `tab`), click (any other button). `createUI` hooks gain `sound(kind)` (main.js: `audio.ui`).
  `UI_SOUNDS` gains `tab` and `click`, `UI_VOLUME` their levels.
- Never throws: autoplay blocked (the engine queues music and beds until the first gesture, drops sfx), zero volumes,
  no WebAudio in node (every call a no-op).

## Look-dev harness and frame budget (2026-11-24, wave 5 lane audio1; PLAN item 14)

`qa/lookdev/` (copied from D:/lr_lookdev/harness): `lookdev.py` (the 18 fixed views, now with a `perf` sample per view
and `--profile phone`), `serve.py` (read-only, `/game/` = this checkout), `check_budget.py` + `budget.json` (made by `make_budget.py` from a baseline run; per view
minFps, minUncappedFps, maxCalls, maxTriangles), `audio_inventory.mjs`. REPORT ONLY, not part of `qa/run.mjs` (the PC is
shared and fps is noisy). How to run: `docs/LOOKDEV.md`. Draw calls come from `renderer.dev.info` (read only).

## The ground kit: ground, grass and town dressing (wave 5 Track B, 2026-11-24; Scott approved the stills: "Yes")

- **Switch.** On at desktop quality only: `quality.ground` (renderer3d.js) is `!low && ?ground != off`. Low quality,
  phones (touch) and `?ground=off` keep today's ground exactly; dungeons and caves never use it. `kitOn(quality)`.
- **Plan (pure).** `src/render3d/ground_plan.js`: `groundMasks(zone, terr)` per tile (class, plaza, grass, flat weight)
  from the tile map the sim uses; `heightField` gentle visual-only mounds (at most 0.55 m), 0 on and near roads,
  squares, water, cliffs, every decor footprint, NPCs, lanterns, nodes, doors, joins, realm props and towns;
  `grassChunk` deterministic clumps and flower patches; `planSquare(zone, terr, tilesDb)` the dressing of the five
  start-realm squares (`START_TOWNS`). The sim, its collision and its flat 20 Hz world never change.
- **Height contract.** `setGroundY(fn)` / `groundY(x, z)`: renderer3d.js sets the shown zone's height (`z.groundY`);
  `actors.js` stands every body on it (flying stays FLY_H), the target ring and telegraphs sit on it. Flat (0) when off.
- **Kit (three).** `src/render3d/ground_kit.js` `createGroundKit(zone, { terr, quality, place, tilesDb })` -> null when
  off, else `{ geometry(), material(mat), cobbles, h, tree(), dress(B, lamp), attach(group), cull(x, z), dispose() }`;
  `tickGround(t)` the wind clock. zone3d.js calls it through guarded hook lines (`kit ? ... : today`).
- **Dressing rule.** A square prop stands only on open floor of the square, never within its radius of a point of
  interest, never within 1 of the shortest walk from the town lantern to any point or way out, never on or by a decor
  piece; with every prop treated as solid no walk gets longer (`qa/tests/ground_kit.test.mjs`). Props are visual only.

## UI skin "Lantern and Vellum" and Text size (wave 6 uiskin, 2026-11-24; Scott: "Go with all your recommendations")
- Window style: `options.skin` 'lantern' (default for everyone) | 'classic' (today's LQ frames, kept one wave). `src/ui/skin.js`
  `applySkin(g, art, id)` swaps `g.window` (classic stays at `g.windowClassic`) and sets `g.skin` (quest log, character
  sheet, item slot with quality by colour and shape). Other windows draw with the existing g.* calls and never restyle
  frames themselves. `?skin=lantern|classic` in the link overrides the option.
- Text size: `options.text` 'auto' (Large on a phone, Normal on PC) | 'normal' | 'large'; `?text=` overrides. gfx.js:
  `g.setTextSize`, `g.textScope(fn)` (Large applies only inside: windows, desktop npc window, desktop tracker and chat,
  cards, tooltips; a phone's play layer is already the big legible scale), `g.smallScope(fn)`, `g.lh` (11 | 16),
  `g.ls(n)` (n | n + 5), `g.mid(n)` (n | n + 2), `{ small: true }` / measure flag 'small'. At Normal every one gives
  back today's number.
- Long text scrolls instead of "...": `src/ui/textscroll.js` `scrollLines(...)`, offset in `st.textScroll[key]`, one
  region with `scroll` (wheel) and `scrollDrag` (finger), label `scroll:<key>`.
- Settings rows are `choice(label, key, vals, names)` lines placed by `placeChoices()` (menus.js drawOptions): they flow
  into the next free column, so a new row never meets the bottom buttons. Add new rows above `placeChoices()`.
## Appearance: the customization kit and the free mirror (wave 6, 2026-11-24)

- **`app`** (src/data/appearance.js): `{ v: 1, body, skin, eyes, hair, hairColor, beard, build, height, mark, markColor, dye, trim }`,
  each a small integer index into a table there. `clampApp(raw, fill)` makes anything safe; a missing field takes the hero's
  own look (`fromLook(cls, look)`), never 0. A hero with NO app is drawn from its `look` exactly as before (the 45-combination
  golden test, qa/tests/custom_kit.test.mjs). `look` stays: 2D sprites, portraits and the dye-0 "Original" colours use it.
- **Where it lives:** the char entry (`store.add({ ..., app })`, optional, SAVE_VERSION unchanged), `state.app` (world
  `saveFields`), addPlayer `spec.app` (clamped by src/sim/appearance.js with `content.appearance`, since the sim imports only
  its own files), the snapshot (`o.app` on a player that has one) and the co-op hero blob (`hello.hero.app`). Friends draw
  each other from the snapshot, like `look`.
- **The mirror:** `content.mirrors` (src/data/appearance.js MIRRORS, region tiles); an object entity `{ mirror: { id, place },
  sprite: 'mirror' }`, spawned last in spawnContent. `interact` on it (in reach, alive, out of combat) emits
  `mirror_open { src, id, mirror }` and sets the hero's `mirrorAt`; then `set_app` sets `e.app` and emits `app_set { id, mirror }`.
- **Render:** gear.js `heroSpec(cls, look, equip, items, app)`; with an app the spec has `app`, `codeHair`, `skinTint: null`,
  `scale` (height) and its own `sig`. render3d/custom_kit.js `finishApp(L, ch, spec)` runs after `dress()` (skin tone and
  markings, iris, cloth and leather dye bands, code-built hair merged to ONE mesh on the Head bone, bone-thickness build).
- **The creation screen** (src/ui/create_screen.js, replaces title.js drawCreate, which is no longer called) asks for a stage:
  `ui.stage` -> `view.stage = { mode, rect (HUD layer px), cls, look, app, equip, yaw, bg (layer-sized backdrop canvas), phone }`.
  renderer3d.js then draws ONLY render3d/turntable.js into that rect (the UI clears the rect on its layer). The 2D renderer
  ignores `view.stage`; the screen shows today's sprite there. Hooks: `hooks.has3d()`, `hooks.startGear(cls)`.

## Town life: townsfolk, critters and passing showers (wave 7 life2, 2026-11-24; PLAN item 12, no Vis)

- **Cosmetic, render side, 3D only.** `src/render3d/townlife_plan.js` (pure, node-tested) plans each town area
  (`regions[].kind 'town'` of an outdoor zone) from the tile map the sim uses; `src/render3d/townlife3d.js`
  `createTownLife(THREE, scene, { quality, tilesDb, q })` draws it as TWO instanced meshes (people, critters; plus one
  shadow-pass call for the people on desktop). renderer3d.js calls `townLife.frame({ zone, kit, snap, f, rain, now, focus })`
  once a frame after `actors.sync` (`dev.life`: towns, folk, out, inside, doors, critters, ms). Townsfolk and critters are
  NOT sim entities: no collision, picking, network, save or sound. The sim, co-op and every quest NPC are unchanged.
- **Walk rule.** People walk and stand only on open floor ('.'), never within 1 tile of a quest NPC (standing groups 2+),
  a lantern, a node, sign or hook, a realm prop, a decor footprint, or the ground kit's square dressing (`kit.plan`).
  They step aside from heroes and NPCs at 0.9 m. A person's loop (`loopPose(F, t)`) is a pure function of the render
  clock: a pinned clock gives the same still every run.
- **Routines.** `wantOut(F, f, rain)`: up from about 05:40 to 07:40, in from 18:30 (a quarter are night owls to 23:15);
  two watchmen with lanterns walk the lamps at night; two people talk at the inn door of an evening. In rain (>0.3) about
  four in five walk home and go in at their own door; the rest put hoods up. Critters (`critterOut`): pigeons and hens by
  day, cats day and night, all shelter from rain; a hero walking into the pigeons sends them to the next spot.
- **Showers.** `showerAt(tick, zone)` 0..1 from the sim tick (every client agrees): up to two showers of 3 to 5 min a 40
  minute day, none on a world's first day, none in Saffron Haven, the Rootbound (cavern) or the Hollow (fog). Used only
  when `view.weather` is unset; `?showers=0` turns them off; the 2D renderer is unchanged.
- **Switch.** `lifeCaps(quality, q)`: desktop 34 people and 16 critters a town (13 placed), Low quality and phones 12 and 6
  with no shadow pass, `?life=low` the same, `?life=off` none. Tests: `qa/tests/townlife.test.mjs`.
## The water kit: rivers, the falls, the pool (wave 7, 2026-11-24; Scott: "Yes for your recommendations")

- **Switch.** `quality.water` (renderer3d.js) from `waterTier({ q3d, water, touchLow })` in src/render3d/water_kit.js:
  'full' on desktop, 'lite' on phones (no mist, no rocks, 80 spray drops), 'off' at `?q3d=low` or `?water=off` (today's
  water exactly). `?water=full|lite` forces a tier. Ink, lava (zone.style 'forge'), caverns and dungeons keep today's water.
- **Plan (built once per zone).** `poolCells`, `waterPlan(terr, W, H, zone, pool)` -> `{ tex, falls, stats }`: one RGBA
  texel per tile (RG flow direction, B speed, A depth), from the tile map the sim uses; the falls come from the zone's
  `secrets` of kind 'waterfall'. zone3d.js hooks: `waterMaterial(..., kit)` patches the surface, `buildFalls` replaces
  the old curtain when the kit is on. renderer3d.js feeds the sky colours each frame (`waterSky`) and the spray scale on
  resize (`setSprayScale`). Render only: the sim and collision never see it.
- **The falls pool is map water.** The valley falls pool is shallow tiles in tools/maps/zone_valley.mjs (`FALLS_POOL`,
  rows 6 to 8 under the falls): walkable, so the way through the falls to the Keeper Cache stays open
  (qa/tests/water.test.mjs walks it in the sim and opens the cache).
- **Sound.** Bank loop `'loop:falls'` (src/audio/synth/falls_sfx.js); `src/audio/water_sound.js` `fallsFeet(zone)`,
  `fallsMix(me, feet)` (14 tiles, panned) drive it from synth_game.js `nearby()` beside the brook loop. Synth sound Off
  stops it with the rest of the synth.

## Drop-in with one link and watching (wave 8 dropin, 2026-11-24; PLAN section 6; docs/NET.md "Invite links")

- **Link.** `inviteLink(location, code)` in src/net/dropin.js: the page address, plus `net` / `stun` / `dev` only when the
  host's page has them (tests), then `#join=<ROOM CODE>`. Nothing else ever goes in it (no name, hero, save or device
  detail). `readInvite(location)` reads it; coop.js opens the join screen once `setBuild` has run (and on `hashchange`
  from the title or hero list), and `clearInvite()` drops the `#join` from the address bar.
- **Watcher protocol** (src/net/session.js): `hello { watch: 1 }` (no hero) -> `welcome { watch: 1, id: null, follow }`;
  later `play { hero }` -> `welcome { id }` (a second welcome; the guest clears its frame state) or `nope { reason }`
  (full | bad_hero; still watching). A watcher may chat (as `WATCHER_NAME`) and say bye; its other messages are ignored.
  At most `MAX_WATCHERS` (4); watchers are not players (`count`), `watching` counts them.
- **Watcher frames.** `framesFor(null, { follow: hostId })` (src/net/frames.js): the view centres on the host, every hero
  is trimmed (the host too), no HUD block, public events only. `publicFilter(null, vis)` matches no hero's own events.
- **UI.** `ui.mode === 'watch'`: the world draws, the canvas UI draws nothing (the co-op bar is HTML). main.js render
  follows `coop.watchId` while there is no hero. Options has "Invite a friend" in its title bar (`act.invite`,
  `act.canInvite`; hooks `invite`, `canInvite`), hidden for a hero in a friend's game.
