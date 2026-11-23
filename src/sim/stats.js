// Stats and modifiers. Pure.
//
//   mod(e, stat, ctx)       -> { add, mul } summed over talent mods and aura mods that match ctx (ability, school, when)
//   cond(e, when, ctx)      -> a `when` / `if` condition (CONTRACTS 5.8)
//   recalc(e)               -> recompute a player's or a mob's stats, derived numbers, weapon and resource max
//
// Player stat at level L = floor(base + perLevel * (L - 1)) + gear (CLASSES 0.2). Gear comes from content.items when an
// equipped item exists there; otherwise ("design gear", PROGRESSION 9.1) the player carries the design's expected kit:
// weapon ilvl = gear level, +floor(0.7 L) to the main stat and stamina, full-kit armor.
import { glyphPowers } from './glyphs.js';
import { TICK_HZ } from './constants.js';
import { distPx } from './geom.js';
import { resolveItem } from './loot.js';

export function createStats(C) {
  const P = C.P;
  const { data } = C;

  function hasFlag(e, flag) {
    for (const a of e.auras) if (a.def.flags && a.def.flags.includes(flag)) return true;
    return false;
  }
  function findAura(e, id, src) {
    for (const a of e.auras) if (a.id === id && (src == null || a.src === src)) return a;
    return null;
  }

  /** The powers of the legendary items `e` wears (src/data/items.js `power`), in slot order. */
  function powersOf(e) {
    const items = C.content.items || {};
    const out = [];
    for (const id of e.powers || []) { const d = items[id]; if (d && d.power) out.push(d.power); }
    if (e.glyphPw) out.push(...e.glyphPw);                 // Inscriptions: worn letters and spelled words (src/sim/glyphs.js)
    return out;
  }

  function isSolo(e) {
    for (const u of C.state.ents) if (u.kind === 'player' && u !== e && !u.dead && u.zone === e.zone && distPx(u, e) <= 256) return false;
    return true;
  }

  function cond(e, when, ctx = {}) {
    if (!when) return true;
    const t = ctx.target;
    for (const [k, v] of Object.entries(when)) {
      switch (k) {
        case 'targetHpBelow': if (!t || t.hp / t.hpMax >= v) return false; break;
        case 'selfHpBelow': if (e.hp / e.hpMax >= v) return false; break;
        case 'targetRooted': if (!t || hasFlag(t, 'root') !== v) return false; break;
        case 'targetAura': if (!t || !findAura(t, v, when.fromSelf ? e.id : null)) return false; break;
        case 'attackerAura': if (!ctx.attacker || !findAura(ctx.attacker, v, when.fromSelf ? e.id : null)) return false; break;
        case 'fromSelf': break;
        case 'still': if (e.moving || C.state.tick - (e.stillSince || 0) < v * TICK_HZ) return false; break;
        case 'notCasting': if (!!e.cast === v) return false; break;
        case 'outOfCombat': if (!!e.inCombat === v) return false; break;
        case 'stealthed': if (hasFlag(e, 'stealth') !== v) return false; break;
        case 'opener': if (!!ctx.opener !== v) return false; break;
        case 'targetWithin': if (!t || distPx(e, t) > v) return false; break;
        case 'holderIsCaster': if (!ctx.holder || ctx.holder.id !== (ctx.caster && ctx.caster.id)) return false; break;
        case 'absorbUsed': if (!!ctx.absorbUsed !== v) return false; break;
        case 'melee': if (!!ctx.melee !== v) return false; break;
        // class identity pass: the target carries a foe trait (PROGRESSION mobTraits), or is casting
        case 'targetTrait': if (!t || !t.mob || !(t.mob.traits || []).includes(v)) return false; break;
        case 'attackerTrait': if (!ctx.attacker || !ctx.attacker.mob || !(ctx.attacker.mob.traits || []).includes(v)) return false; break;
        case 'targetCasting': if (!t || !!t.cast !== v) return false; break;
        case 'inCombatFor': if (!e.inCombat || C.state.tick - (e.combatSince || 0) < v * TICK_HZ) return false; break;
        // Builds 2 (src/data/builds2.js): the first v s of a fight; a heal on yourself; no other hero within 16 tiles;
        // an ability of yours still cooling down
        case 'combatUnder': if (!e.inCombat || C.state.tick - (e.combatSince || 0) >= v * TICK_HZ) return false; break;
        case 'targetIsSelf': if ((!!t && t.id === e.id) !== v) return false; break;
        case 'solo': if (isSolo(e) !== v) return false; break;
        case 'cooling': if (!((e.cd && e.cd[v]) > C.state.tick)) return false; break;
        // Builds 2, the other four classes: Resolve at or above v (Furnace Heart); the target at v px or more (Lethal
        // Distance); the target rooted or slowed (Run to Ground); rooted, stunned or held (Full Sentence); no other foe within
        // v px of the target (Single Mind); an aura of your own on you (Kick and Shoot); a script you do NOT have (Point Blank
        // lifts the close-range cut, Unwritten stops Cut the Word on an ordinary hit)
        case 'resAbove': if (!e.res || e.res.cur < v) return false; break;
        case 'targetBeyond': if (!t || distPx(e, t) < v) return false; break;
        case 'targetSnared': if (!t || (hasFlag(t, 'root') || hasFlag(t, 'slow')) !== v) return false; break;
        case 'targetHeld': if (!t || (hasFlag(t, 'root') || hasFlag(t, 'stun') || hasFlag(t, 'incap')) !== v) return false; break;
        case 'targetAlone': {
          if (!t) return false;
          for (const u of C.state.ents) if (u !== t && u.kind === 'mob' && !u.dead && u.zone === t.zone && u.faction === 'hostile' && distPx(u, t) <= v) return false;
          break;
        }
        case 'selfAura': if (!findAura(e, v, e.id)) return false; break;
        case 'noScript': if (e.kind === 'player' && data.hasScript(e, v)) return false; break;
        default: return false;
      }
    }
    return true;
  }

  function matches(m, ctx) {
    if (m.ability) {
      const ab = ctx.ability;
      if (Array.isArray(m.ability) ? !m.ability.includes(ab) : m.ability !== ab) return false;
    }
    if (m.school) {
      if (m.school === 'spell') { if (!ctx.school || ctx.school === 'physical') return false; }
      else if (m.school !== ctx.school) return false;
    }
    if (m.periodic && !ctx.periodic) return false;
    if (m.direct && ctx.periodic) return false;          // Builds 2: direct (not over time) only
    // Builds 2 Living off the Land: every source but one
    if (m.notAbility && (Array.isArray(m.notAbility) ? m.notAbility.includes(ctx.ability) : m.notAbility === ctx.ability)) return false;
    return true;
  }
  /** Builds 2 Bellows: hostile foes within `radius` px of `e`, at most `max`. */
  function foesNear(e, { radius = 48, max = 4 } = {}) {
    let n = 0;
    for (const u of C.state.ents) if (u.kind === 'mob' && !u.dead && u.zone === e.zone && u.faction === 'hostile' && distPx(u, e) <= radius && ++n >= max) break;
    return n;
  }

  function mod(e, stat, ctx = {}) {
    let add = 0, mul = 1;
    if (e.kind === 'player') {
      for (const m of data.talentInfo(e).mods) {
        if (m.stat !== stat || !matches(m, ctx) || !cond(e, m.when, ctx)) continue;
        const n = m.perNear ? foesNear(e, m.perNear) : 1;
        if (m.add != null) add += m.add * n;
        if (m.mul != null) mul *= Math.pow(m.mul, n);
      }
    }
    // legendary item powers worn (src/data/legendary_powers.js; recalcPlayer lists the item ids on e.powers)
    if (e.powers || e.glyphPw) for (const pw of powersOf(e)) for (const m of pw.mods || []) {
      if (m.stat !== stat || !matches(m, ctx) || !cond(e, m.when, ctx)) continue;
      if (m.add != null) add += m.add;
      if (m.mul != null) mul *= m.mul;
    }
    for (const a of e.auras) {
      const mods = a.def.mods;
      if (!mods) continue;
      for (const m of mods) {
        if (m.stat !== stat || !matches(m, ctx) || !cond(e, m.when, ctx)) continue;
        // Builds 2 Shadow Mark (only the hero who marked) and Corrode (everyone but the hero)
        if (m.selfOnly && !(ctx.attacker && (ctx.attacker.id === a.src || ctx.attacker.owner === a.src))) continue;
        if (m.othersOnly && ctx.attacker && (ctx.attacker.id === a.src || ctx.attacker.owner === a.src)) continue;
        const n = m.perStack ? a.stacks : 1;
        if (m.add != null) add += m.add * n;
        if (m.mul != null) mul *= Math.pow(m.mul, n);
      }
    }
    return { add, mul };
  }

  /** Highest slow wins (CLASSES 0.8): the largest `slow` add among auras, not their sum. */
  function slowOf(e) {
    let s = 0;
    for (const a of e.auras) for (const m of a.def.mods || []) if (m.stat === 'slow' && m.add > s) s = m.add;
    return s;
  }

  // ---------------------------------------------------------------------------- recalc
  function weaponFor(type, ilvl) {
    const wt = C.content.weaponTypes[type];
    if (!wt || !wt.speed) return null;
    const dps = (P.gear.weaponDps[0] + P.gear.weaponDps[1] * ilvl) * wt.mult;
    const mean = dps * wt.speed, s = P.gear.weaponSpread;
    return { type, min: mean * (1 - s), max: mean * (1 + s), speed: wt.speed };
  }

  function recalcPlayer(e) {
    const cls = data.classes[e.cls];
    if (!cls) return;
    const L = e.level;
    const st = {};
    for (const k of ['str', 'agi', 'int', 'spi', 'sta']) st[k] = Math.floor(cls.base[k] + cls.perLevel[k] * (L - 1));
    let armor = 0, sp = 0, crit = 0, gearSpeed = 0, gearMana = 0;
    const resist = {}, powers = [];
    const RS = (C.content.resist && C.content.resist.stats) || {};
    let main = null, off = null;
    const items = C.content.items || {};
    const gearLevel = e.gearMode === 'design' ? (e.designGear || L) : null;
    if (gearLevel != null) {
      const g = Math.floor(P.gear.statPerLevel * gearLevel);
      st[cls.mainStat] += g; st.sta += g;
      const kit = P.gear.kitArmor[cls.armor];
      armor = kit[0] + kit[1] * gearLevel;
      if (cls.weapons.includes('shield')) armor += P.gear.shieldArmor[0] + P.gear.shieldArmor[1] * gearLevel;
      main = weaponFor(cls.weapons[0], gearLevel);
      if (cls.auto.offHand) off = weaponFor(cls.weapons[1], gearLevel);
    } else {
      // set pieces worn (src/data/items.js SETS): e.sets = { setId: pieces }; src/sim/data.js adds the bonuses
      const sets = {};
      for (const entry of Object.values(e.equip || {})) { const d = entry && items[typeof entry === 'string' ? entry : entry.item]; if (d && d.set) sets[d.set] = (sets[d.set] || 0) + 1; }
      if (Object.keys(sets).length) e.sets = sets; else if (e.sets) delete e.sets;
      for (const [slot, entry] of Object.entries(e.equip || {})) {
        if (!entry) continue;
        const it = items[typeof entry === 'string' ? entry : entry.item] ? resolveItem(C.content, entry, e.cls) : null;
        if (!it) continue;
        armor += it.armor || 0;
        for (const [k, v] of Object.entries(it.stats || {})) {
          if (k in st) st[k] += v; else if (k === 'sp') sp += v; else if (k === 'crit') crit += v / 100;
          else if (k === 'speed') gearSpeed += v / 100; else if (k === 'mana') gearMana += v;
          else if (RS[k]) for (const sc of RS[k]) resist[sc] = (resist[sc] || 0) + v / 100;      // resist affixes (src/data/resist.js)
        }
        if (it.power && !powers.includes(it.id)) powers.push(it.id);                               // a legendary's power
        if (it.damage && (slot === 'main' || slot === 'two')) main = { type: it.weaponType, min: it.damage[0], max: it.damage[1], speed: it.speed };
        if (it.damage && slot === 'off') off = { type: it.weaponType, min: it.damage[0], max: it.damage[1], speed: it.speed };
      }
      if (!main) main = weaponFor(cls.weapons[0], 1);
      if (cls.auto.offHand && !off) off = weaponFor(cls.weapons[1], 1);
    }
    // Inscriptions (src/sim/glyphs.js): the worn letters and words, read before the health and armor mods below
    const gp = gearLevel == null ? glyphPowers(C.content, e) : null;
    if (gp) { e.glyphPw = gp; e.moveCharges = gp.reduce((n, p) => n + (p.moveCharges || 0), 0) || 0; } else { delete e.glyphPw; delete e.moveCharges; }
    const hpMul = mod(e, 'maxHp').mul, armorMul = mod(e, 'armor').mul, manaMul = mod(e, 'manaMax').mul;
    const hpMax = Math.round((cls.hpPerSta * st.sta + cls.base.hp) * hpMul);
    st.armor = Math.round(armor * armorMul);
    const ap = cls.apPerAgi ? cls.apPerAgi * st.agi : cls.apPerStr * st.str;
    const spv = cls.spPerInt ? cls.spPerInt * st.int + sp : sp;
    e.stats = st;
    e.derived = { ap, sp: spv, crit: (cls.critBase || 0.05) + crit, block: cls.blockBase || 0, hpMax, gearSpeed };
    if (Object.keys(resist).length) e.derived.resist = resist;
    if (powers.length) e.powers = powers; else if (e.powers) delete e.powers;
    e.weapon = { main, off };
    const frac = e.hpMax > 0 ? e.hp / e.hpMax : 1;
    e.hpMax = hpMax;
    e.hp = Math.min(hpMax, Math.max(e.dead ? 0 : 1, Math.round(frac * hpMax)));
    const r = cls.resource;
    if (r.kind === 'mana') {
      const max = Math.round((r.maxBase + r.maxPerInt * st.int + gearMana) * manaMul);
      if (!e.res || e.res.kind !== 'mana') e.res = { kind: 'mana', cur: max, max };
      else { e.res.max = max; e.res.cur = Math.min(e.res.cur, max); }
    } else if (!e.res || e.res.kind !== r.kind) {
      e.res = { kind: r.kind, cur: r.start === 'max' ? r.max : r.start || 0, max: r.max };
    }
  }

  function recalcMob(e) {
    const t = C.content.mobs[e.template] || {};
    const L = e.level;
    const kinds = Array.isArray(t.kind) ? t.kind : [t.kind || 'normal'];
    const elite = !!t.elite || kinds.includes('elite');
    let hpM = 1, dmgM = 1, physReduce = 0;
    for (const k of kinds) { const km = P.mobKinds[k] || P.mobKinds.normal; hpM *= km.hp; dmgM *= km.damage; physReduce = Math.max(physReduce, km.physReduce || 0); }
    if (elite && !kinds.includes('elite')) { hpM *= P.mobKinds.elite.hp; dmgM *= P.mobKinds.elite.damage; }
    // a camp that pulls as a pack (PROGRESSION packs, combat role pass): each member is lighter, the pack is about 1.6 to 2 foes
    const pk = e.spawn && e.spawn.pack && P.packs ? P.packs[e.spawn.pack] : null;
    if (pk) { hpM *= pk.hp; dmgM *= pk.damage; }
    // a dungeon boss's own tuning (mobs.js hpMult / dmgMult, the clear bot's knobs)
    hpM *= t.hpMult || 1; dmgM *= t.dmgMult || 1;
    if (e.spawn && e.spawn.tune) { hpM *= e.spawn.tune.hp || 1; dmgM *= e.spawn.tune.dmg || 1; }   // a dungeon's trash (src/data/dungeons.js)
    // foe traits (class identity pass, PROGRESSION mobTraits): the template's `traits`, plus the trait its kind carries
    const traits = [...new Set([...(t.traits || []), ...kinds.filter((k) => k === 'armored' || k === 'caster')])].sort();
    let swingM = 1, speedM = 1, plating = 0, unblockable = false, drain = null, snareMult = null;
    for (const tr of traits) {
      const d = (P.mobTraits || {})[tr];
      if (!d) continue;
      hpM *= d.hp || 1; dmgM *= d.damage || 1; swingM *= d.swing || 1; speedM *= d.speedMult || 1;
      if (d.plating) plating += Math.round(d.plating.base + d.plating.perLevel * L);
      if (d.unblockable) unblockable = true;
      if (d.drain) drain = { ...(drain || {}), ...d.drain };
      if (d.snareMult != null) snareMult = d.snareMult;
    }
    const kind = kinds.find((k) => k !== 'elite') || 'normal';
    const c = P.mobCurve;
    // a template with a single fixed level may give its own numbers; a family with a level range uses the curve
    const fixed = !Array.isArray(t.level);
    // low-level foes are lighter (PROGRESSION mobCurve.lowLevelHp, fix pass 1): [upToLevel, mult], first match wins
    const low = (c.lowLevelHp || []).find(([upTo]) => L <= upTo);
    // past mobCurve.linearFrom [level, slope] health is linear (BUILDS_2 5.3, cap 20): hp(from) + slope x (L - from)
    const lin = c.linearFrom;
    const curveHp = (x) => c.hp[0] + c.hp[1] * x + c.hp[2] * x * x;
    const baseHp = lin && L > lin[0] ? curveHp(lin[0]) + lin[1] * (L - lin[0]) : curveHp(L);
    const hpMax = t.hpOverride || (fixed && t.hp != null ? t.hp : Math.round(baseHp * hpM * (low ? low[1] : 1)));
    let dmg = fixed && t.damage ? t.damage : null;
    if (!dmg) {
      const mean = (c.hit[0] + c.hit[1] * L) * dmgM;
      dmg = [Math.max(1, Math.round(mean * (1 - c.hitSpread))), Math.max(1, Math.round(mean * (1 + c.hitSpread)))];
    }
    e.stats = { str: 0, agi: 0, int: 0, spi: 0, sta: 0, armor: (fixed && t.armor) || 0 };
    e.derived = { ap: 0, sp: 0, crit: 0, block: 0, hpMax };
    e.mob = { kind, kinds, elite, damage: dmg, attackSpeed: (t.attackSpeed || c.attackSpeed) * swingM, school: t.school || 'physical',
      physReduce, family: t.family || e.template, traits, plating, speedMult: speedM, unblockable, drain, snareMult };
    // the hit table (src/data/hittable.js, src/data/resist.js): a boss crits more, an armed foe parries, resists by school
    const HT = C.content.hitTable, RZ = C.content.resist;
    if (t.boss) e.mob.boss = true;
    if (HT && (t.armed || (HT.armed || []).includes(e.template))) e.mob.armed = true;
    if (RZ || t.resist) {
      const r = { ...((RZ && RZ.family && RZ.family[t.family]) || {}), ...((RZ && RZ.template && RZ.template[e.template]) || {}), ...(t.resist || {}) };
      if (Object.keys(r).length) e.mob.resist = r;
    }
    e.hpMax = hpMax;
    if (e.hp > hpMax || e.hp <= 0 || e.hp == null) e.hp = hpMax;
  }

  function recalc(e) {
    if (e.kind === 'player') recalcPlayer(e);
    else if (e.kind === 'mob') recalcMob(e);
  }

  return { mod, cond, slowOf, hasFlag, findAura, recalc, weaponFor, isSolo, powersOf };
}
