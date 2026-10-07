/**
 * Space-reskin canvas + PNG writer. Zero dependencies (node:zlib only).
 *
 * Design notes:
 *  - Every pixel starts at alpha 0, so "nothing drawn" = transparent.
 *  - `wrap` makes all drawing horizontally seamless, which the 1920-wide parallax
 *    layers require (the renderer tiles each layer three times).
 *  - Colours are [r,g,b] with an explicit alpha argument; blending is source-over.
 */
import { deflateSync } from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

/** Encode an RGBA byte buffer (w*h*4) as a PNG. */
export function encodePng(rgba, w, h) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // colour type: RGBA
  ihdr[10] = 0; // deflate
  ihdr[11] = 0; // adaptive filtering
  ihdr[12] = 0; // no interlace

  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0; // filter: none (keeps this simple and still compresses well)
    rgba.copy
      ? rgba.copy(raw, y * (stride + 1) + 1, y * stride, y * stride + stride)
      : Buffer.from(rgba.buffer, y * stride, stride).copy(raw, y * (stride + 1) + 1);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export const clamp = (v, lo = 0, hi = 1) => (v < lo ? lo : v > hi ? hi : v);
export const lerp = (a, b, t) => a + (b - a) * t;
/** Smooth 0..1 ramp. */
export const smooth = (t) => {
  const x = clamp(t);
  return x * x * (3 - 2 * x);
};
export const mix = (a, b, t) => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

/** Deterministic PRNG (mulberry32) so a re-run produces identical art. */
export class Rng {
  constructor(seed) {
    this.s = (seed >>> 0) || 0x9e3779b9;
  }
  next() {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  range(a, b) {
    return a + this.next() * (b - a);
  }
  int(a, b) {
    return Math.floor(this.range(a, b + 1));
  }
  pick(list) {
    return list[Math.min(list.length - 1, Math.floor(this.next() * list.length))];
  }
  chance(p) {
    return this.next() < p;
  }
}

export class Canvas {
  constructor(w, h, { wrap = false, cover = 1 } = {}) {
    this.w = w;
    this.h = h;
    this.wrap = wrap;
    /**
     * `cover < 1` makes `blend` scale every source alpha. The parallax layers use it
     * so a far-away element (planet, station) cannot compete with the characters:
     * three stacked layers at 92% opacity each would otherwise read as solid.
     */
    this.cover = cover;
    this.data = Buffer.alloc(w * h * 4); // all-transparent
  }

  /** Horizontal wrap for seamless tiling. */
  wx(x) {
    if (!this.wrap) return x;
    const m = x % this.w;
    return m < 0 ? m + this.w : m;
  }

  blend(x, y, rgb, a) {
    if (a <= 0) return;
    const a2 = this.cover === 1 ? a : a * this.cover;
    if (a2 <= 0) return;
    const xi = this.wrap ? this.wx(Math.round(x)) : Math.round(x);
    const yi = Math.round(y);
    if (yi < 0 || yi >= this.h || xi < 0 || xi >= this.w) return;
    const i = (yi * this.w + xi) * 4;
    const d = this.data;
    const sa = a2 > 1 ? 1 : a2;
    const da = d[i + 3] / 255;
    const oa = sa + da * (1 - sa);
    if (oa <= 0) return;
    d[i] = Math.round((rgb[0] * sa + d[i] * da * (1 - sa)) / oa);
    d[i + 1] = Math.round((rgb[1] * sa + d[i + 1] * da * (1 - sa)) / oa);
    d[i + 2] = Math.round((rgb[2] * sa + d[i + 2] * da * (1 - sa)) / oa);
    d[i + 3] = Math.round(oa * 255);
  }

  /** Set pixel straight (no blend), used by the post passes. */
  put(x, y, rgb, a = 1) {
    const xi = this.wrap ? this.wx(x) : x;
    if (xi < 0 || xi >= this.w || y < 0 || y >= this.h) return;
    const i = (y * this.w + xi) * 4;
    this.data[i] = rgb[0];
    this.data[i + 1] = rgb[1];
    this.data[i + 2] = rgb[2];
    this.data[i + 3] = Math.round(clamp(a) * 255);
  }

  get(x, y) {
    const xi = this.wrap ? this.wx(x) : x;
    if (xi < 0 || xi >= this.w || y < 0 || y >= this.h) return [0, 0, 0, 0];
    const i = (y * this.w + xi) * 4;
    return [this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3] / 255];
  }

  /**
   * Additive light. Cheap and gives the neon glow the space theme needs:
   *   colour += rgb * a, alpha = max(alpha, 255*a)
   */
  add(x, y, rgb, a) {
    if (a <= 0) return;
    const xi = this.wrap ? this.wx(Math.round(x)) : Math.round(x);
    const yi = Math.round(y);
    if (yi < 0 || yi >= this.h || xi < 0 || xi >= this.w) return;
    const i = (yi * this.w + xi) * 4;
    const d = this.data;
    d[i] = Math.min(255, d[i] + rgb[0] * a);
    d[i + 1] = Math.min(255, d[i + 1] + rgb[1] * a);
    d[i + 2] = Math.min(255, d[i + 2] + rgb[2] * a);
    d[i + 3] = Math.min(255, d[i + 3] + 255 * Math.min(1, a));
  }

