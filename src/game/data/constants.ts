import type {
  ExtractionMineDef,
  IconName,
  ResourceKey,
  ResourceMap,
  Rarity,
  StatKey,
  StatBlock,
} from '../types';

export const GAME_TITLE = '帝皇之锤';
export const GAME_TITLE_EN = 'HAMMER OF THE EMPEROR';
export const GAME_VERSION = '1.0.0';
export const SHIP_NAME = '帝皇之怒号';
export const SAVE_KEY = 'hammer_of_the_emperor_save_v1';
export const SAVE_VERSION = 1;

export const RESOURCE_KEYS: ResourceKey[] = [
  'gelt',
  'teef',
  'alloy',
  'relic',
  'warpDust',
  'biomass',
  'promethium',
  'plasteel',
  'ceramite',
  'adamantium',
  'beacon',
  'daemonBlood',
];

export interface ResourceMeta {
  name: string;
  english: string;
  icon: IconName;
  color: string;
  description: string;
  tier: 'currency' | 'faction' | 'material' | 'special';
}

export const RESOURCES: Record<ResourceKey, ResourceMeta> = {
  gelt: {
    name: '王座币',
    english: 'Throne Gelt',
    icon: 'gelt',
    color: '#d7b25e',
    description: '帝国通用货币。用于圣典、锻造、开采与机构建设。',
    tier: 'currency',
  },
  teef: {
    name: '兽人牙齿',
    english: 'Teef',
    icon: 'teef',
    color: '#a8c96b',
    description: '从兽人嘴里拔下来的硬通货。绿皮自己也认这个。',
    tier: 'faction',
  },
  alloy: {
    name: '钛族合金',
    english: "T'au Alloy",
    icon: 'alloy',
    color: '#72c4d8',
    description: '钛族装甲的轻质合金，精密得令人不快。',
    tier: 'faction',
  },
  relic: {
    name: '混沌遗物',
    english: 'Chaos Relic',
    icon: 'relic',
    color: '#d36b6b',
    description: '被亚空间触碰过的物件。别用手直接拿。',
    tier: 'faction',
  },
  warpDust: {
    name: '灵能尘埃',
    english: 'Warp Dust',
    icon: 'warpDust',
    color: '#c485e8',
    description: '千子术士燃尽后留下的灰。仍有微弱的低语。',
    tier: 'faction',
  },
  biomass: {
    name: '虫族生物质',
    english: 'Biomass',
    icon: 'biomass',
    color: '#c77ba5',
    description: '泰伦虫群的残骸。机械教坚持它有再利用价值。',
    tier: 'faction',
  },
  promethium: {
    name: '钷素',
    english: 'Promethium',
    icon: 'promethium',
    color: '#e98d4d',
    description: '帝国战争机器的血液。锻造与祝圣的基础燃料。',
    tier: 'material',
  },
  plasteel: {
    name: '塑钢',
    english: 'Plasteel',
    icon: 'plasteel',
    color: '#a8b3bd',
    description: '廉价、可靠、足够挡住一发子弹。中级装备材料。',
    tier: 'material',
  },
  ceramite: {
    name: '陶瓷钢',
    english: 'Ceramite',
    icon: 'ceramite',
    color: '#d4c1a1',
    description: '能耐住热熔与等离子的一线材料。高级护甲材料。',
    tier: 'material',
  },
  adamantium: {
    name: '精金',
    english: 'Adamantium',
    icon: 'adamantium',
    color: '#92d4d0',
    description: '帝国最坚固的合金之一。顶级装备与星炬所需。',
    tier: 'material',
  },
  beacon: {
    name: '亚空间信标',
    english: 'Warp Beacon',
    icon: 'beacon',
    color: '#e06456',
    description: '标定安全跃迁点的信标。可在战场中呼叫一次紧急支援。',
    tier: 'special',
  },
  daemonBlood: {
    name: '大魔之血',
    english: 'Daemon Blood',
    icon: 'daemonBlood',
    color: '#e04747',
    description: '从大魔体内放出的灼热污血。最深层祝福的钥匙。',
    tier: 'special',
  },
};

