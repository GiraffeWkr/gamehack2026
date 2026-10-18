# Zad Archery — 数值系统全解

> 全部数字来自正式版 `1.0.1` 的资源与程序集，没有一处是推测：
> 玩家初始属性来自 `PlayerStatsData.InitData` 的 IL，难度曲线来自
> `DatabaseManager..cctor` 里构造的静态表，怪物/技能数值来自各自
> 的 ScriptableObject。提取脚本见文末。

## 一、玩家属性

### 1.1 属性的四桶结构

每个属性都是一个 `StatsDouble`，游戏只读 `Total`：

```
Total = Flat × (1 + AdditiveIncreases/100) × MultiplicativeIncreases
```

三个桶的来源互相独立：**Flat 来自基础值 + 天赋/装备的加值**，
**Additive 来自各种百分比**，**Multiplicative 只来自装备词缀与终局天赋**。
加法层先求和再乘，所以堆同一条加法属性边际收益是线性的；
乘法层直接连乘，是真正的稀缺资源。

### 1.2 初始属性表（84 项）

游戏开局时 `PlayerStatsData.InitData()` 会写入这些值。
注意 `Flat` 之外**没有任何初始加成** —— 玩家的所有成长都从这 84 个数开始。

| # | 属性 | 初始值 | 含义/来源常量 |
|---|---|---|---|
| 1 | `Damage` | **1** | 伤害 |
| 2 | `Health` | **10** | 生命值 |
| 3 | `AttackRange` | **450** | 攻击范围 |
| 4 | `NumberOfMouseProjectiles` | **1** | 支箭雨箭矢 |
| 5 | `MouseMagazineRegenTime` | **0.4** | 箭雨恢复速度加快 % |
| 6 | `MouseMagazineSize` | **1** | 箭雨最大召唤次数 + |
| 7 | `MouseNumberOfHits` | **1** | 箭雨命中次数 + |
| 8 | `MouseMaxNumberOfEnemies` | **2** | 箭雨最多可命中  个怪物 |
| 9 | `HealthPotionRegenPercentage` | **4** | % 生命药水效果 |
| 10 | `WarriorChanceToSpawn` | **4** |  |
| 11 | `ArcherChanceToSpawn` | **5** |  |
| 12 | `MageChanceToSpawn` | **4** |  |
| 13 | `BatChanceToSpawn` | **4** |  |
| 14 | `PortalSummonTime` | **20** | 传送门召唤时间 +秒 |
| 15 | `PortalHealthMultiplier` | **1** | % 传送门生命值 |
| 16 | `OrbDuration` | **15** | 秒宝珠持续时间 |
| 17 | `ChestCoins_CurrencyChest` | **8** | 货币宝箱提供  枚金币 |
| 18 | `ChestCoinMultiplier_CurrencyChest` | **1** | 货币宝箱的金币价值提高 % |
| 19 | `ChestCoins_StandardChest` | **2** | 物品、符文和卷轴宝箱提供  枚金币 |
| 20 | `ChestCoinMultiplier_StandardChest` | **2** | 物品、符文和卷轴宝箱的金币价值提高 % |
| 21 | `ChestCoins_LegendaryChest` | **8** | 传奇宝箱提供  枚金币 |
| 22 | `ChestCoinMultiplier_LegendaryChest` | **3** | 传奇宝箱的金币价值提高 % |
| 23 | `ChestContentCount_Item` | **1** | 物品宝箱提供  件物品 |
| 24 | `ChestContentCount_Rune` | **1** | 符文宝箱提供  个符文 |
| 25 | `ChestContentCount_Scroll` | **2** | 卷轴宝箱提供  个卷轴 |
| 26 | `ChestContentCount_Legendary` | **1** | 传奇宝箱提供  件宝物 |
| 27 | `ChestContentRarity` | **200** | 宝箱中发现的宝物稀有度提高 % |
| 28 | `GoldenRewardMultiplier` | **5** | 黄金怪物价值提高 % |
| 29 | `GoldGained` | **1** | % <sprite name=Gold> 获取量 |
| 30 | `ExpGained` | **1** |  |
| 31 | `GoldCoinsToDrop` | **1** | 枚 <sprite name=Gold> 金币掉落 |
| 32 | `RoA_CallCount` | **3** |  |
| 33 | `PlayerMovementSpeed` | **140** | % 移动速度 |
| 34 | `EnemyMovementSpeedMultiplier` | **1** | % 怪物移动速度 |
| 35 | `EnemyAttackSpeedMultiplier` | **1** | % 怪物攻击时间 |
| 36 | `EnemyHealthMultiplier` | **1** | % 怪物生命值 |
| 37 | `EnemyDamageMultiplier` | **1** | % 怪物伤害 |
| 38 | `PlayerAttackSpeed` | **0.7** | % 攻击速度 |
| 39 | `ShapingCooldownSpeed` | **1** | % 塑形武器速度 |
| 40 | `MaximumSkillPowers` | **5** | 可分配技能能力上限 |
| 41 | `MiningPickaxeSpeed` | **1** | % 镐速 |
| 42 | `WormholeShotCount` | **3** | 次虫洞打击 |
| 43 | `ExplosiveArrows_RadiusOfEffect` | **4** | % 爆炸箭范围 |
| 44 | `RuneImplicitsCount` | **1** | 制作的符文拥有  条武器属性 |
| 45 | `BaseMaxValueMultiplier` | **1** | % 物品属性上限（<sprite name=Damage>/<sprite name=H |
| 46 | `BaseMinValueMultiplier` | **1** | % 物品属性下限（<sprite name=Damage>/<sprite name=H |
| 47 | `CraftingLuck` | **1** | % 生成物品属性值时的幸运 |
| 48 | `ItemStatValuesMultiplier` | **1** | % 物品属性值 |
| 49 | `ItemImprovment_StartingValue` | **60** | 锻造初始成功率为 % |
| 50 | `ItemImprovment_DecreasePerImprovement` | **10** | 每次锻造损失 % 锻造成功率 |
| 51 | `ItemImprovment_MinimumValue` | **10** | % 最低锻造成功率 |
| 52 | `Multishot_NumberOfProjectiles` | **3** | 支<color=#5BF59E>多重射击</color>箭矢 |
| 53 | `BombArrow_RadiusOfEffect` | **9** | % <color=#5BF59E>爆炸箭</color>范围 |
| 54 | `SniperScope_NumberOfAttacks` | **1** | 次<color=#5BF59E>活体准星</color>攻击 |
| 55 | `BatSwarm_RadiusOfEffect` | **15** |  |
| 56 | `BatSwarm_BatsAmountMultiplier` | **1** |  |
| 57 | `SharpShooter_CooldownReductionOnCrit` | **1** | BaseSharpShooterCooldownReductionOnCrit |
| 58 | `DarkMatter_RadiusOfEffect` | **8** | BaseDarkMatter_RadiusOfEffect |
| 59 | `DarkMatter_DamageMultiplier` | **1** |  |
| 60 | `CriticalMultiplier` | **50** | % 暴击倍率 |
| 61 | `AlliesAttackSpeedMultiplier` | **1** | % 盟友攻击速度 |
| 62 | `FireArea_RadiusOfEffect` | **6** | BaseFireArea_RadiusOfEffect |
| 63 | `Blizzard_RadiusOfEffect` | **4** | BaseBlizzard_RadiusOfEffect |
| 64 | `Blizzard_SlowPercent` | **25** | BaseBlizzard_SlowPercent |
| 65 | `Blizzard_IceAmountMultiplier` | **1** |  |
| 66 | `Dragon_Time` | **3** |  |
| 67 | `Dragon_RadiusOfEffect` | **11** |  |
| 68 | `Knight_CallCount` | **2** |  |
| 69 | `Knight_RadiusOfEffect` | **11** |  |
| 70 | `Spear_ChainCount` | **3** |  |
| 71 | `LC_ChainCount` | **3** |  |
| 72 | `Vampire_CallCount` | **3** |  |
| 73 | `Vampire_RadiusOfEffect` | **11** |  |
| 74 | `BloodDrain_ChainCount` | **3** |  |
| 75 | `BloodDrain_Time` | **3** |  |
| 76 | `Skills_DamageMultiplier` | **1** | % 技能伤害 |
| 77 | `SkillsCooldownSpeed` | **1** | % 技能冷却速度 |
| 78 | `SkillsBuffDurationMultiplier` | **1** | % 增益持续时间 |
| 79 | `PetHealthMultiplier` | **1** | % 宠物生命值 |
| 80 | `PetDamageMultiplier` | **1** | % 宠物伤害 |
| 81 | `ChanceToTameEnemiesOnDeath` | **0** | BaseChanceToTameEnemiesOnDeath |
| 82 | `TameHealthMultiplier` | **0.7** | % 驯服怪物生命值 |
| 83 | `TameDamageMultiplier` | **1.2** | % 驯服怪物伤害 |
| 84 | `MaxTames` | **1** | 驯服怪物数量上限 |

