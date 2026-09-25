/**
 * Jobs and skill levels, ported from `JobsUIManager` + `JobInfo` + `JobSkillInfo`.
 *
 * The original's model, reproduced exactly:
 *
 * - **Five jobs, unlocked strictly in order.** Job 0 is free and pre-applied at new-game
 *   (`DatabaseManager.cs:1360-1361`); job *i* shows its unlock button only once *i-1* is
 *   unlocked (`JobsUIManager.cs:222`), and costs `JobInfo.UnlockCost` in ClawCurrency.
 * - **Unlocking applies a passive** through `JobInfo.ApplyPassiveBonus`, which is one
 *   `ChangeAStat(PassiveStat.VariableName, PassiveStat.StatsProp, PassiveValue, isAdd)`.
 * - **Skill *i* in a job is purchasable when** `i == 0 || thisLevel > 0 || prevLevel > 0`,
 *   and its price is `cost[currentLevel]` — indexed by the level you are ON, so the first
 *   purchase reads `cost[0]` (`JobsUIManager.cs:201,217,253`).
 * - **Levelling writes deltas into the stat bag**, not the level itself: for each per-level
 *   curve, `delta = curve(newLevel) - curve(max(oldLevel, 1))` is added to
 *   `<skillNameInStatsData>_<Suffix>` (`JobsUIManager.cs:267-333`). `GetXForLevel` clamps
 *   its index, so a short curve plateaus.
 * - **Passive skills are the exception**: instead of a delta they add
 *   `Evaluate(passiveEffectValueEquation, newLevel)` outright, so the total after *n*
 *   levels is `f(1) + f(2) + ... + f(n)` (`JobsUIManager.cs:259-264`).
 *
 * `applyTo` replays all of that onto a fresh stat bag, which is how a save is restored.
 */

import { StatsProp } from '../core/stats.js';
import type { StatBag } from '../core/stats.js';
import { evaluate } from '../core/equations.js';
import { JOBS, JOB_SKILLS } from '../content/jobData.js';
import type { JobDef, JobSkillDef } from '../content/jobData.js';

export { JOBS, JOB_SKILLS };
export type { JobDef, JobSkillDef };

const PROP_BY_NAME: Record<string, StatsProp> = {
  Flat: StatsProp.Flat,
  Additive: StatsProp.Additive,
  Multiplicative: StatsProp.Multiplicative,
};

function propOf(name: string | null): StatsProp {
  return PROP_BY_NAME[name ?? 'Flat'] ?? StatsProp.Flat;
}

/**
 * `JobSkillInfo.GetXForLevel`: index `level - 1`, clamped into the list. An empty list
 * means "this skill has no such curve", which the callers treat as absent.
 */
function curveAt(curve: readonly number[], level: number, fallback: number): number {
  if (!curve.length) return fallback;
  const i = Math.max(0, Math.min(level - 1, curve.length - 1));
  return curve[i];
}

/** One stat write a level-up performs, kept so `applyTo` can replay it. */
interface StatWrite {
  variable: string;
  prop: StatsProp;
  value: number;
}

export class Jobs {
  /** `playerData.IsUnlockedJobs`. Index 0 always starts true. */
  readonly unlocked: boolean[] = JOBS.map((j) => j.index === 0);
  /** `playerData.SkillsLevels`, keyed by skill id. */
  private readonly levels = new Map<string, number>();

  constructor() {
    for (const id of Object.keys(JOB_SKILLS)) this.levels.set(id, 0);
  }

  // ------------------------------------------------------------------ jobs

  job(index: number): JobDef | undefined {
    return JOBS.find((j) => j.index === index);
  }

  /** `JobsUIManager.cs:222`: the unlock button only appears once the previous job is in. */
  canShowUnlock(index: number): boolean {
    return !this.unlocked[index] && index > 0 && this.unlocked[index - 1] === true;
  }

  canUnlock(index: number, claw: number): boolean {
    const j = this.job(index);
    return j != null && this.canShowUnlock(index) && claw >= j.unlockCost;
  }

  /** Unlocks a job and applies its passive. Returns the claw spent, or null. */
  unlock(index: number, claw: number): number | null {
    const j = this.job(index);
    if (!j || !this.canUnlock(index, claw)) return null;
    this.unlocked[index] = true;
    return j.unlockCost;
  }

