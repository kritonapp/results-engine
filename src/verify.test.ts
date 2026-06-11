import { describe, expect, it } from 'vitest';
import { computeResults } from './compute.js';
import { EXAMPLES } from './examples.js';
import { FUNCTION_LIB_VERSION } from './contract.js';
import { parseSnapshot, verifySnapshot, type VerifiableSnapshot } from './verify.js';

/** Build an honest snapshot from an example by running the engine on it. */
function snapshotFor(index: number): VerifiableSnapshot {
  const ex = EXAMPLES[index];
  const out = computeResults(ex.input);
  return {
    schemaVersion: 1,
    functionLibVersion: out.functionLibVersion,
    categories: [{ categoryId: ex.key, input: ex.input, claimedResults: out.results }],
  };
}

describe('verifySnapshot', () => {
  it('verifies an honest snapshot of every example', () => {
    EXAMPLES.forEach((_, i) => {
      const report = verifySnapshot(snapshotFor(i));
      expect(report.ok).toBe(true);
      expect(report.functionLibVersion.matches).toBe(true);
      expect(report.categories.every((c) => c.ok)).toBe(true);
    });
  });

  it('fails when a claimed score is tampered with', () => {
    const snap = snapshotFor(0);
    const tampered: VerifiableSnapshot = {
      ...snap,
      categories: snap.categories.map((c) => ({
        ...c,
        claimedResults: c.claimedResults.map((r, i) =>
          i === 0 ? { ...r, computedScore: r.computedScore + 0.5 } : r,
        ),
      })),
    };
    const report = verifySnapshot(tampered);
    expect(report.ok).toBe(false);
    expect(report.categories[0].mismatches.length).toBeGreaterThan(0);
  });

  it('fails when a claimed rank is swapped', () => {
    const snap = snapshotFor(0);
    const tampered: VerifiableSnapshot = {
      ...snap,
      categories: snap.categories.map((c) => ({
        ...c,
        claimedResults: c.claimedResults.map((r) => ({ ...r, rank: r.rank === 1 ? 2 : r.rank })),
      })),
    };
    expect(verifySnapshot(tampered).ok).toBe(false);
  });

  it('flags an engine-version mismatch as a warning, not a hard failure', () => {
    const snap = snapshotFor(0);
    const report = verifySnapshot({ ...snap, functionLibVersion: '0.9.0' });
    expect(report.functionLibVersion.matches).toBe(false);
    expect(report.functionLibVersion.recorded).toBe('0.9.0');
    expect(report.functionLibVersion.verifier).toBe(FUNCTION_LIB_VERSION);
    // Maths still reproduces, so the categories themselves verify.
    expect(report.categories.every((c) => c.ok)).toBe(true);
  });

  it('rejects a snapshot with the wrong schema version', () => {
    expect(() =>
      parseSnapshot({ schemaVersion: 99, functionLibVersion: '1.0.0', categories: [] }),
    ).toThrow(/schemaVersion/);
  });

  it('rejects non-object input', () => {
    expect(() => parseSnapshot(null)).toThrow();
    expect(() => parseSnapshot('nope')).toThrow();
  });
});
