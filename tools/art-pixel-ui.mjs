/**
 * Pixel-art UI: currency/drop icons, skill icons, mastery medallions, rail
 * buttons, job-card frames, the padlock, and the talent tree's node shapes and
 * white silhouette glyphs.
 *
 * Everything is drawn in a 16x16 "design cell" space and resampled to each
 * original canvas, so the whole icon set shares one stroke weight and one
 * silhouette language. The tree set is strictly white+alpha: the game
 * multiplies a state tint into it.
 */
import { Px } from './pixel-core.mjs';

// ------------------------------------------------------------------ helpers

/** 16x16 design canvas -> `draw` -> optional dark outline -> resample. */
function icon16(w, h, draw, { cell = 2, outline = true, pad = 0.02, shrink = 1 } = {}) {
  const g = new Px(16, 16, 16, 16);
  draw(g);
  if (outline) g.outline('shadow');
  if (shrink >= 1) return g.scaled(w, h, { cell, pad });
  // Draw smaller inside the same canvas: ground drops are sized by world height,
  // so shrinking the art is the only way to keep them from dwarfing the archer.
  const cols = Math.max(1, Math.round(w / cell));
  const rows = Math.max(1, Math.round(h / cell));
  const c = new Px(w, h, cols, rows);
  const dw = Math.max(1, Math.round(cols * shrink));
  const dh = Math.max(1, Math.round(rows * shrink));
  c.blitScaled(g, Math.round((cols - dw) / 2), Math.round((rows - dh) / 2), dw, dh);
  return c;
}

/** Fill a polygon given in 16-space. */
const P = (c, pts, col, a = 1) => c.poly(pts, col, a);

// ------------------------------------------------------------- glyph library