  /** `JobInfo.ApplyPassiveBonus` for every unlocked job — the passive stat write. */
  private jobPassives(): StatWrite[] {
    const out: StatWrite[] = [];
    for (const j of JOBS) {
      if (!this.unlocked[j.index] || !j.passiveStat || j.passiveValue === 0) continue;
      out.push({ variable: j.passiveStat, prop: propOf(j.passiveStatProp), value: j.passiveValue });
    }
    return out;
  }

  /**
   * `CharacterManager.ChangeSkin`: the outfit is the HIGHEST unlocked job index, so
   * unlocking a later job never downgrades the look.
   */
  skinIndex(): number {
    let best = 0;
    for (let i = 0; i < this.unlocked.length; i++) if (this.unlocked[i]) best = i;
    return best;
  }

  // ------------------------------------------------------------------ skills

  def(id: string): JobSkillDef | undefined {
    return JOB_SKILLS[id];
  }

  level(id: string): number {
    return this.levels.get(id) ?? 0;
  }

  isMaxed(id: string): boolean {
    const d = JOB_SKILLS[id];
    return d != null && this.level(id) >= d.maxLevel;
  }

  /** `JobsUIManager.cs:201`: slot 0 is always open; later slots need the previous one. */
  skillPurchasable(jobIndex: number, slot: number): boolean {
    const j = this.job(jobIndex);
    if (!j || !this.unlocked[jobIndex]) return false;
    const id = j.skills[slot];
    if (!id || this.isMaxed(id)) return false;
    if (slot === 0) return true;
    if (this.level(id) > 0) return true;
    return this.level(j.skills[slot - 1]) > 0;
  }

  /** `cost[currentLevel]` — the price of the level you are on. */
  skillCost(id: string): number {
    const d = JOB_SKILLS[id];
    if (!d) return 0;
    const lvl = this.level(id);
    if (lvl >= d.maxLevel) return 0;
    return d.cost[Math.max(0, Math.min(lvl, d.cost.length - 1))] ?? 0;
  }

  canLevelSkill(jobIndex: number, slot: number, claw: number): boolean {
    const j = this.job(jobIndex);
    if (!j) return false;
    const id = j.skills[slot];
    return this.skillPurchasable(jobIndex, slot) && claw >= this.skillCost(id);
  }

  /** The claw cost of one level, or null when the purchase is refused. */
  levelUpSkill(jobIndex: number, slot: number, claw: number): number | null {
    const j = this.job(jobIndex);
    if (!j) return null;
    const id = j.skills[slot];
    if (!this.canLevelSkill(jobIndex, slot, claw)) return null;
    const price = this.skillCost(id);
    this.levels.set(id, this.level(id) + 1);
    return price;
  }

  /**
   * The stat writes one level-up performs, in the original's order. `applyTo` replays
   * these for every level so a restored save lands on identical totals; the incremental
   * form matters for passive skills, whose value is summed rather than differenced.
   */
  private levelWrites(id: string, oldLevel: number, newLevel: number): StatWrite[] {
    const d = JOB_SKILLS[id];
    if (!d) return [];
    const out: StatWrite[] = [];
    const prefix = d.skillNameInStatsData;
    const prev = Math.max(oldLevel, 1);

    if (d.isPassive) {
      if (d.passiveStat) {
        out.push({
          variable: d.passiveStat,
          prop: propOf(d.passiveStatProp),
          value: evaluate(d.passiveEffectValueEquation, newLevel),
        });
      }
    } else {
      const cd = curveAt(d.cooldowns, newLevel, 0) - curveAt(d.cooldowns, prev, 0);
      if (cd !== 0) out.push({ variable: `${prefix}_Cooldown`, prop: StatsProp.Flat, value: cd });
      if (d.pierceCounts.length) {
        const v = curveAt(d.pierceCounts, newLevel, 0) - curveAt(d.pierceCounts, prev, 0);
        if (v !== 0) out.push({ variable: `${prefix}_PierceCount`, prop: StatsProp.Flat, value: v });
      }
      if (d.numberOfTurns.length) {
        const v = curveAt(d.numberOfTurns, newLevel, 0) - curveAt(d.numberOfTurns, prev, 0);
        if (v !== 0) out.push({ variable: `${prefix}_NumberOfTurns`, prop: StatsProp.Flat, value: v });
      }
      if (d.isPet) {
        if (d.petHealthMultipliers.length) {
          const v = curveAt(d.petHealthMultipliers, newLevel, 0) - curveAt(d.petHealthMultipliers, prev, 0);
          if (v !== 0) out.push({ variable: `${prefix}_HealthMultiplier`, prop: StatsProp.Flat, value: v });
        }
        if (d.petAttackChances.length) {
          const v = curveAt(d.petAttackChances, newLevel, 0) - curveAt(d.petAttackChances, prev, 0);
          if (v !== 0) out.push({ variable: `${prefix}_AttackChance`, prop: StatsProp.Flat, value: v });
        }
      }
      if (d.isBuff) {
        if (d.buffValues.length) {
          const v = curveAt(d.buffValues, newLevel, 0) - curveAt(d.buffValues, prev, 0);
          if (v !== 0) out.push({ variable: `${prefix}_BuffValue`, prop: StatsProp.Flat, value: v });
        }
        if (d.buffDurations.length) {
          const v = curveAt(d.buffDurations, newLevel, 0) - curveAt(d.buffDurations, prev, 0);
          if (v !== 0) out.push({ variable: `${prefix}_Duration`, prop: StatsProp.Flat, value: v });
        }
      }
    }

    // These two run for every skill, passive or not.
    if (d.numberOfHits.length) {
      const v = curveAt(d.numberOfHits, newLevel, 1) - curveAt(d.numberOfHits, prev, 1);
      if (v !== 0) out.push({ variable: `${prefix}_NumberOfHits`, prop: StatsProp.Flat, value: v });
    }
    if (!d.isBuff && d.durations.length) {
      const v = curveAt(d.durations, newLevel, 0) - curveAt(d.durations, prev, 0);
      if (v !== 0) out.push({ variable: `${prefix}_Duration`, prop: StatsProp.Flat, value: v });
    }
    return out;
  }

