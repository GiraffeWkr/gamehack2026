/**
 * Acceptance harness for the mastery screen.
 *
 * Everything asserted comes from the shipping build via `analysis/export_mastery_web.py`:
 * nine tiles, the 0/20/50/.../1500 NPC ladder, the one-unlock-per-level reward track, the
 * pinnacles refusing to level, and awakening needing its level gate.
 *
 * Usage: node tools/cdp-mastery.mjs [width] [height]
 */
import { writeFileSync } from 'node:fs';

const W = Number(process.argv[2] ?? 1280);
const H = Number(process.argv[3] ?? 720);
const BASE = process.env.ZAD_BASE ?? 'http://localhost:5173';
const PORT = 9333;
let nextId = 1;
let failures = 0;

function check(name, ok, detail = '') {
  if (ok) console.log(`  ok   ${name}${detail ? `  (${detail})` : ''}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `  — ${detail}` : ''}`);
  }
}

async function connect(port) {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      return (await res.json()).webSocketDebuggerUrl;
    } catch {
      await new Promise((r) => setTimeout(r, 250));
    }
  }
  throw new Error('devtools endpoint never came up');
}

function rpc(ws, method, params = {}, sessionId) {
  const id = nextId++;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  return new Promise((resolve, reject) => {
    const onMessage = (ev) => {
      let msg;
      try {
        msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      } catch {
        return;
      }
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify(payload));
  });
}

const ws = new WebSocket(await connect(PORT));
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const { targetId } = await rpc(ws, 'Target.createTarget', { url: 'about:blank' });
const { sessionId } = await rpc(ws, 'Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => rpc(ws, m, p, sessionId);
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 1, mobile: W < 700,
});
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'try { localStorage.clear(); } catch (e) {}',
});
await send('Page.navigate', { url: `${BASE}/?fast=3&mastery=1` });
await new Promise((r) => setTimeout(r, 3500));

console.log(`\n[mastery screen ${W}x${H}]`);

const shape = await evaluate(`(() => {
  const p = document.querySelector('.mastery');
  if (!p) return { error: 'no mastery panel' };
  const tiles = [...p.querySelectorAll('.mastery-tile')];
  return {
    visible: !p.classList.contains('hidden'),
    declared: Number(p.dataset.tiles),
    tiles: tiles.length,
    states: tiles.map((t) => t.dataset.state),
    brokenIcons: [...p.querySelectorAll('.mt-icon')].filter((i) => i.complete && i.naturalWidth === 0).length,
    iconCount: new Set([...p.querySelectorAll('.mt-icon')].map((i) => i.getAttribute('src'))).size,
    locked: tiles.filter((t) => t.dataset.state === 'locked').length,
    rewards: [...p.querySelectorAll('.mr-chip')].length,
    rewardsGot: [...p.querySelectorAll('.mr-chip.got')].length,
    npcLevel: p.querySelector('.npc-level')?.textContent,
    npcCost: p.querySelector('.npc-cost')?.textContent,
  };
})()`);

check('the mastery panel is open', shape.visible === true);
check('nine tiles', shape.tiles === 9 && shape.declared === 9, `${shape.tiles}`);
check('every icon resolved', shape.brokenIcons === 0, `${shape.brokenIcons} broken`);
check('all nine icons are distinct', shape.iconCount === 9, `${shape.iconCount}`);
check('eight are locked at the start', shape.locked === 8, `${shape.locked} locked`);
check('the reward track lists 10 unlocks', shape.rewards === 10, `${shape.rewards}`);
check('one is already granted', shape.rewardsGot === 1, `${shape.rewardsGot}`);
check('the NPC starts at level 1', shape.npcLevel === '等级 1 / 10', shape.npcLevel);
check('level 2 costs the authored 20 bat', shape.npcCost === '蝠币 20', shape.npcCost);

// Buy the NPC up and watch the reward track fill in order.
const npc = await evaluate(`(() => {
  const z = window.__zad;
  const g = z.game;
  g.currencies.BatCurrency = 100000;
  z.masteryPanel.refresh(g.mastery, g.currencies.BatCurrency);
  const before = g.currencies.BatCurrency;
  for (let i = 0; i < 5; i++) document.querySelector('.npc-levelup').click();
  const unlocked = [...document.querySelectorAll('.mastery-tile')]
    .filter((t) => t.dataset.state !== 'locked').length;
  const awakenChip = [...document.querySelectorAll('.mr-chip')].find((c) => c.dataset.level === '6');
  return {
    level: g.mastery.npcLevel,
    spent: before - g.currencies.BatCurrency,
    unlocked,
    awakenGot: awakenChip ? awakenChip.classList.contains('got') : null,
  };
})()`);
check('five NPC levels were bought', npc.level === 6, String(npc.level));
// 20 + 50 + 100 + 150 + 250 = 570
check('the ladder charged the authored 570', npc.spent === 570, `${npc.spent}`);
check('level 6 unlocks Awakening, not a sixth mastery', npc.awakenGot === true);
check('five mastery tiles are now open', npc.unlocked === 5, `${npc.unlocked}`);

// A pinnacle must refuse to level even with unlimited currency.
const pin = await evaluate(`(() => {
  const z = window.__zad;
  const g = z.game;
  g.currencies.BatCurrency = 1e9;
  z.masteryPanel.refresh(g.mastery, g.currencies.BatCurrency);
  // Index 2 is 铭刻巅峰, the first pinnacle.
  const tile = document.querySelector('.mastery-tile[data-index="2"]');
  const before = g.mastery.level('Mastery2');
  tile.querySelector('.mt-level').click();
  return {
    state: tile.dataset.state,
    levelBefore: before,
    levelAfter: g.mastery.level('Mastery2'),
    levelBtnHidden: tile.querySelector('.mt-level').hidden,
  };
})()`);
check('the pinnacle tile reads as a pinnacle', pin.state === 'pinnacle', String(pin.state));
check('its level-up button is hidden', pin.levelBtnHidden === true);
check('clicking it cannot level it', pin.levelAfter === pin.levelBefore,
  `${pin.levelBefore} -> ${pin.levelAfter}`);

// A normal mastery levels on its own curve.
const norm = await evaluate(`(() => {
  const z = window.__zad;
  const g = z.game;
  g.currencies.BatCurrency = 1e9;
  z.masteryPanel.refresh(g.mastery, g.currencies.BatCurrency);
  const tile = document.querySelector('.mastery-tile[data-index="0"]');
  const before = g.currencies.BatCurrency;
  const lv0 = g.mastery.level('Mastery0');
  tile.querySelector('.mt-level').click();
  return {
    lv0, lv1: g.mastery.level('Mastery0'),
    cost: before - g.currencies.BatCurrency,
    text: tile.querySelector('.mt-lv')?.textContent,
  };
})()`);
check('a normal mastery levels', norm.lv1 === norm.lv0 + 1, `${norm.lv0} -> ${norm.lv1}`);
check('it charged cost(1) of 5', norm.cost === 5, `${norm.cost}`);
check('the tile shows its level', /^1\/100$/.test(norm.text ?? ''), String(norm.text));

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`mastery-${W}x${H}.png`, Buffer.from(shot.data, 'base64'));
console.log(`\nwrote mastery-${W}x${H}.png`);
console.log(failures === 0 ? '\nMASTERY OK' : `\nFAILED: ${failures} check(s)`);
ws.close();
process.exit(failures === 0 ? 0 : 1);
