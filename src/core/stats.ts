/**
 * The stat system, ported from `StatsData` / `StatsInt` / `StatsFloat` /
 * `StatsDouble` and the `StatsProperties` enum.
 *
 * ## Key convention (this is the part that is easy to get wrong)
 *
 * The original keys `StatsDict` by the stat's **variable name only** — `"Damage"`,
 * `"PlayerMovementSpeed"` — and passes `StatsProperties` as a separate argument:
 *
 *     stats.ChangeAStat("Damage", StatsProperties.Flat, 1.0, IsAdd: true)
 *     stats.Damage.Total.RealValue
 *
 * A stat is one object holding three layers:
 *
 *     Total = round( Flat * (1 + Additive/100) * Multiplicative )
 *
 * `Flat` is the base amount, `Additive` accumulates percentage points, and
 * `Multiplicative` is a running product (so it starts at 1, not 0). The "set"
 * modes reset the other layers, which is how set-bonuses work with no
 * special-case code.
 *
 * `StatInfo.functionName` (`VariableName + StatsProp`, e.g. `"DamageFlat"`) is a
 * *localisation key* for tooltips, not a dictionary key. The slice therefore
 * keeps the same variable names as the original so the exported content tables
 * can be imported without renaming anything.
 */

export enum StatsProp {
  Flat = 'Flat',
  Additive = 'Additive',
  Multiplicative = 'Multiplicative',
  SetFlat_And_ResetAddMulti = 'SetFlat_And_ResetAddMulti',
  SetFlatOnly = 'SetFlatOnly',
  SetAdditiveOnly = 'SetAdditiveOnly',
  SetMultiplicativeOnly = 'SetMultiplicativeOnly',
}

/** One layer of a stat (`StatsValueDouble` in the original). */
interface StatLayer {
  /** Backing value written by modifiers. */
  value: number;
  /** Clamped view the rest of the game reads. */
  real: number;
}

function makeLayer(value: number): StatLayer {
  return { value, real: value };
}

export class Stat {
  readonly flat: StatLayer = makeLayer(0);
  readonly additive: StatLayer = makeLayer(0);
  readonly multiplicative: StatLayer = makeLayer(1);
  total = 0;

  constructor(flat = 0) {
    this.flat.value = flat;
    this.flat.real = flat;
    this.recalc();
  }

  /**
   * Mirrors `StatsDouble.CalculateTotal`. Below 1000 the result rounds to 2dp so
   * tooltips do not show float noise; past 1000 it rounds to whole numbers.
   */
  recalc(): void {
    const f = this.flat.real;
    const t = f * (1 + this.additive.real / 100) * this.multiplicative.real;
    this.total = Math.abs(f) < 1000 ? Math.round(t * 100) / 100 : Math.round(t);
  }

  get(): number {
    return this.total;
  }
}

/**
 * A bag of named stats, keyed by variable name exactly like `StatsData.StatsDict`.
 */
export class StatBag {
  private readonly map = new Map<string, Stat>();

  /** Get-or-create, so content tables can register stats lazily. */
  stat(variable: string): Stat {
    let s = this.map.get(variable);
    if (!s) {
      s = new Stat();
      this.map.set(variable, s);
    }
    return s;
  }

  has(variable: string): boolean {
    return this.map.has(variable);
  }

  variables(): IterableIterator<string> {
    return this.map.keys();
  }

  entries(): IterableIterator<[string, Stat]> {
    return this.map.entries();
  }

  /** Read a stat's total; unregistered stats read as 0 rather than throwing. */
  get(variable: string): number {
    return this.map.get(variable)?.total ?? 0;
  }

  /** Read one layer's real value, e.g. `layer("RuneImplicitsCount", StatsProp.Flat)`. */
  layer(variable: string, prop: StatsProp): number {
    const s = this.map.get(variable);
    if (!s) return 0;
    switch (prop) {
      case StatsProp.Flat:
        return s.flat.real;
      case StatsProp.Additive:
        return s.additive.real;
      case StatsProp.Multiplicative:
        return s.multiplicative.real;
      default:
        return s.total;
    }
  }

  /**
   * The single mutation entry point, ported from `StatsData.ChangeAStat`.
   * `isAdd: false` reverses a previously applied modifier.
   */
  change(variable: string, prop: StatsProp, value: number, isAdd = true): void {
    const s = this.stat(variable);
    const sign = isAdd ? 1 : -1;

    switch (prop) {
      case StatsProp.Flat:
        s.flat.value += value * sign;
        s.flat.real = s.flat.value;
        break;

      case StatsProp.Additive:
        s.additive.value += value * sign;
        s.additive.real = s.additive.value;
        break;

      case StatsProp.Multiplicative:
        // Stored as a running product: each point is +value%.
        s.multiplicative.value *= Math.pow(1 + value / 100, sign);
        s.multiplicative.real = s.multiplicative.value;
        break;

      case StatsProp.SetFlat_And_ResetAddMulti:
        s.flat.value = value;
        s.flat.real = value;
        s.additive.value = 0;
        s.additive.real = 0;
        s.multiplicative.value = 1;
        s.multiplicative.real = 1;
        break;

      case StatsProp.SetFlatOnly:
        s.flat.value = value;
        s.flat.real = value;
        break;

      case StatsProp.SetAdditiveOnly:
        s.additive.value = value;
        s.additive.real = value;
        break;

      case StatsProp.SetMultiplicativeOnly:
        s.multiplicative.value = value;
        s.multiplicative.real = value;
        break;
    }

    s.recalc();
  }

  /** Convenience: set a flat base, as `PlayerStatsData.Init` does. */
  setFlat(variable: string, value: number): void {
    this.change(variable, StatsProp.SetFlatOnly, value);
  }

  addFlat(variable: string, value: number): void {
    this.change(variable, StatsProp.Flat, value, true);
  }

  /** Serialise layer values only; totals are recomputed on load. */
  toJSON(): Record<string, [number, number, number]> {
    const out: Record<string, [number, number, number]> = {};
    for (const [k, s] of this.map) {
      out[k] = [s.flat.value, s.additive.value, s.multiplicative.value];
    }
    return out;
  }

  static fromJSON(data: Record<string, [number, number, number]>): StatBag {
    const bag = new StatBag();
    for (const [k, [flat, add, mult]] of Object.entries(data)) {
      const s = bag.stat(k);
      s.flat.value = flat;
      s.flat.real = flat;
      s.additive.value = add;
      s.additive.real = add;
      s.multiplicative.value = mult;
      s.multiplicative.real = mult;
      s.recalc();
    }
    return bag;
  }

  /** Registers every variable with a flat base in one call. */
  defineAll(bases: Record<string, number>): void {
    for (const [k, v] of Object.entries(bases)) this.setFlat(k, v);
  }
}