  /** Every write implied by the current state, ready to replay onto an empty bag. */
  writes(): StatWrite[] {
    const out: StatWrite[] = [...this.jobPassives()];
    for (const [id, level] of this.levels) {
      for (let n = 1; n <= level; n++) out.push(...this.levelWrites(id, n - 1, n));
    }
    return out;
  }

  /**
   * Rebuilds the job/skill contribution on a bag that already holds the base stats, so a
   * purchase takes effect immediately and a replay cannot double-apply.
   */
  applyTo(stats: StatBag): void {
    for (const w of this.writes()) stats.change(w.variable, w.prop, w.value, true);
  }

  /** Cooldown in seconds for a skill at its current level, from the stat bag. */
  cooldownOf(id: string): number {
    const d = JOB_SKILLS[id];
    if (!d) return 0;
    return curveAt(d.cooldowns, Math.max(1, this.level(id)), 0);
  }

  /** `PlayerStatsData.SkillsMultiplier`: the damage multiplier for a skill's level. */
  damageMultiplierOf(id: string): number {
    const d = JOB_SKILLS[id];
    if (!d || !d.damageMultipliers.length) return 1;
    return curveAt(d.damageMultipliers, Math.max(1, this.level(id)), 1);
  }

  numberOfHitsOf(id: string): number {
    const d = JOB_SKILLS[id];
    if (!d) return 1;
    return curveAt(d.numberOfHits, Math.max(1, this.level(id)), 1);
  }

  /** Skills of a job that the player has actually unlocked a level in. */
  activeSkills(): string[] {
    return Object.keys(JOB_SKILLS).filter((id) => this.level(id) > 0);
  }

  /** Total skill levels, for the header readout. */
  totalLevels(): number {
    let n = 0;
    for (const v of this.levels.values()) n += v;
    return n;
  }

  serialize(): { jobs: number[]; skills: Record<string, number> } {
    const skills: Record<string, number> = {};
    for (const [id, v] of this.levels) if (v > 0) skills[id] = v;
    return { jobs: this.unlocked.map((u, i) => (u ? i : -1)).filter((i) => i >= 0), skills };
  }

  load(data: { jobs?: number[]; skills?: Record<string, number> } | undefined): void {
    if (!data) return;
    for (const i of data.jobs ?? []) {
      if (i >= 0 && i < this.unlocked.length) this.unlocked[i] = true;
    }
    this.unlocked[0] = true;
    for (const [id, v] of Object.entries(data.skills ?? {})) {
      const d = JOB_SKILLS[id];
      if (d && v > 0) this.levels.set(id, Math.min(Math.floor(v), d.maxLevel));
    }
  }
}
