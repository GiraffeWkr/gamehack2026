/**
 * 16-bit pixel reskin generator.
 *
 *   node tools/gen-art-pixel.mjs            # rewrite every PNG in public/art
 *   node tools/gen-art-pixel.mjs --dry      # list what would be written
 *   node tools/gen-art-pixel.mjs --only=bg  # bg | chars | fx | ui | tree
 *
 * Canvas sizes are copied from the shipping assets and never change: the game
 * scales sprites by height and draws backgrounds at 1 px = 1 world unit, so a
 * different canvas would shift or stretch everything.
 *
 * Deterministic (seeded RNG); re-running reproduces identical bytes.
 * Roll back with `node tools/restore-art.mjs`, or re-run the old space
 * generator with `node tools/gen-art-space.mjs`.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Rng } from './art-core.mjs';
import * as BG from './art-pixel-bg.mjs';
import * as CH from './art-pixel-chars.mjs';
import * as FX from './art-pixel-fx.mjs';
import * as UI from './art-pixel-ui.mjs';

const ROOT = process.cwd();
const ART = join(ROOT, 'public', 'art');
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const ONLY = [...args].find((a) => a.startsWith('--only='))?.split('=')[1] ?? null;

const files = new Map();
const want = (group) => !ONLY || ONLY === group;
const add = (key, canvas) => files.set(String(key).replace(/\.png$/i, ''), canvas);

// ------------------------------------------------------------------ inventory

const SKILL_SPEC = [
  { file: 'Multishot__440.png', id: 'Multishot', w: 128, h: 127, col: [120, 235, 255] },
  { file: 'RapidFire__397.png', id: 'RapidFire', w: 127, h: 126, col: [255, 210, 110] },
  { file: 'SharpShooter__406.png', id: 'SharpShooter', w: 126, h: 124, col: [255, 160, 90] },
  { file: 'BombArrow__919.png', id: 'BombArrow', w: 115, h: 115, col: [255, 140, 80] },
  { file: 'PiercingShot__424.png', id: 'PiercingShot', w: 112, h: 128, col: [170, 210, 255] },
  { file: 'SniperScope__395.png', id: 'SniperScope', w: 120, h: 121, col: [140, 255, 190] },
  { file: 'LightningStrike__405.png', id: 'LightningStrike', w: 113, h: 128, col: [150, 220, 255] },
  { file: 'FireArea__417.png', id: 'FireArea', w: 127, h: 116, col: [255, 150, 70] },
  { file: 'Blizzard__450.png', id: 'Blizzard', w: 121, h: 125, col: [170, 240, 255] },
  { file: 'DarkMatter__419.png', id: 'DarkMatter', w: 118, h: 114, col: [190, 130, 255] },
  { file: 'SuperNova__408.png', id: 'SuperNova', w: 127, h: 128, col: [255, 220, 150] },
  { file: 'BatSwarm__457.png', id: 'BatSwarm', w: 118, h: 123, col: [150, 180, 255] },
  { file: 'Wolf__439.png', id: 'Wolf', w: 111, h: 124, col: [140, 220, 255] },
  { file: 'Bear__416.png', id: 'Bear', w: 104, h: 108, col: [150, 255, 210] },
  { file: 'Falcon__451.png', id: 'Falcon', w: 127, h: 110, col: [200, 170, 255] },
];

const MASTERY_SPEC = [
  { file: 'Mastery0__436.png', symbol: 'momentum', w: 56, h: 64 },
  { file: 'Mastery1__441.png', symbol: 'vitality', w: 64, h: 60 },
  { file: 'Mastery2__449.png', symbol: 'scroll', w: 54, h: 64 },
  { file: 'Mastery3__414.png', symbol: 'fortune', w: 64, h: 61 },
  { file: 'Mastery4__447.png', symbol: 'echo', w: 64, h: 48 },
  { file: 'Mastery5__425.png', symbol: 'gilding', w: 64, h: 64 },
  { file: 'Mastery6__428.png', symbol: 'barrage', w: 62, h: 64 },
  { file: 'Mastery7__1097.png', symbol: 'avarice', w: 64, h: 64 },
  { file: 'Mastery8__431.png', symbol: 'forging', w: 64, h: 43 },
];

/**
 * 89 talent glyphs: name + size from the shipping build; the symbol follows
 * the meaning, as the spec's symbol table prescribes.
 */
