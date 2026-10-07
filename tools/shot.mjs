/**
 * Minimal screen-capture harness for looking at the running game.
 *
 *   node tools/shot.mjs                       # default: one landscape viewport
 *   node tools/shot.mjs --name=after --fast=4 # fast-forward 4s of simulation first
 *   node tools/shot.mjs --w=932 --h=430       # phone-landscape probe
 *
 * Requires a running `npm run dev` (5173) and a Chrome started with
 * `--remote-debugging-port=9333`. Files land in the project root as shot-*.png.
 */
import { writeFileSync } from 'node:fs';

const BASE = process.env.ZAD_BASE ?? 'http://127.0.0.1:5173';
const CDP = process.env.ZAD_CDP ?? 'http://127.0.0.1:9333';
/**
 * Flag parsing. `--url=&tree=1` carries its own `=`, so only the FIRST `=` is the
 * flag/value separator: everything after it is the value.
 */
function parseArgs(argv) {
  const out = new Map();
  for (const raw of argv) {
    const s = raw.replace(/^--/, '');
    const eq = s.indexOf('=');
    if (eq === -1) out.set(s, '1');
    else out.set(s.slice(0, eq), s.slice(eq + 1));
  }
  return out;
}
const args = parseArgs(process.argv.slice(2));
const NAME = args.get('name') ?? 'shot';
const W = Number(args.get('w') ?? 1280);
const H = Number(args.get('h') ?? 720);
const FAST = Number(args.get('fast') ?? 0);
const URL_EXTRA = args.get('url') ?? '';

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function connect() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`${CDP}/json/version`);
      const j = await res.json();
      return j.webSocketDebuggerUrl;
    } catch {
      await sleep(250);
    }
  }
  throw new Error(`no CDP endpoint at ${CDP} - start Chrome with --remote-debugging-port=9333`);
}

class Cdp {
  constructor(ws) {
    this.ws = ws;
    this.id = 0;
    this.pending = new Map();
    ws.addEventListener('message', (ev) => {
      const msg = JSON.parse(ev.data);
      if (msg.id && this.pending.has(msg.id)) {
        const { resolve, reject } = this.pending.get(msg.id);
        this.pending.delete(msg.id);
        msg.error ? reject(new Error(JSON.stringify(msg.error))) : resolve(msg.result);
      }
    });
  }
  send(method, params = {}, sessionId) {
    const id = ++this.id;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }
}

const wsUrl = await connect();
const ws = new WebSocket(wsUrl);
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const cdp = new Cdp(ws);

const { targetId } = await cdp.send('Target.createTarget', { url: 'about:blank' });
const { sessionId } = await cdp.send('Target.attachToTarget', { targetId, flatten: true });
await cdp.send('Page.enable', {}, sessionId);
await cdp.send('Runtime.enable', {}, sessionId);
await cdp.send(
  'Emulation.setDeviceMetricsOverride',
  { width: W, height: H, deviceScaleFactor: 1, mobile: false },
  sessionId,
);

/**
 * Params first, `fast` last: `main.ts` reads `?level=` / `?tree=` / `?jobs=` from
 * `location.search`, and keeping the debug switches at the end makes the URL easy to
 * read in the console line below.
 */
const url = `${BASE}/?stats=1${URL_EXTRA}${FAST ? `&fast=${FAST}` : ''}`;
console.log('url:', url);
await cdp.send('Page.navigate', { url }, sessionId);
await sleep(FAST ? 2500 : 4000);

// Report what the runtime thinks is going on: this is where a broken art file shows up.
const probe = await cdp.send(
  'Runtime.evaluate',
  {
    expression: `(() => {
      const z = window.__zad;
      if (!z) return 'no __zad (boot failed?)';
      const g = z.game, r = z.renderer;
      return JSON.stringify({
        level: g.level, enemies: g.getEnemyList().filter(e=>e.alive).length,
        px: Math.round(g.px), cam: Math.round(r.cameraX), hp: Math.round(g.hp),
        view: r.viewWidth + 'x' + r.viewHeight, ready: r.ready,
      });
    })()`,
    returnByValue: true,
  },
  sessionId,
);
console.log('probe:', probe.result?.value);

const shot = await cdp.send('Page.captureScreenshot', { format: 'png' }, sessionId);
const file = `${NAME}-${W}x${H}.png`;
writeFileSync(file, Buffer.from(shot.data, 'base64'));
console.log('wrote', file);

await cdp.send('Target.closeTarget', { targetId });
ws.close();
