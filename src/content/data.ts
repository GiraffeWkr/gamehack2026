/**
 * Tuning data lifted verbatim from the decompiled original
 * (`DatabaseManager.cs`, `EnemiesManager` serialized fields, `PlayerStatsData`).
 *
 * Nothing here is invented: these are the shipping numbers, so the web slice
 * plays with the real difficulty curve instead of a guess.
 */

import { ENEMY_INFO_BY_ID } from './enemyData.js';

/**
 * Explicit interfaces rather than bare `as const`: a literal type would make
 * e.g. `playerStartY` the type `400`, so any computed assignment to it fails.
 */

export interface WorldConfig {
  minY: number;
  maxY: number;
  playerStartX: number;
  playerStartY: number;
  viewHeight: number;
  cameraCenterY: number;
  groundY: number;
}

/**
 * World units, with the SAME convention as the shipped artwork:
 *
 *   0    ── the ground surface (characters' feet)
 *  +600  ── top of the 600-unit background frame (sky)
 *  -N    ── below ground (the ground fill / off-screen)
 *
 * Y therefore grows UPWARD here, matching how the backgrounds are authored.
 * The renderer is responsible for flipping that into screen space.
 */
export const WORLD: WorldConfig = {
  /**
   * Vertical band enemies spawn in, in world units above the ground.
   *
   * `EnemiesManager` places every pack member at
   * `Random.Range(MinMaxYPos.x, MinMaxYPos.y)`. `MinMaxYPos` is serialized scene data
   * that this build does not expose, so the range is **measured** from the shipping
   * screenshot instead: the archer's feet sit on `MiddleOfGroundYPos` (30) and an
   * enemy's feet land 27 world units lower, which puts the band at (0, 30).
   *
   * A previous revision used (10, 90). At the original's scale that lifted the pack up
   * to 90 units clear of the painted road, so the monsters visibly floated.
   */
  minY: 0,
  maxY: 30,
  /** Where the character starts a run. */
  playerStartX: 400,
  playerStartY: 0,
  /** Height of the authored background frame, in world units. */
  viewHeight: 600,
  /** Unused by the camera now that `playerScreenFraction` drives framing. */
  cameraCenterY: 0,
  /** Ground surface. Characters' feet rest here. */
  groundY: 0,
};

export interface BaseConfig {
  damage: number;
  health: number;
  attackRange: number;
  maxAttackRange: number;
  /**
   * `DatabaseManager.HealthRegenEverySecond`. **A period in seconds, not a rate.**
   *
   * `PlayerManager.Update` accumulates `Time.deltaTime` and heals `HealthRegen` once the
   * timer passes this value, then resets it - so this is "one regen tick every 5
   * seconds". The name is misleading; `StatsViewManager` divides `HealthRegen` by it to
   * display a per-second figure (`HealthRegen / 5` "/s"), which is what confirms the
   * reading.
   */
  healthRegenPeriodSeconds: number;
  baseHealthPotionRegenPercentage: number;
  playerAttackSpeed: number;
  playerMovementSpeed: number;
  mouseMagazineRegenTime: number;
  mouseAttackSpeed: number;
  baseMouseRadius: number;
  portalSummonTime: number;
  baseMaximumSkillPowers: number;
  baseCriticalMultiplier: number;
}

/** `DatabaseManager` base values. */
export const BASE: BaseConfig = {
  damage: 1.0,
  health: 10.0,
  attackRange: 450,
  maxAttackRange: 1600,
  healthRegenPeriodSeconds: 5.0,
  baseHealthPotionRegenPercentage: 4,
  playerAttackSpeed: 0.7,
  playerMovementSpeed: 140,
  mouseMagazineRegenTime: 0.4,
  mouseAttackSpeed: 0.6,
  baseMouseRadius: 3.5,
  portalSummonTime: 20,
  baseMaximumSkillPowers: 5,
  baseCriticalMultiplier: 50,
};

export interface ProgressionConfig {
  maxBattleLevel: number;
  lastAuthoredLevel: number;
  endgameHealthGrowthPerLevel: number;
  endgameGoldGrowthPerLevel: number;
  endgameDamageGrowthPerLevel: number;
}

