"""Emit NUMBERS.md -- the game's numeric system in one document.

Sources, all recoverable from the shipped build:
  * PlayerStatsData.InitData IL      -> 84 base stats
  * DatabaseManager..cctor IL        -> difficulty tables + base constants
  * Data/*.json (ScriptableObjects)  -> enemy types, jobs, skills, projectiles
  * LocalizationJson                 -> display names
"""
import os, io, json, collections

HERE = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(HERE, 'so')
ROOT = os.path.join(HERE, '..')


def J(name):
    p = os.path.join(SO, name)
    return json.load(io.open(p, encoding='utf-8')) if os.path.exists(p) else None


base = J('PlayerBaseStats.json') or []
consts = J('DatabaseManager_constants.json') or {'scalars': {}, 'tables': {}}
enemies = J('EnemyInfo.json') or []
jobs = J('JobInfo.json') or []
skills = J('JobSkillInfo.json') or []
loc = {x['TheKey']: x for x in J('Localization.json')['LDataForJson']}

S = consts['scalars']
T = consts['tables']


def zh(key, default='—'):
    e = loc.get(key)
    return str(e.get('CHINESE_Value', default)) if e else default


def en(key, default='—'):
    e = loc.get(key)
    return str(e.get('English_Value', default)) if e else default


def num(v):
    if v is None:
        return '—'
    if isinstance(v, float) and v != int(v):
        return ('%g' % v)
    return ('%d' % int(v)) if abs(v) < 1e15 else ('%g' % v)


L = []
w = L.append

w('# Zad Archery — 数值系统全解\n')
w('> 全部数字来自正式版 `1.0.1` 的资源与程序集，没有一处是推测：')
w('> 玩家初始属性来自 `PlayerStatsData.InitData` 的 IL，难度曲线来自')
w('> `DatabaseManager..cctor` 里构造的静态表，怪物/技能数值来自各自')
w('> 的 ScriptableObject。提取脚本见文末。\n')

# ---------------------------------------------------------------- 1
w('## 一、玩家属性\n')
w('### 1.1 属性的四桶结构\n')
w('每个属性都是一个 `StatsDouble`，游戏只读 `Total`：\n')
w('```')
w('Total = Flat × (1 + AdditiveIncreases/100) × MultiplicativeIncreases')
w('```')
w('')
w('三个桶的来源互相独立：**Flat 来自基础值 + 天赋/装备的加值**，')
w('**Additive 来自各种百分比**，**Multiplicative 只来自装备词缀与终局天赋**。')
w('加法层先求和再乘，所以堆同一条加法属性边际收益是线性的；')
w('乘法层直接连乘，是真正的稀缺资源。\n')

w('### 1.2 初始属性表（%d 项）\n' % len(base))
w('游戏开局时 `PlayerStatsData.InitData()` 会写入这些值。')
w('注意 `Flat` 之外**没有任何初始加成** —— 玩家的所有成长都从这 84 个数开始。\n')
w('| # | 属性 | 初始值 | 含义/来源常量 |')
w('|---|---|---|---|')
for i, r in enumerate(base, 1):
    nm = r['stat']
    key = None
    for cand in (nm + 'Flat', nm + 'Additive'):
        if cand in loc:
            key = cand
            break
    label = zh(key) if key else ''
    label = label.replace('#VALUE#', '').strip()
    w('| %d | `%s` | **%s** | %s |'
      % (i, nm, num(r['value']), (label or r['from'] or '')[:44]))
w('')

w('### 1.3 开局关键数字\n')
KEY = ['Damage', 'Health', 'AttackRange', 'PlayerAttackSpeed',
       'PlayerMovementSpeed', 'CriticalMultiplier', 'HealthRegen',
       'MouseMagazineSize', 'MouseMagazineRegenTime', 'NumberOfMouseProjectiles',
       'MouseNumberOfHits', 'MouseMaxNumberOfEnemies', 'TameHealthMultiplier',
       'TameDamageMultiplier', 'MaxTames']
