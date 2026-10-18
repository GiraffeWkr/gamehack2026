# Zad Archery — 装备系统全解

> 来自 `ItemInfo` / `ItemStatsInfo` / `RuneStatInfo` / `ShapingWeaponInfo`
> 四个 ScriptableObject，以及 `CraftingManager` 的 IL。
> 提取脚本：`_analysis/equipment_report.py`、`items_resolve.py`、`so_extract4.py`。

## 一、装备的四个槽位类型

```
ItemType:  Bow(0) 弓   Armor(1) 护甲   Rune(2) 符文   Scroll(3) 卷轴
```

**装备怎么影响玩家属性**（`InventoryManager.ApplyRemoveItemStats`）：

```
弓  → Damage += GetImprovedBaseValue()          // 弓的基础值直接进【伤害】
甲  → Health += GetImprovedBaseValue()          // 甲的基础值直接进【生命】
每条词缀 → ChangeAStat(对应属性, 对应桶, 词缀值)
```

> 所以**弓的面板数值 = 你的伤害加成**，护甲同理。
> 词缀则是各自进自己的属性桶（Flat / Additive）。

弓和护甲各有 **10 个基底等级**，逐级解锁：

| 等级 | 弓 | 弓解锁花费(金币) | 制作成本 | 弓数值区间 | 护甲 | 护甲解锁花费 | 护甲数值区间 |
|---|---|---|---|---|---|---|---|
| 1 | `Bow1` | 0 | 2 | 3~6 | `Armor1` | 0 | 10~18 |
| 2 | `Bow2` | 5000 | 6 | 10~16 | `Armor2` | 5000 | 21~30 |
| 3 | `Bow3` | 40000 | 25 | 27~35 | `Armor3` | 40000 | 38~48 |
| 4 | `Bow4` | 380000 | 100 | 65~75 | `Armor4` | 380000 | 87~100 |
| 5 | `Bow5` | 5000000 | 300 | 113~125 | `Armor5` | 5000000 | 149~160 |
| 6 | `Bow6` | 55000000 | 1000 | 190~205 | `Armor6` | 55000000 | 232~245 |
| 7 | `Bow7` | 400000000 | 3000 | 238~250 | `Armor7` | 400000000 | 318~332 |
| 8 | `Bow8` | 3000000000 | 7500 | 310~325 | `Armor8` | 3000000000 | 418~435 |
| 9 | `Bow9` | 25000000000 | 45000 | 460~480 | `Armor9` | 25000000000 | 580~600 |
| 10 | `Bow10` | 250000000000 | 120000 | 680~700 | `Armor10` | 250000000000 | 900~930 |

> **解锁花费按约 7.5 倍/级递增**（5000 → 400 亿），
> 制作成本涨得更快（2 → 12 万）。
> 注意 `CreateCost` 是**素材成本**，解锁花费才是金币。

## 二、稀有度

`Rarity: Normal(0) / Rare(1) / Epic(2) / Legendary(3)`

| 稀有度 | 掉落权重 | 词缀数量 | 出售价倍率 |
|---|---|---|---|
| Normal 普通 | **59%** | 1 条 | ×1 |
| Rare 稀有 | **32.7%** | 2 条 | ×2 |
| Epic 史诗 | **7.5%** | 3 条 | ×4 |
| Legendary 传奇 | **0.8%** | 4 条 | ×8 |

> 掉落权重写在 `DatabaseManager.AwakeMe()` 里，正好凑成 100。
> **传奇 0.8%** —— 平均 125 件才出一件。

## 三、词缀池（15 条）

这是**装备自身的词缀池**（`ItemStatsInfo`），和符文词缀是两套。
`AppearsOn` 决定它只出现在弓还是护甲上：