### 1.3 开局关键数字

| 属性 | 初始值 | 说明 |
|---|---|---|
| `Damage` | 1 | 每次命中的基础伤害倍率 |
| `Health` | 10 | 生命上限 |
| `AttackRange` | 450 | 索敌半径（游戏单位） |
| `PlayerAttackSpeed` | 0.7 | 攻击间隔系数 |
| `PlayerMovementSpeed` | 140 | 移速 |
| `CriticalMultiplier` | 50 | 暴击额外倍率 = 50% |
| `MouseMagazineSize` | 1 | **弹匣只有 1 发** —— 开局每点一次鼠标就空 |
| `MouseMagazineRegenTime` | 0.4 | 这是**回填速度**不是时间，实际回填 = 1/0.4 = **2.5 秒** |
| `NumberOfMouseProjectiles` | 1 | 每次点击落下 1 支箭 |
| `MouseNumberOfHits` | 1 | 每支箭命中 1 次 |
| `MouseMaxNumberOfEnemies` | 2 | 单支箭最多打 2 个敌人 |
| `TameHealthMultiplier` | 0.7 |  |
| `TameDamageMultiplier` | 1.2 |  |
| `MaxTames` | 1 | 开局最多驯服 1 个 |

## 二、成长：玩家没有等级，怪物有

