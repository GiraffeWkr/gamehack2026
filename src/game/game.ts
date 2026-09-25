/**
 * The combat simulation, ported from `RunManager` + `EnemiesManager` +
 * `CharacterManager` + `MouseAttacker` + `SkillsManager`.
 *
 * Design rules kept from the original:
 *  - The character advances automatically. He only stops when an enemy is
 *    within `AttackRange` ahead of him, then resumes when the path clears.
 *  - All player input is aiming: tap/drag anywhere to drop an arrow at that
 *    world position. That is the whole control scheme, which is why it ports
 *    to touch without a virtual stick.
 *  - Levels are a fixed plan of enemy packs spaced along +X, ending in a run
 *    portal. The portal only becomes vulnerable after every pack is cleared,
 *    then it summons one more wave.
 *  - Death never loses progress: only uncleared packs are respawned.
 *
 * No PixiJS imports here on purpose: the simulation is pure data so it can be
 * unit-tested and so a different renderer can be dropped in later.
 */

import { Rng, randRange, roundStat, toReadable } from '../core/math.js';
import { StatBag, StatsProp } from '../core/stats.js';
import {
  BASE,
  CAMERA,
  ENEMIES,
  CURRENCY_CHANCE_STAT,
  MONSTER_CURRENCY,
  ONE_GAME_UNIT,
  MULTIPLICATIVE_STATS,
  PLAYER_BASE_STATS,
  SPAWN,
  STATS,
  WORLD,
  enemyWeightsForLevel,
  type EnemyType,
  type MonsterCurrency,
} from '../content/data.js';
import {
  enemyDamage,
  enemyGold,
  enemyHealth,
  enemyCurrencyDrop,
  packHalfWidth,
  planRun,
  rollOver100,
  type PackPlan,
} from '../content/level.js';
import { SKILLS, Skills, type SkillId } from './skills.js';
import { Jobs } from './jobs.js';
import { Mastery } from './mastery.js';
import {
  ARCHER_SPAWN_GATE,
  PET_CHASE_SPEED_MULTIPLIER,
  PET_ENGAGE_DISTANCE,
  SUMMON_GAP,
  TAMING,
  nextSummon,
  petAttackInterval,
  petAttackRange,
  petDamageMultiplier,
  petIsUntargetable,
  petMaxHp,
  petNumberOfHits,
  petIsTaunt,
  rollTame,
} from './pets.js';
import { TalentTree } from './talent.js';
import { Progression, expForKill } from './progression.js';
import { EventQueue, type DamageNumber, type Impact, type SkillCast, type Snapshot } from './types.js';

export interface InputState {
  /** True while the player is touching/holding to aim. */
  aiming: boolean;
  /** World-space point the player is aiming at. */
  aimX: number;
  aimY: number;
  /**
   * Taps awaiting consumption. This is a QUEUE, not a per-frame flag.
   *
   * A frame is about 17ms, so a fast player easily lands two or three taps inside
   * one. With a boolean only the first survived and the rest were dropped, which is
   * why clicking quickly within the magazine felt unresponsive.
   */
  taps: number;
  /**
   * Pointer position independent of any button, for the hover-pickup path.
   *
   * `LootDropSelfer.Update` collects a settled drop when the pointer is within
   * `mousePickupRadius` (40 units) of it, with no click needed. A touch device simply
   * never sets `hoverActive`. Optional because most callers - and every test that drives
   * the sim directly - have no pointer at all.
   */
  hoverX?: number;
  hoverY?: number;
  hoverActive?: boolean;
}

interface Enemy {
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  speed: number;
  attackRange: number;
  attackCooldown: number;
  attackTimer: number;
  attackKind: 'melee' | 'ranged';
  radius: number;
  color: number;
  damage: number;
  gold: number;
  packId: number;
  isPortal: boolean;
  isGuardian: boolean;
  /** `EnemiesManager` golden variant: pays out several extra reward settlements on death.
   *  Optional so the five spawn sites that predate it stay valid; absent means false. */
  golden?: boolean;
  /** A Gilded Champion, which can ONLY come from the `GoldenPack` mastery prime. */
  champion?: boolean;
  /** Horizontal wander so a pack does not collapse into one pixel. */
  laneOffset: number;
  hitFlash: number;
  alive: boolean;
}

/**
 * A summoned pet — Wolf, Bear or Falcon.
 *
 * Pets are not buyable units: they are `JobSkillInfo` entries with `isPet`, so one exists
 * exactly while its skill is at level 1 or more AND its slot is not on cooldown. Dying
 * writes the cooldown back, which is the original's re-summon delay.
 */
export interface Pet {
  /** The skill id that owns it, e.g. `Wolf`. */
  id: string;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackTimer: number;
  alive: boolean;
  /** True while it is trading blows rather than walking. */
  engaged: boolean;
  facing: number;
}

/**
 * A monster tamed by `TamingManager`. It fights for the player with the original's flat
 * multipliers (`BaseTameHealthMultiplier` 0.7, `BaseTameDamageMultiplier` 1.2) and keeps
 * its own `EnemyInfo` attack range and speed.
 */
export interface TamedMinion {
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  attackTimer: number;
  alive: boolean;
  /** Random formation offset so several tames do not stack on one pixel. */
  offset: number;
}

/**
 * A falling arrow: the tapped arrow rain, and the multishot skill.
 *
 * Separate from `Projectile` because these descend onto a fixed point rather
 * than travelling from the bow, which is the distinction the original draws
 * between the archer's own attack and the player's arrow-rain ability.
 */
interface Arrow {
  fromX: number;
  fromY: number;
  toX: number;
  toY: number;
  /** 0..1 fall progress. */
  t: number;
  duration: number;
  damage: number;
  radius: number;
  crit: boolean;
  source: 'mouse' | 'multishot' | 'skill' | 'pierce' | 'nova';
}

/** An arrow in flight from the bow toward an enemy. */
interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  crit: boolean;
  life: number;
}

interface EnemyShot {
  x: number;
  y: number;
  vx: number;
  vy: number;
  damage: number;
  radius: number;
  color: number;
  /**
   * Set when the shot was fired at a pet rather than the archer, so `stepShots` routes the
   * hit to that ally. `PetsManager.RangedTargetOrder` sends ranged fire at the Bear first.
   */
  targetPet?: string | null;
}

/**
 * A ground loot drop, ported from `LootDropSelfer`.
 *
 * One drop per `LootDropManager.SpawnCurrencyDrop` call, and the call passes the FULL
 * amount - `MonsterDiedGiveRewards` spawns `GoldCoinsToDrop` (1) gold drops each worth
 * the whole `EnemyGold`, plus `num6` family-currency drops each worth the whole
 * `EnemyCurrencyDrop`. An earlier revision split one kill's gold across two coins of half
 * each, so the totals only matched if every coin happened to be picked up.
 *
 * The burst is `LootDropSelfer.Initialize`: pop up by `upSpeed`, drift sideways, then
 * fall to the landing Y, as a rise (OutQuad) followed by a fall (InQuad). After that it
 * idles with a +-8 unit bob. There is no expiry - a drop waits until it is collected.
 */
interface Coin {
  /** Where the enemy died: the burst starts and ends here horizontally. */
  baseX: number;
  baseY: number;
  /** Where it lands. */
  landX: number;
  landY: number;
  /** Peak of the pop: `baseY + upSpeed`. */
  peakY: number;
  /** Rise and fall durations, from `Initialize`. */
  riseTime: number;
  fallTime: number;
  /** Seconds since spawn, driving both phases. */
  age: number;
  /** Current position, recomputed every step. */
  x: number;
  y: number;
  value: number;
  /**
   * Which purse this drop feeds. `PlayerManager.MonsterDiedGiveRewards` drops gold from
   * EVERY kill plus the enemy family's own currency, so a Warrior yields WarriorCurrency
   * and a Mage yields MageCurrency rather than everything collapsing into gold.
   */
  currency: DropCurrency;
  collected: boolean;
}

/**
 * Everything a drop can carry.
 *
 * `PortalCurrency` is not a monster family: the original keeps it in its own
 * `playerData.PlayerPortalCurrency` field and only ever pays it from the run portal
 * (`PlayerManager.MonsterDiedGiveRewards`, the `EnemyType.RunPortal` branch), so it is a
 * separate member here too rather than being folded into `MonsterCurrency`.
 */
export type DropCurrency = 'Gold' | MonsterCurrency | 'PortalCurrency';

/** A collected drop's flight to its HUD counter, drained by the presentation layer. */
export interface CollectedDrop {
  x: number;
  y: number;
  currency: DropCurrency;
}

/**
 * `PlayerManager`: how close the portal has to be for its currency to land where the
 * player can reach it, and how far in front of the player it is re-placed when it cannot.
 */
const PORTAL_CURRENCY_REACHABLE_DISTANCE = 1200;
const PORTAL_CURRENCY_RESCUE_SPAWN_OFFSET_X = 150;

/** `CharacterAttacker`: how often the non-shot skills are polled, in seconds. */
const NON_SHOT_POLL = 0.5;

/** \DatabaseManager.GildedChampionRewardMultiplier\. */
const GILDED_CHAMPION_REWARD_MULTIPLIER = 3;

/** Shorthand for \ollGolden\\'s negative result. */
const NO_GOLDEN = { golden: false, champion: false };

/** \PinnacleEffectType.GoldenPack\. */
const PINNACLE_GOLDEN_PACK = 1;

/** `LootDropSelfer`: `playerPickupRadius`. */
const DROP_PICKUP_RADIUS = 80;
/** `LootDropSelfer`: `mousePickupRadius` - hover-pickup range. */
const DROP_HOVER_RADIUS = 40;
/** The arrow-rain damage bonus, as a percentage. Real name; base 50 = the old 1.5x. */
const ARROW_DAMAGE_STAT = 'MouseArrowDamage';
/** `LootDropSelfer.StartIdleAnimation`: `DOMoveY(y + 8, 1.2s).InOutSine().Yoyo()`. */
const DROP_BOB_HEIGHT = 8;
const DROP_BOB_SECONDS = 1.2;

interface Puff {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  maxLife: number;
  color: number;
  radius: number;
}

/** Where the bow sits relative to the character's feet, in world units. */
const BOW_OFFSET_X = 46;
const BOW_OFFSET_Y = 132;

