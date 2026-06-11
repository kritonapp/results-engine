import { mean as ssMean, median as ssMedian, quantile as ssQuantile, standardDeviation } from './stats.js';

/**
 * Pure aggregator primitives (Decision 5b / M5 §C3), backed by the vendored stats
 * primitives (`./stats`, ported verbatim from simple-statistics) for
 * mean/median/stddev/quantile with Z-score normalisation on top. No DB, clock,
 * RNG, or IO. Every function is total: an empty input yields 0 (the legacy
 * convention — `parseScores` returns 0 for no scores), never NaN/undefined, so the
 * engine stays deterministic and court-defensible.
 *
 * `stddev` is the POPULATION standard deviation (divides by n), matching the legacy
 * `calcStdDev`; the vendored `standardDeviation` is likewise population.
 */

/** Sort a copy ascending by numeric value (never mutates the input). */
function sortedAsc(values: readonly number[]): number[] {
  return [...values].sort((a, b) => a - b);
}

export function arithmeticMean(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return ssMean(values as number[]);
}

export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return ssMedian(values as number[]);
}

export function stddev(values: readonly number[]): number {
  if (values.length === 0) return 0;
  if (values.length === 1) return 0;
  return standardDeviation(values as number[]);
}

/** The p-quantile (0..1), e.g. min = quantileOf(xs, 0). */
export function quantileOf(values: readonly number[], p: number): number {
  if (values.length === 0) return 0;
  return ssQuantile(values as number[], p);
}

export function minOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return sortedAsc(values)[0];
}

export function maxOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  return sortedAsc(values)[values.length - 1];
}

export function rangeOf(values: readonly number[]): number {
  if (values.length === 0) return 0;
  const s = sortedAsc(values);
  return s[s.length - 1] - s[0];
}

/**
 * Trimmed mean: drop `k` values from each tail of the sorted input, then mean the
 * rest. `k` is clamped so at least one value always remains (an over-large `k`
 * degrades to a plain mean rather than an empty/undefined result).
 */
export function trimmedMean(values: readonly number[], k: number): number {
  if (values.length === 0) return 0;
  const n = values.length;
  const effectiveK = Math.max(0, Math.min(Math.floor(k), Math.floor((n - 1) / 2)));
  const trimmed = sortedAsc(values).slice(effectiveK, n - effectiveK);
  return arithmeticMean(trimmed);
}

/** Weighted mean of (value, weight) pairs: Σ(v·w) / Σ(w). Zero total weight → 0. */
export function weightedMean(pairs: readonly { value: number; weight: number }[]): number {
  let num = 0;
  let den = 0;
  for (const { value, weight } of pairs) {
    num += value * weight;
    den += weight;
  }
  return den === 0 ? 0 : num / den;
}

/**
 * Z-score normalise a series to its own distribution: (x - mean) / stddev. When the
 * series has zero variance (all values identical, stddev = 0) every value maps to 0
 * (the mean sits at 0 in z-space) rather than NaN/Infinity — the determinism guard
 * (M5 Flag 8). Preserves input order.
 */
export function zscoreNormalise(values: readonly number[]): number[] {
  if (values.length === 0) return [];
  // Guard on input homogeneity, not the computed stddev: for identical values,
  // floating-point summation can yield a tiny non-zero stddev, which would turn
  // exact ties into spurious ±1 z-scores. All-equal → all-zero, by definition.
  if (values.every((v) => v === values[0])) return values.map(() => 0);
  const m = arithmeticMean(values);
  const s = stddev(values);
  if (s === 0) return values.map(() => 0);
  return values.map((x) => (x - m) / s);
}
