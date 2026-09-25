/**
 * DOM-based HUD.
 *
 * UI is plain DOM rather than Pixi text: it is faster to iterate on, gets free
 * crisp text at any DPI, handles safe-area insets natively, and — for the mobile
 * target — gives real browser hit-testing for the touch controls.
 *
 * Layout is mobile-first landscape:
 *
 *   ┌ safe-area-inset-top ─────────────────────────────────────┐
 *   │ [HP bar]        Lv.3  ▓▓▓▓░░░░ ▸            ◆ 1.2K      │
 *   │                                                          │
 *   │                    (game world)                          │
 *   │                                                          │
 *   │ [●●●●●○]                                    ( ◯ ◯ ◯ )    │
 *   └──────────────────────────────────────────────────────────┘
 *      magazine              skill wheel (right thumb)
 */

import { clamp, toReadable } from '../core/math.js';
import { t } from '../core/i18n.js';
import { DROP_ART } from '../content/art.js';
import { loadImage } from '../render/renderer.js';
import type { Snapshot } from '../game/types.js';
import type { Skills } from '../game/skills.js';

/**
 * `LootDropManager` animation constants, ported verbatim.
 *
 * `animationDuration = 0.6f`, of which the first 10% is the scale pop and the rest is the
 * move; `midScale = 1.3f`, `endScale = 0.2f`, `arcHeight = 150f`, `rotationAmount = 720f`,
 * `punchScale = 0.15f` over 0.25s.
 */
const LOOT_DURATION = 0.6;
const LOOT_POP_SECONDS = LOOT_DURATION * 0.1;
const LOOT_MOVE_SECONDS = LOOT_DURATION * 0.9;
const LOOT_MID_SCALE = 1.3;
const LOOT_END_SCALE = 0.2;
const LOOT_ARC_HEIGHT = 150;
const LOOT_SPIN_DEG = 720;
const LOOT_PUNCH_SECONDS = 0.25;

export interface HudCallbacks {
  /**
   * The HUD takes no callbacks any more.
   *
   * It used to carry three top-right shortcut buttons (天赋 / 职业 / 精通) that opened the
   * panels. The original opens every system from the ICON RAIL down the left of the lower
   * panel, and that rail now exists, so the shortcuts were a second, wrong way in - and the
   * 天赋 one was the only one ever visible.
   *
   * There is deliberately no `onSkill` either: every skill is fired automatically by
   * `CharacterAttacker`, and the original never casts one from a button.
   */
}


export class Hud {
  private readonly root: HTMLDivElement;
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLDivElement;
  private readonly levelText: HTMLDivElement;
  private readonly expFill: HTMLDivElement;
  private readonly goldText: HTMLSpanElement;
  private readonly gemText: HTMLSpanElement;
  private readonly killText: HTMLSpanElement;
  private readonly clearText: HTMLSpanElement;
  /** Family currency counters, keyed by currency name; hidden until first earned. */
  private readonly curEls = new Map<string, { root: HTMLElement; val: HTMLSpanElement }>();
  /** `playerData.PlayerPortalCurrency`'s counter, gated on `WasCurrencyShownBefore`. */
  private readonly portalCurEl: HTMLElement;
  private readonly portalCurVal: HTMLSpanElement;
  private readonly magCount: HTMLSpanElement;
  private readonly magProgress: SVGCircleElement;
  private readonly portalBar: HTMLDivElement;
  private readonly portalFill: HTMLDivElement;
  private readonly portalText: HTMLDivElement;
  private readonly toast: HTMLDivElement;
  private readonly flash: HTMLDivElement;

  // Floating damage numbers, pooled so a burst does not allocate.
  private readonly pool: HTMLDivElement[] = [];
  private poolUsed = 0;

  /** Longest summon countdown seen, so the bar can show progress inward. */
  private portalSummonTotal = 0;