const G = {
  /** Data coin: solid disc with a recessed chip (no hole, so drops read as coins). */
  coin(c, col = 'gold', hi = 'amber', lo = 'rust') {
    c.disc(8, 8, 6.4, lo);
    c.disc(8, 8, 5.4, col);
    c.ring(8, 8, 3.8, 1, hi, 0.9);
    // recessed square chip, drawn in the shadow tone rather than punched out
    for (let y = 7; y <= 9; y++) for (let x = 7; x <= 9; x++) c.set(x, y, lo);
    c.set(7, 7, hi);
    c.set(8, 7, hi, 0.5);
    c.set(6, 5, 'white', 0.55);
  },
  /** Hexagonal mineral crystal with facets. */
  hex(c, col = 'rust', hi = 'orange') {
    const pts = [[8, 1.5], [14, 5], [14, 11], [8, 14.5], [2, 11], [2, 5]];
    P(c, pts, col);
    // lit facet (top-left) + dark facet (bottom-right)
    P(c, [[8, 2], [13, 5.2], [8, 8], [3, 5.2]], hi);
    P(c, [[8, 8], [13, 5.2], [13, 10.6], [8, 14]], 'shadow', 0.35);
    c.line(8, 3, 8, 13, 'shadow', 1, 0.35);
    c.set(5, 5, 'white', 0.6);
  },
  /** Arrowhead shard. */
  shard(c, col = 'lime', hi = 'mint') {
    P(c, [[8, 1], [12, 9], [8, 15], [4, 9]], col);
    P(c, [[8, 3], [10, 9], [8, 12]], hi);
    c.set(8, 4, 'white', 0.7);
  },
  shield(c, col = 'amber', hi = 'gold') {
    P(c, [[8, 2], [14, 4], [13, 10], [8, 14.5], [3, 10], [2, 4]], col);
    P(c, [[8, 4], [12, 5.5], [11.5, 9], [8, 12]], hi);
    c.vline(8, 5, 11, 'white', 0.45);
  },
  gem(c, col = 'cyan', hi = 'ice') {
    P(c, [[8, 1], [14, 7], [8, 15], [2, 7]], col);
    P(c, [[8, 3], [11, 7], [8, 12]], hi);
    c.hline(3, 13, 7, hi, 0.6);
    c.set(6, 4, 'white', 0.8);
  },
  /**
   * ClawCurrency: the currency that pays for jobs and skill upgrades.
   *
   * It has to be the SAME thing the skill price shows. The price row used a CSS green
   * orb while the drop/HUD used a brown hex, so the two read as different resources.
   * This is now a green gem with a claw cut, and every surface uses this one file.
   */
  /**
   * Family currencies are GEMS: the game's own text calls them "怪物宝石" / "其宝石"
   * (`ClawCurrencyChanceDropFlat` etc.), so a cube, a reticle or a wing was the wrong
   * shape language. Each keeps a tiny family mark on a faceted gem.
   */
  gemBase(c, col, hi) {
    P(c, [[8, 1], [14, 7], [8, 15], [2, 7]], col);
    P(c, [[8, 3], [11, 7], [8, 12]], hi);
    c.hline(3, 13, 7, hi, 0.55);
    c.set(6, 4, 'white', 0.85);
  },
  archerGem(c, col = 'mint', hi = 'white') {
    G.gemBase(c, col, hi);
    // arrow chevron
    c.line(6, 9, 8, 11, 'teal', 1);
    c.line(8, 11, 10, 9, 'teal', 1);
    c.set(8, 9, 'teal');
  },
  warriorGem(c, col = 'amber', hi = 'gold') {
    G.gemBase(c, col, hi);
    // shield bars
    c.hline(6, 10, 9, 'rust', 1);
    c.hline(7, 9, 11, 'rust', 1);
  },
  mageGem(c, col = 'violet2', hi = 'magenta') {
    G.gemBase(c, col, hi);
    // spark
    c.set(8, 8, 'white');
    c.set(8, 9, 'white');
    c.set(7, 9, 'magenta');
    c.set(9, 9, 'magenta');
  },
  batGem(c, col = 'indigo2', hi = 'cyan') {
    G.gemBase(c, col, hi);
    // two wing notches
    c.line(5, 10, 7, 8, 'cyan', 1, 0.9);
    c.line(11, 10, 9, 8, 'cyan', 1, 0.9);
  },  clawGem(c, col = 'lime', hi = 'mint') {
    P(c, [[8, 1], [14, 7], [8, 15], [2, 7]], col);
    P(c, [[8, 3], [11, 7], [8, 12]], hi);
    c.hline(3, 13, 7, hi, 0.55);
    // Three claw cuts across the lower facet.
    for (const dx of [-3, 0, 3]) c.line(8 + dx - 1, 11, 8 + dx + 1, 8, 'teal', 1);
    c.set(6, 4, 'white', 0.85);
    c.set(10, 5, 'white', 0.5);
  },
  wing(c, col = 'indigo2', hi = 'cyan') {
    P(c, [[8, 8], [2, 3], [3, 9], [8, 12], [13, 9], [14, 3]], col);
    c.line(8, 8, 2, 3, hi, 1, 0.9);
    c.line(8, 8, 14, 3, hi, 1, 0.9);
    c.set(8, 8, 'white');
  },
  swirl(c, col = 'magenta', hi = 'cyan') {
    for (let a = 0; a < Math.PI * 4; a += 0.14) {
      const r = 1 + a * 0.55;
      c.set(8 + Math.cos(a) * r, 8 + Math.sin(a) * r, a > Math.PI * 2 ? hi : col, 0.95);
    }
    c.disc(8, 8, 1.3, 'white');
  },
  skull(c, col = 'steel3') {
    c.disc(8, 7, 5, col);
    c.rect(6, 11, 4, 3, col);
    c.rect(5.5, 6, 2, 2, 'shadow');
    c.rect(8.5, 6, 2, 2, 'shadow');
    c.rect(7, 10, 2, 1, 'shadow');
  },
  sword(c, col = 'steel3', hi = 'ice') {
    c.line(4, 12, 12, 4, col, 2);
    c.line(12, 4, 13, 2, hi);
    c.line(3, 9, 7, 13, 'amber', 1);
    c.line(2, 13, 4, 11, 'amber', 1);
  },
  burst(c, col = 'amber', hi = 'gold') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      const r = i % 2 ? 6.5 : 4;
      c.line(8 + Math.cos(a) * 1.5, 8 + Math.sin(a) * 1.5, 8 + Math.cos(a) * r, 8 + Math.sin(a) * r, i % 2 ? col : hi, 1);
    }
    c.disc(8, 8, 2, hi);
    c.set(8, 8, 'white');
  },
  cross(c, col = 'mint') {
    c.rect(6, 2, 4, 12, col);
    c.rect(2, 6, 12, 4, col);
    c.rect(6, 2, 2, 4, 'white', 0.35);
  },
  star(c, col = 'gold', hi = 'amber') {
    const pts = [[8, 1], [9.8, 6], [15, 6], [10.8, 9], [12.4, 14.5], [8, 11.4], [3.6, 14.5], [5.2, 9], [1, 6], [6.2, 6]];
    P(c, pts, col);
    P(c, [[8, 3.4], [9, 6], [11.5, 7.6], [9, 8.6], [8, 11]], hi);
  },
  mult(c, col = 'cyan') {
    c.line(4, 4, 12, 12, col, 2);
    c.line(12, 4, 4, 12, col, 2);
  },
  helmet(c, col = 'white', hi = 'cyan') {
    c.disc(8, 7, 5.2, col);
    c.rect(3, 6, 10, 4, col);
    c.rect(6, 6, 7, 3, 'shadow');
    c.rect(10, 6.5, 2, 2, hi);
    c.rect(4, 11, 8, 3, 'steel2');
    c.hline(4, 11, 11, 'steel3', 0.8);
    c.set(7, 12, hi, 0.8);
  },
  crown(c, col = 'gold', hi = 'amber') {
    P(c, [[2, 11], [2, 5], [5, 8], [8, 3], [11, 8], [14, 5], [14, 11]], col);
    c.rect(3, 11, 10, 2, hi);
    c.set(4, 12, 'red');
    c.set(8, 12, 'cyan');
    c.set(12, 12, 'red');
  },
  rock(c, col = 'steel', hi = 'steel3') {
    P(c, [[3, 12], [2, 7], [6, 4], [11, 5], [14, 9], [12, 13]], col);
    P(c, [[6, 4], [11, 5], [9, 8], [4, 8]], hi, 0.7);
    c.set(5, 6, 'white', 0.5);
  },
  ingot(c, col = 'gold', hi = 'amber') {
    P(c, [[2, 11], [4, 6], [12, 6], [14, 11]], col);
    c.hline(4, 11, 6, hi);
    c.hline(3, 12, 11, 'shadow', 0.4);
    c.set(6, 7, 'white', 0.5);
  },
  chest(c, col = 'gold', hi = 'amber') {
    c.rect(2, 7, 12, 7, col);
    c.rect(2, 5, 12, 3, hi);
    c.hline(2, 13, 7, 'rust');
    c.rect(7, 8, 2, 3, 'rust');
    c.set(8, 9, 'white', 0.8);
  },
  bolt(c, col = 'cyan', hi = 'ice') {
    P(c, [[9, 1], [4, 9], [7, 9], [6, 15], [12, 6], [8, 6]], col);
    c.line(8, 3, 6, 8, hi, 1, 0.8);
  },
  drone(c, col = 'steel3', hi = 'cyan') {
    c.ellipse(8, 9, 4.4, 3.2, col);
    c.line(4, 7, 1, 4, col, 1);
    c.line(12, 7, 15, 4, col, 1);
    c.hline(0, 3, 4, hi, 0.8);
    c.hline(12, 15, 4, hi, 0.8);
    c.set(6, 9, hi);
    c.set(10, 9, hi);
    c.set(8, 12, hi, 0.5);
  },
  clock(c, col = 'steel3', hi = 'cyan') {
    c.disc(8, 8, 6, col);
    c.disc(8, 8, 4.6, 'space');
    c.ring(8, 8, 6, 1, hi, 0.7);
    c.line(8, 8, 8, 4, hi, 1);
    c.line(8, 8, 11, 9, hi, 1);
    c.set(8, 8, 'white');
  },
  pick(c, col = 'steel3', hi = 'ice') {
    c.line(4, 13, 11, 4, 'rust', 2);
    c.line(8, 7, 15, 3, col, 1);
    c.line(8, 7, 12, 1, col, 1);
    c.line(8, 7, 4, 3, col, 1);
    c.set(8, 7, hi);
  },
  scroll(c, col = 'ice', hi = 'gold') {
    c.rect(4, 3, 8, 10, col);
    c.hline(4, 11, 3, 'steel3');
    c.hline(4, 11, 12, 'steel3');
    for (let y = 5; y < 11; y += 2) c.hline(5, 9, y, 'steel', 0.7);
    c.set(10, 5, hi);
  },
  gear(c, col = 'steel3', hi = 'ice') {
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      c.line(8 + Math.cos(a) * 4, 8 + Math.sin(a) * 4, 8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, col, 2);
    }
    c.disc(8, 8, 4, col);
    c.erase(7, 7);
    c.erase(8, 7);
    c.erase(7, 8);
    c.erase(8, 8);
    c.set(6, 6, hi, 0.6);
  },
  diamond(c, col = 'white') {
    P(c, [[8, 1], [14, 8], [8, 15], [2, 8]], col);
  },
  /** Three plasma bolts, for the multishot skill. No shafts, no fletching. */
  bolts3(c, col = 'cyan') {
    for (const dx of [-4, 0, 4]) {
      // exhaust wisp
      c.set(8 + dx, 2, col, 0.35);
      c.set(8 + dx, 3, col, 0.55);
      // 2-cell round body
      c.rect(7 + dx, 4, 2, 8, col);
      // hot tip
      c.rect(7 + dx, 11, 2, 2, 'white');
      c.set(8 + dx, 13, 'white', 0.7);
    }
  },
  /** Piercing shot: a solid beam, not an arrow. */
  beam(c, col = 'ice') {
    c.rect(7, 1, 2, 14, col);
    c.rect(6, 3, 1, 10, col, 0.45);
    c.rect(9, 3, 1, 10, col, 0.45);
    c.rect(7, 1, 2, 2, 'white');
    c.set(7, 15, 'white');
    c.set(8, 15, 'white');
    // energy rings around the beam
    for (const y of [5, 9, 12]) {
      c.set(5, y, col, 0.55);
      c.set(10, y, col, 0.55);
    }
  },
  /** Marksman reticle, used for the Archer family currency (was an arrowhead). */
  reticle(c, col = 'lime', hi = 'mint') {
    c.ring(8, 8, 5.2, 1, col);
    c.ring(8, 8, 2.2, 1, hi, 0.9);
    c.set(8, 8, 'white');
    for (const [dx, dy] of [[0, -1], [0, 1], [-1, 0], [1, 0]]) {
      c.line(8 + dx * 3, 8 + dy * 3, 8 + dx * 7, 8 + dy * 7, col, 1);
    }
    c.set(7, 6, 'white', 0.6);
  },
  chevrons(c, col = 'amber') {
    for (let i = 0; i < 3; i++) {
      c.line(3, 4 + i * 4, 8, 7 + i * 4, col, 1);
      c.line(8, 7 + i * 4, 13, 4 + i * 4, col, 1);
    }
  },
  scope(c, col = 'mint') {
    c.ring(8, 8, 6, 1, col);
    c.line(8, 1, 8, 4, col, 1);
    c.line(8, 12, 8, 15, col, 1);
    c.line(1, 8, 4, 8, col, 1);
    c.line(12, 8, 15, 8, col, 1);
    c.set(8, 8, 'white');
  },
  flame(c, col = 'orange', hi = 'amber') {
    P(c, [[8, 1], [12, 7], [11, 12], [8, 15], [5, 12], [4, 7], [7, 9]], col);
    P(c, [[8, 6], [10, 10], [8, 13], [6, 10]], hi);
    c.set(8, 11, 'white');
  },
  snow(c, col = 'ice') {
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2;
      c.line(8, 8, 8 + Math.cos(a) * 6.5, 8 + Math.sin(a) * 6.5, col, 1);
      const bx = 8 + Math.cos(a) * 4.5;
      const by = 8 + Math.sin(a) * 4.5;
      c.line(bx, by, bx + Math.cos(a + 0.8) * 2, by + Math.sin(a + 0.8) * 2, col, 1);
      c.line(bx, by, bx + Math.cos(a - 0.8) * 2, by + Math.sin(a - 0.8) * 2, col, 1);
    }
  },
  blackhole(c, col = 'violet2', hi = 'magenta') {
    c.disc(8, 8, 6, col, 0.35);
    c.ring(8, 8, 5.4, 1, col);
    c.ring(8, 8, 3.6, 1, hi, 0.8);
    c.disc(8, 8, 2.4, 'shadow');
    c.set(8, 8, 'white');
  },
  nova(c, col = 'gold', hi = 'white') {
    for (let i = 0; i < 12; i++) {
      const a = (i / 12) * Math.PI * 2;
      c.line(8 + Math.cos(a) * 2, 8 + Math.sin(a) * 2, 8 + Math.cos(a) * 7, 8 + Math.sin(a) * 7, i % 2 ? col : hi, 1);
    }
    c.disc(8, 8, 2.4, hi);
  },
  drones3(c, col = 'steel3', hi = 'cyan') {
    for (const [x, y] of [[4, 5], [12, 5], [8, 11]]) {
      c.ellipse(x, y, 2.4, 1.8, col);
      c.set(x - 1, y, hi);
      c.set(x + 1, y, hi);
      c.line(x, y - 2, x, y - 3, col, 1);
    }
  },
  echo(c, col = 'cyan') {
    c.ring(8, 8, 3, 1, col);
    c.ring(8, 8, 5.4, 1, col, 0.65);
    c.ring(8, 8, 7.4, 1, col, 0.3);
    c.disc(8, 8, 1.2, 'white');
  },
  dice(c, col = 'mint') {
    c.rect(3, 3, 10, 10, col);
    c.hline(3, 12, 3, 'white', 0.5);
    c.vline(3, 3, 12, 'white', 0.3);
    c.rect(5, 5, 2, 2, 'shadow');
    c.rect(9, 9, 2, 2, 'shadow');
    c.rect(9, 5, 1, 1, 'shadow');
  },
  vault(c, col = 'gold') {
    c.rect(2, 4, 12, 10, col);
    c.ring(8, 9, 3, 1, 'shadow');
    c.line(8, 6, 8, 12, 'shadow', 1);
    c.line(5, 9, 11, 9, 'shadow', 1);
    c.set(8, 9, 'shadow');
  },
  anvil(c, col = 'steel3') {
    P(c, [[3, 7], [13, 7], [12, 10], [9, 10], [9, 12], [11, 12], [11, 14], [5, 14], [5, 12], [7, 12], [7, 10], [4, 10]], col);
    c.hline(3, 13, 7, 'ice', 0.6);
  },
  barrage(c, col = 'amber') {
    for (let y = 3; y < 14; y += 4) for (let x = 3; x < 14; x += 4) c.set(x, y, col);
    c.rect(2, 2, 4, 4, 'amber', 0.25);
  },
  speed(c, col = 'cyan') {
    for (const [y, len] of [[4, 8], [8, 11], [12, 6]]) {
      c.hline(2, 2 + len, y, col);
      c.set(2 + len + 1, y, col, 0.5);
    }
  },
  heart(c, col = 'red', hi = 'magenta') {
    c.disc(6, 6, 2.6, col);
    c.disc(10, 6, 2.6, col);
    P(c, [[3.4, 6.6], [12.6, 6.6], [8, 13.5]], col);
    c.set(5, 5, hi, 0.8);
    c.set(4, 6, hi, 0.5);
  },
  family(c, kind, col) {
    // Five family emblems: claw, bow, blade, star, wing.
    if (kind === 'claw') {
      for (const [x0, y0, x1, y1] of [[4, 2, 6, 12], [7, 2, 8, 13], [10, 2, 9, 12]]) {
        c.line(x0, y0, x1, y1, col, 1);
        c.line(x1, y1, x1 - 1, y1 + 2, col, 1);
      }
    } else if (kind === 'bow') {
      for (let a = -1.2; a <= 1.2; a += 0.2) c.set(7 + Math.cos(a) * 5, 8 + Math.sin(a) * 5, col);
      c.line(9, 3, 9, 13, col, 1, 0.6);
      c.line(4, 8, 13, 8, col, 1);
    } else if (kind === 'blade') {
      P(c, [[8, 1], [12, 8], [8, 15], [4, 8]], col);
      c.vline(8, 4, 12, 'shadow', 0.4);
    } else if (kind === 'mage') {
      G.star(c, col, col);
    } else {
      G.wing(c, col, col);
    }
  },
};