const TREE_ICONS = [
  ['AChestAlwaysSpawnsBeforeThePortal__985.png', 'S5', 64, 64],
  ['AlliesAttackSpeed__1206.png', 'S8', 64, 54],
  ['ArcherCurrencyTreeIcon_0__939.png', 'S12a', 72, 128],
  ['AreaNumber_0__1280.png', 'S13', 100, 100],
  ['AreaTrigger_0__921.png', 'S13', 100, 100],
  ['ArrowDouble__1056.png', 'S1', 52, 62],
  ['ArrowPlus__1123.png', 'S1', 56, 62],
  ['ArrowUp__1157.png', 'S1', 56, 62],
  ['BatCurrencyTreeIcon_0__891.png', 'S12b', 128, 128],
  ['bomb_arrow_1__1229.png', 'S3', 61, 61],
  ['ChanceForBetterItemRarity__1169.png', 'S5', 58, 64],
  ['ChanceForMainAttackToHitAnAdditionalTime__1031.png', 'S1', 64, 62],
  ['ChanceForRarerChestTypes__1036.png', 'S5', 58, 64],
  ['ChanceForSkillsToNotConsumeTheirCooldown__1105.png', 'S6', 50, 64],
  ['ChanceToMineAnExtraOre__1209.png', 'S10', 61, 64],
  ['ChanceToSpawnAnOrb__979.png', 'S11', 64, 50],
  ['ChanceToSummonOrbOnKill__987.png', 'S11', 46, 64],
  ['ClawCurrencyTreeIcon_0__878.png', 'S12', 121, 121],
  ['CoinsFromChests__973.png', 'S4', 62, 64],
  ['CoinValueFromChests__989.png', 'S4', 64, 62],
  ['CriticalChance__1186.png', 'S3', 64, 64],
  ['CriticalMultiplier__993.png', 'S3', 61, 64],
  ['DamagePerMasteryLevel__1055.png', 'S1', 43, 64],
  ['ExtraTreasuresFromAllChests__1179.png', 'S5', 64, 62],
  ['FacingABossFreesAllYourSkillsFromCooldown__995.png', 'S6', 60, 64],
  ['FacingAPortalFreesAllYourSkillsFromCooldown__1140.png', 'S6', 60, 64],
  ['function_icon_anvil__1050.png', 'S14', 43, 30],
  ['function_icon_archer__1234.png', 'S12a', 71, 72],
  ['function_icon_book_0__1272.png', 'S11', 32, 42],
  ['function_icon_boot_fly__1220.png', 'S6', 40, 31],
  ['function_icon_shine__1051.png', 'S3', 61, 61],
  ['function_icon_tool_4__1141.png', 'S14', 78, 78],
  ['GainIdleGold__1074.png', 'S4', 64, 62],
  ['GoldGained__1028.png', 'S4', 64, 56],
  ['GoldGainedPerUnlockedMastery__1021.png', 'S4', 64, 48],
  ['healthPotionEffect_0__911.png', 'S2', 45, 64],
  ['HealthRegen_0__1310.png', 'S2', 56, 45],
  ['icon_aim_4_Copy__1208.png', 'S13', 124, 124],
  ['Icon_Armor_Cloak_0__935.png', 'S7', 61, 64],
  ['icon_arrow_2__1225.png', 'S1', 48, 42],
  ['icon_bottle_14_0__928.png', 'S2', 45, 64],
  ['icon_common_68__1218.png', 'S11', 64, 64],
  ['Icon_Crafting_GlowingAnvil__1104.png', 'S14', 64, 64],
  ['icon_game_163__1216.png', 'S11', 50, 50],
  ['icon_game_173__1172.png', 'S11', 64, 64],
  ['Icon_Loot_MonsterCoins__1214.png', 'S4', 64, 62],
  ['Icon_Mining_RockBreak__1080.png', 'S10', 64, 59],
  ['icon_simpleshape_29__1099.png', 'S11', 64, 64],
  ['Icon_Skill_FlameCat__1124.png', 'S8', 54, 64],
  ['icon_store_167__1047.png', 'S14', 127, 94],
  ['icon_store_169__1039.png', 'S14', 127, 107],
  ['icon_store_3__1164.png', 'S14', 32, 32],
  ['Icon_Time_ArchClock__1057.png', 'S9', 61, 64],
  ['LessMonstersDamage__1045.png', 'S7', 52, 64],
  ['LessMonstersHealth__1069.png', 'S7', 64, 47],
  ['lightning_shoot_1__1178.png', 'S6', 59, 64],
  ['LootFromMonstersSummonedByThePortal__994.png', 'S5', 64, 64],
  ['MageCurrencyTreeIcon_0__888.png', 'S12m', 124, 126],
  ['Mastery4_Name__1097.png', 'S11', 64, 64],
  ['MaximumHealthPerMasteryLevel__1064.png', 'S2', 64, 46],
  ['MaximumTamedMonsters__1026.png', 'S8', 64, 44],
  ['MonstersCanNowRarelyDropItems__1065.png', 'S5', 64, 48],
  ['MonstersLessAttackSpeed__1199.png', 'S7', 55, 64],
  ['multi_shoot_skill_1__983.png', 'S3', 64, 64],
  ['OrbDuration__1046.png', 'S11', 64, 50],
  ['PermanentOrb__1162.png', 'S11', 64, 56],
  ['PetDamageMultiplier__1207.png', 'S8', 64, 64],
  ['PetHealth__1018.png', 'S8', 64, 59],
  ['PickAxeSpeed__1077.png', 'S10', 64, 54],
  ['PictoIcon_Boots__1052.png', 'S6', 52, 52],
  ['PictoIcon_Boots__1158.png', 'S6', 52, 52],
  ['PictoIcon_Crown__1161.png', 'S13', 60, 48],
  ['PictoIcon_Health__976.png', 'S2', 58, 47],
  ['PictoIcon_Shield__1075.png', 'S7', 52, 52],
  ['PictoIcon_Star__1081.png', 'S3', 56, 54],
  ['PictoIcon_Timer__1233.png', 'S9', 50, 57],
  ['RestoreOfHealthWhenOpeningAChest__1184.png', 'S2', 60, 64],
  ['Skill_3_lightning_chain__1033.png', 'S6', 61, 75],
  ['SkillsBuffDurationMultiplier__1203.png', 'S9', 64, 62],
  ['SkillsDamage__1135.png', 'S1', 64, 64],
  ['tree_icons_set1_1__953.png', 'S11', 52, 50],
  ['tree_icons_set1_2__1257.png', 'S11', 51, 50],
  ['tree_icons_set1_Copy_Copy__1096.png', 'S11', 54, 50],
  ['tree_icons_set1_Copy_Copy_2_1__1130.png', 'S11', 50, 50],
  ['UnlockOrbs__1129.png', 'S11', 51, 64],
  ['UnlockScrolls__1204.png', 'S11', 60, 64],
  ['WarriorCurrencyTreeIcon_0__1286.png', 'S12w', 128, 112],
  ['well_icon_skills_0__1301.png', 'S11', 46, 68],
  ['WormholeArrowStrike__1034.png', 'S13', 64, 52],
];

