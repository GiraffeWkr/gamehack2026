"""Assemble the readable talent tree: resolve each node's effect + links.

tree_full.py got the raw TreeNodeInfo payloads. This resolves NodeStat PPtrs
to StatInfo.VariableName (that's the node's actual effect) and NodeConnections
to node IDs, then emits so/Tree_full.json plus a human-readable TREE.md.
"""
import os, json, collections

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator
from UnityPy.helpers.TypeTreeNode import TypeTreeNode
from UnityPy.helpers import TypeTreeHelper as TH

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
OUT = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(OUT, 'so')

env = UnityPy.load(D)
gen = TypeTreeGenerator('6000.0.79f1')
gen.load_local_dll_folder(os.path.join(D, 'Managed'))
env.typetree_generator = gen
objs = list(env.objects)


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


# --- TreeInfo ----------------------------------------------------------
tree_obj = None
for o in objs:
    if o.type.name != 'MonoBehaviour':
        continue
    try:
        t = o.read_typetree()
    except Exception:
        continue
    if isinstance(t, dict) and 'TreeNodes' in t:
        tree_obj, tree = o, t
        break
assert tree_obj is not None, 'TreeInfo not found'

FILE = tree_obj.assets_file
by_id = {o.path_id: o for o in objs if o.assets_file is FILE}
node_ids = [r['m_PathID'] for r in tree['TreeNodes']]

# --- StatInfo lookup (same assets file) --------------------------------
stat_type = gen.get_nodes_up('Assembly-CSharp', 'StatInfo')
fix_list_types(stat_type, [])
stat_root = TypeTreeNode(stat_type.m_Level, stat_type.m_Type, stat_type.m_Name,
                         stat_type.m_ByteSize, stat_type.m_Version,
                         stat_type.m_Children)

# --- node payloads -----------------------------------------------------
node_type = gen.get_nodes_up('Assembly-CSharp', 'TreeNodeInfo')
fix_list_types(node_type, [])
BASE = ('m_GameObject', 'm_Enabled', 'm_Script', 'm_Name')
node_type.m_Children = [c for c in node_type.m_Children if c.m_Name not in BASE]
node_root = TypeTreeNode(node_type.m_Level, node_type.m_Type, node_type.m_Name,
                         node_type.m_ByteSize, node_type.m_Version,
                         node_type.m_Children)

from UnityPy.helpers.Tpk import get_typetree_node
from UnityPy.enums import ClassIDType
MB_BASE = get_typetree_node(ClassIDType.MonoBehaviour, tree_obj.version)


def read_script(obj, root):
    obj.reset()
    TH.read_typetree(MB_BASE, obj.reader, as_dict=True, byte_size=None,
                     check_read=False, assetsfile=obj.assets_file)
    return TH.read_typetree(root, obj.reader, as_dict=True, byte_size=None,
                            check_read=False, assetsfile=obj.assets_file)


# Resolve only the StatInfos the nodes actually point at -- running the StatInfo
# tree over arbitrary objects in the file produces wandering reads whose
# garbage dicts still contain a 'VariableName' key.
def read_stat(pid):
    o = by_id.get(pid)
    if o is None:
        return 'StatInfo#%s' % pid
    o.reset()
    b = TH.read_typetree(MB_BASE, o.reader, as_dict=True, byte_size=None,
                         check_read=False, assetsfile=o.assets_file)
    return b.get('m_Name') or 'StatInfo#%s' % pid


nodes = {}
stat_names = {}
for pid in node_ids:
    o = by_id[pid]
    d = read_script(o, node_root, )
    stats = [stat_names.setdefault(s['m_PathID'], read_stat(s['m_PathID']))
             for s in (d.get('NodeStat') or [])]
    conns = [c['targetNode']['m_PathID'] for c in (d.get('NodeConnections') or [])]
    nodes[pid] = {
        'pathID': pid,
        'id': d.get('nodeID'),
        'nameKey': d.get('NodeName'),
        'descKey': d.get('NodeDescription'),
        'maxLevel': d.get('NodeMaxLevel'),
        'unlockBehavior': d.get('UnlockBehavior'),
        'requiredMonsterLevel': d.get('RequiredMonsterLevel'),
        'valueEq': d.get('NodeValueEquation'),
        'costEq': d.get('NodeCostEquation'),
        'stats': stats,
        'linksTo': conns,
        'pos': d.get('Position'),
        # NodeCostEquation is paid in whichever currency the node (or its
        # template, pathID 3411=Gold / 3412=PortalCurrency) declares.
        # 29 of the 168 nodes are gated behind PortalCurrency -- including
        # every system-unlock node.
        'costCurrency': (d.get('_nodeCostCurrencies') or [1])[0],
    }

id_of = {pid: n['id'] for pid, n in nodes.items()}
for n in nodes.values():
    n['linksToIDs'] = [id_of.get(p, 'PPtr#%s' % p) for p in n['linksTo']]
    n['linkedFrom'] = sorted(v['id'] for v in nodes.values()
                             if n['pathID'] in v['linksTo'])

ordered = sorted(nodes.values(),
                 key=lambda n: int(n['id'].split()[1].split('_')[0]))

with open(os.path.join(SO, 'Tree_full.json'), 'w', encoding='utf-8') as f:
    json.dump(ordered, f, ensure_ascii=False, indent=1)

# --- report ------------------------------------------------------------
print('\n=== node effects ===')
c = collections.Counter(s for n in ordered for s in n['stats'])
for s, k in c.most_common(30):
    print('   %-40s x%d' % (s, k))

print('\n=== value formulas ===')
c = collections.Counter(json.dumps(n['valueEq']) for n in ordered)
for s, k in c.most_common(20):
    print('   %-30s x%d' % (s, k))

print('\n=== cost formulas ===')
c = collections.Counter(json.dumps(n['costEq']) for n in ordered)
for s, k in c.most_common(20):
    print('   %-30s x%d' % (s, k))

print('\n=== max level ===')
print('   %s' % collections.Counter(n['maxLevel'] for n in ordered).most_common())

print('\n=== first 20 nodes ===')
print('%-20s %-6s %-22s %-14s %-22s %s'
      % ('nodeID', 'maxLv', 'effect', 'value', 'cost', 'links->'))
for n in ordered[:20]:
    print('%-20s %-6s %-22s %-14s %-22s %s'
          % (n['id'], n['maxLevel'], ','.join(n['stats'])[:22],
             ','.join(n['valueEq'])[:14], ','.join(n['costEq'])[:22],
             ','.join(x.split()[1].split('_')[0] for x in n['linksToIDs'])))
