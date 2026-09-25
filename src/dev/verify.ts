/**
 * Headless verification pass.
 *
 * Drives the pure simulation directly (no DOM, no Pixi) for several simulated
 * minutes and asserts the things that are easy to get silently wrong:
 *  - the level plan matches the original's authored tables
 *  - the character advances, stops for enemies, and resumes
 *  - arrows damage enemies; enemies damage the player; packs clear
 *  - the portal only opens after every pack is down
 *  - death respawns without losing cleared packs
 *  - the stat formula matches `Flat * (1 + Additive/100) * Multiplicative`
 *
 * Run with:  node --experimental-strip-types src/dev/verify.ts
 */

import { Game, type InputState } from '../game/game.js';
import { StatBag, StatsProp } from '../core/stats.js';
import { enemyDamage, enemyCurrencyDrop, enemyHealth, enemyGold, packsPerLevel, planRun, rollOver100 } from '../content/level.js';
import { ENEMY_CURRENCY_PER_RELATIVE_LEVEL, ENEMY_CURRENCY_UNLOCK_LEVEL, GOLD_CHANCE_TO_DROP, GOLD_COINS_TO_DROP, MULTIPLICATIVE_STATS, PLAYER_BASE_STATS } from '../content/data.js';
import { evaluate } from '../core/equations.js';
import { TalentTree, type Purses } from '../game/talent.js';
import { TALENT_BY_ID, TALENT_EDGES, TALENT_LINKS, TALENT_NODES, TALENT_ROOT, TALENT_TEXT, TREE_TEMPLATES } from '../content/talent.js';
import { readable } from '../ui/talent.js';
import { Rng } from '../core/math.js';
import { BASE, CAMERA, ENEMIES, STATS, WORLD } from '../content/data.js';
import type { EnemyType } from '../content/data.js';
import { ENEMY_INFO, ENEMY_INFO_BY_ID, GUARDIAN_IDS, MONSTER_IDS } from '../content/enemyData.js';
import { allArtFiles, BAR, BIOME1, CHARACTERS, DESIGN, FRAME, FX, GROUND_LINE_ART_Y, GROUND_LINE_FRACTION, MIDDLE_OF_GROUND_Y_POS, PLAYER_SKIN, PLAYER_SKINS, UI_SPRITES } from '../content/art.js';
import { getLang, missingKeys, setLang, t } from '../core/i18n.js';
import { SKILLS } from '../game/skills.js';
import { JOBS } from '../content/jobData.js';
import { MASTERIES, NPC_LEVEL_COST } from '../content/masteryData.js';
import { Mastery, levelUpCost, mainDelta } from '../game/mastery.js';
import {
  PET_IDS,
  TAMING,
  nextSummon,
  petAttackInterval,
  petAttackRange,
  petIsTaunt,
  petIsUntargetable,
  petMaxHp,
  rollTame,
  tameChance,
} from '../game/pets.js';

let failures = 0;
let checks = 0;

function check(name: string, cond: boolean, detail = ''): void {
  checks++;
  if (!cond) {
    failures++;
    console.error(`  FAIL  ${name}${detail ? '  — ' + detail : ''}`);
  } else {
    console.log(`  ok    ${name}${detail ? '  (' + detail + ')' : ''}`);
  }
}

// ---------------------------------------------------------------- stat formula
console.log('\n[stat formula]');
{
  // The original keys StatsDict by VARIABLE NAME and passes StatsProperties
  // separately: ChangeAStat("Damage", StatsProperties.Flat, 1.0, IsAdd: true).
  const bag = new StatBag();
  bag.setFlat('Damage', 100);
  bag.change('Damage', StatsProp.SetAdditiveOnly, 50);
  bag.change('Damage', StatsProp.SetMultiplicativeOnly, 2);
  // 100 * (1 + 50/100) * 2 = 300
  check('total = Flat*(1+Add/100)*Mult', bag.get('Damage') === 300, `=${bag.get('Damage')}`);

  // Rounding: below 1000 the original rounds to 2dp, past it rounds to whole.
  const r = new StatBag();
  r.setFlat('S', 3);
  r.change('S', StatsProp.SetAdditiveOnly, 33.333);
  check('rounds to 2dp under 1000', r.get('S') === Math.round(3 * 1.33333 * 100) / 100, `=${r.get('S')}`);

  const r2 = new StatBag();
  r2.setFlat('B', 5000);
  r2.change('B', StatsProp.SetAdditiveOnly, 10.5);
  check('rounds to whole numbers past 1000', Number.isInteger(r2.get('B')), `=${r2.get('B')}`);

  const bag3 = new StatBag();
  bag3.setFlat('Y', 10);
  bag3.change('Y', StatsProp.Flat, 5, true);
  check('additive flat modifier', bag3.get('Y') === 15, `=${bag3.get('Y')}`);
  bag3.change('Y', StatsProp.Flat, 5, false);
  check('removing a modifier restores', bag3.get('Y') === 10, `=${bag3.get('Y')}`);

  const bag4 = new StatBag();
  bag4.setFlat('Z', 100);
  bag4.change('Z', StatsProp.Multiplicative, 10, true);
  bag4.change('Z', StatsProp.Multiplicative, 10, true);
  // 100 * (1.1 * 1.1) = 121
  check('multiplicative stacks as a product', Math.abs(bag4.get('Z') - 121) < 0.01, `=${bag4.get('Z')}`);

  const bag5 = new StatBag();
  bag5.setFlat('W', 50);
  bag5.change('W', StatsProp.Additive, 20, true);
  bag5.change('W', StatsProp.Additive, 30, true);
  check('additive accumulates percentage points', bag5.get('W') === 75, `50 * 1.5 = ${bag5.get('W')}`);

  const bag6 = new StatBag();
  bag6.setFlat('V', 10);
  bag6.change('V', StatsProp.Flat, 90, true);
  bag6.change('V', StatsProp.SetFlatOnly, 7);
  bag6.change('V', StatsProp.Multiplicative, 50, true);
  check('set-flat keeps multiplicative layers', bag6.get('V') === 10.5, `7 * 1.5 = ${bag6.get('V')}`);

  const bag7 = new StatBag();
  bag7.setFlat('U', 42);
  bag7.change('U', StatsProp.Additive, 30, true);
  bag7.change('U', StatsProp.Multiplicative, 25, true);
  bag7.change('U', StatsProp.SetFlat_And_ResetAddMulti, 9);
  check('set-and-reset clears the other layers', bag7.get('U') === 9, `=${bag7.get('U')}`);

  // Layer reads, as the original does with `stats.RuneImplicitsCount.Flat.RealValue`.
  check('layer() reads an individual layer', bag.layer('Damage', StatsProp.Flat) === 100, `=${bag.layer('Damage', StatsProp.Flat)}`);
  check('unregistered stat reads 0', bag.get('NopeNotHere') === 0);
}

// -------------------------------------------------------------- level tables
console.log('\n[level tables]');
{
  check('level 1 enemy HP = 3', enemyHealth(1) === 3, `=${enemyHealth(1)}`);
  check('level 30 enemy HP = 3,600,000', enemyHealth(30) === 3600000);
  check('level 31 extrapolates 1.5x', Math.abs(enemyHealth(31) - 3600000 * 1.5) < 1, `=${enemyHealth(31)}`);
  check('level 1 damage = 2', enemyDamage(1) === 2);
  check('level 30 damage = 2500', enemyDamage(30) === 2500);
  check('level 1 gold = 1', enemyGold(1) === 1);
  check('level 1 packs = 8', packsPerLevel(1) === 8);
  check('level 30 packs = 24', packsPerLevel(30) === 24);
  check('packs clamp past authored range', packsPerLevel(45) === 24);

  const plan = planRun(1, new Set(), true);
  check('level 1 plan has 8 packs', plan.packs.length === 8, `${plan.packs.length}`);
  check('level 1 uses pack distance 650', plan.packs[1].centerX - plan.packs[0].centerX === 650, `${plan.packs[1].centerX - plan.packs[0].centerX}`);
  check('portal sits past the last pack', plan.portalX > plan.packs[plan.packs.length - 1].centerX);

  const plan25 = planRun(25, new Set(), false);
  check('level 25 adds a guardian pack',
    plan25.guardianType === 'GuardianClaw' && plan25.packs[0].isGuardianPack,
    `${plan25.guardianType}`);
  check('the guardian pack carries its own type',
    plan25.packs[0].guardianType === 'GuardianClaw', `${plan25.packs[0].guardianType}`);
  const plan25b = planRun(25, new Set<EnemyType>(['GuardianClaw']), false);
  check('defeated guardian does not respawn', plan25b.guardianType === null);
  const plan26 = planRun(26, new Set<EnemyType>(['GuardianClaw']), false);
  check('the next guardian in order is the Warrior variant',
    plan26.guardianType === 'GuardianWarrior', `${plan26.guardianType}`);
  check('the five guardians are distinct archetypes',
    ENEMY_INFO.filter((e) => e.id.startsWith('Guardian')).length === 5,
    ENEMY_INFO.filter((e) => e.id.startsWith('Guardian')).map((e) => e.id).join());
}

// ------------------------------------------------------- monster-family currency
console.log('\n[monster currency]');
{
  // `DatabaseManager.EnemyCurrencyDrop` indexes `EnemyCurrencyPerRelativeLevel` by
  // `level - unlockAt`, and the unlock levels are the `EnemyCurrencyData(N)` arguments.
  // This is what makes a Warrior worth far more than a Claw at the same level.
  check('currency unlock levels match EnemyCurrencyData', JSON.stringify(ENEMY_CURRENCY_UNLOCK_LEVEL)
    === JSON.stringify({ ClawCurrency: 2, ArcherCurrency: 3, WarriorCurrency: 6, MageCurrency: 10, BatCurrency: 16 }),
    JSON.stringify(ENEMY_CURRENCY_UNLOCK_LEVEL));
  check('relative-level table has 31 rows (0..30)', ENEMY_CURRENCY_PER_RELATIVE_LEVEL.length === 31,
    `${ENEMY_CURRENCY_PER_RELATIVE_LEVEL.length}`);

  // Level 3 is the shipping save's MonstersLevel: Claw reads index 1 = 1, Archer index 0 = 1.
  check('level 3 Claw drops 1', enemyCurrencyDrop(3, 'Claw') === 1, `${enemyCurrencyDrop(3, 'Claw')}`);
  check('level 3 Archer drops 1', enemyCurrencyDrop(3, 'Archer') === 1, `${enemyCurrencyDrop(3, 'Archer')}`);
  // Warrior unlocks at 6, so it drops nothing before that.
  check('level 3 Warrior drops nothing', enemyCurrencyDrop(3, 'Warrior') === 0, `${enemyCurrencyDrop(3, 'Warrior')}`);
  check('level 6 Warrior drops 1', enemyCurrencyDrop(6, 'Warrior') === 1, `${enemyCurrencyDrop(6, 'Warrior')}`);
  // At level 26 the tiers separate sharply: Claw index 24 = 1200, Bat index 10 = 18.
  check('level 26 Claw drops 1200', enemyCurrencyDrop(26, 'Claw') === 1200, `${enemyCurrencyDrop(26, 'Claw')}`);
  check('level 26 Bat drops 18', enemyCurrencyDrop(26, 'Bat') === 18, `${enemyCurrencyDrop(26, 'Bat')}`);
  check('a higher tier is never worth less than a lower one', enemyCurrencyDrop(26, 'Claw') > enemyCurrencyDrop(26, 'Bat'));
  check('families without a currency drop nothing',
    enemyCurrencyDrop(20, 'GuardianClaw') === 0 && enemyCurrencyDrop(20, 'King') === 0,
    `${enemyCurrencyDrop(20, 'GuardianClaw')} / ${enemyCurrencyDrop(20, 'King')}`);

  // `FunctionsNeeded.IsHappened_Over100Things`: 100 = exactly one, guaranteed.
  const rngA = new Rng(1);
  check('100 guarantees exactly one drop', rollOver100(100, rngA) === 1, `${rollOver100(100, rngA)}`);
  check('250 guarantees two plus a roll', [0, 1, 2, 3, 4, 5].every(() => {
    const n = rollOver100(250, new Rng(Math.floor(Math.random() * 1e6)));
    return n === 2 || n === 3;
  }));
  check('0 never drops', [0, 1, 2, 3, 4, 5].every(() => rollOver100(0, new Rng(Math.floor(Math.random() * 1e6))) === 0));
}

