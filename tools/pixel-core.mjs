/**
 * Pixel-art drawing core for the 16-bit reskin.
 *
 * Everything is drawn on an integer CELL grid, then upscaled to the exact
 * original canvas size with hard edges (nearest neighbour), so no anti-aliasing
 * can leak into the art and every asset shares one visual "pixel" density.
 *
 *   const c = new Px(150, 176, 25, 30);   // 25x30 cells -> 150x176 png
 *   c.rect(2, 2, 4, 4, 'cyan');
 *   c.outline('shadow');                  // 4-neighbour dark outline
 *   writeFileSync('x.png', c.png());
 *
 * Grid cells map to pixel spans by rounding, so cells are 5-7px on a 176px
 * canvas without ever leaving a gap or dropping the last row.
 *
 * Zero dependencies (node:zlib through art-core's encoder).
 */
import { encodePng } from './art-core.mjs';

/** One shared 16-bit palette: the whole game is painted from these 26 colours. */
export const PAL = {
  void: '#060810',
  space: '#0b1024',
  deep: '#111a38',
  indigo: '#1a2450',
  indigo2: '#243063',
  plum: '#33234f',
  violet: '#6b4bb8',
  violet2: '#9a6cf0',
  magenta: '#e05fb0',
  cyan: '#45d7e8',
  cyan2: '#24a3bd',
  teal: '#17616e',
  mint: '#74e39a',
  lime: '#b6f07a',
  amber: '#ffc45c',
  gold: '#f0a53a',
  orange: '#e0722f',
  rust: '#8f4230',
  red: '#e2564a',
  steel: '#6c7a9c',
  steel2: '#414b6b',
  steel3: '#9aa8c8',
  ice: '#cfe4ff',
  white: '#f2f8ff',
  shadow: '#0a0c18',
};

const cache = new Map();
/** '#rrggbb' -> [r,g,b] (memoised, so the draw loops stay cheap). */
export function rgb(c) {
  if (Array.isArray(c)) return c;
  let v = cache.get(c);
  if (!v) {
    const h = c.replace('#', '');
    v = [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
    cache.set(c, v);
  }
  return v;
}

/** Resolve a palette name, '#rrggbb', or an [r,g,b] triple. */
const col = (c) => (typeof c === 'string' && c[0] !== '#' ? rgb(PAL[c] ?? c) : rgb(c));

/** Bayer 4x4 threshold table, 0..15, for ordered dithering. */
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];
const bayer = (x, y) => BAYER4[y & 3][x & 3] / 16;

export class Px {
  /**
   * @param {number} w    output PNG width in px
   * @param {number} h    output PNG height in px
   * @param {number} cols art cells across
   * @param {number} rows art cells down
   */
  constructor(w, h, cols, rows, { wrap = false } = {}) {
    this.w = w;
    this.h = h;
    this.cols = cols;
    this.rows = rows;
    this.wrap = wrap;
    /** rgb triples, one per cell. */
    this.c = new Uint8Array(cols * rows * 3);
    /** alpha, one per cell. */
    this.a = new Float32Array(cols * rows);
    /** Edge pixel offset inside a cell when you need sub-cell precision. */
    this.padX = 0;
    this.padY = 0;
  }

  /** Cell from canvas px (e.g. a measured horizon row). */
  cellX(px) {
    return Math.floor((px - this.padX) / this.cw());
  }

  cellY(px) {
    return Math.floor((px - this.padY) / this.ch());
  }

  cw() {
    return this.w / this.cols;
  }

  ch() {
    return this.h / this.rows;
  }

  _i(x, y) {
    return y * this.cols + x;
  }

  _wrapX(x) {
    if (!this.wrap) return x;
    const m = x % this.cols;
    return m < 0 ? m + this.cols : m;
  }