/**
 * The arrow-rain blast radius, in world units.
 *
 * `MouseAttacker` builds its hit circles with
 * `(MouseRadius + 0.5f) * DatabaseManager.OneGameUnitToUnityUnit`, and
 * `OneGameUnitToUnityUnit` is **10**, so the real radius is `(3.5 + 0.5) * 10 = 40`.
 *
 * An earlier revision used `baseMouseRadius * 60` = **210**, more than five times too
 * generous, which let an arrow kill enemies nowhere near where it landed.
 */
const ARROW_BLAST_RADIUS = (BASE.baseMouseRadius + 0.5) * 10;

/**
 * Shortest distance from a point to a line segment, used so a fast arrow cannot
 * tunnel through a small enemy between two frames.
 */
function segmentHitsCircle(
  x1: number, y1: number, x2: number, y2: number,
  cx: number, cy: number, r: number,
): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy;
  let t = lenSq > 0 ? ((cx - x1) * dx + (cy - y1) * dy) / lenSq : 0;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  const px = x1 + dx * t;
  const py = y1 + dy * t;
  return Math.hypot(cx - px, cy - py) <= r;
}

export interface GameOptions {
  seed?: number;
  level?: number;
  defeatedGuardians?: EnemyType[];
  /**
   * Spawn no packs at all, so nothing attacks the player. Used by the tests that need to
   * observe the player in isolation - running the full simulation with 72 enemies alive
   * makes a "did the player heal?" assertion meaningless, because incoming damage moves
   * the same number.
   */
  spawnNothing?: boolean;
}

export class Game {
  readonly stats = new StatBag();
  /**
   * Jobs own the skill levels, and `Skills` reads its cooldowns and multipliers from them
   * (`JobSkillInfo.cooldowns` / `damageMultipliers`), so jobs are constructed first.
   */
  readonly jobs = new Jobs();
  readonly skills = new Skills(this.jobs);
  /** The mastery NPC track and the nine masteries, paid in BatCurrency. */
  readonly mastery = new Mastery();
  readonly rng: Rng;

  // --- player ---
  px = WORLD.playerStartX;
  py = WORLD.playerStartY;
  hp = 0;
  maxHp = 0;
  private facing = 1;
  private moving = false;
  private deathTimer = 0;
  private fireTimer = 0;
  /** Seconds left on the bow's muzzle flash, purely visual. */
  bowFlash = 0;

  // --- level ---
  level: number;
  packs: PackPlan[] = [];
  portalX = 0;
  portalPackSize = 0;
  private clearedPacks = new Set<number>();
  private portal: Enemy | null = null;
  private summonTimer = 0;
  private summonDuration = BASE.portalSummonTime;
  /** True once the portal countdown has been kicked off for this level. */
  private summonStarted = false;
  /** True once the portal's extra wave has been released. */
  private summonWaveSpawned = false;

  // --- economy / progress ---
  gold = 0;
  kills = 0;
  private defeatedGuardians: Set<EnemyType>;

  /**
   * The tutorial counter, `PlayerStatsData.IsArcherSpawned`.
   *
   * The shipping game pushes packs far out and makes the enemies passive until the archer
   * has been summoned `ARCHER_SPAWN_GATE` (10) times, which is the self-sustaining Claw
   * tutorial. An earlier revision hardcoded this to `false` with a comment saying the slice
   * had no talent tree yet, so every level opened as the tutorial.
   */
  private archerSpawnCount = 1;

  // --- magazine (the original's core resource constraint) ---
  magazine = 0;
  magazineSize = 5;
  private magazineTimer = 0;
  /** Seconds accumulated toward the next health-regen tick. `PlayerManager` heals once
   * every `HealthRegenEverySecond` (5) seconds rather than continuously.
   */
  private healthRegenTimer = 0;

  /**
   * Drop chance per family currency, from the tree's `*CurrencyChanceDrop` stats.
   *
   * `PlayerStatsData` declares these but never seeds them in `Init()`, so at base they are
   * **0** in the original and every point of the chance comes from the talent tree. The
   * shipping level-3 save (`analysis/save_Lv3.json`) shows the shape of it: 75 flat Claw
   * chance with 23 ClawCurrency held - the tree is what turns the drop on.
   *
   * An earlier port revision seeded all five at 100 so a family would pay out before any
   * tree investment. That was wrong twice over: it is not the original's base, and below a
   * family's unlock level `EnemyCurrencyDrop` is 0, so it produced a pickup worth nothing.
   */
  private familyCurrencyChance(currency: MonsterCurrency): number {
    const key = CURRENCY_CHANCE_STAT[currency];
    return key ? this.stats.get(key) : 100;
  }

  /** Arrow-falls the player successfully fired. Surfaced by `?stats=1`. */
  shotsFired = 0;
  /** Taps that did nothing because the magazine was empty. */
  shotsBlocked = 0;

  /** Shop upgrades, applied on top of the level-1 stat bases. */
  /** Talent tree: the progression system, replacing the earlier ad-hoc gold shop. */
  readonly talent = new TalentTree();
  /** Player level, experience and the premium currency. */
  readonly progression = new Progression();
  /** Levels gained on the most recent tick, for the level-up banner. */
  levelsGained = 0;
  /** Highest stage ever cleared, so first-clear gem rewards are not repeatable. */
  private highestCleared = 0;
  /** Arrow-fall damage multiplier, raised by the `arrowDamage` upgrade. */
  /**
   * Arrow-rain damage multiplier, from the `MouseArrowDamage` stat.
   *
   * The base is 50, i.e. +50% over the bow - `PLAYER_START.mouseArrowDamageMultiplier`
   * was 1.5 for the same reason ("Mouse arrows hit harder than the archer's own, matching
   * ArrowFall's dominance in the original's damage logs"). Tree nodes raise it.
   */
  private get arrowDamageMultiplier(): number {
    return 1 + this.stats.get(ARROW_DAMAGE_STAT) / 100;
  }

  // --- entities ---
  private enemies: Enemy[] = [];
  private arrows: Arrow[] = [];
  /** Bow-fired arrows currently in flight. */
  private projectiles: Projectile[] = [];
  private shots: EnemyShot[] = [];
  private coins: Coin[] = [];
  private puffs: Puff[] = [];

  /** Publishes damage numbers to the DOM layer. */
  readonly floaters = new EventQueue<DamageNumber>();
  /** Publish spawn/impact puffs to the renderer. */
  readonly spawnPuffs = new EventQueue<Puff>();
  /** Publishes arrow landings so a cast is visible even when it hits nothing. */
  readonly impacts = new EventQueue<Impact>();
  /** Publishes skill activations for the HUD banner. */
  readonly skillCasts = new EventQueue<SkillCast>();

  runState: 'running' | 'cleared' | 'dead' = 'running';

  /**
   * The five monster-family currencies, mirroring `Currencies` in the original.
   *
   * `PlayerManager.MonsterDiedGiveRewards` awards gold plus the dead enemy's own family
   * currency, so these are the reason killing a Warrior beats killing a Claw.
   */
  readonly currencies: Record<MonsterCurrency, number> = {
    ClawCurrency: 0,
    ArcherCurrency: 0,
    WarriorCurrency: 0,
    MageCurrency: 0,
    BatCurrency: 0,
  };

  /**
   * Whether each family currency has ever been earned. The original keeps the same flag
   * in `playerData.WasCurrencyShownBefore` and uses it to decide whether a currency's HUD
   * counter is shown at all - a purse you have never filled stays hidden.
   */
  readonly currencySeen: Record<MonsterCurrency, boolean> = {
    ClawCurrency: false,
    ArcherCurrency: false,
    WarriorCurrency: false,
    MageCurrency: false,
    BatCurrency: false,
  };

  /**
   * `playerData.PlayerPortalCurrency` — the talent tree's second currency.
   *
   * It is the scarcest thing in the game: `RunManager.IsPortalCurrencyOwed` pays it once
   * per battle level and `PortalCurrencyPaid` remembers which levels have already paid, so
   * the lifetime total is one per distinct level ever cleared. That is what gates the 29
   * diamond-shaped portal nodes in the tree, each of which costs exactly 1.
   */
  portalCurrency = 0;

  /** `playerData.WasCurrencyShownBefore[Currencies.PortalCurrency]`. */
  portalCurrencySeen = false;

  /** `playerData.PortalCurrencyPaid` — battle level -> already paid out. */
  readonly portalCurrencyPaid = new Set<number>();

  /** `RunManager.IsPortalCurrencyOwed`. */
  portalCurrencyOwed(level: number): boolean {
    return !this.portalCurrencyPaid.has(level);
  }

  constructor(opts: GameOptions = {}) {
    this.rng = new Rng(opts.seed ?? 288089883);
    this.level = opts.level ?? 1;
    this.defeatedGuardians = new Set(opts.defeatedGuardians ?? []);
    this.spawnNothing = opts.spawnNothing ?? false;
    this.applyBaseStats();
    this.startLevel(this.level, false);
  }

  /** When true, `startLevel` spawns no packs (tests only). */
  private readonly spawnNothing: boolean;

  // -------------------------------------------------------------------------
  // Stats
  // -------------------------------------------------------------------------

  /**
   * Registers the slice's stats with their level-1 values, mirroring the
   * `ChangeAStat` block in `PlayerStatsData.Init()`, then replays purchased
   * upgrades on top.
   *
   * Safe to call again after a purchase: the bases are re-set first, so upgrades
   * are never applied twice (the original solves the same problem with
   * `CrossSystemBonuses.ReconcileAll`).
   */
  private applyBaseStats(): void {
    const s = this.stats;
    s.defineAll(PLAYER_BASE_STATS);
    // Multiplicative layers are products, so every one of them starts at 1;
    // an unset layer would otherwise zero the whole stat out.
    for (const variable of MULTIPLICATIVE_STATS) {
      s.change(variable, StatsProp.SetMultiplicativeOnly, 1);
    }

    // The talent tree is the progression system, so it is replayed here: the bag is
    // rebuilt from its bases and every purchased node is applied on top, which is what
    // keeps a refund-free tree and the live stats from ever drifting apart.
    this.talent.applyTo(s);
    // Jobs, skill levels and masteries are the other progression axes, replayed the same
    // way so a purchase takes effect immediately and nothing double-applies.
    this.jobs.applyTo(s);
    this.mastery.applyTo(s);
    // Level bonuses are a second progression axis, applied after the tree so the two
    // sources compose predictably.
    const lvl = this.progression.bonuses();
    if (lvl.damage > 0) s.change(STATS.damage, StatsProp.Flat, lvl.damage, true);
    if (lvl.health > 0) s.change(STATS.health, StatsProp.Flat, lvl.health, true);
    if (lvl.arrowDamagePercent > 0) {
      s.change(ARROW_DAMAGE_STAT, StatsProp.Additive, lvl.arrowDamagePercent, true);
    }

    const previousMax = this.maxHp;
    this.maxHp = s.get(STATS.health);
    // Heal by however much max HP grew, so a health purchase feels immediate.
    this.hp = Math.min(this.maxHp, this.hp + Math.max(0, this.maxHp - previousMax));
    if (this.hp <= 0) this.hp = this.maxHp;
    this.magazineSize = Math.round(s.get(STATS.mouseMagazineSize));
    this.magazine = Math.min(this.magazineSize, this.magazine);
  }

