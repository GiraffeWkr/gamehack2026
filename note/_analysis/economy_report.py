"""Emit ECONOMY.md -- the 12 currencies, where each comes from, where it goes.

Sources:
  * DatabaseManager..cctor IL     -> the currency tables and drop curves
  * PlayerManager.MonsterDiedGiveRewards / DropCoin / PortalHealthThresholdDrop
  * EnemiesManager.RunPortalDied, GuardiansManager.DropGuardianLoot_Co
  * MiningManager.SpawnOreDrop, ChestsManager.SpawnContents_Co
  * *_Manager.cctor               -> the *Currency static each system spends
"""
import os, io, json, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(HERE, 'so')
ROOT = os.path.join(HERE, '..')


def J(n):
    p = os.path.join(SO, n)
    return json.load(io.open(p, encoding='utf-8')) if os.path.exists(p) else None


C = J('DatabaseManager_constants.json')
S, T = C['scalars'], C['tables']
base = {r['stat']: r['value'] for r in (J('PlayerBaseStats.json') or [])}
jobs = J('JobInfo.json') or []
tree = J('Tree_full.json') or []
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


CUR = {1: 'Gold 金币', 2: 'ClawCurrency 爪', 3: 'ArcherCurrency 弓',
       4: 'PortalCurrency 传送门', 5: 'WarriorCurrency 战', 6: 'MageCurrency 法',
       7: 'BatCurrency 蝠', 8: 'MiningRock 岩石', 9: 'MiningCopper 铜',
       10: 'MiningSilver 银', 11: 'MiningGold 金矿', 12: 'GuardianCurrency 守卫'}
ETYPE = {0: 'Claw', 1: 'Warrior', 2: 'Archer', 3: 'Mage', 4: 'Bat',
         5: 'RunPortal', 6: 'Guardian_Claw', 7: 'Guardian_Warrior',
         8: 'Guardian_Archer', 9: 'Guardian_Mage', 10: 'Guardian_Bat', 11: 'King'}

L = []
w = L.append

w('# Zad Archery — 经济系统全解\n')
w('> 全部来自程序集 IL 与 ScriptableObject，没有推测。')
w('> 提取脚本：`_analysis/economy_report.py`、`il_tables.py`、`so_extract4.py`。\n')

# ---------------------------------------------------------------- 1
w('## 一、12 种货币\n')
w('| 值 | 货币 | 定位 |')
w('|---|---|---|')
ROLE = {
    1: '通用货币 —— 装备制作、强化、绝大部分天赋节点',
    2: '**职业解锁** —— 唯一用途是买 Job',
    3: '**制作台等级** —— 升 Crafting NPC',
    4: '**系统解锁 + 后期天赋** —— 29 个天赋节点，含全部系统解锁节点',
    5: '（已定义，未在解析到的消耗点出现）',
    6: '**符文/塑形** —— 创建符文、升级槽位',
    7: '**精通** —— 升精通等级（`MasteryCurrency = 7`）',
    8: '矿石（最低阶）—— 采矿产出',
    9: '矿石（铜）',
    10: '矿石（银）',
    11: '矿石（金）',
    12: '**星魂 / 守卫特权** —— `StarCurrency = 12`，每个特权 1 点',
}
for k in sorted(CUR):
    w('| %d | `%s` | %s |' % (k, CUR[k], ROLE.get(k, '')))
w('')
w('> **这套设计的骨架**：5 种职业货币分别绑定 5 种「普通怪」，')
w('> 每种怪只掉自己那种。玩家要哪条成长线，就得去刷对应的怪。\n')