这是本作最干净的一个设计决策。

| | 玩家 | 怪物 |
|---|---|---|
| 驱动的变量 | 天赋点 / 金币 / 装备 | `MonstersLevel` |
| 存档字段 | `PlayerLevel` = **恒为 0** | `MonstersLevel` = 1…50 |
| 成长形态 | 离散的系统解锁 + 装备词缀 | 逐级查表 + 关外指数外推 |

源码里 `RunManager.BattleLevel`：

```
BattleLevel = Clamp(MonstersLevel - (IsFarmingBack ? 1 : 0), 1, MaxBattleLevel=50)
```

也就是**回刷上一关会低一级**，其余情况 `BattleLevel == MonstersLevel`。
`LastAuthoredLevel = 30` —— 1–30 级是手填的，31–50 级是公式外推。

### 2.1 玩家侧的成长来源

| 系统 | 解锁 | 对数值的作用 |
|---|---|---|
| 天赋树 | Lv2 | 168 节点，普通节点满点 342 点，给 Flat/Additive |
| 职业与技能 | Lv3 | 15 个技能，每技能 3 级 |
| 制作 | Lv5 | 弓 / 护甲 |
| 采矿 | Lv8 | 四种矿石 |
| 塑形（符文） | Lv8 | 武器固有词缀 + 随机词缀 |
| 精通 | Lv9 | 9 个精通，另有觉醒与巅峰层 |
| 星魂 | Lv17 | 星魂 perks |

> **玩家等级（`PlayerLevel` / `PlayerExp`）在存档里从 Lv2 到 Lv30 恒为 0。**
> 所以「升级」这件事在数值上不存在 —— 变强只有装备和天赋两条路。

