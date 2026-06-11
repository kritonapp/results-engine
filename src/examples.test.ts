import { describe, expect, it } from 'vitest';
import { computeResults } from './compute.js';
import { EXAMPLES } from './examples.js';

/**
 * The synthetic example corpus doubles as regression goldens. For each fixture we:
 *   - pin the exact engine output (inline snapshot) so any numeric or shape drift fails,
 *   - assert ranks are a contiguous 1..n with no gaps, and
 *   - assert reordering the inputs does not change the output (the determinism guarantee
 *     restated on real-shaped data).
 *
 * These are SYNTHETIC. The private legacy parity vectors live in the Kriton app and never
 * ship here.
 */

describe('example corpus', () => {
  it('every example has a unique key', () => {
    const keys = EXAMPLES.map((e) => e.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  for (const example of EXAMPLES) {
    describe(example.key, () => {
      it('produces stable, contiguous ranks', () => {
        const out = computeResults(example.input);
        const ranks = out.results.map((r) => r.rank).sort((a, b) => a - b);
        expect(ranks).toEqual(out.results.map((_, i) => i + 1));
        expect(out.functionLibVersion).toMatch(/^\d+\.\d+\.\d+$/);
      });

      it('is invariant under input reordering', () => {
        const golden = JSON.stringify(computeResults(example.input));
        const reversed = JSON.stringify(
          computeResults({
            ...example.input,
            scores: [...example.input.scores].reverse(),
            pairwise: example.input.pairwise ? [...example.input.pairwise].reverse() : undefined,
            picks: example.input.picks ? [...example.input.picks].reverse() : undefined,
          }),
        );
        expect(reversed).toBe(golden);
      });

      it('matches its pinned golden ranking and scores', () => {
        const out = computeResults(example.input);
        const summary = out.results.map((r) => ({
          entryId: r.entryId,
          rank: r.rank,
          computedScore: r.computedScore,
        }));
        expect(summary).toMatchSnapshot();
      });
    });
  }
});
