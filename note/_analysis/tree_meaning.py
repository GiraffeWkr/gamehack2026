"""Rewrite TREE.md with each node's real, localized meaning.

The localization asset (LocalizerManager.JsonDataText -> TextAsset
"LocalizationJson" in sharedassets0.assets) keys stat text by STAT, not by
node: `Flat_MouseMagazineSize` -> key `MouseMagazineSizeFlat`. Every one of
the tree's 107 effect stats has a key, so each node gets a real display name
in 14 languages plus its #VALUE#-templated tooltip.
"""
import os, json, io, re, collections

OUT = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(OUT, 'so')
tree = json.load(io.open(os.path.join(SO, 'Tree_full.json'), encoding='utf-8'))
loc = {x['TheKey']: x for x in
       json.load(io.open(os.path.join(SO, 'Localization.json'),
                         encoding='utf-8'))['LDataForJson']}


def stat_key(m):
    for p in ('Flat_', 'Additive_', 'Multiplicative_'):
        if m.startswith(p):
            return m[len(p):] + p[:-1]
    return m


def txt(stat, lang='CHINESE_Value'):
    e = loc.get(stat_key(stat))
    return str(e.get(lang, '')) if e else ''


def ev(eq, x):
    """Evaluate a node equation. Handles a, a*x, a + b*(x-1), a + b*x,
    and the literal per-level arrays like "[40,200]"."""
    if eq is None:
        return None
    s = str(eq).strip().replace(' ', '')
    if s.startswith('[') and s.endswith(']'):
        try:
            arr = [float(v) for v in s[1:-1].split(',')]
            return arr[x - 1] if x - 1 < len(arr) else arr[-1]
        except (ValueError, IndexError):
            return None
    try:
        if '*' not in s and '+' not in s:
            return float(s)
        if s.endswith('*x') and '+' not in s:
            return float(s[:-2]) * x
        m = re.fullmatch(r'(-?[\d.]+e?[+-]?\d*)\+(-?[\d.]+)\*\(x-1\)', s)
        if m:
            return float(m.group(1)) + float(m.group(2)) * (x - 1)
        m = re.fullmatch(r'(-?[\d.]+e?[+-]?\d*)\+(-?[\d.]+)\*x', s)
        if m:
            return float(m.group(1)) + float(m.group(2)) * x
    except ValueError:
        pass
    return None


def fmt(v):
    if v is None:
        return '?'
    if v == int(v) and abs(v) < 1e15:
        return '%,d'.replace(',', '') % int(v) if False else str(int(v))
    return ('%g' % v)


def money(v):
    if v is None:
        return '?'
    for div, suf in ((1e9, 'e9'), (1e6, 'e6'), (1e3, 'e3')):
        if abs(v) >= div:
            return '%.0f%s' % (v / div, suf)
    return '%g' % v


# --- graph (links are stored twice -> undirected) ----------------------
by_id = {n['id']: n for n in tree}
num = lambda n: int(n['id'].split()[1].split('_')[0])
adj = collections.defaultdict(set)
for n in tree:
    for p in n['linksToIDs']:
        if p in by_id:
            adj[n['id']].add(p)
            adj[p].add(n['id'])
root = next(n for n in tree if n['unlockBehavior'] == 1)
DEPTH, q = {}, collections.deque([(root['id'], 0)])
while q:
    cid, d = q.popleft()
    if cid in DEPTH:
        continue
    DEPTH[cid] = d
    for nb in adj[cid]:
        if nb not in DEPTH:
            q.append((nb, d + 1))

L = []
w = L.append
w('# Zad Archery — 天赋树 168 节点全解\n')
w('> 数据来源：`sharedassets0.assets` 的 `TreeInfo` / `TreeNodeInfo` / `StatInfo`')
w('> ScriptableObject，以及 `LocalizerManager.JsonDataText` 指向的本地化')
w('> TextAsset `LocalizationJson`（14 种语言）。')
w('> 提取脚本：`_analysis/tree_full.py` → `tree_assemble.py` → `tree_meaning.py`。\n')

w('## 怎么读这张表\n')
w('游戏里节点的含义由**属性模板**决定 —— 本地化 key 是按属性命名的')
w('（`Flat_Damage` → `DamageFlat` → `#VALUE# 伤害`），节点只负责')
w('「加多少 / 每级加多少 / 要多少钱」。所以下表把三样东西拼在一起：')
w('**属性名**（真实本地化文本）、**收益公式**、**花费公式**。\n')
w('以下「每级 / 满级」列均按节点自身的等级上限算过：\n')

