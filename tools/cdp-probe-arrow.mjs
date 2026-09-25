/**
 * Probe the live projectile geometry over CDP.
 *
 * The vision pass reported the arrow "pointing left" while the archer walks right,
 * which would mean the rotation is 180 degrees out. Reading the numbers settles it.
 */
const BASE = process.argv[2] ?? 'http://localhost:5173';
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

const expr = `(() => {
  const z = window.__zad;
  if (!z) return JSON.stringify({ err: 'no __zad' });
  const list = z.game.getProjectileList();
  const p = list[0];
  if (!p) return JSON.stringify({ err: 'no projectile this instant' });
  const angle = Math.atan2(p.vy, p.vx);
  const spriteRotation = angle + Math.PI / 2;
  return JSON.stringify({
    px: Math.round(z.game.px),
    projX: Math.round(p.x),
    projY: Math.round(p.y),
    vx: Math.round(p.vx),
    vy: Math.round(p.vy),
    worldAngleDeg: +(angle * 180 / Math.PI).toFixed(1),
    spriteRotationDeg: +(spriteRotation * 180 / Math.PI).toFixed(1),
    flyingRight: p.vx > 0,
    belowBow: p.y < z.game.py + 132
  });
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
  await rpc(ws, 'Page.navigate', { url: `${BASE}/?fast=3` }, sessionId);
  await new Promise((r) => setTimeout(r, 3500));

  // Sample repeatedly; arrows are short lived so a single read may catch none.
  let seen = 0;
  for (let i = 0; i < 200 && seen < 5; i++) {
    const res = await rpc(ws, 'Runtime.evaluate', { expression: expr, returnByValue: true }, sessionId);
    const raw = res.result?.value ?? '';
    try {
      const obj = JSON.parse(raw);
      if (!obj.err) {
        seen++;
        console.log('SAMPLE ' + JSON.stringify(obj));
      }
    } catch { /* ignore */ }
    await new Promise((r) => setTimeout(r, 50));
  }
  if (seen === 0) console.log('NO PROJECTILE SAMPLED');

  await rpc(ws, 'Target.closeTarget', { targetId });
  ws.close();
}

main().catch((e) => {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
