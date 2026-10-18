# Zad Archery — 经济系统全解

> 全部来自程序集 IL 与 ScriptableObject，没有推测。
> 提取脚本：`_analysis/economy_report.py`、`il_tables.py`、`so_extract4.py`。

## 一、12 种货币

| 值 | 货币 | 定位 |
|---|---|---|
| 1 | `Gold 金币` | 通用货币 —— 装备制作、强化、绝大部分天赋节点 |
| 2 | `ClawCurrency 爪` | **职业解锁** —— 唯一用途是买 Job |
| 3 | `ArcherCurrency 弓` | **制作台等级** —— 升 Crafting NPC |
| 4 | `PortalCurrency 传送门` | **系统解锁 + 后期天赋** —— 29 个天赋节点，含全部系统解锁节点 |
| 5 | `WarriorCurrency 战` | （已定义，未在解析到的消耗点出现） |
| 6 | `MageCurrency 法` | **符文/塑形** —— 创建符文、升级槽位 |
| 7 | `BatCurrency 蝠` | **精通** —— 升精通等级（`MasteryCurrency = 7`） |
| 8 | `MiningRock 岩石` | 矿石（最低阶）—— 采矿产出 |
| 9 | `MiningCopper 铜` | 矿石（铜） |
| 10 | `MiningSilver 银` | 矿石（银） |
| 11 | `MiningGold 金矿` | 矿石（金） |
| 12 | `GuardianCurrency 守卫` | **星魂 / 守卫特权** —— `StarCurrency = 12`，每个特权 1 点 |

> **这套设计的骨架**：5 种职业货币分别绑定 5 种「普通怪」，
> 每种怪只掉自己那种。玩家要哪条成长线，就得去刷对应的怪。

## 二、来源：怪物掉落

### 2.1 职业货币 ↔ 怪物类型

`MonsterCurrencyToEnemyType` 是硬绑定的（来源货币 → 掉落它的怪）：

| 货币 | 掉落它的怪 | 该货币的解锁等级 |
|---|---|---|
| `ClawCurrency 爪` | `Claw` | **Lv.2** |
| `ArcherCurrency 弓` | `Archer` | **Lv.3** |
| `WarriorCurrency 战` | `Warrior` | **Lv.6** |
| `MageCurrency 法` | `Mage` | **Lv.10** |
| `BatCurrency 蝠` | `Bat` | **Lv.16** |

> 击杀一只怪只掉**它自己那种**货币。所以「爪」只有打利爪怪才有，
> 「蝠」要打到 Lv16 才解锁。

### 2.2 掉多少：按「相对等级」查表

```
掉落量 = EnemyCurrencyPerRelativeLevel[ Clamp(BattleLevel,1,30) - 该货币的解锁等级 ]
```

| 相对等级 | 掉落量 | 相对等级 | 掉落量 |
|---|---|---|---|
| 0 | 1 | 1 | 1 |
| 2 | 2 | 3 | 2 |
| 4 | 3 | 5 | 4 |
| 6 | 6 | 7 | 8 |
| 8 | 10 | 9 | 14 |
| 10 | 18 | 11 | 25 |
| 12 | 33 | 13 | 44 |
| 14 | 59 | 15 | 79 |
| 16 | 110 | 17 | 140 |
| 18 | 190 | 19 | 260 |
| 20 | 350 | 21 | 480 |
| 22 | 650 | 23 | 870 |
| 24 | 1200 | 25 | 1600 |
| 26 | 2100 | 27 | 2100 |
| 28 | 2100 | 29 | 2100 |
| 30 | 2100 |  |  |

> 上限 **2100**，从相对等级 25 起封顶。
> 因为键是**相对**等级，所以「爪」在 Lv30 时相对等级 = 30−2 = 28 → 2100，
> 「蝠」在 Lv30 时 = 30−16 = 14 → 59。**先解锁的货币后期更值钱。**

### 2.3 掉落的完整流程

`PlayerManager.MonsterDiedGiveRewards(pos, enemyType, …, skillName, isPortalPack)`：

```
倍率 = 1
  若 isPortalPack: 倍率 = 1 + PortalPackCurrencyBonus/100
刷关倍率 = IsFarmingBack ? 0.75 : 1        // 回刷老关只给 75%

金币 = Ceiling( EnemyGoldPerLevel[lv] × 1.22^(lv>30 的部分) )
       × GetGoldGainedMultiplier()
       × 倍率 × 刷关倍率
       × GetKillGoldMultiplier(击杀用的塑形武器)

// 职业货币
按 enemyType 决定货币种类，基础量 = EnemyCurrencyPerRelativeLevel[相对等级]
奖励抽 = IsHappened_Over100Things(该货币的 *CurrencyChanceDrop)   // 额外一撮

金币数量 = GoldCoinsToDrop + (IsHappened_Over100Things(GoldChanceToDrop) ? 1 : 0)
for i in 金币数量:  SpawnCurrencyDrop(Gold, 金币)
for i in 奖励抽:    SpawnCurrencyDrop(职业货币, 基础量)
```

