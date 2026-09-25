/**
 * Mastery, ported from `MasteryManager` + `MasteryUIManager`.
 *
 * ## Two tracks, deliberately
 *
 * 1. **The NPC's own level**, paid in `Currencies.BatCurrency`, runs 1..10 on
 *    `DatabaseManager.MasteryNPCLevelCostPerLevel` (0 / 20 / 50 / 100 / 150 / 250 / 400 /
 *    600 / 1000 / 1500). Each level hands out ONE unlock — the nine mastery tiles plus
 *    Awakening, in the order `MasteryUIManager.MasteryRewards` documents.
 * 2. **Each mastery's own level**, paid in the same currency, on that mastery's
 *    `LevelUpCostEquation`. Every level writes a delta into its `MainStat`.
 *
 * ## What the assets actually say
 *
 * | # | name | stat | curve | cap |
 * |---|---|---|---|---|
 * | 0 | 动量精通 | `ChanceToFreeSkillFromCooldown` | `0.8+0.2*x`% | 100 |
 * | 1 | 活力精通 | `HealthRestorePercentOnKill` | `1.9+0.1*x`% | 100 |
 * | 2 | 铭刻巅峰 | — pinnacle — | | 10 |
 * | 3 | 幸运精通 | `ChanceToSpawnChest` (additive) | `15*x`% | 100 |
 * | 4 | 回响精通 | `ChanceToSpawnOrb` (additive) | `10*x`% | 100 |
 * | 5 | 镀金巅峰 | — pinnacle — | | 10 |
 * | 6 | 弹幕精通 | `MouseMagazineRegenTime` (additive) | `10*x`% | 100 |
 * | 7 | 贪婪精通 | `GoldGained` (additive) | `25*x`% | 100 |
 * | 8 | 锻造巅峰 | — pinnacle — | | 10 |
 *
 * **A pinnacle cannot be levelled at all.** `MasteryManager.CanLevelUp` starts with
 * `if (m == null || m.IsPinnacle) return false;`, so the `MainStat` all three pinnacles
 * carry (an identical `ChanceForDoubleDamage 5*x`) is authoring leftover the code never
 * reads. It is exported but deliberately not applied.
 *
 * ## Awakening
 *
 * Once the NPC hands out Awakening, every non-pinnacle mastery gets a second button. It
 * costs `AwakenCostEquation` and grants `AwakenValue` to `AwakenStat` ONCE - it is not
 * levelled, and it needs the mastery to already be at `AwakenRequiredLevel`.
 */

import { StatsProp } from '../core/stats.js';
import type { StatBag } from '../core/stats.js';
import { evaluate } from '../core/equations.js';
import {
  MASTERIES,
  MASTERY_REWARDS,
  MASTERY_TEXT,
  NPC_LEVEL_COST,
  NPC_MAX_LEVEL,
  type MasteryDef,
} from '../content/masteryData.js';

export { MASTERIES, MASTERY_REWARDS, MASTERY_TEXT, NPC_LEVEL_COST, NPC_MAX_LEVEL };
export type { MasteryDef };

const PROP_BY_NAME: Record<string, StatsProp> = {
  Flat: StatsProp.Flat,
  Additive: StatsProp.Additive,
  Multiplicative: StatsProp.Multiplicative,
};

function propOf(name: string | null): StatsProp {
  return PROP_BY_NAME[name ?? 'Flat'] ?? StatsProp.Flat;
}

/** `MasteryInfo.GetLevelUpCost`: the equation is evaluated at `level + 1`. */
export function levelUpCost(def: MasteryDef, level: number): number {
  return Math.ceil(evaluate(def.costEquation, level + 1));
}

/** `MasteryInfo.GetAwakenCost`: x is how many masteries are already awakened + 1. */
export function awakenCost(def: MasteryDef, awakenCount: number): number {
  return Math.ceil(evaluate(def.awakenCostEquation, awakenCount));
}

/**
 * `MasteryInfo.GetMainDelta`: the incremental value, with level 0 treated as 0 so the
 * first level grants the whole equation.
 */
export function mainDelta(def: MasteryDef, previous: number, next: number): number {
  const now = evaluate(def.mainValueEquation, next);
  const before = previous > 0 ? evaluate(def.mainValueEquation, previous) : 0;
  return now - before;
}

interface StatWrite {
  variable: string;
  prop: StatsProp;
  value: number;
}

