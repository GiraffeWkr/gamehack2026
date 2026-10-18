# Zad Archery — 逆向提取的原始事实

来源：`Zad Archery_Data/Managed/Assembly-CSharp.dll` 元数据 + 解密存档（`.su`）
+ Unity 序列化资源字符串 + `ZadTools/README.md`。
所有数字都可在 `_analysis/` 下的脚本里复现。

---

## 0. 基本信息

| 项 | 值 |
|---|---|
| 产品名 | Zad Archery |
| 开发商 | Samharia Studios |
| 版本 | 1.0.1 |
| 引擎 | Unity 6000.0.79f1（Mono，非 IL2CPP） |
| 存档格式 | `BinaryFormatter(base64(TripleDES-ECB(JSON)))`，key = MD5("Q3JpcHRvZ3JhZmlhcyBjb20gUmlxamRhZWwgLyBBRVM") |
| 存档路径 | `%USERPROFILE%\AppData\LocalLow\Samharia Studios\Zad Archery\zadArchery.su` |
| 无校验和 | 改档可直接写回 |
| 语言数 | 12（`ChoosenLanguage` 0–11） |
| 商业化 | 买断 + DLC（`isBoughtDLC`）+ Steam 集成 + 有 Demo 版（`DemoWindow_DemoComplete`） |

---

## 1. 核心数值模型（这是整个游戏的骨架）

存档里每个属性都是一个 `StatsDouble`，含 4 个桶：

```
Flat                    -- 基础值
AdditiveIncreases       -- 加法百分比，先求和，再 (1 + sum/100)
MultiplicativeIncreases -- 乘法因子，直接连乘（1.0 == ×1）
Total                   -- 结算结果，游戏实际读这个
```

**公式（已验证）：`Total = Flat × (1 + Additive/100) × Multiplicative`**

验证：Lv30 存档 214 个非零属性中 206 个精确匹配，剩下 8 个差值全部来自
存档里 `Total` 只保留两位小数的舍入。

例：`Damage` = 1712 × (1 + 75/100) × 1.0 = 2996 ✓
    `Health` = 1423 × (1 + 95/100) × 1.1 = 3052 ✓

属性总数：**273 个**（完整清单见本目录 `stats.py` 输出）。

属性命名约定（来自 `resources.assets`）：`{Flat|Additive|Multiplicative}_{StatName}`
- `Flat_` 前缀 195 个
- `Additive_` 前缀 242 个

---

## 1.5 玩家初始属性与怪物难度曲线（全数值见 `NUMBERS.md`）

**玩家初始属性不在 SO 里，在 IL 里。** `PlayerStatsData.InitData()` 用
`ChangeAStat("名字", prop, 值, true)` 写 **84 项**，脚本 `il_player_stats.py`。
关键的开局值：

```
Damage 1        Health 10       AttackRange 450    PlayerAttackSpeed 0.7
PlayerMovementSpeed 140         CriticalMultiplier 50
MouseMagazineSize 1             NumberOfMouseProjectiles 1
MouseMaxNumberOfEnemies 2       MaxTames 1
```

`MouseMagazineRegenTime = 0.4` 是**回填速度**不是时间 ——
源码 `GetMagazineRegenTime() = 1 / 该属性.Total`，实际每发 2.5 秒。

**怪物难度曲线在 `DatabaseManager..cctor` 里**，是代码构造的静态表
（`il_tables.py` 从 IL 还原出 174 个常量 + 67 张表）：

```
怪物HP   = EnemyHealthPerLevel[Clamp(BattleLevel,1,30)]
           × (BattleLevel>30 ? 1.5^(BattleLevel-30) : 1)
           × 类型HealthMultiplier × 全局EnemyHealthMultiplier
怪物伤害 = floor( 同上的 EnemyDamagePerLevel 查表 × 1.25^(超出部分) × 类型DamageMultiplier )
BattleLevel = Clamp(MonstersLevel - (IsFarmingBack ? 1 : 0), 1, MaxBattleLevel=50)
```

- `LastAuthoredLevel = 30`（1–30 手填），31–50 指数外推
- HP 表：Lv1 = **3** → Lv30 = **360 万**（120 万倍）
- 伤害表：Lv1 = 2 → Lv30 = 2500
- 国王房间走另一套：`KingAreaHealthBase(1500万) × 倍率`，**不随关卡成长**

**伤害管线**（`PlayerStatsData.DamageCalculation`）：

