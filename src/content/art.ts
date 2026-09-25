/**
 * Real art from the shipping build.
 *
 * Everything under `public/art/` was extracted from `Zad Archery_Data` with
 * UnityPy (`analysis/export_sprites.py`, `analysis/export_bg.py`).
 *
 * ## The landscape is eight stacked full-frame layers
 *
 * The build ships `BG1_0sky` .. `BG1_7item` as separate parallax layers *and*
 * `FullBG1`, the same landscape pre-composited. Every layer's Sprite has a
 * **1920x600 logical rect with pivot (0.5, 0.5) at 1 pixel per unit**, and every
 * layer's GameObject sits at transform `(0, 0, 0)`. So the layers are not positioned
 * at all: they are eight frames meant to be drawn at exactly the same place, each
 * one mostly transparent with a single painted band in it.
 *
 * The exported PNGs are alpha-trimmed, which is why they have different heights
 * (clouds 231, grass 170 ...). Their offsets back inside the 1920x600 frame come
 * from `Sprite.m_Rect` / `m_RD.textureRectOffset`; see
 * `analysis/dump_bg_geometry.py`, which prints the table below.
 *
 * Drawing the eight PNGs at those offsets reproduces `FullBG1` at **RMS 1.76 per
 * channel** (`analysis/verify_composite.py`), and the resulting landscape matches
 * the original screenshot's row profile to within a few units per channel. Earlier
 * revisions invented these offsets from opaque-content bounding boxes, which is what
 * made the bands line up with nothing.
 */

/**
 * The 1920x600 art frame, in world units. One art pixel is one world unit, because
 * every background Sprite has `m_PixelsToUnits = 1`.
 *
 * The frame is centred on its own origin: pivot 0.5 with a 600-unit height puts its top
 * edge at +300 and its bottom at -300 **in frame-local units**.
 */
export const FRAME = {
  width: 1920,
  height: 600,
  /** Frame-local Y of the frame's top edge. */
  topWorldY: 300,
  /** Frame-local Y of the frame's bottom edge. */
  bottomWorldY: -300,
  /**
   * Row of the walkable surface inside the frame, measured DOWN from the frame's top
   * edge. **500** = the top of the foreground `BG1_7item` strip.
   *
   * This is measured, not derived, because the two coordinate systems do not share an
   * origin. `ParallaxManager.MiddleOfGroundYPos` is `30f` in the decompiled source, but
   * that is only the C# field initializer - the shipping scene serializes its own value
   * and the background hierarchy sits at roughly y = +230 relative to the game root. So
   * the walkable surface is `MiddleOfGroundYPos` in game-world units and frame row 500
   * in the artwork's units; they are the same line.
   *
   * Verified against the shipping screenshot two independent ways:
   *  - the archer's silhouette bottoms out at row 502, the frame spanning rows 0..598;
   *  - an enemy's feet sit at row 529, i.e. 27 units lower, which is exactly
   *    `Random.Range(MinMaxYPos.x, MinMaxYPos.y)` with `MinMaxYPos` = (0, 30) and the
   *    archer standing on `MiddleOfGroundYPos` = 30.
   */
  groundRow: 500,
} as const;

/**
 * `ParallaxManager.MiddleOfGroundYPos`. `ProjectileMover` retires an arrow once it
 * drops to this line and `SkillsManager` places ground effects on it, so it is the
 * surface characters and arrows interact with - in the game's own world units, where
 * the walkable surface is y = 30 and this port's `WORLD.groundY` is 0.
 */
export const MIDDLE_OF_GROUND_Y_POS = 30;

/** Compatibility alias for the authored design size. */
export const DESIGN = {
  width: FRAME.width,
  height: FRAME.height,
} as const;

export interface LayerDef {
  key: string;
  file: string;
  /**
   * `ParallaxLayer.parallaxFactor`: 0 = pinned to the screen (infinitely far),
   * 1 = locked to the world. `MoveBackgroundLayers` advances each layer by
   * `deltaX * (1 - parallaxFactor)`, so 0 travels with the camera and 1 stands
   * still in world space.
   */
  parallaxFactor: number;
  /** Left edge of the exported PNG inside the 1920-wide frame, in art units. */
  cropLeft: number;
  /** Top edge of the exported PNG inside the 600-tall frame, in art units. */
  cropTop: number;
  /** Draws on top of the characters when true. */
  foreground: boolean;
  /** Optional opacity, for atmospheric layers. */
  alpha?: number;
}

