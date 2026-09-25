/**
 * Skill runtime, ported from `SkillsManager` + `CharacterAttacker`.
 *
 * The original classifies each skill by flags on its asset, and each class behaves
 * differently (`analysis/assets_data/JobSkillInfo.json`):
 *
 * | kind | flag | who drives it |
 * |---|---|---|
 * | `shot` | `isShotByArcher` | the archer's auto-attack fires it when it is off cooldown |
 * | `buff` | `isBuff` | `TryCastReadyBuffSkills` auto-casts it the moment it is ready |
 * | `cast` | neither | `CallNonShotSkills` polls it every 0.5s (`SniperScope`, `BatSwarm`) |
 * | `passive` | `isPassive` | no button: it replaces the auto-attack on a probability |
 * | `pet` | `isPet` | `PetsManager` re-summons it whenever the slot is empty |
 *
 * **Job priority is descending.** `CharacterAttacker.GetSortedJobs()` is
 * `OrderByDescending(job => job.JobIndex)`, so the HIGHEST unlocked job's skill wins the
 * roll for the auto-attack. That is why unlocking a later job changes how the character
 * fights rather than only adding options.
 *
 * A skill at level 0 is simply absent: nothing is castable until it is bought.
 */

import type { JobSkillDef } from '../content/jobData.js';
import { JOB_SKILLS, Jobs } from './jobs.js';

export type SkillId = string;
export type { JobSkillDef };

/**
 * The original's job ordering: `GetSortedJobs()` sorts by descending job index, so the
 * newest job is tried first for every decision.
 */
export const SKILL_PRIORITY: string[] = Object.values(JOB_SKILLS)
  .slice()
  .sort((a, b) => (b.job - a.job) || (b.slot - a.slot))
  .map((d) => d.id);

export const SKILLS = JOB_SKILLS;

/** Every skill id, in the game's own priority order. */
export const SKILL_IDS: string[] = SKILL_PRIORITY;

export interface SkillRuntime {
  def: JobSkillDef;
  /** Remaining cooldown in seconds. */
  cooldownLeft: number;
  /** Remaining buff time (buff skills). */
  buffLeft: number;
}

export class Skills {
  private readonly runtime = new Map<string, SkillRuntime>();

  constructor(private readonly jobs: Jobs) {
    for (const id of SKILL_PRIORITY) {
      this.runtime.set(id, { def: JOB_SKILLS[id], cooldownLeft: 0, buffLeft: 0 });
    }
  }

  /** Skills the player has put at least one level into, in priority order. */
  owned(): string[] {
    return SKILL_PRIORITY.filter((id) => this.jobs.level(id) > 0);
  }

  get(id: string): SkillRuntime | undefined {
    return this.runtime.get(id);
  }

  /**
   * Cooldown length at the skill's current level. The original reads this from the stat
   * bag (`<skill>_Cooldown`), which `Jobs` seeds from the same curve, so reading the curve
   * gives the same number without a bag round-trip.
   */
  cooldownFor(id: string): number {
    return this.jobs.cooldownOf(id);
  }

  fraction(id: string): number {
    const r = this.runtime.get(id);
    if (!r) return 0;
    const cd = this.cooldownFor(id);
    return cd > 0 ? Math.max(0, r.cooldownLeft / cd) : 0;
  }

  /** Owned AND off cooldown. */
  isReady(id: string): boolean {
    const r = this.runtime.get(id);
    if (!r || this.jobs.level(id) <= 0) return false;
    return r.cooldownLeft <= 0;
  }

  /** The first owned, ready skill of a kind, honouring the descending job priority. */
  private firstReady(kind: JobSkillDef['kind']): string | null {
    for (const id of SKILL_PRIORITY) {
      const d = JOB_SKILLS[id];
      if (d.kind !== kind) continue;
      if (this.isReady(id)) return id;
    }
    return null;
  }

  /** Which `isShotByArcher` skill the auto-attack should fire, if any. */
  nextShot(): string | null {
    return this.firstReady('shot');
  }

