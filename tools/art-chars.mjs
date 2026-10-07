/**
 * Space-reskin sprites: the archer, the five monster families (+ their Guardian
 * variants), the portal, the King and the three pets.
 *
 * Contract (see 美术资源替换规格书.md §4):
 *  - feet on the BOTTOM edge of the canvas, body centred horizontally;
 *  - the bow hand should land around x = +46 from the centre so the code's
 *    hardcoded muzzle flash (feet +46 / +132) sits on the weapon;
 *  - the canvas is 2:1-ish portrait-ish and the figure should fill most of the height.
 */
import { Canvas, Rng, SPACE, clamp, lerp, mix, sampleStops } from './art-core.mjs';

const OUTLINE = [10, 14, 26];

/** Darken/lighten helper. */
const shade = (col, t) => mix(col, t > 0 ? [255, 255, 255] : [0, 0, 0], Math.abs(t));

function limb(c, x0, y0, x1, y1, w, col, rim) {
  c.line(x0, y0, x1, y1, w, col, 1);
  // rim light along the upper-left side of the limb
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.hypot(dx, dy) || 1;
  const nx = (-dy / len) * w * 0.34;
  const ny = (dx / len) * w * 0.34;
  c.line(x0 - nx, y0 - ny, x1 - nx, y1 - ny, w * 0.3, rim, 0.5);
}

/** Energy bow: double-curved limbs + string + glowing nock, centred on (bx, by). */
function energyBow(c, bx, by, r, col) {
  // two limbs so it reads as a bow and not as a shield ring
  c.arc(bx, by, r, 3.2, -Math.PI * 0.5, Math.PI * 0.5, shade(col, -0.35), 1, 1.1);
  c.arc(bx, by, r, 1.4, -Math.PI * 0.5, Math.PI * 0.5, col, 0.95, 1.1);
  c.arc(bx, by, r * 0.55, 3.0, -Math.PI * 0.42, Math.PI * 0.42, shade(col, -0.5), 1, 1.1);
  c.arc(bx, by, r * 0.55, 1.2, -Math.PI * 0.42, Math.PI * 0.42, col, 0.8, 1.1);
  // string across the two tips
  const tx = bx + Math.cos(-Math.PI * 0.5) * r;
  const ty0 = by - r;
  const ty1 = by + r;
  c.line(tx, ty0, bx - 2, by, 1.2, [190, 215, 255], 0.55);
  c.line(bx - 2, by, tx, ty1, 1.2, [190, 215, 255], 0.55);
  // grip + nocked energy
  c.rect(bx - 2.5, by - 6, 5, 12, [30, 36, 52], 1);
  c.disc(bx - 1, by, 2.8, col, 1, 1.1);
  c.disc(bx - 1, by, 8, col, 0.16, 7);
}

