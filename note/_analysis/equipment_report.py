"""Emit EQUIPMENT.md -- the item / affix / improvement / shaping numbers."""
import os, io, json, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(HERE, 'so')
ROOT = os.path.join(HERE, '..')


def J(n):
    p = os.path.join(SO, n)
    return json.load(io.open(p, encoding='utf-8')) if os.path.exists(p) else None


C = J('DatabaseManager_constants.json')
S, T = C['scalars'], C['tables']
items = J('ItemInfo.json') or []
affix = J('ItemAffixes_resolved.json') or []
runes = J('RuneStatInfo.json') or []
shape = J('ShapingWeaponInfo.json') or []
base = {r['stat']: r['value'] for r in (J('PlayerBaseStats.json') or [])}
loc = {x['TheKey']: x for x in J('Localization.json')['LDataForJson']}


def zh(k, d='—'):
    e = loc.get(k)
    return str(e.get('CHINESE_Value', d)) if e else d


def num(v):
    if v is None:
        return '—'
    if isinstance(v, float) and v == int(v):
        return '%d' % int(v)
    return '%g' % v


RARITY = ['Normal 普通', 'Rare 稀有', 'Epic 史诗', 'Legendary 传奇']
WEAPON = {0: 'Sword 剑', 1: 'Hammer 锤', 2: 'Lightning 闪电',
          3: 'Fire 火焰', 4: 'Shield 盾', 5: 'Banner 旗帜'}
CAT = {0: '近战', 1: '元素', 2: '辅助'}

L = []
w = L.append

w('# Zad Archery — 装备系统全解\n')
w('> 来自 `ItemInfo` / `ItemStatsInfo` / `RuneStatInfo` / `ShapingWeaponInfo`')
w('> 四个 ScriptableObject，以及 `CraftingManager` 的 IL。')
w('> 提取脚本：`_analysis/equipment_report.py`、`items_resolve.py`、`so_extract4.py`。\n')

# ---------------------------------------------------------------- 1
w('## 一、装备的四个槽位类型\n')
w('```')
w('ItemType:  Bow(0) 弓   Armor(1) 护甲   Rune(2) 符文   Scroll(3) 卷轴')
w('```')
w('')
w('**装备怎么影响玩家属性**（`InventoryManager.ApplyRemoveItemStats`）：\n')
w('```')
w('弓  → Damage += GetImprovedBaseValue()          // 弓的基础值直接进【伤害】')
w('甲  → Health += GetImprovedBaseValue()          // 甲的基础值直接进【生命】')
w('每条词缀 → ChangeAStat(对应属性, 对应桶, 词缀值)')
w('```')
w('')
w('> 所以**弓的面板数值 = 你的伤害加成**，护甲同理。')
w('> 词缀则是各自进自己的属性桶（Flat / Additive）。\n')

w('弓和护甲各有 **10 个基底等级**，逐级解锁：\n')
w('| 等级 | 弓 | 弓解锁花费(金币) | 制作成本 | 弓数值区间 | 护甲 | 护甲解锁花费 | 护甲数值区间 |')
w('|---|---|---|---|---|---|---|---|')
bows = {x['BaseLevel']: x for x in items if x.get('ItemType') == 0}
arms = {x['BaseLevel']: x for x in items if x.get('ItemType') == 1}
for lv in sorted(bows):
    b, a = bows[lv], arms.get(lv, {})
    w('| %d | `%s` | %s | %s | %s~%s | `%s` | %s | %s~%s |'
      % (lv, b['functionName'], num(b.get('UnlockCost')), num(b.get('CreateCost')),
         num(b.get('minValue')), num(b.get('maxValue')),
         a.get('functionName'), num(a.get('UnlockCost')),
         num(a.get('minValue')), num(a.get('maxValue'))))
w('')
w('> **解锁花费按约 7.5 倍/级递增**（5000 → 400 亿），')
w('> 制作成本涨得更快（2 → 12 万）。')
w('> 注意 `CreateCost` 是**素材成本**，解锁花费才是金币。\n')

# ---------------------------------------------------------------- 2
w('## 二、稀有度\n')
w('`Rarity: Normal(0) / Rare(1) / Epic(2) / Legendary(3)`\n')
w('| 稀有度 | 掉落权重 | 词缀数量 | 出售价倍率 |')
w('|---|---|---|---|')
drop = T.get('RarityChanceToDrop') or {'0': 59, '1': 32.7, '2': 7.5, '3': 0.8}
nst = T.get('ItemNumberOfStats') or {}
sell = T.get('SellPerRarityMultiplier') or {}
for k in range(4):
    w('| %s | **%s%%** | %s 条 | ×%s |'
      % (RARITY[k], num(drop.get(str(k))), num(nst.get(str(k))),
         num(sell.get(str(k)))))
