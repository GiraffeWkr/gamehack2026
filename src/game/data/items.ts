import type {
  Affix,
  Item,
  ItemSlot,
  Rarity,
  Seal,
  StatBlock,
  StatKey,
} from '../types';
import { RARITY_META, RARITY_WEIGHTS, STAT_META } from './constants';
import { chance, clamp, pick, randomRange, uid, weightedPick } from '../meta/rng';

interface BaseType {
  id: string;
  name: string;
  slot: ItemSlot;
  damageMult: number;
  hpMult: number;
  implicits: StatKey[];
  flavor: string;
}

export const WEAPON_TYPES: BaseType[] = [
  {
    id: 'chainsword',
    name: '链锯剑',
    slot: 'weapon',
    damageMult: 0.9,
    hpMult: 0,
    implicits: ['attackSpeedPct', 'areaPct'],
    flavor: '齿刃咬住装甲时会唱歌。机魂喜欢这首歌。',
  },
  {
    id: 'thunder_hammer',
    name: '雷霆锤',
    slot: 'weapon',
    damageMult: 1.3,
    hpMult: 0,
    implicits: ['areaPct', 'bossDamagePct'],
    flavor: '帝皇之锤。每一击都在替帝皇说“不”。',
  },
  {
    id: 'storm_shield',
    name: '风暴盾',
    slot: 'weapon',
    damageMult: 0.65,
    hpMult: 0,
    implicits: ['armor', 'hpPct'],
    flavor: '盾面刻着一位早已被遗忘的圣人的脸。',
  },
  {
    id: 'plasma_gun',
    name: '电浆枪',
    slot: 'weapon',
    damageMult: 1.08,
    hpMult: 0,
    implicits: ['critDamagePct', 'critChance'],
    flavor: '每一次射击都是一次小型恒星事件。',
  },
  {
    id: 'melta_gun',
    name: '热熔枪',
    slot: 'weapon',
    damageMult: 1.15,
    hpMult: 0,
    implicits: ['orbitalDamagePct', 'areaPct'],
    flavor: '它的问题不是“能不能烧穿”，而是“烧穿之后还剩什么”。',
  },
  {
    id: 'banner',
    name: '战旗',
    slot: 'weapon',
    damageMult: 0.8,
    hpMult: 0,
    implicits: ['skillCooldownPct', 'attackSpeedPct'],
    flavor: '旗面是用阵亡者的披风缝成的。它从不倒下。',
  },
];

export const ARMOR_TYPES: BaseType[] = [
  {
    id: 'carapace',
    name: '甲壳甲',
    slot: 'armor',
    damageMult: 0,
    hpMult: 1.0,
    implicits: ['hpPct', 'armor'],
    flavor: '标准帝国卫队甲壳甲。可靠，廉价，足够挡一次。',
  },
  {
    id: 'power_armor',
    name: '动力甲',
    slot: 'armor',
    damageMult: 0,
    hpMult: 1.22,
    implicits: ['armor', 'damageReduction'],
    flavor: '即便是审判官，也需要借来一套阿斯塔特动力甲。',
  },
  {
    id: 'robe',
    name: '审判官长袍',
    slot: 'armor',
    damageMult: 0,
    hpMult: 0.82,
    implicits: ['dodge', 'moveSpeedPct'],
    flavor: '袍子里衬着精金网。这是经验，不是时尚。',
  },
  {
    id: 'relic_armor',
    name: '圣物护甲',
    slot: 'armor',
    damageMult: 0,
    hpMult: 1.12,
    implicits: ['hpPct', 'regen'],
    flavor: '每一块甲片上都封着一位殉道者的指骨。',
  },
];

interface AffixDef {
  key: StatKey;
  min: number;
  max: number;
  slots: ItemSlot[];
  minRarity?: Rarity;
  discrete?: boolean;
}

