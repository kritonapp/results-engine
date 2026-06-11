/**
 * The pure results engine's public contract: NEUTRAL and PII-free (M5 Flag 10).
 *
 * These are domain-neutral value types — criteria, weights, scores, config, ranked
 * results — deliberately NOT the kriton DB row shapes. No `org_id`, `result_version_id`,
 * `juror_user_id`, or Drizzle types cross this boundary; identifiers are opaque,
 * PII-free strings. The materialisation layer (src/domain/results/) adapts kriton rows
 * to and from this contract, so a future open-source extraction of the engine is a lift,
 * not a rewrite. Build NO packaging toward that now.
 *
 * The engine is pure and deterministic (CLAUDE.md invariant 4): inputs in, results out,
 * no DB / clock / RNG / IO. Enforced by the ESLint boundary on this directory and the
 * §D4 structural test.
 */

/**
 * The engine's own library version — the reproducibility anchor a `result_version`
 * records as `function_lib_version`. Bump on any change to engine maths/semantics so a
 * stored result always names the exact engine that produced it. This is the single
 * source of truth for the version; nothing else defines it.
 */
export const FUNCTION_LIB_VERSION = '1.0.0';

/** The v1 built-in aggregator set ([07](../../../../docs/07-results-engine.md)). */
export type AggregatorKind =
  | 'simple_mean'
  | 'weighted_mean'
  | 'median'
  | 'trimmed_mean'
  | 'zscore_mean'
  | 'bradley_terry'
  | 'approval';

/** One value-copied score cell: one voter's raw score on one criterion of one entry. */
export interface ScoreInput {
  /** Opaque, stable entry identifier. */
  readonly entryId: string;
  /** Opaque, stable criterion key (frozen at snapshot time). */
  readonly criterionKey: string;
  /** Opaque, PII-free voter handle (never dereferenced to a user — M5 Flag 1). */
  readonly voterId: string;
  /** The raw score value as copied into the snapshot. */
  readonly rawValue: number;
  /** The criterion weight (value-copied). */
  readonly weight: number;
  /** True if excluded from tallies (manual exclusion or admin-vote, A.3.8 — M5 Flag 7). */
  readonly excluded: boolean;
}

/** One pairwise comparison, value-copied for Bradley-Terry. `null` winner = tie/skip. */
export interface PairwiseInput {
  readonly voterId: string;
  readonly entryAId: string;
  readonly entryBId: string;
  readonly winnerEntryId: string | null;
  readonly excluded: boolean;
}

/** One top-N pick, value-copied for approval / pick-count. */
export interface PickInput {
  readonly voterId: string;
  readonly entryId: string;
  readonly excluded: boolean;
}

/** One link in the tiebreak chain ([07](../../../../docs/07-results-engine.md)). */
export type TiebreakKind = 'mean' | 'median' | 'stddev' | 'manual';
export interface TiebreakRule {
  readonly kind: TiebreakKind;
}

export interface EngineConfig {
  readonly aggregator: AggregatorKind;
  /** Per-end count to drop for trimmed mean (k from each tail). */
  readonly trimmedK?: number;
  /** Z-score normalise each voter's scores to their own distribution before aggregating. */
  readonly normalisation: boolean;
  /** Ordered tiebreak chain; the last link may be `manual` (resolved by a Chair). */
  readonly tiebreakChain: readonly TiebreakRule[];
  /** Custom formula text (typed-AST engine); when present it overrides `aggregator`. */
  readonly formula?: { readonly expression: string };
  /** Maximum value of a single score (default 10), used by the weighted formula. */
  readonly scaleMax?: number;
  /**
   * Chair manual tiebreak ordering (D3): `entryId → ordinal` (lower wins). Resolves
   * the `manual` link of the tiebreak chain for entries the auto rules left tied.
   */
  readonly manualTiebreakOrder?: Readonly<Record<string, number>>;
}

export interface EngineInput {
  /** Score-based inputs (rubric / qualifying modes). */
  readonly scores: readonly ScoreInput[];
  /** Pairwise comparisons (pairwise mode); frozen from `config_snapshot`. */
  readonly pairwise?: readonly PairwiseInput[];
  /** Top-N picks (unranked multi-select); frozen from `config_snapshot`. */
  readonly picks?: readonly PickInput[];
  readonly config: EngineConfig;
}

/** Per-Entry diagnostics ([07](../../../../docs/07-results-engine.md) A.4.3). */
export interface EntryDiagnostics {
  readonly mean: number;
  readonly min: number;
  readonly max: number;
  readonly range: number;
  readonly stddev: number;
  readonly median: number;
  readonly count: number;
}

export interface EntryResult {
  readonly entryId: string;
  readonly computedScore: number;
  /** 1-based rank within the result set (stable, ties share-then-skip per config). */
  readonly rank: number;
  /** Per-criterion mean across voters, where the mode produces one. */
  readonly byCriterion?: Readonly<Record<string, number>>;
  readonly diagnostics?: EntryDiagnostics;
  /** Tiebreak links actually applied to resolve this entry's rank, if any. */
  readonly tiebreakApplied?: readonly TiebreakRule[] | null;
}

export interface EngineOutput {
  /** The engine version that produced this output (= {@link FUNCTION_LIB_VERSION}). */
  readonly functionLibVersion: string;
  /** Ranked results in stable order. */
  readonly results: readonly EntryResult[];
}