w('## 概览\n')
w('| 项 | 值 |')
w('|---|---|')
w('| 节点数 | 168 |')
w('| 连线（无向边） | %d |' % (sum(len(v) for v in adj.values()) // 2))
w('| 根节点 | `%s`（%s）|' % (root['id'], txt(root['stats'][0], 'CHINESE_Value') or '?'))
w('| 最大层数 | %d |' % max(DEPTH.values()))
w('| 效果属性种类 | %d |' % len(set(s for n in tree for s in n['stats'])))
w('| 等级上限分布 | %s |' % '、'.join('%d级×%d个' % (k, v) for k, v in
                                        sorted(collections.Counter(n['maxLevel'] for n in tree).items())))
w('')

# --- per-node rows -----------------------------------------------------
def describe(n, lang='CHINESE_Value', level=None):
    """Substitute the template's #VALUE# placeholders with this node's numbers.

    A template without any #VALUE# is a pure toggle (`Recruit the Archer`),
    so it gets no number at all -- prefixing one made `+100 招募弓箭手` out of
    a boolean flag.
    """
    parts = []
    for i, st in enumerate(n['stats']):
        tmpl = txt(st, lang)
        eq = n['valueEq'][i] if i < len(n['valueEq']) else (
            n['valueEq'][0] if len(n['valueEq']) == 1 else None)
        if not tmpl:
            parts.append(st)
            continue
        lv = level if level is not None else n['maxLevel']
        out = tmpl
        for slot, px in (('#VALUE#', ''), ('#VALUE1#', ''), ('#VALUE2#', ''),
                         ('#VALUE3#', '')):
            if slot in out:
                v = ev(eq, lv)
                out = out.replace(slot, ('%s%s' % (px, fmt(v)))
                                  if v is not None else '?')
        out = re.sub(r'<sprite name=(\w+)>', r'[\1]', out)
        parts.append(out.strip())
    return ' ／ '.join(parts)


w('## 全部 168 节点（按层排序）\n')
w('| 层 | 节点 | 中文含义 | 上限 | 货币 | 每级 | 满级 | 满级累计花费 | 连向 |')
w('|---|---|---|---|---|---|---|---|---|')
for n in sorted(tree, key=lambda n: (DEPTH.get(n['id'], 99), num(n))):
    zh = describe(n, 'CHINESE_Value')
    CUR = {1: '金币', 2: '爪', 3: '弓', 4: '传送门', 5: '战', 6: '法', 7: '蝠',
           8: '岩石', 9: '铜', 10: '银', 11: '金矿', 12: '守卫'}
    per = ' / '.join(fmt(ev(e, 1)) for e in n['valueEq']) or '—'
    full = ' / '.join(fmt(ev(e, n['maxLevel'])) for e in n['valueEq']) or '—'
    tot = sum(ev(e, x) or 0 for e in n['costEq'] for x in range(1, n['maxLevel'] + 1))
    w('| %d | `%s` | %s | %d | %s | %s | %s | %s | %s |'
      % (DEPTH.get(n['id'], -1), n['id'], zh or '—', n['maxLevel'],
         CUR.get(n.get('costCurrency'), '?'), per, full, money(tot),
         ', '.join(x.split()[1].split('_')[0] for x in n['linksToIDs'])))
w('')

# --- thematic grouping -------------------------------------------------
w('## 按属性归类\n')
by_stat = collections.defaultdict(list)
for n in tree:
    for s in n['stats']:
        by_stat[s].append(n)
w('| 属性 | 中文 | 节点数 | 节点 | 每级收益 |')
w('|---|---|---|---|---|')
for s, ns in sorted(by_stat.items(), key=lambda kv: -len(kv[1])):
    w('| `%s` | %s | %d | %s | %s |'
      % (s, txt(s, 'CHINESE_Value'), len(ns),
         ', '.join(str(num(n)) for n in ns),
         ', '.join(sorted(set(','.join(n['valueEq']) for n in ns)))))
w('')

w('## 系统解锁节点（天赋树 = 主线进度的闸门）\n')
w('这些节点把「新系统」直接做进了树里 —— 之前从存档反推出的解锁关卡')
w('（Jobs@Lv3、Crafting@Lv5、Mining/Shaping@Lv8、Mastery@Lv9 …）')
w('其实就是玩家在这些位置点了这几颗节点。')
w('**花费全部是 1 点传送门货币** —— 系统解锁被绑在「击杀传送门」上。\n')
w('| 节点 | 层 | 解锁 | 花费 | 同时附带的收益 |')
w('|---|---|---|---|---|')
for n in sorted(tree, key=lambda n: DEPTH.get(n['id'], 99)):
    zs = describe(n, 'CHINESE_Value')
    if '解锁' not in zs:
        continue
    head = zs.split(' ／ ')[0].replace('<br>', ' / ')
    rest = ' ／ '.join(zs.split(' ／ ')[1:]) or '—'
    w('| `%s` | %d | %s | %s %s | %s |'
      % (n['id'], DEPTH.get(n['id'], -1), head,
         ','.join(n['costEq']),
         '传送门' if n.get('costCurrency') == 4 else '金币', rest))
w('')

w('## 三个终局节点（上限 100）\n')
w('| 节点 | 中文 | 每级 | 每级花费 | 100 级总花费 |')
w('|---|---|---|---|---|')
for n in tree:
    if n['maxLevel'] >= 100:
        w('| `%s` | %s | %s | %s | %s |'
          % (n['id'], describe(n), ','.join(n['valueEq']),
             ','.join(n['costEq']), money(sum(ev(e, x) or 0
                                              for e in n['costEq']
                                              for x in range(1, 101)))))
w('')

w('## 花费恒为 1 的节点（功能开关）\n')
w('| 节点 | 货币 | 中文 | 收益公式 |')
w('|---|---|---|---|')
for n in sorted(tree, key=num):
    if n['costEq'] == ['1']:
        w('| `%s` | %s | %s | `%s` |'
          % (n['id'], '传送门' if n.get('costCurrency') == 4 else '金币',
             describe(n), ','.join(n['valueEq'])))
w('')

io.open(os.path.join(OUT, '..', 'TREE.md'), 'w', encoding='utf-8').write('\n'.join(L))
print('wrote TREE.md: %d lines' % len(L))
print('root =', root['id'], '|', txt(root['stats'][0], 'CHINESE_Value'))
print('depth groups:', collections.Counter(DEPTH.values()).most_common(8))