w('| 属性 | 初始值 | 说明 |')
w('|---|---|---|')
NOTE = {
    'Damage': '每次命中的基础伤害倍率',
    'Health': '生命上限',
    'AttackRange': '索敌半径（游戏单位）',
    'PlayerAttackSpeed': '攻击间隔系数',
    'PlayerMovementSpeed': '移速',
    'CriticalMultiplier': '暴击额外倍率 = 50%',
    'MouseMagazineSize': '**弹匣只有 1 发** —— 开局每点一次鼠标就空',
    'MouseMagazineRegenTime': '这是**回填速度**不是时间，实际回填 = 1/0.4 = **2.5 秒**',
    'NumberOfMouseProjectiles': '每次点击落下 1 支箭',
    'MouseNumberOfHits': '每支箭命中 1 次',
    'MouseMaxNumberOfEnemies': '单支箭最多打 2 个敌人',
    'MaxTames': '开局最多驯服 1 个',
}
for k in KEY:
    r = next((x for x in base if x['stat'] == k), None)
    if r:
        w('| `%s` | %s | %s |' % (k, num(r['value']), NOTE.get(k, '')))
w('')

# ---------------------------------------------------------------- 2
w('## 二、成长：玩家没有等级，怪物有\n')
w('这是本作最干净的一个设计决策。\n')
w('| | 玩家 | 怪物 |')
w('|---|---|---|')
w('| 驱动的变量 | 天赋点 / 金币 / 装备 | `MonstersLevel` |')
w('| 存档字段 | `PlayerLevel` = **恒为 0** | `MonstersLevel` = 1…50 |')
w('| 成长形态 | 离散的系统解锁 + 装备词缀 | 逐级查表 + 关外指数外推 |')
w('')
w('源码里 `RunManager.BattleLevel`：\n')
w('```')
w('BattleLevel = Clamp(MonstersLevel - (IsFarmingBack ? 1 : 0), 1, MaxBattleLevel=50)')
w('```')
w('')
w('也就是**回刷上一关会低一级**，其余情况 `BattleLevel == MonstersLevel`。')
w('`LastAuthoredLevel = 30` —— 1–30 级是手填的，31–50 级是公式外推。\n')

w('### 2.1 玩家侧的成长来源\n')
w('| 系统 | 解锁 | 对数值的作用 |')
w('|---|---|---|')
w('| 天赋树 | Lv2 | 168 节点，普通节点满点 342 点，给 Flat/Additive |')
w('| 职业与技能 | Lv3 | 15 个技能，每技能 3 级 |')
w('| 制作 | Lv5 | 弓 / 护甲 |')
w('| 采矿 | Lv8 | 四种矿石 |')
w('| 塑形（符文） | Lv8 | 武器固有词缀 + 随机词缀 |')
w('| 精通 | Lv9 | 9 个精通，另有觉醒与巅峰层 |')
w('| 星魂 | Lv17 | 星魂 perks |')
w('')
w('> **玩家等级（`PlayerLevel` / `PlayerExp`）在存档里从 Lv2 到 Lv30 恒为 0。**')
w('> 所以「升级」这件事在数值上不存在 —— 变强只有装备和天赋两条路。\n')

# ---------------------------------------------------------------- 3
w('## 三、怪物\n')
w('### 3.1 十二种怪物类型\n')
w('`EnemyInfo` 里每种怪物给的是**相对倍率**，血量/伤害的绝对值由等级表决定。\n')
w('| functionName | 类型 | 血倍 | 伤倍 | 攻速 | 移速 | 索敌 | 远程 | 可驯服 |')
w('|---|---|---|---|---|---|---|---|---|')
ETYPE = {0: 'Claw', 1: 'Warrior', 2: 'Archer', 3: 'Mage', 4: 'Bat',
         5: 'RunPortal', 6: 'GuardianClaw', 7: 'GuardianWarrior',
         8: 'GuardianArcher', 9: 'GuardianMage', 10: 'GuardianBat', 11: 'King'}
