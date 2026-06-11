import { type AstNode, parseFormula } from './ast.js';
import {
  arithmeticMean,
  maxOf,
  medianOf,
  minOf,
  rangeOf,
  stddev,
  trimmedMean,
  weightedMean,
  zscoreNormalise,
} from './aggregators.js';

/**
 * Fixed function registry + AST evaluator (Decision 5a / M5 §C2). The evaluator
 * WALKS the typed AST and dispatches function calls to a WHITELIST of named
 * functions — there is no `eval`, no `Function`, no dynamic dispatch by string into
 * arbitrary code. An unknown function name is a validation/eval error, never an
 * attempt to run it. Pure: the only effects are arithmetic over bound inputs.
 *
 * Evaluation values are a scalar (`number`) or a series (`number[]`). Arithmetic
 * operates on scalars; aggregator functions reduce a series to a scalar.
 */

export type EngineValue = number | number[];

export class FormulaEvalError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FormulaEvalError';
  }
}

interface FnSpec {
  /** Min/max positional arity. */
  readonly minArgs: number;
  readonly maxArgs: number;
  /** Allowed named arguments (e.g. `k` for trimmed_mean). */
  readonly namedArgs?: readonly string[];
  readonly apply: (args: EngineValue[], named: Record<string, number>) => number;
}

const asSeries = (v: EngineValue, fn: string): number[] => {
  if (!Array.isArray(v)) {
    throw new FormulaEvalError(`${fn}() expects a series argument, got a scalar`);
  }
  return v;
};

/**
 * The FIXED function library. Adding a function here is the only way to extend the
 * language; the evaluator can call nothing else.
 */
export const FUNCTION_REGISTRY: Readonly<Record<string, FnSpec>> = {
  mean: { minArgs: 1, maxArgs: 1, apply: (a) => arithmeticMean(asSeries(a[0], 'mean')) },
  median: { minArgs: 1, maxArgs: 1, apply: (a) => medianOf(asSeries(a[0], 'median')) },
  stddev: { minArgs: 1, maxArgs: 1, apply: (a) => stddev(asSeries(a[0], 'stddev')) },
  min: { minArgs: 1, maxArgs: 1, apply: (a) => minOf(asSeries(a[0], 'min')) },
  max: { minArgs: 1, maxArgs: 1, apply: (a) => maxOf(asSeries(a[0], 'max')) },
  range: { minArgs: 1, maxArgs: 1, apply: (a) => rangeOf(asSeries(a[0], 'range')) },
  trimmed_mean: {
    minArgs: 1,
    maxArgs: 2,
    namedArgs: ['k'],
    apply: (a, named) => {
      const series = asSeries(a[0], 'trimmed_mean');
      const k = named.k ?? (a.length > 1 && !Array.isArray(a[1]) ? a[1] : 1);
      return trimmedMean(series, k);
    },
  },
  zscore_normalized_mean: {
    minArgs: 1,
    maxArgs: 1,
    apply: (a) => arithmeticMean(zscoreNormalise(asSeries(a[0], 'zscore_normalized_mean'))),
  },
  weighted_mean: {
    minArgs: 2,
    maxArgs: 2,
    apply: (a) => {
      const values = asSeries(a[0], 'weighted_mean');
      const weights = asSeries(a[1], 'weighted_mean');
      if (values.length !== weights.length) {
        throw new FormulaEvalError('weighted_mean() values and weights must be the same length');
      }
      return weightedMean(values.map((value, i) => ({ value, weight: weights[i] })));
    },
  },
};

/* ── Validation (authoring-time type-check) ──────────────────────────────────── */

/**
 * Walk the AST and verify every function call names a registry function with valid
 * arity and named arguments. Throws {@link FormulaEvalError} on the first problem.
 * Used to validate a config-authored formula before it is ever evaluated (and to
 * render it read-only with confidence) — §I1.
 */
export function validateAst(node: AstNode): void {
  switch (node.kind) {
    case 'number':
    case 'ref':
      return;
    case 'unary':
      validateAst(node.operand);
      return;
    case 'binary':
      validateAst(node.left);
      validateAst(node.right);
      return;
    case 'call': {
      const spec = FUNCTION_REGISTRY[node.name];
      if (!spec) {
        throw new FormulaEvalError(`unknown function '${node.name}'`);
      }
      const positional = node.args.filter((a) => a.name === undefined);
      if (positional.length < spec.minArgs || positional.length > spec.maxArgs) {
        throw new FormulaEvalError(
          `${node.name}() takes ${spec.minArgs}..${spec.maxArgs} arguments, got ${positional.length}`,
        );
      }
      for (const arg of node.args) {
        if (arg.name !== undefined && !(spec.namedArgs ?? []).includes(arg.name)) {
          throw new FormulaEvalError(`${node.name}() has no named argument '${arg.name}'`);
        }
        validateAst(arg.value);
      }
      return;
    }
  }
}

/** Parse + validate a formula expression in one step. Throws on any problem. */
export function validateFormula(expression: string): AstNode {
  const ast = parseFormula(expression);
  validateAst(ast);
  return ast;
}

/* ── Evaluation ──────────────────────────────────────────────────────────────── */

const asScalar = (v: EngineValue, context: string): number => {
  if (Array.isArray(v)) {
    throw new FormulaEvalError(`${context} requires a scalar, got a series`);
  }
  return v;
};

/**
 * Evaluate an AST against a flat bindings map (dotted reference path → value). Pure;
 * no code execution. Aggregator calls dispatch through {@link FUNCTION_REGISTRY}.
 */
export function evaluateAst(
  node: AstNode,
  bindings: Readonly<Record<string, EngineValue>>,
): EngineValue {
  switch (node.kind) {
    case 'number':
      return node.value;
    case 'ref': {
      const key = node.path.join('.');
      if (!(key in bindings)) {
        throw new FormulaEvalError(`unbound reference '${key}'`);
      }
      return bindings[key];
    }
    case 'unary':
      return -asScalar(evaluateAst(node.operand, bindings), 'unary minus');
    case 'binary': {
      const left = asScalar(evaluateAst(node.left, bindings), `operator '${node.op}'`);
      const right = asScalar(evaluateAst(node.right, bindings), `operator '${node.op}'`);
      switch (node.op) {
        case '+':
          return left + right;
        case '-':
          return left - right;
        case '*':
          return left * right;
        case '/':
          if (right === 0) throw new FormulaEvalError('division by zero');
          return left / right;
      }
      return 0; // unreachable; keeps the switch total
    }
    case 'call': {
      const spec = FUNCTION_REGISTRY[node.name];
      if (!spec) throw new FormulaEvalError(`unknown function '${node.name}'`);
      const positional: EngineValue[] = [];
      const named: Record<string, number> = {};
      for (const arg of node.args) {
        const value = evaluateAst(arg.value, bindings);
        if (arg.name !== undefined) {
          named[arg.name] = asScalar(value, `named argument '${arg.name}'`);
        } else {
          positional.push(value);
        }
      }
      return spec.apply(positional, named);
    }
  }
}

/** Parse + validate + evaluate a formula expression against bindings. */
export function evaluateFormula(
  expression: string,
  bindings: Readonly<Record<string, EngineValue>>,
): number {
  const ast = validateFormula(expression);
  return asScalar(evaluateAst(ast, bindings), 'formula result');
}
