import { describe, expect, it } from 'vitest';
import { computeResults } from './compute.js';
import { FUNCTION_LIB_VERSION } from './contract.js';
import type { EngineInput, ScoreInput } from './contract.js';

const cell = (
  entryId: string,
  criterionKey: string,
  voterId: string,
  rawValue: number,
  weight = 1,
): ScoreInput => ({ entryId, criterionKey, voterId, rawValue, weight, excluded: false });

describe('computeResults — score modes', () => {
  it('simple_mean: mean of per-voter means, ranked desc', () => {
    const input: EngineInput = {
      scores: [
        cell('E1', 'a', 'j1', 8),
        cell('E1', 'b', 'j1', 6),
        cell('E2', 'a', 'j1', 4),
        cell('E2', 'b', 'j1', 2),
      ],
      config: { aggregator: 'simple_mean', normalisation: false, tiebreakChain: [] },
    };
    const out = computeResults(input);
    expect(out.functionLibVersion).toBe(FUNCTION_LIB_VERSION);
    expect(out.results.map((r) => [r.entryId, r.computedScore, r.rank])).toEqual([
      ['E1', 7, 1],
      ['E2', 3, 2],
    ]);
  });

  it('weighted_mean applies criterion weights in the vote final', () => {
    const out = computeResults({
      scores: [cell('E1', 'a', 'j1', 10, 3), cell('E1', 'b', 'j1', 2, 1)],
      config: { aggregator: 'weighted_mean', normalisation: false, tiebreakChain: [] },
    });
    // (10*3 + 2*1) / (3+1) = 8
    expect(out.results[0].computedScore).toBe(8);
  });

  it('exposes per-criterion means and diagnostics', () => {
    const out = computeResults({
      scores: [
        cell('E1', 'design', 'j1', 8),
        cell('E1', 'design', 'j2', 6),
        cell('E1', 'ux', 'j1', 10),
        cell('E1', 'ux', 'j2', 4),
      ],
      config: { aggregator: 'simple_mean', normalisation: false, tiebreakChain: [] },
    });
    const e1 = out.results[0];
    expect(e1.byCriterion).toEqual({ design: 7, ux: 7 });
    expect(e1.diagnostics?.count).toBe(2);
  });

  it('median aggregator reduces across voters', () => {
    const out = computeResults({
      scores: [cell('E1', 'a', 'j1', 1), cell('E1', 'a', 'j2', 5), cell('E1', 'a', 'j3', 9)],
      config: { aggregator: 'median', normalisation: false, tiebreakChain: [] },
    });
    expect(out.results[0].computedScore).toBe(5);
  });

  it('excluded cells do not contribute (A.3.8 / manual exclusion)', () => {
    const out = computeResults({
      scores: [cell('E1', 'a', 'j1', 10), { ...cell('E1', 'a', 'j2', 0), excluded: true }],
      config: { aggregator: 'simple_mean', normalisation: false, tiebreakChain: [] },
    });
    expect(out.results[0].computedScore).toBe(10);
  });

  it('is order-independent: reordered input → identical output', () => {
    const scores = [
      cell('E1', 'a', 'j1', 8),
      cell('E2', 'a', 'j2', 4),
      cell('E1', 'a', 'j2', 6),
      cell('E2', 'a', 'j1', 2),
    ];
    const cfg = { aggregator: 'simple_mean' as const, normalisation: false, tiebreakChain: [] };
    const forward = computeResults({ scores, config: cfg });
    const reversed = computeResults({ scores: [...scores].reverse(), config: cfg });
    expect(reversed).toEqual(forward);
  });

  it('zscore normalisation rewards a high score on a harsh voter', () => {
    // j1 scores low overall, j2 high; E1 is each voter's top pick.
    const out = computeResults({
      scores: [
        cell('E1', 'a', 'j1', 5),
        cell('E2', 'a', 'j1', 3),
        cell('E1', 'a', 'j2', 10),
        cell('E2', 'a', 'j2', 8),
      ],
      config: { aggregator: 'zscore_mean', normalisation: true, tiebreakChain: [] },
    });
    // both voters rate E1 above their own mean → E1 ranks first
    expect(out.results[0].entryId).toBe('E1');
  });
});

describe('computeResults — custom formula', () => {
  it('a formula overrides the aggregator', () => {
    const out = computeResults({
      scores: [cell('E1', 'a', 'j1', 8), cell('E1', 'a', 'j2', 4)],
      config: {
        aggregator: 'simple_mean',
        normalisation: false,
        tiebreakChain: [],
        formula: { expression: 'mean(scores) * 10' },
      },
    });
    expect(out.results[0].computedScore).toBe(60);
  });
});

describe('computeResults — pairwise (Bradley-Terry)', () => {
  it('ranks by estimated strength', () => {
    const out = computeResults({
      scores: [],
      pairwise: [
        { voterId: 'j1', entryAId: 'A', entryBId: 'B', winnerEntryId: 'A', excluded: false },
        { voterId: 'j1', entryAId: 'B', entryBId: 'C', winnerEntryId: 'B', excluded: false },
        { voterId: 'j1', entryAId: 'A', entryBId: 'C', winnerEntryId: 'A', excluded: false },
      ],
      config: { aggregator: 'bradley_terry', normalisation: false, tiebreakChain: [] },
    });
    expect(out.results.map((r) => r.entryId)).toEqual(['A', 'B', 'C']);
  });
});

describe('computeResults — approval / qualifying', () => {
  it('top-N picks ranked by pick count', () => {
    const out = computeResults({
      scores: [],
      picks: [
        { voterId: 'j1', entryId: 'A', excluded: false },
        { voterId: 'j2', entryId: 'A', excluded: false },
        { voterId: 'j1', entryId: 'B', excluded: false },
      ],
      config: { aggregator: 'approval', normalisation: false, tiebreakChain: [] },
    });
    expect(out.results.map((r) => [r.entryId, r.computedScore])).toEqual([
      ['A', 2],
      ['B', 1],
    ]);
  });

  it('qualifying counts yes (raw>=1) scores per entry', () => {
    const out = computeResults({
      scores: [
        cell('A', 'qualifies', 'j1', 1),
        cell('A', 'qualifies', 'j2', 1),
        cell('B', 'qualifies', 'j1', 0),
      ],
      config: { aggregator: 'approval', normalisation: false, tiebreakChain: [] },
    });
    expect(out.results.map((r) => [r.entryId, r.computedScore])).toEqual([
      ['A', 2],
      ['B', 0],
    ]);
  });
});
