/**
 * Space-reskin impact/weapon FX.
 *
 * Contract (see 美术资源替换规格书.md §5):
 *  - Arrow1: the arrow HEAD must point at the BOTTOM edge of the canvas.
 *  - FX_Ring_AD / FX_TX_Ember_AB / Circle: perfectly centred, and the ring / disc
 *    should fill the canvas so the drawn radius matches the gameplay radius.
 */
import { Canvas, Rng, SPACE, clamp, mix } from './art-core.mjs';

/** Arrow1 (22x146): an energy lance with a glowing head at the bottom. */
export function arrow(w = 22, h = 146) {
  const c = new Canvas(w, h);
  const cx = w / 2;
  const hot = [230, 250, 255];
  const core = [110, 225, 255];
  const shell = [58, 74, 108];

  // shaft
  c.rect(cx - 2.2, h * 0.22, 4.4, h * 0.56, shell, 1);
  c.rect(cx - 1.0, h * 0.22, 2.0, h * 0.56, mix(core, hot, 0.4), 0.95);
  c.rect(cx - 0.5, h * 0.24, 1.0, h * 0.52, hot, 0.9);

  // fletching at the top (this is the tail the code orients away from the target)
  for (const side of [-1, 1]) {
    c.poly(
      [
        [cx + side * 1.5, h * 0.04],
        [cx + side * 8.5, h * 0.16],
        [cx + side * 8.0, h * 0.3],
        [cx + side * 1.5, h * 0.26],
      ],
      side > 0 ? mix(core, [0, 0, 0], 0.25) : mix(core, [0, 0, 0], 0.45),
      0.95,
    );
    c.poly(
      [
        [cx + side * 1.5, h * 0.08],
        [cx + side * 7.0, h * 0.18],
        [cx + side * 6.4, h * 0.26],
        [cx + side * 1.5, h * 0.22],
      ],
      hot,
      0.5,
    );
  }

  // head: point DOWN (bottom edge)
  c.poly(
    [
      [cx, h * 0.995],
      [cx + 6.2, h * 0.84],
      [cx + 4.6, h * 0.76],
      [cx, h * 0.79],
      [cx - 4.6, h * 0.76],
      [cx - 6.2, h * 0.84],
    ],
    mix(core, hot, 0.35),
    0.98,
  );
  c.poly(
    [
      [cx, h * 0.99],
      [cx + 3.0, h * 0.86],
      [cx - 3.0, h * 0.86],
    ],
    hot,
    0.9,
  );
  // energy collar behind the head
  c.rect(cx - 5.2, h * 0.755, 10.4, 3.4, shell, 1);
  c.rect(cx - 4.0, h * 0.762, 8.0, 1.6, core, 0.8);

  return c.glow(2, 0.55, 150);
}

/** FX_Ring_AD (472x472): the impact ring. Perfectly centred. */
export function impactRing(size = 472) {
  const c = new Canvas(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const core = [190, 240, 255];
  const r0 = size * 0.455;

  // soft outer falloff (this is the "radius is real" cue)
  for (let k = 0; k < 5; k++) {
    c.ring(cx, cy, r0 * (1 - k * 0.045), size * 0.012, core, 0.1 * (1 - k * 0.18), size * 0.02);
  }
  // main band
  c.ring(cx, cy, r0 * 0.93, size * 0.022, core, 0.95, size * 0.006);
  c.ring(cx, cy, r0 * 0.93, size * 0.006, [255, 255, 255], 0.8, size * 0.004);
  // inner scanning ring
  c.ring(cx, cy, r0 * 0.66, size * 0.008, core, 0.45, size * 0.01);
  // tick marks around the band (reads as a tech gauge)
  for (let i = 0; i < 48; i++) {
    const a = (i / 48) * Math.PI * 2;
    const len = i % 4 === 0 ? size * 0.075 : size * 0.035;
    const x0 = cx + Math.cos(a) * r0 * 0.93;
    const y0 = cy + Math.sin(a) * r0 * 0.93;
    const x1 = cx + Math.cos(a) * (r0 * 0.93 - len);
    const y1 = cy + Math.sin(a) * (r0 * 0.93 - len);
    c.line(x0, y0, x1, y1, size * (i % 4 === 0 ? 0.008 : 0.004), core, i % 4 === 0 ? 0.85 : 0.45);
  }
  // faint inner glow so the centre of the blast is not empty
  for (let k = 0; k < 4; k++) {
    c.disc(cx, cy, r0 * (0.6 - k * 0.12), core, 0.05, r0 * 0.16);
  }
  return c.glow(4, 0.5, 150);
}

/** FX_TX_Ember_AB (288x282): plasma sparks, symmetric (it gets rotated). */
export function ember(w = 288, h = 282) {
  const c = new Canvas(w, h);
  const cx = w / 2;
  const cy = h / 2;
  const rng = new Rng(555);
  const hot = [255, 240, 200];
  const warm = [255, 170, 90];
  const cool = [140, 210, 255];

  // core flash
  c.disc(cx, cy, Math.min(w, h) * 0.1, hot, 0.9, Math.min(w, h) * 0.06);
  c.disc(cx, cy, Math.min(w, h) * 0.2, warm, 0.3, Math.min(w, h) * 0.12);

  // symmetric spark rays
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + 0.15;
    const len = rng.range(0.16, 0.42) * Math.min(w, h);
    const x1 = cx + Math.cos(a) * len;
    const y1 = cy + Math.sin(a) * len;
    c.line(cx + Math.cos(a) * 8, cy + Math.sin(a) * 8, x1, y1, rng.range(1.4, 4.2), i % 3 === 0 ? cool : warm, rng.range(0.4, 0.95));
    c.disc(x1, y1, rng.range(1.2, 3.2), hot, rng.range(0.5, 0.95), 1.4);
  }
  // debris blobs, mirrored so the sprite stays rotation-safe
  for (let i = 0; i < 34; i++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(0.1, 0.46) * Math.min(w, h);
    const x = cx + Math.cos(a) * r;
    const y = cy + Math.sin(a) * r;
    c.disc(x, y, rng.range(1.5, 5), i % 4 === 0 ? warm : hot, rng.range(0.25, 0.7), 2);
    c.disc(cx - Math.cos(a) * r, cy - Math.sin(a) * r, rng.range(1.5, 4), hot, rng.range(0.2, 0.5), 2);
  }
  return c.glow(4, 0.6, 150);
}

/** Circle (256x256): the skill AOE / enemy bullet disc. Scaled by WIDTH in code. */
export function aoeDisc(size = 256) {
  const c = new Canvas(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const R = size * 0.47;
  const core = [150, 235, 255];
  const deep = [40, 90, 160];

  // soft body + rim
  for (let k = 0; k < 6; k++) c.disc(cx, cy, R * (1 - k * 0.1), deep, 0.06, R * 0.12);
  c.ring(cx, cy, R * 0.94, size * 0.014, core, 0.9, size * 0.004);
  c.ring(cx, cy, R * 0.8, size * 0.006, core, 0.4, size * 0.012);
  // radial spokes, symmetric
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    c.line(cx + Math.cos(a) * R * 0.55, cy + Math.sin(a) * R * 0.55, cx + Math.cos(a) * R * 0.92, cy + Math.sin(a) * R * 0.92, size * 0.008, core, 0.5);
  }
  c.ring(cx, cy, R * 0.5, size * 0.008, core, 0.5, size * 0.012);
  c.disc(cx, cy, R * 0.3, core, 0.14, R * 0.16);
  return c.glow(4, 0.5, 150);
}
