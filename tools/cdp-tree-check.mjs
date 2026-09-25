/**
 * Measure the rebuilt talent panel in a real browser.
 *
 * Usage: node tools/cdp-tree-check.mjs [width] [height] [query]
 *
 * Reads back the things that only exist at runtime: how many nodes and links the DOM
 * actually built, whether each node got a real bitmap (a 404'd sprite renders at 0x0 and
 * is invisible), whether the tint layers resolved to a colour, and how much of the graph
 * the viewport can reach at this size.
 */
import { writeFileSync } from 'node:fs';

const W = Number(process.argv[2] ?? 1280);
const H = Number(process.argv[3] ?? 720);
const QUERY = process.argv[4] ?? '?fast=3';
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

const ws = new WebSocket(await connect(PORT));
await new Promise((r) => ws.addEventListener('open', r, { once: true }));

const { targetId } = await rpc(ws, 'Target.createTarget', { url: 'about:blank' });
const { sessionId } = await rpc(ws, 'Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => rpc(ws, m, p, sessionId);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 1, mobile: W < 700,
});
await send('Page.navigate', { url: `${BASE}/${QUERY}` });
await new Promise((r) => setTimeout(r, 3500));

const expr = `(() => {
  const panel = document.querySelector('.talent');
  if (!panel) return { error: 'no .talent panel' };
  const nodes = [...panel.querySelectorAll('.tn')];
  const links = [...panel.querySelectorAll('.talent-links > *')];
  const vp = panel.querySelector('.talent-viewport');
  const world = panel.querySelector('.talent-world');
  const shapes = [...panel.querySelectorAll('.tn-shape')];
  const icons = [...panel.querySelectorAll('.tn-icon')];
  const his = [...panel.querySelectorAll('.tn-hi')];
  const sq = nodes[0];
  const r = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
  const tinted = (el) => getComputedStyle(el).backgroundColor;
  return {
    panelVisible: !panel.classList.contains('hidden'),
    nodes: nodes.length,
    links: links.length,
    declaredNodes: panel.dataset.nodes,
    declaredLinks: panel.dataset.links,
    worldBox: r(world),
    viewport: r(vp),
    transformed: getComputedStyle(world).transform,
    // A sprite that failed to load has naturalWidth 0.
    brokenShapes: shapes.filter((s) => s.complete && s.naturalWidth === 0).length,
    loadedShapes: shapes.filter((s) => s.naturalWidth > 0).length,
    distinctShapeSrc: new Set(shapes.map((s) => s.getAttribute('src'))).size,
    distinctIconSrc: new Set([...panel.querySelectorAll('.tn-icon img')].map((i) => i.getAttribute('src'))).size,
    iconLoadFailures: [...panel.querySelectorAll('.tn-icon img')].filter((i) => i.complete && i.naturalWidth === 0).length,
    lineWidths: [...new Set(links.map((l) => l.getAttribute('stroke-width')))],
    lineColors: [...new Set(links.map((l) => l.getAttribute('stroke')))].slice(0, 6),
    curved: links.filter((l) => l.tagName.toLowerCase() === 'path').length,
    firstNode: sq ? { box: r(sq), level: sq.dataset.level, cls: sq.className } : null,
    firstTint: icons[0] ? tinted(icons[0]) : null,
    firstHi: his[0] ? { bg: tinted(his[0]), on: his[0].dataset.on } : null,
    colours: {
      canBuy: getComputedStyle(document.documentElement).getPropertyValue('--x') || null,
    },
    headText: panel.querySelector('.talent-progress')?.textContent,
  };
})()`;

const res = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
const value = res.result.value;
console.log(JSON.stringify(value, null, 1));

// Buy nodes so the owned state can be seen too: seed the purse through the dev handle,
// then click whatever the panel now paints as affordable.
const BUY = Number(process.argv[5] ?? 0);
if (BUY > 0) {
  const bought = await send('Runtime.evaluate', {
    expression: `(() => {
      const z = window.__zad;
      if (!z) return { error: 'no __zad handle' };
      z.game.gold = 1e12;
      // PortalCurrency lives on its own field, mirroring playerData.PlayerPortalCurrency.
      z.game.portalCurrency = 500;
      z.game.refreshStats();
      z.talentPanel.refresh(z.game.talent, { gold: z.game.gold, currencies: z.game.currencies });
      let clicked = 0;
      for (let i = 0; i < ${BUY}; i++) {
        const target = document.querySelector('.tn.affordable');
        if (!target) break;
        target.click();
        clicked++;
      }
      return {
        clicked,
        owned: document.querySelectorAll('.tn[data-level]:not([data-level="0"])').length,
        affordableLeft: document.querySelectorAll('.tn.affordable').length,
      };
    })()`,
    returnByValue: true,
  });
  console.log('buy attempt:', JSON.stringify(bought.result.value));
  await new Promise((r) => setTimeout(r, 500));
}

const shot = await send('Page.captureScreenshot', { format: 'png' });
const out = `tree-${W}x${H}.png`;
writeFileSync(out, Buffer.from(shot.data, 'base64'));
console.log(`\nwrote ${out}`);
ws.close();
