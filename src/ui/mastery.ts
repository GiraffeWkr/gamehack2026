/**
 * The mastery screen, a port of `MasteryUIManager`.
 *
 * Two rows, matching the original's layout: the NPC's own level track at the top (paid in
 * BatCurrency, one unlock per level) and the nine mastery tiles below it.
 *
 * Tile states, straight out of `MasteryUIManager`:
 *
 * | state | condition | what shows |
 * |---|---|---|
 * | locked | no `UnlockMastery<n>` yet | a padlock instead of the icon |
 * | maxed | `level >= maxLevel` | 最大 |
 * | pinnacle | `IsPinnacle` | a Prime button, never a level-up |
 * | levellable | unlocked and short of the cap | the level, the cost, a Level Up button |
 *
 * The Awaken button appears on every non-pinnacle tile once the NPC has handed out
 * `UnlockAwakening`, and needs the mastery at its `AwakenRequiredLevel` first.
 */

import {
  MASTERIES,
  MASTERY_REWARDS,
  MASTERY_TEXT,
  NPC_LEVEL_COST,
  NPC_MAX_LEVEL,
  awakenCost,
  levelUpCost,
} from '../game/mastery.js';
import type { Mastery } from '../game/mastery.js';

const ART = 'art/mastery/';

export interface MasteryCallbacks {
  onLevelNpc: () => boolean;
  onLevelMastery: (index: number) => boolean;
  onAwaken: (index: number) => boolean;
  onPrime: (index: number, legendary: boolean) => boolean;
}

interface Tile {
  root: HTMLElement;
  name: HTMLElement;
  icon: HTMLImageElement;
  lock: HTMLElement;
  lv: HTMLElement;
  stat: HTMLElement;
  cost: HTMLElement;
  levelBtn: HTMLButtonElement;
  awakenBtn: HTMLButtonElement;
}

export class MasteryPanel {
  readonly root: HTMLElement;
  private readonly tiles = new Map<number, Tile>();
  private readonly npcCostEl: HTMLElement;
  private readonly npcLevelEl: HTMLElement;
  private readonly npcBtn: HTMLButtonElement;
  private readonly rewardsEl: HTMLElement;
  private readonly headEl: HTMLElement;
  private last: Mastery | null = null;
  private bat = 0;

  constructor(
    parent: HTMLElement,
    private readonly cb: MasteryCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'mastery hidden';
    this.root.innerHTML = `
      <div class="mastery-head">
        <span class="mastery-title">精通</span>
        <span class="mastery-progress"></span>
        <span class="mastery-hint">点击 升级 / 觉醒 / 铭刻</span>
        <button class="mastery-close" type="button" aria-label="关闭">✕</button>
      </div>
      <div class="mastery-npc">
        <span class="npc-name"></span>
        <span class="npc-level"></span>
        <button class="npc-levelup" type="button">
          <span class="npc-btn-label">升级</span>
          <span class="npc-cost"></span>
        </button>
      </div>
      <div class="mastery-rewards"></div>
      <div class="mastery-tiles"></div>
    `;
    parent.appendChild(this.root);
    (this.root.querySelector('.mastery-close') as HTMLButtonElement)
      .addEventListener('click', () => this.setVisible(false));

    this.npcCostEl = this.root.querySelector('.npc-cost') as HTMLElement;
    this.npcLevelEl = this.root.querySelector('.npc-level') as HTMLElement;
    this.rewardsEl = this.root.querySelector('.mastery-rewards') as HTMLElement;
    this.headEl = this.root.querySelector('.mastery-progress') as HTMLElement;
    this.npcBtn = this.root.querySelector('.npc-levelup') as HTMLButtonElement;
    this.npcBtn.addEventListener('click', () => {
      if (this.cb.onLevelNpc() && this.last) this.refresh(this.last, this.bat);
    });

    const host = this.root.querySelector('.mastery-tiles') as HTMLElement;
    for (const def of MASTERIES) {
      const el = document.createElement('div');
      el.className = 'mastery-tile';
      el.dataset.index = String(def.index);
      el.innerHTML = `
        <img class="mt-icon" alt="" src="${ART}${def.icon}">
        <span class="mt-lock">🔒</span>
        <span class="mt-name"></span>
        <span class="mt-lv"></span>
        <span class="mt-stat"></span>
        <span class="mt-cost"></span>
        <button class="mt-level" type="button">升级</button>
        <button class="mt-awaken" type="button"></button>
      `;
      const levelBtn = el.querySelector('.mt-level') as HTMLButtonElement;
      const awakenBtn = el.querySelector('.mt-awaken') as HTMLButtonElement;
      levelBtn.addEventListener('click', () => {
        if (this.cb.onLevelMastery(def.index) && this.last) this.refresh(this.last, this.bat);
      });
      awakenBtn.addEventListener('click', () => {
        if (this.cb.onAwaken(def.index) && this.last) this.refresh(this.last, this.bat);
      });
      host.appendChild(el);
      this.tiles.set(def.index, {
        root: el,
        name: el.querySelector('.mt-name') as HTMLElement,
        icon: el.querySelector('.mt-icon') as HTMLImageElement,
        lock: el.querySelector('.mt-lock') as HTMLElement,
        lv: el.querySelector('.mt-lv') as HTMLElement,
        stat: el.querySelector('.mt-stat') as HTMLElement,
        cost: el.querySelector('.mt-cost') as HTMLElement,
        levelBtn,
        awakenBtn,
      });
    }

    this.root.dataset.tiles = String(MASTERIES.length);
  }

