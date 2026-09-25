/**
 * Math helpers. Kept deliberately tiny — the game logic mirrors the original
 * Unity C# (`FunctionsNeeded`, `MyExtensions`) so the tuning data stays valid.
 */

export const clamp = (v: number, lo: number, hi: number): number =>
  v < lo ? lo : v > hi ? hi : v;

export const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Random float in [min, max) — matches UnityEngine.Random.Range(float, float). */
export const randRange = (min: number, max: number): number =>
  min + Math.random() * (max - min);

/** Random int in [min, max) — matches UnityEngine.Random.Range(int, int). */
export const randInt = (min: number, max: number): number =>
  min + Math.floor(Math.random() * (max - min));

export const randSign = (): number => (Math.random() < 0.5 ? -1 : 1);

/**
 * The original rounds stat totals to 2 decimals for "normal" magnitudes and to
 * whole numbers once a stat exceeds 1000, to stop float noise rendering as
 * 1234.5600000000002 in tooltips. Mirroring it keeps displayed numbers equal.
 */
export const roundStat = (v: number): number =>
  Math.abs(v) < 1000 ? Math.round(v * 100) / 100 : Math.round(v);

/** Compact number formatting for floating damage text (1.2K, 3.4M, ...). */
const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc'];

export function toReadable(value: number, decimals = 2): string {
  const neg = value < 0;
  let v = Math.abs(value);
  if (v < 1000) {
    const s = v % 1 === 0 ? String(v) : v.toFixed(decimals).replace(/\.?0+$/, '');
    return (neg ? '-' : '') + s;
  }
  let tier = 0;
  while (v >= 1000 && tier < SUFFIXES.length - 1) {
    v /= 1000;
    tier++;
  }
  const s = v >= 100 ? v.toFixed(0) : v >= 10 ? v.toFixed(1) : v.toFixed(2);
  return (neg ? '-' : '') + s.replace(/\.?0+$/, '') + SUFFIXES[tier];
}

/** Deterministic 32-bit PRNG so a run seed reproduces the original layout. */
export class Rng {
  private state: number;

  constructor(seed: number) {
    // Avoid a zero state, which would make mulberry32 emit only zeros.
    this.state = (seed >>> 0) || 0x9e3779b9;
  }

  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min));
  }

  pick<T>(items: readonly T[]): T {
    return items[this.int(0, items.length)];
  }

  chance(percent: number): boolean {
    return this.next() * 100 < percent;
  }
}
