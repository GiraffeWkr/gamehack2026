/**
 * Space reskin generator. Overwrites PNGs in public/art with procedurally drawn
 * space-themed versions at the EXACT original dimensions.
 *
 *   node tools/gen-art-space.mjs            # write the art
 *   node tools/gen-art-space.mjs --dry      # list what would be written
 *   node tools/gen-art-space.mjs --only=bg  # one group: bg | chars | fx | ui | tree
 *
 * Everything is deterministic (seeded PRNG), so re-running reproduces the same files.
 * Restore the originals from backup-art/art-original-<timestamp>/.
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { Rng } from './art-core.mjs';
import * as BG from './art-bg.mjs';
import * as CH from './art-chars.mjs';
import * as FX from './art-fx.mjs';
import * as UI from './art-ui.mjs';

const ROOT = process.cwd();
const ART = join(ROOT, 'public', 'art');
const args = new Set(process.argv.slice(2));
const DRY = args.has('--dry');
const ONLY = [...args].find((a) => a.startsWith('--only='))?.split('=')[1] ?? null;

/** Every entry: key = path under public/art (no extension), value = Canvas. */
const files = new Map();
const want = (group) => !ONLY || ONLY === group;
/**
 * Registers one output. Tolerates spec tables that already carry the `.png`
 * suffix: `public/art` keys are extension-less because the renderer and the DOM
 * both append `.png` themselves.
 */
const add = (key, canvas) => files.set(String(key).replace(/\.png$/i, ''), canvas);

// ------------------------------------------------------------------- inventory
/** A small padlock, drawn as a full-colour icon (it is not tinted). */
function lockIcon() {
  return UI.glyphIcon(60, 75, (c, w, h) => {
    const col = [230, 200, 120];
    c.rect(w * 0.18, h * 0.44, w * 0.64, h * 0.44, col, 1);
    c.rect(w * 0.18, h * 0.44, w * 0.64, h * 0.06, [80, 60, 20], 0.6);
    for (let i = 0; i < 34; i++) {
      const a = Math.PI + (i / 34) * Math.PI;
      c.disc(w / 2 + Math.cos(a) * w * 0.2, h * 0.44 + Math.sin(a) * h * 0.2, w * 0.055, col, 1, 0.8);
    }
    c.disc(w / 2, h * 0.66, w * 0.09, [40, 32, 16], 0.9, 1.2);
  }, [230, 200, 120]);
}

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
  { file: 'Mastery0__436.png', symbol: 'momentum', w: 56, h: 64, col: [255, 190, 120] },
  { file: 'Mastery1__441.png', symbol: 'vitality', w: 64, h: 60, col: [255, 120, 140] },
  { file: 'Mastery2__449.png', symbol: 'scroll', w: 54, h: 64, col: [255, 225, 170] },
  { file: 'Mastery3__414.png', symbol: 'fortune', w: 64, h: 61, col: [160, 245, 170] },
  { file: 'Mastery4__447.png', symbol: 'echo', w: 64, h: 48, col: [140, 220, 255] },
  { file: 'Mastery5__425.png', symbol: 'gilding', w: 64, h: 64, col: [255, 210, 110] },
  { file: 'Mastery6__428.png', symbol: 'barrage', w: 62, h: 64, col: [255, 170, 120] },
  { file: 'Mastery7__1097.png', symbol: 'avarice', w: 64, h: 64, col: [255, 200, 130] },
  { file: 'Mastery8__431.png', symbol: 'forging', w: 64, h: 43, col: [200, 210, 235] },
];

