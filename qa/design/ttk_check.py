# Expected-value time-to-kill sim for Lexicon Realms design numbers. No RNG: crit folded in as a mean.
import math, sys

CRIT = 1 + 0.05 * 0.5   # 5% crit at x1.5

def mob_hp(L): return round(100 + 40 * L + 0.6 * L * L)
def mob_hit(L): return 2 + 2.2 * L          # per swing, 2.0 s swing
def wdps(ilvl): return 2.2 + 0.85 * ilvl
ARMOR = {'plate': (40, 22), 'mail': (30, 16), 'leather': (20, 11), 'cloth': (10, 5)}
def armor(kind, L): a, b = ARMOR[kind]; return a + b * L
def dr(arm, atkL): return arm / (arm + 40 * atkL + 100)

CLASSES = {
  'warden':    dict(sta=(12, 1.5), str=(12, 1.5), agi=(7, .5),  int=(4, .2),  spi=(6, .4),  arm='plate',   hpb=60, main='str'),
  'mender':    dict(sta=(10, 1.0), str=(6, .4),   agi=(6, .4),  int=(11, 1.3), spi=(12, 1.3), arm='cloth', hpb=30, main='int'),
  'scribe':    dict(sta=(9, .9),   str=(5, .3),   agi=(6, .4),  int=(13, 1.6), spi=(10, 1.0), arm='cloth', hpb=30, main='int'),
  'wayfinder': dict(sta=(10, 1.1), str=(7, .5),   agi=(13, 1.6), int=(6, .4),  spi=(8, .6),  arm='mail',   hpb=30, main='agi'),
  'inkblade':  dict(sta=(10, 1.1), str=(8, .6),   agi=(13, 1.6), int=(4, .2),  spi=(6, .4),  arm='leather', hpb=30, main='agi'),
}

def stats(c, L):
  d = CLASSES[c]; s = {}
  for k in ('sta', 'str', 'agi', 'int', 'spi'):
    b, g = d[k]; s[k] = math.floor(b + g * (L - 1))
  gear = math.floor(0.7 * L)          # expected gear bonus to main stat and stamina at level L
  s[d['main']] += gear; s['sta'] += gear
  s['hp'] = 10 * s['sta'] + d['hpb']
  s['ap'] = 2 * s[d['main']] if d['main'] != 'int' else 2 * s['str']
  s['sp'] = s['int'] if d['main'] == 'int' else 0
  s['mana'] = 50 + 15 * s['int'] if d['main'] == 'int' else 0
  s['mregen'] = 0.4 * s['spi'] if d['main'] == 'int' else 0   # mana per second in combat
  s['armor'] = armor(d['arm'], L)
  return s

