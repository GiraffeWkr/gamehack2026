/**
 * Presentation facts the simulation publishes for the UI layer.
 *
 * Deliberately tiny: the UI keeps its own data (cooldowns from Skills, HP from
 * the snapshot) and only draws what it already knows, which stops the frame
 * loop from allocating a fresh object graph on every tick.
 */

export interface DamageNumber {
  x: number;
  y: number;
  value: number;
  crit: boolean;
}

/**
 * An arrow landing, published so the presentation layer can celebrate it.
 *
 * Without this a skill cast is invisible whenever the target sits off-screen: the
 * arrows fly away and nothing on the player's side of the screen changes, which
 * reads as "the button did nothing".
 */
export interface Impact {
  x: number;
  y: number;
  radius: number;
  source: 'mouse' | 'multishot' | 'skill' | 'pierce' | 'nova';
  /** True when nothing was in range, so the renderer can play a weaker beat. */
  missed: boolean;
}

/** A skill activation, for the HUD banner. */
export interface SkillCast {
  skillId: string;
  buff: boolean;
  /** How long the banner should stay up, in seconds. */
  duration: number;
}

export interface Snapshot {
  playerX: number;
  playerY: number;
  playerHp: number;
  playerMaxHp: number;
  /** Monster level: the run's stage, shown as 第 N 关. */
  level: number;
  gold: number;
  /**
   * The five monster-family currencies, from `PlayerManager.MonsterDiedGiveRewards`.
   * Killing a Warrior yields WarriorCurrency rather than extra gold.
   */
  currencies: Record<string, number>;
  /**
   * Which family purses have ever been filled. The original gates each HUD counter on
   * `playerData.WasCurrencyShownBefore`, so an unused currency stays hidden.
   */
  currencySeen: Record<string, boolean>;
  /**
   * `playerData.PlayerPortalCurrency` — the talent tree's second currency, paid once per
   * battle level by the run portal (`RunManager.IsPortalCurrencyOwed`). Gates the 29
   * diamond-shaped portal nodes, each of which costs exactly 1.
   */
  portalCurrency: number;
  /** `playerData.WasCurrencyShownBefore[Currencies.PortalCurrency]`. */
  portalCurrencySeen: boolean;
  /** Premium currency, dropped by guardians and portals only. */
  gems: number;
  /** Player level, raised by experience from kills. */
  playerLevel: number;
  playerExp: number;
  playerExpNeeded: number;
  /** Progress toward the next player level, 0..1. Drives the HUD bar. */
  playerExpFraction: number;
  kills: number;
  packsCleared: number;
  packsTotal: number;
  magazine: number;
  magazineSize: number;
  magazineFraction: number;
  /** Progress of the next arrow's regeneration, 0..1. Drives the cooldown ring. */
  magazineRegenFraction: number;
  portalActive: boolean;
  portalHp: number;
  portalMaxHp: number;
  portalSummon: number;
  /**
   * Which stage the run portal is in:
   *  - `dormant`     packs are still alive, the portal cannot be hurt
   *  - `summoning`   packs are down, the portal is charging its extra wave
   *  - `vulnerable`  the wave is out and the portal can be destroyed
   */
  portalPhase: 'dormant' | 'summoning' | 'vulnerable';
  runState: 'running' | 'cleared' | 'dead';
  deathFade: number;
}

export class EventQueue<T> {
  private items: T[] = [];

  push(item: T): void {
    // Bound the queue: a multishot burst can otherwise emit hundreds of
    // floating numbers in one frame and stall the DOM.
    if (this.items.length < 128) this.items.push(item);
  }

  drain(): T[] {
    if (this.items.length === 0) return EMPTY;
    const out = this.items;
    this.items = [];
    return out;
  }
}

const EMPTY: never[] = [];