/** Draws an armoured astronaut. Returns nothing; all geometry in canvas px. */
function astronaut(c, { cx, feet, height, palette, bow = true, visorCol = SPACE.ice, antenna = true }) {
  const s = height / 176; // authored at 176 px tall (Archer_1)
  const hipY = feet - 62 * s;
  const shoulderY = feet - 118 * s;
  const headR = 17 * s;
  const headY = shoulderY - 20 * s;
  const body = palette.body;
  const trim = palette.trim;
  const dark = shade(body, -0.5);

  // legs
  limb(c, cx - 8 * s, hipY, cx - 11 * s, feet - 4 * s, 13 * s, dark, trim);
  limb(c, cx + 8 * s, hipY, cx + 12 * s, feet - 4 * s, 13 * s, body, trim);
  // boots
  c.rect(cx - 17 * s, feet - 8 * s, 16 * s, 8 * s, shade(body, -0.2), 1);
  c.rect(cx + 2 * s, feet - 8 * s, 17 * s, 8 * s, shade(body, -0.25), 1);
  c.rect(cx - 17 * s, feet - 8 * s, 16 * s, 2 * s, trim, 0.7);
  c.rect(cx + 2 * s, feet - 8 * s, 17 * s, 2 * s, trim, 0.7);

  // pelvis + torso
  c.poly(
    [
      [cx - 15 * s, hipY + 4 * s],
      [cx + 15 * s, hipY + 4 * s],
      [cx + 17 * s, shoulderY],
      [cx - 17 * s, shoulderY],
    ],
    body,
    1,
  );
  // chest plate
  c.poly(
    [
      [cx - 13 * s, shoulderY + 6 * s],
      [cx + 13 * s, shoulderY + 6 * s],
      [cx + 10 * s, hipY - 2 * s],
      [cx - 10 * s, hipY - 2 * s],
    ],
    shade(body, -0.18),
    0.95,
  );
  // glowing chest strip
  c.rect(cx - 7 * s, shoulderY + 12 * s, 14 * s, 4 * s, trim, 0.9);
  c.rect(cx - 4 * s, hipY - 12 * s, 8 * s, 3 * s, trim, 0.6);

  // shoulder pads
  for (const side of [-1, 1]) {
    c.poly(
      [
        [cx + side * 16 * s, shoulderY - 10 * s],
        [cx + side * 27 * s, shoulderY - 6 * s],
        [cx + side * 24 * s, shoulderY + 12 * s],
        [cx + side * 15 * s, shoulderY + 8 * s],
      ],
      shade(body, side > 0 ? -0.05 : -0.3),
      1,
    );
    c.line(
      cx + side * 17 * s,
      shoulderY - 9 * s,
      cx + side * 26 * s,
      shoulderY - 5 * s,
      (2.6 * s),
      trim,
      0.75,
    );
  }

  // backpack
  c.rect(cx - 26 * s, shoulderY + 2 * s, 12 * s, 34 * s, shade(body, -0.45), 1);
  c.rect(cx - 25 * s, shoulderY + 6 * s, 3 * s, 26 * s, SPACE.cyan, 0.35);
  for (let i = 0; i < 3; i++) c.disc(cx - 20 * s, shoulderY + 40 * s + i * 5 * s, 2.2 * s, SPACE.amber, 0.5, 1.4);

  // helmet
  c.disc(cx, headY, headR, shade(body, -0.1), 1, 1.1);
  c.arc(cx, headY, headR, 3 * s, Math.PI * 0.95, Math.PI * 1.9, trim, 0.55, 1.2);
  // visor
  c.poly(
    [
      [cx + 1 * s, headY - 10 * s],
      [cx + headR * 0.92, headY - 5 * s],
      [cx + headR * 0.86, headY + 5 * s],
      [cx + 1 * s, headY + 9 * s],
    ],
    visorCol,
    0.95,
  );
  c.poly(
    [
      [cx + 1 * s, headY - 10 * s],
      [cx + headR * 0.92, headY - 5 * s],
      [cx + headR * 0.86, headY + 1 * s],
      [cx + 1 * s, headY + 2 * s],
    ],
    [255, 255, 255],
    0.5,
  );
  if (antenna) {
    c.line(cx - 6 * s, headY - headR, cx - 12 * s, headY - headR - 18 * s, 2.2 * s, [90, 100, 126], 1);
    c.disc(cx - 12 * s, headY - headR - 19 * s, 3 * s, SPACE.magenta, 0.95, 1.4);
    c.disc(cx - 12 * s, headY - headR - 19 * s, 9 * s, SPACE.magenta, 0.18, 7);
  }

  // arms + bow
  limb(c, cx + 16 * s, shoulderY + 6 * s, cx + 32 * s, shoulderY + 24 * s, 10 * s, shade(body, -0.15), trim);
  if (bow) {
    energyBow(c, cx + 36 * s, shoulderY + 22 * s, 22 * s, trim);
    // draw hand on the string
    c.disc(cx + 30 * s, shoulderY + 24 * s, 5 * s, shade(body, -0.2), 1, 1);
  } else {
    c.disc(cx + 36 * s, shoulderY + 27 * s, 5 * s, shade(body, -0.2), 1, 1);
  }
  // back arm
  limb(c, cx - 14 * s, shoulderY + 6 * s, cx - 24 * s, shoulderY + 30 * s, 9 * s, shade(body, -0.4), trim);
}

const SKINS = [
  { body: [232, 236, 244], trim: [255, 158, 66] }, // 1 · standard white/orange
  { body: [150, 190, 246], trim: [120, 225, 255] }, // 2 · blue recon
  { body: [176, 236, 210], trim: [80, 255, 190] }, // 3 · teal engineer
  { body: [226, 206, 158], trim: [255, 206, 110] }, // 4 · tan sniper
  { body: [178, 150, 240], trim: [206, 130, 255] }, // 5 · violet void
];

