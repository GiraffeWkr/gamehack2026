import type { DifficultyDef, DifficultyId } from '../types';

export const DIFFICULTIES: Record<DifficultyId, DifficultyDef> = {
  recruit: {
    id: 'recruit',
    name: '新兵',
    english: 'RECRUIT',
    tagline: '先把战争看完',
    description: '敌潮更稀疏、伤害更低。适合第一次进入无尽战场，先熟悉移动、闪避与轨道预判。',
    enemyHpMult: 0.85,
    enemyDamageMult: 0.7,
    spawnMult: 0.88,
    rewardMult: 0.9,
    color: '#72b8a8',
  },
  standard: {
    id: 'standard',
    name: '标准',
    english: 'STANDARD',
    tagline: '帝国标准净化协议',
    description: '完整的异形压力与配额节奏。建议在掌握闪避与一次齐射清场后使用。',
    enemyHpMult: 1,
    enemyDamageMult: 1,
    spawnMult: 1,
    rewardMult: 1,
    color: '#d7b25e',
    recommended: true,
  },
  veteran: {
    id: 'veteran',
    name: '老兵',
    english: 'VETERAN',
    tagline: '给已经死过一次的人',
    description: '敌人更硬、更疼、更密。兽人枪手会从远处压制你，逼迫你持续移动。',
    enemyHpMult: 1.28,
    enemyDamageMult: 1.45,
    spawnMult: 1.15,
    rewardMult: 1.18,
    color: '#e39a55',
  },
  exterminatus: {
    id: 'exterminatus',
    name: '灭绝令',
    english: 'EXTERMINATUS',
    tagline: '这颗星球不值得拯救',
    description: '为满配与速通准备。任何一次站位失误都可能让远征提前结束，但回收率极高。',
    enemyHpMult: 1.6,
    enemyDamageMult: 1.9,
    spawnMult: 1.32,
    rewardMult: 1.4,
    color: '#d85b4e',
  },
};

export const DIFFICULTY_LIST: DifficultyDef[] = [
  DIFFICULTIES.recruit,
  DIFFICULTIES.standard,
  DIFFICULTIES.veteran,
  DIFFICULTIES.exterminatus,
];

export const DEFAULT_DIFFICULTY: DifficultyId = 'standard';

export function getDifficulty(id: DifficultyId | string | undefined): DifficultyDef {
  return DIFFICULTIES[(id ?? DEFAULT_DIFFICULTY) as DifficultyId] ?? DIFFICULTIES.standard;
}
