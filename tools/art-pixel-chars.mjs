/**
 * Pixel-art cast: the archer (five outfit skins), five minion families + the
 * flying drones, the King, the run portal and the three pets.
 *
 * All of these are drawn bottom-anchored on their original canvases: the last
 * cell row is the feet / ground contact, the same convention the renderer and
 * the extracted pivots use. Flying units hover inside the canvas instead.
 */
import { Px } from './pixel-core.mjs';

// ------------------------------------------------------------------- archer

/**
 * Five outfits, one silhouette. Trim/visor colours are what the player reads
 * when a job unlocks, so they are the only things that change.
 */
export const ARCHER_SKINS = [
  {
    name: 'standard',
    suit: 'white', mid: 'ice', shade: 'steel3',
    trim: 'amber', trim2: 'orange',
    visor: 'cyan', visor2: 'cyan2',
    pack: 'steel2', pack2: 'steel', boot: 'steel2', glow: 'cyan',
  },
  {
    name: 'scout',
    suit: 'ice', mid: 'white', shade: 'cyan2',
    trim: 'cyan', trim2: 'teal',
    visor: 'mint', visor2: 'teal',
    pack: 'steel2', pack2: 'steel', boot: 'steel2', glow: 'cyan',
  },
  {
    name: 'engineer',
    suit: 'mint', mid: 'lime', shade: 'teal',
    trim: 'lime', trim2: 'green',
    visor: 'cyan', visor2: 'cyan2',
    pack: 'steel2', pack2: 'steel3', boot: 'steel2', glow: 'lime',
  },
  {
    name: 'sniper',
    suit: 'amber', mid: 'gold', shade: 'rust',
    trim: 'ice', trim2: 'steel3',
    visor: 'cyan', visor2: 'cyan2',
    pack: 'steel2', pack2: 'steel', boot: 'rust', glow: 'amber',
  },
  {
    name: 'void',
    suit: 'violet', mid: 'violet2', shade: 'plum',
    trim: 'magenta', trim2: 'violet',
    visor: 'magenta', visor2: 'violet',
    pack: 'shadow', pack2: 'plum', boot: 'shadow', glow: 'magenta',
  },
];

/**
 * Paint a sprite given as row segments: `rows[y]` is a list of `[startCol, "chars"]`.
 * Dot = transparent. Text is never padded, so a segment can never drift: there is
 * no character counting to get wrong.
 */
function mask(c, rows, map, dx = 0, dy = 0) {
  for (let y = 0; y < rows.length; y++) {
    for (const [x0, text] of rows[y] ?? []) {
      for (let i = 0; i < text.length; i++) {
        const ch = text[i];
        if (ch === '.') continue;
        const col = map[ch];
        if (!col) throw new Error(`sprite: unmapped char "${ch}" at row ${y}`);
        c.set(dx + x0 + i, dy + y, col);
      }
    }
  }
  return c;
}

/**
 * The archer, hand-laid on a 25x30 cell grid (150x176 canvas).
 *
 * The outline pass supplies the dark rim, so the mask carries only material
 * colours. Facing right, feet on the last row, carbine in the extended right hand.
 */
/**
 * Six-frame walk, authored to the cycle the design calls for:
 *
 *  1. left leg pushes back, right foot lands ahead
 *  2. right leg takes the weight, knee bent, body dips, left foot lifts
 *  3. right leg extends back, left leg swings forward
 *  4-6. the same three poses with left/right swapped
 *
 * The legs are 3 cells wide and use different values: the FAR (left) leg is mid/shade and
 * the NEAR (right) leg is light, so the two never read as one column even when they pass
 * each other. `knee` is the knee's x, which is what makes a planted leg look bent.
 */
