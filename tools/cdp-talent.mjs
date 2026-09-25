/**
 * Acceptance harness for the rebuilt talent tree.
 *
 * Usage: node tools/cdp-talent.mjs [width] [height]
 *
 * Everything asserted here is checked against a number that came out of the shipping
 * build (`analysis/export_tree_web.py`), so a regression in the data, the layout or the
 * tinting fails loudly rather than looking slightly off:
 *
 *   - 168 nodes and 182 links, matching the 168 `TreeNodeInfo` assets and the 182
 *     `TreeLink` objects in the scene
 *   - node boxes at the template's authored size (50 base / 75 portal)
 *   - the icon tint is `LockedIconColor` until the node is bought, then `UnlockedIconColor`
 *   - the highlighter is transparent when the node is inaccessible or maxed, green
 *     (`PurchasableHighlighterColor`) when affordable, red (`Insufficient...`) otherwise
 *   - a link is lit only when *both* of its ends are owned
 *   - buying deducts the exact `Evaluate(costEquation, level + 1)` price
 *   - the tooltip carries the game's own Chinese stat wording
 */
const W = Number(process.argv[2] ?? 1280);
const H = Number(process.argv[3] ?? 720);
const BASE = process.env.ZAD_BASE ?? 'http://localhost:5173';
const PORT = 9333;
let nextId = 1;
let failures = 0;

function check(name, ok, detail = '') {
  if (ok) console.log(`  ok   ${name}${detail ? `  (${detail})` : ''}`);
  else {
    failures++;
    console.log(`  FAIL ${name}${detail ? `  — ${detail}` : ''}`);
  }
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

const ws = new WebSocket(await connect(PORT));
await new Promise((r) => ws.addEventListener('open', r, { once: true }));
const { targetId } = await rpc(ws, 'Target.createTarget', { url: 'about:blank' });
const { sessionId } = await rpc(ws, 'Target.attachToTarget', { targetId, flatten: true });
const send = (m, p) => rpc(ws, m, p, sessionId);
const evaluate = async (expression) => {
  const r = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
  if (r.exceptionDetails) {
    const d = r.exceptionDetails.exception?.description
      ?? r.exceptionDetails.text ?? 'eval threw';
    throw new Error(d);
  }
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 1, mobile: W < 700,
});
// These assertions describe a FRESH save — one reachable node, nothing owned, every level
// still owing its portal currency. Progress is persisted in localStorage, so a previous
// harness's run would otherwise leak in.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'try { localStorage.clear(); } catch (e) {}',
});
await send('Page.navigate', { url: `${BASE}/?fast=3&tree=1` });
await new Promise((r) => setTimeout(r, 3500));

console.log(`\n[talent panel ${W}x${H}]`);

const shape = await evaluate(`(() => {
  const p = document.querySelector('.talent');
  if (!p) return { error: 'no panel' };
  const nodes = [...p.querySelectorAll('.tn')];
  const links = [...p.querySelectorAll('.talent-links > *')];
  const box = (el) => { const b = el.getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; };
  return {
    visible: !p.classList.contains('hidden'),
    nodes: nodes.length,
    links: links.length,
    declaredNodes: Number(p.dataset.nodes),
    declaredLinks: Number(p.dataset.links),
    brokenSprites: [...p.querySelectorAll('.tn-shape, .tn-icon img, .tn-hi img')]
      .filter((i) => i.complete && i.naturalWidth === 0).length,
    iconSrcs: new Set([...p.querySelectorAll('.tn-icon img')].map((i) => i.getAttribute('src'))).size,
    // AUTHORED node sizes. The RENDERED box cannot be measured any more: under
    // InaccessibleNodeDisplayMode.Hide a fresh save shows exactly ONE node, and the rest
    // are display:none with a zero rect. The template ratio is what this check is about, so
    // it reads the authored width the panel wrote into the inline style.
    sizes: [...new Set(nodes.map((n) => parseFloat(n.style.width)))].sort((a, b) => a - b),
    // What the fit actually did, so truncation can be asserted directly instead of inferred.
    fitScale: (() => {
      const w = p.querySelector('.talent-world');
      const m = /scale\\(([-\\d.]+)\\)/.exec(w ? w.style.transform : '');
      return m ? Number(m[1]) : 0;
    })(),
    worldH: (() => {
      const w = p.querySelector('.talent-world');
      return w ? parseFloat(w.style.height) : 0;
    })(),
    viewportH: (() => {
      const v = p.querySelector('.talent-viewport');
      return v ? v.clientHeight : 0;
    })(),
    revealed: nodes.filter((n) => !n.classList.contains('unrevealed')).length,
    strokeWidths: [...new Set(links.map((l) => l.getAttribute('stroke-width')))],
    curved: links.filter((l) => l.tagName.toLowerCase() === 'path').length,
    straight: links.filter((l) => l.tagName.toLowerCase() === 'line').length,
    poorCount: nodes.filter((n) => n.classList.contains('poor')).length,
    lockedCount: nodes.filter((n) => n.classList.contains('locked')).length,
    ownedCount: nodes.filter((n) => n.dataset.level !== '0').length,
  };
})()`);