# ---------------------------------------------------------------- 2
w('## 二、来源：怪物掉落\n')
w('### 2.1 职业货币 ↔ 怪物类型\n')
w('`MonsterCurrencyToEnemyType` 是硬绑定的（来源货币 → 掉落它的怪）：\n')
w('| 货币 | 掉落它的怪 | 该货币的解锁等级 |')
w('|---|---|---|')
UNLOCK = {0: 2, 1: 6, 2: 3, 3: 10, 4: 16}
for cur, et in sorted(T['MonsterCurrencyToEnemyType'].items()):
    w('| `%s` | `%s` | **Lv.%d** |' % (CUR[int(cur)], ETYPE[int(et)],
                                       UNLOCK[int(et)]))
w('')
w('> 击杀一只怪只掉**它自己那种**货币。所以「爪」只有打利爪怪才有，')
w('> 「蝠」要打到 Lv16 才解锁。\n')

w('### 2.2 掉多少：按「相对等级」查表\n')
w('```')
w('掉落量 = EnemyCurrencyPerRelativeLevel[ Clamp(BattleLevel,1,30) - 该货币的解锁等级 ]')
w('```')
w('')
rel = T['EnemyCurrencyPerRelativeLevel']
w('| 相对等级 | 掉落量 | 相对等级 | 掉落量 |')
w('|---|---|---|---|')
ks = sorted(rel, key=int)
for i in range(0, len(ks), 2):
    a = ks[i]
    b = ks[i + 1] if i + 1 < len(ks) else None
    w('| %s | %s | %s | %s |'
      % (a, num(rel[a]), b if b else '', num(rel[b]) if b else ''))
w('')
w('> 上限 **2100**，从相对等级 25 起封顶。')
w('> 因为键是**相对**等级，所以「爪」在 Lv30 时相对等级 = 30−2 = 28 → 2100，')
w('> 「蝠」在 Lv30 时 = 30−16 = 14 → 59。**先解锁的货币后期更值钱。**\n')

w('### 2.3 掉落的完整流程\n')
w('`PlayerManager.MonsterDiedGiveRewards(pos, enemyType, …, skillName, isPortalPack)`：\n')
w('```')
w('倍率 = 1')
w('  若 isPortalPack: 倍率 = 1 + PortalPackCurrencyBonus/100')
w('刷关倍率 = IsFarmingBack ? 0.75 : 1        // 回刷老关只给 75%')
w('')
w('金币 = Ceiling( EnemyGoldPerLevel[lv] × 1.22^(lv>30 的部分) )')
w('       × GetGoldGainedMultiplier()')
w('       × 倍率 × 刷关倍率')
w('       × GetKillGoldMultiplier(击杀用的塑形武器)')
w('')
w('// 职业货币')
w('按 enemyType 决定货币种类，基础量 = EnemyCurrencyPerRelativeLevel[相对等级]')
w('奖励抽 = IsHappened_Over100Things(该货币的 *CurrencyChanceDrop)   // 额外一撮')
w('')
w('金币数量 = GoldCoinsToDrop + (IsHappened_Over100Things(GoldChanceToDrop) ? 1 : 0)')
w('for i in 金币数量:  SpawnCurrencyDrop(Gold, 金币)')
w('for i in 奖励抽:    SpawnCurrencyDrop(职业货币, 基础量)')
w('```')
w('')
w('> **一次击杀最多掉两撮同种职业货币**（基础一撮 + 概率奖励一撮），')
w('> 但金币是按 `GoldCoinsToDrop` 掉**一堆金币实体**，每个都值「金币」那么多。\n')

w('### 2.4 金币的成长表\n')
w('`EnemyGoldPerLevel`（1–30 手填，31+ 按 1.22 倍/级外推）：\n')
w('| 等级 | 单只怪金币 | 等级 | 单只怪金币 | 等级 | 单只怪金币 |')
w('|---|---|---|---|---|---|')
gd = T['EnemyGoldPerLevel']
ks = sorted(gd, key=int)
for i in range(0, len(ks), 3):
    row = ks[i:i + 3]
    w('| ' + ' | '.join('%s | %s' % (k, num(gd[k])) for k in row) +
      ' |' + ' | |' * (3 - len(row)))