  /**
   * Rebuilds stats from bases plus the talent tree, then tops the magazine up.
   * Called after a talent purchase.
   */
  refreshStats(): void {
    this.applyBaseStats();
    this.magazine = this.magazineSize;
    this.magazineTimer = 0;
  }

  // Derived reads: always go through the stat bag so buffs apply live.
  private get damage(): number { return this.stats.get(STATS.damage); }
  private get moveSpeed(): number { return this.stats.get(STATS.playerMovementSpeed); }
  private get stopDistance(): number { return this.stats.get(STATS.attackRange); }
  private get attackInterval(): number {
    // PlayerAttackSpeed is attacks/sec in the original; buffs add percentage.
    const base = this.stats.get(STATS.playerAttackSpeed);
    const bonus = this.skills.attackSpeedBonus();
    return 1 / Math.max(0.01, base * (1 + bonus / 100));
  }
  private get critChance(): number { return this.stats.get(STATS.criticalChance); }
  private get critMultiplier(): number { return this.stats.get(STATS.criticalMultiplier); }

  // -------------------------------------------------------------------------
  // Level lifecycle
  // -------------------------------------------------------------------------

  /**
   * `PrepareRun` + `StartRun`. `resume` keeps cleared packs (the original's
   * post-death behaviour: only uncleared packs respawn).
   */
  startLevel(level: number, resume: boolean): void {
    this.level = level;
    // The original only spawns real packs at `FirstPackPosition` once the
    // archer companion is unlocked; before that it pushes them out to
    // `NoSpawnArcherPackPosition` so the level opens with a walk. Level 1 has no
    // companion, so it uses the far position, as the shipping game does.
    const useEarlyPacks = !this.archerSpawned;
    const plan = planRun(level, this.defeatedGuardians, useEarlyPacks);
    this.packs = plan.packs;
    this.portalX = plan.portalX;
    this.portalPackSize = plan.portalPackSize;

    if (!resume) {
      this.clearedPacks.clear();
      this.enemies.length = 0;
      this.arrows.length = 0;
      this.projectiles.length = 0;
      this.shots.length = 0;
      this.portal = null;
            this.summonTimer = 0;
    } else {
      // Drop surviving enemies; packs regenerate fresh from the plan.
      this.enemies.length = 0;
      this.arrows.length = 0;
      this.projectiles.length = 0;
      this.shots.length = 0;
      this.portal = null;
            this.summonTimer = 0;
    }

    this.px = WORLD.playerStartX;
    this.py = WORLD.playerStartY;
    this.maxHp = this.stats.get(STATS.health);
    this.hp = this.maxHp;
    this.magazine = this.magazineSize;
    this.magazineTimer = 0;
    this.skills.reset();
    this.runState = 'running';
    this.deathTimer = 0;

    this.spawnAllPacks();
  }

  private spawnAllPacks(): void {
    // Test-only switch: leave the level empty so the player can be observed without
    // incoming damage moving the same numbers.
    if (this.spawnNothing) return;
    for (const pack of this.packs) {
      if (this.clearedPacks.has(pack.packId)) continue;
      if (pack.isGuardianPack) {
        this.spawnGuardian(pack);
      } else {
        this.spawnPack(pack);
      }
    }
    this.spawnPortal();
  }

  private spawnPack(pack: PackPlan): void {
    const count = pack.enemyCount;
    const half = packHalfWidth(count);
    const healthBase = enemyHealth(this.level) * this.stats.get(STATS.enemyHealthMultiplier);
    const damageBase = enemyDamage(this.level) * this.stats.get(STATS.enemyDamageMultiplier);
    const goldBase = enemyGold(this.level);
    const weights = enemyWeightsForLevel(this.level);
    const totalWeight = weights.reduce((a, [, w]) => a + w, 0);

    // One golden roll per pack, and `EnemiesManager` gives the pack at most one golden
    // enemy, so the winner is decided before the loop rather than per enemy.
    const goldenRoll = this.rollGolden(Math.max(0, pack.packId - 1));
    const goldenIndex = goldenRoll.golden ? Math.floor(this.rng.next() * Math.max(1, count)) : -1;

    for (let i = 0; i < count; i++) {
      // Weighted archetype pick.
      let roll = this.rng.next() * totalWeight;
      let type: EnemyType = 'Claw';
      for (const [t, w] of weights) {
        roll -= w;
        if (roll <= 0) { type = t; break; }
      }
      const def = ENEMIES[type];
      // Scatter across the pack band, exactly as CreateASinglePack does.
      const x = this.rng.range(pack.centerX, pack.centerX + half);
      const y = this.rng.range(WORLD.minY, WORLD.maxY);
      const hp = healthBase * def.healthMultiplier;
      this.enemies.push({
        type,
        x,
        y,
        hp,
        maxHp: hp,
        speed: def.speed,
        attackRange: def.attackRange,
        attackCooldown: def.attackCooldown,
        attackTimer: this.rng.range(0, def.attackCooldown),
        attackKind: def.attackKind,
        radius: def.radius,
        color: def.color,
        damage: damageBase * def.damageMultiplier,
        gold: goldBase,
        packId: pack.packId,
        isPortal: false,
        isGuardian: false,
        golden: i === goldenIndex,
        champion: i === goldenIndex && goldenRoll.champion,
        laneOffset: this.rng.range(-40, 40),
        hitFlash: 0,
        alive: true,
      });
    }
  }

  /**
   * Spawns a single enemy of `type` at `x`. Test-only: it makes a kill's gold and currency
   * exactly attributable, which a full 9-enemy pack does not.
   */
  spawnEnemyForTest(type: EnemyType, x: number): void {
    const def = ENEMIES[type];
    const hp = enemyHealth(this.level) * def.healthMultiplier * this.stats.get(STATS.enemyHealthMultiplier);
    this.enemies.push({
      type,
      x,
      y: WORLD.minY,
      hp,
      maxHp: hp,
      speed: def.speed,
      attackRange: def.attackRange,
      attackCooldown: def.attackCooldown,
      attackTimer: def.attackCooldown,
      attackKind: def.attackKind,
      radius: def.radius,
      color: def.color,
      damage: 0,
      gold: enemyGold(this.level),
      packId: -3,
      isPortal: false,
      isGuardian: false,
      laneOffset: 0,
      hitFlash: 0,
      alive: true,
    });
  }

  private spawnGuardian(pack: PackPlan): void {
    // Each Guardian is its own `EnemyInfo`, so the pack carries which one this level owes
    // rather than the port funnelling all five through a single `Guardian` bucket.
    const type: EnemyType = pack.guardianType ?? 'GuardianClaw';
    const def = ENEMIES[type];
    const hp = enemyHealth(this.level) * def.healthMultiplier * this.stats.get(STATS.enemyHealthMultiplier);
    this.enemies.push({
      type,
      x: pack.centerX,
      y: (WORLD.minY + WORLD.maxY) / 2,
      hp,
      maxHp: hp,
      speed: def.speed,
      attackRange: def.attackRange,
      attackCooldown: def.attackCooldown,
      attackTimer: def.attackCooldown,
      attackKind: def.attackKind,
      radius: def.radius,
      color: def.color,
      damage: enemyDamage(this.level) * def.damageMultiplier * this.stats.get(STATS.enemyDamageMultiplier),
      gold: enemyGold(this.level) * 40,
      packId: pack.packId,
      isPortal: false,
      isGuardian: true,
      laneOffset: 0,
      hitFlash: 0,
      alive: true,
    });
  }

  private spawnPortal(): void {
    const def = ENEMIES.RunPortal;
    const hp = enemyHealth(this.level) * def.healthMultiplier;
    const portal: Enemy = {
      type: 'RunPortal',
      x: this.portalX,
      y: WORLD.playerStartY + 40,
      hp,
      maxHp: hp,
      speed: 0,
      attackRange: 0,
      attackCooldown: 999,
      attackTimer: 999,
      attackKind: 'melee',
      radius: def.radius,
      color: def.color,
      damage: 0,
      gold: enemyGold(this.level) * 60,
      packId: -1,
      isPortal: true,
      isGuardian: false,
      laneOffset: 0,
      hitFlash: 0,
      alive: true,
    };
    this.portal = portal;
    this.enemies.push(portal);
    // The summon countdown starts only once every pack is down; `stepPortal`
    // kicks it off the first frame that becomes true.
    this.summonTimer = 0;
    this.summonStarted = false;
  }

  // -------------------------------------------------------------------------
  // Frame
  // -------------------------------------------------------------------------

  update(dt: number, input: InputState): void {
    if (this.runState === 'dead') {
      this.deathTimer += dt;
      if (this.deathTimer > 1.2) {
        // Respawn at the level start, keeping cleared packs.
        this.startLevel(this.level, true);
      }
      this.stepPuffs(dt);
      return;
    }

    this.skills.update(dt);

    // --- player aim & fire ---
    // Drain every queued tap. Capped so a stalled frame (tab switch, GC pause)
    // cannot translate a burst of buffered input into emptying the whole magazine
    // at one aim point.
    const MAX_TAPS_PER_STEP = 5;
    for (let i = 0; i < MAX_TAPS_PER_STEP && input.taps > 0; i++) {
      if (!this.freeAimArrow(input)) break;
      input.taps--;
    }
    // Discard whatever is left rather than carrying it into the next step: a tap the
    // magazine could not serve must not be banked and fire later. This clearing lives
    // here, not in the input layer, because the input layer runs BEFORE this and would
    // drop taps that arrived between frames (see `AimInput.update`).
    input.taps = 0;

    this.stepPlayer(dt);
    this.stepMagazine(dt);
    this.stepAutoFire(dt);
    this.stepPets(dt);
    this.stepEnemies(dt);
    this.stepArrows(dt);
    this.stepProjectiles(dt);
    this.stepShots(dt);
    this.stepCoins(dt, input);
    this.stepPuffs(dt);

    // --- pack clearing ---
    for (const pack of this.packs) {
      if (this.clearedPacks.has(pack.packId)) continue;
      const anyAlive = this.enemies.some((e) => e.alive && e.packId === pack.packId);
      if (!anyAlive) {
        this.clearedPacks.add(pack.packId);
        // First pack cleared starts the portal's summon countdown, as
        // `SpawnManager_Co` does once only the portal is left standing.
        this.skills.extendBuffs(0.5);
      }
    }

    this.stepPortal(dt);

    if (this.hp <= 0 && this.runState === 'running') {
      this.runState = 'dead';
      this.deathTimer = 0;
      this.skills.endAllBuffs();
    }
  }

