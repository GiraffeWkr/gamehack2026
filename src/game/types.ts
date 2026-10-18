// ============================================================
// Hammer of the Emperor — shared types
// ============================================================

export type ResourceKey =
  | 'gelt'
  | 'teef'
  | 'alloy'
  | 'relic'
  | 'warpDust'
  | 'biomass'
  | 'promethium'
  | 'plasteel'
  | 'ceramite'
  | 'adamantium'
  | 'beacon'
  | 'daemonBlood';

export type ResourceMap = Record<ResourceKey, number>;

export type FactionId = 'orks' | 'chaos' | 'tau' | 'thousand' | 'tyranids';

export type DifficultyId = 'recruit' | 'standard' | 'veteran' | 'exterminatus';

export type LegacyKey = 'might' | 'vitality' | 'ordnance' | 'fortune';

export interface EndlessState {
  chests: number;
  bestTime: number;
  bestKills: number;
  bestBosses: number;
  runs: number;
  legacy: Record<LegacyKey, number>;
}

export interface DifficultyDef {
  id: DifficultyId;
  name: string;
  english: string;
  tagline: string;
  description: string;
  enemyHpMult: number;
  enemyDamageMult: number;
  spawnMult: number;
  rewardMult: number;
  color: string;
  recommended?: boolean;
}

export type InstitutionId =
  | 'astartes'
  | 'mechanicus'
  | 'assassinorum'
  | 'telepathica'
  | 'necron';

export type SkillId =
  | 'bolt_volley'
  | 'rapid_fire'
  | 'melta_bomb'
  | 'mech_hound'
  | 'combat_servitor'
  | 'servo_skull'
  | 'deadshot'
  | 'piercing_round'
  | 'reapers_eye'
  | 'flame_verse'
  | 'lightning_verse'
  | 'frost_verse'
  | 'scarab_swarm'
  | 'entropy_field'
  | 'singularity';

export type StatKey =
  | 'damagePct'
  | 'flatDamage'
  | 'attackSpeedPct'
  | 'projectiles'
  | 'pierce'
  | 'critChance'
  | 'critDamagePct'
  | 'doubleChance'
  | 'tripleChance'
  | 'bossDamagePct'
  | 'areaPct'
  | 'orbitalDamagePct'
  | 'orbitalCharges'
  | 'orbitalRechargePct'
  | 'orbitalShells'
  | 'orbitalRadiusPct'
  | 'orbitalHits'
  | 'skillDamagePct'
  | 'skillCooldownPct'
  | 'summonDamagePct'
  | 'tameChance'
  | 'maxTames'
  | 'tameHealthPct'
  | 'hpPct'
  | 'flatHp'
  | 'armor'
  | 'regen'
  | 'dodge'
  | 'damageReduction'
  | 'moveSpeedPct'
  | 'pickupRadius'
  | 'geltPct'
  | 'dropChance'
  | 'luck'
  | 'relicDurationPct';

export type StatBlock = Partial<Record<StatKey, number>>;

export type Rarity = 0 | 1 | 2 | 3;

export type ItemSlot = 'weapon' | 'armor';

export type AffixKind = 'implicit' | 'explicit' | 'seal';

export interface Affix {
  key: StatKey;
  value: number;
  kind: AffixKind;
}

export interface Seal {
  uid: string;
  name: string;
  tier: 1 | 2 | 3;
  stats: Affix[];
  flavor: string;
}

export interface Item {
  uid: string;
  slot: ItemSlot;
  name: string;
  baseType: string;
  rarity: Rarity;
  ilvl: number;
  baseDamage: number;
  baseHp: number;
  implicits: Affix[];
  explicits: Affix[];
  improvements: number;
  pity: number;
  seals: Seal[];
  createdAt: number;
}

