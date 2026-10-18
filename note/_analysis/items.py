"""Harvest every item/rune affix name and equipment structure from the saves."""
import json, glob, re, os, collections

T = '$type'
OUT = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(OUT, 'lv*.json')),
               key=lambda p: int(re.search(r'lv(\d+)', p).group(1)))

affix = collections.Counter()
rarity = collections.Counter()
weapon = collections.Counter()
rune_icons = collections.Counter()
scroll_count = 0
rune_count = 0


def scan_item(o):
    global scroll_count, rune_count
    if not isinstance(o, dict):
        return
    if o.get(T, '').startswith('RuneSavedData') or o.get(T, '').startswith('ItemSavedData'):
        rarity[o.get('Rarity')] += 1
        if 'WeaponType' in o:
            weapon[o['WeaponType']] += 1
        if o.get('IsScroll'):
            scroll_count += 1
        else:
            rune_count += 1
            rune_icons[o.get('IconIndex')] += 1
        for key in ('Implicits', 'Explicits'):
            for st in (o.get(key) or {}).get('$values', []) or []:
                if isinstance(st, dict):
                    affix[st.get('StatInfoFunctionName')] += 1
    for v in o.values():
        if isinstance(v, dict):
            scan_item(v)
        elif isinstance(v, list):
            for x in v:
                scan_item(x)


for f in files:
    d = json.load(open(f, encoding='utf-8'))
    scan_item(d)

print('=== UNIQUE AFFIX / STAT NAMES ON ITEMS (%d unique, %d total) ==='
      % (len(affix), sum(affix.values())))
for k, v in sorted(affix.items()):
    print('  %-46s x%d' % (k, v))

print('\n=== RARITY DISTRIBUTION ===')
for k, v in sorted(rarity.items(), key=lambda x: str(x[0])):
    print('  rarity %-6s x%d' % (k, v))

print('\n=== WEAPON TYPE DISTRIBUTION ===')
for k, v in sorted(weapon.items(), key=lambda x: str(x[0])):
    print('  weapon %-6s x%d' % (k, v))

print('\n=== RUNE ICON INDEX DISTRIBUTION ===')
for k, v in sorted(rune_icons.items(), key=lambda x: str(x[0])):
    print('  icon %-6s x%d' % (k, v))

print('\n  scrolls=%d  runes=%d' % (scroll_count, rune_count))

# ---- equipment / inventory shape ----
d = json.load(open(os.path.join(OUT, 'lv30.json'), encoding='utf-8'))
print('\n=== EQUIPMENT ===')
print(json.dumps(d['Equipment'], indent=1, ensure_ascii=False)[:1500])
print('\n=== INVENTORY keys ===')
inv = d['Inventory']
if '$values' in inv:
    print('  list of %d' % len(inv['$values']))
    for it in inv['$values'][:3]:
        print('  ', json.dumps(it, ensure_ascii=False)[:400])
else:
    for k, v in inv.items():
        if k != T:
            print('  %-22s %s' % (k, json.dumps(v, ensure_ascii=False)[:220]))
print('\n=== MiningSkillPowerLevels ===')
print(json.dumps(d['MiningSkillPowerLevels'], indent=1, ensure_ascii=False))
print('\n=== ActiveRuneScrolls / ActiveItemScrolls ===')
print(json.dumps(d['ActiveRuneScrolls'], ensure_ascii=False)[:600])
print(json.dumps(d['ActiveItemScrolls'], ensure_ascii=False)[:600])
print('\n=== PendingFirstCraftRarityBases ===')
print(json.dumps(d['PendingFirstCraftRarityBases'], ensure_ascii=False))
print('\n=== version / randomSeed ===')
print(d['version'], d['randomSeed'])
print('\n=== TotalCurrencyGained_FullGame ===')
print(json.dumps(d['TotalCurrencyGained_FullGame'], indent=1, ensure_ascii=False))