w('')
w('> 掉落权重写在 `DatabaseManager.AwakeMe()` 里，正好凑成 100。')
w('> **传奇 0.8%** —— 平均 125 件才出一件。\n')

# ---------------------------------------------------------------- 3
w('## 三、词缀池（15 条）\n')
w('这是**装备自身的词缀池**（`ItemStatsInfo`），和符文词缀是两套。')
w('`AppearsOn` 决定它只出现在弓还是护甲上：\n')
w('| 部位 | 词缀 | 数值区间 | 出现概率 |')
w('|---|---|---|---|')
for r in sorted(affix, key=lambda r: (r['target'] != 'Bow', str(r['stat']))):
    w('| %s | `%s` | %s ~ %s | %s%% |'
      % (r['target'], r['stat'], num(r['min']), num(r['max']), num(r['chance'])))
w('')
w('**弓有 8 条、护甲有 7 条**，全部是 100% 权重（等概率）。\n')

w('### 3.1 词缀数值怎么 roll\n')
w('这是整个装备系统里最值得看的一段（`CraftingManager.GetRandomStatByTier`）：\n')
w('```')
w('幸运 = stats.CraftingLuck.Total.RealValue      // 初始 1.0')
w('bias = 3 / Max(幸运, 0.01)')
w('t    = Random.Range(0,1) ^ bias               // 幂函数偏置')
w('数值 = minValue + (maxValue - minValue) × t')
w('// 整数型属性再 Round')
w('```')
w('')
w('> **初始幸运 1.0 → bias = 3 → `t = rand³`。**')
w('> `rand³` 的期望是 0.25（均匀分布是 0.5），')
w('> 也就是**词缀数值天然偏向最低值**。')
w('> 想把区间 roll 满，必须堆 `CraftingLuck`（幸运堆到 3 时 bias=1，变成均匀分布）。')
w('')
w('这条公式解释了一个常见的玩家体感：**「为什么我做的装备数值总是很低」** —— ')
w('不是运气差，是设计如此。\n')

w('### 3.2 基础数值（BaseValue）\n')
w('```')
w('min = (ItemInfo.minValue + BaseMinValueAddition) × BaseMinValueMultiplier')
w('max = (ItemInfo.maxValue + BaseMaxValueAddition) × BaseMaxValueMultiplier')
w('if (max < min) max = min')
w('```')
w('')
w('玩家的 `BaseMinValueMultiplier` / `BaseMaxValueMultiplier` 初始都是 1，')
w('`BaseMinValueAddition` / `BaseMaxValueAddition` 初始 0 —— ')
w('**这两个加成只有天赋/装备能给**，是提升装备底子的主要途径。\n')

w('### 3.3 词缀总倍率\n')
w('```')
w('ApplyCraftingStatValueBonus:  每条词缀 × stats.ItemStatValuesMultiplier.Total')
w('ApplyStatValueBonuses:        再 × 卷轴倍率(ScrollStatValuesMultiplier)')
w('```')
w('')
w('`ItemStatValuesMultiplier` 初始 1，是全局「词缀数值放大器」。\n')

# ---------------------------------------------------------------- 4
w('## 四、强化（Improvement）\n')
w('每件装备最多强化 **10 次**（`Improvment_MaximumCount`）。\n')
w('### 4.1 成功率\n')
w('```')
w('有效次数 = Max(0, 已强化次数 − ImprovementChanceExemption)')
w('成功率   = ItemImprovment_StartingValue(60) − 有效次数 × ItemImprovment_DecreasePerImprovement(10)')
w('成功率   = Max(成功率, ItemImprovment_MinimumValue(10))')
w('if (DoubleImproveChance) 成功率 = Min(成功率 × 1.3, 100)')
w('```')
w('')
w('| 第几次 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |')
w('|---|---|---|---|---|---|---|---|---|---|---|')
w('| 成功率 | 60% | 50% | 40% | 30% | 20% | 10% | 10% | 10% | 10% | 10% |')
w('')
w('**强化会失败**（`ImprovementFailed`）。`ImprovementChanceExemption` 能让前 N 次')
w('不扣成功率，`DoubleImproveChance` 让成功率 ×1.3 —— 两者都来自装备词缀/天赋。\n')

