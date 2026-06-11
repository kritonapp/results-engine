import {
  mean as ssMean,
  median as ssMedian,
  quantile as ssQuantile,
  standardDeviation as ssStdDev,
  variance as ssVariance,
  sum as ssSum,
} from 'simple-statistics';
import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import { mean, median, quantile, standardDeviation, sum, variance } from './stats.js';

/**
 * The vendoring guarantee. `src/stats.ts` is ported verbatim from simple-statistics so
 * the engine has zero runtime dependencies; this test is the proof that the port changed
 * NO maths. Every vendored function must return BYTE-IDENTICAL output to
 * simple-statistics@7.9.0 (a dev-only dependency, present solely for this oracle) across
 * a fuzz range. If this ever fails, extracting/vendoring would change a published result,
 * which the M5.5 gate forbids.
 *
 * Equality is `Object.is` (toBe), not `toBeCloseTo`: identical IEEE-754 bits, including
 * the exact rounding of the Kahan-Babuska sum.
 *
 * The ONE thing we normalise is signed zero: `-0` and `+0` are numerically equal
 * (`-0 === +0`) and serialise identically (`JSON.stringify(-0) === "0"`), so they are
 * immaterial to any computed result, but their sign bits differ and `Object.is` (which
 * `toBe` uses) tells them apart. The sort-based and quickselect quantile can land on
 * different sides of a zero at p=0/1; `+ 0` collapses `-0` to `+0` before comparison.
 */

const finite = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true });
const nonEmpty = fc.array(finite, { minLength: 1, maxLength: 200 });
const maybeEmpty = fc.array(finite, { minLength: 0, maxLength: 200 });
const prob = fc.double({ min: 0, max: 1, noNaN: true });

/** Assert numeric byte-equality, treating -0 and +0 as equal (they are, for results). */
const same = (got: number, want: number) => expect(got + 0).toBe(want + 0);

describe('vendored stats are byte-identical to simple-statistics@7.9.0', () => {
  it('sum (Kahan-Babuska) matches exactly, including the empty list', () => {
    fc.assert(
      fc.property(maybeEmpty, (xs) => {
        same(sum(xs), ssSum(xs));
      }),
    );
  });

  it('mean matches exactly', () => {
    fc.assert(
      fc.property(nonEmpty, (xs) => {
        same(mean(xs), ssMean(xs));
      }),
    );
  });

  it('quantile matches exactly at arbitrary p (sort-based vs quickselect)', () => {
    fc.assert(
      fc.property(nonEmpty, prob, (xs, p) => {
        same(quantile(xs, p), ssQuantile(xs, p));
      }),
    );
  });

  it('quantile matches at the boundary and decile probabilities', () => {
    fc.assert(
      fc.property(nonEmpty, (xs) => {
        for (let i = 0; i <= 10; i += 1) {
          const p = i / 10;
          same(quantile(xs, p), ssQuantile(xs, p));
        }
      }),
    );
  });

  it('median matches exactly (even and odd lengths)', () => {
    fc.assert(
      fc.property(nonEmpty, (xs) => {
        same(median(xs), ssMedian(xs));
      }),
    );
  });

  it('variance matches exactly', () => {
    fc.assert(
      fc.property(nonEmpty, (xs) => {
        same(variance(xs), ssVariance(xs));
      }),
    );
  });

  it('standardDeviation matches exactly (including the single-element guard)', () => {
    fc.assert(
      fc.property(nonEmpty, (xs) => {
        same(standardDeviation(xs), ssStdDev(xs));
      }),
    );
  });

  it('agrees with upstream on signed-zero inputs (numerically, both yield zero)', () => {
    // The sort-based and quickselect quantile can return -0 vs +0 at the extremes; both
    // are numerically zero. This pins the case the property test only hits occasionally.
    // `same` collapses the sign of zero, and `+ 0` confirms each result is numerically 0.
    for (const p of [0, 0.5, 1]) {
      same(quantile([-0, 0], p), ssQuantile([-0, 0], p));
      expect(quantile([-0, 0], p) + 0).toBe(0);
    }
    same(mean([-0, -0]), ssMean([-0, -0]));
    same(median([-0, 0, -0]), ssMedian([-0, 0, -0]));
  });

  it('does not mutate its input (quantile sorts a copy)', () => {
    const xs = [5, 1, 4, 2, 3];
    const snapshot = [...xs];
    quantile(xs, 0.5);
    median(xs);
    expect(xs).toEqual(snapshot);
  });
});
