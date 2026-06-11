import { describe, expect, it } from 'vitest';
import { computeResults } from './compute.js';
import type { EngineInput, ScoreInput } from './contract.js';

/**
 * Determinism golden + reordered-input invariance (Decision 5d / M5 §D2). Same
 * inputs + config → byte-identical serialised output, and any permutation of the
 * inputs yields exactly the same result. Permutations are deterministic (rotations
 * + reverse), never random.
 */

const cell = (
  entryId: string,
  criterionKey: string,
  voterId: string,
  rawValue: number,
  weight = 1,
): ScoreInput => ({ entryId, criterionKey, voterId, rawValue, weight, excluded: false });

const SCENARIO: EngineInput = {
  scores: [
    cell('E1', 'design', 'j1', 8, 2),
    cell('E1', 'ux', 'j1', 6, 1),
    cell('E1', 'design', 'j2', 7, 2),
    cell('E1', 'ux', 'j2', 9, 1),
    cell('E2', 'design', 'j1', 5, 2),
    cell('E2', 'ux', 'j1', 5, 1),
    cell('E2', 'design', 'j2', 6, 2),
    cell('E2', 'ux', 'j2', 4, 1),
  ],
  config: {
    aggregator: 'weighted_mean',
    normalisation: false,
    tiebreakChain: [{ kind: 'mean' }, { kind: 'median' }, { kind: 'stddev' }, { kind: 'manual' }],
  },
};

/** All rotations of an array plus its reverse — a deterministic permutation set. */
function permutations<T>(xs: readonly T[]): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < xs.length; i += 1) {
    out.push([...xs.slice(i), ...xs.slice(0, i)]);
  }
  out.push([...xs].reverse());
  return out;
}

describe('engine determinism', () => {
  it('is byte-identical across repeated runs (golden snapshot)', () => {
    const first = JSON.stringify(computeResults(SCENARIO));
    const second = JSON.stringify(computeResults(SCENARIO));
    expect(second).toBe(first);
    // Golden: the exact serialised result is pinned so numeric/format drift fails.
    expect(computeResults(SCENARIO)).toMatchInlineSnapshot(`
      {
        "functionLibVersion": "1.0.0",
        "results": [
          {
            "byCriterion": {
              "design": 7.5,
              "ux": 7.5,
            },
            "computedScore": 7.5,
            "diagnostics": {
              "count": 2,
              "max": 7.666666666666667,
              "mean": 7.5,
              "median": 7.5,
              "min": 7.333333333333333,
              "range": 0.3333333333333339,
              "stddev": 0.16666666666666696,
            },
            "entryId": "E1",
            "rank": 1,
          },
          {
            "byCriterion": {
              "design": 5.5,
              "ux": 4.5,
            },
            "computedScore": 5.166666666666666,
            "diagnostics": {
              "count": 2,
              "max": 5.333333333333333,
              "mean": 5.166666666666666,
              "median": 5.166666666666666,
              "min": 5,
              "range": 0.33333333333333304,
              "stddev": 0.16666666666666652,
            },
            "entryId": "E2",
            "rank": 2,
          },
        ],
      }
    `);
  });

  it('is invariant under input reordering (every permutation → identical output)', () => {
    const golden = JSON.stringify(computeResults(SCENARIO));
    for (const perm of permutations(SCENARIO.scores)) {
      const out = JSON.stringify(computeResults({ ...SCENARIO, scores: perm as ScoreInput[] }));
      expect(out).toBe(golden);
    }
  });

  it('is invariant under reordering for pairwise (Bradley-Terry) too', () => {
    const input: EngineInput = {
      scores: [],
      pairwise: [
        { voterId: 'j1', entryAId: 'A', entryBId: 'B', winnerEntryId: 'A', excluded: false },
        { voterId: 'j2', entryAId: 'B', entryBId: 'C', winnerEntryId: 'B', excluded: false },
        { voterId: 'j1', entryAId: 'A', entryBId: 'C', winnerEntryId: 'C', excluded: false },
        { voterId: 'j2', entryAId: 'A', entryBId: 'B', winnerEntryId: 'A', excluded: false },
      ],
      config: { aggregator: 'bradley_terry', normalisation: false, tiebreakChain: [] },
    };
    const golden = JSON.stringify(computeResults(input));
    for (const perm of permutations(input.pairwise!)) {
      expect(JSON.stringify(computeResults({ ...input, pairwise: perm }))).toBe(golden);
    }
  });
});
