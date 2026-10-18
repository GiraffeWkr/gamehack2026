/**
 * Pixel-art combat FX. All four are drawn in WHITE / pale tones because the
 * renderer tints them at draw time (cyan for the arrow rain, gold for skills,
 * per-enemy colours for puffs), so hue must not be baked in.
 */
import { Px } from './pixel-core.mjs';

/**
 * 22x64 projectile: a compact plasma bolt, fired by the carbine.
 *
 * The previous sprite was a 146px lance: even recoloured, a long thin shaft with fins
 * reads as an ARROW. A gun round has to be SHORT - the renderer scales this by
 * `FX.arrow.height` (24 world units), so the visible round is about a third of a
 * character's height and reads as a bolt, not a projectile with a shaft.
 *
 * Head at the BOTTOM edge, matching the renderer's rotation convention.
 */
export function bolt() {
  const c = new Px(22, 64, 11, 32);
  const mid = 5;

  // Tracer: one cell wide, fading upward. A wide tail is what made the old sprite read
  // as a shaft; a rifle round is a head plus a short line.
  for (let y = 12; y < 20; y++) {
    const t = (y - 12) / 8;
    c.set(mid, y, 'cyan', 0.15 + 0.35 * t);
  }

  // Head: a blunt diamond, 5 cells across at its widest. Blunt on both ends on purpose -
  // a point reads as an arrowhead.
  const rows = [
    [20, 0], [21, 1], [22, 2], [23, 2], [24, 2], [25, 2], [26, 1], [27, 0],
  ];
  for (const [y, half] of rows) c.hline(mid - half, mid + half, y, 'ice');
  c.disc(mid, 24, 1.4, 'white');
  c.set(mid, 25, 'white');
  c.set(mid, 21, 'white', 0.75);
  return c;
}
/**
 * 22x146 orbital lance: the big strike round that falls on the tapped point.
 *
 * This is the one place a long projectile is right: the tap is an orbital strike, not a
 * rifle shot. Fins were removed - they were the last arrow-like read in the game.
 */
export function orbitalLance() {
  const c = new Px(22, 146, 11, 73);
  const mid = 5;

  // Ionised air column behind the lance.
  for (let y = 0; y < 48; y++) {
    const t = y / 47;
    const half = 2.0 * (1 - t) + 0.4;
    c.hline(Math.round(mid - half), Math.round(mid + half), y, 'cyan2', 0.3 * (1 - t) + 0.06);
    if (y % 6 === 0) c.set(mid, y, 'cyan', 0.25);
  }

  // Energy rings along the shaft instead of fletching.
  for (const y of [40, 46, 52]) {
    c.hline(mid - 2, mid + 2, y, 'cyan', 0.55);
    c.set(mid - 3, y, 'cyan2', 0.3);
    c.set(mid + 3, y, 'cyan2', 0.3);
  }

  // Solid shaft + a hot tapered tip at the bottom.
  for (let y = 46; y < 66; y++) {
    c.set(mid, y, 'white');
    c.set(mid - 1, y, 'ice', 0.9);
    c.set(mid + 1, y, 'ice', 0.65);
  }
  for (let i = 0; i < 12; i++) {
    const t = i / 11;
    const half = 2.8 * (1 - t * t);
    const y = 62 + i;
    c.hline(Math.round(mid - half), Math.round(mid + half), y, i > 7 ? 'white' : 'ice');
  }
  c.vline(mid, 64, 72, 'white');
  c.set(mid, 72, 'white');
  for (const [dx, y] of [[-3, 63], [-2, 62], [2, 62], [3, 63]]) c.set(mid + dx, y, 'white', 0.8);
  return c;
}

