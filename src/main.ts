/**
 * Entry point: builds the app, drives the loop, and persists progress.
 *
 * Persistence uses localStorage behind an explicit shape (level, cleared packs,
 * defeated guardians, gold, defeated enemies). The original's save was a
 * 3DES-encrypted BinaryFormatter blob with a hardcoded key — a web build has no
 * reason to repeat that, and should not.
 */

import './styles.css';
import { setLang, t, getLang } from './core/i18n.js';
import { reskinText } from './core/lexicon.js';
import { Game, type InputState } from './game/game.js';
import { SKILLS } from './game/skills.js';
import type { DamageNumber } from './game/types.js';
import { Renderer } from './render/renderer.js';
import { Hud } from './ui/hud.js';
import { TalentPanel, statText } from './ui/talent.js';
import { JobsPanel } from './ui/jobs.js';
import { MasteryPanel } from './ui/mastery.js';
import { MASTERIES } from './content/masteryData.js';
import { JOBS } from './content/jobData.js';
import { AimInput } from './ui/input.js';
import { Sfx, type SfxName } from './audio/sfx.js';
import { emptySave, normalizeSave, SAVE_KEY } from './core/save.js';
import type { SaveData } from './core/save.js';

/**
 * The drawable area in CSS pixels.
 *
 * Prefers the document element's client box, falls back to the visual viewport
 * (which is the accurate one on mobile browsers with dynamic toolbars), and
 * finally to the window. Never reads the app element, because it can measure 0
 * before layout has settled.
 */
function viewportSize(): { w: number; h: number } {
  const doc = document.documentElement;
  const vv = window.visualViewport;
  const w = Math.max(1, Math.round(vv?.width ?? doc.clientWidth ?? window.innerWidth));
  const h = Math.max(1, Math.round(vv?.height ?? doc.clientHeight ?? window.innerHeight));
  return { w, h };
}

function loadSave(): SaveData {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return emptySave();
    return normalizeSave(JSON.parse(raw));
  } catch {
    return emptySave();
  }
}

