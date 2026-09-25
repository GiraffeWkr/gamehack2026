/**
 * Why does the archer not fire?
 *
 * `stepAutoFire` gates on `!this.moving`, and `moving` is set by `stepPlayer` from
 * the distance to the nearest enemy ahead. If the character never stops, he never
 * shoots - which would also explain "the bow attack does not hit the portal".
 */
import { Game, type InputState } from '../game/game.js';
import { WORLD } from '../content/data.js';

const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };

function report(label: string, game: Game): void {
  const nearest = game['nearestEnemyAhead']();
  console.log(
    `${label.padEnd(22)} px=${game.px.toFixed(0).padStart(6)} ` +
    `moving=${String(game.isMoving()).padEnd(5)} ` +
    `nearest=${nearest ? nearest.type + '@' + nearest.x.toFixed(0) : 'none'} ` +
    `dist=${nearest ? (nearest.x - game.px).toFixed(0) : '-'} ` +
    `stopDist=${game['stopDistance'].toFixed(0)} ` +
    `proj=${game.getProjectileList().length}`,
  );
}

console.log('== natural run: does he ever stop and shoot? ==');
{
  const game = new Game({ seed: 4242, level: 1 });
  let stoppedFrames = 0;
  let firedFrames = 0;
  for (let f = 0; f < 40 * 60; f++) {
    game.tick(1 / 60, input);
    if (!game.isMoving()) stoppedFrames++;
    if (game.getProjectileList().length > 0) firedFrames++;
  }
  console.log(`  frames stopped: ${stoppedFrames}/2400   frames with an arrow in flight: ${firedFrames}`);
  report('end of run', game);
  console.log(`  kills=${game.snapshot().kills}`);
}

console.log('\n== after clearing every pack, facing the portal ==');
{
  const game = new Game({ seed: 31, level: 1 });
  for (const e of game.getEnemyList()) {
    if (e.packId >= 0) {
      (e as { hp: number; alive: boolean }).hp = 0;
      (e as { alive: boolean }).alive = false;
    }
  }
  // Let the pack-cleared state settle.
  for (let i = 0; i < 5; i++) game.tick(1 / 60, input);
  report('at start', game);

  const portal = game.getEnemyList().find((e) => e.isPortal);
  console.log(`  portal x=${portal?.x.toFixed(0)} alive=${portal?.alive} isPortal=${portal?.isPortal}`);
  console.log(`  portalActive=${game.snapshot().portalActive} playerStartY=${WORLD.playerStartY}`);

  for (let s = 1; s <= 5; s++) {
    for (let i = 0; i < 4 * 60; i++) game.tick(1 / 60, input);
    report(`t=${s * 4}s`, game);
  }
}
