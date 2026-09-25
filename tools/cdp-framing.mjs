/**
 * Assert the framing is consistent across viewport shapes.
 *
 * The complaint that the view "was not centred" is usually aspect dependent, so
 * this drives three different device sizes and reads back, for each:
 *  - the character's screen x as a fraction of the width (should equal
 *    CAMERA.characterScreenX everywhere)
 *  - the base background layer's left/right edges in screen space (should cover
 *    the whole viewport with no gap)
 *  - the drawn ring and projectile counts, to confirm the scene is live
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

const probe = `(() => {
  const z = window.__zad;
  if (!z) return JSON.stringify({ err: 'no __zad' });
  const r = z.renderer, g = z.game, w = r.viewWidth, h = r.viewHeight;
  const p = r.toScreen(g.px, g.py);
  // Background coverage: the UNION of every layer's tiled copies. Each layer reports the
  // extent of its three copies (one copy alone is deliberately wider than the viewport
  // and the copies are what fill it), so the union across layers is the real coverage.
  const list = (r.layerList || []);
  let bg = null;
  for (const l of list) {
    bg = bg
      ? { left: Math.min(bg.left, l.left), right: Math.max(bg.right, l.right) }
      : { left: l.left, right: l.right };
  }
  if (bg) {
    bg = {
      left: Math.round(bg.left),
      right: Math.round(bg.right),
      screenW: w,
      layers: list.length,
      copies: list[0] ? list[0].copies : 0,
    };
  }
  // The lowest layer band's bottom should be the art frame's bottom edge, and the
  // characters' feet row should sit on the frame's ground row (both are what the
  // original does, measured in analysis/measure_original.py).
  const frameBottom = Math.max(...list.map(l => l.bottom), 0);
  return JSON.stringify({
    view: w + 'x' + h,
    charFrac: +(p.x / w).toFixed(3),
    feetFrac: +(p.y / h).toFixed(3),
    frameBottomFrac: +(frameBottom / h).toFixed(3),
    charScreen: Math.round(p.x),
    bars: r.barsDrawn,
    proj: r.projectilesDrawn,
    enemies: g.getEnemyList().filter(e => e.alive && !e.isPortal).length,
    bg,
  });
})()`;

const SIZES = [
  { name: 'phone-landscape', width: 932, height: 430 },
  { name: 'wide-desktop', width: 1600, height: 720 },
  { name: 'tablet', width: 1180, height: 820 },
];

async function main() {
  const ws = new WebSocket(await connect(PORT));
  await new Promise((res, rej) => {
    ws.addEventListener('open', res, { once: true });
    ws.addEventListener('error', rej, { once: true });
  });

  let failures = 0;
  for (const s of SIZES) {
    const { targetId } = await rpc(ws, 'Target.createTarget', { url: 'about:blank' });
    const { sessionId } = await rpc(ws, 'Target.attachToTarget', { targetId, flatten: true });
    await rpc(ws, 'Page.enable', {}, sessionId);
    await rpc(ws, 'Runtime.enable', {}, sessionId);
    await rpc(ws, 'Emulation.setDeviceMetricsOverride',
      { width: s.width, height: s.height, deviceScaleFactor: 1, mobile: false }, sessionId);

    await rpc(ws, 'Page.navigate', { url: `${BASE}/?fast=4` }, sessionId);
    await new Promise((r) => setTimeout(r, 3500));

    const res = await rpc(ws, 'Runtime.evaluate', { expression: probe, returnByValue: true }, sessionId);
    let info;
    try {
      info = JSON.parse(res.result?.value ?? '{}');
    } catch {
      info = { err: 'unparsable', raw: res.result?.value };
    }

    if (info.err) {
      failures++;
      console.log(`${s.name.padEnd(16)} FAILED: ${JSON.stringify(info)}`);
    } else {
      const charOk = Math.abs(info.charFrac - 0.25) <= 0.03;
      const bgCovers = info.bg ? info.bg.left <= 0 && info.bg.right >= info.bg.screenW : false;
      // Feet on the art frame's ground row, and the frame covering only the upper band.
      const feetOk = Math.abs(info.feetFrac - 0.463) <= 0.01;
      const bandOk = Math.abs(info.frameBottomFrac - 0.556) <= 0.01;
      if (!charOk || !bgCovers || !feetOk || !bandOk) failures++;
      console.log(
        `${s.name.padEnd(16)} view=${info.view.padEnd(10)} ` +
        `char=${(info.charFrac * 100).toFixed(1)}% ${charOk ? 'ok' : 'MISFRAMED'}  ` +
        `feet=${(info.feetFrac * 100).toFixed(1)}% ${feetOk ? 'ok' : 'OFF-GROUND'}  ` +
        `frame=${(info.frameBottomFrac * 100).toFixed(1)}% ${bandOk ? 'ok' : 'BAND WRONG'}  ` +
        `bg=[${info.bg ? info.bg.left + '..' + info.bg.right : '?'}] ${bgCovers ? 'covers' : 'GAP'}  ` +
        `bars=${info.bars} proj=${info.proj} enemies=${info.enemies}`,
      );
    }

    await rpc(ws, 'Target.closeTarget', { targetId });
  }
  ws.close();
  console.log(failures === 0 ? '\nframing consistent across all sizes' : `\n${failures} size(s) mis-framed`);
  if (failures > 0) process.exit(1);
}

main().catch((e) => {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
