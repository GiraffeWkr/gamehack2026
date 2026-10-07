/**
 * Space-reskin UI art: currency icons, skill icons, mastery icons, the corner rail
 * buttons, the job cards and the talent-tree nodes/glyphs.
 *
 * Two rules that matter:
 *  - `cur/*`, `skills/*` and `mastery/*` are drawn as full-colour art (the code tints
 *    them with 0xffffff, i.e. no-op).
 *  - everything under `tree/` must be WHITE + alpha only, because the talent panel
 *    multiplies a colour over it.
 */
import { Canvas, Rng, SPACE, clamp, mix, sampleStops } from './art-core.mjs';

const WHITE = [255, 255, 255];

/** Rounded-square plate used as the base of icon glyphs. */
function plate(c, w, h, { inset = 3, top = [46, 58, 84], bottom = [18, 24, 38], edge = null, radius = 0.22 }) {
  const r = Math.min(w, h) * radius;
  const x0 = inset;
  const y0 = inset;
  const x1 = w - inset;
  const y1 = h - inset;
  const pts = [];
  const corner = (cx, cy, a0) => {
    for (let i = 0; i <= 6; i++) {
      const a = a0 + (i / 6) * (Math.PI / 2);
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
  };
  corner(x1 - r, y0 + r, -Math.PI / 2);
  corner(x1 - r, y1 - r, 0);
  corner(x0 + r, y1 - r, Math.PI / 2);
  corner(x0 + r, y0 + r, Math.PI);
  c.poly(pts, bottom, 0.96);
  // top-lit gradient
  for (let y = y0; y < y1; y++) {
    const t = (y - y0) / Math.max(1, y1 - y0);
    c.rect(x0, y, x1 - x0, 1, mix(top, bottom, t), 0.35);
  }
  if (edge) {
    for (let i = 0; i < pts.length; i++) {
      const [ax, ay] = pts[i];
      const [bx, by] = pts[(i + 1) % pts.length];
      c.line(ax, ay, bx, by, 2, edge, 0.75);
    }
  }
  return { x0, y0, x1, y1 };
}

/** Glowing accent placed inside a plate. */
function spark(c, x, y, col, r = 5, a = 0.9) {
  c.disc(x, y, r, col, a, 1.6);
  c.disc(x, y, r * 3, col, 0.16, r * 2.6);
}

// ---------------------------------------------------------------------------
// Currency (full colour; used both as world drops and HUD icons)
// ---------------------------------------------------------------------------
function coin(c, w, h, { face, edge, glyph }) {
  const cx = w / 2;
  const cy = h / 2;
  const r = Math.min(w, h) * 0.46;
  c.disc(cx, cy, r, edge, 1, 1.4);
  c.disc(cx, cy, r * 0.86, face, 1, 1.2);
  c.arc(cx, cy, r * 0.86, r * 0.16, Math.PI * 0.9, Math.PI * 1.9, mix(face, WHITE, 0.55), 0.6, 1.4);
  // circuit ring
  c.arc(cx, cy, r * 0.68, Math.max(1, r * 0.1), 0, Math.PI * 2, mix(face, [0, 0, 0], 0.45), 0.55, 1.2);
  if (glyph) glyph(c, cx, cy, r);
  c.glow(2, 0.35, 180);
}

const GLYPH = {
  circuit(c, cx, cy, r) {
    c.rect(cx - r * 0.3, cy - r * 0.34, r * 0.6, r * 0.68, mix(SPACE.gold, WHITE, 0.35), 0.85);
    c.rect(cx - r * 0.06, cy - r * 0.42, r * 0.12, r * 0.84, mix(SPACE.gold, [0, 0, 0], 0.4), 0.8);
    for (const dx of [-r * 0.36, r * 0.36]) c.rect(cx + dx, cy - r * 0.2, r * 0.16, r * 0.4, SPACE.gold, 0.8);
  },
  claw(c, cx, cy, r) {
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (i - 1) * 0.5;
      c.line(cx, cy + r * 0.34, cx + Math.cos(a) * r * 0.62, cy + Math.sin(a) * r * 0.62, r * 0.22, mix([255, 120, 70], WHITE, 0.25), 0.95);
    }
  },
  arrow(c, cx, cy, r) {
    c.poly(
      [
        [cx, cy - r * 0.62],
        [cx + r * 0.44, cy + r * 0.2],
        [cx, cy + r * 0.02],
        [cx - r * 0.44, cy + r * 0.2],
      ],
      mix([120, 245, 190], WHITE, 0.3),
      0.95,
    );
    c.rect(cx - r * 0.1, cy - r * 0.2, r * 0.2, r * 0.8, mix([120, 245, 190], [0, 0, 0], 0.3), 0.9);
  },
  shield(c, cx, cy, r) {
    c.poly(
      [
        [cx, cy - r * 0.66],
        [cx + r * 0.5, cy - r * 0.34],
        [cx + r * 0.36, cy + r * 0.5],
        [cx, cy + r * 0.72],
        [cx - r * 0.36, cy + r * 0.5],
        [cx - r * 0.5, cy - r * 0.34],
      ],
      mix([255, 195, 100], WHITE, 0.2),
      0.95,
    );
    c.rect(cx - r * 0.08, cy - r * 0.4, r * 0.16, r * 0.9, mix([255, 195, 100], [0, 0, 0], 0.45), 0.7);
  },
  diamond(c, cx, cy, r) {
    c.poly(
      [
        [cx, cy - r * 0.68],
        [cx + r * 0.46, cy],
        [cx, cy + r * 0.68],
        [cx - r * 0.46, cy],
      ],
      mix([200, 140, 255], WHITE, 0.35),
      0.95,
    );
    c.poly(
      [
        [cx, cy - r * 0.34],
        [cx + r * 0.22, cy],
        [cx, cy + r * 0.34],
        [cx - r * 0.22, cy],
      ],
      WHITE,
      0.6,
    );
  },
  wing(c, cx, cy, r) {
    for (const side of [-1, 1]) {
      c.poly(
        [
          [cx, cy - r * 0.2],
          [cx + side * r * 0.78, cy - r * 0.5],
          [cx + side * r * 0.6, cy + r * 0.22],
          [cx + side * r * 0.18, cy + r * 0.34],
        ],
        mix([150, 160, 255], WHITE, 0.25),
        0.9,
      );
    }
    c.disc(cx, cy - r * 0.05, r * 0.2, WHITE, 0.9, 1.2);
  },
  vortex(c, cx, cy, r) {
    for (let i = 0; i < 3; i++) {
      c.arc(cx, cy, r * (0.28 + i * 0.2), Math.max(1.4, r * 0.12), i * 0.7, i * 0.7 + 4.4, mix([255, 110, 220], WHITE, i * 0.25), 0.85, 1.4);
    }
    c.disc(cx, cy, r * 0.2, WHITE, 0.9, 1.2);
  },
  gem(c, cx, cy, r) {
    c.poly(
      [
        [cx, cy - r * 0.72],
        [cx + r * 0.56, cy - r * 0.16],
        [cx + r * 0.34, cy + r * 0.56],
        [cx - r * 0.34, cy + r * 0.56],
        [cx - r * 0.56, cy - r * 0.16],
      ],
      mix([130, 245, 255], WHITE, 0.3),
      0.95,
    );
    c.poly(
      [
        [cx, cy - r * 0.72],
        [cx + r * 0.2, cy - r * 0.05],
        [cx, cy + r * 0.56],
        [cx - r * 0.2, cy - r * 0.05],
      ],
      WHITE,
      0.55,
    );
  },
  target(c, cx, cy, r) {
    c.arc(cx, cy, r * 0.66, Math.max(1.6, r * 0.16), 0, Math.PI * 2, mix([255, 120, 120], WHITE, 0.3), 0.9, 1.4);
    c.line(cx - r * 0.9, cy, cx - r * 0.34, cy, r * 0.14, WHITE, 0.7);
    c.line(cx + r * 0.34, cy, cx + r * 0.9, cy, r * 0.14, WHITE, 0.7);
    c.line(cx, cy - r * 0.9, cx, cy - r * 0.34, r * 0.14, WHITE, 0.7);
    c.line(cx, cy + r * 0.34, cx, cy + r * 0.9, r * 0.14, WHITE, 0.7);
    c.disc(cx, cy, r * 0.18, mix([255, 120, 120], WHITE, 0.4), 0.95, 1.2);
  },
};