// ------------------------------------------------------------------- icons

/** [file, w, h, draw] for every coloured currency / stat icon. */
const CURRENCY = [
  ['cur/Gold', 33, 33, (c) => G.coin(c)],
  ['cur/ClawCurrency', 35, 35, (c) => G.clawGem(c)],
  ['cur/BatCurrency', 35, 35, (c) => G.batGem(c, 'indigo2', 'cyan')],
  ['cur/PortalCurrency', 27, 34, (c) => G.swirl(c)],
  ['cur/Monsters', 29, 31, (c) => G.skull(c)],
  ['cur/Attack', 36, 31, (c) => G.sword(c)],
  ['cur/Damage', 35, 30, (c) => G.burst(c)],
  ['cur/Health', 34, 32, (c) => G.cross(c)],
  ['cur/Bonus', 34, 34, (c) => G.star(c)],
  ['cur/Multiplier', 34, 33, (c) => G.mult(c)],
  ['cur/CharacterCurrency', 35, 35, (c) => G.helmet(c)],
  ['cur/GuardianCurrency', 33, 35, (c) => G.crown(c)],
  ['cur/MiningRock', 35, 36, (c) => G.rock(c)],
  ['cur/MiningCopper', 31, 37, (c) => G.ingot(c, 'rust', 'orange')],
  ['cur/MiningSilver', 33, 36, (c) => G.ingot(c, 'steel3', 'ice')],
  ['cur/MiningGold', 35, 39, (c) => G.ingot(c, 'gold', 'amber')],
];

