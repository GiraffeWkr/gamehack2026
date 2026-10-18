import type {
  BattleResult,
  BattleRewardSummary,
  ExtractionMineDef,
  FactionId,
  InstitutionId,
  Item,
  PlayerStats,
  ResourceKey,
  ResourceMap,
  SaveData,
  SkillId,
  StatBlock,
  StatKey,
} from '../types';
import {
  BASE_PLAYER,
  EMPTY_RESOURCES,
  ENEMY_BASE_HP,
  ENEMY_BASE_DAMAGE,
  EXTRACTION_MINES,
  EXTRACTION_OFFLINE_CAP_HOURS,
  GAME_VERSION,
  ITEM_ARMOR_SCALE,
  ITEM_DAMAGE_SCALE,
  RESOURCE_KEYS,
  SAVE_KEY,
  SAVE_VERSION,
} from '../data/constants';
import { ACHIEVEMENTS } from '../data/achievements';
import { CODEX_BY_ID, CODEX_NODES, getCodexCost } from '../data/codex';
import { INSTITUTIONS, SKILLS } from '../data/institutions';
import { STAR_PERKS } from '../data/stars';
import { createItem, createStarterItems, getItemStats } from '../data/items';
import { clamp } from './rng';
import { formatNumber } from './format';

export const MAX_INVENTORY = 48;
export const CODEX_UNLOCK_BATTLES = 1;

export interface UnlockState {
  codex: boolean;
  forge: boolean;
  extraction: boolean;
  consecration: boolean;
  star: boolean;
}

export function getUnlockedSystems(save: SaveData): UnlockState {
  const bestTime = save.endless?.bestTime ?? 0;
  return {
    codex: save.stats.runs >= CODEX_UNLOCK_BATTLES,
    forge: bestTime >= 120,
    extraction: bestTime >= 300,
    consecration: bestTime >= 600,
    star: bestTime >= 900,
  };
}

export function createNewSave(name: string): SaveData {
  const items = createStarterItems();
  const weapon = items.find((item) => item.slot === 'weapon');
  const armor = items.find((item) => item.slot === 'armor');
  const now = Date.now();
  const institutions = Object.fromEntries(
    Object.keys(INSTITUTIONS).map((id) => [id, { unlocked: id === 'astartes', level: 1 }]),
  ) as SaveData['institutions'];
  const skillLevels = Object.fromEntries(
    Object.keys(SKILLS).map((id) => [id, 1]),
  ) as Record<SkillId, number>;
  const extractionLevels = Object.fromEntries(
    RESOURCE_KEYS.map((key) => [key, 1]),
  ) as Record<ResourceKey, number>;
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSaved: now,
    inquisitorName: name.trim() || '塞拉斯·沃尔',
    difficulty: 'standard',
    endless: {
      chests: 0,
      bestTime: 0,
      bestKills: 0,
      bestBosses: 0,
      runs: 0,
      legacy: { might: 0, vitality: 0, ordnance: 0, fortune: 0 },
    },
    resources: { ...EMPTY_RESOURCES, gelt: 25, promethium: 5 },
    activeInstitution: 'astartes',
    institutions,
    skillUnlocks: [],
    skillLevels,
    codex: {},
    starPerks: [],
    extraction: { levels: extractionLevels, lastTick: now },
    inventory: items,
    equippedWeapon: weapon?.uid ?? null,
    equippedArmor: armor?.uid ?? null,
    achievements: [],
    stats: {
      totalKills: 0,
      totalWins: 0,
      totalDeaths: 0,
      totalStrikes: 0,
      totalServitors: 0,
      totalGelt: 0,
      bossKills: 0,
      bestRunKills: 0,
      runs: 0,
      bestCombo: 0,
      legendaryFound: 0,
      forged: 0,
      playedSeconds: 0,
    },
    settings: {
      music: 0.6,
      sfx: 0.78,
      screenshake: true,
      scanlines: true,
      damageNumbers: true,
    },
    tutorialSeen: false,
  };
}

export function cloneSave(save: SaveData): SaveData {
  return structuredClone(save);
}