```
最终伤害 = Ceiling( GetTotalDamage() × 投射物/技能倍率
                  × (1 + 暴击倍率/100) × 2(双倍) × 3(三倍) )
GetTotalDamage() = Damage.Total × ClawCurrencyStackMultiplier × MasteryProgressMultiplier
```

注意**暴击是在最后乘的**，所以 `CriticalMultiplier = 50` 的收益是 ×1.5。
`DamageTakenMinMax` 下限是 **−500** —— 玩家可以把受伤压成负数（挨打回血）。

**鼠标箭雨不是「点哪里打哪里」**：一次点击生成一个实例，
1.667 秒内把圆环从 0 扩张到 `MouseRadius`，每扩到 `1/N` 处落 1 支箭
（`MouseAttackInstance.Initialize/Update`）。判定的是**扩散的圆环**，
所以 `NumberOfMouseProjectiles` 提高的是环上落点密度。

---

## 2. 天赋树

树已**完整提取**（`TREE.md` 是全表，原始数据在 `_analysis/so/Tree_full.json`）：

- **168 个节点**，**182 条无向连线**，唯一根节点 `Node 1_55cde9fa`
- **等级上限不是统一的 4 级**（旧结论有误）：
  - 上限 1 的 63 个、上限 2 的 27 个、上限 3 的 75 个
  - 另有 3 个终局节点上限 **100**：`Multiplicative_Damage`、
    `Multiplicative_Health`、`Additive_GoldGained`，每级花费 100e9 —— 这是树的数值水槽
  - 普通节点全点满合计 342 点（含终局节点则 642）
- **167 个节点是 `RequiresConnection`**（必须贴着已点亮的节点），只有根节点
  `AlwaysUnlockable` → 树是**无向图**，连线双向存储，没有父子方向
- `RequiredMonsterLevel` **全部是 -1** —— 树不按关卡卡点，进度只由连线 + 花费控制
- 每个节点挂了 1–2 个 `StatInfo` 效果，共 **107 种**，最多的是
  `Flat_Damage`/`Flat_Health`（各 7 个节点）与 `Flat_AttackRange`（6 个）
- 30 个节点花费恒为 `1`（引导/开关型），40 个节点的收益公式是常量（纯解锁开关）

存档 `TreeNodeLevels` 从 Lv2 起就固定 168 个 key，且**与提取出的 168 个 ID 完全一致**，
没有任何节点超过自己的等级上限 —— 已用 Lv17 / Lv30 存档交叉验证。

进度（平衡测试存档实测）：

| 关卡 | 已点节点 | 已投点数 |
|---|---|---|
| Lv2 | 11 | 11 |
| Lv3 | 21 | 27 |
| Lv5 | 32 | 52 |
| Lv8 | 78 | 143 |
| Lv10 | 102 | 193 |
| Lv17 | 127 | 220 |
| Lv30 | 157 | 311 |

---

## 3. 职业 / 技能

**5 个 Job，每个 Job 正好 3 个技能**（来自 `resources.assets` 的 `JobN_Skill` 命名）：

| Job | 技能组 | 主题 |
|---|---|---|
| Job0 | Multishot / RapidFire / BombArrow | 弓箭手（多重射击、速射、炸弹箭） |
| Job1 | Wolf / Bear / Falcon | 兽王（狼、熊、隼） |
| Job2 | SniperScope / PiercingShot / SharpShooter | 狙击（狙击镜、穿透射击、神射手） |
| Job3 | FireArea / LightningStrike / Blizzard | 元素（火域、闪电、暴雪） |
| Job4 | BatSwarm / DarkMatter / SuperNova | 暗影（蝙蝠群、暗物质、超新星） |

存档 `SkillsLevels` 的 15 个 key 顺序与此分组完全吻合。
`IsUnlockedJobs` 有 0–4 共 5 项。

每个技能有一套专属属性，例如 Multishot 有
`Multishot_NumberOfProjectiles / NumberOfHits / Cooldown / ChanceForMultiplyProjectiles`。
带 `_Cooldown` 的是主动技，其余是被动/被动强化。

技能还有 **Skill Powers** 系统（`MiningSkillPowerLevels`，形如 `Multishot_0`、
`SuperNova_2`，0–3 共 4 档，与天赋节点对应）。

---

## 4. 系统解锁时间表（实测）

| 系统 | 解锁关卡 |
|---|---|
| Tree 天赋树 | Lv2 |
| Jobs 职业 | Lv3 |
| Crafting 制作 | Lv5 |
| Mining 采矿 | Lv8 |
| Shaping 塑形 | Lv8 |
| Mastery 精通 | Lv9 |
| Star 星魂 | Lv17 |

