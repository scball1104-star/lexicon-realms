// Fixed-tick loop with render interpolation.
//
//   const loop = createLoop({ hz: 20, tick(), render(alpha, nowMs) })
//   loop.start(); loop.stop(); loop.stepOnce()   (stepOnce: tests and headless drivers)
//
// tick() runs at exactly `hz` per second of wall time (accumulator; at most `maxCatchUp` ticks per frame, the rest is
// dropped so a hidden tab does not fast-forward). render(alpha) runs once per animation frame, alpha in [0, 1) = how far
// the wall clock is between the last tick and the next. Wall time (performance.now) lives here, never in the sim.

export function createLoop({ hz = 20, tick, render, maxCatchUp = 5 }) {
  const dt = 1000 / hz;
  let acc = 0, last = 0, running = false, raf = 0;
  const frame = (now) => {
    if (!running) return;
    if (!last) last = now;
    acc += Math.min(1000, now - last);
    last = now;
    let n = 0;
    while (acc >= dt && n < maxCatchUp) { tick(); acc -= dt; n++; }
    if (n === maxCatchUp && acc >= dt) acc = 0;
    render(acc / dt, now);
    raf = requestAnimationFrame(frame);
  };
  return {
    start() { if (running) return; running = true; last = 0; acc = 0; raf = requestAnimationFrame(frame); },
    stop() { running = false; cancelAnimationFrame(raf); },
    stepOnce() { tick(); },
    get running() { return running; },
  };
}
