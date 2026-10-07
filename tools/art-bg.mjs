/**
 * Parallax background layers (space station / deep field reskin).
 *
 * Geometry contract, measured from the shipped art (see 美术资源替换规格书.md §3):
 *   frame row 0..600 = the whole canvas; row 500 is the walkable ground line, and
 *   the crop offsets in art.ts place each PNG at its authored row:
 *     clouds 10 · hills3 108 · hills2 137 · hills1 205 · trees 75 · grass 430 · item 495
 *   so every layer is drawn in its own local coordinates with `top` added.
 *
 * All 1920-wide layers are drawn with `wrap: true` because the renderer tiles each
 * layer three times horizontally and a seam would show immediately.
 */
import { Canvas, Rng, SPACE, clamp, lerp, mix, sampleStops } from './art-core.mjs';

const W = 1920;

/** Row of the walkable surface inside the 600-tall frame. */
const GROUND = 500;

/** Dense starfield; wrap-safe by construction (the canvas wraps coordinates). */
function starfield(c, rng, { count, y0, y1, size = 1, alpha = 1, tint = null }) {
  for (let i = 0; i < count; i++) {
    const x = rng.range(0, c.w);
    const y = rng.range(y0, y1);
    const s = rng.chance(0.08) ? size + 1 : size;
    const a = alpha * rng.range(0.25, 1);
    const col = tint ?? (rng.chance(0.18)
      ? [200, 225, 255]
      : rng.chance(0.25)
        ? [255, 235, 210]
        : [255, 255, 255]);
    c.disc(x, y, s * 0.6, col, a, 0.7);
    if (s > 1) c.add(x, y, col, a * 0.5);
  }
}

/** Soft nebula made of many cheap translucent discs. */
function nebula(c, rng, { y0, y1, blobs, colors, alpha = 0.16, rMin = 60, rMax = 190 }) {
  for (let i = 0; i < blobs; i++) {
    const x = rng.range(0, c.w);
    const y = rng.range(y0, y1);
    const r = rng.range(rMin, rMax);
    const col = rng.pick(colors);
    // a handful of concentric, decreasing discs fake a gaussian falloff cheaply
    for (let k = 0; k < 5; k++) {
      c.disc(x, y, r * (1 - k * 0.18), col, alpha * (0.35 + k * 0.16), r * 0.4);
    }
  }
}

/** Radial glow used for suns, cores and thrusters. */
function glowSpot(c, x, y, r, col, a = 0.8) {
  for (let k = 0; k < 6; k++) {
    c.disc(x, y, r * (1 - k * 0.15), col, (a * 0.22) / (1 + k * 0.55), r * 0.5);
  }
}

// ---------------------------------------------------------------------------
// Layer 0 - sky (1920x600, fully opaque, the only base image)
// ---------------------------------------------------------------------------
export function sky(rng) {
  const c = new Canvas(W, 600, { wrap: true });
  // Vertical wash: near-black at the top, a cold haze band just above the ground.
  for (let y = 0; y < 600; y++) {
    const t = y / 599;
    const col = sampleStops(
      [
        [0, [3, 5, 13]],
        [0.45, [7, 12, 30]],
        [0.78, [14, 24, 52]],
        [0.995, [26, 40, 78]],
        [1, [30, 44, 82]],
      ],
      t,
    );
    c.fillRow(y, col, 1);
  }

  // Milky-way style band across the lower third, kept faint so characters read.
  for (let i = 0; i < 900; i++) {
    const x = rng.range(0, W);
    const base = 470 + Math.sin(x / 420) * 60;
    const y = base + rng.range(-46, 46) * rng.range(0.4, 1);
    c.disc(x, y, rng.range(1.5, 7), [150, 175, 230], rng.range(0.015, 0.05), 3);
  }

  nebula(c, rng, {
    y0: 40,
    y1: 420,
    blobs: 20,
    colors: [[60, 110, 210], [120, 80, 200], [190, 70, 140]],
    alpha: 0.05,
    rMin: 70,
    rMax: 170,
  });

  starfield(c, rng, { count: 1500, y0: 0, y1: 600, size: 1, alpha: 0.85 });
  starfield(c, rng, { count: 90, y0: 0, y1: 600, size: 1.8, alpha: 1 });

  // A distant sun, upper-left-ish; haze only, no hard disc.
  glowSpot(c, 300, 120, 70, [170, 205, 255], 0.28);
  glowSpot(c, 1490, 210, 50, [255, 205, 160], 0.2);

  return c;
}