  private stepPlayer(dt: number): void {
    const nearest = this.nearestEnemyAhead();
    const dist = nearest ? nearest.x - this.px : Number.POSITIVE_INFINITY;
    const inRange = dist <= this.stopDistance;
    const canAttackWhileMoving = this.stats.get(STATS.attackRange) > BASE.maxAttackRange;

    // The portal is also something to stop for. Without this the character walks
    // straight past the end of the level once the last pack dies, because
    // `nearestEnemyAhead` has nothing left to report.
    const portalDist = this.portal && this.portal.alive ? this.portalX - this.px : Number.POSITIVE_INFINITY;
    const atPortal = portalDist <= this.stopDistance;

    if ((inRange || atPortal) && !canAttackWhileMoving) {
      // Stop and fight, exactly like CharacterManager.Update().
      this.moving = false;
    } else {
      this.moving = true;
      this.px += this.moveSpeed * dt * this.facing;
    }

    // Never walk through the portal, whatever else happens.
    if (this.portal && this.portal.alive) {
      const ceiling = this.portalX - this.stopDistance * 0.5;
      if (this.px > ceiling) this.px = ceiling;
    }

    // Health regen.
    //
    // `PlayerManager.Update` heals the `HealthRegen` stat once every
    // `HealthRegenEverySecond` **seconds** - the constant is a PERIOD, not a rate:
    //
    //   healthRegenTimer += Time.deltaTime;
    //   if (healthRegenTimer < HealthRegenEverySecond) return;   // wait 5s
    //   healthRegenTimer = 0f;
    //   CurrentHealth += HealthRegen.Total.RealValue;
    //
    // An earlier revision applied `regen * dt` every frame, i.e. 5 HP per second, and
    // the bar visibly filled itself. The real numbers are 1 HP per 5s (the `HealthRegen`
    // flat value in a level-3 save is 1.0), so that was 25x too fast.
    this.healthRegenTimer += dt;
    if (this.healthRegenTimer >= BASE.healthRegenPeriodSeconds) {
      // Reset rather than subtract, matching the original.
      this.healthRegenTimer = 0;
      const regen = this.stats.get(STATS.healthRegen);
      if (this.runState !== 'dead' && this.hp < this.maxHp) {
        this.hp = Math.min(this.maxHp, this.hp + regen);
      }
    }
  }

  private stepMagazine(dt: number): void {
    if (this.magazine >= this.magazineSize) {
      this.magazineTimer = 0;
      return;
    }
    const regen = Math.max(0.05, this.stats.get(STATS.mouseMagazineRegenTime));
    this.magazineTimer += dt;
    while (this.magazineTimer >= regen && this.magazine < this.magazineSize) {
      this.magazineTimer -= regen;
      this.magazine++;
    }
  }

  /**
   * The archer's own attack: a real arrow that flies from the bow to the target.
   *
   * This is deliberately NOT the tapped arrow-fall. The original has two separate
   * attacks - the archer shoots arrows from his bow automatically, and the player's
   * tap calls down an arrow rain. Modelling both as falling arrows was wrong and
   * made the character look like he never used his bow.
   */
  private stepAutoFire(dt: number): void {
    if (this.moving) {
      this.fireTimer = 0;
      return;
    }
    this.fireTimer += dt;
    const interval = this.attackInterval;
    while (this.fireTimer >= interval) {
      this.fireTimer -= interval;
      // `CharacterAttacker.Fire` in order: a ready buff goes up first, then the best ready
      // `isShotByArcher` skill takes the shot, then the probability-driven passives get
      // their roll, and only if none of those fire does the plain bow shot go out.
      this.tryCastReadyBuff();
      if (this.tryFireShotSkill()) continue;
      if (this.tryFirePassiveSkill()) continue;
      const target = this.nearestEnemyAhead();
      if (!target) break;
      this.shootArrowAt(target);
    }
    this.pollNonShotSkills(dt);
  }

  /** `CharacterAttacker.TryCastReadyBuffSkills` — a buff goes up the moment it is ready. */
  private tryCastReadyBuff(): void {
    const id = this.skills.nextBuff();
    if (id) this.castSkill(id);
  }

  /** The archer's auto-attack uses the highest-priority ready shot skill, if any. */
  private tryFireShotSkill(): boolean {
    const id = this.skills.nextShot();
    return id != null && this.castSkill(id);
  }

  /**
   * `CharacterAttacker.cs:149-154`: with no shot skill ready, the passives are rolled in a
   * fixed order — lightning, then fire, then blizzard — and the first hit wins. Each
   * chance is a real `PlayerStatsData` stat, so the tree can raise it.
   */
  private tryFirePassiveSkill(): boolean {
    const order: Array<[string, string]> = [
      ['LightningStrike', 'ChanceForLightningStrike'],
      ['FireArea', 'ChanceForFireArea'],
      ['Blizzard', 'ChanceForBlizzard'],
    ];
    for (const [id, chanceStat] of order) {
      if (this.jobs.level(id) <= 0) continue;
      if (this.rng.next() * 100 >= this.stats.get(chanceStat)) continue;
      return this.castSkill(id, { passive: true });
    }
    return false;
  }

  /**
   * `CharacterAttacker.CallNonShotSkills`: the skills that are neither shots nor buffs
   * (SniperScope, BatSwarm) are polled on a 0.5s timer rather than driven by the attack.
   */
  private pollNonShotSkills(dt: number): void {
    this.nonShotTimer += dt;
    if (this.nonShotTimer < NON_SHOT_POLL) return;
    this.nonShotTimer = 0;
    const id = this.skills.nextCast();
    if (id) this.castSkill(id);
  }

  private nonShotTimer = 0;

  /**
   * Summoned pets and tamed monsters.
   *
   * `PetsManager.Update` re-summons a pet the moment its slot frees up, and pets are
   * cleared at the start of a run; `TamingManager` keeps tames across a run, so `tamed`
   * survives level changes while `pets` is rebuilt.
   */
  private pets: Pet[] = [];
  private tamed: TamedMinion[] = [];
  private summonGap = 0;
  /** `TamingManager.nextTameGuaranteed` — the first tame after the chance stat opens. */
  private tameGuaranteed = false;
  private tameChanceWasZero = true;

  /** `PetsManager.PetsShouldExist()`. */
  private get archerSpawned(): boolean {
    return this.archerSpawnCount >= ARCHER_SPAWN_GATE;
  }

  /**
   * Pets and tames: summon, chase, and strike.
   *
   * `PetSelfer` only considers enemies AHEAD of the player and within
   * `PET_ENGAGE_DISTANCE`, stops once inside its own attack range, and otherwise chases at
   * `PlayerMovementSpeed * 1.25`.
   */
  private stepPets(dt: number): void {
    this.summonGap = Math.max(0, this.summonGap - dt);
    this.stepTaming();

    const petSpeed = this.stats.get(STATS.playerMovementSpeed) * PET_CHASE_SPEED_MULTIPLIER;

    for (const pet of this.pets) {
      if (!pet.alive) continue;
      pet.attackTimer = Math.max(0, pet.attackTimer - dt);

      const target = this.petTarget(pet);
      const range = petAttackRange(pet.id);
      if (target && Math.abs(target.x - pet.x) <= range) {
        // In range: stand and swing. `PetSelfer.cs:491` also wants vertical alignment,
        // which on a flat lane is always satisfied.
        pet.engaged = true;
        pet.facing = target.x >= pet.x ? 1 : -1;
        if (pet.attackTimer <= 0) {
          pet.attackTimer = petAttackInterval(pet.id);
          this.petStrike(pet, target);
        }
      } else {
        pet.engaged = false;
        // Falcon has a 1800-unit reach and never lands, so it simply hovers.
        if (!petIsUntargetable(pet.id)) {
          const goal = target ? target.x - range * 0.75 : this.px - 60;
          const step = Math.sign(goal - pet.x) * petSpeed * dt;
          if (Math.abs(goal - pet.x) > 4) {
            pet.x += step;
            pet.facing = step >= 0 ? 1 : -1;
          }
        }
        pet.y = WORLD.groundY;
      }
      if (pet.hp <= 0) this.killPet(pet);
    }

    this.pets = this.pets.filter((p) => p.alive);
    this.tamed = this.tamed.filter((t) => t.alive);
    this.stepTamed(dt, petSpeed);
  }

  /** `PetsManager.Update`: one summon attempt per `SUMMON_GAP`, slot empty and off cooldown. */
  private stepTaming(): void {
    if (this.summonGap > 0) return;
    const id = nextSummon(
      this.jobs,
      this.archerSpawned,
      (pid) => this.pets.some((p) => p.alive && p.id === pid),
      (pid) => this.skills.get(pid)?.cooldownLeft ?? 0,
    );
    if (!id) return;
    this.summonGap = SUMMON_GAP;
    const maxHp = petMaxHp(id, this.jobs, this.maxHp, this.stats.get('PetHealthMultiplier') || 1);
    this.pets.push({
      id,
      x: this.px - 40,
      y: WORLD.groundY,
      hp: maxHp,
      maxHp,
      attackTimer: 0,
      alive: true,
      engaged: false,
      facing: 1,
    });
  }

  /** `PetSelfer.cs:933`: a dead pet writes its own cooldown back. */
  private killPet(pet: Pet): void {
    pet.alive = false;
    const r = this.skills.get(pet.id);
    if (r) r.cooldownLeft = this.skills.cooldownFor(pet.id);
  }

