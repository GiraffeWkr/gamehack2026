/**
 * Screenshot the running game at a given viewport and dump its measured geometry.
 *
 * Usage:  node tools/cdp-shot.mjs [out.png] [width] [height] [query]
 *
 * Prints the renderer's `measure()` text, which reports the solved scale, the visible
 * world size (and the implied orthographicSize), where the art frame ends and which row
 * the characters' feet land on. That is what decides whether the composition matches
 * the original, so it is read back rather than eyeballed.
 */
import { writeFileSync } from 'node:fs';

const OUT = process.argv[2] ?? 'shot-layout.png';
const W = Number(process.argv[3] ?? 1280);
const H = Number(process.argv[4] ?? 720);
const QUERY = process.argv[5] ?? '?fast=6';
const BASE = process.env.ZAD_BASE ?? 'http://localhost:5173';
const PORT = 9333;
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

const PROBE = `(() => {
  const z = window.__zad;
  if (!z) return 'no __zad';
  const r = z.renderer, h = r.viewHeight;
  const p = r.toScreen(z.game.px, z.game.py);
  const bands = r.layerList.map(b =>
    b.file.padEnd(15) + String(Math.round(b.top)).padStart(6) + '..' +
    String(Math.round(b.bottom)).padStart(5) + '  span=' + String(b.span).padStart(5) +
    ' copies=' + b.copies);
  return [
    r.measure(z.game),
    '',
    'fed to the probe: charScreenX=' + (p.x / r.viewWidth * 100).toFixed(1) +
      '%  feetRow=' + (p.y / h * 100).toFixed(1) + '%',
  ].join('\\n');
})()`;

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

  await rpc(ws, 'Page.navigate', { url: `${BASE}/${QUERY}` }, sessionId);
  await new Promise((r) => setTimeout(r, 4000));

  const probe = await rpc(ws, 'Runtime.evaluate',
    { expression: PROBE, returnByValue: true }, sessionId);
  console.log('---- renderer geometry ----');
  console.log(probe.result?.value ?? '(no value)');
  console.log('---------------------------');

  const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
  writeFileSync(OUT, Buffer.from(shot.data, 'base64'));
  console.log(`wrote ${OUT}  (${W}x${H})`);

  await rpc(ws, 'Target.closeTarget', { targetId });
  ws.close();
}

main().catch((e) => {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