| 部位 | 词缀 | 数值区间 | 出现概率 |
|---|---|---|---|
| Bow | `Additive_Damage` | 15 ~ 40 | 100% |
| Bow | `Additive_MouseMagazineRegenTime` | 10 ~ 35 | 100% |
| Bow | `Additive_PlayerAttackSpeed` | 15 ~ 50 | 100% |
| Bow | `Additive_Skills_DamageMultiplier` | 15 ~ 40 | 100% |
| Bow | `Flat_ChanceForDoubleDamage` | 10 ~ 25 | 100% |
| Bow | `Flat_CriticalChance` | 2 ~ 10 | 100% |
| Bow | `Flat_CriticalMultiplier` | 30 ~ 100 | 100% |
| Bow | `Flat_MouseChanceForAnotherHit` | 15 ~ 40 | 100% |
| Armor | `Additive_ChanceToSpawnChest` | 8 ~ 35 | 100% |
| Armor | `Additive_ChanceToSpawnOrb` | 10 ~ 35 | 100% |
| Armor | `Additive_Health` | 10 ~ 30 | 100% |
| Armor | `Additive_HealthRegen` | 15 ~ 45 | 100% |
| Armor | `Additive_PetHealthMultiplier` | 20 ~ 40 | 100% |
| Armor | `Flat_ChanceToDropHealthPotion` | 1 ~ 5 | 100% |
| Armor | `Flat_DodgeChance` | 2 ~ 8 | 100% |

**弓有 8 条、护甲有 7 条**，全部是 100% 权重（等概率）。

### 3.1 词缀数值怎么 roll

这是整个装备系统里最值得看的一段（`CraftingManager.GetRandomStatByTier`）：

```
幸运 = stats.CraftingLuck.Total.RealValue      // 初始 1.0
bias = 3 / Max(幸运, 0.01)
t    = Random.Range(0,1) ^ bias               // 幂函数偏置
数值 = minValue + (maxValue - minValue) × t
// 整数型属性再 Round
```

> **初始幸运 1.0 → bias = 3 → `t = rand³`。**
> `rand³` 的期望是 0.25（均匀分布是 0.5），
> 也就是**词缀数值天然偏向最低值**。
> 想把区间 roll 满，必须堆 `CraftingLuck`（幸运堆到 3 时 bias=1，变成均匀分布）。

这条公式解释了一个常见的玩家体感：**「为什么我做的装备数值总是很低」** —— 
不是运气差，是设计如此。

### 3.2 基础数值（BaseValue）

```
min = (ItemInfo.minValue + BaseMinValueAddition) × BaseMinValueMultiplier
max = (ItemInfo.maxValue + BaseMaxValueAddition) × BaseMaxValueMultiplier
if (max < min) max = min
```

玩家的 `BaseMinValueMultiplier` / `BaseMaxValueMultiplier` 初始都是 1，
`BaseMinValueAddition` / `BaseMaxValueAddition` 初始 0 —— 
**这两个加成只有天赋/装备能给**，是提升装备底子的主要途径。

### 3.3 词缀总倍率

```
ApplyCraftingStatValueBonus:  每条词缀 × stats.ItemStatValuesMultiplier.Total
ApplyStatValueBonuses:        再 × 卷轴倍率(ScrollStatValuesMultiplier)
```

`ItemStatValuesMultiplier` 初始 1，是全局「词缀数值放大器」。

## 四、强化（Improvement）

每件装备最多强化 **10 次**（`Improvment_MaximumCount`）。

### 4.1 成功率

```
有效次数 = Max(0, 已强化次数 − ImprovementChanceExemption)
成功率   = ItemImprovment_StartingValue(60) − 有效次数 × ItemImprovment_DecreasePerImprovement(10)
成功率   = Max(成功率, ItemImprovment_MinimumValue(10))
if (DoubleImproveChance) 成功率 = Min(成功率 × 1.3, 100)
```

| 第几次 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 成功率 | 60% | 50% | 40% | 30% | 20% | 10% | 10% | 10% | 10% | 10% |

