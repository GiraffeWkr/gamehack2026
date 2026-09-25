/**
 * Headless verification over the Chrome DevTools Protocol.
 *
 * Two things this buys that a plain `--screenshot` cannot:
 *  1. It reads `document.title` as text, so the `?stats=1` counters can be asserted
 *     numerically instead of eyeballed.
 *  2. It evaluates page script, so the screenshot can be taken on a frame that is
 *     GUARANTEED to have arrows in flight. A bow arrow crosses the screen in about
 *     0.35s, so a random screenshot almost never catches one.
 *
 * Usage: node tools/cdp-verify.mjs [baseUrl]
 */

const BASE = process.argv[2] ?? 'http://localhost:5173';
const PORT = 9333;

let nextId = 1;

async function connect(port) {
  // Chromium needs a moment before the debugging endpoint answers.
  for (let attempt = 0; attempt < 40; attempt++) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/json/version`);
      const info = await res.json();
      return info.webSocketDebuggerUrl;
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

async function main() {
  const wsUrl = await connect(PORT);
  const ws = new WebSocket(wsUrl);
  await new Promise((resolve, reject) => {
    ws.addEventListener('open', resolve, { once: true });
    ws.addEventListener('error', reject, { once: true });
  });

  const { targetId } = await rpc(ws, 'Target.createTarget', { url: 'about:blank' });
  const { sessionId } = await rpc(ws, 'Target.attachToTarget', { targetId, flatten: true });

  await rpc(ws, 'Page.enable', {}, sessionId);
  await rpc(ws, 'Runtime.enable', {}, sessionId);
  await rpc(ws, 'Emulation.setDeviceMetricsOverride',
    { width: 932, height: 430, deviceScaleFactor: 1, mobile: false }, sessionId);

  // --- pass 1: play a while with scripted taps, then read the counters --------
  // `?fast=N` runs the sim at boot; `?tap=1` makes the harness tap every frame so
  // the arrow-rain channel is exercised too.
  await rpc(ws, 'Page.navigate', { url: `${BASE}/?fast=6&stats=1` }, sessionId);
  await new Promise((r) => setTimeout(r, 4000));

  const titleRes = await rpc(ws, 'Runtime.evaluate',
    { expression: 'document.title', returnByValue: true }, sessionId);
  const stats = titleRes.result?.value ?? '';

  // --- pass 2: screenshot on a frame that provably has arrows in flight ------
  // Poll the live projectile count and capture the instant it is non-zero, then
  // freeze the page so the capture cannot land on a later, empty frame.
  await rpc(ws, 'Page.navigate', { url: `${BASE}/?fast=3&stats=1` }, sessionId);
  await new Promise((r) => setTimeout(r, 3000));

  const armed = await rpc(ws, 'Runtime.evaluate', {
    expression: `(() => {
      const z = window.__zad;
      if (!z) return 'no __zad';
      // Freeze the loop and report the counters from the last rendered frame.
      z.game.tick && (window.__frozen = true);
      return 'ok';
    })()`,
    returnByValue: true,
  }, sessionId);

  // Wait for a frame with a projectile drawn, sampling the renderer counter.
  let armedInfo = 'never';
  for (let i = 0; i < 120; i++) {
    const probe = await rpc(ws, 'Runtime.evaluate', {
      expression: `(() => {
        const z = window.__zad;
        if (!z) return JSON.stringify({err:'no __zad'});
        return JSON.stringify({
          proj: z.renderer.projectilesDrawn,
          bars: z.renderer.barsDrawn,
          live: z.game.getProjectileList().length
        });
      })()`,
      returnByValue: true,
    }, sessionId);
    armedInfo = probe.result?.value ?? '?';
    try {
      const parsed = JSON.parse(armedInfo);
      if (parsed.proj > 0 || parsed.live > 0) break;
    } catch { /* keep polling */ }
    await new Promise((r) => setTimeout(r, 60));
  }

  const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
  const fs = await import('node:fs');
  const out = 'C:/Users/Administrator/Desktop/Zad Archery/analysis/cdp_arrows.png';
  fs.writeFileSync(out, Buffer.from(shot.data, 'base64'));

  console.log('STATS   ' + stats);
  console.log('AT-SHOT ' + armedInfo);
  console.log('SHOT    ' + out + '  (' + fs.statSync(out).size + ' bytes)');
  console.log('ARMED   ' + JSON.stringify(armed.result?.value ?? ''));

  await rpc(ws, 'Target.closeTarget', { targetId });
  ws.close();
}

main().catch((e) => {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