export const AFFIX_POOL: AffixDef[] = [
  { key: 'damagePct', min: 6, max: 18, slots: ['weapon'] },
  { key: 'attackSpeedPct', min: 4, max: 12, slots: ['weapon'] },
  { key: 'critChance', min: 2, max: 7, slots: ['weapon'] },
  { key: 'critDamagePct', min: 12, max: 36, slots: ['weapon'] },
  { key: 'orbitalDamagePct', min: 8, max: 22, slots: ['weapon'] },
  { key: 'skillDamagePct', min: 8, max: 22, slots: ['weapon'] },
  { key: 'areaPct', min: 5, max: 15, slots: ['weapon'] },
  { key: 'doubleChance', min: 2, max: 6, slots: ['weapon'] },
  { key: 'geltPct', min: 5, max: 15, slots: ['weapon', 'armor'] },
  { key: 'luck', min: 3, max: 10, slots: ['weapon', 'armor'] },
  { key: 'pickupRadius', min: 8, max: 25, slots: ['weapon', 'armor'] },
  { key: 'hpPct', min: 6, max: 18, slots: ['armor'] },
  { key: 'armor', min: 8, max: 28, slots: ['armor'] },
  { key: 'regen', min: 1, max: 4, slots: ['armor'] },
  { key: 'moveSpeedPct', min: 3, max: 9, slots: ['armor'] },
  { key: 'summonDamagePct', min: 7, max: 18, slots: ['armor'] },
  { key: 'tameChance', min: 1, max: 3, slots: ['armor'] },
  { key: 'damageReduction', min: 2, max: 5, slots: ['armor'] },
  { key: 'orbitalCharges', min: 1, max: 1, slots: ['weapon'], minRarity: 3, discrete: true },
  { key: 'projectiles', min: 1, max: 1, slots: ['weapon'], minRarity: 3, discrete: true },
  { key: 'orbitalShells', min: 1, max: 1, slots: ['weapon'], minRarity: 3, discrete: true },
];

const RARITY_MULT = [1, 1.08, 1.18, 1.3];
const RARITY_PREFIX: string[][] = [
  ['制式', '凡兵', '旧式'],
  ['祝圣', '净化', '铁誓'],
  ['机魂', '审判', '星炬'],
  ['帝皇', '永恒', '终焉'],
];

const LEGENDARY_FLAVOR = [
  '这件武器在三位审判官手中见证过同一个世界的终结。',
  '机魂拒绝回答它是谁铸造的。它只回答“为了帝皇”。',
  '炮膛里永远残留着一丝亚空间的冷意。',
  '据说帝皇本人曾在远征中握过它。无法证实。也无人敢质疑。',
];

export function rollRarity(luck = 0, ilvl = 1, bonus = 0): Rarity {
  const weights: Record<Rarity, number> = {
    0: Math.max(18, RARITY_WEIGHTS[0] - ilvl * 0.55 - luck * 0.45),
    1: RARITY_WEIGHTS[1] + ilvl * 0.18 + luck * 0.12,
    2: RARITY_WEIGHTS[2] + ilvl * 0.28 + luck * 0.25 + bonus,
    3: RARITY_WEIGHTS[3] + ilvl * 0.12 + luck * 0.18 + bonus * 1.4,
  };
  const roll = Math.random() * (weights[0] + weights[1] + weights[2] + weights[3]);
  if (roll < weights[0]) return 0;
  if (roll < weights[0] + weights[1]) return 1;
  if (roll < weights[0] + weights[1] + weights[2]) return 2;
  return 3;
}

function makeAffix(key: StatKey, rarity: Rarity, ilvl: number, kind: Affix['kind']): Affix {
  const def = AFFIX_POOL.find((entry) => entry.key === key);
  if (!def) return { key, value: 0, kind };
  if (def.discrete) return { key, value: def.max, kind };
  const rarityFactor = [0.72, 0.9, 1.08, 1.25][rarity];
  const levelFactor = 1 + Math.max(0, ilvl - 1) * 0.006;
  const raw = randomRange(def.min, def.max) * rarityFactor * levelFactor;
  const value = def.min < 5 ? Math.round(raw * 10) / 10 : Math.round(raw);
  return { key, value, kind };
}

