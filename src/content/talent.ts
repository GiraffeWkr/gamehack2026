/**
 * The talent tree's content layer — **the original's own data**, not a re-creation.
 *
 * `treeData.ts` is machine-exported from the shipping build (`analysis/export_tree_web.py`):
 * 168 `TreeNodeInfo` ScriptableObjects, the two `TreeNodeTemplate`s they share, the
 * scene's `TreeCreator` settings and the game's `LocalizationJson`. This module turns
 * that raw shape into the small runtime shape the tree logic and the panel want.
 *
 * ## What the original actually is
 *
 * - **168 nodes, 365 links**, laid out in a strip `3684 x 480` units. The scene's
 *   `TreeCreator.distancesMultiplier` is **1.2** and `TreeInfo.FirstNodePosition` is
 *   `(0, 0)`, so a node's position is simply `Position * 1.2` — already baked into
 *   `treeData.ts`. `centerTree` is `false`, so nothing re-centres the graph.
 * - **Exactly one node is `AlwaysUnlockable`** (`Node 1_55cde9fa`); the other 167 are
 *   `RequiresConnection`. `TreeState.IsNodeAccessible` therefore walks the adjacency.
 * - **Two templates decide the visuals.** `BaseTemplate` draws a 50x50 rounded square
 *   with a 32px icon; `PortalTemplate` draws a 75x75 rounded diamond with a 38px icon.
 *   138 nodes use the base, 30 use the portal. Each node exports its *effective*
 *   shape/icon/size, resolved exactly the way `TreeNodeInfo`'s property getters do
 *   (an override wins, otherwise the template's value).
 * - **Costs are Gold or PortalCurrency.** `Currencies` is 1-based and orders
 *   `Gold, ClawCurrency, ArcherCurrency, PortalCurrency, ...`, so the base tree charges
 *   Gold (139 nodes, from `6` up to `130e6 * x`) and the 30 diamond-shaped portal nodes
 *   charge `1` PortalCurrency each — three of them repeat to level **100**, which is the
 *   game's endless portal-currency sink.
 * - **Value and cost are equations**, evaluated by `ExpressionEvaluator` at the level
 *   being bought: `cost = Evaluate(costEq, level + 1)` and the grant is
 *   `Evaluate(valueEq, newLevel) - Evaluate(valueEq, previousLevel)`.
 */

import { StatsProp } from '../core/stats.js';
import { STAT_INFO, TREE_NODES, TREE_TEMPLATES, TREE_TEXT } from './treeData.js';
import type { TreeTemplateDef } from './treeData.js';

export { TREE_TEMPLATES, TREE_TEXT };
export type { TreeTemplateDef };

/** Alias so callers can talk about the tree's text without knowing the export's name. */
export const TALENT_TEXT = TREE_TEXT;

/** Every value of `Currencies`, in the original's 1-based declaration order. */
export type TalentCurrency =
  | 'Gold'
  | 'ClawCurrency'
  | 'ArcherCurrency'
  | 'PortalCurrency'
  | 'WarriorCurrency'
  | 'MageCurrency'
  | 'BatCurrency'
  | 'MiningRock'
  | 'MiningCopper'
  | 'MiningSilver'
  | 'MiningGold'
  | 'GuardianCurrency';

export type TalentUnlock = 'start' | 'always' | 'requiresConnection';

export interface TalentNode {
  id: string;
  name: string;
  /** Graph-local position in the original's UI units (already x1.2). */
  x: number;
  y: number;
  maxLevel: number;
  unlock: TalentUnlock;
  tpl: 'base' | 'portal';
  /** The node's own effective cost, one line per currency it charges. */
  costs: Array<{ currency: TalentCurrency; costEquation: string }>;
  /** The node's own effective grants, index-aligned with `valueEq` in the export. */
  grants: Array<{
    stat: string;
    prop: StatsProp;
    valueEquation: string;
    /** `StatInfo`'s localization key, e.g. `DamageFlat`. */
    locKey: string;
    numType: string;
    round: number;
    signed: boolean;
    /** True for stats the original renders as a list rather than a single number. */
    isList: boolean;
  }>;
  /** Effective visuals. */
  shapeOff: string;
  shapeOn: string;
  highlighter: string;
  shapeSize: number;
  highlighterSize: number;
  iconSize: number;
  icon: string;
  conns: Array<{ to: string; curve: number }>;
}

