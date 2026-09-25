/**
 * Localisation.
 *
 * The original ships 14 languages resolved through `LocalizerManager` with
 * `VariableName + StatsProp` style keys. This port uses the same shape (a flat
 * key -> string table with `{name}` placeholders) but starts with the two
 * languages that matter for the slice.
 *
 * Chinese is the default, per the project brief.
 */

export type Lang = 'zh' | 'en';

interface Entry {
  zh: string;
  en: string;
}

const TABLE: Record<string, Entry> = {
  gameTitle: { zh: '扎德弓箭手', en: 'Zad Archery' },

  // HUD
  hp: { zh: '生命', en: 'HP' },
  level: { zh: '第 {n} 关', en: 'Stage {n}' },
  playerLevel: { zh: '等级 {n}', en: 'Level {n}' },
  packs: { zh: '{done}/{total} 波', en: '{done}/{total} packs' },
  arrows: { zh: '箭矢', en: 'ARROWS' },
  gold: { zh: '金币', en: 'gold' },

  // Portal
  portalTitle: { zh: '传送门', en: 'RUN PORTAL' },
  portalSummoning: { zh: '召唤中 {s} 秒', en: 'summoning {s}s' },
  portalDormant: { zh: '清空所有敌群后开启', en: 'clear all packs first' },

  // Run flow
  levelCleared: { zh: '第 {n} 关 完成', en: 'LEVEL {n} CLEARED' },
  levelStart: { zh: '第 {n} 关', en: 'LEVEL {n}' },
  down: { zh: '倒下了 · 复活中', en: 'DOWN — RESPAWNING' },

  // Skills
  skillMultishot: { zh: '多重射击', en: 'Multishot' },
  skillRapidFire: { zh: '急速射击', en: 'Rapid Fire' },
  skillSharpShooter: { zh: '神射', en: 'Sharp Shooter' },

  // Rotate prompt
  rotateTitle: { zh: '请横屏游玩', en: 'Rotate to landscape' },
  rotateBody: {
    zh: '《扎德弓箭手》是横版推进玩法：角色自动前进，你只需点击屏幕决定箭雨落点。需要横屏才能游玩。',
    en: 'Zad Archery is a side-scrolling run: the character advances on his own and you aim by tapping. It needs a landscape screen.',
  },

  // Hints
  hintTap: { zh: '点击屏幕砸下箭雨', en: 'Tap to drop arrows' },
  hintHold: { zh: '按住可连续落箭', en: 'Hold to keep firing' },

  // Magazine feedback
  noArrows: { zh: '箭矢不足', en: 'NO ARROWS' },

  // Shop / upgrades
  shopTitle: { zh: '强化', en: 'UPGRADES' },
  shopHint: { zh: '用金币永久强化，购买后立即生效', en: 'Spend gold on permanent upgrades, applied immediately' },
  shopMaxed: { zh: '已满级', en: 'MAX' },
  shopOpen: { zh: '天赋', en: 'TALENTS' },
  // Jobs screen. The original names them 弓箭手 / 猎人 / 狙击手 / 元素使 / 虚空弓箭手, which the
  // panel reads out of `jobData.ts` rather than duplicating here.
  jobsOpen: { zh: '职业', en: 'JOBS' },
  masteryOpen: { zh: '精通', en: 'MASTERY' },

  upDamage: { zh: '箭矢伤害', en: 'Arrow Damage' },
  upDamageDesc: { zh: '提高基础伤害', en: 'Raises base damage' },
  upHealth: { zh: '生命上限', en: 'Max Health' },
  upHealthDesc: { zh: '提高最大生命值', en: 'Raises maximum health' },
  upAttackSpeed: { zh: '攻击速度', en: 'Attack Speed' },
  upAttackSpeedDesc: { zh: '角色自动射击更快', en: 'The archer shoots faster' },
  upMagazineSize: { zh: '弹匣容量', en: 'Magazine Size' },
  upMagazineSizeDesc: { zh: '一次可连砸更多箭雨', en: 'More arrow-falls before reloading' },
  upMagazineRegen: { zh: '弹匣回复', en: 'Magazine Regen' },
  upMagazineRegenDesc: { zh: '箭矢回复更快', en: 'Arrows come back faster' },
  upCritChance: { zh: '暴击率', en: 'Crit Chance' },
  upCritChanceDesc: { zh: '提高暴击概率', en: 'Chance to crit' },
  upArrowDamage: { zh: '箭雨威力', en: 'Arrow Fall Power' },
  upArrowDamageDesc: { zh: '提高点击箭雨的伤害', en: 'Raises the tapped arrow-fall damage' },
};

let current: Lang = 'zh';

export function setLang(lang: Lang): void {
  current = lang;
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang === 'zh' ? 'zh-CN' : 'en';
  }
}

export function getLang(): Lang {
  return current;
}

/** Translate a key, substituting `{name}` placeholders. */
export function t(key: string, params?: Record<string, string | number>): string {
  const entry = TABLE[key];
  let text = entry ? entry[current] : key;
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      text = text.replaceAll(`{${k}}`, String(v));
    }
  }
  return text;
}

/** Every key, for the verify suite to assert coverage. */
export function allKeys(): string[] {
  return Object.keys(TABLE);
}

/** Missing translations in either language (should always be empty). */
export function missingKeys(): string[] {
  return Object.entries(TABLE)
    .filter(([, e]) => !e.zh || !e.en)
    .map(([k]) => k);
}
