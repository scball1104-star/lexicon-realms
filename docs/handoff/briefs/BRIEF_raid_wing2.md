# Brief: Endmarket wing 2, the Fair Streets (NOT BUILT)

Written 2026-11-26 (Eastern). Status: brief and stills only. Per the project rules, no game build starts until Scott
approves this brief and the 3 stills. Style: B (Quaternius realistic), existing CC0 kit and the code-built fair props
already in `src/render3d/fair3d.js`. No paid packs. Never commit raw QAL pack files. Systems and feel may borrow from
long-running online RPGs; no publisher names. Every name and line here is a DRAFT for Scott. Text is original. No em
dashes.

This is wing 2 of the Endmarket, the first raid (wave 10 draid). Wing 1, the Drove Gate, is live: the Turnpike and Old
Shep, Lot Tickets, the Fair Purse, a weekly lockout, and a door on Drovers' Reach. The raid frame (`src/sim/raid.js`,
`RAID_RULES`) stays. This brief only adds the next wing.

## 0. Decisions to lock (read this first)

- **Party size stays 4**, not 5. The live raid is labelled "Raid for 4, level 30". Mother Tally already says "Four go
  in, love. Two at the least." Party scaling caps at 4 heroes (`PARTY_RULES.scale.maxHeroes`), and raid bosses are tuned
  for that full party, not for the dungeon `bossScale` table. A fifth seat would mean retuning wing 1 as well. For a
  browser game played with friends, 4 is the right size. Loot still needs 2 or more in the copy (`minParty: 2`). A lone
  hero can walk the wing and learn the fights; they get gold and quest credit only.
- **Same lockout and tickets.** One loot chance per hero, per boss, per Eastern Monday week. Copies reset between
  sittings, as dungeons do. The Fair Streets adds its own Purse on its last boss, first time each week.
- **The unused fair props already name two of the beats.** `fair3d.js` has `dg_fair_scales` ("the Weighmaster's great
  scales") and `dg_fair_block` (an auction block with the Book of Lots and a bidding bell), but wing 1 never places
  them. Wing 2 uses the scales, the weights, and the benches. The full auction block and the Book of Lots stay for wing
  3, the Tollhall, so the last wing keeps its own reveal.
- **All names are drafts.** Same rule as wing 1.

## 1. Theme and setting

A hundred years ago the drove roads ended at the Endmarket, the great fair at the far end of the Old Drove. A buyer
came who paid for names instead of beasts, and the fair's auctioneer, the Lot-Caller, sold them. The fair fell into one
long dusk, and the roads forgot the way. Every list since is a bill of sale. That story is already in
`src/data/raid_endmarket.js`, in Old Bede's talk on the Old Drove, and in the Night Drove (the shades who still walk
their herds to a market that closed).

Wing 1 is the way in: the Fair Gate yard, the Turnpike that still takes a toll, the pens, and Old Shep, who is still
herding. Past the Drove Fold the street opens. The stalls were never packed away. Paper lot tags still hang from every
post, each one a name. Lanterns burn in a dusk that does not end. The hawkers are still selling, the scales are still
weighing, and at the far end of the street the Tollhall doors are shut.

This is not Harrow Coyle's story. Coyle bought the tolls on the living roads and sent his list down into the Barrow.
The Endmarket is the older fair those roads once walked to. The link is the lists themselves: names counted, written,
and sold. Mother Tally, the fair's last honest clerk, is still the person you talk to at the gate.

Look: sun-faded oxblood and bone stripes, old timber, tarnished brass, paper lot tags, hay and wicker, lantern gold on
a long dusk. The same palette as wing 1, denser, more stalls, less rock. Lighting stays `dark: 0.4`, lantern lit,
lighter than a barrow. Music stays `the_downs` unless a dusk bed is added later. Floor is `plaza`.

## 2. How you get in

Level 30, same as wing 1. A hero who has turned in **Pay Going In** (the Turnpike and Old Shep) unlocks the Fair
Streets.

- A **story door** at the north end of the Drove Fold, past Old Shep, so the first clear feels like walking on from
  wing 1.
- A **return door** on Drovers' Reach, just east of the Fair Gate (near 308, 74), so a weekly reclear does not force a
  second trip through the Drove Gate. Mother Tally stands between the two doors and sends you in.

