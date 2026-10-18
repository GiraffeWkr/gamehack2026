/**
 * Balance audit: builds a realistic "player power by level" model from the shipping
 * talent tree + gold income, then compares it with the authored enemy curve.
 *
 *   node tools/audit-balance.mjs
 *
 * Model (deliberately optimistic, so a failure here is a real failure):
 *  - The player clears each level once and spends ALL gold on the cheapest accessible
 *    talent node (connections respected, other currencies ignored).
 *  - Damage = Flat x (1 + Additive/100) x Multiplicative, exactly like StatBag.
 *  - DPS counts the bow only; arrow rain adds burst on top, so this understates DPS.
 */
import { TREE_NODES, STAT_INFO } from '../dist-verify/content/treeData.js';
import {
  ENEMY_HEALTH_PER_LEVEL,
  ENEMY_DAMAGE_PER_LEVEL,
  ENEMY_GOLD_PER_LEVEL,
  PACKS_PER_LEVEL,
  ENEMIES_PER_PACK,
  ENEMIES_PER_PORTAL_PACK,
  BASE,
  PROGRESSION,
  ENEMIES as ENEMY_DEFS,
} from '../dist-verify/content/data.js';
import { evaluate } from '../dist-verify/core/equations.js';

const MAX = 30;
const num = (eq, x) => {
  try { return evaluate(eq, x); } catch { return 0; }
};

const nodes = TREE_NODES.map((n) => {
  const info = STAT_INFO[String(n.statPids[0])] ?? { variable: 'UNKNOWN', prop: '?' };
  return {
    id: n.id,
    variable: info.variable,
    prop: info.prop,
    max: n.max,
    unlock: n.unlock,
    links: n.conns.map((c) => c.to),
    value: (lvl) => num(n.valueEq[0], lvl),
    cost: (lvl) => num(n.costEq[0], lvl),
  };
});
const byId = new Map(nodes.map((n) => [n.id, n]));

/** Sum a stat across every node at its max level (upper bound, for reference). */
function maxed(variable, prop) {
  let v = 0;
  for (const n of nodes) if (n.variable === variable && n.prop === prop) {
    v += n.value(n.max);
  }
  return v;
}

// ------------------------------------------------------------------ purchasing
const levels = new Map(nodes.map((n) => [n.id, n.unlock === 'start' ? 1 : 0]));
const purse = { gold: 0 };

function accessible(n) {
  if (levels.get(n.id) >= 1) return true;
  if (n.unlock === 'start' || n.unlock === 'always') return true;
  return n.links.some((id) => (levels.get(id) ?? 0) >= 1);
}

function buyCheapest() {
  for (;;) {
    let best = null;
    for (const n of nodes) {
      if (levels.get(n.id) >= n.max) continue;
      if (!accessible(n)) continue;
      const next = levels.get(n.id) + 1;
      const cost = n.cost(next);
      if (cost > purse.gold) continue;
      if (!best || cost < best.cost) best = { n, cost, next };
    }
    if (!best) return;
    purse.gold -= best.cost;
    levels.set(best.n.id, best.next);
  }
}

/** Rebuild the stat layers from the current node levels, as TalentTree does. */
function stats() {
  const out = {
    damageFlat: BASE.damage,
    damageAdd: 0,
    damageMult: 1,
    asAdd: 0,
    asMult: 1,
    crit: 0,
    critMult: BASE.baseCriticalMultiplier,
    dbl: 0,
    tri: 0,
    enemyHpAdd: 0,
    goldAdd: 0,
  };
  for (const n of nodes) {
    const lvl = levels.get(n.id);
    if (lvl <= 0) continue;
    const delta = n.value(lvl) - (lvl > 1 ? n.value(lvl - 1) : 0);
    switch (`${n.variable}·${n.prop}`) {
      case 'Damage·Flat': out.damageFlat += delta; break;
      case 'Damage·Additive': out.damageAdd += delta; break;
      case 'Damage·Multiplicative': out.damageMult *= 1 + delta / 100; break;
      case 'PlayerAttackSpeed·Additive': out.asAdd += delta; break;
      case 'PlayerAttackSpeed·Multiplicative': out.asMult *= 1 + delta / 100; break;
      case 'CriticalChance·Flat': out.crit += delta; break;
      case 'CriticalMultiplier·Flat': out.critMult += delta; break;
      case 'ChanceForDoubleDamage·Flat': out.dbl += delta; break;
      case 'ChanceForTripleDamage·Flat': out.tri += delta; break;
      case 'EnemyHealthMultiplier·Additive': out.enemyHpAdd += delta; break;
      case 'GoldGained·Additive': out.goldAdd += delta; break;
      default: break;
    }
  }
  return out;
}

