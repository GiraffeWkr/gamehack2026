/**
 * End-to-end proof of the portal-currency rule, in a real browser.
 *
 * The original pays it in `PlayerManager.MonsterDiedGiveRewards` under
 * `EnemyType.RunPortal`: worth exactly 1, only while `RunManager.IsPortalCurrencyOwed`
 * says the battle level has not paid yet, and dropped at the player when the portal died
 * out of reach. That finiteness is the whole reason the 29 portal-priced tree nodes are a
 * long-term goal rather than a farm, so it is checked through the real kill path here.
 *
 * Usage: node tools/cdp-portal-currency.mjs
 */
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
// The paid-out map is PERSISTED, so a previous run's save would make level 1 start already
// paid and this harness would measure nothing. Clear storage before any page script runs.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'try { localStorage.clear(); } catch (e) {}',
});
await send('Page.navigate', { url: `${BASE}/?fast=20` });
await new Promise((r) => setTimeout(r, 3000));

console.log('\n[portal currency]');

const start = await evaluate(`(() => {
  const z = window.__zad;
  const g = z.game;
  return {
    purse: g.portalCurrency,
    seen: g.portalCurrencySeen,
    owesLevel1: g.portalCurrencyOwed(1),
    counterHidden: document.querySelector('.hud .cur-portal').hidden,
  };
})()`);
check('a fresh run starts with no portal currency', start.purse === 0);
check('its HUD counter is hidden', start.counterHidden === true);
check('level 1 owes its portal currency', start.owesLevel1 === true);

// Clear the packs, then kill the portal through the real damage path.
const killed = await evaluate(`(async () => {
  const z = window.__zad;
  const g = z.game;
  // Kill the packs so the portal becomes vulnerable.
  for (const e of g.getEnemyList()) {
    if (!e.isPortal) { e.alive = false; e.hp = 0; }
  }
  await new Promise((r) => setTimeout(r, 350));
  const portal = g.getEnemyList().find((e) => e.isPortal && e.alive);
  if (!portal) return { error: 'no live portal' };
  // Walk the archer into bow range, then leave the portal on one hit. The drop rule is
  // what is under test, not how long a 25x portal takes to grind down.
  g.px = Math.max(portal.x - 400, 0);
  portal.hp = 1;
  const before = { x: portal.x, px: g.px };
  for (let i = 0; i < 2400 && portal.alive; i++) {
    g.px = Math.max(portal.x - 400, 0);
    g.tick(1 / 60, { taps: 0, tapX: 0, tapY: 0, hold: false, hoverX: 0, hoverY: 0, hoverActive: false });
    if (i % 60 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  const drops = g.getCoinList().filter((c) => c.currency === 'PortalCurrency');
  return {
    before,
    dead: !portal.alive,
    dropCount: drops.length,
    dropValue: drops.map((c) => c.value),
    dropX: drops.map((c) => Math.round(c.x)),
    owesNow: g.portalCurrencyOwed(1),
  };
})()`);

check('the portal died through the damage path', killed.dead === true, JSON.stringify(killed).slice(0, 80));
check('it dropped exactly one portal currency', killed.dropCount === 1, `${killed.dropCount}`);
check('worth exactly 1', killed.dropValue?.[0] === 1, String(killed.dropValue));
check('the level is marked paid the moment it drops', killed.owesNow === false);

// Collect it and confirm the purse and the counter.
const collected = await evaluate(`(async () => {
  const z = window.__zad;
  const g = z.game;
  const input = { taps: 0, tapX: 0, tapY: 0, hold: false, hoverX: 0, hoverY: 0, hoverActive: false };
  for (let i = 0; i < 1800 && g.getCoinList().length > 0; i++) {
    g.px = g.getCoinList()[0].x;
    g.tick(1 / 60, input);
    if (i % 60 === 0) await new Promise((r) => setTimeout(r, 0));
  }
  await new Promise((r) => setTimeout(r, 500));
  return {
    purse: g.portalCurrency,
    seen: g.portalCurrencySeen,
    counterHidden: document.querySelector('.hud .cur-portal').hidden,
    counterText: document.querySelector('.hud .cur-portal .res-val')?.textContent,
    remaining: g.getCoinList().length,
  };
})()`);

check('collecting it credits the purse', collected.purse === 1, `${collected.purse}`);
check('the drop was taken', collected.remaining === 0, `${collected.remaining} left`);
check('the counter is revealed', collected.counterHidden === false);
check('the counter reads 1', collected.counterText === '1', String(collected.counterText));

console.log(failures === 0 ? '\nPORTAL CURRENCY OK' : `\nFAILED: ${failures} check(s)`);
ws.close();
process.exit(failures === 0 ? 0 : 1);
