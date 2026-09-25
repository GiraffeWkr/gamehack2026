/**
 * Capture several frames a short time apart, to prove the archer is not changing costume.
 *
 * The bug was that `drawPlayer` cycled `Archer_1..5` as if they were walk frames. Those
 * five paintings are different OUTFITS (mean colours (91,77,60) leather, (110,94,81) light
 * leather, (50,63,64) teal, (99,90,79) tan, (60,48,84) purple), so cycling them swapped
 * his clothes several times a second.
 *
 * Writing the frames out lets the colours be compared: an outfit swap moves the mean
 * colour by tens of units per channel, while the remaining bob/squash only shifts pixels
 * by a pixel or two.
 *
 * Usage: node tools/cdp-steady.mjs [outPrefix] [width] [height]
 */
const PREFIX = process.argv[2] ?? 'steady';
const W = Number(process.argv[3] ?? 1280);
const H = Number(process.argv[4] ?? 720);
const BASE = process.env.ZAD_BASE ?? 'http://localhost:5173';
const PORT = 9333;
const FRAMES = 6;
const GAP_MS = 110;
let nextId = 1;

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

const evalJs = async (ws, sessionId, expression) => {
  const r = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true }, sessionId);
  if (r.exceptionDetails) return 'EXCEPTION ' + r.exceptionDetails.exception?.description;
  return r.result?.value;
};

async function main() {
  const ws = new WebSocket(await connect(PORT));
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });
  const { targetId } = await rpc(ws, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc(ws, 'Target.attachToTarget', { targetId, flatten: true });
  await rpc(ws, 'Page.enable', {}, sessionId);
  await rpc(ws, 'Runtime.enable', {}, sessionId);
  await rpc(ws, 'Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);
  await rpc(ws, 'Page.navigate', { url: `${BASE}/?fast=6&quiet=1` }, sessionId);
  await new Promise((r) => setTimeout(r, 4000));

  const { writeFileSync } = await import('node:fs');
  for (let i = 0; i < FRAMES; i++) {
    const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
    writeFileSync(`${PREFIX}-${i}.png`, Buffer.from(shot.data, 'base64'));
    await new Promise((r) => setTimeout(r, GAP_MS));
  }
  console.log(`wrote ${PREFIX}-0..${FRAMES - 1}.png (${W}x${H}, ${GAP_MS}ms apart)`);

  const hp = await evalJs(ws, sessionId,
    `JSON.stringify({ hp: +window.__zad.game.hp.toFixed(3), maxHp: +window.__zad.game.maxHp.toFixed(3), state: window.__zad.game.runState })`);
  console.log('player hp at end: ' + hp);

  // ---- health regen: one tick every 5s, not a steady climb -------------------------
  // Hurt the player, then sample for 11s. A per-frame `regen * dt` rate would refill the
  // bar within a few seconds; the real behaviour is one tick of `HealthRegen` per 5s.
  await evalJs(ws, sessionId, `(() => {
    const g = window.__zad.game;
    g.hp = Math.max(1, g.maxHp - 8);
    return g.hp;
  })()`);
  const t0 = Date.now();
  let prev = null;
  const changes = [];
  for (let i = 0; i < 23; i++) {
    const v = await evalJs(ws, sessionId, '+window.__zad.game.hp.toFixed(3)');
    if (prev !== null && v !== prev) changes.push(`${((Date.now() - t0) / 1000).toFixed(1)}s: ${prev} -> ${v}`);
    prev = v;
    await new Promise((r) => setTimeout(r, 500));
  }
  console.log('regen over ~11s (hp changes): ' + (changes.length ? changes.join('   ') : 'none'));
  const finalHp = await evalJs(ws, sessionId, '+window.__zad.game.hp.toFixed(3)');
  console.log(`final hp ${finalHp} after 11s (a 5 HP/s rate would have refilled to max)`);

  await rpc(ws, 'Target.closeTarget', { targetId });
  ws.close();
}

void 0;

main().catch((e) => {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