export const PROGRESSION: ProgressionConfig = {
  maxBattleLevel: 50,
  lastAuthoredLevel: 30,
  endgameHealthGrowthPerLevel: 1.5,
  endgameGoldGrowthPerLevel: 1.22,
  endgameDamageGrowthPerLevel: 1.25,
};

export interface SpawnConfig {
  firstPackPosition: number;
  noSpawnArcherPackPosition: number;
  guardianPackPosition: number;
  spawnPackEveryDistance: number;
  portalPackOffset: number;
  earlyPackCount: number;
  enemiesInEarlyPack: number;
  earlyPackPosition: number;
  distanceBetweenEarlyPacks: number;
  packWidthBase: number;
  packWidthExponent: number;
  level1PackDistance: number;
  minEnemySpacing: number;
}

/** Spawn geometry (`EnemiesManager` serialized fields). */
export const SPAWN: SpawnConfig = {
  firstPackPosition: 1200,
  /**
   * Where the first pack goes before the archer companion is unlocked.
   *
   * The shipping build uses 3200, which leaves ~9 seconds of completely empty
   * screen before the first enemy walks into frame; on a phone that reads as a
   * broken game. The slice pulls it in so the opening pack is already at the
   * edge of the frame when the level starts. Note the camera shows 1920 units
   * centred on the character, so anything past ~900 units ahead is off-screen -
   * 1000 keeps the pack visible (packs scatter from centre to centre+halfWidth).
   */
  noSpawnArcherPackPosition: 1000,
  guardianPackPosition: 1500,
  spawnPackEveryDistance: 2400,
  portalPackOffset: 200,
  earlyPackCount: 4,
  enemiesInEarlyPack: 1,
  earlyPackPosition: -800,
  distanceBetweenEarlyPacks: 400,
  /** Pack half-width: 92 * count^0.75, from `CreateASinglePack`. */
  packWidthBase: 92,
  packWidthExponent: 0.75,
  /**
   * Pack spacing on level 1 only.
   *
   * The shipping build uses 2400 everywhere, which with 8 packs puts the portal
   * ~20000 units out - over two minutes of walking before the opening stage ends.
   * At 650 the first level runs about 40 seconds, long enough to teach the loop and
   * short enough not to feel like a chore. Levels 2+ use the authored 2400.
   */
  level1PackDistance: 650,
  /** Two enemies closer than this are nudged apart / mirrored. */
  minEnemySpacing: 50,
};

export interface CameraConfig {
  /**
   * Where the character sits horizontally, as a fraction of the viewport width
   * measured from the left edge.
   *
   * Expressed as a screen fraction rather than a world offset so the framing is
   * identical on every device: a fixed world offset makes the character drift
   * further right as the viewport gets wider. The original's `CharacterMover` uses
   * `maximumDifference` to keep the camera ahead of the character - he walks in the
   * left third of the frame with the ground he is heading into filling the rest -
   * and this is the equivalent expressed in screen terms.
   */
  characterScreenX: number;
  /** How much of the portal may peek in from the right before it is revealed. */
  portalPeekFraction: number;
  /**
   * Where the character's feet sit vertically, as a fraction of the visible height.
   *
   * **500 / 1080**, where 500 is the walkable surface's row inside the 1920x600 art
   * frame and 1080 is `orthographicSize * 2`. The art frame's top edge is pinned to the
   * top of the screen, so this is simply the ground row expressed as a fraction of the
   * visible height - not a tuning knob.
   *
   * Measured off the shipping screenshot: the archer's silhouette bottoms out at row
   * 502 of 1076 = 46.7%, and 500/1080 = 46.3%.
   */
  playerScreenFraction: number;
  /**
   * World units of height the camera shows: `orthographicSize * 2`, ported from the
   * original's cameras (540 each).
   *
   * This is why the port is NOT full-screen in the way a naive fit would be. The art
   * frame is 600 units tall, so it occupies only the top 600/1080 = 55.6% of the
   * viewport; the original puts its talent-tree panel in the remaining band, and this
   * port puts the HUD there. Scaling the art to fill the viewport instead (what an
   * earlier revision did) inflated every band by 1.8x and broke the composition.
   */
  visibleWorldHeight: number;
}

