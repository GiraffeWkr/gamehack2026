"""Locate the content ScriptableObjects by their field names, not by script ref.

MonoScript PPtr resolution is unreliable here, but we know the exact field names
of every content class from the DLL (JobInfo.UnlockCost, TreeNodeInfo.NodeName,
SkillDetailInfo.StatValueCostEquations, ...). So: walk every object's type tree
and bucket it by which of those signature fields it carries.
"""
import collections, os, json, sys

import UnityPy

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
OUT = os.path.dirname(os.path.abspath(__file__))

# signature field -> the class it identifies
SIG = {
    'NodeCostEquation': 'TreeNodeInfo',
    'NodeValueEquation': 'TreeNodeInfo',
    'JobIndex': 'JobInfo',
    'MainValueEquation': 'MasteryInfo',
    'LevelUpCostEquation': 'MasteryInfo',
    'StatValueCostEquations': 'SkillDetailInfo',
    'skillNameInStatsData': 'JobSkillInfo',
    'RelatedSkill': 'SkillPowerInfo',
    'enemyType': 'EnemyInfo',
    'Implicits': 'RuneSavedData',
    'PinnacleEffect': 'MasteryInfo',
    'GuardianType': 'GuardianPerkInfo',
    'DamageMultiplierEquation': 'ShapingWeaponInfo',
    'IconIndex': 'RuneSavedData',
    'valueEquation': 'StatValueCostEquations',
    'functionName': 'StatInfo-ish',
    'TreeNodes': 'TreeInfo',
    'TreeName': 'TreeInfo',
}

env = UnityPy.load(D)
print('objects: %d' % len(env.objects))

buckets = collections.defaultdict(list)
scanned = 0
for obj in env.objects:
    if obj.type.name not in ('MonoBehaviour',):
        continue
    scanned += 1
    try:
        t = obj.read_typetree()
    except Exception:
        continue
    if not isinstance(t, dict):
        continue
    keys = set(t.keys())
    for field, cls in SIG.items():
        if field in keys:
            buckets[cls].append(obj)
            break

print('scanned %d MonoBehaviours\n' % scanned)
print('=== buckets by signature field ===')
for cls in sorted(buckets, key=lambda c: -len(buckets[c])):
    print('   %-24s x%d' % (cls, len(buckets[cls])))

os.makedirs(os.path.join(OUT, 'so'), exist_ok=True)
for cls, objs in buckets.items():
    dump = []
    for obj in objs[:400]:
        try:
            t = obj.read_typetree()
        except Exception:
            continue
        for k in ('m_Script', 'm_GameObject', 'm_ObjectHideFlags',
                  'm_CorrespondingSourceObject', 'm_PrefabInstance',
                  'm_PrefabAsset'):
            t.pop(k, None)
        dump.append(t)
    fn = os.path.join(OUT, 'so', cls.replace('-', '_') + '.json')
    with open(fn, 'w', encoding='utf-8') as f:
        json.dump(dump, f, ensure_ascii=False, indent=1, default=str)
    print('  wrote so/%s.json  (%d)' % (cls, len(dump)))
