/**
 * Renderer using the real shipped art.
 *
 * ## Framing, ported from the original camera
 *
 * The original's cameras serialize `orthographicSize = 540`, so **1080 world units
 * are visible vertically at every aspect ratio** - the visible width is whatever the
 * device aspect makes it, exactly like a Unity orthographic camera. Measuring the
 * shipping screenshot confirms it: display scale 0.9975 px per world unit, whole
 * window = 1078.7 units, i.e. `orthographicSize` 539.3.
 *
 * The landscape is a 1920x600 art frame whose top edge sits at the top of the screen,
 * so it covers only the upper 600/1080 = 55.6% of the viewport. The original fills the
 * band below with its talent-tree panel; this port fills it with the HUD. Scaling the
 * art to fill the viewport instead is what made the port read as "still full-screen"
 * and inflated every painted band by ~1.8x.
 *
 * ## Parallax
 *
 * Eight full-frame layers drawn at the SAME origin - see `render/parallax.ts` for why
 * per-layer vertical offsets were wrong. Each layer's factor comes from its depth
 * (`BG1_0sky` furthest -> `BG1_7item` nearest); `_7item` draws *in front of* the
 * characters.
 *
 * ## Animation
 *
 * Characters use baked frame sets. The player has five real paintings
 * (`Archer_1..5`) which give a proper walk cycle. Minions ship one painting per
 * family, so they get a procedural bob and squash instead of frames - the same
 * treatment a baked Spine sheet would receive, just driven by math.
 */

import { Application, Container, Graphics, Sprite, Texture } from 'pixi.js';
import { CAMERA } from '../content/data.js';
import { ParallaxBackground } from './parallax.js';
import {
  ART_BASE,
  BAR,
  BIOME1,
  CHARACTERS,
  DROP_ART,
  FRAME,
  FX,
  GROUND_LINE_ART_Y,
  PETS,
  PLAYER_SKIN,
  PLAYER_SKINS,
  allArtFiles,
} from '../content/art.js';
import type { Game } from '../game/game.js';

/** World units visible horizontally at the design aspect (1080 * 16/9). */
export const VIEW_WIDTH = FRAME.width;

/** Dark earth brown of the original's UI panel, sampled below its art band. */
const PANEL_COLOR = 0x29180f;
/** Warm top edge of that panel, rows 603..609 of the shipping screenshot. */
const PANEL_EDGE_COLOR = 0x6c4439;

/** `BarSelfer.animationDuration`: the fill tween length on damage. */
const FILL_SECONDS = 0.3;
/** `EnemySelfer`: `DOPunchScale(..., 0.15f, 6, 0.5f)` on every hit. */
const PUNCH_SECONDS = 0.15;

interface LoadedSprite {
  texture: Texture;
  /** Units per source pixel so the sprite ends up `height` world units tall. */
  scale: number;
  aspect: number;
}

/** Decodes an image with a plain <img>, avoiding any loader pipeline. */
export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.decoding = 'sync';
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`failed to load image: ${url}`));
    img.src = url;
  });
}

export class Renderer {
  readonly app = new Application();

  private readonly bgBack = new Container();
  private readonly bgFront = new Container();
  /** True once the layer stack exists; it is built after the first resize. */
  private layersBuilt = false;
  private readonly world = new Container();
  private readonly entityLayer = new Container();
  private readonly fxLayer = new Container();

  /** Ported ParallaxManager: owns layer tiling and the scroll accumulator. */
  private readonly parallax = new ParallaxBackground(this.bgBack, this.bgFront, 1);
  private readonly sprites = new Map<string, LoadedSprite>();
  private readonly charViews = new Map<number, Sprite>();
  private readonly scratch: Sprite[] = [];
  /** Pooled ring graphics for enemy health indicators. */
  /**
   * Pooled enemy health bars (frame + fill). The original builds one per enemy prefab;
   * pooling by draw order is the same thing without churning containers as packs spawn.
   */
  private readonly bars: Array<{
    root: Container;
    /** Rounded outline, drawn with `Graphics` from the frame sprite's measured shape. */
    frame: Graphics;
    track: Sprite;
    fill: Sprite;
  }> = [];
  /**
   * Per-enemy bar animation state, keyed by the enemy object so it dies with the enemy.
   *
   * Holds the eased fill (`ManageBarAnimated`), the hit punch (`DOPunchScale`) and the
   * reveal flag (`EnemyCanvas` starts inactive and `TakeDamage` switches it on).
   */
  private readonly barState = new WeakMap<object, {
    shown: number;
    from: number;
    to: number;
    t: number;
    punch: number;
    lastHp: number;
    revealed: boolean;
  }>();
  /** Health bars drawn on the last frame, surfaced by the debug overlay. */
  barsDrawn = 0;
  /** Bow arrows drawn on the last frame. */
  projectilesDrawn = 0;
  private scratchUsed = 0;