export const EMPTY_RESOURCES: ResourceMap = {
  gelt: 0,
  teef: 0,
  alloy: 0,
  relic: 0,
  warpDust: 0,
  biomass: 0,
  promethium: 0,
  plasteel: 0,
  ceramite: 0,
  adamantium: 0,
  beacon: 0,
  daemonBlood: 0,
};

export const RARITY_META: Array<{
  name: string;
  english: string;
  color: string;
  glow: string;
  implicits: number;
  explicits: number;
}> = [
  {
    name: '普通',
    english: 'Common',
    color: '#9a958a',
    glow: 'rgba(154,149,138,.15)',
    implicits: 1,
    explicits: 0,
  },
  {
    name: '精良',
    english: 'Rare',
    color: '#62c4b6',
    glow: 'rgba(98,196,182,.18)',
    implicits: 2,
    explicits: 1,
  },
  {
    name: '史诗',
    english: 'Epic',
    color: '#b58ae8',
    glow: 'rgba(181,138,232,.22)',
    implicits: 2,
    explicits: 2,
  },
  {
    name: '传说',
    english: 'Legendary',
    color: '#e3b960',
    glow: 'rgba(227,185,96,.3)',
    implicits: 2,
    explicits: 3,
  },
] as const;

export const RARITY_WEIGHTS: Record<Rarity, number> = {
  0: 58,
  1: 28,
  2: 11,
  3: 3,
};

export const STAT_META: Record<
  StatKey,
  { name: string; suffix: 'pct' | 'flat' | 'mult'; icon?: IconName; description?: string }
> = {
  damagePct: { name: '伤害', suffix: 'pct', icon: 'sword' },
  flatDamage: { name: '基础伤害', suffix: 'flat', icon: 'sword' },
  attackSpeedPct: { name: '攻击速度', suffix: 'pct', icon: 'bolt' },
  projectiles: { name: '爆弹弹数', suffix: 'flat', icon: 'bolt' },
  pierce: { name: '穿透', suffix: 'flat', icon: 'arrow' },
  critChance: { name: '暴击率', suffix: 'pct', icon: 'target' },
  critDamagePct: { name: '暴击伤害', suffix: 'pct', icon: 'spark' },
  doubleChance: { name: '双重伤害', suffix: 'pct', icon: 'diamond' },
  tripleChance: { name: '三重伤害', suffix: 'pct', icon: 'diamond' },
  bossDamagePct: { name: '对首领伤害', suffix: 'pct', icon: 'skull' },
  areaPct: { name: '效果范围', suffix: 'pct', icon: 'target' },
  orbitalDamagePct: { name: '轨道伤害', suffix: 'pct', icon: 'beacon' },
  orbitalCharges: { name: '火力配额', suffix: 'flat', icon: 'target' },
  orbitalRechargePct: { name: '调度速度', suffix: 'pct', icon: 'clock' },
  orbitalShells: { name: '齐射弹数', suffix: 'flat', icon: 'beacon' },
  orbitalRadiusPct: { name: '打击半径', suffix: 'pct', icon: 'target' },
  orbitalHits: { name: '溅射上限', suffix: 'flat', icon: 'target' },
  skillDamagePct: { name: '技能伤害', suffix: 'pct', icon: 'flame' },
  skillCooldownPct: { name: '技能冷却速度', suffix: 'pct', icon: 'clock' },
  summonDamagePct: { name: '机仆/召唤伤害', suffix: 'pct', icon: 'servitor' },
  tameChance: { name: '机仆化概率', suffix: 'pct', icon: 'cog' },
  maxTames: { name: '机仆上限', suffix: 'flat', icon: 'servitor' },
  tameHealthPct: { name: '机仆生命', suffix: 'pct', icon: 'servitor' },
  hpPct: { name: '生命', suffix: 'pct', icon: 'shield' },
  flatHp: { name: '基础生命', suffix: 'flat', icon: 'shield' },
  armor: { name: '护甲', suffix: 'flat', icon: 'shield' },
  regen: { name: '每秒回复', suffix: 'flat', icon: 'drop' },
  dodge: { name: '闪避', suffix: 'pct', icon: 'eye' },
  damageReduction: { name: '伤害减免', suffix: 'pct', icon: 'shield' },
  moveSpeedPct: { name: '移动速度', suffix: 'pct', icon: 'arrow' },
  pickupRadius: { name: '拾取范围', suffix: 'flat', icon: 'diamond' },
  geltPct: { name: '王座币获取', suffix: 'pct', icon: 'gelt' },
  dropChance: { name: '额外掉落', suffix: 'pct', icon: 'chest' },
  luck: { name: '锻造幸运', suffix: 'pct', icon: 'star' },
  relicDurationPct: { name: '圣物持续', suffix: 'pct', icon: 'star' },
};