  // ------------------------------------------------------------------ shapes

  rect(x0, y0, w, h, rgb, a = 1) {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.blend(x, y, rgb, a);
    return this;
  }

  /** Opaque full-width row (the sky wash). Deliberately ignores `wrap`. */
  fillRow(y, rgb, a = 1) {
    const yi = Math.round(y);
    if (yi < 0 || yi >= this.h) return this;
    const base = yi * this.w * 4;
    for (let x = 0; x < this.w; x++) {
      const i = base + x * 4;
      const sa = clamp(a);
      const da = this.data[i + 3] / 255;
      const oa = sa + da * (1 - sa);
      if (oa <= 0) continue;
      this.data[i] = Math.round((rgb[0] * sa + this.data[i] * da * (1 - sa)) / oa);
      this.data[i + 1] = Math.round((rgb[1] * sa + this.data[i + 1] * da * (1 - sa)) / oa);
      this.data[i + 2] = Math.round((rgb[2] * sa + this.data[i + 2] * da * (1 - sa)) / oa);
      this.data[i + 3] = Math.round(oa * 255);
    }
    return this;
  }

  /** Filled circle with optional soft edge (in pixels). */
  disc(cx, cy, r, rgb, a = 1, soft = 1) {
    const x0 = Math.floor(cx - r - soft - 1);
    const x1 = Math.ceil(cx + r + soft + 1);
    const y0 = Math.max(0, Math.floor(cy - r - soft - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r + soft + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const t = clamp(1 - (d - r) / (soft + 1e-6));
        if (t > 0) this.blend(x, y, rgb, a * t);
      }
    }
    return this;
  }

  ring(cx, cy, r, thickness, rgb, a = 1, soft = 1) {
    const x0 = Math.floor(cx - r - thickness - soft - 1);
    const x1 = Math.ceil(cx + r + thickness + soft + 1);
    const y0 = Math.max(0, Math.floor(cy - r - thickness - soft - 1));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + r + thickness + soft + 1));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const t = clamp(1 - (Math.abs(d - r) - thickness / 2) / (soft + 1e-6));
        if (t > 0) this.blend(x, y, rgb, a * t);
      }
    }
    return this;
  }

  /** Arbitrary polygon fill (even-odd), with optional softness via supersampling. */
  poly(points, rgb, a = 1, soft = 0.7) {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const x0 = Math.floor(Math.min(...xs) - 2);
    const x1 = Math.ceil(Math.max(...xs) + 2);
    const y0 = Math.max(0, Math.floor(Math.min(...ys) - 2));
    const y1 = Math.min(this.h - 1, Math.ceil(Math.max(...ys) + 2));
    const inside = (px, py) => {
      let hit = false;
      for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
        const [xi, yi] = points[i];
        const [xj, yj] = points[j];
        if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) hit = !hit;
      }
      return hit;
    };
    const S = soft > 0 ? 3 : 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let cov = 0;
        for (let sy = 0; sy < S; sy++) {
          for (let sx = 0; sx < S; sx++) {
            if (inside(x + (sx + 0.5) / S, y + (sy + 0.5) / S)) cov++;
          }
        }
        if (cov) this.blend(x, y, rgb, (a * cov) / (S * S));
      }
    }
    return this;
  }

  /** Line with round caps (used for limbs, rings, arcs). */
  line(x0, y0, x1, y1, width, rgb, a = 1) {
    const steps = Math.max(2, Math.ceil(Math.hypot(x1 - x0, y1 - y0)));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      this.disc(lerp(x0, x1, t), lerp(y0, y1, t), width / 2, rgb, a, 0.6);
    }
    return this;
  }

  /**
   * Annular sector (a slice of a ring) - the workhorse for planets, portals and
   * orbital rings. Angles in radians.
   */
  arc(cx, cy, r, thickness, a0, a1, rgb, a = 1, soft = 1) {
    const rr = r + thickness + soft + 2;
    const x0 = Math.floor(cx - rr);
    const x1 = Math.ceil(cx + rr);
    const y0 = Math.max(0, Math.floor(cy - rr));
    const y1 = Math.min(this.h - 1, Math.ceil(cy + rr));
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        const d = Math.hypot(dx, dy);
        if (Math.abs(d - r) > thickness / 2 + soft) continue;
        let ang = Math.atan2(dy, dx);
        ang = ((ang - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        const span = ((a1 - a0) % (Math.PI * 2) + Math.PI * 2) % (Math.PI * 2);
        if (ang > span) continue;
        const edge = clamp(1 - (Math.abs(d - r) - thickness / 2) / (soft + 1e-6));
        const cap = Math.min(clamp(ang / 2), clamp((span - ang) / 2));
        this.blend(x, y, rgb, a * edge * Math.min(1, cap + 0.15));
      }
    }
    return this;
  }

  /** Vertical linear gradient, per-row colour. */
  vgrad(x0, y0, w, h, stops, a = 1) {
    for (let k = 0; k < h; k++) {
      const t = h <= 1 ? 0 : k / (h - 1);
      this.rect(x0, y0 + k, w, 1, sampleStops(stops, t), a);
    }
    return this;
  }

  // ------------------------------------------------------------------ passes

  /** Bright-pass + box blur, then additive composite: the glow pass. */
  glow(radius = 3, strength = 0.9, threshold = 40) {
    const { w, h } = this;
    const src = Buffer.from(this.data);
    const bright = Buffer.alloc(w * h * 4);
    for (let i = 0; i < w * h; i++) {
      const o = i * 4;
      const lum = 0.299 * src[o] + 0.587 * src[o + 1] + 0.114 * src[o + 2];
      const a = src[o + 3] / 255;
      if (lum * a < threshold) continue;
      bright[o] = src[o];
      bright[o + 1] = src[o + 1];
      bright[o + 2] = src[o + 2];
      bright[o + 3] = Math.round(src[o + 3] * a);
    }
    const blurred = boxBlur(bright, w, h, radius);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const i = (y * w + x) * 4;
        const a = (blurred[i + 3] / 255) * strength;
        if (a <= 0.004) continue;
        this.add(x, y, [blurred[i], blurred[i + 1], blurred[i + 2]], a);
      }
    }
    return this;
  }

  /** Multiply the whole canvas by a radial falloff (soft sprite edges). */
  vignette(cx, cy, rInner, rOuter) {
    for (let y = 0; y < this.h; y++) {
      for (let x = 0; x < this.w; x++) {
        const d = Math.hypot(x - cx, y - cy);
        const t = clamp(1 - (d - rInner) / (rOuter - rInner));
        if (t >= 1) continue;
        const i = (y * this.w + x) * 4;
        this.data[i + 3] = Math.round(this.data[i + 3] * t);
      }
    }
    return this;
  }

  /** Per-pixel HSB-ish tint of the generated art (keeps the artist palette tight). */
  tintAll(rgb, a = 1) {
    for (let i = 0; i < this.w * this.h; i++) {
      const o = i * 4;
      if (!this.data[o + 3]) continue;
      this.data[o] = Math.round(lerp(this.data[o], rgb[0], a));
      this.data[o + 1] = Math.round(lerp(this.data[o + 1], rgb[1], a));
      this.data[o + 2] = Math.round(lerp(this.data[o + 2], rgb[2], a));
    }
    return this;
  }

  png() {
    return encodePng(this.data, this.w, this.h);
  }
}

