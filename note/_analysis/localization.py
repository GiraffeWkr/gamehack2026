"""Pull the game's localization TextAsset out of sharedassets0.assets.

The chain is:

    level0: LocalizerManager (path_id 9374)
              .JsonDataText  -> PPtr(m_FileID=2, m_PathID=725)
    level0 externals[2] = sharedassets0.assets
    sharedassets0.assets#725  = TextAsset "LocalizationJson"  (588,996 bytes)

The TextAsset is plaintext, so no decryption is involved -- the earlier note
that it lived in an encrypted Addressables bundle was wrong (the only two
Addressables bundles hold a font and some materials).
"""
import os, io, json

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
objs = list(env.objects)

# --- find LocalizerManager in level0 -----------------------------------
lm = gen.get_nodes_up('Assembly-CSharp', 'LocalizerManager')
BASE = ('m_GameObject', 'm_Enabled', 'm_Script', 'm_Name')
lm.m_Children = [c for c in lm.m_Children if c.m_Name not in BASE]
lm_root = TypeTreeNode(lm.m_Level, lm.m_Type, lm.m_Name, lm.m_ByteSize,
                       lm.m_Version, lm.m_Children)

lvl0 = [o for o in objs if o.assets_file.name == 'level0']
MB = get_typetree_node(ClassIDType.MonoBehaviour, lvl0[0].version)
scope0 = {o.path_id: o for o in lvl0}

mgr = None
for o in lvl0:
    if o.type.name != 'MonoBehaviour':
        continue
    try:
        head = o.parse_monobehaviour_head()
        if head.m_Script.deref_parse_as_object().m_ClassName == 'LocalizerManager':
            mgr = o
            break
    except Exception:
        continue
assert mgr is not None, 'LocalizerManager not found in level0'
print('LocalizerManager at level0#%s' % mgr.path_id)

mgr.reset()
TH.read_typetree(MB, mgr.reader, as_dict=True, byte_size=None,
                 check_read=False, assetsfile=mgr.assets_file)
t = TH.read_typetree(lm_root, mgr.reader, as_dict=True, byte_size=None,
                     check_read=False, assetsfile=mgr.assets_file)
ref = t['JsonDataText']
print('JsonDataText -> FileID=%s PathID=%s' % (ref['m_FileID'], ref['m_PathID']))

# --- resolve the external file and read the TextAsset ------------------
path = mgr.assets_file.externals[ref['m_FileID'] - 1].path
print('resolves to %s' % path)
target = next(o.assets_file for o in objs if o.assets_file.name == path)
scope = {o.path_id: o for o in objs if o.assets_file is target}

ta = scope[ref['m_PathID']].read()
text = ta.m_Script
assert text, 'TextAsset is empty'
print('TextAsset %r: %d chars' % (ta.m_Name, len(text)))

with io.open(os.path.join(SO, 'Localization.json'), 'w', encoding='utf-8') as f:
    f.write(text)

data = json.loads(text)['LDataForJson']
print('entries: %d  languages: %d' % (
    len(data), len([k for k in data[0] if k.endswith('_Value')])))
