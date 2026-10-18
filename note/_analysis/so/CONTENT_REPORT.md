# Zad Archery 内容资产（从 ScriptableObject 还原）

## 1. 五个 Job 的解锁花费

| Job | 解锁花费 | 被动属性 | 被动值 | 技能 |
|---|---|---|---|---|
| Job0 弓箭手 | **0.0** | - | 0.0 | 3 个 |
| Job1 兽王 | **200.0** | - | 7.0 | 3 个 |
| Job2 狙击 | **1500.0** | - | 20.0 | 3 个 |
| Job3 元素 | **20000.0** | - | 25.0 | 3 个 |
| Job4 暗影 | **300000.0** | - | 5.0 | 3 个 |

## 2. 十五个技能的完整数值

| 技能 | 最高等级 | 每级花费 | 冷却（每级） | 伤害倍率（每级） | 命中数（每级） | 类型 |
|---|---|---|---|---|---|---|
| `BombArrow` | 3 | [70.0, 130.0, 160.0] | [33.0, 33.0, 33.0] | [3.3, 3.4, 3.5] | [2, 2, 3] | 主动 |
| `Multishot` | 3 | [5.0, 50.0, 100.0] | [19.0, 19.0, 17.0] | [1.8, 1.9, 2.0] | [1, 2, 2] | 主动 |
| `RapidFire` | 3 | [45.0, 85.0, 110.0] | [47.0, 47.0, 45.0] | [] | [] | 增益 |
| `Bear` | 3 | [320.0, 700.0, 1500.0] | [45.0, 45.0, 45.0] | [2.0, 2.5, 3.0] | [1, 1, 2] | 宠物 |
| `Falcon` | 3 | [700.0, 1400.0, 2800.0] | [40.0, 40.0, 40.0] | [4.5, 4.7, 5.0] | [3, 3, 4] | 宠物 |
| `Wolf` | 3 | [180.0, 350.0, 800.0] | [45.0, 45.0, 45.0] | [3.0, 3.3, 3.5] | [1, 1, 2] | 宠物 |
| `PiercingShot` | 3 | [2500.0, 5500.0, 11000.0] | [40.0, 38.0, 36.0] | [0.9, 1.0, 1.1] | [1, 2, 2] | 主动 |
| `SharpShooter` | 3 | [5000.0, 13000.0, 25000.0] | [45.0, 43.0, 40.0] | [] | [] | 增益 |
| `SniperScope` | 3 | [1000.0, 2400.0, 4700.0] | [35.0, 32.0, 30.0] | [5.5, 5.7, 6.0] | [8, 8, 9] | 主动 |
| `Blizzard` | 3 | [85000.0, 140000.0, 300000.0] | [0.0, 0.0, 0.0] | [3.0, 3.2, 3.5] | [3, 3, 4] | 被动 |
| `FireArea` | 3 | [12000.0, 40000.0, 95000.0] | [0.0, 0.0, 0.0] | [3.2, 3.3, 3.5] | [1, 1, 1] | 被动 |
| `LightningStrike` | 3 | [35000.0, 85000.0, 135000.0] | [0.0, 0.0, 0.0] | [7.0, 7.2, 7.5] | [4, 4, 5] | 被动 |
| `BatSwarm` | 3 | [200000.0, 600000.0, 1500000.0] | [55.0, 53.0, 50.0] | [3.5, 3.7, 4.0] | [3, 3, 3] | 主动 |
| `DarkMatter` | 3 | [300000.0, 900000.0, 2000000.0] | [25.0, 23.0, 20.0] | [2.0, 2.2, 2.5] | [2, 2, 3] | 主动 |
| `SuperNova` | 3 | [500000.0, 2000000.0, 4000000.0] | [150.0, 145.0, 140.0] | [5.0, 5.5, 6.0] | [10, 10, 10] | 主动 |

## 3. 九个精通

