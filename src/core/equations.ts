/**
 * Port of `ExpressionEvaluator`.
 *
 * The original keeps every node's value and cost as a STRING equation evaluated at `x`,
 * the node's level - e.g. `1 + (x-1)^2` for the value and `10 * 1.5^(x-1)` for the cost.
 * Porting the evaluator means the tree's tuning stays data, and an equation copied out of
 * the decompiled source behaves identically here.
 *
 * Grammar, in precedence order (lowest first):
 *
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/') factor)*
 *   factor     := primary ('^' factor)?          // right associative
 *   primary    := '-' primary | '(' expression ')' | name | name '(' expression ')' | number
 *
 * Variables: `x` and `value` are the same thing. Functions: `F` = floor, `C` = ceiling.
 * Numbers accept `.` or `,` as the decimal separator plus `e`/`E` scientific notation.
 *
 * A whole equation wrapped in `[a, b, c]` is a DISCRETE LIST: it picks element
 * `round(x) - 1`, clamped into range, and then evaluates that element as its own
 * expression. `DatabaseManager.ShapingRuneCreateCostEquation` uses this form.
 */

function isLetter(ch: string): boolean {
  return /[A-Za-z]/.test(ch);
}

function isDigit(ch: string): boolean {
  return ch >= '0' && ch <= '9';
}

function isSpace(ch: string): boolean {
  return ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r';
}

class Parser {
  private pos = 0;

  constructor(
    private readonly src: string,
    private readonly x: number,
  ) {}

  parse(): number {
    const value = this.parseExpression();
    this.skipWhitespace();
    if (this.pos < this.src.length) {
      throw new Error(`unexpected character at ${this.pos}: '${this.src[this.pos]}'`);
    }
    return value;
  }

  private parseExpression(): number {
    let value = this.parseTerm();
    for (;;) {
      this.skipWhitespace();
      if (this.pos < this.src.length && this.src[this.pos] === '+') {
        this.pos++;
        value += this.parseTerm();
        continue;
      }
      if (this.pos >= this.src.length || this.src[this.pos] !== '-') break;
      this.pos++;
      value -= this.parseTerm();
    }
    return value;
  }

  private parseTerm(): number {
    let value = this.parseFactor();
    for (;;) {
      this.skipWhitespace();
      if (this.pos < this.src.length && this.src[this.pos] === '*') {
        this.pos++;
        value *= this.parseFactor();
        continue;
      }
      if (this.pos >= this.src.length || this.src[this.pos] !== '/') break;
      this.pos++;
      value /= this.parseFactor();
    }
    return value;
  }

  private parseFactor(): number {
    const value = this.parsePrimary();
    this.skipWhitespace();
    if (this.pos < this.src.length && this.src[this.pos] === '^') {
      this.pos++;
      // Right associative: `2^3^2` is `2^(3^2)`, matching the original.
      return Math.pow(value, this.parseFactor());
    }
    return value;
  }

  private parsePrimary(): number {
    this.skipWhitespace();
    if (this.pos >= this.src.length) throw new Error('unexpected end of input');
    let negative = false;
    if (this.src[this.pos] === '-') {
      negative = true;
      this.pos++;
      this.skipWhitespace();
      if (this.pos >= this.src.length) throw new Error('unexpected end after unary minus');
    }

    const ch = this.src[this.pos];
    let value: number;
    if (ch === '(') {
      this.pos++;
      value = this.parseExpression();
      this.skipWhitespace();
      if (this.pos >= this.src.length || this.src[this.pos] !== ')') {
        throw new Error('missing closing parenthesis');
      }
      this.pos++;
    } else if (isLetter(ch)) {
      const name = this.parseName();
      this.skipWhitespace();
      if (this.pos < this.src.length && this.src[this.pos] === '(') {
        this.pos++;
        const arg = this.parseExpression();
        this.skipWhitespace();
        if (this.pos >= this.src.length || this.src[this.pos] !== ')') {
          throw new Error(`missing closing parenthesis for function '${name}'`);
        }
        this.pos++;
        value = evalFunction(name, arg);
      } else {
        const lower = name.toLowerCase();
        if (lower !== 'x' && lower !== 'value') throw new Error(`unknown variable '${name}'`);
        value = this.x;
      }
    } else {
      value = this.parseNumber();
    }
    return negative ? -value : value;
  }

  private skipWhitespace(): void {
    while (this.pos < this.src.length && isSpace(this.src[this.pos])) this.pos++;
  }

  private parseName(): string {
    const start = this.pos;
    while (this.pos < this.src.length && isLetter(this.src[this.pos])) this.pos++;
    return this.src.slice(start, this.pos);
  }

  private parseNumber(): number {
    const start = this.pos;
    let sawDot = false;
    let sawExp = false;
    while (this.pos < this.src.length) {
      const ch = this.src[this.pos];
      if (isDigit(ch)) {
        this.pos++;
        continue;
      }
      if ((ch === '.' || ch === ',') && !sawDot && !sawExp) {
        sawDot = true;
        this.pos++;
        continue;
      }
      if ((ch !== 'e' && ch !== 'E') || sawExp) break;
      sawExp = true;
      this.pos++;
      if (this.pos < this.src.length && (this.src[this.pos] === '+' || this.src[this.pos] === '-')) {
        this.pos++;
      }
      if (this.pos >= this.src.length || !isDigit(this.src[this.pos])) {
        throw new Error("invalid scientific notation: expected a digit after 'e'");
      }
      while (this.pos < this.src.length && isDigit(this.src[this.pos])) this.pos++;
      break;
    }
    const text = this.src.slice(start, this.pos);
    if (!text.trim()) throw new Error('invalid number: empty token');
    const normalised = text.replace(',', '.');
    const parsed = Number(normalised);
    if (!Number.isFinite(parsed)) throw new Error(`invalid number '${text}'`);
    return parsed;
  }
}

function evalFunction(name: string, arg: number): number {
  const lower = name.toLowerCase();
  if (lower === 'f') return Math.floor(arg);
  if (lower === 'c') return Math.ceil(arg);
  throw new Error(`unknown function '${name}'`);
}

/** Splits a discrete list's inner text on commas that are not inside parentheses. */
function splitListElements(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const ch = inner[i];
    if (ch === '(') depth++;
    else if (ch === ')') depth--;
    else if (ch === ',' && depth === 0) {
      out.push(inner.slice(start, i));
      start = i + 1;
    }
  }
  out.push(inner.slice(start));
  return out;
}

/**
 * Evaluates `equation` at `value`.
 *
 * Returns 0 for an empty equation rather than throwing: a node may legitimately declare
 * no cost or no value, and the original's callers guard with `IsNullOrEmpty` before
 * calling. Throwing here would take down a whole frame of the UI.
 */
export function evaluate(equation: string, value: number): number {
  if (!equation) return 0;
  const text = equation.trim();
  if (text.length >= 2 && text[0] === '[' && text[text.length - 1] === ']') {
    return evaluateDiscreteList(text, value);
  }
  return new Parser(equation, value).parse();
}

/** `[a, b, c]` picks element `round(x)-1`, clamped, then evaluates it. */
function evaluateDiscreteList(listText: string, x: number): number {
  const items = splitListElements(listText.slice(1, -1));
  if (items.length === 0) throw new Error('discrete list is empty');
  let index = Math.round(x) - 1;
  index = Math.max(0, Math.min(index, items.length - 1));
  return new Parser(items[index].trim(), x).parse();
}
