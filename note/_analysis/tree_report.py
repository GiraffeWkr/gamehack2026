"""Emit TREE.md -- the full 168-node talent tree in readable form."""
import os, json, collections

OUT = os.path.dirname(os.path.abspath(__file__))
SO = os.path.join(OUT, 'so')
tree = json.load(open(os.path.join(SO, 'Tree_full.json'), encoding='utf-8'))

by_id = {n['id']: n for n in tree}
num = lambda n: int(n['id'].split()[1].split('_')[0])


# Links are stored twice -- once on each endpoint -- so the graph is undirected.
# `RequiresConnection` means "touch an already-unlocked node", not a parent
# pointer, so depth has to be a plain BFS from the AlwaysUnlockable root.
adj = collections.defaultdict(set)
for n in tree:
    for p in n['linksToIDs']:
        if p in by_id:
            adj[n['id']].add(p)
            adj[p].add(n['id'])

sym = sum(1 for n in tree for p in n['linksToIDs']
          if p in by_id and n['id'] not in by_id[p]['linksToIDs'])
undirected = sum(len(v) for v in adj.values()) // 2

roots = [n for n in tree if n['unlockBehavior'] == 1]
DEPTH = {}
q = collections.deque((r['id'], 0) for r in roots)
while q:
    cid, d = q.popleft()
    if cid in DEPTH:
        continue
    DEPTH[cid] = d
    for nb in sorted(adj[cid], key=lambda x: num(by_id[x])):
        if nb not in DEPTH:
            q.append((nb, d + 1))

depth = lambda n: DEPTH.get(n['id'], -1)
maxsum = sum(n['maxLevel'] for n in tree)
normal = sum(n['maxLevel'] for n in tree if n['maxLevel'] < 100)

L = []
w = L.append
w('# Zad Archery — 天赋树（MainTree）全 168 节点\n')
w('> 数据来源：`sharedassets0.assets` 里的 `TreeInfo` / `TreeNodeInfo` / `StatInfo`')
w('> ScriptableObject 原始序列化数据，用 `_analysis/tree_full.py` +')
w('> `_analysis/tree_assemble.py` 提取，并已与实际存档交叉验证。\n')

w('## 概览\n')
w('| 项 | 值 |')
w('|---|---|')
w('| 节点总数 | 168 |')
w('| 连线（去重后无向边） | %d |' % undirected)
w('| 根节点（AlwaysUnlockable） | %s |' % ', '.join(r['id'] for r in roots))
w('| 最大层数 | %d |' % max(DEPTH.values()))
w('| 孤立节点 | %d |' % sum(1 for n in tree if not adj[n['id']]))
w('| 单边不对称的连线 | %d |' % sym)
w('| 节点等级上限合计 | %d（其中 3 个节点上限 100，普通节点合计 %d）|'
  % (maxsum, normal))
w('| 等级上限分布 | %s |' % ', '.join('%d级上限×%d' % (k, v) for k, v in
                                      sorted(collections.Counter(
                                          n['maxLevel'] for n in tree).items())))
w('| 解锁方式 | 连接解锁 ×%d，开局可点 ×%d |'
  % (sum(1 for n in tree if n['unlockBehavior'] == 2),
     sum(1 for n in tree if n['unlockBehavior'] == 1)))
w('| RequiredMonsterLevel | 全部 -1（树不按关卡卡点，只靠连线）|')
w('')

w('## 效果条目（去重后 %d 种）\n' % len(set(s for n in tree for s in n['stats'])))
w('| 节点数 | 效果 |')
w('|---|---|')
for s, k in collections.Counter(s for n in tree for s in n['stats']).most_common():
    w('| %d | `%s` |' % (k, s))
w('')

w('## 节点等级上限 100 的三个节点\n')
w('| 节点 | 效果 | 每级 | 花费 |')
w('|---|---|---|---|')
for n in tree:
    if n['maxLevel'] >= 100:
        w('| %s | `%s` | %s | %s |' % (n['id'], ','.join(n['stats']),
                                        ','.join(n['valueEq']), ','.join(n['costEq'])))
w('')

w('## 全部 168 节点\n')
w('`层` 是距根节点的连线深度；`→` 是它连向的后继节点。\n')
w('| 节点 | 层 | 上限 | 效果 | 每级收益 | 单级花费 | 连线 |')
w('|---|---|---|---|---|---|---|')
for n in sorted(tree, key=num):
    w('| %s | %d | %d | `%s` | `%s` | `%s` | %s |'
      % (n['id'], depth(n), n['maxLevel'], ','.join(n['stats']),
         ','.join(n['valueEq']), ','.join(n['costEq']),
         ', '.join(x.split()[1].split('_')[0] for x in n['linksToIDs'])))
w('')

w('## 布局（按 Position 还原的列）\n')
cols = collections.defaultdict(list)
for n in tree:
    cols[round(n['pos']['x'])].append(n)
for x in sorted(cols):
    ns = sorted(cols[x], key=lambda n: -n['pos']['y'])
    w('- **x=%d** (第 %d 列, %d 个): %s'
      % (x, sorted(cols).index(x), len(ns),
         ', '.join('%s[%s]' % (num(n), ','.join(n['stats']).replace('Flat_', '')
                               .replace('Additive_', '+') or '?') for n in ns)))
w('')

open(os.path.join(OUT, '..', 'TREE.md'), 'w', encoding='utf-8').write('\n'.join(L))
print('wrote TREE.md (%d lines)' % len(L))
print('maxLevel total=%d  normal=%d' % (maxsum, normal))
print('roots:', [r['id'] for r in roots])