const ARCHER_STEPS = [
  // Eight-frame cycle: contact / down / passing / up, then the same four mirrored.
  // The support foot keeps the SAME x from contact to down (no drift while it carries
  // weight), then travels backwards through passing/up as the body moves over it.
  // `bend` is the knee's forward offset on the weight-bearing leg; 0 is a straight leg.
  // 1 contact: left pushes back, right heel strikes ahead
  { l: { foot: 8, lift: 0, bend: 0 }, r: { foot: 16, lift: 0, bend: 0 }, bob: 0 },
  // 2 down: right foot planted (same x), knee absorbs, body drops, left starts to lift
  { l: { foot: 9, lift: 1, bend: 0 }, r: { foot: 16, lift: 0, bend: 2 }, bob: 1 },
  // 3 passing: the planted leg is vertical; the swing leg is bent and lifted so the two
  // never form a symmetric X.
  { l: { foot: 11, lift: 2, bend: 1 }, r: { foot: 13, lift: 0, bend: 0 }, bob: 0 },
  // 4 up: right pushes back, left reaches forward but is still off the ground
  { l: { foot: 16, lift: 1, bend: 1 }, r: { foot: 10, lift: 0, bend: 0 }, bob: 0 },
  // 5 contact (mirror of 1)
  { l: { foot: 16, lift: 0, bend: 0 }, r: { foot: 8, lift: 0, bend: 0 }, bob: 0 },
  // 6 down (mirror of 2)
  { l: { foot: 16, lift: 0, bend: 2 }, r: { foot: 9, lift: 1, bend: 0 }, bob: 1 },
  // 7 passing (mirror of 3)
  { l: { foot: 13, lift: 0, bend: 0 }, r: { foot: 11, lift: 2, bend: 1 }, bob: 0 },
  // 8 up (mirror of 4)
  { l: { foot: 10, lift: 0, bend: 0 }, r: { foot: 16, lift: 1, bend: 1 }, bob: 0 },
];
function drawArcher(skin, w = 150, h = 176, frame = 0) {
  const c = new Px(w, h, 25, 30);
  const map = {
    H: skin.suit,   // helmet / suit light
    s: skin.mid,    // suit mid
    d: skin.shade,  // suit shadow
    V: skin.visor,  // visor bright
    v: skin.visor2, // visor dark
    A: skin.trim,   // accent
    a: skin.trim2,  // accent dark
    P: skin.pack,   // backpack
    p: skin.pack2,
    i: 'ice',       // bowstring / arrow
    B: skin.boot,   // boots
    G: skin.glow,   // energy
  };

  // Idle: two thick vertical thighs side by side under the pelvis. The walking poses use
  // a single shared hip so the legs can swing past each other; the standing pose must NOT
  // do that, or the legs fork right below the waist.
  const idle = frame === 0;
  // Jetpack: two tanks on the back with a cyan core, downward nozzles and a short exhaust
  // plume. This is what the hover pose is "standing" on, so the float has a visible cause.
  c.rect(4, 9, 3, 6, 'steel2');
  c.rect(5, 9, 1, 6, 'steel3');
  c.rect(7, 10, 2, 5, 'steel');
  c.rect(8, 10, 1, 5, 'steel3');
  c.rect(4, 13, 3, 1, 'cyan');
  c.rect(7, 13, 2, 1, 'cyan');
  c.rect(4, 15, 1, 1, 'steel3');
  c.rect(6, 15, 1, 1, 'steel3');
  c.rect(4, 16, 1, 3, 'cyan', 0.65);
  c.rect(6, 16, 1, 3, 'cyan', 0.5);
  c.set(4, 19, 'ice', 0.55);
  c.set(6, 19, 'ice', 0.4);
  c.set(5, 11, 'cyan', 0.9);
  const step = idle
    ? { l: { hip: 9, foot: 9, lift: 0, bend: 0 }, r: { hip: 13, foot: 13, lift: 0, bend: 0 }, bob: 0 }
    : ARCHER_STEPS[Math.max(0, Math.min(ARCHER_STEPS.length - 1, frame - 1))];

  // Helmet + torso, 14 rows. `mask` takes a y offset, so the body can dip one cell
  // without touching the legs.
  const BODY = [
    [[10, 'HHHH']],
    [[9, 'HHHHHH']],
    [[9, 'HHHVVV']],
    [[9, 'HHHVVV']],
    [[9, 'HHHHHH']],
    [[10, 'HHHH']],
    [[8, 'HsssssssH']],
    [[5, 'PPP'], [9, 'HssAAssH'], [16, 'sH']],
    [[5, 'pPP'], [9, 'HssAAssH'], [17, 'sH']],
    [[5, 'PPP'], [9, 'HssssssH'], [19, 's']],
    [[5, 'PPP'], [7, 'A'], [9, 'HssssssH'], [19, 's']],
    [[7, 'PP'], [9, 'AAAAAAA']],
    [[9, 'HssssssH']],
    [[9, 'HssssssH']],
  ];
  mask(c, BODY, map, 0, 3 + step.bob);

  // One leg = thigh (hip -> knee) + shin (knee -> ankle) + boot. Two segments is enough
  // to show a bent knee at this resolution.
  const drawLeg = (hip, pose, main, hi, boot, width) => {
    const end = 25 - pose.lift;
    const knee = Math.round((hip + pose.foot) / 2) + pose.bend;
    for (let y = 17; y <= end; y++) {
      let x;
      if (pose.bend === 0) {
        // One straight line from hip to foot: no knee kink at all.
        x = Math.round(hip + ((pose.foot - hip) * (y - 17)) / Math.max(1, end - 17));
      } else if (y <= 21) {
        x = Math.round(hip + ((knee - hip) * (y - 17)) / 4);
      } else {
        x = Math.round(knee + ((pose.foot - knee) * (y - 21)) / Math.max(1, end - 21));
      }
      c.hline(x, x + width - 1, y, main);
      // A light highlight down the middle gives the leg a round read at 6px cells.
      if (width >= 3) c.set(x + 1, y, hi);
      else c.set(x + 1, y, hi);
    }
    // The near boot is one cell wider than the far one, which adds to the depth read.
    c.rect(pose.foot - 1, 26 - pose.lift, Math.min(4, width + 1), 3, boot);
  };

  // Far leg first, then the near leg over it: the value split is what distinguishes
  // left from right.
  // Both legs swing from the SAME hip point (side view): a 4-cell hip offset made the far
  // leg's forward step physically cross over the near leg. Depth comes from the value
  // split and draw order, not from spreading the hips apart.
  // EXACTLY the same hip x for both legs: any offset makes the rear leg cross the front
  // one when they pass. Depth is conveyed by value and draw order only.
  if (idle) {
    // Hover idle: the thighs are one 8-cell block at the pelvis (same width as the waist),
    // and each leg stays a CONTINUOUS 4-cell column that drifts one cell outward toward
    // the ankle. The earlier version narrowed the shins by a cell right under the block,
    // which read as a dislocation; this interpolates instead of stepping.
    for (let y = 17; y <= 20; y++) {
      c.hline(9, 12, y, skin.shade);
      c.hline(13, 16, y, skin.suit);
    }
    for (let y = 21; y <= 25; y++) {
      const t = (y - 21) / 4;
      const fx = 9 - Math.round(t);
      const nx = 13 + Math.round(t);
      c.hline(fx, fx + 3, y, skin.shade);
      c.set(fx + 1, y, skin.mid);
      c.hline(nx, nx + 3, y, skin.suit);
      c.set(nx + 1, y, skin.mid);
    }
    c.rect(7, 26, 4, 3, skin.pack2);    // far boot
    c.rect(14, 26, 4, 3, skin.boot);    // near boot, planted apart
  } else {
    // Walking: the upper thighs stay ONE 8-cell block under the waist (same as standing),
    // and only the shins swing below the knees. Starting both legs at one point made the
    // thigh mass 4 cells wide and it read as pinched right under the waist.
    for (let y = 17; y <= 20; y++) {
      c.hline(9, 12, y, skin.shade);
      c.hline(13, 16, y, skin.suit);
    }
    const shin = (kneeX, pose, main, hi, boot, width) => {
      const end = 25 - pose.lift;
      for (let y = 21; y <= end; y++) {
        const t = (y - 21) / Math.max(1, end - 21);
        const x = Math.round(kneeX + (pose.foot - kneeX) * t);
        c.hline(x, x + width - 1, y, main);
        c.set(x + 1, y, hi);
      }
      c.rect(pose.foot - 1, 26 - pose.lift, Math.min(4, width + 1), 3, boot);
    };
    shin(11 + (step.l.bend ?? 0), step.l, skin.shade, skin.mid, skin.pack2, 3);
    shin(14 + (step.r.bend ?? 0), step.r, skin.suit, skin.mid, skin.boot, 4);
  }
  // Energy carbine, held at chest height and pointing right; it dips with the body so it
  // never detaches from the hand.
  const gy = step.bob;
  c.rect(13, 12 + gy, 2, 2, 'steel2');            // stock
  c.set(13, 13 + gy, 'steel');
  c.hline(15, 19, 12 + gy, skin.trim2);           // receiver
  c.hline(15, 19, 13 + gy, 'steel2');
  c.hline(16, 21, 11 + gy, 'steel3');             // top rail
  c.set(20, 10 + gy, skin.trim);                  // front sight
  c.rect(16, 14 + gy, 2, 1, skin.glow, 0.85);     // energy cell
  c.rect(18, 14 + gy, 2, 2, skin.trim2);          // grip / hand
  c.hline(20, 23, 12 + gy, 'steel');              // barrel
  c.hline(20, 23, 13 + gy, 'steel2');
  c.set(23, 12 + gy, 'ice');
  c.set(24, 12 + gy, skin.glow);                  // muzzle

  c.outline('shadow');
  return c;
}

