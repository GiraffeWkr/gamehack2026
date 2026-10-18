"""Re-extract every ScriptableObject content asset with the fixed pipeline.

so_extract3.py used read_typetree() wholesale. That works for a whole-object
read (read_typetree resets first), but it inherits UnityPy's DLL type-tree bug:
`List<string>` fields get typed `string`, which read_value dispatches to the
scalar string reader, so everything after the field shifted and the class
silently produced garbage (EnemyInfo came out as 12 real rows + 12 all-None
duplicates; TreeNodeInfo produced 168 rows of UI mesh components).

Fix, same as tree_full.py: retype any node whose sole child is an `Array`
whose data node is not `char` (a genuine string's data node is `char`).
"""
import os, json, collections

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from UnityPy.helpers.TypeTreeNode import TypeTreeNode
from UnityPy.helpers import TypeTreeHelper as TH
from UnityPy.helpers.Tpk import get_typetree_node
from UnityPy.enums import ClassIDType

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
OUT = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(OUT, 'so')
os.makedirs(SO, exist_ok=True)

CLASSES = [
    'EnemyInfo', 'EnemyProjectileInfo', 'ProjectileInfo',
    'JobInfo', 'JobSkillInfo', 'SkillDetailInfo', 'SkillInfo', 'SkillPowerInfo',
    'MasteryInfo', 'GuardianPerkInfo',
    'ItemInfo', 'ItemStatsInfo', 'RuneStatInfo', 'ShapingWeaponInfo',
    'StatInfo', 'TreeInfo', 'TreeNodeInfo', 'TreeNodeTemplate',
]

env = UnityPy.load(D)
gen = TypeTreeGenerator('6000.0.79f1')
gen.load_local_dll_folder(os.path.join(D, 'Managed'))
env.typetree_generator = gen
objs = list(env.objects)
print('objects: %d' % len(objs))

BASE = ('m_GameObject', 'm_Enabled', 'm_Script', 'm_Name')


def fix_list_types(node, fixed):
    kids = node.m_Children or []
    if len(kids) == 1 and kids[0].m_Type == 'Array':
        arr = kids[0]
        if arr.m_Children and len(arr.m_Children) == 2:
            data = arr.m_Children[1]
            if data.m_Type != 'char' and node.m_Type not in ('vector', 'Array'):
                fixed.append((node.m_Name, node.m_Type, data.m_Type))
                node.m_Type = 'vector'
    for k in kids:
        fix_list_types(k, fixed)


# Build one script-root typetree per class, with the base fields stripped.
roots, repairs = {}, {}
for cls in CLASSES:
    try:
        t = gen.get_nodes_up('Assembly-CSharp', cls)
    except Exception as e:
        print('  %-22s type tree FAILED: %s' % (cls, repr(e)[:60]))
        continue
    fx = []
    fix_list_types(t, fx)
    repairs[cls] = fx
    t.m_Children = [c for c in t.m_Children if c.m_Name not in BASE]
    roots[cls] = TypeTreeNode(t.m_Level, t.m_Type, t.m_Name, t.m_ByteSize,
                              t.m_Version, t.m_Children)

print('\n=== List<string>-style repairs ===')
for cls, fx in repairs.items():
    if fx:
        print('  %-22s %s' % (cls, fx))

# --- read every MonoBehaviour, classify by its MonoScript --------------
MB = get_typetree_node(ClassIDType.MonoBehaviour, objs[0].version)
buckets = collections.defaultdict(list)
unreadable = collections.Counter()

for o in objs:
    if o.type.name != 'MonoBehaviour':
        continue
    try:
        head = o.parse_monobehaviour_head()
        cls = head.m_Script.deref_parse_as_object().m_ClassName
    except Exception:
        unreadable['head'] += 1
        continue
    if cls not in roots:
        continue
    try:
        o.reset()
        TH.read_typetree(MB, o.reader, as_dict=True, byte_size=None,
                         check_read=False, assetsfile=o.assets_file)
        d = TH.read_typetree(roots[cls], o.reader, as_dict=True,
                             byte_size=None, check_read=False,
                             assetsfile=o.assets_file)
        buckets[cls].append(dict(d, _pathID=o.path_id,
                                 _file=o.assets_file.name))
    except Exception as e:
        unreadable[cls] += 1

print('\n=== extracted ===')
for cls in sorted(buckets, key=lambda c: -len(buckets[c])):
    print('  %-22s %3d   (failed %d)' % (cls, len(buckets[cls]),
                                         unreadable.get(cls, 0)))
if unreadable:
    print('  head failures: %d' % unreadable.get('head', 0))

for cls, rows in buckets.items():
    with open(os.path.join(SO, cls + '.json'), 'w', encoding='utf-8') as f:
        json.dump(rows, f, ensure_ascii=False, indent=1, default=str)

# --- sanity checks against things we already know ----------------------
print('\n=== sanity ===')
en = buckets.get('EnemyInfo', [])
if en:
    names = [e.get('functionName') for e in en]
    print('  EnemyInfo: %d rows, %d distinct names, %d null-name rows'
          % (len(en), len(set(names)), sum(1 for n in names if not n)))
    print('    %s' % names)
print('  TreeInfo: %d' % len(buckets.get('TreeInfo', [])))
print('  TreeNodeInfo: %d' % len(buckets.get('TreeNodeInfo', [])))
