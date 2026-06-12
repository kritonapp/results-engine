import { describe, expect, it } from 'vitest';
import {
  type EngineValue,
  evaluateAst,
  evaluateFormula,
  FormulaEvalError,
  validateFormula,
} from './registry.js';
import { parseFormula } from './ast.js';

const bind = (b: Record<string, EngineValue>) => b;

describe('evaluateFormula', () => {
  it('evaluates arithmetic with precedence', () => {
    expect(evaluateFormula('1 + 2 * 3', {})).toBe(7);
    expect(evaluateFormula('(1 + 2) * 3', {})).toBe(9);
    expect(evaluateFormula('-2 + 5', {})).toBe(3);
  });

  it('resolves scalar and series references', () => {
    expect(evaluateFormula('mean(scores)', bind({ scores: [5, 10] }))).toBe(7.5);
    expect(evaluateFormula('jury.weighted_mean * 2', bind({ 'jury.weighted_mean': 4 }))).toBe(8);
  });

  it('evaluates the hybrid public+jury weighting shape', () => {
    const result = evaluateFormula(
      '0.7 * jury.weighted_mean + 0.3 * public.normalized_count',
      bind({ 'jury.weighted_mean': 10, 'public.normalized_count': 5 }),
    );
    expect(result).toBeCloseTo(0.7 * 10 + 0.3 * 5, 10);
  });

  it('supports trimmed_mean with a named k argument', () => {
    expect(evaluateFormula('trimmed_mean(scores, k=1)', bind({ scores: [1, 2, 3, 4, 100] }))).toBe(
      3,
    );
  });

  it('supports weighted_mean(values, weights)', () => {
    expect(evaluateFormula('weighted_mean(v, w)', bind({ v: [10, 2], w: [3, 1] }))).toBe(8);
  });

  it('rejects unknown functions at validation time', () => {
    expect(() => validateFormula('frobnicate(scores)')).toThrow(FormulaEvalError);
    expect(() => validateFormula('frobnicate(scores)')).toThrow(/unknown function/);
  });

  it('rejects wrong arity and bad named args', () => {
    expect(() => validateFormula('mean(a, b)')).toThrow(/0\.\.|takes/);
    expect(() => validateFormula('mean()')).toThrow(FormulaEvalError);
    expect(() => validateFormula('trimmed_mean(scores, q=1)')).toThrow(/named argument/);
  });

  it('errors on unbound references and division by zero', () => {
    expect(() => evaluateFormula('mean(missing)', {})).toThrow(/unbound reference/);
    expect(() => evaluateFormula('1 / 0', {})).toThrow(/division by zero/);
  });

  it('errors when a series is used where a scalar is required', () => {
    expect(() => evaluateFormula('scores + 1', bind({ scores: [1, 2] }))).toThrow(FormulaEvalError);
  });

  it('evaluates a pre-parsed AST identically (serialisable path)', () => {
    const ast = JSON.parse(JSON.stringify(parseFormula('mean(scores) * 10')));
    expect(evaluateAst(ast, bind({ scores: [8] }))).toBe(80);
  });
});