function rollNonDuplicateKeys(
  pool: AffixDef[],
  count: number,
  rarity: Rarity,
  used: Set<StatKey>,
): StatKey[] {
  const candidates = pool.filter(
    (def) =>
      !used.has(def.key) &&
      (def.minRarity === undefined || rarity >= def.minRarity) &&
      !(rarity < 3 && def.discrete),
  );
  const result: StatKey[] = [];
  for (let i = 0; i < count; i++) {
    const remaining = candidates.filter((def) => !used.has(def.key));
    if (!remaining.length) break;
    const def = pick(remaining);
    used.add(def.key);
    result.push(def.key);
  }
  return result;
}

export function createItem(
  slot: ItemSlot,
  ilvl: number,
  luck = 0,
  forcedRarity?: Rarity,
  bonusRarity = 0,
): Item {
  const types = slot === 'weapon' ? WEAPON_TYPES : ARMOR_TYPES;
  const base = pick(types);
  const rarity = forcedRarity ?? rollRarity(luck, ilvl, bonusRarity);
  const rarityMeta = RARITY_META[rarity];
  const usedImplicit = new Set<StatKey>();
  const usedExplicit = new Set<StatKey>();

  const implicits: Affix[] = base.implicits.slice(0, rarityMeta.implicits).map((key) => {
    usedImplicit.add(key);
    return makeAffix(key, rarity, ilvl, 'implicit');
  });

  const explicitCount = rarityMeta.explicits;
  const keys = rollNonDuplicateKeys(AFFIX_POOL.filter((d) => d.slots.includes(slot)), explicitCount, rarity, usedExplicit);
  const explicits = keys.map((key) => makeAffix(key, rarity, ilvl, 'explicit'));

  let name = `${pick(RARITY_PREFIX[rarity])}·${base.name}`;
  if (rarity === 3) {
    name = `${pick(RARITY_PREFIX[rarity])}·${base.name}`;
  }

  const baseDamage =
    slot === 'weapon'
      ? Math.round((3 + 7 * Math.pow(1.33, ilvl - 1)) * base.damageMult * RARITY_MULT[rarity] * randomRange(0.94, 1.06))
      : 0;
  const baseHp =
    slot === 'armor'
      ? Math.round((20 + 35 * Math.pow(1.21, ilvl - 1)) * base.hpMult * RARITY_MULT[rarity] * randomRange(0.94, 1.06))
      : 0;

  return {
    uid: uid('item'),
    slot,
    name,
    baseType: base.id,
    rarity,
    ilvl,
    baseDamage,
    baseHp,
    implicits,
    explicits,
    improvements: 0,
    pity: 0,
    seals: [],
    createdAt: Date.now(),
  };
}

export function createStarterItems(): Item[] {
  const weapon: Item = {
    uid: uid('item'),
    slot: 'weapon',
    name: '旧式·雷霆锤',
    baseType: 'thunder_hammer',
    rarity: 0,
    ilvl: 1,
    baseDamage: 3,
    baseHp: 0,
    implicits: [{ key: 'areaPct', value: 4, kind: 'implicit' }],
    explicits: [],
    improvements: 0,
    pity: 0,
    seals: [],
    createdAt: Date.now(),
  };
  const armor: Item = {
    uid: uid('item'),
    slot: 'armor',
    name: '制式·审判官长袍',
    baseType: 'robe',
    rarity: 0,
    ilvl: 1,
    baseDamage: 0,
    baseHp: 20,
    implicits: [{ key: 'dodge', value: 2, kind: 'implicit' }],
    explicits: [],
    improvements: 0,
    pity: 0,
    seals: [],
    createdAt: Date.now(),
  };
  return [weapon, armor];
}

