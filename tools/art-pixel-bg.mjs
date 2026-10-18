/**
 * Pixel-art background: eight parallax bands that stack into one deep-space
 * vista, plus the molten BG2 variant.
 *
 * Geometry is fixed by `src/content/art.ts` and must not drift:
 *   BG1_6grass  is cropped at frame row 430, so the walkable line (frame row
 *               500) is row 70 of that PNG. We use a 5px cell there, putting
 *               the deck's top edge on cell row 14 exactly.
 *   BG1_7item   is cropped at row 495 => ground is its row 5 (cell row 1).
 *   BG1_0sky    is the full 600-row frame => ground is cell row 125 of 150.
 * Every 1920-wide band tiles three times, so all drawing is horizontally
 * wrapped and pattern periods divide the cell width.
 */
import { Px } from './pixel-core.mjs';

/** Palette roles per biome. */
const SPACE_TONE = {
  skyTop: 'void',
  skyMid: 'space',
  skyLow: 'deep',
  skyHaze: 'indigo',
  glow: 'cyan',
  star: ['white', 'ice', 'steel3', 'cyan'],
  nebula: ['plum', 'violet', 'indigo2', 'teal'],
  cloud: ['indigo2', 'violet', 'plum', 'teal'],
  farBody: 'indigo',
  farRim: 'cyan2',
  farDark: 'deep',
  midBody: 'indigo',
  midRim: 'steel2',
  midLight: 'cyan',
  nearBody: 'deep',
  nearRim: 'steel2',
  nearLight: 'cyan2',
  hulkBody: 'indigo2',
  hulkRim: 'steel',
  hulkDark: 'indigo',
  hulkLight: 'cyan',
  deckTop: 'steel3',
  deckBody: 'steel2',
  deckDark: 'deep',
  deckGap: 'void',
  deckLight: 'cyan',
  deckWarn: 'amber',
  fgBody: 'steel2',
  fgDark: 'shadow',
  fgLight: 'cyan',
};

/** BG2: a molten forge world. Same silhouettes, different light. */
const MOLTEN_TONE = {
  ...SPACE_TONE,
  skyTop: 'void',
  skyMid: 'plum',
  skyLow: 'rust',
  skyHaze: 'orange',
  glow: 'amber',
  star: ['amber', 'ice', 'white', 'orange'],
  nebula: ['rust', 'orange', 'plum', 'gold'],
  cloud: ['rust', 'orange', 'plum', 'gold'],
  farBody: 'plum',
  farRim: 'orange',
  farDark: 'space',
  midBody: 'deep',
  midRim: 'rust',
  midLight: 'amber',
  nearBody: 'space',
  nearRim: 'rust',
  nearLight: 'gold',
  hulkBody: 'plum',
  hulkRim: 'rust',
  hulkDark: 'deep',
  hulkLight: 'gold',
  deckTop: 'rust',
  deckBody: 'plum',
  deckDark: 'space',
  deckGap: 'void',
  deckLight: 'amber',
  deckWarn: 'gold',
  fgBody: 'plum',
  fgDark: 'shadow',
  fgLight: 'amber',
};

// -------------------------------------------------------------------- helpers

/** Irregular rock silhouette: body + lit top-left rim + dark underside. */
function rock(c, cx, cy, r, rng, tone, scaleY = 1) {
  const pts = [];
  const n = Math.max(6, Math.round(r * 1.1));
  const seed = rng.next() * Math.PI * 2;
  for (let i = 0; i < n; i++) {
    const a = seed + (i / n) * Math.PI * 2;
    const rr = r * (0.62 + rng.next() * 0.5);
    pts.push([cx + Math.cos(a) * rr, cy + Math.sin(a) * rr * scaleY]);
  }
  c.poly(pts, tone.farBody);
  // Lit rim: the top-left arc gets a brighter line.
  for (let i = 0; i < pts.length; i++) {
    const [x0, y0] = pts[i];
    const [x1, y1] = pts[(i + 1) % pts.length];
    if (y0 > cy || x0 < cx) continue;
    c.line(x0, y0, x1, y1, tone.farRim, 1);
  }
  // A couple of craters.
  if (r > 5) {
    c.disc(cx - r * 0.25, cy + r * 0.15, Math.max(1, r * 0.16), tone.farDark);
  }
  return pts;
}