  private cameraX = 0;
  private scale = 1;
  /**
   * Background scale. Identical to the world scale, because one art pixel is one world
   * unit (every background Sprite has `m_PixelsToUnits = 1`).
   *
   * Sizing the art to the viewport height instead (`viewH / 600`) is what made the
   * composition wrong: the camera shows 1080 units, so the frame must stay 600 units
   * tall on screen and leave the lower band to the UI.
   */
  private bgScale = 1;
  /** Fills the band below the art frame, standing in for the original's UI panel. */
  private readonly panel = new Graphics();
  private viewW = 1280;
  private viewH = 720;
  private elapsed = 0;
  private ready = false;

  async init(canvas: HTMLCanvasElement, cssW: number, cssH: number): Promise<void> {
    await this.app.init({
      canvas,
      background: PANEL_COLOR,
      antialias: true,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      width: Math.max(1, cssW),
      height: Math.max(1, cssH),
    });

    this.app.stage.addChild(this.panel, this.bgBack, this.world, this.bgFront, this.fxLayer);
    this.world.addChild(this.entityLayer);

    await this.loadArt();

    this.resize(cssW, cssH);
    this.buildLayers();
    this.ready = true;
  }

  // -------------------------------------------------------------------------
  // Loading
  // -------------------------------------------------------------------------

  private async loadArt(): Promise<void> {
    // ONE source of truth. This used to enumerate the art categories itself, and when
    // `DROP_ART` was added to `allArtFiles()` but not here, the five family-currency drop
    // sprites were never loaded - `drawCoins` then silently skipped them and every drop
    // on the ground rendered as a gold coin.
    const names = new Set<string>(allArtFiles());

    // Deliberately NOT Pixi's `Assets` pipeline. `Assets.load` on a plain PNG
    // never settles in some environments (headless Chromium hangs on it forever,
    // which also blocked automated screenshots). Decoding with a plain <img> and
    // wrapping the element is deterministic and gives us the natural size up
    // front, so nothing downstream has to wait on a lazy GPU upload.
    const entries = await Promise.all(
      [...names].map(async (name) => [name, await loadImage(`${ART_BASE}${name}.png`)] as const),
    );

    for (const [name, img] of entries) {
      const texture = Texture.from(img);
      // Pixi v8 exposes filtering on the source's style object; `source.scaleMode`
      // is a getter-only alias and assigning to it throws in strict mode.
      texture.source.style.scaleMode = 'linear';
      this.sprites.set(name, {
        texture,
        scale: 1,
        aspect: img.naturalWidth / img.naturalHeight,
      });
    }
  }

  /**
   * Builds the layer stack by handing every `BIOME1` layer to the ported
   * `ParallaxBackground`, which creates the three tiled copies per layer that the
   * original's `CreateInfiniteClones` makes.
   *
   * Runs after the first `resize`, because the layer scale depends on the viewport.
   */
  private buildLayers(): void {
    if (this.layersBuilt) return;
    for (const def of BIOME1) {
      const s = this.sprites.get(def.file);
      if (!s) continue;
      this.parallax.addLayer(def, s.texture);
    }
    this.parallax.setScale(this.bgScale);
    this.layersBuilt = true;
  }

  // -------------------------------------------------------------------------
  // Layout
  // -------------------------------------------------------------------------

  resize(cssW: number, cssH: number): void {
    this.viewW = Math.max(1, cssW);
    this.viewH = Math.max(1, cssH);
    this.app.renderer.resize(this.viewW, this.viewH);
    // The camera's `orthographicSize` (540) fixes the visible HEIGHT at 1080 world
    // units. The visible width is then whatever the aspect ratio makes it, which is
    // how a Unity orthographic camera behaves and how the original is framed.
    this.scale = this.viewH / CAMERA.visibleWorldHeight;
    this.bgScale = this.scale;
    // The layer copies bake the scale into themselves, so an existing stack has to be
    // resized whenever the viewport changes.
    this.parallax.setScale(this.bgScale);
    this.drawPanel();
  }

