import type {
  DifficultyId,
  InstitutionId,
  Item,
  ResourceKey,
  SaveData,
  Settings,
  SkillId,
} from '../types';
import { DIFFICULTIES } from '../data/difficulties';
import { LEGACY_PERKS, getLegacyCost } from '../data/legacy';
import {
  INSTITUTIONS,
  SKILLS,
} from '../data/institutions';
import { CODEX_BY_ID, getCodexCost } from '../data/codex';
import { STAR_BY_ID } from '../data/stars';
import {
  createItem,
  createSeal,
  getRerollCost,
  getSalvageValue,
  getSealCost,
  getUpgradeCost,
  getWeaponForgeCost,
  isImprovementSuccess,
  rerollExplicits,
} from '../data/items';
import { EXTRACTION_MINES } from '../data/constants';
import {
  addResources,
  calculateStats,
  canAfford,
  cloneSave,
  getEndlessTier,
  getEquippedWeapon,
  getMineUpgradeCost,
  getSkillUnlockCost,
  getSkillUpgradeCost,
  getUnlockedSystems,
  MAX_INVENTORY,
  payCost,
} from './save';
import { formatNumber } from './format';

export interface Outcome<T = undefined> {
  ok: boolean;
  save: SaveData;
  message: string;
  data?: T;
}

function fail<T = undefined>(save: SaveData, message: string): Outcome<T> {
  return { ok: false, save, message };
}

function success<T = undefined>(save: SaveData, message: string, data?: T): Outcome<T> {
  return { ok: true, save, message, data };
}

export function buyLegacy(save: SaveData, key: keyof typeof LEGACY_PERKS): Outcome {
  const def = LEGACY_PERKS[key];
  if (!def) return fail(save, '未知的遗产。');
  const current = save.endless?.legacy?.[key] ?? 0;
  if (current >= def.maxRank) return fail(save, '这项遗产已经达到上限。');
  const cost = getLegacyCost(def, current);
  if ((save.endless?.chests ?? 0) < cost) return fail(save, '遗产宝箱不足。');
  const next = cloneSave(save);
  next.endless.chests -= cost;
  next.endless.legacy[key] = current + 1;
  return success(next, `${def.name}提升至 ${current + 1}/${def.maxRank}：${def.perRank}。`);
}

export function setDifficulty(save: SaveData, id: DifficultyId): Outcome {
  const difficulty = DIFFICULTIES[id];
  if (!difficulty) return fail(save, '未知的威胁协议。');
  if (save.difficulty === id) return fail(save, '当前已经使用该威胁协议。');
  const next = cloneSave(save);
  next.difficulty = id;
  return success(
    next,
    `威胁协议切换为「${difficulty.name}」。下一场战斗生效，战利品倍率 ×${difficulty.rewardMult.toFixed(2)}。`,
  );
}

export function buyCodexNode(save: SaveData, nodeId: string): Outcome {
  const node = CODEX_BY_ID[nodeId];
  if (!node) return fail(save, '未知的圣典节点。');
  if (!getUnlockedSystems(save).codex) return fail(save, '《圣典》尚未解锁。完成首次战斗后即可翻阅。');
  const rank = save.codex[node.id] ?? 0;
  if (rank >= node.maxRank) return fail(save, '该节点已达上限。');
  if (node.requires) {
    const parentRank = save.codex[node.requires] ?? 0;
    if (parentRank < 1) return fail(save, '必须先点亮前置节点。');
  }
  const cost = getCodexCost(node, rank);
  const totalCost: Partial<Record<ResourceKey, number>> = { gelt: cost.gelt };
  if (node.mat && cost.mat) totalCost[node.mat] = cost.mat;
  if (!canAfford(save.resources, totalCost)) return fail(save, '资源不足。');
  const next = cloneSave(save);
  payCost(next.resources, totalCost);
  next.codex[node.id] = rank + 1;
  return success(next, `${node.name} 提升至 ${rank + 1}/${node.maxRank}。`);
}

export function buyStarPerk(save: SaveData, perkId: string): Outcome {
  const perk = STAR_BY_ID[perkId];
  if (!perk) return fail(save, '未知的星炬祝福。');
  if (!getUnlockedSystems(save).star) return fail(save, '星炬尚未点亮。单次生存 15 分钟后解锁。');
  if (save.starPerks.includes(perk.id)) return fail(save, '该祝福已经点亮。');
  if (perk.requires && !save.starPerks.includes(perk.requires)) return fail(save, '星炬之光尚未照到这颗星辰。');
  if (!canAfford(save.resources, perk.cost)) return fail(save, '资源不足。');
  const next = cloneSave(save);
  payCost(next.resources, perk.cost);
  next.starPerks.push(perk.id);
  return success(next, `星炬祝福：${perk.name}。`);
}

