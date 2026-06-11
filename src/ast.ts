/**
 * Spreadsheet-style formula language: tokenizer + recursive-descent parser → a
 * serialisable typed AST (Decision 5a / M5 §C1). This module ONLY parses; it never
 * evaluates and contains NO code execution (no eval/Function/import). The AST is
 * plain JSON-serialisable data so it can be stored, re-parsed, and rendered for the
 * audit trail. Evaluation lives in `registry.ts` (§C2), which walks this AST and
 * dispatches to a fixed function registry.
 *
 * Grammar (lowest to highest precedence):
 *   expression := term (('+' | '-') term)*
 *   term       := factor (('*' | '/') factor)*
 *   factor     := '-' factor | primary
 *   primary    := number | call | reference | '(' expression ')'
 *   call       := identifier '(' (argument (',' argument)*)? ')'
 *   argument   := (identifier '=')? expression          // positional or named (k=1)
 *   reference  := identifier ('.' identifier)*           // jury.weighted_mean, vote.ux
 *
 * Out of v1 scope (config-authored formulas, no editor UI): string literals and
 * round cross-references like `entry.round('1')`. The built-in aggregator path
 * covers IWA; advanced refs are a v1.5 concern.
 */

export type AstNode = NumberLiteral | Reference | UnaryExpr | BinaryExpr | CallExpr;

export interface NumberLiteral {
  readonly kind: 'number';
  readonly value: number;
}
export interface Reference {
  readonly kind: 'ref';
  /** Dotted path segments, e.g. ['jury', 'weighted_mean'] or ['scores']. */
  readonly path: readonly string[];
}
export interface UnaryExpr {
  readonly kind: 'unary';
  readonly op: '-';
  readonly operand: AstNode;
}
export interface BinaryExpr {
  readonly kind: 'binary';
  readonly op: '+' | '-' | '*' | '/';
  readonly left: AstNode;
  readonly right: AstNode;
}
export interface CallArg {
  /** Present for named arguments like `k=1`; absent for positional. */
  readonly name?: string;
  readonly value: AstNode;
}
export interface CallExpr {
  readonly kind: 'call';
  readonly name: string;
  readonly args: readonly CallArg[];
}

export class FormulaParseError extends Error {
  constructor(
    message: string,
    readonly position: number,
  ) {
    super(`Formula parse error at ${position}: ${message}`);
    this.name = 'FormulaParseError';
  }
}

/* ── Tokenizer ─────────────────────────────────────────────────────────────── */

type TokenType = 'number' | 'identifier' | 'op' | 'lparen' | 'rparen' | 'comma' | 'dot' | 'eq';
interface Token {
  readonly type: TokenType;
  readonly value: string;
  readonly position: number;
}

const IDENT_START = /[A-Za-z_]/;
const IDENT_PART = /[A-Za-z0-9_]/;
const DIGIT = /[0-9]/;

function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  while (i < input.length) {
    const ch = input[i];
    if (ch === ' ' || ch === '\t' || ch === '\n' || ch === '\r') {
      i += 1;
      continue;
    }
    const start = i;
    // A '.' is part of a number only when a digit follows it.
    if (DIGIT.test(ch) || (ch === '.' && DIGIT.test(input[i + 1] ?? ''))) {
      let seenDot = false;
      while (i < input.length && (DIGIT.test(input[i]) || (input[i] === '.' && !seenDot))) {
        if (input[i] === '.') seenDot = true;
        i += 1;
      }
      tokens.push({ type: 'number', value: input.slice(start, i), position: start });
      continue;
    }
    if (IDENT_START.test(ch)) {
      i += 1;
      while (i < input.length && IDENT_PART.test(input[i])) i += 1;
      tokens.push({ type: 'identifier', value: input.slice(start, i), position: start });
      continue;
    }
    switch (ch) {
      case '+':
      case '-':
      case '*':
      case '/':
        tokens.push({ type: 'op', value: ch, position: start });
        break;
      case '(':
        tokens.push({ type: 'lparen', value: ch, position: start });
        break;
      case ')':
        tokens.push({ type: 'rparen', value: ch, position: start });
        break;
      case ',':
        tokens.push({ type: 'comma', value: ch, position: start });
        break;
      case '.':
        tokens.push({ type: 'dot', value: ch, position: start });
        break;
      case '=':
        tokens.push({ type: 'eq', value: ch, position: start });
        break;
      default:
        throw new FormulaParseError(`unexpected character '${ch}'`, start);
    }
    i += 1;
  }
  return tokens;
}