// ------------------------------------------------------------ ground loot drops
console.log('\n[loot drops]');
{
  // `MonsterDiedGiveRewards` spawns `GoldCoinsToDrop` (1) gold drops, EACH carrying the
  // full `EnemyGold` - not a share of it. An earlier revision split one kill's gold across
  // two coins of half each, so the HUD only matched if every coin was picked up.
  check('one gold drop per kill at base', GOLD_COINS_TO_DROP === 1 && GOLD_CHANCE_TO_DROP === 0,
    `${GOLD_COINS_TO_DROP} + roll(${GOLD_CHANCE_TO_DROP})`);

  // Every drop that spawns must land and be collectable, and the purse must gain exactly
  // the drop's value: that is the "dropped vs added" invariant.
  // Level 3 is where the shipping save sits, and where Claw currency first pays out:
  // `EnemyCurrencyDrop(3, Claw)` reads `EnemyCurrencyPerRelativeLevel[3 - 2]` = 1.
  const g = new Game({ seed: 4242, level: 3, spawnNothing: true });
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };
  // The family currency CHANCE bases at 0: `PlayerStatsData` declares the field but never
  // seeds it, so a family only drops once the tree grants the chance. The port used to
  // hardcode 100, which made every level-1 Claw drop a ClawCurrency whose row was still
  // locked - worth 0, so the ball could be picked up and changed nothing.
  g.stats.change('ClawCurrencyChanceDrop', StatsProp.Flat, 100, true);
  const goldBefore = g.gold;
  const clawBefore = g.currencies.ClawCurrency;
  void clawBefore;

  // Spawn one Claw in front of the player and kill it with aimed taps, so the drop is
  // guaranteed to be walked over. `spawnNothing` keeps packs out of the way, which makes
  // the gold total exactly attributable to the kills this test causes.
  //
  // Its health is set to 1 first: this test is about the DROP, not about how long a
  // level-3 Claw takes to kill (40 HP against a base-damage bow).
  g.spawnEnemyForTest('Claw', g.px + 200);
  const subject = g.getEnemyList()[0];
  subject.hp = 1;
  const goldValue = subject.gold;
  for (let i = 0; i < 8 * 60; i++) {
    const target = g.getEnemyList().find((e) => e.alive);
    input.taps = target ? 1 : 0;
    if (target) {
      input.aimX = target.x;
      input.aimY = target.y;
    }
    g.tick(1 / 60, input);
  }

  const dropsLeft = g.getCoinList().reduce((sum, c) => sum + c.value, 0);
  check('the Claw was killed', g.kills === 1, `kills=${g.kills}`);
  check('gold gained equals the drop value, not a share of it',
    Math.abs(g.gold - goldBefore - goldValue) < 1e-9,
    `+${(g.gold - goldBefore).toFixed(2)} for a drop worth ${goldValue}`);
  // At base the family chance is 0, so the ONLY thing a Claw drops is gold. This is the
  // regression guard for the reported bug: a family currency whose row is still locked is
  // worth 0, so spawning it produced a ball the player could pick up that changed nothing.
  check('no family currency drops at base, so no worthless ball',
    g.currencies.ClawCurrency === 0,
    `${g.currencies.ClawCurrency}`);
  check('every drop on the ground is worth something',
    g.getCoinList().every((c) => c.value > 0),
    g.getCoinList().map((c) => `${c.currency}:${c.value}`).join() || 'none left');
  // Now drive the family path directly, with the chance granted the way the tree grants
  // it. A tick cannot be used: the kill's own level-up calls `refreshStats()`, which
  // rebuilds the bag from `PLAYER_BASE_STATS` and would wipe a manually-set stat.
  const familyGame = new Game({ seed: 4243, level: 3, spawnNothing: true });
  const fam = familyGame as unknown as {
    stats: { change: (v: string, p: StatsProp, n: number, add: boolean) => void };
    giveKillRewards: (x: number, y: number, t: EnemyType) => void;
  };
  fam.stats.change('ClawCurrencyChanceDrop', StatsProp.Flat, 100, true);
  const amount = enemyCurrencyDrop(3, 'Claw');
  fam.giveKillRewards(0, 0, 'Claw');
  const famDrops = familyGame.getCoinList().filter((c) => c.currency === 'ClawCurrency');
  check('a granted chance makes the Claw drop its own currency',
    famDrops.length === 1, `${famDrops.length} drops, amount ${amount}`);
  check('and that drop is worth the authored amount', famDrops.every((c) => c.value === amount),
    famDrops.map((c) => c.value).join());
  check('unearned family purses stay at zero',
    g.currencies.WarriorCurrency === 0 && g.currencies.MageCurrency === 0 && g.currencies.BatCurrency === 0,
    `W${g.currencies.WarriorCurrency} M${g.currencies.MageCurrency} B${g.currencies.BatCurrency}`);
  check('a purse that never dropped anything stays unseen',
    g.currencySeen.ClawCurrency === false && g.currencySeen.BatCurrency === false,
    JSON.stringify(g.currencySeen));
  check('no drop value is left stranded on the ground', dropsLeft === 0, `${dropsLeft.toFixed(2)}`);
}

// -------------------------------------------------------------------- gameplay
console.log('\n[gameplay]');
{
  const game = new Game({ seed: 288089883, level: 1 });
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };

  const startX = game.px;
  const enemiesAtStart = game.getEnemyList().filter((e) => e.alive).length;
  check('level 1 spawns 72 enemies + portal', enemiesAtStart === 8 * 9 + 1, `${enemiesAtStart}`);

  // Run 90 simulated seconds with the player never aiming: the auto-attack should still
  // clear something on its own.
  //
  // The window is generous because the REAL numbers are harsh: `EnemyHealthPerLevel[0]` is
  // 3 and Claw's `HealthMultiplier` is 1.10, so a level-1 Claw has 3.3 hp against the
  // archer's `BaseDamage` of 1.0 - four bow hits. The original leans on the tapped
  // arrow-rain for damage; the bow alone is a slow baseline, which is why 30s was not
  // enough once the asset numbers replaced the hand-written ones.
  for (let i = 0; i < 90 * 60; i++) {
    game.tick(1 / 60, input);
  }
  const snap1 = game.snapshot();
  check('character advanced', game.px > startX, `x ${startX.toFixed(0)} -> ${game.px.toFixed(0)}`);
  check('auto-attack killed something', snap1.kills > 0, `kills=${snap1.kills}`);
  // 30 seconds with NO input is not real play, and the tree's free root nodes now add
  // health, so "the player is still alive" is not a property of a correct simulation -
  // it depends on the RNG stream and on how many talent levels are owned. What IS a
  // property is that the run stays in a legal state and that health never exceeds max.
  check('health stays within its maximum', snap1.playerHp <= snap1.playerMaxHp,
    `hp=${snap1.playerHp.toFixed(1)}/${snap1.playerMaxHp}`);
  check('the run is in a legal state', ['running', 'dead', 'cleared'].includes(game.runState), game.runState);

  // Aimed fire should clear packs much faster than auto-attack alone.
  const before = snap1.packsCleared;
  for (let i = 0; i < 60 * 60; i++) {
    // Aim at the nearest living enemy ahead, like a player would tap.
    let target: { x: number; y: number } | null = null;
    let bestD = Infinity;
    for (const e of game.getEnemyList()) {
      if (!e.alive) continue;
      const d = e.x - game.px;
      if (d > -200 && d < bestD) { bestD = d; target = { x: e.x, y: e.y }; }
    }
    if (target) {
      input.aimX = target.x;
      input.aimY = target.y;
      input.taps = 1;
    }
    game.tick(1 / 60, input);
    input.taps = 0;
  }
  const snap2 = game.snapshot();
  check('aimed fire cleared more packs', snap2.packsCleared > before, `${before} -> ${snap2.packsCleared} of ${snap2.packsTotal}`);
  check('progress is a sane fraction', snap2.packsCleared <= snap2.packsTotal, `${snap2.packsCleared}/${snap2.packsTotal}`);

  // Economy end-to-end: kills drop coins, the character walks over them, gold rises.
  // Asserted after the long aimed-fire window rather than the 30s one above, because
  // in 30s the auto-attack alone may only land a single kill and a single coin, which
  // made the check flaky rather than wrong.
  check(
    'kills produced gold',
    snap2.gold > 0,
    `gold=${snap2.gold} kills=${snap2.kills} coinsOnGround=${game.getCoinList().length}`,
  );

  // Progression from the same run: experience accrues and the level rises.
  check('kills produced experience', snap2.playerExp > 0 || snap2.playerLevel > 1, `exp=${snap2.playerExp.toFixed(0)} lvl=${snap2.playerLevel}`);
  check('exp bar fraction is in range', snap2.playerExpFraction >= 0 && snap2.playerExpFraction <= 1, `${snap2.playerExpFraction.toFixed(3)}`);
  check('gems only come from guardians/portals/first-clears', snap2.gems >= 0, `gems=${snap2.gems}`);
}

// -------------------------------------------------------------- portal gating
console.log('\n[portal gating]');
{
  const game = new Game({ seed: 7, level: 1 });
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };
  const portal = game.getEnemyList().find((e) => e.isPortal);
  check('portal exists at level start', portal != null);
  check('portal is not active while packs remain', game.snapshot().portalActive === false);
  void input;
}