/**
 * Grass/Day scene, matching the scene's own `Grass_Day` hierarchy.
 *
 * `cropTop` values are `frameTop(300) - cropTopWorldY`, from
 * `analysis/bg_sprite_geometry.json`:
 *
 *   layer   PNG size     crop world Y        -> cropLeft, cropTop
 *   sky     1920x600     -300.000 .. 300.000 ->   0,   0
 *   clouds  1920x231       59.076 .. 289.924 ->   0,  10
 *   hills3  1920x253      -60.924 .. 191.973 ->   0, 108
 *   hills2  1920x300     -136.707 .. 162.973 ->   0, 137
 *   hills1  1920x395     -300.000 ..  94.924 ->   0, 205
 *   trees   1920x419     -193.924 .. 224.957 ->   0,  75
 *   grass   1920x170     -300.000 ..-130.076 ->   0, 430
 *   item    1743x105     -300.000 ..-195.076 ->  56, 495
 *
 * The parallax factors are the one thing still inferred: the shipped build has no
 * `ParallaxManager` type tree, so its serialized factor array does not decode. These
 * are ordered strictly by depth, which is what the layer names encode.
 */
export const BIOME1: LayerDef[] = [
  { key: 'sky', file: 'BG1_0sky', parallaxFactor: 0, cropLeft: 0, cropTop: 0, foreground: false },
  { key: 'clouds', file: 'BG1_1clouds', parallaxFactor: 0.08, cropLeft: 0, cropTop: 10, foreground: false },
  { key: 'hills3', file: 'BG1_2hills3', parallaxFactor: 0.18, cropLeft: 0, cropTop: 108, foreground: false },
  { key: 'hills2', file: 'BG1_3hills2', parallaxFactor: 0.3, cropLeft: 0, cropTop: 137, foreground: false },
  { key: 'hills1', file: 'BG1_4hills1', parallaxFactor: 0.45, cropLeft: 0, cropTop: 205, foreground: false },
  { key: 'trees', file: 'BG1_5trees', parallaxFactor: 0.6, cropLeft: 0, cropTop: 75, foreground: false },
  { key: 'grass', file: 'BG1_6grass', parallaxFactor: 0.8, cropLeft: 0, cropTop: 430, foreground: false },
  { key: 'item', file: 'BG1_7item', parallaxFactor: 1, cropLeft: 56, cropTop: 495, foreground: true },
];

/** Same layout, different palette. Only meaningful once a `BG2` set is exported. */
export const BIOME2: LayerDef[] = BIOME1;

/**
 * The walkable surface's row inside the art frame, measured DOWN from the frame's top
 * edge, in art units: frame row **500**.
 */
export const GROUND_LINE_ART_Y = FRAME.groundRow;

/**
 * The walkable surface as a fraction of the frame's height from the top: 500/600 =
 * **0.8333**. Derived, so it cannot drift away from the Sprite geometry again.
 */
export const GROUND_LINE_FRACTION = GROUND_LINE_ART_Y / FRAME.height;

export interface SpriteDef {
  file: string;
  /** On-screen height in world units; width is derived from the aspect. */
  height: number;
}

/**
 * Character art, keyed by the enemy type the simulation uses.
 *
 * The build ships one painting per minion family rather than frame animations, so
 * minions idle with a procedural bob/squash in the renderer.
 *
 * ## Heights are measured off the shipping screenshot, not chosen
 *
 * The original's archer stands on the ground line (art frame row 500) with the top of
 * his head at row 404, so he is **96-99 world units** tall - about **9.2% of the window
 * height**. `analysis/orig_archer_zoom.png` is a 4x zoom of that figure confirming it is
 * a complete standing archer with ground below his feet, not a cropped or partial one.
 *
 * An earlier revision drew the player at 205 units, i.e. 19.0% of the window height and
 * more than twice the original's size. Every entry below is that revision's value
 * multiplied by **0.483** to land the player on the measured 99 units while preserving
 * the relative sizes the minion families already had.
 *
 * These are SPRITE heights, and the paintings nearly fill their canvases (the trimmed
 * `Archer_1` content is 175.9 of 182 rows), so sprite height and figure height agree to
 * within a few percent.
 */