/** Player skins. `variants` maps index -> [w, h]. */
export function archerSkins(variants) {
  const out = [];
  variants.forEach(([w, h], i) => {
    const c = new Canvas(w, h);
    const rng = new Rng(400 + i);
    astronaut(c, {
      cx: Math.round(w * 0.42),
      feet: h - 2,
      height: Math.round(h * 0.95),
      palette: SKINS[i % SKINS.length],
      visorCol: i === 4 ? [220, 160, 255] : SPACE.ice,
      antenna: i !== 3,
    });
    // a few drifting sparks so the figure is not perfectly flat
    for (let k = 0; k < 14; k++) {
      const x = rng.range(w * 0.15, w * 0.95);
      const y = rng.range(h * 0.1, h * 0.95);
      c.disc(x, y, rng.range(0.6, 1.4), SKINS[i % SKINS.length].trim, rng.range(0.15, 0.5), 0.8);
    }
    c.glow(3, 0.5, 190);
    out.push(c);
  });
  return out;
}

// ---------------------------------------------------------------------------
// Monsters
// ---------------------------------------------------------------------------

/** Claw: six-legged crawler, red-orange warning lights. */
function crawler(w, h, rng) {
  const c = new Canvas(w, h);
  const cy = h * 0.6;
  const cx = w / 2;
  const body = [92, 46, 40];
  const trim = [255, 120, 70];

  // legs (three per side), reaching the bottom
  for (let i = 0; i < 3; i++) {
    for (const side of [-1, 1]) {
      const ax = cx + side * (16 + i * 22);
      const bx = cx + side * (44 + i * 30);
      limb(c, ax, cy + 4, bx, h - 6, 7, shade(body, -0.45), trim);
    }
  }
  // carapace
  c.poly(
    [
      [cx - 78, cy + 6],
      [cx - 52, cy - 38],
      [cx + 40, cy - 46],
      [cx + 82, cy - 8],
      [cx + 66, cy + 22],
      [cx - 60, cy + 26],
    ],
    body,
    1,
  );
  c.poly(
    [
      [cx - 46, cy - 30],
      [cx + 34, cy - 38],
      [cx + 56, cy - 16],
      [cx - 30, cy - 12],
    ],
    shade(body, -0.3),
    0.9,
  );
  // spines
  for (let i = 0; i < 4; i++) {
    const x = cx - 34 + i * 22;
    c.poly([[x - 6, cy - 40], [x + 6, cy - 40], [x, cy - 62 - (i % 2) * 8]], shade(body, -0.55), 1);
  }
  // eye cluster
  for (let i = 0; i < 3; i++) {
    const ex = cx + 34 + i * 13;
    c.disc(ex, cy - 20 + i * 5, 3.4, trim, 1, 1);
    c.disc(ex, cy - 20 + i * 5, 9, trim, 0.2, 6);
  }
  // mandibles
  c.line(cx + 74, cy + 2, cx + 96, cy + 14, 5, shade(body, -0.3), 1);
  c.line(cx + 74, cy + 10, cx + 94, cy + 24, 5, shade(body, -0.3), 1);
  for (let k = 0; k < 26; k++) c.disc(rng.range(0, w), rng.range(h * 0.2, h), rng.range(0.6, 1.3), trim, rng.range(0.1, 0.35), 0.8);
  return c.glow(3, 0.45, 170);
}