export function archerSkins(sizes, frame = 0) {
  const out = [];
  for (let i = 0; i < sizes.length; i++) {
    const [w, h] = sizes[i] ?? [150, 176];
    out.push(drawArcher(ARCHER_SKINS[i % ARCHER_SKINS.length], w, h, frame));
  }
  return out;
}

// ---------------------------------------------------------------- minions

/** Claw family: a rust-red six-legged crawler. 21x18 cells. */
function crawler(rng) {
  const c = new Px(250, 214, 21, 18);
  // legs: three pairs, bent, drawn behind the shell
  const legs = [
    [5, 11, 3, 14, 2, 17],
    [8, 11, 7, 14, 6, 17],
    [12, 11, 12, 14, 12, 17],
    [15, 11, 16, 14, 18, 16],
    [16, 10, 18, 12, 20, 13],
  ];
  for (const [x0, y0, x1, y1, x2, y2] of legs) {
    c.line(x0, y0, x1, y1, 'steel2', 1);
    c.line(x1, y1, x2, y2, 'steel2', 1);
    c.set(x2, y2, 'steel3', 0.8);
    c.set(x1, y1, 'steel3', 0.5);
  }
  // carapace: a proper dome, flat underside
  c.poly([[3, 11], [4, 7], [7, 4], [12, 4], [16, 7], [17, 11]], 'rust');
  c.poly([[7, 4], [12, 4], [15, 6], [8, 6]], 'orange');
  c.hline(4, 16, 11, 'shadow', 0.55);
  // segment seams
  for (let x = 7; x < 16; x += 3) c.line(x, 5, x - 1, 10, 'shadow', 1, 0.4);
  // dorsal spikes
  for (const [x, h] of [[6, 2], [9, 3], [12, 2]]) {
    c.poly([[x - 1, 4], [x + 1, 4], [x, 4 - h]], 'steel2');
    c.set(x, 4 - h, 'steel3', 0.9);
  }
  // head + two eyes
  c.poly([[15, 7], [20, 9], [20, 11], [15, 11]], 'rust');
  c.hline(16, 20, 8, 'orange', 0.8);
  c.set(18, 9, 'amber');
  c.set(18, 10, 'amber');
  c.set(19, 10, 'amber', 0.6);
  c.line(20, 10, 20, 12, 'shadow');
  // warning slashes
  c.vline(6, 8, 10, 'amber', 0.8);
  c.vline(10, 8, 10, 'amber', 0.5);
  c.outline('shadow');
  return c;
}

