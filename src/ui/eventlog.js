// Sim events -> chat / combat log lines { ch, text } for the player's own view. Pure (tests run it).
// Channels: system, combat, damage_out, damage_in, heal, xp, loot, error, party, say.
import { abilityInfo } from './gamedata.js';

const FAIL = {
  gcd: 'Not ready yet.', cooldown: 'That ability is not ready yet.', range: 'Out of range.', los: 'You cannot see your target.',
  requires: 'You cannot do that now.', silenced: 'You cannot speak right now.', moving: 'You must stand still for that.',
};

export function eventLines(ev, { me, nameOf = (id) => `#${id}`, zoneNames = {}, resourceKind = 'mana' }) {
  const who = (id) => (id === me ? 'you' : nameOf(id));
  const Who = (id) => (id === me ? 'You' : nameOf(id));
  const abil = (id) => (id && id !== 'auto' ? (abilityInfo(id) || { name: id }).name : null);
  switch (ev.type) {
    case 'zone': return ev.id === me ? [{ ch: 'system', text: `Entered ${zoneNames[ev.to] || ev.to}.` }] : [];
    case 'interact': return ev.src === me ? [{ ch: 'system', text: `You speak with ${nameOf(ev.id)}.` }] : [];
    case 'interact_fail': return ev.src === me ? [{ ch: 'error', text: ev.reason === 'range' ? 'Too far away.' : 'You cannot do that.' }] : [];
    case 'cast_fail':
      if (ev.src !== me) return [];
      return [{ ch: 'error', text: ev.reason === 'resource' ? `Not enough ${resourceKind}.` : FAIL[ev.reason] || 'You cannot do that now.' }];
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
      return [{ ch, text: `${Who(ev.src)}${a ? `'s ${a}` : ''} ${a ? 'hits' : 'hits'} you for ${amount}${tail}` }];
    }
    case 'heal': {
      if (ev.src !== me && ev.dst !== me) return [];
      const a = abil(ev.ability) || 'heal';
      const amount = Math.round(ev.amount).toLocaleString('en-US');
      if (ev.src === me) return [{ ch: 'heal', text: `Your ${a} heals ${ev.dst === me ? 'you' : nameOf(ev.dst)} for ${amount}${ev.crit ? ' (critical)' : ''}.` }];
      return [{ ch: 'heal', text: `${nameOf(ev.src)}'s ${a} heals you for ${amount}.` }];
    }
    case 'death': return ev.id === me ? [{ ch: 'error', text: 'You have died. You wake at the last lantern you touched.' }] : (ev.killer === me ? [{ ch: 'combat', text: `${nameOf(ev.id)} dies.` }] : []);
    case 'xp': return ev.id === me ? [{ ch: 'xp', text: `You gain ${Math.round(ev.amount).toLocaleString('en-US')} experience.` }] : [];
    case 'level': return ev.id === me ? [{ ch: 'system', text: `You reach level ${ev.level}!` }] : [];
    case 'loot': {
      if (ev.id !== me) return [];
      const out = [];
      if (ev.gold) out.push({ ch: 'loot', text: `You loot ${ev.gold} gold.` });
      for (const it of ev.items || []) out.push({ ch: 'loot', text: `You receive: ${it.name || it.item}${it.qty > 1 ? ` x${it.qty}` : ''}.` });
      return out;
    }
    case 'quest': {
      if (ev.id !== me) return [];
      const q = ev.questName || ev.quest;
      if (ev.kind === 'accept') return [{ ch: 'system', text: `Quest accepted: ${q}` }];
      if (ev.kind === 'progress') return [{ ch: 'system', text: `${ev.objectiveText || q}: ${ev.cur}/${ev.need}` }];
      if (ev.kind === 'complete') return [{ ch: 'system', text: `${q} (Complete)` }];
      if (ev.kind === 'turnin') return [{ ch: 'system', text: `Quest done: ${q}` }];
      if (ev.kind === 'abandon') return [{ ch: 'system', text: `Quest abandoned: ${q}` }];
      return [];
    }
    case 'lantern': return ev.id === me ? [{ ch: 'system', text: 'The lantern knows your name now. You will wake here.' }] : [];
    default: return [];
  }
}