function writeSave(data: SaveData): void {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    /* storage disabled (private mode) - the run still works, just not persisted */
  }
}
async function boot(): Promise<void> {
  setLang('zh');
  const app = document.getElementById('app');
  const canvas = document.getElementById('game') as HTMLCanvasElement | null;
  if (!app || !canvas) throw new Error('#app or #game missing');

  const hint = document.createElement('div');
  hint.className = 'rotate-hint';
  hint.innerHTML = `
    <div class="icon">📱↻</div>
    <div class="title">${t('rotateTitle')}</div>
    <div class="sub">${t('rotateBody')}</div>
  `;
  app.appendChild(hint);

  const saved = loadSave();
  const renderer = new Renderer();
  // Size from the window, not from `app.clientHeight`: at this point in boot the
  // element can still measure 0 (the layout has not settled), which silently
  // produced a 908x291 canvas on a 932x430 screen and threw off every
  // world-to-screen conversion downstream.
  const initial = viewportSize();
  await renderer.init(canvas, initial.w, initial.h);

  const game = new Game({
    // `?level=N` starts at that stage instead of the saved one. Debug aid alongside
    // `?quiet`, `?fast`, `?stats`, `?measure` and `?shop`: several systems only switch on
    // at a particular level (Claw currency at 2, Archer at 3, Warrior at 6 ...), so
    // testing them otherwise means replaying up to that stage.
    level: Number(new URLSearchParams(location.search).get('level') ?? '') || saved.level,
    defeatedGuardians: saved.defeatedGuardians,
    // `?quiet=1` spawns no packs. Debug aid for observing the PLAYER in isolation -
    // health regen, the magazine, camera framing - where live enemies would otherwise
    // move the same numbers (incoming damage hides a heal, and dying resets the bar).
    spawnNothing: new URLSearchParams(location.search).has('quiet'),
    // `?recruit=0` starts the run with NO archer on the field: the "Recruit
    // Archer" talent node (Node 11, `IsArcherSpawned`) is what puts the character
    // there. The browser default is `true` so a fresh save is playable from the
    // first second — without the archer the magazine never regenerates and the
    // player cannot see the character they are meant to be controlling.
    archerSpawned: new URLSearchParams(location.search).get('recruit') !== '0',
  });
  game.gold = saved.gold;
  // Restore the family purses and their visibility flags, like
  // `playerData.PlayerClawCurrency` / `WasCurrencyShownBefore`.
  for (const [k, v] of Object.entries(saved.currencies ?? {})) {
    if (k in game.currencies) game.currencies[k as keyof typeof game.currencies] = v;
  }
  for (const [k, v] of Object.entries(saved.currencySeen ?? {})) {
    if (k in game.currencySeen && v) game.currencySeen[k as keyof typeof game.currencySeen] = true;
  }
  // `playerData.PlayerPortalCurrency` and `PortalCurrencyPaid`: the paid-out map must come
  // back, or replaying an old level would pay the portal currency again.
  game.portalCurrency = saved.portalCurrency ?? 0;
  game.portalCurrencySeen = saved.portalCurrencySeen ?? false;
  for (const lvl of saved.portalCurrencyPaid ?? []) game.portalCurrencyPaid.add(lvl);
  // Jobs and skill levels, replayed onto the stat bases like the talent tree so a returning
  // player is exactly as strong as when they left.
  game.jobs.load(saved.jobs);
  // Masteries replay onto the same bases, after jobs so the two axes compose in a fixed
  // order (`CrossSystemBonuses` in the original does the same reconciliation).
  game.mastery.load(saved.mastery);
  game.kills = saved.kills;
  // Restore the talent tree and replay it onto the stat bases, so a returning player is
  // as strong as when they left.
  game.talent.load(saved.talent ?? {});
  game.progression.load(saved.progression);
  if (game.talent.totalLevels() > 0 || saved.progression.level > 1) game.refreshStats();

  /**
   * `?fast=N` fast-forwards the simulation N seconds at boot with the player
   * auto-aiming at the nearest enemy. Used for screenshots and for inspecting
   * mid-level behaviour without playing up to it - a headless browser advances
   * `requestAnimationFrame` far too slowly to reach combat on its own, which made
   * every automated screenshot look like an empty world.
   */
  const fastParam = Number(new URLSearchParams(location.search).get('fast') ?? '0');
  if (Number.isFinite(fastParam) && fastParam > 0) {
    const scripted: InputState = { aiming: false, aimX: 0, aimY: 0, taps: 1 };
    const steps = Math.min(fastParam, 600) * 60;
    for (let i = 0; i < steps; i++) {
      let best: { x: number; y: number } | null = null;
      let bestD = Number.POSITIVE_INFINITY;
      for (const e of game.getEnemyList()) {
        if (!e.alive) continue;
        const d = e.x - game.px;
        if (d > -200 && d < bestD) {
          bestD = d;
          best = { x: e.x, y: e.y };
        }
      }
      if (best) {
        scripted.aimX = best.x;
        scripted.aimY = best.y;
        scripted.taps = 1;
      }
      game.tick(1 / 60, scripted);
      scripted.taps = 0;
      // Fast-forward runs before the audio graph exists; drop the cues instead of
      // replaying a whole level's worth of sounds at once.
      game.sfx.length = 0;
    }
    // The camera only advances inside `render`, so after a fast-forward it is
    // still sitting at the level start while the character has walked thousands
    // of units away. One large-dt render snaps it into place (updateCamera eases
    // with `1 - exp(-dt*7)`, which converges in a single call for a big dt).
    // Without this the character renders off-screen and the world looks empty.
    renderer.render(game, 1);
  }

  /**
   * Skill activation feedback.
  /**
   * There is deliberately NO manual skill casting here.
   *
   * `CharacterAttacker` fires every skill on its own: `GetReadySkillProjectile` picks the
   * best ready `isShotByArcher` skill for the auto-attack, `TryCastReadyBuffSkills` raises
   * a buff the moment it is off cooldown, `CallNonShotSkills` polls the cast skills every
   * 0.5s, and the passives are rolled instead of the plain shot. Nothing in the decompiled
   * UI ever calls `CallSkill` from a button press.
   *
   * Which is why the skill bar that used to sit at the bottom-right was an invention, and
   * the skills are shown (icon + cooldown, not clickable) on the jobs page instead.
   *
   * The HUD also takes no opener for the panels: the left icon rail in the lower band is the
   * only way in, which is where the original puts it.
   */
  // Set once the reset button is pressed: from that instant `saveNow` goes quiet so the
  // wipe below is the last write to storage (a real reload fires `beforeunload`, which
  // would otherwise re-save the old state right back over the deletion).
  let resetPending = false;

  const hud = new Hud(
    app,
    (x, y) => renderer.toScreen(x, y),
    {
      onReset: () => {
        resetPending = true;
        // Wipe the save and start over from stage 1 with nothing earned.
        localStorage.removeItem(SAVE_KEY);
        window.location.reload();
      },
    },
  );

  // Bake the drop icons with their tints up front. The flying collect icon is a DOM
  // `<img>`, which cannot apply Pixi's `tint`, so the multiply is done once into a canvas
  // per currency - otherwise the gold drop (a purple orb texture) flies to the counter
  // purple.
  void hud.preloadDropIcons();

  // --- audio -------------------------------------------------------------
  // The simulation only emits cue names (`game.sfx`); this is the one place that owns an
  // AudioContext. Browsers require a gesture before audio may start, so the graph is built
  // on the first pointer/key event and every cue before that is silently dropped.
  const sfx = new Sfx();
  const unlockAudio = (): void => {
    const first = !sfx.ready;
    sfx.unlock();
    if (first) sfx.play('ready');
  };
  window.addEventListener('pointerdown', unlockAudio, { passive: true });
  window.addEventListener('keydown', unlockAudio);
  // Hidden tabs drop the music (not the whole context: the game may still be running).
  document.addEventListener('visibilitychange', () => sfx.setMusicPaused(document.hidden));
  const soundBtn = document.querySelector<HTMLButtonElement>('.sound-btn');
  const paintSound = (): void => {
    if (!soundBtn) return;
    soundBtn.textContent = '♪';
    soundBtn.classList.toggle('muted', sfx.muted);
    soundBtn.title = sfx.muted ? '声音：关' : '声音：开';
  };
  paintSound();
  // A save may have been muted earlier; say so instead of leaving the player guessing
  // why the game is silent.
  if (sfx.muted) hud.showToast('音效已关闭 · 点右上角 ♪ 开启', 2400);
  soundBtn?.addEventListener('click', () => {
    sfx.unlock();
    sfx.toggle();
    paintSound();
  // A save may have been muted earlier; say so instead of leaving the player guessing
  // why the game is silent.
  if (sfx.muted) hud.showToast('音效已关闭 · 点右上角 ♪ 开启', 2400);
  });
  // Any button in the shell gets a soft click, including the panels' buy buttons.
  document.addEventListener('click', (ev) => {
    const el = (ev.target as HTMLElement | null)?.closest('button');
    if (el) sfx.play('ui');
  }, { capture: true });

  const drainSfx = (): void => {
    if (game.sfx.length === 0) return;
    for (const cue of game.sfx) sfx.play(cue as SfxName);
    game.sfx.length = 0;
  };

  /**
   * The talent tree. Buying rebuilds the stat bag from its bases plus every node level,
   * so the effect is immediate and cannot be double-applied. Nodes can charge several
   * currencies, so the purchase returns the whole purse set.
   */
  const talentPanel = new TalentPanel(app, {
    onBuy: (node) => {
      const purses = {
        gold: game.gold,
        currencies: { ...game.currencies, PortalCurrency: game.portalCurrency },
      };
      const next = game.talent.buy(node, purses);
      if (!next) return false;
      game.gold = next.gold;
      for (const key of Object.keys(game.currencies)) {
        game.currencies[key as keyof typeof game.currencies] =
          next.currencies[key] ?? game.currencies[key as keyof typeof game.currencies];
      }
      game.portalCurrency = Math.max(0, next.currencies.PortalCurrency ?? 0);
      game.refreshStats();
      // Report what the point actually bought, not the node's internal name: the
      // grants of the level just reached, formatted like the tooltip.
      const newLevel = game.talent.level(node.id);
      const gained = game.talent.grantsAt(node, newLevel)
        .map((gr, i) => (Math.abs(gr.delta) < 1e-9 ? '' : statText(node, i, gr.delta)))
        .filter(Boolean);
      hud.announceSkill(gained.length ? gained.join('、') : `${node.name} Lv${newLevel}`, true);
      return true;
    },
  });
  /** The tree spends gold and portal currency, so both go into the purse it sees. */
  const talentPurses = (): { gold: number; currencies: Record<string, number> } => ({
    gold: game.gold,
    currencies: { ...game.currencies, PortalCurrency: game.portalCurrency },
  });
  talentPanel.refresh(game.talent, talentPurses());
  let lastTalentSig = '';
  // `?tree=1` opens the tree on load and `?tree=0` keeps it shut, for screenshots of
  // either the panel or the artwork underneath it.
  const treeParam = new URLSearchParams(location.search).get('tree');
  if (treeParam === '1') talentPanel.setVisible(true);
  if (treeParam === '0') talentPanel.setVisible(false);

  /**
   * The jobs screen. Buying a job or a skill level rebuilds the stat bag the same way the
   * tree does - bases first, then every purchase replayed - so the effect is immediate and
   * a purchase can never double-apply. Both are paid for in ClawCurrency, which is the
   * family purse the Warrior-family drops feed.
   */
  const jobsPanel = new JobsPanel(app, {
    onUnlockJob: (index) => {
      const spent = game.jobs.unlock(index, game.currencies.ClawCurrency);
      if (spent === null) return false;
      game.currencies.ClawCurrency -= spent;
      game.refreshStats();
      // `CharacterManager.ChangeSkin`: the outfit follows the HIGHEST unlocked job.
      renderer.setPlayerSkin(game.jobs.skinIndex());
      const job = JOBS[index];
      hud.announceSkill(`解锁 ${reskinText(job.titleZh, getLang())}`, true);
      return true;
    },
    onLevelUpSkill: (job, slot) => {
      const id = JOBS[job].skills[slot];
      const price = game.jobs.skillCost(id);
      const spent = game.jobs.levelUpSkill(job, slot, game.currencies.ClawCurrency);
      if (spent === null) return false;
      game.currencies.ClawCurrency -= spent;
      game.refreshStats();
      hud.announceSkill(`${reskinText(SKILLS[id].titleZh, getLang())} Lv${game.jobs.level(id)}`, true);
      void price;
      return true;
    },
  });
  jobsPanel.refresh(game.jobs, game.currencies.ClawCurrency);
  // `?jobs=1` opens the screen on load, for screenshots and the browser harness.
  if (new URLSearchParams(location.search).get('jobs') === '1') jobsPanel.setVisible(true);

  /**
   * The mastery screen. Both tracks spend `Currencies.BatCurrency`, the family purse the
   * Bat monsters feed, exactly as `MasteryManager.MasteryCurrency` does.
   */
  const masteryPanel = new MasteryPanel(app, {
    onLevelNpc: () => {
      const res = game.mastery.levelUpNpc(game.currencies.BatCurrency);
      if (!res) return false;
      game.currencies.BatCurrency -= res.spent;
      game.refreshStats();
      if (res.reward) hud.announceSkill(reskinText(res.reward.textZh, getLang()), true);
      return true;
    },
    onLevelMastery: (index) => {
      const def = MASTERIES.find((m) => m.index === index);
      if (!def) return false;
      const spent = game.mastery.levelUp(def, game.currencies.BatCurrency);
      if (spent === null) return false;
      game.currencies.BatCurrency -= spent;
      game.refreshStats();
      return true;
    },
    onAwaken: (index) => {
      const def = MASTERIES.find((m) => m.index === index);
      if (!def) return false;
      const spent = game.mastery.awaken(def, game.currencies.BatCurrency);
      if (spent === null) return false;
      game.currencies.BatCurrency -= spent;
      game.refreshStats();
      hud.announceSkill(`${reskinText(def.nameZh, getLang())} ${'已觉醒'}`, true);
      return true;
    },
    onPrime: () => false,
  });
  masteryPanel.refresh(game.mastery, game.currencies.BatCurrency);
  if (new URLSearchParams(location.search).get('mastery') === '1') masteryPanel.setVisible(true);

  /**
   * The lower-half panel band.
   *
   * The three screens used to be full-screen overlays, which covered the artwork and the
   * HUD. They now share the band under the art frame, and this strip switches between them
   * - which is where the original puts its panels too.
   *
   * **Gating.** The tabs only appear once the run has unlocked the system, and the unlock
   * is a real TREE NODE, not a starting state:
   *   - 天赋   unlocked from a new game (`UnlockedSystems[Tree]`)
   *   - 职业   Job 0 ships unlocked and the rest are bought with Claw
   *   - 精通   `UnlockMastery`, granted by Node 106 for 1 portal currency
   * Mastery used to be listed from the first second, which is what made the HUD read as
   * "everything is already available".
   */
  const LOWER_TABS = [
    { id: 'talent', label: '天赋', icon: 'rail_tree', panel: talentPanel, gate: null },
    // Jobs is gated behind the "Recruit Archer" talent (Node 11): until the
    // archer is recruited there is nothing to equip or level up, so the tab is
    // hidden outright rather than shown with a padlock. `gate: 'recruitArcher'`
    // is resolved in `setBand` via `game.talent.isArcherRecruited()`.
    { id: 'jobs', label: '职业', icon: 'rail_jobs', panel: jobsPanel, gate: 'recruitArcher' },
    { id: 'mastery', label: '精通', icon: 'rail_mastery', panel: masteryPanel, gate: 'UnlockMastery' },
  ] as const;

  const lowerTabs = document.createElement('div');
  lowerTabs.className = 'lower-tabs';
  app.appendChild(lowerTabs);

  // The band is collapsed to start with; the tabs are how it opens.
  const bandOpen = { value: new URLSearchParams(location.search).get('tree') !== '0' };

  const tabButtons = LOWER_TABS.map((t) => {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'lower-tab';
    b.dataset.tab = t.id;
    // `MainMenusManager` gives each system an ICON, and swaps in a padlock while the
    // system is still locked. The label becomes the tooltip.
    b.title = t.label;
    const icon = document.createElement('img');
    icon.className = 'rail-icon';
    icon.alt = t.label;
    icon.src = 'art/' + t.icon + '.png';
    b.appendChild(icon);
    b.addEventListener('click', () => {
      const on = t.panel.visible;
      setBand(on ? null : t.id);
    });
    lowerTabs.appendChild(b);
    return { def: t, el: b, icon };
  });

  function setBand(active: string | null): void {
    bandOpen.value = active !== null;
    // While a band panel is open it covers the lower strip, so the bottom HUD bar
    // (magazine dial) must get out of the way — it sits at z-index 10, above the
    // panels' 8, and its `pointer-events:auto` was swallowing every click and hover
    // on the tree nodes that land underneath it (the nodes below the root).
    hud.setBandOpen(bandOpen.value);
    for (const { def, el, icon } of tabButtons) {
      // `recruitArcher` resolves through the talent tree (not the stat bag, which
      // the boot path seeds to 100 for playability), and unlike a stat gate the tab
      // is HIDDEN until unlocked rather than shown with a padlock: there is nothing
      // meaningful to show on the jobs panel before the archer exists.
      if (def.gate === 'recruitArcher') {
        const unlocked = game.talent.isArcherRecruited();
        el.hidden = !unlocked;
        if (unlocked && !icon.src.endsWith('art/' + def.icon + '.png')) {
          icon.src = 'art/' + def.icon + '.png';
        }
        el.classList.remove('locked');
        const on = unlocked && bandOpen.value && active === def.id;
        el.classList.toggle('active', on);
        def.panel.setVisible(on);
        continue;
      }
      const unlocked = def.gate === null || game.stats.get(def.gate) >= 10;
      // A locked system still shows a tab, but wearing the padlock.
      const wanted = unlocked ? 'art/' + def.icon + '.png' : 'art/ui_lock.png';
      if (!icon.src.endsWith(wanted)) icon.src = wanted;
      el.hidden = false;
      el.classList.toggle('locked', !unlocked);
      const on = bandOpen.value && active === def.id;
      el.classList.toggle('active', on);
      def.panel.setVisible(on);
    }
  }

  /** The unlock stats change as the tree is bought, so re-read them every frame. */
  function refreshBandGates(): void {
    const active = tabButtons.find((b) => b.el.classList.contains('active'))?.def.id ?? null;
    setBand(active);
  }

  // The band opens on the TREE, never on nothing. It used to start collapsed, which left a
  // dead brown strip across the bottom of a fresh run — the original always has a page
  // showing, and `MainMenusManager` opens the tree first. The `?tree=1` / `?jobs=1` /
  // `?mastery=1` params used by screenshots and the browser harnesses still pick a page.
  // Jobs is hidden until the archer is recruited, so `?jobs=1` on a fresh save falls back
  // to the tree rather than opening a tab whose button is not on the strip.
  const wantedRaw = (['talent', 'jobs', 'mastery'] as const).find(
    (id) => new URLSearchParams(location.search).get(id === 'talent' ? 'tree' : id) === '1',
  );
  const wanted = wantedRaw === 'jobs' && !game.talent.isArcherRecruited() ? 'talent' : (wantedRaw ?? 'talent');
  setBand(wanted);

  const input = new AimInput(canvas, {    toWorld: (sx, sy) => renderer.screenToWorld(sx, sy),
    onAim: () => {
      /* the sim reads `tapped` from the shared InputState */
    },
    onAimMove: () => {
      /* aim position already updated in the shared state */
    },
  });

  /**
   * `?stats=1` overlays live input counters.
   *
   * Reports taps that the input layer actually saw versus arrow-fall attempts the
   * simulation accepted, which separates "the tap never arrived" from "the arrow
   * was fired but you could not see it". Guessing between those two wasted a lot
   * of time, so the counter stays in the build.
   */
  let debugTaps = 0;
  let debugShotsFired = 0;
  let debugShotsBlocked = 0;
  let statsEl: HTMLPreElement | null = null;
  if (new URLSearchParams(location.search).has('stats')) {
    statsEl = document.createElement('pre');
    statsEl.style.cssText =
      'position:absolute;left:0;bottom:0;z-index:99;margin:0;padding:4px 6px;' +
      'font:11px/1.4 monospace;color:#9fe6ff;background:rgba(0,0,0,.7);pointer-events:none';
    app.appendChild(statsEl);
    // Count only pointer downs that land on the play surface, not HUD buttons or the
    // panel tabs — the counter is meant to separate "the tap never arrived" from
    // "the arrow was fired but you could not see it".
    window.addEventListener('pointerdown', (ev) => {
      if (canvas.contains(ev.target as Node)) debugTaps++;
    }, true);
  }

  // --- resize ---------------------------------------------------------------
  const applySize = (): void => {
    const s = viewportSize();
    renderer.resize(s.w, s.h);
  };
  window.addEventListener('resize', applySize);
  window.addEventListener('orientationchange', () => window.setTimeout(applySize, 120));
  // Catches the first real layout pass, which is exactly when clientHeight
  // becomes non-zero on a phone browser.
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(applySize).observe(app);
  }
  applySize();

  // --- pause when backgrounded (phones throttle rAF, dt spikes on return) ----
  let paused = false;
  document.addEventListener('visibilitychange', () => {
    paused = document.hidden;
    last = performance.now();
  });

  // --- main loop ------------------------------------------------------------
  let last = performance.now();
  let pendingFloaters: DamageNumber[] = [];
  let clearedTimer = 0;
  let levelCleared = false;
  /** Accumulator for the stats-panel refresh (~4Hz). */
  let statsTick = 0;

  const flushFloaters = (): void => {
    for (const n of pendingFloaters) hud.float(n.x, n.y, n.value, n.crit);
    pendingFloaters = [];
  };

  const frame = (now: number): void => {
    requestAnimationFrame(frame);
    const dtRaw = (now - last) / 1000;
    last = now;
    if (paused) {
      // Paused: keep rendering so the frame is not blank, but do not advance the run.
      renderer.render(game, 0);
      return;
    }
    // Clamp so a hitch (tab switch, GC) cannot teleport the simulation.
    const dt = Math.min(dtRaw, 0.05);

    input.update(dt);
    const state: InputState = input.getState();
    const blockedBefore = game.shotsBlocked;
    game.tick(dt, state);
    drainSfx();
    sfx.setThruster(game.isArcherSpawned && game.isMoving());

    // A tap refused for lack of arrows must say so. The magazine regenerates at
    // 0.4s per arrow while a player can tap far faster, so refusals are the norm,
    // and silence made the input look broken.
    if (game.shotsBlocked > blockedBefore) hud.outOfArrows();

    // Drain the sim's presentation queues.
    pendingFloaters = game.floaters.drain();
    game.spawnPuffs.drain();
    // Collected drops fly from where they were picked up to their HUD counter, which is
    // `LootDropManager.PlayCollectAnimation`.
    for (const drop of game.collectedDrops) {
      const p = renderer.toScreen(drop.x, drop.y);
      hud.flyLoot(p.x, p.y, drop.currency);
    }
    game.collectedDrops.length = 0;
    // Skill banners are raised by `castSkill` at press time, so the queue only
    // needs clearing here.
    game.skillCasts.drain();

    // Landing markers: the only cue that a tap registered when the aim point is
    // off-screen.
    for (const hit of game.impacts.drain()) {
      const p = renderer.toScreen(hit.x, hit.y);
      if (p.x > -60 && p.x < renderer.viewWidth + 60 && p.y > -60 && p.y < renderer.viewHeight + 60) {
        hud.impactScreen(p.x, p.y, hit.missed);
      }
    }

    renderer.render(game, dt);
    const snap = game.snapshot();

    // Arrow-fall accounting, surfaced by `?stats=1`.
    debugShotsFired = game.shotsFired;
    debugShotsBlocked = game.shotsBlocked;
    if (statsEl) {
      const enemies = game.getEnemyList().filter((e) => e.alive && !e.isPortal);
      const hpSample = enemies.slice(0, 3).map((e) => `${e.type} ${e.hp.toFixed(1)}/${e.maxHp.toFixed(1)}`).join('  ');
      statsEl.textContent =
        `taps seen     ${debugTaps}\n` +
        `arrows fired  ${debugShotsFired}\n` +
        `no ammo       ${debugShotsBlocked}\n` +
        `magazine      ${snap.magazine}/${snap.magazineSize}\n` +
        `enemies alive ${enemies.length}\n` +
        `bow arrows    ${game.getProjectileList().length}\n` +
        `sky arrows    ${game.getArrowList().length}\n` +
        `bars drawn    ${renderer.barsDrawn}\n` +
        `proj drawn    ${renderer.projectilesDrawn}\n` +
        `kills/gold    ${snap.kills}/${snap.gold}\n` +
        `hp sample     ${hpSample}`;
      // Mirror a compact summary into the document title so a headless
      // `--dump-dom` run can read the numbers as text instead of guessing them
      // from a screenshot (a fast arrow is nearly impossible to catch in a frame).
      document.title =
        `ZADSTATS taps=${debugTaps} fired=${debugShotsFired} refused=${debugShotsBlocked} ` +
        `mag=${snap.magazine}/${snap.magazineSize} enemies=${enemies.length} ` +
        `bars=${renderer.barsDrawn} proj=${renderer.projectilesDrawn} ` +
        `sky=${game.getArrowList().length} kills=${snap.kills} gold=${snap.gold} px=${Math.round(game.px)}`;
    }
    hud.update(snap, game.skills, dt);

    // Stats panel refresh at ~4Hz: stat values only move on purchases and buff ticks,
    // so there is no need to rebuild the rows every frame.
    statsTick += dt;
    if (statsTick >= 0.25) {
      statsTick = 0;
      const entries: Array<[string, number]> = [];
      for (const [key, stat] of game.stats.entries()) entries.push([key, stat.get()]);
      hud.setStats(entries);
    }

    // Keep the talent graph live: node colours depend on the purses, so earning gold
    // mid-run must light up the nodes it just made affordable. The signature guard keeps
    // 40-odd class toggles off the per-frame path.
    const talentSig = `${Math.floor(game.gold)}|${game.talent.totalLevels()}`
      + `|${game.currencies.ClawCurrency}|${game.currencies.BatCurrency}`
      + `|${game.currencies.BatCurrency}|${game.portalCurrency}`;
    if (talentSig !== lastTalentSig) {
      lastTalentSig = talentSig;
      talentPanel.refresh(game.talent, talentPurses());
      // `UnlockMastery` and friends are granted by TREE NODES, so the tab strip has to
      // re-read them whenever the tree moves.
      refreshBandGates();
    }
    // Skill cooldowns live on the jobs page (icon + seconds), which is where the original
    // puts them, so they are refreshed here rather than by a corner HUD bar.
    jobsPanel.updateCooldowns(game.skills);
    flushFloaters();
    hud.endFrame();

    // --- level cleared: celebrate, save, advance ---
    if (snap.runState === 'cleared') {
      if (!levelCleared) {
        levelCleared = true;
        clearedTimer = 0;
        hud.showToast(t('levelCleared', { n: snap.level }), 1400);
        saveNow(true);
      }
      clearedTimer += dt;
      // Wait until the character has actually walked off the right edge (the camera holds
      // at the level's end while he does). The timer is only a safety net for extreme
      // viewports; 6s is far longer than the exit sprint needs.
      const exitScreenX = renderer.toScreen(game.px, game.py).x;
      const offscreen = exitScreenX > viewportSize().w + 80;
      if (clearedTimer > 0.6 && (offscreen || clearedTimer > 6)) {
        levelCleared = false;
        game.advanceLevel();
        hud.showToast(`LEVEL ${game.level}`, 1200);
      }
    } else {
      levelCleared = false;
    }

    if (snap.runState === 'dead') {
      hud.showToast(t('down'), 900);
    }
  };

  requestAnimationFrame(frame);

  /**
   * Persists the CURRENT run state. The cleared-level branch used to be the only writer,
   * so anything earned mid-level (gold, kills, tree purchases, job/mastery levels) was
   * lost if the player closed the tab before clearing — a refresh after a long run went
   * back to the last cleared level. Now the same snapshot also lands on tab hide/close.
   *
   * `advance` is true when the caller is saving BECAUSE the level was cleared: the save
   * then records `level + 1` so a reload starts the next stage, exactly like the old
   * inline write did. Mid-run saves keep the level the player is on.
   */
  function saveNow(advance = false): void {
    if (resetPending) return;
    writeSave({
      level: Math.max(1, game.level + (advance ? 1 : 0)),
      gold: Math.floor(game.gold),
      kills: game.kills,
      defeatedGuardians: game.progress().defeated,
      progression: game.progression.serialize(),
      talent: game.talent.serialize(),
      currencies: { ...game.currencies },
      currencySeen: { ...game.currencySeen },
      portalCurrency: game.portalCurrency,
      portalCurrencySeen: game.portalCurrencySeen,
      portalCurrencyPaid: [...game.portalCurrencyPaid],
      jobs: game.jobs.serialize(),
      mastery: game.mastery.serialize(),
    });
  }

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) saveNow();
  });
  window.addEventListener('beforeunload', () => saveNow());
  // Mobile Safari and some Android WebViews skip `beforeunload`; `pagehide` is the event
  // that actually fires when the tab is closed or the app is backgrounded.
  window.addEventListener('pagehide', () => saveNow());
  // A hard process kill (Task Manager, crash, "stop server") runs no unload handler at
  // all, so a run in progress would roll back to the last cleared level. A cheap periodic
  // snapshot bounds that loss to a few seconds.
  window.setInterval(() => saveNow(), 5000);

  // Expose for quick console poking during development.
  Object.assign(window as unknown as Record<string, unknown>, {
    __zad: { game, renderer, hud, talentPanel, jobsPanel, masteryPanel, sfx },
  });

  // ?measure=1 overlays the internal geometry on the game, so framing problems can
  // be diagnosed from a screenshot instead of by guesswork.
  if (new URLSearchParams(location.search).has('measure')) {
    window.setTimeout(() => {
      const overlay = document.createElement('pre');
      overlay.style.cssText =
        'position:absolute;left:0;top:0;z-index:99;margin:0;padding:6px;' +
        'font:11px/1.4 monospace;color:#9fe6ff;background:rgba(0,0,0,.75);pointer-events:none';
      // Timestamp the readout so a stale overlay cannot be mistaken for a fresh one.
      const stamp = `[t=${(performance.now() / 1000).toFixed(1)}s]`;
      overlay.textContent = stamp + '\n' + renderer.measure(game);
      app.appendChild(overlay);
    }, 2500);
  }
}

void boot();