/** Stippled nebula cloud: per-cell density falls off from the centre. */
function nebula(c, rng, cx, cy, rx, ry, colors, density, power = 1.6) {
  for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
    for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = Math.hypot(dx, dy);
      if (d >= 1) continue;
      const p = density * Math.pow(1 - d, power);
      if (rng.next() < p) c.set(x, y, rng.pick(colors), 0.55 + rng.next() * 0.35);
    }
  }
}

/** Galaxy band: distance-to-segment stipple, dense core, sparse fringe. */
function band(c, rng, x0, y0, x1, y1, halfWidth, colors, density) {
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len2 = dx * dx + dy * dy;
  const xa = Math.floor(Math.min(x0, x1) - halfWidth);
  const xb = Math.ceil(Math.max(x0, x1) + halfWidth);
  const ya = Math.floor(Math.min(y0, y1) - halfWidth);
  const yb = Math.ceil(Math.max(y0, y1) + halfWidth);
  for (let y = ya; y <= yb; y++) {
    for (let x = xa; x <= xb; x++) {
      const t = Math.max(0, Math.min(1, ((x - x0) * dx + (y - y0) * dy) / len2));
      const d = Math.hypot(x - (x0 + dx * t), y - (y0 + dy * t));
      if (d > halfWidth) continue;
      const p = density * Math.pow(1 - d / halfWidth, 2.2);
      if (rng.next() < p) c.set(x, y, rng.pick(colors), 0.35 + rng.next() * 0.5);
    }
  }
}

/** Star field with three size classes. `maxRow` keeps stars out of the deck. */
function starfield(c, rng, count, maxRow, tone) {
  for (let i = 0; i < count; i++) {
    const x = Math.floor(rng.next() * c.cols);
    const y = Math.floor(rng.next() * maxRow);
    const bright = rng.next();
    if (bright > 0.978) {
      // Hero star: 4-point flare.
      const s = rng.int(2, 3);
      c.set(x, y, 'white');
      for (let k = 1; k <= s; k++) {
        const a = 0.7 - k * 0.16;
        c.set(x + k, y, tone.star[2], a);
        c.set(x - k, y, tone.star[2], a);
        c.set(x, y + k, tone.star[2], a);
        c.set(x, y - k, tone.star[2], a);
      }
    } else if (bright > 0.86) {
      // Mid star: plus shape.
      c.set(x, y, 'white');
      c.set(x + 1, y, tone.star[1], 0.7);
      c.set(x, y + 1, tone.star[1], 0.5);
    } else {
      c.set(x, y, rng.pick(tone.star), 0.3 + bright * 0.7);
    }
  }
}

// ------------------------------------------------------------------------ sky

export function sky(rng, molten = false) {
  const tone = molten ? MOLTEN_TONE : SPACE_TONE;
  // 1920x600 at 4px cells => 480x150, ground line = row 125.
  const c = new Px(1920, 600, 480, 150, { wrap: true });

  const stops = molten
    ? [[0, 'void'], [0.22, 'space'], [0.48, 'plum'], [0.74, 'rust'], [0.9, 'orange'], [1, 'gold']]
    : [[0, 'void'], [0.24, 'space'], [0.55, 'deep'], [0.82, 'indigo'], [0.94, 'indigo2'], [1, 'teal']];
  c.vgrad(0, 0, 480, 126, stops);

  // Deep clouds, largest and faintest first.
  nebula(c, rng, 90, 70, 130, 46, tone.nebula, 0.16);
  nebula(c, rng, 300, 58, 150, 38, tone.nebula, 0.14);
  nebula(c, rng, 420, 92, 110, 34, tone.nebula, 0.13);
  nebula(c, rng, 200, 108, 170, 26, tone.nebula, 0.1);

  // Galaxy band across the lower third (behind the characters, low contrast).
  band(c, rng, -30, 122, 500, 68, 26, ['ice', 'violet', 'plum', 'steel3'], 0.11);

  starfield(c, rng, 950, 124, tone);

  // Horizon glow above the deck.
  for (let y = 116; y < 126; y++) {
    const t = (y - 116) / 9;
    for (let x = 0; x < 480; x++) {
      if (rng.next() < 0.05 + t * 0.16) c.set(x, y, tone.glow, 0.12 + t * 0.2);
    }
  }
  // Make sure the sky is fully opaque: no holes where the deck would show through.
  for (let i = 0; i < c.cols * c.rows; i++) if (c.a[i] <= 0) c.a[i] = 1;
  return c;
}

// --------------------------------------------------------------------- clouds

