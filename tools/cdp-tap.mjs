/**
 * Tap the canvas like a player and verify an arrow actually fires.
 *
 * Dispatches a real quick tap (pointerdown, then pointerup ~40ms later) and checks that
 * `shotsFired` increases and an arrow appears with a sensible landing point.
 *
 * A synthetic PointerEvent is used rather than `Input.dispatchMouseEvent`: CDP's mouse
 * events do not produce a `pointerdown` on this canvas, so that approach silently
 * measured nothing at all.
 *
 * Usage: node tools/cdp-tap.mjs [screenX] [screenY] [width] [height]
 */
const SX = Number(process.argv[2] ?? 640);
const SY = Number(process.argv[3] ?? 120);
const W = Number(process.argv[4] ?? 1280);
const H = Number(process.argv[5] ?? 720);
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

const evalJs = async (ws, sessionId, expression) => {
  const r = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true }, sessionId);
  if (r.exceptionDetails) return 'EXCEPTION ' + r.exceptionDetails.exception?.description;
  return r.result?.value;
};

const pointer = (type, buttons) => `(() => {
  const c = document.getElementById('game');
  c.dispatchEvent(new PointerEvent('${type}', {
    clientX: ${SX}, clientY: ${SY}, pointerId: 1, pointerType: 'mouse',
    bubbles: true, cancelable: true, buttons: ${buttons}, isPrimary: true,
  }));
  return '${type}';
})()`;

