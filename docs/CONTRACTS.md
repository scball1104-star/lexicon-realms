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
| `move` | `dx, dy` each -1, 0 or 1 | sets the held direction; the actor keeps walking until `stop` or a new `move` | none (position shows in the snapshot) |
| `stop` | | clears the held direction | none |
| `target` | `id` (entity id or `null`) | sets or clears the target. Must be in the same zone and not self | `target`, or `cmd_reject` reason `bad_target` |
| `cast` | `ability` (id) **or** `slot` (1..12), `target` (id or null, default = current target), `at` ({x, y} px, ground-targeted only) | starts an ability. `slot` resolves through the caster's `bar` array (section 3) | `cast_start`, `cast_stop`, `cast_fail`, later `damage`, `heal`, `aura_add` ... |
| `interact` | `id` | talk to an NPC, loot a corpse, use a node. Range 40 px | `interact`, or `interact_fail` reason `range` |
| `cancel` | | **SPEC.** cancel the current cast or channel | `cast_stop` reason `cancel` |
| `cancel_aura` | `aura` | **SPEC.** drop a helpful aura on self (stealth, a stance) | `aura_remove` reason `cancel` |
| `quest_accept` / `quest_turnin` | `quest`, `choice` (reward index) | **SPEC.** must be in range of the giver / turn-in NPC | `quest` |
| `buy` / `sell` / `equip` / `unequip` / `use_item` / `learn_talent` / `respec` | see section 7 | **SPEC** | `inventory`, `talent` |

A `cast` today is a **stub**: it checks the global cooldown, sets it, and emits `cast_start` then `cast_stop` with
reason `stub`. The combat wave replaces the stub with section 5.

Unknown or malformed commands never throw: they emit `cmd_reject` with `reason` (`no_actor`, `bad_command`,
`unknown_command`, `bad_target`, `dead`, `not_interactable`).

### 2.3 Replay log

`main.js` keeps `[tick, entityId, cmd]` for the session (`window.__realms.commandLog`). Seed + `addPlayer` calls +
this log reproduce the session exactly (`qa/tests/sim.test.mjs` proves it over 2,000 ticks).

---

## 3. Entity schema

Internal state is the same object minus a few internal fields; positions inside the sim are integer SUB units
(1/16 px). The snapshot (section 4) reports pixels.

```js
{
  id: 11,                       // stable integer, never reused in a world
  kind: 'player' | 'mob' | 'npc' | 'object',      // object: traps, nodes, corpses (SPEC)
  zone: 'willowmere',
  x: 328, y: 399,               // feet point, px (snapshot). Feet box: 10 px wide, 6 px deep above the feet
  dir: 'down' | 'left' | 'right' | 'up',          // 4-way facing (sprites); `facing` angle may be added for 3D
  moving: false,
  name: 'Scott', level: 1,
  faction: 'player' | 'hostile' | 'neutral' | 'friendly',
  sprite: 'hero',               // render key (section 9)
  template: 'briar_wolf',       // content id this entity came from (mob, npc), null for players
  hp: 100, hpMax: 100,
  res: { kind: 'mana', cur: 100, max: 100 } | null,   // kind: any class resource id (section 7.1)
  combo: { target: 23, n: 2 } | null,                 // SPEC: Inkblade-style points on a target
  stats: { str, agi, int, spi, sta, armor },          // base + gear + talents, recomputed on change (SPEC)
  derived: { ap, sp, crit, haste, hit, dodge, parry, block, speed },   // SPEC
  target: 23 | null,
  cast: { ability, target, at, startTick, endTick, kind: 'cast' | 'channel', nextTick } | null,
  auras: [{ id, src, stacks, startTick, until, nextTick, absorb, data }],   // until = tick it ends (Infinity -> null)
  cd: { warden_shield_slam: 312 },                    // ability id -> tick it is ready again
  gcdUntil: 0,                                        // tick the global cooldown ends
  dead: false,
  // players only
  cls: 'warden', look: 0, xp: 0,
  bar: ['warden_strike', ...],                        // SPEC: action bar, slot 1 = bar[0]
  talents: { warden_bulwark_1: 2 },                   // SPEC: talent id -> ranks
  bag: [{ item, qty }], equip: { main, off, head, chest, legs, feet, hands, trinket },   // SPEC
  gold: 0, quests: { quest_id: { state, counts: [..] } }, lantern: { zone, x, y },     // SPEC
  // mobs only (internal, not in the snapshot)
  spawn: { zone, x, y }, ai: { mode, ... }, threat: { [entityId]: amount },
}
```