| # | 名称 | 最高等级 | 升级花费公式 | 主属性成长 | 觉醒值 | 巅峰效果 |
|---|---|---|---|---|---|---|
| 0 | `Mastery0` | 100 | `[ 5, 10, 20, 35, 55, 80, 120, 170, 220, 300, 400, 550, 700, 1000, 1300, 1700, 2100, 2600, 3200, 4000 ]` | `0.8+0.2*x` | 1.0 | 0 |
| 1 | `Mastery1` | 100 | `[ 10, 30, 50, 80, 120, 170, 220, 300, 400, 450, 550, 650, 800, 1050, 1300, 1700, 2100, 2600, 3200, 4000 ]` | `1.9+0.1*x` | 10.0 | 0 |
| 2 | `Mastery2` | 10 | `[10,20,40,70,100,130,180,200,250,300,500,700,1000,1500]` | `5*x` | 100.0 | 0 |
| 3 | `Mastery3` | 100 | `[ 10, 30, 60, 100, 150, 220, 300, 400, 500, 600, 650, 750, 900, 1100, 1300, 1700, 2100, 2600, 3200, 4000 ]` | `15*x` | 50.0 | 0 |
| 4 | `Mastery4` | 100 | `[ 10, 30, 60, 100, 150, 220, 300, 400, 500, 600, 650, 750, 900, 1100, 1300, 1700, 2100, 2600, 3200, 4000 ]` | `10*x` | 1.0 | 0 |
| 5 | `Mastery5` | 10 | `[50,70,100,200,300,500,1000,2500]` | `5*x` | 100.0 | 1 |
| 6 | `Mastery6` | 100 | `[ 10, 30, 60, 100, 150, 220, 300, 400, 500, 600, 650, 750, 900, 1100, 1300, 1700, 2100, 2600, 3200, 4000 ]` | `10*x` | 50.0 | 0 |
| 7 | `Mastery7` | 100 | `[ 10, 30, 60, 100, 150, 220, 300, 400, 500, 600, 650, 750, 900, 1100, 1300, 1700, 2100, 2600, 3200, 4000 ]` | `25*x` | 25.0 | 0 |
| 8 | `Mastery8` | 10 | `[1000,2000,3000]` | `5*x` | 100.0 | 2 |

## 4. 六种塑形武器

| 武器 | 伤害公式 | 冷却 | 索敌范围 | 增益属性 | 增益时长公式 |
|---|---|---|---|---|---|
| `Banner` | `1 + (0.1*0.4)*x` | 30.0 | 600.0 | {'m_FileID': 2, 'm_PathID': 3234} | `5 + (0.3*0.4)*x` |
| `Fire` | `2.9 + (0.32*0.4)*x` | 3.2 | 600.0 | {'m_FileID': 0, 'm_PathID': 0} | `5 + 0.5*x` |
| `Hammer` | `2.0 + (0.23*0.4)*x` | 2.5 | 600.0 | {'m_FileID': 0, 'm_PathID': 0} | `5 + 0.5*x` |
| `Lightning` | `0.85 + (0.1*0.4)*x` | 2.6 | 600.0 | {'m_FileID': 0, 'm_PathID': 0} | `5 + 0.5*x` |
| `Shield` | `1 + 0.1*x` | 35.0 | 600.0 | {'m_FileID': 0, 'm_PathID': 5312} | `5 + (0.3*0.4)*x` |
| `Sword` | `1.7 + (0.19*0.4)*x` | 0.8 | 600.0 | {'m_FileID': 0, 'm_PathID': 0} | `5 + 0.5*x` |

## 5. 敌人（24 条）