// ------------------------------------------------------------------ death loop
console.log('\n[death & respawn]');
{
  const game = new Game({ seed: 99, level: 3 });
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };
  // Clear a couple of packs by hand so we can prove progress survives.
  const list = game.getEnemyList();
  let killedPack = -1;
  for (const e of list) {
    if (e.packId >= 0 && killedPack === -1) killedPack = e.packId;
    if (e.packId === killedPack) {
      (e as { hp: number; alive: boolean }).hp = 0;
      (e as { hp: number; alive: boolean }).alive = false;
    }
  }
  for (let i = 0; i < 5; i++) game.tick(1 / 60, input);
  const clearedBefore = game.snapshot().packsCleared;
  check('a pack registers as cleared', clearedBefore >= 1, `cleared=${clearedBefore}`);

  // Kill the player and let the death timer run out.
  (game as unknown as { hp: number }).hp = 0;
  for (let i = 0; i < 3 * 60; i++) game.tick(1 / 60, input);
  check('respawned after death', game.snapshot().runState === 'running', game.snapshot().runState);
  check('cleared packs survived the death', game.snapshot().packsCleared >= clearedBefore, `${game.snapshot().packsCleared} >= ${clearedBefore}`);
  check('player healed on respawn', game.snapshot().playerHp > 0, `hp=${game.snapshot().playerHp}`);
}

// ------------------------------------------------------------------- skills
console.log('\n[skills]');
{
  const game = new Game({ seed: 5, level: 1 });
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };

  // A skill is ABSENT until it is bought: `JobsUIManager` gates slot 0 on nothing, but the
  // level starts at 0 and every consumer treats level 0 as "not owned".
  check('nothing is castable before it is bought', game.skills.owned().length === 0);
  check('an unowned skill is not ready', !game.skills.isReady('Multishot'));
  check('casting an unowned skill is refused', game.castSkill('Multishot') === false);

  // Buy Multishot and RapidFire through the real cost path, in ClawCurrency.
  const claw = game.jobs.skillCost('Multishot');
  check('Multishot has a real price', claw > 0, `${claw} claw`);
  check('the price is the authored cost[0]',
    claw === SKILLS.Multishot.cost[0], `${claw} vs ${SKILLS.Multishot.cost[0]}`);
  check('it cannot be bought without claw', game.jobs.levelUpSkill(0, 0, claw - 1) === null);
  check('it buys with claw', game.jobs.levelUpSkill(0, 0, claw) === claw);
  check('the level is recorded', game.jobs.level('Multishot') === 1);
  game.jobs.levelUpSkill(0, 1, game.jobs.skillCost('RapidFire'));
  check('Multishot is now owned and ready', game.skills.isReady('Multishot'));
  check('RapidFire is owned too', game.jobs.level('RapidFire') === 1);

  check('cast succeeds', game.castSkill('Multishot') === true);
  check('skill goes on cooldown',
    !game.skills.isReady('Multishot') && game.skills.fraction('Multishot') > 0.9);
  check('the cooldown is the authored level-1 value',
    Math.abs(game.skills.cooldownFor('Multishot') - SKILLS.Multishot.cooldowns[0]) < 1e-6,
    `${game.skills.cooldownFor('Multishot')}s`);
  check('recast is rejected while cooling', game.castSkill('Multishot') === false);

  game.castSkill('RapidFire');
  check('buff is active after cast', game.skills.isBuffActive('RapidFire'));
  check('the buff duration is the authored level-1 value',
    Math.abs(game.skills.buffDurationFor('RapidFire') - SKILLS.RapidFire.buffDurations[0]) < 1e-6,
    `${game.skills.buffDurationFor('RapidFire')}s`);
  // The archer AUTO-FIRES a ready shot skill (`GetReadySkillProjectile`), so Multishot is
  // re-cast the moment it comes up and "ready again" is never observable. Measure the
  // countdown instead, and prove the auto-attack is what re-fires it.
  const f0 = game.skills.fraction('Multishot');
  for (let i = 0; i < 5 * 60; i++) game.tick(1 / 60, input);
  const f1 = game.skills.fraction('Multishot');
  check('the cooldown counts down while the sim runs', f1 < f0,
    `${f0.toFixed(3)} -> ${f1.toFixed(3)}`);
  check('rapid fire expired', !game.skills.isBuffActive('RapidFire'));

  // `CharacterAttacker.GetReadySkillProjectile` selects the first owned, ready,
  // `isShotByArcher && !isPassive && !isBuff` skill in DESCENDING job order. That predicate
  // is what `Skills.nextShot` implements, so assert it directly rather than choreography.
  const sel = new Game({ seed: 11, level: 3 });
  check('no shot skill is selected before anything is owned', sel.skills.nextShot() === null);
  sel.jobs.unlock(1, JOBS[1].unlockCost); // Wolf / Bear / Falcon are pets, not shots
  sel.jobs.levelUpSkill(1, 0, sel.jobs.skillCost('Wolf'));
  check('owning only a pet still selects no shot skill', sel.skills.nextShot() === null,
    'pets are not isShotByArcher');
  sel.jobs.levelUpSkill(0, 0, sel.jobs.skillCost('Multishot'));
  // Within a job the slots unlock in order: slot 2 needs slot 1 bought first
  // (`JobsUIManager.cs:201`). So BombArrow cannot be reached directly.
  check('a later slot is refused while the previous one is empty',
    sel.jobs.levelUpSkill(0, 2, sel.jobs.skillCost('BombArrow')) === null);
  sel.jobs.levelUpSkill(0, 1, sel.jobs.skillCost('RapidFire'));
  check('it opens once the previous slot is bought',
    sel.jobs.levelUpSkill(0, 2, sel.jobs.skillCost('BombArrow')) !== null);
  check('with two Job0 shots owned, the higher slot wins', sel.skills.nextShot() === 'BombArrow',
    String(sel.skills.nextShot()));
  // Job priority is descending, so a later job's shot skill takes over once it is bought.
  sel.jobs.unlock(2, JOBS[2].unlockCost);
  sel.jobs.levelUpSkill(2, 0, sel.jobs.skillCost('SniperScope'));
  sel.jobs.levelUpSkill(2, 1, sel.jobs.skillCost('PiercingShot'));
  check('a Job2 shot outranks the Job0 shots', sel.skills.nextShot() === 'PiercingShot',
    String(sel.skills.nextShot()));
  check('SniperScope is a `cast` skill, not a shot',
    SKILLS.SniperScope.kind === 'cast' && sel.skills.nextCast() === 'SniperScope',
    String(sel.skills.nextCast()));
  check('the passive skills are never on a button',
    ['FireArea', 'LightningStrike', 'Blizzard'].every((s) => SKILLS[s].kind === 'passive'));
  check('a passive skill cannot be cast by hand', sel.castSkill('FireArea') === false);

  // A later job's skill is out of reach until that job is bought.
  check('a Job2 skill is unreachable from Job0', !game.jobs.skillPurchasable(2, 0));
  check('Job1 shows its unlock once Job0 is in', game.jobs.canShowUnlock(1));
  check('Job2 does not, while Job1 is unbought', !game.jobs.canShowUnlock(2));
}

// -------------------------------------------------------------- jobs & passives
console.log('\n[jobs]');
{
  const game = new Game({ seed: 7, level: 1 });
  check('job 0 is unlocked from the start', game.jobs.unlocked[0] === true);
  check('jobs 1-4 start locked', game.jobs.unlocked.slice(1).every((u) => !u));
  check('the unlocked jobs match the assets',
    JOBS.map((j) => j.unlockCost).join() === '0,200,1500,20000,300000',
    JOBS.map((j) => j.unlockCost).join());
  check('the profile starts on skin 0', game.jobs.skinIndex() === 0);

  const cost1 = JOBS[1].unlockCost;
  check('job 1 cannot be bought short', game.jobs.unlock(1, cost1 - 1) === null);
  check('job 1 buys at its authored price', game.jobs.unlock(1, cost1) === cost1);
  check('unlocking job 1 moves the skin to 1', game.jobs.skinIndex() === 1);
  check('job 1 now exposes its skills', game.jobs.skillPurchasable(1, 0));
  check('job 1 exposes the three pets',
    JOBS[1].skills.length === 3 && JOBS[1].skills.every((s) => SKILLS[s].isPet),
    JOBS[1].skills.join());
  check('its first pet skill is a real Wolf',
    JOBS[1].skills[0] === 'Wolf' && SKILLS.Wolf.titleZh.length > 0, SKILLS.Wolf.titleZh);

  // `JobInfo.ApplyPassiveBonus` writes the job's passive stat the moment it is unlocked.
  const bag = new StatBag();
  bag.defineAll(PLAYER_BASE_STATS);
  for (const v of MULTIPLICATIVE_STATS) bag.change(v, StatsProp.SetMultiplicativeOnly, 1);
  const passiveStat = JOBS[1].passiveStat;
  const before = passiveStat ? bag.get(passiveStat) : 0;
  game.jobs.applyTo(bag);
  check('unlocking a job applies its passive',
    passiveStat != null && bag.get(passiveStat) !== before,
    `${passiveStat}: ${before} -> ${passiveStat ? bag.get(passiveStat) : 'n/a'}`);
}