/** Warrior family: a heavy two-legged mech. 32x22 cells. */
function heavyMech(rng) {
  const c = new Px(256, 176, 32, 22);
  // legs
  for (const x of [8, 19]) {
    c.rect(x, 14, 5, 6, 'steel2');
    c.rect(x, 14, 2, 6, 'steel');
    c.rect(x - 1, 20, 7, 2, 'indigo');
    c.hline(x - 1, x + 5, 20, 'steel3', 0.5);
    c.rect(x + 1, 16, 3, 2, 'shadow', 0.6);
  }
  // hip block
  c.rect(7, 12, 18, 4, 'steel2');
  c.hline(7, 24, 12, 'steel3', 0.7);
  // torso
  c.poly([[6, 6], [26, 6], [24, 13], [8, 13]], 'steel2');
  c.poly([[6, 6], [26, 6], [25, 8], [7, 8]], 'steel');
  c.rect(14, 8, 4, 3, 'indigo');
  c.rect(15, 8, 2, 2, 'amber');
  c.set(15, 8, 'gold');
  // shoulders
  for (const [x, w] of [[3, 5], [24, 5]]) {
    c.rect(x, 5, w, 5, 'steel');
    c.rect(x, 5, w, 1, 'steel3', 0.8);
    c.rect(x, 9, w, 1, 'shadow', 0.5);
  }
  // cannon arm (right)
  c.rect(26, 8, 6, 3, 'steel2');
  c.rect(30, 8, 2, 2, 'shadow');
  c.set(31, 8, 'amber');
  c.rect(26, 8, 6, 1, 'steel3', 0.7);
  // gauntlet (left)
  c.rect(1, 8, 4, 4, 'steel2');
  c.vline(1, 8, 11, 'steel3', 0.6);
  // head + visor
  c.rect(12, 2, 8, 5, 'steel2');
  c.rect(12, 2, 8, 1, 'steel3', 0.9);
  c.rect(14, 4, 5, 2, 'shadow');
  c.rect(15, 4, 3, 1, 'amber');
  c.set(15, 4, 'gold');
  // antenna
  c.vline(19, 0, 2, 'steel3', 0.8);
  c.set(19, 0, 'red');
  c.outline('shadow');
  return c;
}