  refresh(m: Mastery, bat: number): void {
    this.last = m;
    this.bat = bat;

    this.npcLevelEl.textContent = `等级 ${m.npcLevel} / ${NPC_MAX_LEVEL}`;
    const npcCost = m.npcCost();
    this.npcCostEl.textContent = m.npcMaxed ? '最大' : `蝠币 ${npcCost.toLocaleString('en-US')}`;
    this.npcBtn.disabled = m.npcMaxed;
    this.npcBtn.classList.toggle('affordable', m.canLevelNpc(bat));

    // The reward track: one unlock per NPC level, in `MasteryRewards` order.
    this.rewardsEl.replaceChildren();
    for (const r of MASTERY_REWARDS) {
      const chip = document.createElement('span');
      const got = m.hasReward(r.npcLevel);
      chip.className = `mr-chip${got ? ' got' : ''}`;
      chip.dataset.level = String(r.npcLevel);
      chip.textContent = got ? r.textZh : `Lv${r.npcLevel}`;
      this.rewardsEl.appendChild(chip);
    }

    for (const def of MASTERIES) {
      const t = this.tiles.get(def.index);
      if (!t) continue;
      const unlocked = m.isUnlocked(def.index);
      const lvl = m.level(def.id);
      const maxed = m.isMaxLevel(def);
      const awakened = m.isAwakened(def.id);
      const cost = levelUpCost(def, lvl);

      t.root.dataset.state = !unlocked ? 'locked'
        : def.isPinnacle ? 'pinnacle'
          : maxed ? 'maxed' : 'open';
      t.root.dataset.level = String(lvl);
      t.lock.hidden = unlocked;
      t.icon.hidden = !unlocked;
      t.name.textContent = def.nameZh || def.nameEn;
      t.lv.textContent = unlocked ? `${lvl}/${m.maxLevel(def)}` : '';
      t.stat.textContent = def.isPinnacle
        ? (def.pinnacleDesc1Zh || '铭刻')
        : `${def.mainValueEquation}${def.mainSuffix}`;
      t.cost.textContent = !unlocked || def.isPinnacle || maxed
        ? '' : `蝠币 ${cost.toLocaleString('en-US')}`;

      t.levelBtn.hidden = !unlocked || def.isPinnacle || maxed;
      t.levelBtn.classList.toggle('affordable', unlocked && m.canLevel(def, bat));
      t.awakenBtn.hidden = def.isPinnacle || !unlocked || awakened;
      t.awakenBtn.disabled = !m.canAwaken(def, bat);
      t.awakenBtn.classList.toggle('affordable', m.canAwaken(def, bat));
      t.awakenBtn.textContent = awakened
        ? MASTERY_TEXT.awakened
        : `${MASTERY_TEXT.awaken} ${awakenCost(def, m.awakenedCount).toLocaleString('en-US')}`;
      if (awakened) {
        t.awakenBtn.hidden = false;
        t.awakenBtn.disabled = true;
      }
    }

    this.headEl.textContent =
      `已觉醒 ${m.awakenedCount} · 精通总等级 ${m.totalLevels()} · 铭刻充能 ${m.totalCharges}`;
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (on && this.last) this.refresh(this.last, this.bat);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }
}

export { NPC_LEVEL_COST };