| functionName | 类型 | 攻速 | 移速 | 血倍 | 伤倍 | 远程 | 可驯服 |
|---|---|---|---|---|---|---|---|
| `Archer` | 2 | 0.33000001311302185 | 85.0 | 1.5 | 1.5 | 1 | 1 |
| `Bat` | 4 | 0.5 | 85.0 | 3.0 | 1.5 | 0 | 1 |
| `Claw` | 0 | 0.30000001192092896 | 80.0 | 1.100000023841858 | 1.0 | 0 | 1 |
| `GuardianArcher` | 8 | 0.949999988079071 | 100.0 | 30.0 | 1.100000023841858 | 1 | 0 |
| `GuardianBat` | 10 | 1.2000000476837158 | 100.0 | 50.0 | 1.25 | 0 | 0 |
| `GuardianClaw` | 6 | 0.949999988079071 | 100.0 | 25.0 | 1.0 | 0 | 0 |
| `GuardianMage` | 9 | 0.949999988079071 | 100.0 | 45.0 | 1.100000023841858 | 1 | 0 |
| `GuardianWarrior` | 7 | 1.0 | 100.0 | 35.0 | 1.2000000476837158 | 0 | 0 |
| `King` | 11 | 1.0 | 0.0 | 200.0 | 0.699999988079071 | 0 | 0 |
| `Mage` | 3 | 0.5 | 85.0 | 1.0 | 2.200000047683716 | 1 | 1 |
| `RunPortal` | 5 | 0.0 | 0.0 | 25.0 | 0.0 | 0 | 0 |
| `Warrior` | 1 | 0.25 | 75.0 | 3.5 | 1.5 | 0 | 1 |
| `None` | 5 | None | None | None | None | None | None |
| `None` | 8 | None | None | None | None | None | None |
| `None` | 1 | None | None | None | None | None | None |
| `None` | 7 | None | None | None | None | None | None |
| `None` | 4 | None | None | None | None | None | None |
| `None` | 6 | None | None | None | None | None | None |
| `None` | 11 | None | None | None | None | None | None |
| `None` | 2 | None | None | None | None | None | None |
| `None` | 9 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 3 | None | None | None | None | None | None |
| `None` | 10 | None | None | None | None | None | None |

## 6. 符文词缀（58 条）

