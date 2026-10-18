"""Harvest naming pools out of the Unity serialized assets.

resources.assets carries the stat-modifier function names the tree/affixes are
built from (Flat_X / Additive_X / Multiplicative_X). level0 carries the scene's
GameObject and UI names. Both are just strings in the serialized data.
"""
import re, collections, os

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
OUT = os.path.dirname(os.path.abspath(__file__))

DROP = re.compile(r'^(m_|Unity|System|Microsoft|Mono|TMPro|Sirenix|Newtonsoft'
                  r'|DOTween|UnityEngine|UnityEditor|_|k)')


def words(fn, minlen=4):
    data = open(os.path.join(D, fn), 'rb').read()
    c = collections.Counter()
    for m in re.finditer(rb'[A-Za-z][A-Za-z0-9_]{%d,60}' % (minlen - 1), data):
        c[m.group().decode('ascii')] += 1
    return c


w = words('resources.assets')
mods = sorted(s for s in w if re.match(r'^(Flat|Additive|Multiplicative)_', s))
by_kind = collections.defaultdict(list)
for s in mods:
    kind, _, name = s.partition('_')
    by_kind[kind].append(name)

print('=== STAT MODIFIER FUNCTIONS in resources.assets ===')
for kind in ('Flat', 'Additive', 'Multiplicative'):
    lst = by_kind[kind]
    print('\n-- %s_  (%d) --' % (kind, len(lst)))
    for i in range(0, len(lst), 3):
        print('   ' + '  '.join('%-38s' % x for x in lst[i:i + 3]))

with open(os.path.join(OUT, 'assets_statfunctions.txt'), 'w',
          encoding='utf-8') as f:
    for s in mods:
        f.write(s + '\n')

# ---- level0: UI / scene object names ----
w0 = words('level0')
names = sorted(s for s in w0
               if not DROP.match(s) and not re.match(r'^[A-Z0-9_]{5,}$', s))
with open(os.path.join(OUT, 'assets_level0_names.txt'), 'w',
          encoding='utf-8') as f:
    for s in names:
        f.write(s + '\n')
print('\n\n=== level0 object/UI names: %d written to assets_level0_names.txt ==='
      % len(names))