**强化会失败**（`ImprovementFailed`）。`ImprovementChanceExemption` 能让前 N 次
不扣成功率，`DoubleImproveChance` 让成功率 ×1.3 —— 两者都来自装备词缀/天赋。

### 4.2 强化加成：阶梯式

```
加成% = Σ over ImprovementTiers[(4,20), (9,13), (∞,13)] of
            Max(0, Min(次数, 阈值) − 上一档阈值) × 该档系数
最终 BaseValue = Ceiling( BaseValue × (1 + 加成%/100) )
```

| 强化次数 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |
|---|---|---|---|---|---|---|---|---|---|---|
| 累计加成 | +20% | +40% | +60% | +80% | +93% | +106% | +119% | +132% | +145% | **+158%** |

> 前 4 次每次 **+20%**，第 5 次起降到每次 **+13%**。
> 满强化是 **×2.58**。配合成功率（60/50/40/30/20/10…），
> 强化到满的期望成本远高于面板。

## 五、词缀数量怎么来的

`CraftingManager.RollItemStatLines`：

```
条数 =  ItemNumberOfStats[稀有度]        // 1 / 2 / 3 / 4
      + Max(0, ExtraStatsFromScroll)   // 卷轴加的
      + Max(0, CorruptAddedStats)     // 腐蚀加的

重复 条数 次:
    词缀 = GetRandomStatByTier(装备, 部位)   // 按 Chance 加权，排除已有的
    若取到: 装备.AddStat(词缀, 数值)
```

> **排除已有的**（`addedNames`）意味着同一件装备不会出现两条同名词缀 ——
> 但腐蚀那一步会绕过它，见下。

## 六、腐蚀（Corrupt）

`CraftingManager.ClickedOnCraft4Button`：

```
前置: 已解锁该功能(9) / 装备存在 / 词缀数 > 1 / 尚未腐蚀
花费: ApplyCraftCostReduction( CreateCost × 0.5 )   ← 花【弓】货币

第 1 步: for (i = 0; i < n; i += 2)
            if (i+1 < n)  Stats[i+1] = 复制一份 Stats[i]
第 2 步: 再加 CorruptAddedStats 条新的随机词缀
```

**第 1 步是「隔一个复制一个」**，不是删除。所以一件 4 词缀的装备：

```
腐蚀前:  [A] [B] [C] [D]
腐蚀后:  [A] [A] [C] [C]  + N 条新的
```

> **词缀多样性下降，但同名词缀开始叠加。**
> 付出的代价是**一半的词缀位被同名的顶掉**，
> 换来的是「A 变成了 2A」的叠加 —— 值不值取决于原来那几条的强弱。

**「重复会叠加」这件事已经用 IL 验证过**（`InventoryManager.ApplyRemoveItemStats`）：
```
装备弓  → stats.ChangeAStat("Damage", Flat, item.GetImprovedBaseValue(), sign)
装备甲  → stats.ChangeAStat("Health", Flat, item.GetImprovedBaseValue(), sign)
foreach (line in item.Stats)                       // 逐条，不去重
    stats.ChangeAStat(该词缀对应的属性名, 该词缀的StatsProp, line.Value, sign)
```
每条词缀都是一次独立的 `ChangeAStat`，所以 `[A][A]` 真的就是两份 A。

> 花费倍率 `Craft_CorruptCostMultiplierOfCreateCost = 0.5`，
> 且和普通制作一样用 `ApplyCraftCostReduction` 打折。

## 七、卷轴

| 常量 | 值 | 作用 |
|---|---|---|
| `BaseChestContentCount_Scroll` | 2 | 宝箱里卷轴的数量 |
| `ChestGuarantee_ScrollAtLevel` | 3 | 到这一关保底出卷轴箱 |
| `FirstScrollDropRarity` | 1 | 首个卷轴掉落的保底稀有度 |

卷轴通过 `ItemSavedData` 的两个字段生效：