/** Warrior: heavy bipedal mech, amber trim. */
function heavyMech(w, h, rng) {
  const c = new Canvas(w, h);
  const feet = h - 4;
  const cx = w / 2;
  const body = [96, 78, 54];
  const trim = [255, 186, 90];
  const s = h / 176;

  // legs
  limb(c, cx - 18 * s, feet - 62 * s, cx - 24 * s, feet - 6 * s, 26 * s, shade(body, -0.3), trim);
  limb(c, cx + 18 * s, feet - 62 * s, cx + 26 * s, feet - 6 * s, 26 * s, shade(body, -0.15), trim);
  c.rect(cx - 38 * s, feet - 12 * s, 32 * s, 12 * s, shade(body, -0.45), 1);
  c.rect(cx + 6 * s, feet - 12 * s, 34 * s, 12 * s, shade(body, -0.4), 1);
  // torso
  c.poly(
    [
      [cx - 40 * s, feet - 58 * s],
      [cx + 40 * s, feet - 58 * s],
      [cx + 46 * s, feet - 128 * s],
      [cx - 46 * s, feet - 128 * s],
    ],
    body,
    1,
  );
  c.poly(
    [
      [cx - 30 * s, feet - 66 * s],
      [cx + 30 * s, feet - 66 * s],
      [cx + 32 * s, feet - 118 * s],
      [cx - 32 * s, feet - 118 * s],
    ],
    shade(body, -0.28),
    0.95,
  );
  // core
  c.disc(cx, feet - 96 * s, 12 * s, trim, 1, 2);
  c.ring(cx, feet - 96 * s, 20 * s, 3 * s, trim, 0.7, 2);
  // shoulders
  for (const side of [-1, 1]) {
    c.poly(
      [
        [cx + side * 44 * s, feet - 130 * s],
        [cx + side * 72 * s, feet - 118 * s],
        [cx + side * 66 * s, feet - 92 * s],
        [cx + side * 42 * s, feet - 100 * s],
      ],
      shade(body, side > 0 ? 0 : -0.3),
      1,
    );
    c.rect(cx + side * 48 * s, feet - 128 * s, 20 * s, 4 * s, trim, 0.65);
  }
  // head
  c.disc(cx, feet - 144 * s, 20 * s, shade(body, -0.2), 1, 1.2);
  c.rect(cx - 16 * s, feet - 148 * s, 32 * s, 7 * s, trim, 0.9);
  // arm cannons
  limb(c, cx + 40 * s, feet - 110 * s, cx + 66 * s, feet - 70 * s, 20 * s, shade(body, -0.2), trim);
  c.rect(cx + 58 * s, feet - 74 * s, 30 * s, 16 * s, [40, 44, 58], 1);
  c.disc(cx + 86 * s, feet - 66 * s, 5 * s, trim, 1, 1.4);
  c.disc(cx + 86 * s, feet - 66 * s, 14 * s, trim, 0.15, 8);
  limb(c, cx - 40 * s, feet - 110 * s, cx - 62 * s, feet - 74 * s, 18 * s, shade(body, -0.4), trim);
  for (let k = 0; k < 20; k++) c.disc(rng.range(0, w), rng.range(h * 0.2, h), rng.range(0.6, 1.3), trim, rng.range(0.1, 0.3), 0.8);
  return c.glow(3, 0.45, 170);
}

/** Archer variant: hovering turret with a long barrel and a targeting laser. */
function hoverTurret(w, h, rng) {
  const c = new Canvas(w, h);
  const cx = w / 2;
  const cy = h * 0.46;
  const body = [60, 96, 70];
  const trim = [120, 255, 150];

  // hover ring + thrusters (it floats: the code bobs it)
  c.arc(cx, cy + 42, 58, 7, Math.PI * 0.12, Math.PI * 0.88, shade(body, -0.4), 0.95, 2);
  c.arc(cx, cy + 42, 58, 2.4, Math.PI * 0.2, Math.PI * 0.8, trim, 0.7, 2);
  for (const dx of [-40, 0, 40]) {
    c.disc(cx + dx, cy + 58, 9, trim, 0.2, 10);
    c.disc(cx + dx, cy + 56, 4, trim, 0.55, 2);
  }
  // hull
  c.poly(
    [
      [cx - 56, cy + 10],
      [cx - 34, cy - 34],
      [cx + 34, cy - 34],
      [cx + 56, cy + 10],
      [cx + 30, cy + 30],
      [cx - 30, cy + 30],
    ],
    body,
    1,
  );
  c.poly(
    [
      [cx - 30, cy - 26],
      [cx + 30, cy - 26],
      [cx + 36, cy - 6],
      [cx - 36, cy - 6],
    ],
    shade(body, -0.3),
    0.9,
  );
  // dome + sensor
  c.disc(cx - 8, cy - 34, 18, shade(body, -0.15), 1, 1.2);
  c.disc(cx - 6, cy - 34, 11, trim, 0.9, 1.5);
  c.disc(cx - 6, cy - 34, 20, trim, 0.14, 10);
  // barrel
  c.rect(cx + 30, cy - 12, 74, 13, [46, 52, 66], 1);
  c.rect(cx + 30, cy - 12, 74, 3, shade(body, 0.2), 0.6);
  c.disc(cx + 104, cy - 5, 6, trim, 1, 1.4);
  // targeting beam
  c.line(cx + 104, cy - 5, cx + 150, cy - 22, 2, trim, 0.5);
  for (let k = 0; k < 18; k++) c.disc(rng.range(0, w), rng.range(h * 0.2, h), rng.range(0.6, 1.2), trim, rng.range(0.1, 0.3), 0.8);
  return c.glow(3, 0.5, 170);
}