// ---------------------------------------------------------------------------
// clouds slot (1920x231, drawn at frame row 10) - ionised nebula wisps
// ---------------------------------------------------------------------------
export function clouds(rng) {
  const c = new Canvas(W, 231, { wrap: true });
  nebula(c, rng, {
    y0: 20,
    y1: 190,
    blobs: 18,
    colors: [[80, 140, 240], [130, 110, 230], [110, 200, 255]],
    alpha: 0.07,
    rMin: 60,
    rMax: 150,
  });
  // wispy horizontal striations to suggest flowing gas
  for (let i = 0; i < 90; i++) {
    const x = rng.range(0, W);
    const y = rng.range(20, 205);
    const len = rng.range(60, 240);
    c.line(x, y, x + len, y + rng.range(-5, 5), rng.range(1.2, 4), [160, 195, 245], rng.range(0.02, 0.07));
  }
  starfield(c, rng, { count: 220, y0: 0, y1: 231, size: 1, alpha: 0.6 });
  return c;
}

// ---------------------------------------------------------------------------
// hills3 slot (1920x253, drawn at frame row 108) - a distant planet, high on screen
// ---------------------------------------------------------------------------
export function farPlanet(rng) {
  const c = new Canvas(W, 253, { wrap: true, cover: 0.9 });
  const cx = 700;
  const cy = 66;
  const r = 52;
  // limb glow
  for (let k = 0; k < 8; k++) {
    c.arc(cx, cy, r + 4 + k * 4.5, 3, 0, Math.PI * 2, [90, 150, 255], 0.1 / (1 + k * 0.45));
  }
  c.disc(cx, cy, r, [30, 40, 70], 1, 1.4);
  // terminator shading
  for (let y = cy - r - 1; y <= cy + r + 1; y++) {
    for (let x = cx - r - 1; x <= cx + r + 1; x++) {
      const dx = (x - cx) / r;
      const dy = (y - cy) / r;
      const d2 = dx * dx + dy * dy;
      if (d2 > 1) continue;
      const nz = Math.sqrt(1 - d2);
      const light = clamp(0.15 + 0.9 * nz * clamp(1 - dx * 1.15));
      c.blend(x, y, sampleStops([[0, [10, 15, 30]], [0.5, [50, 70, 118]], [1, [140, 175, 225]]], light), 0.9);
    }
  }
  // a few cloud bands
  for (let i = 0; i < 4; i++) {
    const yy = cy - r * 0.5 + i * r * 0.42;
    const half = Math.sqrt(Math.max(0, 1 - ((yy - cy) / r) ** 2)) * r * 0.92;
    c.line(cx - half, yy, cx + half * 0.7, yy + 2, 3.2, [190, 215, 255], 0.16);
  }
  // thin atmosphere on the lit side
  c.arc(cx, cy, r + 1.2, 3, Math.PI * 1.05, Math.PI * 1.6, [160, 220, 255], 0.45, 1.2);
  // a small moon
  c.disc(cx + 150, cy - 40, 11, [180, 190, 210], 0.85, 1.2);
  c.disc(cx + 150, cy - 40, 11, [40, 50, 70], 0, 1);
  starfield(c, rng, { count: 220, y0: 0, y1: 253, size: 1, alpha: 0.55 });
  return c;
}

