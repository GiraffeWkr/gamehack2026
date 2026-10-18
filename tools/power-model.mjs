/**
 * Player-power model used to design the new enemy curve.
 *
 *   node tools/power-model.mjs [goldGrowth]
 *
 * Plays the talent tree greedily with the gold a single clear of each level pays out,
 * counts BOTH damage sources (bow + sustained arrow rain), and prints the DPS the
 * enemy table should be balanced against.
 */
import { TREE_NODES, STAT_INFO } from '../dist-verify/content/treeData.js';
import {
  ENEMY_HEALTH_PER_LEVEL, ENEMY_GOLD_PER_LEVEL, PACKS_PER_LEVEL,
  ENEMIES_PER_PACK, ENEMIES_PER_PORTAL_PACK, BASE,
  ENEMIES as ENEMY_DEFS,
} from '../dist-verify/content/data.js';
import { evaluate } from '../dist-verify/core/equations.js';

const MAX = 40;
const GOLD_GROWTH = Number(process.argv[2] ?? 1.0);
const COST_EXP = Number(process.argv[3] ?? 1.0);
const num = (eq, x) => { try { return evaluate(eq, x); } catch { return 0; } };

const nodes = TREE_NODES.map((n) => {
  const info = STAT_INFO[String(n.statPids[0])] ?? { variable: 'UNKNOWN', prop: '?' };
  return {
    id: n.id, variable: info.variable, prop: info.prop, max: n.max,
    unlock: n.unlock, links: n.conns.map((c) => c.to), currency: n.cur,
    value: (l) => num(n.valueEq[0], l),
    cost: (l) => Math.max(1, Math.round(Math.pow(num(n.costEq[0], l), COST_EXP))),
  };
});
const levels = new Map(nodes.map((n) => [n.id, n.unlock === 'start' ? 1 : 0]));
// Undirected adjacency, exactly like TALENT_LINKS in content/talent.ts.
const undirected = new Map(nodes.map((n) => [n.id, new Set()]));
for (const n of nodes) for (const id of n.links) {
  if (!undirected.has(id)) continue;
  undirected.get(n.id).add(id);
  undirected.get(id).add(n.id);
}
let gold = 0;
let portal = 0;

const accessible = (n) => levels.get(n.id) >= 1 || n.unlock === 'start' || n.unlock === 'always'
  || [...undirected.get(n.id)].some((id) => (levels.get(id) ?? 0) >= 1);

function buy() {
  for (;;) {
    let best = null;
    for (const n of nodes) {
      if (levels.get(n.id) >= n.max || !accessible(n)) continue;
      const cost = n.cost(levels.get(n.id) + 1);
      const currency = n.currency;
      if (currency === 'Gold') { if (cost > gold) continue; }
      else if (cost > portal) continue;
      if (!best || cost < best.cost) best = { n, cost, currency };
    }
    if (!best) return;
    if (best.currency === 'Gold') gold -= best.cost; else portal -= best.cost;
    levels.set(best.n.id, levels.get(best.n.id) + 1);
  }
}

function statLayers() {
  const s = {
    dmgFlat: BASE.damage, dmgAdd: 0, dmgMult: 1,
    asAdd: 0, asMult: 1,
    crit: 0, critMult: BASE.baseCriticalMultiplier,
    dbl: 0, tri: 0,
    hpFlat: BASE.health, hpAdd: 0, hpMult: 1,
    enemyHpAdd: 0, enemyDmgAdd: 0,
    rainHits: 1, rainProj: 1, rainDmg: 50,
  };
  for (const n of nodes) {
    const l = levels.get(n.id);
    if (l <= 0) continue;
    const d = n.value(l) - (l > 1 ? n.value(l - 1) : 0);
    switch (`${n.variable}·${n.prop}`) {
      case 'Damage·Flat': s.dmgFlat += d; break;
      case 'Damage·Additive': s.dmgAdd += d; break;
      case 'Damage·Multiplicative': s.dmgMult *= 1 + d / 100; break;
      case 'PlayerAttackSpeed·Additive': s.asAdd += d; break;
      case 'PlayerAttackSpeed·Multiplicative': s.asMult *= 1 + d / 100; break;
      case 'CriticalChance·Flat': s.crit += d; break;
      case 'CriticalMultiplier·Flat': s.critMult += d; break;
      case 'ChanceForDoubleDamage·Flat': s.dbl += d; break;
      case 'ChanceForTripleDamage·Flat': s.tri += d; break;
      case 'Health·Flat': s.hpFlat += d; break;
      case 'Health·Additive': s.hpAdd += d; break;
      case 'Health·Multiplicative': s.hpMult *= 1 + d / 100; break;
      case 'EnemyHealthMultiplier·Additive': s.enemyHpAdd += d; break;
      case 'EnemyDamageMultiplier·Additive': s.enemyDmgAdd += d; break;
      case 'MouseNumberOfHits·Flat': s.rainHits += d; break;
      case 'NumberOfMouseProjectiles·Flat': s.rainProj += d; break;
      case 'MouseArrowDamage·Additive': s.rainDmg += d; break;
      default: break;
    }
  }
  return s;
}

