/**
 * Print console output and uncaught exceptions from a fresh page load.
 *
 *   node tools/cdp-console.mjs [query] [ms]
 *
 * Diagnostics only: the game swallows a lot (art 404s, texture failures) and the
 * screenshot harness only reports "no __zad". This shows the actual error.
 */
const QUERY = process.argv[2] ?? '?fast=6';
const WAIT = Number(process.argv[3] ?? 4000);
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
      const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      if (msg.id !== id) return;
      ws.removeEventListener('message', onMessage);
      if (msg.error) reject(new Error(`${method}: ${msg.error.message}`));
      else resolve(msg.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(JSON.stringify(payload));
  });
}

const fmt = (v) => {
  if (v === undefined) return 'undefined';
  if (v === null) return 'null';
  return v.value !== undefined ? JSON.stringify(v.value) : v.description ?? v.type;
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
    { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);

  ws.addEventListener('message', (ev) => {
    const msg = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
    if (msg.method === 'Runtime.consoleAPICalled') {
      const text = (msg.params.args ?? []).map(fmt).join(' ');
      console.log(`[${msg.params.type}] ${text}`);
    } else if (msg.method === 'Runtime.exceptionThrown') {
      const d = msg.params.exceptionDetails;
      console.log(`[exception] ${d.exception?.description ?? d.text}`);
      for (const f of d.stackTrace?.callFrames ?? []) {
        console.log(`    at ${f.functionName || '?'} (${f.url}:${f.lineNumber + 1}:${f.columnNumber + 1})`);
      }
    } else if (msg.method === 'Log.entryAdded') {
      console.log(`[log:${msg.params.entry.level}] ${msg.params.entry.text}`);
    }
  });

  await rpc(ws, 'Log.enable', {}, sessionId);
  await rpc(ws, 'Page.navigate', { url: `${BASE}/${QUERY}` }, sessionId);
  await new Promise((r) => setTimeout(r, WAIT));

  const probe = await rpc(ws, 'Runtime.evaluate', {
    expression: 'JSON.stringify({ready: !!(window.__zad), err: window.__zadError ?? null})',
    returnByValue: true,
  }, sessionId);
  console.log('probe:', probe.result?.value);
  await rpc(ws, 'Target.closeTarget', { targetId });
  ws.close();
}

main().catch((e) => {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
