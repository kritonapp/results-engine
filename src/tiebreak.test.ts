import { describe, expect, it } from 'vitest';
import type { EntryResult, TiebreakRule } from './contract.js';
import { resolveTiebreaks } from './tiebreak.js';

const entry = (
  entryId: string,
  computedScore: number,
  diag?: Partial<EntryResult['diagnostics']>,
): EntryResult => ({
  entryId,
  computedScore,
  rank: 0,
  diagnostics: diag
    ? { mean: 0, min: 0, max: 0, range: 0, stddev: 0, median: 0, count: 0, ...diag }
    : undefined,
});

const CHAIN: TiebreakRule[] = [
  { kind: 'mean' },
  { kind: 'median' },
  { kind: 'stddev' },
  { kind: 'manual' },
];

describe('resolveTiebreaks', () => {
  it('ranks by score desc when there are no ties', () => {
    const ranked = resolveTiebreaks([entry('A', 5), entry('B', 9), entry('C', 7)], CHAIN);
    expect(ranked.map((r) => [r.entryId, r.rank])).toEqual([
      ['B', 1],
      ['C', 2],
      ['A', 3],
    ]);
  });

  it('breaks a score tie by higher median (chain step 2)', () => {
    // equal score + equal mean → median decides; B has higher median
    const a = entry('A', 8, { mean: 8, median: 7, stddev: 1 });
    const b = entry('B', 8, { mean: 8, median: 9, stddev: 1 });
    const ranked = resolveTiebreaks([a, b], CHAIN);
    expect(ranked.map((r) => r.entryId)).toEqual(['B', 'A']);
    expect(ranked[0].tiebreakApplied?.map((r) => r.kind)).toEqual(['mean', 'median', 'stddev']);
  });

  it('breaks a tie by lower stddev (more consensus) when mean+median equal', () => {
    const a = entry('A', 8, { mean: 8, median: 8, stddev: 3 });
    const b = entry('B', 8, { mean: 8, median: 8, stddev: 1 });
    expect(resolveTiebreaks([a, b], CHAIN).map((r) => r.entryId)).toEqual(['B', 'A']);
  });

  it('flags manual-pending when auto rules cannot separate tied entries', () => {
    const a = entry('A', 8, { mean: 8, median: 8, stddev: 2 });
    const b = entry('B', 8, { mean: 8, median: 8, stddev: 2 });
    const ranked = resolveTiebreaks([a, b], CHAIN);
    // deterministic stable order by id, with the manual link recorded for §G3
    expect(ranked.map((r) => r.entryId)).toEqual(['A', 'B']);
    expect(ranked[0].tiebreakApplied?.some((r) => r.kind === 'manual')).toBe(true);
  });

  it('resolves the manual link from a Chair-supplied ordering (D3)', () => {
    const a = entry('A', 8, { mean: 8, median: 8, stddev: 2 });
    const b = entry('B', 8, { mean: 8, median: 8, stddev: 2 });
    // auto rules tie; the Chair ranks B above A
    const ranked = resolveTiebreaks([a, b], CHAIN, { B: 1, A: 2 });
    expect(ranked.map((r) => r.entryId)).toEqual(['B', 'A']);
    // resolved → no pending manual marker
    expect(ranked[0].tiebreakApplied?.some((r) => r.kind === 'manual')).toBe(false);
  });

  it('is deterministic under input reordering', () => {
    const xs = [
      entry('A', 8, { mean: 8, median: 7, stddev: 1 }),
      entry('B', 8, { mean: 8, median: 9, stddev: 1 }),
      entry('C', 5, { mean: 5, median: 5, stddev: 0 }),
    ];
    const forward = resolveTiebreaks(xs, CHAIN);
    const reversed = resolveTiebreaks([...xs].reverse(), CHAIN);
    expect(reversed).toEqual(forward);
  });
});
