/**
 * Diagnose why a tap does not reach the game: what element is on top at the tap
 * point, what the canvas geometry is, and whether a synthetic PointerEvent on the
 * canvas is handled.
 */
const PORT = 9333;
let nextId = 1;

async function connect(p) {
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://127.0.0.1:${p}/json/version`);
      return (await r.json()).webSocketDebuggerUrl;
    } catch {
      await new Promise((r2) => setTimeout(r2, 250));
    }
  }
  throw new Error('no cdp');
}

function rpc(ws, method, params = {}, sessionId) {
  const id = nextId++;
  const payload = { id, method, params };
  if (sessionId) payload.sessionId = sessionId;
  return new Promise((resolve, reject) => {
    const on = (ev) => {
      let m;
      try {
        m = JSON.parse(typeof ev.data === 'string' ? ev.data : ev.data.toString());
      } catch {
        return;
      }
      if (m.id !== id) return;
      ws.removeEventListener('message', on);
      if (m.error) reject(new Error(`${method}: ${m.error.message}`));
      else resolve(m.result);
    };
    ws.addEventListener('message', on);
    ws.send(JSON.stringify(payload));
  });
}

const ev = async (ws, sid, expression) => {
  const r = await rpc(ws, 'Runtime.evaluate', { expression, returnByValue: true }, sid);
  if (r.exceptionDetails) return 'EXCEPTION ' + JSON.stringify(r.exceptionDetails.exception?.description);
  return r.result?.value;
};

const AT = (x, y) => `(() => {
  const e = document.elementFromPoint(${x}, ${y});
  if (!e) return 'null';
  const r = e.getBoundingClientRect();
  return e.tagName + '#' + e.id + '[' + String(e.className) + '] pe=' +
    getComputedStyle(e).pointerEvents + ' rect=' + Math.round(r.x) + ',' + Math.round(r.y) +
    ' ' + Math.round(r.width) + 'x' + Math.round(r.height);
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
    { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false }, sessionId);
  await rpc(ws, 'Page.navigate', { url: 'http://localhost:5173/?fast=6' }, sessionId);
  await new Promise((r) => setTimeout(r, 4000));

  console.log('at (640,120) sky   :', await ev(ws, sessionId, AT(640, 120)));
  console.log('at (640,650) panel :', await ev(ws, sessionId, AT(640, 650)));
  console.log('canvas             :', await ev(ws, sessionId, AT(10, 200)));
  console.log('canvas rect        :', await ev(ws, sessionId,
    "(()=>{const c=document.getElementById('game');const r=c.getBoundingClientRect();return JSON.stringify({x:r.x,y:r.y,w:r.width,h:r.height,pe:getComputedStyle(c).pointerEvents, z:getComputedStyle(c).zIndex})})()"));
  console.log('children of #app   :', await ev(ws, sessionId,
    "Array.from(document.getElementById('app').children).map(e=>e.tagName+'#'+e.id+'.'+e.className).join(' | ')"));
  console.log('document.children  :', await ev(ws, sessionId,
    "Array.from(document.body.children).map(e=>e.tagName+'#'+e.id+'.'+e.className).join(' | ')"));
  console.log('fired before       :', await ev(ws, sessionId, 'window.__zad.game.shotsFired'));

  const synth = `(() => {
    const c = document.getElementById('game');
    const e = new PointerEvent('pointerdown', {
      clientX: 640, clientY: 120, pointerId: 1, pointerType: 'mouse',
      bubbles: true, cancelable: true, buttons: 1, isPrimary: true,
    });
    c.dispatchEvent(e);
    return 'dispatched defaultPrevented=' + e.defaultPrevented;
  })()`;
  console.log('synthetic on canvas:', await ev(ws, sessionId, synth));
  await new Promise((r) => setTimeout(r, 400));
  console.log('fired after        :', await ev(ws, sessionId, 'window.__zad.game.shotsFired'));
  console.log('arrows             :', await ev(ws, sessionId,
    'JSON.stringify(window.__zad.game.getArrowList().map(a=>({t:+a.t.toFixed(2),toX:Math.round(a.toX),toY:Math.round(a.toY),fromY:Math.round(a.fromY)})))'));

  await rpc(ws, 'Target.closeTarget', { targetId });
  ws.close();
}

main().catch((e) => {
  console.error('FAILED ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
