> 本文档由一次全量代码走查生成（`src/` 全部 32 个 TS 文件 + `styles.css` + `index.html` + `tools/` 16 个 CDP 脚本 + `public/art/` 238 个 PNG）。
> 行号以当前工作区文件为准。

# 一、项目总览

| 项 | 内容 |
|---|---|
| 项目名 | `zad-archery-web`（扎德弓箭手 网页版 / Zad Archery — mobile-first web port, combat vertical slice） |
| 来源 | 从 Unity 手游《Zad Archery》（Samharia Studios）反编译结果重写 |
| 技术栈 | TypeScript 7 + Vite 8 + PixiJS 8（**没有游戏引擎**），UI 全部是 DOM + CSS |
| 入口 | [index.html](index.html) → [src/main.ts](src/main.ts) |
| 资源格式 | **100% PNG**（238 张，约 4.5 MB，全部 8bit RGBA）。没有音频、没有图集/atlas、没有 Spine/骨骼文件、没有 JSON 清单 |
| 资源目录 | `public/art/`（Vite 直接静态托管，运行时用 `art/<名字>.png` 相对路径取） |
| 存档 | `localStorage['zad-archery-web/save/v1']` |
| 运行 | `npm run dev`（5173）、`npm run build`、`npm run verify`（**338 项**无头模拟断言，覆盖 54 个分组） |

## 目录结构

```
index.html              只有 #app > canvas#game + <script src="/src/main.ts">，HUD 全由 JS 生成
src/
  main.ts               启动、存档、主循环、面板装配（649 行）
  game/game.ts          模拟核心（2174 行，README 里说的 2011 是非空行数）
  styles.css            全部 HUD / 面板样式（2800 行，纯 CSS 画装饰，零 url()）
  core/                 math.ts(Rng/格式化) stats.ts(三层属性) equations.ts(公式求值器) i18n.ts(中英表)
  content/              纯数据层：data.ts(全部数值表) art.ts(美术表) level.ts(关卡曲线) enemyData.ts
                        jobData.ts(职业/技能) masteryData.ts treeData.ts(天赋树168节点) talent.ts
  game/                 模拟层（不 import PixiJS）：game.ts(2174行,唯一核心) skills/jobs/mastery/talent/pets/progression/types.ts
  render/               renderer.ts(894行, Pixi 世界) parallax.ts(8层视差)
  ui/                   hud.ts(DOM HUD) input.ts(点击/拖拽瞄准) talent.ts jobs.ts mastery.ts(三个面板)
  dev/                  verify.ts(1388行, 338 项断言/54 分组) diag.ts diag-fire.ts
tools/cdp-*.mjs         16 个 Chrome DevTools Protocol 自动化验收脚本
public/art/             238 张 PNG（见第四章）
```

**两条架构铁律**（README 与代码注释反复强调）：

1. `src/game/` **永不 import PixiJS** —— 模拟是纯数据，因此能在 Node 里跑测试（`npm run verify`），也能换渲染器。
2. **UI 是 DOM，世界是 canvas** —— 文字/进度条/按钮是 HTML（任意 DPI 下清晰、原生安全区、真实触点命中测试），只有角色/背景/特效走 Pixi。

---

# 二、启动流程与主循环（`src/main.ts`）

## 2.1 启动顺序（`boot()`，main.ts:111-647）

1. `setLang('zh')`（中文为默认；没有运行时语言切换 UI）。
2. 建 `.rotate-hint`（竖屏提示，CSS 用 `@media (orientation:portrait) and (max-width:820px)` 显示）。
3. `loadSave()` 读 `localStorage`。
4. `new Renderer()` → `await renderer.init(canvas, w, h)`：
   - Pixi `Application.init({ background: 0x29180f, resolution: min(dpr,2), autoDensity: true })`；
   - `loadArt()` —— **唯一资源清单** `allArtFiles()`，用普通 `new Image()` 解码后 `Texture.from(img)`，**故意不用 Pixi `Assets.load`**（无头 Chromium 会永久挂住，也挡住自动化截图）；
   - `resize()` → `buildLayers()`（8 个视差层，每层 3 张平铺副本）。
5. `new Game({...})` → 回放存档（level/gold/currencies/jobs/mastery/talent/progression）。
6. `new Hud(app, renderer.toScreen)` → `preloadDropIcons()`（用 canvas 做乘法 tint 预生成掉落图标 dataURL）。
7. `new TalentPanel / JobsPanel / MasteryPanel` → 左下角图标导轨 `.lower-tabs`（`rail_jobs.png` 等）。
8. `new AimInput(canvas, { toWorld: renderer.screenToWorld })`。
9. `window.resize / visualViewport.resize / orientationchange(延迟120ms) / visibilitychange` 钩子。
10. `requestAnimationFrame(frame)`。

URL 参数（调试用）：`?level=N` 指定起始关、`?fast=N` 快进 N 秒模拟、`?tree=0` 关掉天赋面板带、`?stats=1` 显示实时统计、`?measure=1` 几何 overlay。

## 2.2 每帧顺序（main.ts:491-624）

```
input.update(dt)                     // 按住时按 0.16s 补 tap
game.tick(dt, state)                 // 固定步长模拟（见 §3.1）
事件队列 drain：
  floaters      → hud.float(...)          伤害飘字
  collectedDrops→ renderer.toScreen → hud.flyLoot(...)   拾取飞行图标
  impacts       → 屏内则 hud.impactScreen(x,y,missed)
  shotsBlocked  → hud.outOfArrows()       没箭了
  (spawnPuffs / skillCasts 只清空)
renderer.render(game, dt)
game.snapshot() → hud.update(snap, game.skills, dt)
talentSig 变化才 talentPanel.refresh + refreshBandGates
每帧 jobsPanel.updateCooldowns(skills)
flushFloaters(); hud.endFrame(); 清关/死亡 toast
```

`dt` 上限 0.05s（掉帧不会让模拟瞬移）；`Game.tick` 内部再按 1/60 固定步长最多跑 5 步。

---

# 三、游戏逻辑

## 3.1 时间与坐标约定

- **固定 60Hz 步长**：`Game.tick(dt)` 用累加器（`STEP = 1/60`，`MAX_STEPS = 5`），120Hz 手机与 60Hz 表现一致，GC 卡顿不会瞬移。累加器超过 5 步直接清零（game.ts:2132-2147）。
- **世界坐标 Y 向上**：0 = 地面（角色脚底），+600 = 美术帧顶。**与美术资源自身坐标系一致**，没有符号翻转的"翻译层"。
- Pixi 的局部 Y 向下，所以渲染器在容器上翻转一次、每个 sprite 写位置时再取负一次（`sprite.y = -worldY`）。**不要**用 `container.scale.y = -1` 修，那会把每张图镜像（renderer.ts:315-348）。
- 可视高度恒定 **1080 世界单位**（`CAMERA.visibleWorldHeight = orthographicSize*2 = 540*2`），可视宽度 = 1080 × 设备宽高比。1920×600 的美术帧只占屏幕上方 600/1080 = **55.6%**，下方那条带是 HUD 区（原版放天赋树面板）。

## 3.2 属性系统（`src/core/stats.ts`）

