export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function randomRange(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

export function randomInt(min: number, max: number): number {
  return Math.floor(randomRange(min, max + 1));
}

export function chance(probability: number): boolean {
  return Math.random() < probability;
}

export function pick<T>(items: readonly T[]): T {
  return items[Math.floor(Math.random() * items.length)];
}

export function weightedPick<T>(items: readonly T[], weightFn: (item: T) => number): T {
  const total = items.reduce((sum, item) => sum + Math.max(0, weightFn(item)), 0);
  let roll = Math.random() * total;
  for (const item of items) {
    roll -= Math.max(0, weightFn(item));
    if (roll <= 0) return item;
  }
  return items[items.length - 1];
}

let counter = 0;

export function uid(prefix = 'u'): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}_${Date.now().toString(36)}_${counter.toString(36)}_${Math.floor(
    Math.random() * 1_000_000,
  ).toString(36)}`;
}

export function hashSeed(input: string | number): number {
  let h = 2166136261;
  const text = String(input);
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(array: T[]): T[] {
  const copy = [...array];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}