  /** Opaque cell write (source-over when alpha < 1). */
  set(x, y, c, a = 1) {
    x = Math.round(x);
    y = Math.round(y);
    if (y < 0 || y >= this.rows || a <= 0) return;
    x = this._wrapX(x);
    if (x < 0 || x >= this.cols) return;
    const i = this._i(x, y);
    const v = col(c);
    const sa = a > 1 ? 1 : a;
    const da = this.a[i];
    if (sa >= 0.999 || da <= 0.001) {
      this.c[i * 3] = v[0];
      this.c[i * 3 + 1] = v[1];
      this.c[i * 3 + 2] = v[2];
      this.a[i] = sa;
      return;
    }
    const oa = sa + da * (1 - sa);
    this.c[i * 3] = Math.round((v[0] * sa + this.c[i * 3] * da * (1 - sa)) / oa);
    this.c[i * 3 + 1] = Math.round((v[1] * sa + this.c[i * 3 + 1] * da * (1 - sa)) / oa);
    this.c[i * 3 + 2] = Math.round((v[2] * sa + this.c[i * 3 + 2] * da * (1 - sa)) / oa);
    this.a[i] = oa;
  }

  get(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (y < 0 || y >= this.rows) return null;
    x = this._wrapX(x);
    if (x < 0 || x >= this.cols) return null;
    const i = this._i(x, y);
    return [this.c[i * 3], this.c[i * 3 + 1], this.c[i * 3 + 2], this.a[i]];
  }

  alphaAt(x, y) {
    const g = this.get(x, y);
    return g ? g[3] : 0;
  }

  // ---------------------------------------------------------------- primitives