function normalizeSave(raw: Partial<SaveData>): SaveData {
  const defaults = createNewSave(raw.inquisitorName ?? '塞拉斯·沃尔');
  const merged: SaveData = {
    ...defaults,
    ...raw,
    version: SAVE_VERSION,
    resources: { ...defaults.resources, ...(raw.resources ?? {}) },
    institutions: { ...defaults.institutions, ...(raw.institutions ?? {}) },
    skillUnlocks: (raw.skillUnlocks ?? []).filter(
      (id): id is SkillId => id in SKILLS,
    ),
    skillLevels: { ...defaults.skillLevels, ...(raw.skillLevels ?? {}) },
    codex: { ...defaults.codex, ...(raw.codex ?? {}) },
    extraction: {
      levels: { ...defaults.extraction.levels, ...(raw.extraction?.levels ?? {}) },
      lastTick: raw.extraction?.lastTick ?? Date.now(),
    },
    settings: { ...defaults.settings, ...(raw.settings ?? {}) },
    stats: { ...defaults.stats, ...(raw.stats ?? {}) },
    endless: {
      ...defaults.endless,
      ...(raw.endless ?? {}),
      legacy: { ...defaults.endless.legacy, ...(raw.endless?.legacy ?? {}) },
    },
    inventory: Array.isArray(raw.inventory) && raw.inventory.length ? raw.inventory : defaults.inventory,
    starPerks: Array.isArray(raw.starPerks) ? raw.starPerks : [],
    achievements: Array.isArray(raw.achievements) ? raw.achievements : [],
  };
  if (!merged.equippedWeapon || !merged.inventory.some((i) => i.uid === merged.equippedWeapon)) {
    merged.equippedWeapon = merged.inventory.find((i) => i.slot === 'weapon')?.uid ?? null;
  }
  if (!merged.equippedArmor || !merged.inventory.some((i) => i.uid === merged.equippedArmor)) {
    merged.equippedArmor = merged.inventory.find((i) => i.slot === 'armor')?.uid ?? null;
  }
  for (const key of RESOURCE_KEYS) {
    const value = merged.resources[key];
    if (!Number.isFinite(value) || value < 0) merged.resources[key] = 0;
  }
  if (!['recruit', 'standard', 'veteran', 'exterminatus'].includes(merged.difficulty)) {
    merged.difficulty = 'standard';
  }
  merged.achievements = merged.achievements.filter((id) =>
    ACHIEVEMENTS.some((achievement) => achievement.id === id),
  );
  return merged;
}

export interface LoadResult {
  save: SaveData;
  offlineGained: Partial<ResourceMap>;
  offlineSeconds: number;
}

export function loadGame(): LoadResult | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<SaveData>;
    const save = normalizeSave(parsed);
    const before = { ...save.resources };
    const now = Date.now();
    const elapsed = Math.max(0, Math.min((now - save.extraction.lastTick) / 1000, EXTRACTION_OFFLINE_CAP_HOURS * 3600));
    if (getUnlockedSystems(save).extraction && elapsed > 5) {
      const rates = getExtractionRates(save);
      for (const def of EXTRACTION_MINES) {
        save.resources[def.resource] += rates[def.resource] * elapsed;
      }
    }
    save.extraction.lastTick = now;
    const gained: Partial<ResourceMap> = {};
    for (const key of RESOURCE_KEYS) {
      const diff = save.resources[key] - before[key];
      if (diff > 0.001) gained[key] = diff;
    }
    return { save, offlineGained: gained, offlineSeconds: elapsed };
  } catch (error) {
    console.warn('Failed to load save', error);
    return null;
  }
}

export function persistGame(save: SaveData): void {
  try {
    save.lastSaved = Date.now();
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch (error) {
    console.warn('Failed to persist save', error);
  }
}

export function deleteSave(): void {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* ignore */
  }
}

export function hasSave(): boolean {
  return !!localStorage.getItem(SAVE_KEY);
}

export function getEquippedWeapon(save: SaveData): Item | undefined {
  return save.inventory.find((item) => item.uid === save.equippedWeapon);
}

export function getEquippedArmor(save: SaveData): Item | undefined {
  return save.inventory.find((item) => item.uid === save.equippedArmor);
}

export function addResources(resources: ResourceMap, delta: Partial<ResourceMap>): void {
  for (const key of RESOURCE_KEYS) {
    const value = delta[key];
    if (value) resources[key] = Math.max(0, (resources[key] ?? 0) + value);
  }
}