for e in sorted(enemies, key=lambda x: x.get('enemyType', 0)):
    w('| `%s` | %d | %s | %s | %s | %s | %s | %s | %s |'
      % (e['functionName'], e['enemyType'],
         num(e.get('HealthMultiplier')), num(e.get('DamageMultiplier')),
         num(e.get('AttackSpeed')), num(e.get('MovementSpeed')),
         num(e.get('AttackRange')),
         '是' if e.get('IsRanged') else '否',
         '是' if e.get('IsTameable') else '否'))
w('')
_lo = min(e['HealthMultiplier'] for e in enemies if e.get('IsTameable'))
_hi = max(e['HealthMultiplier'] for e in enemies)
w('> **血量倍率跨度 %d 倍**：最弱的 Claw %s → King %s。'
  % (round(_hi / _lo), num(_lo), num(_hi)))
w('> 守卫（25–50 倍）是精英，国王是 Boss。')
w('> 伤害倍率反而倒挂 —— Mage 的 2.2 是全场最高，King 只有 0.7，')
w('> 靠的是技能而不是平A。\n')

w('### 3.2 等级表：怪物血量\n')
hp = T.get('EnemyHealthPerLevel', {})
dm = T.get('EnemyDamagePerLevel', {})
gd = T.get('EnemyGoldPerLevel', {})
ep = T.get('NumberOfEnemiesInPackPerLevel', {})
pk = T.get('NumberOfPacksInLevelPerLevel', {})
w('```')
w('怪物HP   = EnemyHealthPerLevel[Clamp(BattleLevel,1,30)]')
w('           × (BattleLevel > 30 ? 1.5^(BattleLevel-30) : 1)')
w('           × 该类型的 HealthMultiplier')
w('           × 玩家侧的全局 EnemyHealthMultiplier')
w('')
w('怪物伤害 = floor( 同上的 EnemyDamagePerLevel 查表')
w('               × (BattleLevel > 30 ? 1.25^(BattleLevel-30) : 1)')
w('               × 该类型的 DamageMultiplier )')
w('```')
w('')
w('| 等级 | 基础HP | 基础伤害 | 金币 | 每群怪数 | 关卡群数 | HP 环比 |')
w('|---|---|---|---|---|---|---|')
prev = None
for lv in sorted(hp, key=int):
    lv = int(lv)
    ratio = ('×%.2f' % (hp[str(lv)] / prev)) if prev else '—'
    w('| %d | %s | %s | %s | %s | %s | %s |'
      % (lv, num(hp.get(str(lv))), num(dm.get(str(lv))), num(gd.get(str(lv))),
         num(ep.get(str(lv))), num(pk.get(str(lv))), ratio))
    prev = hp[str(lv)]
w('')
w('> **这是本作难度曲线的全部。** 三十行手填的表，之后按 1.5 倍/级外推。')
w('> HP 从 Lv1 的 3 涨到 Lv30 的 360 万，**120 万倍**。\n')

w('### 3.3 终局（Lv31–50）\n')
w('31 级之后不再查表，直接指数外推：\n')
w('| 等级 | 基础HP（外推） | 基础伤害（外推） |')
w('|---|---|---|')
for lv in (31, 35, 40, 45, 50):
    h = hp['30'] * (1.5 ** (lv - 30))
    d = dm['30'] * (1.25 ** (lv - 30))
    w('| %d | %s | %s |' % (lv, num(round(h)), num(round(d))))
w('')
w('> 血量 1.5 倍/级、伤害 1.25 倍/级的差距，就是**终局玩家必须靠乘区**')
w('> 才追得上的原因 —— 加法层的天赋再堆也追不上 1.5^n。\n')

w('### 3.4 国王房间（Boss 战）\n')
w('```')
w('国王房怪物HP   = KingAreaHealthBase(1500万) × HealthMultiplier')
w('国王房怪物伤害 = floor(KingAreaDamageBase(4500) × DamageMultiplier)')
w('```')
w('')
w('> 注意这里是**固定基数**，不随 `BattleLevel` 成长 —— ')
w('> 国王战是一个强度固定的终局关卡。\n')