export class Mastery {
  /** `playerData.MasteryLevel` — the NPC's own level, 1..10. */
  npcLevel = 1;
  /** `playerData.MasteryLevels`, keyed by `functionName`. */
  private readonly levels = new Map<string, number>();
  /** `playerData.MasteryAwakened`. */
  private readonly awakened = new Set<string>();
  /** `playerData.MasteryPinnacleCharges`, keyed `"<Effect>_B"` / `"<Effect>_L"`. */
  private readonly pinnacleCharges = new Map<string, number>();
  /** `UnlockedSystems`-adjacent: the NPC's rewards, one per level. */
  private readonly granted = new Set<number>();

  constructor() {
    for (const m of MASTERIES) this.levels.set(m.id, 0);
    // The NPC's level-1 reward is its own starting grant.
    this.grantRewardsUpTo(1);
  }

  def(index: number): MasteryDef | undefined {
    return MASTERIES.find((m) => m.index === index);
  }

  byId(id: string): MasteryDef | undefined {
    return MASTERIES.find((m) => m.id === id);
  }

  // ------------------------------------------------------------------ NPC track

  /** `DatabaseManager.MasteryNPCLevelCostPerLevel[level]`. */
  npcCost(): number {
    return NPC_LEVEL_COST[Math.min(this.npcLevel + 1, NPC_MAX_LEVEL)] ?? 0;
  }

  get npcMaxed(): boolean {
    return this.npcLevel >= NPC_MAX_LEVEL;
  }

  canLevelNpc(bat: number): boolean {
    return !this.npcMaxed && bat >= this.npcCost();
  }

  /** Buys the next NPC level and returns the reward it handed out. */
  levelUpNpc(bat: number): { reward: (typeof MASTERY_REWARDS)[number] | null; spent: number } | null {
    if (!this.canLevelNpc(bat)) return null;
    const spent = this.npcCost();
    this.npcLevel++;
    const before = this.granted.size;
    this.grantRewardsUpTo(this.npcLevel);
    const reward = this.granted.size > before
      ? MASTERY_REWARDS.find((r) => !this.granted.has(r.npcLevel - 1)) ?? null
      : null;
    return { reward, spent };
  }

  /** Applies every reward the NPC has reached. Idempotent. */
  private grantRewardsUpTo(level: number): void {
    for (const r of MASTERY_REWARDS) {
      if (r.npcLevel <= level) this.granted.add(r.npcLevel - 1);
    }
  }

  /** `MasteryUIManager.HasMasteryReward`: reached a level at or past that reward. */
  hasReward(npcLevel: number): boolean {
    return this.granted.has(npcLevel - 1);
  }

  /** `DatabaseManager.cs:716-754`: mastery index -> `UnlockMastery<index+1>`. */
  isUnlocked(index: number): boolean {
    const r = MASTERY_REWARDS.find((x) => x.kind === 'mastery' && x.mastery === index);
    return r != null && this.hasReward(r.npcLevel);
  }

  /** Awakening is its own reward (`UnlockAwakening`). */
  get awakeningUnlocked(): boolean {
    const r = MASTERY_REWARDS.find((x) => x.kind === 'awakening');
    return r != null && this.hasReward(r.npcLevel);
  }

  // ------------------------------------------------------------------ masteries