The place is its own raid copy (`endmarket_streets`), `raid: { heroes: 4, wing: 2, wings: 3, label: 'Raid for 4, level
30' }`. It does not share a copy with wing 1. The weekly lockout is per boss, so a hero can clear both wings in the
same week and be paid for both.

## 3. Layout

A north-south street, about 80 by 160 tiles, five rooms and the halls between them. Halls stay 8 wide so four heroes
can move abreast. Rock elsewhere, dressed with the dungeon kit and the fair's `dg_fair_*` pieces.

| Room | Name | What is there |
|---|---|---|
| 1 | The Street Gate | Arrival, the inside lantern, a sign, a short yard of unsold drovers and fair dogs. The way back to the Reach (or into the Drove Fold). |
| 2 | The Fair Streets | The long stall street. Awnings on both sides, bunting overhead, lot posts, braziers. Trash: stallholders, drovers, dogs, and a new Lot Buyer. The first still's view. |
| 3 | The Weigh Yard | A wide square. The Weighmaster's great scales stand in the middle (two pans with lit rims, one gold, one cold blue). Boss 1. |
| 4 | The Crier's Ring | An open auction circle. Plank benches in rows, stall awnings around the rim, lot tags, a street-size dais (not the Tollhall's Book of Lots). Boss 2. |
| 5 | The Bailiff's Lane, then the Tollhall Doors | A long lane of hurdles, chains and cages, where the Catchpole fights (boss 3, the wing's last). North of him, a closed fair arch and a board: "THE TOLLHALL. NAMES CALLED WITHIN." The doors do not open in this wing. |