// ---------------------------------------------------------------------------
// hills2 slot (1920x300, drawn at frame row 137) - orbital ring + two stations
// ---------------------------------------------------------------------------
export function stationRings(rng) {
  const c = new Canvas(W, 300, { wrap: true, cover: 0.88 });

  // One thin, wide orbital ellipse crossing the layer (drawn low-contrast).
  const cx = 980;
  const cy = 250;
  const rx = 760;
  const ry = 120;
  for (let a = 0; a < Math.PI * 2; a += 0.0025) {
    const x = cx + Math.cos(a) * rx;
    const y = cy + Math.sin(a) * ry;
    if (y < -20 || y > 299) continue;
    const lit = clamp(0.25 + 0.75 * Math.max(0, -Math.sin(a)));
    c.disc(x, y, 1.4, mix([70, 86, 120], [180, 210, 250], lit), 0.4, 0.9);
  }

  // Two compact stations instead of a skyline.
  const station = (sx, sy, s) => {
    c.rect(sx - 54 * s, sy, 108 * s, 9 * s, [52, 62, 88], 0.95);
    c.rect(sx - 54 * s, sy, 108 * s, 2.4, [120, 145, 190], 0.7);
    for (let i = 0; i < 4; i++) {
      const x = sx - 44 * s + i * 30 * s;
      const hh = (10 + ((i * 5) % 3) * 5) * s;
      c.rect(x, sy - hh, 18 * s, hh, [44, 54, 76], 0.95);
      if (i % 2 === 0) c.disc(x + 9 * s, sy - hh * 0.5, 2.2 * s, SPACE.cyan, 0.85, 1);
    }
    // solar wings
    for (const side of [-1, 1]) {
      c.rect(sx + side * 58 * s - (side > 0 ? 0 : 34 * s), sy - 4 * s, 34 * s, 30 * s, [32, 56, 92], 0.8);
      for (let k = 0; k < 3; k++) c.rect(sx + side * 58 * s - (side > 0 ? 0 : 34 * s), sy - 2 * s + k * 9 * s, 34 * s, 1.6, [74, 122, 180], 0.5);
    }
    c.disc(sx, sy + 4 * s, 3 * s, SPACE.amber, 0.8, 1.4);
  };
  station(420, 214, 1);
  station(1560, 232, 0.85);

  // A couple of tiny ships with engine trails.
  for (let i = 0; i < 3; i++) {
    const x = rng.range(200, W - 200);
    const y = rng.range(120, 210);
    c.poly([[x, y], [x + 9, y + 3], [x, y + 6]], [200, 215, 240], 0.75);
    c.line(x - 26, y + 3, x, y + 3, 2, SPACE.amber, 0.2);
  }
  starfield(c, rng, { count: 160, y0: 0, y1: 300, size: 1, alpha: 0.5 });
  return c;
}

