import type { EngineInput, EntryResult } from './contract.js';
import { FUNCTION_LIB_VERSION } from './contract.js';
import { computeResults } from './compute.js';

/**
 * The verify tool: the audit centrepiece.
 *
 * A Kriton result is reproducible because each immutable version freezes its value-copied
 * inputs, its config, and the engine version ({@link FUNCTION_LIB_VERSION}) that produced
 * it. An exported {@link VerifiableSnapshot} carries exactly that, plus the result Kriton
 * claims it computed. {@link verifySnapshot} independently recomputes with this public
 * engine and asserts a bit-for-bit match — so anyone can confirm a published winner was
 * derived honestly from the recorded scores, with no trust in the Kriton app required.
 *
 * The snapshot is deliberately neutral and PII-free: ids are opaque strings, exactly as
 * the engine contract requires. This is the same shape the app's `reproduceFromSnapshot`
 * feeds the engine, serialised for export.
 */

export const SNAPSHOT_SCHEMA_VERSION = 1 as const;

/** One category's frozen inputs, config, and the result Kriton claims it computed. */
export interface VerifiableCategory {
  /** Opaque category identifier (for reporting only; the engine never sees it). */
  readonly categoryId: string;
  /** The value-copied inputs + frozen config the engine ran on. */
  readonly input: EngineInput;
  /** The ranked results Kriton recorded for this category. */
  readonly claimedResults: readonly EntryResult[];
}

/** A self-contained, independently-verifiable export of a Kriton result version. */
export interface VerifiableSnapshot {
  readonly schemaVersion: typeof SNAPSHOT_SCHEMA_VERSION;
  /** The engine version Kriton recorded as `function_lib_version` for this result. */
  readonly functionLibVersion: string;
  readonly categories: readonly VerifiableCategory[];
  /** Optional provenance metadata; ignored by verification, echoed in the report. */
  readonly meta?: Readonly<Record<string, string | number>>;
}

export interface CategoryVerification {
  readonly categoryId: string;
  readonly ok: boolean;
  /** Human-readable mismatch descriptions (empty when ok). */
  readonly mismatches: readonly string[];
}

export interface VerificationReport {
  readonly ok: boolean;
  /**
   * Whether the snapshot's recorded engine version matches the engine doing the
   * verification. A mismatch is a WARNING, not a failure: an old result is meant to be
   * verified with the matching old engine version, not necessarily this one.
   */
  readonly functionLibVersion: {
    readonly recorded: string;
    readonly verifier: string;
    readonly matches: boolean;
  };
  readonly categories: readonly CategoryVerification[];
}

/** Stable canonical form of a result row for comparison (key order fixed). */
function canonical(r: EntryResult): string {
  return JSON.stringify({
    entryId: r.entryId,
    rank: r.rank,
    computedScore: r.computedScore,
    byCriterion: r.byCriterion ?? null,
    diagnostics: r.diagnostics ?? null,
    tiebreakApplied: r.tiebreakApplied ?? null,
  });
}

function verifyCategory(category: VerifiableCategory): CategoryVerification {
  const recomputed = computeResults(category.input).results;
  const claimed = category.claimedResults;
  const mismatches: string[] = [];

  if (recomputed.length !== claimed.length) {
    mismatches.push(
      `entry count differs: recomputed ${recomputed.length}, claimed ${claimed.length}`,
    );
  }

  const claimedById = new Map(claimed.map((r) => [r.entryId, r]));
  for (const got of recomputed) {
    const want = claimedById.get(got.entryId);
    if (!want) {
      mismatches.push(`recomputed entry '${got.entryId}' is absent from the claimed results`);
      continue;
    }
    if (canonical(got) !== canonical(want)) {
      mismatches.push(
        `entry '${got.entryId}' differs: recomputed ${canonical(got)} vs claimed ${canonical(want)}`,
      );
    }
  }
  for (const want of claimed) {
    if (!recomputed.some((r) => r.entryId === want.entryId)) {
      mismatches.push(`claimed entry '${want.entryId}' was not produced on recompute`);
    }
  }

  return { categoryId: category.categoryId, ok: mismatches.length === 0, mismatches };
}

/**
 * Recompute a snapshot with this engine and report whether every category matches what
 * Kriton claimed. `ok` is true only if all categories reproduce exactly. The engine-version
 * check is reported separately (a mismatch is a warning, since old results verify against
 * the engine version that produced them).
 */
export function verifySnapshot(snapshot: VerifiableSnapshot): VerificationReport {
  const categories = snapshot.categories.map(verifyCategory);
  return {
    ok: categories.every((c) => c.ok),
    functionLibVersion: {
      recorded: snapshot.functionLibVersion,
      verifier: FUNCTION_LIB_VERSION,
      matches: snapshot.functionLibVersion === FUNCTION_LIB_VERSION,
    },
    categories,
  };
}

/** Narrow unknown parsed JSON to a VerifiableSnapshot, throwing a clear error otherwise. */
export function parseSnapshot(data: unknown): VerifiableSnapshot {
  if (typeof data !== 'object' || data === null) {
    throw new Error('snapshot must be a JSON object');
  }
  const s = data as Record<string, unknown>;
  if (s.schemaVersion !== SNAPSHOT_SCHEMA_VERSION) {
    throw new Error(
      `unsupported snapshot schemaVersion: expected ${SNAPSHOT_SCHEMA_VERSION}, got ${String(s.schemaVersion)}`,
    );
  }
  if (typeof s.functionLibVersion !== 'string') {
    throw new Error('snapshot.functionLibVersion must be a string');
  }
  if (!Array.isArray(s.categories)) {
    throw new Error('snapshot.categories must be an array');
  }
  return data as VerifiableSnapshot;
}