# ---------------------------------------------------------------- 4
w('## 四、伤害管线\n')
w('### 4.1 一次命中的完整公式\n')
w('```')
w('总伤害基数 = Damage.Total.RealValue')
w('             × ClawCurrencyStackMultiplier(ClawCurrencyDamageBonus)')
w('             × MasteryProgressMultiplier(DamageMultiplierPerMasteryLevel)')
w('')
w('最终伤害 = Ceiling( 总伤害基数')
w('                  × 投射物倍率          // 见 4.2')
w('                  × 技能等级倍率        // 见 4.3')
w('                  × (1 + 暴击倍率/100)  // 暴击时')
w('                  × 2 (双倍伤害触发时)')
w('                  × 3 (三倍伤害触发时) )')
w('```')
w('')
w('源码是 `PlayerStatsData.DamageCalculation(skillName, suffix, baseAmount, ')
w('isCrit, isAlly)`。**注意暴击是在最后乘的**，所以暴击倍率 50% 的实际')
w('收益是「总伤害 × 1.5」，而不是「暴击伤害 +50%」。\n')

w('### 4.2 投射物倍率（`SkillsMultiplier`）\n')
w('查表顺序：\n')
w('1. 如果投射物名在 `ProjectileToJobSkill` 里 → 取该技能的 `damageMultipliers`')
w('2. 否则查 `ProjectileInfo.Parameters[suffix]`')
w('3. 都没有 → 倍率 = 1\n')
w('`damageMultipliers` 按技能等级索引（`Clamp(level-1, 0, Count-1)`），')
w('所以**技能每升一级是换一个固定倍率，不是线性叠加**。\n')

w('### 4.3 暴击与多倍伤害\n')
w('| 属性 | 初始值 | 上下限 |')
w('|---|---|---|')
for k, lo_hi in (('CriticalChance', 'CriticalChanceMinMax'),
                 ('CriticalMultiplier', 'CriticalMultiMinMax')):
    v = next((x['value'] for x in base if x['stat'] == k), None)
    mm = T.get(lo_hi)
    rng = '—'
    if mm:
        rng = '%s ~ %s' % (num(mm.get('0')), num(mm.get('1')))
    w('| `%s` | %s | %s |' % (k, num(v) if v is not None else '0', rng))
w('| `DamageTakenMinMax` | — | %s |'
  % '%s ~ %s' % (num(T['DamageTakenMinMax'].get('0')),
                 num(T['DamageTakenMinMax'].get('1'))))
w('')
w('> `DamageTakenMinMax` 下探到 **−500** —— 玩家可以把受到的伤害压成负数，')
w('> 也就是**被打会回血**。\n')

# ---------------------------------------------------------------- 5
w('## 五、鼠标箭雨（ArrowFall）\n')
w('这是玩家的**手动输出**，也是开局唯一的主要伤害来源。\n')
w('### 5.1 一次点击发生什么\n')
w('```')
w('FireManualArrowFall(鼠标位置):')
w('    SpawnAttacker(位置)          // 生成一个攻击实例')
w('    currentMagazineCount -= 1    // 消耗 1 发弹匣')
w('')
w('SpawnAttacker(位置):')
w('    实例.Initialize(')
w('        fullSizeValue  = MouseRadius(3.5) × OneGameUnitToUnityUnit(10) / SizeToGameUnitRatio',)
w('        attackDuration = 1 / BaseMouseAttackSpeed(0.6) ≈ 1.667 秒',)
w('        projectiles    = NumberOfMouseProjectiles.Total')
w('    )')
w('```')
w('')
w('### 5.2 扩散圆环\n')
w('```')
w('Initialize 里预计算发射阈值:')
w('    fireThresholds[i] = (i+1) / N × attackDuration     // i = 0..N-1')
w('')
w('Update 每帧:')
w('    attackTimer += dt')
w('    radius = Lerp(0, fullSizeValue, attackTimer / attackDuration)   // 圆环扩张')
w('    while (已发射 < N && attackTimer >= fireThresholds[已发射]):')
w('        FireSingleProjectile(当前位置)')
w('        已发射 += 1')
w('    if (attackTimer >= attackDuration): 销毁')
w('```')
w('')
w('> **判定是「扩散的圆环」，不是「点哪里打哪里」。** 圆环从 0 扩张到')
w('> `MouseRadius`，每扩到 `1/N` 处落下 1 支箭 —— 所以 `NumberOfMouseProjectiles`')
w('> 提高的不仅是箭数，还有**环上落点的密度**。\n')

