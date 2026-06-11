/**
 * `@kriton/results-engine` — the public, auditable surface.
 *
 * Pure, deterministic, dependency-free scoring and ranking maths: the same engine the
 * Kriton app consumes in production. Inputs in, ranked results out — no DB, clock, RNG,
 * IO, or code execution. Given the same value-copied inputs, frozen config, and
 * {@link FUNCTION_LIB_VERSION}, anyone can recompute a Kriton result and verify it
 * bit-for-bit. See the README for the methodology and the verify walkthrough.
 */

/* The single entry point and its neutral, PII-free contract. */
export { computeResults } from './compute.js';
export {
  FUNCTION_LIB_VERSION,
  type AggregatorKind,
  type ScoreInput,
  type PairwiseInput,
  type PickInput,
  type TiebreakKind,
  type TiebreakRule,
  type EngineConfig,
  type EngineInput,
  type EntryDiagnostics,
  type EntryResult,
  type EngineOutput,
} from './contract.js';

/* The formula language: serialisable typed AST, fixed registry, no code execution. */
export {
  parseFormula,
  FormulaParseError,
  type AstNode,
  type NumberLiteral,
  type Reference,
  type UnaryExpr,
  type BinaryExpr,
  type CallArg,
  type CallExpr,
} from './ast.js';
export {
  validateAst,
  validateFormula,
  evaluateAst,
  evaluateFormula,
  FUNCTION_REGISTRY,
  FormulaEvalError,
  type EngineValue,
} from './registry.js';

/* Aggregator + Bradley-Terry primitives, exposed for independent verification. */
export {
  arithmeticMean,
  medianOf,
  stddev,
  quantileOf,
  minOf,
  maxOf,
  rangeOf,
  trimmedMean,
  weightedMean,
  zscoreNormalise,
} from './aggregators.js';
export {
  bradleyTerry,
  approvalCounts,
  BT_TOLERANCE,
  BT_MAX_ITERATIONS,
  type Comparison,
  type StrengthResult,
} from './bradley-terry.js';
export { resolveTiebreaks } from './tiebreak.js';

/* The verify tool: recompute an exported Kriton snapshot and confirm it matches. */
export {
  verifySnapshot,
  parseSnapshot,
  SNAPSHOT_SCHEMA_VERSION,
  type VerifiableSnapshot,
  type VerifiableCategory,
  type VerificationReport,
  type CategoryVerification,
} from './verify.js';

/* The synthetic example corpus (goldens + demo data). */
export { EXAMPLES, exampleByKey, type Example } from './examples.js';
