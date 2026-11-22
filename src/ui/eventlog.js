// Sim events -> chat / combat log lines { ch, text } for the player's own view. Pure (tests run it).
// Channels: system, combat, damage_out, damage_in, heal, xp, loot, error, party, say.
import { abilityName, questInfo, itemInfo, resourceWord } from './gamedata.js';

// 'gcd' is never logged (CRITIQUE_1 item 19: the input queues a press made near the end of the global cooldown).
// Resource and cooldown failures are `quiet`: the UI shows at most one of them every few seconds.
const FAIL = {
  cooldown: 'That is not ready yet.', range: 'Out of range.', los: 'You cannot see your target.',
  requires: 'You cannot do that now.', silenced: 'You cannot speak right now.', moving: 'You must stand still for that.',
  target: 'You need a target for that.', combo: 'Not enough Ink Marks on that target.', stunned: 'You are stunned.', busy: 'You are busy.',
  combat: 'Not while in combat.',
};

export function eventLines(ev, { me, nameOf = (id) => `#${id}`, zoneNames = {}, resourceKind = 'mana' }) {
  const resWord = resourceWord(typeof resourceKind === 'function' ? resourceKind() : resourceKind);
  const who = (id) => (id === me ? 'you' : nameOf(id));
  const Who = (id) => (id === me ? 'You' : nameOf(id));
  const abil = (id) => abilityName(id);   // player and mob abilities by name; null ("attack") for auto and unknown ids
  switch (ev.type) {
    case 'zone': return ev.id === me ? [{ ch: 'system', text: `Entered ${zoneNames[ev.to] || ev.to}.` }] : [];
    case 'interact': return ev.src === me ? [{ ch: 'system', text: `You speak with ${nameOf(ev.id)}.` }] : [];
    case 'interact_fail': return ev.src === me ? [{ ch: 'error', text: ev.reason === 'range' ? 'Too far away.' : ev.reason === 'combat' ? 'Not while in combat.' : ev.reason === 'used' ? 'You have already opened that.' : ev.reason === 'bag_full' ? 'Your bags are full.' : 'You cannot do that.' }] : [];
    case 'cast_fail':
      if (ev.src !== me || ev.reason === 'gcd' || ev.reason === 'dead') return [];
      if (ev.reason === 'resource') return [{ ch: 'error', quiet: true, text: `Not enough ${resWord}.` }];
      return [{ ch: 'error', quiet: true, text: FAIL[ev.reason] || 'You cannot do that now.' }];
    case 'cast_stop':
      if (ev.src === me && ev.reason === 'interrupt') return [{ ch: 'error', text: `${abil(ev.ability) || 'Your spell'} was interrupted.` }];
      return [];
    case 'damage': {
      if (ev.src !== me && ev.dst !== me) return [];
      const a = abil(ev.ability);
      const ch = ev.src === me ? 'damage_out' : 'damage_in';
      if (ev.result && ev.result !== 'hit') {
        const verb = { miss: 'misses', dodge: 'is dodged by', parry: 'is parried by', block: 'is blocked by', immune: 'fails against' }[ev.result] || 'misses';
        return [{ ch, text: `${ev.src === me ? `Your ${a || 'attack'}` : `${nameOf(ev.src)}'s ${a || 'attack'}`} ${verb} ${who(ev.dst)}.` }];
      }
      const amount = Math.round(ev.amount).toLocaleString('en-US');
      const tail = `${ev.crit ? ' (critical)' : ''}${ev.absorbed ? ` (${ev.absorbed} absorbed)` : ''}.`;
      if (ev.src === me) return [{ ch, text: `Your ${a || 'attack'} ${ev.periodic ? 'burns' : 'hits'} ${who(ev.dst)} for ${amount}${tail}` }];
      return [{ ch, text: `${Who(ev.src)}${a ? `'s ${a}` : ''} hits you for ${amount}${tail}` }];
    }
    case 'heal': {
      if (ev.src !== me && ev.dst !== me) return [];
      const a = abil(ev.ability) || 'heal';
      const amount = Math.round(ev.amount).toLocaleString('en-US');
      if (ev.src === me) return [{ ch: 'heal', text: `Your ${a} heals ${ev.dst === me ? 'you' : nameOf(ev.dst)} for ${amount}${ev.crit ? ' (critical)' : ''}.` }];
      return [{ ch: 'heal', text: `${nameOf(ev.src)}'s ${a} heals you for ${amount}.` }];
    }
    case 'death': return ev.id === me ? [{ ch: 'error', text: 'You have died. You wake at the last lantern you touched.' }] : (ev.killer === me ? [{ ch: 'combat', text: `${nameOf(ev.id)} dies.` }] : []);
    case 'xp': {
      if (ev.id !== me) return [];
      // world life (src/sim/worldlife.js): the part of a kill's XP from rest and from Night at the Stones
      const bits = [ev.rested ? `${Math.round(ev.rested).toLocaleString('en-US')} rested` : '', ev.event ? `${Math.round(ev.event).toLocaleString('en-US')} night bonus` : ''].filter(Boolean);
      return [{ ch: 'xp', text: `You gain ${Math.round(ev.amount).toLocaleString('en-US')} experience${bits.length ? ` (${bits.join(', ')})` : ''}.` }];
    }
    case 'level': return ev.id === me ? [{ ch: 'system', text: `You reach level ${ev.level}!` }] : [];
    case 'loot': {
      if (ev.id !== me) return [];
      const out = [];
      if (ev.gold) out.push({ ch: 'loot', text: `You loot ${ev.gold} gold.` });
      for (const it of ev.pending || []) out.push({ ch: 'error', text: `No room for ${it.name || (itemInfo(it.item) || {}).name || it.item}${it.qty > 1 ? ` x${it.qty}` : ''}: it waits in your bags window (Take).` });
      for (const it of ev.items || []) out.push({ ch: 'loot', text: `You receive: ${it.name || (itemInfo(it.item) || {}).name || it.item}${it.qty > 1 ? ` x${it.qty}` : ''}.` });
      return out;
    }
    case 'quest': {
      if (ev.id !== me) return [];
      const q = ev.questName || (questInfo(ev.quest) || {}).name || ev.quest;
      if (ev.kind === 'accept') return [{ ch: 'system', text: `Quest accepted: ${q}` }];
      if (ev.kind === 'progress') return [{ ch: 'system', text: `${ev.objectiveText || q}: ${ev.cur}/${ev.need}` }];
      if (ev.kind === 'complete') return [{ ch: 'system', text: `${q} (Complete)` }];
      if (ev.kind === 'turnin') return [{ ch: 'system', text: `Quest done: ${q}` }];
      if (ev.kind === 'abandon') return [{ ch: 'system', text: `Quest abandoned: ${q}` }];
      return [];
    }
    // a secret cache (landscape pass): its name and its line of story
    case 'secret_found': return ev.id === me ? [{ ch: 'loot', text: `Secret found: ${ev.name || 'a hidden cache'}!` }, ...(ev.text ? [{ ch: 'system', text: ev.text }] : [])] : [];
    case 'lantern': return ev.id === me ? [{ ch: 'system', text: `${ev.name ? `${ev.name}: the` : 'The'} lantern knows your name now. You will wake here.` }] : [];
    // world life: coming back rested, the Downs at night, the end of a story chain
    case 'rest': return ev.id === me && ev.gained > 0 ? [{ ch: 'xp', text: `You feel rested. Your next kills give double experience (${Math.round(ev.banked).toLocaleString('en-US')} bonus banked).` }] : [];
    case 'world_event': return ev.text ? [{ ch: 'system', text: ev.text }] : [];
    case 'story': return ev.id === me ? [{ ch: 'system', text: `Story complete: ${ev.title}.` }] : [];
    case 'loot_lost': return ev.id === me ? [{ ch: 'error', text: `Your waiting loot was full: ${(itemInfo(ev.item) || {}).name || ev.item} was lost.` }] : [];
    default: return [];
  }
}
