/**
 * The jobs screen, a port of `JobsUIManager`.
 *
 * Rebuilt from the original's own layout, which is a ROW OF FIVE JOB CARDS rather than a
 * tab strip. Each card is, top to bottom:
 *
 *   - the job name (`JobsTitleTexts[whichJob]`, or `? ? ?` while locked)
 *   - the character's portrait for that job (`JobsIconImages`; the build ships `Job1`..
 *     `Job5` as 320x424 sprites, one per job)
 *   - a banner carrying the job's passive (`JobsBonusImages` + `Job{n}_Bonus_Text`)
 *   - a row of THREE skill slots (`SkillsParents[whichJob]`), each drawn as an inset icon
 *     panel over a darker price/cooldown bar
 *   - either the unlock button with `JobInfo.UnlockCost`, or a padlock
 *
 * The important correction: **the skills live inside the job card**, which is what
 * `SkillsParents[whichJob]` means. They are NOT a fixed corner bar, and they are not
 * clickable in the original — every skill is fired automatically by `CharacterAttacker`.
 * The slot is a PURCHASE control; in a run its lower bar carries the cooldown.
 */

import { JOBS, JOB_SKILLS } from '../content/jobData.js';
import type { JobDef, JobSkillDef } from '../content/jobData.js';
import type { Jobs } from '../game/jobs.js';
import type { Skills } from '../game/skills.js';

const ART = 'art/skills/';

/** The five portrait sprites, `Job1`..`Job5`, exported from the shipping build. */
// `Job1`..`Job5` are the card FRAMES (each 320x424 with a portrait well and a passive
// well); the portraits are `Archer_1`..`Archer_5`, the five outfit skins.
const CARD_ART = ['job_card_0', 'job_card_1', 'job_card_2', 'job_card_3', 'job_card_4'];

export interface JobsCallbacks {
  /** Buy job `index`. Returns true when it went through. */
  onUnlockJob: (index: number) => boolean;
  /** Buy one level of `job`'s skill in `slot`. Returns true when it went through. */
  onLevelUpSkill: (job: number, slot: number) => boolean;
}

interface SkillView {
  root: HTMLButtonElement;
  img: HTMLImageElement;
  lv: HTMLElement;
  cost: HTMLElement;
  lock: HTMLElement;
  cd: HTMLElement;
  cdFill: HTMLElement;
  cdText: HTMLElement;
}

interface CardView {
  root: HTMLElement;
  title: HTMLElement;
  portrait: HTMLImageElement;
  lock: HTMLElement;
  passive: HTMLElement;
  unlock: HTMLButtonElement;
  unlockCost: HTMLElement;
  skills: HTMLElement;
}

export class JobsPanel {
  readonly root: HTMLElement;
  private readonly cards: CardView[] = [];
  private readonly skillViews = new Map<string, SkillView>();
  private readonly head: HTMLElement;
  private lastJobs: Jobs | null = null;
  private claw = 0;

  constructor(
    parent: HTMLElement,
    private readonly cb: JobsCallbacks,
  ) {
    this.root = document.createElement('div');
    this.root.className = 'jobs hidden';
    this.root.innerHTML = `
      <div class="jobs-head">
        <span class="jobs-title">职业</span>
        <span class="jobs-progress"></span>
      </div>
      <div class="jobs-cards"></div>
    `;
    parent.appendChild(this.root);
    this.head = this.root.querySelector('.jobs-progress') as HTMLElement;
    const host = this.root.querySelector('.jobs-cards') as HTMLElement;

    JOBS.forEach((job, i) => {
      const card = document.createElement('div');
      card.className = 'job-card';
      card.dataset.job = String(job.index);
      card.dataset.state = 'locked';
      card.innerHTML = `
        <div class="jc-title"></div>
        <img class="jc-frame" alt="" src="art/${CARD_ART[i] ?? CARD_ART[0]}.png">
        <div class="jc-portrait">
          <img class="jc-portrait-img" alt="" src="art/Archer_${i + 1}.png">
          <img class="jc-lock" alt="" src="art/ui_lock.png">
        </div>
        <div class="jc-passive"></div>
        <div class="jc-skills"></div>
        <button class="jc-unlock" type="button">
          <span class="jc-unlock-label">解锁</span><span class="jc-unlock-cost"></span>
        </button>
      `;
      const skillsHost = card.querySelector('.jc-skills') as HTMLElement;
      for (const id of job.skills) {
        const d = JOB_SKILLS[id];
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'job-skill';
        btn.dataset.id = id;
        btn.dataset.job = String(job.index);
        btn.dataset.slot = String(d.slot);
        btn.innerHTML = `
          <span class="js-icon-box"><img class="js-icon" alt="" src="${ART}${d.icon}"></span>
          <span class="js-cd" hidden><span class="js-cd-fill"></span><span class="js-cd-text"></span></span>
          <span class="js-lv"></span>
          <span class="js-cost"></span>
          <span class="js-lock">🔒</span>
        `;
        btn.addEventListener('click', () => {
          if (this.cb.onLevelUpSkill(job.index, d.slot) && this.lastJobs) {
            this.refresh(this.lastJobs, this.claw);
          }
        });
        skillsHost.appendChild(btn);
        this.skillViews.set(id, {
          root: btn,
          img: btn.querySelector('.js-icon') as HTMLImageElement,
          lv: btn.querySelector('.js-lv') as HTMLElement,
          cost: btn.querySelector('.js-cost') as HTMLElement,
          lock: btn.querySelector('.js-lock') as HTMLElement,
          cd: btn.querySelector('.js-cd') as HTMLElement,
          cdFill: btn.querySelector('.js-cd-fill') as HTMLElement,
          cdText: btn.querySelector('.js-cd-text') as HTMLElement,
        });
      }

      const unlock = card.querySelector('.jc-unlock') as HTMLButtonElement;
      unlock.addEventListener('click', () => {
        if (this.cb.onUnlockJob(job.index) && this.lastJobs) {
          this.refresh(this.lastJobs, this.claw);
        }
      });

      host.appendChild(card);
      this.cards.push({
        root: card,
        title: card.querySelector('.jc-title') as HTMLElement,
        portrait: card.querySelector('.jc-portrait-img') as HTMLImageElement,
        lock: card.querySelector('.jc-lock') as HTMLElement,
        passive: card.querySelector('.jc-passive') as HTMLElement,
        unlock,
        unlockCost: card.querySelector('.jc-unlock-cost') as HTMLElement,
        skills: skillsHost,
      });
    });

    this.root.dataset.jobs = String(JOBS.length);
    this.root.dataset.skills = String(Object.keys(JOB_SKILLS).length);
  }