## 三、怪物

### 3.1 十二种怪物类型

`EnemyInfo` 里每种怪物给的是**相对倍率**，血量/伤害的绝对值由等级表决定。

| functionName | 类型 | 血倍 | 伤倍 | 攻速 | 移速 | 索敌 | 远程 | 可驯服 |
|---|---|---|---|---|---|---|---|---|
| `Claw` | 0 | 1.1 | 1 | 0.3 | 80 | 110 | 否 | 是 |
| `Warrior` | 1 | 3.5 | 1.5 | 0.25 | 75 | 160 | 否 | 是 |
| `Archer` | 2 | 1.5 | 1.5 | 0.33 | 85 | 530 | 是 | 是 |
| `Mage` | 3 | 1 | 2.2 | 0.5 | 85 | 770 | 是 | 是 |
| `Bat` | 4 | 3 | 1.5 | 0.5 | 85 | 200 | 否 | 是 |
| `RunPortal` | 5 | 25 | 0 | 0 | 0 | 0 | 否 | 否 |
| `GuardianClaw` | 6 | 25 | 1 | 0.95 | 100 | 300 | 否 | 否 |
| `GuardianWarrior` | 7 | 35 | 1.2 | 1 | 100 | 300 | 否 | 否 |
| `GuardianArcher` | 8 | 30 | 1.1 | 0.95 | 100 | 650 | 是 | 否 |
| `GuardianMage` | 9 | 45 | 1.1 | 0.95 | 100 | 850 | 是 | 否 |
| `GuardianBat` | 10 | 50 | 1.25 | 1.2 | 100 | 350 | 否 | 否 |
| `King` | 11 | 200 | 0.7 | 1 | 0 | 1650 | 否 | 否 |

> **血量倍率跨度 200 倍**：最弱的 Claw 1 → King 200。
> 守卫（25–50 倍）是精英，国王是 Boss。
> 伤害倍率反而倒挂 —— Mage 的 2.2 是全场最高，King 只有 0.7，
> 靠的是技能而不是平A。

### 3.2 等级表：怪物血量

```
怪物HP   = EnemyHealthPerLevel[Clamp(BattleLevel,1,30)]
           × (BattleLevel > 30 ? 1.5^(BattleLevel-30) : 1)
           × 该类型的 HealthMultiplier
           × 玩家侧的全局 EnemyHealthMultiplier

怪物伤害 = floor( 同上的 EnemyDamagePerLevel 查表
               × (BattleLevel > 30 ? 1.25^(BattleLevel-30) : 1)
               × 该类型的 DamageMultiplier )
```

| 等级 | 基础HP | 基础伤害 | 金币 | 每群怪数 | 关卡群数 | HP 环比 |
|---|---|---|---|---|---|---|
| 1 | 3 | 2 | 1 | 9 | 8 | — |
| 2 | 12 | 2 | 3 | 9 | 9 | ×4.00 |
| 3 | 40 | 3 | 7 | 11 | 11 | ×3.33 |
| 4 | 90 | 5 | 20 | 12 | 11 | ×2.25 |
| 5 | 135 | 8 | 52 | 14 | 11 | ×1.50 |
| 6 | 260 | 14 | 138 | 16 | 12 | ×1.93 |
| 7 | 500 | 19 | 285 | 17 | 12 | ×1.92 |
| 8 | 830 | 27 | 590 | 18 | 13 | ×1.66 |
| 9 | 1350 | 33 | 1400 | 18 | 13 | ×1.63 |
| 10 | 2050 | 38 | 2700 | 18 | 13 | ×1.52 |
| 11 | 3300 | 42 | 5200 | 20 | 14 | ×1.61 |
| 12 | 4200 | 45 | 10700 | 20 | 14 | ×1.27 |
| 13 | 6300 | 55 | 19300 | 21 | 14 | ×1.50 |
| 14 | 8700 | 66 | 27000 | 21 | 15 | ×1.38 |
| 15 | 10500 | 75 | 48000 | 22 | 15 | ×1.21 |
| 16 | 14300 | 90 | 80000 | 22 | 15 | ×1.36 |
| 17 | 20000 | 150 | 135000 | 22 | 16 | ×1.40 |
| 18 | 27500 | 165 | 175000 | 23 | 16 | ×1.38 |
| 19 | 36500 | 212 | 245000 | 23 | 17 | ×1.33 |
| 20 | 52000 | 245 | 360000 | 24 | 18 | ×1.42 |
| 21 | 64000 | 280 | 535000 | 25 | 19 | ×1.23 |
| 22 | 93000 | 355 | 700000 | 25 | 20 | ×1.45 |
| 23 | 110000 | 390 | 1200000 | 26 | 20 | ×1.18 |
| 24 | 170000 | 430 | 1800000 | 26 | 20 | ×1.55 |
| 25 | 350000 | 600 | 2800000 | 26 | 20 | ×2.06 |
| 26 | 600000 | 890 | 4300000 | 26 | 20 | ×1.71 |
| 27 | 790000 | 1280 | 6300000 | 27 | 20 | ×1.32 |
| 28 | 1620000 | 1450 | 8500000 | 27 | 20 | ×2.05 |
| 29 | 2700000 | 1970 | 12000000 | 27 | 20 | ×1.67 |
| 30 | 3600000 | 2500 | 35000000 | 30 | 24 | ×1.33 |