/** 89 talent glyphs: filename + size from the shipping build, symbol chosen by meaning. */
const TREE_ICONS = [
  { file: 'AChestAlwaysSpawnsBeforeThePortal__985.png', symbol: 'S5', w: 64, h: 64 },
  { file: 'AlliesAttackSpeed__1206.png', symbol: 'S8', w: 64, h: 54 },
  { file: 'ArcherCurrencyTreeIcon_0__939.png', symbol: 'S12', w: 72, h: 128 },
  { file: 'AreaNumber_0__1280.png', symbol: 'S13', w: 100, h: 100 },
  { file: 'AreaTrigger_0__921.png', symbol: 'S13', w: 100, h: 100 },
  { file: 'ArrowDouble__1056.png', symbol: 'S1', w: 52, h: 62 },
  { file: 'ArrowPlus__1123.png', symbol: 'S1', w: 56, h: 62 },
  { file: 'ArrowUp__1157.png', symbol: 'S1', w: 56, h: 62 },
  { file: 'BatCurrencyTreeIcon_0__891.png', symbol: 'S12', w: 128, h: 128 },
  { file: 'bomb_arrow_1__1229.png', symbol: 'S3', w: 61, h: 61 },
  { file: 'ChanceForBetterItemRarity__1169.png', symbol: 'S5', w: 58, h: 64 },
  { file: 'ChanceForMainAttackToHitAnAdditionalTime__1031.png', symbol: 'S1', w: 64, h: 62 },
  { file: 'ChanceForRarerChestTypes__1036.png', symbol: 'S5', w: 58, h: 64 },
  { file: 'ChanceForSkillsToNotConsumeTheirCooldown__1105.png', symbol: 'S6', w: 50, h: 64 },
  { file: 'ChanceToMineAnExtraOre__1209.png', symbol: 'S10', w: 61, h: 64 },
  { file: 'ChanceToSpawnAnOrb__979.png', symbol: 'S11', w: 64, h: 50 },
  { file: 'ChanceToSummonOrbOnKill__987.png', symbol: 'S11', w: 46, h: 64 },
  { file: 'ClawCurrencyTreeIcon_0__878.png', symbol: 'S12', w: 121, h: 121 },
  { file: 'CoinsFromChests__973.png', symbol: 'S4', w: 62, h: 64 },
  { file: 'CoinValueFromChests__989.png', symbol: 'S4', w: 64, h: 62 },
  { file: 'CriticalChance__1186.png', symbol: 'S3', w: 64, h: 64 },
  { file: 'CriticalMultiplier__993.png', symbol: 'S3', w: 61, h: 64 },
  { file: 'DamagePerMasteryLevel__1055.png', symbol: 'S1', w: 43, h: 64 },
  { file: 'ExtraTreasuresFromAllChests__1179.png', symbol: 'S5', w: 64, h: 62 },
  { file: 'FacingABossFreesAllYourSkillsFromCooldown__995.png', symbol: 'S6', w: 60, h: 64 },
  { file: 'FacingAPortalFreesAllYourSkillsFromCooldown__1140.png', symbol: 'S6', w: 60, h: 64 },
  { file: 'function_icon_anvil__1050.png', symbol: 'S14', w: 43, h: 30 },
  { file: 'function_icon_archer__1234.png', symbol: 'S12', w: 71, h: 72 },
  { file: 'function_icon_book_0__1272.png', symbol: 'S11', w: 32, h: 42 },
  { file: 'function_icon_boot_fly__1220.png', symbol: 'S6', w: 40, h: 31 },
  { file: 'function_icon_shine__1051.png', symbol: 'S3', w: 61, h: 61 },
  { file: 'function_icon_tool_4__1141.png', symbol: 'S14', w: 78, h: 78 },
  { file: 'GainIdleGold__1074.png', symbol: 'S4', w: 64, h: 62 },
  { file: 'GoldGained__1028.png', symbol: 'S4', w: 64, h: 56 },
  { file: 'GoldGainedPerUnlockedMastery__1021.png', symbol: 'S4', w: 64, h: 48 },
  { file: 'healthPotionEffect_0__911.png', symbol: 'S2', w: 45, h: 64 },
  { file: 'HealthRegen_0__1310.png', symbol: 'S2', w: 56, h: 45 },
  { file: 'icon_aim_4_Copy__1208.png', symbol: 'S13', w: 124, h: 124 },
  { file: 'Icon_Armor_Cloak_0__935.png', symbol: 'S7', w: 61, h: 64 },
  { file: 'icon_arrow_2__1225.png', symbol: 'S1', w: 48, h: 42 },
  { file: 'icon_bottle_14_0__928.png', symbol: 'S2', w: 45, h: 64 },
  { file: 'icon_common_68__1218.png', symbol: 'S11', w: 64, h: 64 },
  { file: 'Icon_Crafting_GlowingAnvil__1104.png', symbol: 'S14', w: 64, h: 64 },
  { file: 'icon_game_163__1216.png', symbol: 'S11', w: 50, h: 50 },
  { file: 'icon_game_173__1172.png', symbol: 'S11', w: 64, h: 64 },
  { file: 'Icon_Loot_MonsterCoins__1214.png', symbol: 'S4', w: 64, h: 62 },
  { file: 'Icon_Mining_RockBreak__1080.png', symbol: 'S10', w: 64, h: 59 },
  { file: 'icon_simpleshape_29__1099.png', symbol: 'S11', w: 64, h: 64 },
  { file: 'Icon_Skill_FlameCat__1124.png', symbol: 'S8', w: 54, h: 64 },
  { file: 'icon_store_167__1047.png', symbol: 'S14', w: 127, h: 94 },
  { file: 'icon_store_169__1039.png', symbol: 'S14', w: 127, h: 107 },
  { file: 'icon_store_3__1164.png', symbol: 'S14', w: 32, h: 32 },
  { file: 'Icon_Time_ArchClock__1057.png', symbol: 'S9', w: 61, h: 64 },
  { file: 'LessMonstersDamage__1045.png', symbol: 'S7', w: 52, h: 64 },
  { file: 'LessMonstersHealth__1069.png', symbol: 'S7', w: 64, h: 47 },
  { file: 'lightning_shoot_1__1178.png', symbol: 'S6', w: 59, h: 64 },
  { file: 'LootFromMonstersSummonedByThePortal__994.png', symbol: 'S5', w: 64, h: 64 },
  { file: 'MageCurrencyTreeIcon_0__888.png', symbol: 'S12', w: 124, h: 126 },
  { file: 'Mastery4_Name__1097.png', symbol: 'S11', w: 64, h: 64 },
  { file: 'MaximumHealthPerMasteryLevel__1064.png', symbol: 'S2', w: 64, h: 46 },
  { file: 'MaximumTamedMonsters__1026.png', symbol: 'S8', w: 64, h: 44 },
  { file: 'MonstersCanNowRarelyDropItems__1065.png', symbol: 'S5', w: 64, h: 48 },
  { file: 'MonstersLessAttackSpeed__1199.png', symbol: 'S7', w: 55, h: 64 },
  { file: 'multi_shoot_skill_1__983.png', symbol: 'S3', w: 64, h: 64 },
  { file: 'OrbDuration__1046.png', symbol: 'S11', w: 64, h: 50 },
  { file: 'PermanentOrb__1162.png', symbol: 'S11', w: 64, h: 56 },
  { file: 'PetDamageMultiplier__1207.png', symbol: 'S8', w: 64, h: 64 },
  { file: 'PetHealth__1018.png', symbol: 'S8', w: 64, h: 59 },
  { file: 'PickAxeSpeed__1077.png', symbol: 'S10', w: 64, h: 54 },
  { file: 'PictoIcon_Boots__1052.png', symbol: 'S6', w: 52, h: 52 },
  { file: 'PictoIcon_Boots__1158.png', symbol: 'S6', w: 52, h: 52 },
  { file: 'PictoIcon_Crown__1161.png', symbol: 'S13', w: 60, h: 48 },
  { file: 'PictoIcon_Health__976.png', symbol: 'S2', w: 58, h: 47 },
  { file: 'PictoIcon_Shield__1075.png', symbol: 'S7', w: 52, h: 52 },
  { file: 'PictoIcon_Star__1081.png', symbol: 'S3', w: 56, h: 54 },
  { file: 'PictoIcon_Timer__1233.png', symbol: 'S9', w: 50, h: 57 },
  { file: 'RestoreOfHealthWhenOpeningAChest__1184.png', symbol: 'S2', w: 60, h: 64 },
  { file: 'Skill_3_lightning_chain__1033.png', symbol: 'S6', w: 61, h: 75 },
  { file: 'SkillsBuffDurationMultiplier__1203.png', symbol: 'S9', w: 64, h: 62 },
  { file: 'SkillsDamage__1135.png', symbol: 'S1', w: 64, h: 64 },
  { file: 'tree_icons_set1_1__953.png', symbol: 'S11', w: 52, h: 50 },
  { file: 'tree_icons_set1_2__1257.png', symbol: 'S11', w: 51, h: 50 },
  { file: 'tree_icons_set1_Copy_Copy__1096.png', symbol: 'S11', w: 54, h: 50 },
  { file: 'tree_icons_set1_Copy_Copy_2_1__1130.png', symbol: 'S11', w: 50, h: 50 },
  { file: 'UnlockOrbs__1129.png', symbol: 'S11', w: 51, h: 64 },
  { file: 'UnlockScrolls__1204.png', symbol: 'S11', w: 60, h: 64 },
  { file: 'WarriorCurrencyTreeIcon_0__1286.png', symbol: 'S12', w: 128, h: 112 },
  { file: 'well_icon_skills_0__1301.png', symbol: 'S11', w: 46, h: 68 },
  { file: 'WormholeArrowStrike__1034.png', symbol: 'S13', w: 64, h: 52 },
];