w('### 4.2 强化加成：阶梯式\n')
w('```')
w('加成% = Σ over ImprovementTiers[(4,20), (9,13), (∞,13)] of')
w('            Max(0, Min(次数, 阈值) − 上一档阈值) × 该档系数')
w('最终 BaseValue = Ceiling( BaseValue × (1 + 加成%/100) )')
w('```')
w('')
w('| 强化次数 | 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 |')
w('|---|---|---|---|---|---|---|---|---|---|---|')
w('| 累计加成 | +20% | +40% | +60% | +80% | +93% | +106% | +119% | +132% | +145% | **+158%** |')
w('')
w('> 前 4 次每次 **+20%**，第 5 次起降到每次 **+13%**。')
w('> 满强化是 **×2.58**。配合成功率（60/50/40/30/20/10…），')
w('> 强化到满的期望成本远高于面板。\n')

# ---------------------------------------------------------------- 5
w('## 五、词缀数量怎么来的\n')
w('`CraftingManager.RollItemStatLines`：\n')
w('```')
w('条数 =  ItemNumberOfStats[稀有度]        // 1 / 2 / 3 / 4')
w('      + Max(0, ExtraStatsFromScroll)   // 卷轴加的')
w('      + Max(0, CorruptAddedStats)     // 腐蚀加的')
w('')
w('重复 条数 次:')
w('    词缀 = GetRandomStatByTier(装备, 部位)   // 按 Chance 加权，排除已有的')
w('    若取到: 装备.AddStat(词缀, 数值)')
w('```')
w('')
w('> **排除已有的**（`addedNames`）意味着同一件装备不会出现两条同名词缀 ——')
w('> 但腐蚀那一步会绕过它，见下。\n')

# ---------------------------------------------------------------- 6
w('## 六、腐蚀（Corrupt）\n')
w('`CraftingManager.ClickedOnCraft4Button`：\n')
w('```')
w('前置: 已解锁该功能(9) / 装备存在 / 词缀数 > 1 / 尚未腐蚀')
w('花费: ApplyCraftCostReduction( CreateCost × 0.5 )   ← 花【弓】货币')
w('')
w('第 1 步: for (i = 0; i < n; i += 2)')
w('            if (i+1 < n)  Stats[i+1] = 复制一份 Stats[i]')
w('第 2 步: 再加 CorruptAddedStats 条新的随机词缀')
w('```')
w('')
w('**第 1 步是「隔一个复制一个」**，不是删除。所以一件 4 词缀的装备：\n')
w('```')
w('腐蚀前:  [A] [B] [C] [D]')
w('腐蚀后:  [A] [A] [C] [C]  + N 条新的')
w('```')
w('')
w('> **词缀多样性下降，但同名词缀开始叠加。**')
w('> 付出的代价是**一半的词缀位被同名的顶掉**，')
w('> 换来的是「A 变成了 2A」的叠加 —— 值不值取决于原来那几条的强弱。')
w('')
w('**「重复会叠加」这件事已经用 IL 验证过**（`InventoryManager.ApplyRemoveItemStats`）：')
w('```')
w('装备弓  → stats.ChangeAStat("Damage", Flat, item.GetImprovedBaseValue(), sign)')
w('装备甲  → stats.ChangeAStat("Health", Flat, item.GetImprovedBaseValue(), sign)')
w('foreach (line in item.Stats)                       // 逐条，不去重')
w('    stats.ChangeAStat(该词缀对应的属性名, 该词缀的StatsProp, line.Value, sign)')
w('```')
w('每条词缀都是一次独立的 `ChangeAStat`，所以 `[A][A]` 真的就是两份 A。')
w('')
w('> 花费倍率 `Craft_CorruptCostMultiplierOfCreateCost = 0.5`，')
w('> 且和普通制作一样用 `ApplyCraftCostReduction` 打折。\n')

# ---------------------------------------------------------------- 7
w('## 七、卷轴\n')
w('| 常量 | 值 | 作用 |')
w('|---|---|---|')
w('| `BaseChestContentCount_Scroll` | %s | 宝箱里卷轴的数量 |'
  % num(S.get('BaseChestContentCount_Scroll')))
w('| `ChestGuarantee_ScrollAtLevel` | %s | 到这一关保底出卷轴箱 |'
  % num(S.get('ChestGuarantee_ScrollAtLevel')))
w('| `FirstScrollDropRarity` | %s | 首个卷轴掉落的保底稀有度 |'
  % num(S.get('FirstScrollDropRarity')))
w('')
w('卷轴通过 `ItemSavedData` 的两个字段生效：\n')
w('- `ExtraStatsFromScroll` —— **多几条词缀**（直接进上面的条数公式）')
w('- `ScrollStatValuesMultiplier` —— **词缀数值倍率**（在 `ApplyStatValueBonuses` 里乘）\n')

