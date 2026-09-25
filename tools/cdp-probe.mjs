/**
 * Run one JavaScript expression inside the running game and print its value.
 *
 * Usage:  node tools/cdp-probe.mjs "<expression>" [query]
 *
 * The harnesses evaluate fixed scripts and only report pass/fail, which is the wrong
 * instrument when a check fails and the reason is not obvious. This is the other one: it
 * hands back whatever the expression returns, with `await` allowed, so a failing assertion
 * can be taken apart against the live state instead of guessed at.
 *
 * The expression is run as an async function body, so `return` works and so does awaiting a
 * timeout. Anything it returns is JSON-stringified; an error comes back as THREW: ...
 */
const EXPR = process.argv[2];
const QUERY = process.argv[3] ?? '?fast=6';
const BASE = process.env.ZAD_BASE ?? 'http://localhost:5173';
const PORT = 9333;
let nextId = 1;

if (!EXPR) {
  console.error('usage: node tools/cdp-probe.mjs "<expression>" [query]');
  process.exit(2);
}

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

  await rpc(ws, 'Page.navigate', { url: `${BASE}/${QUERY}` }, sessionId);
  await new Promise((r) => setTimeout(r, 4000));

  const wrapped = `(async () => { ${EXPR} })()`;
  const res = await rpc(ws, 'Runtime.evaluate', {
    expression: wrapped, returnByValue: true, awaitPromise: true,
  }, sessionId);

  if (res.exceptionDetails) {
    console.log('THREW: ' + (res.exceptionDetails.exception?.description
      ?? res.exceptionDetails.text));
  } else {
    const v = res.result?.value;
    console.log(typeof v === 'string' ? v : JSON.stringify(v, null, 2));
  }

  await rpc(ws, 'Target.closeTarget', { targetId });
  ws.close();
}

main().catch((e) => {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