// ------------------------------------------------------------------------ data
// --------------------------------------------------------------------------- bg
if (want('bg')) {
  const sky = BG.sky(new Rng(101));
  add('BG1_0sky', sky);
  add('BG1_1clouds', BG.clouds(new Rng(102)));
  add('BG1_2hills3', BG.farPlanet(new Rng(103)));
  add('BG1_3hills2', BG.stationRings(new Rng(104)));
  add('BG1_4hills1', BG.asteroids(new Rng(105)));
  add('BG1_5trees', BG.hulks(new Rng(106)));
  add('BG1_6grass', BG.ground(new Rng(107), 'moon'));
  add('BG1_7item', BG.foreground(new Rng(108)));

  // Second biome: same geometry, molten palette. Currently unused by the game
  // (BIOME2 is an alias in art.ts) but cheap to ship now.
  add('BG2_0sky', BG.biome2('sky', new Rng(201)));
  add('BG2_1clouds', BG.biome2('clouds', new Rng(202)));
  add('BG2_2hills3', BG.biome2('hills3', new Rng(203)));
  add('BG2_3hills2', BG.biome2('hills2', new Rng(204)));
  add('BG2_4hills1', BG.biome2('hills1', new Rng(205)));
  add('BG2_5trees', BG.biome2('trees', new Rng(206)));
  add('BG2_6grass', BG.biome2('grass', new Rng(207)));
  add('BG2_7item', BG.biome2('item', new Rng(208)));
}

