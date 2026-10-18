/**
 * Headless playtest bot: plays a level with continuous tapping and automatic talent
 * purchases, then reports whether the level is clearable and how long it took.
 *
 *   node tools/playtest.mjs [levels] [seconds]
 *
 * Example: node tools/playtest.mjs 1,5,10,20,30,40 300
 *
 * It is the sanity check the pure formulas cannot give: real pack spawning, real enemy
 * AI, real talent purchases, real death.
 */
import { Game } from '../dist-verify/game/game.js';
import { TALENT_NODES } from '../dist-verify/content/talent.js';

const LEVELS = (process.argv[2] ?? '1,5,10,15,20,25,30,35,40').split(',').map(Number);
const SECONDS = Number(process.argv[3] ?? 420);

const results = [];

for (const level of LEVELS) {
  const game = new Game({ archerSpawned: true, level, seed: 1000 + level });
  const input = { aiming: false, aimX: 0, aimY: 0, taps: 0 };
  let buyTimer = 0;
  let deaths = 0;
  let lastKills = 0;
  let stalled = 0;
  let clearTime = null;
  let firstKillAt = null;

  const buy = () => {
    const purses = { gold: game.gold, currencies: game.currencies };
    let bought = true;
    while (bought) {
      bought = false;
      for (const node of TALENT_NODES) {
        if (!game.talent.isAccessible(node) || game.talent.isMaxed(node)) continue;
        const next = game.talent.buy(node, purses);
        if (next) {
          purses.gold = next.gold;
          Object.assign(purses.currencies, next.currencies);
          bought = true;
          break;
        }
      }
    }
    game.gold = purses.gold;
    for (const [k, v] of Object.entries(purses.currencies)) game.currencies[k] = v;
    game.refreshStats();
  };

  const dt = 1 / 60;
  let deathAt = null;
  for (let t = 0; t < SECONDS; t += dt) {
    // Tap every 0.18s. Prioritise ranged enemies - a real player kills the mages that
    // out-range the bow first; the nearest-first bot let them free-fire.
    if (Math.floor(t * 60) % 11 === 0) {
      let best = null;
      let bestScore = Infinity;
      for (const e of game.getEnemyList()) {
        if (!e.alive) continue;
        const dist = Math.abs(e.x - game.px);
        const score = (e.attackKind === 'ranged' ? 0 : 1e6) + dist;
        if (score < bestScore) { bestScore = score; best = e; }
      }
      if (best) {
        input.taps = 1;
        input.aimX = best.x;
        input.aimY = best.y + best.radius * 0.5;
      } else {
        input.taps = 0;
      }
    }
    game.tick(dt, input);
    buyTimer += dt;
    if (buyTimer > 1) { buyTimer = 0; buy(); }
    if (firstKillAt === null && game.kills > 0) firstKillAt = t;
    if (game.kills === lastKills) stalled += dt; else stalled = 0;
    lastKills = game.kills;
    if (game.runState === 'cleared' && clearTime === null) { clearTime = t; break; }
    if (game.hp <= 0) { deaths++; deathAt = t; break; }
  }

  const aliveByType = {};
  for (const e of game.getEnemyList()) if (e.alive) aliveByType[e.type] = (aliveByType[e.type] ?? 0) + 1;
  const boss = game.getEnemyList().find((e) => e.alive && (e.isGuardian || e.isPortal));

  results.push({
    level,
    kills: game.kills,
    deaths,
    hp: Math.round(game.hp),
    maxHp: Math.round(game.maxHp),
    clearTime: clearTime === null ? null : Math.round(clearTime),
    firstKill: firstKillAt === null ? null : +firstKillAt.toFixed(1),
    gold: Math.round(game.gold),
    damage: Math.round(game.stats.get('Damage')),
    deathAt: deathAt === null ? null : Math.round(deathAt),
    alive: aliveByType,
    boss: boss ? `${boss.type} ${Math.round(boss.hp)}/${Math.round(boss.maxHp)}` : null,
  });
  const r = results[results.length - 1];
  console.log(`L${String(level).padStart(2)}  kills=${String(r.kills).padStart(4)}  clear=${r.clearTime === null ? (r.deathAt === null ? '  no ' : `die@${r.deathAt}s`) : `${String(r.clearTime).padStart(4)}s`}  firstKill=${r.firstKill === null ? '-' : `${r.firstKill}s`}  hp=${r.hp}/${r.maxHp}  dmg=${r.damage}  gold=${r.gold}`);
  if (r.deathAt !== null) {
    console.log(`      died: ${JSON.stringify(r.alive)}  boss=${r.boss ?? 'none'}`);
  }
}

const cleared = results.filter((r) => r.clearTime !== null).length;
console.log(`\n${cleared}/${results.length} levels cleared inside the time budget`);