/** Archer family: a hovering gun platform. 21x18 cells. */
function hoverTurret(rng) {
  const c = new Px(256, 211, 21, 18);
  // hover plume
  for (let x = 6; x <= 14; x += 2) {
    c.line(x, 13, x - 1, 17, 'cyan', 1, 0.35);
    c.set(x - 1, 17, 'cyan', 0.2);
  }
  // chassis
  c.poly([[4, 6], [15, 5], [18, 8], [17, 12], [6, 13], [3, 10]], 'steel2');
  c.poly([[4, 6], [15, 5], [16, 7], [5, 9]], 'steel');
  c.hline(4, 15, 5, 'steel3', 0.7);
  // side fins
  c.poly([[3, 9], [0, 7], [1, 11]], 'steel2');
  c.poly([[10, 13], [8, 16], [13, 14]], 'steel2');
  // cannon
  c.rect(16, 7, 5, 2, 'steel');
  c.rect(16, 7, 5, 1, 'steel3', 0.7);
  c.set(21, 7, 'steel3');
  // optic
  c.disc(13, 8, 1.6, 'shadow');
  c.set(13, 8, 'mint');
  c.set(12, 8, 'mint', 0.5);
  // vents
  c.rect(6, 9, 3, 2, 'indigo');
  c.set(6, 9, 'cyan', 0.7);
  c.set(8, 9, 'cyan', 0.7);
  c.outline('shadow');
  return c;
}

/** Mage family: a floating energy core. 19x21 cells. */
function energyCore(rng) {
  const c = new Px(225, 256, 19, 21);
  // Core first, so the outline pass wraps only the solid body; the orbit rings
  // are painted afterwards (outlining a 1-cell ring turns it into a black grid).
  c.poly([[9, 3], [14, 9], [9, 15], [4, 9]], 'violet2');
  c.poly([[9, 4], [12, 9], [9, 13], [6, 9]], 'violet');
  c.poly([[9, 6], [11, 9], [9, 11], [7, 9]], 'magenta');
  // tendrils
  for (const [x0, x1] of [[6, 4], [9, 9], [12, 14]]) {
    c.line(x0, 15, x1, 19, 'violet', 1, 0.85);
    c.set(x1, 19, 'magenta', 0.7);
  }
  c.outline('shadow');

  // Orbit rings on top: 2 cells thick so they stay solid after rasterising.
  c.ring(9, 9, 7.2, 1.6, 'violet', 0.85);
  c.ring(9, 9, 8.6, 1, 'plum', 0.55);
  for (const a of [0.5, 1.9, 3.4, 4.8, 5.9]) {
    c.set(9 + Math.cos(a) * 7.2, 9 + Math.sin(a) * 7.2, 'magenta');
  }
  c.set(9, 8, 'white');
  c.set(9, 9, 'magenta');
  // floating motes
  for (const [x, y] of [[3, 5], [16, 7], [4, 14], [15, 15]]) c.set(x, y, 'violet2', 0.6);
  return c;
}