矿种解锁：Rock@Lv2、Copper/Silver/Gold@Lv8。

---

## 5. 货币（12 种）

```
Gold                 通用金币
ClawCurrency         爪
ArcherCurrency       弓
WarriorCurrency      战
MageCurrency         法
BatCurrency          蝠
PortalCurrency       传送门
MiningRock / Copper / Silver / Gold   四种矿石
GuardianCurrency     守卫
```

> **修正**：上面「后 5 种对应 5 个守卫 Boss」的推断是**错的**。
> 爪/弓/战/法/蝠 对应的是 5 种**普通怪**（`MonsterCurrencyToEnemyType`：
> 2→Claw、3→Archer、5→Warrior、6→Mage、7→Bat），
> 守卫是**另一个**货币（`GuardianCurrency = 12`）。

完整经济系统见 **`ECONOMY.md`**，要点：

**来源**
- **职业货币只由同名怪掉落**，各有解锁等级：爪 Lv2 / 弓 Lv3 / 战 Lv6 /
  法 Lv10 / 蝠 Lv16（`EnemyCurrencyPerType[].UnlockAtLevel`）
- 掉落量 = `EnemyCurrencyPerRelativeLevel[Clamp(BattleLevel,1,30) − 解锁等级]`，
  1 → 2100，相对等级 25 封顶。**键是相对等级**，所以先解锁的货币后期更值钱
- **传送门货币只有击杀 RunPortal 才给，且每关只给 1 点**
  （`IsPortalCurrencyOwed` / `MarkPortalCurrencyPaid`）
- **守卫货币只有首杀给，每次 1 点**；重复击杀掉的是该守卫的基础怪货币
- 宝箱（`DropCoin`）掉金币 **+ 所有已解锁过的职业货币各一份** ——
  这是补冷门货币的主要途径
- 采矿按 `OreBaseWeight`（岩石 87.8% / 铜 10% / 银 2% / **金矿 0.2%**）掉矿石

**消耗**（每种货币绑死一条成长线）
```
金币(1)    → 天赋树 139/168 节点、制作、强化、采矿台 NPC
爪(2)      → 5 个 Job 解锁（0/200/1500/20000/300000，共 321,700）
弓(3)      → 制作台 NPC 升级
传送门(4)  → 天赋树 29/168 节点 —— 含【全部系统解锁节点】
法(6)      → 符文创建、塑形槽位
蝠(7)      → 精通等级（MasteryCurrency = 7）
守卫(12)   → 星魂特权（StarCurrency = 12，每个 1 点）
矿石(8-11) → 制作/塑形材料
```

**关键设计**：**主线进度不是用金币买的** —— 职业/制作/采矿/塑形/精通/卷轴/
宝珠/守卫特权/黄金怪/宝箱这些系统解锁节点，**全部花传送门货币**（每关只能拿 1 点）。

`FarmRunRewardMultiplier = 0.75`：回刷已通关卡，奖励打七五折。

---

## 6. 精通（Mastery）

`Mastery0` – `Mastery8`，**9 个精通**，各有 `MasteryN_Name` 本地化 key。
每个精通有等级 + **觉醒（Awakened）** 布尔位。Lv30 实测：
等级 27/65/47/13/8/0/0/5/15，觉醒 4 个。

相关属性：`MasteryMainStatBonus`、`MasteryAwakenStatBonus`、
`MasteryMaxLevelBonus`、`DamageMultiplierPerMasteryLevel`、`PinnacleExtraCharges`、
`PinnacleAwakenExtraCharges`（精通还有 Pinnacle 巅峰层）。

---

## 7. 物品 / 词缀

装备槽：`Bow`（弓）、`Armor`（护甲），另有 `ItemType` 3 = 符文/材料类。

物品数据：`BaseLevel / BaseValue / MinValue / MaxValue / ItemRarity / Improvements /
ImprovementFailed / ImprovementChanceExemption / DoubleImproveChance /
ExtraStatsFromScroll / ScrollStatValuesMultiplier / CorruptAddedStats / IsCorrupted`

→ 说明有**强化（Improvement）**、**腐蚀（Corrupt）**、**卷轴加词条**三套改造机制，
且强化**会失败**。

稀有度：`Rarity` 0–3（Normal/Rare/Epic/Legendary），
`HighestRarityUnlocked`、`CraftingRarityFloorEpic`（制作保底史诗）。