w('')
w('> Lv1 的怪掉 1 金币，Lv30 掉 3500 万 —— **3500 万倍**，')
w('> 比血量的 120 万倍还陡。\n')

# ---------------------------------------------------------------- 3
w('## 三、来源：其余渠道\n')
w('### 3.1 宝箱\n')
w('宝箱类型权重 `ChestTypeWeights`：\n')
w('| 类型 | 权重 | 内容 |')
w('|---|---|---|')
CT = {0: ('Currency 货币箱', '金币实体 + 所有已解锁的职业货币'),
      1: ('Item 装备箱', '`ChestContentCount_Item` 件装备'),
      2: ('Rune 符文箱', '`ChestContentCount_Rune` 个符文'),
      3: ('Scroll 卷轴箱', '`ChestContentCount_Scroll` 个卷轴'),
      4: ('Legendary 传奇箱', '传奇内容')}
for k, v in sorted(T['ChestTypeWeights'].items(), key=lambda kv: -kv[1]):
    w('| %s | %s | %s |' % (CT[int(k)][0], num(v), CT[int(k)][1]))
w('')
w('**保底机制**（`RollChestTypeWithGuarantees`）：\n')
w('| 条件 | 保底 |')
w('|---|---|')
w('| 制作过 %s 件装备 | 必出装备箱 |' % num(S.get('ChestGuarantee_ItemsCrafted')))
w('| 创建过 %s 个符文 | 必出符文箱 |' % num(S.get('ChestGuarantee_RunesCreated')))
w('| 到达 Lv%s | 必出卷轴箱 |' % num(S.get('ChestGuarantee_ScrollAtLevel')))
w('| 到达 Lv%s | 必出传奇箱 |' % num(S.get('ChestGuarantee_LegendaryAtLevel')))
w('')
w('**货币箱给多少金币**（`ChestsManager.DropCoin`）：\n')
w('```')
w('金币数量 = Ceiling( (ChestCoins_X × ChestCoinMultiplier_X')
w('                     + ChestExtraCoins)')
w('                   × (1 + ChestCoinValueBonus/100)')
w('                   × GetChestLootMultiplier() )')
w('// 再遍历 MonsterCurrencies，凡是「已经出现过」的职业货币都各掉一撮')
w('```')
w('')
w('| 箱子 | ChestCoins | 倍率 |')
w('|---|---|---|')
for k, n in (('CurrencyChest', '货币箱'), ('StandardChest', '标准箱'),
             ('LegendaryChest', '传奇箱')):
    w('| %s | %s | %s |' % (n, num(base.get('ChestCoins_' + k)),
                            num(base.get('ChestCoinMultiplier_' + k))))
w('')
w('> `DropCoin` 里那个 `WasCurrencyShownBefore` 判断很关键：')
w('> **货币箱会掉「所有你已解锁过的职业货币」各一份**，')
w('> 所以它是补冷门货币（比如蝠）的主要手段，不用专门去刷对应怪。\n')

w('### 3.2 采矿\n')
w('```')
w('挖矿 → SpawnOreDrop(oreIndex)')
w('   货币 = OreToCurrency[oreIndex]        // 0→岩石 1→铜 2→银 3→金')
w('   价值 = CurrentOreValue() = (1 + OreValueBonus) × Max(1, 矿力等级倍率)')
w('```')
w('')
w('矿石权重 `OreBaseWeight`（挖出哪种矿的概率）：\n')
w('| 矿石 | 权重 | 占比 |')
w('|---|---|---|')
tot = sum(T['OreBaseWeight'].values())
for k, v in sorted(T['OreBaseWeight'].items(), key=lambda kv: -kv[1]):
    w('| %s | %s | **%.1f%%** |' % (CUR[int(k) + 8], num(v), 100 * v / tot))
w('')
w('> **金矿占 0.2%** —— 挖 500 次才出一次。银 2%、铜 10%、岩石 87.8%。')
w('> 这是个典型的长尾稀有资源曲线。\n')