export function unlockInstitution(save: SaveData, id: InstitutionId): Outcome {
  const institution = INSTITUTIONS[id];
  if (!institution) return fail(save, '未知机构。');
  if (save.institutions[id]?.unlocked) return fail(save, '该机构已经效忠于你。');
  if ((save.endless?.bestTime ?? 0) < institution.unlockMinutes * 60) {
    return fail(save, `需要单次无尽生存 ${institution.unlockMinutes} 分钟。`);
  }
  if (!canAfford(save.resources, institution.unlockCost)) return fail(save, '资源不足。');
  const next = cloneSave(save);
  payCost(next.resources, institution.unlockCost);
  next.institutions[id].unlocked = true;
  next.institutions[id].level = Math.max(1, next.institutions[id].level);
  return success(next, `机构已建立：${institution.name}。`);
}

export function setActiveInstitution(save: SaveData, id: InstitutionId): Outcome {
  if (!save.institutions[id]?.unlocked) return fail(save, '该机构尚未解锁。');
  const next = cloneSave(save);
  next.activeInstitution = id;
  return success(next, `战斗机构切换为：${INSTITUTIONS[id].name}。`);
}

export function unlockSkill(save: SaveData, id: SkillId): Outcome {
  const skill = SKILLS[id];
  if (!skill) return fail(save, '未知技能。');
  if (!save.institutions[skill.institution]?.unlocked) return fail(save, '所属机构尚未解锁。');
  if (save.skillUnlocks.includes(id)) return fail(save, '该技能已经学会。');
  const cost = getSkillUnlockCost(id);
  if (!canAfford(save.resources, { gelt: cost.gelt, [cost.matKey]: cost.matAmount })) {
    return fail(save, '资源不足，无法学习该技能。');
  }
  const next = cloneSave(save);
  payCost(next.resources, { gelt: cost.gelt, [cost.matKey]: cost.matAmount });
  next.skillUnlocks.push(id);
  next.skillLevels[id] = Math.max(1, next.skillLevels[id] ?? 1);
  return success(next, `已学会技能：${skill.name}。`);
}

export function upgradeSkill(save: SaveData, id: SkillId): Outcome {
  const skill = SKILLS[id];
  if (!skill) return fail(save, '未知技能。');
  if (!save.institutions[skill.institution]?.unlocked) return fail(save, '所属机构尚未解锁。');
  if (!save.skillUnlocks.includes(id)) return fail(save, '需要先学习该技能。');
  const level = save.skillLevels[id] ?? 1;
  if (level >= 3) return fail(save, '该技能已达到最高等级。');
  const cost = getSkillUpgradeCost(save, id, level);
  const totalCost: Partial<Record<ResourceKey, number>> = {
    gelt: cost.gelt,
    [cost.matKey]: cost.matAmount,
  };
  if (!canAfford(save.resources, totalCost)) return fail(save, '资源不足。');
  const next = cloneSave(save);
  payCost(next.resources, totalCost);
  next.skillLevels[id] = level + 1;
  return success(next, `${skill.name} 提升至 ${level + 1} 级。`);
}

export function forgeItem(save: SaveData): Outcome<Item> {
  if (!getUnlockedSystems(save).forge) return fail(save, '锻造台尚未解锁。');
  if (save.inventory.length >= MAX_INVENTORY) return fail(save, '军械库已满。先回收一些装备。');
  const stats = calculateStats(save);
  const ilvl = getEndlessTier(save);
  const cost = getWeaponForgeCost(ilvl, stats.luck);
  if (!canAfford(save.resources, cost)) return fail(save, '资源不足。');
  const next = cloneSave(save);
  payCost(next.resources, cost);
  const item = createItem(Math.random() < 0.52 ? 'weapon' : 'armor', ilvl, stats.luck);
  next.inventory.push(item);
  next.stats.forged += 1;
  return success(next, `锻造完成：${item.name}。`, item);
}

export function equipItem(save: SaveData, itemUid: string): Outcome {
  const item = save.inventory.find((entry) => entry.uid === itemUid);
  if (!item) return fail(save, '找不到这件装备。');
  const next = cloneSave(save);
  if (item.slot === 'weapon') next.equippedWeapon = item.uid;
  else next.equippedArmor = item.uid;
  return success(next, `已装备：${item.name}。`);
}

export function salvageItem(save: SaveData, itemUid: string): Outcome {
  const item = save.inventory.find((entry) => entry.uid === itemUid);
  if (!item) return fail(save, '找不到这件装备。');
  if (item.uid === save.equippedWeapon || item.uid === save.equippedArmor) {
    return fail(save, '已装备的物品无法直接回收。');
  }
  const value = getSalvageValue(item);
  const next = cloneSave(save);
  next.inventory = next.inventory.filter((entry) => entry.uid !== itemUid);
  addResources(next.resources, value);
  return success(next, `已回收 ${item.name}。`);
}