  /**
   * Paints the band below the art frame.
   *
   * The 600-unit frame covers only the top 55.6% of a 1080-unit-tall view; the
   * original covers the rest with its talent-tree panel. Without this the lower band
   * is bare clear colour and reads as a rendering bug.
   */
  private drawPanel(): void {
    const top = FRAME.height * this.bgScale;
    this.panel.clear();
    if (top >= this.viewH) return;
    // Warm lip, then the dark body - the row sequence measured off the original.
    this.panel.rect(0, top, this.viewW, 7).fill(PANEL_EDGE_COLOR);
    this.panel.rect(0, top + 7, this.viewW, this.viewH - top - 7).fill(PANEL_COLOR);
  }

  /**
   * World -> CSS pixels, for the DOM damage-number layer.
   *
   * World Y grows UP (ground at 0, art frame top at +270 in this port's convention),
   * screen Y grows DOWN. The art frame's top edge is the top of the screen and the
   * walkable surface sits `GROUND_LINE_ART_Y` (270) units below it, so the feet land on
   * `viewH * 0.25` - which is `270 / 1080`, the original's own ratio.
   */
  toScreen(worldX: number, worldY: number): { x: number; y: number } {
    return {
      x: this.viewW * 0.5 + (worldX - this.cameraX) * this.scale,
      y: this.viewH * CAMERA.playerScreenFraction - worldY * this.scale,
    };
  }

  screenToWorld(screenX: number, screenY: number): { x: number; y: number } {
    return {
      x: (screenX - this.viewW * 0.5) / this.scale + this.cameraX,
      y: (this.viewH * CAMERA.playerScreenFraction - screenY) / this.scale,
    };
  }

  // -------------------------------------------------------------------------
  // Camera
  // -------------------------------------------------------------------------

  /**
   * Keeps the character at `CAMERA.characterScreenX` across the viewport, matching
   * `CharacterMover`: the camera leads him so he walks in the left part of the
   * frame with the ground ahead filling the rest.
   *
   * The offset is a SCREEN fraction rather than a world distance on purpose. With a
   * fixed world lead the character drifts right as the viewport widens, which is
   * exactly the complaint that the framing was not centred.
   */
  private updateCamera(game: Game, dt: number): void {
    // World units visible horizontally.
    const visibleW = this.viewW / this.scale;
    // Character at `characterScreenX` => camera centre this far ahead of him.
    const lead = visibleW * (0.5 - CAMERA.characterScreenX);
    let desired = game.px + lead;

    // Hard rule: never let him leave the frame.
    const margin = visibleW * 0.08;
    const minCamera = game.px - visibleW * 0.5 + margin;
    const maxCamera = game.px + visibleW * 0.5 - margin;

    // Soft rule: keep the portal off the right edge until the packs are down.
    if (!game.isPortalRevealed()) {
      const hidingLimit = game.portalX - visibleW * (1 - CAMERA.portalPeekFraction);
      desired = Math.min(desired, hidingLimit);
    }

    const target = Math.min(maxCamera, Math.max(minCamera, desired));
    this.cameraX += (target - this.cameraX) * (1 - Math.exp(-dt * 7));
  }

  /** Applies camera + parallax to every container. */
  private applyTransform(): void {
    // Containers are placed so their local coordinates are world coordinates with
    // Y NEGATED: world Y grows up, Pixi's local Y grows down. Callers therefore
    // write `sprite.y = -worldY`. A negative container scale would mirror every
    // sprite, so the flip is done per-sprite at draw time.
    //
    // All background layers live in ONE container (`bgBack` or `bgFront`) and get
    // their parallax as a LOCAL x offset. Giving each layer its own container and
    // setting the container scale on it clobbered the per-sprite scale that maps
    // the art into world units, which shrank the background to half the viewport.
    const characterGroundRow = this.viewH * CAMERA.playerScreenFraction;
    // Screen x of world x=0 for a world-locked (parallax 1) layer.
    const worldOriginX = this.viewW * 0.5 - this.cameraX * this.scale;

    const place = (c: Container, shiftX: number, originRow: number): void => {
      c.scale.set(this.scale);
      c.x = shiftX;
      c.y = originRow;
    };

    place(this.world, worldOriginX, characterGroundRow);
    place(this.fxLayer, worldOriginX, characterGroundRow);

    // Background: the ported `ParallaxManager` owns tiling, scrolling AND the final
    // world->screen mapping, so its host containers stay at the identity transform and
    // the layers carry absolute screen coordinates. The art frame's top edge is the top
    // of the screen (row 0), which is what the original does and what puts the painted
    // ground line on the characters' feet.
    this.bgBack.x = 0;
    this.bgBack.y = 0;
    this.bgFront.x = 0;
    this.bgFront.y = 0;
    this.parallax.update(this.cameraX, this.viewW);
  }