  /** The nearest enemy ahead within `PET_ENGAGE_DISTANCE`, preferring the pet's own rules. */
  private petTarget(pet: Pet): Enemy | null {
    let best: Enemy | null = null;
    let bestDist = Number.POSITIVE_INFINITY;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.isPortal) continue;
      const d = e.x - this.px;
      if (d < 0 || d > PET_ENGAGE_DISTANCE) continue;
      const dist = Math.abs(e.x - pet.x);
      if (dist < bestDist) {
        bestDist = dist;
        best = e;
      }
    }
    return best;
  }

  /** Damage lands `GetNumberOfHitsForLevel` times, each scaled by the pet's own curve. */
  private petStrike(pet: Pet, target: Enemy): void {
    const hits = petNumberOfHits(pet.id, this.jobs);
    const per = this.damage * petDamageMultiplier(pet.id, this.jobs);
    for (let i = 0; i < hits; i++) {
      if (!target.alive) break;
      this.damageEnemy(target, per, false);
    }
    // Falcon's dive is area-of-effect in the original (`Falcon_AttackRadius` x 10 units).
    const d = this.jobs.def(pet.id);
    if (d && d.petAttackRadius > 0) {
      const radius = d.petAttackRadius * ONE_GAME_UNIT;
      for (const e of this.enemies) {
        if (!e.alive || e === target || e.isPortal) continue;
        if (Math.abs(e.x - target.x) <= radius) this.damageEnemy(e, per, false);
      }
    }
    this.puffs.push({
      x: target.x,
      y: target.y + 20,
      vx: 0,
      vy: 0,
      life: 0.2,
      maxLife: 0.2,
      color: 0xbfe6ff,
      radius: 14,
    });
  }

  /** Tamed monsters behave like their wild selves but fight for the player. */
  private stepTamed(dt: number, speed: number): void {
    for (const t of this.tamed) {
      if (!t.alive) continue;
      t.attackTimer = Math.max(0, t.attackTimer - dt);
      const def = ENEMIES[t.type];
      const range = def?.attackRange ?? 110;
      const target = this.petTarget({ id: 'tame', x: t.x } as Pet);
      if (target && Math.abs(target.x - t.x) <= range) {
        if (t.attackTimer <= 0) {
          t.attackTimer = 1 / Math.max(0.05, def?.attackCooldown ? 1 / def.attackCooldown : 0.5);
          this.damageEnemy(target, this.damage * TAMING.damageMultiplier, false);
        }
      } else {
        const goal = target ? target.x - range * 0.75 : this.px - 80 + t.offset;
        if (Math.abs(goal - t.x) > 4) t.x += Math.sign(goal - t.x) * speed * dt;
      }
    }
  }

  /**
   * `TamingManager`: a tameable monster that dies may instead join you, gated on
   * `MaxTames`, `ChanceToTameEnemiesOnDeath` and the `0.8^active` falloff, with the first
   * one after the chance stat opens guaranteed.
   */
  private tryTame(e: Enemy): void {
    const def = ENEMIES[e.type];
    if (!def?.tameable) return;
    const chanceStat = this.stats.get(STATS.chanceToTameEnemiesOnDeath);
    if (chanceStat <= 0 && this.tameChanceWasZero) return;
    if (this.tameChanceWasZero && chanceStat > 0) {
      this.tameGuaranteed = true;
      this.tameChanceWasZero = false;
    }
    const maxTames = Math.max(1, Math.round(this.stats.get(STATS.maxTames) || TAMING.maxTames));
    if (!rollTame(this.tamed.length, maxTames, chanceStat, this.tameGuaranteed, () => this.rng.next())) {
      return;
    }
    this.tameGuaranteed = false;
    const maxHp = this.maxHp * TAMING.healthMultiplier;
    this.tamed.push({
      type: e.type,
      x: e.x,
      y: WORLD.groundY,
      hp: maxHp,
      maxHp,
      attackTimer: 0,
      alive: true,
      offset: this.rng.range(-60, 60),
    });
    this.skillCasts.push({ skillId: 'Tame', buff: false, duration: 1.2 });
  }

  /** Pets and tames, for the renderer. */
  getPetList(): readonly Pet[] { return this.pets; }
  getTamedList(): readonly TamedMinion[] { return this.tamed; }

  /** Fires one travelling arrow from the bow toward an enemy. */
  private shootArrowAt(target: Enemy): void {
    const bx = this.px + BOW_OFFSET_X;
    const by = this.py + BOW_OFFSET_Y;
    const dx = target.x - bx;
    const dy = target.y - by;
    const len = Math.hypot(dx, dy) || 1;
    // 950 units/s: fast enough to feel like an arrow, slow enough to be seen.
    // At 1500 the shot crossed the whole frame in about 0.2s and was easy to miss.
    const speed = 950;
    const crit = this.rng.next() * 100 < this.critChance;
    const dmg = crit ? this.damage * (1 + this.critMultiplier / 100) : this.damage;
    this.projectiles.push({
      x: bx,
      y: by,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      damage: dmg,
      crit,
      life: 0,
    });
    this.bowFlash = 0.12;
  }

  // -------------------------------------------------------------------------
  // Player actions
  // -------------------------------------------------------------------------

  /**
   * Tap/drag to drop an arrow at a world point. Costs one magazine round.
   * Returns false when the magazine was empty, so the caller can stop draining.
   */
  private freeAimArrow(input: InputState): boolean {
    if (this.magazine <= 0) {
      // Counted separately from a successful shot so `?stats=1` can tell an empty
      // magazine apart from a tap that never reached the game.
      this.shotsBlocked++;
      return false;
    }
    this.magazine--;
    this.shotsFired++;
    // Mouse arrows hit harder than the archer's own, matching ArrowFall's
    // dominance in the original's damage logs.
    const dmg = this.damage * this.arrowDamageMultiplier;
    const hits = Math.max(1, Math.round(this.stats.get(STATS.mouseNumberOfHits)));
    // `MouseChanceForAnotherHit` gives a chance of one extra arrow at the same point.
    const extra = this.rng.next() * 100 < this.stats.get(STATS.mouseChanceForAnotherHit) ? 1 : 0;
    for (let i = 0; i < hits + extra; i++) {
      const jitterX = i === 0 ? 0 : randRange(-70, 70);
      const jitterY = i === 0 ? 0 : randRange(-40, 40);
      this.spawnArrow(input.aimX + jitterX, input.aimY + jitterY, dmg, ARROW_BLAST_RADIUS, 'mouse');
    }
    return true;
  }

  /**
   * Cast a skill. Returns true if it actually fired.
   *
   * The damage a skill deals is `GetTotalDamage() * GetDamageMultiplierForLevel(level)`
   * (`PlayerStatsData.SkillsMultiplier`, keyed on the projectile's `functionName`), and it
   * lands `GetNumberOfHitsForLevel(level)` times. Both curves come straight off the
   * `JobSkillInfo` asset, so a skill's real numbers drive this rather than a hand-tuned
   * constant.
   *
   * Only the four manual kinds are castable here. `passive` skills have no button - they
   * replace the auto-attack on a probability (`CharacterAttacker.cs:149-154`) - and `pet`
   * skills are summoned by the pet manager, not clicked.
   */
  castSkill(id: SkillId, opts: { passive?: boolean } = {}): boolean {
    const def = SKILLS[id];
    if (!def || def.isPet) return false;
    // A `passive` skill has no button; it is fired by the auto-attack's probability roll
    // instead, which is what `opts.passive` marks.
    if (def.isPassive && !opts.passive) return false;
    if (!this.skills.cast(id)) return false;

    // Always announce the cast. A skill that hits nothing off-screen must still
    // give feedback, otherwise the button looks dead.
    this.skillCasts.push({ skillId: id, buff: def.isBuff, duration: 1.2 });

    const mult = this.jobs.damageMultiplierOf(id);
    const hits = this.jobs.numberOfHitsOf(id);
    const dmg = this.damage * mult;

    /** Fires `hits` arrows at the same point, which is how `numberOfHits` reads. */
    const strike = (x: number, y: number, radius: number, source: Arrow['source']): void => {
      for (let h = 0; h < Math.max(1, hits); h++) this.spawnArrow(x, y, dmg, radius, source);
    };

    const alive = this.enemies.filter((e) => e.alive && !e.isPortal);
    switch (id) {
      case 'Multishot': {
        // A short fan over the nearest few targets; the count is the tree-grantable
        // `Multishot_NumberOfProjectiles`, whose base is 3.
        const count = Math.max(1, Math.round(this.stats.get(STATS.multishotNumberOfProjectiles)));
        const targets = this.nearestEnemies(count);
        for (let i = 0; i < count; i++) {
          const t = targets[i] ?? targets[targets.length - 1];
          if (!t) break;
          strike(t.x, t.y, 52, 'multishot');
        }
        break;
      }
      case 'BombArrow': {
        // `CharacterAttacker.cs:180`: the aim is forced onto the ground line, and the blast
        // radius is `BombArrow_RadiusOfEffect` game units x `OneGameUnitToUnityUnit`.
        const t = alive[0];
        if (!t) break;
        const radius = this.stats.get(STATS.bombArrowRadiusOfEffect) * ONE_GAME_UNIT;
        strike(t.x, WORLD.groundY, radius, 'skill');
        break;
      }
      case 'PiercingShot':
      case 'DarkMatter': {
        // `CharacterAttacker.cs:240`: fired flat, straight ahead, through everything.
        const t = alive[0];
        if (!t) break;
        const pierce = this.jobs.def(id)?.pierceCounts.length
          ? this.pierceCountOf(id) : 0;
        const hitsOnLine = alive.filter((e) => e.x >= this.px && e.x <= t.x + 900);
        const line = hitsOnLine.length ? hitsOnLine : [t];
        for (const e of line.slice(0, Math.max(1, pierce + 1))) {
          strike(e.x, e.y, 40, 'pierce');
        }
        break;
      }
      case 'SuperNova': {
        // `SkillsManager.SpawnSuperNova`: every visible enemy takes it, bosses extra.
        for (const e of alive) strike(e.x, e.y, 120, 'nova');
        break;
      }
      case 'SniperScope':
      case 'BatSwarm': {
        // `CallNonShotSkills` skills: a multi-hit strike on the nearest target, widening to
        // everything in radius when the skill's area stat is up.
        const t = alive[0];
        if (!t) break;
        strike(t.x, t.y, 70, 'skill');
        break;
      }
      default:
        // Buffs need no projectile; `skills.cast` already started the buff timer.
        break;
    }
    return true;
  }

  /** `PiercingShot_PierceCount` at the current level, from the skill's own curve. */
  private pierceCountOf(id: SkillId): number {
    const list = this.jobs.def(id)?.pierceCounts ?? [];
    if (!list.length) return 0;
    const lvl = Math.max(1, this.jobs.level(id));
    return list[Math.max(0, Math.min(lvl - 1, list.length - 1))];
  }

  private spawnArrow(toX: number, toY: number, damage: number, radius: number, source: Arrow['source']): void {
    // Crit first, then the tree's double/triple damage rolls, which the original applies
    // as separate chances (`ChanceForDoubleDamage` / `ChanceForTripleDamage`).
    const crit = this.rng.next() * 100 < this.critChance;
    let dmg = crit ? damage * (1 + this.critMultiplier / 100) : damage;
    if (this.rng.next() * 100 < this.stats.get(STATS.chanceForTripleDamage)) dmg *= 3;
    else if (this.rng.next() * 100 < this.stats.get(STATS.chanceForDoubleDamage)) dmg *= 2;
    // `ExplosiveArrows_RadiusOfEffect` widens the blast, in game units like the original.
    const blast = radius + this.stats.get(STATS.explosiveArrowsRadius) * 10;
    // Launch just above the visible top edge so the arrow falls in from off-screen -
    // which is how `ArrowFall` reads in the original - while the descent stays on screen.
    //
    // `WORLD.viewHeight` is the ART frame's height (600), not the visible world height
    // (1080), so it cannot be used to find the top of the view. The visible top comes
    // from the camera: the feet row is `playerScreenFraction` of `visibleWorldHeight`
    // above the ground, i.e. 500 units up. Launching from a fixed 800 (as an earlier
    // revision did) put 60% of the flight above the screen once the framing was fixed,
    // so a tap looked like it did nothing.
    const visibleTop = CAMERA.visibleWorldHeight * CAMERA.playerScreenFraction;
    this.arrows.push({
      fromX: toX,
      fromY: Math.max(visibleTop + 60, toY + 160),
      toX,
      toY,
      t: 0,
      // 0.28s was too quick to register: the arrow crossed the frame in a couple
      // of frames on a phone and read as "nothing happened" when a tap landed.
      // 0.5s is still snappy but clearly visible.
      duration: 0.5,
      damage: dmg,
      radius: blast,
      crit,
      source,
    });
  }

  // -------------------------------------------------------------------------
  // Simulation steps
  // -------------------------------------------------------------------------

  private stepEnemies(dt: number): void {
    for (const e of this.enemies) {
      if (!e.alive) continue;
      if (e.hitFlash > 0) e.hitFlash = Math.max(0, e.hitFlash - dt * 4);
      if (e.isPortal) continue;

      const dx = this.px - e.x;
      const dist = Math.abs(dx);
      const targetX = this.px - Math.sign(dx || 1) * e.attackRange * 0.9;

      if (dist > e.attackRange) {
        const dir = Math.sign(dx || 1);
        e.x += dir * e.speed * dt;
        // Drift toward its lane so packs fan out instead of stacking.
        e.y += (e.y + e.laneOffset - e.y) * 0; // lane handled via laneOffset below
      } else {
        e.attackTimer -= dt;
        if (e.attackTimer <= 0) {
          e.attackTimer = e.attackCooldown;
          // `PetsManager.RangedTargetOrder = {Bear, Wolf}` / `MeleeTargetOrder = {Bear}`:
          // the Bear is the party's tank, so anything in reach hits it before the archer.
          // Falcon is excluded outright - `FalconSelfer.IsTargetable => false`.
          const decoy = this.petDecoy(e);
          if (e.attackKind === 'melee') {
            if (decoy) {
              this.damagePet(decoy, e.damage);
            } else {
              this.damagePlayer(e.damage);
            }
            this.emitPuff(e.x, e.y, 0xff6a4a, 26, 0.22);
          } else {
            const tx = decoy ? decoy.x : this.px;
            const ty = decoy ? decoy.y : this.py;
            const px = tx - e.x;
            const py = ty - e.y;
            const len = Math.hypot(px, py) || 1;
            const speed = 420;
            this.shots.push({
              x: e.x,
              y: e.y,
              vx: (px / len) * speed,
              vy: (py / len) * speed,
              damage: e.damage,
              radius: 16,
              color: e.color,
              // Marks the shot as aimed at an ally, so `stepShots` routes it to the pet.
              targetPet: decoy ? decoy.id : null,
            });
          }
        }
      }
      // Keep enemies inside the play band.
      if (e.y < WORLD.minY) e.y = WORLD.minY;
      if (e.y > WORLD.maxY) e.y = WORLD.maxY;
      void targetX;
    }
  }

  /**
   * The pet an enemy should hit instead of the player, if any.
   *
   * `PetSelfer` gives allies `AllyDamageReductionFraction = 0.5` of the player's incoming
   * scaling and floats the Bear to the front; here that reduces to "a taunting pet in
   * reach wins the target". Falcon is never targetable.
   */
  private petDecoy(e: Enemy): Pet | null {
    let best: Pet | null = null;
    for (const p of this.pets) {
      if (!p.alive || petIsUntargetable(p.id)) continue;
      if (Math.abs(p.x - e.x) > e.attackRange + 40) continue;
      if (!best || petIsTaunt(p.id)) best = p;
    }
    return best;
  }

  /** Ally damage is reduced by `AllyDamageReductionFraction`, then may kill the pet. */
  private damagePet(pet: Pet, amount: number): void {
    const dealt = amount * TAMING.allyDamageReductionFraction;
    pet.hp -= dealt;
    this.puffs.push({
      x: pet.x,
      y: pet.y + 30,
      vx: 0,
      vy: 0,
      life: 0.2,
      maxLife: 0.2,
      color: 0xff8a6a,
      radius: 16,
    });
    if (pet.hp <= 0) this.killPet(pet);
  }

  private stepArrows(dt: number): void {
    for (let i = this.arrows.length - 1; i >= 0; i--) {
      const a = this.arrows[i];
      a.t += dt / a.duration;
      if (a.t < 1) continue;

      // Impact: land, damage everything inside the radius, then recycle.
      let hitAny = false;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        const d = Math.hypot(e.x - a.toX, e.y - a.toY);
        if (d <= a.radius + e.radius) {
          this.damageEnemy(e, a.damage, a.crit);
          hitAny = true;
        }
      }
      this.emitPuff(a.toX, a.toY, hitAny ? 0xffd166 : 0x8899aa, hitAny ? 30 : 18, 0.2);
      this.impacts.push({ x: a.toX, y: a.toY, radius: a.radius, source: a.source, missed: !hitAny });
      this.arrows.splice(i, 1);
    }
  }

  /**
   * Advances bow-fired arrows and resolves hits.
   *
   * A hit is a segment-vs-circle test against the previous position, so a fast
   * arrow cannot tunnel through a small enemy between frames.
   */
  private stepProjectiles(dt: number): void {
    if (this.bowFlash > 0) this.bowFlash = Math.max(0, this.bowFlash - dt);
    for (let i = this.projectiles.length - 1; i >= 0; i--) {
      const p = this.projectiles[i];
      const prevX = p.x;
      const prevY = p.y;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life += dt;

      let hit: Enemy | null = null;
      for (const e of this.enemies) {
        if (!e.alive) continue;
        // The portal is a valid target: `damageEnemy` owns the "invulnerable until
        // the packs are down" rule, and the arrow should still visibly connect.
        // Excluding it here silently made the archer unable to damage the portal at
        // all, while the tapped arrow-rain could - an inconsistency, not a design.
        if (segmentHitsCircle(prevX, prevY, p.x, p.y, e.x, e.y + e.radius * 0.5, e.radius + 8)) {
          hit = e;
          break;
        }
      }
      if (hit) {
        this.damageEnemy(hit, p.damage, p.crit);
        this.emitPuff(p.x, p.y, 0xffe3a0, 16, 0.16);
        this.projectiles.splice(i, 1);
        continue;
      }
      // Off-screen, off the top, or flown too long: drop it.
      if (p.life > 2.5 || p.x < this.px - 400 || p.x > this.px + 2600 || p.y > 900 || p.y < -700) {
        this.projectiles.splice(i, 1);
      }
    }
  }

  private stepShots(dt: number): void {
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.x < this.px - 400 || s.x > this.px + 3000 || s.y < WORLD.minY - 600) {
        this.shots.splice(i, 1);
        continue;
      }
      if (s.targetPet) {
        // Aimed at an ally: it can only hit that pet, never the archer behind it.
        const ally = this.pets.find((p) => p.alive && p.id === s.targetPet);
        if (ally && Math.hypot(s.x - ally.x, s.y - ally.y) < 40 + s.radius) {
          this.damagePet(ally, s.damage);
          this.emitPuff(s.x, s.y, s.color, 22, 0.18);
          this.shots.splice(i, 1);
        }
        continue;
      }
      if (Math.hypot(s.x - this.px, s.y - this.py) < 40 + s.radius) {
        this.damagePlayer(s.damage);
        this.emitPuff(s.x, s.y, s.color, 22, 0.18);
        this.shots.splice(i, 1);
      }
    }
  }

  /**
   * Spawns one ground drop at `(fromX, fromY)`, mirroring `LootDropSelfer.Initialize`.
   *
   * The burst is deterministic given the same RNG: a sideways drift of 40..90 units in a
   * random direction, a pop of 60..90 units, a rise of 0.09s and a fall of 0.21s - and
   * when the drop has to fall further than it rose, `Initialize` scales both the speeds
   * and the durations by `sqrt(speed / 75)` and stretches the drift to match.
   */
  private spawnDrop(
    fromX: number,
    fromY: number,
    currency: DropCurrency,
    value: number,
  ): void {
    let drift = (this.rng.next() < 0.5 ? 1 : -1) * this.rng.range(40, 90);
    let upSpeed = this.rng.range(60, 90);
    const landY = WORLD.groundY;
    let riseTime = 0.09;
    let fallTime = 0.21;

    const fall = fromY - landY;
    if (fall > 0) {
      upSpeed += fall * 0.3;
      const total = upSpeed + fall;
      riseTime *= Math.sqrt(upSpeed / 75);
      fallTime *= Math.sqrt(total / 75);
      drift *= (riseTime + fallTime) / 0.3;
    }

    this.coins.push({
      baseX: fromX,
      baseY: fromY,
      landX: fromX + drift,
      landY,
      peakY: fromY + upSpeed,
      riseTime,
      fallTime,
      age: 0,
      x: fromX,
      y: fromY,
      value,
      currency,
      collected: false,
    });
  }

  private stepCoins(dt: number, input?: InputState): void {
    for (let i = this.coins.length - 1; i >= 0; i--) {
      const c = this.coins[i];
      c.age += dt;
      const burst = c.riseTime + c.fallTime;
      let settled = false;

      if (c.age < burst) {
        // Rise: MoveX is Linear across the whole burst, MoveY is OutQuad then InQuad.
        const u = c.age / burst;
        c.x = c.baseX + (c.landX - c.baseX) * u;
        if (c.age < c.riseTime) {
          const v = c.age / c.riseTime;
          c.y = c.baseY + (c.peakY - c.baseY) * (1 - (1 - v) * (1 - v));
        } else {
          const v = (c.age - c.riseTime) / c.fallTime;
          c.y = c.peakY + (c.landY - c.peakY) * (v * v);
        }
      } else {
        settled = true;
        // Idle: a +-8 unit bob, `InOutSine` yoyo with a 1.2s leg.
        c.x = c.landX;
        c.y = c.landY + (DROP_BOB_HEIGHT / 2) * (1 - Math.cos((2 * Math.PI * (c.age - burst)) / (DROP_BOB_SECONDS * 2)));
      }

      // `LootDropSelfer.Update`, first path: the player simply has to get within 80 units.
      let take = this.px + DROP_PICKUP_RADIUS >= c.x;

      // Second path: the pointer is within 40 units of a SETTLED drop. The original
      // requires `isIdleAnimationStarted`, so a drop cannot be snatched out of the air.
      if (!take && settled && input?.hoverActive) {
        const d = Math.hypot(c.x - (input.hoverX ?? 0), c.y - (input.hoverY ?? 0));
        if (d <= DROP_HOVER_RADIUS) take = true;
      }

      if (take) {
        if (c.currency === 'Gold') this.gold += c.value;
        else if (c.currency === 'PortalCurrency') {
          // `PlayerManager.ChangeCurrency` rounds portal currency and reveals its counter
          // through the same `WasCurrencyShownBefore` flag as the families.
          this.portalCurrency += Math.round(c.value);
          if (c.value > 0) this.portalCurrencySeen = true;
        } else {
          this.currencies[c.currency] += c.value;
          // `PlayerManager.ChangeCurrency`: the HUD counter is revealed only by a
          // NON-ZERO gain (`if (Amount > 0.0 && !WasCurrencyShownBefore[c]) ...`). A
          // family that drops 0 before it unlocks must not reveal its counter.
          if (c.value > 0) this.currencySeen[c.currency] = true;
        }
        // The original banks immediately and then flies a UI icon from the drop's
        // position to that currency's counter.
        this.collectedDrops.push({ x: c.x, y: c.y, currency: c.currency });
        this.coins.splice(i, 1);
      }
    }
  }

  /** Collected drops awaiting their fly-to-counter animation. Drained by `main.ts`. */
  readonly collectedDrops: CollectedDrop[] = [];

  private stepPuffs(dt: number): void {
    for (let i = this.puffs.length - 1; i >= 0; i--) {
      const p = this.puffs[i];
      p.life += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy -= 500 * dt;
      if (p.life >= p.maxLife) this.puffs.splice(i, 1);
    }
  }

  /** True once every pack in the plan has been wiped out. */
  private allPacksCleared(): boolean {
    for (const pack of this.packs) {
      if (!this.clearedPacks.has(pack.packId)) return false;
    }
    return true;
  }

  /** Portal countdown and its summon wave, from `SpawnManager_Co`. */
  private stepPortal(dt: number): void {
    const portal = this.portal;
    if (!portal || !portal.alive) return;
    if (!this.allPacksCleared()) return;

    // Start the countdown the first frame the last pack goes down.
    if (!this.summonStarted) {
      this.summonStarted = true;
      this.summonTimer = this.summonDuration;
      this.summonWaveSpawned = false;
    }

    if (this.summonTimer > 0) {
      this.summonTimer = Math.max(0, this.summonTimer - dt);
      // Guarded so the wave can only ever be released once per portal.
      if (this.summonTimer === 0 && !this.summonWaveSpawned) {
        this.summonWaveSpawned = true;
        // Summon the portal wave, centred behind the portal.
        const count = this.portalPackSize;
        const half = packHalfWidth(count);
        const centre = portal.x - SPAWN.portalPackOffset - half;
        const healthBase = enemyHealth(this.level) * this.stats.get(STATS.enemyHealthMultiplier);
        const damageBase = enemyDamage(this.level) * this.stats.get(STATS.enemyDamageMultiplier);
        const weights = enemyWeightsForLevel(this.level);
        const totalWeight = weights.reduce((a, [, w]) => a + w, 0);
        for (let i = 0; i < count; i++) {
          let roll = this.rng.next() * totalWeight;
          let type: EnemyType = 'Claw';
          for (const [t, w] of weights) {
            roll -= w;
            if (roll <= 0) { type = t; break; }
          }
          const def = ENEMIES[type];
          const hp = healthBase * def.healthMultiplier;
          this.enemies.push({
            type,
            x: this.rng.range(centre, centre + half),
            y: this.rng.range(WORLD.minY, WORLD.maxY),
            hp,
            maxHp: hp,
            speed: def.speed,
            attackRange: def.attackRange,
            attackCooldown: def.attackCooldown,
            attackTimer: this.rng.range(0, def.attackCooldown),
            attackKind: def.attackKind,
            radius: def.radius,
            color: def.color,
            damage: damageBase * def.damageMultiplier,
            gold: enemyGold(this.level),
            packId: -2,
            isPortal: false,
            isGuardian: false,
            laneOffset: this.rng.range(-40, 40),
            hitFlash: 0,
            alive: true,
          });
        }
      }
    }
  }

  // -------------------------------------------------------------------------
  // Damage
  // -------------------------------------------------------------------------

  private damageEnemy(e: Enemy, amount: number, crit: boolean): void {
    if (!e.alive) return;
    // The run portal is invulnerable until every pack is down, which is what
    // makes the level a sequence rather than a race to the exit.
    if (e.isPortal && !this.allPacksCleared()) return;
    e.hp -= amount;
    e.hitFlash = 1;
    this.floaters.push({ x: e.x, y: e.y, value: amount, crit });
    if (e.hp <= 0) {
      e.alive = false;
      this.kills++;
      this.emitDeathPuff(e);
      if (e.isGuardian) this.defeatedGuardians.add(e.type);
      // `GoldenDiedBurst_Co`: a golden enemy re-runs the whole reward drop several times.
      if (e.golden) this.goldenExtraSettlements(e, e.champion ? 70 : 45);

      // `PlayerStatsData.IsArcherSpawned` climbs during the tutorial and opens the real
      // pack layout - and the pets - at 10.
      if (this.archerSpawnCount < ARCHER_SPAWN_GATE) this.archerSpawnCount++;

      // `TamingManager`: a tameable monster may get up again on your side.
      this.tryTame(e);

      // Experience, scaled by how tough the archetype was.
      const gained = this.progression.gainExp(expForKill(this.level, e.maxHp));
      this.levelsGained += gained;
      if (gained > 0) {
        // A level-up must take effect immediately, not on the next purchase.
        this.refreshStats();
      }

      // Gems are the scarce currency: guardians only, so they stay meaningful.
      if (e.isGuardian) this.progression.addGems(3);
      if (e.isPortal) this.progression.addGems(1);
      // `MonsterDiedGiveRewards`: gold drops from EVERY kill. `GoldCoinsToDrop` is 1 and
      // `GoldChanceToDrop` is 0 at base, so that is exactly one coin - each coin carries
      // the whole `EnemyGold` amount, it is not a share of it. Both are tree-grantable.
      this.giveKillRewards(e.x, e.y, e.type);

      if (e.isPortal) {
        // `PlayerManager.MonsterDiedGiveRewards`, the `EnemyType.RunPortal` branch: the
        // portal is the ONLY source of PortalCurrency, and it pays exactly 1 the first
        // time each battle level's portal is killed. `ResolvePortalCurrencyDropPosition`
        // then drags the drop to the player when the portal died out of reach, so the
        // reward can never be stranded off-screen.
        const owed = this.portalCurrencyOwed(this.level) ? 1 : 0;
        if (owed > 0) this.portalCurrencyPaid.add(this.level);
        let dropX = e.x;
        if (e.x - this.px > PORTAL_CURRENCY_REACHABLE_DISTANCE) {
          dropX = this.px + PORTAL_CURRENCY_RESCUE_SPAWN_OFFSET_X;
        }
        if (owed > 0) this.spawnDrop(dropX, e.y, 'PortalCurrency', owed);
        this.runState = 'cleared';
      }
    }
  }

  /**
   * `PlayerManager.MonsterDiedGiveRewards`, minus the parts that are not a "reward": gold,
   * the health-potion roll and the family currency.
   *
   * Split out because a golden enemy runs this AGAIN, several times over — see
   * `goldenExtraSettlements`.
   */
  private giveKillRewards(x: number, y: number, type: EnemyType): void {
    const goldDrops = Math.max(0, Math.round(this.stats.get(STATS.goldCoinsToDrop)))
      + rollOver100(this.stats.get(STATS.goldChanceToDrop), this.rng);
    const goldValue = enemyGold(this.level);
    for (let i = 0; i < goldDrops; i++) this.spawnDrop(x, y, 'Gold', goldValue);

    // A health potion, on `ChanceToDropHealthPotion`, healing
    // `HealthPotionRegenPercentage` of MAX health.
    if (this.rng.next() * 100 < this.stats.get(STATS.chanceToDropHealthPotion)) {
      const heal = (this.stats.get(STATS.healthPotionRegenPercentage) / 100) * this.maxHp;
      this.hp = Math.min(this.maxHp, this.hp + heal);
      this.floaters.push({ x, y: y + 40, value: heal, crit: true });
    }

    // The family currency, on its own roll. Each drop is worth the full
    // `EnemyCurrencyDrop`, and higher-tier families are worth far more.
    //
    // Guarded on `amount > 0`: `EnemyCurrencyDrop` returns 0 while a family's row is still
    // below its unlock level, and a 0-value drop is a ball the player can pick up that
    // changes nothing. The original never reaches that state because its chance stat is 0
    // as well, but the guard makes the two independent.
    const family = MONSTER_CURRENCY[type];
    if (family) {
      const amount = enemyCurrencyDrop(this.level, type);
      if (amount > 0) {
        const drops = rollOver100(this.familyCurrencyChance(family), this.rng);
        for (let i = 0; i < drops; i++) this.spawnDrop(x, y, family, amount);
      }
    }
  }

  /**
   * `EnemiesManager.GoldenDiedBurst_Co`: a golden enemy pays out
   * `max(0, GoldenRewardMultiplier * (champion ? GildedChampionRewardMultiplier : 1) - 1)`
   * EXTRA full reward settlements, each scattered within 45 units (70 for a champion).
   *
   * With the shipped numbers that is 4 extra settlements for a golden enemy (5 - 1) and
   * **14 for a Gilded Champion** (5 x 3 - 1), so a champion is worth 15 kills in total.
   */
  private goldenExtraSettlements(e: Enemy, scatter: number): void {
    const base = Math.max(1, Math.round(this.stats.get(STATS.goldenRewardMultiplier) || 5));
    const mult = e.champion ? base * GILDED_CHAMPION_REWARD_MULTIPLIER : base;
    for (let i = 0; i < Math.max(0, mult - 1); i++) {
      const a = this.rng.next() * Math.PI * 2;
      const r = this.rng.next() * scatter;
      this.giveKillRewards(e.x + Math.cos(a) * r, e.y + Math.sin(a) * r, e.type);
    }
  }

  /**
   * `EnemiesManager`: decides whether a pack contains a golden enemy.
   *
   * The rules, all from the code:
   * - gated on `UnlockGoldenEnemies >= 10` (the same `stat >= 10` gate every unlock uses);
   * - at most ONE per pack, and none in a pack that already had one;
   * - the very first golden is guaranteed (`FirstGoldenGranted`), and
   *   `FirstPacksAlwaysContainGolden` makes the first N regular packs contain one;
   * - otherwise `ChanceForGoldenEnemy`, base 0.5%;
   * - a **Gilded Champion** can only come from `MasteryEffects.ConsumeGoldenPackPrime`, so
   *   it never appears from the random roll.
   *
   * Returns the flags to stamp on the pack's enemies.
   */
  private rollGolden(packOrdinal: number): { golden: boolean; champion: boolean } {
    if (this.stats.get(STATS.unlockGoldenEnemies) < 10) return NO_GOLDEN;
    const champion = this.mastery.consumeCharge(PINNACLE_GOLDEN_PACK, true)
      || this.mastery.consumeCharge(PINNACLE_GOLDEN_PACK, false);
    if (champion) {
      this.firstGoldenGranted = true;
      return { golden: true, champion: true };
    }
    const always = Math.max(0, Math.round(this.stats.get(STATS.firstPacksAlwaysContainGolden)));
    if (!this.firstGoldenGranted) {
      this.firstGoldenGranted = true;
      return { golden: true, champion: false };
    }
    if (packOrdinal >= 0 && packOrdinal < always) return { golden: true, champion: false };
    if (this.rng.next() * 100 < this.stats.get(STATS.chanceForGoldenEnemy)) {
      return { golden: true, champion: false };
    }
    return NO_GOLDEN;
  }

  /** `playerData.FirstGoldenGranted`. */
  private firstGoldenGranted = false;

  private damagePlayer(amount: number): void {
    if (this.runState !== 'running') return;
    // `DamageReduction` is a flat percentage off, `DodgeChance` a percentage chance to
    // ignore the hit entirely. Both are tree-granted and both start at 0.
    if (this.rng.next() * 100 < this.stats.get(STATS.dodgeChance)) {
      this.floaters.push({ x: this.px, y: this.py + 60, value: 0, crit: false });
      return;
    }
    const reduction = Math.min(90, Math.max(0, this.stats.get(STATS.damageReduction)));
    const dealt = amount * (1 - reduction / 100);
    this.hp = Math.max(0, this.hp - dealt);
    this.floaters.push({ x: this.px, y: this.py + 60, value: dealt, crit: false });
  }

  // -------------------------------------------------------------------------
  // Queries
  // -------------------------------------------------------------------------

  private nearestEnemyAhead(): Enemy | null {
    let best: Enemy | null = null;
    let bestD = Number.POSITIVE_INFINITY;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = e.x - this.px;
      if (d > 0 && d < bestD) {
        bestD = d;
        best = e;
      }
    }
    return best;
  }

  /** Nearest N enemies to the player, used for multishot targeting. */
  private nearestEnemies(count: number): Enemy[] {
    const alive: Enemy[] = [];
    for (const e of this.enemies) if (e.alive) alive.push(e);
    alive.sort((a, b) => Math.hypot(a.x - this.px, a.y - this.py) - Math.hypot(b.x - this.px, b.y - this.py));
    return alive.slice(0, count);
  }

  // -------------------------------------------------------------------------
  // Presentation helpers
  // -------------------------------------------------------------------------

  private emitPuff(x: number, y: number, color: number, radius: number, life: number): void {
    for (let i = 0; i < 4; i++) {
      const p: Puff = {
        x,
        y,
        vx: randRange(-160, 160),
        vy: randRange(-40, 220),
        life: 0,
        maxLife: life,
        color,
        radius: radius * randRange(0.6, 1.2),
      };
      this.puffs.push(p);
      this.spawnPuffs.push(p);
    }
  }

  private emitDeathPuff(e: Enemy): void {
    const n = e.isGuardian ? 14 : e.isPortal ? 20 : 6;
    for (let i = 0; i < n; i++) {
      const p: Puff = {
        x: e.x,
        y: e.y,
        vx: randRange(-320, 320),
        vy: randRange(-100, 420),
        life: 0,
        maxLife: 0.5,
        color: e.color,
        radius: e.radius * randRange(0.35, 0.8),
      };
      this.puffs.push(p);
      this.spawnPuffs.push(p);
    }
  }

  // Read-only views for the renderer.
  getEnemyList(): readonly Enemy[] { return this.enemies; }
  getArrowList(): readonly Arrow[] { return this.arrows; }
  getProjectileList(): readonly Projectile[] { return this.projectiles; }
  getShotList(): readonly EnemyShot[] { return this.shots; }
  getCoinList(): readonly Coin[] { return this.coins; }
  getPuffList(): readonly Puff[] { return this.puffs; }

  // -------------------------------------------------------------------------
  // UI snapshot
  // -------------------------------------------------------------------------

  snapshot(): Snapshot {
    const total = this.packs.length;
    const cleared = this.clearedPacks.size;
    const portal = this.portal;
    const portalVisible = portal != null && portal.alive && this.allPacksCleared();
    let portalPhase: Snapshot['portalPhase'] = 'dormant';
    if (portalVisible) {
      portalPhase = this.summonTimer > 0 ? 'summoning' : 'vulnerable';
    }
    return {
      playerX: this.px,
      playerY: this.py,
      playerHp: this.playerHpForUi(),
      playerMaxHp: this.maxHp,
      level: this.level,
      gold: Math.floor(this.gold),
      currencies: { ...this.currencies },
      currencySeen: { ...this.currencySeen },
      portalCurrency: this.portalCurrency,
      portalCurrencySeen: this.portalCurrencySeen,
      gems: this.progression.gems,
      playerLevel: this.progression.level,
      playerExp: this.progression.exp,
      playerExpNeeded: this.progression.xpNeeded(),
      playerExpFraction: this.progression.fraction(),
      kills: this.kills,
      packsCleared: cleared,
      packsTotal: total,
      magazine: this.magazine,
      magazineSize: this.magazineSize,
      magazineFraction: this.magazineSize > 0 ? this.magazine / this.magazineSize : 0,
      // Progress of the NEXT arrow's regeneration, 0..1. This is what the original
      // draws as a radial fill on CooldownImage; the pip row alone loses it.
      magazineRegenFraction: this.magazineRegenFraction(),
      portalActive: portalVisible,
      portalHp: portal ? Math.max(0, portal.hp) : 0,
      portalMaxHp: portal ? portal.maxHp : 0,
      portalSummon: this.summonTimer,
      portalPhase,
      runState: this.runState,
      deathFade: this.runState === 'dead' ? Math.min(1, this.deathTimer / 0.6) : 0,
    };
  }

  /**
   * How far the next arrow is from regenerating, 0..1.
   *
   * Mirrors MouseAttacker.Update: the timer runs against 1 / MouseMagazineRegenTime
   * and the original draws magazineRegenTimer / magazineRegenTime as a radial fill.
   */
  private magazineRegenFraction(): number {
    if (this.magazine >= this.magazineSize) return 1;
    const regen = Math.max(0.05, this.stats.get(STATS.mouseMagazineRegenTime));
    return Math.max(0, Math.min(1, this.magazineTimer / regen));
  }

  private playerHpForUi(): number {
    return roundStat(this.hp);
  }

  /** Current arrow-fall damage multiplier, after the rrowDamage upgrade. */
  get arrowMultiplier(): number {
    return this.arrowDamageMultiplier;
  }

  /** Formatted gold for the HUD. */
  goldText(): string {
    return toReadable(Math.floor(this.gold));
  }

  /** True while the character is advancing; the renderer picks walk vs idle. */
  isMoving(): boolean {
    return this.moving;
  }

  /**
   * Whether the run portal may be shown. The renderer uses this to keep the
   * portal off the right edge until the packs are down, so the level reads as a
   * progression rather than a race.
   */
  isPortalRevealed(): boolean {
    return this.allPacksCleared();
  }

  /** Simulation time accumulator for a fixed-step loop. */
  private accumulator = 0;

  /**
   * Drives `update` on a fixed 60Hz step so behaviour is identical on a 60Hz
   * phone and a 120Hz tablet. Returns the step count actually simulated.
   */
  tick(dt: number, input: InputState): number {
    const STEP = 1 / 60;
    const MAX_STEPS = 5;
    this.accumulator += dt;
    let steps = 0;
    // `input.taps` is a shared queue that `update` drains directly, so every step in
    // this frame sees whatever is still queued. No mid-frame flag blanking needed.
    while (this.accumulator >= STEP && steps < MAX_STEPS) {
      this.update(STEP, input);
      this.accumulator -= STEP;
      steps++;
    }
    // Never let a long stall build up a backlog.
    if (this.accumulator > STEP * MAX_STEPS) this.accumulator = 0;
    return steps;
  }

  /** Marks the run complete and advances. Returns the level just finished. */
  advanceLevel(): number {
    const finished = this.level;
    // First-clear bonus: guardians do not appear until stage 25, so without this
    // the premium currency would sit at zero for the whole early game.
    if (finished > this.highestCleared) {
      this.highestCleared = finished;
      this.progression.addGems(finished % 5 === 0 ? 3 : 1);
    }
    this.startLevel(this.level + 1, false);
    return finished;
  }

  /** Cleared pack ids, so a save can resume mid-level. */
  progress(): { level: number; cleared: number[]; defeated: EnemyType[] } {
    return {
      level: this.level,
      cleared: [...this.clearedPacks],
      defeated: [...this.defeatedGuardians],
    };
  }
}

/** Exposed for the renderer's camera maths. */
export const cameraLimits = CAMERA;
export const worldBounds = WORLD;
