// Event bus: main.js publishes each tick's sim events here; audio, the HUD log, floating text and (phase 2) the
// net layer subscribe. Listeners must not mutate events (they are shared). docs/CONTRACTS.md section 11.
//
//   const bus = createBus();  const off = bus.on('damage', fn);  bus.on('*', fn);  bus.publish(events)

export function createBus() {
  const subs = new Map();
  return {
    on(type, fn) {
      if (!subs.has(type)) subs.set(type, new Set());
      subs.get(type).add(fn);
      return () => subs.get(type).delete(fn);
    },
    publish(events) {
      for (const ev of events) {
        for (const fn of subs.get(ev.type) || []) fn(ev);
        for (const fn of subs.get('*') || []) fn(ev);
      }
    },
  };
}