  // -------------------------------------------------------------------------
  // Sprites
  // -------------------------------------------------------------------------

  private viewFor(id: number): Sprite {
    let s = this.charViews.get(id);
    if (!s) {
      s = new Sprite();
      // Feet-anchored: the position is the character's ground contact point.
      s.anchor.set(0.5, 1);
      this.entityLayer.addChild(s);
      this.charViews.set(id, s);
    }
    return s;
  }

  private scratchSprite(texture: Texture): Sprite {
    let s = this.scratch[this.scratchUsed];
    if (!s) {
      s = new Sprite();
      s.anchor.set(0.5, 0.5);
      this.fxLayer.addChild(s);
      this.scratch[this.scratchUsed] = s;
    }
    s.texture = texture;
    s.visible = true;
    s.tint = 0xffffff;
    s.alpha = 1;
    s.rotation = 0;
    this.scratchUsed++;
    return s;
  }

  /**
   * Background layer bands, for the framing verification harness.
   *
   * Reports one entry per logical layer (not per tile) with its screen band and the
   * number of tiled copies, which is what a coverage check needs.
   */
  get layerList(): ReadonlyArray<{
    file: string;
    top: number;
    bottom: number;
    span: number;
    copies: number;
    left: number;
    right: number;
  }> {
    return this.parallax.bands();
  }

  /** Drawable width in CSS pixels. */
  get viewWidth(): number {
    return this.viewW;
  }

  /** Drawable height in CSS pixels. */
  get viewHeight(): number {
    return this.viewH;
  }

  /**
   * Human-readable geometry dump, consumed by the `?measure=1` overlay.
   * Lives here rather than in `main.ts` so the diagnostic can read private state
   * without widening the public surface of the renderer.
   */
  measure(game: Game): string {
    const sc = this.scale;
    const charGround = this.viewH * CAMERA.playerScreenFraction;
    const frameBottom = FRAME.height * this.bgScale;
    const rows: string[] = [
      `view ${this.viewW}x${this.viewH}  scale ${sc.toFixed(4)} px/unit`,
      `visible ${(this.viewW / sc).toFixed(0)} x ${(this.viewH / sc).toFixed(0)} world units` +
      `  (camera orthographicSize ${(this.viewH / sc / 2).toFixed(0)})`,
      `art frame rows 0..${frameBottom.toFixed(0)} = ${(frameBottom / this.viewH * 100).toFixed(1)}%` +
      ` of height, ground line row ${(GROUND_LINE_ART_Y * this.bgScale).toFixed(0)}`,
      `character ground row ${charGround.toFixed(0)} (${CAMERA.playerScreenFraction * 100}%)`,
      `cameraX ${this.cameraX.toFixed(1)}`,
      '',
      'layer bands (one entry per layer; copies = tiled instances):',
    ];
    for (const b of this.parallax.bands()) {
      rows.push(
        `${b.file.padEnd(15)}${b.top.toFixed(0).padStart(6)}..${b.bottom.toFixed(0).padStart(5)}` +
        `  span=${String(b.span).padStart(5)} copies=${b.copies}`,
      );
    }
    const p = this.toScreen(game.px, game.py);
    rows.push('', `player world ${game.px.toFixed(0)},${game.py.toFixed(0)} -> screen ${p.x.toFixed(0)},${p.y.toFixed(0)}`);
    return rows.join('\n');
  }

  render(game: Game, dt: number): void {
    if (!this.ready) return;
    this.elapsed += dt;
    this.updateCamera(game, dt);
    this.applyTransform();
    this.scratchUsed = 0;

    this.drawPlayer(game);
    this.drawEnemies(game);
    this.drawPets(game);
    this.drawArrows(game);
    // Rings sit under the in-flight arrows so a hit is never hidden by them.
    this.drawHealthBars(game, dt);
    this.drawProjectiles(game);
    this.drawShots(game);
    this.drawCoins(game);
    this.drawPuffs(game);

    for (let i = this.scratchUsed; i < this.scratch.length; i++) this.scratch[i].visible = false;

    this.app.render();
  }

  private playerSkinIndex = 0;

