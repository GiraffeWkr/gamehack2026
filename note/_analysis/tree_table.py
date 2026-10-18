"""Build a readable table of all 168 talent-tree nodes from their raw payloads.

Each TreeNodeInfo blob contains, in order:
    Node_<n>            localization key for the name
    Node <n>_<hash>     nodeID  (matches TreeNodeLevels keys in the save)
    Node <n>            NodeName
    Description         localisation suffix
    <k>*x               NodeValueEquation  (value at level x)
    ...                 PPtrs / positions / flags
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

for o in objs:
    try:
        t = o.read_typetree()
    except Exception:
        continue
    if isinstance(t, dict) and 'TreeNodes' in t:
        node_ids = [r['m_PathID'] for r in t['TreeNodes']]
        break

STR = re.compile(rb'[\x20-\x7e]{2,80}')
ID_RE = re.compile(r'^Node (\d+)_([0-9a-f]{8})$')
KEY_RE = re.compile(r'^Node_(\d+)$')
EQ_RE = re.compile(r'^\d+(\.\d+)?\*x$|^\d+(\.\d+)?$')

rows = []
for pid in node_ids:
    o = by_id.get(pid)
    if o is None:
        continue
    raw = o.get_raw_data()
    strs = [m.group().decode('ascii') for m in STR.finditer(raw)]
    strs = [s for s in strs if s.strip()]

    node_id = name_key = name = None
    value_eq = []
    for i, s in enumerate(strs):
        m = ID_RE.match(s)
        if m and node_id is None:
            node_id = s
            if i >= 1 and KEY_RE.match(strs[i - 1]):
                name_key = strs[i - 1]
            if i + 1 < len(strs):
                name = strs[i + 1]
            continue
        if EQ_RE.match(s) and s not in ('100',):
            value_eq.append(s)
    rows.append({
        'pathID': pid, 'nodeID': node_id, 'nameKey': name_key,
        'name': name, 'valueEquation': value_eq,
    })

rows.sort(key=lambda r: int(re.search(r'\d+', r['nodeID'] or 'Node 0').group()))
with open(os.path.join(OUT, 'so', 'TreeNode_table.json'), 'w',
          encoding='utf-8') as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)

print('parsed %d nodes\n' % len(rows))
print('%-26s %-30s %s' % ('nodeID', 'name', 'valueEquation'))
print('-' * 78)
for r in rows[:45]:
    print('%-26s %-30s %s'
          % (r['nodeID'], r['name'] or r['nameKey'], ','.join(r['valueEquation'])))

eqs = collections.Counter(e for r in rows for e in r['valueEquation'])
print('\n=== value-equation distribution ===')
for e, c in eqs.most_common(30):
    print('   %-10s x%d' % (e, c))