export function sumStatBlocks(blocks: Array<StatBlock | undefined>): StatBlock {
  const result: StatBlock = {};
  for (const block of blocks) {
    if (!block) continue;
    for (const [key, value] of Object.entries(block)) {
      if (!value) continue;
      const statKey = key as StatKey;
      result[statKey] = (result[statKey] ?? 0) + value;
    }
  }
  return result;
}

export function calculateStats(save: SaveData): PlayerStats {
  const weapon = getEquippedWeapon(save);
  const armor = getEquippedArmor(save);
  const institution = INSTITUTIONS[save.activeInstitution];
  const codexBlocks: StatBlock[] = [];
  let autoStrike = false;
  for (const node of CODEX_NODES) {
    const rank = save.codex[node.id] ?? 0;
    if (rank <= 0) continue;
    for (const [key, value] of Object.entries(node.effect)) {
      if (!value) continue;
      codexBlocks.push({ [key as StatKey]: value * rank });
    }
    if (node.special === 'autoStrike') autoStrike = true;
  }
  const starBlocks: StatBlock[] = [];
  for (const perk of STAR_PERKS) {
    if (!save.starPerks.includes(perk.id)) continue;
    starBlocks.push(perk.effect);
    if (perk.special === 'autoStrike') autoStrike = true;
  }
  const mods = sumStatBlocks([
    weapon ? getItemStats(weapon) : undefined,
    armor ? getItemStats(armor) : undefined,
    institution?.passive,
    ...codexBlocks,
    ...starBlocks,
  ]);

  const damagePct = mods.damagePct ?? 0;
  const attackSpeedPct = mods.attackSpeedPct ?? 0;
  const hpPct = mods.hpPct ?? 0;
  const critChancePct = mods.critChance ?? 0;
  const critDamagePct = mods.critDamagePct ?? 0;
  const orbitalDamagePct = mods.orbitalDamagePct ?? 0;
  const orbitalRadiusPct = mods.orbitalRadiusPct ?? 0;
  const orbitalRechargePct = mods.orbitalRechargePct ?? 0;
  const orbitalCharges = mods.orbitalCharges ?? 0;
  const orbitalShells = mods.orbitalShells ?? 0;
  const orbitalHits = mods.orbitalHits ?? 0;
  const skillDamagePct = mods.skillDamagePct ?? 0;
  const skillCooldownPct = mods.skillCooldownPct ?? 0;
  const summonDamagePct = mods.summonDamagePct ?? 0;
  const areaPct = mods.areaPct ?? 0;
  const bossDamagePct = mods.bossDamagePct ?? 0;
  const tameChancePct = mods.tameChance ?? 0;
  const maxTames = mods.maxTames ?? 0;
  const geltPct = mods.geltPct ?? 0;
  const dropChancePct = mods.dropChance ?? 0;
  const luck = mods.luck ?? 0;
  const armorPoints = mods.armor ?? 0;
  const dodgePct = mods.dodge ?? 0;
  const damageReductionPct = mods.damageReduction ?? 0;

  const legacy = save.endless?.legacy ?? { might: 0, vitality: 0, ordnance: 0, fortune: 0 };
  const legacyDamage = 1 + legacy.might * 0.08;
  const legacyHp = 1 + legacy.vitality * 0.08;
  const legacyOrdnance = 1 + legacy.ordnance * 0.07;
  const legacyFortune = 1 + legacy.fortune * 0.08;
  const weaponDamage = weapon ? weapon.baseDamage * (1 + weapon.improvements * 0.08) : 0;
  const armorHp = armor ? armor.baseHp * (1 + armor.improvements * 0.08) : 0;
  const flatDamage = mods.flatDamage ?? 0;
  const flatHp = mods.flatHp ?? 0;

  const damage = Math.max(
    1,
    (BASE_PLAYER.damage + weaponDamage + flatDamage) *
      (1 + damagePct / 100) *
      legacyDamage,
  );
  const maxHp = Math.max(
    1,
    (BASE_PLAYER.maxHp + armorHp + flatHp) * (1 + hpPct / 100) * legacyHp,
  );
  const attackInterval = Math.max(0.055, BASE_PLAYER.attackInterval / (1 + attackSpeedPct / 100));
  const critChance = clamp(BASE_PLAYER.critChance + critChancePct / 100, 0, 0.95);
  const critDamage = 1.5 + critDamagePct / 100;
  const doubleChance = clamp((mods.doubleChance ?? 0) / 100, 0, 0.8);
  const tripleChance = clamp((mods.tripleChance ?? 0) / 100, 0, 0.4);
  const charges = Math.max(1, Math.round(BASE_PLAYER.orbitalCharges + orbitalCharges));
  const recharge = Math.max(0.7, BASE_PLAYER.orbitalRecharge / (1 + orbitalRechargePct / 100));
  const shells = Math.max(1, Math.round(1 + orbitalShells));
  const radius = BASE_PLAYER.orbitalRadius * (1 + orbitalRadiusPct / 100 + areaPct / 160);
  const orbitalDamageMult =
    BASE_PLAYER.orbitalDamageMult * (1 + orbitalDamagePct / 100) * legacyOrdnance;
  const skillDamageMult = 1 + skillDamagePct / 100;
  const skillCooldownMult = 1 / (1 + skillCooldownPct / 100);
  const summonDamageMult = 1 + summonDamagePct / 100;
  const areaMult = 1 + areaPct / 100;
  const bossDamageMult = 1 + bossDamagePct / 100;
  const tameChance = clamp(0.05 + tameChancePct / 100, 0, 0.55);
  const armorReduction = clamp(armorPoints / (armorPoints + 180), 0, 0.55);
  const totalReduction = 1 - (1 - armorReduction) * (1 - clamp(damageReductionPct / 100, 0, 0.5));
  const geltMult = 1 + geltPct / 100 + legacy.fortune * 0.08;
  const dropChance = dropChancePct / 100;

  const dps =
    (damage / attackInterval) *
    (1 + critChance * (critDamage - 1)) *
    (1 + doubleChance * 1.0 + tripleChance * 2.0) *
    (1 + Math.max(0, (mods.projectiles ?? 0)) * 0.6);
  const orbitalDps =
    (damage * orbitalDamageMult * Math.min(16, BASE_PLAYER.orbitalHits + orbitalHits) * shells) /
    recharge;
  const power = Math.round(dps * 2 + orbitalDps * 1.4 + maxHp * 0.35);

  return {
    damage,
    maxHp,
    moveSpeed: BASE_PLAYER.moveSpeed * (1 + (mods.moveSpeedPct ?? 0) / 100),
    attackInterval,
    range: BASE_PLAYER.range,
    projectiles: Math.max(1, Math.round(BASE_PLAYER.projectiles + (mods.projectiles ?? 0))),
    pierce: Math.max(0, Math.round(mods.pierce ?? 0)),
    critChance,
    critDamage,
    doubleChance,
    tripleChance,
    orbitalCharges: charges,
    orbitalRecharge: recharge,
    orbitalShells: shells,
    orbitalRadius: radius,
    orbitalDamageMult,
    orbitalHits: Math.round(BASE_PLAYER.orbitalHits + orbitalHits),
    skillDamageMult,
    skillCooldownMult,
    summonDamageMult,
    areaMult,
    bossDamageMult,
    tameChance,
    maxTames: Math.max(0, Math.round(2 + maxTames)),
    geltMult,
    dropChance,
    luck,
    armor: armorPoints,
    regen: mods.regen ?? 0,
    dodge: clamp(dodgePct / 100, 0, 0.45),
    damageReduction: totalReduction,
    pickupRadius: BASE_PLAYER.pickupRadius + (mods.pickupRadius ?? 0),
    autoStrike,
    dominionMult: 1,
    power,
    mods,
  };
}