> **这是本作难度曲线的全部。** 三十行手填的表，之后按 1.5 倍/级外推。
> HP 从 Lv1 的 3 涨到 Lv30 的 360 万，**120 万倍**。

### 3.3 终局（Lv31–50）

31 级之后不再查表，直接指数外推：

| 等级 | 基础HP（外推） | 基础伤害（外推） |
|---|---|---|
| 31 | 5400000 | 3125 |
| 35 | 27337500 | 7629 |
| 40 | 207594141 | 23283 |
| 45 | 1576418005 | 71054 |
| 50 | 11970924228 | 216840 |

> 血量 1.5 倍/级、伤害 1.25 倍/级的差距，就是**终局玩家必须靠乘区**
> 才追得上的原因 —— 加法层的天赋再堆也追不上 1.5^n。

### 3.4 国王房间（Boss 战）

```
国王房怪物HP   = KingAreaHealthBase(1500万) × HealthMultiplier
国王房怪物伤害 = floor(KingAreaDamageBase(4500) × DamageMultiplier)
```

> 注意这里是**固定基数**，不随 `BattleLevel` 成长 —— 
> 国王战是一个强度固定的终局关卡。

## 四、伤害管线

### 4.1 一次命中的完整公式

```
总伤害基数 = Damage.Total.RealValue
             × ClawCurrencyStackMultiplier(ClawCurrencyDamageBonus)
             × MasteryProgressMultiplier(DamageMultiplierPerMasteryLevel)

最终伤害 = Ceiling( 总伤害基数
                  × 投射物倍率          // 见 4.2
                  × 技能等级倍率        // 见 4.3
                  × (1 + 暴击倍率/100)  // 暴击时
                  × 2 (双倍伤害触发时)
                  × 3 (三倍伤害触发时) )
```

源码是 `PlayerStatsData.DamageCalculation(skillName, suffix, baseAmount, 
isCrit, isAlly)`。**注意暴击是在最后乘的**，所以暴击倍率 50% 的实际
收益是「总伤害 × 1.5」，而不是「暴击伤害 +50%」。

### 4.2 投射物倍率（`SkillsMultiplier`）

查表顺序：

1. 如果投射物名在 `ProjectileToJobSkill` 里 → 取该技能的 `damageMultipliers`
2. 否则查 `ProjectileInfo.Parameters[suffix]`
3. 都没有 → 倍率 = 1

`damageMultipliers` 按技能等级索引（`Clamp(level-1, 0, Count-1)`），
所以**技能每升一级是换一个固定倍率，不是线性叠加**。

### 4.3 暴击与多倍伤害