export function formatStatValue(key: StatKey, value: number): string {
  const meta = STAT_META[key];
  if (meta.suffix === 'pct') return `+${trimNumber(value)}%`;
  if (meta.suffix === 'mult') return `×${trimNumber(value)}`;
  return `+${trimNumber(value)}`;
}

function trimNumber(n: number): string {
  if (Number.isInteger(n)) return String(n);
  return n.toFixed(1).replace(/\.0$/, '');
}

export function describeStatBlock(block: StatBlock): string {
  return Object.entries(block)
    .filter(([, v]) => v !== undefined && v !== 0)
    .map(([k, v]) => `${STAT_META[k as StatKey].name} ${formatStatValue(k as StatKey, v!)}`)
    .join(' / ');
}

export const EXTRACTION_MINES: ExtractionMineDef[] = [
  {
    resource: 'promethium',
    name: '钷素钻井',
    icon: 'promethium',
    color: '#e98d4d',
    baseRate: 0.028,
    baseCost: 350,
    costGrowth: 1.76,
  },
  {
    resource: 'plasteel',
    name: '塑钢采掘场',
    icon: 'plasteel',
    color: '#a8b3bd',
    baseRate: 0.018,
    baseCost: 900,
    costGrowth: 1.8,
  },
  {
    resource: 'ceramite',
    name: '陶瓷钢熔炉',
    icon: 'ceramite',
    color: '#d4c1a1',
    baseRate: 0.011,
    baseCost: 3000,
    costGrowth: 1.84,
  },
  {
    resource: 'adamantium',
    name: '精金深层矿脉',
    icon: 'adamantium',
    color: '#92d4d0',
    baseRate: 0.005,
    baseCost: 12000,
    costGrowth: 1.9,
  },
];

export const EXTRACTION_OFFLINE_CAP_HOURS = 4;

// 全局战斗参数
export const BASE_PLAYER = {
  damage: 8,
  maxHp: 130,
  moveSpeed: 172,
  attackInterval: 0.52,
  range: 335,
  projectiles: 1,
  critChance: 0.05,
  critDamage: 1.5,
  orbitalCharges: 2,
  orbitalRecharge: 3.0,
  orbitalRadius: 86,
  orbitalDamageMult: 5.0,
  orbitalHits: 8,
  pickupRadius: 74,
} as const;

export const ENEMY_BASE_HP = 24;
export const ENEMY_BASE_DAMAGE = 7.5;
export const ITEM_DAMAGE_SCALE = 1.345;
export const ITEM_ARMOR_SCALE = 1.23;

export const DOMINION_DAMAGE_SCALE = 1.1;
export const DOMINION_HP_SCALE = 1.07;

export const COLORS = {
  bg: '#080a0b',
  panel: '#101315',
  panelLight: '#171b1e',
  ink: '#d9d2c2',
  muted: '#8c8577',
  dim: '#5e5a51',
  gold: '#d7b25e',
  goldBright: '#f2d58d',
  blood: '#b9433f',
  bloodBright: '#e6675d',
  teal: '#5fb7ad',
  tealBright: '#8ee0d4',
  aquila: '#c9a45c',
  warp: '#b57be2',
  ork: '#92b95c',
} as const;