/** Plain glyph icon (used by the stat/currency icons that are not coins). */
function glyphIcon(w, h, glyph, col, { plateOn = false } = {}) {
  const c = new Canvas(w, h);
  if (plateOn) plate(c, w, h, { edge: mix(col, WHITE, 0.2) });
  glyph(c, w / 2, h / 2, Math.min(w, h) * 0.44);
  return c.glow(2, 0.4, 175);
}

export function currencyIcons() {
  return {
    'cur/Gold': coinIcon(33, 33, SPACE.gold, [120, 80, 20], GLYPH.circuit),
    'cur/ClawCurrency': coinIcon(35, 35, [255, 110, 70], [90, 30, 20], GLYPH.claw),
    'cur/ArcherCurrency': coinIcon(27, 35, [120, 245, 190], [24, 80, 66], GLYPH.arrow),
    'cur/WarriorCurrency': coinIcon(37, 33, [255, 190, 96], [110, 62, 18], GLYPH.shield),
    'cur/MageCurrency': coinIcon(27, 33, [200, 140, 255], [62, 30, 96], GLYPH.diamond),
    'cur/BatCurrency': coinIcon(36, 36, [140, 160, 255], [40, 44, 100], GLYPH.wing),
    'cur/PortalCurrency': coinIcon(27, 34, [255, 106, 214], [92, 26, 84], GLYPH.vortex),
    'cur/GemCurrency': coinIcon(34, 33, [130, 245, 255], [22, 74, 92], GLYPH.gem),
    'cur/Monsters': glyphIcon(29, 31, GLYPH.target, [255, 130, 130]),
    'cur/Attack': glyphIcon(36, 31, GLYPH.arrow, [255, 170, 90]),
    'cur/Damage': glyphIcon(35, 30, GLYPH.claw, [255, 120, 90]),
    'cur/Health': glyphIcon(34, 32, GLYPH.shield, [120, 255, 170]),
    'cur/Bonus': glyphIcon(34, 34, GLYPH.gem, [255, 210, 120]),
    'cur/Multiplier': glyphIcon(34, 33, GLYPH.vortex, [180, 160, 255]),
    'cur/CharacterCurrency': glyphIcon(35, 35, GLYPH.shield, [150, 210, 255]),
    'cur/GuardianCurrency': glyphIcon(33, 35, GLYPH.target, [255, 200, 120]),
    'cur/MiningRock': glyphIcon(35, 36, GLYPH.diamond, [150, 150, 165]),
    'cur/MiningCopper': glyphIcon(31, 37, GLYPH.diamond, [220, 140, 90]),
    'cur/MiningSilver': glyphIcon(33, 36, GLYPH.diamond, [200, 215, 235]),
    'cur/MiningGold': glyphIcon(35, 39, GLYPH.diamond, [255, 205, 110]),
  };
}

