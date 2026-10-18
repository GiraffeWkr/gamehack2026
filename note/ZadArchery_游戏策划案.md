# 《Zad Archery》游戏策划案

> 本文由游戏本体的资源文件还原而来：解密存档（`.su`）、`Assembly-CSharp.dll`
> 的元数据与字符串、Unity 序列化资源中的对象名，以及游戏自带的平衡性测试日志。
> 所有数值均可在 `_analysis/` 下的脚本中复现。标注「推断」的部分是依据命名和
> 存档结构得出的，未在运行时验证。

| 项 | 值 |
|---|---|
| 产品名 | Zad Archery |
| 开发商 | Samharia Studios |
| 版本 | 1.0.1 |
| 引擎 | Unity 6000.0.79f1（Mono） |
| 平台 | PC / Steam |
| 语言 | **14 种**（英/葡/法/德/俄/中/西/日/意/韩/捷/波/土/乌） |
| 商业模式 | 买断制 + DLC，另有 Demo 版 |

> 本地化的实现细节：游戏内 `Languages` 枚举是 **14 种**，
> 但对接 Steam 时列了 **17 个语言代码** ——
> `brazilian` 并入 `portuguese`、`tchinese`（繁中）与 `schinese`（简中）
> 共用一套、`latam`（拉美西语）与 `spanish` 共用一套。
> 也就是**对外挂 17 个语言标签、实际只维护 14 份文本**。

---

## 一、产品定位

**一句话**：一款把「幸存者类（Survivor-like）」的自动战斗，和高频鼠标操作
结合起来的弓箭主题 Roguelite。

**核心体验**：玩家只做两件事 —— **移动**、**用鼠标降下箭雨**。
技能、宠物、盟友、驯服的敌人全部自动行动。玩家不需要按技能键，
技能是**冷却好了自动放**。

**输出手段会随进度三次交接**（实测伤害占比）：

| 阶段 | 鼠标落箭 | 主动技能 | 随从/召唤/自动源 |
|---|---|---|---|
| Lv.1 开局 | **72.9%** | 0% | 27.1% |
| Lv.7 中期 | 32.7% | 32.9% | 23.9% |
| Lv.15 | 4.6% | **71.2%** | 22.9% |
| Lv.29 终局 | **0.5%** | **83.9%** | 15.4% |

> 这是本作最漂亮的一处设计：**开局鼠标就是全部，终局鼠标几乎归零**，
> 但玩家的操作手感没有被剥夺 —— 因为主动技能是自动释放的，
> 鼠标同时切换成了「走位」职责。三条腿还全程保持着 15% 以上的占比，
> 没有任何一个系统在后期被浪费掉。

**与同类产品的差异点**：

- 幸存者类通常是「移动 + 自动攻击」，本作把**鼠标位置变成主要输出手段**，
  操作感更接近弹幕射击
- 有 **8 层独立的成长系统**，堆叠深度远超一般 Survivor-like
- 局内强度靠装备/天赋的**乘算**滚雪球，不是单纯的等级堆叠

---

## 二、核心循环

```
进关（MonstersLevel）
   ↓
移动躲怪 + 鼠标落箭 + 技能自动释放
   ↓
击杀 → 掉金币 / 宝石 / 经验触发效果
   ↓
掉宝箱（含装备、符文、卷轴）/ 掉宝珠（限时增益）
   ↓
敌人死亡时有概率被「驯服」，变成友军
   ↓
过关 → 结算货币（Gold / 五种职业货币 / 矿石）
   ↓
局外：点天赋树、制作装备、强化、塑形符文、升精通、买星魂
   ↓
回到进关，难度 +1
```

**关键设计**：**游戏没有角色经验等级**。
存档里的 `PlayerLevel` 和 `PlayerExp` 从始至终是 `0`；真正的关卡变量是
`MonstersLevel`（怪物等级）。玩家强度的成长 100% 来自局外的装备与天赋，
难度则由 `MonstersLevel` 单独驱动。

> 这是个很干净的设计决策：把「玩家有多强」和「敌人有多强」彻底解耦，
> 玩家升级不带来数值膨胀，只能靠装备/天赋变强。

---

## 三、战斗系统

### 3.1 鼠标弹幕（主输出）

一套独立的、和技能并列的伤害系统：

| 属性 | 作用 |
|---|---|
| `NumberOfMouseProjectiles` | 每次落下的箭数 |
| `MouseMagazineSize` / `MouseMagazineRegenTime` | 弹匣容量与回填时间 |
| `MouseAutoMode` | 自动模式（免操作） |
| `MouseNumberOfHits` | 每根箭的命中次数 |
| `MouseMaxNumberOfEnemies` | 单根箭最多打几个敌人 |
| `MouseChanceForAnotherHit` | 命中后再打一次的概率 |
| `MouseChanceToFireSkills` | 落箭时顺带触发技能的概率 |

**弹匣机制**是这套系统的操作核心：箭是有限资源，打空后要等回填，
所以玩家不能无脑乱点，需要控制节奏。后期靠天赋/装备把
`MouseAutoMode` 点出来，操作负担才卸掉。

**一次点击到底发生了什么**（源码 `MouseAttacker.SpawnAttacker` +
`MouseAttackInstance`）—— 这不是「点哪里打哪里」：

```
点击 → 生成一个攻击实例，attackDuration = 1 / BaseMouseAttackSpeed(0.6) ≈ 1.667 秒
     实例每帧把圆环从 0 扩张到 MouseRadius
     圆环每扩到 1/N 处，落下 1 支箭（N = NumberOfMouseProjectiles）
     1.667 秒后实例销毁
```

**判定是「扩散的圆环」，不是「点击点」。** 所以 `NumberOfMouseProjectiles`
提高的不只是箭数，还有**环上落点的密度** —— 怪站在圆环扫过的路径上就会挨打。

单支箭最多命中 `MouseMaxNumberOfEnemies`（初始 2）个目标，
每个目标带一个 `Random.insideUnitCircle` 偏移。日志实测 Lv1：
109 次施放 / 232 次命中 = **2.13 命中每次**，与「1 箭 × 最多 2 敌」吻合。

> 一个容易读错的地方：属性叫 `MouseMagazineRegenTime`（回填*时间*），
> 但源码是 `GetMagazineRegenTime() = 1 / MouseMagazineRegenTime.Total` ——
> 它其实是**回填速度**。初始 0.4 对应每发 2.5 秒。

### 3.2 技能系统

**5 个 Job，每个 Job 3 个技能**，共 15 个技能：

| Job | 技能 | 主题 |
|---|---|---|
| Job0 | Multishot 多重射击 / RapidFire 速射 / BombArrow 炸弹箭 | 弓箭手 |
| Job1 | Wolf 狼 / Bear 熊 / Falcon 隼 | 兽王 |
| Job2 | SniperScope 狙击镜 / PiercingShot 穿透射击 / SharpShooter 神射手 | 狙击 |
| Job3 | FireArea 火焰领域 / LightningStrike 闪电 / Blizzard 暴雪 | 元素 |
| Job4 | BatSwarm 蝙蝠群 / DarkMatter 暗物质 / SuperNova 超新星 | 暗影 |

每个 Job 还有一个被动加成（`JobPassiveBonus`）。

**技能内部又分三类**：

1. **主动技能**（有 `_Cooldown`）：Multishot、BombArrow、RapidFire、BatSwarm、
   DarkMatter、SuperNova 等 —— 冷却好了自动释放
2. **召唤/宠物**：Wolf、Bear、Falcon —— 持续存在的作战单位，
   有自己的 `_AttackRange`、`_AttackSpeed`、`_NumberOfHits`、`_HealthMultiplier`
3. **被动生效**：ChanceForFireArea、ChanceForLightningStrike、ChanceForBlizzard 等
   —— 靠概率触发，不占技能位

**技能词缀深度**（举 Multishot 为例）：
`Multishot_NumberOfProjectiles`、`Multishot_NumberOfHits`、`Multishot_Cooldown`、
`Multishot_ChanceForMultiplyProjectiles` —— 每个技能都能被 4 个维度单独强化。

**技能强度**还有一层 **Skill Powers**：存档里 `MiningSkillPowerLevels`
以 `技能名_档位` 存储（如 `SuperNova_0` ~ `SuperNova_3`），
0–3 共 4 档，与天赋树节点一一对应。

**实测技能解锁节奏**（首次在日志里打出伤害的关卡）：

| 解锁关 | 内容 |
|---|---|
| Lv.1 | 基础弓手 `Archer_Normal` + 鼠标落箭 |
| Lv.2 | **Multishot** |
| Lv.3 | **BombArrow** + RapidFire（仅作为 buff） |
| Lv.5 | **Wolf**（宠物） |
| Lv.6 | **Bear**（宠物） |
| **Lv.7** | **DarkMatter / SuperNova / BatSwarm 三个主动技能同时放出** |
| Lv.12 | 驯服法师 `Tamed_Mage` |
| Lv.16 | 驯服蝙蝠 `Tamed_Bat` |

**注意 Lv.7 的技能爆发**——这是全局最大的单点解锁，下文第五节会说明它带来的问题。

**终局伤害占比**（Lv.29）：DarkMatter 57.6% / SuperNova 11.6% / BatSwarm 10.1% /
Meteor 9.2% / Sword 5.8% —— **暗影系（Job4）一套技能吃掉近 80% 输出**。
存档里 15 个主动技能中有 **7 个（47%）在整段测试里从未被使用**，
说明大量技能停留在「解锁了但没人用人」的状态。

**但库存远不止 15 个技能。** DLL 里还有一批未在存档暴露的
职业大招与独立技能，从投射物命名可还原：

```
Archer1_RoA 箭雨 / Archer2_Dragon 巨龙
Knight1_AreaSlash 范围斩 / Knight2_Spear 长矛 / KnightSlash
Ninja1_Shuriken 手里剑
Vampire1_VampireExp / Vampire2_BloodSuck 吸血 / VampireExplosion
Lightning1_LChain 闪电链 / Lightning2_LStrike
Fire1_Meteor 陨石 / HammerShockwave 锤震波
```

对应的属性也确实存在（`RoA_CallCount`、`Dragon_Time`、`Knight_ChanceForSpear`、
`Spear_ChainCount`、`LC_ChainCount`、`Vampire_CallCount`、`BloodDrain_Time`、
`Hammer_DamagePerEnemyHit` 等，都在 273 个属性表里）。

> 这说明两件事：
> 1. **存档只暴露了一套技能方案**，代码里的储备是它的两倍以上
> 2. 战斗系统的技能原型是 **Archer / Knight / Ninja / Vampire / Lightning / Fire**
>    （比存档显示的 5 个 Job 更细分）—— 推断这是一套更早期的职业设计残留
>
> 对做同类项目的人来说，**这等于一份现成的后续内容清单**。

### 3.3 宠物 / 驯服 / 盟友

三条并行的「兵力」来源：

- **宠物（Pets）**：Wolf / Bear / Falcon，由技能召唤，
  共享 `PetHealthMultiplier` / `PetDamageMultiplier`
- **驯服（Taming）**：`ChanceToTameEnemiesOnDeath` ——
  **敌人死亡时有概率变成你的兵**。上限 `MaxTames`，
  强度由 `TameHealthMultiplier` / `TameDamageMultiplier` 控制