export const CHARACTERS: Record<string, SpriteDef> = {
  player: { file: 'Archer_1', height: 99 },
  Claw: { file: 'Guardian_Claw_0', height: 53 },
  Warrior: { file: 'Guardian_Warrior_0', height: 65 },
  Archer: { file: 'Guardian_Archer_0', height: 53 },
  Mage: { file: 'Guardian_Mage_0', height: 56 },
  Bat: { file: 'bat_swarm_0', height: 41 },
  /**
   * The five Guardians. Each ships its own `Guardian_*_0` sheet, and they are drawn taller
   * than their family counterparts — the original scales them up as boss variants.
   */
  GuardianClaw: { file: 'Guardian_Claw_0', height: 85 },
  GuardianWarrior: { file: 'Guardian_Warrior_0', height: 92 },
  GuardianArcher: { file: 'Guardian_Archer_0', height: 85 },
  GuardianMage: { file: 'Guardian_Mage_0', height: 88 },
  GuardianBat: { file: 'Guardian_Bat_0', height: 74 },
  /** The King, whose full fight (laser / missiles / telegraphs) is still to come. */
  King: { file: 'king_boss', height: 145 },
  /**
   * The run portal. `Portal` is a 512x512 Texture2D in `resources.assets`, exported by
   * `analysis/export_ui_bars.py`'s sibling scan. An earlier revision used `orb`, a
   * 124x128 pickup orb, which is a different object entirely.
   *
   * The original's portal is a Spine skeleton (`EnemySelfer.SummonAnimator` plays
   * `Summon_fx`), so this is its shipped still.
   */
  RunPortal: { file: 'Portal_tex', height: 200 },
};

/** The king, used by the (not yet ported) final fight. */
export const KING: SpriteDef = { file: 'king_boss', height: 145 };

/**
 * The three summoned pets — `JobSkillInfo` entries with `isPet`, owned by Job 1 (猎人).
 *
 * `CHARACTERS` has no pet entries because pets are not enemies, but they are drawn in the
 * same world band. Their art is at the same pixel scale as `Archer_1`, so the heights come
 * from the same measured factor: the archer is a 176px-tall texture drawn 99 units tall,
 * i.e. 0.5625 units per pixel.
 */
export const PETS: Record<string, SpriteDef> = {
  Wolf: { file: 'Wolf', height: 70 },     // 124px * 0.5625
  Bear: { file: 'Bear', height: 61 },     // 108px * 0.5625
  Falcon: { file: 'Falcon', height: 62 }, // 110px * 0.5625, drawn hovering
};

/**
 * The archer's five paintings are **outfit skins, not a walk cycle**.
 *
 * `CharacterManager.ChangeSkin` picks the highest unlocked job id and
 * `CharacterAnimator.ChangeSkin` maps it to a Spine skin:
 *
 * ```csharp
 * int skinID = playerData.instance.IsUnlockedJobs.Where(p => p.Value)
 *                                            .Select(p => p.Key).DefaultIfEmpty(0).Max();
 * AccCA.ChangeSkin(skinID);                       // -> skeleton.SetSkin("Skin" + (id + 2))
 * ```
 *
 * So the outfit changes only when a job is unlocked, and the animation itself comes from
 * a Spine skeleton. `Archer_1..5` are the five outfits: their mean colours are
 * (91,77,60) leather, (110,94,81) light leather, (50,63,64) teal, (99,90,79) tan and
 * (60,48,84) purple, i.e. five different costumes.
 *
 * An earlier revision cycled `Archer_2, Archer_1, Archer_3, Archer_1` at 0.11s as if
 * they were walk frames, which flashed the archer's clothes between leather, teal and
 * purple several times a second.
 */
export const PLAYER_SKINS: string[] = [
  'Archer_1', 'Archer_2', 'Archer_3', 'Archer_4', 'Archer_5',
];

/**
 * The skin the port wears. `DefaultIfEmpty(0).Max()` is 0 with no jobs unlocked, i.e.
 * skinID 0, which is `Archer_1`. The port has no jobs system, so this is constant.
 */
export const PLAYER_SKIN = PLAYER_SKINS[0];

/**
 * The health-bar pieces, exported from the shipping build by
 * `analysis/export_ui_bars.py`.
 *
 * `BarSelfer` drives a Unity UI `Image.fillAmount`, and the fill texture is the
 * giveaway: `Slider_Play_04_Fill_White` is **2x35** - a one-pixel-wide white strip meant
 * to be stretched across the bar and tinted. `Slider_Play_04_Border` is its frame: a
 * 41x44 rounded white ring, 4px thick, transparent in the middle.
 *
 * Both sprites are pure white, so the colours come from the tint. The tints are solved
 * from the one bar actually visible in the shipping screenshot (the run-progress bar,
 * built from the same `BarSelfer`): its fill renders `(183,87,87)` where the fill sprite
 * is 255 and `(164,78,78)` where the sprite is 229. `183 * 229/255 = 164.3` and
 * `87 * 229/255 = 78.1`, so the tint is exactly **#B75757** and the sprite's own
 * 229 -> 255 -> 229 vertical gradient produces the shading. The frame renders
 * `(12,6,5)`, i.e. tint **#0C0605**.
 */