# ---------------------------------------------------------------- 8
w('## 八、符文与塑形\n')
w('塑形是**第二套装备系统**，独立于弓/护甲。\n')
w('### 8.1 六种塑形武器\n')
w('| 武器 | WeaponType | 类别 | 伤害公式 | 冷却(秒) | 索敌 |')
w('|---|---|---|---|---|---|')
for x in sorted(shape, key=lambda r: r.get('WeaponType') or 0):
    wt = x.get('WeaponType')
    cat = CAT.get(T['WeaponTypeToCategory'].get(str(wt)))
    w('| `%s` | %d | %s | `%s` | %s | %s |'
      % (x['functionName'], wt, cat, x.get('DamageMultiplierEquation'),
         num(x.get('Cooldown')), num(x.get('SeekRange'))))
w('')
w('> 伤害公式里的 `x` 是**武器等级**。`0.4` 系数意味着')
w('> 每升一级只加「系数 × 0.4」—— 成长很缓。')
w('> 索敌范围**全部是 600**，没有差异。\n')

w('### 8.2 符文词缀（37 条）\n')
w('分两类：`Kind = 0` 是**武器专属**，`Kind = 1` 是 **Explicit 通用**。')
w('`Target = 0` 影响攻击，`Target = 1` 影响增益效果。\n')
for kind, label in ((0, '武器专属'), (1, 'Explicit 通用')):
    rows = [r for r in runes if r.get('Kind') == kind]
    w('**%s**（%d 条）\n' % (label, len(rows)))
    w('| 武器 | 词缀 | 数值区间 | 取整 |')
    w('|---|---|---|---|')
    for r in sorted(rows, key=lambda r: (r.get('WeaponType') or 0,
                                         r['functionName'])):
        wt = r.get('WeaponType')
        w('| %s | `%s` | %s ~ %s | %s |'
          % (WEAPON.get(wt, '通用') if kind == 0 else '通用',
             r['functionName'], num(r.get('minValue')), num(r.get('maxValue')),
             num(r.get('RoundToNearest'))))
    w('')

w('### 8.3 符文的词缀数量\n')
rn = T.get('RuneNumberOfExplicits') or {}
w('| 稀有度 | 随机词缀（Explicits）条数 |')
w('|---|---|')
for k in range(4):
    if str(k) in rn:
        w('| %s | %s |' % (RARITY[k], num(rn[str(k)])))
w('')
w('> 传奇符文 **3 条**随机词缀 + 固有词缀（Implicits）。')
w('> `ShapingRuneInventorySize = %s`（符文库存上限），'
  % num(S.get('ShapingRuneInventorySize')))
w('> `ShapingFirstRuneStatValue = %s`（首个符文的保底数值）。\n'
  % num(S.get('ShapingFirstRuneStatValue')))

# ---------------------------------------------------------------- 9
w('## 九、掉落与其它\n')
w('| 常量 | 值 | 作用 |')
w('|---|---|---|')
for k, desc in (('BaseEnemyItemDropChance', '怪物掉落装备的基础概率'),
                ('EnemyDropImprovementMin', '怪物掉的装备自带强化次数的下限'),
                ('EnemyDropImprovementMax', '上限'),
                ('GuardianItemDropCount', '守卫掉几件'),
                ('FirstBowDropRarity', '第一把弓的保底稀有度'),
                ('Improvment_CostMultiplierOfCreateCost', '每次强化的花费 = CreateCost × 该值'),
                ('Craft_CorruptCostMultiplierOfCreateCost', '腐蚀花费倍率'),
                ('ChestGuarantee_ItemsCrafted', '制作多少件后保底出装备箱'),
                ('BaseChestContentRarity', '宝箱内容的基础稀有度')):
    w('| `%s` | %s | %s |' % (k, num(S.get(k)), desc))
w('')

w('---\n')
w('## 一句话总结\n')
w('```')
w('装备强度 = BaseValue × (1 + 强化加成%)      ← 强化吃钱，会失败')
w('         × 词缀各自的值                    ← 值 = 区间内做 rand^(3/幸运) 的偏置')
w('                                          ← 条数 = 稀有度(1-4) + 卷轴 + 腐蚀')
w('                                          ← 全局还有 ItemStatValuesMultiplier 放大')
w('```')
w('')
w('**三条互相独立的成长轴**：')
w('1. **稀有度**决定词缀「条数」（1→4）')
w('2. **强化**决定基础值（最多 ×2.58）')
w('3. **幸运 / 词缀倍率**决定每条词缀 roll 得多高')
w('')
w('加上**腐蚀**这条「拿多样性换叠加」的激进选项，')
w('以及**塑形/符文**这套完全独立的第二装备系统。\n')

io.open(os.path.join(ROOT, 'EQUIPMENT.md'), 'w', encoding='utf-8').write('\n'.join(L))
print('wrote EQUIPMENT.md — %d lines' % len(L))