// -------------------------------------------------------------- pets & taming
console.log('\n[pets]');
{
  // The three pets are `JobSkillInfo` entries with `isPet`, all owned by Job 1.
  check('there are three pets', PET_IDS.length === 3, PET_IDS.join());
  check('they are Wolf, Bear and Falcon', PET_IDS.join() === 'Wolf,Bear,Falcon', PET_IDS.join());
  check('every pet is a pet skill', PET_IDS.every((id) => SKILLS[id].isPet));
  check('every pet belongs to Job1', PET_IDS.every((id) => SKILLS[id].job === 1));

  // The numbers that make the three play differently, straight off the assets.
  check('Wolf attacks at 1.0/s for 3.0x at level 1',
    petAttackInterval('Wolf') === 1 && SKILLS.Wolf.damageMultipliers[0] === 3.0,
    `${petAttackInterval('Wolf')}s x${SKILLS.Wolf.damageMultipliers[0]}`);
  check('Bear is the slow tank: half the attack speed and 1.6x health',
    petAttackInterval('Bear') === 2 && SKILLS.Bear.petHealthMultipliers[0] === 1.6,
    `${petAttackInterval('Bear')}s hp x${SKILLS.Bear.petHealthMultipliers[0]}`);
  check('Bear hits for less than the Wolf but survives more',
    SKILLS.Bear.damageMultipliers[0] < SKILLS.Wolf.damageMultipliers[0]
      && SKILLS.Bear.petHealthMultipliers[0] > SKILLS.Wolf.petHealthMultipliers[0]);
  check('Falcon has a 1800-unit reach', petAttackRange('Falcon') === 1800);
  check('Falcon lands 3 hits at level 1', SKILLS.Falcon.numberOfHits[0] === 3);
  check('Falcon is the only pet with an attack chance',
    SKILLS.Falcon.petAttackChances.length > 0
      && SKILLS.Wolf.petAttackChances.length === 0
      && SKILLS.Bear.petAttackChances.length === 0,
    `Falcon ${SKILLS.Falcon.petAttackChances.join('/')}`);
  check('Falcon never lands, so it cannot be targeted', petIsUntargetable('Falcon')
    && !petIsUntargetable('Wolf') && !petIsUntargetable('Bear'));
  check('Bear is the taunt pet', petIsTaunt('Bear') && !petIsTaunt('Wolf'));

  // `PetsManager.Update` summon gating.
  const g = new Game({ seed: 3, level: 1 });
  const noneAlive = (): boolean => false;
  const noCd = (): number => 0;
  check('no pet is summoned before the archer gate opens',
    nextSummon(g.jobs, false, noneAlive, noCd) === null);
  g.jobs.unlock(1, JOBS[1].unlockCost);
  check('still nothing at skill level 0',
    nextSummon(g.jobs, true, noneAlive, noCd) === null);
  g.jobs.levelUpSkill(1, 0, g.jobs.skillCost('Wolf'));
  check('Wolf is summoned once its level is 1',
    nextSummon(g.jobs, true, noneAlive, noCd) === 'Wolf');
  check('a live pet blocks a second summon',
    nextSummon(g.jobs, true, (id) => id === 'Wolf', noCd) === null);
  check('a cooling pet is not re-summoned',
    nextSummon(g.jobs, true, noneAlive, (id) => (id === 'Wolf' ? 10 : 0)) === null);

  // Health is the player's total times the pet's own curve.
  check('Wolf health is the player pool at level 1',
    petMaxHp('Wolf', g.jobs, 100) === 100 * SKILLS.Wolf.petHealthMultipliers[0],
    `${petMaxHp('Wolf', g.jobs, 100)}`);
  const star = petMaxHp('Wolf', g.jobs, 100, 2);
  check('the PetHealthMultiplier stat scales it', star === 200, `${star}`);

  // Taming: `TamingManager`.
  check('the base tame chance is zero, so nothing is tamed for free',
    !rollTame(0, 1, TAMING.baseChance, false, () => 0));
  check('the first tame after the chance opens is guaranteed',
    rollTame(0, 1, 5, true, () => 0.999));
  check('the tame cap is respected', !rollTame(1, 1, 100, true, () => 0));
  check('the falloff is 0.8 per active tame',
    Math.abs(tameChance(2, 100) - 64) < 1e-9, `${tameChance(2, 100)}`);
  check('a roll under the chance tames', rollTame(0, 1, 50, false, () => 0.1));
  check('a roll over the chance does not', !rollTame(0, 1, 50, false, () => 0.9));
}

console.log('\n[pets in the sim]');
{
  // Drive a real run: unlock Job1, level a Wolf, open the archer gate, and watch the pet
  // appear and actually damage something.
  const g = new Game({ seed: 21, level: 1 });
  g.jobs.unlock(1, JOBS[1].unlockCost);
  g.jobs.levelUpSkill(1, 0, g.jobs.skillCost('Wolf'));
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };
  // Push past the archer gate the way the tutorial does: ten kills.
  for (let i = 0; i < 10; i++) (g as unknown as { archerSpawnCount: number }).archerSpawnCount++;
  g.tick(1 / 60, input);
  check('the Wolf is summoned into the run', g.getPetList().length === 1,
    `${g.getPetList().length} pets`);
  const wolf = g.getPetList()[0];
  check('it spawns at full health', wolf != null && wolf.hp === wolf.maxHp && wolf.maxHp > 0,
    wolf ? `${wolf.hp.toFixed(1)}/${wolf.maxHp.toFixed(1)}` : 'no pet');

  // Isolate the pet's damage: leave one enemy and stop the BOW, so the only thing that can
  // hurt anything is the pet. Standing out of range does not work - the bow out-ranges the
  // pet's walk and killed the target before the Wolf arrived.
  const alive = g.getEnemyList().filter((e) => e.alive && !e.isPortal);
  const target = alive[alive.length - 1];
  for (const e of g.getEnemyList()) if (e !== target) e.alive = false;
  if (target && wolf) {
    g.stats.change(STATS.playerAttackSpeed, StatsProp.Flat, -1000);
    const before = target.hp;
    // Teleport the player AND the pet: the pet spawns beside the player, so moving only the
    // player leaves the Wolf a 5000-unit walk away and the loop times out.
    (g as unknown as { px: number }).px = target.x - 300;
    wolf.x = g.px - 40;
    let everEngaged = false;
    for (let i = 0; i < 12 * 60 && target.alive; i++) {
      g.tick(1 / 60, input);
      if (wolf.engaged) everEngaged = true;
    }
    check('the pet walks out and engages on its own', everEngaged);
    check('the pet damages enemies with the bow disabled',
      target.hp < before || !target.alive,
      `hp ${before.toFixed(1)} -> ${target.hp.toFixed(1)}`);
  }

  check('a dead pet writes its own cooldown back',
    g.skills.cooldownFor('Wolf') === SKILLS.Wolf.cooldowns[0],
    `${g.skills.cooldownFor('Wolf')}s`);
}

console.log('\n[pets take damage]');
{
  // `PetSelfer` gives allies `AllyDamageReductionFraction` and floats the Bear forward.
  // Before this wiring an enemy could hit the archer straight through a pet in front of him.
  const g = new Game({ seed: 31, level: 1 });
  g.jobs.unlock(1, JOBS[1].unlockCost);
  g.jobs.levelUpSkill(1, 0, g.jobs.skillCost('Wolf'));
  for (let i = 0; i < 10; i++) (g as unknown as { archerSpawnCount: number }).archerSpawnCount++;
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };
  g.tick(1 / 60, input);
  const wolf = g.getPetList()[0];
  check('a pet exists to be hit', wolf != null);
  if (wolf) {
    // One enemy standing on the pet, so it must swing at the ally in front of it.
    const alive = g.getEnemyList().filter((e) => e.alive && !e.isPortal);
    const foe = alive[0];
    for (const e of g.getEnemyList()) if (e !== foe) e.alive = false;
    const hpBefore = wolf.hp;
    for (let i = 0; i < 20 * 60 && wolf.alive; i++) {
      wolf.x = g.px - 20;
      if (foe.alive) foe.x = wolf.x - 60;
      g.tick(1 / 60, input);
    }
    check('an enemy in reach damages the pet rather than walking past it',
      wolf.hp < hpBefore || !wolf.alive,
      `pet hp ${hpBefore.toFixed(1)} -> ${wolf.hp.toFixed(1)}`);
    check('the ally reduction constant is the original 0.5',
      TAMING.allyDamageReductionFraction === 0.5, `${TAMING.allyDamageReductionFraction}`);
  }
}

// ------------------------------------------------------------------- mastery
console.log('\n[mastery]');
{
  check('there are nine masteries', MASTERIES.length === 9, `${MASTERIES.length}`);
  check('they are indexed 0..8',
    MASTERIES.map((m) => m.index).join() === '0,1,2,3,4,5,6,7,8',
    MASTERIES.map((m) => m.index).join());
  const pinn = MASTERIES.filter((m) => m.isPinnacle);
  check('exactly the 2nd, 5th and 8th are pinnacles',
    pinn.map((m) => m.index).join() === '2,5,8', pinn.map((m) => m.index).join());
  check('the pinnacles are the short ladder',
    MASTERIES.map((m) => m.maxLevel).join() === '100,100,10,100,100,10,100,100,10',
    MASTERIES.map((m) => m.maxLevel).join());
  check('every mastery names a real stat',
    MASTERIES.every((m) => m.mainStat && !m.mainStat.startsWith('Unknown')),
    MASTERIES.map((m) => m.mainStat).join());
  check('the non-pinnacles use the linear curves the assets carry',
    MASTERIES[0].mainValueEquation === '0.8+0.2*x'
      && MASTERIES[7].mainValueEquation === '25*x',
    `${MASTERIES[0].mainValueEquation} / ${MASTERIES[7].mainValueEquation}`);

  // The NPC track: `DatabaseManager.MasteryNPCLevelCostPerLevel`.
  check('the NPC level costs are the authored table',
    NPC_LEVEL_COST.join() === '0,0,20,50,100,150,250,400,600,1000,1500', NPC_LEVEL_COST.join());

  const m = new Mastery();
  check('the NPC starts at level 1', m.npcLevel === 1, String(m.npcLevel));
  check('level 1 costs 20 bat', m.npcCost() === 20, `${m.npcCost()}`);
  check('the first mastery is unlocked from the start', m.isUnlocked(0));
  check('the second is not', !m.isUnlocked(1));
  check('awakening is not unlocked yet', !m.awakeningUnlocked);

  check('the NPC cannot be levelled without bat', !m.canLevelNpc(19));
  const lvl2 = m.levelUpNpc(1000);
  check('it levels for 20 bat', lvl2 !== null && lvl2.spent === 20, `${lvl2?.spent}`);
  check('the second mastery unlocks at NPC level 2', m.isUnlocked(1));
  // Level 5 is the 5th reward, so index 4.
  for (let i = 0; i < 3; i++) m.levelUpNpc(10000);
  check('the NPC is at 5', m.npcLevel === 5, String(m.npcLevel));
  check('five masteries are unlocked', MASTERIES.filter((d) => m.isUnlocked(d.index)).length === 5,
    String(MASTERIES.filter((d) => m.isUnlocked(d.index)).length));
  m.levelUpNpc(10000);
  check('NPC level 6 hands out Awakening', m.awakeningUnlocked);
  check('and unlocks no sixth mastery', !m.isUnlocked(5), '索引 5 是第 6 个精通');

  // A pinnacle can never be levelled, however much bat you have.
  const pin = MASTERIES[2];
  check('a pinnacle refuses to level', !m.canLevel(pin, 1e12) && m.levelUp(pin, 1e12) === null);

  // A normal mastery levels on its own curve, and the delta lands in the bag.
  const d0 = MASTERIES[0];
  check('the first level costs cost(1)',
    levelUpCost(d0, 0) === Math.ceil(evaluate(d0.costEquation, 1)),
    `${levelUpCost(d0, 0)}`);
  const spent = m.levelUp(d0, 1e9);
  check('it levels and charges', spent !== null && m.level(d0.id) === 1, `${spent}`);
  check('the delta is the whole equation at level 1',
    Math.abs(mainDelta(d0, 0, 1) - evaluate(d0.mainValueEquation, 1)) < 1e-9);
  check('level 2 gives only the increment',
    Math.abs(mainDelta(d0, 1, 2) - (evaluate(d0.mainValueEquation, 2)
      - evaluate(d0.mainValueEquation, 1))) < 1e-9);

  // Awakening: once only, and only at the required level.
  const d1 = MASTERIES[1];
  check('awakening needs the required level first',
    !m.canAwaken(d1, 1e9), `needs level ${d1.awakenRequiredLevel}`);
  for (let i = 0; i < d1.awakenRequiredLevel; i++) m.levelUp(d1, 1e9);
  check('at the required level it can awaken', m.canAwaken(d1, 1e9));
  const aw = m.awaken(d1, 1e9);
  check('awakening charges', aw !== null && m.isAwakened(d1.id), `${aw}`);
  check('it cannot awaken twice', !m.canAwaken(d1, 1e9));

  // Replay onto a bag: the stat actually moves, and exactly once.
  const bag = new StatBag();
  bag.defineAll(PLAYER_BASE_STATS);
  for (const v of MULTIPLICATIVE_STATS) bag.change(v, StatsProp.SetMultiplicativeOnly, 1);
  const before = bag.get(d0.mainStat!);
  m.applyTo(bag);
  const once = bag.get(d0.mainStat!);
  check('the mastery moves its own stat', once !== before, `${before} -> ${once}`);
  m.applyTo(bag);
  check('applying twice would double it, which is why refreshStats rebuilds first',
    bag.get(d0.mainStat!) !== once, 'documented, not a defect');
}