// ---------------------------------------------------------------------------
// hills1 slot (1920x395, drawn at frame row 205) - asteroid field + rigs
// ---------------------------------------------------------------------------
export function asteroids(rng) {
  const c = new Canvas(W, 395, { wrap: true, cover: 0.95 });
  const rock = (x, y, r, seed) => {
    const rr = new Rng(seed);
    const pts = [];
    const n = rr.int(7, 10);
    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2;
      const rad = r * rr.range(0.76, 1.14);
      pts.push([x + Math.cos(a) * rad, y + Math.sin(a) * rad * 0.82]);
    }
    c.poly(pts, [34, 38, 52], 0.97);
    // lit rim (light from upper-left)
    for (let i = 0; i < n; i++) {
      const [x0, y0] = pts[i];
      const [x1, y1] = pts[(i + 1) % n];
      if ((y0 + y1) / 2 > y) continue;
      c.line(x0, y0, x1, y1, 1.6, [96, 108, 136], 0.6);
    }
    // craters
    for (let i = 0; i < rr.int(1, 3); i++) {
      const a = rr.range(0, Math.PI * 2);
      const d = rr.range(0, r * 0.5);
      c.disc(x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8, r * rr.range(0.08, 0.2), [22, 26, 38], 0.7, 1);
    }
  };

  // The band must reach the bottom of this canvas so it connects to the ground.
  for (let i = 0; i < 34; i++) {
    const x = rng.range(0, W);
    const y = rng.range(215, 400);
    rock(x, y, rng.range(14, 46), 1000 + i);
  }
  // mining rig silhouettes
  for (let i = 0; i < 4; i++) {
    const x = rng.range(60, W - 60);
    const y = rng.range(250, 300);
    c.poly([[x - 40, y], [x + 40, y], [x + 26, y - 54], [x - 26, y - 54]], [40, 46, 64], 0.95);
    c.rect(x - 5, y - 96, 10, 44, [46, 52, 72], 0.95);
    c.disc(x, y - 100, 4, SPACE.amber, 0.9, 1.4);
    c.disc(x, y - 100, 9, SPACE.amber, 0.18, 6);
    for (let k = 0; k < 3; k++) c.rect(x - 34 + k * 24, y - 30, 16, 30, [34, 40, 56], 0.9);
  }
  // a broad shelf so the far distance does not look floaty
  c.rect(0, 372, W, 23, [26, 30, 44], 0.55);
  starfield(c, rng, { count: 120, y0: 205, y1: 395, size: 1, alpha: 0.4 });
  return c;
}

// ---------------------------------------------------------------------------
// trees slot (1920x419, drawn at frame row 75) - hulks, gantries, arrays
// ---------------------------------------------------------------------------
export function hulks(rng) {
  const c = new Canvas(W, 419, { wrap: true });

  // Broken hull sections: a few plates, never one big dome, so the layer reads as
  // debris behind the action instead of a wall in front of it.
  const wreck = (x, y, s, seed) => {
    const rr = new Rng(seed);
    const w = 170 * s;
    const h = 44 * s;
    c.poly(
      [
        [x - w / 2, y],
        [x + w / 2, y - 6 * s],
        [x + w * 0.36, y - h],
        [x - w * 0.42, y - h * 0.8],
      ],
      [36, 42, 58],
      0.95,
    );
    // torn edge
    for (let i = 0; i < 4; i++) {
      const tx = x - w * 0.42 + i * (w * 0.24);
      c.poly([[tx, y - h * 0.7], [tx + 14 * s, y - h * 0.7 - rr.range(6, 18) * s], [tx + 26 * s, y - h * 0.6]], [30, 35, 50], 0.9);
    }
    // window strips
    for (let i = 0; i < 7; i++) {
      const wx = x - w * 0.34 + i * (w * 0.1);
      if (rr.chance(0.4)) continue;
      c.rect(wx, y - h * 0.55, 7 * s, 3.4 * s, SPACE.cyan, rr.range(0.45, 0.9));
    }
    // a single surviving nacelle with a dim engine
    c.rect(x + w * 0.3, y - h * 0.5, 12 * s, 22 * s, [44, 50, 68], 0.95);
    c.disc(x + w * 0.3 + 6 * s, y - h * 0.1, 5 * s, SPACE.amber, 0.55, 1.6);
    c.disc(x + w * 0.3 + 6 * s, y - h * 0.1, 15 * s, SPACE.amber, 0.1, 10);
  };

  wreck(300, 268, 1.15, 7);
  wreck(690, 236, 0.85, 19);
  wreck(1240, 258, 1.0, 33);
  wreck(1720, 240, 0.75, 41);

  // gantry: a thin truss with a crane arm, the tallest element in the layer
  const gantry = (x, baseY, hh) => {
    for (let y = baseY; y > baseY - hh; y -= 14) {
      c.line(x - 8, y, x + 8, y - 14, 2.2, [62, 72, 94], 0.85);
      c.line(x + 8, y, x - 8, y - 14, 2.2, [62, 72, 94], 0.85);
    }
    c.rect(x - 10, baseY - hh, 20, 7, [80, 92, 118], 0.9);
    c.line(x, baseY - hh + 3, x + 128, baseY - hh - 30, 4.5, [74, 86, 110], 0.85);
    c.disc(x + 128, baseY - hh - 30, 4, SPACE.amber, 0.8, 1.4);
    c.disc(x + 128, baseY - hh - 30, 11, SPACE.amber, 0.1, 8);
    c.line(x + 8, baseY, x + 8, baseY + 20, 3, [58, 66, 86], 0.8);
    c.line(x - 8, baseY, x - 8, baseY + 20, 3, [58, 66, 86], 0.8);
  };
  gantry(520, 386, 210);
  gantry(1450, 372, 160);

  // solar panel array, low and wide
  for (let i = 0; i < 6; i++) {
    const x = 980 + i * 30;
    c.rect(x, 336, 24, 48, [30, 48, 82], 0.85);
    for (let k = 0; k < 4; k++) c.rect(x, 338 + k * 11, 24, 2, [74, 120, 178], 0.5);
    c.line(x + 12, 384, x + 12, 398, 2.2, [58, 68, 90], 0.85);
  }

  // ground shelf so this layer meets the terrain below it
  c.rect(0, 394, W, 25, [26, 31, 45], 0.55);
  starfield(c, rng, { count: 70, y0: 75, y1: 419, size: 1, alpha: 0.3 });
  return c;
}