export type IconName =
  | 'skull'
  | 'aquila'
  | 'hammer'
  | 'cog'
  | 'eye'
  | 'flame'
  | 'bolt'
  | 'snow'
  | 'scarab'
  | 'hound'
  | 'servitor'
  | 'star'
  | 'lock'
  | 'check'
  | 'close'
  | 'settings'
  | 'sound'
  | 'music'
  | 'pause'
  | 'play'
  | 'arrow'
  | 'shield'
  | 'sword'
  | 'clock'
  | 'info'
  | 'helmet'
  | 'target'
  | 'pickaxe'
  | 'anvil'
  | 'book'
  | 'chart'
  | 'trophy'
  | 'skullSmall'
  | 'chain'
  | 'diamond'
  | 'drop'
  | 'boltPistol'
  | 'gelt'
  | 'teef'
  | 'alloy'
  | 'relic'
  | 'warpDust'
  | 'biomass'
  | 'promethium'
  | 'plasteel'
  | 'ceramite'
  | 'adamantium'
  | 'beacon'
  | 'daemonBlood'
  | 'spark'
  | 'chest'
  | 'wrench'
  | 'tentacle'
  | 'warning';

export interface FactionDef {
  id: FactionId;
  name: string;
  english: string;
  color: string;
  dimColor: string;
  currency: ResourceKey;
  portrait: string;
  epithet: string;
  lore: string;
  threat: string;
}

export interface EnemyDef {
  id: string;
  faction: FactionId;
  name: string;
  hpMult: number;
  damageMult: number;
  speed: number;
  radius: number;
  attackRange: number;
  attackCooldown: number;
  ranged: boolean;
  projectileSpeed: number;
  color: string;
  accent: string;
  rewardMult: number;
  elite?: boolean;
}

export interface BossDef {
  id: string;
  name: string;
  title: string;
  faction: FactionId;
  portrait: string;
  color: string;
  hpMult: number;
  damageMult: number;
  speed: number;
  radius: number;
  intro: string;
  quote: string;
  patterns: Array<'slam' | 'volley' | 'charge' | 'summon'>;
}

export interface InstitutionDef {
  id: InstitutionId;
  name: string;
  english: string;
  motto: string;
  color: string;
  icon: IconName;
  unlockMinutes: number;
  unlockCost: Partial<ResourceMap>;
  passive: StatBlock;
  passiveText: string;
  skills: SkillId[];
}

export type SkillEffectKind =
  | 'volley'
  | 'buff'
  | 'bomb'
  | 'summon_hound'
  | 'summon_servitor'
  | 'servo_skull'
  | 'deadshot'
  | 'piercing'
  | 'execute'
  | 'flame'
  | 'chain'
  | 'frost'
  | 'scarab'
  | 'entropy'
  | 'singularity';

export interface SkillDef {
  id: SkillId;
  institution: InstitutionId;
  name: string;
  english: string;
  effect: SkillEffectKind;
  icon: IconName;
  color: string;
  cooldown: number;
  multipliers: [number, number, number];
  description: string;
  detail: (level: number) => string;
}

export interface InstitutionProgress {
  unlocked: boolean;
  level: number;
}

export interface CodexNodeDef {
  id: string;
  branch: 'wrath' | 'aegis' | 'machine';
  tier: number;
  name: string;
  desc: string;
  icon: IconName;
  maxRank: number;
  effect: StatBlock;
  baseGelt: number;
  mat?: ResourceKey;
  baseMat?: number;
  requires?: string;
  special?: 'autoStrike';
}

export interface StarPerkDef {
  id: string;
  name: string;
  desc: string;
  icon: IconName;
  cost: Partial<ResourceMap>;
  effect: StatBlock;
  special?: 'autoStrike';
  requires?: string;
  x: number;
  y: number;
}

export interface AchievementDef {
  id: string;
  name: string;
  desc: string;
  icon: IconName;
  reward: Partial<ResourceMap>;
  check: (save: SaveData) => boolean;
}

export interface ExtractionMineDef {
  resource: ResourceKey;
  name: string;
  icon: IconName;
  color: string;
  baseRate: number;
  baseCost: number;
  costGrowth: number;
}

export interface Settings {
  music: number;
  sfx: number;
  screenshake: boolean;
  scanlines: boolean;
  damageNumbers: boolean;
}

export interface RunStats {
  totalKills: number;
  totalWins: number;
  totalDeaths: number;
  totalStrikes: number;
  totalServitors: number;
  totalGelt: number;
  bossKills: number;
  bestRunKills: number;
  runs: number;
  bestCombo: number;
  legendaryFound: number;
  forged: number;
  playedSeconds: number;
}

export interface ExtractionState {
  levels: Record<ResourceKey, number>;
  lastTick: number;
}

