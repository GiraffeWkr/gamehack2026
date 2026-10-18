"""Resolve item affix pointers and pull the item-system static tables.

ItemStatsInfo.stat is a PPtr<StatInfo>; its m_FileID indexes the owning
file's externals, so the target is a *different* assets file than the one
holding the affix. Same scoping trap as the talent tree.
"""
import os, io, json, collections

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

from UnityPy.helpers.TypeTreeNode import TypeTreeNode
from UnityPy.helpers import TypeTreeHelper as TH
from UnityPy.helpers.Tpk import get_typetree_node
from UnityPy.enums import ClassIDType

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
HERE = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(HERE, 'so')

env = UnityPy.load(D)
gen = TypeTreeGenerator('6000.0.79f1')
gen.load_local_dll_folder(os.path.join(D, 'Managed'))
env.typetree_generator = gen
objs = list(env.objects)
MB = get_typetree_node(ClassIDType.MonoBehaviour, objs[0].version)

# A PPtr's m_FileID is an index into the *owning* file's externals, and 0
# means "this same file" -- so resolution must be done per owning file,
# not against one fixed assets file.
by_file = collections.defaultdict(dict)
for o in objs:
    by_file[o.assets_file.name][o.path_id] = o
print('files: %s' % sorted(by_file))


def resolve(owner_file, fid, pid):
    if fid == 0:
        target = owner_file.name
    else:
        ext = owner_file.externals[fid - 1].path
        target = getattr(ext, 'name', ext)
    o = by_file.get(target, {}).get(pid)
    if o is None:
        return 'StatInfo#%s@%s' % (pid, target)
    o.reset()
    b = TH.read_typetree(MB, o.reader, as_dict=True, byte_size=None,
                         check_read=False, assetsfile=o.assets_file)
    return b.get('m_Name')


# re-read the affixes keeping their owning file, since so_extract4 dropped it
from UnityPy.helpers.TypeTreeNode import TypeTreeNode as TTN
st_type = gen.get_nodes_up('Assembly-CSharp', 'ItemStatsInfo')
BASE = ('m_GameObject', 'm_Enabled', 'm_Script', 'm_Name')
kids = [c for c in st_type.m_Children if c.m_Name not in BASE]
st_root = TTN(st_type.m_Level, st_type.m_Type, st_type.m_Name,
              st_type.m_ByteSize, st_type.m_Version, kids)

TGT = {0: 'Both', 1: 'Bow', 2: 'Armor'}
out = []
for o in objs:
    if o.type.name != 'MonoBehaviour':
        continue
    try:
        if o.parse_monobehaviour_head().m_Script.deref_parse_as_object() \
                .m_ClassName != 'ItemStatsInfo':
            continue
    except Exception:
        continue
    o.reset()
    TH.read_typetree(MB, o.reader, as_dict=True, byte_size=None,
                     check_read=False, assetsfile=o.assets_file)
    x = TH.read_typetree(st_root, o.reader, as_dict=True, byte_size=None,
                         check_read=False, assetsfile=o.assets_file)
    st = x.get('stat') or {}
    out.append({
        'stat': resolve(o.assets_file, st.get('m_FileID'),
                        st.get('m_PathID')),
        'target': TGT.get(x.get('AppearsOn'), str(x.get('AppearsOn'))),
        'min': x.get('minValue'),
        'max': x.get('maxValue'),
        'chance': x.get('Chance'),
        'stackable': bool(x.get('isStackable')),
        'conditions': x.get('Conditions'),
    })

print('\n%-40s %-7s %-9s %-16s %s'
      % ('stat', 'target', 'chance', 'min~max', 'conditions'))
print('-' * 92)
for r in out:
    print('%-40s %-7s %-9s %-16s %s'
          % (r['stat'], r['target'], r['chance'],
             '%s~%s' % (r['min'], r['max']), r['conditions']))

with io.open(os.path.join(SO, 'ItemAffixes_resolved.json'), 'w',
             encoding='utf-8') as f:
    json.dump(out, f, ensure_ascii=False, indent=1)

print('\nunresolved: %d / %d'
      % (sum(1 for r in out if not r['stat'] or 'not in' in str(r['stat'])),
         len(out)))