  constructor(
    parent: HTMLElement,
    toScreen: (x: number, y: number) => { x: number; y: number },
  ) {
    this.toScreen = toScreen;
    this.root = el('div', 'hud');
    // Top bar follows the shipping HUD's structure: a row of resource counters on
    // the left, the level and its progress bar centred, actions on the right. The
    // original's left cluster is four icon+number pairs; the slice shows the two
    // real currencies plus two run counters.
    this.root.innerHTML = `
      <div class="hud-top">
        <div class="hud-left">
          <div class="hud-res">
            <span class="res"><img class="res-icon" src="art/cur/Gold.png" alt="" /><span class="res-val gold-text">0</span></span>
            <span class="res"><img class="res-icon" src="art/cur/GemCurrency.png" alt="" /><span class="res-val gem-text">0</span></span>
            <span class="res"><img class="res-icon" src="art/cur/Monsters.png" alt="" /><span class="res-val kill-text">0</span></span>
            <span class="res"><img class="res-icon" src="art/cur/PortalCurrency.png" alt="" /><span class="res-val clear-text">0</span></span>
            <span class="res cur" data-cur="ClawCurrency" hidden><img class="res-icon" src="art/cur/ClawCurrency.png" alt="" /><span class="res-val cur-claw">0</span></span>
            <span class="res cur" data-cur="ArcherCurrency" hidden><img class="res-icon" src="art/cur/ArcherCurrency.png" alt="" /><span class="res-val cur-archer">0</span></span>
            <span class="res cur" data-cur="WarriorCurrency" hidden><img class="res-icon" src="art/cur/WarriorCurrency.png" alt="" /><span class="res-val cur-warrior">0</span></span>
            <span class="res cur" data-cur="MageCurrency" hidden><img class="res-icon" src="art/cur/MageCurrency.png" alt="" /><span class="res-val cur-mage">0</span></span>
            <span class="res cur" data-cur="BatCurrency" hidden><img class="res-icon" src="art/cur/BatCurrency.png" alt="" /><span class="res-val cur-bat">0</span></span>
            <span class="res cur cur-portal" data-cur="PortalCurrency" hidden><img class="res-icon" src="art/cur/PortalCurrency.png" alt="" /><span class="res-val cur-portal-val">0</span></span>
          </div>
          <div class="hp">
            <div class="hp-fill"></div>
            <div class="hp-text">100 / 100</div>
          </div>
        </div>
        <div class="hud-center">
          <div class="level-text"></div>
          <div class="progress hint-exp"><div class="progress-fill exp-fill"></div></div>
        </div>
        <div class="hud-right"></div>
      </div>

      <div class="hud-portal hidden">
        <div class="portal-label"></div>
        <div class="portal-bar"><div class="portal-fill"></div></div>
        <div class="portal-text"></div>
      </div>

      <div class="hud-toast hidden"></div>
      <div class="hud-flash"></div>
      <div class="hud-bottom">
        <div class="mag">
          <div class="mag-label"></div>
          <div class="mag-dial">
            <svg viewBox="0 0 44 44" class="mag-ring">
              <circle class="mag-track" cx="22" cy="22" r="19" />
              <circle class="mag-progress" cx="22" cy="22" r="19" />
            </svg>
            <span class="mag-count">0</span>
          </div>
        </div>
      </div>
    `;
    this.root.querySelector('.hud-flash')!.classList.add('tmp');
    parent.appendChild(this.root);
    this.root.querySelector('.hud-flash')!.classList.remove('tmp');

    this.hpFill = q(this.root, '.hp-fill');
    this.hpText = q(this.root, '.hp-text');
    this.levelText = q(this.root, '.level-text');
    this.expFill = q(this.root, '.exp-fill');
    this.goldText = q(this.root, '.gold-text');
    this.gemText = q(this.root, '.gem-text');
    this.killText = q(this.root, '.kill-text');
    this.clearText = q(this.root, '.clear-text');
    // Family currency counters, looked up by the `data-cur` attribute the markup sets.
    // `PortalCurrency` shares the markup shape but not the row: it is not a monster
    // family, so it gets its own handle and its own gate below.
    for (const el2 of Array.from(this.root.querySelectorAll<HTMLElement>('.res.cur'))) {
      const key = el2.dataset.cur;
      if (!key || key === 'PortalCurrency') continue;
      this.curEls.set(key, { root: el2, val: q(el2, '.res-val') });
    }
    this.portalCurEl = q(this.root, '.cur-portal');
    this.portalCurVal = q(this.root, '.cur-portal-val');
    this.magCount = q(this.root, '.mag-count');
    this.magProgress = q(this.root, '.mag-progress');
    // Circumference of r=19, for the stroke-dash animation.
    this.magRingLength = 2 * Math.PI * 19;
    this.magProgress.style.strokeDasharray = String(this.magRingLength);
    this.portalBar = q(this.root, '.hud-portal');
    this.portalFill = q(this.root, '.portal-fill');
    this.portalText = q(this.root, '.portal-text');
    this.toast = q(this.root, '.hud-toast');
    this.flash = q(this.root, '.hud-flash');

    // Localised labels, read from the i18n table on construction.
    q<HTMLDivElement>(this.root, '.mag-label').textContent = t('arrows');
    q<HTMLDivElement>(this.root, '.portal-label').textContent = t('portalTitle');

    // The top-right shortcut buttons are gone - the left icon rail opens every system, the
    // way the original does. Nothing else was wired to them.



    // The bar starts on Job 0, the job a new profile ships unlocked.
  }