/** Camera behaviour. */
export const CAMERA: CameraConfig = {
  /**
   * 0.25 = the character's feet sit a quarter of the way in from the left edge.
   *
   * Derived from `CharacterMover`: `maximumDifference` - the dead zone that decides
   * when the camera follows - is 960 in every branch that reads it (the portal limit,
   * `spawnArcherCameraMotion`, the idle recentre), and the orthographic camera shows
   * 1920 units across. 480/1920 = 0.25, so the original frames the character a
   * quarter of the way in with the ground ahead filling the rest of the screen.
   */
  characterScreenX: 0.25,
  /** 0.15 = the portal may come within 15% of the right edge before it appears. */
  portalPeekFraction: 0.15,
  /**
   * `GROUND_LINE_ART_Y / visibleWorldHeight` = 500 / 1080. Written as the division so it
   * cannot silently disagree with the art geometry.
   */
  playerScreenFraction: 500 / 1080,
  /**
   * `orthographicSize * 2`. Both cameras in `level0` serialize 540, giving 1080 world
   * units of visible height at every aspect ratio - the same trade the original makes.
   */
  visibleWorldHeight: 1080,
};

/**
 * The five monster-family currencies, from `DatabaseManager.MonsterCurrencyToEnemyType`
 * and the `Currencies` / `LootType` enums. Gold is separate: it drops from everything.
 */
export type MonsterCurrency =
  | 'ClawCurrency' | 'ArcherCurrency' | 'WarriorCurrency' | 'MageCurrency' | 'BatCurrency';

export const MONSTER_CURRENCY: Partial<Record<EnemyType, MonsterCurrency>> = {
  Claw: 'ClawCurrency',
  Archer: 'ArcherCurrency',
  Warrior: 'WarriorCurrency',
  Mage: 'MageCurrency',
  Bat: 'BatCurrency',
};

/**
 * `DatabaseManager.EnemyCurrencyPerType` holds `new EnemyCurrencyData(N)` per family,
 * where **N is not an amount but the level at which that family starts dropping its
 * currency**. The amount comes from the relative-level table below.
 *
 * Warrior = 6 is why a level-5 Warrior drops nothing: `6 - 6 = 0` is still in range but
 * the level is below the unlock. Mage and Bat unlock at 10 and 16, which is the whole
 * point of "higher-tier monsters are worth more".
 */
export const ENEMY_CURRENCY_UNLOCK_LEVEL: Record<MonsterCurrency, number> = {
  ClawCurrency: 2,
  ArcherCurrency: 3,
  WarriorCurrency: 6,
  MageCurrency: 10,
  BatCurrency: 16,
};

/**
 * `DatabaseManager.EnemyCurrencyPerRelativeLevel`, indexed 0..30. Indexed by
 * `battleLevel - unlockLevel`, so a level-3 Claw reads index 1 and a level-26 Bat reads
 * index 10.
 */
export const ENEMY_CURRENCY_PER_RELATIVE_LEVEL: readonly number[] = [
  1, 1, 2, 2, 3, 4, 6, 8, 10, 14,
  18, 25, 33, 44, 59, 79, 110, 140, 190, 260,
  350, 480, 650, 870, 1200, 1600, 2100, 2100, 2100, 2100,
  2100,
];

/** `PlayerStatsData.Init`: `GoldCoinsToDrop` flat = 1, so every kill drops one coin. */
export const GOLD_COINS_TO_DROP = 1;
/** `PlayerStatsData.Init`: `GoldChanceToDrop` base, an extra coin on this roll. */
export const GOLD_CHANCE_TO_DROP = 0;
/**
 * `PlayerStatsData.Init`: `HealthPotionRegenPercentage` = `BaseHealthPotionRegenPercentage`
 * (4). The potion heals this share of MAX health, per `MonsterDiedGiveRewards`.
 */
export const HEALTH_POTION_REGEN_PERCENT = 4;

/** Authored enemy health per level (1..30). */
export const ENEMY_HEALTH_PER_LEVEL: readonly number[] = [
  3, 12, 40, 90, 135, 260, 500, 830, 1350, 2050,
  3300, 4200, 6300, 8700, 10500, 14300, 20000, 27500, 36500, 52000,
  64000, 93000, 110000, 170000, 350000, 600000, 790000, 1620000, 2700000, 3600000,
];

