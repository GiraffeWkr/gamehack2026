/**
 * Captures just the lower HUD band (the talent / jobs / mastery panel area) so the
 * UI reskin can be reviewed without the world behind it.
 *
 *   node tools/shot-band.mjs --name=band-talent --url='&tree=1'
 */
import { writeFileSync } from 'node:fs';

const BASE = process.env.ZAD_BASE ?? 'http://127.0.0.1:5173';
const CDP = process.env.ZAD_CDP ?? 'http://127.0.0.1:9333';
const args = new Map(
  process.argv.slice(2).map((a) => {
    const [k, v = '1'] = a.replace(/^--/, '').split('=');
    return [k, v];
  }),
);
const NAME = args.get('name') ?? 'band';
const SEL = args.get('sel') ?? '.talent';
const URL_EXTRA = args.get('url') ?? '';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const version = await (await fetch(`${CDP}/json/version`)).json();
const ws = new WebSocket(version.webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0;
const pending = new Map();
ws.addEventListener('message', (ev) => {
  const m = JSON.parse(ev.data);
  if (m.id && pending.has(m.id)) {
    const { resolve, reject } = pending.get(m.id);
    pending.delete(m.id);
    m.error ? reject(new Error(JSON.stringify(m.error))) : resolve(m.result);
  }
});
const send = (method, params = {}, sessionId) =>
  new Promise((resolve, reject) => {
    const mid = ++id;
    pending.set(mid, { resolve, reject });
    ws.send(JSON.stringify({ id: mid, method, params, sessionId }));
  });

const { targetId } = await send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await send('Target.attachToTarget', { targetId, flatten: true });
await send('Page.enable', {}, sessionId);
await send('Runtime.enable', {}, sessionId);
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);
await send('Page.navigate', { url: `${BASE}/?fast=1${URL_EXTRA}` }, sessionId);
await sleep(3500);

const rectRes = await send(
  'Runtime.evaluate',
  {
    expression: `(() => {
      const el = document.querySelector(${JSON.stringify(SEL)});
      if (!el) return 'null';
      el.classList.remove('hidden');
      el.dispatchEvent(new Event('x'));
      const r = el.getBoundingClientRect();
      const icons = [...el.querySelectorAll('img')].map(i => i.naturalWidth + 'x' + i.naturalHeight);
      return JSON.stringify({ x: r.x, y: r.y, w: r.width, h: r.height, iconCount: icons.length,
        zeroIcons: icons.filter(s => s.startsWith('0x')).length, sample: icons.slice(0, 6) });
    })()`,
    returnByValue: true,
  },
  sessionId,
);
console.log('band:', rectRes.result?.value);
const r = JSON.parse(rectRes.result.value);
await sleep(600);
const shot = await send(
  'Page.captureScreenshot',
  { format: 'png', clip: { x: r.x, y: r.y, width: r.w, height: r.h, scale: 1 } },
  sessionId,
);
const file = `${NAME}.png`;
writeFileSync(file, Buffer.from(shot.data, 'base64'));
console.log('wrote', file);
await send('Target.closeTarget', { targetId });
ws.close();
