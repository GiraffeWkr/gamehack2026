"""Extract the ScriptableObject content assets: jobs, skills, tree nodes, stats.

Loads the whole Data directory at once so that MonoScript PPtrs resolve across
files, then reads each content MonoBehaviour's type tree.
"""
import json, os, collections, sys

import UnityPy

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
OUT = os.path.dirname(os.path.abspath(__file__))

print('loading %s ...' % D)
env = UnityPy.load(D)
print('loaded: %d objects' % len(env.objects))

# map pathID -> MonoScript class name, built from the monobehaviour's m_Script
script_of = {}
found = collections.defaultdict(list)

for obj in env.objects:
    if obj.type.name != 'MonoBehaviour':
        continue
    try:
        tree = obj.read_typetree()
    except Exception:
        continue
    ref = tree.get('m_Script')
    if not ref:
        continue
    try:
        ms = obj.read().m_Script
        cls = getattr(ms, 'm_ClassName', None) or ms.read().m_ClassName
    except Exception:
        cls = None
    if not cls:
        continue
    found[cls].append(obj)

print('\n=== MonoBehaviour instances by class (content-relevant) ===')
CONTENT = ('Info', 'Tree', 'Job', 'Skill', 'Stat', 'Config', 'Mastery',
           'Rune', 'Item', 'Weapon', 'Guardian')
names = sorted(c for c in found if any(k in c for k in CONTENT))
for c in names:
    print('   %-40s x%d' % (c, len(found[c])))

WANT = ['TreeInfo', 'TreeNodeInfo', 'JobInfo', 'JobSkillInfo', 'SkillInfo',
        'SkillDetailInfo', 'SkillPowerInfo', 'StatInfo', 'MasteryInfo',
        'GuardianPerkInfo', 'ItemInfo', 'ItemStatsInfo', 'RuneStatInfo',
        'EnemyInfo', 'ShapingWeaponInfo']

os.makedirs(os.path.join(OUT, 'so'), exist_ok=True)
for cls in WANT:
    if cls not in found:
        continue
    dump = []
    for obj in found[cls]:
        try:
            t = obj.read_typetree()
        except Exception as e:
            continue
        t.pop('m_Script', None)
        t.pop('m_GameObject', None)
        dump.append(t)
    with open(os.path.join(OUT, 'so', cls + '.json'), 'w', encoding='utf-8') as f:
        json.dump(dump, f, ensure_ascii=False, indent=1, default=str)
    print('  wrote so/%-22s %d objects' % (cls + '.json', len(dump)))