/** Authored enemy gold per level (1..30). */
export const ENEMY_GOLD_PER_LEVEL: readonly number[] = [
  1, 3, 7, 20, 52, 138, 285, 590, 1400, 2700,
  5200, 10700, 19300, 27000, 48000, 80000, 135000, 175000, 245000, 360000,
  535000, 700000, 1200000, 1800000, 2800000, 4300000, 6300000, 8500000, 12000000, 35000000,
];

/** Authored enemy damage per level (1..30). */
export const ENEMY_DAMAGE_PER_LEVEL: readonly number[] = [
  2, 2, 3, 5, 8, 14, 19, 27, 33, 38,
  42, 45, 55, 66, 75, 90, 150, 165, 212, 245,
  280, 355, 390, 430, 600, 890, 1280, 1450, 1970, 2500,
];

/** Enemies per regular pack, levels 1..30. */
export const ENEMIES_PER_PACK: readonly number[] = [
  9, 9, 11, 12, 14, 16, 17, 18, 18, 18,
  20, 20, 21, 21, 22, 22, 22, 23, 23, 24,
  25, 25, 26, 26, 26, 26, 27, 27, 27, 30,
];

/** Enemies per portal pack, levels 1..30. */
export const ENEMIES_PER_PORTAL_PACK: readonly number[] = [
  4, 5, 5, 5, 6, 6, 6, 7, 7, 8,
  8, 9, 10, 11, 12, 12, 12, 14, 15, 15,
  16, 16, 17, 17, 17, 17, 17, 17, 17, 20,
];

/** Regular packs per level, levels 1..30. */
export const PACKS_PER_LEVEL: readonly number[] = [
  8, 9, 11, 11, 11, 12, 12, 13, 13, 13,
  14, 14, 14, 15, 15, 15, 16, 16, 17, 18,
  19, 20, 20, 20, 20, 20, 20, 20, 20, 24,
];

export type EnemyType =
  | 'Claw' | 'Warrior' | 'Archer' | 'Mage' | 'Bat' | 'RunPortal'
  // The five Guardian variants and the King. The original keeps them apart — each Guardian
  // has its own `EnemyInfo` with its own health, damage, range and attack speed, and the
  // King is a separate archetype again. The port used to fold all five into one `Guardian`
  // bucket, which is why they all fought identically.
  | 'GuardianClaw' | 'GuardianWarrior' | 'GuardianArcher' | 'GuardianMage' | 'GuardianBat'
  | 'King';

export interface EnemyDef {
  type: EnemyType;
  name: string;
  /** HP multiplier applied on top of the level's base enemy health. */
  healthMultiplier: number;
  /** Damage multiplier applied on top of the level's base enemy damage. */
  damageMultiplier: number;
  /** Movement speed in world units/sec. */
  speed: number;
  /** Distance from the player at which it stops and attacks. */
  attackRange: number;
  /** Seconds between attacks. */
  attackCooldown: number;
  /** 'melee' = contact damage, 'ranged' = fires a projectile at the player. */
  attackKind: 'melee' | 'ranged';
  /** Visual radius for the placeholder renderer and hit tests. */
  radius: number;
  /**
   * `EnemyInfo.IsTameable` — whether `TamingManager` may turn this monster into an ally
   * when it dies. All five non-guardian families are tameable; King, the RunPortal and the
   * five Guardians are not.
   */
  tameable: boolean;
  color: number;
  /** Relative spawn weight inside a pack. */
  weight: number;
}

/**
 * Enemy archetypes. The original stores these in `EnemyInfo` ScriptableObjects;
 * the multipliers below are the slice-level stand-ins that keep the five
 * archetypes playably distinct (Claw rushes, Archer shoots, Mage is a caster,
 * Bat is fast and fragile, Warrior is the bruiser).
 *
 * `radius` is the body collision radius and is scaled with the art (see
 * `content/art.ts`: every character height is the earlier revision's times 0.483, to
 * match the measured 99-unit archer). It barely moves the difficulty, because an arrow's
 * blast radius is `baseMouseRadius * 60` = 210 units and the hit test is
 * `distance <= arrow.radius + enemy.radius`, so the enemy's own radius is a small term.
 * Keeping it aligned with the drawn size is what stops arrows appearing to hit empty air
 * beside a minion.
 */