- **盟友（Allies）**：`WarriorChanceToSpawn` / `ArcherChanceToSpawn` /
  `MageChanceToSpawn` / `BatChanceToSpawn`，配合各自的
  `*CurrencyChanceDrop`（打怪掉对应职业货币）

日志中出现的单位：`Archer_Normal`（基础）、`Tamed_Claw`、`Tamed_Archer`、
`Tamed_Warrior`、`Tamed_Mage`、`Tamed_Bat`（驯服来的）。

> 「击杀 → 收编」是很强的正反馈设计：打得越猛，队伍越大，滚雪球。

**但实测下来，驯服系统被严重埋没了。** 终局存档里这套系统其实做得很完整
（`MaxTames` 1→3、`ChanceToTameEnemiesOnDeath` 0%→7%、
`TameDamageMultiplier` 1.2→4.2、`TameHealthMultiplier` 0.7→1.2），
可实际伤害占比：

| 单位 | 累计伤害 | 终局占比 |
|---|---|---|
| 全部 `Tamed_*` 之和 | ~1,420 万 | **< 0.6%** |
| `Sword`（0 施放的自动攻击源） | 3.71 亿 | 5.8% |
| `Meteor_Projectile`（0 施放的自动源） | 5.90 亿 | 9.2% |

> **两个玩家完全不用管的「自动攻击源」，贡献是玩家主动经营的驯服系统的 60 倍。**
> 这是典型的「系统做了，但数值权重给得太低」——
> 驯服的爽感在视觉上有，在数值上没有兑现。

宠物（Wolf / Bear）同理：虽然是技能栏里的召唤物（Wolf 366 次施放 / 490 万伤害，
Bear 139 次 / 114 万），终局合计也 **< 0.1%**。

### 3.4 伤害与攻速栈

一组全局战斗参数，说明游戏允许玩家**改敌人属性**：

```
PlayerAttackSpeed / AlliesAttackSpeedMultiplier
PlayerMovementSpeed / EnemyMovementSpeedMultiplier
EnemyHealthMultiplier / EnemyDamageMultiplier / EnemyAttackSpeedMultiplier
AttackRange / AttackWhileMoving
```

`EnemyHealthMultiplier` 等属性能被玩家的天赋变成**负数**
（实测 Lv30 时 `EnemyHealthMultiplier` = 0.85、`EnemyDamageMultiplier` = 0.85），
也就是「削弱敌人」是一条正经的成长路线。

核心暴击/连击栈：
`CriticalChance`、`CriticalMultiplier`、`ChanceForDoubleDamage`、
`ChanceForTripleDamage`、`AttackChanceForAnotherHit`、`CriticalPierceChance`、
`ExplosiveArrows`、`WormholeShotChance`。

---

## 四、数值体系（本作最值得抄的部分）

### 4.1 属性聚合模型

每个属性都是一个四桶结构：

```
Flat                     基础值
AdditiveIncreases        加法百分比 —— 先全部相加，再 (1 + Σ/100)
MultiplicativeIncreases  乘法因子 —— 直接连乘（1.0 == ×1）
Total                    结算结果，游戏只读这个
```

**公式**：

```
Total = Flat × (1 + AdditiveIncreases/100) × MultiplicativeIncreases
```

**已在存档上验证**：Lv30 的 214 个非零属性中 206 个精确匹配，
剩下 8 个的误差全部来自存档把 `Total` 写成两位小数的舍入。

实测例子：

| 属性 | Flat | Add% | Mul | Total |
|---|---|---|---|---|
| Damage | 1712 | 75 | 1.0 | 2996 |
| Health | 1423 | 95 | 1.1 | 3052 |
| PlayerMovementSpeed | 140 | 25 | 1.0 | 175 |
| ChanceToSpawnChest | 8 | 195 | 1.0 | 23.6 |
| EnemyHealthMultiplier | 1 | −15 | 1.0 | 0.85 |

**这个模型的好处**：加法层和乘法层分离，
策划可以精确控制「堆同一条属性」的边际收益递减（加法层线性、乘法层独立），
而且 `Flat` 的改动不会被后面的百分比放大。

属性共 **273 个**。命名约定 `{Flat_|Additive_|Multiplicative_}{属性名}`，
`Flat_` 前缀 195 个、`Additive_` 前缀 242 个。

**修改方式不止「加」，还有「设」**（`StatsProperties` 枚举）：

```
Flat                        加到基础值
Additive                    加到加法层
Multiplicative              乘到乘法层
SetFlat_And_ResetAddMulti   直接设基础值，并把加法层和乘法层清零
SetFlatOnly                 只设基础值
SetAdditiveOnly             只设加法层
SetMultiplicativeOnly       只设乘法层
```

> `SetFlat_And_ResetAddMulti` 是「重置型」效果 ——
> 用于「把这件装备的基础伤害设为 X」这类**覆盖**语义，
> 而不是叠加。有了这一组，装备/天赋/效果就能表达
> 「加成」和「设定」两种完全不同的意图。

### 4.2 属性分类（节选，完整清单见 `_analysis/stats.py`）

**输出类**：Damage、ChanceForDoubleDamage、ChanceForTripleDamage、
AttackChanceForAnotherHit、CriticalChance、CriticalMultiplier、CriticalPierceChance、
ExplosiveArrows（+Radius）、WormholeShotChance（+Count）

**生存类**：Health、HealthRegen、DamageReduction、DodgeChance、
DeathBlowImmunityDuration、ChanceToDropHealthPotion、HealthPotionRegenPercentage、
HealthRestorePercentOnKill、ChanceEnemyHitHeals

**经济类**：GoldGained、GoldChanceToDrop、GoldCoinsToDrop、GoldPerSecond、ExpGained、
MonsterGemChance、EnemyItemDropChance、GuaranteeMonsterCurrencyDrop

**刷宝类**：ItemsRarity、ChestLootBonus、ChanceToSpawnChest、ChanceToSpawnOrb、
OrbDuration、ChanceForGoldenEnemy、EnemyDropRandomImprovement

**解锁类**：UnlockSkills / Crafting / Mining / Shaping / Mastery / Star / Chests /
Orbs / GoldenEnemies / ItemChests / RuneChests / ScrollChests / LegendaryChests /
EnemyItemDrops / Scrolls（值为 100 = 已解锁，走同一套属性系统）

**制作类**：CraftingLuck、CraftCostReduction、ItemStatValuesMultiplier、
BaseMaxValueMultiplier、BaseMinValueMultiplier、BaseMaxValueAddition、
BaseMinValueAddition、ItemImprovment_StartingValue / DecreasePerImprovement /
MinimumValue、CorruptExtraStats

### 4.3 后期成长完全由「乘区」承担（本作最重要的设计结论）

对比 Lv.16 与 Lv.29 两次实测：

| | Lv.16 | Lv.29 | 倍率 |
|---|---|---|---|
| 单怪血量 | 24,208 | 5,847,964 | **×242** |
| 玩家主属性 `Damage` | 2,734 | 2,996 | **×1.10** |

**怪物血量涨了 242 倍，玩家的主属性只涨了 10%。** 这 242 倍全部来自乘区：

| 乘区属性 | Lv.2 | Lv.30 |
|---|---|---|
| `ChanceForDoubleDamage` 双重伤害概率 | 0% | **95.5%** |
| `CriticalChance` / `CriticalMultiplier` | 0% / 50% | 14% / **240%** |
| `AttackChanceForAnotherHit` 再打一次 | 0% | 39% |
| `Skills_DamageMultiplier` 技能乘区 | ×1.0 | **×2.6** |
| `SkillsCooldownSpeed` 冷却速度 | ×1.0 | ×1.8 |
| `PlayerAttackSpeed` | 0.8 | 1.8 |
| `DarkMatter_NumberOfHits` 段数 | 2 | **18**（×9） |
| `DarkMatter_Cooldown` | 25s | 11s |
| `SuperNova_NumberOfHits` | 10 | 40 |
| `BatSwarm` 蝙蝠数 / 持续 | ×1 / 4s | ×3.2 / 10.2s |
| `EnemyHealthMultiplier`（削弱敌人） | 1.0 | **0.8** |

**给策划的直接启示**：

1. **不要让主属性承担后期成长。** 主属性走「加算」的话，
   后期要么数值爆炸要么收益归零；本作让主属性只负责前 15 关，
   之后就退居次要位置。
2. **但也不能只靠一个乘区。** 本作把成长**摊到 6–8 个彼此独立的乘区上**
   （双伤概率 × 暴击乘区 × 技能段数 × 技能乘区 × 冷却速度 × 攻速），
   才能撑出 242 倍的跨度而不让任何单一属性失衡。
3. **「削弱敌人」要算作一条正经成长线。**
   `EnemyHealthMultiplier` 从 1.0 降到 0.8 —— 玩家可以把敌人变脆 20%。

### 4.4 架构上的关键决策：用「公式字符串」驱动全部内容

这是本作能塞进 **273 个属性 + 168 个天赋节点 + 15 个技能 + 9 个精通**
却还能调得动的根本原因。游戏**没有任何一处把数值写死在代码里**，
取而代之的是一套 **ScriptableObject 内容表 + 公式字符串**。

从 DLL 里还原出的数据类（全部是 `ScriptableObject`）：

