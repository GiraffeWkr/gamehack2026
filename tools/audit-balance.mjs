/**
 * Balance audit: reconstructs the player's achievable power curve from the talent tree
 * and compares it with the authored enemy curve.
 *
 *   node tools/audit-balance.mjs
 *
 * Reads the COMPILED content tables from dist-verify/ so it evaluates exactly the
 * equations the game ships (`npm run verify` produces them).
 */
import { TREE_NODES, STAT_INFO } from '../dist-verify/content/treeData.js';
import {
  ENEMY_HEALTH_PER_LEVEL,
  ENEMY_DAMAGE_PER_LEVEL,
  ENEMY_GOLD_PER_LEVEL,
  PACKS_PER_LEVEL,
  ENEMIES_PER_PACK,
  ENEMIES_PER_PORTAL_PACK,
  PROGRESSION,
  BASE,
} from '../dist-verify/content/data.js';
import { evaluate } from '../dist-verify/core/equations.js';

const MAX = 30;

/** Every node, with its stat variable + layer + per-level value/cost. */
const nodes = TREE_NODES.map((n) => {
  const pid = String(n.statPids[0]);
  const info = STAT_INFO[pid] ?? { variable: 'UNKNOWN', prop: '?' };
  return {
    id: n.id,
    variable: info.variable,
    prop: info.prop,
    max: n.max,
    valueEq: n.valueEq[0],
    costEq: n.costEq[0],
    at: (lvl) => {
      try { return evaluate(n.valueEq[0], lvl); } catch { return 0; }
    },
    costAt: (lvl) => {
      try { return evaluate(n.costEq[0], lvl); } catch { return 0; }
    },
  };
});

const byStat = new Map();
for (const n of nodes) {
  const key = `${n.variable}·${n.prop}`;
  const e = byStat.get(key) ?? { count: 0, maxValue: 0, totalCost: 0, nodes: [] };
  e.count++;
  let v = 0;
  let cost = 0;
  for (let lvl = 1; lvl <= n.max; lvl++) {
    v += n.at(lvl);
    cost += n.costAt(lvl);
  }
  e.maxValue += v;
  e.totalCost += cost;
  e.nodes.push(n);
  byStat.set(key, e);
}

console.log('=== talent tree: maxed values per stat (all 168 nodes) ===');
for (const [key, e] of [...byStat.entries()].sort((a, b) => b[1].maxValue - a[1].maxValue)) {
  console.log(`${key.padEnd(42)} nodes=${String(e.count).padStart(3)}  max=+${e.maxValue.toFixed(0).padStart(10)}  cost=${e.totalCost.toExponential(2)}`);
}

const find = (variable, prop) => [...byStat.entries()]
  .filter(([k]) => k === `${variable}·${prop}`)
  .map(([, e]) => e)[0];

const sum = (variable, prop = 'Additive') => find(variable, prop)?.maxValue ?? 0;

// ------------------------------------------------------------------ power stack
const dmgAdd = sum('Damage', 'Additive');
const dmgMult = 1 + sum('Damage', 'Multiplicative') / 100;
const asAdd = sum('PlayerAttackSpeed', 'Additive');
const asMult = 1 + sum('PlayerAttackSpeed', 'Multiplicative') / 100;
const critChance = sum('CriticalChance');
const critMultAdd = sum('CriticalMultiplier');
const dbl = sum('ChanceForDoubleDamage');
const tri = sum('ChanceForTripleDamage');
const enemyHpAdd = sum('EnemyHealthMultiplier', 'Additive');
const enemyDmgAdd = sum('EnemyDamageMultiplier', 'Additive');

const attacksPerSec = BASE.playerAttackSpeed * (1 + asAdd / 100) * asMult;
const critFactor = 1 + (critChance / 100) * ((BASE.baseCriticalMultiplier + critMultAdd) / 100);
const doubleFactor = 1 + (dbl / 100) + 2 * (tri / 100);
const bowDps = BASE.damage * (1 + dmgAdd / 100) * dmgMult * attacksPerSec * critFactor * doubleFactor;
const rainPerShot = BASE.damage * (1 + dmgAdd / 100) * dmgMult * 1.5 * critFactor * doubleFactor;

console.log('\n=== player power at a FULLY MAXED tree ===');
console.log(`Damage additive +${dmgAdd}%  multiplicative x${dmgMult.toFixed(2)}`);
console.log(`Attack speed ${attacksPerSec.toFixed(2)}/s (base ${BASE.playerAttackSpeed})`);
console.log(`Crit ${critChance}% @ +${BASE.baseCriticalMultiplier + critMultAdd}%  double ${dbl}%  triple ${tri}%`);
console.log(`Enemy HP multiplier +${enemyHpAdd}% -> x${(1 + enemyHpAdd / 100).toFixed(2)}`);
console.log(`Enemy damage multiplier +${enemyDmgAdd}%`);
console.log(`Bow DPS ~ ${bowDps.toFixed(1)}   arrow-rain per tap ~ ${rainPerShot.toFixed(1)}`);

// -------------------------------------------------------------- enemy HP curve
console.log('\n=== authored enemy curve (per-kill base HP / damage / gold, pack totals) ===');
let cumulativeGold = 0;
const killsPerLevel = (lvl) => {
  const row = Math.min(lvl, MAX) - 1;
  return PACKS_PER_LEVEL[row] * ENEMIES_PER_PACK[row] + ENEMIES_PER_PORTAL_PACK[row];
};
for (let lvl = 1; lvl <= MAX; lvl++) {
  const hp = ENEMY_HEALTH_PER_LEVEL[lvl - 1];
  const dmg = ENEMY_DAMAGE_PER_LEVEL[lvl - 1];
  const gold = ENEMY_GOLD_PER_LEVEL[lvl - 1];
  const kills = killsPerLevel(lvl);
  cumulativeGold += kills * gold;
  const ttkBow = (hp * (1 + enemyHpAdd / 100)) / bowDps;
  const ttkRain = (hp * (1 + enemyHpAdd / 100)) / rainPerShot;
  console.log(
    `L${String(lvl).padStart(2)}  hp=${hp.toExponential(2).padStart(9)} dmg=${String(dmg).padStart(4)} gold=${gold.toExponential(2).padStart(9)}`
    + `  kills=${String(kills).padStart(4)}  cumGold=${cumulativeGold.toExponential(2).padStart(10)}`
    + `  TTK(bow, maxed)=${ttkBow.toFixed(1)}s  TTK(rain)=${ttkRain.toFixed(1)}s`,
  );
}

const totalTreeCost = [...byStat.values()].reduce((a, e) => a + e.totalCost, 0);
console.log(`\ntree cost to max everything: ${totalTreeCost.toExponential(3)} gold`);
console.log(`total gold earned clearing L1..30 once: ${cumulativeGold.toExponential(3)}`);
console.log(`ratio (earned / cost): ${(cumulativeGold / totalTreeCost).toFixed(3)}`);
