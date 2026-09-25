/**
 * Parallax background, ported from `ParallaxManager`.
 *
 * ## What the original does
 *
 * The decompiled manager is a scrolling accumulator with three copies per layer:
 *
 * ```csharp
 * // MoveCamera
 * cameraTransform.position += new Vector3(deltaX, 0f, 0f);
 *
 * // UpdateParallaxLayers
 * float deltaX = cameraTransform.position.x - previousCameraPosition.x;
 *
 * // MoveBackgroundLayers - each layer advances by deltaX * (1 - parallaxFactor)
 * float x = deltaX * (1f - layers[i].parallaxFactor);
 * layers[i].layerTransform.position += new Vector3(x, 0f, 0f);
 * //   ...its leftClone and rightClone move with it
 * RepositionLayers(layers[i]);
 *
 * // CreateInfiniteClones: two clones per layer, one span either side
 * // RepositionLayers: a copy beyond the visible half-width is wrapped by span * 3,
 * //                   then every copy snaps to a whole multiple of the span
 * ```
 *
 * ## Three things this port kept getting wrong
 *
 *  1. **Each layer is tiled three times.** One sprite per layer leaves gaps as soon
 *     as the camera moves.
 *  2. **Every layer is a full 1920x600 frame drawn at the SAME origin.** They are not
 *     stacked at different heights; each is mostly transparent with one painted band
 *     in it. The per-layer vertical offsets an earlier revision invented are what made
 *     the landscape look unstitched. The only vertical placement is each PNG's crop
 *     offset inside the frame (`cropTop`), straight from the Sprite data.
 *  3. **The wrap limit is the visible half-width**, not a fixed multiple of the span.
 *     `ParallaxManager` computes `cam.orthographicSize * cam.aspect` for exactly this
 *     and lays its clone grid out over +/- that distance.
 *
 * `spriteWidth` and `tileOverlap` are private serialized fields this build does not
 * expose, so the span is taken as each PNG's own width - which is the full 1920 for
 * every layer except the foreground `item` strip (1743), an alpha-trimmed decoration.
 */

import { Container, Sprite, Texture } from 'pixi.js';

/** Sub-pixel overlap so adjacent copies show no seam. From `tileOverlap`. */
const TILE_OVERLAP = 0.01;

export interface ParallaxLayerDef {
  /** Texture key in the art library. */
  file: string;
  /** 0 = pinned to the screen (infinitely far), 1 = locked to the world. */
  parallaxFactor: number;
  /** Left edge of the exported PNG inside the 1920-wide frame, in art units. */
  cropLeft: number;
  /** Top edge of the exported PNG inside the 600-tall frame, in art units. */
  cropTop: number;
  /** Draws in front of the characters. */
  foreground: boolean;
  alpha?: number;
}

interface LayerRuntime {
  def: ParallaxLayerDef;
  /** Three copies: index 1 is the centre (the original's `layerTransform`). */
  sprites: [Sprite, Sprite, Sprite];
  /** World x of the centre copy. */
  x: number;
  span: number;
}

export class ParallaxBackground {
  private readonly layers: LayerRuntime[] = [];
  private previousCameraX = 0;
  private started = false;
  private scale: number;
  /** Camera world x for this frame, set by `update`. */
  private cameraX = 0;
  private viewW = 1280;

  constructor(
    private readonly backHost: Container,
    private readonly frontHost: Container,
    scale = 1,
  ) {
    this.scale = scale;
  }

  addLayer(def: ParallaxLayerDef, texture: Texture): void {
    const host = def.foreground ? this.frontHost : this.backHost;
    const sprites = [0, 1, 2].map(() => {
      const s = new Sprite(texture);
      // Top-left anchor: the sprite's own position is the layer's top-left corner, so
      // the crop offset inside the frame can be added straight on.
      s.anchor.set(0, 0);
      s.scale.set(this.scale);
      if (def.alpha !== undefined) s.alpha = def.alpha;
      host.addChild(s);
      return s;
    }) as [Sprite, Sprite, Sprite];

    const span = texture.width - TILE_OVERLAP;
    this.layers.push({ def, sprites, x: 0, span });
    this.place(this.layers[this.layers.length - 1]);
  }

