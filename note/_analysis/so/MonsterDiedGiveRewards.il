;; ---- MonsterDiedGiveRewards (993 bytes) ----
  0000: ldc.r8           1
  0009: stloc.0          
  000a: ldarg.s          5
  000c: brfalse.s        64
  000e: ldsfld           instance
  0013: ldfld            stats
  0018: ldfld            PortalPackCurrencyBonus
  001d: callvirt         get_Total
  0022: ldfld            RealValue
  0027: conv.r8          
  0028: stloc.s          9
  002a: ldloc.s          9
  002c: ldc.r8           0
  0035: ble.un.s         23
  0037: ldc.r8           1
  0040: ldloc.s          9
  0042: ldc.r8           100
  004b: div              
  004c: add              
  004d: stloc.0          
  004e: call             get_IsFarmingBack
  0053: brtrue.s         11
  0055: ldc.r8           1
  005e: br.s             5
  0060: ldsfld           FarmRunRewardMultiplier
  0065: stloc.1          
  0066: call             get_BattleLevel
  006b: stloc.2          
  006c: ldloc.2          
  006d: ldc.i4.0         
  006e: call             EnemyGold
  0073: stloc.3          
  0074: ldloc.3          
  0075: ldsfld           instance
  007a: ldfld            stats
  007f: callvirt         GetGoldGainedMultiplier
  0084: mul              
  0085: stloc.3          
  0086: ldloc.3          
  0087: ldloc.0          
  0088: mul              
  0089: stloc.3          
  008a: ldloc.3          
  008b: ldloc.1          
  008c: mul              
  008d: stloc.3          
  008e: ldarg.s          4
  0090: call             System.String::IsNullOrEmpty
  0095: brtrue.s         28
  0097: ldsfld           instance
  009c: ldnull           
  009d: call             UnityEngine.Object::op_Inequality
  00a2: brfalse.s        15
  00a4: ldloc.3          
  00a5: ldsfld           instance
  00aa: ldarg.s          4
  00ac: callvirt         GetKillGoldMultiplier
  00b1: mul              
  00b2: stloc.3          
  00b3: ldc.i4.1         
  00b4: stloc.s          4
  00b6: ldc.r8           0
  00bf: stloc.s          5
  00c1: ldc.i4.0         
  00c2: stloc.s          6
  00c4: ldarg.2          
  00c5: brtrue.s         49
  00c7: ldc.i4.2         
  00c8: stloc.s          4
  00ca: ldloc.2          
  00cb: ldarg.2          
  00cc: call             EnemyCurrencyDrop
  00d1: stloc.s          5
  00d3: ldsfld           instance
  00d8: ldfld            stats
  00dd: ldfld            ClawCurrencyChanceDrop
  00e2: callvirt         get_Total
  00e7: ldfld            RealValue
  00ec: call             IsHappened_Over100Things
  00f1: stloc.s          6
  00f3: br               201
  00f8: ldarg.2          
  00f9: ldc.i4.1         
  00fa: bne.un.s         49
  00fc: ldc.i4.5         
  00fd: stloc.s          4
  00ff: ldloc.2          
  0100: ldarg.2          
  0101: call             EnemyCurrencyDrop
  0106: stloc.s          5
  0108: ldsfld           instance
  010d: ldfld            stats
  0112: ldfld            WarriorCurrencyChanceDrop
  0117: callvirt         get_Total
  011c: ldfld            RealValue
  0121: call             IsHappened_Over100Things
  0126: stloc.s          6
  0128: br               148
  012d: ldarg.2          
  012e: ldc.i4.2         
  012f: bne.un.s         46
  0131: ldc.i4.3         
  0132: stloc.s          4
  0134: ldloc.2          
  0135: ldarg.2          
  0136: call             EnemyCurrencyDrop
  013b: stloc.s          5
  013d: ldsfld           instance
  0142: ldfld            stats
  0147: ldfld            ArcherCurrencyChanceDrop
  014c: callvirt         get_Total
  0151: ldfld            RealValue
  0156: call             IsHappened_Over100Things
  015b: stloc.s          6
  015d: br.s             98
  015f: ldarg.2          
  0160: ldc.i4.3         
  0161: bne.un.s         46
  0163: ldc.i4.6         
  0164: stloc.s          4
  0166: ldloc.2          
  0167: ldarg.2          
  0168: call             EnemyCurrencyDrop
  016d: stloc.s          5
  016f: ldsfld           instance
  0174: ldfld            stats
  0179: ldfld            MageCurrencyChanceDrop
  017e: callvirt         get_Total
  0183: ldfld            RealValue
  0188: call             IsHappened_Over100Things
  018d: stloc.s          6
  018f: br.s             48
  0191: ldarg.2          
  0192: ldc.i4.4         
  0193: bne.un.s         44
  0195: ldc.i4.7         
  0196: stloc.s          4
  0198: ldloc.2          
  0199: ldarg.2          
  019a: call             EnemyCurrencyDrop
  019f: stloc.s          5
  01a1: ldsfld           instance
  01a6: ldfld            stats
  01ab: ldfld            BatCurrencyChanceDrop
  01b0: callvirt         get_Total
  01b5: ldfld            RealValue
  01ba: call             IsHappened_Over100Things
  01bf: stloc.s          6
  01c1: ldloc.0          
  01c2: ldc.r8           1
  01cb: beq.s            24
  01cd: ldloc.s          5
  01cf: ldc.r8           0
  01d8: ble.un.s         11
  01da: ldloc.s          5
  01dc: ldloc.0          
  01dd: mul              
  01de: call             System.Math::Ceiling
  01e3: stloc.s          5
  01e5: ldloc.1          
  01e6: ldc.r8           1
  01ef: beq.s            24
  01f1: ldloc.s          5
  01f3: ldc.r8           0
  01fc: ble.un.s         11
  01fe: ldloc.s          5
  0200: ldloc.1          
  0201: mul              
  0202: call             System.Math::Floor
  0207: stloc.s          5
  0209: ldarg.1          
  020a: stloc.s          7
  020c: ldarg.2          
  020d: ldc.i4.5         
  020e: bne.un.s         61
  0210: ldsfld           instance
  0215: ldc.i4.s         15
  0217: callvirt         PlayGeneralSound
  021c: ldc.i4.4         
  021d: stloc.s          4
  021f: ldloc.2          
  0220: call             IsPortalCurrencyOwed
  0225: brtrue.s         3
  0227: ldc.i4.0         
  0228: br.s             1
  022a: ldc.i4.1         
  022b: conv.r8          
  022c: stloc.s          5
  022e: ldloc.s          5
  0230: ldc.r8           0
  0239: ble.un.s         6
  023b: ldloc.2          
  023c: call             MarkPortalCurrencyPaid
  0241: ldc.i4.1         
  0242: stloc.s          6
  0244: ldarg.0          
  0245: ldarg.1          
  0246: call             ResolvePortalCurrencyDropPosition
  024b: stloc.s          7
  024d: ldsfld           instance
  0252: ldfld            stats
  0257: ldfld            GuaranteeMonsterCurrencyDrop
  025c: callvirt         get_Total
  0261: callvirt         get_RealValue
  0266: ldc.i4.0         
  0267: ble.s            41
  0269: ldloc.s          4
  026b: ldc.i4.1         
  026c: beq.s            36
  026e: ldloc.s          6
  0270: ldsfld           instance
  0275: ldfld            stats
  027a: ldfld            GuaranteeMonsterCurrencyDrop
  027f: callvirt         get_Total
  0284: callvirt         get_RealValue
  0289: conv.r4          
  028a: call             IsHappened_Over100Things
  028f: add              
  0290: stloc.s          6
  0292: ldsfld           instance
  0297: ldfld            stats
  029c: ldfld            GoldCoinsToDrop
  02a1: callvirt         get_Total
  02a6: callvirt         get_RealValue
  02ab: ldsfld           instance
  02b0: ldfld            stats
  02b5: ldfld            GoldChanceToDrop
  02ba: callvirt         get_Total
  02bf: ldfld            RealValue
  02c4: call             IsHappened_Over100Things
  02c9: add              
  02ca: stloc.s          8
  02cc: ldsfld           instance
  02d1: ldnull           
  02d2: call             UnityEngine.Object::op_Inequality
  02d7: brfalse          193
  02dc: ldc.i4.0         
  02dd: stloc.s          10
  02df: br.s             33
  02e1: ldsfld           instance
  02e6: ldarg.1          
  02e7: ldc.i4.1         
  02e8: ldloc.3          
  02e9: ldarg.2          
  02ea: ldnull           
  02eb: ldc.i4.0         
  02ec: ldnull           
  02ed: ldloca.s         11
  02ef: fe.initobj       <spec>
  02f5: ldloc.s          11
  02f7: callvirt         SpawnCurrencyDrop
  02fc: ldloc.s          10
  02fe: ldc.i4.1         
  02ff: add              
  0300: stloc.s          10
  0302: ldloc.s          10
  0304: ldloc.s          8
  0306: blt.s            -39
  0308: ldc.i4.0         
  0309: stloc.s          12
  030b: br.s             36
  030d: ldsfld           instance
  0312: ldloc.s          7
  0314: ldloc.s          4
  0316: ldloc.s          5
  0318: ldarg.2          
  0319: ldnull           
  031a: ldc.i4.0         
  031b: ldnull           
  031c: ldloca.s         11
  031e: fe.initobj       <spec>
  0324: ldloc.s          11
  0326: callvirt         SpawnCurrencyDrop
  032b: ldloc.s          12
  032d: ldc.i4.1         
  032e: add              
  032f: stloc.s          12
  0331: ldloc.s          12
  0333: ldloc.s          6
  0335: blt.s            -42
  0337: ldsfld           instance
  033c: ldfld            stats
  0341: ldfld            ChanceToDropHealthPotion
  0346: callvirt         get_Total
  034b: ldfld            RealValue
  0350: call             IsHappened
  0355: brfalse.s        105
  0357: ldsfld           instance
  035c: ldfld            stats
  0361: ldfld            HealthPotionRegenPercentage
  0366: callvirt         get_Total
  036b: ldfld            RealValue
  0370: ldc.r4           100
  0375: div              
  0376: conv.r8          
  0377: ldsfld           instance
  037c: ldfld            stats
  0381: callvirt         GetTotalHealth
  0386: mul              
  0387: call             System.Math::Ceiling
  038c: stloc.s          13
  038e: ldsfld           instance
  0393: ldarg.1          
  0394: ldloc.s          13
  0396: callvirt         SpawnHealthPotionDrop
  039b: br.s             35
  039d: ldarg.0          
  039e: ldc.i4.1         
  039f: ldloc.3          
  03a0: ldloc.s          8
  03a2: conv.r8          
  03a3: mul              
  03a4: ldc.i4.0         
  03a5: ldc.i4.1         
  03a6: call             ChangeCurrency
  03ab: ldloc.s          6
  03ad: ldc.i4.0         
  03ae: ble.s            16
  03b0: ldarg.0          
  03b1: ldloc.s          4
  03b3: ldloc.s          5
  03b5: ldloc.s          6
  03b7: conv.r8          
  03b8: mul              
  03b9: ldc.i4.0         
  03ba: ldc.i4.1         
  03bb: call             ChangeCurrency
  03c0: ldsfld           instance
  03c5: ldnull           
  03c6: call             UnityEngine.Object::op_Inequality
  03cb: brfalse.s        19
  03cd: call             get_IsFarmingBack
  03d2: brtrue.s         12
  03d4: ldsfld           instance
  03d9: ldarg.1          
  03da: ldarg.2          
  03db: callvirt         TryDropMonsterLoot
  03e0: ret              