/** Mage variant: floating energy core in two gimbal rings. */
function energyCore(w, h, rng) {
  const c = new Canvas(w, h);
  const cx = w / 2;
  const cy = h * 0.44;
  const trim = [190, 130, 255];
  const body = [58, 40, 92];

  c.poly(
    [
      [cx, cy - 118],
      [cx + 44, cy - 66],
      [cx + 52, cy + 52],
      [cx, cy + 96],
      [cx - 52, cy + 52],
      [cx - 44, cy - 66],
    ],
    body,
    1,
  );
  c.poly(
    [
      [cx, cy - 96],
      [cx + 30, cy - 56],
      [cx + 34, cy + 34],
      [cx, cy + 70],
      [cx - 34, cy + 34],
      [cx - 30, cy - 56],
    ],
    shade(body, -0.28),
    0.9,
  );
  // core
  c.disc(cx, cy - 12, 20, trim, 1, 2.5);
  c.disc(cx, cy - 12, 11, [255, 255, 255], 0.85, 2);
  // gimbal rings
  c.arc(cx, cy - 12, 46, 5, Math.PI * 0.05, Math.PI * 0.95, trim, 0.85, 2);
  c.arc(cx, cy - 12, 46, 5, Math.PI * 1.05, Math.PI * 1.95, shade(trim, -0.4), 0.8, 2);
  c.arc(cx, cy - 12, 70, 3.4, Math.PI * 0.55, Math.PI * 1.45, trim, 0.45, 3);
  // floating shards
  for (let i = 0; i < 8; i++) {
    const a = (i / 8) * Math.PI * 2 + 0.4;
    const r = 84;
    const x = cx + Math.cos(a) * r;
    const y = cy - 12 + Math.sin(a) * r * 0.5;
    c.poly([[x, y - 8], [x + 6, y], [x, y + 8], [x - 6, y]], trim, 0.6);
  }
  for (let k = 0; k < 26; k++) c.disc(rng.range(0, w), rng.range(h * 0.15, h), rng.range(0.6, 1.4), trim, rng.range(0.1, 0.35), 0.9);
  return c.glow(4, 0.55, 165);
}

/** Bat: fast recon drone with four rotor arms. */
function scoutDrone(w, h, rng) {
  const c = new Canvas(w, h);
  const cx = w / 2;
  const cy = h * 0.5;
  const body = [54, 58, 88];
  const trim = [150, 200, 255];

  for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ex = cx + ax * 52;
    const ey = cy + ay * 30;
    limb(c, cx + ax * 14, cy + ay * 10, ex, ey, 6, shade(body, -0.3), trim);
    c.disc(ex, ey, 13, shade(trim, -0.55), 0.55, 1.4);
    c.disc(ex, ey, 13, trim, 0.25, 1.4);
    c.disc(ex, ey, 4, trim, 0.85, 1.4);
  }
  c.poly(
    [
      [cx - 40, cy - 4],
      [cx - 14, cy - 26],
      [cx + 20, cy - 22],
      [cx + 40, cy + 2],
      [cx + 18, cy + 24],
      [cx - 18, cy + 22],
    ],
    body,
    1,
  );
  c.disc(cx - 6, cy - 2, 12, shade(body, -0.35), 1, 1.4);
  c.disc(cx - 4, cy - 2, 7, trim, 0.95, 1.4);
  c.disc(cx - 4, cy - 2, 16, trim, 0.18, 9);
  c.rect(cx + 30, cy - 6, 16, 12, shade(body, -0.2), 1);
  for (let k = 0; k < 16; k++) c.disc(rng.range(0, w), rng.range(h * 0.2, h), rng.range(0.6, 1.2), trim, rng.range(0.1, 0.3), 0.8);
  return c.glow(3, 0.5, 175);
}