> **一次击杀最多掉两撮同种职业货币**（基础一撮 + 概率奖励一撮），
> 但金币是按 `GoldCoinsToDrop` 掉**一堆金币实体**，每个都值「金币」那么多。

### 2.4 金币的成长表

`EnemyGoldPerLevel`（1–30 手填，31+ 按 1.22 倍/级外推）：

| 等级 | 单只怪金币 | 等级 | 单只怪金币 | 等级 | 单只怪金币 |
|---|---|---|---|---|---|
| 1 | 1 | 2 | 3 | 3 | 7 |
| 4 | 20 | 5 | 52 | 6 | 138 |
| 7 | 285 | 8 | 590 | 9 | 1400 |
| 10 | 2700 | 11 | 5200 | 12 | 10700 |
| 13 | 19300 | 14 | 27000 | 15 | 48000 |
| 16 | 80000 | 17 | 135000 | 18 | 175000 |
| 19 | 245000 | 20 | 360000 | 21 | 535000 |
| 22 | 700000 | 23 | 1200000 | 24 | 1800000 |
| 25 | 2800000 | 26 | 4300000 | 27 | 6300000 |
| 28 | 8500000 | 29 | 12000000 | 30 | 35000000 |

> Lv1 的怪掉 1 金币，Lv30 掉 3500 万 —— **3500 万倍**，
> 比血量的 120 万倍还陡。

## 三、来源：其余渠道

### 3.1 宝箱

宝箱类型权重 `ChestTypeWeights`：

| 类型 | 权重 | 内容 |
|---|---|---|
| Currency 货币箱 | 60 | 金币实体 + 所有已解锁的职业货币 |
| Item 装备箱 | 18 | `ChestContentCount_Item` 件装备 |
| Rune 符文箱 | 15 | `ChestContentCount_Rune` 个符文 |
| Scroll 卷轴箱 | 7 | `ChestContentCount_Scroll` 个卷轴 |
| Legendary 传奇箱 | 2 | 传奇内容 |

**保底机制**（`RollChestTypeWithGuarantees`）：

| 条件 | 保底 |
|---|---|
| 制作过 5 件装备 | 必出装备箱 |
| 创建过 5 个符文 | 必出符文箱 |
| 到达 Lv3 | 必出卷轴箱 |
| 到达 Lv5 | 必出传奇箱 |

**货币箱给多少金币**（`ChestsManager.DropCoin`）：

```
金币数量 = Ceiling( (ChestCoins_X × ChestCoinMultiplier_X
                     + ChestExtraCoins)
                   × (1 + ChestCoinValueBonus/100)
                   × GetChestLootMultiplier() )
// 再遍历 MonsterCurrencies，凡是「已经出现过」的职业货币都各掉一撮
```

| 箱子 | ChestCoins | 倍率 |
|---|---|---|
| 货币箱 | 8 | 1 |
| 标准箱 | 2 | 2 |
| 传奇箱 | 8 | 3 |

> `DropCoin` 里那个 `WasCurrencyShownBefore` 判断很关键：
> **货币箱会掉「所有你已解锁过的职业货币」各一份**，
> 所以它是补冷门货币（比如蝠）的主要手段，不用专门去刷对应怪。

### 3.2 采矿

```
挖矿 → SpawnOreDrop(oreIndex)
   货币 = OreToCurrency[oreIndex]        // 0→岩石 1→铜 2→银 3→金
   价值 = CurrentOreValue() = (1 + OreValueBonus) × Max(1, 矿力等级倍率)
```

矿石权重 `OreBaseWeight`（挖出哪种矿的概率）：

| 矿石 | 权重 | 占比 |
|---|---|---|
| MiningRock 岩石 | 87.8 | **87.8%** |
| MiningCopper 铜 | 10 | **10.0%** |
| MiningSilver 银 | 2 | **2.0%** |
| MiningGold 金矿 | 0.2 | **0.2%** |

> **金矿占 0.2%** —— 挖 500 次才出一次。银 2%、铜 10%、岩石 87.8%。
> 这是个典型的长尾稀有资源曲线。

### 3.3 传送门货币

**唯一来源：击杀 RunPortal。**

```
MonsterDiedGiveRewards(…, enemyType = RunPortal(5)):
    货币 = 4 (PortalCurrency)
    数量 = IsPortalCurrencyOwed(MonstersLevel) ? 1 : 0
    若数量 > 0: MarkPortalCurrencyPaid(MonstersLevel)
```

`IsPortalCurrencyOwed(level)` = 该关还没被收过（`PortalCurrencyPaid` 里没有或为 0）。
所以**每个关卡一辈子只给 1 点传送门货币**，收过就永远不再给。

### 3.4 守卫货币

`GuardiansManager.DropGuardianLoot_Co`：

