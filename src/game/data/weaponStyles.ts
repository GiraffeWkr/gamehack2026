import type { IconName } from '../types';

export type WeaponStyleId =
  | 'chainsword'
  | 'thunder_hammer'
  | 'storm_shield'
  | 'plasma_gun'
  | 'melta_gun'
  | 'banner';

export interface WeaponStyle {
  id: WeaponStyleId;
  label: string;
  description: string;
  icon: IconName;
  color: string;
  /** Multiplier on the player's attack interval. */
  cooldownMult: number;
  /** Multiplier on the player's damage stat. */
  damageMult: number;
  ranged: boolean;
}

export const WEAPON_STYLES: Record<WeaponStyleId, WeaponStyle> = {
  chainsword: {
    id: 'chainsword',
    label: '链锯横扫',
    description: '快速挥出大范围锯齿弧，连续命中前方敌人。',
    icon: 'sword',
    color: '#d8c08a',
    cooldownMult: 0.72,
    damageMult: 0.82,
    ranged: false,
  },
  thunder_hammer: {
    id: 'thunder_hammer',
    label: '雷霆震击',
    description: '沉重地砸向光标位置，冲击波撕裂小范围敌群。',
    icon: 'hammer',
    color: '#d7b25e',
    cooldownMult: 1.35,
    damageMult: 1.85,
    ranged: false,
  },
  storm_shield: {
    id: 'storm_shield',
    label: '风暴盾击',
    description: '盾面猛撞前方，击退敌人并短暂获得无敌。',
    icon: 'shield',
    color: '#8fb6c9',
    cooldownMult: 1.05,
    damageMult: 0.62,
    ranged: false,
  },
  plasma_gun: {
    id: 'plasma_gun',
    label: '电浆爆裂',
    description: '发射慢速电浆球，命中后爆炸并波及周围敌人。',
    icon: 'bolt',
    color: '#79d8ff',
    cooldownMult: 1.22,
    damageMult: 1.42,
    ranged: true,
  },
  melta_gun: {
    id: 'melta_gun',
    label: '热熔喷射',
    description: '近距离锥形热流，距离越近伤害越集中。',
    icon: 'flame',
    color: '#ff9a52',
    cooldownMult: 1.38,
    damageMult: 1.65,
    ranged: true,
  },
  banner: {
    id: 'banner',
    label: '战旗鼓舞',
    description: '以战旗震荡四周，伤害敌人并短暂强化自身。',
    icon: 'star',
    color: '#e5c477',
    cooldownMult: 1.05,
    damageMult: 0.45,
    ranged: false,
  },
};

export const WEAPON_STYLE_LIST = Object.values(WEAPON_STYLES);

export function getWeaponStyle(baseType?: string): WeaponStyle {
  if (baseType && baseType in WEAPON_STYLES) {
    return WEAPON_STYLES[baseType as WeaponStyleId];
  }
  return WEAPON_STYLES.thunder_hammer;
}