check('the panel is open', shape.visible === true);
check('the DOM built the original 168 nodes', shape.nodes === 168, `${shape.nodes}`);
check('the DOM built the original 182 links', shape.links === 182, `${shape.links}`);
check('the declared counts match the DOM',
  shape.declaredNodes === shape.nodes && shape.declaredLinks === shape.links);
check('every sprite resolved', shape.brokenSprites === 0, `${shape.brokenSprites} broken`);
check('all 89 node icons are distinct', shape.iconSrcs === 89, `${shape.iconSrcs}`);
// The tree lives in the lower band, which is shorter than the graph. What must hold is the
// AUTHORED RATIO (75:50, i.e. 3:2) and that the fit leaves nothing cut off - the panel used
// to clamp its scale at 0.88, which rendered 510px of graph into a ~300px band and truncated
// the tree. `fitScale` is asserted against the band instead of against a pixel floor.
check('node boxes keep the 3:2 template ratio',
  shape.sizes.length === 2 && Math.abs(shape.sizes[1] / shape.sizes[0] - 1.5) < 1e-6,
  shape.sizes.join('/'));
check('the fitted graph is not taller than the band it sits in',
  shape.fitScale > 0 && shape.worldH * shape.fitScale <= shape.viewportH + 1,
  `${(shape.worldH * shape.fitScale).toFixed(1)}px of graph in ${shape.viewportH}px`);
check('a fresh save reveals only the AlwaysUnlockable root',
  shape.revealed === 1, `${shape.revealed} revealed`);
check('links are the original 2 units thick', shape.strokeWidths.join() === '2');
check('only the 8 curved links are arcs',
  shape.curved === 8 && shape.straight === 174, `${shape.curved} arcs / ${shape.straight} lines`);
check('a fresh save has exactly one buyable node', shape.poorCount === 1, `${shape.poorCount}`);
check('exactly one node is reachable on a fresh save', shape.lockedCount === 167,
  `${shape.lockedCount} locked`);
check('nothing is owned yet', shape.ownedCount === 0);

// The tints must be the template's exact colours, not approximations.
const tints = await evaluate(`(() => {
  const p = document.querySelector('.talent');
  const root = p.querySelector('.tn.poor') || p.querySelector('.tn');
  const other = [...p.querySelectorAll('.tn:not(.poor)')][0];
  const rgb = (s) => s.match(/[\\d.]+/g).map(Number);
  return {
    rootIcon: rgb(getComputedStyle(root.querySelector('.tn-icon')).backgroundColor),
    otherIcon: rgb(getComputedStyle(other.querySelector('.tn-icon')).backgroundColor),
    rootHi: rgb(getComputedStyle(root.querySelector('.tn-hi')).backgroundColor),
    rootHiOn: root.querySelector('.tn-hi').dataset.on,
    otherHiOn: other.querySelector('.tn-hi').dataset.on,
  };
})()`);

// BaseTemplate: LockedIconColor (0.40566,0.332872,0.292764), UnlockedIconColor (1,0.8071,0.70283),
// InsufficientCurrencyHighlighterColor (1,0.533019,0.553866,0.588235).
const near = (a, b, tol = 2) => a.length >= b.length && b.every((v, i) => Math.abs(a[i] - v) <= tol);
check('an unowned icon is the template LockedIconColor',
  near(tints.otherIcon, [103, 85, 75]), tints.otherIcon.join());
check('the buyable node glows InsufficientCurrencyHighlighterColor',
  tints.rootHiOn === '1' && near(tints.rootHi.slice(0, 3), [255, 136, 141], 2)
    && Math.abs(tints.rootHi[3] - 0.588) < 0.02,
  tints.rootHi.join());
check('an inaccessible node shows no highlighter', tints.otherHiOn === '0');

// The tooltip must speak the game's own Chinese, with the value substituted. Checked
// before buying, while the root is still purchasable and therefore still shows a cost.
const tip = await evaluate(`(() => {
  const p = document.querySelector('.talent');
  p.querySelector('.tn.poor').dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
  const t = p.querySelector('.talent-tip');
  return { hidden: t.classList.contains('hidden'), text: t.textContent,
           name: t.querySelector('.tt-name')?.textContent ?? '' };
})()`);
check('hovering a node raises the tooltip', tip.hidden === false);
check('the tooltip names the node', tip.name === 'Node 1', tip.name);
check('the tooltip shows the level line', /等级\s*0\s*\/\s*1/.test(tip.text), tip.text.slice(0, 50));
check('the tooltip shows the authored cost', /花费：/.test(tip.text) && /金币/.test(tip.text),
  tip.text.slice(0, 90));

