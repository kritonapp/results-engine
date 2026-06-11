/**
 * Vendored statistical primitives.
 *
 * These four functions (`mean`, `median`, `quantile`, `standardDeviation`) are ported
 * verbatim from simple-statistics v7.9.0 (ISC licence, see NOTICE), so the engine has
 * ZERO runtime dependencies and the entire audit surface lives in this repository. The
 * maths is byte-identical to simple-statistics: `stats.equivalence.test.ts` proves it
 * across a fuzz range, which is the guarantee that extracting the engine changes no
 * published result.
 *
 * One deliberate simplification: simple-statistics' `quantile` uses quickselect to find
 * the needed order statistics in place. We instead sort a copy and read the same order
 * statistics. The numeric result is identical (quickselect only arranges those exact
 * positions; a full sort puts the same values there), it is far easier to audit, and the
 * equivalence test pins it. Nothing else is changed.
 *
 * Source: https://github.com/simple-statistics/simple-statistics (v7.9.0)
 */

/**
 * Kahan-Babuska compensated summation: corrects floating-point roundoff so the sum of a
 * list is accurate regardless of order. Byte-identical to simple-statistics' `sum`. An
 * empty list sums to 0.
 */
export function sum(x: readonly number[]): number {
  if (x.length === 0) {
    return 0;
  }

  let total = x[0];
  let correction = 0;
  let transition: number;

  for (let i = 1; i < x.length; i += 1) {
    transition = total + x[i];
    if (Math.abs(total) >= Math.abs(x[i])) {
      correction += total - transition + x[i];
    } else {
      correction += x[i] - transition + total;
    }
    total = transition;
  }

  return total + correction;
}

/** The arithmetic mean (sum over count). Throws on an empty list (matches the source). */
export function mean(x: readonly number[]): number {
  if (x.length === 0) {
    throw new Error('mean requires at least one data point');
  }
  return sum(x) / x.length;
}

/**
 * The p-quantile (0..1) of an ALREADY-SORTED ascending list, by linear interpolation
 * (R/numpy type 7 — the default). Byte-identical to simple-statistics' `quantileSorted`.
 */
export function quantileSorted(x: readonly number[], p: number): number {
  const idx = (x.length - 1) * p;
  if (x.length === 0) {
    throw new Error('quantile requires at least one data point.');
  } else if (p < 0 || p > 1) {
    throw new Error('quantiles must be between 0 and 1');
  } else if (p === 1) {
    return x[x.length - 1];
  } else if (p === 0) {
    return x[0];
  } else if (idx % 1 !== 0) {
    const lower = Math.floor(idx);
    const upper = Math.ceil(idx);
    const fraction = idx - lower;
    return x[lower] + fraction * (x[upper] - x[lower]);
  } else {
    return x[idx];
  }
}

/**
 * The p-quantile (0..1) of an unsorted list. Sorts a copy ascending, then reads the order
 * statistics via {@link quantileSorted}. Numerically identical to simple-statistics'
 * quickselect-based `quantile` (proven by the equivalence test); the input is not mutated.
 */
export function quantile(x: readonly number[], p: number): number {
  const copy = [...x].sort((a, b) => a - b);
  return quantileSorted(copy, p);
}

/** The median: the 0.5-quantile. Byte-identical to simple-statistics' `median`. */
export function median(x: readonly number[]): number {
  return +quantile(x, 0.5);
}

/**
 * The sum of squared deviations from the mean. Byte-identical to simple-statistics'
 * `sumNthPowerDeviations(x, 2)` (the squared-deviation fast path).
 */
function sumSquaredDeviations(x: readonly number[]): number {
  const meanValue = mean(x);
  let total = 0;
  for (let i = 0; i < x.length; i += 1) {
    const tempValue = x[i] - meanValue;
    total += tempValue * tempValue;
  }
  return total;
}

/**
 * The POPULATION variance (divides by n). Throws on an empty list (matches the source).
 */
export function variance(x: readonly number[]): number {
  if (x.length === 0) {
    throw new Error('variance requires at least one data point');
  }
  return sumSquaredDeviations(x) / x.length;
}

/**
 * The POPULATION standard deviation (square root of the population variance). A
 * single-element list has zero deviation. Byte-identical to simple-statistics'
 * `standardDeviation`.
 */
export function standardDeviation(x: readonly number[]): number {
  if (x.length === 1) {
    return 0;
  }
  return Math.sqrt(variance(x));
}