function coinIcon(w, h, face, edge, glyph) {
  const c = new Canvas(w, h);
  coin(c, w, h, { face, edge, glyph });
  return c;
}

// ---------------------------------------------------------------------------
// Skill icons (15) - dark plate + glowing glyph, 128x128 (kept at the original
// sizes so nothing in the CSS layout shifts)
// ---------------------------------------------------------------------------
const SKILL_GLYPHS = {
  Multishot: (c, w, h, col) => {
    for (let i = -1; i <= 1; i++) {
      const x = w / 2 + i * w * 0.2;
      c.line(x, h * 0.2, x, h * 0.78, w * 0.055, col, 0.95);
      c.poly([[x, h * 0.2], [x + w * 0.07, h * 0.34], [x - w * 0.07, h * 0.34]], WHITE, 0.85);
    }
  },
  RapidFire: (c, w, h, col) => {
    for (let i = 0; i < 3; i++) {
      const y = h * (0.32 + i * 0.18);
      c.poly([[w * 0.2, y - h * 0.07], [w * 0.52, y], [w * 0.2, y + h * 0.07]], col, 0.95);
      c.line(w * 0.5, y, w * 0.8, y, w * 0.03, mix(col, WHITE, 0.5), 0.7);
    }
  },
  SharpShooter: (c, w, h, col) => {
    c.arc(w / 2, h / 2, w * 0.26, w * 0.05, 0, Math.PI * 2, col, 0.95, 1.6);
    c.line(w / 2 - w * 0.38, h / 2, w / 2 - w * 0.16, h / 2, w * 0.035, WHITE, 0.8);
    c.line(w / 2 + w * 0.16, h / 2, w / 2 + w * 0.38, h / 2, w * 0.035, WHITE, 0.8);
    c.line(w / 2, h / 2 - h * 0.38, w / 2, h / 2 - h * 0.16, w * 0.035, WHITE, 0.8);
    c.line(w / 2, h / 2 + h * 0.16, w / 2, h / 2 + h * 0.38, w * 0.035, WHITE, 0.8);
    c.disc(w / 2, h / 2, w * 0.05, WHITE, 0.95, 1.4);
  },
  BombArrow: (c, w, h, col) => {
    c.disc(w / 2, h * 0.56, w * 0.2, [60, 66, 84], 1, 1.6);
    c.arc(w / 2, h * 0.56, w * 0.28, w * 0.045, Math.PI * 1.15, Math.PI * 1.85, col, 0.9, 1.6);
    c.line(w / 2, h * 0.34, w / 2 + w * 0.12, h * 0.22, w * 0.03, col, 0.9);
    spark(c, w / 2 + w * 0.14, h * 0.2, SPACE.amber, w * 0.05);
  },
  PiercingShot: (c, w, h, col) => {
    c.poly([[w * 0.5, h * 0.14], [w * 0.62, h * 0.42], [w * 0.38, h * 0.42]], col, 0.95);
    c.rect(w * 0.46, h * 0.42, w * 0.08, h * 0.46, mix(col, WHITE, 0.35), 0.9);
    for (const dx of [-0.22, 0.22]) c.arc(w / 2 + w * dx, h * 0.62, w * 0.1, w * 0.035, 0, Math.PI * 2, WHITE, 0.4, 1.4);
  },
  SniperScope: (c, w, h, col) => {
    c.arc(w / 2, h / 2, w * 0.3, w * 0.055, 0, Math.PI * 2, col, 0.95, 1.8);
    c.arc(w / 2, h / 2, w * 0.16, w * 0.04, 0, Math.PI * 2, mix(col, WHITE, 0.4), 0.7, 1.4);
    c.line(w * 0.1, h / 2, w * 0.9, h / 2, w * 0.025, WHITE, 0.5);
    c.line(w / 2, h * 0.1, w / 2, h * 0.9, w * 0.025, WHITE, 0.5);
  },
  LightningStrike: (c, w, h, col) => {
    c.poly(
      [
        [w * 0.56, h * 0.14],
        [w * 0.34, h * 0.52],
        [w * 0.48, h * 0.52],
        [w * 0.4, h * 0.86],
        [w * 0.66, h * 0.44],
        [w * 0.52, h * 0.44],
      ],
      col,
      0.98,
    );
  },
  FireArea: (c, w, h, col) => {
    for (let i = 0; i < 3; i++) {
      const x = w * (0.32 + i * 0.18);
      const hh = h * (0.3 + (i % 2) * 0.12);
      c.poly([[x - w * 0.09, h * 0.8], [x + w * 0.09, h * 0.8], [x, h * 0.8 - hh]], col, 0.9);
    }
    c.rect(w * 0.16, h * 0.8, w * 0.68, h * 0.04, mix(col, WHITE, 0.3), 0.6);
  },
  Blizzard: (c, w, h, col) => {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI;
      c.line(w / 2 - Math.cos(a) * w * 0.32, h / 2 - Math.sin(a) * h * 0.32, w / 2 + Math.cos(a) * w * 0.32, h / 2 + Math.sin(a) * h * 0.32, w * 0.028, mix(col, WHITE, 0.5), 0.85);
    }
    c.disc(w / 2, h / 2, w * 0.06, WHITE, 0.9, 1.4);
  },
  DarkMatter: (c, w, h, col) => {
    c.disc(w / 2, h / 2, w * 0.26, [8, 8, 16], 1, 2);
    c.arc(w / 2, h / 2, w * 0.3, w * 0.05, 0, Math.PI * 2, col, 0.85, 2);
    c.arc(w / 2, h / 2, w * 0.4, w * 0.03, 0.4, 3.4, mix(col, WHITE, 0.4), 0.55, 2.4);
  },
  SuperNova: (c, w, h, col) => {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.line(w / 2 + Math.cos(a) * w * 0.14, h / 2 + Math.sin(a) * h * 0.14, w / 2 + Math.cos(a) * w * 0.42, h / 2 + Math.sin(a) * h * 0.42, w * 0.035, i % 2 ? mix(col, WHITE, 0.5) : col, 0.9);
    }
    c.disc(w / 2, h / 2, w * 0.13, WHITE, 0.95, 2);
  },
  BatSwarm: (c, w, h, col) => {
    for (let i = 0; i < 5; i++) {
      const x = w * (0.24 + (i % 3) * 0.26);
      const y = h * (0.3 + Math.floor(i / 3) * 0.3);
      c.poly([[x - w * 0.1, y], [x, y - h * 0.08], [x + w * 0.1, y], [x, y + h * 0.06]], col, 0.9);
    }
  },
  Wolf: (c, w, h, col) => {
    c.poly([[w * 0.2, h * 0.62], [w * 0.5, h * 0.34], [w * 0.82, h * 0.58], [w * 0.5, h * 0.7]], col, 0.95);
    c.disc(w * 0.72, h * 0.5, w * 0.05, WHITE, 0.9, 1.4);
  },
  Bear: (c, w, h, col) => {
    c.poly([[w * 0.22, h * 0.62], [w * 0.3, h * 0.36], [w * 0.7, h * 0.36], [w * 0.78, h * 0.62]], col, 0.95);
    c.arc(w / 2, h * 0.42, w * 0.24, w * 0.04, Math.PI, Math.PI * 2, mix(col, WHITE, 0.5), 0.85, 1.6);
    c.disc(w / 2, h * 0.5, w * 0.06, WHITE, 0.9, 1.4);
  },
  Falcon: (c, w, h, col) => {
    c.poly([[w * 0.16, h * 0.56], [w * 0.5, h * 0.4], [w * 0.84, h * 0.54], [w * 0.5, h * 0.62]], col, 0.95);
    for (const s of [-1, 1]) c.poly([[w * 0.5, h * 0.46], [w * 0.5 + s * w * 0.3, h * 0.24], [w * 0.5 + s * w * 0.22, h * 0.5]], mix(col, WHITE, 0.25), 0.85);
  },
};

