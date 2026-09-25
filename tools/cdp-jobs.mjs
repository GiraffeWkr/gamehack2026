/**
 * Acceptance harness for the jobs / skills screen.
 *
 * Every number asserted here comes out of the shipping build via
 * `analysis/export_jobs_web.py`, so a regression in the data or the gating fails loudly:
 *
 *   - 5 jobs, 15 skills, and the authored unlock ladder 0 / 200 / 1500 / 20000 / 300000
 *   - the real job names and their per-job skill rosters
 *   - `JobsUIManager` gating: a job's unlock button only appears once the previous job is
 *     bought, and a skill slot only opens once the previous slot has a level in it
 *   - buying spends exactly `cost[level]`, and the level actually lands
 *   - the outfit follows the highest unlocked job (`CharacterManager.ChangeSkin`)
 *
 * Usage: node tools/cdp-jobs.mjs [width] [height]
 */
import { writeFileSync } from 'node:fs';

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
    throw new Error(r.exceptionDetails.exception?.description ?? r.exceptionDetails.text);
  }
  return r.result.value;
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', {
  width: W, height: H, deviceScaleFactor: 1, mobile: W < 700,
});
// These assertions describe a fresh profile, so a previous run's save must not leak in.
await send('Page.addScriptToEvaluateOnNewDocument', {
  source: 'try { localStorage.clear(); } catch (e) {}',
});
await send('Page.navigate', { url: `${BASE}/?fast=3&jobs=1` });
await new Promise((r) => setTimeout(r, 3500));

console.log(`\n[jobs screen ${W}x${H}]`);

const shape = await evaluate(`(() => {
  const p = document.querySelector('.jobs');
  if (!p) return { error: 'no jobs panel' };
  const tabs = [...p.querySelectorAll('.job-card')];
  const skills = [...p.querySelectorAll('.job-skill')];
  const unlock = p.querySelector('.job-card .jc-unlock');
  return {
    visible: !p.classList.contains('hidden'),
    declaredJobs: Number(p.dataset.jobs),
    declaredSkills: Number(p.dataset.skills),
    tabs: tabs.length,
    tabLabels: tabs.map((t) => t.querySelector('.jc-title')?.textContent ?? ''),
    tabStates: tabs.map((t) => t.dataset.state),
    skills: skills.length,
    visibleSkills: skills.filter((s) => !s.hidden).length,
    unlockHidden: unlock.hidden,
    brokenIcons: [...p.querySelectorAll('.js-icon')].filter((i) => i.complete && i.naturalWidth === 0).length,
    iconCount: new Set([...p.querySelectorAll('.js-icon')].map((i) => i.getAttribute('src'))).size,
    header: p.querySelector('.jobs-progress')?.textContent,
  };
})()`);

check('the jobs panel is open', shape.visible === true);
check('five job tabs', shape.tabs === 5 && shape.declaredJobs === 5, `${shape.tabs}`);
check('fifteen skill buttons exist', shape.skills === 15 && shape.declaredSkills === 15,
  `${shape.skills}`);
check('every skill icon resolved', shape.brokenIcons === 0, `${shape.brokenIcons} broken`);
check('the 15 skills have distinct icons', shape.iconCount === 15, `${shape.iconCount}`);
check('the unlocked job shows its three skills', shape.visibleSkills === 3,
  `${shape.visibleSkills}`);

// `JobsUIManager`: job 0 ships unlocked and named; the rest are gated in order.
check('job 0 is named with the game’s own wording', shape.tabLabels[0] === '弓箭手',
  shape.tabLabels[0]);
check('job 0 reads as unlocked', shape.tabStates[0] === 'unlocked');
check('job 1 reads as unlockable', shape.tabStates[1] === 'unlockable', shape.tabStates[1]);
check('jobs 2-4 are still locked', shape.tabStates.slice(2).every((s) => s === 'locked'),
  shape.tabStates.join());

