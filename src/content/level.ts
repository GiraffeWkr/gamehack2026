/**
 * Level curve lookups, ported from `DatabaseManager`.
 *
 * Levels 1..30 are authored by hand; 31..50 are extrapolated with per-metric
 * growth rates. That "hand-tuned early, formula late" split is the original's
 * design and is preserved exactly so difficulty feels the same.
 */

import {
  PROGRESSION,
  ENEMY_CURRENCY_PER_RELATIVE_LEVEL,
  ENEMY_CURRENCY_UNLOCK_LEVEL,
  ENEMY_HEALTH_PER_LEVEL,
  ENEMY_GOLD_PER_LEVEL,
  ENEMY_DAMAGE_PER_LEVEL,
  ENEMIES_PER_PACK,
  ENEMIES_PER_PORTAL_PACK,
  MONSTER_CURRENCY,
  PACKS_PER_LEVEL,
  SPAWN,
  type EnemyType,
} from './data.js';
import { clamp } from '../core/math.js';
import type { Rng } from '../core/math.js';

/** `AuthoredLevelRow`: clamp into the hand-authored table. */
export function authoredRow(level: number): number {
  return clamp(Math.floor(level), 1, PROGRESSION.lastAuthoredLevel);
}

/** `ExtrapolatePastTable`: authored value, then exponential growth beyond 30. */
function extrapolate(authored: number, level: number, growth: number): number {
  if (level <= PROGRESSION.lastAuthoredLevel) return authored;
  return authored * Math.pow(growth, level - PROGRESSION.lastAuthoredLevel);
}

/** Base enemy HP for a level, before per-archetype multipliers. */
export function enemyHealth(level: number): number {
  const row = authoredRow(level);
  return extrapolate(ENEMY_HEALTH_PER_LEVEL[row - 1], level, PROGRESSION.endgameHealthGrowthPerLevel);
}

/** Base enemy damage for a level. `Math.floor` matches the original. */
export function enemyDamage(level: number): number {
  const row = authoredRow(level);
  return Math.floor(extrapolate(ENEMY_DAMAGE_PER_LEVEL[row - 1], level, PROGRESSION.endgameDamageGrowthPerLevel));
}

/** Base gold dropped by one enemy at this level. */
export function enemyGold(level: number): number {
  const row = authoredRow(level);
  return Math.ceil(extrapolate(ENEMY_GOLD_PER_LEVEL[row - 1], level, PROGRESSION.endgameGoldGrowthPerLevel));
}

export function enemiesPerPack(level: number): number {
  return ENEMIES_PER_PACK[authoredRow(level) - 1];
}

export function enemiesPerPortalPack(level: number): number {
  return ENEMIES_PER_PORTAL_PACK[authoredRow(level) - 1];
}

export function packsPerLevel(level: number): number {
  return PACKS_PER_LEVEL[authoredRow(level) - 1];
}

/**
 * `DatabaseManager.EnemyCurrencyDrop`: the family's currency amount for this battle level.
 *
 *     EnemyCurrencyPerRelativeLevel[ AuthoredLevelRow(level) - unlockAt ]
 *
 * Returns 0 before the family unlocks, which is what makes higher-tier monsters worth
 * far more - a level-26 Bat (unlock 16) reads index 10 = 18, while a level-26 Claw
 * (unlock 2) reads index 24 = 1200.
 */
export function enemyCurrencyDrop(level: number, type: EnemyType): number {
  const currency = MONSTER_CURRENCY[type];
  if (!currency) return 0;
  const index = authoredRow(level) - ENEMY_CURRENCY_UNLOCK_LEVEL[currency];
  if (index < 0 || index >= ENEMY_CURRENCY_PER_RELATIVE_LEVEL.length) return 0;
  return ENEMY_CURRENCY_PER_RELATIVE_LEVEL[index];
}

/**
 * `FunctionsNeeded.IsHappened_Over100Things`: below 100 it is a single percentage roll;
 * at or above 100 every full hundred is guaranteed and the remainder rolls again.
 */