/** Bat family: a small scout drone. 13x14 cells. */
function scoutDrone(rng) {
  const c = new Px(118, 123, 13, 14);
  // rotor wings
  c.poly([[5, 5], [0, 2], [1, 6], [4, 8]], 'indigo');
  c.poly([[8, 5], [12, 2], [11, 6], [8, 8]], 'indigo');
  c.line(0, 2, 4, 3, 'steel3', 1, 0.6);
  c.line(12, 2, 8, 3, 'steel3', 1, 0.6);
  // body
  c.ellipse(6.5, 7.5, 3.2, 3.8, 'steel2');
  c.ellipse(6.5, 6.6, 2.6, 2.2, 'steel');
  c.hline(4, 9, 5, 'steel3', 0.7);
  // eyes + thruster
  c.set(5, 7, 'cyan');
  c.set(8, 7, 'cyan');
  c.set(6, 8, 'shadow');
  c.set(6, 11, 'cyan', 0.8);
  c.set(6, 12, 'cyan', 0.35);
  c.set(5, 11, 'cyan', 0.35);
  c.set(7, 11, 'cyan', 0.35);
  c.outline('shadow');
  return c;
}

/** Guardian Bat: a drone carrier. 32x25 cells. */
function carrierDrone(rng) {
  const c = new Px(256, 201, 32, 25);
  // lower hull
  c.poly([[3, 12], [29, 12], [26, 18], [6, 18]], 'steel2');
  c.poly([[3, 12], [29, 12], [28, 14], [4, 14]], 'steel');
  // upper hull
  c.poly([[6, 7], [26, 7], [29, 12], [3, 12]], 'indigo');
  c.hline(6, 26, 7, 'steel', 0.9);
  // flight deck stripe
  c.hline(7, 25, 9, 'amber', 0.45);
  // hangar slots
  for (const x of [8, 13, 18, 23]) {
    c.rect(x, 12, 3, 4, 'shadow');
    c.hline(x, x + 2, 15, 'cyan', 0.7);
  }
  // wing fins
  c.poly([[3, 11], [0, 6], [5, 9]], 'steel2');
  c.poly([[29, 11], [32, 6], [27, 9]], 'steel2');
  // thrusters
  for (const x of [6, 11, 21, 26]) {
    c.rect(x, 18, 3, 2, 'steel');
    c.set(x + 1, 20, 'cyan', 0.9);
    c.set(x + 1, 21, 'cyan', 0.35);
  }
  // bridge
  c.rect(14, 4, 5, 3, 'steel2');
  c.rect(15, 5, 3, 1, 'cyan');
  c.vline(16, 0, 3, 'steel3', 0.7);
  c.set(16, 0, 'red');
  c.outline('shadow');
  return c;
}

/** The King: a tall crowned war machine. 28x44 cells. */
function kingBoss(rng) {
  const c = new Px(277, 439, 28, 44);
  // legs
  for (const x of [7, 16]) {
    c.rect(x, 30, 5, 12, 'indigo');
    c.rect(x, 30, 2, 12, 'steel2');
    c.rect(x - 1, 41, 7, 3, 'shadow');
    c.hline(x - 1, x + 5, 41, 'magenta', 0.5);
    c.rect(x + 1, 33, 3, 5, 'shadow', 0.5);
  }
  // pelvis
  c.rect(6, 26, 17, 5, 'indigo');
  c.hline(6, 22, 26, 'steel', 0.6);
  // torso
  c.poly([[5, 12], [23, 12], [21, 27], [7, 27]], 'indigo');
  c.poly([[5, 12], [23, 12], [22, 15], [6, 15]], 'steel2');
  // core
  c.poly([[14, 16], [19, 20], [14, 25], [9, 20]], 'magenta');
  c.poly([[14, 18], [17, 20], [14, 23], [11, 20]], 'violet2');
  c.set(14, 20, 'white');
  // ribs
  for (let y = 17; y < 26; y += 3) c.hline(8, 20, y, 'steel2', 0.4);
  // shoulders
  for (const [x, w] of [[0, 7], [21, 7]]) {
    c.rect(x, 10, w, 8, 'steel2');
    c.rect(x, 10, w, 2, 'steel');
    c.hline(x, x + w - 1, 10, 'steel3', 0.7);
  }
  // crown spikes on the shoulders
  for (const [x, h] of [[1, 5], [4, 7], [22, 6], [25, 4]]) {
    c.poly([[x, 10], [x + 2, 10], [x + 1, 10 - h]], 'amber');
    c.set(x + 1, 10 - h, 'gold');
  }
  // head
  c.rect(10, 4, 8, 7, 'steel2');
  c.rect(10, 4, 8, 2, 'steel');
  c.rect(11, 6, 6, 2, 'shadow');
  c.rect(12, 6, 4, 1, 'magenta');
  c.set(12, 6, 'white');
  // crown
  c.rect(9, 2, 10, 2, 'gold');
  for (let x = 9; x < 19; x += 3) {
    c.poly([[x, 2], [x + 2, 2], [x + 1, 0]], 'amber');
    c.set(x + 1, 0, 'gold');
  }
  // cannon arm (right)
  c.rect(24, 14, 4, 4, 'steel2');
  c.rect(26, 15, 2, 8, 'steel');
  c.rect(25, 22, 4, 2, 'shadow');
  c.set(27, 23, 'magenta');
  // blade arm (left)
  c.poly([[0, 14], [2, 14], [4, 24], [1, 24]], 'steel');
  c.line(1, 14, 3, 24, 'steel3', 1, 0.6);
  // cape
  c.poly([[4, 13], [2, 16], [3, 30], [7, 27]], 'plum');
  c.poly([[24, 13], [26, 16], [25, 30], [21, 27]], 'plum');
  c.outline('shadow');
  return c;
}