LIVE today: everything except the fields marked SPEC.

---

## 4. Snapshot schema (LIVE)

`world.snapshot()` returns plain JSON (round trip tested):

```js
{ v: 1, tick: 1234, entities: [ /* section 3 public fields, in id order */ ] }
```

- Leaves out internal state: `ai`, `spawn`, `threat`, held move direction.
- Players also carry `cls`, `look`, `xp`.
- Phase 2 (net): the host sends the command stream plus a snapshot every N ticks and on join; clients interpolate
  between snapshots exactly as the local renderer does. A late joiner can instead take `world.serialize()` (full
  state) and run the same commands (`restoreWorld(json, content)`, tested).
- `world.hash()` (16 hex chars over the full state) is the desync check.

---

## 5. Abilities and effects (SPEC, the combat wave builds this)

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

Crowd control light (DESIGN section 2) = `flags` `stun`, `root`, `slow` (with a `speed` mod). Diminishing returns:
the same CC family on the same target within 15 s lasts 1, 1/2, 1/4, then immune (SPEC, sim-side).

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

### 5.7 Combat rules the sim owns (SPEC)

- Global cooldown 1.0 s (20 ticks), started at cast start. `gcd: false` skips it.
- Auto-attack: a per-entity swing timer from the weapon's `speed`; starts when the player targets a hostile in
  range and presses an attack ability or right-clicks it; stops on `target null` or a non-hostile target.
- Hit table (one roll): miss, dodge, parry (melee, front only), block (shield, front only), crit, hit.
- Threat: damage x 1 (x `threatMult`), healing x 0.5 split across mobs in combat with the healer.
- Mob AI modes: `idle` / `walk` (LIVE wander), then `aggro` (radius by level gap), `chase`, `attack`, `leash` (back
  to spawn at 40 tiles or 10 s out of reach, full heal, threat cleared), `flee` (some mobs, below 20 % HP).
- Death (DESIGN): a dead player wakes at `lantern` (last one touched) after a short fade; nothing lost.

---

## 6. Zone (map) data (LIVE for terrain, joins, collision; SPEC for the rest)

One module per zone in `src/data/maps/<id>.js`, registered in `src/data/maps/index.js` (`ZONES`). The two phase-1
maps are **generated** from Lexicon Quest by `tools/dev/import_lq_maps.mjs`; do not hand-edit them (re-run the tool).
A hand-made zone may be written directly in the same shape.

```js
export default {
  id: 'valley', name: 'Willowmere Valley', kind: 'town' | 'field' | 'interior',
  w: 60, h: 40,                         // tiles
  music: 'valley', lighting: { tint: 'none', dark: 0 },
  // render-only (LQ tile format, docs in assets/tiles/README of Lexicon Quest)
  under: 'grass', legend: { '.': 'grass', ... }, ground: ['....', ...],
  overlays: [{ t, x, y }], decor: [{ t, x, y, state? }], overhead: [{ t, x, y }],
  // sim
  collision: ['....##~~', ...],         // one char per tile: '.' walk, '#' solid, '~' water, 'v' '>' '<' one-way ledges (S, E, W)
  joins: [{ x, y, w, h, to: 'willowmere', tx, ty, dir }],   // stepping into the rect moves a player to (tx, ty) in `to`
  // SPEC (the zones wave adds these; the importer keeps LQ's own spots under `lq` as references)
  levels: [1, 6],
  areas: [{ id: 'old_mill', name: 'The Old Mill', x, y, w, h }],        // explore objectives + zone-name toasts
  lanterns: [{ id: 'square', x: 22, y: 18 }],                           // respawn points (touch to bind)
  spawns: [{ mob: 'briar_wolf', x, y, wander: 3, respawn: 60, group: 'den_a' }],
  npcs: [{ npc: 'mael', x, y, dir }],
  nodes: [{ id: 'reeds_1', item: 'river_reed', x, y, respawn: 90 }],    // collect objectives
  lq: { npcs, enemies, marks, start },  // imported reference spots from Lexicon Quest
};
```