export function createSeal(weaponIlvl: number): Seal {
  const tierRoll = Math.random();
  const tier: Seal['tier'] = tierRoll < 0.52 ? 1 : tierRoll < 0.86 ? 2 : 3;
  const used = new Set<StatKey>();
  const count = tier >= 2 ? 2 : 1;
  const pool = AFFIX_POOL.filter((d) => d.slots.includes('weapon') && !d.discrete && (d.minRarity ?? 0) <= 2);
  const stats: Affix[] = [];
  for (let i = 0; i < count; i++) {
    const candidates = pool.filter((d) => !used.has(d.key));
    if (!candidates.length) break;
    const def = pick(candidates);
    used.add(def.key);
    const rarity = (tier === 3 ? 3 : tier === 2 ? 2 : 1) as Rarity;
    const affix = makeAffix(def.key, rarity, weaponIlvl, 'seal');
    stats.push({ ...affix, value: Math.round(affix.value * (tier === 3 ? 1.25 : 1) * 10) / 10 });
  }
  const names = ['祷文·坚忍', '祷文·怒火', '祷文·洞察', '祷文·机魂', '祷文·永恒', '祷文·星炬'];
  const flavors = [
    '“痛苦是帝皇的试炼。”',
    '“让异形在你的枪口下学会敬畏。”',
    '“看见它，然后让它不存在。”',
    '“机魂与你同在。”',
    '“死亡是职责的完成。”',
    '“星炬不灭，帝国不倒。”',
  ];
  const idx = Math.floor(Math.random() * names.length);
  return {
    uid: uid('seal'),
    name: `${names[idx]} ${['I', 'II', 'III'][tier - 1]}`,
    tier,
    stats,
    flavor: flavors[idx],
  };
}

export function getItemAffixes(item: Item): Affix[] {
  return [...item.implicits, ...item.explicits, ...item.seals.flatMap((seal) => seal.stats)];
}

export function getAffixUpgradeFactor(item: Item): number {
  return 1 + item.improvements * 0.055;
}

export function getItemStats(item: Item): StatBlock {
  const stats: StatBlock = {};
  const factor = getAffixUpgradeFactor(item);
  for (const affix of getItemAffixes(item)) {
    const discrete = AFFIX_POOL.find((d) => d.key === affix.key)?.discrete;
    const value = discrete ? affix.value : affix.value * factor;
    stats[affix.key] = (stats[affix.key] ?? 0) + value;
  }
  return stats;
}

export function getItemDisplayStats(item: Item): Array<{ label: string; value: string; sealed: boolean }> {
  const stats: Array<{ label: string; value: string; sealed: boolean }> = [];
  const factor = getAffixUpgradeFactor(item);
  const display = (affix: Affix) => {
    const discrete = AFFIX_POOL.find((entry) => entry.key === affix.key)?.discrete;
    const value = discrete ? affix.value : affix.value * factor;
    return formatAffix({ ...affix, value });
  };
  for (const affix of item.implicits) {
    stats.push({
      label: STAT_META[affix.key].name,
      value: display(affix),
      sealed: false,
    });
  }
  for (const affix of item.explicits) {
    stats.push({
      label: STAT_META[affix.key].name,
      value: display(affix),
      sealed: false,
    });
  }
  for (const seal of item.seals) {
    for (const affix of seal.stats) {
      stats.push({
        label: `${STAT_META[affix.key].name} · 圣印`,
        value: display(affix),
        sealed: true,
      });
    }
  }
  return stats;
}

function formatAffix(affix: Affix): string {
  const meta = STAT_META[affix.key];
  if (meta.suffix === 'pct') return `+${affix.value.toFixed(affix.value % 1 === 0 ? 0 : 1)}%`;
  return `+${affix.value.toFixed(affix.value % 1 === 0 ? 0 : 1)}`;
}

