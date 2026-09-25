/**
 * Touch/mouse input: tap or drag anywhere in the world to aim.
 *
 * This is the original's control scheme, unchanged — the only input is "where do
 * the arrows land". The character walks himself, so there is no virtual stick
 * and nothing else for a thumb to do, which is exactly why it works on a phone.
 *
 * Two behaviours are supported:
 *  - tap: one arrow at the tapped point
 *  - press and drag: keeps raining arrows along the dragged path (the original's
 *    hold-mouse behaviour), and drags re-aim live rather than re-tapping
 */

import { clamp, randRange } from '../core/math.js';
import type { InputState } from '../game/game.js';

export interface AimCallbacks {
  toWorld: (screenX: number, screenY: number) => { x: number; y: number };
  /** Called when an aim point should produce an arrow. */
  onAim: (worldX: number, worldY: number) => void;
  /** Called every frame with the current drag position, if any. */
  onAimMove: (worldX: number, worldY: number) => void;
}

export class AimInput {
  private pointerId: number | null = null;
  private lastX = 0;
  private lastY = 0;
  private holdTimer = 0;
  private aiming = false;
  private readonly state: InputState = {
    aiming: false, aimX: 0, aimY: 0, taps: 0,
    hoverX: 0, hoverY: 0, hoverActive: false,
  };

  /** Seconds between repeated arrows while holding. */
  private readonly holdInterval = 0.16;

  constructor(
    private readonly surface: HTMLElement,
    private readonly cb: AimCallbacks,
  ) {
    surface.addEventListener('pointerdown', this.onDown, { passive: false });
    surface.addEventListener('pointermove', this.onMove, { passive: false });
    // Hover is tracked separately from dragging: a mouse with no button held must still
    // be able to sweep loot off the ground.
    surface.addEventListener('pointermove', this.onHover, { passive: true });
    surface.addEventListener('pointerleave', this.onLeave, { passive: true });
    surface.addEventListener('pointercancel', this.onLeave, { passive: true });
    surface.addEventListener('pointerup', this.onUp, { passive: true });
    surface.addEventListener('pointercancel', this.onUp, { passive: true });
    surface.addEventListener('contextmenu', (e) => e.preventDefault());
    // Block iOS long-press selection / callout on the play surface.
    (surface.style as CSSStyleDeclaration & { webkitTouchCallout?: string }).webkitTouchCallout = 'none';
  }

  private localPoint(ev: PointerEvent): { x: number; y: number } {
    const rect = this.surface.getBoundingClientRect();
    return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
  }

  private readonly onDown = (ev: PointerEvent): void => {
    if (this.pointerId !== null) return;
    this.pointerId = ev.pointerId;
    ev.preventDefault();
    const p = this.localPoint(ev);
    this.lastX = p.x;
    this.lastY = p.y;
    this.holdTimer = 0;
    this.aiming = true;

    const w = this.cb.toWorld(p.x, p.y);
    this.state.aiming = true;
    this.state.aimX = w.x;
    this.state.aimY = w.y;
    // Queued, not flagged: several taps can land inside one frame and each should
    // cost a magazine round rather than being dropped.
    this.state.taps++;
    this.cb.onAim(w.x, w.y);
  };

  private readonly onMove = (ev: PointerEvent): void => {
    if (this.pointerId !== ev.pointerId) return;
    ev.preventDefault();
    const p = this.localPoint(ev);
    this.lastX = p.x;
    this.lastY = p.y;
    const w = this.cb.toWorld(p.x, p.y);
    this.state.aimX = w.x;
    this.state.aimY = w.y;
    this.cb.onAimMove(w.x, w.y);
  };

  /**
   * Hover tracking, independent of any button.
   *
   * `LootDropSelfer.Update` has a second pickup path: once a drop has settled, hovering
   * the pointer within `mousePickupRadius` (40 units) of it collects it. `onMove` above
   * only runs while the pointer is DOWN (it bails when the id does not match), so without
   * this the hover path could never fire and drops could only be walked over.
   */
  private readonly onHover = (ev: PointerEvent): void => {
    const p = this.localPoint(ev);
    const w = this.cb.toWorld(p.x, p.y);
    this.state.hoverX = w.x;
    this.state.hoverY = w.y;
    this.state.hoverActive = true;
  };

  private readonly onLeave = (): void => {
    this.state.hoverActive = false;
  };

  private readonly onUp = (ev: PointerEvent): void => {
    if (this.pointerId !== ev.pointerId) return;
    this.pointerId = null;
    this.aiming = false;
    this.state.aiming = false;
    this.holdTimer = 0;
  };

  /**
   * Call once per frame, BEFORE the simulation steps. Refills the tap queue while the
   * pointer is held.
   *
   * Deliberately does **not** clear `state.taps`.
   *
   * Pointer events are delivered asynchronously, i.e. always BETWEEN two frames: a tap
   * that lands after frame N's `game.tick` can only be read by frame N+1. Clearing the
   * queue here - and this runs immediately BEFORE `game.tick` - therefore threw away
   * every tap that arrived between frames, leaving press-and-hold (refilled below) as
   * the only way to fire. A quick tap produced no arrow at all.
   *
   * The queue is consumed and cleared by `Game.tick` instead, which is the only place
   * that knows how many arrows the magazine could actually serve.
   */
  update(dt: number): void {
    if (!this.aiming) return;
    // Holding repeats: the original keeps firing Arrow Fall while the button is down.
    this.holdTimer += dt;
    while (this.holdTimer >= this.holdInterval) {
      this.holdTimer -= this.holdInterval;
      const w = this.cb.toWorld(this.lastX, this.lastY);
      this.state.aimX = w.x;
      this.state.aimY = w.y;
      this.state.taps++;
      this.cb.onAim(w.x, w.y);
    }
  }

  /** The sim consumes this and clears the edge-triggered flag itself. */
  getState(): InputState {
    return this.state;
  }

  /** Jitters an aim point so repeated holds do not stack on one pixel. */
  static jitter(worldX: number, worldY: number, amount = 26): { x: number; y: number } {
    return { x: worldX + randRange(-amount, amount), y: worldY + randRange(-amount * 0.55, amount * 0.55) };
  }
}

export const inputHelpers = { clamp };