export function clouds(rng, molten = false) {
  const tone = molten ? MOLTEN_TONE : SPACE_TONE;
  // 1920x231 at 4px => 480x58.
  const c = new Px(1920, 231, 480, 58, { wrap: true });
  for (let k = 0; k < 9; k++) {
    const cx = rng.next() * 480;
    const cy = 12 + rng.next() * 34;
    const rx = 40 + rng.next() * 90;
    const ry = 5 + rng.next() * 9;
    nebula(c, rng, cx, cy, rx, ry, tone.cloud, 0.3, 2.2);
    // Filaments inside the wisp.
    for (let i = 0; i < 18; i++) {
      const x = cx + (rng.next() - 0.5) * rx * 1.6;
      const y = cy + (rng.next() - 0.5) * ry * 1.4;
      c.set(x, y, tone.glow, 0.18 + rng.next() * 0.25);
    }
  }
  return c;
}

// ------------------------------------------------------------ distant planet

export function farPlanet(rng, molten = false) {
  const tone = molten ? MOLTEN_TONE : SPACE_TONE;
  // 1920x253 at 4px => 480x63.
  const c = new Px(1920, 253, 480, 63, { wrap: true });

  // A readable sphere, not a horizon: at this band's height a giant limb reads
  // as a hill range, which is exactly what the previous version looked like.
  const px = 316;
  const py = 27;
  const r = 21;

  c.disc(px, py, r, tone.farBody);
  // Dithered terminator: light from the upper left.
  for (let y = 0; y < c.rows; y++) {
    for (let x = 0; x < c.cols; x++) {
      const dx = x - px;
      const dy = y - py;
      if (dx * dx + dy * dy > r * r) continue;
      const lit = (-dx - dy) / (r * 1.5);
      if (lit > 0.1 && rng.next() < Math.min(1, lit)) c.set(x, y, tone.farRim, 0.18 + lit * 0.25);
      if (lit < -0.25) c.set(x, y, tone.farDark, 0.35);
    }
  }
  // Rim light along the sunward limb.
  for (let a = -2.5; a < -0.9; a += 0.02) {
    c.set(px + Math.cos(a) * (r - 0.5), py + Math.sin(a) * (r - 0.5), tone.farRim, 0.95);
    c.set(px + Math.cos(a) * (r - 1.5), py + Math.sin(a) * (r - 1.5), tone.farRim, 0.35);
  }
  // Bands.
  for (let k = -1; k <= 1; k++) {
    for (let a = -0.6; a < 0.6; a += 0.02) {
      const x = px + Math.cos(a) * r * 0.95;
      const y = py + k * r * 0.32 + Math.sin(a) * r * 0.16;
      c.set(x, y, tone.farDark, 0.22);
    }
  }

  // Flat ring, crossing the disc.
  for (let a = 0; a < Math.PI * 2; a += 0.008) {
    const x = px + Math.cos(a) * r * 1.75;
    const y = py + 2 + Math.sin(a) * r * 0.46;
    c.set(x, y, tone.farRim, a > Math.PI ? 0.5 : 0.9);
    c.set(x, y + 1, tone.farRim, 0.25);
  }

  // Two small moons, well away from the planet.
  c.disc(96, 18, 8, tone.farDark);
  c.disc(95, 17, 7.5, tone.farBody);
  c.set(92, 14, tone.farRim);
  c.set(97, 16, tone.farRim, 0.4);
  c.disc(432, 40, 4, tone.farBody);
  c.set(431, 39, tone.farRim, 0.6);

  // Sparse stars behind the planet (this layer scrolls slower than the sky).
  for (let i = 0; i < 40; i++) {
    c.set(rng.next() * 480, rng.next() * 62, rng.pick(tone.star), 0.3 + rng.next() * 0.5);
  }
  return c;
}

// ------------------------------------------------------------------- station