| 词缀 | 类型 | 武器 | 目标 | 最小值 | 最大值 | 取整 | 概率 |
|---|---|---|---|---|---|---|---|
| `Sword_CleaveDamage` | 0 | 0 | 0 | 3.0 | 7.0 | 0 | 100.0 |
| `Sword_ComboDamage` | 0 | 0 | 0 | 5.0 | 13.0 | 0 | 100.0 |
| `Sword_FirstHitDamage` | 0 | 0 | 0 | 70.0 | 100.0 | 0 | 100.0 |
| `Sword_TwinSlashChance` | 0 | 0 | 0 | 10.0 | 35.0 | 0 | 100.0 |
| `Hammer_AftershockDamage` | 0 | 1 | 0 | 15.0 | 35.0 | 0 | 100.0 |
| `Hammer_AoERadius` | 0 | 1 | 0 | 10.0 | 25.0 | 0 | 100.0 |
| `Hammer_DamagePerEnemyHit` | 0 | 1 | 0 | 4.0 | 10.0 | 0 | 100.0 |
| `Hammer_ShatterDamage` | 0 | 1 | 0 | 8.0 | 20.0 | 0 | 100.0 |
| `Lightning_DamagePerChain` | 0 | 2 | 0 | 10.0 | 20.0 | 0 | 100.0 |
| `Lightning_ExtraChains` | 0 | 2 | 0 | 1.0 | 1.0 | 0 | 100.0 |
| `Lightning_FirstTargetDamage` | 0 | 2 | 0 | 70.0 | 100.0 | 0 | 100.0 |
| `Lightning_ForkChance` | 0 | 2 | 0 | 10.0 | 30.0 | 0 | 100.0 |
| `Fire_EliteDamage` | 0 | 3 | 0 | 15.0 | 50.0 | 0 | 100.0 |
| `Fire_ExecuteDamage` | 0 | 3 | 0 | 50.0 | 120.0 | 0 | 100.0 |
| `Fire_MeteorBarrageChance` | 0 | 3 | 0 | 3.0 | 6.0 | 0 | 100.0 |
| `Fire_TwinFallChance` | 0 | 3 | 0 | 15.0 | 30.0 | 0 | 100.0 |
| `Shield_ActiveRegen` | 0 | 4 | 0 | 0.5 | 1.5 | 1 | 100.0 |
| `Shield_EnemyAttackSlow` | 0 | 4 | 0 | 3.0 | 7.0 | 0 | 100.0 |
| `Shield_ExpireHeal` | 0 | 4 | 0 | 5.0 | 10.0 | 0 | 100.0 |
| `Shield_WeaponDamageAura` | 0 | 4 | 0 | 5.0 | 15.0 | 0 | 100.0 |
| `Banner_AttackSpeedBonus` | 0 | 5 | 0 | 15.0 | 30.0 | 0 | 100.0 |
| `Banner_MagazineRefillChance` | 0 | 5 | 0 | 10.0 | 20.0 | 0 | 100.0 |
| `Banner_TripleDamageChance` | 0 | 5 | 0 | 5.0 | 15.0 | 0 | 100.0 |
| `Banner_WeaponHaste` | 0 | 5 | 0 | 5.0 | 15.0 | 0 | 100.0 |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `None` | 0 | None | None | None | None | None | None |
| `Explicit_AttackCooldownSpeed` | 1 | 0 | 0 | 15.0 | 30.0 | 0 | 100.0 |
| `Explicit_AttackDamage` | 1 | 0 | 0 | 10.0 | 20.0 | 0 | 100.0 |
| `Explicit_BuffCooldownSpeed` | 1 | 0 | 1 | 10.0 | 25.0 | 0 | 100.0 |
| `Explicit_BuffDuration` | 1 | 0 | 1 | 1.0 | 2.0 | 1 | 100.0 |
| `Explicit_BuffKillExtend` | 1 | 0 | 1 | 0.1 | 0.2 | 2 | 100.0 |
| `Explicit_BuffStrength` | 1 | 0 | 1 | 10.0 | 20.0 | 0 | 100.0 |
| `Explicit_DoubleDamageChance` | 1 | 0 | 0 | 5.0 | 15.0 | 0 | 100.0 |
| `Explicit_DoubleDurationChance` | 1 | 0 | 1 | 5.0 | 15.0 | 0 | 100.0 |
| `Explicit_DoubleStrengthChance` | 1 | 0 | 1 | 5.0 | 15.0 | 0 | 100.0 |
| `Explicit_FifthHitDamage` | 1 | 0 | 0 | 25.0 | 40.0 | 0 | 100.0 |
| `Explicit_KillGoldBonus` | 1 | 0 | 0 | 20.0 | 35.0 | 0 | 100.0 |
| `Explicit_RepeatAttackChance` | 1 | 0 | 0 | 5.0 | 15.0 | 0 | 100.0 |
| `Explicit_ResetCooldownChance` | 1 | 0 | 1 | 5.0 | 12.0 | 0 | 100.0 |
| `None` | 1 | None | None | None | None | None | None |
| `None` | 1 | None | None | None | None | None | None |
| `None` | 1 | None | None | None | None | None | None |
| `None` | 1 | None | None | None | None | None | None |
| `None` | 1 | None | None | None | None | None | None |
| `None` | 1 | None | None | None | None | None | None |
| `None` | 1 | None | None | None | None | None | None |
| `None` | 1 | None | None | None | None | None | None |
| `None` | 1 | None | None | None | None | None | None |

## 7. 守卫 Perk（10 条）

- `Archer1`  守卫=1  OrderId=0  Stats=2  Values=[100.0, 1.0]
- `Archer2`  守卫=1  OrderId=1  Stats=2  Values=[100.0, 40.0]
- `Bat1`  守卫=4  OrderId=0  Stats=2  Values=[25.0, 10.0]
- `Bat2`  守卫=4  OrderId=1  Stats=2  Values=[2.0, 1.0]
- `Claw1`  守卫=0  OrderId=0  Stats=2  Values=[10.0, 5.0]
- `Claw2`  守卫=0  OrderId=1  Stats=2  Values=[40.0, 20.0]
- `Mage1`  守卫=3  OrderId=0  Stats=2  Values=[100.0, 15.0]
- `Mage2`  守卫=3  OrderId=1  Stats=2  Values=[100.0, 15.0]
- `Warrior1`  守卫=2  OrderId=0  Stats=2  Values=[100.0, 1.0]
- `Warrior2`  守卫=2  OrderId=1  Stats=2  Values=[2.0, 10.0]
