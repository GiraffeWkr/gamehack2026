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
/** Hard cap for the floating-damage pool; a burst beyond this reuses the oldest node. */
const MAX_FLOATERS = 48;

/** Chinese labels for the stats panel; unknown keys fall back to their English name. */
const STAT_LABELS: Record<string, string> = {
  Damage: '伤害',
  Health: '生命值',
  AttackRange: '攻击范围',
  PlayerMovementSpeed: '移动速度',
  PlayerAttackSpeed: '攻击速度',
  CriticalChance: '暴击率',
  CriticalMultiplier: '暴击伤害',
  HealthRegen: '生命恢复',
  GoldGained: '金币获取',
  ExpGained: '经验获取',
  DamageReduction: '伤害减免',
  DodgeChance: '闪避率',
  ChanceForDoubleDamage: '双倍伤害概率',
  ChanceForTripleDamage: '三倍伤害概率',
  MouseMagazineSize: '箭雨容量',
  MouseMagazineRegenTime: '箭雨装填时间',
  NumberOfMouseProjectiles: '箭雨箭矢数量',
  MouseNumberOfHits: '箭雨命中次数',
  MouseMaxNumberOfEnemies: '箭雨目标上限',
  MouseChanceForAnotherHit: '额外命中概率',
  Multishot_NumberOfProjectiles: '多重射击箭数',
  Multishot_NumberOfHits: '多重射击命中',
  Multishot_Cooldown: '多重射击冷却',
  BombArrow_RadiusOfEffect: '爆裂箭范围',
  SniperScope_RadiusOfEffect: '狙击范围',
  BatSwarm_RadiusOfEffect: '蝙蝠群范围',
  FireArea_RadiusOfEffect: '火海范围',
  Blizzard_RadiusOfEffect: '暴风雪范围',
  Blizzard_SlowPercent: '暴风雪减速',
  SuperNova_ExecuteThreshold: '超新星处决阈值',
  EnemyHealthMultiplier: '敌方生命倍率',
  EnemyDamageMultiplier: '敌方伤害倍率',
  EnemyMovementSpeedMultiplier: '敌方移速倍率',
  EnemyAttackSpeedMultiplier: '敌方攻速倍率',
  ExplosiveArrows: '爆炸箭概率',
  ExplosiveArrows_RadiusOfEffect: '爆炸箭范围',
  ChanceToDropHealthPotion: '血瓶掉落概率',
  HealthPotionRegenPercentage: '血瓶回复比例',
  GoldCoinsToDrop: '金币掉落数',
  GoldChanceToDrop: '金币掉落概率',
  GoldenRewardMultiplier: '金色敌人奖励倍率',
  ChanceForGoldenEnemy: '金色敌人概率',
  UnlockGoldenEnemies: '金色敌人解锁',
  FirstPacksAlwaysContainGolden: '首波必出金色',
  ChanceToTameEnemiesOnDeath: '驯服概率',
  MaxTames: '驯服上限',
  PetDamageMultiplier: '宠物伤害倍率',
  PetHealthMultiplier: '宠物生命倍率',
  TameDamageMultiplier: '驯服宠物伤害',
  TameHealthMultiplier: '驯服宠物生命',
  ChanceToFreeSkillFromCooldown: '技能冷却重置概率',
  HealthRestorePercentOnKill: '击杀回血',
  CriticalPierceChance: '暴击贯穿概率',
  WormholeShotChance: '虫洞射击概率',
  ChanceToSpawnChest: '宝箱生成概率',
  ChanceToSpawnOrb: '法球生成概率',
  ChestLootBonus: '宝箱奖励加成',
  GuaranteeMonsterCurrencyDrop: '保底货币掉落',
  MouseChanceToFireSkills: '箭雨触发技能概率',
  SkillsCooldownSpeed: '技能冷却速度',
  Skills_DamageMultiplier: '技能伤害倍率',
  PortalSummonTime: '传送门召唤时间',
  PortalHealthMultiplier: '传送门生命倍率',
  PortalPackCurrencyBonus: '传送门通货加成',
};

/** Escapes a display string before it goes into an `innerHTML` row. */
function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) =>
    c === '&' ? '&amp;' : c === '<' ? '&lt;' : c === '>' ? '&gt;' : c === '"' ? '&quot;' : '&#39;');
}

export interface HudCallbacks {
  /**
   * Fired by the top-right reset button. The HUD itself never touches storage or reloads;
   * the caller (main.ts) clears the save and reloads.
   */
  onReset?: () => void;
}


export class Hud {
  private readonly root: HTMLDivElement;
  private readonly hpFill: HTMLDivElement;
  private readonly hpText: HTMLDivElement;
  private readonly levelText: HTMLDivElement;
  private readonly stageText: HTMLDivElement;
  private readonly expFill: HTMLDivElement;
  private readonly goldText: HTMLSpanElement;
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
  private readonly statsPanel: HTMLDivElement;
  private readonly statsBody: HTMLDivElement;
  private statsOpen = false;

  // Floating damage numbers, pooled so a burst does not allocate.
  private readonly pool: HTMLDivElement[] = [];
  private poolUsed = 0;

  /** Longest summon countdown seen, so the bar can show progress inward. */
  private portalSummonTotal = 0;

