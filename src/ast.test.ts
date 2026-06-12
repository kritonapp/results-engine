import { describe, expect, it } from 'vitest';
import { type AstNode, FormulaParseError, parseFormula } from './ast.js';

describe('parseFormula', () => {
  it('parses a number literal', () => {
    expect(parseFormula('42')).toEqual<AstNode>({ kind: 'number', value: 42 });
    expect(parseFormula('0.7')).toEqual<AstNode>({ kind: 'number', value: 0.7 });
    expect(parseFormula('.5')).toEqual<AstNode>({ kind: 'number', value: 0.5 });
  });

  it('parses a single and a dotted reference', () => {
    expect(parseFormula('scores')).toEqual<AstNode>({ kind: 'ref', path: ['scores'] });
    expect(parseFormula('jury.weighted_mean')).toEqual<AstNode>({
      kind: 'ref',
      path: ['jury', 'weighted_mean'],
    });
    expect(parseFormula('vote.ux')).toEqual<AstNode>({ kind: 'ref', path: ['vote', 'ux'] });
  });

  it('respects operator precedence and left-associativity', () => {
    // 1 + 2 * 3  ->  1 + (2 * 3)
    expect(parseFormula('1 + 2 * 3')).toEqual<AstNode>({
      kind: 'binary',
      op: '+',
      left: { kind: 'number', value: 1 },
      right: {
        kind: 'binary',
        op: '*',
        left: { kind: 'number', value: 2 },
        right: { kind: 'number', value: 3 },
      },
    });
  });

  it('honours parentheses over precedence', () => {
    // (1 + 2) * 3
    const ast = parseFormula('(1 + 2) * 3');
    expect(ast).toEqual<AstNode>({
      kind: 'binary',
      op: '*',
      left: {
        kind: 'binary',
        op: '+',
        left: { kind: 'number', value: 1 },
        right: { kind: 'number', value: 2 },
      },
      right: { kind: 'number', value: 3 },
    });
  });

  it('parses unary minus', () => {
    expect(parseFormula('-mean(scores)')).toEqual<AstNode>({
      kind: 'unary',
      op: '-',
      operand: { kind: 'call', name: 'mean', args: [{ value: { kind: 'ref', path: ['scores'] } }] },
    });
  });

  it('parses a function call with positional and named arguments', () => {
    expect(parseFormula('trimmed_mean(votes, k=1)')).toEqual<AstNode>({
      kind: 'call',
      name: 'trimmed_mean',
      args: [
        { value: { kind: 'ref', path: ['votes'] } },
        { name: 'k', value: { kind: 'number', value: 1 } },
      ],
    });
  });

  it('parses the hybrid public+jury shape', () => {
    const ast = parseFormula('0.7 * jury.weighted_mean + 0.3 * public.normalized_count');
    expect(ast.kind).toBe('binary');
    // serialisable: round-trips through JSON unchanged
    expect(JSON.parse(JSON.stringify(ast))).toEqual(ast);
  });

  it('produces a JSON-serialisable AST (audit trail)', () => {
    const ast = parseFormula('weighted_mean(scores) * 10');
    expect(JSON.parse(JSON.stringify(ast))).toEqual(ast);
  });

  it.each([
    ['', 'empty formula'],
    ['1 +', 'unexpected end'],
    ['mean(', 'unexpected end'],
    ['(1 + 2', 'expected rparen'],
    ['1 2', "unexpected '2'"],
    ['mean scores)', "unexpected 'scores'"],
    ['1 @ 2', "unexpected character '@'"],
    ['jury.', 'expected identifier'],
  ])('rejects malformed input %j', (input) => {
    expect(() => parseFormula(input)).toThrow(FormulaParseError);
  });
});