// ----------------------------------------------------------------------- draw

if (want('bg')) {
  add('BG1_0sky', BG.sky(new Rng(101)));
  add('BG1_1clouds', BG.clouds(new Rng(102)));
  add('BG1_2hills3', BG.farPlanet(new Rng(103)));
  add('BG1_3hills2', BG.station(new Rng(104)));
  add('BG1_4hills1', BG.asteroids(new Rng(105)));
  add('BG1_5trees', BG.hulks(new Rng(106)));
  add('BG1_6grass', BG.ground(new Rng(107)));
  add('BG1_7item', BG.foreground(new Rng(108)));

  add('BG2_0sky', BG.biome2('sky', new Rng(201)));
  add('BG2_1clouds', BG.biome2('clouds', new Rng(202)));
  add('BG2_2hills3', BG.biome2('hills3', new Rng(203)));
  add('BG2_3hills2', BG.biome2('hills2', new Rng(204)));
  add('BG2_4hills1', BG.biome2('hills1', new Rng(205)));
  add('BG2_5trees', BG.biome2('trees', new Rng(206)));
  add('BG2_6grass', BG.biome2('grass', new Rng(207)));
  add('BG2_7item', BG.biome2('item', new Rng(208)));
}

if (want('chars')) {
  const ARCHER_SIZES = [[150, 176], [146, 182], [150, 176], [150, 182], [150, 182]];
  CH.archerSkins(ARCHER_SIZES, 0).forEach((c, i) => add(`Archer_${i + 1}`, c));

  add('Guardian_Claw_0', CH.claw());
  add('Guardian_Warrior_0', CH.warrior());
  add('Guardian_Archer_0', CH.turret());
  add('Guardian_Mage_0', CH.mage());
  add('bat_swarm_0', CH.bat());
  add('Guardian_Bat_0', CH.carrier());
  add('king_boss', CH.king());
  add('Portal_tex', CH.runPortal(512));
  const variants = CH.enemyVariants();
  add('Claw_Skitter', variants.skitter);
  add('Warrior_Bulwark', variants.bulwark);
  add('Archer_Bomber', variants.bomber);
  add('Mage_Summoner', variants.summoner);
  add('Bat_Leech', variants.leech);
  const [wolf, bear, falcon] = CH.pets();
  add('Wolf', wolf);
  add('Bear', bear);
  add('Falcon', falcon);
}