def sim(c, L, verbose=False):
  s = stats(c, L); hp = mob_hp(L); t = 0.0; dt = 0.05
  dealt = 0.0; taken = 0.0; gcd = 0.0; cast = None; cds = {}; mana = s['mana']; res = 0.0 if c == 'warden' else 100.0
  swing = 0.0; marks = 0; dots = []  # (end, dps)
  mob_swing = 1.0; mana_used = 0; heal = 0.0
  ilvl = L; ap = s['ap']; sp = s['sp']
  if c == 'warden': wspeed, wmul = 2.4, 1.0
  elif c == 'inkblade': wspeed, wmul = 1.6, 0.85
  elif c == 'wayfinder': wspeed, wmul = 2.6, 1.0
  else: wspeed, wmul = 3.0, 0.75
  def whit(m=1.0): return wspeed * (wdps(ilvl) * wmul + ap / 14) * m
  def ready(a): return cds.get(a, 0) <= t
  log = []
  while hp - dealt > 0 and t < 120:
    # dots
    for e, dps in dots:
      if t < e: dealt += dps * dt
    # auto attack (casters don't melee unless out of mana; they stand at range)
    if c in ('warden', 'inkblade', 'wayfinder'):
      swing -= dt
      if swing <= 0 and cast is None:
        dealt += whit() * CRIT; swing = wspeed
        if c == 'warden': res = min(100, res + 10)
        if c == 'inkblade':  # off-hand
          dealt += whit(0.5) * CRIT
    # mob hits: melee mob reaches ranged after ~2.5 s unless rooted/slowed; casters kite so assume reach at 3 s
    reach = 0 if c in ('warden', 'inkblade') else 3.0
    if t >= reach:
      mob_swing -= dt
      if mob_swing <= 0:
        dmg = mob_hit(L) * (1 - dr(s['armor'], L)); taken += dmg; mob_swing = 2.0
        if c == 'warden': res = min(100, res + 3)
    # resources
    if c in ('wayfinder', 'inkblade'): res = min(100, res + (5 if c == 'wayfinder' else 10) * dt)
    if s['mana']: mana = min(s['mana'], mana + s['mregen'] * dt)
    # casting
    if cast:
      cast[0] -= dt
      if cast[0] <= 0: dealt += cast[1] * CRIT; cast = None
      t += dt; gcd -= dt; continue
    if gcd > 0: gcd -= dt; t += dt; continue
    act = None
    if c == 'warden':
      if ready('bash'):
        act = 'bash'; dealt += (3 + 1.5 * L + 0.25 * ap) * CRIT; res = min(100, res + 15); cds['bash'] = t + 6
      elif L >= 10 and res >= 60 and ready('sweep'):
        act = 'sweep'; dealt += (whit(0.7) + 2 + L) * CRIT; res -= 25; cds['sweep'] = t + 6
      elif res >= 20:
        act = 'strike'; dealt += (whit(1.0) + 3 + 2.6 * L) * CRIT; res -= 20
    elif c == 'mender':
      if L >= 3 and ready('brand'):
        cost = 9 + 1.6 * L
        if mana >= cost:
          act = 'brand'; mana -= cost; mana_used += cost; dots.append((t + 12, (14 + 5 * L + 0.6 * sp) / 12)); cds['brand'] = t + 12
      if not act:
        cost = 7 + 1.4 * L
        if mana >= cost:
          act = 'kindle'; mana -= cost; mana_used += cost; cast = [1.5, 8 + 4.2 * L + 0.55 * sp]
    elif c == 'scribe':
      if ready('scrawl') and mana >= 6 + 1.5 * L:
        cost = 6 + 1.5 * L; act = 'scrawl'; mana -= cost; mana_used += cost; dealt += (5 + 2 * L + 0.3 * sp) * CRIT; cds['scrawl'] = t + 6
      elif L >= 6 and ready('underline') and mana >= 10 + 2 * L:
        cost = 10 + 2 * L; act = 'underline'; mana -= cost; mana_used += cost; dots.append((t + 12, (10 + 4 * L + 0.5 * sp) / 12)); cds['underline'] = t + 12
      elif mana >= 8 + 1.8 * L:
        cost = 8 + 1.8 * L; act = 'inkbolt'; mana -= cost; mana_used += cost; cast = [2.0, 12 + 5.4 * L + 0.8 * sp]
    elif c == 'wayfinder':
      if L >= 10 and ready('aimed') and res >= 30:
        act = 'aimed'; res -= 30; cds['aimed'] = t + 8; cast = [2.0, whit(1.4) + 6 + 3 * L]
      elif ready('pin') and res >= 15:
        act = 'pin'; res -= 15; dealt += (whit(0.5) + 2 + L) * CRIT; cds['pin'] = t + 8
      elif res >= 25:
        act = 'quick'; res -= 25; dealt += (whit(0.7) + 3 + 1.5 * L) * CRIT
      if L >= 3 and ready('trap') and t < 0.1:
        dealt += (4 + 2 * L) ; cds['trap'] = t + 15   # trap fires on the pull
    elif c == 'inkblade':
      if L >= 10 and marks >= 3 and ready('bleed') and res >= 25:
        act = 'bleed'; res -= 25; dots.append((t + 12, (marks * (5 + 2.2 * L + 0.12 * ap)) / 12 * 1.0)); marks = 0; cds['bleed'] = t + 12
      elif marks >= 3 and res >= 25:
        act = 'spill'; res -= 25; dealt += marks * (4 + 1.8 * L + 0.1 * ap) * CRIT; marks = 0
      elif res >= 30:
        act = 'nick'; res -= 30; dealt += (whit(0.9) + 2 + 1.2 * L) * CRIT; marks = min(3, marks + 1)
    if act:
      log.append((round(t, 2), act)); gcd = 1.0
    t += dt
  return dict(cls=c, L=L, mob_hp=hp, ttk=round(t, 1), taken=round(taken), hp=s['hp'], pct=round(100 * taken / s['hp']),
              mana=s['mana'], mana_used=round(mana_used), stats=s, log=log[:12] if verbose else None)

if __name__ == '__main__':
  print(f"{'class':10} {'L':>2} {'mobHP':>5} {'TTK':>5} {'dmg_in':>6} {'myHP':>5} {'%HP':>4} {'mana':>5} {'used':>5}")
  for c in CLASSES:
    for L in (1, 8, 15):
      r = sim(c, L)
      print(f"{c:10} {L:>2} {r['mob_hp']:>5} {r['ttk']:>5} {r['taken']:>6} {r['hp']:>5} {r['pct']:>4} {r['mana']:>5} {r['mana_used']:>5}")
  if len(sys.argv) > 2:
    import pprint; pprint.pprint(sim(sys.argv[1], int(sys.argv[2]), True))