const SNAP = `(() => {
  const z = window.__zad;
  if (!z) return 'no __zad';
  const g = z.game, r = z.renderer;
  const w = r.screenToWorld(${SX}, ${SY});
  return JSON.stringify({
    view: r.viewWidth + 'x' + r.viewHeight,
    tapWorld: { x: Math.round(w.x), y: Math.round(w.y) },
    magazine: g.magazine,
    fired: g.shotsFired,
    blocked: g.shotsBlocked,
    arrows: (g.getArrowList ? g.getArrowList() : []).map(a => ({
      t: +a.t.toFixed(2), toX: Math.round(a.toX), toY: Math.round(a.toY),
      fromY: Math.round(a.fromY), src: a.source,
    })),
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
  await rpc(ws, 'Emulation.setDeviceMetricsOverride',
    { width: W, height: H, deviceScaleFactor: 1, mobile: false }, sessionId);
  await rpc(ws, 'Page.navigate', { url: `${BASE}/?fast=6` }, sessionId);
  await new Promise((r) => setTimeout(r, 4000));

  const before = JSON.parse(await evalJs(ws, sessionId, SNAP));
  console.log('before  ' + JSON.stringify(before));

  // A real quick tap: down, then up 40ms later - well inside the 160ms hold interval,
  // so it must be served by the tap queue rather than by hold-to-repeat.
  await evalJs(ws, sessionId, pointer('pointerdown', 1));
  await new Promise((r) => setTimeout(r, 40));
  await evalJs(ws, sessionId, pointer('pointerup', 0));

  let peak = null;
  let captured = false;
  for (let i = 0; i < 12; i++) {
    await new Promise((r) => setTimeout(r, 60));
    const snap = JSON.parse(await evalJs(ws, sessionId, SNAP));
    console.log(`t+${((i + 1) * 60).toString().padStart(4)}ms  ` + JSON.stringify(snap));
    if (snap.arrows.length && !peak) peak = snap;
    // Capture the frame while an arrow is on screen. It becomes visible once it drops
    // below the visible top (~t 0.5 given the eased descent), so sample late in flight.
    const mid = snap.arrows.find((a) => a.t > 0.62 && a.t < 0.95);
    if (mid && !captured) {
      const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
      const { writeFileSync } = await import('node:fs');
      writeFileSync('tap-arrow.png', Buffer.from(shot.data, 'base64'));
      console.log(`wrote tap-arrow.png at arrow t=${mid.t}`);
      captured = true;
    }
  }

  if (!captured) {
    const shot = await rpc(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
    const { writeFileSync } = await import('node:fs');
    writeFileSync('tap-arrow.png', Buffer.from(shot.data, 'base64'));
    console.log('wrote tap-arrow.png (no arrow caught mid-flight)');
  }

  const fired = peak ? peak.fired > before.fired : false;
  console.log(fired ? '\nTAP FIRED AN ARROW' : '\nTAP PRODUCED NO ARROW');

  // ---- phase 2: does the arrow actually damage what it was aimed at? ----------------
  // The point of the tap is to hit something, so aim at a live enemy standing on screen
  // and check its health drops. This is the end-to-end version of "arrows work".
  const target = await evalJs(ws, sessionId, `(() => {
    const z = window.__zad, r = z.renderer;
    const list = z.game.getEnemyList().filter(e => e.alive && !e.isPortal);
    const all = list.map(e => {
      const p = r.toScreen(e.x, e.y);
      return { type: e.type, hp: e.hp, wx: e.x, wy: e.y, sx: Math.round(p.x), sy: Math.round(p.y) };
    });
    const onScreen = all.filter(e => e.sx > 40 && e.sx < r.viewWidth - 40 && e.sy > 20 && e.sy < r.viewHeight * 0.75);
    if (onScreen.length) return JSON.stringify({ pick: onScreen[0], alive: all.length, onScreen: onScreen.length });
    return JSON.stringify({ pick: null, alive: all.length, onScreen: 0, sample: all.slice(0, 5),
      view: r.viewWidth + 'x' + r.viewHeight, cam: Math.round(r.cameraX), px: Math.round(z.game.px) });
  })()`);
  console.log('phase 2 target: ' + target);
  const tInfo = JSON.parse(target);
  const t = tInfo.pick;
  if (t) {
    const tapAt = (type, buttons) => `(() => {
      document.getElementById('game').dispatchEvent(new PointerEvent('${type}', {
        clientX: ${t.sx}, clientY: ${t.sy}, pointerId: 1, pointerType: 'mouse',
        bubbles: true, cancelable: true, buttons: ${buttons}, isPrimary: true,
      }));
      return '${type}';
    })()`;
    const hpBefore = t.hp;
    await evalJs(ws, sessionId, tapAt('pointerdown', 1));
    await new Promise((r) => setTimeout(r, 40));
    await evalJs(ws, sessionId, tapAt('pointerup', 0));
    // The arrow's flight is 0.5s; sample just after it lands.
    await new Promise((r) => setTimeout(r, 700));
    // Enemies carry no id, so the target is re-identified by proximity to the aim point
    // in WORLD space (screen space moves with the camera).
    const after = await evalJs(ws, sessionId, `(() => {
      const z = window.__zad;
      const list = z.game.getEnemyList().filter(e => e.alive && !e.isPortal);
      let best = null;
      for (const e of list) {
        const d = Math.hypot(e.x - ${Math.round(t.wx)}, e.y - ${Math.round(t.wy)});
        if (!best || d < best.d) best = { d, hp: e.hp, type: e.type };
      }
      return JSON.stringify({ nearest: best, alive: list.length });
    })()`);
    const res = JSON.parse(after);
    const n = res.nearest;
    console.log(`phase 2 result: aimed at ${t.type} @world(${Math.round(t.wx)},${Math.round(t.wy)}) hp ${hpBefore}`);
    console.log(`                nearest live enemy now: ${n ? `${n.type} at ${n.d.toFixed(0)} units, hp ${n.hp}` : 'none'}`);
    // A hit shows up either as the target dying (nothing left near the aim point) or as
    // its health dropping.
    const damaged = !n || n.d > 200 || n.hp < hpBefore;
    console.log(damaged ? 'ARROW DAMAGED THE TARGET' : 'ARROW MISSED THE TARGET');

    // The bar only appears once an enemy has taken damage (`EnemySelfer.TakeDamage`
    // activates `EnemyCanvas`), so a damaged survivor is exactly the state needed to see
    // one. Report the counter and capture the frame.
    const bars = await evalJs(ws, sessionId, `JSON.stringify({
      barsDrawn: window.__zad.renderer.barsDrawn,
      damaged: window.__zad.game.getEnemyList().filter(e => e.alive && !e.isPortal && e.hp < e.maxHp).length,
      alive: window.__zad.game.getEnemyList().filter(e => e.alive && !e.isPortal).length,
    })`);
    console.log('bars: ' + bars);
    const shot2 = await rpc(ws, 'Page.captureScreenshot', { format: 'png' }, sessionId);
    const fs2 = await import('node:fs');
    fs2.writeFileSync('bars.png', Buffer.from(shot2.data, 'base64'));
    console.log('wrote bars.png');

    await rpc(ws, 'Target.closeTarget', { targetId });
    ws.close();
    if (!fired || !damaged) process.exit(1);
    return;
  }

  await rpc(ws, 'Target.closeTarget', { targetId });
  ws.close();
  if (!fired) process.exit(1);
}

main().catch((e) => {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
