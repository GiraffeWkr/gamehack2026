"""Show how the scalar top-level fields move across the balance run."""
import json, glob, re, os

T = '$type'
OUT = os.path.dirname(os.path.abspath(__file__))
files = sorted(glob.glob(os.path.join(OUT, 'lv*.json')),
               key=lambda p: int(re.search(r'lv(\d+)', p).group(1)))

d30 = json.load(open(os.path.join(OUT, 'lv30.json'), encoding='utf-8'))
scalars = [k for k, v in d30.items()
           if isinstance(v, (int, float, bool)) and not k.startswith('$')]
print('Lv  ' + ' '.join('%-22s' % s for s in scalars))
for f in files:
    lv = int(re.search(r'lv(\d+)', f).group(1))
    d = json.load(open(f, encoding='utf-8'))
    print('%2d  ' % lv + ' '.join('%-22s' % d.get(s) for s in scalars))
