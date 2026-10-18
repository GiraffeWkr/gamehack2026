"""Document the stat aggregation model.

Each stat in the save is a StatsDouble with four buckets, each holding a
StatsValueDouble {SetOnlyValue, RealValue, Max, Min}:

    Flat                    -- base amount
    AdditiveIncreases       -- percent, added together, applied as (1 + sum/100)
    MultiplicativeIncreases -- product, applied directly (1.0 == x1)
    Total                   -- the resolved result the game actually reads

Worked example (Damage @ Lv30): 1712 x (1 + 75/100) x 1.0 = 2996  ->  matches
Total.RealValue exactly, which pins the combination order.
"""
import json, os

T = '$type'
OUT = os.path.dirname(os.path.abspath(__file__))
d = json.load(open(os.path.join(OUT, 'lv30.json'), encoding='utf-8'))
st = d['stats']


def rv(stat, bucket):
    b = stat.get(bucket) or {}
    return b.get('RealValue')


rows = []
for k, v in st.items():
    if k == T or not isinstance(v, dict):
        continue
    flat, add, mul, tot = (rv(v, b) for b in
                           ('Flat', 'AdditiveIncreases',
                            'MultiplicativeIncreases', 'Total'))
    if tot:
        rows.append((k, flat, add, mul, tot))

rows.sort(key=lambda r: -abs(r[4] or 0))
print('%-42s %14s %10s %10s %14s' % ('STAT', 'Flat', 'Add%', 'Mul', 'Total'))
print('-' * 92)
for k, flat, add, mul, tot in rows:
    print('%-42s %14.4g %10.3g %10.3g %14.4g' % (k, flat or 0, add or 0, mul or 0, tot))

print('\n  %d of %d stats resolve to a non-zero Total at Lv30'
      % (len(rows), len(st) - 1))

print('\n=== verification: does Flat*(1+Add/100)*Mul == Total ? ===')
bad = 0
for k, flat, add, mul, tot in rows:
    pred = (flat or 0) * (1 + (add or 0) / 100.0) * (mul if mul else 1.0)
    if abs(pred - tot) > max(1e-6, abs(tot) * 1e-6):
        bad += 1
        if bad <= 8:
            print('  MISMATCH %-40s pred=%.6g actual=%.6g' % (k, pred, tot))
print('  %d/%d match the formula exactly' % (len(rows) - bad, len(rows)))