  /** Which buff `TryCastReadyBuffSkills` should cast, if any. */
  nextBuff(): string | null {
    return this.firstReady('buff');
  }

  /** Which `CallNonShotSkills` skill should fire, if any. */
  nextCast(): string | null {
    return this.firstReady('cast');
  }

  /** Consumes the cooldown; false when the skill is not owned or still cooling. */
  cast(id: string): boolean {
    const r = this.runtime.get(id);
    if (!r || !this.isReady(id)) return false;
    r.cooldownLeft = this.cooldownFor(id);
    if (r.def.isBuff) r.buffLeft = this.buffDurationFor(id);
    return true;
  }

  isBuffActive(id: string): boolean {
    return (this.runtime.get(id)?.buffLeft ?? 0) > 0;
  }

  /** `<skill>_BuffValue` at the current level — the amount the buff grants. */
  buffValueFor(id: string): number {
    const d = JOB_SKILLS[id];
    if (!d) return 0;
    const lvl = Math.max(1, this.jobs.level(id));
    const list = d.buffValues.length ? d.buffValues : d.buffDurations;
    if (!list.length) return 0;
    return list[Math.max(0, Math.min(lvl - 1, list.length - 1))];
  }

  /** `<skill>_Duration` at the current level — buff duration when `isBuff`. */
  buffDurationFor(id: string): number {
    const d = JOB_SKILLS[id];
    if (!d) return 0;
    const lvl = Math.max(1, this.jobs.level(id));
    if (!d.buffDurations.length) return 0;
    return d.buffDurations[Math.max(0, Math.min(lvl - 1, d.buffDurations.length - 1))];
  }

  /** Which stat a buff writes, and by how much, for the sim to apply while it is up. */
  buffGrant(id: string): { stat: string; prop: string; value: number } | null {
    const d = JOB_SKILLS[id];
    if (!d || !d.isBuff || !d.buffStat) return null;
    return { stat: d.buffStat, prop: d.buffStatProp ?? 'Flat', value: this.buffValueFor(id) };
  }

  /**
   * Total additive attack-speed% from all active buffs, for the sim's fire rate.
   * `RapidFire`'s buff stat is the attack speed one, so this is its real contribution.
   */
  attackSpeedBonus(): number {
    let total = 0;
    for (const r of this.runtime.values()) {
      if (r.buffLeft <= 0) continue;
      const grant = this.buffGrant(r.def.id);
      if (grant && /AttackSpeed/i.test(grant.stat)) total += grant.value;
    }
    return total;
  }

  activeBuffs(): string[] {
    return SKILL_PRIORITY.filter((id) => this.isBuffActive(id));
  }

  /** Any active buff extends on kill (`RapidFire_ExtensionPerKill` family). */
  extendBuffs(seconds: number): void {
    for (const r of this.runtime.values()) {
      if (r.buffLeft > 0) r.buffLeft += seconds;
    }
  }

  update(dt: number): void {
    for (const r of this.runtime.values()) {
      if (r.cooldownLeft > 0) r.cooldownLeft = Math.max(0, r.cooldownLeft - dt);
      if (r.buffLeft > 0) r.buffLeft = Math.max(0, r.buffLeft - dt);
    }
  }

  /** `SkillsManager.EndAllBuffs` — buffs drop on level clear, cooldowns do not. */
  endAllBuffs(): void {
    for (const r of this.runtime.values()) r.buffLeft = 0;
  }

  reset(): void {
    for (const r of this.runtime.values()) {
      r.cooldownLeft = 0;
      r.buffLeft = 0;
    }
  }

  serialize(): Record<string, { c: number; b: number }> {
    const out: Record<string, { c: number; b: number }> = {};
    for (const [id, r] of this.runtime) out[id] = { c: r.cooldownLeft, b: r.buffLeft };
    return out;
  }

  load(data: Record<string, { c: number; b: number }> | undefined): void {
    if (!data) return;
    for (const [id, v] of Object.entries(data)) {
      const r = this.runtime.get(id);
      if (r) {
        r.cooldownLeft = v.c ?? 0;
        r.buffLeft = v.b ?? 0;
      }
    }
  }
}