A cashbox chest in a side alcove off the Midway (the short hall between the Weigh Yard and the Crier's Ring). No
secrets required for a first build.

A clear of the Catchpole is the weekly clear of the wing. The party stands at the shut doors, and Mother Tally has a
new line when they come out.

## 4. Bosses and mechanics

Three bosses, all level 30, built for 4, also walkable solo or as a duo. The same rule as wing 1: teamwork rules cost a
lone hero **time**, never damage they cannot avoid. Frenzy after 300 s, as the Turnpike and Old Shep already do. Target
fight length for four heroes: 60 to 300 s, the same party-bot gate as wing 1 (`qa/sim/party_bot.mjs`,
`qa/sim/raid.test.mjs`).

Trash in the streets uses today's `fair_drover`, `fair_dog`, and `fair_stallholder`, plus one new spirit, the **Lot
Buyer** (a bidder who tags a hero and walks them toward a stall; a stun or a hard interrupt drops the tag). Packs of 2
or 3, as in wing 1.

### Boss 1. The Weighmaster

A brass-and-timber construct, family `construct`, the fair's great scales given a body. It stands in front of the beam.
Card (draft): "THE WEIGHMASTER. Every lot is weighed. A name that does not balance is no name at all."

- **Swing and cleave.** A slow smash on its target, and a cone (Toll Bar's shape, a beam of the scales) on a 10 s
  cooldown. The tank faces it away from the pans.
- **Weigh the Lot** (the party rule, every 18 s, first at 8 s, 3 s uninterruptible telegraph). One pan lights gold, the
  other cold blue. A marked hero is "heavy" (a gold ring). When the cast ends:
  - In a party of 2 or more: the heavy hero must stand on the gold pan, and at least one other hero must stand on the
    blue pan. Both pans paid: the weight is shared (a modest hit, `swings` split by who stood in). A missing pan: that
    side's unpaid heroes take a heavy hit, and the empty pan slams (a short knockback off the square).
  - Alone: stand on the gold pan and you are rooted for a few seconds (the weight is paid in time). Stand on neither:
    you take the unpaid hit, which is avoidable by stepping on the pan.
- At 50% health it yells and two Lot Buyers walk in from the stalls. The pans keep working.

Solo or duo: the slam never one-shots; the root is the tax. A duo can cover both pans with one each.

### Boss 2. The Crier

A stallholder spirit in a tall hat, a hand bell, and a sheaf of tags, family `spirit`. She sells what is left on the
street. Card (draft): "THE CRIER. She does not take your coin. She takes the name you answer to."

- **Sold!** (the party rule, every 20 s, first at 10 s). She tags a hero who is not her current target with a coloured
  lot tag (oxblood, bone, or teal: the three awning colours already in the kit). A matching stall on the rim lights up.
  The tagged hero has about 6 s to stand in that stall. Arrive in time: the tag falls off, no damage. Fail:
  - In a party of 2 or more: the tag bursts (a modest hit on the tagged hero) and jumps to the nearest friend, who has
    a shorter window. A Mender's Purify, or any hard dispel, also drops it. A friend can stand in the stall with the
    tagged hero and share the sale (the burst is split), which is the "pay together" beat from the Turnpike, in street
    form.
  - Alone: the matching stall is always one of the two nearest; the tag never jumps; the window is longer (about 8 s).
    Miss it and you take the burst once. It does not chain.
- **Bidding Bell.** A short interruptible cast, a ring around her. Heroes inside are silenced for 2 s if it lands. Kick
  it, or step out.
- At 40% she rings the bell and two Stallholders take the side stalls. The tags keep coming.

### Boss 3. The Catchpole (last of the wing)

The fair's bailiff, family `humanoid` (or spirit, if the humanoid family is still settling), a hook on a chain. He
takes the lots that were not paid for. Card (draft): "THE CATCHPOLE. Unpaid lots are collected. He has been collecting
for a hundred years."

- **Hook and Draw** (the party rule, every 22 s, first at 12 s). He hooks the hero furthest from him (not his target)
  and starts drawing them down the lane, through hurdles and cages, toward him. A gold line shows the chain.
  - In a party of 2 or more: a friend who stands on the chain and breaks the **Chain Ring** (a small construct, like
    Old Shep's hurdle, about 40% of an add's health) cuts the hook and frees them. While they are drawn, the hooked
    hero is slowed, not rooted, so they can still kite toward a friend. If nobody cuts it, they are pulled to him and
    take a short stun, plus a modest hit. He also keeps a cone on his tank, so the tank does not chase the hook.
  - Alone: the hook roots for a moment, then you can run against it and break your own Chain Ring (it spawns beside
    you, as Shep's hurdle does). No drag through leftover packs. No trampling damage while you break it.
- **Pound the Lane.** A line charge down the length of the lane (Drive's shape, already on Old Shep). Side-step it.
- At 40% he calls two Fair Dogs from the cages. The hook keeps coming.

Death line (draft): "The hook goes slack. Far up the lane, the Tollhall doors do not open. Not yet."

## 5. Loot (tied to the Endmarket tier)

The armor set from wing 1 stays the Endmarket tier (`tier: 'endmarket'`, ilvl 32, five pieces, 2 / 4 / 5 bonuses
already written in `RAID_SETS`). Wing 2 does not replace that set. It fills it, and it adds the slots the set never
dropped.

- **Lot Tickets, as today.** Each boss can still drop a `lot_ticket_<slot>` for an armor slot the hero lacks (catch-up
  for anyone who missed a week, or who is filling the 5-piece). Same use: Mother Tally, or use from the bag, same
  `RD.useTicket` path.
- **Street Tickets, new.** Three new tickets, same weekly lockout rules:
  - `street_ticket_weapon`: the class's Fair Streets weapon (ilvl 33)
  - `street_ticket_off`: the class's off-hand, or a second weapon for the Inkblade (ilvl 33). The Wayfinder, who holds a
    two-handed bow, gets a trinket instead of an off-hand from this ticket.
  - `street_ticket_trinket`: a Fair Streets trinket (ilvl 33)
- **Who drops what** (draft, first slot the hero lacks, else any of that boss's slots, same as wing 1):

| Boss | Tickets |
|---|---|
| The Weighmaster | armor (head, hands) or Street Ticket: trinket |
| The Crier | armor (legs, feet) or Street Ticket: off |
| The Catchpole | armor (chest, hands) or Street Ticket: weapon |

- **The Street Purse.** The first Catchpole kill each week, per hero, in a party of 2 or more: gold (about 160 to 220),
  4 glyphs, and one extra ticket (armor or street, a slot they lack). Event `raid_purse`, same as the Fair Purse, keyed
  to this place so a hero can earn both purses in one week.
- **ilvl 33 on weapons, off-hands and trinkets**, one step above the ilvl 32 set, so the set stays on and the new lots
  fill the empty slots. No second armor set in this wing.
- **Draft item names** (class weapons and off-hands; trinkets are for any class):

| Class | Weapon (ilvl 33) | Off-hand (ilvl 33) |
|---|---|---|
| Warden | The Weigh-Bar (sword) | Scale-Plate (shield) |
| Mender | The Street Rod (rod) | Hawker's Hand Bell (bell) |
| Scribe | The Tag Quill (quill) | Midway Folio (book) |
| Wayfinder | The Midway Bow (bow) | (none: the weapon ticket is the bow; the off ticket is a trinket) |
| Inkblade | Lot-Knife (dagger) | Tag-Knife (off-hand dagger) |

Trinkets (draft), one tied to each boss, claimed from a Street Ticket: trinket: **The Weighmaster's Weight** (a small
brass weight: a short absorb when you stand still), **A Crier's Tag** (on a hard dispel or Purify, a small burst of
healing or damage), **The Catchpole's Hook** (your first spell or shot on a foe more than 8 tiles away pulls you 2
tiles toward them, 30 s cooldown). Numbers are drafts for the balance pass.

Set pieces stay `rarity: 'set'`, soulbound on pickup, class locked, as they are now. Street weapons and trinkets are
`rarity: 'epic'`, bound on equip, class locked where they should be. No new legendary in this wing (the skill
legendaries stay dungeon drops; the Lot-Caller's unique is a wing 3 question).

## 6. Art plan (existing assets only)

Nothing new is bought. Nothing from a QAL pack is committed. The look is the one Scott already approved for the Fair
Gate and wing 1.

**Place dressing, all already in repo:**

- Fair props, code-built in `src/render3d/fair3d.js` (no kit files): `dg_fair_awning`, `dg_fair_lots`,
  `dg_fair_bunting`, `dg_fair_hurdle`, `dg_fair_scales`, `dg_fair_weights`, `dg_fair_benches`. The Street Gate and the
  Tollhall doors reuse `dg_fair_arch`. `dg_fair_block` is reserved for wing 3, unless a smaller street dais is built
  from the same parts for the Crier's Ring (same timber, stripes, lanterns; no Book of Lots on it).
- Dungeon kit already used in wing 1: `dg_torch`, `dg_brazier`, `dg_banner`, `dg_coins`, `dg_cage`, `dg_chain`,
  `dg_urn`, `dg_rubble`, `dg_bones`.
- World-side Fair Gate street already uses village props from the CC0 Medieval Village MegaKit (in `assets3d/village`):
  `market_stall_cloth`, `market_stall_fruit`, `lamp_post`, `x1_haybale`, `x1_trough`, `crates_barrels`,
  `x1_sack_stack`, `barrel`, `signboard`. Those may dress the return door on Drovers' Reach, not the inside of the
  wing, so the inside stays in the fair kit's dusk language.

**Foes, code-built recipes in `src/render3d/creature_recipes.js` (the same path as the Turnpike and Old Shep):**

- Trash keeps today's recipes: Unsold Drover, Stallholder, Fair Dog.
- Lot Buyer: a ghost stallholder variant, a ledger and a tag in hand, teal and bone.
- The Weighmaster: a large Sentinel-base construct, brass and dark timber, a glow in the pans' gold, no borrowed
  monster file.
- The Crier: a taller ghost stallholder, hat, hand bell, a sheaf of paper tags, oxblood and bone.
- The Catchpole: a ghost or humanoid bailiff, hook-and-chain (halberd-length), iron and oxblood, a lantern on the belt.
- The Chain Ring: the same small golem-hurdle language as `em_hurdle`.

Heroes stay on the CC0 Universal Base Characters and Modular Character Outfits already in `assets3d/`. No Elf, Orc,
Imp or Puglin models (those are QAL, already excluded).

**Budget.** A stall street is denser than the Drove Gate. Keep the lookdev frame budget in mind (`qa/lookdev/budget.json`):
instance the awnings and benches, cap extra lights at the same per-room count as wing 1 (lanterns on awnings plus
corner braziers), and let Low quality drop the bunting scallops and the paper tags first. Phone camera must still read
the gold and blue pans, the coloured stall, and the hook line.

**VFX (existing fx kit, no new packs).** Gold and cold-blue pan rims already exist as materials on `dg_fair_scales`.
The heavy ring, the lot tag colour, the hook line, and the Chain Ring spawn should reuse current ground-ring, beam, and
decal recipes (the Turnpike's toll ring, Old Shep's pen, Grapple Line's rope as a starting point for the hook). Sounds
reuse bells, chains, and a dry wood slam, pitched as needed.

## 7. Quests and people

Mother Tally keeps the chain (`endmarket`). One new step after Pay Going In, plus a close step:

- **The Streets Still Selling** (level 30, Tally): walk the Fair Streets, kill the Weighmaster, the Crier, and the
  Catchpole. Offer (draft): "Past the pens the street is still open, love, and it is still selling. The scales will
  weigh you. The Crier will try to sell the name you answer to. At the far end the Catchpole collects what is unpaid.
  Four of you, as before. Two at the least. When the hook goes slack, come back to me. The Tollhall can wait one more
  week."
- On turn-in she pays gold and a Street Ticket, and she looks at the shut doors: "The Lot-Caller is still calling.
  Not today."

No new world NPC is required. A board at the Street Gate repeats the fair's order, in street language: every stall
open, every tag a name, every unpaid lot collected.

## 8. Effort estimate

The raid frame is already live (lockout, tickets, Purse, party rules, the party bot, the fair kit, the Fair Gate).
Wing 2 is a content wing on that frame, not a second frame.

| Work | Size | Notes |
|---|---|---|
| Place, map, doors, unlock after Pay Going In, Mother Tally's two quest steps | Medium | Same path as `zone_endmarket_gate.mjs` plus a Reach-side door |
| Three bosses, three party rules in `src/sim/raid.js`, abilities, solo and duo branches | The bulk | Pattern is already in the toll and the pen |
| Lot Buyer trash, three boss recipes, optional small street dais | Medium | Code-built, existing kit |
| Street Tickets, ilvl 33 weapons / off / trinkets, Street Purse, ticket routing | Medium | Extends `RAID_RULES` and `useTicket` |
| Party-bot tuning, raid tests, a stills pass after the real map exists | Medium | Same gate as wing 1: clear, no wipe, deaths at most 2, each boss 60 to 300 s |

This is about as large as wing 1's content once the frame already existed: one focused build batch, then an independent
check, then Scott's go before it goes to main. It is not a visual rewrite and it is not a new raid system. The stills
in this brief are in-engine mockups from a throwaway scene only. They are not the built wing.

Open questions to settle in the build, not in this brief: exact ticket odds when a hero already owns the armor set;
whether Purify needs a short cooldown tweak if it is the clean answer to Sold!; whether the story door inside the Drove
Fold is worth the extra join, or the Reach-side door alone is enough.

## 9. What wing 3 is (the Tollhall)

Wing 3 is the last wing of the Endmarket: the Tollhall, the fair's counting hall, behind the shut doors at the north
end of the Bailiff's Lane. The clerks who still write the names, then the Lot-Caller on the auction block, with the
Book of Lots and the bidding bell (`dg_fair_block`, held back from this wing on purpose). The buyer who paid for names
a hundred years ago may still be in the chair, or only their voice may be. The fights should feel like an auction and a
reckoning: lots called on the party, names written that must be struck out, a last bill that the group pays together,
the same "pay together or pay more" idea as the Turnpike and the scales, taken to the end. Clearing the Lot-Caller ends
the Endmarket, pays the last Purse, and finishes the remaining tickets of the Endmarket tier. A unique Lot-Caller
piece (a named weapon or trinket, possibly the raid's one skill-changing item) belongs here, not in wing 2. The door
opens after a hero has turned in The Streets Still Selling. Party size, lockout, and the 4-hero label stay the same.
This is a one-paragraph reservation only; wing 3 gets its own brief and stills before any build.

## 10. The 3 stills (in-engine mockups, for approval)

Captured from a throwaway local scene in a worktree at `/workspace/lr-raid2` (branch `mock/raid-wing2`, not for commit
or push), using the live 3D game and the fair props already in the kit. Saved at:

1. `docs/handoff/stills/raid2_still_1.png`: the Fair Streets, looking up the stall street at lantern
   dusk, striped awnings, bunting, lot tags, braziers, unsold drovers and fair dogs.
2. `docs/handoff/stills/raid2_still_2.png`: the Weigh Yard, the Weighmaster, and the two pans with
   gold and cold-blue rims (the share-the-weight beat).
3. `docs/handoff/stills/raid2_still_3.png`: the Crier in her ring, stall awnings, lot posts and
   bunting. The shut Tollhall doors sit on the north wall of this room in the layout; in this mock the Crier is the
   subject, and the doors are a later still or the real build.