  private readonly toScreen: (x: number, y: number) => { x: number; y: number };

  /**
   * (Re)builds the in-run skill bar for a job's three skills.
   *
   * The bar follows the HIGHEST unlocked job, which is also the job whose shot skill wins
   * the auto-attack roll (`CharacterAttacker.GetSortedJobs` sorts descending), so what is
   * on the bar is what the archer is actually using. Rebuilt rather than appended so a
   * job switch cannot leave the previous job's buttons behind.
   */


  /**
   * Bakes each drop icon with its tint.
   *
   * The world drop is a Pixi sprite with `tint`, which multiplies the texture's RGB. The
   * flying collect icon is a plain `<img>`, so using the raw file ignored the tint and the
   * gold drop - whose texture is a PURPLE orb - flew to the counter purple. Baking the
   * multiply into a canvas reproduces Pixi's tint exactly for the DOM.
   */
  async preloadDropIcons(): Promise<void> {
    for (const [key, art] of Object.entries(DROP_ART)) {
      try {
        const img = await loadImage(`art/${art.file}.png`);
        const c = document.createElement('canvas');
        c.width = img.naturalWidth;
        c.height = img.naturalHeight;
        const ctx = c.getContext('2d');
        if (!ctx) continue;
        ctx.drawImage(img, 0, 0);
        // Multiply the tint in, then restore the source's alpha.
        ctx.globalCompositeOperation = 'multiply';
        ctx.fillStyle = `#${(art.tint >>> 0).toString(16).padStart(6, '0')}`;
        ctx.fillRect(0, 0, c.width, c.height);
        ctx.globalCompositeOperation = 'destination-in';
        ctx.drawImage(img, 0, 0);
        this.dropIconUrls.set(key, c.toDataURL());
      } catch {
        /* a missing icon falls back to the raw file in `flyLoot` */
      }
    }
  }

  private readonly dropIconUrls = new Map<string, string>();

