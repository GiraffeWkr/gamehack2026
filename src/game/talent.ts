/**
 * Talent tree state, ported from `TreeState`.
 *
 * The interesting logic is small and is reproduced exactly:
 *
 * ```csharp
 * // TreeState.IsNodeAccessible
 * if (!UnlockedSystems[node.RequiredUnlockableSystem]) return false;
 * if (GetNodeLevel(node) >= 1) return true;
 * if (node.UnlockBehavior == AlwaysUnlockable) return true;
 * foreach (var other in node.GetAllConnectedNodes())
 *     if (other != node && GetNodeLevel(other) >= 1) return true;   // RequiresConnection
 * return false;
 *
 * // TreeState.IsHaveEnoughCurrenciesToPurchase
 * double cost = ExpressionEvaluator.Evaluate(node.NodeCostEquation[i], nodeLevel + 1);
 *
 * // TreeState.ApplyRemoveStat
 * double delta = Evaluate(valueEq, newLevel) - (previousLevel > 0 ? Evaluate(valueEq, previousLevel) : 0);
 * stats.ChangeAStat(statName, prop, delta, isAdd: true);
 * ```
 *
 * `start` nodes are set to level 1 up front, which is `InitializeNodeLevels`.
 */

import { StatsProp } from '../core/stats.js';
import type { StatBag } from '../core/stats.js';
import { evaluate } from '../core/equations.js';
import {
  TALENT_BY_ID,
  TALENT_LINKS,
  TALENT_NODES,
  type TalentCurrency,
  type TalentNode,
} from '../content/talent.js';

/** A purse the tree can spend from. `Gold` is a plain number, the rest live on the game. */
export interface Purses {
  gold: number;
  currencies: Record<string, number>;
}

export interface TalentCostLine {
  currency: TalentCurrency;
  amount: number;
  affordable: boolean;
}
export class TalentTree {
  private readonly levels = new Map<string, number>();

  constructor() {
    for (const n of TALENT_NODES) this.levels.set(n.id, 0);
    // `InitializeNodeLevels`: `StartUnlocked` nodes begin at level 1.
    for (const n of TALENT_NODES) if (n.unlock === 'start') this.levels.set(n.id, 1);
  }

  level(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  isMaxed(node: TalentNode): boolean {
    return this.level(node.id) >= node.maxLevel;
  }

  /** `TreeState.IsNodeAccessible`. */
  isAccessible(node: TalentNode): boolean {
    if (this.level(node.id) >= 1) return true;
    if (node.unlock === 'always') return true;
    if (node.unlock === 'start') return true;
    for (const otherId of TALENT_LINKS[node.id] ?? []) {
      const other = TALENT_BY_ID[otherId];
      if (other && other.id !== node.id && this.level(other.id) >= 1) return true;
    }
    return false;
  }

  /**
   * Cost of the NEXT level, per currency. `TreeState` evaluates each cost equation at
   * `level + 1`, so this is the price of the level about to be bought.
   */
  costLines(node: TalentNode): Array<{ currency: TalentCurrency; amount: number }> {
    const next = this.level(node.id) + 1;
    return node.costs.map((c) => ({
      currency: c.currency,
      amount: Math.ceil(evaluate(c.costEquation, next)),
    }));
  }

  hasFunds(node: TalentNode, purses: Purses): boolean {
    if (this.isMaxed(node)) return false;
    for (const line of this.costLines(node)) {
      const have = line.currency === 'Gold' ? purses.gold : (purses.currencies[line.currency] ?? 0);
      if (have < line.amount) return false;
    }
    return true;
  }

  canBuy(node: TalentNode, purses: Purses): boolean {
    return this.isAccessible(node) && !this.isMaxed(node) && this.hasFunds(node, purses);
  }

  /**
   * Buys one level, deducting every currency the node charges.
   *
   * Returns the new purses, or null when it cannot be afforded. Mutating the caller's
   * object only on success keeps a failed click from half-spending.
   */
  buy(node: TalentNode, purses: Purses): Purses | null {
    if (!this.canBuy(node, purses)) return null;
    const lines = this.costLines(node);
    const next: Purses = { gold: purses.gold, currencies: { ...purses.currencies } };
    for (const line of lines) {
      if (line.currency === 'Gold') next.gold -= line.amount;
      else next.currencies[line.currency] = (next.currencies[line.currency] ?? 0) - line.amount;
    }
    this.levels.set(node.id, this.level(node.id) + 1);
    return next;
  }

  /**
   * Delta a purchase would grant, for the tooltip: `value(newLevel) - value(previous)`.
   * From level 0 the original treats the previous value as 0, so it is the full amount.
   */
  grantsAt(node: TalentNode, newLevel: number): Array<{ stat: string; prop: StatsProp; delta: number }> {
    const previous = Math.max(0, newLevel - 1);
    return node.grants.map((gr) => {
      const now = evaluate(gr.valueEquation, newLevel);
      const before = previous > 0 ? evaluate(gr.valueEquation, previous) : 0;
      return { stat: gr.stat, prop: gr.prop, delta: now - before };
    });
  }

  /** The total a stat currently receives from this tree. */
  valueOf(node: TalentNode, grantIndex: number): number {
    const level = this.level(node.id);
    if (level <= 0) return 0;
    return evaluate(node.grants[grantIndex].valueEquation, level);
  }

  /** Replays every purchased level onto the bag, exactly like `ApplyRemoveStat` in bulk. */
  applyTo(stats: StatBag): void {
    for (const node of TALENT_NODES) {
      const level = this.level(node.id);
      if (level <= 0) continue;
      for (const gr of node.grants) {
        const value = evaluate(gr.valueEquation, level);
        if (value === 0) continue;
        stats.change(gr.stat, gr.prop, value, true);
      }
    }
  }

  /** Total levels purchased, for the header. */
  totalLevels(): number {
    let total = 0;
    for (const v of this.levels.values()) total += v;
    return total;
  }

  serialize(): Record<string, number> {
    const out: Record<string, number> = {};
    for (const [k, v] of this.levels) if (v > 0) out[k] = v;
    return out;
  }

  load(data: Record<string, number> | undefined): void {
    if (data) {
      for (const [k, v] of Object.entries(data)) {
        if (k in TALENT_BY_ID && typeof v === 'number' && v > 0) {
          const node = TALENT_BY_ID[k];
          this.levels.set(k, Math.min(Math.floor(v), node.maxLevel));
        }
      }
    }
    for (const n of TALENT_NODES) if (n.unlock === 'start' && this.level(n.id) === 0) this.levels.set(n.id, 1);
  }
}
