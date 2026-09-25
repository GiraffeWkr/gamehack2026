/**
 * Player progression: level, experience, and the premium currency.
 *
 * ## Why this is designed rather than ported
 *
 * The original declares `playerData.PlayerLevel` and `playerData.PlayerExp` but
 * never touches them: `PlayerManager.GainExp` is an empty method with no callers,
 * and neither field is read or written anywhere in the 272 types. The experience
 * bar in the shipping HUD is the *monster level* progress (`MonsterLevelsProgress`),
 * not an XP bar.
 *
 * So there is no curve to copy. This module supplies one, keeping the original's
 * flavour: costs and requirements are exponential in level, which is the shape the
 * game uses everywhere else (`"10 * 1.5^(x-1)"` in `MasteryInfo`, `TreeNodeInfo`).
 *
 * ## What each thing does
 *
 *  - **Level** rises on experience and grants a small permanent stat bonus, so it
 *    is a third progression axis next to gold upgrades and monster level.
 *  - **Gems** are the premium currency: dropped by guardians and first clears only,
 *    which keeps them scarce.
 */

/** Exponential requirements, matching the original's cost-curve idiom. */
export const XP_CURVE = {
  /** Experience needed for level 2. */
  base: 40,
  /** Multiplier per level: `base * growth^(level-1)`. */
  growth: 1.42,
  maxLevel: 60,
} as const;

export interface LevelBonus {
  /** Flat damage added per level above 1. */
  damagePerLevel: number;
  /** Flat health added per level above 1. */
  healthPerLevel: number;
  /** Additive percentage to arrow-fall damage per level. */
  arrowDamagePercentPerLevel: number;
}

export const LEVEL_BONUS: LevelBonus = {
  damagePerLevel: 0.5,
  healthPerLevel: 6,
  arrowDamagePercentPerLevel: 2,
};

/** Experience awarded per kill, scaled by the enemy archetype's toughness. */
export function expForKill(level: number, healthMultiplier: number): number {
  // Tied to level so experience keeps pace with the difficulty curve.
  const base = 1 + Math.floor(level * 0.6);
  return Math.max(1, Math.round(base * Math.max(0.5, healthMultiplier)));
}

export class Progression {
  level = 1;
  exp = 0;
  gems = 0;

  /** Experience required to advance from the current level. */
  xpNeeded(): number {
    if (this.level >= XP_CURVE.maxLevel) return Number.POSITIVE_INFINITY;
    return Math.ceil(XP_CURVE.base * Math.pow(XP_CURVE.growth, this.level - 1));
  }

  /** Progress toward the next level, 0..1. */
  fraction(): number {
    const need = this.xpNeeded();
    if (!Number.isFinite(need)) return 1;
    return Math.max(0, Math.min(1, this.exp / need));
  }

  /**
   * Adds experience and levels up as many times as it covers. Returns how many
   * levels were gained, so the caller can celebrate.
   */
  gainExp(amount: number): number {
    if (amount <= 0 || this.level >= XP_CURVE.maxLevel) return 0;
    this.exp += amount;
    let gained = 0;
    while (this.level < XP_CURVE.maxLevel && this.exp >= this.xpNeeded()) {
      this.exp -= this.xpNeeded();
      this.level++;
      gained++;
    }
    if (this.level >= XP_CURVE.maxLevel) this.exp = 0;
    return gained;
  }

  addGems(amount: number): void {
    if (amount > 0) this.gems += Math.floor(amount);
  }

  /** True when the gems cover a price. */
  canAfford(price: number): boolean {
    return this.gems >= price;
  }

  /**
   * Spends gems, returning true on success. The only sink in the slice is
   * instantly finishing an upgrade level, which is how the original treats its
   * premium currency elsewhere.
   */
  spendGems(price: number): boolean {
    if (price <= 0 || this.gems < price) return false;
    this.gems -= price;
    return true;
  }

  /** Stat deltas granted by the current level, applied on top of the stat bases. */
  bonuses(): { damage: number; health: number; arrowDamagePercent: number } {
    const levels = Math.max(0, this.level - 1);
    return {
      damage: levels * LEVEL_BONUS.damagePerLevel,
      health: levels * LEVEL_BONUS.healthPerLevel,
      arrowDamagePercent: levels * LEVEL_BONUS.arrowDamagePercentPerLevel,
    };
  }

  serialize(): { level: number; exp: number; gems: number } {
    return { level: this.level, exp: this.exp, gems: this.gems };
  }

  load(data: { level?: number; exp?: number; gems?: number } | undefined): void {
    if (!data) return;
    if (typeof data.level === 'number') this.level = Math.max(1, Math.floor(data.level));
    if (typeof data.exp === 'number') this.exp = Math.max(0, data.exp);
    if (typeof data.gems === 'number') this.gems = Math.max(0, Math.floor(data.gems));
  }
}
