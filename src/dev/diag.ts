/**
 * Combat-feel diagnostic.
 *
 * Prints a timeline of what the player can actually SEE: how long the opening
 * walk takes, whether arrows exist while a pack is on screen, and what a skill
 * cast does to the arrow count. Written because the reported symptoms ("no
 * enemies", "he does not shoot", "skills do nothing") all look identical from the
 * outside and need separating.
 *
 * Run with: node dist-verify/dev/diag.js
 */
import { Game, type InputState } from '../game/game.js';
import { CAMERA, WORLD } from '../content/data.js';
import { CHARACTERS, DESIGN } from '../content/art.js';

/** World units visible horizontally, matching the renderer. */
const VIEW_W = DESIGN.width;
/** Assume a phone-landscape viewport; only the aspect matters for what is visible. */
const VIEW_H = 430;

function visibleWidthUnits(): number {
  return VIEW_W;
}

function visibleHeightUnits(scale: number): number {
  return VIEW_H / scale;
}

function screenX(worldX: number, cameraX: number, scale: number): number {
  return (worldX - cameraX) * scale + (VIEW_W * scale) / 2;
}

function main(): void {
  const game = new Game({ seed: 288089883, level: 1 });
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };

  const scale = VIEW_H / 600; // arbitrary but representative
  const visH = visibleHeightUnits(scale);
  console.log(`viewport assumption: ${VIEW_W}x${Math.round(visH)} world units visible`);
  console.log(`player starts at x=${game.px}, framed at ` + (CAMERA.characterScreenX * 100).toFixed(0) + `% of the viewport width`);
  console.log('');

  // Where is the nearest enemy at t=0, and how long until it is on screen?
  const all = game.getEnemyList().filter((e) => e.alive && !e.isPortal);
  const firstX = Math.min(...all.map((e) => e.x));
  const dist = firstX - game.px;
  console.log(`nearest enemy world x = ${firstX.toFixed(0)}  (distance ${dist.toFixed(0)})`);
  console.log(`enemy band y = ${WORLD.minY}..${WORLD.maxY}`);
  console.log('');

  // Simulate the walk with the player aiming at nothing, and report when the
  // first enemy enters the frame and when the first arrow exists.
  let firstEnemyOnScreen = -1;
  let firstArrow = -1;
  let firstKill = -1;
  let skillCasts = 0;
  let arrowsAfterSkill = 0;

  const dt = 1 / 60;
  const MAX = 120 * 60;
  for (let f = 0; f < MAX; f++) {
    const t = f * dt;

    // Cast Multishot the moment the first enemy is visible, to see what changes.
    const onScreenNow = game.getEnemyList().filter((e) => {
      if (!e.alive || e.isPortal) return false;
      const sx = screenX(e.x, game.px - (VIEW_W * (0.5 - CAMERA.characterScreenX)), scale);
      return sx > 0 && sx < VIEW_W * scale;
    });
    if (firstEnemyOnScreen < 0 && onScreenNow.length > 0) {
      firstEnemyOnScreen = t;
      if (game.castSkill('Multishot')) {
        skillCasts++;
        arrowsAfterSkill = game.getArrowList().length;
      }
    }

    // Aim at the nearest visible enemy, like a player tapping.
    const target = onScreenNow[0];
    if (target) {
      input.aimX = target.x;
      input.aimY = target.y;
      input.taps = 1;
    }
    game.tick(dt, input);
    input.taps = 0;

    if (firstArrow < 0 && game.getArrowList().length > 0) firstArrow = t;
    if (firstKill < 0 && game.snapshot().kills > 0) firstKill = t;
  }

  const snap = game.snapshot();
  console.log('TIMELINE');
  console.log(`  first enemy on screen : ${firstEnemyOnScreen.toFixed(1)}s`);
  console.log(`  first arrow spawned   : ${firstArrow.toFixed(1)}s`);
  console.log(`  first kill            : ${firstKill.toFixed(1)}s`);
  console.log(`  multishot casts       : ${skillCasts}  (arrows right after cast: ${arrowsAfterSkill})`);
  console.log('');
  console.log(`after 120s: packs ${snap.packsCleared}/${snap.packsTotal}, kills ${snap.kills}, gold ${snap.gold}, hp ${snap.playerHp}/${snap.playerMaxHp}`);
  console.log('');

  // Damage math: how many hits does one arrow-fall need at level 1?
  const dmg = game['damage'] as number;
  console.log('DAMAGE MATH');
  console.log(`  player Damage stat        : ${dmg}`);
  console.log(`  arrow-fall multiplier     : ${game['damage'] !== undefined ? '1.5' : '?'}`);
  console.log(`  level 1 enemy HP          : 3 (x archetype multiplier)`);
  console.log(`  hits to kill a Claw (x1.0): ${Math.ceil(3 / (dmg * 1.5))}`);
  console.log(`  hits to kill a Warrior(x2.2): ${Math.ceil((3 * 2.2) / (dmg * 1.5))}`);
  console.log('');

  // What art does each enemy type actually resolve to?
  console.log('ENEMY ART');
  for (const type of ['Claw', 'Warrior', 'Archer', 'Mage', 'Bat', 'Guardian', 'RunPortal'] as const) {
    const def = CHARACTERS[type];
    console.log(`  ${type.padEnd(10)} -> ${def ? def.file + '  h=' + def.height : 'MISSING'}`);
  }
  void visibleWidthUnits;

  // --- Verify the two attack channels are genuinely distinct -----------------
  console.log('');
  console.log('ATTACK CHANNELS');
  {
    const g2 = new Game({ seed: 4242, level: 1 });
    const inp: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };
    let framesWithBow = 0;
    let framesWithSky = 0;
    let bowsSeen = 0;
    let skiesSeen = 0;
    const dt2 = 1 / 60;
    for (let f = 0; f < 40 * 60; f++) {
      // Never tap, so only the archer's own attack can fire.
      g2.tick(dt2, inp);
      const b = g2.getProjectileList().length;
      const s = g2.getArrowList().length;
      if (b > 0) { framesWithBow++; bowsSeen += b; }
      if (s > 0) { framesWithSky++; skiesSeen += s; }
    }
    console.log(`  bow arrows over 40s (no tap) : ${bowsSeen} across ${framesWithBow} frames`);
    console.log(`  sky arrows over 40s (no tap) : ${skiesSeen} across ${framesWithSky} frames`);
    console.log(`  -> archer shoots unaided     : ${bowsSeen > 0 ? 'YES' : 'NO'}`);
    console.log(`  -> arrow rain needs a tap    : ${skiesSeen === 0 ? 'YES' : 'NO'}`);
    console.log(`  kills from the bow alone     : ${g2.snapshot().kills}`);

    const g3 = new Game({ seed: 777, level: 1 });
    const inp3: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };
    let maxSky = 0;
    for (let f = 0; f < 20 * 60; f++) {
      inp3.aimX = g3.px + 400;
      inp3.aimY = 50;
      inp3.taps = 1;
      g3.tick(dt2, inp3);
      inp3.taps = 0;
      if (g3.getArrowList().length > maxSky) maxSky = g3.getArrowList().length;
    }
    console.log(`  max simultaneous sky arrows  : ${maxSky} (tapping)`);
    console.log(`  fired / refused for no ammo  : ${g3.shotsFired} / ${g3.shotsBlocked}`);
  }
}

main();