  /**
   * `CharacterManager.ChangeSkin`: the outfit is whichever job index is highest among the
   * unlocked ones, so buying a later job visibly upgrades the archer. Without this the
   * skin was a module constant and buying a job changed nothing on screen.
   */
  setPlayerSkin(index: number): void {
    this.playerSkinIndex = Math.max(0, Math.min(PLAYER_SKINS.length - 1, Math.floor(index)));
  }

  private drawPlayer(game: Game): void {
    const s = this.viewFor(-1);
    s.visible = true;

    // ONE skin, never a frame cycle: `Archer_1..5` are outfit skins chosen by unlocked
    // jobs (see `PLAYER_SKINS`), not walk frames. Cycling them flashed the archer's
    // clothes between leather, teal and purple. The original animates a Spine skeleton;
    // this port stands in with the same procedural bob/squash the minions get.
    //
    // `CharacterManager.ChangeSkin` picks the HIGHEST unlocked job index, which the caller
    // pushes in through `setPlayerSkin`.
    const skin = PLAYER_SKINS[this.playerSkinIndex] ?? PLAYER_SKIN;
    const loaded = this.sprites.get(skin) ?? this.sprites.get(PLAYER_SKIN);
    const def = CHARACTERS.player;
    if (loaded) {
      s.texture = loaded.texture;
      const base = def.height / loaded.texture.height;
      const phase = this.elapsed * (game.isMoving() ? 6.5 : 2.4);
      const bob = Math.abs(Math.sin(phase)) * def.height * (game.isMoving() ? 0.03 : 0.012);
      const squash = 1 + Math.sin(phase * 2) * 0.02;
      s.scale.set(base, base * squash);
      s.x = game.px;
      s.y = -(game.py + bob);
    }
  }

  /**
   * Summoned pets and tamed monsters.
   *
   * Pets sit in front of the archer, so they take a slot ABOVE the enemies' range: the
   * original draws them as world objects with their own sorting, but the port's pooled
   * sprite views are ordered by slot index, and putting them behind the pack would hide
   * the thing the player just paid 200 claw for.
   */
  private drawPets(game: Game): void {
    let slot = 40000;

    for (const pet of game.getPetList()) {
      if (!pet.alive) continue;
      const def = PETS[pet.id];
      const loaded = def ? this.sprites.get(def.file) : undefined;
      if (!def || !loaded) continue;
      const s = this.viewFor(slot++);
      s.visible = true;
      s.texture = loaded.texture;
      s.alpha = 1;
      s.tint = 0xffffff;
      const base = def.height / loaded.texture.height;
      // Falcon hovers; the ground pets bob as they walk.
      const flying = pet.id === 'Falcon';
      const phase = this.elapsed * (pet.engaged ? 7 : 4) + pet.x * 0.02;
      const bob = Math.abs(Math.sin(phase)) * def.height * 0.05;
      const squash = 1 + Math.sin(phase * 2) * 0.03;
      s.scale.set(base * (pet.facing < 0 ? -1 : 1), base * squash);
      s.x = pet.x;
      s.y = -(pet.y + bob + (flying ? 120 : 0));
    }

    for (const t of game.getTamedList()) {
      if (!t.alive) continue;
      const def = CHARACTERS[t.type];
      const loaded = def ? this.sprites.get(def.file) : undefined;
      if (!def || !loaded) continue;
      const s = this.viewFor(slot++);
      s.visible = true;
      s.texture = loaded.texture;
      // A tame is an ally, so it is tinted to read as friendly rather than as a monster
      // that failed to die.
      s.tint = 0x9fe6a0;
      const base = def.height / loaded.texture.height;
      const phase = this.elapsed * 5 + t.x * 0.02;
      s.scale.set(base, base * (1 + Math.sin(phase * 2) * 0.03));
      s.x = t.x;
      s.y = -(t.y + Math.abs(Math.sin(phase)) * def.height * 0.04);
    }
  }