/** GuardianBat: a big carrier drone. */
function carrierDrone(w, h, rng) {
  const c = new Canvas(w, h);
  const cx = w / 2;
  const cy = h * 0.48;
  const body = [44, 50, 78];
  const trim = [120, 170, 255];

  for (const [ax, ay] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
    const ex = cx + ax * 92;
    const ey = cy + ay * 46;
    limb(c, cx + ax * 30, cy + ay * 14, ex, ey, 9, shade(body, -0.35), trim);
    c.disc(ex, ey, 20, shade(trim, -0.55), 0.5, 2);
    c.disc(ex, ey, 20, trim, 0.22, 2);
    c.disc(ex, ey, 6, trim, 0.9, 2);
  }
  c.poly(
    [
      [cx - 74, cy],
      [cx - 40, cy - 40],
      [cx + 34, cy - 36],
      [cx + 78, cy + 6],
      [cx + 30, cy + 40],
      [cx - 34, cy + 38],
    ],
    body,
    1,
  );
  c.poly(
    [
      [cx - 48, cy - 26],
      [cx + 26, cy - 22],
      [cx + 46, cy + 4],
      [cx - 30, cy + 2],
    ],
    shade(body, -0.3),
    0.9,
  );
  c.disc(cx - 10, cy, 24, shade(body, -0.45), 1, 2);
  c.ring(cx - 10, cy, 30, 4, trim, 0.85, 2);
  c.disc(cx - 10, cy, 12, trim, 0.95, 2);
  c.disc(cx - 10, cy, 34, trim, 0.16, 14);
  // hangar lights
  for (let i = 0; i < 5; i++) c.disc(cx - 60 + i * 30, cy + 26, 3, SPACE.amber, 0.7, 1.4);
  for (let k = 0; k < 22; k++) c.disc(rng.range(0, w), rng.range(h * 0.15, h), rng.range(0.6, 1.3), trim, rng.range(0.1, 0.3), 0.8);
  return c.glow(3, 0.5, 170);
}

/** RunPortal: a wormhole. Bright core, tilted accretion rings, spiral arms. */
export function portal(size = 512) {
  const c = new Canvas(size, size);
  const cx = size / 2;
  const cy = size / 2;
  const rng = new Rng(99);
  const core = [140, 235, 255];
  const rim = [110, 130, 255];
  const hot = [255, 220, 190];

  // outer haze
  for (let k = 0; k < 10; k++) {
    c.disc(cx, cy, size * 0.34 * (1 - k * 0.07), rim, 0.05, size * 0.09);
  }
  // accretion rings (tilted: squash y)
  for (let i = 0; i < 5; i++) {
    const r = size * (0.16 + i * 0.035);
    const col = mix(core, rim, i / 4);
    for (let a = 0; a < Math.PI * 2; a += 0.006) {
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.52;
      const wob = 1 + 0.06 * Math.sin(a * 5 + i);
      c.disc(x, y + Math.sin(a * 2 + i) * 2, 2.6 - i * 0.25, col, 0.5 * wob, 1.6);
    }
  }
  // spiral arms
  for (let arm = 0; arm < 3; arm++) {
    for (let t = 0; t < 1; t += 0.004) {
      const a = t * 7 + (arm * Math.PI * 2) / 3;
      const r = size * (0.06 + t * 0.24);
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r * 0.6;
      c.disc(x, y, 3.4 * (1 - t * 0.7), mix(hot, core, t), 0.5 * (1 - t * 0.6), 2);
    }
  }
  // core
  c.disc(cx, cy, size * 0.075, [255, 255, 255], 0.95, size * 0.03);
  c.disc(cx, cy, size * 0.11, hot, 0.8, size * 0.04);
  c.disc(cx, cy, size * 0.16, core, 0.35, size * 0.06);
  // flanking struts so it reads as a built gate, not just a glow
  for (const side of [-1, 1]) {
    c.poly(
      [
        [cx + side * size * 0.4, cy - size * 0.3],
        [cx + side * size * 0.47, cy - size * 0.24],
        [cx + side * size * 0.47, cy + size * 0.24],
        [cx + side * size * 0.4, cy + size * 0.3],
      ],
      [40, 48, 70],
      0.95,
    );
    for (let i = 0; i < 6; i++) {
      c.rect(cx + side * size * 0.415, cy - size * 0.26 + i * size * 0.09, size * 0.03, size * 0.02, core, 0.55);
    }
  }
  for (let k = 0; k < 120; k++) {
    const a = rng.range(0, Math.PI * 2);
    const r = rng.range(size * 0.2, size * 0.48);
    c.disc(cx + Math.cos(a) * r, cy + Math.sin(a) * r * 0.8, rng.range(0.7, 2), core, rng.range(0.15, 0.5), 1);
  }
  return c.glow(5, 0.6, 150);
}

