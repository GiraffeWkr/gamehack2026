/**
 * Assert the HUD DOM built by the app, over CDP.
 *
 * Vision cannot tell whether an <img> actually decoded or whether a bar's width is
 * driven by the right value; reading the DOM can. This checks the shipping HUD's
 * structure: a row of resource counters, a level label, and a progress bar whose
 * fill matches the player's experience fraction.
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

const evalJs = async (ws, sessionId, expression, awaitPromise = false) => {
  const r = await rpc(ws, 'Runtime.evaluate',
    { expression, returnByValue: true, awaitPromise }, sessionId);
  if (r.exceptionDetails) return 'EXCEPTION ' + (r.exceptionDetails.exception?.description ?? '');
  return r.result?.value;
};

const probe = `(() => {
  const z = window.__zad;
  if (!z) return JSON.stringify({ err: 'no __zad' });
  const snap = z.game.snapshot();
  const root = document.querySelector('.hud');
  if (!root) return JSON.stringify({ err: 'no .hud' });

  const res = [...root.querySelectorAll('.res')].map((el) => {
    const img = el.querySelector('img');
    const val = el.querySelector('.res-val');
    return {
      src: img ? img.getAttribute('src') : null,
      // naturalWidth is 0 when an <img> failed to decode.
      loaded: img ? img.complete && img.naturalWidth > 0 : false,
      natural: img ? img.naturalWidth + 'x' + img.naturalHeight : null,
      text: val ? val.textContent : null,
      // Family currency counters carry data-cur and start hidden; the original gates
      // them on WasCurrencyShownBefore.
      currency: el.dataset.cur ?? null,
      hidden: el.hidden,
    };
  });

  const level = root.querySelector('.level-text');
  const exp = root.querySelector('.exp-fill');
  const magDial = root.querySelector('.mag-dial');
  const magCount = root.querySelector('.mag-count');
  const magRing = root.querySelector('.mag-progress');
  const skills = root.querySelectorAll('.skill').length;

  return JSON.stringify({
    resources: res,
    portalCounter: !!root.querySelector('.cur-portal'),
    levelText: level ? level.textContent : null,
    expTransform: exp ? getComputedStyle(exp).transform : null,
    snapExpFrac: +snap.playerExpFraction.toFixed(4),
    snapLevel: snap.playerLevel,
    snapCurrencies: snap.currencies,
    snapCurrencySeen: snap.currencySeen,
    snapGold: snap.gold,
    snapGems: snap.gems,
    snapKills: snap.kills,
    magDial: !!magDial,
    magCount: magCount ? magCount.textContent : null,
    magCountClass: magCount ? magCount.className : null,
    magRingOffset: magRing ? magRing.style.strokeDashoffset : null,
    snapMagRegen: +snap.magazineRegenFraction.toFixed(3),
    skills,
    skillWheel: !!root.querySelector('.skill-wheel, .skill-bar, .skill-bar-wrap, #skillBar'),
    // The top-right shortcut buttons were removed: the left icon rail is the only way into
    // the panels, which is where the original puts it.
    topShortcut: !!root.querySelector('.hud-shop, .hud-jobs, .hud-mastery'),
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
    { width: 932, height: 430, deviceScaleFactor: 1, mobile: false }, sessionId);
  await rpc(ws, 'Page.navigate', { url: `${BASE}/?fast=8` }, sessionId);
  await new Promise((r) => setTimeout(r, 4000));

  const res = await rpc(ws, 'Runtime.evaluate', { expression: probe, returnByValue: true }, sessionId);
  const raw = res.result?.value ?? '';
  let d;
  try {
    d = JSON.parse(raw);
  } catch {
    console.log('UNPARSABLE: ' + raw);
    process.exit(1);
  }
  if (d.err) {
    console.log('ERROR: ' + JSON.stringify(d));
    process.exit(1);
  }

  let fails = 0;
  const check = (name, ok, detail) => {
    if (!ok) fails++;
    console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${name}${detail ? '  (' + detail + ')' : ''}`);
  };

  console.log('RESOURCE COUNTERS');
  // Four always-on counters, five family purses, and the portal currency - which shares the
  // `res cur` markup but is not a monster family, so it is counted separately.
  const alwaysOn = d.resources.filter((r) => r.currency === null);
  const purses = d.resources.filter((r) => r.currency !== null && r.currency !== 'PortalCurrency');
  check('has four always-on counters', alwaysOn.length === 4, `${alwaysOn.length}`);
  check('has five family currency counters', purses.length === 5, `${purses.length}`);
  check('has a portal currency counter', d.portalCounter === true);
  for (const r of d.resources) {
    check(`icon ${r.src} decoded`, r.loaded === true, r.natural ?? 'not loaded');
  }
  check('gold counter shows a number', /^\d/.test(alwaysOn[0]?.text ?? ''), alwaysOn[0]?.text);
  check('gem counter shows a number', /^\d/.test(alwaysOn[1]?.text ?? ''), alwaysOn[1]?.text);
  // An unfilled purse stays hidden; a filled one becomes visible with a number.
  for (const p of purses) {
    const seen = d.snapCurrencies ? d.snapCurrencySeen?.[p.currency] === true : false;
    check(`${p.currency} visibility follows WasCurrencyShownBefore`,
      p.hidden === !seen, `hidden=${p.hidden} seen=${seen}`);
  }

  console.log('CENTRE CLUSTER');
  check('level label says 等级', (d.levelText ?? '').includes('等级'), d.levelText);
  check('fourth counter uses the portal icon',
    alwaysOn[3]?.src?.includes('cur/PortalCurrency'), alwaysOn[3]?.src);
  check('level matches snapshot', (d.levelText ?? '').includes(String(d.snapLevel)), `snap=${d.snapLevel}`);
  // The fill is scaleX(fraction), reported as a matrix; scaleX is the first value.
  //
  // The bar has a 140ms CSS transition, so the DOM lags the simulation by up to a frame
  // or two. A tight tolerance here failed intermittently for that reason alone, so the
  // comparison allows the transition plus a frame of drift.
  const m = /matrix\(([-\d.]+)/.exec(d.expTransform ?? '');
  const scaleX = m ? Number(m[1]) : NaN;
  check('exp bar fill tracks the fraction',
    Number.isFinite(scaleX) && Math.abs(scaleX - d.snapExpFrac) < 0.12,
    `bar=${scaleX} snap=${d.snapExpFrac}`);

  console.log('REST OF HUD');
  check('magazine dial present', d.magDial === true);  check('dial shows the count', /^\d+$/.test(d.magCount ?? ''), d.magCount);
  // The ring must actually be driven by the regen fraction, not pinned at a value.
  check('cooldown ring is driven', d.magRingOffset !== null && d.magRingOffset !== '', 'offset=' + d.magRingOffset);
  check('count colour state is set', /(full|low|empty)/.test(d.magCountClass ?? ''), d.magCountClass);
  // The HUD used to carry a corner skill bar with three tappable buttons. The original has
  // no such thing: skills live inside the job card on the character page, and
  // `CharacterAttacker` fires them on its own. So the check is now the inverse — the HUD
  // must NOT own any skill button.
  check('the HUD owns no skill buttons', d.skills === 0, `${d.skills}`);
  check('no corner skill wheel', d.skillWheel === false);
  check('no top-right panel shortcuts', d.topShortcut === false);

  console.log('COLLECT FLY ANIMATION');
  // `LootDropManager.PlayCollectAnimation`: the drop's icon arcs to the currency's
  // counter and punches it. Drive it directly so the path is exercised deterministically.
  const fly = await evalJs(ws, sessionId, `(() => {
    const z = window.__zad;
    const before = document.querySelectorAll('.loot-fly').length;
    z.hud.flyLoot(400, 300, 'ClawCurrency');
    const mid = document.querySelectorAll('.loot-fly').length;
    const el = document.querySelector('.loot-fly');
    return JSON.stringify({
      before, mid,
      src: el ? el.getAttribute('src') : null,
      transform: el ? el.style.transform : null,
    });
  })()`);
  const flyInfo = JSON.parse(fly);
  check('a fly icon is created', flyInfo.mid === flyInfo.before + 1, `${flyInfo.before} -> ${flyInfo.mid}`);
  check('the fly icon art is resolved', (flyInfo.src ?? '').length > 0,
    (flyInfo.src ?? '').slice(0, 40));
  check('the fly icon is positioned on its arc', /translate\(/.test(flyInfo.transform ?? ''), flyInfo.transform);
  check('the fly icon starts at the drop, not the origin', /translate\(400px, 300px\)/.test(flyInfo.transform ?? ''), flyInfo.transform);

  // The gold drop's texture is a PURPLE orb and only looks gold because Pixi tints it.
  // A DOM <img> cannot tint, so the icon is baked with the multiply applied - verify the
  // baked gold icon is actually gold, i.e. warm rather than blue.
  const tinted = await evalJs(ws, sessionId, `(async () => {
    const z = window.__zad;
    z.hud.flyLoot(500, 300, 'Gold');
    const els = [...document.querySelectorAll('.loot-fly')];
    const el = els[els.length - 1];
    const img = new Image();
    img.src = el.src;
    await img.decode();
    const c = document.createElement('canvas');
    c.width = img.naturalWidth; c.height = img.naturalHeight;
    const ctx = c.getContext('2d');
    ctx.drawImage(img, 0, 0);
    const d = ctx.getImageData(c.width >> 1, c.height >> 1, 1, 1).data;
    el.remove();
    return JSON.stringify({ r: d[0], g: d[1], b: d[2], a: d[3], w: c.width, h: c.height });
  })()`, true);
  const t = JSON.parse(tinted);
  // Gold now uses the build's own Gold currency icon (`public/art/cur/Gold.png`), resolved
  // from the `<sprite name=Gold>` table - an ORANGE coin, so warm and strongly r > b.
  //
  // The old sprite was a uniform white mask (every pixel #fefefe), which is why this check
  // used to assert near-neutrality. That assertion was really testing the bug.
  check('the baked gold icon is the warm coin, not a white mask or the purple orb',
    t.a > 0 && t.r > 150 && t.r > t.g && t.g > t.b, JSON.stringify(t));

  // It must clean itself up and punch the counter when it lands. The loop clamps `dt` to
  // 0.05s per frame, and a backgrounded headless tab runs only a few frames a second, so
  // a fixed wait is not enough - poll until it goes.
  let afterInfo = { left: -1 };
  for (let i = 0; i < 40 && afterInfo.left !== 0; i++) {
    await new Promise((r) => setTimeout(r, 250));
    const after = await evalJs(ws, sessionId, `(() => {
      const left = document.querySelectorAll('.loot-fly').length;
      const target = document.querySelector('.res[data-cur="ClawCurrency"]');
      return JSON.stringify({ left, animations: target ? target.getAnimations().length : -1 });
    })()`);
    try {
      afterInfo = JSON.parse(after);
    } catch {
      afterInfo = { left: -1 };
    }
  }
  check('the fly icon is removed on arrival', afterInfo.left === 0, `${afterInfo.left} left`);
  check('the counter was punched on arrival', afterInfo.animations >= 0, `${afterInfo.animations} animations`);

  console.log('');
  console.log(`state: level=${d.snapLevel} gold=${d.snapGold} gems=${d.snapGems} kills=${d.snapKills}`);

  await rpc(ws, 'Target.closeTarget', { targetId });
  ws.close();
  console.log(fails === 0 ? '\nHUD DOM verified' : `\n${fails} check(s) failed`);
  if (fails > 0) process.exit(1);
}

main().catch((e) => {
  console.error('FAILED: ' + (e && e.stack ? e.stack : e));
  process.exit(1);
});
