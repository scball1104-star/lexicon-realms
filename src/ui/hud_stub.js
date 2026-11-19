// MINIMAL HUD STUB (foundation only; the real HUD is another agent's and replaces this file's use in main.js).
// Reads only the view model (src/core/viewmodel.js). Draws on the 640x360 HUD layer: player frame, target frame,
// zone name, and the last few log lines.
//
//   const hud = createHudStub(font)      font: a BitmapFont (src/core/font.js)
//   hud.draw(ctx, vm)

export function createHudStub(font) {
  function bar(ctx, x, y, w, h, frac, fg, bg = '#2a2438') {
    ctx.fillStyle = '#14101e'; ctx.fillRect(x - 1, y - 1, w + 2, h + 2);
    ctx.fillStyle = bg; ctx.fillRect(x, y, w, h);
    ctx.fillStyle = fg; ctx.fillRect(x, y, Math.round(w * Math.max(0, Math.min(1, frac))), h);
  }
  function frame(ctx, x, y, u, hostile) {
    ctx.fillStyle = 'rgba(20,16,30,0.78)'; ctx.fillRect(x, y, 130, 34);
    ctx.fillStyle = hostile ? '#e06b39' : '#6ab3e4'; ctx.fillRect(x, y, 130, 1);
    font.draw(ctx, u.name, x + 4, y + 3, { color: hostile ? 'orange' : 'white' });
    font.draw(ctx, `Lv ${u.level}`, x + 126, y + 3, { color: 'gold', align: 'right' });
    bar(ctx, x + 4, y + 16, 122, 5, u.hpFrac, '#8fe07a');
    font.draw(ctx, `${u.hp}/${u.hpMax}`, x + 126, y + 22, { color: 'gray', align: 'right' });
    if (u.res) bar(ctx, x + 4, y + 24, 70, 3, u.res.frac, '#6ab3e4');
  }
  return {
    draw(ctx, vm) {
      if (vm.player) frame(ctx, 6, 6, vm.player, false);
      if (vm.target) frame(ctx, 142, 6, vm.target, vm.target.faction === 'hostile');
      if (vm.zone) font.draw(ctx, vm.zone.name, 634, 6, { color: 'cream', align: 'right' });
      const lines = vm.log.slice(-4);
      lines.forEach((l, i) => font.draw(ctx, l, 6, 300 + i * 11, { color: 'gray' }));
    },
  };
}