/** King: a large command mech (only used by the unported final fight). */
export function kingBoss(w, h, rng) {
  const c = new Canvas(w, h);
  const cx = w / 2;
  const feet = h - 3;
  const s = h / 439;
  const body = [70, 40, 74];
  const trim = [255, 120, 200];

  // legs
  limb(c, cx - 26 * s, feet - 150 * s, cx - 36 * s, feet - 8 * s, 44 * s, shade(body, -0.4), trim);
  limb(c, cx + 26 * s, feet - 150 * s, cx + 38 * s, feet - 8 * s, 44 * s, shade(body, -0.25), trim);
  c.rect(cx - 60 * s, feet - 16 * s, 52 * s, 16 * s, shade(body, -0.5), 1);
  c.rect(cx + 8 * s, feet - 16 * s, 54 * s, 16 * s, shade(body, -0.45), 1);
  // torso
  c.poly(
    [
      [cx - 66 * s, feet - 146 * s],
      [cx + 66 * s, feet - 146 * s],
      [cx + 78 * s, feet - 268 * s],
      [cx - 78 * s, feet - 268 * s],
    ],
    body,
    1,
  );
  c.poly(
    [
      [cx - 50 * s, feet - 158 * s],
      [cx + 50 * s, feet - 158 * s],
      [cx + 54 * s, feet - 250 * s],
      [cx - 54 * s, feet - 250 * s],
    ],
    shade(body, -0.3),
    0.9,
  );
  // core eye
  c.disc(cx, feet - 208 * s, 30 * s, trim, 1, 4 * s);
  c.disc(cx, feet - 208 * s, 14 * s, [255, 255, 255], 0.9, 3 * s);
  // crown crest
  for (let i = -3; i <= 3; i++) {
    const x = cx + i * 26 * s;
    const hh = (i % 2 === 0 ? 74 : 48) * s;
    c.poly([[x - 8 * s, feet - 300 * s], [x + 8 * s, feet - 300 * s], [x, feet - 300 * s - hh]], trim, 0.95);
  }
  // head
  c.disc(cx, feet - 322 * s, 30 * s, shade(body, -0.2), 1, 3 * s);
  c.rect(cx - 24 * s, feet - 328 * s, 48 * s, 9 * s, trim, 0.9);
  // shoulder cannons
  for (const side of [-1, 1]) {
    c.poly(
      [
        [cx + side * 66 * s, feet - 270 * s],
        [cx + side * 104 * s, feet - 252 * s],
        [cx + side * 96 * s, feet - 214 * s],
        [cx + side * 62 * s, feet - 228 * s],
      ],
      shade(body, side > 0 ? 0 : -0.3),
      1,
    );
    c.rect(cx + side * 92 * s, feet - 262 * s, 30 * s, 16 * s, [40, 44, 58], 1);
    c.disc(cx + side * 124 * s, feet - 254 * s, 6 * s, trim, 1, 2 * s);
  }
  // cape panels
  c.poly(
    [
      [cx - 70 * s, feet - 250 * s],
      [cx - 30 * s, feet - 250 * s],
      [cx - 46 * s, feet - 40 * s],
      [cx - 92 * s, feet - 60 * s],
    ],
    shade(body, -0.55),
    0.9,
  );
  for (let k = 0; k < 30; k++) c.disc(rng.range(0, w), rng.range(h * 0.1, h), rng.range(0.7, 1.6), trim, rng.range(0.1, 0.35), 1);
  return c.glow(4, 0.5, 165);
}