export function skillIcons(spec) {
  const out = {};
  for (const { file, id, w, h, col } of spec) {
    const c = new Canvas(w, h);
    plate(c, w, h, { edge: mix(col, WHITE, 0.15), top: [40, 50, 74], bottom: [14, 18, 30] });
    const g = SKILL_GLYPHS[id] ?? SKILL_GLYPHS.Multishot;
    g(c, w, h, col);
    out[`skills/${file}`] = c.glow(3, 0.5, 170);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Mastery icons (9) - no plate, matches the original (bare glyphs)
// ---------------------------------------------------------------------------
export function masteryIcons(spec) {
  const out = {};
  for (const { file, symbol, w, h, col } of spec) {
    const c = new Canvas(w, h);
    const r = Math.min(w, h) * 0.42;
    const cx = w / 2;
    const cy = h / 2;
    ({
      momentum: () => {
        for (let i = 0; i < 3; i++) c.poly([[cx - r * 0.8, cy + r * (0.2 + i * 0.22)], [cx + r * 0.7, cy - r * 0.5 + i * r * 0.22], [cx - r * 0.8, cy + r * (0.42 + i * 0.22)]], col, 0.9);
      },
      vitality: () => {
        c.disc(cx, cy, r * 0.7, col, 0.9, 2);
        c.disc(cx, cy, r * 0.34, WHITE, 0.85, 2);
        c.arc(cx, cy, r * 0.86, r * 0.12, 0, Math.PI * 2, col, 0.5, 2);
      },
      scroll: () => {
        c.rect(cx - r * 0.6, cy - r * 0.7, r * 1.2, r * 1.4, col, 0.9);
        for (let i = 0; i < 4; i++) c.rect(cx - r * 0.42, cy - r * 0.44 + i * r * 0.3, r * 0.84, r * 0.1, [16, 20, 34], 0.85);
      },
      fortune: () => {
        c.poly([[cx, cy - r * 0.8], [cx + r * 0.72, cy], [cx, cy + r * 0.8], [cx - r * 0.72, cy]], col, 0.9);
        c.disc(cx, cy, r * 0.22, WHITE, 0.9, 2);
      },
      echo: () => {
        for (let i = 0; i < 3; i++) c.arc(cx, cy, r * (0.35 + i * 0.28), r * 0.1, 0.6, 5.7, col, 0.8 - i * 0.15, 1.6);
        c.disc(cx - r * 0.1, cy, r * 0.14, WHITE, 0.9, 1.6);
      },
      gilding: () => {
        c.disc(cx, cy, r * 0.72, col, 0.9, 2);
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          c.poly([[cx + Math.cos(a) * r * 0.5, cy + Math.sin(a) * r * 0.5], [cx + Math.cos(a + 0.3) * r * 1.05, cy + Math.sin(a + 0.3) * r * 1.05], [cx + Math.cos(a - 0.3) * r * 1.05, cy + Math.sin(a - 0.3) * r * 1.05]], col, 0.75);
        }
        c.disc(cx, cy, r * 0.26, WHITE, 0.9, 2);
      },
      barrage: () => {
        for (let i = -2; i <= 2; i++) {
          c.line(cx + i * r * 0.3, cy - r * 0.8, cx + i * r * 0.3, cy + r * 0.8, r * 0.14, col, 0.85);
        }
      },
      avarice: () => {
        c.poly([[cx - r * 0.7, cy - r * 0.2], [cx + r * 0.7, cy - r * 0.2], [cx + r * 0.5, cy + r * 0.8], [cx - r * 0.5, cy + r * 0.8]], col, 0.9);
        c.arc(cx, cy - r * 0.2, r * 0.36, r * 0.12, Math.PI, Math.PI * 2, WHITE, 0.7, 1.6);
      },
      forging: () => {
        c.rect(cx - r * 0.8, cy + r * 0.2, r * 1.6, r * 0.34, col, 0.9);
        c.rect(cx - r * 0.3, cy - r * 0.5, r * 0.6, r * 0.7, col, 0.9);
        c.rect(cx - r * 1.0, cy - r * 0.62, r * 2.0, r * 0.22, mix(col, WHITE, 0.3), 0.85);
      },
    })[symbol]?.();
    out[`mastery/${file}`] = c.glow(3, 0.45, 165);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Rail buttons (left-bottom system entries)
// ---------------------------------------------------------------------------
export function railIcons() {
  const make = (w, h, draw) => {
    const c = new Canvas(w, h);
    draw(c, w, h);
    return c.glow(3, 0.45, 165);
  };
  return {
    'rail_tree': make(80, 69, (c, w, h) => {
      const col = SPACE.cyan;
      plate(c, w, h, { inset: 4, edge: col, radius: 0.2 });
      c.line(w * 0.5, h * 0.2, w * 0.5, h * 0.78, w * 0.06, col, 0.9);
      for (const [x, y] of [[0.26, 0.34], [0.74, 0.34], [0.26, 0.68], [0.74, 0.68]]) {
        c.line(w * 0.5, h * 0.5, w * x, h * y, w * 0.035, mix(col, WHITE, 0.25), 0.8);
        c.disc(w * x, h * y, w * 0.075, col, 0.95, 1.6);
      }
      c.disc(w * 0.5, h * 0.5, w * 0.09, WHITE, 0.95, 1.8);
    }),
    'rail_jobs': make(71, 72, (c, w, h) => {
      const col = SPACE.amber;
      plate(c, w, h, { inset: 4, edge: col, radius: 0.2 });
      c.disc(w * 0.5, h * 0.34, w * 0.14, col, 0.95, 2);
      c.poly([[w * 0.24, h * 0.84], [w * 0.34, h * 0.54], [w * 0.66, h * 0.54], [w * 0.76, h * 0.84]], col, 0.9);
    }),
    'rail_mastery': make(44, 56, (c, w, h) => {
      const col = SPACE.violet;
      for (let i = 0; i < 3; i++) {
        c.poly([[w * 0.5, h * (0.14 + i * 0.28)], [w * 0.86, h * (0.28 + i * 0.28)], [w * 0.5, h * (0.42 + i * 0.28)], [w * 0.14, h * (0.28 + i * 0.28)]], col, 0.9 - i * 0.15);
      }
    }),
    'rail_crafting': make(64, 64, (c, w, h) => {
      const col = SPACE.amber;
      plate(c, w, h, { inset: 4, edge: col, radius: 0.18 });
      c.rect(w * 0.22, h * 0.58, w * 0.56, h * 0.14, col, 0.9);
      c.rect(w * 0.38, h * 0.3, w * 0.24, h * 0.28, mix(col, WHITE, 0.2), 0.9);
    }),
    'rail_mining': make(64, 59, (c, w, h) => {
      const col = [200, 180, 140];
      c.line(w * 0.2, h * 0.78, w * 0.72, h * 0.26, w * 0.09, col, 0.95);
      c.arc(w * 0.74, h * 0.24, w * 0.2, w * 0.07, Math.PI * 1.05, Math.PI * 1.95, mix(col, WHITE, 0.3), 0.9, 1.8);
    }),
    'rail_shaping': make(43, 30, (c, w, h) => {
      const col = SPACE.cyan;
      for (let i = 0; i < 3; i++) c.rect(w * (0.12 + i * 0.3), h * 0.3, w * 0.2, h * 0.5, i === 1 ? mix(col, WHITE, 0.3) : col, 0.9);
    }),
    'rail_star': make(56, 54, (c, w, h) => {
      const col = SPACE.gold;
      for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        const a2 = a + Math.PI / 5;
        c.poly([[w / 2 + Math.cos(a) * w * 0.44, h / 2 + Math.sin(a) * h * 0.44], [w / 2 + Math.cos(a2) * w * 0.18, h / 2 + Math.sin(a2) * h * 0.18], [w / 2 + Math.cos(a + (Math.PI * 2) / 5) * w * 0.44, h / 2 + Math.sin(a + (Math.PI * 2) / 5) * h * 0.44]], col, 0.95);
      }
    }),
  };
}

// ---------------------------------------------------------------------------
// Job cards (320x424) - holographic frame + portrait well + passive well
// ---------------------------------------------------------------------------
export function jobCards() {
  const out = {};
  const accents = [SPACE.amber, [120, 200, 255], [110, 240, 190], [255, 200, 120], [190, 140, 255]];
  for (let i = 0; i < 5; i++) {
    const w = 320;
    const h = 424;
    const c = new Canvas(w, h);
    const col = accents[i];
    const rng = new Rng(900 + i);

    // card body
    c.rect(2, 2, w - 4, h - 4, [14, 18, 30], 0.97);
    for (let y = 2; y < h - 2; y++) {
      const t = (y - 2) / (h - 4);
      c.rect(2, y, w - 4, 1, mix([26, 34, 54], [12, 16, 26], t), 0.5);
    }
    // border + corner brackets
    const border = (x0, y0, x1, y1, a = 0.9) => {
      c.rect(x0, y0, x1 - x0, 3, col, a);
      c.rect(x0, y1 - 3, x1 - x0, 3, col, a);
      c.rect(x0, y0, 3, y1 - y0, col, a);
      c.rect(x1 - 3, y0, 3, y1 - y0, col, a);
    };
    border(6, 6, w - 6, h - 6, 0.85);
    for (const [bx, by, sx, sy] of [[6, 6, 1, 1], [w - 6, 6, -1, 1], [6, h - 6, 1, -1], [w - 6, h - 6, -1, -1]]) {
      c.rect(Math.min(bx, bx + sx * 34), Math.min(by, by + sy * 6), 34, 6, mix(col, WHITE, 0.5), 0.95);
      c.rect(Math.min(bx, bx + sx * 6), Math.min(by, by + sy * 34), 6, 34, mix(col, WHITE, 0.5), 0.95);
    }

    // title strip
    c.rect(18, 18, w - 36, 34, [22, 28, 46], 0.95);
    c.rect(18, 48, w - 36, 3, col, 0.9);
    for (let k = 0; k < 14; k++) c.rect(24 + k * 20, 24, 12, 3, mix(col, WHITE, 0.4), 0.4);

    // portrait well (the game draws Archer_N inside it)
    const px0 = 26;
    const py0 = 64;
    const pw = w - 52;
    const ph = 196;
    c.rect(px0, py0, pw, ph, [10, 14, 24], 0.95);
    for (let y = py0; y < py0 + ph; y += 4) c.rect(px0, y, pw, 1, col, 0.06);
    for (let x = px0; x < px0 + pw; x += 4) c.rect(x, py0, 1, ph, col, 0.05);
    border(px0, py0, px0 + pw, py0 + ph, 0.55);
    // corner ticks inside the well
    for (const [cx0, cy0, sx, sy] of [[px0 + 8, py0 + 8, 1, 1], [px0 + pw - 8, py0 + 8, -1, 1], [px0 + 8, py0 + ph - 8, 1, -1], [px0 + pw - 8, py0 + ph - 8, -1, -1]]) {
      c.rect(Math.min(cx0, cx0 + sx * 18), cy0, 18, 2, col, 0.8);
      c.rect(cx0, Math.min(cy0, cy0 + sy * 18), 2, 18, col, 0.8);
    }
    // radial vignette so the portrait pops
    for (let y = py0; y < py0 + ph; y++) {
      for (let x = px0; x < px0 + pw; x++) {
        const d = Math.hypot((x - (px0 + pw / 2)) / (pw / 2), (y - (py0 + ph / 2)) / (ph / 2));
        if (d > 0.7) c.blend(x, y, [4, 6, 12], clamp((d - 0.7) / 0.6) * 0.7);
      }
    }

    // passive / text well
    const ty0 = py0 + ph + 12;
    const th = 92;
    c.rect(26, ty0, w - 52, th, [20, 25, 40], 0.92);
    c.rect(26, ty0, w - 52, 2, col, 0.7);
    for (let k = 0; k < 4; k++) c.rect(38, ty0 + 20 + k * 16, (w - 96) * rng.range(0.5, 0.95), 3, mix(col, WHITE, 0.3), 0.28);

    // skill slot recesses
    const sy0 = ty0 + th + 14;
    for (let s = 0; s < 3; s++) {
      const sw = 78;
      const sx = 26 + s * (sw + 12);
      c.rect(sx, sy0, sw, 78, [12, 16, 26], 0.95);
      border(sx, sy0, sx + sw, sy0 + 78, 0.4);
      for (let k = 0; k < 26; k++) c.rect(sx + 4, sy0 + 4 + k * 3, sw - 8, 1, col, 0.04);
    }
    // bottom rail
    c.rect(18, h - 40, w - 36, 24, [22, 28, 46], 0.9);
    for (let k = 0; k < 10; k++) c.rect(28 + k * 26, h - 32, 16, 4, mix(col, WHITE, 0.4), 0.35);

    out[`job_card_${i}`] = c.glow(3, 0.3, 200);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Talent tree: node geometry (white silhouettes) + a small glyph library
// ---------------------------------------------------------------------------
function roundedPoly(w, h, sides, { rotate = 0, inset = 6, radius = 0.18 } = {}) {
  const pts = [];
  const cx = w / 2;
  const cy = h / 2;
  const R = Math.min(w, h) / 2 - inset;
  for (let i = 0; i < sides; i++) {
    const a = rotate + (i / sides) * Math.PI * 2;
    pts.push([cx + Math.cos(a) * R, cy + Math.sin(a) * R]);
  }
  return pts;
}

function strokePoly(c, pts, width, a = 1) {
  for (let i = 0; i < pts.length; i++) {
    const [ax, ay] = pts[i];
    const [bx, by] = pts[(i + 1) % pts.length];
    c.line(ax, ay, bx, by, width, WHITE, a);
  }
  for (const [x, y] of pts) c.disc(x, y, width * 0.5, WHITE, a, 0.8);
}

/** The two node shapes in their off/on states plus the two highlighters. */
export function treeShapes() {
  const out = {};
  const box = (w, h, sides, rotate) => {
    const pts = roundedPoly(w, h, sides, { rotate, inset: 5 });
    return { pts };
  };

  // base node: hexagon outline (off) / filled with inner ring (on)
  {
    const off = new Canvas(63, 62);
    const { pts } = box(63, 62, 6, Math.PI / 6);
    strokePoly(off, pts, 5, 1);
    out['tree/Slider_Level_01_Bg_3__1085'] = off.glow(2, 0.5, 200);

    const on = new Canvas(63, 62);
    on.poly(pts, WHITE, 0.22);
    strokePoly(on, pts, 5, 1);
    const inner = roundedPoly(63, 62, 6, { rotate: Math.PI / 6, inset: 13 });
    strokePoly(on, inner, 3, 0.8);
    out['tree/Slider_Level_01_Bg_4__1093'] = on.glow(3, 0.6, 190);

    const hi = new Canvas(90, 90);
    const hpts = roundedPoly(90, 90, 6, { rotate: Math.PI / 6, inset: 4 });
    strokePoly(hi, hpts, 5, 0.95);
    const h2 = roundedPoly(90, 90, 6, { rotate: Math.PI / 6, inset: 12 });
    strokePoly(hi, h2, 2, 0.5);
    out['tree/Slider_Level_01_Bg_5__978'] = hi.glow(3, 0.6, 190);
  }

  // portal node: diamond (rotated square) in the same three states
  {
    const off = new Canvas(68, 70);
    const pts = roundedPoly(68, 70, 4, { rotate: Math.PI / 4, inset: 7 });
    strokePoly(off, pts, 5, 1);
    out['tree/Alert_Diamond_White_Bg_2__1150'] = off.glow(2, 0.5, 200);

    const on = new Canvas(68, 70);
    on.poly(pts, WHITE, 0.22);
    strokePoly(on, pts, 5, 1);
    strokePoly(on, roundedPoly(68, 70, 4, { rotate: Math.PI / 4, inset: 16 }), 3, 0.8);
    out['tree/Alert_Diamond_White_Bg_1__1022'] = on.glow(3, 0.6, 190);

    const hi = new Canvas(92, 94);
    strokePoly(hi, roundedPoly(92, 94, 4, { rotate: Math.PI / 4, inset: 5 }), 5, 0.95);
    strokePoly(hi, roundedPoly(92, 94, 4, { rotate: Math.PI / 4, inset: 14 }), 2, 0.5);
    out['tree/Alert_Diamond_White_Bg_3__1037'] = hi.glow(3, 0.6, 190);
  }

  return out;
}

/**
 * 14 reusable white glyphs. `S1..S14` map onto the 89 tree icons so the whole
 * tree can be produced from a handful of shapes.
 */
export const TREE_SYMBOLS = {
  // NOTE: every one of these is drawn with WHITE ink ONLY. The talent panel
  // multiplies a colour over the sprite, so any dark pixel would show as black
  // rather than as a hole. "Holes" are therefore done with thin lines, never
  // by painting dark pixels.
  S1(c, w, h) {
    // power / arrow up
    c.poly([[w * 0.5, h * 0.16], [w * 0.82, h * 0.56], [w * 0.62, h * 0.56], [w * 0.62, h * 0.84], [w * 0.38, h * 0.84], [w * 0.38, h * 0.56], [w * 0.18, h * 0.56]], WHITE, 1);
  },
  S2(c, w, h) {
    // vitality cross
    c.rect(w * 0.42, h * 0.16, w * 0.16, h * 0.68, WHITE, 1);
    c.rect(w * 0.16, h * 0.42, w * 0.68, h * 0.16, WHITE, 1);
  },
  S3(c, w, h) {
    // crit burst
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.line(w / 2 + Math.cos(a) * w * 0.16, h / 2 + Math.sin(a) * h * 0.16, w / 2 + Math.cos(a) * w * 0.44, h / 2 + Math.sin(a) * h * 0.44, w * 0.09, WHITE, 1);
    }
    c.disc(w / 2, h / 2, w * 0.15, WHITE, 1, 1.2);
  },
  S4(c, w, h) {
    // coin stack
    for (let i = 0; i < 3; i++) {
      const y = h * (0.58 - i * 0.19);
      c.arc(w / 2, y, w * 0.3, h * 0.11, 0, Math.PI, WHITE, 1, 1.2);
      c.rect(w * 0.2, y, w * 0.6, h * 0.09, WHITE, 1);
    }
  },
  S5(c, w, h) {
    // crate / drop pod (lid line reads as an edge, not a hole)
    c.rect(w * 0.18, h * 0.34, w * 0.64, h * 0.5, WHITE, 1);
    c.arc(w / 2, h * 0.34, w * 0.32, h * 0.14, Math.PI, Math.PI * 2, WHITE, 1, 1.2);
    c.rect(w * 0.18, h * 0.44, w * 0.64, h * 0.06, WHITE, 0.45);
  },
  S6(c, w, h) {
    // speed / lightning
    c.poly([[w * 0.58, h * 0.14], [w * 0.3, h * 0.54], [w * 0.47, h * 0.54], [w * 0.4, h * 0.88], [w * 0.7, h * 0.44], [w * 0.52, h * 0.44]], WHITE, 1);
  },
  S7(c, w, h) {
    // shield outline (hollow by construction)
    c.poly([[w * 0.5, h * 0.14], [w * 0.84, h * 0.32], [w * 0.76, h * 0.66], [w * 0.5, h * 0.88], [w * 0.24, h * 0.66], [w * 0.16, h * 0.32]], WHITE, 1);
    c.poly([[w * 0.5, h * 0.26], [w * 0.72, h * 0.38], [w * 0.66, h * 0.62], [w * 0.5, h * 0.76], [w * 0.34, h * 0.62], [w * 0.28, h * 0.38]], WHITE, 0.35);
  },
  S8(c, w, h) {
    // drone / pet (swept wings + fuselage)
    c.poly([[w * 0.14, h * 0.66], [w * 0.5, h * 0.36], [w * 0.86, h * 0.66], [w * 0.5, h * 0.58]], WHITE, 1);
    c.rect(w * 0.44, h * 0.3, w * 0.12, h * 0.4, WHITE, 0.9);
  },
  S9(c, w, h) {
    // clock: ring outline + hands
    const R = Math.min(w, h) * 0.34;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      c.disc(w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R, w * 0.045, WHITE, 1, 0.7);
    }
    c.rect(w * 0.47, h * 0.3, w * 0.06, h * 0.26, WHITE, 1);
    c.rect(w * 0.47, h * 0.47, w * 0.2, h * 0.06, WHITE, 1);
    c.disc(w / 2, h / 2, w * 0.07, WHITE, 1, 0.8);
  },
  S10(c, w, h) {
    // pick / drill
    c.line(w * 0.22, h * 0.8, w * 0.7, h * 0.24, w * 0.11, WHITE, 1);
    c.arc(w * 0.72, h * 0.22, w * 0.24, w * 0.09, Math.PI * 1.02, Math.PI * 1.98, WHITE, 1, 1.4);
  },
  S11(c, w, h) {
    // open book / document (two white leaves with a gap = the spine)
    c.poly([[w * 0.12, h * 0.34], [w * 0.46, h * 0.24], [w * 0.46, h * 0.78], [w * 0.12, h * 0.72]], WHITE, 1);
    c.poly([[w * 0.88, h * 0.34], [w * 0.54, h * 0.24], [w * 0.54, h * 0.78], [w * 0.88, h * 0.72]], WHITE, 1);
  },
  S12(c, w, h) {
    // faction crest: ring + arrowhead
    const R = Math.min(w, h) * 0.34;
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      c.disc(w / 2 + Math.cos(a) * R, h / 2 + Math.sin(a) * R, w * 0.045, WHITE, 1, 0.7);
    }
    c.poly([[w * 0.5, h * 0.28], [w * 0.7, h * 0.66], [w * 0.5, h * 0.6], [w * 0.3, h * 0.66]], WHITE, 1);
  },
  S13(c, w, h) {
    // waypoint: diamond ring + centre dot
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      const x = w / 2 + Math.cos(a) * (Math.min(w, h) * 0.36);
      const y = h / 2 + Math.sin(a) * (Math.min(w, h) * 0.36);
      const dx = x - w / 2;
      const dy = y - h / 2;
      c.disc(w / 2 + dx * 0.9 + dy * 0.9, h / 2 + dy * 0.9 - dx * 0.9, w * 0.045, WHITE, 1, 0.7);
    }
    c.disc(w / 2, h / 2, w * 0.1, WHITE, 1, 0.8);
  },
  S14(c, w, h) {
    // gear: teeth + ring (hollow centre)
    const cx = w / 2;
    const cy = h / 2;
    const R = Math.min(w, h) * 0.34;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.rect(cx + Math.cos(a) * R - w * 0.07, cy + Math.sin(a) * R - h * 0.07, w * 0.14, h * 0.14, WHITE, 1);
    }
    for (let i = 0; i < 44; i++) {
      const a = (i / 44) * Math.PI * 2;
      c.disc(cx + Math.cos(a) * R * 0.72, cy + Math.sin(a) * R * 0.72, w * 0.06, WHITE, 1, 0.7);
    }
  },
};

/** Builds one white tree glyph at the requested size. */
export function treeGlyph(symbol, w, h) {
  const c = new Canvas(w, h);
  (TREE_SYMBOLS[symbol] ?? TREE_SYMBOLS.S11)(c, w, h);
  // keep them crisp: a 1px glow so the multiply tint has something to bite on
  return c.glow(1, 0.25, 200);
}

export { plate, spark, glyphIcon, WHITE };