w('### 3.3 传送门货币\n')
w('**唯一来源：击杀 RunPortal。**\n')
w('```')
w('MonsterDiedGiveRewards(…, enemyType = RunPortal(5)):')
w('    货币 = 4 (PortalCurrency)')
w('    数量 = IsPortalCurrencyOwed(MonstersLevel) ? 1 : 0')
w('    若数量 > 0: MarkPortalCurrencyPaid(MonstersLevel)')
w('```')
w('')
w('`IsPortalCurrencyOwed(level)` = 该关还没被收过（`PortalCurrencyPaid` 里没有或为 0）。')
w('所以**每个关卡一辈子只给 1 点传送门货币**，收过就永远不再给。\n')

w('### 3.4 守卫货币\n')
w('`GuardiansManager.DropGuardianLoot_Co`：\n')
w('| 情况 | 掉落 |')
w('|---|---|')
w('| **首次**击杀某守卫 | %s × 守卫货币 + 该守卫的招牌掉落 |'
  % num(S.get('GuardianCurrencyFirstKill')))
w('| 重复击杀 | %s 撮「该守卫的基础怪货币」（量 = GuardianCoinValue）|'
  % num(S.get('GuardianMonsterCurrencyCoins')))
w('')
w('守卫的「基础怪」映射（`GuardianBaseType`）：\n')
w('| 守卫 | 基础怪 | 重复击杀掉 |')
w('|---|---|---|')
for g, b in ((6, 0), (7, 1), (8, 2), (9, 3), (10, 4)):
    w('| `%s` | `%s` | %s |' % (ETYPE[g], ETYPE[b], CUR[2 + 0] if False else
                                {0: CUR[2], 1: CUR[5], 2: CUR[3], 3: CUR[6],
                                 4: CUR[7]}[b]))
w('')
w('> **守卫货币只有首杀才给，且每次只给 1 点。** 而星魂特权每个要 1 点 ——')
w('> 所以星魂系统的进度**直接等于你首杀了几个守卫**，跟刷多久无关。\n')

# ---------------------------------------------------------------- 4
w('## 四、消耗：每种货币花在哪\n')
JOBCOST = ' / '.join(num(j.get('UnlockCost')) for j in
                     sorted(jobs, key=lambda x: x.get('JobIndex', 0)))
w('| 货币 | 消耗点 | 价格 |')
w('|---|---|---|')
w('| 金币 (1) | 天赋树 139/168 个节点 | `NodeCostEquation` |')
w('| 金币 (1) | 制作装备基底 | `ItemInfo.UnlockCost` |')
w('| 金币 (1) | 符文塑形（重roll、升级槽） | — |')
w('| 金币 (1) | 采矿台 NPC 升级 | `MiningNPCLevelCost` |')
w('| 爪 (2) | **5 个 Job 解锁** | %s |' % JOBCOST)
w('| 弓 (3) | 制作台 NPC 升级 | `CraftingNPCLevelCost` |')
w('| 传送门 (4) | **天赋树 29/168 个节点**（含全部系统解锁）| 多数为 1 |')
w('| 法 (6) | 创建符文、升级塑形槽位 | — |')
w('| 蝠 (7) | **精通等级** | `MasteryInfo.LevelUpCostEquation` |')
w('| 守卫 (12) | **星魂特权** | 每个 1 点（`GuardianPerkCost`）|')
w('| 矿石 (8–11) | 制作 / 塑形的材料 | — |')
w('')

w('### 4.1 五个 Job 的价格（爪货币）\n')
w('| Job | 名称 | 价格 | 累计 |')
w('|---|---|---|---|')
cum = 0
for j in sorted(jobs, key=lambda x: x.get('JobIndex', 0)):
    i = j.get('JobIndex')
    cum += j.get('UnlockCost') or 0
    w('| %d | %s | %s | %s |' % (i, zh('Job%d_Title_Text' % i),
                                 num(j.get('UnlockCost')), num(cum)))