// ------------------------------------------------------------------ portal

/** Run portal: a wormhole with a bright core and three spiral arms. 43x43. */
function portal(size = 512) {
  const c = new Px(size, size, 43, 43);
  const cx = 21.5;
  const cy = 21.5;

  // Outer containment rings (thick enough to stay solid at 1 cell = 12px).
  c.ring(cx, cy, 20, 2, 'violet2', 0.55);
  c.ring(cx, cy, 17.5, 1.6, 'violet', 0.8);

  // Three spiral arms.
  for (let arm = 0; arm < 3; arm++) {
    const phase = (arm / 3) * Math.PI * 2;
    for (let t = 0; t <= 1.0001; t += 0.006) {
      const r = 3.6 + t * 14;
      const a = phase + t * 3.2;
      const x = cx + Math.cos(a) * r;
      const y = cy + Math.sin(a) * r;
      c.set(x, y, t < 0.4 ? 'cyan' : t < 0.72 ? 'cyan2' : 'violet2', 0.65 + t * 0.35);
      if (t < 0.65) c.set(x + 0.7, y + 0.3, 'cyan2', 0.35);
    }
  }

  // Gate lights on the outer ring.
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * Math.PI * 2;
    const x = cx + Math.cos(a) * 20;
    const y = cy + Math.sin(a) * 20;
    c.set(x, y, i % 2 ? 'cyan' : 'violet2');
    c.set(x + 1, y, 'cyan', 0.35);
  }

  // Core: bright centre with a dithered halo.
  c.disc(cx, cy, 4.4, 'cyan2', 0.5);
  c.disc(cx, cy, 3.2, 'cyan', 0.9);
  c.disc(cx, cy, 2, 'ice');
  c.disc(cx, cy, 1, 'white');
  // The disc rasterises with a square edge at this scale; soften the corners.
  for (const [x, y] of [[cx - 4, cy - 4], [cx + 4, cy - 4], [cx - 4, cy + 4], [cx + 4, cy + 4]]) {
    c.erase(x, y);
  }
  return c;
}

// -------------------------------------------------------------------- pets

function wolfPet() {
  const c = new Px(111, 124, 18, 20);
  // legs
  for (const x of [3, 7, 11, 14]) {
    c.line(x, 13, x - 1, 19, 'steel2', 1);
    c.set(x - 1, 19, 'steel3', 0.6);
  }
  // body
  c.poly([[1, 8], [12, 6], [16, 9], [15, 13], [3, 14], [0, 11]], 'steel');
  c.poly([[1, 8], [12, 6], [13, 8], [2, 10]], 'steel3');
  c.hline(3, 13, 9, 'cyan', 0.35);
  // head
  c.poly([[14, 7], [17, 9], [17, 13], [13, 12]], 'steel');
  c.set(15, 10, 'cyan');
  c.set(16, 11, 'shadow');
  // ear + thruster
  c.set(14, 5, 'steel3');
  c.set(15, 5, 'steel2');
  c.set(2, 12, 'cyan', 0.7);
  c.set(1, 13, 'cyan', 0.3);
  c.outline('shadow');
  return c;
}