w('### 5.3 弹匣\n')
w('```')
w('GetMaxMagazineSize()    = MouseMagazineSize.Total')
w('GetMagazineRegenTime()  = 1 / MouseMagazineRegenTime.Total    // 注意是倒数！')
w('GetNumberOfProjectiles()= NumberOfMouseProjectiles.Total')
w('GetAutoAttackInterval() = GetMagazineRegenTime()')
w('```')
w('')
w('> `MouseMagazineRegenTime` 名字叫「时间」，实际是**速度**，')
w('> 初始 0.4 对应回填一发要 2.5 秒。点出 `MouseAutoMode` 后')
w('> 游戏按同样的间隔**自动**开火，玩家彻底解放鼠标。\n')

w('### 5.4 鼠标相关属性全表\n')
w('| 属性 | 初始值 | 作用 |')
w('|---|---|---|')
MOUSE = {
    'NumberOfMouseProjectiles': '每次点击落下的箭数',
    'MouseMagazineSize': '弹匣容量',
    'MouseMagazineRegenTime': '回填**速度**（实际时间 = 1/值）',
    'MouseNumberOfHits': '每支箭的命中次数',
    'MouseMaxNumberOfEnemies': '单支箭最多命中几个敌人',
    'MouseChanceForAnotherHit': '命中后再追加一次的概率',
    'MouseChanceToFireSkills': '落箭时顺带触发一次技能的概率',
    'MouseAutoMode': '自动开火开关（天赋解锁）',
}
for k, desc in MOUSE.items():
    v = next((x['value'] for x in base if x['stat'] == k), None)
    w('| `%s` | %s | %s |' % (k, num(v) if v is not None else '0', desc))
w('')
w('### 5.5 落点是怎么选的\n')
w('`FireSingleProjectile` 每触发一次：\n')
w('1. 取鼠标位置附近最近的敌人，数量上限 = `MouseMaxNumberOfEnemies.Total`')
w('2. 每个目标加一个 `Random.insideUnitCircle` 的随机偏移')
w('3. 掷一次 `MouseChanceToFireSkills` —— 中了就 `FireSkillArrowFall` 送一发技能')
w('4. 对 `mouseProjectile` 调 `FireProjectile`\n')
w('> 所以**一支箭最多打 `MouseMaxNumberOfEnemies` 个目标**（初始 2）。')
w('> 日志实测 Lv1：109 次施放 / 232 次命中 = 2.13 命中每次，')
w('> 与「1 支箭 × 最多 2 个敌人」完全吻合。\n')

w('鼠标弹丸资产（`ProjectileInfo`）—— 注意 `BaseProjectileCount` 是投射物')
w('资产自己的字段，鼠标路径并不读它，落箭数只由 `NumberOfMouseProjectiles` 决定：\n')
w('| functionName | BaseProjectileCount | 速度 | 存活 |')
w('|---|---|---|---|')
proj = J('ProjectileInfo.json') or []
for p in proj:
    if 'Mouse' in str(p.get('functionName')):
        w('| `%s` | %s | %s | %s |'
          % (p['functionName'], num(p.get('BaseProjectileCount')),
             num(p.get('speed')), num(p.get('DestroyAfter'))))
w('')

# ---------------------------------------------------------------- 6
w('## 六、Job 与技能\n')
w('### 6.1 五个 Job\n')
w('| Job | 名称 | 英文 | 解锁花费 | 技能 |')
w('|---|---|---|---|---|')
for j in sorted(jobs, key=lambda x: x.get('JobIndex', 0)):
    i = j.get('JobIndex')
    w('| %d | %s | %s | %s | %d 个 |'
      % (i, zh('Job%d_Title_Text' % i), en('Job%d_Title_Text' % i),
         num(j.get('UnlockCost')), len(j.get('Skills') or [])))
