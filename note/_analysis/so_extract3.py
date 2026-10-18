"""Full content extraction: jobs, skills, tree nodes, mastery, stats, affixes.

With type trees generated from Assembly-CSharp.dll we can finally parse the
ScriptableObject payloads and read the actual design values (unlock costs,
level cost arrays, growth equations, node descriptions).
"""
import collections, os, json

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
MANAGED = os.path.join(D, 'Managed')
OUT = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(OUT, 'so')
os.makedirs(SO, exist_ok=True)

env = UnityPy.load(D)
gen = TypeTreeGenerator('6000.0.79f1')
gen.load_local_dll_folder(MANAGED)
env.typetree_generator = gen
print('generator attached; %d objects' % len(env.objects))

# resolve class name via the MonoScript the object points at
def class_of(obj, tree):
    ref = tree.get('m_Script')
    if not ref:
        return None
    try:
        ms = env.objects  # noqa
        for o in [obj]:
            pass
        m = obj.read().m_Script
        return getattr(m, 'm_ClassName', None) or m.read().m_ClassName
    except Exception:
        return None


# signature fields -> class, as a fallback when the script ref won't resolve
SIG = [
    ('NodeCostEquation', 'TreeNodeInfo'),
    ('TreeNodes', 'TreeInfo'),
    ('JobIndex', 'JobInfo'),
    ('skillNameInStatsData', 'JobSkillInfo'),
    ('RelatedSkill', 'SkillPowerInfo'),
    ('StatValueCostEquations', 'SkillDetailInfo'),
    ('LevelUpCostEquation', 'MasteryInfo'),
    ('enemyType', 'EnemyInfo'),
    ('GuardianType', 'GuardianPerkInfo'),
    ('DamageMultiplierEquation', 'ShapingWeaponInfo'),
    ('AppearsOn', 'ItemStatsInfo'),
    ('Kind', 'RuneStatInfo'),
    ('CommonName', 'StatInfo'),
    ('functionName', 'Named'),
]

buckets = collections.defaultdict(list)
unresolved = 0
for obj in env.objects:
    if obj.type.name != 'MonoBehaviour':
        continue
    try:
        t = obj.read_typetree()
    except Exception:
        unresolved += 1
        continue
    if not isinstance(t, dict):
        continue
    keys = set(t.keys())
    hit = None
    for field, cls in SIG:
        if field in keys:
            hit = cls
            break
    if hit:
        for k in ('m_Script', 'm_GameObject', 'm_ObjectHideFlags',
                  'm_CorrespondingSourceObject', 'm_PrefabInstance',
                  'm_PrefabAsset'):
            t.pop(k, None)
        buckets[hit].append(t)

print('unreadable: %d\n' % unresolved)
print('=== buckets ===')
for cls in sorted(buckets, key=lambda c: -len(buckets[c])):
    print('   %-24s x%d' % (cls, len(buckets[cls])))

for cls, rows in buckets.items():
    with open(os.path.join(SO, cls + '.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1, default=str)

# --- quick look at the three questions the user asked ---
print('\n' + '=' * 70)
print('JOB 解锁花费 / 技能等级花费')
for j in buckets.get('JobInfo', []):
    print('  JobIndex=%s  UnlockCost=%s  Skills=%d  PassiveStat=%s x%s'
          % (j.get('JobIndex'), j.get('UnlockCost'),
             len(j.get('Skills') or []),
             j.get('PassiveStat'), j.get('PassiveValue')))

print('\n' + '=' * 70)
print('SKILL 详细（伤害/花费/解锁）')
for s in buckets.get('SkillDetailInfo', [])[:20]:
    eqs = s.get('StatValueCostEquations') or []
    print('  %-28s unlockLv=%-4s unlockCost=%-8s order=%-3s stats=%d'
          % (s.get('functionName'), s.get('UnlockLevel'),
             s.get('UnlockCost'), s.get('OrderOfAppearance'), len(eqs)))
    for e in eqs[:6]:
        print('        value=%-24s cost=%s'
              % (e.get('valueEquation'), e.get('costEquation')))

print('\n' + '=' * 70)
print('TREE 节点（前 15）')
for n in buckets.get('TreeNodeInfo', [])[:15]:
    print('  %-34s value=%-30s cost=%s'
          % (n.get('NodeName'), n.get('NodeValueEquation'),
             n.get('NodeCostEquation')))
