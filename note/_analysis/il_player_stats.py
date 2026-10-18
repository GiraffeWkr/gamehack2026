"""Extract the player's base stat table from PlayerStatsData.InitData.

Pattern per stat:

    ldarg.0 ; ldstr "<Name>" ; ldc.i4 <StatsProp> ; <value> ; ldc.i4.1
    callvirt ChangeAStat

`value` is either an inline constant or `ldsfld <BaseXxx>` referring to a
DatabaseManager constant (those live in DatabaseManager_constants.json).
"""
import os, re, io, json, collections

HERE = os.path.dirname(os.path.abspath(__file__))
IL = os.path.join(HERE, 'so', 'PlayerStatsData_Init.il')
CONSTS = json.load(io.open(os.path.join(HERE, 'so',
                                        'DatabaseManager_constants.json'),
                           encoding='utf-8'))['scalars']

PROPS = ['Flat', 'Additive', 'Multiplicative']


def main():
    lines = io.open(IL, encoding='utf-8').read().split('\n')
    ins = []
    for ln in lines:
        m = re.match(r'\s+([0-9a-f]{4}): (\S+)\s*(.*)$', ln)
        if m:
            ins.append((m.group(2), m.group(3).strip()))

    rows, i = [], 0
    while i < len(ins):
        if ins[i][0] == 'ldstr' and i + 1 < len(ins):
            name = ins[i][1].strip('"')
            # ldc.i4 <prop>
            if ins[i + 1][0].startswith('ldc.i4'):
                prop = int(ins[i + 1][1] or 0) if ins[i + 1][1].strip().lstrip('-').isdigit() else 0
                j = i + 2
                val, valsrc = None, None
                op, arg = ins[j] if j < len(ins) else ('', '')
                if op == 'ldsfld':
                    val, valsrc = CONSTS.get(arg), arg
                elif op in ('ldc.r8', 'ldc.r4'):
                    val, valsrc = float(arg), None
                elif op.startswith('ldc.i4'):
                    val = int(arg) if arg.strip().lstrip('-').isdigit() else \
                        int(op.split('.')[-1]) if op[7:].isdigit() else 0
                    valsrc = None
                if val is not None and 'ChangeAStat' in ''.join(x[1] for x in ins[j:j + 4]):
                    rows.append({'stat': name,
                                 'prop': PROPS[prop] if prop < len(PROPS) else str(prop),
                                 'value': val,
                                 'from': valsrc})
            i += 1
        else:
            i += 1

    seen, uniq = set(), []
    for r in rows:
        k = (r['stat'], r['prop'])
        if k in seen:
            continue
        seen.add(k)
        uniq.append(r)

    print('parsed %d ChangeAStat calls, %d unique (stat,prop) pairs'
          % (len(rows), len(uniq)))

    out = os.path.join(HERE, 'so', 'PlayerBaseStats.json')
    with io.open(out, 'w', encoding='utf-8') as f:
        json.dump(uniq, f, ensure_ascii=False, indent=1)

    g = collections.defaultdict(dict)
    for r in uniq:
        g[r['stat']][r['prop']] = r['value']

    print('\n%-4s %-38s %-14s %-14s %s'
          % ('#', 'stat', 'Flat', 'Additive', 'source constant'))
    print('-' * 96)
    for n, (stat, d) in enumerate(g.items(), 1):
        src = next((r['from'] for r in uniq
                    if r['stat'] == stat and r['from']), '')
        print('%-4d %-38s %-14s %-14s %s'
              % (n, stat, d.get('Flat', '-'), d.get('Additive', '-'), src))
    print('\ntotal distinct base stats: %d' % len(g))


main()
