"""Diff the balance-run saves to recover the system / skill unlock schedule."""
import json, glob, re, os

T = '$type'
OUT = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(OUT, 'lv*.json')),
               key=lambda p: int(re.search(r'lv(\d+)', p).group(1)))

print('=== SYSTEM UNLOCKS (first level where true) ===')
seen = {}
for f in files:
    lv = int(re.search(r'lv(\d+)', f).group(1))
    d = json.load(open(f, encoding='utf-8'))
    for k, v in d['UnlockedSystems'].items():
        if k == T:
            continue
        if v and k not in seen:
            seen[k] = lv
for k, lv in seen.items():
    print('  %-12s Lv.%d' % (k, lv))

print('\n=== RARITY UNLOCKS ===')
seen = {}
for f in files:
    lv = int(re.search(r'lv(\d+)', f).group(1))
    d = json.load(open(f, encoding='utf-8'))
    for k, v in d['IsUnlockedRarity'].items():
        if k == T:
            continue
        if v and k not in seen:
            seen[k] = lv
print('  ' + '   '.join('%s@Lv%d' % (k, v) for k, v in seen.items()))
d30 = json.load(open(os.path.join(OUT, 'lv30.json'), encoding='utf-8'))
print('  HighestRarityUnlocked =', d30['HighestRarityUnlocked'])

print('\n=== ORE UNLOCKS ===')
seen = {}
for f in files:
    lv = int(re.search(r'lv(\d+)', f).group(1))
    d = json.load(open(f, encoding='utf-8'))
    for k, v in d['MiningUnlockedOres'].items():
        if k == T:
            continue
        if v and k not in seen:
            seen[k] = lv
print('  ' + '   '.join('%s@Lv%d' % (k, v) for k, v in seen.items()))

print('\n=== JOB / ARCHER-TYPE UNLOCKS ===')
seen = {}
for f in files:
    lv = int(re.search(r'lv(\d+)', f).group(1))
    d = json.load(open(f, encoding='utf-8'))
    for k, v in d['IsUnlockedJobs'].items():
        if k == T:
            continue
        if v and k not in seen:
            seen[k] = lv
print('  ' + '   '.join('Job%s@Lv%d' % (k, v) for k, v in seen.items()))

print('\n=== SKILL UNLOCKS + LEVEL BY LEVEL ===')
skills = [k for k in d30['SkillsLevels'] if k != T]
print('Lv  ' + ' '.join('%-13s' % s for s in skills))
for f in files:
    lv = int(re.search(r'lv(\d+)', f).group(1))
    d = json.load(open(f, encoding='utf-8'))
    sl = d['SkillsLevels']
    print('%2d  ' % lv + ' '.join('%-13s' % (sl.get(s, 0) or '.') for s in skills))

print('\n=== MASTERY LEVELS BY LEVEL ===')
mast = [k for k in d30['MasteryLevels'] if k != T]
print('Lv  ' + ' '.join('%-9s' % m for m in mast))
for f in files:
    lv = int(re.search(r'lv(\d+)', f).group(1))
    d = json.load(open(f, encoding='utf-8'))
    ml = d.get('MasteryLevels', {})
    print('%2d  ' % lv + ' '.join('%-9s' % (ml.get(m, '.') or '.') for m in mast))

print('\n=== ARROW SKINS (unlocked at Lv30) ===')
print('  ' + ', '.join(k for k in d30['ArrowSkinUnlocked'] if k != T))

print('\n=== PORTAL CURRENCY PAID (entries) ===')
pc = d30['PortalCurrencyPaid']
print('  ' + ', '.join('%s=%s' % (k, v) for k, v in pc.items() if k != T))