/** 472x472 impact ring: a thick, notched circle that reads as a shock wave. */
export function impactRing() {
  const c = new Px(472, 472, 59, 59);
  const cx = 29;
  const cy = 29;

  // Outer rim.
  c.ring(cx, cy, 27.5, 2.4, 'white', 0.95);
  // Notched segments (8 gaps) so it looks mechanical rather than a plain circle.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.18;
    for (const r of [26.4, 27.2, 28, 28.8]) {
      c.set(cx + Math.cos(a) * r, cy + Math.sin(a) * r, 'white', 0);
    }
  }
  // Inner dither band.
  for (let i = 0; i < 40; i++) {
    const a = (i / 40) * Math.PI * 2;
    c.set(cx + Math.cos(a) * 24, cy + Math.sin(a) * 24, 'white', i % 2 ? 0.5 : 0.16);
    c.set(cx + Math.cos(a) * 25.4, cy + Math.sin(a) * 25.4, 'white', i % 2 ? 0.25 : 0.55);
  }
  // Faint inner ring + cross ticks.
  c.ring(cx, cy, 18, 1, 'white', 0.14);
  for (const [x, y] of [[cx, 1], [cx, 57], [1, cy], [57, cy]]) c.set(x, y, 'white', 0.8);
  // Corner arcs.
  for (let i = 0; i < 4; i++) {
    const a0 = (i / 4) * Math.PI * 2 + 0.35;
    for (let a = a0; a < a0 + 0.5; a += 0.03) {
      c.set(cx + Math.cos(a) * 21, cy + Math.sin(a) * 21, 'white', 0.55);
    }
  }
  return c;
}

/** 288x282 hit spark / puff. Symmetric so it can be rotated freely. */
export function ember() {
  const c = new Px(288, 282, 48, 47);
  const cx = 24;
  const cy = 23.5;

  // Core.
  c.disc(cx, cy, 3.2, 'white');
  c.disc(cx, cy, 1.6, 'white');

  // Eight tapered spikes, alternating long/short.
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + Math.PI / 16;
    const len = i % 2 === 0 ? 18 : 11;
    for (let r = 3; r < len; r++) {
      const t = r / len;
      const w = Math.max(0.4, 2.2 * (1 - t));
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      const nx = Math.cos(a + Math.PI / 2) * w;
      const ny = Math.sin(a + Math.PI / 2) * w;
      c.line(x - nx, y - ny, x + nx, y + ny, 'white', 1, 0.9 * (1 - t * 0.7));
    }
  }
  // Dither cloud between the spikes.
  for (let i = 0; i < 150; i++) {
    const a = (i / 150) * Math.PI * 2 * 3;
    const r = 2 + ((i * 37) % 100) / 100 * 15;
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r * 0.95;
    if (Math.hypot(x - cx, y - cy) > 19) continue;
    c.set(x, y, 'white', 0.16 + ((i * 13) % 10) / 40);
  }
  return c;
}

/** 256x256 AOE disc + enemy bullet. Fills the canvas width so radius maps 1:1. */
export function aoeDisc() {
  const c = new Px(256, 256, 64, 64);
  const cx = 32;
  const cy = 32;

  c.ring(cx, cy, 30.5, 1.6, 'white', 0.95);
  c.ring(cx, cy, 27.5, 1, 'white', 0.45);
  // Dashed inner ring.
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2;
    if (i % 2) continue;
    c.set(cx + Math.cos(a) * 21, cy + Math.sin(a) * 21, 'white', 0.7);
  }
  // Crosshair ticks at the rim.
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
    for (let r = 24; r <= 30; r++) c.set(cx + dx * r, cy + dy * r, 'white', 0.9);
  }
  // Sparse inner fill so the area reads without hiding the ground.
  for (let y = 0; y < 64; y++) {
    for (let x = 0; x < 64; x++) {
      const d = Math.hypot(x - cx, y - cy);
      if (d > 29 || d < 3) continue;
      if ((x * 7 + y * 11) % 23 === 0) c.set(x, y, 'white', 0.12);
    }
  }
  c.disc(cx, cy, 2.2, 'white');
  return c;
}

// ---------------------------------------------------------------------------
// Secondary FX. The renderer does not draw these today, but `art.ts` lists them
// in `FX` and preloads every entry, so they are reskinned too: a stray space-era
// sprite would be one `Texture` swap away from breaking the style.