// ---------------------------------------------------------------------------
// grass slot (1920x170, drawn at frame row 430) - GROUND. Horizon at row 70.
// ---------------------------------------------------------------------------
export function ground(rng, palette = 'moon') {
  const c = new Canvas(W, 170, { wrap: true });
  const HORIZON = 70;

  const rock = palette === 'moon' ? [86, 92, 112] : [86, 58, 52];
  const rockDark = palette === 'moon' ? [34, 38, 54] : [42, 26, 26];
  const rockLit = palette === 'moon' ? [150, 160, 186] : [158, 104, 88];
  const deck = palette === 'moon' ? [58, 66, 86] : [64, 48, 46];
  const deckDark = palette === 'moon' ? [26, 30, 44] : [30, 22, 24];
  const seam = palette === 'moon' ? [120, 200, 255] : [255, 150, 90];

  // --- the walkable deck: fills everything below the horizon -----------------
  c.rect(0, HORIZON, W, 170 - HORIZON, rockDark, 1);
  // deck surface plates
  const PLATE = 82;
  for (let i = 0; i < Math.ceil(W / PLATE); i++) {
    const x = i * PLATE + 10;
    c.rect(x, HORIZON + 2, 74, 30, deck, 0.9);
    c.rect(x, HORIZON + 2, 74, 2.5, rockLit, 0.45);
    c.rect(x, HORIZON + 30, 74, 2, deckDark, 0.6);
  }
  // expansion seams with a faint light strip (keeps the dark ground readable)
  for (let i = 0; i < Math.ceil(W / PLATE) + 1; i++) {
    const x = i * PLATE;
    c.rect(x, HORIZON + 2, 3, 168 - HORIZON, [18, 22, 34], 0.7);
    c.rect(x + 1, HORIZON + 4, 1, 160 - HORIZON, seam, 0.22);
  }
  // deeper rock below the deck edge, with strata
  for (let i = 0; i < 60; i++) {
    const x = rng.range(0, W);
    const y = rng.range(HORIZON + 34, 170);
    const w = rng.range(30, 120);
    c.rect(x, y, w, rng.range(3, 9), mix(rockDark, rock, rng.range(0.1, 0.5)), rng.range(0.25, 0.6));
  }
  // horizon highlight: the single most important line in the whole project
  c.rect(0, HORIZON - 1, W, 2, rockLit, 0.75);
  c.rect(0, HORIZON + 1, W, 1, [12, 15, 24], 0.9);

  // --- surface details above the horizon, kept low ---------------------------
  // small rocks and antennae silhouettes, none taller than ~26 px
  for (let i = 0; i < 46; i++) {
    const x = rng.range(0, W);
    const h = rng.range(4, 16);
    const w = rng.range(10, 34);
    c.poly(
      [
        [x - w / 2, HORIZON + 1],
        [x + w / 2, HORIZON + 1],
        [x + w * 0.3, HORIZON + 1 - h],
        [x - w * 0.35, HORIZON + 1 - h * 0.8],
      ],
      mix(rockDark, rock, rng.range(0.3, 0.8)),
      0.95,
    );
  }
  // deck lights along the seam, small so they do not compete with the characters
  for (let x = 41; x < W; x += 164) {
    c.disc(x, HORIZON + 8, 2.6, seam, 0.85, 1.4);
    c.disc(x, HORIZON + 8, 8, seam, 0.16, 6);
  }
  // low guard rail: 3 px tall, definitely not covering the character's legs
  for (let x = 0; x < W; x += 20) {
    c.rect(x, HORIZON - 6, 3, 7, [70, 80, 104], 0.55);
  }
  c.rect(0, HORIZON - 7, W, 2, [96, 110, 140], 0.5);

  starfield(c, rng, { count: 40, y0: 0, y1: HORIZON - 2, size: 1, alpha: 0.3 });
  return c;
}