实测出现的词缀名（`StatInfoFunctionName`）：

```
Explicit_DoubleDamageChance / DoubleDurationChance / DoubleStrengthChance
Explicit_AttackCooldownSpeed / BuffCooldownSpeed / BuffDuration / BuffStrength
Explicit_FifthHitDamage / KillGoldBonus / RepeatAttackChance / ResetCooldownChance
Sword_FirstHitDamage / TwinSlashChance / CleaveDamage / ComboDamage
Fire_EliteDamage / MeteorBarrageChance / TwinFallChance
Banner_AttackSpeedBonus / TripleDamageChance / WeaponHaste
```

→ 词缀按**武器类型分池**（Sword / Fire / Banner …），`WeaponType` 实测有 0、3、5。

> **上面这批是符文词缀（`RuneStatInfo`），不是装备词缀。**
> 装备自己的词缀池是另一个 SO（`ItemStatsInfo`），只有 **15 条**
> （弓 8 条、护甲 7 条），完整数值见 **`EQUIPMENT.md`**。

**装备系统的关键公式**（都已从 `CraftingManager` / `ItemSavedData` 的 IL 还原）：

```
稀有度掉落权重   普通59% / 稀有32.7% / 史诗7.5% / 传奇0.8%   (DatabaseManager.AwakeMe)
词缀条数         1 / 2 / 3 / 4 条，+卷轴加的 +腐蚀加的
词缀数值         t = rand ^ (3 / CraftingLuck)     ← 幂函数偏置，初始幸运1 → rand³
                 值 = min + (max-min) × t             期望只有区间的 25%
强化成功率       60% − 10%×次数，最低 10%，最多 10 次
强化加成         阶梯式：前4次每次+20%，第5次起每次+13% → 满强化 +158%
腐蚀             花 0.5×CreateCost（弓货币）；把词缀「隔一个复制一个」+ 加N条新的
```

**装备怎么进属性**（`InventoryManager.ApplyRemoveItemStats`）：
弓的基础值直接进 `Damage`，护甲的直接进 `Health`，
每条词缀各自一次 `ChangeAStat` —— **不去重，所以重复词缀会叠加**
（这正是腐蚀的机制基础）。

符文系统（Shaping）：`RuneSavedData` 有 `WeaponType / Rarity / IconIndex / SellPrice /
IsScroll / Implicits / Explicits` —— 符文有**固有词缀（Implicits）**和
**随机词缀（Explicits）**两层，另有 Scroll（卷轴）。
`RuneImplicitsCount`、`SecondSlotRuneBonus`、`ShapingCopyFirstWeapon`、
`ShapingAttackDamageBonus`、`ShapingBuffStrengthBonus` 等属性说明塑形能改造武器。

---

## 8. 战斗与敌人

敌人 Prefab：`Monster5`–`Monster9`、`Bat_Normal_Prefab`、`Skeleton`、
`Monster`（通用）、`Ghost`。有 **GoldenEnemy**（金色精英，`ChanceForGoldenEnemy`、
`GoldenRewardMultiplier`）和 **Chest / Orb** 掉落物。

Boss：`Boss_Blue / Boss_Green / Boss_Orange / Boss_Red / Boss_Violet`（5 色）
+ `Boss_King`（`King_Normal_Prefab`）。
守卫：`GuardianClaw / Archer / Warrior / Mage / Bat`（5 个，见上）。

**雇佣兵 / 盟友**：`WarriorChanceToSpawn / ArcherChanceToSpawn / MageChanceToSpawn /
BatChanceToSpawn` + 对应的 `*CurrencyChanceDrop`。
日志里出现的单位：`Archer_Normal`、`Tamed_Claw`、`Tamed_Archer`、`Tamed_Warrior`。

**驯服（Taming）**：`ChanceToTameEnemiesOnDeath`、`MaxTames`、
`TameHealthMultiplier`、`TameDamageMultiplier` —— 敌人死亡时可能被驯服成盟友。

**宠物**：Wolf / Bear / Falcon（`PetHealthMultiplier`、`PetDamageMultiplier`）。

**鼠标弹幕**：游戏有一套独立的"鼠标箭雨"系统 ——
`NumberOfMouseProjectiles`、`MouseMagazineSize / RegenTime`、`MouseAutoMode`、
`MouseNumberOfHits`、`MouseMaxNumberOfEnemies`、`MouseChanceForAnotherHit`、
`MouseChanceToFireSkills`。日志里 `ArrowFall`（鼠标落箭）长期占总伤害 60–73%，
是**最主要的伤害来源**。