/**
 * Presentation-only fields, the four the original keeps on the prefab rather than in the
 * asset. Everything else comes from `EnemyInfo`.
 */
const ENEMY_PRESENTATION: Record<string, { radius: number; color: number; weight: number }> = {
  Claw: { radius: 16, color: 0xc0563c, weight: 30 },
  Warrior: { radius: 20, color: 0x8c5a2b, weight: 22 },
  Archer: { radius: 16, color: 0x4f8f4a, weight: 20 },
  Mage: { radius: 17, color: 0x6a4fa3, weight: 14 },
  Bat: { radius: 13, color: 0x4a4a6e, weight: 14 },
  // Scaled with the art: the portal is drawn 200 units tall from the 512x512 `Portal`
  // texture, so the collision circle grew with it (was 43 against a 97-unit orb).
  RunPortal: { radius: 70, color: 0x2fb6d6, weight: 0 },
  // Guardians are bigger than their family counterparts and never appear in a normal pack,
  // so they carry weight 0. Their radii scale with their art, which is the same
  // `Guardian_*_0` sheet at the same pixel size, drawn taller than the minions.
  GuardianClaw: { radius: 34, color: 0xd4a017, weight: 0 },
  GuardianWarrior: { radius: 38, color: 0xc98a2a, weight: 0 },
  GuardianArcher: { radius: 34, color: 0x6fae52, weight: 0 },
  GuardianMage: { radius: 36, color: 0x8a63c9, weight: 0 },
  GuardianBat: { radius: 30, color: 0x6a6a9e, weight: 0 },
  King: { radius: 56, color: 0xb03060, weight: 0 },
};

/**
 * Builds one `EnemyDef` from the real `EnemyInfo`, adding only the presentation fields.
 *
 * This table used to be hand-written "slice-level stand-ins", and they had drifted badly:
 * Bat shipped at 0.55x health where the asset says **3.00x**, Warrior at 2.2x against
 * **3.50x**, Claw's speed at 95 against 80, and every attack cooldown was invented rather
 * than being `1 / EnemyInfo.AttackSpeed` (Claw is 0.30/s, one swing every 3.33s).
 */
function enemyFrom(id: string, type: EnemyType, look: string): EnemyDef {
  const info = ENEMY_INFO_BY_ID[id];
  const p = ENEMY_PRESENTATION[look] ?? { radius: 16, color: 0x888888, weight: 0 };
  return {
    type,
    name: id === 'RunPortal' ? 'Run Portal' : type,
    healthMultiplier: info?.healthMultiplier ?? 1,
    damageMultiplier: info?.damageMultiplier ?? 1,
    speed: info?.movementSpeed ?? 80,
    attackRange: info?.attackRange ?? 110,
    attackCooldown: info && info.attackSpeed > 0 ? 1 / info.attackSpeed : 999,
    attackKind: info?.isRanged ? 'ranged' : 'melee',
    radius: p.radius,
    tameable: info?.isTameable ?? false,
    color: p.color,
    weight: p.weight,
  };
}

export const ENEMIES: Record<EnemyType, EnemyDef> = {
  Claw: enemyFrom('Claw', 'Claw', 'Claw'),
  Warrior: enemyFrom('Warrior', 'Warrior', 'Warrior'),
  Archer: enemyFrom('Archer', 'Archer', 'Archer'),
  Mage: enemyFrom('Mage', 'Mage', 'Mage'),
  Bat: enemyFrom('Bat', 'Bat', 'Bat'),
  RunPortal: enemyFrom('RunPortal', 'RunPortal', 'RunPortal'),
  // Each Guardian keeps its own asset: GuardianMage has 45x health against GuardianClaw's
  // 25x, and only the ranged two shoot. Folding them into one bucket threw that away.
  GuardianClaw: enemyFrom('GuardianClaw', 'GuardianClaw', 'GuardianClaw'),
  GuardianWarrior: enemyFrom('GuardianWarrior', 'GuardianWarrior', 'GuardianWarrior'),
  GuardianArcher: enemyFrom('GuardianArcher', 'GuardianArcher', 'GuardianArcher'),
  GuardianMage: enemyFrom('GuardianMage', 'GuardianMage', 'GuardianMage'),
  GuardianBat: enemyFrom('GuardianBat', 'GuardianBat', 'GuardianBat'),
  King: enemyFrom('King', 'King', 'King'),
};