| 属性 | 初始值 | 上下限 |
|---|---|---|
| `CriticalChance` | 0 | — |
| `CriticalMultiplier` | 50 | — |
| `DamageTakenMinMax` | — | — ~ — |

> `DamageTakenMinMax` 下探到 **−500** —— 玩家可以把受到的伤害压成负数，
> 也就是**被打会回血**。

## 五、鼠标箭雨（ArrowFall）

这是玩家的**手动输出**，也是开局唯一的主要伤害来源。

### 5.1 一次点击发生什么

```
FireManualArrowFall(鼠标位置):
    SpawnAttacker(位置)          // 生成一个攻击实例
    currentMagazineCount -= 1    // 消耗 1 发弹匣

SpawnAttacker(位置):
    实例.Initialize(
        fullSizeValue  = MouseRadius(3.5) × OneGameUnitToUnityUnit(10) / SizeToGameUnitRatio
        attackDuration = 1 / BaseMouseAttackSpeed(0.6) ≈ 1.667 秒
        projectiles    = NumberOfMouseProjectiles.Total
    )
```

### 5.2 扩散圆环

```
Initialize 里预计算发射阈值:
    fireThresholds[i] = (i+1) / N × attackDuration     // i = 0..N-1

Update 每帧:
    attackTimer += dt
    radius = Lerp(0, fullSizeValue, attackTimer / attackDuration)   // 圆环扩张
    while (已发射 < N && attackTimer >= fireThresholds[已发射]):
        FireSingleProjectile(当前位置)
        已发射 += 1
    if (attackTimer >= attackDuration): 销毁
```

> **判定是「扩散的圆环」，不是「点哪里打哪里」。** 圆环从 0 扩张到
> `MouseRadius`，每扩到 `1/N` 处落下 1 支箭 —— 所以 `NumberOfMouseProjectiles`
> 提高的不仅是箭数，还有**环上落点的密度**。

### 5.3 弹匣

```
GetMaxMagazineSize()    = MouseMagazineSize.Total
GetMagazineRegenTime()  = 1 / MouseMagazineRegenTime.Total    // 注意是倒数！
GetNumberOfProjectiles()= NumberOfMouseProjectiles.Total
GetAutoAttackInterval() = GetMagazineRegenTime()
```

> `MouseMagazineRegenTime` 名字叫「时间」，实际是**速度**，
> 初始 0.4 对应回填一发要 2.5 秒。点出 `MouseAutoMode` 后
> 游戏按同样的间隔**自动**开火，玩家彻底解放鼠标。

### 5.4 鼠标相关属性全表

| 属性 | 初始值 | 作用 |
|---|---|---|
| `NumberOfMouseProjectiles` | 1 | 每次点击落下的箭数 |
| `MouseMagazineSize` | 1 | 弹匣容量 |
| `MouseMagazineRegenTime` | 0.4 | 回填**速度**（实际时间 = 1/值） |
| `MouseNumberOfHits` | 1 | 每支箭的命中次数 |
| `MouseMaxNumberOfEnemies` | 2 | 单支箭最多命中几个敌人 |
| `MouseChanceForAnotherHit` | 0 | 命中后再追加一次的概率 |
| `MouseChanceToFireSkills` | 0 | 落箭时顺带触发一次技能的概率 |
| `MouseAutoMode` | 0 | 自动开火开关（天赋解锁） |

### 5.5 落点是怎么选的

`FireSingleProjectile` 每触发一次：

1. 取鼠标位置附近最近的敌人，数量上限 = `MouseMaxNumberOfEnemies.Total`
2. 每个目标加一个 `Random.insideUnitCircle` 的随机偏移
3. 掷一次 `MouseChanceToFireSkills` —— 中了就 `FireSkillArrowFall` 送一发技能
4. 对 `mouseProjectile` 调 `FireProjectile`

> 所以**一支箭最多打 `MouseMaxNumberOfEnemies` 个目标**（初始 2）。
> 日志实测 Lv1：109 次施放 / 232 次命中 = 2.13 命中每次，
> 与「1 支箭 × 最多 2 个敌人」完全吻合。