// ------------------------------------------------------------------------ chars
if (want('chars')) {
  const skins = CH.archerSkins([
    [150, 176],
    [146, 182],
    [150, 176],
    [150, 182],
    [150, 182],
  ]);
  skins.forEach((c, i) => add(`Archer_${i + 1}`, c));

  add('Guardian_Claw_0', CH.crawler(250, 214, new Rng(11)));
  add('Guardian_Warrior_0', CH.heavyMech(256, 176, new Rng(12)));
  add('Guardian_Archer_0', CH.hoverTurret(256, 211, new Rng(13)));
  add('Guardian_Mage_0', CH.energyCore(225, 256, new Rng(14)));
  add('bat_swarm_0', CH.scoutDrone(118, 123, new Rng(15)));
  add('Guardian_Bat_0', CH.carrierDrone(256, 201, new Rng(16)));
  add('king_boss', CH.kingBoss(277, 439, new Rng(17)));
  add('Portal_tex', CH.portal(512));

  const [wolf, bear, falcon] = CH.pets();
  add('Wolf', wolf);
  add('Bear', bear);
  add('Falcon', falcon);
}

// --------------------------------------------------------------------------- fx
if (want('fx')) {
  add('Arrow1', FX.arrow(22, 146));
  add('FX_Ring_AD', FX.impactRing(472));
  add('FX_TX_Ember_AB', FX.ember(288, 282));
  add('Circle', FX.aoeDisc(256));
}

// --------------------------------------------------------------------------- ui
if (want('ui')) {
  for (const [k, c] of Object.entries(UI.currencyIcons())) add(k, c);

  add('ui_lock', lockIcon());

  for (const [k, c] of Object.entries(UI.skillIcons(SKILL_SPEC))) add(k, c);
  for (const [k, c] of Object.entries(UI.masteryIcons(MASTERY_SPEC))) add(k, c);

  for (const [k, c] of Object.entries(UI.railIcons())) add(k, c);
  for (const [k, c] of Object.entries(UI.jobCards())) add(k, c);
}

// ------------------------------------------------------------------------- tree
if (want('tree')) {
  for (const [k, c] of Object.entries(UI.treeShapes())) add(k, c);
  for (const { file, symbol, w, h } of TREE_ICONS) {
    add(`tree/${file}`, UI.treeGlyph(symbol, w, h));
  }
}

// ------------------------------------------------------------------------ write
let written = 0;
let bytes = 0;
const manifest = [];
for (const [key, canvas] of files) {
  const out = join(ART, `${key}.png`);
  const png = canvas.png();
  manifest.push({ file: `${key}.png`, w: canvas.w, h: canvas.h, bytes: png.length });
  if (!DRY) {
    mkdirSync(dirname(out), { recursive: true });
    writeFileSync(out, png);
  }
  written++;
  bytes += png.length;
}
if (!DRY && want('tree')) {
  writeFileSync(join(ROOT, 'tools', 'art-manifest.json'), JSON.stringify(manifest, null, 2));
}
console.log(`${DRY ? '(dry run) ' : ''}${written} files, ${(bytes / 1024 / 1024).toFixed(2)} MB total`);


