"""Resolve TreeInfo.TreeNodes PPtrs into real TreeNodeInfo objects.

PathIDs are only unique *within* a SerializedFile, so the lookup has to be
scoped to the file that owns the TreeInfo -- a global pathID map silently
returns unrelated objects.
"""
import os, json, glob

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
OUT = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(OUT, 'so')

FILES = ['resources.assets', 'globalgamemanagers.assets', 'level0',
         'sharedassets0.assets']


def clean(t):
    for k in ('m_Script', 'm_GameObject', 'm_ObjectHideFlags',
              'm_CorrespondingSourceObject', 'm_PrefabInstance',
              'm_PrefabAsset'):
        t.pop(k, None)
    return t


def attach(env):
    gen = TypeTreeGenerator('6000.0.79f1')
    gen.load_local_dll_folder(os.path.join(D, 'Managed'))
    env.typetree_generator = gen
    return env


tree_nodes = None
for fn in FILES:
    path = os.path.join(D, fn)
    if not os.path.exists(path):
        continue
    env = attach(UnityPy.load(path))
    objs = list(env.objects)
    by_id = {o.path_id: o for o in objs}

    tree = None
    for o in objs:
        if o.type.name != 'MonoBehaviour':
            continue
        try:
            t = o.read_typetree()
        except Exception:
            continue
        if isinstance(t, dict) and 'TreeNodes' in t:
            tree = t
            break
    if tree is None:
        print('%-28s no TreeInfo' % fn)
        continue

    print('%-28s TreeInfo found: TreeName=%s nodes=%d'
          % (fn, tree.get('TreeName'), len(tree['TreeNodes'])))

    nodes, missing = [], 0
    for r in tree['TreeNodes']:
        o = by_id.get(r['m_PathID'])
        if o is None:
            missing += 1
            continue
        try:
            nodes.append(clean(o.read_typetree()))
        except Exception:
            missing += 1
    print('%-28s resolved %d nodes (%d missing)' % ('', len(nodes), missing))
    if nodes:
        tree_nodes = nodes
        break

if not tree_nodes:
    raise SystemExit('no tree nodes resolved')

with open(os.path.join(SO, 'TreeNodeInfo.json'), 'w', encoding='utf-8') as f:
    json.dump(tree_nodes, f, ensure_ascii=False, indent=1, default=str)

n0 = tree_nodes[0]
print('\n=== node fields ===')
for k, v in n0.items():
    print('   %-30s %s' % (k, str(v)[:64]))

print('\n=== sample nodes ===')
for n in tree_nodes[:12]:
    print('  %-40s val=%-30s cost=%s'
          % (str(n.get('NodeName'))[:40],
             str(n.get('NodeValueEquation'))[:30],
             str(n.get('NodeCostEquation'))[:36]))