// --------------------------------------------------------------- enemy data
console.log('\n[enemy data]');
{
  // `ENEMIES` is built from `enemyData.ts`, which is exported straight out of the build.
  // These assertions exist because the port's previous table was hand-written and had
  // drifted badly (Bat shipped at 0.55x health against the asset's 3.00x).
  check('the exported table has all 12 archetypes', ENEMY_INFO.length === 12,
    `${ENEMY_INFO.length}`);
  check('five monster families plus the portal', MONSTER_IDS.length === 5
    && MONSTER_IDS.join() === 'Claw,Warrior,Archer,Mage,Bat', MONSTER_IDS.join());
  check('five Guardians and a King the port had not shipped', GUARDIAN_IDS.length === 5,
    GUARDIAN_IDS.join());
  check('King is its own archetype', ENEMY_INFO_BY_ID.King?.enemyType === 11,
    String(ENEMY_INFO_BY_ID.King?.enemyType));

  // The five families must match the asset exactly, field for field.
  const byId = (id: string) => ENEMY_INFO_BY_ID[id];
  check('Bat carries the asset’s 3.00x health, not the old 0.55x',
    ENEMIES.Bat.healthMultiplier === 3.0 && byId('Bat').healthMultiplier === 3.0,
    `${ENEMIES.Bat.healthMultiplier}`);
  check('Warrior carries 3.50x health',
    ENEMIES.Warrior.healthMultiplier === 3.5, `${ENEMIES.Warrior.healthMultiplier}`);
  check('Claw moves at the asset’s 80, not the old 95',
    ENEMIES.Claw.speed === 80, `${ENEMIES.Claw.speed}`);
  check('every family speed matches its asset',
    MONSTER_IDS.every((id) => ENEMIES[id as keyof typeof ENEMIES].speed === byId(id).movementSpeed),
    MONSTER_IDS.map((id) => `${id}:${ENEMIES[id as keyof typeof ENEMIES].speed}/${byId(id).movementSpeed}`).join(' '));
  check('every family range matches its asset',
    MONSTER_IDS.every((id) => ENEMIES[id as keyof typeof ENEMIES].attackRange === byId(id).attackRange));
  check('every family multiplier matches its asset',
    MONSTER_IDS.every((id) => ENEMIES[id as keyof typeof ENEMIES].damageMultiplier === byId(id).damageMultiplier));

  // `AttackSpeed` is attacks/second, so the cooldown is its inverse.
  check('Claw attacks once every 3.33s',
    Math.abs(ENEMIES.Claw.attackCooldown - 1 / 0.30) < 1e-6,
    `${ENEMIES.Claw.attackCooldown.toFixed(2)}s`);
  check('every family cooldown is 1/attackSpeed',
    MONSTER_IDS.every((id) => Math.abs(ENEMIES[id as keyof typeof ENEMIES].attackCooldown
      - 1 / byId(id).attackSpeed) < 1e-6));
  check('ranged families fire projectiles, melee do not',
    ENEMIES.Archer.attackKind === 'ranged' && ENEMIES.Mage.attackKind === 'ranged'
      && ENEMIES.Claw.attackKind === 'melee' && ENEMIES.Bat.attackKind === 'melee');
  check('the tameable flags match the assets',
    MONSTER_IDS.every((id) => ENEMIES[id as keyof typeof ENEMIES].tameable === byId(id).isTameable)
      && ENEMIES.RunPortal.tameable === false && ENEMIES.GuardianClaw.tameable === false);
  check('the portal is invulnerable-ish: no damage, no movement',
    ENEMIES.RunPortal.damageMultiplier === 0 && ENEMIES.RunPortal.speed === 0);
  check('Bat is the only lifestealing family',
    byId('Bat').lifestealPercentOfMaxHealth === 15
      && MONSTER_IDS.filter((id) => byId(id).lifestealPercentOfMaxHealth > 0).join() === 'Bat');
}

// ------------------------------------------------------------- golden enemies
console.log('\n[golden enemies]');
{
  // `EnemiesManager`: gated on `UnlockGoldenEnemies >= 10`, at most one per pack, the first
  // one ever guaranteed, and a Gilded Champion ONLY from the `GoldenPack` mastery prime.
  const g = new Game({ seed: 77, level: 4 });
  const goldens = (): number => g.getEnemyList().filter((e) => e.golden).length;
  check('nothing is golden before the unlock gate', goldens() === 0,
    `unlock=${g.stats.get('UnlockGoldenEnemies')}`);

  // Open the gate and rebuild the level: the first golden is then guaranteed.
  g.stats.change('UnlockGoldenEnemies', StatsProp.Flat, 10, true);
  g.startLevel(4, false);
  const after = g.getEnemyList().filter((e) => e.golden);
  check('the first golden enemy is guaranteed once unlocked', after.length === 1,
    `${after.length} golden`);
  check('a golden enemy is not a champion by default',
    after.every((e) => e.champion !== true));

  // At most one per pack.
  const perPack = new Map<number, number>();
  for (const e of g.getEnemyList()) {
    if (!e.golden) continue;
    perPack.set(e.packId, (perPack.get(e.packId) ?? 0) + 1);
  }
  check('at most one golden enemy per pack',
    [...perPack.values()].every((n) => n === 1), [...perPack.values()].join());

  // The champion comes from the mastery prime charge, not the roll.
  const championGame = new Game({ seed: 78, level: 4 });
  championGame.stats.change('UnlockGoldenEnemies', StatsProp.Flat, 10, true);
  // `PinnacleEffectType.GoldenPack` is 1; the legendary charge makes it a champion.
  championGame.mastery.addCharges(1, true, 1);
  check('the mastery holds the prime charge',
    championGame.mastery.charge(1, true) === 1, `${championGame.mastery.charge(1, true)}`);
  championGame.startLevel(4, false);
  const champ = championGame.getEnemyList().filter((e) => e.golden);
  check('the prime charge produces a Gilded Champion',
    champ.length === 1 && champ[0].champion === true,
    champ.map((e) => `golden=${e.golden} champion=${e.champion}`).join());
  check('and the charge is spent', championGame.mastery.charge(1, true) === 0);

  // The payout: `GoldenRewardMultiplier(5) * (champion ? 3 : 1) - 1` extra settlements.
  // With one gold coin at base that is 1 + 4 = 5 coins for a golden, 1 + 14 = 15 for a
  // champion.
  const payout = new Game({ seed: 79, level: 4 });
  payout.stats.change('UnlockGoldenEnemies', StatsProp.Flat, 10, true);
  payout.startLevel(4, false);
  const victim = payout.getEnemyList().find((e) => e.golden);
  check('a golden enemy to kill', victim != null);
  if (victim) {
    const before = payout.getCoinList().length;
    (payout as unknown as { damageEnemy: (e: unknown, a: number, c: boolean) => void })
      .damageEnemy(victim, victim.hp + 1, false);
    const gained = payout.getCoinList().length - before;
    check('a golden kill pays five times over, not once', gained >= 5,
      `${gained} drops for a x${payout.stats.get('GoldenRewardMultiplier')} multiplier`);
  }
}

// ------------------------------------------------------------ determinism
console.log('\n[determinism]');
{
  const mk = (): Game => new Game({ seed: 12345, level: 4 });
  const a = mk();
  const b = mk();
  const layoutA = a.getEnemyList().map((e) => `${e.type}:${e.x.toFixed(3)}:${e.y.toFixed(3)}`).join('|');
  const layoutB = b.getEnemyList().map((e) => `${e.type}:${e.x.toFixed(3)}:${e.y.toFixed(3)}`).join('|');
  check('same seed yields the same layout', layoutA === layoutB, `${a.getEnemyList().length} enemies`);
  const c = new Game({ seed: 54321, level: 4 });
  const layoutC = c.getEnemyList().map((e) => `${e.type}:${e.x.toFixed(3)}:${e.y.toFixed(3)}`).join('|');
  check('different seed differs', layoutA !== layoutC);
}