  private drawEnemies(game: Game): void {
    let slot = 0;
    let portalDrawn = false;

    for (const e of game.getEnemyList()) {
      if (!e.alive) continue;

      if (e.isPortal) {
        const s = this.viewFor(100000);
        s.visible = true;
        portalDrawn = true;
        const loaded = this.sprites.get(CHARACTERS.RunPortal.file);
        if (loaded) {
          s.texture = loaded.texture;
          const base = CHARACTERS.RunPortal.height / loaded.texture.height;
          // Slow breathing pulse.
          const pulse = 1 + Math.sin(this.elapsed * 2) * 0.06;
          s.scale.set(base * pulse);
          s.alpha = 0.95;
          s.x = e.x;
          s.y = -e.y;
        }
        continue;
      }

      const def = CHARACTERS[e.type];
      const loaded = def ? this.sprites.get(def.file) : undefined;
      if (!def || !loaded) continue;

      const s = this.viewFor(slot++);
      s.visible = true;
      s.texture = loaded.texture;
      s.alpha = 1;
      // `GoldenEnemyFx`: a golden enemy is the same prefab under a gold material, and a
      // Gilded Champion shines brighter again. A tint stands in for the shader swap, which
      // is what the player actually reads as "this one pays five times over".
      s.tint = e.champion ? 0xffe9a3 : e.golden ? 0xffcf5a : 0xffffff;

      const base = def.height / loaded.texture.height;
      // Procedural bob/squash stands in for baked frames on minions.
      const phase = this.elapsed * (e.speed / 26) + e.x * 0.02;
      const bob = Math.abs(Math.sin(phase)) * def.height * 0.05;
      const squash = 1 + Math.sin(phase * 2) * 0.035;
      s.scale.set(base, base * squash);
      s.x = e.x;
      s.y = -(e.y + bob);
      s.tint = e.hitFlash > 0 ? 0xffb0a0 : 0xffffff;
    }

    // Park unused character slots.
    for (const [id, s] of this.charViews) {
      if (id === -1 || id === 100000) continue;
      if (id >= slot) s.visible = false;
    }
    if (!portalDrawn) {
      const p = this.charViews.get(100000);
      if (p) p.visible = false;
    }
  }

  private drawArrows(game: Game): void {
    const fx = FX.arrow;
    const loaded = this.sprites.get(fx.file);
    if (!loaded) return;
    for (const a of game.getArrowList()) {
      const t = Math.min(1, a.t);
      const eased = t * t;
      const x = a.fromX + (a.toX - a.fromX) * t;
      const y = a.fromY + (a.toY - a.fromY) * eased;
      const s = this.scratchSprite(loaded.texture);
      const sc = fx.height / loaded.texture.height;
      s.scale.set(sc);
      s.x = x;
      s.y = -y;
      // Arrow1 points straight up in its own space, so a half turn makes it
      // point down at the impact point.
      s.rotation = Math.PI;
      s.anchor.set(0.5, 0.5);
      if (t > 0.45) {
        const ring = this.sprites.get(FX.ring.file);
        if (ring) {
          const r = this.scratchSprite(ring.texture);
          r.x = a.toX;
          r.y = -a.toY;
          r.scale.set((a.radius * 2.2) / ring.texture.width);
          r.alpha = 0.16 + 0.12 * Math.sin(this.elapsed * 28);
          r.tint = a.source === 'mouse' ? 0x9be7ff : 0xffd166;
        }
      }
    }
  }

  /**
   * Arrows the archer has actually shot from his bow.
   *
   * Drawn rotated to their velocity so they read as travelling shots, with a
   * short faded tail behind each one. This is what the original's archer does;
   * making his attack a falling arrow was wrong.
   */
  private drawProjectiles(game: Game): void {
    const loaded = this.sprites.get(FX.arrow.file);
    if (!loaded) return;
    const baseScale = FX.arrow.height / loaded.texture.height;

    // Bow muzzle flash, so a shot reads even when the arrow leaves the frame fast.
    if (game.bowFlash > 0) {
      const player = game;
      const flash = this.scratchSprite(loaded.texture);
      flash.x = player.px + 46;
      flash.y = -(player.py + 132);
      flash.rotation = -0.5;
      flash.scale.set(baseScale * 1.5);
      flash.alpha = Math.min(1, game.bowFlash / 0.12);
      flash.tint = 0xfff0b0;
    }

    let drawn = 0;
    for (const p of game.getProjectileList()) {
      // Motion tail: two faded copies trailing the arrow.
      for (let k = 1; k <= 2; k++) {
        const tail = this.scratchSprite(loaded.texture);
        tail.x = p.x - p.vx * 0.012 * k;
        tail.y = -(p.y - p.vy * 0.012 * k);
        tail.rotation = Math.atan2(p.vy, p.vx) - Math.PI / 2;
        tail.scale.set(baseScale * (1 - k * 0.18));
        tail.alpha = 0.28 / k;
        tail.tint = 0xffe9b0;
      }
      const s = this.scratchSprite(loaded.texture);
      s.x = p.x;
      s.y = -p.y;
      // `Arrow1`'s HEAD is at the BOTTOM of its canvas (measured: its top rows are
      // the widest, ~24px, i.e. the fletching; the middle is the narrowest, ~9px,
      // i.e. the shaft). So the art points DOWN in local space and needs a quarter
      // turn CLOCKWISE to line up with the velocity vector. Using +PI/2 pointed the
      // arrow backwards; a vision pass caught it and the pixel profile confirmed it.
      s.rotation = Math.atan2(p.vy, p.vx) - Math.PI / 2;
      s.scale.set(baseScale);
      drawn++;
    }
    this.projectilesDrawn = drawn;
  }