| 情况 | 掉落 |
|---|---|
| **首次**击杀某守卫 | 1 × 守卫货币 + 该守卫的招牌掉落 |
| 重复击杀 | 5 撮「该守卫的基础怪货币」（量 = GuardianCoinValue）|

守卫的「基础怪」映射（`GuardianBaseType`）：

| 守卫 | 基础怪 | 重复击杀掉 |
|---|---|---|
| `Guardian_Claw` | `Claw` | ClawCurrency 爪 |
| `Guardian_Warrior` | `Warrior` | WarriorCurrency 战 |
| `Guardian_Archer` | `Archer` | ArcherCurrency 弓 |
| `Guardian_Mage` | `Mage` | MageCurrency 法 |
| `Guardian_Bat` | `Bat` | BatCurrency 蝠 |

> **守卫货币只有首杀才给，且每次只给 1 点。** 而星魂特权每个要 1 点 ——
> 所以星魂系统的进度**直接等于你首杀了几个守卫**，跟刷多久无关。

## 四、消耗：每种货币花在哪

| 货币 | 消耗点 | 价格 |
|---|---|---|
| 金币 (1) | 天赋树 139/168 个节点 | `NodeCostEquation` |
| 金币 (1) | 制作装备基底 | `ItemInfo.UnlockCost` |
| 金币 (1) | 符文塑形（重roll、升级槽） | — |
| 金币 (1) | 采矿台 NPC 升级 | `MiningNPCLevelCost` |
| 爪 (2) | **5 个 Job 解锁** | 0 / 200 / 1500 / 20000 / 300000 |
| 弓 (3) | 制作台 NPC 升级 | `CraftingNPCLevelCost` |
| 传送门 (4) | **天赋树 29/168 个节点**（含全部系统解锁）| 多数为 1 |
| 法 (6) | 创建符文、升级塑形槽位 | — |
| 蝠 (7) | **精通等级** | `MasteryInfo.LevelUpCostEquation` |
| 守卫 (12) | **星魂特权** | 每个 1 点（`GuardianPerkCost`）|
| 矿石 (8–11) | 制作 / 塑形的材料 | — |

### 4.1 五个 Job 的价格（爪货币）

| Job | 名称 | 价格 | 累计 |
|---|---|---|---|
| 0 | 弓箭手 | 0 | 0 |
| 1 | 猎人 | 200 | 200 |
| 2 | 狙击手 | 1500 | 1700 |
| 3 | 元素使 | 20000 | 21700 |
| 4 | 虚空弓箭手 | 300000 | 321700 |

> 全部解锁共需 **321,700 爪**。而 Claw 怪的掉落量在 Lv30 是 2100/只 ——
> 大约 153 只怪。听上去不多，但爪的解锁等级是 Lv2，
> 前期相对等级低，掉落只有个位数。

### 4.2 天赋树的价格组成

| 货币 | 节点数 | 典型价格 |
|---|---|---|
| Gold 金币 | 139 | `800*x`×3, `60000*x`×3, `5e6*x`×3 |
| PortalCurrency 传送门 | 29 | `1`×29 |

> **传送门货币的 29 个节点包含了全部系统解锁**
> （职业、制作、采矿、塑形、精通、卷轴、宝珠、守卫特权、黄金怪、宝箱）。
> 也就是：**主线进度不是用金币买的，是靠一次次击杀传送门攒的。**

## 五、几条影响全局的规则

| 规则 | 值 | 作用 |
|---|---|---|
| `FarmRunRewardMultiplier` | 0.75 | **回刷老关卡，奖励只给 75%** |
| `GoldenRewardMultiplier` | — | 金色精英的奖励倍率 |
| `BaseChanceForGoldenEnemy` | 0.5% | 金色精英出现概率 |
| `ClawCurrencyPerStack` | 500000 | 货币显示成「一摞」所需的量 |
| `ChestChanceMultiplierPerSpawn` | 0.75 | 同一关里每刷一次宝箱，概率衰减到 75% |
| `BaseChanceToSpawnChest` | 2% | 宝箱基础出现率 |

> `FarmRunRewardMultiplier = 0.75` 是**反刷关设计**：
> 回到已经打过的关卡，金币和职业货币都只给 75%，
> 逼玩家往高关卡走。配合「敌人难度 1.5 倍/级、金币 1.22 倍/级」，
> 越往后收益越高。

---

## 一句话总结

**十二种货币 = 五条成长线 + 一条主线 + 一条通用 + 四种材料。**

| 想解锁 | 去刷 |
|---|---|
| Job（职业）| 利爪怪 → 爪 |
| 制作台 | 弓箭手怪 → 弓 |
| 塑形 / 符文 | 法师怪 → 法 |
| 精通 | 蝙蝠怪 → 蝠 |
| 星魂 / 守卫特权 | 守卫首杀 → 守卫货币 |
| **一切系统解锁 + 后期天赋** | **传送门（每关一次）→ 传送门货币** |
| 装备制作 / 强化 / 大部分天赋 | 任意怪 → 金币 |
| 制作材料 | 挖矿 → 四种矿石 |