  constructor(
    parent: HTMLElement,
    toScreen: (x: number, y: number) => { x: number; y: number },
    private readonly callbacks: HudCallbacks = {},
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
          <div class="stage-text"></div>
          <div class="progress hint-exp"><div class="progress-fill exp-fill"></div></div>
        </div>
        <div class="hud-right">
          <button type="button" class="stats-btn" title="查看属性"></button>
          <button type="button" class="reset-btn" title="重置所有进度"></button>
        </div>
      </div>

      <div class="stats-panel hidden">
        <div class="stats-head">
          <span>属性</span>
        </div>
        <div class="stats-body"></div>
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
    this.stageText = q(this.root, '.stage-text');
    this.expFill = q(this.root, '.exp-fill');
    this.goldText = q(this.root, '.gold-text');
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

    // Reset: the caller clears the save and reloads. Confirmed before wiping so a
    // stray tap on a run cannot throw progress away.
    const resetBtn = q<HTMLButtonElement>(this.root, '.reset-btn');
    resetBtn.textContent = '↻';
    resetBtn.addEventListener('click', () => {
      const go = window.confirm('重置所有进度？此操作不可撤销。');
      if (go) this.callbacks.onReset?.();
    });

    // Stats: a floating read-only panel of every current stat, styled like the lower
    // band panels. The ≡ button toggles it; clicking ANYWHERE outside the panel closes
    // it (there is deliberately no ✕ — the button and the backdrop are the only ways out).
    this.statsPanel = q(this.root, '.stats-panel');
    this.statsBody = q(this.root, '.stats-body');
    const statsBtn = q<HTMLButtonElement>(this.root, '.stats-btn');
    statsBtn.textContent = '≡';
    statsBtn.addEventListener('click', (ev) => {
      ev.stopPropagation();
      this.setStatsOpen(!this.statsOpen);
    });
    document.addEventListener('click', (ev) => {
      if (!this.statsOpen) return;
      const t = ev.target as Node;
      if (!this.statsPanel.contains(t) && t !== statsBtn) this.setStatsOpen(false);
    });
  }

  /** Toggles the floating stats panel. */
  setStatsOpen(on: boolean): void {
    this.statsOpen = on;
    this.statsPanel.classList.toggle('hidden', !on);
  }

  /**
   * Fills the stats panel from the game's current StatBag. Call at a low frequency
   * (the values only change on purchase / buff ticks).
   *
   * The DOM is only rewritten when the VALUES change: rebuilding `innerHTML` every
   * tick reset the panel's scroll position, so a wheel/touch scroll was yanked back
   * to the top within 0.25s and the panel read as "cannot scroll".
   */
  private statsSig = '';
  setStats(entries: Array<[string, number]>): void {
    if (!this.statsOpen) return;
    const sig = entries.map(([k, v]) => `${k}:${v}`).join('|');
    if (sig === this.statsSig) return;
    this.statsSig = sig;
    const rows = entries
      .map(([key, value]) => {
        const label = STAT_LABELS[key] ?? key;
        return `<div class="stats-row"><span>${escapeHtml(label)}</span><span>${toReadable(value)}</span></div>`;
      })
      .join('');
    this.statsBody.innerHTML = rows || '<div class="stats-empty">暂无属性</div>';
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

    // Centre cluster: the run's stage and the player's level share the top line
    // (`第 N 关 · 等级 M`), with the pack progress underneath — the level icon that
    // used to sit in the left resource row is gone, so the stage number moves here.
    // The bar below still tracks PLAYER experience: the original declares `PlayerExp`
    // but never writes it, so there was no curve to copy, and the monster-level bar
    // it does have moves too rarely to read as progress.
    this.levelText.textContent = `${t('level', { n: snap.level })} · ${t('playerLevel', { n: snap.playerLevel })}`;
    this.stageText.textContent = t('packs', { done: snap.packsCleared, total: snap.packsTotal });
    this.expFill.style.transform = `scaleX(${snap.playerExpFraction})`;

    this.goldText.textContent = toReadable(snap.gold);

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

  /**
   * Spawns a floating damage number; pooled to keep GC quiet.
   *
   * The pool is capped: past `MAX_FLOATERS` a fresh number reuses the oldest node
   * instead of growing the DOM forever, which a dense AOE burst (e.g. SuperNova)
   * could otherwise do across frames.
   */
  float(worldX: number, worldY: number, value: number, crit: boolean): void {
    const p = this.toScreen(worldX, worldY);
    if (this.poolUsed >= MAX_FLOATERS) {
      const reused = this.pool[this.poolUsed % MAX_FLOATERS];
      this.poolUsed++;
      reused.textContent = crit ? `${toReadable(value)}!` : toReadable(value);
      reused.className = crit ? 'floater crit' : 'floater';
      reused.style.left = `${p.x}px`;
      reused.style.top = `${p.y}px`;
      void reused.offsetHeight;
      reused.style.opacity = '1';
      return;
    }
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
  endFrame(): void {
    const used = Math.min(this.poolUsed, MAX_FLOATERS);
    for (let i = used; i < this.pool.length; i++) {
      this.pool[i].style.opacity = '0';
    }
    this.poolUsed = 0;
  }

  destroy(): void {
    window.clearTimeout(this.toastTimer);
    this.root.remove();
  }

  /**
   * The lower band's panels cover the bottom strip; the HUD bottom bar (magazine dial)
   * must yield while one is open or it swallows clicks/hovers on the nodes beneath it
   * (the HUD stacks at z-index 10, above the panels' 8).
   */
  setBandOpen(on: boolean): void {
    this.root.classList.toggle('band-open', on);
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


