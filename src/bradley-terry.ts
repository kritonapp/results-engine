/**
 * Own Bradley-Terry strength estimator + approval/pick-count (Decision 5b / M5 §C4).
 * Pure and DETERMINISTIC: fixed initialisation, fixed tolerance, fixed max-iteration
 * cap, and iteration over a CANONICALLY-SORTED entry/comparison list (never input
 * order — the refinement), so reordered inputs produce byte-identical output. No DB,
 * clock, or RNG.
 */

export interface Comparison {
  readonly entryAId: string;
  readonly entryBId: string;
  /** The winning entry id, or null for a tie/skip (scored as half a win each). */
  readonly winnerEntryId: string | null;
}

export interface StrengthResult {
  readonly entryId: string;
  /** Bradley-Terry strength, normalised so the strengths sum to 1. */
  readonly strength: number;
}

/** Fixed convergence parameters — part of the determinism contract. */
export const BT_TOLERANCE = 1e-9;
export const BT_MAX_ITERATIONS = 1000;

/**
 * Estimate Bradley-Terry strengths via the standard MM (minorisation-maximisation)
 * iteration `p_i ← W_i / Σ_j n_ij / (p_i + p_j)`, normalised to sum 1 each step.
 * Ties count as half a win to each side. Entries are taken from the comparisons,
 * canonically sorted by id; the comparison list is sorted before accumulation so
 * the result is independent of input order. Converges when the maximum per-entry
 * change drops below {@link BT_TOLERANCE} or after {@link BT_MAX_ITERATIONS}.
 */
export function bradleyTerry(comparisons: readonly Comparison[]): StrengthResult[] {
  // Canonical, order-independent view of the inputs.
  const sortedComparisons = [...comparisons].sort(
    (a, b) =>
      a.entryAId.localeCompare(b.entryAId) ||
      a.entryBId.localeCompare(b.entryBId) ||
      (a.winnerEntryId ?? '').localeCompare(b.winnerEntryId ?? ''),
  );

  const entryIds = [...new Set(sortedComparisons.flatMap((c) => [c.entryAId, c.entryBId]))].sort(
    (a, b) => a.localeCompare(b),
  );

  if (entryIds.length === 0) return [];
  if (entryIds.length === 1) return [{ entryId: entryIds[0], strength: 1 }];

  const index = new Map(entryIds.map((id, i) => [id, i]));
  const n = entryIds.length;

  // Wins (ties = 0.5 each) and pairwise comparison counts.
  const wins = new Array<number>(n).fill(0);
  const pairCount = Array.from({ length: n }, () => new Array<number>(n).fill(0));
  for (const c of sortedComparisons) {
    const a = index.get(c.entryAId)!;
    const b = index.get(c.entryBId)!;
    if (a === b) continue; // a degenerate self-comparison contributes nothing
    pairCount[a][b] += 1;
    pairCount[b][a] += 1;
    if (c.winnerEntryId === c.entryAId) wins[a] += 1;
    else if (c.winnerEntryId === c.entryBId) wins[b] += 1;
    else {
      wins[a] += 0.5;
      wins[b] += 0.5;
    }
  }

  // Fixed initialisation: uniform strengths summing to 1.
  let p = new Array<number>(n).fill(1 / n);

  for (let iter = 0; iter < BT_MAX_ITERATIONS; iter += 1) {
    const next = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i += 1) {
      let denom = 0;
      for (let j = 0; j < n; j += 1) {
        if (i === j || pairCount[i][j] === 0) continue;
        denom += pairCount[i][j] / (p[i] + p[j]);
      }
      next[i] = denom > 0 ? wins[i] / denom : p[i];
    }
    // Normalise to sum 1 for scale stability.
    const sum = next.reduce((acc, v) => acc + v, 0);
    const normalised = sum > 0 ? next.map((v) => v / sum) : p;

    let maxDelta = 0;
    for (let i = 0; i < n; i += 1) {
      maxDelta = Math.max(maxDelta, Math.abs(normalised[i] - p[i]));
    }
    p = normalised;
    if (maxDelta < BT_TOLERANCE) break;
  }

  return entryIds.map((entryId, i) => ({ entryId, strength: p[i] }));
}

/**
 * Approval / pick-count for unranked top-N (and qualifying yes/no via 1-picks): the
 * number of times each entry was picked. Entries are returned canonically sorted by
 * id; the caller ranks by count. Order-independent.
 */
export function approvalCounts(
  picks: readonly { entryId: string }[],
): { entryId: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const { entryId } of picks) {
    counts.set(entryId, (counts.get(entryId) ?? 0) + 1);
  }
  return [...counts.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([entryId, count]) => ({ entryId, count }));
}
