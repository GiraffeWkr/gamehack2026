"""Consolidate every extracted content asset into one readable report."""
import json, os, collections

SO = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'so')


def load(n):
    p = os.path.join(SO, n + '.json')
    return json.load(open(p, encoding='utf-8')) if os.path.exists(p) else []


out = []
W = out.append

# ---------------- JOBS ----------------
jobs = load('JobInfo')
skills = load('JobSkillInfo')
by_name = {s.get('functionName'): s for s in skills}

W('# Zad Archery 内容资产（从 ScriptableObject 还原）\n')

W('## 1. 五个 Job 的解锁花费\n')
W('| Job | 解锁花费 | 被动属性 | 被动值 | 技能 |')
W('|---|---|---|---|---|')
order = {0: 'Job0 弓箭手', 1: 'Job1 兽王', 2: 'Job2 狙击', 3: 'Job3 元素', 4: 'Job4 暗影'}
for j in sorted(jobs, key=lambda x: x.get('JobIndex', 99)):
    idx = j.get('JobIndex')
    sk = [s.get('m_PathID') for s in (j.get('Skills') or [])]
    W('| %s | **%s** | - | %s | %d 个 |'
      % (order.get(idx, idx), j.get('UnlockCost'), j.get('PassiveValue'), len(sk)))
W('')

# ---------------- SKILLS ----------------
W('## 2. 十五个技能的完整数值\n')
W('| 技能 | 最高等级 | 每级花费 | 冷却（每级） | 伤害倍率（每级） | 命中数（每级） | 类型 |')
W('|---|---|---|---|---|---|---|')
for s in skills:
    kind = ('宠物' if s.get('isPet') else
            '被动' if s.get('isPassive') else
            '增益' if s.get('isBuff') else '主动')
    W('| `%s` | %s | %s | %s | %s | %s | %s |' % (
        s.get('functionName'), s.get('maxLevel'),
        s.get('cost'), s.get('cooldowns'),
        [round(x, 2) for x in (s.get('damageMultipliers') or [])],
        s.get('numberOfHitsList'), kind))
W('')

# ---------------- MASTERY ----------------
W('## 3. 九个精通\n')
W('| # | 名称 | 最高等级 | 升级花费公式 | 主属性成长 | 觉醒值 | 巅峰效果 |')
W('|---|---|---|---|---|---|---|')
for m in sorted(load('MasteryInfo'), key=lambda x: x.get('MasteryIndex', 99)):
    W('| %s | `%s` | %s | `%s` | `%s` | %s | %s |' % (
        m.get('MasteryIndex'), m.get('functionName'), m.get('MaxLevel'),
        m.get('LevelUpCostEquation'), m.get('MainValueEquation'),
        m.get('AwakenValue'), m.get('PinnacleEffect')))
W('')

# ---------------- SHAPING WEAPONS ----------------
W('## 4. 六种塑形武器\n')
W('| 武器 | 伤害公式 | 冷却 | 索敌范围 | 增益属性 | 增益时长公式 |')
W('|---|---|---|---|---|---|')
for w in load('ShapingWeaponInfo'):
    W('| `%s` | `%s` | %s | %s | %s | `%s` |' % (
        w.get('functionName'), w.get('DamageMultiplierEquation'),
        w.get('Cooldown'), w.get('SeekRange'), w.get('BuffStat'),
        w.get('BuffDurationEquation')))
W('')

# ---------------- ENEMIES ----------------
W('## 5. 敌人（24 条）\n')
W('| functionName | 类型 | 攻速 | 移速 | 血倍 | 伤倍 | 远程 | 可驯服 |')
W('|---|---|---|---|---|---|---|---|')
for e in load('EnemyInfo'):
    W('| `%s` | %s | %s | %s | %s | %s | %s | %s |' % (
        e.get('functionName'), e.get('enemyType'), e.get('AttackSpeed'),
        e.get('MovementSpeed'), e.get('HealthMultiplier'),
        e.get('DamageMultiplier'), e.get('IsRanged'), e.get('IsTameable')))
W('')

# ---------------- RUNE AFFIXES ----------------
W('## 6. 符文词缀（%d 条）\n' % len(load('RuneStatInfo')))
W('| 词缀 | 类型 | 武器 | 目标 | 最小值 | 最大值 | 取整 | 概率 |')
W('|---|---|---|---|---|---|---|---|')
for r in sorted(load('RuneStatInfo'), key=lambda x: (str(x.get('Kind')), str(x.get('WeaponType')), str(x.get('functionName')))):
    W('| `%s` | %s | %s | %s | %s | %s | %s | %s |' % (
        r.get('functionName'), r.get('Kind'), r.get('WeaponType'),
        r.get('Target'), r.get('minValue'), r.get('maxValue'),
        r.get('RoundToNearest'), r.get('Chance')))
W('')

# ---------------- GUARDIAN PERKS ----------------
W('## 7. 守卫 Perk（%d 条）\n' % len(load('GuardianPerkInfo')))
for g in load('GuardianPerkInfo'):
    W('- `%s`  守卫=%s  OrderId=%s  Stats=%d  Values=%s' % (
        g.get('functionName'), g.get('GuardianType'), g.get('OrderId'),
        len(g.get('Stats') or []), g.get('Values')))
W('')

txt = '\n'.join(out)
open(os.path.join(SO, 'CONTENT_REPORT.md'), 'w', encoding='utf-8').write(txt)
print(txt[:3000])
print('\n... (%d chars total, wrote so/CONTENT_REPORT.md)' % len(txt))