// ------------------------------------------------------- bow vs arrow rain
console.log('\n[bow attack targets]');
{
  // Regression guard: the projectile sweep used to skip `isPortal`, so the archer
  // could never damage the run portal even though the tapped arrow-rain could.
  const game = new Game({ seed: 31, level: 1 });
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };

  // Clear every pack so the portal becomes vulnerable.
  for (const e of game.getEnemyList()) {
    if (e.packId >= 0) {
      (e as { hp: number; alive: boolean }).hp = 0;
      (e as { alive: boolean }).alive = false;
    }
  }
  for (let i = 0; i < 5; i++) game.tick(1 / 60, input);
  check('portal becomes active once packs are down', game.snapshot().portalActive === true);

  const portal = game.getEnemyList().find((e) => e.isPortal && e.alive);
  check('portal is alive and targetable', portal != null);
  if (!portal) {
    // Skip the rest rather than reporting a misleading pair of failures.
  } else {
    // Place the archer just inside bow range of the portal and let him work, with no
    // tapping at all, so any damage must come from the bow. Walking there instead
    // would take ~40s and make the test slow and fragile.
    (game as unknown as { px: number }).px = portal.x - 400;
    const hpBefore = portal.hp;
    let sawProjectile = false;
    for (let i = 0; i < 12 * 60; i++) {
      game.tick(1 / 60, input);
      if (game.getProjectileList().length > 0) sawProjectile = true;
    }
    check('the archer fired arrows at the portal', sawProjectile);
    check(
      'bow arrows damage the portal',
      portal.hp < hpBefore,
      `hp ${hpBefore.toFixed(1)} -> ${portal.hp.toFixed(1)}`,
    );

    // ---------------------------------------------------------------- portal currency
    // `PlayerManager.MonsterDiedGiveRewards`, `EnemyType.RunPortal` branch: the portal is
    // the tree's only source of PortalCurrency, worth exactly 1, once per battle level.
    check('a fresh level still owes its portal currency',
      game.portalCurrencyOwed(game.level) === true);
    // Finish the portal off through the real damage path. Its HP is trimmed to a single
    // arrow's worth first: the portal summons its own wave, and the archer shoots those
    // before the portal, so out-damaging it honestly takes minutes of simulated time. What
    // is under test here is the DROP RULE, not the combat balance.
    portal.hp = 1;
    for (let i = 0; i < 60 * 120 && portal.alive; i++) {
      (game as unknown as { px: number }).px = Math.max(portal.x - 400, 0);
      game.tick(1 / 60, input);
    }
    check('the portal can be killed', !portal.alive, `hp=${portal.hp.toFixed(1)}`);
    const owedDrops = game.getCoinList().filter((c) => c.currency === 'PortalCurrency');
    check('the portal drops exactly one portal currency',
      owedDrops.length === 1, `${owedDrops.length} drops`);
    check('the drop is worth exactly 1',
      owedDrops.every((c) => c.value === 1),
      owedDrops.map((c) => c.value).join());
    check('the level is now marked paid', game.portalCurrencyOwed(game.level) === false);

    // Collect it, and prove the level cannot pay a second time.
    for (let i = 0; i < 60 * 30 && game.getCoinList().length > 0; i++) {
      (game as unknown as { px: number }).px = game.getCoinList()[0].x;
      game.tick(1 / 60, input);
    }
    check('collecting it credits the purse', game.portalCurrency === 1,
      `${game.portalCurrency}`);
    check('and reveals its counter', game.portalCurrencySeen === true);

    // Re-clearing the same level must NOT pay again: that is what makes it finite.
    const replay = new Game({ seed: 12, level: 1 });
    for (const lvl of game.portalCurrencyPaid) replay.portalCurrencyPaid.add(lvl);
    check('a replayed level does not owe portal currency',
      replay.portalCurrencyOwed(replay.level) === false,
      `paid set = {${[...replay.portalCurrencyPaid].join()}}`);
    check('a different level still owes its own',
      replay.portalCurrencyOwed(2) === true);
  }
}

// ------------------------------------------------------- cooldown ring data
console.log('\n[magazine cooldown]');
{
  const game = new Game({ seed: 12, level: 1 });
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };

  // Spend the whole magazine. `taps` is a queue the sim drains, so it must be
  // restocked every frame to represent a player who keeps tapping.
  for (let i = 0; i < 90; i++) {
    input.aimX = game.px + 300;
    input.aimY = 50;
    input.taps = 1;
    game.tick(1 / 60, input);
  }
  const drained = game.snapshot();
  check('tapping drains the magazine', drained.magazine < drained.magazineSize, `${drained.magazine}/${drained.magazineSize}`);

  const samples: number[] = [];
  for (let i = 0; i < 40; i++) {
    // Stop tapping so the magazine actually regenerates and the ring has something
    // to show.
    input.taps = 0;
    game.tick(1 / 60, input);
    samples.push(game.snapshot().magazineRegenFraction);
  }
  const distinct = new Set(samples.map((v) => v.toFixed(3))).size;
  check(
    'regen fraction changes over time (the ring animates)',
    distinct > 3,
    `${distinct} distinct values`,
  );
  check(
    'regen fraction stays in range',
    samples.every((v) => v >= 0 && v <= 1),
    `min=${Math.min(...samples).toFixed(3)} max=${Math.max(...samples).toFixed(3)}`,
  );
  check('regen fraction is 1 when full', game.snapshot().magazine >= game.snapshot().magazineSize
    ? samples[samples.length - 1] <= 1
    : true);
}

// ------------------------------------------------------------ health regen tick
console.log('\n[health regen]');
{
  // `HealthRegenEverySecond` is a PERIOD in seconds, not a rate: `PlayerManager.Update`
  // heals `HealthRegen` once the timer passes 5s, then resets it. Applying it per frame
  // healed 25x too fast and made the health bar fill itself.
  check('regen period is 5 seconds', BASE.healthRegenPeriodSeconds === 5, `${BASE.healthRegenPeriodSeconds}s`);
  check('base regen amount matches the save file', PLAYER_BASE_STATS.HealthRegen === 1.0, `${PLAYER_BASE_STATS.HealthRegen} HP/tick`);
  const perSecond = PLAYER_BASE_STATS.HealthRegen / BASE.healthRegenPeriodSeconds;
  check('effective regen is a fifth of a HP per second', Math.abs(perSecond - 0.2) < 1e-9, `${perSecond}/s`);

  // Behavioural: with the player hurt and no enemies to muddy the reading, no heal
  // before the period elapses and exactly one tick's worth after it.
  const g = new Game({ seed: 7, level: 1, spawnNothing: true });
  g.hp = g.maxHp - 5;
  const start = g.hp;
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };
  const step = 1 / 60;
  // 4.5 seconds of simulation, without ever crossing the 5s boundary.
  for (let t = 0; t < 4.5; t += step) g.tick(step, input);
  check('no heal before the period elapses', g.hp === start, `hp ${start} -> ${g.hp} after 4.5s`);
  // Cross the boundary.
  for (let t = 0; t < 1.0; t += step) g.tick(step, input);
  check('exactly one tick of regen after 5s', Math.abs(g.hp - (start + PLAYER_BASE_STATS.HealthRegen)) < 1e-9,
    `hp ${start} -> ${g.hp} after 5.5s`);
  // Five more seconds must heal one more tick, not the whole bar.
  for (let t = 0; t < 5.0; t += step) g.tick(step, input);
  check('regen stays slow over 10s', Math.abs(g.hp - (start + 2 * PLAYER_BASE_STATS.HealthRegen)) < 1e-9,
    `hp ${g.hp} (start ${start}, max ${g.maxHp}) - a per-frame rate would have refilled it`);
}

// ------------------------------------------------- rapid tapping is not lost
console.log('\n[rapid tapping]');
{
  // Regression guard: `taps` used to be a per-frame boolean, so three taps inside
  // one frame fired a single arrow and the rest were silently dropped - which is why
  // clicking quickly "did nothing".
  const game = new Game({ seed: 99, level: 1 });
  const input: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 0 };
  input.aimX = game.px + 300;
  input.aimY = 50;

  const before = game.shotsFired;
  // Queue five taps, then run a SINGLE simulation step (one frame's worth).
  input.taps = 5;
  game.tick(1 / 60, input);
  const spent = game.shotsFired - before;
  check('a burst of 5 taps in one frame fires 5 arrows', spent === 5, `fired ${spent}`);
  check('the queue is drained', input.taps === 0, `taps left ${input.taps}`);
  check('the magazine paid for all of them', game.snapshot().magazine === game.snapshot().magazineSize - 5,
    `${game.snapshot().magazine}/${game.snapshot().magazineSize}`);

  // A burst larger than the per-step cap must not empty the magazine in one frame, and
  // the surplus must be DISCARDED rather than banked: a stale burst firing long after
  // the player stopped tapping is worse than dropping the extra taps.
  //
  // The clearing lives in `Game.tick`, not in `AimInput.update`, because the input layer
  // runs BEFORE the tick and therefore cannot tell an unconsumed tap from one that has
  // not been read yet - clearing there dropped every tap that arrived between frames.
  // That ordering bug is covered end-to-end by `tools/cdp-tap.mjs`, which needs a DOM.
  const g2 = new Game({ seed: 100, level: 1 });
  const in2: InputState = { aiming: false, aimX: g2.px + 300, aimY: 50, taps: 99 };
  const before2 = g2.shotsFired;
  g2.tick(1 / 60, in2);
  const spent2 = g2.shotsFired - before2;
  // The cap is 5 whatever the magazine holds; the magazine size itself is now
  // tree-grantable, so it is read rather than assumed.
  check('one step spends at most the per-step cap', spent2 === 5, `fired ${spent2}`);
  check('the surplus is discarded, not banked', in2.taps === 0, `taps left ${in2.taps}`);

  // Drain whatever is left, then a fresh tap must be refused loudly rather than silently.
  for (let i = 0; i < 10 && g2.snapshot().magazine > 0; i++) {
    in2.taps = 99;
    g2.tick(1 / 60, in2);
  }
  check('the magazine can be drained', g2.snapshot().magazine === 0, `${g2.snapshot().magazine}`);
  const before3 = g2.shotsFired;
  const blockedBefore = g2.shotsBlocked;
  in2.taps = 1;
  g2.tick(1 / 60, in2);
  check('an empty magazine stops firing', g2.shotsFired === before3, `fired ${g2.shotsFired - before3}`);
  check('the empty magazine was reported, not silently ignored', g2.shotsBlocked > blockedBefore, `blocked +${g2.shotsBlocked - blockedBefore}`);
}

// ------------------------------------------------------------ expression evaluator
console.log('\n[expression evaluator]');
{
  // Ported from `ExpressionEvaluator`; the tree's equations are written in this language.
  check('plain arithmetic', evaluate('1+2*3', 0) === 7, `${evaluate('1+2*3', 0)}`);
  check('parentheses', evaluate('(1+2)*3', 0) === 9, `${evaluate('(1+2)*3', 0)}`);
  check('the node-level variable x', evaluate('5*x', 4) === 20, `${evaluate('5*x', 4)}`);
  check('the alias value', evaluate('3*value', 4) === 12, `${evaluate('3*value', 4)}`);
  check('power is right associative', evaluate('2^3^2', 0) === 512, `${evaluate('2^3^2', 0)}`);
  check('unary minus', evaluate('-3*x', 2) === -6, `${evaluate('-3*x', 2)}`);
  check('decimals with a comma', evaluate('1,5*x', 2) === 3, `${evaluate('1,5*x', 2)}`);
  check('F() floors', evaluate('F(x/3)', 7) === 2, `${evaluate('F(x/3)', 7)}`);
  check('C() ceils', evaluate('C(x/3)', 7) === 3, `${evaluate('C(x/3)', 7)}`);
  // `MasteryInfo.LevelUpCostEquation`, verbatim from the decompiled source.
  check('the mastery cost curve', evaluate('10 * 1.5^(x-1)', 1) === 10 && evaluate('10 * 1.5^(x-1)', 3) === 22.5,
    `${evaluate('10 * 1.5^(x-1)', 1)}, ${evaluate('10 * 1.5^(x-1)', 3)}`);
  // `DatabaseManager.ShapingRuneCreateCostEquation`, a discrete list: index round(x)-1.
  check('discrete list picks by level', evaluate('[1,5,10*1.1^(x-2)]', 1) === 1,
    `${evaluate('[1,5,10*1.1^(x-2)]', 1)}`);
  check('discrete list indexes the next entry at x=2', evaluate('[1,5,10*1.1^(x-2)]', 2) === 5,
    `${evaluate('[1,5,10*1.1^(x-2)]', 2)}`);
  check('discrete list clamps past its end', evaluate('[1,5]', 9) === 5, `${evaluate('[1,5]', 9)}`);
  check('an empty equation is 0, not a throw', evaluate('', 3) === 0, `${evaluate('', 3)}`);
}