export function sampleStops(stops, t) {
  const x = clamp(t);
  for (let i = 0; i < stops.length - 1; i++) {
    const [p0, c0] = stops[i];
    const [p1, c1] = stops[i + 1];
    if (x >= p0 && x <= p1) return mix(c0, c1, (x - p0) / Math.max(1e-6, p1 - p0));
  }
  return stops[x <= stops[0][0] ? 0 : stops.length - 1][1];
}

export function boxBlur(src, w, h, radius) {
  const tmp = Buffer.alloc(w * h * 4);
  const out = Buffer.alloc(w * h * 4);
  const r = Math.max(1, Math.round(radius));
  const pass = (input, output, horizontal) => {
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        let sr = 0;
        let sg = 0;
        let sb = 0;
        let sa = 0;
        let n = 0;
        for (let k = -r; k <= r; k++) {
          const xx = horizontal ? x + k : x;
          const yy = horizontal ? y : y + k;
          if (xx < 0 || xx >= w || yy < 0 || yy >= h) continue;
          const i = (yy * w + xx) * 4;
          sr += input[i];
          sg += input[i + 1];
          sb += input[i + 2];
          sa += input[i + 3];
          n++;
        }
        const o = (y * w + x) * 4;
        output[o] = sr / n;
        output[o + 1] = sg / n;
        output[o + 2] = sb / n;
        output[o + 3] = sa / n;
      }
    }
  };
  pass(src, tmp, true);
  pass(tmp, out, false);
  return out;
}

/** Static helpers used by several generators. */
export const SPACE = {
  void: [4, 7, 16],
  deep: [8, 14, 32],
  mid: [16, 26, 54],
  haze: [40, 60, 120],
  cyan: [80, 220, 255],
  ice: [150, 235, 255],
  amber: [255, 176, 74],
  gold: [255, 208, 102],
  violet: [176, 108, 255],
  magenta: [255, 90, 200],
  green: [110, 240, 170],
  steel: [122, 138, 160],
  darkSteel: [46, 56, 74],
  panel: [30, 40, 60],
  rust: [150, 70, 50],
};