  /**
   * Circular health indicators above enemies, as the original draws them: a green
   * fill inside a light ring, with the current HP above it.
  /**
   * Enemy health bars, ported from `EnemySelfer` + `BarSelfer`.
   *
   * All three behaviours below are taken from the decompiled code, not invented:
   *
   *  1. **Hidden until the first damage.** `EnemyCanvas` starts inactive and
   *     `TakeDamage` switches it on:
   *     `if (EnemyCanvasGO != null && !EnemyCanvasGO.activeInHierarchy) EnemyCanvasGO.SetActive(true);`
   *     An untouched minion therefore shows nothing at all.
   *  2. **The fill is left-to-right and eased.** `ManageBarAnimated` tweens `fillAmount`
   *     over `animationDuration` = 0.3s with `Ease.OutQuad`; `ManageBar` sets it
   *     instantly (used on death and on reset).
   *  3. **Every hit punches the bar.** `DOPunchScale(new Vector3(0.12f, 0.12f, 0f),
   *     0.15f, 6, 0.5f)` on the canvas transform.
   *
   * The look comes from the real sprites (`BAR` in `content/art.ts`); see there for how
   * the tints were solved. The bar's authored size lives in the enemy prefab, which does
   * not decode, so the on-screen size is chosen: a fixed 44x10 world units, which is
   * readable above the smallest minion without covering it.
   */
  private drawHealthBars(game: Game, dt: number): void {
    const fillTex = this.sprites.get(BAR.fill)?.texture;
    if (!fillTex) return;

    let used = 0;
    for (const e of game.getEnemyList()) {
      if (!e.alive) continue;

      let st = this.barState.get(e);
      if (!st) {
        st = { shown: 1, from: 1, to: 1, t: FILL_SECONDS, punch: 0, lastHp: e.maxHp, revealed: false };
        this.barState.set(e, st);
      }

      const frac = e.maxHp > 0 ? Math.max(0, Math.min(1, e.hp / e.maxHp)) : 0;

      // `EnemySelfer.TakeDamage` turns the canvas on at the first hit and never off.
      if (e.hp < st.lastHp || frac < 1) st.revealed = true;
      if (e.hp < st.lastHp) {
        st.punch = PUNCH_SECONDS;
        st.from = st.shown;
        st.to = frac;
        st.t = 0;
      }
      st.lastHp = e.hp;
      if (!st.revealed) continue;

      // Ease the displayed fill toward the real one with OutQuad, like the DOTween tween.
      if (st.t < FILL_SECONDS) {
        st.t = Math.min(FILL_SECONDS, st.t + dt);
        const u = st.t / FILL_SECONDS;
        st.shown = st.from + (st.to - st.from) * (1 - (1 - u) * (1 - u));
      } else {
        st.shown = st.to;
      }
      if (st.punch > 0) st.punch = Math.max(0, st.punch - dt);

      const drawn = CHARACTERS[e.type]?.height ?? e.radius * 2;
      // Size to the enemy so a Guardian reads bigger than a Bat, with a floor that keeps
      // the smallest minion's bar legible. The authored size is prefab data that does not
      // decode; this is the port's choice.
      const h = Math.max(14, drawn * 0.22);
      const w = h * 4.5;

      // DOTween's punch: 6 vibrations decaying over 0.15s, amplitude 0.12.
      const p = st.punch / PUNCH_SECONDS;
      const punch = 1 + 0.12 * p * Math.cos(p * Math.PI * 6);

      const bar = this.barAt(used++, fillTex);
      bar.root.visible = true;
      bar.root.x = e.x;
      // Sit just above the enemy's head. The sprite is feet-anchored, so the top of the
      // drawn art is `e.y + CHARACTERS[type].height`.
      bar.root.y = -(e.y + drawn + h * 0.75);
      bar.root.scale.set(punch);

      // OUTLINE THICKNESS.
      //
      // `Slider_Play_04_Border` is a 4px ring on a 44px-tall sprite, but taken as a pure
      // ratio on a 9px-tall bar that is 0.7px, which renders as a faint scratch rather
      // than the black box the original draws. The sprite is a fixed-size UI element in
      // the original, so its ring is a fixed 4px on screen; here the ring is the sprite's
      // ratio with a floor of 1.5 screen pixels, so it stays a visible box at every
      // viewport while still thickening on a big enemy.
      const ring = Math.max(h * (4 / 44), 1.5 / this.scale);
      // Track and fill sit clear of the ring.
      const inset = ring * 1.35;
      const innerW = Math.max(0, w - inset * 2);
      const innerH = Math.max(1, h - inset * 2);

      // Rounded outline, reproducing `Slider_Play_04_Border`'s measured shape.
      bar.frame.clear();
      bar.frame
        .roundRect(-w / 2, -h / 2, w, h, Math.max(ring * 1.6, h * (10 / 44)))
        .stroke({ color: BAR.frameTint, width: ring });

      bar.track.width = innerW;
      bar.track.height = innerH;
      bar.track.x = -w / 2 + inset;
      bar.track.y = h / 2 - inset - innerH;

      bar.fill.visible = st.shown > 0;
      bar.fill.width = Math.max(0.01, innerW * st.shown);
      bar.fill.height = innerH;
      bar.fill.x = -w / 2 + inset;
      bar.fill.y = h / 2 - inset - innerH;
    }

    this.barsDrawn = used;
    for (let i = used; i < this.bars.length; i++) this.bars[i].root.visible = false;
  }

