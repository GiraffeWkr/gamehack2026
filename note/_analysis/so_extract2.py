"""Extract content ScriptableObjects using type trees generated from the DLL.

Release builds strip the type tree out of the serialized files, so a
MonoBehaviour is just an opaque blob until you can supply the field layout.
The build is Mono (not IL2CPP), so Assembly-CSharp.dll still carries full type
metadata -- UnityPy can turn that into the missing type trees.
"""
import collections, os, json, sys

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
MANAGED = os.path.join(D, 'Managed')
OUT = os.path.dirname(os.path.abspath(__file__))

env = UnityPy.load(D)
uv = '6000.0.79f1'          # from app.info / the SerializedFile headers
print('unity_version = %s' % uv)

gen = TypeTreeGenerator(uv)
gen.load_local_dll_folder(MANAGED)
env.typetree_generator = gen
print('type tree generator attached')

# a couple of objects should now yield a real field layout
ok = 0
sample = None
for obj in env.objects:
    if obj.type.name != 'MonoBehaviour':
        continue
    try:
        t = obj.read_typetree()
    except Exception:
        continue
    if isinstance(t, dict) and len(t) > 2 and 'm_Script' in t:
        ok += 1
        if sample is None:
            sample = t
print('MonoBehaviours with a usable type tree: %d' % ok)
if sample:
    print('sample keys:', list(sample.keys())[:16])