export function station(rng, molten = false) {
  const tone = molten ? MOLTEN_TONE : SPACE_TONE;
  // 1920x300 at 4px => 480x75.
  const c = new Px(1920, 300, 480, 75, { wrap: true });

  /** Lit top edge + dark body, the read for every silhouette here. */
  const slab = (x, y, w, h, body = tone.midBody) => {
    c.rect(x, y, w, h, body);
    c.hline(x, x + w - 1, y, tone.midRim, 0.85);
    c.hline(x, x + w - 1, y + h - 1, 'shadow', 0.4);
  };

  // ---- cluster A: habitat ring + dock, left
  const ax = 92;
  const ay = 40;
  c.ring(ax, ay, 17, 2.2, tone.midBody);
  c.ring(ax, ay, 17, 1, tone.midRim, 0.5);
  c.disc(ax, ay, 4, tone.midBody);
  c.set(ax, ay - 1, tone.midLight);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    c.line(ax + Math.cos(a) * 4, ay + Math.sin(a) * 4, ax + Math.cos(a) * 17, ay + Math.sin(a) * 17, tone.midBody, 1, 0.75);
  }
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2;
    c.set(ax + Math.cos(a) * 17, ay + Math.sin(a) * 17, tone.midLight, 0.8);
  }
  // dock arm down to the band's bottom
  slab(ax + 16, ay + 6, 16, 3);
  c.vline(ax + 30, ay + 9, 73, tone.midBody, 1);
  c.rect(ax + 24, 66, 14, 8, tone.midBody);
  c.hline(ax + 24, ax + 37, 66, tone.midRim, 0.7);
  for (let x = ax + 26; x < ax + 37; x += 4) c.set(x, 69, tone.midLight, 0.8);

  // ---- cluster B: solar array on a truss, centre-right
  const bx = 236;
  slab(bx, 46, 62, 3);
  for (let x = bx; x < bx + 62; x += 9) {
    c.line(x, 47, x + 4, 42, tone.midRim, 1, 0.7);
    c.line(x + 4, 42, x + 9, 47, tone.midRim, 1, 0.4);
  }
  for (const [px, pw] of [[bx + 4, 22], [bx + 32, 26]]) {
    c.rect(px, 30, pw, 13, tone.midBody);
    for (let x = px + 2; x < px + pw - 1; x += 4) c.vline(x, 31, 41, tone.midRim, 0.4);
    for (let y = 34; y < 41; y += 4) c.hline(px + 1, px + pw - 2, y, tone.midRim, 0.28);
    c.rect(px - 1, 29, pw + 2, 1, tone.midRim, 0.85);
    c.vline(px + pw / 2, 43, 46, tone.midRim, 0.7);
  }

  // ---- cluster C: command tower, right
  const tx = 372;
  slab(tx, 34, 26, 26);
  slab(tx + 6, 22, 4, 12);
  c.rect(tx - 4, 30, 34, 3, tone.midBody);
  c.hline(tx - 4, tx + 29, 30, tone.midRim, 0.8);
  for (let y = 37; y < 57; y += 5) {
    c.rect(tx + 3, y, 2, 2, tone.midLight, 0.85);
    c.rect(tx + 15, y, 2, 2, tone.midLight, 0.5);
  }
  c.vline(tx + 8, 12, 22, tone.midBody);
  c.set(tx + 8, 11, 'red');

  // ---- a shuttle crossing between the clusters
  c.poly([[168, 30], [184, 27], [192, 31], [184, 34], [168, 33]], tone.midBody);
  c.hline(170, 182, 27, tone.midRim, 0.7);
  c.set(170, 31, tone.midLight);

  // Nav lights.
  for (const x of [40, 140, 206, 300, 344, 420, 452]) {
    c.set(x, 72, tone.midLight, 0.9);
    c.set(x, 73, tone.midLight, 0.25);
  }
  return c;
}

// ------------------------------------------------------------------ asteroids

export function asteroids(rng, molten = false) {
  const tone = molten ? MOLTEN_TONE : SPACE_TONE;
  // 1920x395 at 4px => 480x99.
  const c = new Px(1920, 395, 480, 99, { wrap: true });

  // Far cluster.
  for (let i = 0; i < 9; i++) {
    const x = rng.next() * 480;
    const y = 14 + rng.next() * 40;
    const r = 4 + rng.next() * 7;
    c.disc(x, y, r, tone.nearBody, 0.55);
  }
  // Near cluster.
  for (let i = 0; i < 7; i++) {
    const x = rng.next() * 480;
    const y = 48 + rng.next() * 26;
    const r = 7 + rng.next() * 12;
    rock(c, x, y, r, rng, tone, 0.8);
  }
  // Mining platform: legs down to the band's bottom (it meets the deck).
  const px = 150;
  c.rect(px - 26, 76, 58, 4, tone.midBody);
  c.hline(px - 26, px + 31, 76, tone.midRim, 0.9);
  for (let x = px - 22; x < px + 30; x += 10) {
    c.line(x, 80, x - 4, 98, tone.midBody, 2);
    c.line(x, 80, x - 4, 98, tone.midRim, 1, 0.28);
  }
  // Derrick + warning beacon.
  c.line(px + 10, 76, px + 22, 52, tone.midBody, 1);
  c.line(px + 22, 52, px + 30, 76, tone.midBody, 1);
  c.hline(px + 16, px + 26, 64, tone.midBody);
  c.set(px + 22, 50, 'amber');
  c.set(px + 22, 51, 'amber', 0.4);
  // Lit windows on the platform.
  for (let x = px - 18; x < px + 28; x += 7) c.set(x, 78, tone.nearLight, 0.85);
  return c;
}

