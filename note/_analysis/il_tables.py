"""Recover the static lookup tables DatabaseManager builds in its .cctor.

The game's difficulty curve is not a ScriptableObject -- it's four static
fields built in IL:

    EnemyHealthPerLevel : Dictionary<int,double>   level -> base HP
    EnemyDamagePerLevel : Dictionary<int,double>   level -> base damage

plus scalars LastAuthoredLevel / EndgameHealthGrowthPerLevel /
EndgameDamageGrowthPerLevel / KingAreaHealthBase / KingAreaDamageBase.

Consumed as:

    EnemyHealth(lv, typeMult) = EnemyHealthPerLevel[clamp(lv,1,30)]
                              * (lv > 30 ? 1.5^(lv-30) : 1)
                              * typeMult
    EnemyDamage(lv, typeMult) = floor(EnemyDamagePerLevel[clamp(lv,1,30)]
                              * (lv > 30 ? 1.25^(lv-30) : 1)
                              * typeMult)

The .cctor pattern per entry is `dup; ldc.i4 <key>; ldc.i4|ldc.r8 <val>;
callvirt Add`, so a linear scan over the disassembly recovers them.
"""
import os, re, io, sys

IL = os.path.join(os.path.dirname(os.path.abspath(__file__)),
                  'so', 'DatabaseManager_cctor.il')


def parse_operand(text):
    t = text.strip()
    if not t:
        return None, None
    if m := re.fullmatch(r'(\d+)', t):
        return 'int', int(t)
    # exponents can carry an explicit '+' (1.62e+06); a plain [\d.]+ regex
    # silently fails on those and drops the entry from the table
    if re.fullmatch(r'-?[\d.]+(?:[eE][+-]?\d+)?', t):
        return 'float', float(t)
    return 'other', t


def push_value(op, arg):
    """Value pushed by a constant-loading instruction.

    The short forms matter: `ldc.i4.1` carries no operand text at all, and
    the difficulty tables use them wherever a key or value happens to be
    0-8. Ignoring them silently dropped most of every table.
    """
    if op == 'ldc.i4.m1':
        return 'int', -1
    if op.startswith('ldc.i4.') and op[7:].isdigit():
        return 'int', int(op[7:])
    if op in ('ldc.i4.s', 'ldc.i4', 'ldc.i8'):
        return parse_operand(arg)
    if op in ('ldc.r4', 'ldc.r8'):
        return parse_operand(arg)
    return None, None


def main():
    lines = io.open(IL, encoding='utf-8').read().split('\n')
    # (offset, opcode, operand)
    ins = []
    for ln in lines:
        m = re.match(r'\s+([0-9a-f]{4}): (\S+)\s*(.*)$', ln)
        if m:
            ins.append((int(m.group(1), 16), m.group(2), m.group(3).strip()))

    # scalars: `ldc... <v>` immediately followed by `stsfld <name>`
    scalars = {}
    for i, (off, op, arg) in enumerate(ins):
        if op.startswith('stsfld') and i:
            kind, val = push_value(ins[i - 1][1], ins[i - 1][2])
            if kind in ('int', 'float'):
                scalars[arg] = val

    # tables: each starts at `newobj ...Dictionary::.ctor` and ends at a
    # `stsfld <name>`; entries are ldc/ldc/Add triples in between
    tables = {}
    start = None
    for i, (off, op, arg) in enumerate(ins):
        if op == 'newobj' and '.ctor' in arg and start is None:
            start = i
        elif op == 'stsfld' and start is not None:
            entries = []
            k = start
            while k + 2 < i:
                kk, kv = push_value(ins[k][1], ins[k][2])
                vk, vv = push_value(ins[k + 1][1], ins[k + 1][2])
                if (kk in ('int', 'float') and vk in ('int', 'float')
                        and 'Add' in ins[k + 2][1] + ins[k + 2][2]):
                    entries.append((int(kv), vv))
                    k += 3
                    continue
                k += 1
            tables[arg] = entries
            start = None

    out = {'scalars': scalars, 'tables': {k: dict(v) for k, v in tables.items()}}
    p = os.path.join(os.path.dirname(IL), 'DatabaseManager_constants.json')
    import json
    with io.open(p, 'w', encoding='utf-8') as f:
        json.dump(out, f, ensure_ascii=False, indent=1)

    WANT = ['LastAuthoredLevel', 'MaxBattleLevel',
            'EndgameHealthGrowthPerLevel', 'EndgameDamageGrowthPerLevel',
            'EndgameGoldGrowthPerLevel', 'KingAreaHealthBase',
            'KingAreaDamageBase', 'BaseDamage', 'BaseHealth',
            'BaseAttackRange', 'BasePlayerAttackSpeed',
            'BasePlayerMovementSpeed', 'BaseCriticalMultiplier',
            'BaseMouseMagazineRegenTime', 'BaseMouseAttackSpeed',
            'BaseMouseRadius', 'BaseHealthPotionRegenPercentage',
            'HealthRegenEverySecond']
    print('=== scalars ===')
    for k in WANT:
        if k in scalars:
            print('  %-34s %s' % (k, scalars[k]))
    print('\n=== tables ===')
    for name in ('EnemyHealthPerLevel', 'EnemyDamagePerLevel',
                 'EnemyGoldPerLevel', 'NumberOfEnemiesInPackPerLevel',
                 'NumberOfPacksInLevelPerLevel', 'GuaranteedEnemyCounts'):
        t = tables.get(name)
        if not t:
            print('  %s: NOT FOUND' % name)
            continue
        print('  %s (%d entries)' % (name, len(t)))
        print('     %s' % ', '.join('%d:%g' % (k, v) for k, v in t))
    print('\ntotal scalars: %d, total tables: %d'
          % (len(scalars), len(tables)))
    print('all table names: %s' % sorted(tables))


main()