if (want('fx')) {
  add('Bolt', FX.bolt());
  add('OrbitalLance', FX.orbitalLance());
  add('HoverShadow', FX.hoverShadow());
  add('FX_Ring_AD', FX.impactRing());
  add('FX_TX_Ember_AB', FX.ember());
  add('Circle', FX.aoeDisc());
  // Listed in art.ts's FX map and preloaded, even though nothing draws them yet.
  add('FX_TX_Star_AA', FX.starSpark());
  add('shockwave', FX.shockRing());
  add('Trail1', FX.trail());
  add('orb', FX.orbPickup());
}

if (want('ui')) {
  for (const [k, c] of Object.entries(UI.currencyIcons())) add(k, c);
  add('ui_lock', UI.lockIcon());
  for (const [k, c] of Object.entries(UI.skillIcons(SKILL_SPEC))) add(k, c);
  for (const [k, c] of Object.entries(UI.masteryIcons(MASTERY_SPEC))) add(k, c);
  for (const [k, c] of Object.entries(UI.railIcons())) add(k, c);
  for (const [k, c] of Object.entries(UI.jobCards())) add(k, c);
}

if (want('tree')) {
  for (const [k, c] of Object.entries(UI.treeShapes())) add(k, c);
  for (const [file, symbol, w, h] of TREE_ICONS) add(`tree/${file}`, UI.treeGlyph(symbol, w, h));
}

// ---------------------------------------------------------------------- write

let written = 0;
let bytes = 0;
const manifest = [];
for (const [key, canvas] of files) {
  const out = join(ART, `${key}.png`);
  let png;
  try {
    png = canvas.png();
  } catch (err) {
    throw new Error(`failed to encode ${key}: ${err.message}`);
  }
  manifest.push({ file: `${key}.png`, w: canvas.w, h: canvas.h, cols: canvas.cols, rows: canvas.rows, bytes: png.length });
  if (!DRY) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, png);
  }
  written++;
  bytes += png.length;
}
if (!DRY) writeFileSync(join(ROOT, 'tools', 'art-pixel-manifest.json'), JSON.stringify(manifest, null, 2));
console.log(`${DRY ? '(dry run) ' : ''}${written} files, ${(bytes / 1024 / 1024).toFixed(2)} MB total`);