  level(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  /** `MasteryInfo.MaxLevel` plus the `MasteryMaxLevelBonus` stat. */
  maxLevel(def: MasteryDef, bonus = 0): number {
    return def.maxLevel + Math.max(0, Math.round(bonus));
  }

  isMaxLevel(def: MasteryDef, bonus = 0): boolean {
    return this.level(def.id) >= this.maxLevel(def, bonus);
  }

  isAwakened(id: string): boolean {
    return this.awakened.has(id);
  }

  /** `MasteryManager.CanLevelUp`: a pinnacle can never be levelled. */
  canLevel(def: MasteryDef, bat: number, bonus = 0): boolean {
    if (def.isPinnacle) return false;
    if (!this.isUnlocked(def.index) || this.isMaxLevel(def, bonus)) return false;
    return bat >= levelUpCost(def, this.level(def.id));
  }

  levelUp(def: MasteryDef, bat: number, bonus = 0): number | null {
    if (!this.canLevel(def, bat, bonus)) return null;
    const spent = levelUpCost(def, this.level(def.id));
    this.levels.set(def.id, this.level(def.id) + 1);
    return spent;
  }

  /** `MasteryManager.CanAwaken`: unlocked, at the required level, not already awakened. */
  canAwaken(def: MasteryDef, bat: number): boolean {
    if (def.isPinnacle) return false;
    if (!this.isUnlocked(def.index) || !this.awakeningUnlocked) return false;
    if (this.isAwakened(def.id)) return false;
    if (this.level(def.id) < def.awakenRequiredLevel) return false;
    return bat >= awakenCost(def, this.awakened.size);
  }

  awaken(def: MasteryDef, bat: number): number | null {
    if (!this.canAwaken(def, bat)) return null;
    const spent = awakenCost(def, this.awakened.size);
    this.awakened.add(def.id);
    return spent;
  }

  // ------------------------------------------------------------------ pinnacle

  /** `MasteryManager` keys charges `"<Effect>_B"` (normal) and `"<Effect>_L"` (legendary). */
  charge(effect: number, legendary: boolean): number {
    return this.pinnacleCharges.get(`${effect}_${legendary ? 'L' : 'B'}`) ?? 0;
  }

  addCharges(effect: number, legendary: boolean, n: number): void {
    const key = `${effect}_${legendary ? 'L' : 'B'}`;
    this.pinnacleCharges.set(key, (this.pinnacleCharges.get(key) ?? 0) + n);
  }

  /** Spends one charge, returning whether there was one to spend. */
  consumeCharge(effect: number, legendary: boolean): boolean {
    const key = `${effect}_${legendary ? 'L' : 'B'}`;
    const have = this.pinnacleCharges.get(key) ?? 0;
    if (have <= 0) return false;
    this.pinnacleCharges.set(key, have - 1);
    return true;
  }

  get totalCharges(): number {
    let n = 0;
    for (const v of this.pinnacleCharges.values()) n += v;
    return n;
  }

  // ------------------------------------------------------------------ stats

  /** Every write the current state implies, ready to replay onto an empty bag. */
  writes(): StatWrite[] {
    const out: StatWrite[] = [];
    for (const def of MASTERIES) {
      if (def.isPinnacle || !def.mainStat) continue;
      const level = this.level(def.id);
      for (let n = 1; n <= level; n++) {
        const d = mainDelta(def, n - 1, n);
        if (d !== 0) out.push({ variable: def.mainStat, prop: propOf(def.mainStatProp), value: d });
      }
      if (this.isAwakened(def.id) && def.awakenStat && def.awakenShowValue) {
        out.push({
          variable: def.awakenStat,
          prop: propOf(def.awakenStatProp),
          value: def.awakenValue,
        });
      }
    }
    return out;
  }

  applyTo(stats: StatBag, _bonus = 0): void {
    for (const w of this.writes()) stats.change(w.variable, w.prop, w.value, true);
  }

  /** Total mastery levels, for the header readout. */
  totalLevels(): number {
    let n = 0;
    for (const v of this.levels.values()) n += v;
    return n;
  }

  get awakenedCount(): number {
    return this.awakened.size;
  }

  serialize(): {
    npcLevel: number;
    levels: Record<string, number>;
    awakened: string[];
    charges: Record<string, number>;
  } {
    const levels: Record<string, number> = {};
    for (const [k, v] of this.levels) if (v > 0) levels[k] = v;
    return {
      npcLevel: this.npcLevel,
      levels,
      awakened: [...this.awakened],
      charges: Object.fromEntries(this.pinnacleCharges),
    };
  }

  load(data: ReturnType<Mastery['serialize']> | undefined): void {
    if (!data) return;
    this.npcLevel = Math.max(1, Math.min(NPC_MAX_LEVEL, Math.floor(data.npcLevel ?? 1)));
    this.granted.clear();
    this.grantRewardsUpTo(this.npcLevel);
    for (const [id, v] of Object.entries(data.levels ?? {})) {
      const def = this.byId(id);
      if (def && v > 0) this.levels.set(id, Math.min(Math.floor(v), def.maxLevel));
    }
    this.awakened.clear();
    for (const id of data.awakened ?? []) if (this.byId(id)) this.awakened.add(id);
    this.pinnacleCharges.clear();
    for (const [k, v] of Object.entries(data.charges ?? {})) {
      if (v > 0) this.pinnacleCharges.set(k, Math.floor(v));
    }
  }
}
