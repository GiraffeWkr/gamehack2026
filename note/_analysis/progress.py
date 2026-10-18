"""Decode every balance-run save and print the progression curve."""
import sys, json, glob, re, os
sys.path.insert(0, os.path.join(os.path.dirname(__file__), '..', 'ZadTools'))
from zad_save import Save

T = '$type'
OUT = os.path.dirname(os.path.abspath(__file__))
rows = []

files = glob.glob(os.path.join(OUT, '..', 'zad_balance_seed*.su'))
files.sort(key=lambda p: int(re.search(r'Lv(\d+)', p).group(1)))

for f in files:
    lv = int(re.search(r'Lv(\d+)', f).group(1))
    s = Save(f)
    with open(os.path.join(OUT, 'lv%d.json' % lv), 'w', encoding='utf-8') as fh:
        fh.write(s.text)
    d = json.loads(s.text)

    t = d['TreeNodeLevels']
    nodes = sum(1 for k, v in t.items() if k != T and v > 0)
    pts = sum(v for k, v in t.items() if k != T)
    sk = d['SkillsLevels']
    skl = sum(v for k, v in sk.items() if k != T and v > 0)
    rows.append(dict(
        lv=lv, nodes=nodes, pts=pts, skl=skl,
        craft=d['CraftingLevel'], mine=d['MiningLevel'],
        shape=d['ShapingLevel'], mast=d['MasteryLevel'],
        monlv=d['MonstersLevel'], gold=d['PlayerGold'],
        kills=d['TotalMonstersKilled_FullGame'],
        deaths=d['TotalDeaths_FullGame'],
        mins=d['SecondsPlayed_FullGame'] / 60.0,
        total_items=d['TotalItemsCrafted'], total_runes=d['TotalRunesCreated'],
        played=d['TotalTimePlayed'] / 60.0,
    ))

hdr = ('Lv  TreeNd TreePt SkillLv Craft Mine Shap Mast MonLv'
       '     PlayerGold   Kills Deaths   Min  Items Runes')
print(hdr)
print('-' * len(hdr))
for r in rows:
    print('%2d  %5d %6d %6d %5d %4d %4d %4d %5d %14.4g %5d %6d %6.1f %5d %5d' % (
        r['lv'], r['nodes'], r['pts'], r['skl'], r['craft'], r['mine'],
        r['shape'], r['mast'], r['monlv'], r['gold'], r['kills'],
        r['deaths'], r['mins'], r['total_items'], r['total_runes']))

# currency snapshot at the final level, to see which currencies exist
last = json.load(open(os.path.join(OUT, 'lv%d.json' % rows[-1]['lv']), encoding='utf-8'))
print('\n=== currency at Lv%d ===' % rows[-1]['lv'])
for k, v in last.items():
    if k.startswith('Player') and isinstance(v, float):
        print('  %-26s %g' % (k, v))
