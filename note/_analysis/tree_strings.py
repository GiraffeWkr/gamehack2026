"""Pull the 168 tree nodes' name/description strings out of their raw payloads.

UnityPy can't build a matching type tree for TreeNodeInfo (the generator emits
non-serialized private fields, so the layout misaligns and every read EOFs).
But the field *data* is still in the object blob -- and NodeName / NodeDescription
/ the equation strings are length-prefixed ASCII, so we can recover them by
scanning the raw bytes.
"""
import os, re, json, collections

import UnityPy
from UnityPy.helpers.TypeTreeGenerator import TypeTreeGenerator

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
OUT = os.path.dirname(os.path.abspath(__file__))

env = UnityPy.load(os.path.join(D, 'sharedassets0.assets'))
gen = TypeTreeGenerator('6000.0.79f1')
gen.load_local_dll_folder(os.path.join(D, 'Managed'))
env.typetree_generator = gen

objs = list(env.objects)
by_id = {o.path_id: o for o in objs}

# locate TreeInfo (readable) to get the 168 node pathIDs
node_ids = None
for o in objs:
    try:
        t = o.read_typetree()
    except Exception:
        continue
    if isinstance(t, dict) and 'TreeNodes' in t:
        node_ids = [r['m_PathID'] for r in t['TreeNodes']]
        break
assert node_ids, 'TreeInfo not found'
print('%d node references' % len(node_ids))

STR = re.compile(rb'[\x20-\x7e]{2,80}')

rows = []
for pid in node_ids:
    o = by_id.get(pid)
    if o is None:
        continue
    raw = o.get_raw_data()
    # Unity stores strings as int32 length + bytes, 4-byte aligned
    strs = []
    for m in STR.finditer(raw):
        s = m.group().decode('ascii')
        if s.strip():
            strs.append(s)
    # heuristics: keep the ones that look like keys/equations/identifiers
    rows.append({'pathID': pid, 'size': len(raw), 'strings': strs})

print('scanned %d node objects\n' % len(rows))

# aggregate: what do the strings look like overall?
allstr = collections.Counter()
for r in rows:
    for s in r['strings']:
        allstr[s] += 1
print('=== most common strings across all nodes ===')
for s, c in allstr.most_common(40):
    print('   %-58s x%d' % (s, c))

print('\n=== sample node payload ===')
for r in rows[:3]:
    print('  pathID %d  (%d bytes)' % (r['pathID'], r['size']))
    for s in r['strings'][:22]:
        print('        %s' % s)

with open(os.path.join(OUT, 'so', 'TreeNode_rawstrings.json'), 'w',
          encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
print('\nwrote so/TreeNode_rawstrings.json')
