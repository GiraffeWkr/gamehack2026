"""Dump every MonoScript (class name + assembly + pathID) from the serialized files.

MonoBehaviours reference their class through a MonoScript PPtr that may live in
another file, so we need a global pathID -> class-name index before we can
interpret any MonoBehaviour payload.
"""
import collections, os, json, sys

import UnityPy

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
OUT = os.path.dirname(os.path.abspath(__file__))
FILES = ['globalgamemanagers.assets', 'resources.assets', 'level0',
         'sharedassets0.assets']

index = {}           # (file, pathID) -> class name
by_name = collections.Counter()
rows = []

for fn in FILES:
    path = os.path.join(D, fn)
    if not os.path.exists(path):
        continue
    env = UnityPy.load(path)
    n = 0
    for obj in env.objects:
        if obj.type.name != 'MonoScript':
            continue
        try:
            ms = obj.read()
            cls = ms.m_ClassName
            asm = ms.m_AssemblyName
        except Exception as e:
            continue
        if not cls:
            continue
        index['%s:%d' % (fn, obj.path_id)] = cls
        by_name[cls] += 1
        rows.append((fn, obj.path_id, cls, asm))
        n += 1
    print('%-28s %d MonoScripts' % (fn, n))

print('\n=== %d distinct classes ===' % len(by_name))

CONTENT = ('Info', 'Tree', 'Job', 'Skill', 'Stat', 'Config', 'Mastery',
           'Rune', 'Item', 'Enemy', 'Weapon', 'Guardian', 'Ore', 'Mining')
interesting = sorted(c for c in by_name
                     if any(k in c for k in CONTENT)
                     and not c.startswith('<'))
print('\n=== content-relevant scripts (%d) ===' % len(interesting))
for c in interesting:
    print('   %-46s x%d' % (c, by_name[c]))

with open(os.path.join(OUT, 'monoscripts.txt'), 'w', encoding='utf-8') as f:
    for fn, pid, cls, asm in rows:
        f.write('%s\t%d\t%s\t%s\n' % (fn, pid, cls, asm))
with open(os.path.join(OUT, 'monoscript_index.json'), 'w', encoding='utf-8') as f:
    json.dump(index, f)
print('\nwrote monoscripts.txt + monoscript_index.json')
