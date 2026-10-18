"""Probe the Unity SerializedFiles for the ScriptableObject content assets.

The values we want (skill costs, job unlock costs, tree node equations) live on
ScriptableObjects, not in the DLL -- the DLL only gave us their shape. This
finds out which file actually carries them, and which script classes are present.
"""
import collections, sys, os

import UnityPy

D = r'I:\Game\Zad.Archery\Zad Archery_Data'
FILES = ['resources.assets', 'globalgamemanagers.assets', 'level0',
         'sharedassets0.assets']


def script_name(obj, env):
    """Resolve a MonoBehaviour's class name through its MonoScript reference."""
    try:
        tree = obj.read_typetree()
    except Exception:
        return None
    ref = tree.get('m_Script')
    if not ref:
        return None
    try:
        return env.objects[ref['m_PathID']].read().m_ClassName
    except Exception:
        return None


for fn in FILES:
    path = os.path.join(D, fn)
    if not os.path.exists(path):
        continue
    env = UnityPy.load(path)
    kinds = collections.Counter()
    scripts = collections.Counter()
    for obj in env.objects:
        kinds[obj.type.name] += 1
        if obj.type.name == 'MonoBehaviour':
            n = script_name(obj, env)
            if n:
                scripts[n] += 1
    print('=' * 72)
    print('%s  --  %d objects' % (fn, sum(kinds.values())))
    print('  by type:', dict(kinds.most_common(8)))
    interesting = [s for s in scripts if any(
        k in s for k in ('Info', 'Tree', 'Job', 'Skill', 'Stat', 'Config',
                         'Mastery', 'Rune', 'Item', 'Enemy', 'Weapon'))]
    print('  MonoBehaviour classes (%d distinct), content-relevant:' % len(scripts))
    for s in sorted(interesting):
        print('     %-40s x%d' % (s, scripts[s]))