鼠标弹丸资产（`ProjectileInfo`）—— 注意 `BaseProjectileCount` 是投射物
资产自己的字段，鼠标路径并不读它，落箭数只由 `NumberOfMouseProjectiles` 决定：

| functionName | BaseProjectileCount | 速度 | 存活 |
|---|---|---|---|
| `Mouse_Projectile` | 4 | 1100 | 6 |
| `Mouse_Raged_Projectile` | 4 | 1100 | 6 |
| `BombArrow_Mouse` | 4 | 2000 | 6 |
| `Multishot_Mouse` | 4 | 1300 | 6 |
| `PiercingShot_Mouse` | 4 | 2000 | 6 |
| `Archer_Elementalist_Explosive_Mouse` | 4 | 2400 | 6 |
| `Archer_Normal_Mouse` | 4 | 2400 | 6 |

## 六、Job 与技能

### 6.1 五个 Job

| Job | 名称 | 英文 | 解锁花费 | 技能 |
|---|---|---|---|---|
| 0 | 弓箭手 | Archer | 0 | 3 个 |
| 1 | 猎人 | Hunter | 200 | 3 个 |
| 2 | 狙击手 | Sniper | 1500 | 3 个 |
| 3 | 元素使 | Elementalist | 20000 | 3 个 |
| 4 | 虚空弓箭手 | Void Archer | 300000 | 3 个 |

> Job0 花费 0（开局就有），之后 200 / 1500 / 20000 / 300000，
> **每档涨约 10 倍**。

### 6.2 十五个技能的完整数值

全部技能都是 **3 级**，花费按等级递增（数组即 1/2/3 级的价钱）。

| 技能 | 中文 | 等级花费 | 冷却(1/2/3级) | 伤害倍率(1/2/3级) | 命中数 | 类型 |
|---|---|---|---|---|---|---|
| `BatSwarm` | 蝙蝠群 | 200000/600000/1500000 | 55/53/50 | 3.5/3.7/4 | 3/3/3 | 主动 |
| `Bear` | 熊 | 320/700/1500 | 45/45/45 | 2/2.5/3 | 1/1/2 | 宠物 |
| `Blizzard` | 暴风雪 | 85000/140000/300000 | 0/0/0 | 3/3.2/3.5 | 3/3/4 | 被动 |
| `BombArrow` | 爆炸箭 | 70/130/160 | 33/33/33 | 3.3/3.4/3.5 | 2/2/3 | 主动 |
| `DarkMatter` | 暗物质 | 300000/900000/2000000 | 25/23/20 | 2/2.2/2.5 | 2/2/3 | 主动 |
| `Falcon` | 猎鹰 | 700/1400/2800 | 40/40/40 | 4.5/4.7/5 | 3/3/4 | 宠物 |
| `FireArea` | 余烬射击 | 12000/40000/95000 | 0/0/0 | 3.2/3.3/3.5 | 1/1/1 | 被动 |
| `LightningStrike` | 雷霆一击 | 35000/85000/135000 | 0/0/0 | 7/7.2/7.5 | 4/4/5 | 被动 |
| `Multishot` | 多重射击 | 5/50/100 | 19/19/17 | 1.8/1.9/2 | 1/2/2 | 主动 |
| `PiercingShot` | 穿透射击 | 2500/5500/11000 | 40/38/36 | 0.9/1/1.1 | 1/2/2 | 主动 |
| `RapidFire` | 快速射击 | 45/85/110 | 47/47/45 | — | — | 增益 |
| `SharpShooter` | 神射手 | 5000/13000/25000 | 45/43/40 | — | — | 增益 |
| `SniperScope` | 活体准星 | 1000/2400/4700 | 35/32/30 | 5.5/5.7/6 | 8/8/9 | 主动 |
| `SuperNova` | 超新星 | 500000/2000000/4000000 | 150/145/140 | 5/5.5/6 | 10/10/10 | 主动 |
| `Wolf` | 狼 | 180/350/800 | 45/45/45 | 3/3.3/3.5 | 1/1/2 | 宠物 |

