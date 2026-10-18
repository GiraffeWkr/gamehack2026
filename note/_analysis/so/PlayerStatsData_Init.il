;; ---- InitData (2779 bytes) ----
  0000: ldarg.0          
  0001: callvirt         InitList
  0006: ldarg.0          
  0007: call             Init
  000c: ldarg.0          
  000d: ldstr            "Damage"
  0012: ldc.i4.0         
  0013: ldsfld           BaseDamage
  0018: ldc.i4.1         
  0019: callvirt         ChangeAStat
  001e: ldarg.0          
  001f: ldstr            "Health"
  0024: ldc.i4.0         
  0025: ldsfld           BaseHealth
  002a: ldc.i4.1         
  002b: callvirt         ChangeAStat
  0030: ldarg.0          
  0031: ldstr            "AttackRange"
  0036: ldc.i4.0         
  0037: ldsfld           BaseAttackRange
  003c: conv.r8          
  003d: ldc.i4.1         
  003e: callvirt         ChangeAStat
  0043: ldarg.0          
  0044: ldstr            "NumberOfMouseProjectiles"
  0049: ldc.i4.0         
  004a: ldc.r8           1
  0053: ldc.i4.1         
  0054: callvirt         ChangeAStat
  0059: ldarg.0          
  005a: ldstr            "MouseMagazineRegenTime"
  005f: ldc.i4.0         
  0060: ldsfld           BaseMouseMagazineRegenTime
  0065: conv.r8          
  0066: ldc.i4.1         
  0067: callvirt         ChangeAStat
  006c: ldarg.0          
  006d: ldstr            "MouseMagazineSize"
  0072: ldc.i4.0         
  0073: ldc.r8           1
  007c: ldc.i4.1         
  007d: callvirt         ChangeAStat
  0082: ldarg.0          
  0083: ldstr            "MouseNumberOfHits"
  0088: ldc.i4.0         
  0089: ldc.r8           1
  0092: ldc.i4.1         
  0093: callvirt         ChangeAStat
  0098: ldarg.0          
  0099: ldstr            "MouseMaxNumberOfEnemies"
  009e: ldc.i4.0         
  009f: ldc.r8           2
  00a8: ldc.i4.1         
  00a9: callvirt         ChangeAStat
  00ae: ldarg.0          
  00af: ldstr            "HealthPotionRegenPercentage"
  00b4: ldc.i4.0         
  00b5: ldsfld           BaseHealthPotionRegenPercentage
  00ba: conv.r8          
  00bb: ldc.i4.1         
  00bc: callvirt         ChangeAStat
  00c1: ldarg.0          
  00c2: ldstr            "WarriorChanceToSpawn"
  00c7: ldc.i4.0         
  00c8: ldc.r8           4
  00d1: ldc.i4.1         
  00d2: callvirt         ChangeAStat
  00d7: ldarg.0          
  00d8: ldstr            "ArcherChanceToSpawn"
  00dd: ldc.i4.0         
  00de: ldc.r8           5
  00e7: ldc.i4.1         
  00e8: callvirt         ChangeAStat
  00ed: ldarg.0          
  00ee: ldstr            "MageChanceToSpawn"
  00f3: ldc.i4.0         
  00f4: ldc.r8           4
  00fd: ldc.i4.1         
  00fe: callvirt         ChangeAStat
  0103: ldarg.0          
  0104: ldstr            "BatChanceToSpawn"
  0109: ldc.i4.0         
  010a: ldc.r8           4
  0113: ldc.i4.1         
  0114: callvirt         ChangeAStat
  0119: ldarg.0          
  011a: ldstr            "PortalSummonTime"
  011f: ldc.i4.0         
  0120: ldsfld           BasePortalSummonTime
  0125: conv.r8          
  0126: ldc.i4.1         
  0127: callvirt         ChangeAStat
  012c: ldarg.0          
  012d: ldstr            "PortalHealthMultiplier"
  0132: ldc.i4.0         
  0133: ldc.r8           1
  013c: ldc.i4.1         
  013d: callvirt         ChangeAStat
  0142: ldarg.0          
  0143: ldstr            "OrbDuration"
  0148: ldc.i4.0         
  0149: ldc.r8           15
  0152: ldc.i4.1         
  0153: callvirt         ChangeAStat
  0158: ldarg.0          
  0159: ldstr            "ChestCoins_CurrencyChest"
  015e: ldc.i4.0         
  015f: ldsfld           BaseChestCoins_CurrencyChest
  0164: conv.r8          
  0165: ldc.i4.1         
  0166: callvirt         ChangeAStat
  016b: ldarg.0          
  016c: ldstr            "ChestCoinMultiplier_CurrencyChest"
  0171: ldc.i4.0         
  0172: ldsfld           BaseChestCoinMultiplier_CurrencyChest
  0177: ldc.i4.1         
  0178: callvirt         ChangeAStat
  017d: ldarg.0          
  017e: ldstr            "ChestCoins_StandardChest"
  0183: ldc.i4.0         
  0184: ldsfld           BaseChestCoins_StandardChest
  0189: conv.r8          
  018a: ldc.i4.1         
  018b: callvirt         ChangeAStat
  0190: ldarg.0          
  0191: ldstr            "ChestCoinMultiplier_StandardChest"
  0196: ldc.i4.0         
  0197: ldsfld           BaseChestCoinMultiplier_StandardChest
  019c: ldc.i4.1         
  019d: callvirt         ChangeAStat
  01a2: ldarg.0          
  01a3: ldstr            "ChestCoins_LegendaryChest"
  01a8: ldc.i4.0         
  01a9: ldsfld           BaseChestCoins_LegendaryChest
  01ae: conv.r8          
  01af: ldc.i4.1         
  01b0: callvirt         ChangeAStat
  01b5: ldarg.0          
  01b6: ldstr            "ChestCoinMultiplier_LegendaryChest"
  01bb: ldc.i4.0         
  01bc: ldsfld           BaseChestCoinMultiplier_LegendaryChest
  01c1: ldc.i4.1         
  01c2: callvirt         ChangeAStat
  01c7: ldarg.0          
  01c8: ldstr            "ChestContentCount_Item"
  01cd: ldc.i4.0         
  01ce: ldsfld           BaseChestContentCount_Item
  01d3: conv.r8          
  01d4: ldc.i4.1         
  01d5: callvirt         ChangeAStat
  01da: ldarg.0          
  01db: ldstr            "ChestContentCount_Rune"
  01e0: ldc.i4.0         
  01e1: ldsfld           BaseChestContentCount_Rune
  01e6: conv.r8          
  01e7: ldc.i4.1         
  01e8: callvirt         ChangeAStat
  01ed: ldarg.0          
  01ee: ldstr            "ChestContentCount_Scroll"
  01f3: ldc.i4.0         
  01f4: ldsfld           BaseChestContentCount_Scroll
  01f9: conv.r8          
  01fa: ldc.i4.1         
  01fb: callvirt         ChangeAStat
  0200: ldarg.0          
  0201: ldstr            "ChestContentCount_Legendary"
  0206: ldc.i4.0         
  0207: ldsfld           BaseChestContentCount_Legendary
  020c: conv.r8          
  020d: ldc.i4.1         
  020e: callvirt         ChangeAStat
  0213: ldarg.0          
  0214: ldstr            "ChestContentRarity"
  0219: ldc.i4.0         
  021a: ldsfld           BaseChestContentRarity
  021f: conv.r8          
  0220: ldc.i4.1         
  0221: callvirt         ChangeAStat
  0226: ldarg.0          
  0227: ldstr            "GoldenRewardMultiplier"
  022c: ldc.i4.0         
  022d: ldsfld           BaseGoldenRewardMultiplier
  0232: conv.r8          
  0233: ldc.i4.1         
  0234: callvirt         ChangeAStat
  0239: ldarg.0          
  023a: ldstr            "GoldGained"
  023f: ldc.i4.0         
  0240: ldc.r8           1
  0249: ldc.i4.1         
  024a: callvirt         ChangeAStat
  024f: ldarg.0          
  0250: ldstr            "ExpGained"
  0255: ldc.i4.0         
  0256: ldc.r8           1
  025f: ldc.i4.1         
  0260: callvirt         ChangeAStat
  0265: ldarg.0          
  0266: ldstr            "GoldCoinsToDrop"
  026b: ldc.i4.0         
  026c: ldc.r8           1
  0275: ldc.i4.1         
  0276: callvirt         ChangeAStat
  027b: ldarg.0          
  027c: ldstr            "RoA_CallCount"
  0281: ldc.i4.0         
  0282: ldc.r8           3
  028b: ldc.i4.1         
  028c: callvirt         ChangeAStat
  0291: ldarg.0          
  0292: ldstr            "PlayerMovementSpeed"
  0297: ldc.i4.0         
  0298: ldsfld           BasePlayerMovementSpeed
  029d: conv.r8          
  029e: ldc.i4.1         
  029f: callvirt         ChangeAStat
  02a4: ldarg.0          
  02a5: ldstr            "EnemyMovementSpeedMultiplier"
  02aa: ldc.i4.0         
  02ab: ldc.r8           1
  02b4: ldc.i4.1         
  02b5: callvirt         ChangeAStat
  02ba: ldarg.0          
  02bb: ldstr            "EnemyAttackSpeedMultiplier"
  02c0: ldc.i4.0         
  02c1: ldc.r8           1
  02ca: ldc.i4.1         
  02cb: callvirt         ChangeAStat
  02d0: ldarg.0          
  02d1: ldstr            "EnemyHealthMultiplier"
  02d6: ldc.i4.0         
  02d7: ldc.r8           1
  02e0: ldc.i4.1         
  02e1: callvirt         ChangeAStat
  02e6: ldarg.0          
  02e7: ldstr            "EnemyDamageMultiplier"
  02ec: ldc.i4.0         
  02ed: ldc.r8           1
  02f6: ldc.i4.1         
  02f7: callvirt         ChangeAStat
  02fc: ldarg.0          
  02fd: ldstr            "PlayerAttackSpeed"
  0302: ldc.i4.0         
  0303: ldsfld           BasePlayerAttackSpeed
  0308: conv.r8          
  0309: ldc.i4.1         
  030a: callvirt         ChangeAStat
  030f: ldarg.0          
  0310: ldstr            "ShapingCooldownSpeed"
  0315: ldc.i4.0         
  0316: ldc.r8           1
  031f: ldc.i4.1         
  0320: callvirt         ChangeAStat
  0325: ldarg.0          
  0326: ldstr            "MaximumSkillPowers"
  032b: ldc.i4.0         
  032c: ldsfld           BaseMaximumSkillPowers
  0331: conv.r8          
  0332: ldc.i4.1         
  0333: callvirt         ChangeAStat
  0338: ldarg.0          
  0339: ldstr            "MiningPickaxeSpeed"
  033e: ldc.i4.0         
  033f: ldc.r8           1
  0348: ldc.i4.1         
  0349: callvirt         ChangeAStat
  034e: ldarg.0          
  034f: ldstr            "WormholeShotCount"
  0354: ldc.i4.0         
  0355: ldsfld           WormholeShotCopies
  035a: conv.r8          
  035b: ldc.i4.1         
  035c: callvirt         ChangeAStat
  0361: ldarg.0          
  0362: ldstr            "ExplosiveArrows_RadiusOfEffect"
  0367: ldc.i4.0         
  0368: ldsfld           ExplosiveArrows_Radius
  036d: conv.r8          
  036e: ldc.i4.1         
  036f: callvirt         ChangeAStat
  0374: ldarg.0          
  0375: ldstr            "RuneImplicitsCount"
  037a: ldc.i4.0         
  037b: ldc.r8           1
  0384: ldc.i4.1         
  0385: callvirt         ChangeAStat
  038a: ldarg.0          
  038b: ldstr            "BaseMaxValueMultiplier"
  0390: ldc.i4.0         
  0391: ldc.r8           1
  039a: ldc.i4.1         
  039b: callvirt         ChangeAStat
  03a0: ldarg.0          
  03a1: ldstr            "BaseMinValueMultiplier"
  03a6: ldc.i4.0         
  03a7: ldc.r8           1
  03b0: ldc.i4.1         
  03b1: callvirt         ChangeAStat
  03b6: ldarg.0          
  03b7: ldstr            "CraftingLuck"
  03bc: ldc.i4.0         
  03bd: ldc.r8           1
  03c6: ldc.i4.1         
  03c7: callvirt         ChangeAStat
  03cc: ldarg.0          
  03cd: ldstr            "ItemStatValuesMultiplier"
  03d2: ldc.i4.0         
  03d3: ldc.r8           1
  03dc: ldc.i4.1         
  03dd: callvirt         ChangeAStat
  03e2: ldarg.0          
  03e3: ldstr            "ItemImprovment_StartingValue"
  03e8: ldc.i4.0         
  03e9: ldsfld           BaseItemImprovment_StartingValue
  03ee: conv.r8          
  03ef: ldc.i4.1         
  03f0: callvirt         ChangeAStat
  03f5: ldarg.0          
  03f6: ldstr            "ItemImprovment_DecreasePerImprovement"
  03fb: ldc.i4.0         
  03fc: ldsfld           BaseItemImprovment_DecreasePerImprovement
  0401: conv.r8          
  0402: ldc.i4.1         
  0403: callvirt         ChangeAStat
  0408: ldarg.0          
  0409: ldstr            "ItemImprovment_MinimumValue"
  040e: ldc.i4.0         
  040f: ldsfld           BaseItemImprovment_MinimumValue
  0414: conv.r8          
  0415: ldc.i4.1         
  0416: callvirt         ChangeAStat
  041b: ldarg.0          
  041c: ldstr            "Multishot_NumberOfProjectiles"
  0421: ldc.i4.0         
  0422: ldc.r8           3
  042b: ldc.i4.1         
  042c: callvirt         ChangeAStat
  0431: ldarg.0          
  0432: ldstr            "Multishot_NumberOfHits"
  0437: ldc.i4.0         
  0438: ldsfld           JobSkillDict
  043d: ldstr            "Multishot"
  0442: callvirt         <tbl 0x1b>::get_Item
  0447: ldc.i4.1         
  0448: callvirt         GetNumberOfHitsForLevel
  044d: conv.r8          
  044e: ldc.i4.1         
  044f: callvirt         ChangeAStat
  0454: ldarg.0          
  0455: ldstr            "Multishot_Cooldown"
  045a: ldc.i4.0         
  045b: ldsfld           JobSkillDict
  0460: ldstr            "Multishot"
  0465: callvirt         <tbl 0x1b>::get_Item
  046a: ldfld            cooldowns
  046f: ldc.i4.0         
  0470: callvirt         <tbl 0x1b>::get_Item
  0475: conv.r8          
  0476: ldc.i4.1         
  0477: callvirt         ChangeAStat
  047c: ldarg.0          
  047d: ldstr            "BombArrow_RadiusOfEffect"
  0482: ldc.i4.0         
  0483: ldc.r8           9
  048c: ldc.i4.1         
  048d: callvirt         ChangeAStat
  0492: ldarg.0          
  0493: ldstr            "BombArrow_NumberOfHits"
  0498: ldc.i4.0         
  0499: ldsfld           JobSkillDict
  049e: ldstr            "BombArrow"
  04a3: callvirt         <tbl 0x1b>::get_Item
  04a8: ldc.i4.1         
  04a9: callvirt         GetNumberOfHitsForLevel
  04ae: conv.r8          
  04af: ldc.i4.1         
  04b0: callvirt         ChangeAStat
  04b5: ldarg.0          
  04b6: ldstr            "BombArrow_Cooldown"
  04bb: ldc.i4.0         
  04bc: ldsfld           JobSkillDict
  04c1: ldstr            "BombArrow"
  04c6: callvirt         <tbl 0x1b>::get_Item
  04cb: ldfld            cooldowns
  04d0: ldc.i4.0         
  04d1: callvirt         <tbl 0x1b>::get_Item
  04d6: conv.r8          
  04d7: ldc.i4.1         
  04d8: callvirt         ChangeAStat
  04dd: ldarg.0          
  04de: ldstr            "SniperScope_NumberOfAttacks"
  04e3: ldc.i4.0         
  04e4: ldc.r8           1
  04ed: ldc.i4.1         
  04ee: callvirt         ChangeAStat
  04f3: ldarg.0          
  04f4: ldstr            "SniperScope_Cooldown"
  04f9: ldc.i4.0         
  04fa: ldsfld           JobSkillDict
  04ff: ldstr            "SniperScope"
  0504: callvirt         <tbl 0x1b>::get_Item
  0509: ldfld            cooldowns
  050e: ldc.i4.0         
  050f: callvirt         <tbl 0x1b>::get_Item
  0514: conv.r8          
  0515: ldc.i4.1         
  0516: callvirt         ChangeAStat
  051b: ldarg.0          
  051c: ldstr            "SniperScope_NumberOfHits"
  0521: ldc.i4.0         
  0522: ldsfld           JobSkillDict
  0527: ldstr            "SniperScope"
  052c: callvirt         <tbl 0x1b>::get_Item
  0531: ldc.i4.1         
  0532: callvirt         GetNumberOfHitsForLevel
  0537: conv.r8          
  0538: ldc.i4.1         
  0539: callvirt         ChangeAStat
  053e: ldarg.0          
  053f: ldstr            "BatSwarm_Duration"
  0544: ldc.i4.0         
  0545: ldsfld           JobSkillDict
  054a: ldstr            "BatSwarm"
  054f: callvirt         <tbl 0x1b>::get_Item
  0554: ldc.i4.1         
  0555: callvirt         GetDurationForLevel
  055a: conv.r8          
  055b: ldc.i4.1         
  055c: callvirt         ChangeAStat
  0561: ldarg.0          
  0562: ldstr            "BatSwarm_Cooldown"
  0567: ldc.i4.0         
  0568: ldsfld           JobSkillDict
  056d: ldstr            "BatSwarm"
  0572: callvirt         <tbl 0x1b>::get_Item
  0577: ldfld            cooldowns
  057c: ldc.i4.0         
  057d: callvirt         <tbl 0x1b>::get_Item
  0582: conv.r8          
  0583: ldc.i4.1         
  0584: callvirt         ChangeAStat
  0589: ldarg.0          
  058a: ldstr            "BatSwarm_NumberOfHits"
  058f: ldc.i4.0         
  0590: ldsfld           JobSkillDict
  0595: ldstr            "BatSwarm"
  059a: callvirt         <tbl 0x1b>::get_Item
  059f: ldc.i4.1         
  05a0: callvirt         GetNumberOfHitsForLevel
  05a5: conv.r8          
  05a6: ldc.i4.1         
  05a7: callvirt         ChangeAStat
  05ac: ldarg.0          
  05ad: ldstr            "BatSwarm_RadiusOfEffect"
  05b2: ldc.i4.0         
  05b3: ldc.r8           15
  05bc: ldc.i4.1         
  05bd: callvirt         ChangeAStat
  05c2: ldarg.0          
  05c3: ldstr            "BatSwarm_BatsAmountMultiplier"
  05c8: ldc.i4.0         
  05c9: ldc.r8           1
  05d2: ldc.i4.1         
  05d3: callvirt         ChangeAStat
  05d8: ldarg.0          
  05d9: ldstr            "RapidFire_Cooldown"
  05de: ldc.i4.0         
  05df: ldsfld           JobSkillDict
  05e4: ldstr            "RapidFire"
  05e9: callvirt         <tbl 0x1b>::get_Item
  05ee: ldfld            cooldowns
  05f3: ldc.i4.0         
  05f4: callvirt         <tbl 0x1b>::get_Item
  05f9: conv.r8          
  05fa: ldc.i4.1         
  05fb: callvirt         ChangeAStat
  0600: ldarg.0          
  0601: ldstr            "RapidFire_Duration"
  0606: ldc.i4.0         
  0607: ldsfld           JobSkillDict
  060c: ldstr            "RapidFire"
  0611: callvirt         <tbl 0x1b>::get_Item
  0616: ldc.i4.1         
  0617: callvirt         GetBuffDurationForLevel
  061c: conv.r8          
  061d: ldc.i4.1         
  061e: callvirt         ChangeAStat
  0623: ldarg.0          
  0624: ldstr            "RapidFire_BuffValue"
  0629: ldc.i4.0         
  062a: ldsfld           JobSkillDict
  062f: ldstr            "RapidFire"
  0634: callvirt         <tbl 0x1b>::get_Item
  0639: ldc.i4.1         
  063a: callvirt         GetBuffValueForLevel
  063f: conv.r8          
  0640: ldc.i4.1         
  0641: callvirt         ChangeAStat
  0646: ldarg.0          
  0647: ldstr            "SharpShooter_Cooldown"
  064c: ldc.i4.0         
  064d: ldsfld           JobSkillDict
  0652: ldstr            "SharpShooter"
  0657: callvirt         <tbl 0x1b>::get_Item
  065c: ldfld            cooldowns
  0661: ldc.i4.0         
  0662: callvirt         <tbl 0x1b>::get_Item
  0667: conv.r8          
  0668: ldc.i4.1         
  0669: callvirt         ChangeAStat
  066e: ldarg.0          
  066f: ldstr            "SharpShooter_Duration"
  0674: ldc.i4.0         
  0675: ldsfld           JobSkillDict
  067a: ldstr            "SharpShooter"
  067f: callvirt         <tbl 0x1b>::get_Item
  0684: ldc.i4.1         
  0685: callvirt         GetBuffDurationForLevel
  068a: conv.r8          
  068b: ldc.i4.1         
  068c: callvirt         ChangeAStat
  0691: ldarg.0          
  0692: ldstr            "SharpShooter_BuffValue"
  0697: ldc.i4.0         
  0698: ldsfld           JobSkillDict
  069d: ldstr            "SharpShooter"
  06a2: callvirt         <tbl 0x1b>::get_Item
  06a7: ldc.i4.1         
  06a8: callvirt         GetBuffValueForLevel
  06ad: conv.r8          
  06ae: ldc.i4.1         
  06af: callvirt         ChangeAStat
  06b4: ldarg.0          
  06b5: ldstr            "SharpShooter_CooldownReductionOnCrit"
  06ba: ldc.i4.0         
  06bb: ldsfld           BaseSharpShooterCooldownReductionOnCrit
  06c0: conv.r8          
  06c1: ldc.i4.1         
  06c2: callvirt         ChangeAStat
  06c7: ldarg.0          
  06c8: ldstr            "PiercingShot_Cooldown"
  06cd: ldc.i4.0         
  06ce: ldsfld           JobSkillDict
  06d3: ldstr            "PiercingShot"
  06d8: callvirt         <tbl 0x1b>::get_Item
  06dd: ldfld            cooldowns
  06e2: ldc.i4.0         
  06e3: callvirt         <tbl 0x1b>::get_Item
  06e8: conv.r8          
  06e9: ldc.i4.1         
  06ea: callvirt         ChangeAStat
  06ef: ldarg.0          
  06f0: ldstr            "PiercingShot_PierceCount"
  06f5: ldc.i4.0         
  06f6: ldsfld           JobSkillDict
  06fb: ldstr            "PiercingShot"
  0700: callvirt         <tbl 0x1b>::get_Item
  0705: ldc.i4.1         
  0706: callvirt         GetPierceCountForLevel
  070b: conv.r8          
  070c: ldc.i4.1         
  070d: callvirt         ChangeAStat
  0712: ldarg.0          
  0713: ldstr            "PiercingShot_NumberOfTurns"
  0718: ldc.i4.0         
  0719: ldsfld           JobSkillDict
  071e: ldstr            "PiercingShot"
  0723: callvirt         <tbl 0x1b>::get_Item
  0728: ldc.i4.1         
  0729: callvirt         GetNumberOfTurnsForLevel
  072e: conv.r8          
  072f: ldc.i4.1         
  0730: callvirt         ChangeAStat
  0735: ldarg.0          
  0736: ldstr            "PiercingShot_NumberOfHits"
  073b: ldc.i4.0         
  073c: ldsfld           JobSkillDict
  0741: ldstr            "PiercingShot"
  0746: callvirt         <tbl 0x1b>::get_Item
  074b: ldc.i4.1         
  074c: callvirt         GetNumberOfHitsForLevel
  0751: conv.r8          
  0752: ldc.i4.1         
  0753: callvirt         ChangeAStat
  0758: ldarg.0          
  0759: ldstr            "DarkMatter_Cooldown"
  075e: ldc.i4.0         
  075f: ldsfld           JobSkillDict
  0764: ldstr            "DarkMatter"
  0769: callvirt         <tbl 0x1b>::get_Item
  076e: ldfld            cooldowns
  0773: ldc.i4.0         
  0774: callvirt         <tbl 0x1b>::get_Item
  0779: conv.r8          
  077a: ldc.i4.1         
  077b: callvirt         ChangeAStat
  0780: ldarg.0          
  0781: ldstr            "DarkMatter_RadiusOfEffect"
  0786: ldc.i4.0         
  0787: ldsfld           BaseDarkMatter_RadiusOfEffect
  078c: conv.r8          
  078d: ldc.i4.1         
  078e: callvirt         ChangeAStat
  0793: ldarg.0          
  0794: ldstr            "DarkMatter_NumberOfHits"
  0799: ldc.i4.0         
  079a: ldsfld           JobSkillDict
  079f: ldstr            "DarkMatter"
  07a4: callvirt         <tbl 0x1b>::get_Item
  07a9: ldc.i4.1         
  07aa: callvirt         GetNumberOfHitsForLevel
  07af: conv.r8          
  07b0: ldc.i4.1         
  07b1: callvirt         ChangeAStat
  07b6: ldarg.0          
  07b7: ldstr            "DarkMatter_DamageMultiplier"
  07bc: ldc.i4.0         
  07bd: ldc.r8           1
  07c6: ldc.i4.1         
  07c7: callvirt         ChangeAStat
  07cc: ldarg.0          
  07cd: ldstr            "SuperNova_Cooldown"
  07d2: ldc.i4.0         
  07d3: ldsfld           JobSkillDict
  07d8: ldstr            "SuperNova"
  07dd: callvirt         <tbl 0x1b>::get_Item
  07e2: ldfld            cooldowns
  07e7: ldc.i4.0         
  07e8: callvirt         <tbl 0x1b>::get_Item
  07ed: conv.r8          
  07ee: ldc.i4.1         
  07ef: callvirt         ChangeAStat
  07f4: ldarg.0          
  07f5: ldstr            "SuperNova_NumberOfHits"
  07fa: ldc.i4.0         
  07fb: ldsfld           JobSkillDict
  0800: ldstr            "SuperNova"
  0805: callvirt         <tbl 0x1b>::get_Item
  080a: ldc.i4.1         
  080b: callvirt         GetNumberOfHitsForLevel
  0810: conv.r8          
  0811: ldc.i4.1         
  0812: callvirt         ChangeAStat
  0817: ldarg.0          
  0818: ldstr            "CriticalMultiplier"
  081d: ldc.i4.0         
  081e: ldsfld           BaseCriticalMultiplier
  0823: conv.r8          
  0824: ldc.i4.1         
  0825: callvirt         ChangeAStat
  082a: ldarg.0          
  082b: ldstr            "AlliesAttackSpeedMultiplier"
  0830: ldc.i4.0         
  0831: ldc.r8           1
  083a: ldc.i4.1         
  083b: callvirt         ChangeAStat
  0840: ldarg.0          
  0841: ldstr            "LightningStrike_NumberOfHits"
  0846: ldc.i4.0         
  0847: ldsfld           JobSkillDict
  084c: ldstr            "LightningStrike"
  0851: callvirt         <tbl 0x1b>::get_Item
  0856: ldc.i4.1         
  0857: callvirt         GetNumberOfHitsForLevel
  085c: conv.r8          
  085d: ldc.i4.1         
  085e: callvirt         ChangeAStat
  0863: ldarg.0          
  0864: ldstr            "FireArea_Duration"
  0869: ldc.i4.0         
  086a: ldsfld           JobSkillDict
  086f: ldstr            "FireArea"
  0874: callvirt         <tbl 0x1b>::get_Item
  0879: ldc.i4.1         
  087a: callvirt         GetDurationForLevel
  087f: conv.r8          
  0880: ldc.i4.1         
  0881: callvirt         ChangeAStat
  0886: ldarg.0          
  0887: ldstr            "FireArea_RadiusOfEffect"
  088c: ldc.i4.0         
  088d: ldsfld           BaseFireArea_RadiusOfEffect
  0892: conv.r8          
  0893: ldc.i4.1         
  0894: callvirt         ChangeAStat
  0899: ldarg.0          
  089a: ldstr            "FireArea_NumberOfHits"
  089f: ldc.i4.0         
  08a0: ldsfld           JobSkillDict
  08a5: ldstr            "FireArea"
  08aa: callvirt         <tbl 0x1b>::get_Item
  08af: ldc.i4.1         
  08b0: callvirt         GetNumberOfHitsForLevel
  08b5: conv.r8          
  08b6: ldc.i4.1         
  08b7: callvirt         ChangeAStat
  08bc: ldarg.0          
  08bd: ldstr            "Blizzard_Duration"
  08c2: ldc.i4.0         
  08c3: ldsfld           JobSkillDict
  08c8: ldstr            "Blizzard"
  08cd: callvirt         <tbl 0x1b>::get_Item
  08d2: ldc.i4.1         
  08d3: callvirt         GetDurationForLevel
  08d8: conv.r8          
  08d9: ldc.i4.1         
  08da: callvirt         ChangeAStat
  08df: ldarg.0          
  08e0: ldstr            "Blizzard_RadiusOfEffect"
  08e5: ldc.i4.0         
  08e6: ldsfld           BaseBlizzard_RadiusOfEffect
  08eb: conv.r8          
  08ec: ldc.i4.1         
  08ed: callvirt         ChangeAStat
  08f2: ldarg.0          
  08f3: ldstr            "Blizzard_SlowPercent"
  08f8: ldc.i4.0         
  08f9: ldsfld           BaseBlizzard_SlowPercent
  08fe: conv.r8          
  08ff: ldc.i4.1         
  0900: callvirt         ChangeAStat
  0905: ldarg.0          
  0906: ldstr            "Blizzard_IceAmountMultiplier"
  090b: ldc.i4.0         
  090c: ldc.r8           1
  0915: ldc.i4.1         
  0916: callvirt         ChangeAStat
  091b: ldarg.0          
  091c: ldstr            "Blizzard_NumberOfHits"
  0921: ldc.i4.0         
  0922: ldsfld           JobSkillDict
  0927: ldstr            "Blizzard"
  092c: callvirt         <tbl 0x1b>::get_Item
  0931: ldc.i4.1         
  0932: callvirt         GetNumberOfHitsForLevel
  0937: conv.r8          
  0938: ldc.i4.1         
  0939: callvirt         ChangeAStat
  093e: ldarg.0          
  093f: ldstr            "Dragon_Time"
  0944: ldc.i4.0         
  0945: ldc.r8           3
  094e: ldc.i4.1         
  094f: callvirt         ChangeAStat
  0954: ldarg.0          
  0955: ldstr            "Dragon_RadiusOfEffect"
  095a: ldc.i4.0         
  095b: ldc.r8           11
  0964: ldc.i4.1         
  0965: callvirt         ChangeAStat
  096a: ldarg.0          
  096b: ldstr            "Knight_CallCount"
  0970: ldc.i4.0         
  0971: ldc.r8           2
  097a: ldc.i4.1         
  097b: callvirt         ChangeAStat
  0980: ldarg.0          
  0981: ldstr            "Knight_RadiusOfEffect"
  0986: ldc.i4.0         
  0987: ldc.r8           11
  0990: ldc.i4.1         
  0991: callvirt         ChangeAStat
  0996: ldarg.0          
  0997: ldstr            "Spear_ChainCount"
  099c: ldc.i4.0         
  099d: ldc.r8           3
  09a6: ldc.i4.1         
  09a7: callvirt         ChangeAStat
  09ac: ldarg.0          
  09ad: ldstr            "LC_ChainCount"
  09b2: ldc.i4.0         
  09b3: ldc.r8           3
  09bc: ldc.i4.1         
  09bd: callvirt         ChangeAStat
  09c2: ldarg.0          
  09c3: ldstr            "Vampire_CallCount"
  09c8: ldc.i4.0         
  09c9: ldc.r8           3
  09d2: ldc.i4.1         
  09d3: callvirt         ChangeAStat
  09d8: ldarg.0          
  09d9: ldstr            "Vampire_RadiusOfEffect"
  09de: ldc.i4.0         
  09df: ldc.r8           11
  09e8: ldc.i4.1         
  09e9: callvirt         ChangeAStat
  09ee: ldarg.0          
  09ef: ldstr            "BloodDrain_ChainCount"
  09f4: ldc.i4.0         
  09f5: ldc.r8           3
  09fe: ldc.i4.1         
  09ff: callvirt         ChangeAStat
  0a04: ldarg.0          
  0a05: ldstr            "BloodDrain_Time"
  0a0a: ldc.i4.0         
  0a0b: ldc.r8           3
  0a14: ldc.i4.1         
  0a15: callvirt         ChangeAStat
  0a1a: ldarg.0          
  0a1b: ldstr            "Skills_DamageMultiplier"
  0a20: ldc.i4.0         
  0a21: ldc.r8           1
  0a2a: ldc.i4.1         
  0a2b: callvirt         ChangeAStat
  0a30: ldarg.0          
  0a31: ldstr            "SkillsCooldownSpeed"
  0a36: ldc.i4.0         
  0a37: ldc.r8           1
  0a40: ldc.i4.1         
  0a41: callvirt         ChangeAStat
  0a46: ldarg.0          
  0a47: ldstr            "SkillsBuffDurationMultiplier"
  0a4c: ldc.i4.0         
  0a4d: ldc.r8           1
  0a56: ldc.i4.1         
  0a57: callvirt         ChangeAStat
  0a5c: ldarg.0          
  0a5d: call             SeedPetSkillBaseStats
  0a62: ldarg.0          
  0a63: ldstr            "PetHealthMultiplier"
  0a68: ldc.i4.0         
  0a69: ldc.r8           1
  0a72: ldc.i4.1         
  0a73: callvirt         ChangeAStat
  0a78: ldarg.0          
  0a79: ldstr            "PetDamageMultiplier"
  0a7e: ldc.i4.0         
  0a7f: ldc.r8           1
  0a88: ldc.i4.1         
  0a89: callvirt         ChangeAStat
  0a8e: ldarg.0          
  0a8f: ldstr            "ChanceToTameEnemiesOnDeath"
  0a94: ldc.i4.0         
  0a95: ldsfld           BaseChanceToTameEnemiesOnDeath
  0a9a: conv.r8          
  0a9b: ldc.i4.1         
  0a9c: callvirt         ChangeAStat
  0aa1: ldarg.0          
  0aa2: ldstr            "TameHealthMultiplier"
  0aa7: ldc.i4.0         
  0aa8: ldsfld           BaseTameHealthMultiplier
  0aad: conv.r8          
  0aae: ldc.i4.1         
  0aaf: callvirt         ChangeAStat
  0ab4: ldarg.0          
  0ab5: ldstr            "TameDamageMultiplier"
  0aba: ldc.i4.0         
  0abb: ldsfld           BaseTameDamageMultiplier
  0ac0: conv.r8          
  0ac1: ldc.i4.1         
  0ac2: callvirt         ChangeAStat
  0ac7: ldarg.0          
  0ac8: ldstr            "MaxTames"
  0acd: ldc.i4.0         
  0ace: ldsfld           BaseMaxTames
  0ad3: conv.r8          
  0ad4: ldc.i4.1         
  0ad5: callvirt         ChangeAStat
  0ada: ret              
;; ---- InitList (1 bytes) ----
  0000: ret              