export function currencyIcons() {
  const out = {};
  for (const [file, w, h, draw] of CURRENCY) out[file] = icon16(w, h, draw, { cell: 2, shrink: 0.78 });
  return out;
}

// --------------------------------------------------------------- skill icons

const SKILL_GLYPHS = {
  Multishot: (c) => G.bolts3(c, 'cyan'),
  RapidFire: (c) => G.chevrons(c, 'amber'),
  SharpShooter: (c) => { G.scope(c, 'mint'); G.star(c, 'gold', 'amber'); },
  BombArrow: (c) => {
    // bomb sphere + lit fuse + three sparks
    c.disc(8, 9, 4, 'steel2');
    c.disc(7, 8, 2.6, 'steel3', 0.55);
    c.set(6, 7, 'ice', 0.8);
    c.rect(9, 4, 2, 2, 'shadow');
    c.line(11, 4, 13, 2, 'amber', 1);
    c.set(13, 1, 'gold');
    c.set(14, 2, 'amber', 0.7);
    c.set(12, 1, 'white', 0.8);
    c.set(10, 1, 'amber', 0.5);
  },
  PiercingShot: (c) => G.beam(c, 'ice'),
  SniperScope: (c) => G.scope(c, 'cyan'),
  LightningStrike: (c) => G.bolt(c, 'cyan', 'ice'),
  FireArea: (c) => G.flame(c, 'orange', 'amber'),
  Blizzard: (c) => G.snow(c, 'ice'),
  DarkMatter: (c) => G.blackhole(c, 'violet2', 'magenta'),
  SuperNova: (c) => G.nova(c, 'gold', 'white'),
  BatSwarm: (c) => G.drones3(c, 'steel3', 'cyan'),
  Wolf: (c) => {
    // wolf head: ears, muzzle, eye
    P(c, [[3, 4], [7, 7], [9, 7], [13, 4], [13, 10], [11, 13], [8, 15], [5, 13], [3, 10]], 'steel');
    P(c, [[3, 4], [6, 6], [5, 9], [3, 8]], 'steel3', 0.6);
    P(c, [[13, 4], [10, 6], [11, 9], [13, 8]], 'steel3', 0.6);
    c.set(6, 8, 'cyan');
    c.set(10, 8, 'cyan');
    c.rect(7, 11, 3, 1, 'shadow', 0.8);
    c.set(8, 12, 'steel3');
    c.set(8, 13, 'ice');
  },
  Bear: (c) => {
    G.shield(c, 'steel', 'steel3');
    c.disc(8, 8, 2.4, 'mint');
    c.set(8, 8, 'white');
  },
  Falcon: (c) => {
    // spread-wing raptor
    P(c, [[8, 6], [1, 2], [1, 5], [6, 9], [8, 9]], 'indigo2');
    P(c, [[8, 6], [15, 2], [15, 5], [10, 9], [8, 9]], 'indigo2');
    c.line(8, 6, 1, 2, 'violet2', 1, 0.8);
    c.line(8, 6, 15, 2, 'violet2', 1, 0.8);
    c.ellipse(8, 9, 2.2, 3, 'steel');
    c.rect(7, 5, 3, 2, 'steel3');
    c.set(9, 6, 'amber');
    c.set(8, 12, 'violet2', 0.7);
  },
};