export function upgradeItem(save: SaveData, itemUid: string): Outcome<{ success: boolean; item: Item }> {
  const item = save.inventory.find((entry) => entry.uid === itemUid);
  if (!item) return fail(save, '找不到这件装备。');
  if (item.improvements >= 10) return fail(save, '该装备已达到祝圣上限。');
  const cost = getUpgradeCost(item);
  if (!canAfford(save.resources, cost)) return fail(save, '资源不足。');
  const next = cloneSave(save);
  payCost(next.resources, cost);
  const target = next.inventory.find((entry) => entry.uid === itemUid)!;
  const didSucceed = isImprovementSuccess(target);
  if (didSucceed) {
    target.improvements += 1;
    target.pity = 0;
  } else {
    target.pity = Math.min(0.5, target.pity + 0.1);
  }
  return success(
    next,
    didSucceed ? `祝圣成功。${item.name} +${target.improvements}` : '机魂拒绝了这次祝圣。保底概率已提升。',
    { success: didSucceed, item: target },
  );
}

export function rerollItem(save: SaveData, itemUid: string): Outcome<Item> {
  const item = save.inventory.find((entry) => entry.uid === itemUid);
  if (!item) return fail(save, '找不到这件装备。');
  if (!item.explicits.length) return fail(save, '这件装备没有可重铸的随机词条。');
  const cost = getRerollCost(item);
  if (!canAfford(save.resources, cost)) return fail(save, '资源不足。');
  const next = cloneSave(save);
  payCost(next.resources, cost);
  const target = next.inventory.find((entry) => entry.uid === itemUid)!;
  const rerolled = rerollExplicits(target);
  Object.assign(target, rerolled);
  return success(next, `已重铸 ${target.name} 的词条。`, target);
}

export function consecrateWeapon(save: SaveData): Outcome {
  if (!getUnlockedSystems(save).consecration) return fail(save, '圣化祭坛尚未解锁。');
  const weapon = getEquippedWeapon(save);
  if (!weapon) return fail(save, '必须装备一把武器才能刻印圣印。');
  if (weapon.seals.length >= 3) return fail(save, '这把武器已经没有空的圣印槽。');
  const cost = getSealCost(weapon.seals.length);
  if (!canAfford(save.resources, cost)) return fail(save, '资源不足。');
  const next = cloneSave(save);
  payCost(next.resources, cost);
  const target = next.inventory.find((entry) => entry.uid === weapon.uid)!;
  const seal = createSeal(weapon.ilvl);
  target.seals.push(seal);
  return success(next, `圣印刻入：${seal.name}。`);
}

export function removeSeal(save: SaveData, sealUid: string): Outcome {
  const weapon = getEquippedWeapon(save);
  if (!weapon) return fail(save, '没有装备武器。');
  if (!weapon.seals.some((seal) => seal.uid === sealUid)) return fail(save, '找不到这枚圣印。');
  const next = cloneSave(save);
  const target = next.inventory.find((entry) => entry.uid === weapon.uid)!;
  target.seals = target.seals.filter((seal) => seal.uid !== sealUid);
  return success(next, '圣印已剥离。');
}

export function upgradeMine(save: SaveData, resource: ResourceKey): Outcome {
  if (!getUnlockedSystems(save).extraction) return fail(save, '开采场尚未解锁。');
  const def = EXTRACTION_MINES.find((mine) => mine.resource === resource);
  if (!def) return fail(save, '未知矿脉。');
  const level = save.extraction.levels[resource] ?? 1;
  const cost = getMineUpgradeCost(def, level);
  if (save.resources.gelt < cost) return fail(save, `需要 ${formatNumber(cost)} 王座币。`);
  const next = cloneSave(save);
  next.resources.gelt -= cost;
  next.extraction.levels[resource] = level + 1;
  return success(next, `${def.name} 升级至 ${level + 1} 级。`);
}

export function updateSettings(save: SaveData, settings: Partial<Settings>): Outcome {
  const next = cloneSave(save);
  next.settings = { ...next.settings, ...settings };
  return success(next, '设置已保存。');
}

export function renameInquisitor(save: SaveData, name: string): Outcome {
  const trimmed = name.trim().slice(0, 18);
  if (!trimmed) return fail(save, '名号不能为空。');
  const next = cloneSave(save);
  next.inquisitorName = trimmed;
  return success(next, '名号已更新。');
}

export function markTutorialSeen(save: SaveData): SaveData {
  if (save.tutorialSeen) return save;
  const next = cloneSave(save);
  next.tutorialSeen = true;
  return next;
}