- `ExtraStatsFromScroll` —— **多几条词缀**（直接进上面的条数公式）
- `ScrollStatValuesMultiplier` —— **词缀数值倍率**（在 `ApplyStatValueBonuses` 里乘）

## 八、符文与塑形

塑形是**第二套装备系统**，独立于弓/护甲。

### 8.1 六种塑形武器

| 武器 | WeaponType | 类别 | 伤害公式 | 冷却(秒) | 索敌 |
|---|---|---|---|---|---|
| `Sword` | 0 | 近战 | `1.7 + (0.19*0.4)*x` | 0.8 | 600 |
| `Hammer` | 1 | 近战 | `2.0 + (0.23*0.4)*x` | 2.5 | 600 |
| `Lightning` | 2 | 元素 | `0.85 + (0.1*0.4)*x` | 2.6 | 600 |
| `Fire` | 3 | 元素 | `2.9 + (0.32*0.4)*x` | 3.2 | 600 |
| `Shield` | 4 | 辅助 | `1 + 0.1*x` | 35 | 600 |
| `Banner` | 5 | 辅助 | `1 + (0.1*0.4)*x` | 30 | 600 |

> 伤害公式里的 `x` 是**武器等级**。`0.4` 系数意味着
> 每升一级只加「系数 × 0.4」—— 成长很缓。
> 索敌范围**全部是 600**，没有差异。

### 8.2 符文词缀（37 条）

分两类：`Kind = 0` 是**武器专属**，`Kind = 1` 是 **Explicit 通用**。
`Target = 0` 影响攻击，`Target = 1` 影响增益效果。

**武器专属**（24 条）

| 武器 | 词缀 | 数值区间 | 取整 |
|---|---|---|---|
| Sword 剑 | `Sword_CleaveDamage` | 3 ~ 7 | 0 |
| Sword 剑 | `Sword_ComboDamage` | 5 ~ 13 | 0 |
| Sword 剑 | `Sword_FirstHitDamage` | 70 ~ 100 | 0 |
| Sword 剑 | `Sword_TwinSlashChance` | 10 ~ 35 | 0 |
| Hammer 锤 | `Hammer_AftershockDamage` | 15 ~ 35 | 0 |
| Hammer 锤 | `Hammer_AoERadius` | 10 ~ 25 | 0 |
| Hammer 锤 | `Hammer_DamagePerEnemyHit` | 4 ~ 10 | 0 |
| Hammer 锤 | `Hammer_ShatterDamage` | 8 ~ 20 | 0 |
| Lightning 闪电 | `Lightning_DamagePerChain` | 10 ~ 20 | 0 |
| Lightning 闪电 | `Lightning_ExtraChains` | 1 ~ 1 | 0 |
| Lightning 闪电 | `Lightning_FirstTargetDamage` | 70 ~ 100 | 0 |
| Lightning 闪电 | `Lightning_ForkChance` | 10 ~ 30 | 0 |
| Fire 火焰 | `Fire_EliteDamage` | 15 ~ 50 | 0 |
| Fire 火焰 | `Fire_ExecuteDamage` | 50 ~ 120 | 0 |
| Fire 火焰 | `Fire_MeteorBarrageChance` | 3 ~ 6 | 0 |
| Fire 火焰 | `Fire_TwinFallChance` | 15 ~ 30 | 0 |
| Shield 盾 | `Shield_ActiveRegen` | 0.5 ~ 1.5 | 1 |
| Shield 盾 | `Shield_EnemyAttackSlow` | 3 ~ 7 | 0 |
| Shield 盾 | `Shield_ExpireHeal` | 5 ~ 10 | 0 |
| Shield 盾 | `Shield_WeaponDamageAura` | 5 ~ 15 | 0 |
| Banner 旗帜 | `Banner_AttackSpeedBonus` | 15 ~ 30 | 0 |
| Banner 旗帜 | `Banner_MagazineRefillChance` | 10 ~ 20 | 0 |
| Banner 旗帜 | `Banner_TripleDamageChance` | 5 ~ 15 | 0 |
| Banner 旗帜 | `Banner_WeaponHaste` | 5 ~ 15 | 0 |