/** Which archetypes can appear at a given level and their relative weights. */
export function enemyWeightsForLevel(level: number): Array<[EnemyType, number]> {
  const out: Array<[EnemyType, number]> = [['Claw', ENEMIES.Claw.weight]];
  // The original gates archetypes in over the first levels; mirror that ramp.
  if (level >= 2) out.push(['Archer', ENEMIES.Archer.weight]);
  if (level >= 3) out.push(['Bat', ENEMIES.Bat.weight]);
  if (level >= 4) out.push(['Warrior', ENEMIES.Warrior.weight]);
  if (level >= 5) out.push(['Mage', ENEMIES.Mage.weight]);
  return out;
}

/**
 * Stat variable names. These match the original's `StatInfo.VariableName` values
 * exactly, so the 813-entry exported content table can be wired in later without
 * renaming anything. Note there is NO layer suffix here: the original keys its
 * dict by variable name and passes `StatsProperties` separately.
 */
export const STATS = {
  damage: 'Damage',
  health: 'Health',
  attackRange: 'AttackRange',
  playerMovementSpeed: 'PlayerMovementSpeed',
  playerAttackSpeed: 'PlayerAttackSpeed',
  criticalChance: 'CriticalChance',
  criticalMultiplier: 'CriticalMultiplier',
  healthRegen: 'HealthRegen',
  goldGained: 'GoldGained',
  expGained: 'ExpGained',
  enemyHealthMultiplier: 'EnemyHealthMultiplier',
  enemyDamageMultiplier: 'EnemyDamageMultiplier',
  mouseMagazineSize: 'MouseMagazineSize',
  mouseMagazineRegenTime: 'MouseMagazineRegenTime',
  numberOfMouseProjectiles: 'NumberOfMouseProjectiles',
  mouseNumberOfHits: 'MouseNumberOfHits',
  multishotNumberOfProjectiles: 'Multishot_NumberOfProjectiles',
  multishotNumberOfHits: 'Multishot_NumberOfHits',
  multishotCooldown: 'Multishot_Cooldown',
  // --- stats the talent tree grants (all real names from the original's 272) ---
  damageReduction: 'DamageReduction',
  dodgeChance: 'DodgeChance',
  chanceForDoubleDamage: 'ChanceForDoubleDamage',
  chanceForTripleDamage: 'ChanceForTripleDamage',
  mouseChanceForAnotherHit: 'MouseChanceForAnotherHit',
  explosiveArrowsRadius: 'ExplosiveArrows_RadiusOfEffect',
  goldCoinsToDrop: 'GoldCoinsToDrop',
  goldChanceToDrop: 'GoldChanceToDrop',
  chanceToDropHealthPotion: 'ChanceToDropHealthPotion',
  healthPotionRegenPercentage: 'HealthPotionRegenPercentage',
  // Skill curves and radii, all real `PlayerStatsData` names. `PlayerStatsData.InitData`
  // seeds these from the matching `JobSkillInfo` asset, so they are the skills' own numbers.
  bombArrowRadiusOfEffect: 'BombArrow_RadiusOfEffect',
  sniperScopeRadiusOfEffect: 'SniperScope_RadiusOfEffect',
  batSwarmRadiusOfEffect: 'BatSwarm_RadiusOfEffect',
  fireAreaRadiusOfEffect: 'FireArea_RadiusOfEffect',
  blizzardRadiusOfEffect: 'Blizzard_RadiusOfEffect',
  blizzardSlowPercent: 'Blizzard_SlowPercent',
  superNovaExecuteThreshold: 'SuperNova_ExecuteThreshold',
  // Taming and pets, from `TamingManager` / `PetSelfer`.
  chanceToTameEnemiesOnDeath: 'ChanceToTameEnemiesOnDeath',
  maxTames: 'MaxTames',
  petDamageMultiplier: 'PetDamageMultiplier',
  petHealthMultiplier: 'PetHealthMultiplier',
  goldenRewardMultiplier: 'GoldenRewardMultiplier',
  chanceForGoldenEnemy: 'ChanceForGoldenEnemy',
  unlockGoldenEnemies: 'UnlockGoldenEnemies',
  firstPacksAlwaysContainGolden: 'FirstPacksAlwaysContainGolden',
} as const;