export function rollOver100(chance: number, rng: Rng): number {
  if (chance < 100) return rng.next() * 100 <= chance ? 1 : 0;
  const whole = Math.floor(chance / 100);
  const remainder = chance - whole * 100;
  return remainder > 0 && rng.next() * 100 <= remainder ? whole + 1 : whole;
}

/**
 * Half-width of a pack, from `CreateASinglePack`: `92 * count^0.75`.
 * Enemies scatter across `[center, center + halfWidth]`.
 */
export function packHalfWidth(count: number): number {
  return SPAWN.packWidthBase * Math.pow(Math.max(1, count), SPAWN.packWidthExponent);
}

export interface PackPlan {
  packId: number;
  /** Centre X of the pack. */
  centerX: number;
  enemyCount: number;
  /** Portal packs spawn after the portal is reached and are harder. */
  isPortalPack: boolean;
  isGuardianPack: boolean;
  /** Which Guardian this pack holds. Only set when `isGuardianPack`. */
  guardianType?: EnemyType | null;
}

export interface RunPlan {
  level: number;
  packs: PackPlan[];
  /** X of the run portal that ends the level. */
  portalX: number;
  /** Enemy count used for the portal wave. */
  portalPackSize: number;
  guardianType: EnemyType | null;
}

/**
 * Guardian levels: one guardian appears at `GuardianStartLevel + index`, and
 * only until it has been defeated once. Which guardians the player still owes
 * is persisted, so the slice accepts a set of already-cleared guardians.
 */
export const GUARDIAN_START_LEVEL = 25;

/**
 * The five Guardians, in the order the original sends them: one per level from
 * `GuardianStartLevel`, and only until that Guardian has been beaten once. Each is its own
 * `EnemyInfo` — GuardianMage carries 45x health against GuardianClaw's 25x, and the Archer
 * and Mage variants are the only two that shoot.
 */
const GUARDIAN_ORDER: EnemyType[] = [
  'GuardianClaw', 'GuardianWarrior', 'GuardianArcher', 'GuardianMage', 'GuardianBat',
];

export function guardianForLevel(level: number, defeated: ReadonlySet<EnemyType>): EnemyType | null {
  const index = level - GUARDIAN_START_LEVEL;
  if (index < 0 || index >= GUARDIAN_ORDER.length) return null;
  const type = GUARDIAN_ORDER[index];
  return defeated.has(type) ? null : type;
}

/**
 * Builds the whole level layout ahead of time, mirroring `SpawnManager_Co`:
 * optional guardian pack first, then N regular packs spaced evenly, then the
 * run portal just past the last pack.
 */
export function planRun(
  level: number,
  defeatedGuardians: ReadonlySet<EnemyType>,
  useEarlyPacks: boolean,
): RunPlan {
  const packCount = packsPerLevel(level);
  const perPack = enemiesPerPack(level);
  const spacing = level === 1 ? SPAWN.level1PackDistance : SPAWN.spawnPackEveryDistance;
  const startX = useEarlyPacks ? SPAWN.noSpawnArcherPackPosition : SPAWN.firstPackPosition;

  const packs: PackPlan[] = [];
  let nextId = 0;
  let cursor = startX;

  const guardianType = guardianForLevel(level, defeatedGuardians);
  if (guardianType) {
    packs.push({
      packId: nextId++,
      centerX: SPAWN.guardianPackPosition,
      enemyCount: 1,
      isPortalPack: false,
      isGuardianPack: true,
      guardianType,
    });
    cursor = SPAWN.guardianPackPosition + spacing;
  }

  for (let i = 0; i < packCount; i++) {
    packs.push({
      packId: nextId++,
      centerX: cursor,
      enemyCount: perPack,
      isPortalPack: false,
      isGuardianPack: false,
    });
    cursor += spacing;
  }
  cursor -= spacing;

  const portalPackSize = enemiesPerPortalPack(level);
  // `RunPortalXPosition = lastPackX + 80 * enemiesPerPack`
  const portalX = cursor + 80 * perPack;

  return {
    level,
    packs,
    portalX,
    portalPackSize,
    guardianType,
  };
}