**Explicit 通用**（13 条）

| 武器 | 词缀 | 数值区间 | 取整 |
|---|---|---|---|
| 通用 | `Explicit_AttackCooldownSpeed` | 15 ~ 30 | 0 |
| 通用 | `Explicit_AttackDamage` | 10 ~ 20 | 0 |
| 通用 | `Explicit_BuffCooldownSpeed` | 10 ~ 25 | 0 |
| 通用 | `Explicit_BuffDuration` | 1 ~ 2 | 1 |
| 通用 | `Explicit_BuffKillExtend` | 0.1 ~ 0.2 | 2 |
| 通用 | `Explicit_BuffStrength` | 10 ~ 20 | 0 |
| 通用 | `Explicit_DoubleDamageChance` | 5 ~ 15 | 0 |
| 通用 | `Explicit_DoubleDurationChance` | 5 ~ 15 | 0 |
| 通用 | `Explicit_DoubleStrengthChance` | 5 ~ 15 | 0 |
| 通用 | `Explicit_FifthHitDamage` | 25 ~ 40 | 0 |
| 通用 | `Explicit_KillGoldBonus` | 20 ~ 35 | 0 |
| 通用 | `Explicit_RepeatAttackChance` | 5 ~ 15 | 0 |
| 通用 | `Explicit_ResetCooldownChance` | 5 ~ 12 | 0 |

### 8.3 符文的词缀数量

| 稀有度 | 随机词缀（Explicits）条数 |
|---|---|
| Normal 普通 | 0 |
| Rare 稀有 | 1 |
| Epic 史诗 | 2 |
| Legendary 传奇 | 3 |

> 传奇符文 **3 条**随机词缀 + 固有词缀（Implicits）。
> `ShapingRuneInventorySize = 12`（符文库存上限），
> `ShapingFirstRuneStatValue = 90`（首个符文的保底数值）。

## 九、掉落与其它

| 常量 | 值 | 作用 |
|---|---|---|
| `BaseEnemyItemDropChance` | 0.1 | 怪物掉落装备的基础概率 |
| `EnemyDropImprovementMin` | 2 | 怪物掉的装备自带强化次数的下限 |
| `EnemyDropImprovementMax` | 4 | 上限 |
| `GuardianItemDropCount` | 1 | 守卫掉几件 |
| `FirstBowDropRarity` | 1 | 第一把弓的保底稀有度 |
| `Improvment_CostMultiplierOfCreateCost` | 0.15 | 每次强化的花费 = CreateCost × 该值 |
| `Craft_CorruptCostMultiplierOfCreateCost` | 0.5 | 腐蚀花费倍率 |
| `ChestGuarantee_ItemsCrafted` | 5 | 制作多少件后保底出装备箱 |
| `BaseChestContentRarity` | 200 | 宝箱内容的基础稀有度 |

---

## 一句话总结

```
装备强度 = BaseValue × (1 + 强化加成%)      ← 强化吃钱，会失败
         × 词缀各自的值                    ← 值 = 区间内做 rand^(3/幸运) 的偏置
                                          ← 条数 = 稀有度(1-4) + 卷轴 + 腐蚀
                                          ← 全局还有 ItemStatValuesMultiplier 放大
```

**三条互相独立的成长轴**：
1. **稀有度**决定词缀「条数」（1→4）
2. **强化**决定基础值（最多 ×2.58）
3. **幸运 / 词缀倍率**决定每条词缀 roll 得多高

加上**腐蚀**这条「拿多样性换叠加」的激进选项，
以及**塑形/符文**这套完全独立的第二装备系统。