/** Dark holographic tile with a cut corner + glowing glyph. */
export function skillIcons(spec) {
  const out = {};
  for (const s of spec) {
    const cols = Math.max(14, Math.round(s.w / 6));
    const rows = Math.max(14, Math.round(s.h / 6));
    const c = new Px(s.w, s.h, cols, rows);
    // plate
    c.rect(1, 1, cols - 2, rows - 2, 'space');
    c.hline(1, cols - 2, 1, 'steel2');
    c.vline(1, 1, rows - 2, 'steel2');
    c.hline(1, cols - 2, rows - 2, 'steel2', 0.6);
    c.vline(cols - 2, 1, rows - 2, 'steel2', 0.6);
    // cut corners
    c.set(0, 0, 'shadow');
    c.set(cols - 1, 0, 'shadow');
    c.set(0, rows - 1, 'shadow');
    c.set(cols - 1, rows - 1, 'shadow');
    // accent strips in the plate's corners
    c.hline(2, 4, 2, s.col ?? 'cyan', 0.8);
    c.hline(cols - 5, cols - 3, rows - 3, 'steel3', 0.4);

    const g = new Px(16, 16, 16, 16);
    (SKILL_GLYPHS[s.id] ?? ((x) => G.star(x, 'gold', 'amber')))(g);
    c.blitScaled(g, 3, 3, cols - 6, rows - 6);
    out[`skills/${s.file}`] = c;
  }
  return out;
}