### 6.3 技能描述（官方本地化文本）

| 技能 | 描述 |
|---|---|
| **BatSwarm** 蝙蝠群 | 开启一道传送门释放蝙蝠，蝙蝠会撞向地面并伤害敌人。 |
| **Bear** 熊 | 召唤一头熊带领队伍，只要它还站立着，就会吸引所有敌人的攻击。 |
| **Blizzard** 暴风雪 | 有概率射出一支寒冰箭，形成暴风雪，对命中的所有怪物造成伤害并施加寒冷。 |
| **BombArrow** 爆炸箭 | 射出一支命中时引爆的爆炸箭，造成范围伤害。 |
| **DarkMatter** 暗物质 | 射出一道暗物质裂隙，贯穿所有怪物并吸收它们的投射物。 |
| **Falcon** 猎鹰 | 召唤一只翱翔在你上方的猎鹰，每当你释放技能时，它会俯冲攻击敌人。 |
| **FireArea** 余烬射击 | 有概率射出一支炽焰箭，落地后形成一片火海，灼烧其中的所有怪物。 |
| **LightningStrike** 雷霆一击 | 有概率射出一支蕴含强大雷电之力的箭，对单个目标造成高额伤害。 |
| **Multishot** 多重射击 | 一次发射多枚箭矢。 |
| **PiercingShot** 穿透射击 | 射出一支贯穿怪物的箭，箭矢会折返弓箭手处并再次射出。 |
| **RapidFire** 快速射击 | 短时间内大幅提高攻击速度。 |
| **SharpShooter** 神射手 | 短时间内大幅提高暴击率。生效期间，暴击会缩短一个随机技能的冷却时间。 |
| **SniperScope** 活体准星 | 召唤一个追踪准星，锁定目标并发动快速攻击。 |
| **SuperNova** 超新星 | 发射一颗坍缩恒星，片刻后爆炸，消灭屏幕上的所有怪物。 |
| **Wolf** 狼 | 召唤一匹狼，猎杀离你最近的敌人。只有远程敌人可以攻击它。 |

### 6.4 宠物类技能

| 宠物 | HP倍率(1/2/3) | 攻击范围 | 攻速 |
|---|---|---|---|
| `Bear` | 1.6/1.8/2.1 | 100 | 0.5 |
| `Falcon` | 1/1/1 | 1800 | 1 |
| `Wolf` | 1/1.1/1.2 | 100 | 1 |

### 6.5 增益类技能

| 技能 | 增益属性 | 数值(1/2/3) | 时长(1/2/3) |
|---|---|---|---|
| `RapidFire` | `RapidFire` | 450/475/500 | 3.5/3.7/4 |
| `SharpShooter` | `SharpShooter` | 12/14/16 | 5/6/7 |

### 6.6 被动类技能的触发公式

| 技能 | 被动属性 | 成长公式 |
|---|---|---|
| `Blizzard` | `{'m_FileID': 0, 'm_PathID': 5284}` | `[0.4,0.1,0.1]` |
| `FireArea` | `{'m_FileID': 0, 'm_PathID': 5285}` | `[2.0,0.1,0.1]` |
| `LightningStrike` | `{'m_FileID': 0, 'm_PathID': 5286}` | `[3.6,0.2,0.2]` |

---

## 提取脚本

| 脚本 | 内容 |
|---|---|
| `_analysis/il_player_stats.py` | 从 `PlayerStatsData.InitData` 的 IL 还原 84 项初始属性 |
| `_analysis/il_tables.py` | 从 `DatabaseManager..cctor` 还原 174 个常量与 67 张静态表 |
| `_analysis/so_extract4.py` | 用修好的类型树重新提取全部 18 类 ScriptableObject |
| `_analysis/tree_*.py` | 天赋树（另见 `TREE.md`） |

产出：`_analysis/so/PlayerBaseStats.json`、
`DatabaseManager_constants.json`、`EnemyInfo.json`、`JobSkillInfo.json`、
`ProjectileInfo.json`。