  private barAt(
    index: number,
    fillTex: Texture,
  ): { root: Container; frame: Graphics; track: Sprite; fill: Sprite } {
    let b = this.bars[index];
    if (!b) {
      const root = new Container();
      /**
       * The outline is drawn with `Graphics`, NOT with `Slider_Play_04_Border` through
       * `NineSliceSprite`.
       *
       * That sprite is a 41x44 rounded white ring, but a minion bar is only ~12 world
       * units tall while the nine-slice insets are 10 each, and Pixi's nine-slice
       * geometry degenerates when `topHeight + bottomHeight` exceeds the target height:
       * the outline came apart into two horizontal strips offset from each other instead
       * of a closed box. The sprite was measured pixel by pixel, so its exact shape is
       * reproduced here instead - a ring 4/44 of the height thick, corner radius 10/44,
       * both of which scale cleanly to any bar size.
       */
      const frame = new Graphics();
      // Dark track behind the fill, built from the fill sprite so the palette stays to
      // the two colours measured off the original.
      const track = new Sprite(fillTex);
      track.tint = BAR.frameTint;
      track.alpha = 0.55;
      track.anchor.set(0, 0);
      const fill = new Sprite(fillTex);
      fill.tint = BAR.fillTint;
      // Left-anchored so growing the width fills rightwards, as `fillAmount` does.
      fill.anchor.set(0, 0);
      root.addChild(frame, track, fill);
      this.entityLayer.addChild(root);
      b = { root, frame, track, fill };
      this.bars[index] = b;
    }
    return b;
  }

  private drawShots(game: Game): void {
    const fx = FX.shot;
    const loaded = this.sprites.get(fx.file);
    if (!loaded) return;
    for (const shot of game.getShotList()) {
      const s = this.scratchSprite(loaded.texture);
      s.scale.set((shot.radius * 4.5) / loaded.texture.width);
      s.x = shot.x;
      s.y = -shot.y;
      s.tint = shot.color;
    }
  }

  private drawCoins(game: Game): void {
    for (const c of game.getCoinList()) {
      const art = DROP_ART[c.currency] ?? DROP_ART.Gold;
      const loaded = this.sprites.get(art.file);
      if (!loaded) continue;
      const s = this.scratchSprite(loaded.texture);
      s.scale.set(art.height / loaded.texture.height);
      s.x = c.x;
      s.y = -c.y;
      s.tint = art.tint;
    }
  }

  private drawPuffs(game: Game): void {
    const fx = FX.ember;
    const loaded = this.sprites.get(fx.file);
    if (!loaded) return;
    for (const p of game.getPuffList()) {
      const t = p.life / p.maxLife;
      const s = this.scratchSprite(loaded.texture);
      s.scale.set((p.radius * 2.6 * (1 + t)) / loaded.texture.width);
      s.x = p.x;
      s.y = -p.y;
      s.alpha = Math.max(0, 1 - t);
      s.tint = p.color;
      s.rotation = p.life * 3;
    }
  }

  destroy(): void {
    this.app.destroy(true, { children: true });
  }
}