Joins are data: a join whose `to` zone is not in `ZONES` is just the map edge. A new zone drops in by adding its
module to `ZONES` and a join on each side. `qa/tests/architecture.test.mjs` checks that every join lands on a
walkable tile and not inside the other side's join. The current joins: Willowmere south gate (20..21, 31) to the
valley (1, 33); the valley west edge (0, 33..34) to Willowmere (20, 30); the valley east edge (59, 16..17) points at
`east_road`, not loaded (Lexicon Quest's Episode 2 road), so it is an edge today.

---

## 7. Data modules (SPEC, the design and content waves fill these)

All are plain ES modules exporting one frozen-able object keyed by id. The sim receives them through
`createWorld({ seed, content })`:

```js
content = { zones, zoneNames, classes, abilities, talents, mobs, items, quests, npcs, spawns, start }
```

`src/data/maps/index.js` `buildContent()` builds it today with PLACEHOLDER mobs, NPCs and spawns; when the files
below exist, `buildContent()` imports them and the placeholders are deleted.

### 7.1 `src/data/classes.js`

```js
export const CLASSES = {
  warden: {
    id: 'warden', name: 'Warden', role: 'tank', armor: 'heavy', weapons: ['sword', 'shield'],
    resource: { kind: 'resolve', max: 100, start: 0, regen: 0, decayOoc: 2, onHitDealt: 3, onHitTaken: 4 },
    base: { hp: 120, str: 12, agi: 8, int: 4, spi: 5, sta: 12 },  perLevel: { hp: 14, str: 2, agi: 1, int: 0, spi: 1, sta: 2 },
    hpPerSta: 10, apPerStr: 2, critPerAgi: 0.0005,
    abilities: [{ id: 'warden_strike', level: 1 }, { id: 'warden_taunt', level: 2 }, ...],   // 6 by level 15
    startBar: ['warden_strike'], talentTree: 'warden', looks: [{ id: 0, sprite: 'warden_a' }, ...],
    startGear: { main: 'rusty_sword', off: 'plank_shield' },
  },
};
```

### 7.2 `src/data/talents.js`

```js
export const TALENTS = {
  warden: {
    branches: [{ id: 'bulwark', name: 'Bulwark' }, { id: 'edge', name: 'Edge' }, { id: 'banner', name: 'Banner' }],
    talents: {
      warden_bulwark_1: {
        id, branch: 'bulwark', tier: 1,        // tier n unlocks at (n - 1) * 3 points spent in this branch
        maxRanks: 3, requires: null | { talent: 'warden_bulwark_2', ranks: 3 },
        name, icon, text: 'Reduces damage taken by {r*2}%.',
        perRank: { mods: [{ stat: 'damageTaken', mul: 0.98 }] },           // multiplied per rank
        // or grants: { ability: 'warden_shield_wall' } | { modAbility: { id, field: 'cooldown', add: -1 } } | { procs: [...] }
      },
    },
  },
};
```

Points: 1 per level from level 5 (11 at 15). Respec at a trainer for gold (`respec` command, cost table in classes).

### 7.3 `src/data/mobs.js`

```js
export const MOBS = {
  briar_wolf: {
    id, name: 'Briar Wolf', level: [2, 3], sprite: 'briar_wolf', faction: 'hostile', family: 'beast',
    hp: 60, armor: 20, damage: [3, 5], attackSpeed: 2.0, school: 'physical',
    aggroRadius: 96, leash: 640, speed: 72, wander: 3,   // px, px, px/s, tiles
    flee: 0.2 | null, elite: false, abilities: [{ id: 'wolf_lunge', chance: 0.2, cooldown: 8 }],
    xp: null,                        // null = the level formula
    loot: { gold: [1, 4], table: [{ item: 'wolf_pelt', chance: 0.4, quest: 'pelts_for_tess' }, ...] },
  },
};
```

### 7.4 `src/data/items.js`

```js
export const ITEMS = {
  rusty_sword: {
    id, name, icon, rarity: 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary',  // colors: LQ font.js NAMED_COLORS
    kind: 'weapon' | 'armor' | 'consumable' | 'quest' | 'junk' | 'bag',
    slot: 'main' | 'off' | 'two' | 'ranged' | 'head' | 'chest' | 'legs' | 'feet' | 'hands' | 'trinket' | null,
    weaponType: 'sword' | 'shield' | 'dagger' | 'bow' | 'staff' | 'wand' | null,
    damage: [3, 6], speed: 2.4, armor: 0, stats: { str: 1 }, level: 1, classes: null | ['warden'],
    use: null | { ability: 'minor_heal_potion', cooldown: 60 }, stack: 1, value: 12, bagSlots: 0,
  },
};
```

### 7.5 `src/data/quests.js`

```js
export const QUESTS = {
  pelts_for_tess: {
    id, name, level: 2, minLevel: 1, zone: 'valley',
    giver: 'tess', turnIn: 'tess',                 // npc ids
    requires: { quests: ['letter_for_mael'], cls: null, level: 1 },
    chain: { id: 'valley_wolves', step: 1 },
    objectives: [
      { kind: 'kill', mob: 'briar_wolf', count: 6 },
      { kind: 'collect', item: 'wolf_pelt', count: 4 },                         // drops or `nodes`
      { kind: 'deliver', item: 'sealed_letter', to: 'holt' },                   // item given on accept
      { kind: 'explore', zone: 'valley', area: 'old_mill' },
      { kind: 'escort', npc: 'penny', to: { zone: 'valley', x: 40, y: 18, r: 3 }, fail: 'death' },
      { kind: 'talk', npc: 'mael' },
    ],
    rewards: { xp: 420, gold: 12, items: [], choice: ['tess_gloves', 'tess_cloak'] },
    text: { offer: '...', progress: '...', complete: '...' },     // Lexicon Quest voice; no em dashes
    giveOnAccept: [{ item: 'sealed_letter', qty: 1 }],
  },
};
```

### 7.6 `src/data/npcs.js`

```js
export const NPCS = {
  mael: { id, name: 'Elder Mael', sprite: 'npc_elder', title: null, faction: 'friendly',
          roles: ['quest', 'trainer', 'vendor', 'innkeeper', 'flightless'], vendor: null | { items: [...] },
          trainer: null | { cls: 'warden' }, talk: 'mael_idle', lq: 'mael' },
};
```

Lexicon Quest heroes and townsfolk (Mira, Bram, Elder Mael, Tess, Holt ...) are NPCs here; their names, looks and
roles must match Lexicon Quest (`D:\LexiconQuest\next\src\data\npcs.js` and `docs/`).

---

## 8. Events (LIVE where marked, else SPEC)

`world.step()` returns the tick's events; every event has `tick` and `type`. `main.js` publishes them on the bus.

| type | Fields | Status |
|---|---|---|
| `join` | `id, name` | LIVE |
| `zone` | `id, from, to, x, y` (tiles) | LIVE |
| `target` | `src, id` (null = cleared), `reason?: 'lost'` | LIVE |
| `interact` / `interact_fail` | `src, id, npc` / `src, id, reason` | LIVE |
| `cmd_reject` | `id, cmd, reason` | LIVE |
| `cast_start` | `src, ability, target, castTicks` | LIVE (stub) |
| `cast_stop` | `src, ability, target, reason: 'done' \| 'interrupt' \| 'move' \| 'cancel' \| 'stub'` | LIVE (stub) |
| `cast_fail` | `src, ability, reason: 'gcd' \| 'cooldown' \| 'range' \| 'resource' \| 'los' \| 'requires' \| 'silenced' \| 'moving'` | LIVE (`gcd`) |
| `damage` | `src, dst, ability \| 'auto', school, amount, crit, result: 'hit' \| 'miss' \| 'dodge' \| 'parry' \| 'block' \| 'immune', absorbed, blocked, overkill, periodic` | SPEC |
| `heal` | `src, dst, ability, amount, overheal, crit, periodic` | SPEC |
| `death` | `id, killer` | SPEC |
| `xp` | `id, amount, source: 'kill' \| 'quest' \| 'explore'`; `level` event `id, level` on level-up | SPEC |
| `loot` | `id, from, gold, items: [{ item, qty }]` | SPEC |
| `quest` | `id (player), quest, kind: 'accept' \| 'progress' \| 'complete' \| 'turnin' \| 'abandon', objective, cur, need` | SPEC |
| `aura_add` / `aura_remove` | `dst, src, aura, stacks, until` / `dst, aura, reason: 'expire' \| 'dispel' \| 'break' \| 'death' \| 'cancel'` | SPEC |
| `threat` | `mob, top` (when the top of a mob's threat list changes) | SPEC |
| `spawn` / `despawn` | `id, template, zone` | SPEC |
| `lantern` | `id (player), zone, lantern` | SPEC |

---

## 9. Renderer interface (LIVE)

`src/render/renderer.js` is the only 2D-specific module. A 3D renderer replaces it by implementing the same object:

```js
const r = createRenderer(canvas, assets, { zones })
r.draw(prevSnap, snap, alpha, view)   // view: { zone, followId, zoom: 1 | 1.5 | 2, targetId, time (s) }
r.drawHud(fn)                         // fn(ctx, layout): HUD on a 640x360 layer composited at the base integer scale
r.pick(devX, devY) -> id | null       // entity under a canvas device-pixel point (click targeting)
r.worldToHud(wx, wy) -> [hx, hy]      // nameplates, floating combat text
r.layout                              // { base, ws, ox, oy, viewW, viewH, dispW, dispH }
```

- Internal view 640x360, letterboxed at the largest integer `base` scale. The world is drawn at integer `ws =
  round(base * zoom)` (at 1080p: 3, 5, 6 for zoom 1, 1.5, 2). Keys `+` / `-` change zoom.
- Interpolation: an entity in both snapshots and the same zone is drawn at `prev + (cur - prev) * alpha`, rounded
  to whole pixels. A zone change fades from black (0.35 s).
- Sprite keys: `hero` (LQ party_field, placeholder for player characters), `npc_*` (LQ npcs.json), any LQ field enemy
  id (enemies_field.json). The art wave adds `assets/sprites/chars/` atlases; register them in
  `src/render/sprites.js` `frameFor()` and keep the entity `sprite` field as the key.
- SPEC for the effects wave: lighting (LQ `src/world/lighting.js` port), particles (LQ `particles.js`), weather,
  day/night, spell visuals keyed by event (`cast_start.ability`, `damage.ability`) through a data table
  `src/render/fx_table.js`.

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

HUD layout target: the approved stills (`D:\LQOnline\mockups\out\still1_questing.png` and siblings). Note the stills
draw HUD text at a finer pixel size than the 640x360 world; the HUD agent should decide whether the HUD layer runs
at 2x (1280x720) and say so here.

---

## 11. Audio hooks (SPEC)

`src/audio/` subscribes to the bus (`src/core/bus.js`): `bus.on('damage', fn)`, `bus.on('*', fn)`. Events are
shared and read-only. Music follows the player's zone (`zone` event + zone `music` id). A data table
`src/audio/sfx_table.js` maps `event type + ability/school/result` to an sfx id; Lexicon Quest's Suno themes and SFX
are the source (`D:\LexiconQuest\next\assets\audio`). Audio never feeds anything back into the sim.

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