/* ── Parser ────────────────────────────────────────────────────────────────── */

class Parser {
  private pos = 0;
  constructor(private readonly tokens: Token[]) {}

  private peek(): Token | undefined {
    return this.tokens[this.pos];
  }
  private next(): Token {
    const t = this.tokens[this.pos];
    if (!t) throw new FormulaParseError('unexpected end of input', this.endPosition());
    this.pos += 1;
    return t;
  }
  private endPosition(): number {
    const last = this.tokens[this.tokens.length - 1];
    return last ? last.position + last.value.length : 0;
  }
  private expect(type: TokenType): Token {
    const t = this.peek();
    if (!t || t.type !== type) {
      throw new FormulaParseError(
        `expected ${type}${t ? `, found '${t.value}'` : ''}`,
        t?.position ?? this.endPosition(),
      );
    }
    return this.next();
  }

  parse(): AstNode {
    if (this.tokens.length === 0) {
      throw new FormulaParseError('empty formula', 0);
    }
    const node = this.expression();
    if (this.pos !== this.tokens.length) {
      const t = this.peek()!;
      throw new FormulaParseError(`unexpected '${t.value}'`, t.position);
    }
    return node;
  }

  private expression(): AstNode {
    let left = this.term();
    while (
      this.peek()?.type === 'op' &&
      (this.peek()!.value === '+' || this.peek()!.value === '-')
    ) {
      const op = this.next().value as '+' | '-';
      left = { kind: 'binary', op, left, right: this.term() };
    }
    return left;
  }

  private term(): AstNode {
    let left = this.factor();
    while (
      this.peek()?.type === 'op' &&
      (this.peek()!.value === '*' || this.peek()!.value === '/')
    ) {
      const op = this.next().value as '*' | '/';
      left = { kind: 'binary', op, left, right: this.factor() };
    }
    return left;
  }

  private factor(): AstNode {
    if (this.peek()?.type === 'op' && this.peek()!.value === '-') {
      this.next();
      return { kind: 'unary', op: '-', operand: this.factor() };
    }
    return this.primary();
  }

  private primary(): AstNode {
    const t = this.peek();
    if (!t) throw new FormulaParseError('unexpected end of input', this.endPosition());

    if (t.type === 'number') {
      this.next();
      const value = Number(t.value);
      if (!Number.isFinite(value)) {
        throw new FormulaParseError(`invalid number '${t.value}'`, t.position);
      }
      return { kind: 'number', value };
    }
    if (t.type === 'lparen') {
      this.next();
      const inner = this.expression();
      this.expect('rparen');
      return inner;
    }
    if (t.type === 'identifier') {
      this.next();
      if (this.peek()?.type === 'lparen') {
        return this.callTail(t.value);
      }
      return this.referenceTail(t.value);
    }
    throw new FormulaParseError(`unexpected '${t.value}'`, t.position);
  }

  private referenceTail(first: string): Reference {
    const path = [first];
    while (this.peek()?.type === 'dot') {
      this.next();
      path.push(this.expect('identifier').value);
    }
    return { kind: 'ref', path };
  }

  private callTail(name: string): CallExpr {
    this.expect('lparen');
    const args: CallArg[] = [];
    if (this.peek()?.type !== 'rparen') {
      args.push(this.argument());
      while (this.peek()?.type === 'comma') {
        this.next();
        args.push(this.argument());
      }
    }
    this.expect('rparen');
    return { kind: 'call', name, args };
  }

  private argument(): CallArg {
    // Named argument: identifier '=' expression (e.g. trimmed_mean(votes, k=1)).
    const t = this.peek();
    if (t?.type === 'identifier' && this.tokens[this.pos + 1]?.type === 'eq') {
      this.next();
      this.next();
      return { name: t.value, value: this.expression() };
    }
    return { value: this.expression() };
  }
}

/**
 * Parse a formula expression into a typed, serialisable AST. Throws
 * {@link FormulaParseError} on malformed input. Pure: no evaluation, no code
 * execution.
 */
export function parseFormula(expression: string): AstNode {
  return new Parser(tokenize(expression)).parse();
}