// ---------------------------------------------------------------------- hulks

export function hulks(rng, molten = false) {
  const tone = molten ? MOLTEN_TONE : SPACE_TONE;
  // 1920x419 at 4px => 480x105.
  const c = new Px(1920, 419, 480, 105, { wrap: true });
  const body = molten ? 'plum' : 'deep';
  const rim = molten ? 'rust' : 'indigo2';
  const lit = molten ? 'gold' : 'cyan';

  // ---- fore section of the wreck: intact bow, torn stern
  c.poly([[40, 88], [48, 68], [82, 58], [116, 62], [124, 88]], body);
  c.line(48, 68, 82, 58, rim, 1, 0.9);
  c.line(82, 58, 116, 62, rim, 1, 0.6);
  c.line(40, 88, 124, 88, 'shadow', 1, 0.6);
  // deck stripe + windows
  c.hline(52, 112, 72, rim, 0.5);
  for (let x = 52; x < 112; x += 6) c.set(x, 76, lit, 0.55);
  for (let x = 55; x < 110; x += 9) c.set(x, 80, lit, 0.25);
  // torn edge at the stern: ribs
  for (let x = 108; x < 126; x += 4) {
    c.line(x, 66, x + 3, 88, 'shadow', 1, 0.85);
    c.set(x, 65, rim, 0.4);
  }

  // ---- aft section, adrift and tilted
  c.poly([[150, 90], [158, 72], [196, 66], [216, 74], [218, 90]], body);
  c.line(158, 72, 196, 66, rim, 1, 0.7);
  for (let x = 162; x < 196; x += 7) c.set(x, 82, lit, 0.35);
  // exposed spine between the halves
  c.line(126, 78, 150, 76, rim, 1, 0.45);
  c.line(132, 84, 148, 82, rim, 1, 0.3);

  // engine block + nozzles
  c.rect(198, 84, 20, 8, body);
  for (const x of [202, 210, 218]) {
    c.disc(x, 92, 2.5, 'shadow');
    c.set(x, 92, lit, 0.35);
  }

  // ---- solar wing behind the fore section, angled up
  c.poly([[66, 62], [86, 30], [136, 34], [116, 62]], 'indigo');
  for (let x = 72; x < 134; x += 5) {
    const y = 62 - ((x - 66) / 70) * 28;
    c.line(x, y, x + 2, y - 4, rim, 1, 0.3);
  }
  c.line(86, 30, 136, 34, rim, 1, 0.5);

  // gantry mast + containers on the bow
  c.line(52, 58, 48, 22, rim, 1, 0.5);
  c.line(48, 22, 40, 30, rim, 1, 0.5);
  c.line(48, 22, 56, 30, rim, 1, 0.5);
  c.set(48, 20, 'red', 0.85);
  for (const x of [30, 40]) {
    c.rect(x, 80, 8, 6, body);
    c.hline(x, x + 7, 80, rim, 0.4);
  }

  // ---- scattered debris between the halves
  for (const [x, y, r] of [[136, 60, 2], [142, 52, 1], [130, 48, 1], [222, 60, 2], [228, 52, 1]]) {
    c.disc(x, y, r, body);
    c.set(x, y - r, rim, 0.5);
  }

  // ---- distant relay spire, upper right
  c.vline(318, 24, 40, rim, 0.35);
  c.line(300, 40, 318, 30, rim, 1, 0.35);
  c.line(318, 30, 336, 40, rim, 1, 0.35);
  c.rect(312, 38, 13, 3, rim, 0.35);
  c.set(318, 22, 'red', 0.6);

  return c;
}

// ---------------------------------------------------------------------- deck

