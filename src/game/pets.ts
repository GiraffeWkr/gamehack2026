/**
 * Pet and taming rules, ported from `PetsManager` / `PetSelfer` / `TamingManager`.
 *
 * ## Pets are summoned by skills, not bought separately
 *
 * Wolf, Bear and Falcon are `JobSkillInfo` entries with `isPet` set, belonging to Job 1
 * (猎人). `PetsManager.Update` re-summons one whenever its slot is empty:
 *
 * ```csharp
 * if (no live instance && SkillsLevels[skill] >= 1 && !(SkillsCooldowns[skill] > 0))
 *     SummonPet(skill);            // at most one per 0.18s
 * ```
 *
 * so a pet is permanent until it dies, and dying writes its own cooldown back
 * (`PetSelfer.cs:933`), which is what stops an instant re-summon.
 *
 * ## The three pets play differently, and the differences are in the assets
 *
 * | | range | attack speed | hp x | damage x | hits | attack chance |
 * |---|---|---|---|---|---|---|
 * | Wolf | 100 | 1.0 | 1.0-1.2 | 3.0-3.5 | 1/1/2 | - |
 * | Bear | 100 | **0.5** | **1.6-2.1** | 2.0-3.0 | 1/1/2 | - |
 * | Falcon | **1800** | 1.0 | 1.0 | **4.5-5.0** | **3/3/4** | **4.0-4.5** |
 *
 * Bear is the tank: half the attack speed, nearly double the health, and it pulls ranged
 * fire (`PetsManager.RangedTargetOrder = {"Bear","Wolf"}`). Falcon never lands - it is not
 * targetable at all (`FalconSelfer.IsTargetable => false`) and only strikes when the PLAYER
 * attacks, gated on `Falcon_AttackChance`.
 *
 * Everything here is per-level, indexed `level - 1` and clamped, exactly like
 * `JobSkillInfo.GetXForLevel`.
 */

import { JOB_SKILLS } from '../content/jobData.js';
import type { Jobs } from './jobs.js';

/** `DatabaseManager`: the taming tuning, all of it from the code. */
export const TAMING = {
  /** `BaseChanceToTameEnemiesOnDeath`. */
  baseChance: 0,
  /** `BaseTameHealthMultiplier` — a tamed monster is 70% of a player's health. */
  healthMultiplier: 0.7,
  /** `BaseTameDamageMultiplier`. */
  damageMultiplier: 1.2,
  /** `BaseMaxTames` — one at a time until the tree raises it. */
  maxTames: 1,
  /** `TameChanceFalloffPerActive` — each existing tame cuts the odds by 20%. */
  falloffPerActive: 0.8,
  /** `AllyDamageReductionFraction` — allies take half damage from the player's scaling. */
  allyDamageReductionFraction: 0.5,
} as const;

/** `PetsManager`: at most one summon attempt per this many seconds. */
export const SUMMON_GAP = 0.18;

/** `PetSelfer`: `PlayerMovementSpeed * 1.25` when chasing. */
export const PET_CHASE_SPEED_MULTIPLIER = 1.25;

/** `PetSelfer`: vertical tolerance before a pet counts as lined up with its target. */
export const PET_ALIGN_TOLERANCE = 14;

/** `PetsManager.PetsShouldExist`: the archer has to have been summoned 10 times. */
export const ARCHER_SPAWN_GATE = 10;

export const PET_IDS: string[] = Object.values(JOB_SKILLS)
  .filter((d) => d.isPet)
  .sort((a, b) => a.job - b.job || a.slot - b.slot)
  .map((d) => d.id);

/** `JobSkillInfo.GetXForLevel`: index `level - 1`, clamped. */
function at(list: readonly number[], level: number, fallback: number): number {
  if (!list.length) return fallback;
  return list[Math.max(0, Math.min(level - 1, list.length - 1))];
}

/**
 * Which pet should be summoned right now, or null.
 *
 * Faithful to `PetsManager.Update`: pets only exist once the archer gate is open, the skill
 * must be at level 1 or more, its cooldown must have run out, and the slot must be empty.
 */