w('')
w('> 全部解锁共需 **321,700 爪**。而 Claw 怪的掉落量在 Lv30 是 2100/只 ——')
w('> 大约 153 只怪。听上去不多，但爪的解锁等级是 Lv2，')
w('> 前期相对等级低，掉落只有个位数。\n')

w('### 4.2 天赋树的价格组成\n')
w('| 货币 | 节点数 | 典型价格 |')
w('|---|---|---|')
cc = collections.Counter(n.get('costCurrency') for n in tree)
for k in sorted(cc):
    nodes = [n for n in tree if n.get('costCurrency') == k]
    eqs = collections.Counter(','.join(n['costEq']) for n in nodes)
    w('| %s | %d | %s |' % (CUR[k], cc[k],
                            ', '.join('`%s`×%d' % (a, b) for a, b in eqs.most_common(3))))
w('')
w('> **传送门货币的 29 个节点包含了全部系统解锁**')
w('> （职业、制作、采矿、塑形、精通、卷轴、宝珠、守卫特权、黄金怪、宝箱）。')
w('> 也就是：**主线进度不是用金币买的，是靠一次次击杀传送门攒的。**\n')

# ---------------------------------------------------------------- 5
w('## 五、几条影响全局的规则\n')
w('| 规则 | 值 | 作用 |')
w('|---|---|---|')
w('| `FarmRunRewardMultiplier` | %s | **回刷老关卡，奖励只给 75%%** |'
  % num(S.get('FarmRunRewardMultiplier')))
w('| `GoldenRewardMultiplier` | %s | 金色精英的奖励倍率 |'
  % num(S.get('GoldenRewardMultiplier')))
w('| `BaseChanceForGoldenEnemy` | %s%% | 金色精英出现概率 |'
  % num(S.get('BaseChanceForGoldenEnemy')))
w('| `ClawCurrencyPerStack` | %s | 货币显示成「一摞」所需的量 |'
  % num(S.get('ClawCurrencyPerStack')))
w('| `ChestChanceMultiplierPerSpawn` | %s | 同一关里每刷一次宝箱，概率衰减到 75%% |'
  % num(S.get('ChestChanceMultiplierPerSpawn')))
w('| `BaseChanceToSpawnChest` | %s%% | 宝箱基础出现率 |'
  % num(S.get('BaseChanceToSpawnChest')))
w('')
w('> `FarmRunRewardMultiplier = 0.75` 是**反刷关设计**：')
w('> 回到已经打过的关卡，金币和职业货币都只给 75%，')
w('> 逼玩家往高关卡走。配合「敌人难度 1.5 倍/级、金币 1.22 倍/级」，')
w('> 越往后收益越高。\n')

w('---\n')
w('## 一句话总结\n')
w('**十二种货币 = 五条成长线 + 一条主线 + 一条通用 + 四种材料。**\n')
w('| 想解锁 | 去刷 |')
w('|---|---|')
w('| Job（职业）| 利爪怪 → 爪 |')
w('| 制作台 | 弓箭手怪 → 弓 |')
w('| 塑形 / 符文 | 法师怪 → 法 |')
w('| 精通 | 蝙蝠怪 → 蝠 |')
w('| 星魂 / 守卫特权 | 守卫首杀 → 守卫货币 |')
w('| **一切系统解锁 + 后期天赋** | **传送门（每关一次）→ 传送门货币** |')
w('| 装备制作 / 强化 / 大部分天赋 | 任意怪 → 金币 |')
w('| 制作材料 | 挖矿 → 四种矿石 |')
w('')

io.open(os.path.join(ROOT, 'ECONOMY.md'), 'w', encoding='utf-8').write('\n'.join(L))
print('wrote ECONOMY.md — %d lines' % len(L))
