/**
 * Save-file shape and normalisation.
 *
 * Kept free of DOM access so the verify suite can test the round-trip. The important
 * lesson encoded here: `saveNow()` wrote the talent tree, jobs and masteries, but the
 * loader once forgot to copy them back, so every restart silently wiped the entire
 * late-game power curve while keeping the level and gold. A save is only a save if every
 * field the writer emits is admitted by the reader.
 */
import type { EnemyType } from '../content/data.js';

export const SAVE_KEY = 'zad-archery-web/save/v1';

export interface SaveData {
  level: number;
  gold: number;
  kills: number;
  defeatedGuardians: EnemyType[];
  /** Purchased talent node levels, keyed by node id. */
  talent?: Record<string, number>;
  /** Player level, experience and the premium currency. */
  progression: { level: number; exp: number };
  /** Monster-family currencies and the `WasCurrencyShownBefore` visibility flags. */
  currencies?: Record<string, number>;
  currencySeen?: Record<string, boolean>;
  /** Portal currency, its visibility flag, and the levels that already paid out. */
  portalCurrency?: number;
  portalCurrencySeen?: boolean;
  portalCurrencyPaid?: number[];
  /** Unlocked jobs + skill levels. */
  jobs?: { jobs: number[]; skills: Record<string, number> };
  /** Mastery NPC level, per-mastery levels, awakenings and pinnacle charges. */
  mastery?: {
    npcLevel: number;
    levels: Record<string, number>;
    awakened: string[];
    charges: Record<string, number>;
  };
}

/** A fresh, playable save. */
export function emptySave(): SaveData {
  return {
    level: 1,
    gold: 0,
    kills: 0,
    defeatedGuardians: [],
    progression: { level: 1, exp: 0 },
    talent: {},
    jobs: { jobs: [0], skills: {} },
    mastery: { npcLevel: 1, levels: {}, awakened: [], charges: {} },
    currencies: {},
    currencySeen: {},
    portalCurrency: 0,
    portalCurrencySeen: false,
    portalCurrencyPaid: [],
  };
}

function num(v: unknown, fallback = 0): number {
  return typeof v === 'number' && Number.isFinite(v) ? v : fallback;
}

function record(v: unknown): Record<string, number> {
  if (!v || typeof v !== 'object') return {};
  const out: Record<string, number> = {};
  for (const [k, value] of Object.entries(v as Record<string, unknown>)) {
    if (typeof value === 'number' && Number.isFinite(value)) out[k] = value;
  }
  return out;
}

/**
 * Turns arbitrary parsed JSON (old save, hand-edited save, garbage) into a complete,
 * playable SaveData. Never throws: a corrupt save degrades to a fresh one instead of
 * bricking boot.
 */
export function normalizeSave(parsed: unknown): SaveData {
  const base = emptySave();
  if (!parsed || typeof parsed !== 'object') return base;
  const p = parsed as Partial<SaveData>;

  const prog = p.progression;
  const jobs = p.jobs;
  const mast = p.mastery;

  return {
    level: Math.max(1, Math.floor(num(p.level, 1))),
    gold: Math.max(0, Math.floor(num(p.gold, 0))),
    kills: Math.max(0, Math.floor(num(p.kills, 0))),
    defeatedGuardians: Array.isArray(p.defeatedGuardians)
      ? (p.defeatedGuardians.filter((g) => typeof g === 'string') as EnemyType[])
      : [],
    // Every field below is written by `saveNow`; all of them must survive a reload.
    talent: record(p.talent),
    progression: {
      level: Math.max(1, Math.floor(num(prog?.level, 1))),
      exp: Math.max(0, num(prog?.exp, 0)),
    },
    jobs: {
      // Job 0 is unlocked from the start; keep that invariant even on a damaged save.
      jobs: Array.isArray(jobs?.jobs)
        ? [...new Set([0, ...jobs.jobs.filter((j) => Number.isInteger(j) && j >= 0)])].sort((a, b) => a - b)
        : [0],
      skills: record(jobs?.skills),
    },
    mastery: {
      npcLevel: Math.max(1, Math.floor(num(mast?.npcLevel, 1))),
      levels: record(mast?.levels),
      awakened: Array.isArray(mast?.awakened) ? mast.awakened.filter((s) => typeof s === 'string') : [],
      charges: record(mast?.charges),
    },
    currencies: record(p.currencies),
    currencySeen: p.currencySeen && typeof p.currencySeen === 'object' ? { ...p.currencySeen } : {},
    portalCurrency: Math.max(0, Math.round(num(p.portalCurrency, 0))),
    portalCurrencySeen: p.portalCurrencySeen === true,
    portalCurrencyPaid: Array.isArray(p.portalCurrencyPaid)
      ? p.portalCurrencyPaid.filter((n) => Number.isFinite(n))
      : [],
  };
}