/** '#rrggbb' -> a palette name, for accent strips. */

// ------------------------------------------------------------------- mastery

const MASTERY_GLYPHS = {
  momentum: (c) => G.speed(c, 'amber'),
  vitality: (c) => G.heart(c),
  scroll: (c) => G.scroll(c, 'ice', 'gold'),
  fortune: (c) => G.dice(c),
  echo: (c) => G.echo(c, 'cyan'),
  gilding: (c) => { G.coin(c); c.set(11, 4, 'gold'); },
  barrage: (c) => G.barrage(c),
  avarice: (c) => G.vault(c),
  forging: (c) => G.anvil(c),
};

export function masteryIcons(spec) {
  const out = {};
  for (const s of spec) {
    out[`mastery/${s.file}`] = icon16(s.w, s.h, (g) => (MASTERY_GLYPHS[s.symbol] ?? G.star)(g), { cell: 2 });
  }
  return out;
}

// --------------------------------------------------------------------- rails

export function railIcons() {
  const out = {};
  out.rail_tree = icon16(80, 69, (c) => G.scroll(c, 'ice', 'cyan'), { cell: 4 });
  out.rail_jobs = icon16(71, 72, (c) => G.helmet(c), { cell: 4 });
  out.rail_mastery = icon16(44, 56, (c) => G.star(c), { cell: 3 });
  out.rail_crafting = icon16(64, 64, (c) => G.anvil(c), { cell: 3 });
  out.rail_mining = icon16(64, 59, (c) => G.pick(c), { cell: 3 });
  out.rail_shaping = icon16(43, 30, (c) => G.gem(c, 'violet2', 'magenta'), { cell: 2 });
  out.rail_star = icon16(56, 54, (c) => G.star(c), { cell: 3 });
  return out;
}

// ---------------------------------------------------------------- job cards

/**
 * Card frames. The DOM lays the portrait image at 4%..60% of the card height
 * and the passive banner at 63%..83%, so the frame keeps those two areas dark
 * and empty: only the border, title tab and skill well are painted.
 */