export const BAR = {
  frame: 'Slider_Play_04_Border',
  fill: 'Slider_Play_04_Fill_White_1',
  /**
   * Corner radius of the frame in sprite pixels, used as the 9-slice border.
   *
   * NOT the sprite's authored `m_Border` (21, 21, 20, 21): those are safe-area insets
   * that cover the whole 41x44 canvas and leave nothing to stretch, so slicing with them
   * collapses. The alpha map shows the corner arc spans about 10px, which is the
   * quantity a stretchable frame actually needs.
   */
  frameBorder: 10,
  frameTint: 0x0c0605,
  fillTint: 0xb75757,
} as const;

/** UI sprites drawn at explicit sizes rather than scaled by a world height. */
export const UI_SPRITES: string[] = [BAR.frame, BAR.fill];

/**
 * Ground-drop art per currency.
 *
 * `LootDropManager` reads the world-drop sprite from a per-`LootType`
 * `LootAnimationEntry.worldDropPrefab`, and those prefabs do not decode. The build was
 * scanned end to end for a coin - 517 sprites, `analysis/export_all_sprites.py` - and it
 * contains no coloured coin texture: the only coin-shaped art (`Icon_Loot_MonsterCoins`,
 * `CoinsFromChests`) is white and belongs to the talent-tree icons.
 *
 * So gold keeps the plain disc, and the five family drops use their REAL currency art,
 * the `*CurrencyTreeIcon` sprites. That is what makes a Warrior's drop visibly different
 * from a Claw's instead of everything looking like gold.
 */
export const DROP_ART: Record<string, { file: string; height: number; tint: number }> = {
  /*
   * These are the game's own currency icons, resolved from the `<sprite name=...>` table in
   * `sharedassets0.assets` - see `analysis/resolve_text_icons.py`. They live in
   * `public/art/cur/` and are already COLOURED, so the tint is a no-op.
   *
   * What was here before was wrong in a way that could not be fixed by relabelling. The five
   * `icon_cur_*` files were white silhouette MASKS - a sphere, a capsule, a hexagon, a
   * pentagon, a diamond - and `loot_coin` was a uniform white claw-and-coins mask whose every
   * pixel is #fefefe at alpha 162. Tinting those with 0xffffff is why every monster drop came
   * out as a white blob.
   *
   * PortalCurrency was also missing entirely, so the renderer's `?? DROP_ART.Gold` fallback
   * drew a coin for it.
   */
  Gold: { file: 'cur/Gold', height: 34, tint: 0xffffff },
  ClawCurrency: { file: 'cur/ClawCurrency', height: 34, tint: 0xffffff },
  ArcherCurrency: { file: 'cur/ArcherCurrency', height: 34, tint: 0xffffff },
  WarriorCurrency: { file: 'cur/WarriorCurrency', height: 34, tint: 0xffffff },
  MageCurrency: { file: 'cur/MageCurrency', height: 34, tint: 0xffffff },
  BatCurrency: { file: 'cur/BatCurrency', height: 34, tint: 0xffffff },
  PortalCurrency: { file: 'cur/PortalCurrency', height: 34, tint: 0xffffff },
};

/** FX sprites. */
export const FX: Record<string, SpriteDef> = {
  /**
   * The falling arrow uses `Arrow1` (22x146, a clean vertical arrow) rather than
   * `T_Arrow`: that texture is a padded VFX canvas (817x244 holding a 813x240
   * glow), so sizing it by height made the projectile nearly invisible.
   */
  arrow: { file: 'Arrow1', height: 62 },
  shot: { file: 'Circle', height: 34 },
  ember: { file: 'FX_TX_Ember_AB', height: 120 },
  star: { file: 'FX_TX_Star_AA', height: 140 },
  ring: { file: 'FX_Ring_AD', height: 340 },
  shockwave: { file: 'shockwave', height: 150 },
  coin: { file: 'orb', height: 30 },
  trail: { file: 'Trail1', height: 70 },
};

/** Every unique file the client needs to fetch, for preloading. */
export function allArtFiles(): string[] {
  const files = new Set<string>();
  for (const l of [...BIOME1, ...BIOME2]) files.add(l.file);
  for (const c of Object.values(CHARACTERS)) files.add(c.file);
  for (const p of Object.values(PETS)) files.add(p.file);
  for (const f of Object.values(FX)) files.add(f.file);
  files.add(KING.file);
  for (const f of PLAYER_SKINS) files.add(f);
  for (const f of UI_SPRITES) files.add(f);
  for (const d of Object.values(DROP_ART)) files.add(d.file);
  return [...files];
}

export const ART_BASE = 'art/';