function bearPet() {
  const c = new Px(104, 108, 17, 18);
  // legs
  for (const x of [3, 7, 11, 14]) c.rect(x, 13, 2, 4, 'steel2');
  // dome body
  c.disc(8.5, 10, 6.5, 'steel2');
  c.disc(8.5, 9, 5.5, 'steel');
  c.disc(8.5, 8.4, 4.2, 'steel3', 0.45);
  c.hline(4, 13, 5, 'steel3', 0.8);
  // shield emitter + visor
  c.rect(7, 8, 3, 2, 'shadow');
  c.rect(7, 8, 3, 1, 'mint');
  c.set(8, 12, 'mint', 0.85);
  // force-field arc
  for (let a = -0.9; a <= 0.9; a += 0.16) {
    c.set(8.5 + Math.sin(a) * 8, 10 - Math.cos(a) * 8, 'mint', 0.28);
  }
  c.outline('shadow');
  return c;
}

function falconPet() {
  const c = new Px(127, 110, 21, 18);
  // wings (spread)
  c.poly([[9, 7], [1, 3], [0, 5], [6, 10], [9, 10]], 'indigo');
  c.poly([[12, 7], [20, 3], [21, 5], [15, 10], [12, 10]], 'indigo');
  c.line(9, 7, 1, 3, 'violet2', 1, 0.6);
  c.line(12, 7, 20, 3, 'violet2', 1, 0.6);
  // body
  c.ellipse(10.5, 8, 3, 4, 'steel');
  c.ellipse(10.5, 7.4, 2.2, 2.6, 'steel3', 0.8);
  // head
  c.rect(9, 4, 4, 3, 'steel');
  c.rect(10, 5, 2, 1, 'violet2');
  // tail fins
  c.poly([[10, 12], [8, 16], [10, 15], [11, 16], [13, 12]], 'indigo');
  c.set(11, 17, 'violet2', 0.6);
  c.outline('shadow');
  return c;
}

export function pets() {
  return [wolfPet(), bearPet(), falconPet()];
}

/**
 * Elite variants: one per family, recoloured from the family sprite.
 *
 * They share the family silhouette on purpose (same enemy "species"), and are told apart
 * in-game by colour, size (`CHARACTERS.x.height`), and their mechanic: Skitter rushes,
 * Bulwark is armoured, Bomber lobs heavy rounds, Summoner calls Bats, Leech heals itself.
 */
export function enemyVariants() {
  return {
    // Claw -> acidic green runt
    skitter: claw().recolor({
      '#8f4230': '#17616e', '#e0722f': '#74e39a', '#ffc45c': '#b6f07a',
      '#414b6b': '#2f8f5c', '#9aa8c8': '#b6f07a',
    }),
    // Warrior -> blue siege plating
    bulwark: warrior().recolor({
      '#414b6b': '#2a3468', '#6c7a9c': '#4a5aa8', '#9aa8c8': '#8aa0ff',
      '#ffc45c': '#6fe0ff', '#f0a53a': '#bcd4ff', '#1a2450': '#141c40',
    }),
    // Archer turret -> hot orange artillery pod
    bomber: turret().recolor({
      '#414b6b': '#8f4230', '#6c7a9c': '#e0722f', '#9aa8c8': '#ffc45c',
      '#74e39a': '#ffc45c', '#45d7e8': '#ff9a4a',
    }),
    // Mage -> verdant summoner core
    summoner: mage().recolor({
      '#9a6cf0': '#2fae8f', '#6b4bb8': '#17616e', '#e05fb0': '#b6f07a', '#33234f': '#174a44',
    }),
    // Bat scout -> crimson blood-drinker
    leech: bat().recolor({
      '#1a2450': '#5a1f38', '#414b6b': '#7a2f50', '#6c7a9c': '#a04060',
      '#9aa8c8': '#ff9ab0', '#45d7e8': '#ff5a7a',
    }),
  };
}

// ------------------------------------------------------------------ exports

export function claw() { return crawler(); }
export function warrior() { return heavyMech(); }
export function turret() { return hoverTurret(); }
export function mage() { return energyCore(); }
export function bat() { return scoutDrone(); }
export function carrier() { return carrierDrone(); }
export function king() { return kingBoss(); }
export function runPortal(size = 512) { return portal(size); }