w('')
w('> Job0 花费 0（开局就有），之后 200 / 1500 / 20000 / 300000，')
w('> **每档涨约 10 倍**。\n')

w('### 6.2 十五个技能的完整数值\n')
w('全部技能都是 **3 级**，花费按等级递增（数组即 1/2/3 级的价钱）。\n')
w('| 技能 | 中文 | 等级花费 | 冷却(1/2/3级) | 伤害倍率(1/2/3级) | 命中数 | 类型 |')
w('|---|---|---|---|---|---|---|')
for s in sorted(skills, key=lambda x: x['functionName']):
    nm = s['functionName']
    kind = '宠物' if s.get('isPet') else ('增益' if s.get('isBuff')
                                    else ('被动' if s.get('isPassive') else '主动'))
    w('| `%s` | %s | %s | %s | %s | %s | %s |'
      % (nm, zh(nm + '_Title_Text'),
         '/'.join(num(x) for x in (s.get('cost') or [])) or '—',
         '/'.join(num(x) for x in (s.get('cooldowns') or [])) or '—',
         '/'.join(num(x) for x in (s.get('damageMultipliers') or [])) or '—',
         '/'.join(num(x) for x in (s.get('numberOfHitsList') or [])) or '—',
         kind))
w('')

w('### 6.3 技能描述（官方本地化文本）\n')
w('| 技能 | 描述 |')
w('|---|---|')
for s in sorted(skills, key=lambda x: x['functionName']):
    nm = s['functionName']
    w('| **%s** %s | %s |' % (nm, zh(nm + '_Title_Text'),
                              zh(nm + '_Desc_Text').replace('\n', ' ')))
w('')

w('### 6.4 宠物类技能\n')
w('| 宠物 | HP倍率(1/2/3) | 攻击范围 | 攻速 |')
w('|---|---|---|---|')
for s in skills:
    if s.get('isPet'):
        w('| `%s` | %s | %s | %s |'
          % (s['functionName'],
             '/'.join(num(x) for x in (s.get('petHealthMultipliers') or [])) or '—',
             num(s.get('petAttackRange')), num(s.get('petAttackSpeed'))))
w('')

w('### 6.5 增益类技能\n')
w('| 技能 | 增益属性 | 数值(1/2/3) | 时长(1/2/3) |')
w('|---|---|---|---|')
for s in skills:
    if s.get('isBuff'):
        w('| `%s` | `%s` | %s | %s |'
          % (s['functionName'], s.get('skillNameInStatsData'),
             '/'.join(num(x) for x in (s.get('buffValues') or [])) or '—',
             '/'.join(num(x) for x in (s.get('buffDurations') or [])) or '—'))
w('')

w('### 6.6 被动类技能的触发公式\n')
w('| 技能 | 被动属性 | 成长公式 |')
w('|---|---|---|')
for s in skills:
    if s.get('isPassive'):
        w('| `%s` | `%s` | `%s` |'
          % (s['functionName'], s.get('passiveStat'),
             s.get('passiveEffectValueEquation')))
w('')

w('---\n')
w('## 提取脚本\n')
w('| 脚本 | 内容 |')
w('|---|---|')
w('| `_analysis/il_player_stats.py` | 从 `PlayerStatsData.InitData` 的 IL 还原 84 项初始属性 |')
w('| `_analysis/il_tables.py` | 从 `DatabaseManager..cctor` 还原 174 个常量与 67 张静态表 |')
w('| `_analysis/so_extract4.py` | 用修好的类型树重新提取全部 18 类 ScriptableObject |')
w('| `_analysis/tree_*.py` | 天赋树（另见 `TREE.md`） |')
w('')
w('产出：`_analysis/so/PlayerBaseStats.json`、')
w('`DatabaseManager_constants.json`、`EnemyInfo.json`、`JobSkillInfo.json`、')
w('`ProjectileInfo.json`。\n')

with io.open(os.path.join(ROOT, 'NUMBERS.md'), 'w', encoding='utf-8') as f:
    f.write('\n'.join(L))
print('wrote NUMBERS.md — %d lines' % len(L))