const killsPerLevel = (lvl) => {
  const row = Math.min(lvl, MAX) - 1;
  return PACKS_PER_LEVEL[row] * ENEMIES_PER_PACK[row] + ENEMIES_PER_PORTAL_PACK[row];
};

const fmt = (v) => (v >= 1e6 ? v.toExponential(2) : v >= 1000 ? `${Math.round(v)}` : v.toFixed(2));

console.log('lvl  goldIncome  cumGold      nodeLv  dmg      atk/s  crit  x2    bowDPS      TTK(claw)  TTK(warrior)');
for (let lvl = 1; lvl <= MAX; lvl++) {
  const row = lvl - 1;
  const gold = killsPerLevel(lvl) * ENEMY_GOLD_PER_LEVEL[row];
  purse.gold += gold;
  buyCheapest();
  const s = stats();
  const atk = BASE.playerAttackSpeed * s.asMult * (1 + s.asAdd / 100);
  const critFactor = 1 + (s.crit / 100) * (s.critMult / 100);
  const dblFactor = 1 + s.dbl / 100 + 2 * s.tri / 100;
  const damage = s.damageFlat * s.damageMult * (1 + s.damageAdd / 100);
  const dps = damage * atk * critFactor * dblFactor;
  const hpMul = 1 + s.enemyHpAdd / 100;
  const clawHp = ENEMY_HEALTH_PER_LEVEL[row] * ENEMY_DEFS.Claw.healthMultiplier * hpMul;
  const warHp = ENEMY_HEALTH_PER_LEVEL[row] * ENEMY_DEFS.Warrior.healthMultiplier * hpMul;
  const bought = [...levels.values()].reduce((a, b) => a + b, 0);
  console.log(
    `${String(lvl).padStart(3)}  ${fmt(gold).padStart(10)}  ${fmt(purse.gold).padStart(9)}  `
    + `${String(bought).padStart(6)}  ${fmt(damage).padStart(8)}  ${atk.toFixed(2).padStart(5)}  `
    + `${String(Math.round(s.crit)).padStart(4)}  ${String(Math.round(s.dbl)).padStart(3)}   ${fmt(dps).padStart(10)}  `
    + `${clawHp / dps >= 60 ? '>60s' : `${(clawHp / dps).toFixed(1)}s`.padStart(7)}     `
    + `${warHp / dps >= 60 ? '>60s' : `${(warHp / dps).toFixed(1)}s`}`,
  );
}

console.log('\nreference: fully maxed tree (impossible economically, upper bound)');
const dm = maxed('Damage', 'Multiplicative');
const df = maxed('Damage', 'Flat');
const da = maxed('Damage', 'Additive');
const asa = maxed('PlayerAttackSpeed', 'Additive');
const cc = maxed('CriticalChance', 'Flat');
const cm = maxed('CriticalMultiplier', 'Flat');
const x2 = maxed('ChanceForDoubleDamage', 'Flat');
const maxDmg = (BASE.damage + df) * (1 + da / 100) * (1 + dm / 100);
const maxAtk = BASE.playerAttackSpeed * (1 + asa / 100);
const maxDps = maxDmg * maxAtk * (1 + (Math.min(cc, 100) / 100) * ((BASE.baseCriticalMultiplier + cm) / 100)) * (1 + Math.min(x2, 100) / 100);
console.log(`damage/index flat=+${df} add=+${da}% mult=+${dm}%  -> per hit ${fmt(maxDmg)}  atk ${maxAtk.toFixed(2)}/s  crit ${cc}%/+${cm}%  -> DPS ~${fmt(maxDps)}`);
console.log(`L30 claw hp x1.1 = ${fmt(ENEMY_HEALTH_PER_LEVEL[29] * 1.1)} -> TTK ${(ENEMY_HEALTH_PER_LEVEL[29] * 1.1 / maxDps).toFixed(1)}s`);
console.log(`levels authored: ${PROGRESSION.lastAuthoredLevel}, cap ${PROGRESSION.maxBattleLevel}`);