  /**
   * Flies a collected drop's icon from its world position to that currency's counter.
   *
   * Ported from `LootDropManager.PlayCollectAnimation_Internal`:
   *  - the path is a QUADRATIC BEZIER whose control point is the midpoint raised by
   *    `arcHeight` (150px), eased `InQuad`, over `duration * 0.9` (0.54s)
   *  - scale pops to `midScale` (1.3) over the first 10% with an `OutBack` overshoot, then
   *    shrinks to `endScale` (0.2)
   *  - it spins `rotationAmount` (720 degrees) over the move
   *  - it fades out over the last 30%
   *  - on arrival the target counter takes a `DOPunchScale` and the icon is destroyed
   */
  flyLoot(screenX: number, screenY: number, currency: string): void {
    const target = this.curEls.get(currency)?.root ?? this.goldText.parentElement;
    if (!target) return;
    const tRect = target.getBoundingClientRect();
    const el = document.createElement('img');
    el.className = 'loot-fly';
    el.src = this.dropIconUrls.get(currency) ?? `art/${(DROP_ART[currency] ?? DROP_ART.Gold).file}.png`;
    // Place it before it is inserted: `.loot-fly` is `position: fixed; left: 0; top: 0`,
    // so without this the icon shows for one frame in the top-left corner before
    // `stepFlyers` gives it its first real transform.
    el.style.transform =
      `translate(${screenX}px, ${screenY}px) translate(-50%, -50%) scale(1)`;
    this.root.appendChild(el);
    this.flyers.push({
      el,
      target,
      x0: screenX,
      y0: screenY,
      // Control point: midpoint raised by `arcHeight`.
      cx: (screenX + (tRect.left + tRect.width / 2)) / 2,
      cy: (screenY + (tRect.top + tRect.height / 2)) / 2 - LOOT_ARC_HEIGHT,
      x1: tRect.left + tRect.width / 2,
      y1: tRect.top + tRect.height / 2,
      t: 0,
    });
  }

  private stepFlyers(dt: number): void {
    for (let i = this.flyers.length - 1; i >= 0; i--) {
      const f = this.flyers[i];
      f.t += dt;
      // The 0.06s scale pop runs first; the move takes the remaining 0.54s.
      const popT = Math.min(1, f.t / LOOT_POP_SECONDS);
      const moveT = Math.min(1, Math.max(0, (f.t - LOOT_POP_SECONDS) / LOOT_MOVE_SECONDS));

      // OutBack overshoot on the pop, then InQuad down to endScale.
      const c1 = 1.70158;
      const c3 = c1 + 1;
      const pop = 1 + (LOOT_MID_SCALE - 1) * (1 + c3 * Math.pow(popT - 1, 3) + c1 * Math.pow(popT - 1, 2));
      const shrink = LOOT_MID_SCALE + (LOOT_END_SCALE - LOOT_MID_SCALE) * (moveT * moveT);
      const scale = f.t < LOOT_POP_SECONDS ? pop : shrink;

      // Quadratic Bezier, with the original's InQuad easing on the parameter.
      const u = moveT * moveT;
      const iu = 1 - u;
      const x = iu * iu * f.x0 + 2 * iu * u * f.cx + u * u * f.x1;
      const y = iu * iu * f.y0 + 2 * iu * u * f.cy + u * u * f.y1;

      f.el.style.transform =
        `translate(${x}px, ${y}px) translate(-50%, -50%) scale(${scale}) rotate(${u * LOOT_SPIN_DEG}deg)`;
      // Fade over the last 30% of the move.
      f.el.style.opacity = moveT > 0.7 ? String(1 - (moveT - 0.7) / 0.3) : '1';

      if (f.t >= LOOT_POP_SECONDS + LOOT_MOVE_SECONDS) {
        f.el.remove();
        this.flyers.splice(i, 1);
        this.punch(f.target);
      }
    }
  }

  /** `DOPunchScale(Vector3.one * 0.15f, 0.25f, 6, 0.5f)` on the target counter. */
  private punch(el: HTMLElement): void {
    for (const a of el.getAnimations()) a.cancel();
    el.animate(
      [
        { transform: 'scale(1)' },
        { transform: 'scale(1.15)' },
        { transform: 'scale(0.97)' },
        { transform: 'scale(1.04)' },
        { transform: 'scale(1)' },
      ],
      { duration: LOOT_PUNCH_SECONDS * 1000, easing: 'ease-out' },
    );
  }

  private readonly flyers: Array<{
    el: HTMLElement;
    target: HTMLElement;
    x0: number; y0: number;
    cx: number; cy: number;
    x1: number; y1: number;
    t: number;
  }> = [];