export function ground(rng, molten = false) {
  const tone = molten ? MOLTEN_TONE : SPACE_TONE;
  // 1920x170 at 5px => 384x34. Ground line (frame 500) = row 14.
  const c = new Px(1920, 170, 384, 34, { wrap: true });
  const TOP = 14;

  // Rows 0..13 stay transparent (above the walkable line).
  // Top edge: one bright cell, then plate rows that fall away into shadow.
  c.rect(0, TOP, 384, 1, tone.deckTop);
  c.rect(0, TOP + 1, 384, 1, tone.deckBody);
  c.rect(0, TOP + 2, 384, 3, 'indigo2');

  // Panel seams every 24 cells (divides 384 -> seamless).
  for (let x = 0; x < 384; x += 24) {
    c.vline(x, TOP + 1, 33, 'shadow', 0.55);
    c.vline(x + 1, TOP + 1, 33, tone.deckTop, 0.25);
  }
  // Hazard chevrons: only on every second panel, so the lip is not a solid stripe.
  for (let x = 0; x < 384; x += 48) {
    for (let k = 0; k < 5; k++) {
      c.hline(x + k * 8, x + k * 8 + 3, TOP + 2, tone.deckWarn, 0.6);
    }
  }
  // Rivets at panel joins.
  for (let x = 3; x < 384; x += 24) {
    c.set(x, TOP + 3, tone.deckTop, 0.8);
    c.set(x + 12, TOP + 4, tone.deckTop, 0.45);
  }
  // Body: lit plate row, then an ordered-dither falloff into the dark.
  c.rect(0, TOP + 5, 384, 3, 'indigo');
  c.dither(0, TOP + 5, 384, 3, 'indigo', tone.deckDark, 'y');
  c.dither(0, TOP + 8, 384, 12, tone.deckDark, 'space', 'y');
  // Recessed light strips (cyan), staggered.
  for (let x = 10; x < 384; x += 48) {
    c.hline(x, x + 9, 23, tone.deckLight, 0.85);
    c.hline(x, x + 9, 24, tone.deckLight, 0.25);
  }
  // Grate slots.
  for (let x = 28; x < 384; x += 48) {
    for (let y = 27; y < 32; y += 2) c.hline(x, x + 12, y, tone.deckGap, 0.7);
  }
  // Occasional raised hatch.
  for (const x of [72, 216, 312]) {
    c.rect(x, 19, 12, 10, 'indigo');
    c.hline(x, x + 11, 19, tone.deckTop, 0.9);
    c.rect(x + 2, 21, 8, 6, 'space', 0.9);
    c.vline(x + 1, 20, 28, tone.deckTop, 0.35);
    c.set(x + 5, 22, tone.deckLight, 0.6);
  }
  return c;
}

// ---------------------------------------------------------------- foreground

export function foreground(rng, molten = false) {
  const tone = molten ? MOLTEN_TONE : SPACE_TONE;
  // 1743x105 at ~5px => 349x21. Ground is row 1; keep decoration below the feet.
  const c = new Px(1743, 105, 349, 21, { wrap: true });

  // Low cable run hugging the deck.
  c.line(0, 18, 348, 18, tone.fgBody, 1);
  for (let x = 0; x < 349; x += 16) {
    c.line(x, 18, x + 8, 20, tone.fgDark, 1, 0.9);
    c.line(x + 8, 20, x + 16, 18, tone.fgDark, 1, 0.9);
  }
  // A few crates / bollards, never taller than ~4 cells above the deck line.
  for (const x of [40, 120, 208, 286]) {
    const h = 3 + Math.floor(rng.next() * 2);
    c.rect(x, 21 - h, 7, h, tone.fgBody);
    c.hline(x, x + 6, 21 - h, tone.fgLight, 0.85);
    c.vline(x + 6, 21 - h, 20, tone.fgDark, 0.9);
    c.set(x + 2, 21 - h + 1, 'amber', 0.9);
  }
  // Scattered debris.
  for (let i = 0; i < 26; i++) {
    const x = Math.floor(rng.next() * 349);
    c.set(x, 19 + Math.floor(rng.next() * 2), tone.fgBody, 0.8);
  }
  return c;
}

// --------------------------------------------------------------- BG2 wrapper

export function biome2(kind, rng) {
  switch (kind) {
    case 'sky': return sky(rng, true);
    case 'clouds': return clouds(rng, true);
    case 'hills3': return farPlanet(rng, true);
    case 'hills2': return station(rng, true);
    case 'hills1': return asteroids(rng, true);
    case 'trees': return hulks(rng, true);
    case 'grass': return ground(rng, true);
    case 'item': return foreground(rng, true);
    default: throw new Error(`unknown bg kind ${kind}`);
  }
}