/**
 * `DatabaseManager.OneGameUnitToUnityUnit`. Skill radii are authored in "game units" and
 * multiplied by this before use, so `BombArrow_RadiusOfEffect = 9` is a 90-unit blast.
 */
export const ONE_GAME_UNIT = 10;

/**
 * Chests, from \`DatabaseManager\` and \`ChestsManager.SpawnContents_Co\`.
 *
 * \`ChestTypeWeights\` is a plain table in the code (\`DatabaseManager.cs:758-780\`); the coin
 * bases are \`BaseChestCoins_*\` / \`BaseChestCoinMultiplier_*\` (\`:782-790\`). Note the two
 * \"standard\" buckets: Currency pays more coins at a lower multiplier (8 x 1.0), while
 * Item/Rune/Scroll share the standard chest (2 x 2.0) and Legendary pays 8 x 3.0.
 */
export const CHEST_TYPES = ['Currency', 'Item', 'Rune', 'Scroll', 'Legendary'] as const;
export type ChestType = (typeof CHEST_TYPES)[number];

export const CHEST_WEIGHTS: Record<ChestType, number> = {
  Currency: 60,
  Item: 18,
  Rune: 15,
  Scroll: 7,
  Legendary: 2,
};

/** \`BaseChestCoins_*\` and \`BaseChestCoinMultiplier_*\`, per coin bucket. */
export const CHEST_COINS: Record<'currency' | 'standard' | 'legendary', { coins: number; multiplier: number }> = {
  currency: { coins: 8, multiplier: 1.0 },
  standard: { coins: 2, multiplier: 2.0 },
  legendary: { coins: 8, multiplier: 3.0 },
};

/** Which coin bucket each chest type draws from. Currency is the only one on its own. */
export const CHEST_BUCKET: Record<ChestType, 'currency' | 'standard' | 'legendary'> = {
  Currency: 'currency',
  Item: 'standard',
  Rune: 'standard',
  Scroll: 'standard',
  Legendary: 'legendary',
};

/** \`BaseChestContentCount_*\`: how many item/rune/scroll drops a chest would carry. */
export const CHEST_CONTENT_COUNT: Record<ChestType, number> = {
  Currency: 0,
  Item: 1,
  Rune: 1,
  Scroll: 2,
  Legendary: 1,
};

/**
 * Level-1 stat bases, from the `ChangeAStat` block in `PlayerStatsData.Init()`.
 * Multiplicative layers are registered separately as 1.0 by the stat bag setup.
 */