export function getWeaponForgeCost(ilvl: number, luck = 0): { gelt: number; promethium: number } {
  return {
    gelt: Math.round(160 * Math.pow(1.35, ilvl - 1) * (1 - Math.min(0.25, luck * 0.004))),
    promethium: Math.round(10 * Math.pow(1.18, ilvl - 1)),
  };
}

export function getUpgradeCost(item: Item): { gelt: number; promethium: number } {
  return {
    gelt: Math.round((55 + item.ilvl * 22) * (1 + item.improvements * 0.7)),
    promethium: Math.round(4 + item.ilvl * 1.6 + item.improvements * 2.4),
  };
}

export function getRerollCost(item: Item): { gelt: number; plasteel: number } {
  return {
    gelt: Math.round((100 + item.ilvl * 28) * (1 + item.explicits.length * 0.25)),
    plasteel: Math.round(5 + item.ilvl * 1.1),
  };
}

export function getSalvageValue(item: Item): { gelt: number; promethium: number; plasteel: number; ceramite: number } {
  const mult = [1, 2.3, 4.2, 8][item.rarity];
  return {
    gelt: Math.round(12 * mult * (1 + item.ilvl * 0.4)),
    promethium: Math.round(1.5 * mult + item.ilvl * 0.35),
    plasteel: Math.round(1.5 * mult + item.ilvl * 0.3),
    ceramite: item.rarity >= 2 ? Math.round(mult * 0.8 + item.ilvl * 0.25) : 0,
  };
}

export function getSealCost(slotIndex: number): { gelt: number; plasteel: number; warpDust: number; ceramite: number } {
  return {
    gelt: 400 * Math.pow(3.2, slotIndex),
    plasteel: 15 * (slotIndex + 1),
    warpDust: 8 * (slotIndex + 1),
    ceramite: slotIndex >= 2 ? 25 : 0,
  };
}

export function getItemPower(item: Item): number {
  const stats = getItemStats(item);
  const base = item.baseDamage * 3 + item.baseHp * 0.6;
  const statPower = Object.entries(stats).reduce((sum, [key, value]) => {
    const weight =
      key === 'projectiles' || key === 'orbitalCharges' || key === 'orbitalShells'
        ? 120
        : key === 'pierce' || key === 'maxTames'
          ? 60
          : 1;
    return sum + (value ?? 0) * weight;
  }, 0);
  return Math.round(base + statPower + item.rarity * 30 + item.improvements * 12);
}

export function getLegendaryFlavor(): string {
  return pick(LEGENDARY_FLAVOR);
}

export function randomAffixForDisplay(item: Item): Affix {
  const all = getItemAffixes(item);
  return all.length ? pick(all) : { key: 'damagePct', value: 0, kind: 'explicit' };
}



export function getWeaponType(id: string): BaseType | undefined {
  return WEAPON_TYPES.find((type) => type.id === id);
}

export function getArmorType(id: string): BaseType | undefined {
  return ARMOR_TYPES.find((type) => type.id === id);
}

export function getItemTypeName(item: Item): string {
  const base = item.slot === 'weapon' ? getWeaponType(item.baseType) : getArmorType(item.baseType);
  return base?.name ?? item.baseType;
}

export function getItemFlavor(item: Item): string {
  const base = item.slot === 'weapon' ? getWeaponType(item.baseType) : getArmorType(item.baseType);
  if (item.rarity === 3) return getLegendaryFlavor();
  return base?.flavor ?? '';
}

export function isImprovementSuccess(item: Item): boolean {
  const p = clamp(0.6 - item.improvements * 0.1 + item.pity, 0.1, 0.95);
  return chance(p);
}

export function rerollExplicits(item: Item): Item {
  return {
    ...item,
    explicits: item.explicits.map((affix) => makeAffix(affix.key, item.rarity, item.ilvl, 'explicit')),
  };
}