  update(snap: Snapshot, _skills: Skills, dt: number): void {
    this.stepFlyers(dt);
    const hpFrac = snap.playerMaxHp > 0 ? clamp(snap.playerHp / snap.playerMaxHp, 0, 1) : 0;
    this.hpFill.style.transform = `scaleX(${hpFrac})`;
    this.hpFill.style.background = hpFrac > 0.5 ? '#5bd97a' : hpFrac > 0.25 ? '#e8c341' : '#e05a4a';
    this.hpText.textContent = `${toReadable(Math.ceil(snap.playerHp))} / ${toReadable(Math.ceil(snap.playerMaxHp))}`;

    // Centre cluster mirrors the shipping HUD: the level, then a progress bar.
    // The bar tracks PLAYER experience: the original declares `PlayerExp` but never
    // writes it, so there was no curve to copy, and the monster-level bar it does
    // have moves too rarely to read as progress.
    this.levelText.textContent = t('playerLevel', { n: snap.playerLevel });
    this.expFill.style.transform = `scaleX(${snap.playerExpFraction})`;

    this.goldText.textContent = toReadable(snap.gold);
    this.gemText.textContent = toReadable(snap.gems);
    this.killText.textContent = toReadable(snap.kills);
    this.clearText.textContent = toReadable(snap.packsCleared);

    // Family currency counters, revealed the first time that purse is filled - the
    // original's `playerData.WasCurrencyShownBefore` gate. Before that the counters would
    // be five permanent zeroes cluttering the bar.
    for (const [key, el2] of this.curEls) {
      const seen = snap.currencySeen?.[key] === true;
      el2.root.hidden = !seen;
      if (seen) el2.val.textContent = toReadable(snap.currencies?.[key] ?? 0);
    }

    // `playerData.PlayerPortalCurrency`, revealed by the same `WasCurrencyShownBefore`
    // gate. It is not a monster family - the run portal pays it, once per battle level -
    // so it has its own counter rather than a slot in the family row.
    this.portalCurEl.hidden = snap.portalCurrencySeen !== true;
    if (snap.portalCurrencySeen) {
      this.portalCurVal.textContent = toReadable(snap.portalCurrency);
    }

    // Magazine dial, mirroring `MouseAttacker`: the count in the middle and a radial
    // ring showing how far the NEXT arrow is. The original draws exactly this on
    // `CooldownImage.fillAmount`, and the count is coloured by scarcity the way
    // `GetMagazineBaseColor` does - red at zero, amber at or below 30%.
    this.magCount.textContent = String(snap.magazine);
    const regen = snap.magazine >= snap.magazineSize ? 1 : snap.magazineRegenFraction;
    this.magProgress.style.strokeDashoffset = String(this.magRingLength * (1 - regen));
    const ratio = snap.magazineSize > 0 ? snap.magazine / snap.magazineSize : 0;
    this.magCount.classList.toggle('full', snap.magazine >= snap.magazineSize);
    this.magCount.classList.toggle('low', snap.magazine > 0 && ratio <= 0.3);
    this.magCount.classList.toggle('empty', snap.magazine === 0);

    // Portal: dormant until the packs are down, then the summon countdown,
    // then its health bar once the extra wave is out.
    if (snap.portalActive) {
      this.portalBar.classList.remove('hidden');
      if (snap.portalPhase === 'summoning') {
        this.portalFill.classList.add('summoning');
        // Track the peak so the bar fills as the countdown runs down.
        if (snap.portalSummon > this.portalSummonTotal) this.portalSummonTotal = snap.portalSummon;
        const total = this.portalSummonTotal > 0 ? this.portalSummonTotal : 1;
        const frac = clamp(snap.portalSummon / total, 0, 1);
        this.portalFill.style.transform = `scaleX(${frac})`;
        this.portalText.textContent = t('portalSummoning', { s: Math.ceil(snap.portalSummon) });
      } else {
        this.portalFill.classList.remove('summoning');
        this.portalSummonTotal = 0;
        const pf = snap.portalMaxHp > 0 ? clamp(snap.portalHp / snap.portalMaxHp, 0, 1) : 0;
        this.portalFill.style.transform = `scaleX(${pf})`;
        this.portalText.textContent = `${toReadable(Math.ceil(snap.portalHp))} / ${toReadable(Math.ceil(snap.portalMaxHp))}`;
      }
    } else {
      this.portalBar.classList.add('hidden');
    }


    // Death fade.
    this.flash.style.opacity = String(snap.deathFade * 0.7);

    void dt;
  }

