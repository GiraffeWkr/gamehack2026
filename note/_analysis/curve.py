"""Stat growth per level, read straight out of the save snapshots.

This is the player-side curve (what the build actually resolves to at each
MonstersLevel). The log-side curve is the enemy-side demand; the two together
show how the designer kept them matched.
"""
import json, glob, re, os

T = '$type'
OUT = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(OUT, 'lv*.json')),
               key=lambda p: int(re.search(r'lv(\d+)', p).group(1)))

WANT = ['Damage', 'Health', 'HealthRegen', 'AttackRange', 'PlayerAttackSpeed',
        'CriticalChance', 'CriticalMultiplier', 'ChanceForDoubleDamage',
        'GoldGained', 'ItemsRarity', 'PlayerMovementSpeed',
        'EnemyHealthMultiplier', 'Skills_DamageMultiplier', 'CraftingLuck']


def total(stats, name):
    v = (stats.get(name) or {}).get('Total') or {}
    return v.get('RealValue')


print('Lv  ' + ' '.join('%-12s' % w[:12] for w in WANT))
print('-' * (4 + 13 * len(WANT)))
prev = None
for f in files:
    lv = int(re.search(r'lv(\d+)', f).group(1))
    d = json.load(open(f, encoding='utf-8'))
    st = d['stats']
    row = [total(st, w) or 0 for w in WANT]
    print('%2d  ' % lv + ' '.join('%-12.4g' % x for x in row))

# --- growth ratios between consecutive snapshots ---
print('\n=== growth factor vs the previous snapshot ===')
print('Lv  ' + ' '.join('%-12s' % w[:12] for w in ['Damage', 'Health']))
last = None
for f in files:
    lv = int(re.search(r'lv(\d+)', f).group(1))
    d = json.load(open(f, encoding='utf-8'))
    cur = (total(d['stats'], 'Damage') or 0, total(d['stats'], 'Health') or 0)
    if last:
        r = tuple(c / l for c, l in zip(cur, last) if l)
        print('%2d  ' % lv + ' '.join('%-12s' % ('x%.3f' % x) for x in r))
    last = cur

print('\n=== monster-side difficulty, derived from the log-style totals ===')
print('(player Damage stat vs MonstersLevel)')
for f in files:
    lv = int(re.search(r'lv(\d+)', f).group(1))
    d = json.load(open(f, encoding='utf-8'))
    print('  Lv%-3d Damage=%-10.4g Health=%-10.4g EnemyHPx=%.3g '
          'EnemyDmgx=%.3g  Souls=%d'
          % (lv, total(d['stats'], 'Damage') or 0,
             total(d['stats'], 'Health') or 0,
             total(d['stats'], 'EnemyHealthMultiplier') or 0,
             total(d['stats'], 'EnemyDamageMultiplier') or 0,
             d['TotalMonstersKilled_FullGame']))