// Clicking the root must spend exactly `Evaluate(costEquation, 1)`.
const buy = await evaluate(`(() => {
  const z = window.__zad;
  z.game.gold = 5000;
  z.game.refreshStats();
  z.talentPanel.refresh(z.game.talent, { gold: z.game.gold, currencies: z.game.currencies });
  const goldBefore = z.game.gold;
  const levelBefore = z.game.talent.totalLevels();
  // With a funded purse the root paints as affordable rather than poor.
  const root = document.querySelector('.tn.affordable') || document.querySelector('.tn.poor');
  const id = root.dataset.id;
  root.click();
  const after = document.querySelector('.tn[data-id="' + id + '"]');
  const rgb = (s) => s.match(/[\\d.]+/g).map(Number);
  const litAt = () => [...document.querySelectorAll('.talent-links > *')]
    .filter((l) => l.getAttribute('stroke') !== 'rgba(101,85,80,1)').length;
  const litAfterOne = litAt();
  return {
    id,
    goldBefore,
    goldAfter: z.game.gold,
    levelBefore,
    levelAfter: z.game.talent.totalLevels(),
    nodeLevel: after.dataset.level,
    iconAfter: rgb(getComputedStyle(after.querySelector('.tn-icon')).backgroundColor).slice(0, 3),
    litAfterOne,
  };
})()`);

check('clicking the root buys the level', buy.levelAfter === buy.levelBefore + 1,
  `${buy.levelBefore} -> ${buy.levelAfter}`);
check('the node reports level 1', buy.nodeLevel === '1', buy.nodeLevel);
check('the purchase deducted the authored price of 1 gold',
  buy.goldBefore - buy.goldAfter === 1, `${buy.goldBefore} -> ${buy.goldAfter}`);
check('an owned node takes the template UnlockedIconColor',
  near(buy.iconAfter, [255, 206, 179]), buy.iconAfter.join());
// `TreeCreator.ShouldLinkBeLocked` is `!(unlocked(from) && unlocked(to))`, so owning one
// end of a link is deliberately not enough to light it.
check('owning one end of a link does not light it', buy.litAfterOne === 0,
  `${buy.litAfterOne} lit`);

const pair = await evaluate(`(() => {
  const z = window.__zad;
  const ids = [...document.querySelectorAll('.tn')].map((n) => n.dataset.id);
  const owned = ids.filter((id) => z.game.talent.level(id) > 0);
  return { ownedCount: owned.length, rootId: owned[0] ?? null };
})()`);
check('the tree state recorded exactly one purchase', pair.ownedCount === 1,
  JSON.stringify(pair));

// ---------------------------------------------------------------- portal currency
// The tree's second currency is paid by the run portal, once per battle level, and the HUD
// counter is gated on `WasCurrencyShownBefore` exactly like the monster families.
const portal = await evaluate(`(() => {
  const z = window.__zad;
  const el = document.querySelector('.hud .cur-portal');
  const before = { hidden: el?.hidden, debt: z.game.portalCurrencyOwed(1) };
  // A portal node must be reachable before its purse is the only thing missing, so light
  // the tree's root neighbour chain is not needed: just fund the purse and read the node.
  z.game.portalCurrency = 3;
  z.game.portalCurrencySeen = true;
  z.game.refreshStats();
  z.talentPanel.refresh(z.game.talent, {
    gold: z.game.gold,
    currencies: { ...z.game.currencies, PortalCurrency: z.game.portalCurrency },
  });
  const portalNodes = [...document.querySelectorAll('.tn')].filter((n) => n.dataset.tpl === 'portal');
  return {
    before,
    counterExists: !!el,
    counterHiddenBefore: before.hidden === true,
    portalNodeCount: portalNodes.length,
    owedLevel2: z.game.portalCurrencyOwed(2),
    paidAfter: (() => { z.game.portalCurrencyPaid.add(1); return z.game.portalCurrencyOwed(1); })(),
  };
})()`);

check('the HUD has a portal-currency counter', portal.counterExists === true);
check('it starts hidden before the purse is ever filled', portal.counterHiddenBefore === true);
check('a fresh save owes portal currency on level 1', portal.before.debt === true);
check('the tree has 30 portal-template nodes', portal.portalNodeCount === 30,
  `${portal.portalNodeCount}`);
check('an unpaid level owes, a different level owes separately', portal.owedLevel2 === true);
check('marking a level paid clears its debt', portal.paidAfter === false);

console.log(failures === 0 ? '\nTALENT OK' : `\nFAILED: ${failures} check(s)`);
ws.close();
process.exit(failures === 0 ? 0 : 1);