export function nextSummon(
  jobs: Jobs,
  archerSpawned: boolean,
  isAlive: (id: string) => boolean,
  cooldownLeft: (id: string) => number,
): string | null {
  if (!archerSpawned) return null;
  for (const id of PET_IDS) {
    if (jobs.level(id) < 1) continue;
    if (cooldownLeft(id) > 0) continue;
    if (isAlive(id)) continue;
    return id;
  }
  return null;
}

/**
 * `PetSelfer.cs:410`: `playerTotalHealth * GetPetHealthMultiplierForLevel(level) *
 * PetHealthMultiplier`. The star multiplier is a tree-grantable stat, 1 at base.
 */
export function petMaxHp(id: string, jobs: Jobs, playerMaxHp: number, starMultiplier = 1): number {
  const d = JOB_SKILLS[id];
  if (!d) return 0;
  const level = Math.max(1, jobs.level(id));
  return playerMaxHp * at(d.petHealthMultipliers, level, 1) * starMultiplier;
}

/** `PetSelfer`: attack interval is `1 / AttackSpeed`, in seconds. */
export function petAttackInterval(id: string): number {
  const d = JOB_SKILLS[id];
  if (!d || d.petAttackSpeed <= 0) return 1;
  return 1 / d.petAttackSpeed;
}

/** `PlayerStatsData.SkillsMultiplier` for a pet: its own damage curve at its level. */
export function petDamageMultiplier(id: string, jobs: Jobs): number {
  const d = JOB_SKILLS[id];
  if (!d) return 1;
  return at(d.damageMultipliers, Math.max(1, jobs.level(id)), 1);
}

/** `GetNumberOfHitsForLevel` for a pet. */
export function petNumberOfHits(id: string, jobs: Jobs): number {
  const d = JOB_SKILLS[id];
  if (!d) return 1;
  return at(d.numberOfHits, Math.max(1, jobs.level(id)), 1);
}

/** `PetSelfer`: how far the pet will look for something to hit. */
export function petAttackRange(id: string): number {
  return JOB_SKILLS[id]?.petAttackRange ?? 0;
}

/** `PetSelfer.cs:719`: pets only consider enemies ahead of the player and within 1600. */
export const PET_ENGAGE_DISTANCE = 1600;

/** Bear soaks ranged fire; `PetsManager.RangedTargetOrder`. */
export function petIsTaunt(id: string): boolean {
  return id === 'Bear';
}

/** Falcon flies and is never a valid target (`FalconSelfer.IsTargetable => false`). */
export function petIsUntargetable(id: string): boolean {
  return id === 'Falcon';
}

/**
 * `FalconSelfer.cs:176`: the falcon only dives when the PLAYER attacks, and then either on
 * its own `Falcon_AttackChance` or for free when the player lands a critical hit while
 * `Falcon_BlitzBond >= 10`.
 */
export function falconDives(
  jobs: Jobs,
  playerCrit: boolean,
  rng: () => number,
  blitzBond = 0,
): boolean {
  const d = JOB_SKILLS.Falcon;
  if (!d) return false;
  const chance = at(d.petAttackChances, Math.max(1, jobs.level('Falcon')), 0);
  if (playerCrit && blitzBond >= 10) return true;
  return rng() * 100 < chance;
}

/**
 * `TamingManager.cs:111`: `ChanceToTameEnemiesOnDeath * falloff^activeTames`.
 * `nextTameGuaranteed` is the original's kindness — the first tame after the chance stat
 * becomes non-zero always succeeds, so the player is never stuck at zero tames.
 */
export function tameChance(activeTames: number, chanceStat: number): number {
  return chanceStat * Math.pow(TAMING.falloffPerActive, Math.max(0, activeTames));
}

/** Whether a roll tames: guarantees the first one, then rolls the falloff curve. */
export function rollTame(
  activeTames: number,
  maxTames: number,
  chanceStat: number,
  guaranteed: boolean,
  rng: () => number,
): boolean {
  if (activeTames >= maxTames) return false;
  if (chanceStat <= 0 && !guaranteed) return false;
  if (guaranteed) return true;
  return rng() * 100 < tameChance(activeTames, chanceStat);
}