  /** The claw price, rendered the way the card does: the orb comes from CSS, not text. */
  private priceText(def: JobSkillDef, level: number): string {
    return String(def.cost[Math.max(0, Math.min(level, def.cost.length - 1))] ?? 0);
  }

  refresh(jobs: Jobs, claw: number): void {
    this.lastJobs = jobs;
    this.claw = claw;

    for (let i = 0; i < JOBS.length; i++) {
      const job: JobDef = JOBS[i];
      const view = this.cards[i];
      const unlocked = jobs.unlocked[job.index];
      const unlockable = jobs.canShowUnlock(job.index);
      view.root.dataset.state = unlocked ? 'unlocked' : unlockable ? 'unlockable' : 'locked';

      // `? ? ?` while locked, exactly as `JobsUIManager` writes it.
      view.title.textContent = unlocked ? job.titleZh : '? ? ?';
      view.portrait.style.filter = unlocked ? 'none' : 'brightness(0.25) grayscale(1)';
      view.portrait.style.opacity = unlocked ? '1' : '0.75';
      view.lock.hidden = !unlockable ? unlocked : true;
      view.lock.hidden = unlocked || unlockable;

      if (unlocked) {
        view.passive.textContent = `${job.passiveTitleZh}：${job.passiveDescZh}`;
        view.passive.dataset.state = 'on';
      } else if (unlockable) {
        view.passive.textContent = '解锁后获得该职业的被动与技能';
        view.passive.dataset.state = 'off';
      } else {
        view.passive.textContent = '需要先解锁前一个职业';
        view.passive.dataset.state = 'off';
      }

      view.unlock.hidden = !unlockable;
      if (unlockable) {
        view.unlockCost.textContent = String(job.unlockCost);
        view.unlock.classList.toggle('affordable', claw >= job.unlockCost);
      }

      // Only the unlocked card shows its slots; the rest keep their padlock.
      view.skills.hidden = !unlocked;
      for (const id of job.skills) {
        const sv = this.skillViews.get(id);
        if (!sv) continue;
        const d = JOB_SKILLS[id];
        const level = jobs.level(id);
        const maxed = jobs.isMaxed(id);
        const buyable = jobs.skillPurchasable(job.index, d.slot);
        // Hide the slot itself, not just the container: a locked card's slots must read
        // as hidden to anything inspecting the DOM, not merely be clipped.
        sv.root.hidden = !unlocked;
        sv.root.dataset.level = String(level);
        sv.root.classList.toggle('maxed', maxed);
        sv.root.classList.toggle('locked', !buyable && !maxed);
        sv.root.classList.toggle('affordable', buyable && claw >= jobs.skillCost(id));
        sv.lv.textContent = level > 0 ? String(level) : '';
        // The original's slot bar shows the price while it can still be bought, then
        // `MaxLevel_Text` once it is done.
        sv.cost.textContent = maxed ? '最大' : buyable ? this.priceText(d, level) : '';
        sv.lock.hidden = buyable || maxed;
      }
    }

    const unlockedCount = jobs.unlocked.filter(Boolean).length;
    this.head.textContent = `已解锁 ${unlockedCount}/${JOBS.length} · 技能总等级 ${jobs.totalLevels()}`;
  }

  /**
   * Per-frame cooldown readout on each skill slot.
   *
   * `JobsUIManager` drives a `CooldownImage.fillAmount` plus a seconds label per skill, so
   * the player reads what is ready while looking at the character - which is why the
   * skills belong on this page rather than in a corner bar.
   */
  updateCooldowns(skills: Skills): void {
    for (const [id, view] of this.skillViews) {
      if (view.root.hidden || view.cd === null) continue;
      const r = skills.get(id);
      if (!r) continue;
      const cd = skills.cooldownFor(id);
      const owned = skills.owned().includes(id);
      const left = r.cooldownLeft;
      const show = owned && cd > 0 && left > 0;
      view.cd.hidden = !show;
      if (!show) continue;
      view.cdFill.style.transform = `scaleX(${Math.max(0, Math.min(1, left / cd))})`;
      view.cdText.textContent = left >= 10 ? String(Math.ceil(left)) : left.toFixed(1);
    }
  }

  setVisible(on: boolean): void {
    this.root.classList.toggle('hidden', !on);
    if (on && this.lastJobs) this.refresh(this.lastJobs, this.claw);
  }

  get visible(): boolean {
    return !this.root.classList.contains('hidden');
  }
}
