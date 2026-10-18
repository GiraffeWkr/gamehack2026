/**
 * Scenario explorer for the port's re-based talent economy.
 *
 *   node tools/economy-sim.mjs [costBase] [costGrowth] [goldGrowth]
 *
 * The shipped tree prices nodes for the ORIGINAL's economy (equipment, forging,
 * shaping, gem shops). This port has none of that, so the tree's raw costs put every
 * meaningful multiplier ~10^6 beyond the gold a run can earn. This script re-bases the
 * cost ladder by cost rank (so the designer's intended order survives) and reports the
 * DPS curve the player would actually reach.
 */
import { TREE_NODES, STAT_INFO } from '../dist-verify/content/treeData.js';
import {
  ENEMY_GOLD_PER_LEVEL, PACKS_PER_LEVEL, ENEMIES_PER_PACK, ENEMIES_PER_PORTAL_PACK,
  BASE,
} from '../dist-verify/content/data.js';
import { evaluate } from '../dist-verify/core/equations.js';

const C0 = Number(process.argv[2] ?? 5);
const CG = Number(process.argv[3] ?? 1.121);
const GOLD_GROWTH = Number(process.argv[4] ?? 1.45);
const MAX = 40;
const num = (eq, x) => { try { return evaluate(eq, x); } catch { return 0; } };

const nodes = TREE_NODES.map((n) => {
  const info = STAT_INFO[String(n.statPids[0])] ?? { variable: 'UNKNOWN', prop: '?' };
  return {
    id: n.id, variable: info.variable, prop: info.prop, max: n.max,
    unlock: n.unlock, links: n.conns.map((c) => c.to), currency: n.cur,
    value: (l) => num(n.valueEq[0], l),
    rawCost: (l) => num(n.costEq[0], l),
  };
});

// Cost rank: the original's first-level price decides the tier. Portal nodes keep their
// 1-beacon price, they are the long-term sink and not part of the gold ladder.
const goldNodes = nodes.filter((n) => n.currency === 'Gold').sort((a, b) => a.rawCost(1) - b.rawCost(1));
const rank = new Map(goldNodes.map((n, i) => [n.id, i]));
for (const n of nodes) {
  n.cost = n.currency === 'Gold'
    ? (l) => Math.max(1, Math.round(C0 * Math.pow(CG, rank.get(n.id)) * Math.pow(l, 1.5)))
    : () => 1;
}

const levels = new Map(nodes.map((n) => [n.id, n.unlock === 'start' ? 1 : 0]));
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
      const purse = n.currency === 'Gold' ? gold : portal;
      if (cost > purse) continue;
      if (!best || cost < best.cost) best = { n, cost };
    }
    if (!best) return;
    if (best.n.currency === 'Gold') gold -= best.cost; else portal -= best.cost;
    levels.set(best.n.id, levels.get(best.n.id) + 1);
  }
}

function layers() {
  const s = {
    dmgFlat: BASE.damage, dmgAdd: 0, dmgMult: 1,
    asAdd: 0, asMult: 1, crit: 0, critMult: BASE.baseCriticalMultiplier,
    dbl: 0, tri: 0, hpFlat: BASE.health, hpAdd: 0, hpMult: 1,
    enemyHpAdd: 0, rainHits: 1, rainProj: 1, rainDmg: 50,
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

const rows = [];
for (let lvl = 1; lvl <= MAX; lvl++) {
  const row = Math.min(lvl, 30) - 1;
  // Base gold of 1/level scaled by the designed growth; kills follow the pack tables.
  const perKill = Math.pow(GOLD_GROWTH, lvl - 1);
  gold += killsOf(lvl) * perKill;
  portal += 1;
  buy();
  const s = layers();
  const perHit = s.dmgFlat * (1 + s.dmgAdd / 100) * s.dmgMult;
  const as = BASE.playerAttackSpeed * s.asMult * (1 + s.asAdd / 100);
  const crit = 1 + (Math.min(s.crit, 100) / 100) * (s.critMult / 100);
  const multi = 1 + Math.min(s.dbl, 100) / 100 + 2 * Math.min(s.tri, 100) / 100;
  const rainDps = perHit * (1 + s.rainDmg / 100) * s.rainProj * s.rainHits * 2.5 * crit * multi;
  const dps = perHit * as * crit * multi + rainDps;
  rows.push({ lvl, gold, dps, playerHp: s.hpFlat * (1 + s.hpAdd / 100) * s.hpMult, nodes: [...levels.values()].reduce((a, b) => a + b, 0), mult: s.dmgMult, flat: s.dmgFlat });
}

const f = (v) => (v >= 1e6 ? v.toExponential(2) : v >= 1000 ? Math.round(v).toString() : v.toFixed(1));
console.log(`cost ladder ${C0} x ${CG}^rank, gold x${GOLD_GROWTH}/level`);
console.log('lvl  goldLeft   nodeLv  dps        hp         mult      flat');
for (const r of rows) {
  console.log(`${String(r.lvl).padStart(3)}  ${f(r.gold).padStart(9)}  ${String(r.nodes).padStart(6)}  ${f(r.dps).padStart(9)}  ${f(r.playerHp).padStart(9)}  ${r.mult.toExponential(2).padStart(9)}  ${r.flat.toFixed(0)}`);
}
const last = rows[rows.length - 1];
console.log(`DPS L1->L40: ${rows[0].dps.toFixed(1)} -> ${f(last.dps)}  (x${(last.dps / rows[0].dps).toExponential(2)})`);
console.log(`HP L1->L40: ${rows[0].playerHp.toFixed(1)} -> ${f(last.playerHp)}`);
