/**
 * Freeze the game on a frame that has an arrow in flight and capture it close up.
 *
 *   node tools/shot-arrow.mjs          # the archer's automatic bow shot
 *   node tools/shot-arrow.mjs tap      # the player's tapped arrow-rain
 *
 * The main loop re-registers `requestAnimationFrame(frame)` every frame, so replacing
 * the global with a no-op stops the simulation on the next frame. That leaves the
 * canvas showing the last drawn frame and the simulation state matching it, which is
 * the only reliable way to catch a 0.4s projectile in a screenshot.
 *
 * Output: arrow-flight.png (clip around the arrow, 2x), plus the numbers used.
 */
import { writeFileSync } from 'node:fs';

const MODE = process.argv[2] === 'tap' ? 'tap' : 'shot';

const BASE = process.env.ZAD_BASE ?? 'http://127.0.0.1:5173';
const CDP = process.env.ZAD_CDP ?? 'http://127.0.0.1:9333';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let nextId = 1;

const version = await (await fetch(`${CDP}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (!m.id || !pending.has(m.id)) return;
  const { resolve, reject } = pending.get(m.id);
  pending.delete(m.id);
  m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const id = nextId++;
    pending.set(id, { resolve, reject });
    ws.send(JSON.stringify({ id, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: `${BASE}/?level=1&fast=2` }, sessionId);

for (let i = 0; i < 60; i++) {
  await sleep(250);
  const ready = await send('Runtime.evaluate', { expression: '!!window.__zad?.game', returnByValue: true }, sessionId);
  if (ready.result?.value) break;
}

// Poll for a projectile, then stop the loop on that very frame.
const probe = MODE === 'tap'
  ? `(async () => {
    const z = window.__zad;
    const cv = document.querySelector('#game');
    const sr = cv.getBoundingClientRect();
    const sx = sr.left + sr.width * 0.7;
    const sy = sr.top + sr.height * 0.3;
    const opts = { bubbles: true, cancelable: true, clientX: sx, clientY: sy, pointerId: 1, pointerType: 'touch', isPrimary: true };
    cv.dispatchEvent(new PointerEvent('pointerdown', opts));
    await new Promise(r => setTimeout(r, 40));
    cv.dispatchEvent(new PointerEvent('pointerup', opts));
    for (let i = 0; i < 200; i++) {
      const g = z.game;
      const list = g.getArrowList();
      if (list.length) {
        window.requestAnimationFrame = () => 0;
        await new Promise(r => setTimeout(r, 120));
        const a = list[0];
        const t = Math.min(1, a.t);
        const x = a.fromX + (a.toX - a.fromX) * t;
        const y = a.fromY + (a.toY - a.fromY) * t * t;
        const s = z.renderer.toScreen(x, y);
        return JSON.stringify({
          mode: 'tap', frozenPx: Math.round(g.px),
          aim: { screenX: Math.round(z.renderer.toScreen(a.toX, a.toY).x), screenY: Math.round(z.renderer.toScreen(a.toX, a.toY).y) },
          arrow: { screenX: Math.round(s.x), screenY: Math.round(s.y), t: +t.toFixed(3),
                   dx: Math.round(a.toX - x), dy: Math.round(a.toY - y) },
        });
      }
      await new Promise(r => setTimeout(r, 20));
    }
    return 'no tap arrow seen';
  })()`
  : `(async () => {
    const z = window.__zad;
    for (let i = 0; i < 400; i++) {
      const g = z.game;
      const list = g.getProjectileList();
      if (list.length) {
        // Stop the next frame from being scheduled: game state + canvas now match.
        window.requestAnimationFrame = () => 0;
        await new Promise(r => setTimeout(r, 120));
        const p = list[0];
        const s = z.renderer.toScreen(p.x, p.y);
        const feet = z.renderer.toScreen(g.px, g.py);
        return JSON.stringify({
          mode: 'shot',
          frozenPx: Math.round(g.px),
          player: { x: Math.round(feet.x), y: Math.round(feet.y) },
          arrow: { worldDx: +(p.x - g.px).toFixed(1), worldDy: +(p.y - g.py).toFixed(1),
                   screenX: Math.round(s.x), screenY: Math.round(s.y),
                   vx: Math.round(p.vx), vy: Math.round(p.vy), life: +p.life.toFixed(3) },
          expectedDeg: +(Math.atan2(-p.vy, p.vx) * 180 / Math.PI).toFixed(1),
          spriteDeg: +((Math.atan2(-p.vy, p.vx) - Math.PI / 2) * 180 / Math.PI).toFixed(1),
        });
      }
      await new Promise(r => setTimeout(r, 25));
    }
    return 'no arrow seen';
  })()`;

const found = await send('Runtime.evaluate', {
  expression: probe,
  returnByValue: true,
  awaitPromise: true,
}, sessionId);
console.log('frame:', found.result?.value);
if (typeof found.result?.value !== 'string' || found.result.value.startsWith('no ')) {
  await send('Target.closeTarget', { targetId });
  ws.close();
  process.exit(1);
}
const info = JSON.parse(found.result.value);

// Confirm the loop really stopped, so the canvas and the state agree.
const check = await send('Runtime.evaluate', {
  expression: 'JSON.stringify({ px: Math.round(window.__zad.game.px) })',
  returnByValue: true,
}, sessionId);
console.log('after freeze:', check.result?.value);

const clip = {
  x: Math.max(0, info.arrow.screenX - 260),
  y: Math.max(0, info.arrow.screenY - 140),
  width: 520,
  height: 280,
  scale: 2,
};
const shot = await send('Page.captureScreenshot', { format: 'png', clip }, sessionId);
writeFileSync('arrow-flight.png', Buffer.from(shot.data, 'base64'));
console.log('wrote arrow-flight.png');
await send('Target.closeTarget', { targetId });
ws.close();