| 数据类 | 作用 |
|---|---|
| `EnemyInfo` | 每种敌人的攻速/移速/血倍/是否远程/**是否可驯服** |
| `JobInfo` / `JobSkillInfo` | 职业与技能定义 |
| `SkillInfo` / `SkillDetailInfo` / `SkillPowerInfo` | 技能本体 / 详情 / 强度档 |
| `TreeInfo` / `TreeNodeInfo` | 天赋树与节点 |
| `MasteryInfo` | 精通（含巅峰层） |
| `GuardianPerkInfo` | 守卫 perk |
| `ItemInfo` / `ItemStatsInfo` / `RuneStatInfo` | 装备与词缀定义 |
| `StatInfo` | 属性定义 |
| `ShapingWeaponInfo` | 塑形武器 |
| `MiningPowerConfig` | 采矿配置 |
| `ProjectileInfo` / `EnemyProjectileInfo` | 投射物 |

**核心是这一组「公式字符串」字段**：

```csharp
class StatValueCostEquations {     // 属性成长与花费
    StatInfo stat;
    string   valueEquation;        // 数值成长公式
    string   costEquation;         // 升级花费公式
}

class TreeNodeInfo {               // 天赋节点
    string NodeName, NodeDescription;
    List<string> NodeValueEquation;   // 每级给多少
    List<string> NodeCostEquation;    // 每级花多少
    List<Currencies> _nodeCostCurrencies;  // 用哪种货币买
}

class MasteryInfo {
    string LevelUpCostEquation;    // 升级花费公式
    string MainValueEquation;      // 主属性成长公式
    string AwakenSuffix;           // 显示后缀
    int    MainDecimals;           // 显示几位小数
}
```

**这套做法的好处**：

1. **策划改公式不用改代码、不用重新编译** ——
   调一条成长曲线就是改一个字符串。
2. **同一套管线服务所有系统** —— 天赋树、精通、技能强度、
   装备词条全都用 `valueEquation` / `costEquation` 两件套，
   加新系统几乎零成本。
3. **数值成长天然可配成「前陡后缓」** ——
   因为公式是字符串，可以按关卡写 `1.66^level` 这种指数式
   （正好对应第 5.3 节实测出的 ×1.662/关）。
4. **每个节点可以选自己的货币**（`_nodeCostCurrencies`）——
   12 种货币能精细地分配到 168 个节点上。

> **如果只能从这份策划案里带走一条工程经验，就是这条。**
> 把「数值成长」和「升级花费」抽象成可配置的公式字符串，
> 是让内容量级能安全扩张到几百个条目的前提。

---

## 五、关卡与难度

关卡即 `MonstersLevel`，共 **40 关**。

> **口径修正**：平衡测试存档只跑到 Lv.30，一度被当作关卡上限。
> 但 DLL 的成就系统里写着 `AchievementsManager.LevelMilestone = 40`，
> 并有一个成就叫 `ReachLevel40` —— **实际是 40 关**。
> 这是本次逆向的一个教训：**测试数据的截断值不等于设计上限**，
> 有硬证据（常量、成就、枚举）时应以硬证据为准。

### 5.1 关内结束条件是「击杀配额」，不是计时器

这是本作节奏设计的关键。实测单关目标时长设计在 **4–5 分钟**
（Lv.1–6 全部落在 244–305 秒，均值 271 秒），但由于结束条件是**杀够 N 只怪**，
玩家变强后耗时自然被压缩 —— Lv.9 只用了 84 秒。

**配额从 Lv.1 的 128 只涨到 Lv.29 的 668 只。**

**刷怪是按「距离」触发，不是按时间**（`EnemiesManager.SpawnPackEvery_Distance`）：
玩家每推进一段距离生成一批怪（Pack），清空这一批结算一次里程碑
（有 `PackMilestonePrefab` 与已完成包的颜色标记）。

> 这个设计比计时刷怪好：**玩家的推进速度直接决定节奏**。
> 打得快 = 更快遇到下一批 = 更快通关；
> 卡住了也不会被无限刷出的怪堆死。**这是一个值得直接照搬的机制。**

### 5.2 实测关卡节奏表

| 关卡 | 代表耗时 | 怪物总血量 | 实际 DPS | 击杀 | 单怪 HP | 结果 |
|---|---|---|---|---|---|---|
| 1 | 5m05s | 571 | 1.87 | 128 | 4 | COMPLETED |
| 2 | 4m04s | 2,050 | 8.39 | 110 | 19 | COMPLETED |
| 3 | 4m18s | 9,986 | 39 | 160 | 62 | COMPLETED |
| 4 | 4m04s | 21,950 | 90 | 166 | 132 | COMPLETED |
| 5 | 4m41s | 45,830 | 163 | 178 | 257 | COMPLETED |
| 6 | 4m56s | 100,730 | 339 | 216 | 466 | COMPLETED |
| **7** | 2m40s | 202,920 | 1,266 | 210 | 966 | **3 连败** |
| 8 | 1m30s | 536,110 | 5,923 | 241 | 2,225 | COMPLETED |
| 9 | 1m24s | 877,890 | 10,330 | 241 | 3,643 | COMPLETED |
| **10** | **1 秒** | 52,100 | 49,590 | **0** | – | **守卫关** |
| 11 | 2m10s | 1,890,000 | 14,490 | 288 | 6,562 | COMPLETED |
| 12 | 2m22s | 2,320,000 | 16,290 | 289 | 8,028 | COMPLETED |
| 13 | 2m50s | 3,320,000 | 19,500 | 304 | 10,921 | COMPLETED |
| 14 | 3m34s | 4,680,000 | 21,860 | 326 | 14,356 | COMPLETED |
| 15 | 3m48s | 5,790,000 | 25,380 | 342 | 16,930 | COMPLETED |
| **16** | 2m03s | 19,150,000 | 154,680 | 342 | 55,994 | **3 连败** |
| 17 | 0m08s | 2,990,000 | 371,560 | 34 | 87,941 | 弃关 |
| 18–28 | – | – | – | – | – | **从未游玩** |
| 29 | 6m22s | 4,210,000,000 | 11,010,000 | 668 | 6,302,395 | COMPLETED |
| 30 | 1m17s | 2,090,000,000 | 27,120,000 | 369 | 5,663,957 | 未通关 |

### 5.3 难度成长曲线

单怪血量（已按 attempt 加权修正 overkill 溢出）的环比倍率：

| 区间 | 总倍率 | 每关倍率 | 性质 |
|---|---|---|---|
| Lv.1 → 9 | ×559.6 | **×2.205 / 关** | 教学期陡坡 |
| Lv.9 → 15 | ×7.3 | **×1.393 / 关** | 中段稳态 |
| Lv.15 → 17 | ×2.0 | ×1.428 / 关 | 末期 |
| **Lv.1 → 29 全程** | **×1,516,275** | **×1.662 / 关** | 纯指数 |

> **结论：不是线性 ×1.4，是「前陡后缓的指数」。**
> 整体约 **×1.66^Lv**，前 9 关刻意做成 **×2.2/关**的陡坡 ——
> 快速给玩家「我在变强」的正反馈，中段回落到 ×1.39–1.54/关。
> Lv.1→29 累计血量跨度约 **150 万倍**（若外推到 40 关，跨度将超过 **10 亿倍**）。

### 5.4 守卫关与传送门

- **每 10 关一个守卫关**：Lv.10 实测只用 **1 秒、0 击杀**——
  进场时挂着的 BatSwarm 蝙蝠群直接把 Boss 秒了。
  存档 `GuardiansDefeated = {"10": true}` 在整批数据里只有这一条。
- **每关入场要交一次传送门货币**：`PortalCurrencyPaid` 的键是 `1..16` 和 `29`。
  17–28 从未付费 → 从存档侧再次证实这 12 关没被玩过。

### 5.5 敌人图鉴（`EnemyType` 枚举，共 12 种）

```
0  Claw                爪     ┐
1  Warrior             战士   │
2  Archer              弓箭手 ├─ 5 个基础兵种
3  Mage                法师   │
4  Bat                 蝙蝠   ┘
5  RunPortal           传送门（跑关用的门，非敌人）
6  Guardian_Claw       守卫·爪   ┐
7  Guardian_Warrior    守卫·战士 │
8  Guardian_Archer     守卫·弓箭手├─ 5 个守卫 Boss
9  Guardian_Mage       守卫·法师 │
10 Guardian_Bat        守卫·蝙蝠 ┘
11 King                国王（最终 Boss）
```

**这张表解开了一个关键结构**：`EnemyType` 的 5 个基础兵种
（Claw / Warrior / Archer / Mage / Bat）**和 5 种职业货币、
5 个守卫、5 个盟友刷怪类型完全一一对应**。

也就是说：游戏只有 **5 个原型（archetype）**，
敌人、守卫、盟友、货币、Job 全部围绕这 5 个原型展开 ——
一套内容复用在五个系统里。

> 注意：**Job0–Job4 与这 5 个原型的对应关系是推断的**（Job4 暗影系对应 Bat、
> Job3 元素系对应 Mage 很明显；Job0 弓箭手系对应 Archer 也合理，
> 但 Job1 兽王 / Job2 狙击 与 Claw / Warrior 的归属无法从现有数据确认）。

**最终 Boss「King」有三个技能**（`KingManager/KingSkill` 枚举）：
`Laser`（激光）/ `Missiles`（导弹）/ `ExplosionOrb`（爆炸球）。

**敌人视觉资源**：`Monster5` ~ `Monster9`、`Bat_Normal_Prefab`、
`Skeleton`、`Ghost`。Boss 有 5 套配色（`Boss_Blue/Green/Orange/Red/Violet`）
+ `Boss_King`。金色精英（GoldenEnemy）有独立视觉与 `GoldenRewardMultiplier`。

**技能分类标签**（`SkillTags` 枚举）：`Call` 召唤 / `Fall` 坠落 /
`Single` 单体 / `Area` 范围 / `Duration` 持续 / `Chain` 连锁。

---

## 六、实测暴露的三个节奏问题

这批平衡测试数据最有价值的地方，是它**记录了一个玩家真实的卡关行为**。

### 问题一：Lv.7 —— 解锁爆发撞上难度墙

Lv.7 同时发生两件事：

1. **DarkMatter / SuperNova / BatSwarm 三个主动技能在这一关同时解锁**
2. 怪物血量环比 **×2.08** 陡增

结果：同一套装备连打 3 次全部失败（每次 56–61 秒、20–27 杀、带 1–2 次死亡），
需要把 `Damage` 从 33 提到 **88（×2.7）** 才过关。

> **新技能刚给、玩家还没学会用，难度就陡增** ——
> 这是本作最明显的一处节奏失误。正确做法应该是：
> 解锁爆发关配一个**平缓的难度曲线**，让玩家有余裕试新玩具。

### 问题二：Lv.16 —— 属性需求断层

Lv.16 的怪物血量只需要 Lv.15 的 **×1.53**（16,930 → 24,208），
但**角色属性需求跳了 ×10.6**（154 → 2734）。

> 血量只涨 1.5 倍，属性却要涨 10 倍 —— 说明这里存在一个
> **装备/乘区门槛**，而不是血量墙。存档里 `ChanceForDoubleDamage`、
> `CriticalMultiplier` 正是在这附近开始堆起来的。
> 玩家必须在这一关完成「从主属性流切换到乘区流」的转型，但游戏没有提示。

### 问题三：Lv.8 – Lv.28 共 20 关零死亡

整段测试 25 次死亡全部分布在 Lv.2/3/4/6/7 和 Lv.29，
**中间 20 关一次死亡都没有**。

原因：一旦乘区堆起来，敌人就再也打不死玩家了 ——
`Health` 从 15 涨到 3052、`EnemyDamageMultiplier` 降到 0.8、
外加 `HealthRestorePercentOnKill`（击杀回血 8.4%）和
`ChanceEnemyHitHeals`（被打回血 10%）。

> **20 关没有任何死亡威胁 = 中期 20 关失去紧张感。**
> 生存属性给得太慷慨，是幸存者类常见的失衡。

### 附：玩家卡关时的真实行为

11 个 session 的结构是 **「2 段 20 分钟长推进 + 若干 1 分钟短重试」**，
而**每一个 1 分钟以内的短 session 都精确对应一堵墙**
（Lv.7 连开 3 次、Lv.16 连开 3 次）。

> 遇到墙的玩家行为 = **退出 → 立刻重开 → 再试**。
> 设计上要让「重开一次」的代价足够低。

---

## 七、死亡与失败

- `TotalDeaths_FullGame` 终值 **25**、`TotalMonstersKilled_FullGame` **5072**
- 死亡分布：Lv.2 (4) / Lv.3 (4) / Lv.4 (2) / Lv.6 (1) / **Lv.7 (5)** /
  **Lv.29 (9)** / 其余 0
- 6 次 `INCOMPLETE` 全部是**中途放弃重开**，不是死亡导致的
- `DeathBlowImmunityDuration`（致命一击免疫）是关键的容错属性

---

## 八、成长系统全景

**8 层系统，按关卡依次解锁**：

| 系统 | 解锁关卡 | 内容 |
|---|---|---|
| Tree 天赋树 | Lv2 | 168 节点（等级上限 1/2/3/100 不等）|
| Jobs 职业 | Lv3 | 5 职业 × 3 技能 |
| Crafting 制作 | Lv5 | 装备制作 + 强化 |
| Mining 采矿 | Lv8 | 4 种矿 + 自动化镐 |
| Shaping 塑形 | Lv8 | 符文镶嵌改造武器 |
| Mastery 精通 | Lv9 | 9 个精通 + 觉醒 |
| Star 星魂 | Lv17 | 星魂 Perk |

**游戏用 `WasCurrencyShownBefore`（12 项）和 `IsJustUnlocked*`
（系统 / 稀有度 / 职业各一套）来驱动「新系统解锁」的教学提示**，
是个很省事的引导方案：解锁状态本身就是存档字段。

### 8.0 核心结构：四条「10 级顺序解锁奖励链」

这是本作成长系统最值得学的骨架。**制作 / 采矿 / 塑形 / 精通**这四个系统，
每一个都有一条**恰好 10 级、顺序解锁**的奖励链（来自四个对应的枚举）：

**CraftingUnlockType（制作）**
```
1 BowCrafting        解锁制作弓
2 ArmorCrafting      解锁制作护甲
3 UnlockImprove      解锁强化
4 NonNormalRarity    解锁非普通稀有度
5 StatValuesBonus    词条数值加成
6 RerollButton       解锁重铸按钮
7 ForgingBonus       锻造加成
8 CraftingLuckBonus  制作幸运加成
9 RarityFloorRare    稀有度保底（稀有）
10 CorruptButton     解锁腐蚀按钮
```

**MiningRewardType（采矿）**
```
1 UnlockMiningSite              解锁矿场
2 UnlockMiningPowers            解锁采矿能力
3 UnlockCopper                  解锁铜
4 IncreaseMaxSkillPowers        提升技能强度上限
5 BonusRockPerRareOre           每块稀有矿额外给石头
6 UnlockSilver                  解锁银
7 ChanceToMineGems              挖到宝石的概率
8 UnlockGold                    解锁金
9 IncreaseSkillPowerMaxLevel    提升技能强度最高等级
10 ChanceToDropAdditionalOre    额外掉矿概率
```

**ShapingRewardType（塑形）**
```
1 UnlockWeapons            解锁武器
2 UnlockSockets            解锁插槽
3 UnlockCaster             解锁法系武器
4 UnlockSlot2              解锁第 2 槽位
5 UnlockSocket2            解锁第 2 插槽
6 SecondImplicit           第二条固有词缀
7 RunesForEquippedOnly     仅装备中的武器可用符文
8 UnlockBuffs              解锁增益类
9 UnlockSocket3            解锁第 3 插槽
10 UnlockSlot3             解锁第 3 槽位
```

**MasteryRewardType（精通）**
```
1-9  UnlockMastery1 … UnlockMastery9   依次解锁 9 个精通
10   UnlockAwakening                    解锁觉醒
```

> **这四条链是整个游戏的「中期内容骨架」。**
> 每一条都是「花资源 → 按固定顺序买下一级 → 解锁一个新功能」，
> 而不是「买数值」。这比纯数值成长更有节奏感，
> 也天然解决了「中期没东西可解锁」的问题 ——
> 四条链串行推进，玩家永远有下一个目标。
>
> 每级都同时包含**功能解锁**（新按钮、新槽位、新矿种）和
> **数值加成**（幸运、保底、额外产出），两者交替出现，避免连续几级只有数值。

### 8.1 天赋树（Tree）

整棵树已完整提取，全表见 **`TREE.md`**（原始数据 `_analysis/so/Tree_full.json`）。

- **168 个节点，182 条连线**，唯一根节点 `Node 1_55cde9fa`
- **等级上限不统一**：上限 1 的 63 个、上限 2 的 27 个、上限 3 的 75 个
  （普通节点全点满 342 点）
- 另有 **3 个终局节点上限 100**，每级 100e9：

  | 节点 | 效果 | 每级 | 每级花费 |
  |---|---|---|---|
  | `Node 233` | `Multiplicative_Damage` | 10*x | 100e9 |
  | `Node 234` | `Multiplicative_Health` | 10*x | 100e9 |
  | `Node 211` | `Additive_GoldGained` | 25*x | 60e9 |

  这是**树的数值水槽** —— 前面 165 个节点都在给 `Flat_`/`Additive_`，
  只有这三个给**乘区**，而且明码标价到天价。
- 节点效果共 **107 种**，挂载最多的是 `Flat_Damage` / `Flat_Health`（各 7 个节点）

**节点的解锁规则**（`NodeUnlockBehavior` 枚举）：

```
StartUnlocked        开局就可点
AlwaysUnlockable     无条件可点
RequiresConnection   必须贴着已点亮的节点   ← 实测 167 个节点都是这个
```

- 全树只有**根节点**是 `AlwaysUnlockable`，其余 167 个都是 `RequiresConnection`
- `RequiredMonsterLevel` **全部是 -1** —— 树不按关卡卡点，
  进度只由「连线 + 花费」两个变量控制
- 连线是**双向存储**的（每条边在两端各存一份），所以树在拓扑上是一张
  **无向图**，没有父子方向 —— `RequiresConnection` 的语义是
  「贴着已点亮区域」而不是「必须有前置」

未满足条件时节点怎么显示由 `InaccessibleNodeDisplayMode` 控制
（`Hide` 隐藏 / `Show` 显示但灰掉）。

实测投入（各关卡存档的快照）：

| 关卡 | 已点节点 | 累计点数 |
|---|---|---|
| Lv2 | 11 | 11 |
| Lv3 | 21 | 27 |
| Lv5 | 32 | 52 |
| Lv8 | 78 | 143 |
| Lv10 | 102 | 193 |
| Lv17 | 127 | 220 |
| Lv30 | 157 | 311 |

> **数据口径提醒**：这批存档（`zad_balance_seed362859615_LvN.su`）是平衡性
> 测试工具的产物 —— 同一套 build 被放到不同 `MonstersLevel` 上反复跑。
> 例如 Lv9 – Lv16 八份存档的 `Damage` 全部是 154、天赋点全是 193，
> 属性完全没变。所以**上表只能读作「若干快照」，不能读作平滑成长曲线**；
> 真实曲线要结合日志侧的 DPS 需求看。

> **Lv8 是一次爆发**：节点从 48 → 78，点数从 81 → 143。
> 因为 Lv8 同时解锁了采矿 + 塑形 + 三档矿 + 三个 Job，
> 是全游戏最密集的系统开放点。

### 8.2 精通（Mastery）

- **9 个精通**（`Mastery0` ~ `Mastery8`），各有名字（`MasteryN_Name`）
- 每个精通有**等级** + **觉醒位（Awakened）**
- 实测 Lv30：等级 27 / 65 / 47 / 13 / 8 / 0 / 0 / 5 / 15，觉醒 4 个
- 还有 **Pinnacle 巅峰层**：`PinnacleExtraCharges` / `PinnacleAwakenExtraCharges`

> **口径修正**：从存档看这些数字（最大 65）容易以为精通上限很低，
> 但内容表显示**其中 6 个精通的满级是 100 级**，
> 只有 3 个（#2 / #5 / #8）是 10 级。
> 升级花费是一条 20 项的数组，之后按公式外推。
> **完整数值见附录 A.3。**

相关属性：`MasteryMainStatBonus`、`MasteryAwakenStatBonus`、
`MasteryMaxLevelBonus`、`DamageMultiplierPerMasteryLevel`、
`HealthMultiplierPerMasteryLevel`、`GoldGainedMultiplierPerUnlockedMastery`

> 设计上「精通」是**每装备/每技能各有一条独立等级线**，
> 觉醒是第二条投入线（类似 Diablo 的巅峰等级）。

### 8.3 采矿（Mining）

- 4 种矿：Rock / Copper / Silver / Gold（Lv2 / Lv8 / Lv8 / Lv8 解锁）
- 采矿有**独立的小玩法**：`MiningClicksPerOreReduction`（每次少敲几下）、
  `MiningChanceToDropAdditionalOre`（额外掉矿）
- **自动化**：`DoubleMiningPickaxes`、`NumberOfAutoPickaxes`、`AutoPickaxeSpeed`
- 产出 4 种矿石货币，是制作系统的原料

### 8.4 塑形（Shaping）

- `ShapingSlots`：2 个槽位，每槽是「武器 + 等级 + 镶嵌的符文」
- 符文（Rune）有 **Implicits（固有词缀，绑定武器类型）**
  和 **Explicits（随机词缀，通用池）** 两层（`RuneStatKind` 枚举证实）
- 另有「卷轴（Scroll）」类道具
- 相关属性：`ShapingCopyFirstWeapon`（复制第一把武器）、
  `SecondSlotRuneBonus`、`ShapingAttackDamageBonus`、
  `ShapingBuffStrengthBonus`、`ShapingCooldownSpeed`

**武器类型**（`WeaponType`，6 种）与**类别**（`WeaponCategory`，3 种）：

| 武器 | 类别 |
|---|---|
| Sword 剑 / Hammer 锤 / Shield 盾 | Melee 近战 |
| Lightning 雷 / Fire 火 | Caster 法系 |
| Banner 旗 | Buff 增益 |

> 这正是存档里见到的 `Sword_*`、`Fire_*`、`Banner_*` 词缀前缀的来源
> （实测出现的 `WeaponType` 是 0=Sword、3=Fire、5=Banner，与枚举吻合）。
> **法师类武器（Lightning / Fire）要等塑形第 3 级 `UnlockCaster` 才解锁**，
> 增益类（Banner）要等第 8 级 `UnlockBuffs`。

符文的另外两个维度：
- `RuneStatTarget`：`Attack` 攻击 / `Buff` 增益 / `All` 全部
- `RuneSlotKind`：`Inventory` 在背包 / `Socket` 已镶嵌
- 塑形武器自身有 `BuffPhase`（`Cooldown` / `Active`）——
  说明增益类武器是**周期性触发**的

### 8.5 制作（Crafting）

- 产出两类装备：**弓（Bow）** 与 **护甲（Armor）**（`ItemType` 枚举）
- 制作等级实测到 10 级（`CraftingLevel`），累计制作 14 件
- 三种改造手段：**强化（会失败）**、**重铸（Reroll）**、**腐蚀（Corrupt）**
- 词条有**作用目标**（`ItemStatTarget`）：`Both` 两者 / `Bow` 只弓 / `Armor` 只甲
- 相关属性：`CraftingLuck`（实测堆到 6.21）、`CraftCostReduction`、
  `ItemStatValuesMultiplier`、`BaseMax/MinValueMultiplier`、
  `ItemImprovment_StartingValue / DecreasePerImprovement / MinimumValue`、
  `CorruptExtraStats`、`CraftingImproveNeverStops`、`CraftingRarityFloorEpic`

> `ItemImprovment_StartingValue` + `DecreasePerImprovement` + `MinimumValue`
> 三个属性构成一条**递减的成功率曲线** —— 强化越多次成功率越低，
> 但有个下限保底。这是很标准的装备强化模型。

物品所在位置由 `ItemHome` 标识：`Inventory` / `Equipped` / `Shop`。

**锻造常量**（DLL 实测值，可直接作为调参起点）：

```
词条数值加成档   +25%      （解锁链第 5 级给）
幸运加成档       +500%
首次锻造产出     3 件
传说保底等级     8         （第 8 级锻造必出传说）
```

**卷轴系统（8 种）** —— 一次性消耗品，作用于「下一次锻造 / 下一次造符」，
可拖到锻造台激活：

| 物品卷（作用于装备） | 符文卷（作用于符文） |
|---|---|
| 精炼 Refinement | 铭刻 Inscription |
| 回火 Tempering | 增幅 Amplification |
| 精通 Mastery | 升格 Ascension |
| 完美 Perfection | 溢流 Overflow |

```
符文卷固有词缀数倍率  ×1.2
物品卷词条数值倍率    ×1.5
物品卷强化成功率倍率  ×1.3
卷轴强制稀有度        传说
```

> 卷轴解决了一个典型的刷取游戏问题：**「攒了一堆材料但不想现在用」**。
> 它让玩家可以把一次锻造的品质**留到关键时刻拉高**，
> 而不是被随机数支配。

### 8.6 星魂（Star）

- Lv17 才解锁，是最深的系统
- `StarPerksPurchased`（实测买到 `Bat1`、`Bat2`）、`StarPerksLastResetLevel`
- UI 上是两个 Perk 按钮（`FirstPerkButton` / `SecondPerkButton`）
- 可**重置**（`StarPerksLastResetLevel`）

---

## 九、装备与词缀

### 9.1 装备槽

`Bow`（弓）、`Armor`（护甲），另有 `ItemType = 3` 的材料/符文类。

### 9.2 物品数据结构

```
BaseLevel / BaseValue / MinValue / MaxValue     基础值与浮动区间
ItemRarity                                      稀有度 0-3
Improvements / ImprovementFailed                强化次数 / 是否失败过
ImprovementChanceExemption                      强化保底次数
DoubleImproveChance                             双倍强化概率
ExtraStatsFromScroll / ScrollStatValuesMultiplier  卷轴加词条
CorruptAddedStats / IsCorrupted                 腐蚀改造
```

→ 三套改造机制：**强化（会失败）**、**腐蚀（额外词条但有代价）**、**卷轴（加词条）**。

### 9.3 稀有度

`Normal(0) / Rare(1) / Epic(2) / Legendary(3)`，
`HighestRarityUnlocked` 记录已解锁上限，
`CraftingRarityFloorEpic` 是「制作保底史诗」的天赋。

### 9.4 词缀池

词缀分两个来源。完整的 37 条词缀表是从 DLL 的 `RuneStatNames` 常量还原的
（存档里只能看到玩家恰好刷到的那部分）。

**Implicits —— 绑定武器类型，每种武器恰好 4 条**（共 24 条）

| 武器 | 固有词缀 |
|---|---|
| Sword 剑 | 双斩概率 / 连击伤害 / 顺劈伤害 / 首击伤害 |
| **Hammer 锤** | **震荡半径 / 每命中一个敌人增加伤害 / 余震伤害 / 碎裂伤害** |
| Lightning 闪电 | 额外连锁 / 分叉概率 / 每段连锁伤害 / 首目标伤害 |
| Fire 火 | 双落概率 / 陨击弹幕概率 / 精英伤害 / 处决伤害 |
| Shield 盾 | 主动回复 / 到期治疗 / 敌人攻速削减 / 武器伤害光环 |
| Banner 旗 | 攻速加成 / 武器急速 / 三倍伤害概率 / 弹匣回填概率 |

**Explicits —— 通用随机池**（13 条）

```
攻击伤害 / 攻击冷却速度 / 双重伤害概率 / 重复攻击概率
第五击伤害 / 击杀获得金币 / 增益强度 / 增益时长
增益冷却速度 / 增益击杀延长 / 双重强度概率 / 双重时长概率
重置冷却概率
```

> **注意 `Hammer` 这一组的设计**：`震荡半径` + `每命中一个敌人增加伤害` +
> `余震伤害` + `碎裂伤害` —— 四条全部是「砸下去」的物理语言，
> 且「每命中一个敌人增加伤害」天然鼓励往人堆里砸。
> **一个武器词缀组能做到「玩法自解释」，是很高的完成度。**
> 另外注意：`WeaponType` 枚举里 `Hammer=1` 这个槽位
> **在全部 18 份存档里从未出现过** —— 说明它是内容储备而非已实装。

实测「稀有度 → 词缀数」（符文样本）：

| 稀有度 | Implicits | Explicits |
|---|---|---|
| Epic (2) | 2 | 2 |
| Legendary (3) | 2 | 3 |

> 设计要点：**基础武器决定固有词缀（Implicits），随机性只加在 Explicits 上**。
> 这样既保证「火系武器就该有火系特性」，又保留了刷取动力。

---

## 十、经济系统

**12 种货币**，对应 12 条不同的获取路线：

| 货币 | 来源 |
|---|---|
| Gold | 通用，打怪掉落 |
| Claw / Archer / Warrior / Mage / Bat | 5 个职业分支，打对应职业的怪掉 |
| Portal | 传送门关卡 |
| Guardian | 守卫 Boss |
| MiningRock / Copper / Silver / Gold | 采矿系统 |

`Currencies` 枚举的取值是 **1–12**（0 空缺），顺序为
Gold / Claw / Archer / Portal / Warrior / Mage / Bat /
MiningRock / Copper / Silver / Gold / Guardian。

每种货币都有 `*CurrencyChanceDrop` 属性可以提升掉率，
外加 `GuaranteeMonsterCurrencyDrop`（保底掉落）。

**掉落物类型**（`LootType` 枚举）把货币和道具统一编号：

```
0-11    12 种货币
100     HealthPotion 血瓶
200     Item         装备
201     Rune         符文
```

> 用**分层编号**（货币 0x、消耗品 100x、道具 200x）而不是连续编号，
> 是为了给未来留插入空间 —— 加新货币不用改已有存档的数值。

### 10.1 宝箱、宝珠与金色精英

**宝箱有 5 个品类**（`ChestType` 枚举）：
`Currency` 货币箱 / `Item` 装备箱 / `Rune` 符文箱 / `Scroll` 卷轴箱 / `Legendary` 传说箱。

每个品类有**独立的解锁条件与内容池** ——
`UnlockItemChests`、`UnlockRuneChests`、`UnlockScrollChests`、
`UnlockLegendaryChests` 是四个分开的解锁属性，
说明玩家要**逐个解锁宝箱品类**，而不是一次性全开。

相关属性：
`ChanceToSpawnChest`、`ChestCoins_StandardChest / CurrencyChest / LegendaryChest`、
`ChestCoinMultiplier_*`、`ChestContentCount_Item / Rune / Scroll / Legendary`、
`ChestContentRarity`、`ChestContentImprovements`、`ChestExtraContent`、
`ChestExtraCoins`、`ChestCoinValueBonus`、`ChestRareTypeWeightBonus`、
`ChestHealPercent`、`LastPackInRunAlwaysContainChest`（每关最后一批怪必掉箱）

**宝珠（Orb）** —— 限时增益道具：
`ChanceToSpawnOrb`、`OrbDuration`、`ExtraOrbsPerSpawn`、
`PermanentOrbs`（永久化）、`ChanceToSummonOrbOnKill`

**金色精英（GoldenEnemy）**：
`ChanceForGoldenEnemy`、`GoldenRewardMultiplier`、
`FirstPacksAlwaysContainGolden`（开局几批怪必出金怪）

### 10.2 经济曲线是「收益递增」的

实测金币的环比增速 **×2.2 ~ ×2.5 / 关**，**比怪物血量的 ×1.66/关 还快**：

| 关卡 | 本关金币 | 金币 / 怪物血量 |
|---|---|---|
| 1 | 207 | 0.36 |
| 3 | 2,492 | 0.25 |
| 5 | 27,100 | 0.59 |
| 9 | 1,550,000 | 1.77 |
| 12 | 14,500,000 | 6.25 |
| 15 | 87,600,000 | **15.1** |
| 16 | 331,000,000 | 17.3 |
| 29 | 200,000,000,000 | – |

**「金币/血量」比从 0.36 涨到 15.1（×42）** —— 越到后期越不缺钱。

> 这个设计是有意的还是失控的，取决于意图：
> 如果目标是「让玩家的购买力随进度宽松」，那它达到了；
> 但如果目标是「让玩家始终有金钱压力」，那后期经济是完全失控的。
> 从前 5 关比值在 0.25–0.59 徘徊、之后一路上扬来看，
> 更像是**没有专门做过经济调控**。

---

## 十一、商业化与周边

- **买断制 + DLC**：`isBoughtDLC`、`DLCManager`、`DLCMenu`、`ClickedOnPurchaseDLC`
- **Demo 版**：`DemoWindow_DemoComplete`、`DemoWindow_QuitGame`、
  `WishlistFull_Demo_Text` —— Demo 通关后引导加愿望单
- **愿望单引导**：`WishlistButton`、`WishlistOtherGames`、`isGainedWishlistReward`
  （加愿望单给游戏内奖励）
- **社区**：`DiscordButton`、`SteamButton`、`ClickedOnFollowSteam`
- **成就**：`AchievementsManager`，共 **9 个 Steam 成就**：

```
RecruitArcher              首次驯服
UnlockJobs                 解锁职业
UnlockCrafting             解锁制作
UnlockMining               解锁采矿
UnlockShaping              解锁塑形
UnlockMastery              解锁精通
UnlockStar                 解锁星魂
GainLegendaryBowArmor      获得传说装备
ReachLevel40               通关全部 40 关   ← 关卡上限的硬证据
```

> **成就设计有一个值得注意的点**：9 个成就里 **7 个是系统解锁成就**。
> 成就系统承担了一部分**新手引导**职能 ——
> 解锁一个系统弹一个成就，既是奖励也是「你进入新阶段了」的仪式感。
> 而不是把成就塞满「击杀 10000 只怪」这类后期挑战。

### 11.1 商店链接与交叉推广（从字符串堆还原）

游戏内置了 5 个带 UTM 追踪的商店链接，分为两组：

**本作自己的链接**（AppID **4412000**）—— 按触发场景分别埋点：

```
.../app/4412000/?utm_source=Game&utm_medium=Reward&utm_campaign=CGFull       加愿望单奖励
.../app/4412000/?utm_source=Game&utm_medium=RewardTaken&utm_campaign=CGFull  已领奖励
.../app/4412000/?utm_source=Game&utm_medium=Settings&utm_campaign=CGFull     设置页
.../app/4412000/?utm_source=Game&utm_medium=Quit&utm_campaign=CGFull         退出时
```

**交叉推广另外三款自家游戏**（`WishlistOtherGames` 功能）：

```
.../app/4780870/?utm_source=Zad&utm_medium=Zad&utm_campaign=Zad
.../app/5057800/?utm_source=Zad&utm_medium=Zad&utm_campaign=Zad
.../app/5167550/?utm_source=Zad&utm_medium=Zad&utm_campaign=Zad
.../developer/SamhariaStudios                                                开发商主页
```

**另外还发现一个手机游戏**：

```
https://play.google.com/store/apps/details?id=com.SamhariaStudios.Maktala
```

配套代码里有 `InAppReviewManager`（应用内评分请求，含「不支持时回退到 URL」的兜底）——
说明 **Zad Archery 与手游《Maktala》共享同一套代码库**，
本地化、商店引导、评分请求这些模块是复用的。

> **值得学的商业化设计**：
> 1. 每个商店链接都带 **UTM 埋点**，且 `utm_source` 区分触发场景
>    （Game / Zad / Reward / Quit）—— 能直接看出哪个入口的转化最好。
> 2. 用「加愿望单给游戏内奖励」把**外部行为**（加愿望单）
>    和**内部奖励**绑起来，是很有效的转化手段。
> 3. `WishlistOtherGames` 把玩家导向自家另外三款游戏 ——
>    买断制小体量游戏靠**互相导量**摊薄获客成本。

---

## 十二、辅助与手感系统

| 系统 | 字段 / 类 |
|---|---|
| 伤害飘字 | `isDamageFloatingShown`、`FloatingNumbersAmount`、`FloatingNumbersManager` |
| 屏幕震动 | `ScreenShake` |
| 特效强度 | `EffectsAmount` |
| 音频 | `SoundVolume_Effects / UI / Music`、`IsSoundsOn` |
| 教程 | `TutorialManager`、`ArrowTutorial`、`ClickTutorial`、`CraftingActionsTutorial` |
| 统计面板 | `StatsViewManager` |
| 本地化 | `Languages` 枚举 14 种、`LanguagesMenu`（`ChoosenLanguage=5` 即简体中文） |
| 箭矢皮肤 | `ArrowSkinUnlocked` / `ArrowSkinEnabled`（12 个） |
| 分辨率 | `ResolutionChoice`、`IsFullScreen` |

### 12.1 属性面板的组织方式（可直接照搬的 UI 结构）

游戏的属性面板（`StatsViewManager`）把 273 个属性里**对玩家可见的 48 个**
分成了 **5 个分区**：

| 分区 | 包含属性 |
|---|---|
| **Offense 输出** | 伤害 / 暴击率 / 暴击伤害 / 双重伤害概率 / 三重伤害概率 / 攻速 / 攻击距离 |
| **Survival 生存** | 生命 / 生命回复 / 减伤 / 闪避 / 血瓶概率 / 移速 |
| **Loot & Economy 掉落与经济** | 金币获取 / 每杀金币数 / 额外金币概率 / 金怪概率 / 宝箱概率 / 宝珠概率 / 永久宝珠 / 怪物掉落概率 / 传送门召唤时间 |
| **Skills 技能** | 每次点击箭数 / 弹匣容量 / 每箭命中敌人数 / 技能触发概率 / 箭雨 / 技能伤害 / 技能冷却速度 |
| **Companions 同伴** | 同伴伤害 / 生命 / 攻击概率 / 打击半径 / 吸血 / 处决阈值 / 回复 / 闪避 / 减速 / 暴击触发俯冲 |

> **注意这个面板里的两条设计**：
> 1. **273 个属性里只暴露 48 个给玩家看** —— 其余是内部计算量。
>    不把 `EnemyHealthMultiplier` 这种「系统内部量」暴露给玩家，
>    是避免认知过载的关键。
> 2. **分区是按玩家的心理模型切的**（输出/生存/掉落/技能/同伴），
>    不是按代码的数据结构切的。这 5 个分区恰好对应玩家的 5 个提问：
>    「我打得疼吗」「我扛得住吗」「我掉得多吗」「我技能强吗」「我队友行吗」。
> 3. 未解锁/未获得的属性用 `? ? ?` 占位（灰色），是很好的「留白式引导」。

---

**39 个 Manager 类**（`RunManager`、`PlayerManager`、`EnemiesManager`、
`ChestsManager`、`ShapingUIManager`…）说明代码结构是「一个系统一个 Manager + 一个 UI Manager」，
模块划分很干净。

---

## 十三、对自研项目的可借鉴点

### 值得抄的

1. **用「公式字符串」驱动全部数值**（见 4.4）。这是最重要的一条：
   把成长曲线和升级花费写成 ScriptableObject 里的
   `valueEquation` / `costEquation`，策划调数值不用改代码。
   本作能承载 273 属性 / 168 天赋节点 / 15 技能还调得动，靠的就是这个。

2. **属性四桶模型**（Flat / Additive / Multiplicative / Total）值得直接照搬。
   加法和乘法分离，策划能精确控制边际收益，且所有属性走同一套管线，
   加新属性不需要改代码。

2. **用属性系统承载「解锁开关」**（`UnlockCrafting = 100`）。
   系统解锁、功能开关、UI 显隐全部复用同一套属性容器，
   存档序列化只写一份。省掉了大量 if-else。

3. **给每个系统设计一条「10 级顺序解锁奖励链」**（见 8.0）。
   制作 / 采矿 / 塑形 / 精通四条链，每级都同时包含
   **功能解锁**（新按钮、新槽位、新矿种）和**数值加成**，交替出现。
   这比纯数值成长有节奏感，也天然解决了「中期没东西可解锁」的问题。

4. **难度与玩家强度解耦**。没有角色经验等级，
   关卡难度由 `MonstersLevel` 独立驱动，玩家成长只来自装备与天赋。
   这样「刷装备」的收益永远清晰，且不会出现等级压制。

5. **成长摊在多个独立乘区上**（见 4.3）。本作后期 242 倍的血量跨度，
   是靠双重伤害 95.5% + 暴击 240% + 技能段数 ×9 + 技能乘区 ×2.6 +
   冷却速度 + 攻速这 **6–8 个彼此独立的乘区**共同撑起来的，
   而不是靠一个主属性。这样任何一个乘区单独失衡都不会毁掉全局。

6. **输出手段要有「机制交接」**。开局鼠标占 72.9%，
   终局降到 0.5%，由主动技能接管 83.9%，而三条输出腿
   全程都保持 15% 以上的占比 —— 没有任何一个系统在后期被浪费。

7. **用 5 个「原型」复用全部内容**。敌人、守卫、盟友、货币、
   职业全部围绕 Claw / Warrior / Archer / Mage / Bat 这 5 个原型展开，
   一套美术与设定资产同时服务五个系统。

8. **词缀双轨制**：Implicits 绑定基础武器类型（保证主题一致性），
   Explicits 走通用随机池（提供刷取动力）。

9. **鼠标作为主输出手段**，让 Survivor-like 有了操作深度，
   同时用「弹匣 + 回填」限制无脑连点。

10. **关内结束条件用「击杀配额」而非计时器**。玩家变强后关卡自然变快，
    不需要额外调参就能让高手打得更爽。

11. **商店链接带 UTM 埋点**，用 `utm_source` 区分触发场景
    （Game / Reward / Quit），能直接看出哪个入口转化最好（见 11.1）。

### 要避开的坑（本作实测踩到的）

1. **解锁爆发不要撞上难度陡坡**。Lv.7 同时放出 3 个主动技能 +
   血量环比 ×2.08，直接导致 3 连败（见 6.1）。
   新系统要配平缓曲线，给玩家试错空间。

2. **不要让「主属性 → 乘区」的转型变成隐形门槛**。Lv.16 血量只涨 ×1.53，
   但属性需求跳了 ×10.6（见 6.2）—— 玩家必须自己悟出该转型了，
   游戏没有任何提示。

3. **生存属性不要给得太慷慨**。Lv.8–Lv.28 共 20 关零死亡（见 6.3），
   `Health` 涨了 200 倍、敌人伤害反而降到 0.8 倍。
   中期失去威胁感是幸存者类最常见的失衡。

4. **系统做了就要给足数值权重**。驯服系统设计完整，
   但实际伤害占比 < 0.6%（见 3.3）—— 玩家感受不到，
   等于白做。要么加权，要么砍掉。

5. **经济曲线要主动调控**。金币环比 ×2.2~2.5，快过怪物血量的 ×1.66，
   导致「金币/血量」比在后期涨了 42 倍（见 10.1）。
   不调控的话后期经济必然失控。

---

## 附录 A：内容数值全表

> **这一章的数据来源与前文不同。**
> 前面所有章节的数据来自「解密存档 + DLL 元数据」。
> 本章的数据来自 **Unity 资源文件里的 ScriptableObject 实例** ——
> 也就是游戏真正的**内容配置表**。
>
> 获取方式：release 构建的 Unity 会**剥离序列化文件里的类型树**，
> MonoBehaviour 只剩裸字节。但本作是 **Mono 构建（非 IL2CPP）**，
> `Assembly-CSharp.dll` 里保留着完整的类型元数据 ——
> 用 `UnityPy` 的 `TypeTreeGenerator` 从 DLL **现场生成类型树**，
> 就能把 5684 个 MonoBehaviour 全部解析出来。
> 脚本见 `_analysis/so_extract3.py`、`tree_full.py`、`tree_assemble.py`、`tree_report.py`。

### A.1 五个 Job 的解锁花费

| Job | 主题 | 解锁花费 | 相对倍率 |
|---|---|---|---|
| Job0 | 弓箭手 | **0** | 开局免费 |
| Job1 | 兽王 | **200** | ×∞ |
| Job2 | 狙击 | **1,500** | ×7.5 |
| Job3 | 元素 | **20,000** | ×13.3 |
| Job4 | 暗影 | **300,000** | ×15 |

> 五个 Job 的解锁成本跨越 **30 万倍**，但相邻之间是
> ×7.5 / ×13.3 / ×15 —— **近似等比**。这是一条标准的
> 「后期职业用货币门槛锁住」的曲线。

### A.2 十五个技能的完整数值

每级花费 / 冷却 / 伤害倍率 / 命中数，全部是 **3 级**（`maxLevel = 3`）：

| 技能 | 所属 | 每级花费 | 冷却（秒） | 伤害倍率 | 命中数 |
|---|---|---|---|---|---|
| `Multishot` | Job0 | 5 / 50 / 100 | 19 / 19 / 17 | 1.8 / 1.9 / 2.0 | 1 / 2 / 2 |
| `BombArrow` | Job0 | 70 / 130 / 160 | 33 / 33 / 33 | 3.3 / 3.4 / 3.5 | 2 / 2 / 3 |
| `RapidFire` | Job0 | 45 / 85 / 110 | 47 / 47 / 45 | — （纯增益） | — |
| `Wolf` | Job1 | 180 / 350 / 800 | 45 / 45 / 45 | 3.0 / 3.3 / 3.5 | 1 / 1 / 2 |
| `Bear` | Job1 | 320 / 700 / 1500 | 45 / 45 / 45 | 2.0 / 2.5 / 3.0 | 1 / 1 / 2 |
| `Falcon` | Job1 | 700 / 1400 / 2800 | 40 / 40 / 40 | 4.5 / 4.7 / 5.0 | 3 / 3 / 4 |
| `SniperScope` | Job2 | 1000 / 2400 / 4700 | 35 / 32 / 30 | 5.5 / 5.7 / 6.0 | 8 / 8 / 9 |
| `PiercingShot` | Job2 | 2500 / 5500 / 11000 | 40 / 38 / 36 | 0.9 / 1.0 / 1.1 | 1 / 2 / 2 |
| `SharpShooter` | Job2 | 5000 / 13000 / 25000 | 45 / 43 / 40 | — （纯增益） | — |
| `FireArea` | Job3 | 12000 / 40000 / 95000 | **0** | 3.2 / 3.3 / 3.5 | 1 / 1 / 1 |
| `LightningStrike` | Job3 | 35000 / 85000 / 135000 | **0** | 7.0 / 7.2 / 7.5 | 4 / 4 / 5 |
| `Blizzard` | Job3 | 85000 / 140000 / 300000 | **0** | 3.0 / 3.2 / 3.5 | 3 / 3 / 4 |
| `BatSwarm` | Job4 | 200000 / 600000 / 1500000 | 55 / 53 / 50 | 3.5 / 3.7 / 4.0 | 3 / 3 / 3 |
| `DarkMatter` | Job4 | 300000 / 900000 / 2000000 | 25 / 23 / 20 | 2.0 / 2.2 / 2.5 | 2 / 2 / 3 |
| `SuperNova` | Job4 | 500000 / 2000000 / 4000000 | 150 / 145 / 140 | 5.0 / 5.5 / 6.0 | 10 / 10 / 10 |

**从这张表能读出四条设计决策**：

1. **技能花费整体跨越 80 万倍**（Multishot 首级 5 → SuperNova 末级 400 万）。
   这是全游戏最陡的一条成本曲线，承担了「推进到后期」的主要货币消耗。
2. **Job3 的三个技能冷却全是 0** —— 它们不是主动技，而是
   **靠概率触发的被动**（`ChanceForFireArea` / `ChanceForLightningStrike` /
   `ChanceForBlizzard`）。冷却 0 是这类技能的标志。
3. **`RapidFire` 和 `SharpShooter` 没有任何伤害倍率** ——
   它们是**纯增益技**（日志实测 RapidFire 施放 120 次、伤害 0）。
   注意这两个都是各 Job 的「第 2 个技能」，
   说明每个 Job 的技能组是**「1 输出 + 1 增益 + 1 强化输出」**的模板。
4. **命中数随等级增长**（1→2、2→3）—— 这是 DPS 成长的主要来源，
   比伤害倍率（通常只涨 10%）重要得多。
   与第 4.3 节的结论一致：**后期成长靠段数，不靠倍率**。

### A.3 九个精通

| # | 最高等级 | 升级花费（前 8 级） | 主属性成长 | 觉醒值 | 巅峰效果 |
|---|---|---|---|---|---|
| 0 | **100** | 5, 10, 20, 35, 55, 80, 120, 170, … | `0.8 + 0.2x` | 1.0 | — |
| 1 | **100** | 10, 30, 50, 80, 120, 170, 220, 300, … | `1.9 + 0.1x` | 10.0 | — |
| 2 | 10 | 10, 20, 40, 70, 100, 130, 180, 200, … | `5x` | 100.0 | — |
| 3 | **100** | 10, 30, 60, 100, 150, 220, 300, 400, … | `15x` | 50.0 | — |
| 4 | **100** | 10, 30, 60, 100, 150, 220, 300, 400, … | `10x` | 1.0 | — |
| 5 | 10 | 50, 70, 100, 200, 300, 500, 1000, 2500 | `5x` | 100.0 | 金色包 |
| 6 | **100** | 10, 30, 60, 100, 150, 220, 300, 400, … | `10x` | 50.0 | — |
| 7 | **100** | 10, 30, 60, 100, 150, 220, 300, 400, … | `25x` | 25.0 | — |
| 8 | 10 | 1000, 2000, 3000 | `5x` | 100.0 | 弓手物品 |

> **两个关键修正**：
> 1. **精通的满级是 100，不是 10。** 我此前从存档里看到
>    `Mastery1 = 65`、`Mastery2 = 47`，以为上限很低；实际
>    **6 个精通的上限是 100 级**，只有 3 个（#2 / #5 / #8）是 10 级。
>    那条 20 项的花费数组就是 1–20 级的开销，之后按公式外推。
> 2. **只有 3 个精通有巅峰效果**（`PinnacleEffect`），
>    且对应 `PinnacleEffectType` 枚举的三种：
>    金色包 / 弓手物品 / 法师卷轴。

### A.4 六种塑形武器

| 武器 | 伤害公式 | 冷却（秒） | 索敌范围 |
|---|---|---|---|
| `Sword` 剑 | `1.7 + 0.076x` | **0.8** | 600 |
| `Hammer` 锤 | `2.0 + 0.092x` | 2.5 | 600 |
| `Lightning` 闪电 | `0.85 + 0.04x` | 2.6 | 600 |
| `Fire` 火 | `2.9 + 0.128x` | 3.2 | 600 |
| `Banner` 旗 | `1 + 0.04x` | 30 | 600 |
| `Shield` 盾 | `1 + 0.1x` | 35 | 600 |

> **注意 `Hammer` 的伤害系数（0.092）是六种武器里第二高的**，
> 仅次于 `Fire`（0.128），但冷却只有 2.5 秒（Fire 是 3.2）。
> 也就是**锤的 DPS 效率是全武器最高的那一档**。
> 对做锤主题的项目来说，这是一个可以直接沿用的数值。

### A.5 十二种敌人 + 五个守卫 + 国王

| 单位 | 类型 | 攻速 | 移速 | 生命倍率 | 伤害倍率 | 远程 | 可驯服 |
|---|---|---|---|---|---|---|---|
| `Claw` | 爪 | 0.30 | 80 | 1.1 | 1.0 | — | **✓** |
| `Warrior` | 战士 | 0.25 | 75 | **3.5** | 1.5 | — | **✓** |
| `Archer` | 弓手 | 0.33 | 85 | 1.5 | 1.5 | ✓ | **✓** |
| `Mage` | 法师 | 0.50 | 85 | 1.0 | **2.2** | ✓ | **✓** |
| `Bat` | 蝙蝠 | 0.50 | 85 | 3.0 | 1.5 | — | **✓** |
| `RunPortal` | 传送门 | — | — | 25 | — | — | — |
| `GuardianClaw` | 守卫·爪 | 0.95 | 100 | **25** | 1.0 | — | — |
| `GuardianArcher` | 守卫·弓 | 0.95 | 100 | **30** | 1.1 | ✓ | — |
| `GuardianWarrior` | 守卫·战 | 1.00 | 100 | **35** | 1.2 | — | — |
| `GuardianMage` | 守卫·法 | 0.95 | 100 | **45** | 1.1 | ✓ | — |
| `GuardianBat` | 守卫·蝠 | 1.20 | 100 | **50** | 1.25 | — | — |
| `King` | 国王 | 1.00 | 0 | **200** | 0.7 | — | — |

**四条可读的设计规律**：

1. **五个基础兵种全部可驯服**（`IsTameable = 1`），
   守卫和国王不可驯服 —— 驯服系统只对杂兵开放。
2. **每个兵种有明确的角色定位**：
   `Mage` 血最薄（1.0）但伤害最高（2.2）→ 脆皮高输出；
   `Warrior` 血最厚（3.5）→ 肉盾；
   `Claw` 最弱（1.1 / 1.0）→ 杂兵填充。
3. **守卫的生命倍率按 25/30/35/45/50 递增**，
   与 A.1 的 Job 解锁顺序**不完全对应** —— 说明守卫的难度排序
   和职业解锁排序是两套独立的节奏。
4. **国王 200 倍生命、0.7 倍伤害** —— 典型的设计：
   **最终 BOSS 是持久战而非爆发战**，伤害降低是为了让玩家能站住。

### A.6 符文词缀的完整数值区间

每条词缀都带 `minValue` / `maxValue`（随机区间）和掉落概率：

**剑（Sword）**

| 词缀 | 区间 |
|---|---|
| `Sword_FirstHitDamage` 首击伤害 | **70 – 100** |
| `Sword_TwinSlashChance` 双斩概率 | 10 – 35 |
| `Sword_ComboDamage` 连击伤害 | 5 – 13 |
| `Sword_CleaveDamage` 顺劈伤害 | 3 – 7 |

**锤（Hammer）**

| 词缀 | 区间 |
|---|---|
| `Hammer_AftershockDamage` 余震伤害 | **15 – 35** |
| `Hammer_AoERadius` 震荡半径 | 10 – 25 |
| `Hammer_ShatterDamage` 碎裂伤害 | 8 – 20 |
| `Hammer_DamagePerEnemyHit` 每命中一个敌人增加伤害 | 4 – 10 |

**闪电（Lightning）**

| 词缀 | 区间 |
|---|---|
| `Lightning_FirstTargetDamage` 首目标伤害 | 70 – 100 |
| `Lightning_ForkChance` 分叉概率 | 10 – 30 |
| `Lightning_DamagePerChain` 每段连锁伤害 | 10 – 20 |
| `Lightning_ExtraChains` 额外连锁 | 1 – 1（固定） |

**火（Fire）/ 盾（Shield）/ 旗（Banner）**

| 词缀 | 区间 |
|---|---|
| `Fire_ExecuteDamage` 处决伤害 | **50 – 120** |
| `Fire_EliteDamage` 精英伤害 | 15 – 50 |
| `Fire_TwinFallChance` 双落概率 | — |
| `Fire_MeteorBarrageChance` 陨击弹幕概率 | — |
| `Shield_...` 主动回复 / 到期治疗 / 敌人攻速削减 / 武器伤害光环 | — |
| `Banner_...` 攻速加成 / 武器急速 / 三倍伤害概率 / 弹匣回填概率 | — |

> **可读的规律**：
> - **「概率类」词缀区间窄**（双斩 10–35、分叉 10–30），
>   因为概率类数值上限敏感，区间宽会失控
> - **「伤害类」词缀区间宽**（处决 50–120、首击 70–100），
>   提供刷取动力
> - **`Hammer` 的四条词缀全部是伤害类**，没有一条概率类 ——
>   锤的设计语言是**「稳定、可预期、砸下去就有」**，
>   和剑（双斩概率）、闪电（分叉概率）形成鲜明对比

### A.7 天赋树 168 个节点的公式

> **修正**：早期只能对节点原始字节做正则，把 `NodeValueEquation` 和
> `NodeCostEquation` 混在了一起，误读成「单公式 / 双公式」。
> 用类型树正确解析后（`tree_full.py`）确认这是**两个独立字段**：
> **每个节点都有自己的收益公式和花费公式**，不存在「单公式节点」。

**收益公式**（`NodeValueEquation`，x = 节点等级）：

```
5*x  ×16      15*x ×14      1*x  ×13     100  ×13
10*x ×12      25*x ×10      30*x ×9      20*x ×9
2*x  ×7       12*x ×6       1    ×5      8*x  ×4
7*x  ×4       35*x ×4       40*x ×3      -5*x ×3
```

其中 `100`、`1` 这类**常量收益**共 40 个节点 —— 它们不是成长节点，
而是**解锁开关**（给的是布尔属性，如 `Flat_MouseAutoMode`、
`Flat_IsArcherSpawned`、`Flat_UnlockSkills`）。

**花费公式**（`NodeCostEquation`）：从 `1`（30 个引导节点）
一路到 `100e9*x`，跨了 **11 个数量级**。少量节点用了递推式，
如 `400 + 1500*(x-1)`、`175 + 125*(x-1)`。

**收益与花费都是线性/常量，没有指数**：

> **线性而不是指数，是本作天赋树最重要的设计决策。**
> 玩家升一级节点得到固定的 N，成本也是线性的 ——
> 这让「先点哪个节点」变成一个**真正的策略选择**，
> 而不是「反正后期都会点满」。
>
> 对比第五节的关卡曲线（×1.66/关，纯指数）：
> **敌人难度指数增长、玩家天赋线性增长**，
> 中间的差额由装备与乘区填补 —— 这正是第 4.3 节结论的另一面。

**显示名与描述（已解决）**：本地化文本**不在**加密 bundle 里 ——
`LocalizerManager`（`level0`，path_id 9374）的 `JsonDataText` 字段指向
`sharedassets0.assets` 里的 TextAsset **`LocalizationJson`**（588,996 字节，
14 种语言，630 条）。TextAsset 是明文，直接可读。

> 注意 key 的命名**是按属性、不是按节点**：
> `Flat_MouseMagazineSize` → key `MouseMagazineSizeFlat`
> → `#VALUE# 支箭雨箭矢`。树里的 107 种效果属性**全部命中**这个约定。
>
> 所以节点没有独立的「名字」—— 游戏里 tooltip 显示的就是
> **属性名 + 该节点算出来的数值**。`NodeName` 字段（`Node 1`）
> 只是开发期的占位。

**已经拿到的部分**：节点 ID、效果属性、**本地化显示名（14 语言）**、
收益公式、花费公式、等级上限、屏幕坐标、全部连线 ——
全表见 `TREE.md`（每个节点都还原成了 `15 生命值 ／ 40% 攻击速度` 这样）。
节点 ID 与存档里的 `TreeNodeLevels` 键完全对应
（如 `Node 1_55cde9fa`），且 168 个键一个不差。

---

## 附：完整数据索引

全部产物在 `_analysis/` 目录下。

**分析脚本（可重跑）**

| 文件 | 内容 |
|---|---|
| `FINDINGS.md` | 所有原始发现的事实清单 |
| `progress.py` | 解码全部平衡存档 + 输出进度曲线 |
| `unlocks.py` | 系统 / 技能 / 矿种 / 精通解锁时间表 |
| `stats.py` | 273 个属性的清单 + 聚合公式验证 |
| `items.py` | 词缀池、装备、库存结构 |
| `rarity.py` | 稀有度 → 词缀数量映射 |
| `scalars.py` | 存档标量字段随关卡的变化 |
| `curve.py` | 玩家侧属性成长（含口径陷阱说明） |
| `assets.py` | Unity 资源里的属性函数名与 UI 对象名 |
| `parse_logs.py` | 解析 `SkillsLog.txt` / `Logs.txt` |
| `bundle.py` | 手写的 UnityFS bundle 读取器（该 bundle 有加密，未成功） |

**ScriptableObject 内容提取（附录 A 的来源）**

| 文件 | 内容 |
|---|---|
| `so_extract3.py` | **核心脚本** —— 用 `TypeTreeGenerator` 从 DLL 生成类型树，解析全部内容资产 |
| `dump_tree.py` | 解析 `TreeInfo.TreeNodes` 的 168 个 PPtr 引用 |
| `tree_table.py` | 早期版本：正则还原节点 ID 与公式（已被下面两个取代）|
| `tree_full.py` | **完整解析 168 个 TreeNodeInfo**（效果/连线/坐标/上限/花费）|
| `tree_assemble.py` | 解析 NodeStat → StatInfo，拼出效果名 |
| `tree_report.py` | 生成 `TREE.md`（骨架版）|
| `tree_meaning.py` | **用本地化文本还原每个节点的含义**，输出最终 `TREE.md` |
| `numbers_report.py` | 生成 **`NUMBERS.md`**（玩家/怪物/技能/伤害管线全数值）|
| `economy_report.py` | 生成 **`ECONOMY.md`**（12 种货币的来源与去向）|
| `equipment_report.py` | 生成 **`EQUIPMENT.md`**（装备/词缀/强化/腐蚀/塑形）|
| `items_resolve.py` | 解析装备词缀的 `StatInfo` 指针（按各自文件的 externals）|
| `il_player_stats.py` | 从 IL 还原玩家 84 项初始属性 |
| `il_tables.py` | 从 `.cctor` 还原难度表与 174 个常量 |
| `so_extract4.py` | **修正版** ScriptableObject 提取（修 `List<string>` 类型树 bug）|
| `localization.py` | 从 LocalizerManager 取出 `LocalizationJson` |
| `content_report.py` | 汇总成 `so/CONTENT_REPORT.md` |
| `so_probe.py` / `monoscripts.py` / `find_content.py` | 定位过程中的探针脚本 |

**内容资产产出（`_analysis/so/`）**

| 文件 | 内容 |
|---|---|
| `CONTENT_REPORT.md` | **全部内容数值的可读汇总** |
| `JobInfo.json` / `JobSkillInfo.json` | 5 个 Job + 15 个技能 |
| `MasteryInfo.json` | 9 个精通 |
| `EnemyInfo.json` | 12 个敌人 + 5 守卫 + 国王 |
| `RuneStatInfo.json` | 58 条词缀（含数值区间） |
| `ShapingWeaponInfo.json` | 6 种塑形武器 |
| `StatInfo.json` / `ItemStatsInfo.json` | 属性定义 |
| `TreeNode_table.json` | 早期版本：节点 ID 与公式（正则）|
| `Tree_full.json` | **168 个节点的完整记录**（效果/连线/坐标/上限/收益/花费）|
| `TreeInfo.json` | 树的根与 168 个节点引用 |
| `Localization.json` | **630 条 × 14 语言的本地化文本**（明文 TextAsset）|
| `ItemAffixes_resolved.json` | 15 条装备词缀（已解析出属性名）|
| `ItemInfo.json` / `RuneStatInfo.json` / `ShapingWeaponInfo.json` | 装备基底 / 符文词缀 / 塑形武器 |

**日志分析产出（CSV）**

| 文件 | 内容 |
|---|---|
| `01_attempts.csv` | 28 次尝试的原始字段 |
| `02_level_summary.csv` | 逐关聚合（尝试数 / 通关数 / 代表值） |
| `03_skill_rows.csv` | 301 行技能明细 |
| `04_skill_by_level.csv` | 技能 × 关卡透视 |
| `05_unlock_table.csv` | **技能解锁表** |
| `06_buffs.csv` | RapidFire buff 记录 |
| `07_no_damage.csv` | 无伤害关卡记录 |
| `08_runs_deaths.csv` | 死亡 / 击杀 / 货币 |
| `09_sessions.csv` | **11 个会话结构** |
| `10_arrowfall_split.csv` | ArrowFall 伤害来源拆分 |
| `11_growth.csv` / `14_monster_hp_curve.csv` | **成长曲线 + 单怪 HP 修正曲线** |
| `12_save_stats.csv` | 554 条 Lv.2 vs Lv.30 属性对比 |
| `13_design_metrics.csv` | 两份日志 join 后的完整指标表 |
| `15_skill_roster.csv` | 15 个技能：存档等级 vs 日志实证 |

**原始数据**

| 文件 | 内容 |
|---|---|
| `lvN.json` | 各关卡的完整解密存档 |
| `dll_types.txt` / `dll_enums.txt` / `dll_fields.txt` | DLL 元数据：类型 / 枚举 / 字段 |
| `dll_strings.txt` / `dll_literals.txt` / `dll_strings_by_class.txt` | DLL 字符串堆 |

### 数据口径提醒（重要）

1. **这不是自然玩家存档。** 根目录的 `zad_balance_seed362859615_LvN.su`
   是平衡测试工具逐关注入的，12 种货币被人为设成 ~500 亿，
   `HighestRarityUnlocked` 被拉满。**货币数据不可用于分析经济。**
2. **`player Damage` 字段不是等级**，是玩家的 `Damage` 属性总值
   （Lv.30 存档里 `stats.Damage.Total` = 2996，正好等于日志 Lv.29 那行的 2996）。
   它是测试者**手选**的，反映的是「测试者认为该关需要多少属性」——
   本身就是一份难度标定数据。
3. **日志里 `~SkillName` 缩进行是 ArrowFall 的归因子项，不能和顶层行相加**，
   否则会重复计数。
4. **`OVERKILL` 必须按 attempt 单独加权修正**，否则单怪血量会被
   某次异常 run 抬高（例如 Lv.16 会被抬到 5.6 万）。
5. **存档侧的成长曲线不可信**：Lv.9–Lv.16 八份存档是同一套 build
   被放到不同难度上，属性完全没变。真实曲线要用日志侧数据。

### 未能拿到的部分

> 本节原先列了三条「未能拿到」，**已全部解决**，保留原始判断作为纠错记录。

- ~~本地化文本表~~ → **已拿到**。`LocalizerManager.JsonDataText`
  指向 `sharedassets0.assets` 的 TextAsset `LocalizationJson`（明文，588,996 字节，
  630 条 × 14 语言）。之前误以为在加密的 Addressables bundle 里，
  实际 Addressables 只有两个 bundle（`catalog.bin` 2764 字节，全部引用列出），
  里面只有一个字体和材质，**与本地化无关**。
- ~~内容资产在加密 bundle 里~~ → **判断有误**。`EnemyInfo` / `JobInfo` /
  `MasteryInfo` / `ShapingWeaponInfo` / `RuneStatInfo` 都在**未加密**的
  `resources.assets` / `sharedassets0.assets` 里，用 `TypeTreeGenerator`
  从 DLL 现场生成类型树即可解析（`so_extract3.py`，13 个类全部成功）。
- ~~天赋树节点效果~~ → **已拿到**。见 8.1 / A.7 与 `TREE.md`。

**真正仍未拿到的**：

- 各语言的**排版/复数规则**：本地化 JSON 里有 `_Plural` 后缀的 key 只有 3 个，
  复数处理看起来是硬编码的
- 节点的**图标 Sprite 与 UI 预制体**：`TreeNodeInfo` 有 `NodeIcon` /
  `_nonleveledNodeShape` 等字段，但绝大多数节点留空走
  `TreeNodeTemplate`（path_id 3411）—— 模板本身还没展开
- **本地化 JSON 只有 630 条**，而 DLL 字符串区有 192 个本地化 key 引用 —— 
  两者对不上说明还有部分文本是**运行时拼接**的
  （`LocalizerManager` 有 `FormatTag` / `#VALUE#` 替换逻辑）

### 工具链修正记录

`_modkit/dnmeta.py` 原有**两处 ECMA-335 表结构 bug**，会导致
`Constant` 表之后的所有表（CustomAttribute / ClassLayout / StandAloneSig /
Event / Property / GenericParam / MethodSpec）**全部错位读出垃圾数据**：

1. `Constant`(0x0B) 行结构应为 `Type(1B) + 填充(1B) + Parent(coded) + Value(blob)`
   = **8 字节**；原实现把 Type 当成 4 字节堆索引（10 字节）
2. `CODED['CustomAttributeType']` 的 tag 是 **2=MethodDef / 3=MemberRef**
   （0/1 保留不用）；原列表按 tag 0/1 解析，全部误判

修正后 26 张表全部 100% 通过索引合法性校验。
新增的提取器在 `_modkit/dump_content.py`
（`python dump_content.py <dll> <outdir>`），可复用于其他 Mono 游戏。

### 特别说明：本文的提取方式

存档的编解码由 `ZadTools/README.md` 提供（`TripleDES-ECB` + `MD5` 密钥，
无校验和）。本文在此基础上：
解开了 **18 份存档**全部内容、读取了 `Assembly-CSharp.dll` 的
**560 个类型 / 45 个枚举 / 1624 条字符串字面量 / 常量表**、
从 Unity 序列化资源中提取了命名池，
并解析了 `SkillsLog.txt` 的 28 个关卡块。

**开发者署名**：`Saham`（自定义 shader 路径 `Saham/MiningRockHit`、
`Tools/Saham/...` 菜单）。
**NPC 名字残留**：`Aleef`、`Mar`（本地化 key `Aleef_Desc`、`Mar_Desc`）。
