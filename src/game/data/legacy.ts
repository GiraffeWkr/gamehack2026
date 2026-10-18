import type { IconName, LegacyKey } from '../types';

export interface LegacyDef {
  id: LegacyKey;
  name: string;
  english: string;
  icon: IconName;
  color: string;
  description: string;
  perRank: string;
  maxRank: number;
  baseCost: number;
}

export const LEGACY_PERKS: Record<LegacyKey, LegacyDef> = {
  might: {
    id: 'might',
    name: '力量遗产',
    english: 'MIGHT',
    icon: 'sword',
    color: '#e39a55',
    description: '上一任幸存者的肌肉记忆被封存在神经接口里。',
    perRank: '伤害 +8%',
    maxRank: 10,
    baseCost: 1,
  },
  vitality: {
    id: 'vitality',
    name: '生命遗产',
    english: 'VITALITY',
    icon: 'shield',
    color: '#c96b63',
    description: '不是每个人都留下了完整器官，但至少留下了撑下去的本能。',
    perRank: '生命上限 +8%',
    maxRank: 10,
    baseCost: 1,
  },
  ordnance: {
    id: 'ordnance',
    name: '轨道遗产',
    english: 'ORDNANCE',
    icon: 'beacon',
    color: '#d7b25e',
    description: '舰炮校准数据不会随幸存者一起死去。',
    perRank: '轨道伤害 +7%',
    maxRank: 10,
    baseCost: 1,
  },
  fortune: {
    id: 'fortune',
    name: '幸运遗产',
    english: 'FORTUNE',
    icon: 'gelt',
    color: '#9cbf5f',
    description: '活下来的人总有些来路不明的小运气。',
    perRank: '王座币 +8%',
    maxRank: 10,
    baseCost: 1,
  },
};

export const LEGACY_LIST: LegacyDef[] = [
  LEGACY_PERKS.might,
  LEGACY_PERKS.vitality,
  LEGACY_PERKS.ordnance,
  LEGACY_PERKS.fortune,
];

export function getLegacyCost(def: LegacyDef, currentRank: number): number {
  return def.baseCost + Math.floor(currentRank * 0.8);
}

export function emptyLegacy(): Record<LegacyKey, number> {
  return { might: 0, vitality: 0, ordnance: 0, fortune: 0 };
}
