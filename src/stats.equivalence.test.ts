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
 * -0 and the exact rounding of the Kahan-Babuska sum.
 */

const finite = fc.double({ min: -1e6, max: 1e6, noNaN: true, noDefaultInfinity: true });
const nonEmpty = fc.array(finite, { minLength: 1, maxLength: 200 });
const maybeEmpty = fc.array(finite, { minLength: 0, maxLength: 200 });
const prob = fc.double({ min: 0, max: 1, noNaN: true });

describe('vendored stats are byte-identical to simple-statistics@7.9.0', () => {
  it('sum (Kahan-Babuska) matches exactly, including the empty list', () => {
    fc.assert(
      fc.property(maybeEmpty, (xs) => {
        expect(sum(xs)).toBe(ssSum(xs));
      }),
    );
  });

  it('mean matches exactly', () => {
    fc.assert(
      fc.property(nonEmpty, (xs) => {
        expect(mean(xs)).toBe(ssMean(xs));
      }),
    );
  });

  it('quantile matches exactly at arbitrary p (sort-based vs quickselect)', () => {
    fc.assert(
      fc.property(nonEmpty, prob, (xs, p) => {
        expect(quantile(xs, p)).toBe(ssQuantile(xs, p));
      }),
    );
  });

  it('quantile matches at the boundary and decile probabilities', () => {
    fc.assert(
      fc.property(nonEmpty, (xs) => {
        for (let i = 0; i <= 10; i += 1) {
          const p = i / 10;
          expect(quantile(xs, p)).toBe(ssQuantile(xs, p));
        }
      }),
    );
  });

  it('median matches exactly (even and odd lengths)', () => {
    fc.assert(
      fc.property(nonEmpty, (xs) => {
        expect(median(xs)).toBe(ssMedian(xs));
      }),
    );
  });

  it('variance matches exactly', () => {
    fc.assert(
      fc.property(nonEmpty, (xs) => {
        expect(variance(xs)).toBe(ssVariance(xs));
      }),
    );
  });

  it('standardDeviation matches exactly (including the single-element guard)', () => {
    fc.assert(
      fc.property(nonEmpty, (xs) => {
        expect(standardDeviation(xs)).toBe(ssStdDev(xs));
      }),
    );
  });

  it('does not mutate its input (quantile sorts a copy)', () => {
    const xs = [5, 1, 4, 2, 3];
    const snapshot = [...xs];
    quantile(xs, 0.5);
    median(xs);
    expect(xs).toEqual(snapshot);
  });
});