---

## 9. 局内经济与掉落

- 宝箱：`ChanceToSpawnChest`、`ChestCoins_*`、`ChestContentCount_*`、
  `ChestContentRarity`、`ChestLootBonus`、`ChestExtraContent`、`ChestHealPercent`
- 宝珠：`ChanceToSpawnOrb`、`OrbDuration`、`ExtraOrbsPerSpawn`、`PermanentOrbs`、
  `ChanceToSummonOrbOnKill`
- 死亡发经验 / 掉落属性：`SkillsChanceToTriggerOnMonsterDeath`、
  `HealthRestorePercentOnKill`、`MonsterGemChance`、`EnemyItemDropChance`

---

## 10. 难度与关卡

**关键设计点：游戏没有角色经验等级。** 存档里 `PlayerLevel` 与 `PlayerExp`
恒为 0，真正的关卡变量是 **`MonstersLevel`**（实测 2→30）。
玩家的强度成长完全来自天赋树 + 装备 + 精通 + 星魂，
难度则由 `MonstersLevel` 单独驱动。相关属性：
`EnemyHealthMultiplier`、`EnemyDamageMultiplier`、`EnemyMovementSpeedMultiplier`、
`EnemyAttackSpeedMultiplier`。

守卫在特定关卡出现：`GuardiansDefeated = {"10": true}`。
传送门付费记录 `PortalCurrencyPaid` 覆盖 1–16 与 29 关。

---

## 11. 系统管理类（39 个 Manager，来自 level0）

```
RunManager  PlayerManager  EnemiesManager  ProjectilesManager  PetsManager
TamingManager  SkillsManager  CharacterManager  GuardiansManager  KingManager
CraftingManager  InventoryManager  ChestsManager  OrbsManager  GroundEffectsManager
FXManager  FloatingNumbersManager  ParallaxManager  UIManager  MainMenusManager
MasteryManager/UI  ShapingManager/UI/Weapons  MiningManager/UI  StarManager/UI
JobsUIManager  StatsViewManager  ItemTooltipManager  TutorialManager
AchievementsManager  SettingsManager  DLCManager  SteamManager  LoggingManager
FinishManager
```

---

## 12. 辅助系统

- **成就**：`AchievementsManager`
- **教程**：`TutorialManager`、`ArrowTutorial`、`ClickTutorial`、`CraftingActionsTutorial`
- **统计数据面板**：`StatsViewManager`
- **浮动伤害数字**：`isDamageFloatingShown`、`FloatingNumbersAmount`、`ChangeFloatingNumbers`
- **屏幕震动 / 特效强度**：`ScreenShake`、`EffectsAmount`
- **本地化**：**14 种语言**（DLL 的 `Languages` 枚举 = 14），`LanguagesMenu`。
  文本表已提取 —— 链路是
  `level0#9374 LocalizerManager.JsonDataText`
  → `sharedassets0.assets#725` 的 TextAsset `LocalizationJson`
  （**明文**，588,996 字节，630 条 × 14 语言），脚本 `localization.py`。
  **key 按属性命名而不是按节点**：`Flat_Damage` → `DamageFlat`，
  树里 107 种效果属性 107 个全部命中。
  之前「本地化在加密 Addressables bundle 里」的结论是**错的** ——
  Addressables 只有两个 bundle，`catalog.bin` 仅 2764 字节且全部引用可列出，
  里面只有一个字体和两个材质。
- **商店页联动**：`WishlistButton`、`WishlistOtherGames`、`DiscordButton`、`SteamButton`
- **7 种属性速览**：`Currencies`、`ArrowSkinUnlocked`（12 个箭矢皮肤）

---

## 13. 存档里其它值得注意的字段

- `StarPerksPurchased`（星魂 perks，实测 `Bat1`/`Bat2`）、`StarPerksLastResetLevel`
- `IsUnlockedRarity` / `IsJustUnlockedRarity`（稀有度解锁 + "刚解锁"提示位）
- `PendingFirstCraftRarityBases`（首次制作的保底稀有度表，按 ItemType 分别记）
- `WasCurrencyShownBefore`（12 种货币的"首次出现"引导标记）
- `TotalCurrencyGained_FullGame`（全局累计获得，用于成就）
- `CorruptExtraStats`（腐蚀额外词条数）