export const PLAYER_BASE_STATS: Record<string, number> = {
  Damage: BASE.damage,
  Health: BASE.health,
  AttackRange: BASE.attackRange,
  PlayerMovementSpeed: BASE.playerMovementSpeed,
  PlayerAttackSpeed: BASE.playerAttackSpeed,
  CriticalChance: 0,
  CriticalMultiplier: BASE.baseCriticalMultiplier,
  /**
   * HP restored per regen tick, i.e. once every `BASE.healthRegenPeriodSeconds`.
   *
   * **1.0**, read from a real level-3 save (`analysis/save_Lv3.json`, decoded with the
   * verified save codec): `HealthRegen.Flat.RealValue = 1.0`. An earlier revision reused
   * `healthRegenEverySecond` (5.0, the PERIOD) as the amount and applied it per frame,
   * which healed 25x faster than the original and made the health bar fill itself.
   */
  HealthRegen: 1.0,
  GoldGained: 1,
  ExpGained: 1,
  EnemyMovementSpeedMultiplier: 1,
  EnemyAttackSpeedMultiplier: 1,
  EnemyHealthMultiplier: 1,
  EnemyDamageMultiplier: 1,
  MouseMagazineSize: 5,
  MouseMagazineRegenTime: BASE.mouseMagazineRegenTime,
  NumberOfMouseProjectiles: 1,
  MouseNumberOfHits: 1,
  MouseMaxNumberOfEnemies: 2,
  /**
   * Arrow-rain damage bonus, as a percentage over the bow. Was
   * `PLAYER_START.mouseArrowDamageMultiplier = 1.5`, i.e. +50%; the tree raises it.
   */
  MouseArrowDamage: 50,
  PortalSummonTime: BASE.portalSummonTime,
  Multishot_NumberOfProjectiles: 3,
  Multishot_NumberOfHits: 1,
  Multishot_Cooldown: 8,
  SkillsCooldownSpeed: 1,
  Skills_DamageMultiplier: 1,

  // --- bases for the tree-granted stats ---
  // `PlayerStatsData.Init()` seeds the ones it declares; the rest start at 0 because the
  // original never seeds them and the tree is what grants them.
  DamageReduction: 0,
  DodgeChance: 0,
  ChanceForDoubleDamage: 0,
  ChanceForTripleDamage: 0,
  MouseChanceForAnotherHit: 0,
  ExplosiveArrows_RadiusOfEffect: 0,
  /** `ChangeAStat("GoldCoinsToDrop", Flat, 1.0)` - one coin per kill. */
  GoldCoinsToDrop: GOLD_COINS_TO_DROP,
  GoldChanceToDrop: GOLD_CHANCE_TO_DROP,
  ChanceToDropHealthPotion: 0,
  /** `ChangeAStat("HealthPotionRegenPercentage", Flat, BaseHealthPotionRegenPercentage)`. */
  HealthPotionRegenPercentage: HEALTH_POTION_REGEN_PERCENT,
  /**
   * Per-family currency drop chances, in the original's "over 100" units: 100 means
   * exactly one guaranteed drop, 250 means two guaranteed plus a 50% roll for a third.
   * See `rollOver100`.
   *
   * **All five base at 0.** `PlayerStatsData` DECLARES these fields but never seeds them
   * in `InitData`, so they default to 0 — a family currency does not drop until the tree
   * raises its chance. The port shipped 100 across the board, which made every low-level
   * kill drop a family currency whose row was still locked, i.e. worth 0: a ball the
   * player could pick up that changed nothing.
   */
  ClawCurrencyChanceDrop: 0,
  ArcherCurrencyChanceDrop: 0,
  WarriorCurrencyChanceDrop: 0,
  MageCurrencyChanceDrop: 0,
  BatCurrencyChanceDrop: 0,
};

/**
 * Stats that use a multiplicative layer. The original registers these at 1.0
 * because the multiplicative layer is a product, so an unset layer would zero
 * the stat out entirely.
 */
export const MULTIPLICATIVE_STATS: readonly string[] = [
  'Damage',
  'Health',
  'AttackRange',
  'PlayerMovementSpeed',
  'PlayerAttackSpeed',
  'CriticalMultiplier',
  'EnemyMovementSpeedMultiplier',
  'EnemyAttackSpeedMultiplier',
  'Skills_DamageMultiplier',
];

/** Maps a monster-family currency to its `*CurrencyChanceDrop` stat. */
export const CURRENCY_CHANCE_STAT: Record<MonsterCurrency, string> = {
  ClawCurrency: 'ClawCurrencyChanceDrop',
  ArcherCurrency: 'ArcherCurrencyChanceDrop',
  WarriorCurrency: 'WarriorCurrencyChanceDrop',
  MageCurrency: 'MageCurrencyChanceDrop',
  BatCurrency: 'BatCurrencyChanceDrop',
};

/** Starting player tuning that is not a stat (slice-level values). */
export interface PlayerStartConfig {
  /** Mouse arrow-fall hits harder than the archer's own shot. */
  mouseArrowDamageMultiplier: number;
}

export const PLAYER_START: PlayerStartConfig = {
  mouseArrowDamageMultiplier: 1.5,
};