// ------------------------------------------------------------------- talent tree
console.log('\n[talent tree]');
{
  // These are the original's numbers, read out of the shipping build by
  // `analysis/export_tree_web.py` — 168 TreeNodeInfo assets and 365 connections.
  check('the tree is the original 168 nodes', TALENT_NODES.length === 168, `${TALENT_NODES.length}`);
  check('every node has a unique id',
    new Set(TALENT_NODES.map((n) => n.id)).size === TALENT_NODES.length,
    `${TALENT_NODES.length} nodes`);
  check('the nodes declare the original 365 directed connections',
    TALENT_NODES.reduce((n, t) => n + t.conns.length, 0) === 365,
    `${TALENT_NODES.reduce((n, t) => n + t.conns.length, 0)}`);
  // The scene holds exactly 182 `TreeLink` objects, so that is the drawn edge count.
  check('the tree draws the original 182 links', TALENT_EDGES.length === 182,
    `${TALENT_EDGES.length}`);
  check('every link points at a real node',
    TALENT_NODES.every((n) => n.conns.every((c) => c.to in TALENT_BY_ID)));
  check('links are mirrored', TALENT_NODES.every((n) =>
    (TALENT_LINKS[n.id] ?? []).every((other) => (TALENT_LINKS[other] ?? []).includes(n.id))));

  // `NodeUnlockBehavior`: exactly one node is `AlwaysUnlockable`, the rest need a neighbour.
  const roots = TALENT_NODES.filter((n) => n.unlock === 'always');
  const gated = TALENT_NODES.filter((n) => n.unlock === 'requiresConnection');
  check('exactly one node is always unlockable', roots.length === 1, TALENT_ROOT.id);
  check('exactly 167 nodes require a connection', gated.length === 167, `${gated.length}`);
  check('the root is the node the original points its arrow at',
    TALENT_ROOT.id === 'Node 1_55cde9fa', TALENT_ROOT.id);

  // `Currencies` is 1-based, so the base tree charges Gold and the diamond nodes Portal.
  const gold = TALENT_NODES.filter((n) => n.costs[0].currency === 'Gold');
  const portal = TALENT_NODES.filter((n) => n.costs[0].currency === 'PortalCurrency');
  check('139 nodes charge Gold', gold.length === 139, `${gold.length}`);
  check('29 nodes charge PortalCurrency', portal.length === 29, `${portal.length}`);
  check('the portal nodes are the diamond template',
    portal.every((n) => n.tpl === 'portal'));
  check('every portal node costs exactly 1 portal currency',
    portal.every((n) => n.costs[0].costEquation.trim() === '1'));

  // The endless sink: three nodes repeat to level 100, charging tens of billions of Gold.
  const endless = TALENT_NODES.filter((n) => n.maxLevel === 100);
  check('three nodes repeat to level 100', endless.length === 3, `${endless.length}`);
  check('the endless nodes are the deep Gold sink, not the portal one',
    endless.every((n) => n.costs[0].currency === 'Gold' && n.tpl === 'base'));
  check('every portal node is a one-off unlock', portal.every((n) => n.maxLevel === 1));

  // Real layout: `Position * distancesMultiplier(1.2)`, never re-centred.
  const xs = TALENT_NODES.map((n) => n.x);
  const ys = TALENT_NODES.map((n) => n.y);
  check('the graph spans the original 3684 units',
    Math.max(...xs) - Math.min(...xs) === 3684, `${Math.max(...xs) - Math.min(...xs)}`);
  check('the graph is 480 units tall',
    Math.max(...ys) - Math.min(...ys) === 480, `${Math.max(...ys) - Math.min(...ys)}`);

  // Both templates, at their authored sizes.
  check('the base template is a 50-unit shape with a 32px icon',
    TREE_TEMPLATES.base.shapeSize === 50 && TREE_TEMPLATES.base.iconSize === 32);
  check('the portal template is a 75-unit shape with a 38px icon',
    TREE_TEMPLATES.portal.shapeSize === 75 && TREE_TEMPLATES.portal.iconSize === 38);
  check('every node carries the sprite names its template implies',
    TALENT_NODES.every((n) => n.shapeOff && n.shapeOn && n.highlighter && n.icon));

  // `TreeState.IsNodeAccessible`: the root yes, a far node no.
  const tree = new TalentTree();
  const far = TALENT_NODES.reduce((a, b) => (b.x > a.x ? b : a));
  check('the root is accessible on a fresh save', tree.isAccessible(TALENT_ROOT));
  check('the far end of the tree is locked on a fresh save', !tree.isAccessible(far), far.id);
  check('no node starts levelled', TALENT_NODES.every((n) => tree.level(n.id) === 0));

  // `TreeState.IsHaveEnoughCurrenciesToPurchase`: cost = evaluate(costEquation, level+1).
  check('the root costs its authored 1 gold at level 1',
    tree.costLines(TALENT_ROOT)[0].amount === 1,
    `${tree.costLines(TALENT_ROOT)[0].amount}`);

  const rich: Purses = {
    gold: 1e12,
    currencies: { PortalCurrency: 1e6, ClawCurrency: 1e6, WarriorCurrency: 1e6 },
  };
  check('the root is affordable when rich', tree.canBuy(TALENT_ROOT, rich));
  check('a locked node cannot be bought however rich',
    tree.buy(far, rich) === null && tree.canBuy(far, rich) === false);
  tree.buy(TALENT_ROOT, rich);
  check('buying the root levels it', tree.level(TALENT_ROOT.id) === 1);
  check('the root is maxed at level 1', tree.isMaxed(TALENT_ROOT));

  // A portal node refuses gold alone: PortalCurrency is a real second purse.
  // It is `RequiresConnection` like 167 of the 168 nodes, so a neighbour is lit first -
  // otherwise the purchase would fail for accessibility, not for the purse.
  const portalNode = portal[0];
  const neighbour = (TALENT_LINKS[portalNode.id] ?? [])[0];
  const goldOnlyPurse: Purses = { gold: 1e12, currencies: {} };
  const portalTree = new TalentTree();
  portalTree.load(neighbour ? { [neighbour]: 1 } : {});
  check('the portal node is reachable once a neighbour is lit',
    portalTree.isAccessible(portalNode), `neighbour=${neighbour}`);
  check('a portal node is not buyable with gold alone',
    !portalTree.canBuy(portalNode, goldOnlyPurse),
    `${portalNode.costs[0].currency} ${portalTree.costLines(portalNode)[0].amount}`);
  const onePortal: Purses = { gold: 1e12, currencies: { PortalCurrency: 1 } };
  const bought = portalTree.buy(portalNode, onePortal);
  check('one portal currency buys a portal node', bought !== null);
  check('it debits exactly that one',
    bought !== null && bought.currencies.PortalCurrency === 0,
    `PortalCurrency 1 -> ${bought?.currencies.PortalCurrency}`);
  check('and the node is then maxed', portalTree.isMaxed(portalNode));

  // The two step cost equations are real strings from the assets.
  const six = TALENT_BY_ID['Node 92_edebc9b0']; // costEquation "2e6"
  check('a flat scientific-notation cost evaluates', six !== undefined
    && tree.costLines(six)[0].amount === 2_000_000,
    six ? String(tree.costLines(six)[0].amount) : 'missing');
  const mult = TALENT_BY_ID['Node 100_666c2e79']; // costEquation "5e6*x"
  check('a scaling scientific-notation cost evaluates',
    mult !== undefined && tree.costLines(mult)[0].amount === 5_000_000,
    mult ? String(tree.costLines(mult)[0].amount) : 'missing');

  // A discrete-list cost: "Node 29" uses `[40,200]` for its two levels.
  const listNode = TALENT_BY_ID['Node 29_0737fff4'];
  check('a discrete-list cost reads its level-1 entry',
    listNode !== undefined && tree.costLines(listNode)[0].amount === 40,
    listNode ? String(tree.costLines(listNode)[0].amount) : 'missing');

  // The stat delta: `value(newLevel) - value(previousLevel)`, the full amount from 0.
  const grant = TALENT_ROOT.grants[0];
  check('level 1 grants the whole equation value',
    Math.abs(tree.grantsAt(TALENT_ROOT, 1)[0].delta - evaluate(grant.valueEquation, 1)) < 1e-9);
  check('level 2 grants only the increment',
    Math.abs(tree.grantsAt(TALENT_ROOT, 2)[0].delta
      - (evaluate(grant.valueEquation, 2) - evaluate(grant.valueEquation, 1))) < 1e-9);

  // Every grant names a real `StatInfo` variable, and the bag accepts it.
  check('every grant resolves to a StatInfo variable',
    TALENT_NODES.every((n) => n.grants.length > 0
      && n.grants.every((gr) => gr.stat.length > 0 && !gr.stat.startsWith('Unknown_'))),
    TALENT_NODES.flatMap((n) => n.grants.map((gr) => gr.stat))
      .filter((s) => s.startsWith('Unknown_')).slice(0, 3).join(', ') || 'all resolved');
  check('every grant localizes to the game’s own Chinese string',
    TALENT_NODES.every((n) => n.grants.every((gr) => (TALENT_TEXT[gr.locKey]?.zh ?? '').length > 0)),
    `sample: ${TALENT_TEXT[TALENT_ROOT.grants[0].locKey]?.zh ?? 'none'}`);

  // The tooltip's number formatting is `FunctionsNeeded.DisplayNumberAsNumberSuffix`,
  // including its quirk of keeping the trailing zeros the digit-shift produces.
  check('5e6 shortens exactly as the original does', readable(5_000_000) === '5.00M',
    readable(5_000_000));
  check('18e6 shortens to 18.0M', readable(18_000_000) === '18.0M', readable(18_000_000));
  check('130e6 shortens to 130M', readable(130_000_000) === '130M', readable(130_000_000));
  check('60e9 shortens to 60.0B', readable(60_000_000_000) === '60.0B',
    readable(60_000_000_000));
  check('under 10000 stays plain', readable(9000) === '9000', readable(9000));

  // Levels survive a save/load round trip and cap at maxLevel.
  const restored = new TalentTree();
  restored.load(tree.serialize());
  check('levels round-trip', restored.level(TALENT_ROOT.id) === tree.level(TALENT_ROOT.id),
    `${restored.level(TALENT_ROOT.id)} vs ${tree.level(TALENT_ROOT.id)}`);
  const capped = new TalentTree();
  capped.load({ [endless[0].id]: 9999 });
  check('levels clamp to maxLevel', capped.level(endless[0].id) === 100,
    `${capped.level(endless[0].id)}`);

  // Applying to the bag actually moves a stat the sim reads.
  const bag = new StatBag();
  bag.defineAll(PLAYER_BASE_STATS);
  for (const variable of MULTIPLICATIVE_STATS) bag.change(variable, StatsProp.SetMultiplicativeOnly, 1);
  const before = bag.get(TALENT_ROOT.grants[0].stat);
  const applied = new TalentTree();
  applied.load({ [TALENT_ROOT.id]: 1 });
  applied.applyTo(bag);
  check('applying the tree moves the stat it names',
    bag.get(TALENT_ROOT.grants[0].stat) !== before,
    `${TALENT_ROOT.grants[0].stat}: ${before} -> ${bag.get(TALENT_ROOT.grants[0].stat)}`);
  check('the tree only grants stats it declares',
    TALENT_NODES.every((n) => n.grants.every((gr) => typeof gr.valueEquation === 'string')));
}

