"""Rarity -> affix-budget mapping, and implicit/explicit split, across all saves."""
import json, glob, re, os, collections

T = '$type'
OUT = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(OUT, 'lv*.json')),
               key=lambda p: int(re.search(r'lv(\d+)', p).group(1)))

implicits = collections.defaultdict(collections.Counter)
explicits = collections.defaultdict(collections.Counter)
scroll_imp = collections.Counter()
scroll_exp = collections.Counter()
imp_value = collections.defaultdict(list)
exp_value = collections.defaultdict(list)


def scan(o):
    if not isinstance(o, dict):
        return
    if o.get(T, '').startswith(('RuneSavedData', 'ItemSavedData')):
        rar = o.get('Rarity', o.get('ItemRarity'))
        is_scroll = bool(o.get('IsScroll'))
        im = (o.get('Implicits') or {}).get('$values') or []
        ex = (o.get('Explicits') or {}).get('$values') or []
        if is_scroll:
            scroll_imp[len(im)] += 1
            scroll_exp[len(ex)] += 1
        else:
            implicits[rar][len(im)] += 1
            explicits[rar][len(ex)] += 1
            for s in im:
                imp_value[s['StatInfoFunctionName']].append(s['Value'])
            for s in ex:
                exp_value[s['StatInfoFunctionName']].append(s['Value'])
        # bow/armor carry a flat Stats list instead
        for st in (o.get('Stats') or {}).get('$values') or []:
            exp_value[st['StatInfoFunctionName']].append(st['Value'])
    for v in o.values():
        if isinstance(v, dict):
            scan(v)
        elif isinstance(v, list):
            for x in v:
                scan(x)


for f in files:
    scan(json.load(open(f, encoding='utf-8')))

print('=== IMPLICIT count by rarity (runes) ===')
for r in sorted(implicits, key=lambda x: (x is None, x)):
    print('  rarity %-5s  %s' % (r, dict(sorted(implicits[r].items()))))
print('=== EXPLICIT count by rarity (runes) ===')
for r in sorted(explicits, key=lambda x: (x is None, x)):
    print('  rarity %-5s  %s' % (r, dict(sorted(explicits[r].items()))))
print('\n=== SCROLL affix counts ===')
print('  implicits:', dict(scroll_imp), ' explicits:', dict(scroll_exp))

print('\n=== affix VALUE ranges (min .. max observed) ===')
for name in sorted(set(imp_value) | set(exp_value)):
    iv = imp_value.get(name) or []
    ev = exp_value.get(name) or []
    print('  %-40s implicit %-24s explicit %s' % (
        name,
        '%.3g..%.3g (n=%d)' % (min(iv), max(iv), len(iv)) if iv else '-',
        '%.3g..%.3g (n=%d)' % (min(ev), max(ev), len(ev)) if ev else '-'))