  /** Shows a transient message (level cleared, death, ...). */
  showToast(text: string, ms = 1600): void {
    this.toast.textContent = text;
    this.toast.classList.remove('hidden');
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => {
      this.toast.classList.remove('show');
      this.toast.classList.add('hidden');
    }, ms);
  }

  private toastTimer = 0;
  /** Stroke length of the cooldown ring, cached from its radius. */
  private magRingLength = 0;

  /** Spawns a floating damage number; pooled to keep GC quiet. */
  float(worldX: number, worldY: number, value: number, crit: boolean): void {
    const p = this.toScreen(worldX, worldY);
    let node = this.pool[this.poolUsed];
    if (!node) {
      node = el('div', 'floater');
      this.root.appendChild(node);
      this.pool[this.poolUsed] = node;
    }
    this.poolUsed++;
    node.textContent = crit ? `${toReadable(value)}!` : toReadable(value);
    node.className = crit ? 'floater crit' : 'floater';
    node.style.left = `${p.x}px`;
    node.style.top = `${p.y}px`;
    // Restart the CSS animation by forcing a reflow.
    node.style.animation = 'none';
    void node.offsetHeight;
    node.style.animation = '';
    node.style.opacity = '1';
  }

  /**
   * Shows a transient banner naming the skill that was just cast.
   *
   * A skill whose target is off-screen previously produced no feedback at all, so
   * the button read as broken. The banner plus the button's own flash makes the
   * activation unmistakable regardless of where the arrows land.
   */
  announceSkill(label: string, buff: boolean): void {
    const node = el('div', buff ? 'skill-banner buff' : 'skill-banner');
    node.textContent = label;
    this.root.appendChild(node);
    window.setTimeout(() => node.remove(), 900);
  }

  /** Rings the skill button so the press is acknowledged even on a miss. */

  /**
   * Quick expanding ring where an arrow landed. Purely presentational, and the
   * only cue that a tap registered when the aim point is off-screen.
   */
  impactScreen(screenX: number, screenY: number, missed: boolean): void {
    const node = el('div', missed ? 'impact-ring miss' : 'impact-ring');
    node.style.left = `${screenX}px`;
    node.style.top = `${screenY}px`;
    this.root.appendChild(node);
    window.setTimeout(() => node.remove(), 420);
  }

  /**
   * Feedback for a tap the simulation refused because the magazine was empty.
   *
   * Without this the arrow-fall simply did not happen and the tap looked ignored -
   * the magazine regenerates at 0.4s per arrow while a player can tap far faster,
   * so refusals are common rather than exceptional.
   */
  outOfArrows(): void {
    const mag = this.root.querySelector('.mag');
    if (mag) {
      mag.classList.remove('empty');
      void (mag as HTMLElement).offsetWidth;
      mag.classList.add('empty');
      window.setTimeout(() => mag.classList.remove('empty'), 380);
    }
    const node = el('div', 'no-arrows');
    node.textContent = t('noArrows');
    this.root.appendChild(node);
    window.setTimeout(() => node.remove(), 640);
  }

  /** Call once per frame after all `float` calls. */
  endFrame(): void {    for (let i = this.poolUsed; i < this.pool.length; i++) {
      this.pool[i].style.opacity = '0';
    }
    this.poolUsed = 0;
  }

  destroy(): void {
    this.root.remove();
  }
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] {
  const d = document.createElement(tag);
  d.className = className;
  return d;
}

function q<T extends Element>(root: Element, sel: string): T {
  const found = root.querySelector(sel);
  if (!found) throw new Error(`HUD element missing: ${sel}`);
  return found as T;
}