// ---------------------------------------------------------------------------
// Pets: three small craft
// ---------------------------------------------------------------------------
export function pets() {
  const out = [];

  // Wolf - wedge fighter
  {
    const c = new Canvas(111, 124);
    const cx = 55;
    const cy = 74;
    const body = [96, 110, 138];
    const trim = [120, 220, 255];
    c.poly(
      [
        [cx - 44, cy - 4],
        [cx - 12, cy - 30],
        [cx + 34, cy - 20],
        [cx + 46, cy + 2],
        [cx + 20, cy + 18],
        [cx - 34, cy + 14],
      ],
      body,
      1,
    );
    c.poly([[cx - 30, cy - 2], [cx + 26, cy - 14], [cx + 30, cy + 2], [cx - 24, cy + 6]], [40, 48, 68], 0.95);
    c.disc(cx + 18, cy - 6, 6, trim, 0.95, 1.4);
    c.disc(cx + 18, cy - 6, 14, trim, 0.15, 8);
    // wings
    for (const side of [-1, 1]) {
      c.poly(
        [
          [cx + side * 10, cy - 10],
          [cx + side * 46, cy - 30 * (side > 0 ? 1 : 0.4)],
          [cx + side * 42, cy + 6],
        ],
        shade(body, -0.35),
        0.95,
      );
    }
    // thrusters pointing down (it is airborne in-game)
    for (const dx of [-16, 12]) {
      c.disc(cx + dx, cy + 34, 6, SPACE.amber, 0.35, 8);
      c.disc(cx + dx, cy + 32, 3, SPACE.amber, 0.8, 1.6);
    }
    out.push(c.glow(3, 0.45, 170));
  }

  // Bear - shielded carrier
  {
    const c = new Canvas(104, 108);
    const cx = 52;
    const cy = 62;
    const body = [126, 122, 108];
    const trim = [140, 255, 210];
    c.poly(
      [
        [cx - 46, cy + 6],
        [cx - 30, cy - 26],
        [cx + 30, cy - 26],
        [cx + 46, cy + 6],
        [cx + 26, cy + 26],
        [cx - 26, cy + 26],
      ],
      body,
      1,
    );
    c.disc(cx, cy - 22, 22, shade(body, -0.3), 1, 2);
    c.arc(cx, cy - 22, 30, 4, Math.PI, Math.PI * 2, trim, 0.8, 2);
    c.disc(cx, cy - 22, 11, trim, 0.9, 2);
    // shield emitters
    for (const dx of [-34, 34]) {
      c.disc(cx + dx, cy + 2, 5, trim, 0.9, 1.6);
      c.arc(cx + dx, cy + 2, 14, 3, 0, Math.PI * 2, trim, 0.25, 3);
    }
    for (const dx of [-14, 12]) c.disc(cx + dx, cy + 34, 5, SPACE.amber, 0.4, 6);
    out.push(c.glow(3, 0.45, 170));
  }

  // Falcon - long-range recon drone
  {
    const c = new Canvas(127, 110);
    const cx = 63;
    const cy = 58;
    const body = [150, 150, 170];
    const trim = [200, 160, 255];
    c.poly(
      [
        [cx - 52, cy + 4],
        [cx - 20, cy - 16],
        [cx + 26, cy - 12],
        [cx + 54, cy + 2],
        [cx + 18, cy + 12],
        [cx - 24, cy + 12],
      ],
      body,
      1,
    );
    c.poly([[cx - 34, cy + 1], [cx + 24, cy - 7], [cx + 28, cy + 3], [cx - 30, cy + 8]], [44, 48, 66], 0.95);
    c.disc(cx + 20, cy - 2, 7, trim, 0.95, 1.6);
    c.disc(cx + 20, cy - 2, 16, trim, 0.16, 9);
    // swept wings
    for (const side of [-1, 1]) {
      c.poly(
        [
          [cx + side * 8, cy - 6],
          [cx + side * 40, cy - 34],
          [cx + side * 30, cy + 4],
        ],
        shade(body, -0.3),
        0.9,
      );
    }
    out.push(c.glow(3, 0.45, 175));
  }

  return out;
}

export { crawler, heavyMech, hoverTurret, energyCore, scoutDrone, carrierDrone, astronaut, SKINS };