export function getRuntimeSkills(save: SaveData) {
  const institution = INSTITUTIONS[save.activeInstitution];
  return institution.skills
    .filter((id) => save.skillUnlocks.includes(id))
    .map((id) => ({
      id,
      level: save.skillLevels[id] ?? 1,
      cooldownLeft: 0,
    }));
}

const SKILL_MATERIAL: Record<InstitutionId, ResourceKey> = {
  astartes: 'promethium',
  mechanicus: 'teef',
  assassinorum: 'alloy',
  telepathica: 'warpDust',
  necron: 'biomass',
};

export function getSkillUnlockCost(
  skillId: SkillId,
): { gelt: number; matKey: ResourceKey; matAmount: number } {
  const skill = SKILLS[skillId];
  const institution = INSTITUTIONS[skill.institution];
  const index = Math.max(0, institution.skills.indexOf(skillId));
  const gelt = [60, 260, 650][index] ?? 900;
  const matAmount = [0, 14, 32][index] ?? 48;
  return { gelt, matKey: SKILL_MATERIAL[skill.institution], matAmount };
}

export function getSkillUpgradeCost(
  save: SaveData,
  skillId: SkillId,
  currentLevel: number,
): { gelt: number; matKey: ResourceKey; matAmount: number } {
  const skill = SKILLS[skillId];
  const institution = INSTITUTIONS[skill.institution];
  const matKey = SKILL_MATERIAL[skill.institution];
  return {
    gelt: Math.round(400 * Math.pow(4, Math.max(0, currentLevel - 1))),
    matKey,
    matAmount: Math.round(14 * Math.pow(2.6, Math.max(0, currentLevel - 1))),
  };
}