const killsOf = (lvl) => {
  const row = Math.min(lvl, 30) - 1;
  return PACKS_PER_LEVEL[row] * ENEMIES_PER_PACK[row] + ENEMIES_PER_PORTAL_PACK[row];
};

let prevGold = 0;
const rows = [];
for (let lvl = 1; lvl <= MAX; lvl++) {
  const row = Math.min(lvl, 30) - 1;
  const baseGold = killsOf(lvl) * ENEMY_GOLD_PER_LEVEL[row];
  const income = baseGold * Math.pow(GOLD_GROWTH, lvl - 1);
  const backfill = lvl > 30 ? income : income;
  gold += backfill;
  portal += 1;
  buy();
  const s = statLayers();
  const perHit = s.dmgFlat * (1 + s.dmgAdd / 100) * s.dmgMult;
  const as = BASE.playerAttackSpeed * s.asMult * (1 + s.asAdd / 100);
  const crit = 1 + (Math.min(s.crit, 100) / 100) * (s.critMult / 100);
  const multi = 1 + Math.min(s.dbl, 100) / 100 + 2 * Math.min(s.tri, 100) / 100;
  // Tapping: magazine 5, regen .4s => 2.5 shots/s; each shot = rain projectiles*hits,
  // and `MouseArrowDamage` is a % over the bow.
  const rainRate = 2.5;
  const rainDps = perHit * (1 + s.rainDmg / 100) * s.rainProj * s.rainHits * rainRate * crit * multi;
  const bowDps = perHit * as * crit * multi;
  const dps = (bowDps + rainDps);
  const playerHp = s.hpFlat * (1 + s.hpAdd / 100) * s.hpMult;
  const enemyHp = ENEMY_HEALTH_PER_LEVEL[row] * (1 + s.enemyHpAdd / 100);
  const ttkClaw = enemyHp * ENEMY_DEFS.Claw.healthMultiplier / dps;
  const ttkWar = enemyHp * ENEMY_DEFS.Warrior.healthMultiplier / dps;
  const enemyDmg = ENEMY_DEFS.Claw.damageMultiplier * (ENEMY_HEALTH_PER_LEVEL ? 1 : 1);
  rows.push({ lvl, income, gold, dps, playerHp, ttkClaw, ttkWar, mult: s.dmgMult, flat: s.dmgFlat, add: s.dmgAdd });
}

console.log('lvl  income     goldLeft   DPS        HP        TTKclaw  TTKwarrior');
for (const r of rows) {
  const f = (v) => (v >= 1e6 ? v.toExponential(2) : v >= 1000 ? Math.round(v).toString() : v.toFixed(1));
  console.log(`${String(r.lvl).padStart(3)}  ${f(r.income).padStart(9)}  ${f(r.gold).padStart(9)}  ${f(r.dps).padStart(9)}  ${f(r.playerHp).padStart(8)}  ${r.ttkClaw.toFixed(2).padStart(7)}  ${r.ttkWar.toFixed(2)}  mult=${r.mult.toExponential(2)} flat=${r.flat.toFixed(0)} add=${r.add.toFixed(0)}`);
}
const bought = [...levels.entries()].filter(([, v]) => v > 0);
console.log(`bought ${bought.length}/${nodes.length} nodes, portal left ${portal}`);
const dmgNodes = nodes.filter((n) => `${n.variable}`.startsWith('Damage') || n.variable.startsWith('Mouse') || n.variable.startsWith('Critical') || n.variable.startsWith('ChanceForDouble'));
for (const n of dmgNodes) {
  console.log(`  ${n.variable.padEnd(24)} ${n.prop.padEnd(14)} lv=${levels.get(n.id)}/${n.max} cur=${n.currency} cost1=${n.cost(1).toExponential(2)} accessible=${accessible(n)}`);
}
const d = (k) => rows[rows.length - 1][k] / rows[0][k];
console.log(`growth L1->L40: DPS x${d('dps').toExponential(2)}, player HP x${d('playerHp').toExponential(2)}`);
