import fc from 'fast-check';
import { describe, expect, it } from 'vitest';
import {
  arithmeticMean,
  maxOf,
  medianOf,
  minOf,
  trimmedMean,
  weightedMean,
  zscoreNormalise,
} from './aggregators.js';
import { bradleyTerry, type Comparison } from './bradley-terry.js';
import { computeResults } from './compute.js';
import type { EngineInput, ScoreInput } from './contract.js';

/**
 * Property-based tests (Decision 5d / M5 §D3): aggregator bounds, determinism /
 * shuffle-invariance, the Z-score zero-variance guard, and Bradley-Terry
 * convergence. fast-check drives the randomness; the engine itself never does.
 */

const score = fc.double({ min: 0, max: 10, noNaN: true, noDefaultInfinity: true });
const nonEmptyScores = fc.array(score, { minLength: 1, maxLength: 40 });

describe('aggregator bounds', () => {
  it('mean / median / trimmed mean all lie within [min, max]', () => {
    fc.assert(
      fc.property(nonEmptyScores, (xs) => {
        const lo = minOf(xs);
        const hi = maxOf(xs);
        for (const v of [arithmeticMean(xs), medianOf(xs), trimmedMean(xs, 1)]) {
          expect(v).toBeGreaterThanOrEqual(lo - 1e-9);
          expect(v).toBeLessThanOrEqual(hi + 1e-9);
        }
      }),
    );
  });

  it('weighted mean is a convex combination → within [min, max] of the values', () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.record({
            value: score,
            weight: fc.double({ min: 0.01, max: 5, noNaN: true, noDefaultInfinity: true }),
          }),
          { minLength: 1, maxLength: 30 },
        ),
        (pairs) => {
          const values = pairs.map((p) => p.value);
          const wm = weightedMean(pairs);
          expect(wm).toBeGreaterThanOrEqual(minOf(values) - 1e-9);
          expect(wm).toBeLessThanOrEqual(maxOf(values) + 1e-9);
        },
      ),
    );
  });
});

describe('Z-score normalisation', () => {
  it('output is always finite (never NaN/Infinity) and order-preserving in length', () => {
    fc.assert(
      fc.property(fc.array(score, { maxLength: 40 }), (xs) => {
        const z = zscoreNormalise(xs);
        expect(z).toHaveLength(xs.length);
        expect(z.every((v) => Number.isFinite(v))).toBe(true);
      }),
    );
  });

  it('zero-variance series normalise to all zeros (Flag 8)', () => {
    fc.assert(
      fc.property(score, fc.integer({ min: 1, max: 20 }), (v, n) => {
        expect(zscoreNormalise(Array.from({ length: n }, () => v))).toEqual(
          Array.from({ length: n }, () => 0),
        );
      }),
    );
  });
});

describe('computeResults determinism', () => {
  const cellArb = fc.record({
    entryId: fc.constantFrom('E1', 'E2', 'E3'),
    criterionKey: fc.constantFrom('a', 'b', 'c'),
    voterId: fc.constantFrom('j1', 'j2', 'j3'),
    rawValue: score,
    weight: fc.double({ min: 0.1, max: 4, noNaN: true, noDefaultInfinity: true }),
    excluded: fc.constant(false),
  });

  it('is invariant under reordering of the input cells', () => {
    fc.assert(
      fc.property(fc.array(cellArb, { maxLength: 60 }), (cells) => {
        const config = {
          aggregator: 'weighted_mean' as const,
          normalisation: false,
          tiebreakChain: [{ kind: 'mean' as const }, { kind: 'median' as const }],
        };
        const base: EngineInput = { scores: cells as ScoreInput[], config };
        const golden = JSON.stringify(computeResults(base));
        const reversed = JSON.stringify(
          computeResults({ ...base, scores: [...cells].reverse() as ScoreInput[] }),
        );
        const rotated = JSON.stringify(
          computeResults({
            ...base,
            scores: [...cells.slice(3), ...cells.slice(0, 3)] as ScoreInput[],
          }),
        );
        expect(reversed).toBe(golden);
        expect(rotated).toBe(golden);
      }),
    );
  });
});

describe('Bradley-Terry convergence', () => {
  const entryId = fc.constantFrom('A', 'B', 'C', 'D');
  const comparisonArb = fc.record({ a: entryId, b: entryId, w: fc.constantFrom(0, 1, 2) }).map(
    ({ a, b, w }): Comparison => ({
      entryAId: a,
      entryBId: b,
      winnerEntryId: w === 0 ? null : w === 1 ? a : b,
    }),
  );

  it('produces finite, non-negative strengths that sum to 1', () => {
    fc.assert(
      fc.property(fc.array(comparisonArb, { minLength: 1, maxLength: 50 }), (comparisons) => {
        const result = bradleyTerry(comparisons);
        const sum = result.reduce((s, r) => s + r.strength, 0);
        expect(result.every((r) => Number.isFinite(r.strength) && r.strength >= 0)).toBe(true);
        // empty only if every comparison was a self-pair; otherwise normalised to 1
        if (result.length > 0) expect(sum).toBeCloseTo(1, 6);
      }),
    );
  });

  it('is invariant under reordering of comparisons', () => {
    fc.assert(
      fc.property(fc.array(comparisonArb, { minLength: 1, maxLength: 40 }), (comparisons) => {
        expect(bradleyTerry([...comparisons].reverse())).toEqual(bradleyTerry(comparisons));
      }),
    );
  });
});
