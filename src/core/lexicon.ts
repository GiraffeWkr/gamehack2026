/**
 * Weapon reskin lexicon: bow -> energy carbine, arrow rain -> orbital strike.
 *
 * The combat layer is now sci-fi (energy carbine + orbital lance strike), but a lot of
 * player-visible text still comes from the original's generated localisation tables
 * (`treeData.ts`, `jobData.ts`), which are machine-exported and must not be hand-edited.
 * Rather than fork those tables, every display path runs the string through
 * `reskinText`, which rewrites the handful of archery terms consistently.
 *
 * Internal logic ids (`archerSpawned`, ...) keep their old names: they are
 * stable identifiers across saves, tests and tooling.
 */
import type { Lang } from './i18n.js';

/** Ordered replacements: longer phrases first so `箭雨` never becomes `弹雨`. */
const ZH: Array<[string, string]> = [
  ['箭雨', '轨道打击'],
  ['箭矢', '能量弹'],
  ['箭匣', '弹匣'],
  ['弓箭手', '射手'],
  ['爆炸箭', '爆裂弹'],
  ['爆破箭', '爆裂弹'],
  ['弓币', '射手宝石'],
  ['箭', '弹'],
  ['弓', '枪'],
];

const EN: Array<[string, string]> = [
  ['Arrowfall', 'Orbital Strike'],
  ['arrow-fall', 'orbital strike'],
  ['Arrow Fall', 'Orbital Strike'],
  ['arrows', 'bolts'],
  ['Arrows', 'Bolts'],
  ['arrow', 'bolt'],
  ['Arrow', 'Bolt'],
  ['archer', 'marksman'],
  ['Archer', 'Marksman'],
  ['Bow', 'Rifle'],
  ['bow', 'rifle'],
];

/** Rewrite legacy archery vocabulary into the carbine/orbital-strike vocabulary. */
export function reskinText(text: string, lang: Lang = 'zh'): string {
  if (!text) return text;
  let out = text;
  for (const [from, to] of lang === 'zh' ? ZH : EN) {
    if (out.includes(from)) out = out.split(from).join(to);
  }
  return out;
}