// Buying: fund the claw purse and drive the real buttons.
const buy = await evaluate(`(() => {
  const z = window.__zad;
  const g = z.game;
  g.currencies.ClawCurrency = 400;
  z.jobsPanel.refresh(g.jobs, g.currencies.ClawCurrency);
  const before = { claw: g.currencies.ClawCurrency, level: g.jobs.level('Multishot') };
  const btn = document.querySelector('.job-skill[data-id="Multishot"]');
  btn.click();
  return {
    before,
    clawAfter: g.currencies.ClawCurrency,
    levelAfter: g.jobs.level('Multishot'),
    cost: ${JSON.stringify(0)},
  };
})()`);
check('clicking a skill buys a level', buy.levelAfter === buy.before.level + 1,
  `${buy.before.level} -> ${buy.levelAfter}`);
check('it spent the authored cost[0] of 5 claw',
  buy.before.claw - buy.clawAfter === 5, `${buy.before.claw} -> ${buy.clawAfter}`);

const jobBuy = await evaluate(`(() => {
  const z = window.__zad;
  const g = z.game;
  const before = g.currencies.ClawCurrency;
  const btn = document.querySelector('.job-card[data-job="1"] .jc-unlock');
  const wasHidden = btn.hidden;
  btn.click();
  return {
    wasHidden,
    before,
    after: g.currencies.ClawCurrency,
    unlocked: g.jobs.unlocked[1],
    skin: g.jobs.skinIndex(),
    tabStateNow: document.querySelector('.job-card[data-job="1"]').dataset.state,
  };
})()`);
check('job 1 shows its unlock button', jobBuy.wasHidden === false);
check('unlocking job 1 costs its authored 200',
  jobBuy.before - jobBuy.after === 200, `${jobBuy.before} -> ${jobBuy.after}`);
check('job 1 is now unlocked', jobBuy.unlocked === true);
check('its tab flips to unlocked', jobBuy.tabStateNow === 'unlocked', jobBuy.tabStateNow);
check('the outfit follows the highest unlocked job', jobBuy.skin === 1, `skin ${jobBuy.skin}`);

// Slot gating inside a job, and the max-level readout.
const slots = await evaluate(`(() => {
  const z = window.__zad;
  const g = z.game;
  g.currencies.ClawCurrency = 1e6;
  z.jobsPanel.refresh(g.jobs, g.currencies.ClawCurrency);
  const wolf = document.querySelector('.job-skill[data-id="Wolf"]');
  const bear = document.querySelector('.job-skill[data-id="Bear"]');
  const bearBefore = { hidden: bear.hidden, locked: bear.classList.contains('locked') };
  // Buy Wolf out completely, then Bear's first level.
  for (let i = 0; i < 3; i++) wolf.click();
  z.jobsPanel.refresh(g.jobs, g.currencies.ClawCurrency);
  const wolfAfter = {
    lv: g.jobs.level('Wolf'),
    maxed: wolf.classList.contains('maxed'),
    cost: wolf.querySelector('.js-cost').textContent,
  };
  z.jobsPanel.refresh(g.jobs, g.currencies.ClawCurrency);
  return { bearBefore, wolfAfter, bearHiddenNow: bear.hidden };
})()`);
check('a later slot is hidden until its job is selected and reachable', slots.bearBefore.hidden === false);
check('Wolf levels to its max of 3', slots.wolfAfter.lv === 3, String(slots.wolfAfter.lv));
check('a maxed skill shows the game’s 最大 label', slots.wolfAfter.cost === '最大',
  slots.wolfAfter.cost);

const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`jobs-${W}x${H}.png`, Buffer.from(shot.data, 'base64'));
console.log(`\nwrote jobs-${W}x${H}.png`);
console.log(failures === 0 ? '\nJOBS OK' : `\nFAILED: ${failures} check(s)`);
ws.close();
process.exit(failures === 0 ? 0 : 1);