export interface SaveData {
  version: number;
  createdAt: number;
  lastSaved: number;
  inquisitorName: string;
  difficulty: DifficultyId;
  endless: EndlessState;
  resources: ResourceMap;
  activeInstitution: InstitutionId;
  institutions: Record<InstitutionId, InstitutionProgress>;
  skillUnlocks: SkillId[];
  skillLevels: Record<SkillId, number>;
  codex: Record<string, number>;
  starPerks: string[];
  extraction: ExtractionState;
  inventory: Item[];
  equippedWeapon: string | null;
  equippedArmor: string | null;
  achievements: string[];
  stats: RunStats;
  settings: Settings;
  tutorialSeen: boolean;
}

export interface PlayerStats {
  damage: number;
  maxHp: number;
  moveSpeed: number;
  attackInterval: number;
  range: number;
  projectiles: number;
  pierce: number;
  critChance: number;
  critDamage: number;
  doubleChance: number;
  tripleChance: number;
  orbitalCharges: number;
  orbitalRecharge: number;
  orbitalShells: number;
  orbitalRadius: number;
  orbitalDamageMult: number;
  orbitalHits: number;
  skillDamageMult: number;
  skillCooldownMult: number;
  summonDamageMult: number;
  areaMult: number;
  bossDamageMult: number;
  tameChance: number;
  maxTames: number;
  geltMult: number;
  dropChance: number;
  luck: number;
  armor: number;
  regen: number;
  dodge: number;
  damageReduction: number;
  pickupRadius: number;
  autoStrike: boolean;
  dominionMult: number;
  power: number;
  mods: StatBlock;
}

export interface BattleLoot {
  resources: Partial<Record<ResourceKey, number>>;
  kills: number;
  eliteKills: number;
  goldKills: number;
  servitors: number;
  strikes: number;
  maxCombo: number;
  damageDealt: number;
  bossKilled: boolean;
  time: number;
  hpLeft: number;
  retreat: boolean;
  victory: boolean;
  endless?: boolean;
  chests?: number;
  bossKills?: number;
}

export interface BattleResult extends BattleLoot {}

export interface BattleRewardSummary {
  resources: Partial<Record<ResourceKey, number>>;
  items: Item[];
  newAchievements: string[];
  unlocks: string[];
  endless?: boolean;
  chests?: number;
  bestTime?: boolean;
  bestKills?: boolean;
}

export interface RuntimeSkill {
  id: SkillId;
  level: number;
  cooldownLeft: number;
}

export interface HudSkill {
  id: SkillId;
  name: string;
  icon: IconName;
  color: string;
  level: number;
  cooldown: number;
  total: number;
  ready: boolean;
}

export interface HudBuff {
  id: string;
  name: string;
  color: string;
  time: number;
  maxTime: number;
}

export interface HudState {
  hp: number;
  maxHp: number;
  kills: number;
  quota: number;
  time: number;
  combo: number;
  comboTimer: number;
  charges: number;
  maxCharges: number;
  rechargeProgress: number;
  bossActive: boolean;
  bossName: string;
  bossTitle: string;
  bossPortrait?: string;
  bossColor?: string;
  bossHp: number;
  bossMaxHp: number;
  bossPhase: number;
  bossKilled: boolean;
  bossSpawned: boolean;
  ending: boolean;
  victory: boolean;
  paused: boolean;
  skills: HudSkill[];
  buffs: HudBuff[];
  allies: number;
  maxAllies: number;
  totalAllies: number;
  lootGelt: number;
  objective: string;
  autoStrike: boolean;
  noAmmo: boolean;
  strikes: number;
  institution: InstitutionId;
  institutionName: string;
  threat: number;
  weaponName: string;
  weaponMode: string;
  endless?: boolean;
  nextBossIn?: number;
  bossCount?: number;
  chests?: number;
}

export interface BattleConfig {
  arenaName: string;
  stats: PlayerStats;
  institution: InstitutionDef;
  skills: RuntimeSkill[];
  inquisitorName: string;
  musicIntensity: 'battle' | 'boss';
  tutorial: boolean;
  rewardMultiplier: number;
  enemyHpMult?: number;
  enemyDamageMult?: number;
  spawnMult?: number;
  weaponType?: string;
  weaponName?: string;
  seed?: number;
  options: {
    damageNumbers: boolean;
    screenshake: boolean;
  };
}