export function jobCards() {
  const out = {};
  for (let i = 0; i < 5; i++) {
    const W = 320;
    const H = 424;
    const c = new Px(W, H, 40, 53);
    const accent = ['amber', 'cyan', 'mint', 'gold', 'violet2'][i];

    // Outer plate.
    c.rect(1, 1, 38, 51, 'deep');
    // Border, double line with lit corners.
    c.rect(1, 1, 38, 1, 'steel');
    c.rect(1, 51, 38, 1, 'steel2');
    c.vline(1, 1, 51, 'steel');
    c.vline(38, 1, 51, 'steel2');
    c.rect(2, 2, 36, 1, 'indigo');
    for (const [x, y] of [[1, 1], [38, 1], [1, 51], [38, 51]]) {
      c.rect(x - 1, y, 3, 1, accent);
      c.rect(x, y - 1, 1, 3, accent);
    }
    // Corner brackets.
    for (const [x, y, sx, sy] of [[2, 2, 1, 1], [37, 2, -1, 1], [2, 50, 1, -1], [37, 50, -1, -1]]) {
      c.hline(x, x + sx * 4, y, accent, 0.8);
      c.vline(x, y, y + sy * 3, accent, 0.8);
    }

    // Title tab.
    c.rect(4, 0, 32, 3, 'indigo2');
    c.hline(4, 35, 0, accent);
    c.hline(4, 35, 3, 'steel2');
    c.set(6, 1, accent);
    c.hline(8, 20, 1, 'steel3', 0.5);

    // Portrait well (dark, recessed) - images are drawn over this.
    c.rect(2, 4, 36, 27, 'void');
    c.rect(2, 4, 36, 1, 'shadow');
    c.vline(2, 4, 30, 'shadow');
    // faint scanlines in the well
    for (let y = 6; y < 31; y += 4) c.hline(4, 35, y, 'indigo', 0.35);
    // side tick marks
    for (let y = 8; y < 30; y += 4) c.set(3, y, accent, 0.5);

    // Passive well.
    c.rect(3, 33, 34, 11, 'space');
    c.hline(3, 36, 33, 'steel2');
    c.hline(3, 36, 43, 'steel2', 0.6);
    c.hline(6, 33, 33, accent, 0.7);

    // Skill well: three slots.
    for (let k = 0; k < 3; k++) {
      const x = 4 + k * 11;
      c.rect(x, 45, 10, 6, 'space');
      c.hline(x, x + 9, 45, 'steel2');
      c.hline(x, x + 9, 50, 'steel2', 0.6);
      c.vline(x, 45, 50, 'steel2', 0.6);
      c.vline(x + 9, 45, 50, 'steel2', 0.6);
      c.set(x + 2, 46, accent, 0.5);
    }
    out[`job_card_${i}`] = c;
  }
  return out;
}

// -------------------------------------------------------------------- lock

export function lockIcon() {
  return icon16(60, 75, (c) => {
    c.rect(3, 7, 10, 8, 'gold');
    c.rect(3, 7, 10, 1, 'amber');
    c.rect(4, 8, 8, 6, 'amber', 0.6);
    for (let a = Math.PI; a <= Math.PI * 2.001; a += 0.16) {
      c.set(8 + Math.cos(a) * 3.4, 7 + Math.sin(a) * 3.4, 'steel3');
      c.set(8 + Math.cos(a) * 3.4, 7 + Math.sin(a) * 3.4 + 1, 'steel2');
    }
    c.rect(7, 10, 2, 3, 'shadow');
    c.set(6, 8, 'white', 0.5);
  }, { cell: 4 });
}

// -------------------------------------------------------------- tree shapes

/**
 * Talent-tree node plates and highlight rings.
 *
 * The plates are COLOURED (the game draws them untinted, exactly like the
 * shipping brown ones); only the highlight ring is white+alpha, because the UI
 * masks it with the state colour. The 89 glyphs are white+alpha for the same
 * reason.
 */