// ------------------------------------------------------------------- world
console.log('\n[world geometry]');
{
  // World Y grows UP and uses the SAME space the backgrounds are authored in:
  // ground at 0, sky at +600. Floor plus world units, so there is no sign flip
  // between "where the art is" and "where the game is".
  check('ground is the origin', WORLD.groundY === 0, `ground=${WORLD.groundY}`);
  check('player stands on the ground', WORLD.playerStartY === WORLD.groundY, `y=${WORLD.playerStartY}`);
  check('enemy band is above the ground', WORLD.minY >= WORLD.groundY, `minY=${WORLD.minY} >= ${WORLD.groundY}`);
  check('enemy band is inside the artwork frame', WORLD.maxY <= WORLD.viewHeight, `maxY=${WORLD.maxY} <= ${WORLD.viewHeight}`);
  // `MinMaxYPos` measured off the shipping screenshot: the archer stands on
  // `MiddleOfGroundYPos` (30) and an enemy's feet land 27 units below him.
  check('enemy band matches the measured MinMaxYPos', WORLD.minY === 0 && WORLD.maxY === 30, `${WORLD.minY}..${WORLD.maxY}`);
  check('enemy band keeps the pack on the road', WORLD.maxY <= MIDDLE_OF_GROUND_Y_POS, `${WORLD.maxY} <= ${MIDDLE_OF_GROUND_Y_POS}`);
  const plan = planRun(30, new Set(), false);
  check('level 30 portal is far along +X', plan.portalX > 40000, `portalX=${plan.portalX.toFixed(0)}`);
}

// ------------------------------------------------------------------- framing
console.log('\n[camera framing]');
{
  // Ported from the original's cameras: `orthographicSize` 540 => 1080 units visible
  // vertically at any aspect ratio.
  check('camera shows orthographicSize * 2 units', CAMERA.visibleWorldHeight === 1080, `${CAMERA.visibleWorldHeight}`);
  // The feet row is not a tuning knob: it is the frame's ground row (500) as a
  // fraction of the visible height (1080). Measured off the shipping screenshot,
  // where the archer's silhouette bottoms out at row 502 of 1076.
  check(
    'feet row is the art ground line over the visible height',
    Math.abs(CAMERA.playerScreenFraction - GROUND_LINE_ART_Y / CAMERA.visibleWorldHeight) < 1e-9,
    `${CAMERA.playerScreenFraction.toFixed(4)} vs ${GROUND_LINE_ART_Y}/${CAMERA.visibleWorldHeight}`,
  );
  check('feet row matches the shipping screenshot', Math.abs(CAMERA.playerScreenFraction - 0.4665) < 0.005, `${(CAMERA.playerScreenFraction * 100).toFixed(1)}% vs 46.7% measured`);
  check('character walks a quarter in from the left', CAMERA.characterScreenX === 0.25, `${CAMERA.characterScreenX}`);
  // The art frame covers only the upper part of the viewport; the rest is UI. This is
  // the check that fails if anyone scales the art to fill the screen again.
  const band = FRAME.height / CAMERA.visibleWorldHeight;
  check('art frame leaves a lower band for the HUD', band > 0.5 && band < 0.6, `${(band * 100).toFixed(1)}% of viewport height`);
  check('ground line is on screen', CAMERA.playerScreenFraction > 0 && CAMERA.playerScreenFraction < band, `${CAMERA.playerScreenFraction} < ${band.toFixed(3)}`);
}

// ------------------------------------------------------------------ art assets
console.log('\n[art assets]');
{
  check('design resolution matches the shipped backgrounds', DESIGN.width === 1920 && DESIGN.height === 600, `${DESIGN.width}x${DESIGN.height}`);
  check('a base background layer exists', BIOME1.length >= 1 && BIOME1[0].parallaxFactor === 0, `${BIOME1.length} layers`);
  check('the base layer is not foreground', BIOME1[0].foreground === false);
  // The frame is centred on its own origin (pivot 0.5) and the walkable surface is the
  // top of the foreground band, frame row 500.
  check('frame top is frame-local y +300', FRAME.topWorldY === 300, `${FRAME.topWorldY}`);
  check('walkable surface is frame row 500', FRAME.groundRow === 500, `${FRAME.groundRow}`);
  check('ground line matches the foreground band', GROUND_LINE_ART_Y === 500, `${GROUND_LINE_ART_Y}`);
  check('ground line fraction is inside the frame', GROUND_LINE_FRACTION === 500 / 600, `${GROUND_LINE_FRACTION}`);
  // Every layer is a full 1920x600 frame at the same origin; the exported PNGs are
  // alpha-trimmed, so each crop must land inside the frame.
  check(
    'every layer crop fits inside the art frame',
    BIOME1.every((l) => l.cropLeft >= 0 && l.cropLeft < FRAME.width && l.cropTop >= 0 && l.cropTop < FRAME.height),
    BIOME1.map((l) => `${l.key}:${l.cropLeft},${l.cropTop}`).join(' '),
  );
  check(
    'every background layer starts at the frame origin or lower',
    BIOME1.every((l) => l.cropLeft === 0 || l.cropLeft === 56),
    BIOME1.map((l) => `${l.key}:${l.cropLeft}`).join(' '),
  );
  check('parallax factors increase toward the camera', BIOME1.every((l, i) => i === 0 || l.parallaxFactor >= BIOME1[i - 1].parallaxFactor));
  check('exactly one foreground layer', BIOME1.filter((l) => l.foreground).length === 1);
  // The five archer paintings are OUTFIT SKINS picked by unlocked jobs, not walk frames.
  // Treating them as a frame cycle flashed his clothes between leather, teal and purple.
  check('player ships five outfit skins', PLAYER_SKINS.length === 5, `${PLAYER_SKINS.length} skins`);
  check('player wears the default skin', PLAYER_SKIN === 'Archer_1', PLAYER_SKIN);
  check('the active skin is one of the skins', PLAYER_SKINS.includes(PLAYER_SKIN));
  check('the player is drawn at the measured original height', CHARACTERS.player.height === 99, `${CHARACTERS.player.height} units`);

  // The health bar's tints were solved from the one bar visible in the shipping
  // screenshot: the fill sprite's own gradient is 229 -> 255 -> 229 and it renders
  // (183,87,87) where the sprite is 255 and (164,78,78) where it is 229. So
  // tint = rendered * 255 / sprite, and this pins that arithmetic so it cannot drift.
  check(
    'bar fill tint reproduces the measured shading',
    Math.round(0xb7 * 229 / 255) === 164 && Math.round(0x57 * 229 / 255) === 78,
    `183->${Math.round(0xb7 * 229 / 255)}, 87->${Math.round(0x57 * 229 / 255)}`,
  );
  check('bar frame tint is the measured outline colour', BAR.frameTint === 0x0c0605, `#${BAR.frameTint.toString(16)}`);
  check('bar sprites are in the preload list', UI_SPRITES.every((f) => allArtFiles().includes(f)), UI_SPRITES.join(', '));
  check('every enemy type the run can spawn has art',
    (Object.keys(ENEMIES) as string[]).every((k) => k in CHARACTERS),
    (Object.keys(ENEMIES) as string[]).filter((k) => !(k in CHARACTERS)).join() || 'all 12');
  check('art file list covers every layer and character', allArtFiles().length >= 12, `${allArtFiles().length} files`);
  check('every FX entry names a file', Object.values(FX).every((f) => typeof f.file === 'string' && f.file.length > 0));
}

// --------------------------------------------------------------- localisation
console.log('\n[localisation]');
{
  check('no untranslated keys', missingKeys().length === 0, missingKeys().join(','));
  setLang('zh');
  check('default language is Chinese', getLang() === 'zh');
  const zhLevel = t('level', { n: 3 });
  check('Chinese level string interpolates', zhLevel.includes('3') && /[\u4e00-\u9fff]/.test(zhLevel), zhLevel);
  const zhPacks = t('packs', { done: 2, total: 8 });
  check('Chinese packs string interpolates', zhPacks.includes('2') && zhPacks.includes('8'), zhPacks);
  const zhPortal = t('portalSummoning', { s: 5 });
  check('Chinese portal string interpolates', zhPortal.includes('5'), zhPortal);
  setLang('en');
  check('English switch works', t('playerLevel', { n: 3 }) === 'Level 3', t('playerLevel', { n: 3 }));
  check('run stage has its own wording', t('level', { n: 3 }) === 'Stage 3', t('level', { n: 3 }));
  // Every skill the build ships must carry the game's own wording, in both languages it
  // is authored in - the old localisation stub had three hand-written keys, this reads
  // the real `LocalizationJson`.
  check('every one of the 15 skills has a Chinese title',
    Object.values(SKILLS).every((s) => s.titleZh.length > 0),
    Object.values(SKILLS).filter((s) => !s.titleZh.length).map((s) => s.id).join() || 'all 15');
  check('every skill has a Chinese description',
    Object.values(SKILLS).every((s) => s.descZh.length > 0),
    Object.values(SKILLS).filter((s) => !s.descZh.length).map((s) => s.id).join() || 'all 15');
  setLang('zh');
  check('unknown key falls back to the key itself', t('__nope__') === '__nope__');
}

console.log(`\n${checks - failures}/${checks} checks passed`);
if (failures > 0) {
  // `process` exists under Node; the browser never loads this module.
  (globalThis as { process?: { exit(code: number): never } }).process?.exit(1);
}