/** 454x456 four-point star flare. */
export function starSpark() {
  const c = new Px(454, 456, 57, 57);
  const cx = 28;
  const cy = 28;
  // Long horizontal/vertical arms with a bright taper.
  for (let r = 1; r < 26; r++) {
    const w = Math.max(0.5, 2.4 * (1 - r / 26));
    c.set(cx + r, cy, 'white', 0.95 - r / 40);
    c.set(cx - r, cy, 'white', 0.95 - r / 40);
    c.set(cx, cy + r, 'white', 0.95 - r / 40);
    c.set(cx, cy - r, 'white', 0.95 - r / 40);
    if (w > 1) {
      c.set(cx + r, cy + 1, 'white', 0.25);
      c.set(cx - r, cy - 1, 'white', 0.25);
    }
  }
  // Diagonal spikes.
  for (let r = 1; r < 13; r++) {
    const t = r / 13;
    c.set(cx + r * 0.72, cy + r * 0.72, 'white', 0.8 * (1 - t));
    c.set(cx - r * 0.72, cy + r * 0.72, 'white', 0.8 * (1 - t));
    c.set(cx + r * 0.72, cy - r * 0.72, 'white', 0.8 * (1 - t));
    c.set(cx - r * 0.72, cy - r * 0.72, 'white', 0.8 * (1 - t));
  }
  c.disc(cx, cy, 3.2, 'white');
  return c;
}

/** 512x512 shock wave: a thin ring plus radial ticks. */
export function shockRing() {
  const c = new Px(512, 512, 64, 64);
  const cx = 32;
  const cy = 32;
  c.ring(cx, cy, 30, 1.2, 'white', 0.9);
  c.ring(cx, cy, 26, 0.8, 'white', 0.35);
  for (let i = 0; i < 28; i++) {
    const a = (i / 28) * Math.PI * 2;
    c.set(cx + Math.cos(a) * 30, cy + Math.sin(a) * 30, 'white', 0.95);
    c.set(cx + Math.cos(a) * 28, cy + Math.sin(a) * 28, 'white', 0.4);
  }
  return c;
}

/** 29x128 motion trail: a tapering streak. */
export function trail() {
  const c = new Px(29, 128, 15, 64);
  const mid = 7;
  for (let y = 0; y < 64; y++) {
    const t = y / 63;
    const half = 1.6 * (1 - t);
    c.hline(Math.round(mid - half), Math.round(mid + half), y, 'white', 0.85 - t * 0.55);
  }
  return c;
}

/** 124x128 pickup orb: a glowing core inside an energy ring. */
export function orbPickup() {
  const c = new Px(124, 128, 31, 32);
  const cx = 15;
  const cy = 16;
  c.ring(cx, cy, 11, 1.2, 'cyan', 0.75);
  c.ring(cx, cy, 8.5, 1, 'cyan2', 0.5);
  c.disc(cx, cy, 5.2, 'cyan2', 0.6);
  c.disc(cx, cy, 3.8, 'cyan');
  c.disc(cx, cy, 2, 'ice');
  c.set(cx, cy, 'white');
  // Four orbiting sparks.
  for (let i = 0; i < 4; i++) {
    const a = (i / 4) * Math.PI * 2 + 0.5;
    c.set(cx + Math.cos(a) * 11, cy + Math.sin(a) * 11, 'ice', 0.9);
  }
  return c;
}

/**
 * Soft ground shadow for the hovering player. White + alpha so the renderer can tint it
 * black; an ellipse is enough at this scale and reads as a blob under the feet.
 */
export function hoverShadow() {
  const c = new Px(64, 24, 16, 6);
  const cx = 7.5, cy = 2.5, rx = 7.6, ry = 2.6;
  for (let y = 0; y < 6; y++) {
    for (let x = 0; x < 16; x++) {
      const d = ((x - cx) / rx) ** 2 + ((y - cy) / ry) ** 2;
      if (d >= 1) continue;
      c.set(x, y, 'white', 0.5 * Math.pow(1 - d, 0.7));
    }
  }
  return c;
}