```
Total = round( Flat × (1 + Additive/100) × Multiplicative )
```
- 字典键 = **变量名本身**（`"Damage"`），层（Flat/Additive/Multiplicative）作为独立参数。`StatInfo.functionName`（`"DamageFlat"`）只是本地化 key，**不是**字典键 —— 这是最容易踩的坑。
- `< 1000` 保留 2 位小数，`≥ 1000` 取整（`StatsDouble.CalculateTotal`）。
- `Multiplicative` 是**连乘**，起点 1（未设置的层会把属性清零）。
- API：`stats.change(var, prop, value, isAdd)` / `stats.get(var)` / `stats.layer(var, prop)` / `setFlat` / `toJSON` / `fromJSON`。

初始值表 `PLAYER_BASE_STATS`（[src/content/data.ts:578-649](src/content/data.ts#L578-L649)）：Damage 1、Health 10、AttackRange 450、PlayerMovementSpeed 140、PlayerAttackSpeed 0.7、CriticalChance 0、CriticalMultiplier 50、HealthRegen 1.0、GoldGained 1、MouseMagazineSize 5、MouseMagazineRegenTime 0.4、MouseArrowDamage 50（=+50%）、PortalSummonTime 20、Multishot_NumberOfProjectiles 3、Multishot_Cooldown 8 等。

## 3.3 关卡布局（`src/content/level.ts`）

`planRun(level, defeatedGuardians, useEarlyPacks)`：
1. 若该等级欠一个守护者 → 先在 x=1500 放 1 只守护者包（`GUARDIAN_START_LEVEL = 25`，顺序 Claw→Warrior→Archer→Mage→Bat，各只打一次）。
2. 然后 `PACKS_PER_LEVEL[level-1]` 个常规包（1 级 8 包 → 30 级 24 包），起点 `useEarlyPacks ? 1000 : 1200`，间距 **1 级用 650，其余 2400**。
3. `portalX = 最后一包中心 + 80 × 每包敌数`。

每包敌数 `ENEMIES_PER_PACK`：1 级 9 → 30 级 30。半宽 `92 × count^0.75`。

数值曲线（`data.ts:296-335`，1-30 级手工表，31-50 级按 `growth^(level-30)` 外推）：

| 表 | 1 级 | 10 级 | 20 级 | 30 级 | 30 级后每级 |
|---|---|---|---|---|---|
| 敌人血量 | 3 | 2050 | 52000 | 3600000 | ×1.5 |
| 敌人伤害 | 2 | 38 | 245 | 2500 | ×1.25 |
| 敌人金币 | 1 | 2700 | 360000 | 35000000 | ×1.22 |
| 每包敌数 | 9 | 18 | 24 | 30 | — |
| 门波敌数 | 4 | 8 | 15 | 20 | — |
| 每关包数 | 8 | 13 | 18 | 24 | — |

## 3.4 敌人（`src/content/data.ts` + `src/content/enemyData.ts`）

12 个 `EnemyType`：`Claw / Warrior / Archer / Mage / Bat / RunPortal / GuardianClaw / GuardianWarrior / GuardianArcher / GuardianMage / GuardianBat / King`。

| 类型 | 血量× | 伤害× | 速度 | 攻击距离 | 攻速(次/秒) | 冷却 | 方式 | 体重 |
|---|---|---|---|---|---|---|---|---|
| Claw | 1.1 | 1.0 | 80 | 110 | 0.30 | 3.33s | 近战 | 30 |
| Warrior | 3.5 | 1.5 | 75 | 160 | 0.25 | 4.00s | 近战 | 22 |
| Archer | 1.5 | 1.5 | 85 | 530 | 0.33 | 3.03s | 远程 | 20 |
| Mage | 1.0 | 2.2 | 85 | 770 | 0.50 | 2.00s | 远程 | 14 |
| Bat | 3.0 | 1.5 | 85 | 200 | 0.50 | 2.00s | 近战(吸血15%) | 14 |
| RunPortal | 25 | 0 | 0 | 0 | 0 | 999 | 不动 | 0 |
| 5×Guardian | 25~45 | 1.5~3 | — | — | — | — | 2 个远程 | 0 |
| King | — | — | — | — | — | — | 未接 | 0 |

按关卡解锁：Claw 恒定，Archer ≥2，Bat ≥3，Warrior ≥4，Mage ≥5（`enemyWeightsForLevel`）。

AI（`stepEnemies`，game.ts:1427-1483）：敌人只沿 X 直线接近玩家（**无 Y 轴寻路、无体积分离**，`e.y` 只被 clamp 到 [0,30]），进入 `attackRange` 后按冷却出手；近战直接 `damagePlayer`，远程发射 420 u/s 的弹丸；如果 40 单位内有非 Falcon 宠物，会优先打宠物（Bear 是嘲讽目标）。

## 3.5 玩家

| 行为 | 规则 |
|---|---|
| 自动前进 | 只向 +X（`facing` 恒 1）。前方最近敌人进入 `AttackRange`（基础 450）或抵达传送门停步并开始自动射击；`px` 硬上限 `portalX - stopDistance/2` |
| 瞄准 | 点击/拖拽屏幕任意位置 → `renderer.screenToWorld` → 落点；按住每 0.16s 补一发，每步最多消费 5 个 tap |
| 弹匣 | `MouseMagazineSize`（5），每 `MouseMagazineRegenTime`（0.4s）回 1 支；没箭时点击计入 `shotsBlocked` 并弹"箭矢不足" |
| 箭雨（tap） | 伤害 = `Damage × (1 + MouseArrowDamage/100)`（1.5×），落点半径 = `(baseMouseRadius + 0.5) × 10 = 40`（另加 `ExplosiveArrows_RadiusOfEffect×10`），从 `max(560, y+160)` 下落，0.5s 落地，落地做圆-圆 AoE 判定（**含传送门**） |
| 弓自动射击 | 静止时按 `1 / PlayerAttackSpeed`（1.43s）射箭：先试 buff → 再试 shot 技能 → 再试被动技能（闪电→火焰→暴风雪）→ 否则普通箭。箭速 950，从 `(px+46, py+132)` 出发，线段-圆命中检测防穿透 |
| 暴击 | `CriticalChance`（基础 0），倍率 `CriticalMultiplier`（基础 50 → 1.5×）；箭雨额外先掷三倍（×3）再掷双倍（×2） |
| 回血 | 每 `healthRegenPeriodSeconds`（5s）回 `HealthRegen`（1.0）点 |
| 承伤 | 先掷 `DodgeChance`（闪避则飘 0），再减 `DamageReduction`（上限 90%） |
| 死亡/复活 | hp≤0 → `runState='dead'`，1.2s 后 `startLevel(level, true)`：**保留已清包**，只重刷未清包，HP/弹匣/冷却全恢复，回到 x=400 |

## 3.6 传送门（关卡终点）

1. 最后一包清空的那一帧 → `summonStarted = true`，倒计时 20s（`BASE.portalSummonTime`）。
2. 倒计时结束 → 刷一波额外敌人（`ENEMIES_PER_PORTAL_PACK`，1 级 4 → 30 级 20），中心在 `portal.x - 200 - half`，`packId = -2`。
3. 阶段机（快照 `portalPhase`）：`dormant`（还有包，无敌）→ `summoning`（倒计时中）→ `vulnerable`（可打）。
4. 死亡时：`runState='cleared'`，若本关还没付过则掉 1 个 `PortalCurrency`（落点若超出玩家 1200 单位会自动挪到玩家前方 150），并 +1 宝石。

## 3.7 掉落与经济

- **金币**：每次击杀掉 `max(0, round(GoldCoinsToDrop))`（基础 1）颗，每颗 = `enemyGold(level)`；金怪额外重掷 `(mult-1)` 次（普通金怪 5 倍，Gilded Champion 15 倍）。
- **家族币**（Claw/Archer/Warrior/Mage/Bat Currency）：解锁等级 2/3/6/10/16；数量查 `ENEMY_CURRENCY_PER_RELATIVE_LEVEL[battleLevel - unlock]`（相对等级表，1 级 Claw=1，26 级 Claw=1200）；掉落颗数由 `rollOver100(<家族>CurrencyChanceDrop)` 决定，而**五个基础值都是 0**，所以不点天赋树就不会掉家族币（这是原版行为）。
- **宝石**：守护者 +3、传送门 +1、首通 `level%5==0 ? 3 : 1`。
- **经验/等级（本项目自创）**：`XP_CURVE = { base: 40, growth: 1.42, maxLevel: 60 }`，每级 +0.5 伤害、+6 生命、+2% 箭雨。
- **拾取**：掉落物做抛物线（上抛 60~90、漂移 40~90、0.09s/0.21s），落地后上下浮动 ±8 单位；两条拾取路径 —— ① 玩家前方 80 单位内走过；② 鼠标悬停 40 单位内。
- **宝箱**：只有数据表（`CHEST_TYPES/CHEST_WEIGHTS/CHEST_COINS/CHEST_BUCKET/CHEST_CONTENT_COUNT`，data.ts:538-572），**模拟层完全没有实现**。

## 3.8 元系统（职业 / 技能 / 精通 / 天赋 / 宠物 / 驯服）

| 系统 | 数据 | 逻辑 | 面板 |
|---|---|---|---|
| 职业 Jobs | `jobData.ts`（5 职业，每职业 3 技能） | `game/jobs.ts`：严格顺序解锁（花 ClawCurrency），被动 `ChangeAStat`，技能按 `cost[当前等级]` 买 | `ui/jobs.ts` |
| 技能 Skills | 同上 | `game/skills.ts`：5 类 —— `shot`(弓自动射)/`buff`(就绪自动放)/`cast`(0.5s 轮询)/`passive`(替换普攻)/`pet`；**职业优先级降序**，最高已解锁职业的技能优先 | 职业卡上的 3 个槽 + 冷却条 |
| 精通 Mastery | `masteryData.ts`（9 精通 + NPC 10 级） | `game/mastery.ts`：NPC 等级花 BatCurrency、每级发一个解锁；精通各自升级；3 个"巅峰(Pinnacle)"**永不可升级**，只消耗铭刻充能；觉醒一次性 | `ui/mastery.ts` |
| 天赋树 Talent | `treeData.ts`（**168 节点 / 365 连接**，从原版导出） | `game/talent.ts`：`IsNodeAccessible`（仅 1 个节点 `AlwaysUnlockable`，其余需要相邻节点已点）＋公式化价格（Gold 或 PortalCurrency） | `ui/talent.ts`（DOM+SVG，可拖动平移） |
| 宠物 Pets | `jobData.ts` 中 `isPet` 的 3 个（Wolf/Bear/Falcon，属职业 1 猎人） | `game/pets.ts`：技能召唤、死亡写回冷却、Bear 嘲讽、Falcon 不可选中且只在玩家攻击时俯冲 | 无独立面板（在职业卡里） |
| 驯服 Taming | `pets.ts` 的 `TAMING` | 击杀时按 `ChanceToTameEnemiesOnDeath × 0.8^已有驯服数` 变成友方（首个保底） | 无 |
| 成长 Progression | `progression.ts` | 等级/经验/宝石 | HUD 经验条 |

天赋树的数值与价格全部是**字符串公式**，由 `core/equations.ts`（`ExpressionEvaluator` 的移植，支持 `+ - * / ^`、`x`/`value`、`F()`/`C()`、`[a,b,c]` 离散列表、`,` 作小数点、科学计数法）在节点等级处求值。

## 3.9 存档与进度契约

- Key：`zad-archery-web/save/v1`；形状见 `SaveData`（main.ts:43-76）：`level / gold / kills / defeatedGuardians / currencies / currencySeen / portalCurrency / portalCurrencySeen / portalCurrencyPaid / jobs / mastery / talent / progression`。
- **只在"关卡通"时写档**（main.ts:589-616），且写的是 `level + 1`；死亡不写档。
- 快照 `runState`：`running / cleared / dead`；`progress()` 返回 `{ level, cleared[], defeated[] }`。
- **会话内**死亡只重刷未清包；**刷新页面**则整关重来（`cleared` 没进存档，见 §6.1 缺陷 6）。

## 3.10 事件与快照（渲染/UI 的唯一接口）

`snapshot()`（game.ts:2041-2083）每帧产出一个对象，字段见 [src/game/types.ts:40-95](src/game/types.ts#L40-L95)：`playerX/Y`、`playerHp/MaxHp`、`level`、`gold`、`currencies`、`currencySeen`、`portalCurrency(+Seen)`、`gems`、`playerLevel/Exp/ExpNeeded/ExpFraction`、`kills`、`packsCleared/Total`、`magazine/Size/Fraction/RegenFraction`、`portalActive/Hp/MaxHp/Summon`、`portalPhase`、`runState`、`deathFade`。

事件队列（`EventQueue<T>`，上限 128 条，`drain()` 空时返回共享空数组）：

| 队列 | 形状 | 消费方 |
|---|---|---|
| `floaters` | `{x,y,value,crit}` | HUD 伤害飘字（对象池，DOM 节点上限 128/帧） |
| `impacts` | `{x,y,radius,source,missed}` | HUD 落点特效反馈 |
| `skillCasts` | `{skillId,buff,duration}` | 目前只 drain（横幅由面板/HUD 自己处理） |
| `spawnPuffs` | `{x,y,vx,vy,...}` | 只 drain（粒子由 `getPuffList()` 直接画） |
| `collectedDrops` | `{x,y,currency}[]` | HUD 拾取飞行图标 |

---

# 四、美术资源清单：哪些图、什么格式、画在哪

**全部 238 个文件都是 PNG（8bit RGBA，带 alpha）**，位于 `public/art/`，运行时按 `art/<名字>.png`（`ART_BASE = 'art/'`，[src/content/art.ts:351](src/content/art.ts#L351)）用普通 `<img>` 加载后包成 Pixi `Texture`。
**没有任何** JPG/WebP/SVG/图集/JSON 清单/音频（`public/` 下只有 `art/`）。

## 4.1 关键格式事实

- **运行时只加载 41 个唯一 PNG**（`allArtFiles()` 去重后的结果）：背景 8 + 角色/敌人/Boss/门 9 + 宠物 3 + FX 8 + 弓手皮肤 4 + 血条 2 + 掉落货币 7。其余 197 张只被 DOM 层（职业/精通/天赋/导轨）引用，或根本未被引用。
- 所有 PNG 都已 **alpha 裁剪**（因此同族尺寸不一，例如云 1920×231、草 1920×170）；回填到 1920×600 帧内的位置靠 `cropLeft/cropTop` 常量（来自 Unity `Sprite.m_Rect` / `textureRectOffset`）。
- 每张图都是**独立 Texture、独立 GPU 上传、独立 draw call**（没有 atlas 合批），文件名就是 key（`ART_BASE + name + '.png'`，扩展名只在 [renderer.ts:188](src/render/renderer.ts#L188) 拼一次）。
- 背景/角色的 **1 像素 = 1 世界单位**（Unity `m_PixelsToUnits = 1`），所以"画多大"完全由 art.ts 表里的世界高度决定，**与 PNG 像素尺寸无关**（改像素尺寸不会改世界内绘制高度！）。
- 全部为直读 RGBA、无调色板、无隔行。

## 4.2 清单（按用途）

### background `public/art/`（两套 8 层视差 + 合成图）

| 文件 | 尺寸 | 说明 / 视差系数 | cropLeft,cropTop |
|---|---|---|---|
| `BG1_0sky.png` | 1920×600 | 天空，最远，factor 0 | 0, 0 |
| `BG1_1clouds.png` | 1920×231 | 云，0.08 | 0, 10 |
| `BG1_2hills3.png` | 1920×253 | 远山 3，0.18 | 0, 108 |
| `BG1_3hills2.png` | 1920×300 | 远山 2，0.30 | 0, 137 |
| `BG1_4hills1.png` | 1920×395 | 近山，0.45 | 0, 205 |
| `BG1_5trees.png` | 1920×419 | 树，0.60 | 0, 75 |
| `BG1_6grass.png` | 1920×170 | 草地，0.80 | 0, 430 |
| `BG1_6grass_topOnly.png` | 1920×145 | 草地（仅顶部，备用，**代码未用**） | — |
| `BG1_7item.png` | 1743×105 | 前景装饰，factor 1，**画在角色前面** | 56, 495 |
| `BG2_0sky … BG2_7item` | 同上 8 张 | 第二套配色。**注意 `BIOME2 = BIOME1`（art.ts:128）是同一个数组的别名，因此这 8 张是死资源，代码只加载 BIOME1** | — |
| `FullBG1.png` | 1920×600 | 8 层预合成图（**参考/校验用，代码未加载**，504 KB） | — |

8 层都是"整帧 1920×600 的同一原点、各自大部分透明只有一条画带"，**不是**按不同高度堆叠；这也是文档里反复强调的历史坑。

### 角色 / 敌人 / 宠物 / BOSS

| 文件 | 尺寸 | 用途 | 世界高度 h | 实绘宽度 w = h×宽高比 |
|---|---|---|---|---|
| `Archer_1..5.png` | 150×176 / 146×182 / 150×176 / 150×182 / 150×182 | 玩家弓手 **5 套服装皮肤**（不是走路帧！） | 99 | 84.4 / 79.4 / 81.6 / 81.6 / 81.6 |
| `Guardian_Claw_0.png` | 250×214 | Claw 小怪 | 53 | 61.9 |
| `Guardian_Warrior_0.png` | 256×176 | Warrior | 65 | 94.5 |
| `Guardian_Archer_0.png` | 256×211 | Archer | 53 | 64.3 |
| `Guardian_Mage_0.png` | 225×256 | Mage | 56 | 49.2 |
| `bat_swarm_0.png` | 118×123 | Bat | 41 | 39.3 |
| `Guardian_Claw_0 / Warrior / Archer / Mage_0` | 同上（**同图放大**） | 守护者 | 85 / 92 / 85 / 88 | 99.3 / 133.8 / 103.1 / 77.3 |
| `Guardian_Bat_0.png` | 256×201 | 守护者蝙蝠 | 74 | 94.3 |
| `king_boss.png` | 277×439 | 国王（最终战未接） | 145 | 91.5 |
| `Portal_tex.png` | 512×512 | 跑步传送门 | 200 | 200.0 |
| `Wolf.png` | 111×124 | 宠物狼 | 70 | 62.7 |
| `Bear.png` | 104×108 | 宠物熊 | 61 | 58.7 |
| `Falcon.png` | 127×110 | 宠物隼（悬浮 +120） | 62 | 71.6 |

- **锚点**：角色/敌人/宠物/传送门是**脚底居中** `anchor(0.5, 1)` → PNG 底边就是脚；FX 与掉落物是**中心** `anchor(0.5, 0.5)`。
- **宽度永远由宽高比推出**，代码只按高度定标（`scale = def.height / texture.height`）。
- **同图复用**：`Guardian_Claw_0` / `Guardian_Warrior_0` / `Guardian_Archer_0` / `Guardian_Mage_0` 这 4 张同时用作**小怪**和**守护者**（守护者只是画得更高），所以换一张等于同时换了小怪和对应 BOSS；`Archer_1..5` 同时是玩家皮肤和职业卡立绘。
- **tint**：小怪普通态 `0xffffff`；命中闪白 `0xffb0a0`；被驯服的友军 `0x9fe6a0`；传送门 `alpha=0.95` + `1+0.06·sin(2t)` 呼吸。**金色怪/镀金冠军的 tint 是死代码**（见 §6 缺陷 12）。
- 小怪每种只有**一张画**（不是动画序列），所以渲染器用程序化 bob/squash 冒充动画；宠物用 `scale.x = -1` 做左右翻转（不用容器负缩放，那会镜像全部）。

### 特效 FX

| 文件 | 尺寸 | 用途 | 世界高度 / tint |
|---|---|---|---|
| `Arrow1.png` | 22×146 | 天降箭 + 弓射箭 + 拖尾×2 + 枪口闪光（**四用**；不用 `T_Arrow`，那是带 padding 的 VFX 画布）。约定：箭头朝画布**底边** | 62（高度基准） |
| `Circle.png` | 256×256 | 地面 AOE（`drawShots`） | 按**宽度**基准：实绘边长 = 4.5 × radius |
| `FX_TX_Ember_AB.png` | 288×282 | 命中/爆炸尘团 | `scale = radius*2.6*(1+t)/288`，alpha=1−t，随 life 旋转 |
| `FX_Ring_AD.png` | 472×472 | 落点冲击环（落箭 t>0.45 时） | `scale = radius*2.2/472`，alpha 呼吸，tint `0x9be7ff`/`0xffd166` |
| `FX_TX_Star_AA.png` | 454×456 | **已加载但不绘制** | 140 |
| `shockwave.png` | 512×512 | **已加载但不绘制** | 150 |
| `orb.png` | 124×128 | **已加载但不绘制**（早年曾被误当传送门） | 30 |
| `Trail1.png` | 29×128 | **已加载但不绘制** | 70 |
| `T_Arrow.png` `T_Arrow_Sheet.png` `T_GlowOrb_Bullet.png` `WormholeArrowStrike.png` `Blizzard.png` `Fire_Ground.png` | 大尺寸 VFX 画布 | 未被任何代码引用 | — |

全局**没有 blend mode**（`src/` 里没有任何 `blendMode` 赋值），所谓发光全靠 alpha + tint。

### UI：血条（唯一被 renderer 用的 UI 图）

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `Slider_Play_04_Border.png` | 41×44 | 血条外框：**已经不用这张图绘制**了！`NineSliceSprite` 从未 import，形状是用 Pixi `Graphics.roundRect().stroke()` 复刻的（圆角 10/44、边宽 4/44 写死在 renderer.ts），所以**替换它没有任何视觉效果**；`BAR.frameBorder = 10` 也是死字段 |
| `Slider_Play_04_Fill_White_1.png` | 2×35 | 血条底槽 + 填充。两个 Sprite、`anchor(0,0)`、显式拉伸：track tint `0x0c0605` + alpha 0.55，fill tint `0xb75757`、宽 = 内宽×进度。条高 `max(14, drawnH*0.22)`、宽 = 高×4.5。图自带的 229→255→229 竖直渐变就是血条的明暗来源 |
| `Slider_Play_02/03/04_*.png`、`Slider_Level_01_Bg*.png` | 小图 | 天赋树节点形状/高亮（见 `tree/` 下带 id 的同名副本） |

### 掉落货币图标 `public/art/cur/`（**已经上色，tint 是 no-op**）

`Gold.png`(33×33)、`ClawCurrency.png`(35×35)、`ArcherCurrency.png`(27×35)、`WarriorCurrency.png`(37×33)、`MageCurrency.png`(27×33)、`BatCurrency.png`(36×36)、`PortalCurrency.png`(27×34)、`GemCurrency.png`、`CharacterCurrency.png`、`GuardianCurrency.png`、`MiningRock/Copper/Silver/Gold.png`、`Health.png`、`Attack.png`、`Damage.png`、`Bonus.png`、`Multiplier.png`、`Monsters.png`

- 掉落物世界高度 34（`DROP_ART`，art.ts:296-318）。
- HUD 顶栏用 `<img src="art/cur/Gold.png">` 等（hud.ts:102-111）。

### 职业面板（`ui/jobs.ts`）

| 文件 | 尺寸 | 用途 |
|---|---|---|
| `job_card_0..4.png` | 320×424 ×5 | 五张职业卡**框体** |
| `Archer_1..5.png` | 同上 | 卡内人物肖像（按职业索引取，锁定态加 CSS `brightness(0.25) grayscale(1)`） |
| `ui_lock.png` | 60×75 | 卡上的锁 |
| `skills/*.png` | 112×128 ~ 128×127 ×15 | 15 个技能图标（`Multishot__440.png`、`RapidFire__397.png`、`SharpShooter__406.png`、`BombArrow__919.png`、`SniperScope__395.png`、`PiercingShot__424.png`、`LightningStrike__405.png`、`FireArea__417.png`、`Blizzard__450.png`、`DarkMatter__419.png`、`SuperNova__408.png`、`BatSwarm__457.png`、`Wolf__439.png`、`Bear__416.png`、`Falcon__451.png`）；路径前缀 `art/skills/` |

### 精通面板（`ui/mastery.ts`，前缀 `art/mastery/`）

`Mastery0__436.png` … `Mastery8__431.png`（9 张，43×64 ~ 64×64，尺寸不齐）。DOM 显示尺寸由 CSS 固定为 30×30，与 PNG 像素尺寸无关。

### 天赋树面板（`ui/talent.ts`，前缀 `art/tree/`，共 95 张）

- **89 个节点图标**（文件名是原始资产名 + `__<id>.png`）：`ArrowUp__1157`、`CriticalChance__1186`、`SkillsDamage__1135`、`GoldGained__1028`、`PetHealth__1018`、`UnlockOrbs__1129` 等。
- **节点形状与高亮**（`TreeTemplate`）：`Slider_Level_01_Bg_3__1085`(shapeOff)、`Slider_Level_01_Bg_4__1093`(shapeOn)、`Slider_Level_01_Bg_5__978`(highlighter)、`Alert_Diamond_White_Bg_1/2/3__1022/1150/1037`(传送门节点用的菱形三种状态)。
- 尺寸由 `treeData.ts` 的模板决定：base 节点 50×50 / 图标 32，portal 节点 75×75 / 图标 38，高亮 71 / 100。节点上**不画等级数字**（原版只把它放在 tooltip 里）。
- 这些图都是**白色 + alpha**，靠 **CSS 乘法 tint**（彩色 backdrop + `mix-blend-mode: multiply`）上色，颜色表在 `treeData.ts` 的模板里（`canBuyColor` / `poorColor` / `unlockedIconColor` / `lockedIconColor` / `linkOnColor` / `linkOffColor`）。

### 左下角导轨 / 其它

`rail_tree.png`(80×69)、`rail_jobs.png`(71×72)、`rail_mastery.png`(44×56)、`rail_crafting/mining/shaping/star.png`、`x.png`(46×64)、`ui_lock.png`(60×75)、`icon_*.png`（老图标，多为**白色遮罩**）、`BaseFrame_*.png`、`ResourceBar_01_White_Add_Icon.png`、`loot_coin.png`(64×62)、`loot_coin_chest.png`(62×64)、`FullBG1.png`。

DOM 里的显示尺寸**全部由 CSS 固定，与 PNG 像素尺寸无关**：`.res-icon` 20×20、`.rail-icon` 20×20、`.mt-icon` 30×30、`.js-icon-box` 高 40、`.jc-lock` 30×36、`.loot-fly` 28×28；`.jc-frame` 是 `object-fit: fill`（会被拉伸），其余是 `contain`。

### 美术应用的三条路径总览

| 路径 | 位置 | 例子 |
|---|---|---|
| ① Pixi 世界（canvas） | `renderer.ts` 用 `allArtFiles()` 加载，`sprites.get(name)` 取用 | 背景、角色、敌人、宠物、FX、传送门、掉落图标、血条 |
| ② DOM `<img src="art/...">` | `ui/hud.ts`、`ui/jobs.ts`、`ui/mastery.ts`、`ui/talent.ts`、`main.ts` | 货币图标、职业卡、技能图标、精通图标、天赋节点、导轨图标 |
| ③ CSS 纯绘制（**不是图片**） | `styles.css`（`grep url(` **0 命中**） | 渐变条、SVG 冷却环、径向渐变货币珠、`clip-path` 梯形导轨按钮、面板底色 |

渲染器还额外用 Pixi `Graphics` 画了两样东西，不是图片：屏幕下方那块面板底色（`PANEL_COLOR 0x29180f` + 顶部 7px 暖色唇边 `PANEL_EDGE_COLOR 0x6c4439`，renderer.ts:248-255）、敌人血条的圆角描边。

## 4.3 渲染器与坐标（改图前必须理解）

- **容器层级**（`stage` 子节点顺序 = 绘制顺序）：① `panel`（用 `Graphics` 画的下半带底色）→ ② `bgBack`（8 层里除前景外的 7 层 × 3 份平铺）→ ③ `world` → 子 `entityLayer`（所有角色 + 血条）→ ④ `bgFront`（只放 `BG1_7item`，**画在角色之上**）→ ⑤ `fxLayer`（落箭/箭环/弹丸/地面 AOE/掉落/粒子）。容器变换：`world`/`fxLayer` 用 `scale=scale, x=viewW/2-cameraX*scale, y=viewH*playerScreenFraction`，背景两个容器**恒等**（每张 sprite 自己带绝对屏幕坐标）。
- **实体槽位**：`charViews` 用整数 id 常驻复用 —— `-1` 玩家、`0..N` 敌人（每帧按列表重编）、`40000+` 宠物与驯服怪、`100000` 传送门。FX/掉落/粒子共用 `scratch` 精灵池（每帧 `scratchUsed=0` 重头复用、帧尾隐藏多余），**复用时只重置 texture/visible/tint/alpha/rotation，不重置 scale 与位置**（调用方必须自己写 scale）。
- **世界→屏幕**：`x = viewW/2 + (worldX - cameraX) * scale`，`y = viewH * playerScreenFraction - worldY * scale`，其中 `scale = viewH / 1080`、`playerScreenFraction = 500/1080 ≈ 0.4630`（= 地线行 500 ÷ 可视高度 1080）。世界 y=0 落在屏幕 46.3% 高度处；`art.ts` 的 `GROUND_LINE_ART_Y/FRACTION` 只被 `measure()` 与 verify 使用，**真正的映射常量是 `CAMERA.playerScreenFraction`**。
- **相机**：锚在**角色**身上而不是固定地面行（短屏设备上固定地面行会把角色和美术都挤出屏幕）。`desired = px + visibleW*(0.5 - characterScreenX=0.25)`；硬规则"角色不出框（±8% 边距）"最终否决，软规则"未清完包时传送门不许露头（`portalPeekFraction=0.15`）"先施加；最后指数平滑逼近（`1 - e^(-7dt)`，τ≈143ms）。相机只在 `render()` 里推进，所以 `?fast=N` 快进后必须补一次 `renderer.render(game, 1)`。
- **视差**（`parallax.ts`，移植 `ParallaxManager`）：每层 **3 份**平铺副本，整组按 `deltaX * (1 - parallaxFactor)` 前进（`pf=0` 贴屏、`pf=1` 锁世界）；相位用 `Math.round` 取模回绕到 ±span/2（原版 while 循环在视口宽于 1920 世界单位时不终止）；`span = texture.width - 0.01`（**世界单位，取 PNG 宽度**，不随视口变化）。每份：`x = viewW/2 + (wx - cameraX)*scale + cropLeft*scale`、`y = cropTop*scale`（帧顶 = 屏幕第 0 行）。竖直方向**只有** `cropTop`，没有 per-layer 偏移。3 份落在相机 ±1.5 span，覆盖到 5.33:1 宽高比。
- **背景实测带**（帧顶 = 0，世界单位）：sky 0–600、clouds 10–241、hills3 108–361、hills2 137–437、hills1 205–600、trees 75–494、grass 430–600、item 495–600。groundRow 500 正好落在前景 item 的顶边 495 附近 —— 这就是"画出来的路"和"角色脚底"能对齐的原因。
- **下落/朝向**：`Arrow1` 在自身画布中箭头**朝上**，所以落箭用 `rotation = π` 倒过来；弓射弹用 `atan2(vy,vx) - π/2`（箭头在画布**底部**，已用像素剖面验证）。弓射弹另画 2 个拖尾（缩小 + 递减 alpha）。

---

# 五、怎么替换美术资源

## 5.1 最短路径（不改代码）

> **同名覆盖 `public/art/` 下的 PNG 即可**，因为文件名就是全部契约：`art.ts` 里存的是**不带扩展名的 key**，扩展名在 `renderer.loadArt()`（`${ART_BASE}${name}.png`，renderer.ts:188）和 DOM 的 `src="art/..."` 里拼接。

必须遵守的铁律：

| # | 规则 | 原因 |
|---|---|---|
| 1 | **保持 PNG、8bit RGBA、带 alpha、不隔行** | 直读 `Texture.from(<img>)`，没有解码兜底 |
| 2 | **最好保持原像素尺寸** | 世界内高度由 `art.ts` 表决定、按高度等比缩放，所以尺寸变了只是清晰度变了；但**背景层**的平铺跨度 `span = texture.width - 0.01`（parallax.ts:102）直接取 PNG 宽度，改了宽度就改了视差对齐 |
| 3 | **背景 8 层必须保持"整帧画布 + 透明 + 一条画带"的画法，且 `cropTop/cropLeft` 不变** | 8 层共用同一原点，位置只在 `art.ts` 的 BIOME1 表里；换了构图但没改 `cropTop`，地线会和角色脚底错位 |
| 4 | **不要裁剪/留不同边距**，除非同步改 `cropLeft/cropTop` | 导出图都是 alpha 裁剪过的 |
| 5 | 被 tint 的图必须是**白色+alpha** | 天赋节点形状/高亮（CSS multiply）、驯服单位（`0x9fe6a0`）、血条（`0x0C0605`/`0xB75757`）、命中闪白（`0xffb0a0`）都靠乘法染色；本身有颜色的图会被染脏（`art/cur/*` 就是提前上色，所以 tint 设成 `0xffffff` = 不生效） |
| 6 | 角色/敌人/宠物/传送门图**脚底必须贴画布下边缘** | sprite `anchor.set(0.5, 1)`，位置就是"脚"。底部留白 = 悬空；顶部留白 = 血条与头顶脱节（血条挂 `e.y + def.height`） |
| 7 | **FX/掉落图必须居中** | `anchor(0.5, 0.5)`，且尘团/环/AOE 都按 `texture.width/height` 定标；偏心画布会让特效整体偏移。`Arrow1` 还要保持"箭头朝画布底边"的朝向约定 |
| 8 | **`height` 指的是 PNG 画布高度，不是人物高度** | 四周补透明边距 = 人物视觉变小（`height` 不变而占比降低）；把 alpha 裁剪过的图补回透明边也是同理 |
| 9 | **不要期待"多帧序列就能动"** | 渲染器不读帧数；`Archer_1..5` 是 5 套**服装**不是 5 帧走路；小怪只有单张画 → 加动画需改 `renderer.ts` 的 draw 方法 |
| 10 | **背景层是平铺图，且必须左右无缝** | `span = texture.width - 0.01` + 固定 3 份副本；把 1920 宽的层换成更窄的图（如 640）→ 3 份只覆盖 1920 世界单位，16:9 可见宽就是 1920、更宽视口更多 → **屏幕两侧露底** |
| 11 | **绝对不能出现 404** | `loadArt()` 的 `Promise.all` 无容错 → `init()` reject → `void boot()` 未处理 rejection → **直接黑屏**。凡被 `allArtFiles()` 引用就必须存在 |
| 12 | 心里有数：**41 张图 = 41 个独立 Texture、41 次 GPU 上传、每张独立 draw call**（没有 atlas 合批），boot 会同步等全部解码完 | 塞超大地图会拖慢首帧 |

替换后 `npm run dev` 刷新即可；**生产构建**需 `npm run build`（Vite 会把 `public/` 原样拷到 `dist/art/`）。改完建议顺带跑一次 `node tools/_png_dims.mjs public/art` 复核新图的宽高/位深/通道，以及 `npm run verify`（它断言美术清单覆盖每个层级与角色、血条图在预加载列表里、每种可刷出的敌人都有效果图）。

## 5.2 按用途的具体做法

| 想换 | 覆盖文件 | 还要动什么 |
|---|---|---|
| 背景配色/画风 | `public/art/BG1_*.png`（或改用 `BG2_*`） | 用 BG2 需把 [src/render/renderer.ts:213](src/render/renderer.ts#L213) 的 `BIOME1` 改成 `BIOME2`（注：`BIOME2 = BIOME1` 是同一数组的别名，要先在 [src/content/art.ts:128](src/content/art.ts#L128) 写出真正的第二套表） |
| 角色/敌人外形 | `Archer_*.png`、`Guardian_*_0.png`、`bat_swarm_0.png`、`Wolf/Bear/Falcon.png`、`king_boss.png`、`Portal_tex.png` | 想改**画多大**：改 [src/content/art.ts](src/content/art.ts) 的 `CHARACTERS` / `PETS` / `KING` 的 `height`；改碰撞体同步改 [src/content/data.ts:392-410](src/content/data.ts#L392-L410) 的 `radius` |
| 玩家换皮肤 | `Archer_1..5.png` | 解锁职业后自动切（`Jobs.skinIndex()` → `renderer.setPlayerSkin()`） |
| 特效 | `Arrow1.png`、`Circle.png`、`FX_*.png`、`shockwave.png`、`orb.png`、`Trail1.png` | 大小改 `art.ts` 的 `FX` 表；颜色在 renderer 的 `tint` 里 |
| 掉落图标 | `cur/*.png` | 改图即可；新家族币要加 `DROP_ART` 条目（art.ts:296-318）+ `allArtFiles()` 会自动带上 |
| 血条 | 只有 `Slider_Play_04_Fill_White_1.png` 有效果（**`Slider_Play_04_Border.png` 已不参与绘制**，形状是 `Graphics` 写死的） | 颜色改 `BAR.frameTint/fillTint`（art.ts:264-278）；圆角/边宽写死在 renderer.ts:783/792 |
| 职业卡/技能图标 | `job_card_*.png`、`skills/*.png` | 技能图标名在 `jobData.ts` 的 `icon` 字段（如 `"Multishot__440.png"`），前缀在 [src/ui/jobs.ts:26](src/ui/jobs.ts#L26) |
| 精通图标 | `mastery/Mastery*.png` | 名字在 `masteryData.ts` 的 `icon` 字段，前缀在 [src/ui/mastery.ts:31](src/ui/mastery.ts#L31) |
| 天赋节点 | `tree/*.png` | 节点用哪张图在 `treeData.ts`（每个节点带 `shapeOff/shapeOn/highlighter/icon`），**形状与图标必须是白色+alpha** |
| 导轨/杂项图标 | `rail_*.png`、`x.png`、`ui_lock.png` | 名字写死在 `main.ts` 的 `LOWER_TABS` 与各面板 |

## 5.3 换**尺寸/布局**（要改代码）

| 想改 | 位置 |
|---|---|
| 背景帧参考分辨率（当前 1920×600、地线在第 500 行） | [src/content/art.ts](src/content/art.ts) 的 `FRAME`；`GROUND_LINE_FRACTION` 会自动跟着变 |
| 可视高度（当前 1080 世界单位） | [src/content/data.ts:238](src/content/data.ts#L238) `CAMERA.visibleWorldHeight`（同时影响美术帧在屏幕上的占比 600/1080） |
| 角色脚底在屏幕的高度 | [src/content/data.ts:233](src/content/data.ts#L233) `CAMERA.playerScreenFraction`（= 500/1080，**不是调参旋钮**，改地线就要改它） |
| 角色在屏幕左 1/4 | [src/content/data.ts:226](src/content/data.ts#L226) `CAMERA.characterScreenX` |
| 视差层次/速度 | [src/content/art.ts:116-125](src/content/art.ts#L116-L125) `BIOME1` 的 `parallaxFactor`（0=钉在屏幕，1=锁世界） |
| 加一种新美术 | 放 PNG 到 `public/art/`，在 `art.ts` 对应表里加一条（`CHARACTERS`/`PETS`/`FX`/`DROP_ART`），**并把 file 名加进 `allArtFiles()`**（art.ts:338-349，漏了不会报错，只会看不见）。若是角色还要在 `renderer.ts` 的 `drawEnemies` 里能被 `CHARACTERS[e.type]` 查到（即 `EnemyType` 要加成员） |
| 换整套第二生态（BG2） | 先删掉 [src/content/art.ts:128](src/content/art.ts#L128) 的 `export const BIOME2 = BIOME1` 别名、写出真正的第二套表（file 指向 `BG2_*`），再把 [src/render/renderer.ts:213](src/render/renderer.ts#L213) 的 `BIOME1` 换成按关卡/参数选择的变量 |

**原版资产再导出**：README 提到的 `analysis/export_sprites.py`、`analysis/export_bg.py`、`analysis/export_enemies_web.py`、`analysis/export_tree_web.py`、`analysis/dump_bg_geometry.py`、`analysis/verify_composite.py`（UnityPy 从 `Zad Archery_Data` 提取）**不在本仓库里**（只有 `public/art/` 的成品）；想换整套原版素材需要自带 UnityPy 流程。仓库里唯一的图像辅助脚本是 `tools/_png_dims.mjs`（遍历目录打印每个 PNG 的宽高/KB/位深/colorType，用来核对替换图是否符合要求）。

## 5.4 换音频/加语言

- **音频完全没有**（没有 `public/audio`、没有 `new Audio`、没有 WebAudio）。要加需从零：加载器 + 播放器 + 事件挂钩。
- 语言：`src/core/i18n.ts` 是扁平表 `Record<key, {zh, en}>`，`t(key, {n: 3})` 支持 `{name}` 占位。`npm run verify` 会断言**两种语言都不能缺 key**；要加第三语言需同时扩 `Lang` 联合、`Entry` 接口和每个条目。注意面板里还有**硬编码中文**（`ui/jobs.ts`、`ui/mastery.ts`、`ui/talent.ts` 的标题/按钮/货币名 `CURRENCY_LABEL`），那些不走 i18n 表。

---

# 六、已确认的坑与缺陷（改动前必读）

1. **经验爆炸**：game.ts:1824 `expForKill(this.level, e.maxHp)` 把绝对 HP 传成了 `healthMultiplier`（progression.ts:49-53 会 `base × max(0.5, hp)`），10 级小怪就能给上万经验。应传 `ENEMIES[type].healthMultiplier`。
2. `spawnPortal()` 重置了 `summonStarted/summonTimer` 却**忘了 `summonWaveSpawned`** → 在召唤波已刷出后死亡复活，传送门会永远停在 `vulnerable` 且不再刷波。
3. 传送门 HP 没乘 `EnemyHealthMultiplier`（与其他敌人不一致）。
4. `PortalSummonTime` 属性形同虚设（game.ts:388 恒用 `BASE.portalSummonTime`）。
5. `stepEnemies` 有死代码：车道漂移乘 0、`SPAWN.minEnemySpacing` 与 `laneOffset` 都没生效（敌人会重叠）。
6. `progress().cleared` 没进存档 → 刷新页面整关重来，与"只重刷未清包"的注释不符。
7. 金怪在正常流程下**永远不会出现**：`UnlockGoldenEnemies` 基础值 0、门限 10、本 slice 里没有天赋节点授予它。
8. `loadSave()` 的返回对象**丢了 `talent/jobs/mastery` 字段** → `game.jobs.load(saved.jobs)` 拿到 undefined，**职业/技能等级/精通/天赋树实际上没有从存档恢复**（等级/金币/货币/守护者仍恢复）。
9. 确定性泄漏：`randRange/randInt/randSign`（core/math.ts）走 `Math.random`，被箭雨抖动与粒子使用 → 同 seed 不保证逐帧一致（`Rng` 只覆盖布局与几率判定）。
10. `Archer_1..5` 在 `renderer.ts` 的注释里仍被称为"walk cycle"，实际是 5 套服装（代码行为已正确，注释过期）。
11. 杂项：Bat/GuardianBat 的 `lifestealPercentOfMaxHealth` 未实现；`tools/*.mjs` 需要外部 Chrome `--remote-debugging-port=9333` 才能跑；README 提到的 `debug.html`/`probe.html` **在仓库里不存在**。

**渲染/美术侧另外几处：**

12. **金怪染色是死代码**：renderer.ts:589 写入 `champion ? 0xffe9a3 : golden ? 0xffcf5a : 0xffffff`，但 renderer.ts:599 **无条件**覆盖成 `hitFlash > 0 ? 0xffb0a0 : 0xffffff` → 金怪/镀金冠军看起来和普通怪**完全一样**。
13. **血条的 z 位置取决于"第一次受伤的时点"**：血条容器在 `barAt()` 首次被调用时才 `entityLayer.addChild`，之后新建的实体（新敌人槽位、宠物槽位）会盖住它。
14. `src/dev/diag.ts` 用的是**另一套坐标假设**（`scale = VIEW_H/600`、可见 600 世界单位），与渲染器的 `viewH/1080` 不一致 → 它只能当"有没有敌人/有没有箭"的粗筛，**不要**用它验取景；而且 `diag.ts:114` 里的 `'Guardian'` 不是 `CHARACTERS` 的合法键（真实键是 `GuardianClaw..GuardianBat`），会稳定输出 `MISSING`。
15. 死资源/死字段：`BG2_*.png`（8 张，`BIOME2` 是别名）、`FullBG1.png`、`BG1_6grass_topOnly.png`、`T_Arrow*.png`、`icon_*2.png`（与 `Guardian_*_0` 字节相同的副本）留在 `public/art/`；`FX.star/shockwave/orb/Trail1` 会被加载但从不绘制；`LoadedSprite.scale/aspect`、`BAR.frameBorder` 从未被读取。
16. HUD 里 `.clear-text`（已清包数）用的图标是 `art/cur/PortalCurrency.png`，与它旁边真正的传送门币计数撞图 → 看 DOM 时容易误判。

---

# 七、验收 / 调试工具

| 命令 | 作用 |
|---|---|
| `npm run dev` | Vite 开发服务器，`--host 0.0.0.0`，5173（手机同 Wi-Fi 可测） |
| `npm run build` | `tsc --noEmit && vite build` → `dist/` |
| `npm run preview` | 预览生产包 |
| `npm run verify` | 用 `tsconfig.verify.json` 编译 `src/dev/verify.ts` 后在 **Node** 里跑 **338 项**断言（属性公式、等级表、守护者排期、游戏循环、传送门门控、死亡/复活契约、技能、seed 确定性、世界取景、美术清单、i18n 覆盖） |
| `npm run typecheck` | 只做类型检查（`noUnusedLocals`/`noUnusedParameters`/`verbatimModuleSyntax` 全开；verify 配置里全关） |
| `node tools/cdp-*.mjs` | 16 个 CDP 验收脚本（hud / jobs / mastery / talent / pets / loot / portal-currency / framing / tap / steady / shot / probe / probe-arrow / tree-check / verify / diag-input），连**已在运行**的 Chrome(`--remote-debugging-port=9333`) 与 `localhost:5173`（可用 `ZAD_BASE` 覆盖）。它们大量断言图标真的加载出来了（`naturalWidth > 0`）、图标互不重复，所以**换图后是很好的自动回归** |
| `node tools/_png_dims.mjs public/art` | 打印目录下每个 PNG 的宽高 / KB / 位深 / colorType —— 核对替换图格式用 |
| `?measure=1` | 运行时几何 overlay：view 尺寸、scale、可见世界单位、美术帧占高百分比、地线行、角色脚点行、`cameraX`、每层美术的屏幕带与 3 份副本的并集、玩家 world→screen |
| `?stats=1` | 实时统计（bars drawn / projectiles drawn / seed 等），同时把同样的文本写进 `document.title`（`ZADSTATS ...`），方便无头断言 |
| `?fast=N` | 快进 N 秒（上限 600）后一次性出图，用于截图/断言，跳过真实等待 |
| `?level=N` / `?tree=0` / `?jobs=1` / `?mastery=1` / `?quiet=1` | 指定起始关、关掉下半带面板、直接打开某个面板、不生成敌人（测试用） |
| `window.__zad` | 运行时暴露 `{ game, renderer, hud, talentPanel, jobsPanel, masteryPanel }`，可直接在控制台/`cdp-probe.mjs` 里操作 |

---

# 八、怎么把仓库跑起来（已在本次走查中实测）

## 8.1 最小步骤

```bash
npm install        # 29 个包，约 40s
npm run dev        # → http://localhost:5173 （同时打印局域网 IP，手机可同 Wi-Fi 打开）
```

- 仓库**没有** `node_modules`、没有 `.env`、没有子模块，`npm install` 即可。
- `.npmrc` 里写死了国内镜像 `registry=https://registry.npmmirror.com`；如果这台机器连不上它，用 `npm install --registry=https://registry.npmjs.org` 覆盖。
- 依赖是真实可安装的：`typescript 7.0.2`（原生版，`tsc --version` 打 `Version 7.0.2`）、`vite 8.3.1`（用 **rolldown** 打包）、`pixi.js 8.21.0`。
- 游戏要**横屏**；竖屏只显示"请横屏游玩"的提示层。

## 8.2 四个脚本实测结果

| 命令 | 实测 |
|---|---|
| `npm run dev` | ✅ `VITE v8.3.1 ready in 519 ms` → `http://localhost:5173/`；`/`、`/src/main.ts`（77 KB 已转译）、`/art/BG1_0sky.png`、`/art/cur/Gold.png` 全部 200 |
| `npm run build` | ✅ `tsc --noEmit` 通过 + `✓ built in 1.56s`；产物 `dist/index.html` 1.37 kB、CSS 32.9 kB、最大的 JS chunk 643 kB（gzip 152 kB）；`dist/art/` 238 张 PNG 原样拷贝，`dist/` 合计 8.56 MB（有一条"chunk > 500 kB"的提示，不是错误） |
| `npm run preview` | ✅ `http://localhost:4173/` 200，`./assets/*.js` 与 `/art/Archer_1.png` 均 200（`base: './'` 让子路径部署也能用） |
| `npm run verify` | ✅ **338/338 checks passed**（Node 里跑真实模拟，无浏览器；结尾会打印 `[localisation]`、`[art]` 等分组） |

## 8.3 想跑 `tools/cdp-*.mjs`（浏览器端验收）

它们**不会自己启动** Chrome 或 Vite，需要先有这两样：

```bash
npm run dev                                                   # 终端 A
chrome --headless=new --remote-debugging-port=9333 \          # 终端 B（或直接开普通 Chrome 加这个参数）
       --user-data-dir=<工作区之外的空目录> --window-size=1280,720 about:blank
ZAD_BASE=http://127.0.0.1:5173 node tools/cdp-framing.mjs     # 终端 C
```

本次实测：`cdp-framing.mjs` **全绿**（3 种视口下角色都在宽度 25%、脚底 46.3%、美术帧占高 55.6%、背景 3 份副本铺满）；`cdp-hud.mjs` 22 项里 21 项通过；`cdp-tap.mjs` 确认"点击真的落箭"。

两个**环境/脚本**层面的注意点（不是游戏逻辑问题）：

1. **`tools/cdp-verify.mjs` 写死了原作者的绝对路径**（`C:/Users/Administrator/Desktop/Zad Archery/analysis/cdp_arrows.png`，第 123 行），在任何其它机器上都会 `ENOENT` 崩掉；其余 15 个脚本都写成工作区相对路径（如 `jobs-1280x720.png`）。
2. Chrome 的 `--user-data-dir` **不要放在工作区里**：Vite 会递归监听项目目录，Chrome 打开 profile 后 Vite 直接 `EBUSY: resource busy or locked, watch '...Cookies'` 崩掉。
3. 顺手提醒：`npm run build` / `dev` 在这台机器的沙箱下会因 Vite 8 需要 `spawn` 子进程（realpath 优化）而报 `spawn EPERM`，放宽权限即可；这是沙箱限制，不是仓库问题。若 `npm` 报 `Log files were not written ... npm-cache\_logs`，那是系统 npm 缓存目录不可写，用 `npm install --cache <可写目录>` 绕过。