export function getEndlessTier(save: SaveData): number {
  const minutes = (save.endless?.bestTime ?? 0) / 60;
  const runs = save.endless?.runs ?? 0;
  return Math.max(1, Math.min(40, 1 + Math.floor(minutes / 2) + Math.floor(runs / 4)));
}

export function getEnemyHp(hpMult = 1): number {
  return Math.round(ENEMY_BASE_HP * hpMult);
}

export function getEnemyDamage(damageMult = 1): number {
  return Math.round(ENEMY_BASE_DAMAGE * damageMult * 10) / 10;
}

export function getGeltPerKill(rewardMult = 1): number {
  return Math.max(1, Math.round(1.1 * rewardMult));
}

export function getExtractionRates(save: SaveData): Record<ResourceKey, number> {
  const rates = { ...EMPTY_RESOURCES } as Record<ResourceKey, number>;
  if (!getUnlockedSystems(save).extraction) return rates;
  for (const def of EXTRACTION_MINES) {
    const level = save.extraction.levels[def.resource] ?? 1;
    rates[def.resource] = getMineRate(def, level);
  }
  return rates;
}

export function getMineRate(def: ExtractionMineDef, level: number): number {
  return def.baseRate * Math.pow(1.55, Math.max(0, level - 1));
}

export function getMineUpgradeCost(def: ExtractionMineDef, level: number): number {
  return Math.round(def.baseCost * Math.pow(def.costGrowth, Math.max(0, level - 1)));
}

export interface ExtractionTickResult {
  gained: Partial<ResourceMap>;
  seconds: number;
}

export function tickExtraction(save: SaveData, now = Date.now(), apply = true): ExtractionTickResult {
  const elapsed = Math.max(
    0,
    Math.min((now - save.extraction.lastTick) / 1000, EXTRACTION_OFFLINE_CAP_HOURS * 3600),
  );
  save.extraction.lastTick = now;
  const gained: Partial<ResourceMap> = {};
  if (!apply || !getUnlockedSystems(save).extraction || elapsed <= 0) {
    return { gained, seconds: elapsed };
  }
  const rates = getExtractionRates(save);
  for (const def of EXTRACTION_MINES) {
    const amount = rates[def.resource] * elapsed;
    if (amount > 0.0001) {
      save.resources[def.resource] += amount;
      gained[def.resource] = amount;
    }
  }
  return { gained, seconds: elapsed };
}

export function getTotalExtractionIncomePerMinute(save: SaveData): number {
  const rates = getExtractionRates(save);
  return Object.values(rates).reduce((sum, rate) => sum + rate * 60, 0);
}

export function canAfford(resources: ResourceMap, cost: Partial<ResourceMap>): boolean {
  return Object.entries(cost).every(([key, value]) => (resources[key as ResourceKey] ?? 0) >= (value ?? 0));
}

export function payCost(resources: ResourceMap, cost: Partial<ResourceMap>): void {
  for (const [key, value] of Object.entries(cost)) {
    resources[key as ResourceKey] = Math.max(0, (resources[key as ResourceKey] ?? 0) - (value ?? 0));
  }
}