  /** Re-applies the background scale after a viewport change. */
  setScale(scale: number): void {
    this.scale = scale;
    for (const l of this.layers) {
      // The span is a distance in WORLD units, so it does not change with the viewport -
      // one art pixel is one world unit. Multiplying it by the pixel scale as well was a
      // unit mix-up that packed the copies three times too close together.
      l.span = l.sprites[0].texture.width - TILE_OVERLAP;
      for (const s of l.sprites) s.scale.set(scale);
      this.place(l);
    }
  }

  get layerCount(): number {
    return this.layers.length;
  }

  /**
   * Screen-space bands, for the `?measure=1` overlay and the framing harness.
   *
   * `left`/`right` are the UNION of the layer's tiled copies, which is what a coverage
   * check needs: a single copy is intentionally wider than the viewport and the copies
   * are what fill it.
   */
  bands(): Array<{
    file: string;
    top: number;
    bottom: number;
    span: number;
    copies: number;
    left: number;
    right: number;
  }> {
    return this.layers.map((l) => {
      let left = Infinity;
      let right = -Infinity;
      for (const s of l.sprites) {
        left = Math.min(left, s.x);
        right = Math.max(right, s.x + s.texture.width * this.scale);
      }
      return {
        file: l.def.file,
        top: l.def.cropTop * this.scale,
        bottom: (l.def.cropTop + l.sprites[0].texture.height) * this.scale,
        span: Math.round(l.span),
        copies: l.sprites.length,
        left,
        right,
      };
    });
  }

  /**
   * Advances the background by the camera's movement this frame and re-tiles it.
   *
   * Mirrors `UpdateParallaxLayers` -> `MoveBackgroundLayers`.
   */
  update(cameraX: number, viewWidth: number): void {
    this.cameraX = cameraX;
    this.viewW = viewWidth;
    const deltaX = this.started ? cameraX - this.previousCameraX : 0;
    this.previousCameraX = cameraX;
    this.started = true;

    for (const l of this.layers) {
      // The whole group advances by deltaX * (1 - parallaxFactor).
      l.x += deltaX * (1 - l.def.parallaxFactor);
      this.place(l);
    }
  }

  /**
   * Wraps the layer's phase into half a span of the camera, lays the copies out on exact
   * span multiples, and converts to screen space.
   *
   * `RepositionLayers` reaches the same arrangement with `while` loops stepping by
   * `span * 3`. That cannot terminate once the visible half-width exceeds half a span,
   * which is any viewport wider than 1920 world units - the loop adds a span and then
   * takes it straight back off. Expressing the wrap as a modulo is equivalent, cannot
   * oscillate, and still snaps every copy to a whole span from the centre one, so no
   * float drift accumulates.
   *
   * The three copies sit within +/- 1.5 spans of the camera, i.e. +/- 2880 world units,
   * which covers any viewport up to a 5.33:1 aspect ratio (visible width = 1080 * 5.33).
   *
   * World -> screen is `viewW/2 + (worldX - cameraX) * scale`, the same mapping the
   * renderer uses for entities, so a layer with `parallaxFactor` 1 stays locked to the
   * world and one with 0 stays pinned to the screen.
   */
  private place(l: LayerRuntime): void {
    const phase = l.x - this.cameraX;
    const base = this.cameraX + (phase - Math.round(phase / l.span) * l.span);

    for (let i = 0; i < l.sprites.length; i++) {
      const wx = base + (i - 1) * l.span;
      const s = l.sprites[i];
      s.x = this.viewW * 0.5 + (wx - this.cameraX) * this.scale + l.def.cropLeft * this.scale;
      s.y = l.def.cropTop * this.scale;
    }
  }
}