export function treeShapes() {
  const out = {};

  const hexPts = (cx, cy, r) => {
    const pts = [];
    for (let i = 0; i < 6; i++) {
      const a = (i / 6) * Math.PI * 2 - Math.PI / 2;
      pts.push([cx + Math.cos(a) * r, cy + Math.sin(a) * r]);
    }
    return pts;
  };

  const plate = (c, pts, edge, fill, glow) => {
    c.poly(pts, edge);
    const inner = pts.map(([x, y]) => [7.5 + (x - 7.5) * 0.78, 7.5 + (y - 7.5) * 0.78]);
    c.poly(inner, fill);
    // Lit edge: the highest segment of the outline catches the light.
    let top = 0;
    for (let i = 1; i < pts.length; i++) if (pts[i][1] < pts[top][1]) top = i;
    const a = pts[top];
    const b = pts[(top + 1) % pts.length];
    c.line(a[0], a[1], b[0], b[1], 'steel3', 1, 0.4);
    if (glow) {
      c.poly(hexPts(7.5, 7.5, 2.2), glow, 0.85);
      c.set(7.5, 7.5, 'white', 0.7);
    }
  };

  const hexNode = (w, h, lit) => {
    const c = new Px(w, h, 15, 15);
    const outer = hexPts(7.5, 7.5, 7.2);
    const inner = hexPts(7.5, 7.5, 5.4);
    if (lit) plate(c, outer, 'cyan', 'indigo', 'cyan2');
    else {
      plate(c, outer, 'indigo2', 'deep', null);
      // inner ring hint, so an unlit node still has structure
      for (let i = 0; i < 6; i++) {
        const [x0, y0] = inner[i];
        const [x1, y1] = inner[(i + 1) % 6];
        c.line(x0, y0, x1, y1, 'indigo2', 1, 0.7);
      }
    }
    return c;
  };

  out['tree/Slider_Level_01_Bg_3__1085'] = hexNode(63, 62, false);
  out['tree/Slider_Level_01_Bg_4__1093'] = hexNode(63, 62, true);
  out['tree/Slider_Level_01_Bg_5__978'] = (() => {
    // White ring, masked by the UI with the state colour.
    const c = new Px(90, 90, 18, 18);
    const cx = 8.5;
    const cy = 8.5;
    for (let i = 0; i < 40; i++) {
      const a = (i / 40) * Math.PI * 2;
      c.set(cx + Math.cos(a) * 8.2, cy + Math.sin(a) * 8.2, 'white', 0.95);
      c.set(cx + Math.cos(a) * 7.3, cy + Math.sin(a) * 7.3, 'white', 0.5);
      c.set(cx + Math.cos(a) * 6.4, cy + Math.sin(a) * 6.4, 'white', 0.22);
    }
    // four bracket ticks
    for (let i = 0; i < 4; i++) {
      const a = (i / 4) * Math.PI * 2 + 0.78;
      c.line(cx + Math.cos(a) * 6.6, cy + Math.sin(a) * 6.6, cx + Math.cos(a) * 8.6, cy + Math.sin(a) * 8.6, 'white', 1, 0.85);
    }
    return c;
  })();

  const diamondPts = (cx, cy, r) => [[cx, cy - r], [cx + r, cy], [cx, cy + r], [cx - r, cy]];
  const diamondNode = (w, h, lit) => {
    const c = new Px(w, h, 16, 16);
    const outer = diamondPts(7.5, 8, 7.2);
    const inner = diamondPts(7.5, 8, 4.6);
    if (lit) plate(c, outer, 'amber', 'indigo', 'amber');
    else {
      plate(c, outer, 'indigo2', 'deep', null);
      for (let i = 0; i < 4; i++) {
        const [x0, y0] = inner[i];
        const [x1, y1] = inner[(i + 1) % 4];
        c.line(x0, y0, x1, y1, 'indigo2', 1, 0.7);
      }
    }
    return c;
  };
  out['tree/Alert_Diamond_White_Bg_2__1150'] = diamondNode(68, 70, false);
  out['tree/Alert_Diamond_White_Bg_1__1022'] = diamondNode(68, 70, true);
  out['tree/Alert_Diamond_White_Bg_3__1037'] = (() => {
    const c = new Px(92, 94, 20, 20);
    const cx = 9.5;
    const cy = 9.5;
    for (let i = 0; i < 4; i++) {
      const a0 = (i / 4) * Math.PI * 2 + Math.PI / 4;
      for (let k = 0; k < 18; k++) {
        const a = a0 + (k / 18) * (Math.PI / 2);
        c.set(cx + Math.cos(a) * 8.4, cy + Math.sin(a) * 8.4, 'white', 0.9);
        c.set(cx + Math.cos(a) * 7.2, cy + Math.sin(a) * 7.2, 'white', 0.3);
      }
    }
    return c;
  })();
  return out;
}

// -------------------------------------------------------------- tree glyphs

/** The 14 shared symbols. All strictly white + alpha. */
const TREE_SYMBOL = {
  S1: (c) => {
    // up arrow: the "increase this stat" glyph
    c.line(8, 14, 8, 4, 'white', 2);
    c.line(8, 4, 4, 8, 'white', 2);
    c.line(8, 4, 12, 8, 'white', 2);
    c.rect(5, 14, 7, 1, 'white');
  },
  S2: (c) => G.heart(c, 'white', 'white'),
  S3: (c) => G.burst(c, 'white', 'white'),
  S4: (c) => G.coin(c, 'white', 'white', 'white'),
  S5: (c) => G.chest(c, 'white', 'white'),
  S6: (c) => G.bolt(c, 'white', 'white'),
  S7: (c) => G.shield(c, 'white', 'white'),
  S8: (c) => G.drone(c, 'white', 'white'),
  S9: (c) => G.clock(c, 'white', 'white'),
  S10: (c) => G.pick(c, 'white', 'white'),
  S11: (c) => G.scroll(c, 'white', 'white'),
  S12: (c) => G.family(c, 'claw', 'white'),
  S12a: (c) => G.family(c, 'bow', 'white'),
  S12w: (c) => G.family(c, 'blade', 'white'),
  S12m: (c) => G.family(c, 'mage', 'white'),
  S12b: (c) => G.family(c, 'wing', 'white'),
  S13: (c) => G.diamond(c, 'white'),
  S14: (c) => G.gear(c, 'white', 'white'),
};

/** White silhouette glyph, centred and fitted to each source canvas. */
export function treeGlyph(symbol, w, h) {
  const cell = Math.max(2, Math.round(Math.min(w, h) / 18));
  const cols = Math.max(8, Math.round(w / cell));
  const rows = Math.max(8, Math.round(h / cell));
  const c = new Px(w, h, cols, rows);
  const g = new Px(16, 16, 16, 16);
  const key = symbol === 'S12' ? TREE_SYMBOL.S12 : TREE_SYMBOL[symbol] ?? TREE_SYMBOL.S1;
  key(g);
  const side = Math.min(cols, rows) - 2;
  const dx = Math.round((cols - side) / 2);
  const dy = Math.round((rows - side) / 2);
  c.blitScaled(g, dx, dy, side, side);
  return c;
}

export { G as glyphs };