const PROP_BY_NAME: Record<string, StatsProp> = {
  Flat: StatsProp.Flat,
  Additive: StatsProp.Additive,
  Multiplicative: StatsProp.Multiplicative,
};

/** Raw `StatInfo` lookup, exposed so a tooltip can describe a grant. */
export const STAT_INFO_BY_PID = STAT_INFO;

export const TALENT_NODES: TalentNode[] = TREE_NODES.map((n) => ({
  id: n.id,
  name: n.name,
  x: n.x,
  y: n.y,
  maxLevel: n.max,
  unlock: n.unlock,
  tpl: n.tpl,
  // The exporter guarantees one equation per currency; no node charges two.
  costs: n.costEq.map((eq) => ({ currency: n.cur as TalentCurrency, costEquation: eq })),
  grants: n.statPids.map((pid, i) => {
    const info = STAT_INFO[String(pid)];
    return {
      stat: info?.variable ?? `Unknown_${pid}`,
      prop: PROP_BY_NAME[info?.prop ?? 'Flat'] ?? StatsProp.Flat,
      valueEquation: n.valueEq[i] ?? '0',
      locKey: info?.locKey ?? `Unknown_${pid}`,
      numType: info?.numType ?? 'Float',
      round: info?.round ?? 0,
      signed: info?.signed ?? false,
      isList: info?.list ?? false,
    };
  }),
  shapeOff: n.shapeOff,
  shapeOn: n.shapeOn,
  highlighter: n.highlighter,
  shapeSize: n.shapeSize,
  highlighterSize: n.highlighterSize,
  iconSize: n.iconSize,
  icon: n.icon,
  conns: n.conns,
}));

export const TALENT_BY_ID: Record<string, TalentNode> = Object.fromEntries(
  TALENT_NODES.map((n) => [n.id, n]),
);

/** Undirected adjacency, which is what `TreeNodeInfo.GetAllConnectedNodes` gives. */
export const TALENT_LINKS: Record<string, string[]> = (() => {
  const out: Record<string, string[]> = {};
  for (const n of TALENT_NODES) out[n.id] = [];
  for (const n of TALENT_NODES) {
    for (const c of n.conns) {
      if (!(c.to in TALENT_BY_ID)) continue;
      if (!out[n.id].includes(c.to)) out[n.id].push(c.to);
      if (!out[c.to].includes(n.id)) out[c.to].push(n.id);
    }
  }
  return out;
})();

/** The one node the player can buy without owning a neighbour. */
export const TALENT_ROOT = TALENT_NODES.find((n) => n.unlock === 'always') ?? TALENT_NODES[0];

/** Every connection, de-duplicated, carrying the original's `curveAmount`. */
export const TALENT_EDGES: Array<{ a: string; b: string; curve: number }> = (() => {
  const seen = new Set<string>();
  const out: Array<{ a: string; b: string; curve: number }> = [];
  for (const n of TALENT_NODES) {
    for (const c of n.conns) {
      if (!(c.to in TALENT_BY_ID)) continue;
      const key = [n.id, c.to].sort().join('|');
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({ a: n.id, b: c.to, curve: c.curve });
    }
  }
  return out;
})();

/**
 * The graph's bounding box in UI units, padded by the largest node so nothing clips.
 * The original never centres the tree (`centerTree = false`); this only sizes the pan
 * viewport and clamps the drag.
 */
export const TALENT_BOUNDS = (() => {
  /*
   * Half a base node (50/2). Only the HORIZONTAL padding is the original's own
   * (`TreeHorizontalPan.leftPadding`/`rightPadding` = 40); vertically it has no padding at
   * all, it just needs the tallest node's half-height inside the window. Padding both axes
   * by a full node made the box 580 units tall instead of 530, which pushed the fit scale
   * down and rendered every node smaller than the original does.
   */
  const pad = 25;
  const xs = TALENT_NODES.map((n) => n.x);
  const ys = TALENT_NODES.map((n) => n.y);
  const minX = Math.min(...xs) - pad;
  const minY = Math.min(...ys) - pad;
  const maxX = Math.max(...xs) + pad;
  const maxY = Math.max(...ys) + pad;
  return { minX, minY, maxX, maxY, width: maxX - minX, height: maxY - minY };
})();
