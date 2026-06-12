import { describe, expect, it } from 'vitest';
import { approvalCounts, bradleyTerry, type Comparison } from './bradley-terry.js';

describe('bradleyTerry', () => {
  it('ranks a clear transitive order A > B > C', () => {
    const comparisons: Comparison[] = [
      { entryAId: 'A', entryBId: 'B', winnerEntryId: 'A' },
      { entryAId: 'A', entryBId: 'B', winnerEntryId: 'A' },
      { entryAId: 'B', entryBId: 'C', winnerEntryId: 'B' },
      { entryAId: 'B', entryBId: 'C', winnerEntryId: 'B' },
      { entryAId: 'A', entryBId: 'C', winnerEntryId: 'A' },
    ];
    const result = bradleyTerry(comparisons);
    const byStrength = [...result].sort((a, b) => b.strength - a.strength);
    expect(byStrength.map((r) => r.entryId)).toEqual(['A', 'B', 'C']);
    // strengths normalised to sum 1
    expect(result.reduce((s, r) => s + r.strength, 0)).toBeCloseTo(1, 9);
  });

  it('is deterministic and order-independent (reordered input → identical output)', () => {
    const comparisons: Comparison[] = [
      { entryAId: 'A', entryBId: 'B', winnerEntryId: 'A' },
      { entryAId: 'B', entryBId: 'C', winnerEntryId: 'C' },
      { entryAId: 'A', entryBId: 'C', winnerEntryId: 'A' },
    ];
    const forward = bradleyTerry(comparisons);
    const reversed = bradleyTerry([...comparisons].reverse());
    expect(reversed).toEqual(forward);
  });

  it('treats ties as half a win to each side (symmetric pair → equal strength)', () => {
    const result = bradleyTerry([
      { entryAId: 'A', entryBId: 'B', winnerEntryId: 'A' },
      { entryAId: 'A', entryBId: 'B', winnerEntryId: 'B' },
      { entryAId: 'A', entryBId: 'B', winnerEntryId: null },
    ]);
    const map = new Map(result.map((r) => [r.entryId, r.strength]));
    expect(map.get('A')).toBeCloseTo(map.get('B')!, 9);
  });

  it('handles empty and single-entry inputs', () => {
    expect(bradleyTerry([])).toEqual([]);
    expect(bradleyTerry([{ entryAId: 'X', entryBId: 'X', winnerEntryId: null }])).toEqual([
      { entryId: 'X', strength: 1 },
    ]);
  });
});

describe('approvalCounts', () => {
  it('counts picks per entry, canonically ordered', () => {
    expect(
      approvalCounts([{ entryId: 'B' }, { entryId: 'A' }, { entryId: 'B' }, { entryId: 'B' }]),
    ).toEqual([
      { entryId: 'A', count: 1 },
      { entryId: 'B', count: 3 },
    ]);
  });

  it('is order-independent', () => {
    const picks = [{ entryId: 'A' }, { entryId: 'B' }, { entryId: 'A' }];
    expect(approvalCounts(picks)).toEqual(approvalCounts([...picks].reverse()));
  });
});
