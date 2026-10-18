"""Dump the COMPLETE 168-node talent tree: effects, links, positions, gates.

tree_table.py only recovered nodeID + value equations by regexing raw bytes.
The real payload has far more: NodeStat (which StatInfo each node feeds),
NodeConnections (prerequisite links -> that's the tree shape), Position,
RequiredMonsterLevel, RequiredUnlockableSystem, NodeMaxLevel, NodeIcon.

Two traps had to be worked around to read these at all:

1. path_id is only unique *within* one assets file. This bundle has ~7000
   collisions, so the PPtr lookup must be scoped to the file holding the
   TreeInfo -- a global dict silently returns a different object and every
   read dies with EOFError.

2. UnityPy's DLL-driven TypeTreeGenerator types `List<string>` fields as
   `string` instead of `vector`. `read_value` dispatches on m_Type first and
   `string` is in FUNCTION_READ_MAP, so the field got decoded as a scalar
   string and every node after it was read from the wrong offset.
   A genuine `string` has an Array child whose data node is `char`; a
   List<string> has one whose data node is `string`. That difference is the
   repair rule below.
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

env = UnityPy.load(D)
gen = TypeTreeGenerator('6000.0.79f1')
gen.load_local_dll_folder(os.path.join(D, 'Managed'))
env.typetree_generator = gen
print('objects: %d' % len(env.objects))

objs = list(env.objects)


def fix_list_types(node, fixed):
    """Re-type container nodes the generator mislabelled with a scalar type."""
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


# --- locate the TreeInfo and follow its TreeNodes PPtr list -------------
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

if tree_obj is None:
    raise SystemExit('TreeInfo not found')
print('TreeInfo "%s" in %s' % (tree.get('TreeName'), tree_obj.assets_file.name))

by_id = {o.path_id: o for o in objs if o.assets_file is tree_obj.assets_file}
node_ids = [r['m_PathID'] for r in tree['TreeNodes']]
print('  %d nodes' % len(node_ids))

# --- read every node in full -------------------------------------------
node_type = gen.get_nodes_up('Assembly-CSharp', 'TreeNodeInfo')
fixed = []
fix_list_types(node_type, fixed)
print('re-typed %d container fields: %s' % (len(fixed), fixed))

BASE = ('m_GameObject', 'm_Enabled', 'm_Script', 'm_Name')
node_type.m_Children = [c for c in node_type.m_Children
                        if c.m_Name not in BASE]
script_root = TypeTreeNode(node_type.m_Level, node_type.m_Type,
                           node_type.m_Name, node_type.m_ByteSize,
                           node_type.m_Version, node_type.m_Children)

# Read the 4 base fields with UnityPy's own MonoBehaviour node (it carries the
# alignment flags the DLL-driven generator omits), then the script fields.
# byte_size must stay None: passing it makes TypeTreeHelper slurp the whole
# object off the reader before parsing, so a second read starts at EOF.
BASE_NODE = get_typetree_node(ClassIDType.MonoBehaviour, tree_obj.version)

rows, failed = [], []
for pid in node_ids:
    o = by_id.get(pid)
    if o is None:
        failed.append((pid, 'no object'))
        continue
    try:
        o.reset()
        TH.read_typetree(BASE_NODE, o.reader, as_dict=True, byte_size=None,
                         check_read=False, assetsfile=o.assets_file)
        d = TH.read_typetree(script_root, o.reader, as_dict=True,
                             byte_size=None, check_read=False,
                             assetsfile=o.assets_file)
        rows.append(dict(d, pathID=pid))
    except Exception as e:
        failed.append((pid, repr(e)[:100]))

print('parsed %d / failed %d' % (len(rows), len(failed)))
for pid, err in failed[:5]:
    print('   FAIL %s %s' % (pid, err))

if not rows:
    raise SystemExit('nothing parsed')

with open(os.path.join(SO, 'TreeNodeInfo_full.json'), 'w',
          encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=1, default=str)

# --- sanity: the strings we already knew from the raw-byte pass ---------
print('\n=== cross-check against tree_table.py ===')
old = {r['pathID']: r for r in json.load(
    open(os.path.join(SO, 'TreeNode_table.json'), encoding='utf-8'))}
agree = disagree = 0
for r in rows:
    o = old.get(r['pathID'])
    if not o:
        continue
    if o['nodeID'] == r.get('nodeID') and o['valueEquation'] == r.get('NodeValueEquation'):
        agree += 1
    else:
        disagree += 1
        if disagree <= 5:
            print('   MISMATCH %s: regex=%r/%r typed=%r/%r'
                  % (r['pathID'], o['nodeID'], o['valueEquation'],
                     r.get('nodeID'), r.get('NodeValueEquation')))
print('agree=%d disagree=%d' % (agree, disagree))

# --- summary ------------------------------------------------------------
print('\n=== shape of the tree ===')
print('  with NodeStat (effect)   : %d' % sum(1 for r in rows if r.get('NodeStat')))
print('  with NodeConnections     : %d' % sum(len(r.get('NodeConnections') or []) for r in rows))
print('  positions present        : %d' % sum(1 for r in rows if r.get('Position')))
print('  NodeMaxLevel             : %s' % collections.Counter(r.get('NodeMaxLevel') for r in rows).most_common())
print('  UnlockBehavior           : %s' % collections.Counter(r.get('UnlockBehavior') for r in rows).most_common())
print('  RequiredMonsterLevel     : %s' % sorted(collections.Counter(r.get('RequiredMonsterLevel') for r in rows).items())[:14])
print('  RequiredUnlockableSystem : %s' % collections.Counter(r.get('RequiredUnlockableSystem') for r in rows).most_common(12))
print('  cost equations           : %s' % collections.Counter(
    json.dumps(r.get('NodeCostEquation')) for r in rows).most_common(6))

print('\n=== first 10 nodes ===')
for r in rows[:10]:
    print('  %-22s %-10s maxLv=%-3s monLv=%-3s stat=%s conn=%s pos=%s val=%s cost=%s'
          % (r.get('nodeID'), r.get('NodeName'), r.get('NodeMaxLevel'),
             r.get('RequiredMonsterLevel'), r.get('NodeStat'),
             r.get('NodeConnections'), r.get('Position'),
             r.get('NodeValueEquation'), r.get('NodeCostEquation')))