export function checkAchievements(save: SaveData): string[] {
  const unlocked: string[] = [];
  for (const achievement of ACHIEVEMENTS) {
    if (save.achievements.includes(achievement.id)) continue;
    if (achievement.check(save)) {
      save.achievements.push(achievement.id);
      addResources(save.resources, achievement.reward);
      unlocked.push(achievement.id);
    }
  }
  return unlocked;
}

export function applyEndlessResult(
  save: SaveData,
  result: BattleResult,
): { save: SaveData; summary: BattleRewardSummary } {
  const next = cloneSave(save);
  const beforeUnlocks = getUnlockedSystems(next);
  const loot: Partial<Record<ResourceKey, number>> = {};
  for (const [key, value] of Object.entries(result.resources)) {
    if (value && value > 0.01) loot[key as ResourceKey] = Math.floor(value);
  }
  addResources(next.resources, loot);
  const chests = Math.max(0, Math.floor(result.chests ?? 0));
  next.endless.chests += chests;
  next.endless.runs += 1;
  const wasBestTime = result.time > next.endless.bestTime;
  const wasBestKills = result.kills > next.endless.bestKills;
  next.endless.bestTime = Math.max(next.endless.bestTime, result.time);
  next.endless.bestKills = Math.max(next.endless.bestKills, result.kills);
  next.endless.bestBosses = Math.max(next.endless.bestBosses, result.bossKills ?? 0);

  next.stats.totalDeaths += result.retreat ? 0 : 1;
  next.stats.runs += 1;
  next.stats.totalKills += result.kills;
  next.stats.totalStrikes += result.strikes;
  next.stats.totalServitors += result.servitors;
  next.stats.totalGelt += loot.gelt ?? 0;
  next.stats.bestRunKills = Math.max(next.stats.bestRunKills, result.kills);
  next.stats.bestCombo = Math.max(next.stats.bestCombo, result.maxCombo);
  next.stats.playedSeconds += result.time;
  next.stats.bossKills += result.bossKills ?? 0;

  const itemDrops: Item[] = [];
  const rolls = Math.min(2, 1 + Math.floor(result.time / 240) + (result.bossKills ?? 0));
  for (let i = 0; i < rolls; i++) {
    if (next.inventory.length >= MAX_INVENTORY) break;
    const item = createItem(
      Math.random() < 0.5 ? 'weapon' : 'armor',
      Math.max(1, Math.min(40, 1 + Math.floor(result.time / 90))),
      calculateStats(next).luck,
      undefined,
      Math.floor((result.bossKills ?? 0) * 0.5),
    );
    next.inventory.push(item);
    itemDrops.push(item);
    if (item.rarity === 3) next.stats.legendaryFound += 1;
  }

  const newAchievements = checkAchievements(next);
  const afterUnlocks = getUnlockedSystems(next);
  const unlocks: string[] = [];
  if (!beforeUnlocks.codex && afterUnlocks.codex) unlocks.push('《圣典》');
  if (!beforeUnlocks.forge && afterUnlocks.forge) unlocks.push('锻造台');
  if (!beforeUnlocks.extraction && afterUnlocks.extraction) unlocks.push('开采场');
  if (!beforeUnlocks.consecration && afterUnlocks.consecration) unlocks.push('圣化祭坛');
  if (!beforeUnlocks.star && afterUnlocks.star) unlocks.push('星炬');

  return {
    save: next,
    summary: {
      resources: loot,
      items: itemDrops,
      newAchievements,
      unlocks,
      endless: true,
      chests,
      bestTime: wasBestTime,
      bestKills: wasBestKills,
    },
  };
}

export function getResourceAmount(save: SaveData, key: ResourceKey): number {
  return Math.floor(save.resources[key] ?? 0);
}

export function getUnlockHint(save: SaveData): string {
  const systems = getUnlockedSystems(save);
  if (!systems.codex) return '完成首次远征后解锁《圣典》';
  if (!systems.forge) return '单次生存 2 分钟后解锁锻造台';
  if (!systems.extraction) return '单次生存 5 分钟后解锁开采场';
  if (!systems.consecration) return '单次生存 10 分钟后解锁圣化祭坛';
  if (!systems.star) return '单次生存 15 分钟后解锁星炬';
  return '所有舰载系统均已上线';
}

export function getSaveDisplayName(save: SaveData): string {
  return `审判官 ${save.inquisitorName}`;
}

export { GAME_VERSION, SAVE_KEY, formatNumber };