// ---------------------------------------------------------------------------
// item slot (1743x105, drawn at frame row 495, IN FRONT of the characters)
// ---------------------------------------------------------------------------
export function foreground(rng) {
  const c = new Canvas(1743, 105, { wrap: true });
  // Low crates / pipes / rubble only. Max height ~34 px so the archer's legs
  // (feet at the bottom of this band) stay visible.
  for (let i = 0; i < 26; i++) {
    const x = rng.range(0, c.w);
    const h = rng.range(8, 30);
    const w = rng.range(26, 70);
    const kind = rng.next();
    if (kind < 0.4) {
      // crate
      c.rect(x, 105 - h, w, h, [46, 54, 74], 0.95);
      c.rect(x, 105 - h, w, 3, [110, 132, 170], 0.6);
      c.rect(x + 6, 105 - h + 6, w - 12, 2, [26, 32, 46], 0.7);
    } else if (kind < 0.72) {
      // pipe run
      c.line(x, 105 - h * 0.5, x + w, 105 - h * 0.5, h * 0.42, [56, 66, 90], 0.95);
      c.line(x, 105 - h * 0.5 - h * 0.14, x + w, 105 - h * 0.5 - h * 0.14, 2.4, [124, 148, 190], 0.5);
    } else {
      // rubble
      c.poly(
        [
          [x, 105],
          [x + w, 105],
          [x + w * 0.7, 105 - h],
          [x + w * 0.25, 105 - h * 0.7],
        ],
        [38, 44, 62],
        0.95,
      );
    }
  }
  // a soft dark base so the strip reads as a solid foreground edge
  c.rect(0, 96, c.w, 9, [22, 26, 38], 0.9);
  return c;
}

// ---------------------------------------------------------------------------
// Optional second biome (BG2) - same geometry, molten palette
// ---------------------------------------------------------------------------
export function biome2(kind, rng) {
  const c =
    kind === 'sky'
      ? sky(rng)
      : kind === 'clouds'
        ? clouds(rng)
        : kind === 'hills3'
          ? farPlanet(rng)
          : kind === 'hills2'
            ? stationRings(rng)
            : kind === 'hills1'
              ? asteroids(rng)
              : kind === 'trees'
                ? hulks(rng)
                : kind === 'grass'
                  ? ground(rng, 'lava')
                  : foreground(rng);
  if (kind === 'sky') {
    // shift the whole wash warm
    c.tintAll([120, 40, 30], 0.35);
  } else if (kind === 'grass') {
    c.tintAll([200, 70, 30], 0.3);
  } else {
    c.tintAll([255, 120, 80], 0.22);
  }
  return c;
}

export { W as BG_WIDTH, GROUND as BG_GROUND_ROW };