  rect(x, y, w, h, c, a = 1) {
    for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c, a);
    return this;
  }

  /** Horizontal run, useful for horizon lines. */
  hline(x0, x1, y, c, a = 1) {
    for (let x = x0; x <= x1; x++) this.set(x, y, c, a);
    return this;
  }

  vline(x, y0, y1, c, a = 1) {
    for (let y = y0; y <= y1; y++) this.set(x, y, c, a);
    return this;
  }

  /** Filled disc, integer test => crisp pixel circle. */
  disc(cx, cy, r, c, a = 1) {
    const r2 = r * r;
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) this.set(x, y, c, a);
      }
    }
    return this;
  }

  /** Filled ellipse (rx, ry in cells). */
  ellipse(cx, cy, rx, ry, c, a = 1) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x - cx) / rx;
        const dy = (y - cy) / ry;
        if (dx * dx + dy * dy <= 1) this.set(x, y, c, a);
      }
    }
    return this;
  }

  /** Pixel ring: cells whose distance falls inside [r-t/2, r+t/2]. */
  ring(cx, cy, r, t, c, a = 1) {
    const ri = r - t / 2;
    const ro = r + t / 2;
    for (let y = Math.floor(cy - ro - 1); y <= Math.ceil(cy + ro + 1); y++) {
      for (let x = Math.floor(cx - ro - 1); x <= Math.ceil(cx + ro + 1); x++) {
        const d = Math.hypot(x - cx, y - cy);
        if (d >= ri && d <= ro) this.set(x, y, c, a);
      }
    }
    return this;
  }

  /** Bresenham line with a square brush of `t` cells. */
  line(x0, y0, x1, y1, c, t = 1, a = 1) {
    x0 = Math.round(x0);
    y0 = Math.round(y0);
    x1 = Math.round(x1);
    y1 = Math.round(y1);
    const dx = Math.abs(x1 - x0);
    const dy = Math.abs(y1 - y0);
    const sx = x0 < x1 ? 1 : -1;
    const sy = y0 < y1 ? 1 : -1;
    let err = dx - dy;
    const o = Math.floor((t - 1) / 2);
    for (;;) {
      if (t <= 1) this.set(x0, y0, c, a);
      else this.rect(x0 - o, y0 - o, t, t, c, a);
      if (x0 === x1 && y0 === y1) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x0 += sx;
      }
      if (e2 < dx) {
        err += dx;
        y0 += sy;
      }
    }
    return this;
  }

  /** Scanline polygon fill (even-odd); points are [x,y] in cells. */
  poly(points, c, a = 1) {
    const ys = points.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) this.set(x, y, c, a);
      }
    }
    return this;
  }

  /**
   * Ordered-dither blend from colour A to colour B across a rectangle.
   * `axis` = 'y' blends top->bottom, 'x' left->right, 'r' radial from centre.
   */
  dither(x, y, w, h, cA, cB, axis = 'y') {
    for (let yy = 0; yy < h; yy++) {
      for (let xx = 0; xx < w; xx++) {
        let t;
        if (axis === 'x') t = w <= 1 ? 0 : xx / (w - 1);
        else if (axis === 'r') {
          const dx = (xx - (w - 1) / 2) / (w / 2);
          const dy = (yy - (h - 1) / 2) / (h / 2);
          t = Math.min(1, Math.hypot(dx, dy));
        } else t = h <= 1 ? 0 : yy / (h - 1);
        this.set(x + xx, y + yy, bayer(x + xx, y + yy) < t ? cB : cA);
      }
    }
    return this;
  }

  /** Multi-stop vertical gradient with ordered dithering between stops. */
  vgrad(x, y, w, h, stops) {
    for (let yy = 0; yy < h; yy++) {
      const t = h <= 1 ? 0 : yy / (h - 1);
      let k = 0;
      while (k < stops.length - 2 && t > stops[k + 1][0]) k++;
      const [p0, c0] = stops[k];
      const [p1, c1] = stops[k + 1] ?? stops[k];
      const local = p1 <= p0 ? 0 : Math.max(0, Math.min(1, (t - p0) / (p1 - p0)));
      for (let xx = 0; xx < w; xx++) {
        this.set(x + xx, y + yy, bayer(x + xx, y + yy) < local ? c1 : c0);
      }
    }
    return this;
  }

  /** Add a 1-cell outline around every opaque cell (classic dark rim). */
  outline(c = 'shadow', a = 1) {
    const src = new Uint8Array(this.cols * this.rows);
    for (let i = 0; i < src.length; i++) src[i] = this.a[i] > 0.5 ? 1 : 0;
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        if (src[this._i(x, y)]) continue;
        const n =
          (x > 0 && src[this._i(x - 1, y)]) ||
          (x < this.cols - 1 && src[this._i(x + 1, y)]) ||
          (y > 0 && src[this._i(x, y - 1)]) ||
          (y < this.rows - 1 && src[this._i(x, y + 1)]);
        if (n) this.set(x, y, c, a);
      }
    }
    return this;
  }

  /** Multiply alpha of every cell inside/outside a radius (soft FX masks). */
  fadeRadial(cx, cy, r0, r1) {
    for (let y = 0; y < this.rows; y++) {
      for (let x = 0; x < this.cols; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const t = d <= r0 ? 1 : d >= r1 ? 0 : 1 - (d - r0) / (r1 - r0);
        const i = this._i(x, y);
        if (this.a[i] > 0) this.a[i] *= t;
      }
    }
    return this;
  }

  /** Copy another Px in at (dx,dy) with an optional palette remap. */
  blit(other, dx, dy, remap = null, alpha = 1) {
    for (let y = 0; y < other.rows; y++) {
      for (let x = 0; x < other.cols; x++) {
        const i = other._i(x, y);
        const a = other.a[i];
        if (a <= 0) continue;
        let c = [other.c[i * 3], other.c[i * 3 + 1], other.c[i * 3 + 2]];
        if (remap) {
          const key = `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
          c = remap[key] ?? c;
        }
        this.set(dx + x, dy + y, c, a * alpha);
      }
    }
    return this;
  }

  /** Erase one cell (used to punch holes in silhouettes). */
  erase(x, y) {
    x = Math.round(x);
    y = Math.round(y);
    if (y < 0 || y >= this.rows) return this;
    x = this._wrapX(x);
    if (x < 0 || x >= this.cols) return this;
    this.a[this._i(x, y)] = 0;
    return this;
  }

  /** Erase a scanline polygon. */
  erasePoly(points) {
    const ys = points.map((p) => p[1]);
    const y0 = Math.floor(Math.min(...ys));
    const y1 = Math.ceil(Math.max(...ys));
    for (let y = y0; y <= y1; y++) {
      const xs = [];
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > y !== yj > y) xs.push(((xj - xi) * (y - yi)) / (yj - yi) + xi);
      }
      xs.sort((p, q) => p - q);
      for (let k = 0; k + 1 < xs.length; k += 2) {
        for (let x = Math.ceil(xs[k]); x <= Math.floor(xs[k + 1]); x++) this.erase(x, y);
      }
    }
    return this;
  }

  /** Swap colours cell-by-cell; keys are '#rrggbb' strings. Alpha is preserved. */
  recolor(map) {
    const table = new Map();
    for (const [from, to] of Object.entries(map)) {
      const a = col(from);
      const b = col(to);
      table.set(`${a[0]},${a[1]},${a[2]}`, b);
    }
    for (let i = 0; i < this.cols * this.rows; i++) {
      if (this.a[i] <= 0) continue;
      const key = `${this.c[i * 3]},${this.c[i * 3 + 1]},${this.c[i * 3 + 2]}`;
      const to = table.get(key);
      if (!to) continue;
      this.c[i * 3] = to[0];
      this.c[i * 3 + 1] = to[1];
      this.c[i * 3 + 2] = to[2];
    }
    return this;
  }

  /**
   * Nearest-neighbour resample into a new canvas of `w`x`h` px.
   * `cell` sets the target pixel density (2 => one art pixel per 2 canvas px),
   * `pad` is the fraction of the source kept as a transparent margin.
   */
  scaled(w, h, { cell = 2, pad = 0 } = {}) {
    const cols = Math.max(1, Math.round(w / cell));
    const rows = Math.max(1, Math.round(h / cell));
    const out = new Px(w, h, cols, rows, { wrap: this.wrap });
    out.blitScaled(this, 0, 0, cols, rows, 1, pad);
    return out;
  }

  /** Nearest-neighbour copy of `src` into the cell rect (dx,dy,dw,dh). */
  blitScaled(src, dx, dy, dw, dh, alpha = 1, pad = 0) {
    const ax = src.cols * pad;
    const ay = src.rows * pad;
    const sw = src.cols - ax * 2;
    const sh = src.rows - ay * 2;
    for (let y = 0; y < dh; y++) {
      for (let x = 0; x < dw; x++) {
        const sx = Math.floor(ax + ((x + 0.5) / dw) * sw);
        const sy = Math.floor(ay + ((y + 0.5) / dh) * sh);
        const g = src.get(sx, sy);
        if (!g || g[3] <= 0) continue;
        this.set(dx + x, dy + y, [g[0], g[1], g[2]], g[3] * alpha);
      }
    }
    return this;
  }

  /**
   * ASCII sprite helper. `rows` is an array of equal-length strings; `map` maps
   * each character to a palette name. '.' and ' ' stay transparent.
   */
  ascii(rows, map, dx = 0, dy = 0, alpha = 1) {
    for (let y = 0; y < rows.length; y++) {
      const line = rows[y];
      for (let x = 0; x < line.length; x++) {
        const ch = line[x];
        if (ch === '.' || ch === ' ') continue;
        const c = map[ch];
        if (!c) continue;
        this.set(dx + x, dy + y, c, alpha);
      }
    }
    return this;
  }

  /** Exact PNG at the requested canvas size (each cell -> a rounded pixel span). */
  png() {
    const { w, h, cols, rows } = this;
    const out = Buffer.alloc(w * h * 4);
    const xb = new Int32Array(cols + 1);
    const yb = new Int32Array(rows + 1);
    for (let x = 0; x <= cols; x++) xb[x] = Math.round((x * w) / cols);
    for (let y = 0; y <= rows; y++) yb[y] = Math.round((y * h) / rows);

    for (let cy = 0; cy < rows; cy++) {
      const y0 = yb[cy];
      const y1 = yb[cy + 1];
      for (let cx = 0; cx < cols; cx++) {
        const i = this._i(cx, cy);
        const a = this.a[i];
        if (a <= 0.002) continue;
        const ab = Math.round(a * 255);
        const r = this.c[i * 3];
        const g = this.c[i * 3 + 1];
        const b = this.c[i * 3 + 2];
        const x0 = xb[cx];
        const x1 = xb[cx + 1];
        for (let y = y0; y < y1; y++) {
          let o = (y * w + x0) * 4;
          for (let x = x0; x < x1; x++) {
            out[o] = r;
            out[o + 1] = g;
            out[o + 2] = b;
            out[o + 3] = ab;
            o += 4;
          }
        }
      }
    }
    return encodePng(out, w, h);
  }
}

/** Convenience: a canvas sized to an exact px box with square-ish cells. */
export function pxBox(w, h, cell) {
  return new Px(w, h, Math.max(1, Math.round(w / cell)), Math.max(1, Math.round(h / cell)));
}

/** Draw a tiny 4-point star (plus shape with a bright core). */
export function sparkle(c, x, y, size, color, core = 'white') {
  c.set(x, y, core);
  for (let k = 1; k <= size; k++) {
    c.set(x + k, y, color);
    c.set(x - k, y, color);
    c.set(x, y + k, color);
    c.set(x, y - k, color);
  }
  return c;
}
