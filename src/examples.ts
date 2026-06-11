import type { EngineInput } from './contract.js';

/**
 * Synthetic award fixtures: criteria, weights, and raw scores chosen to exercise each
 * aggregator and the tiebreak chain. They are entirely made up — no real entrant, juror,
 * or score appears here (the real legacy parity vectors stay private in the Kriton app).
 *
 * They serve three roles:
 *   1. Regression goldens — `examples.test.ts` pins the engine's output for each.
 *   2. Demo data — `npx @kriton/results-engine demo` runs them so anyone can poke the maths.
 *   3. Documentation — a worked, runnable illustration of the methodology in the README.
 *
 * Change a score and rerun the demo: the ranking moves, deterministically.
 */

export interface Example {
  /** Stable key for `demo <key>`. */
  readonly key: string;
  readonly title: string;
  readonly description: string;
  readonly input: EngineInput;
  /** What a reader should expect to see, in plain words (not asserted; the test pins exact output). */
  readonly expect: string;
}

/** A small rubric-scored category: three entries, two jurors, two weighted criteria. */
const rubricWeighted: Example = {
  key: 'rubric-weighted',
  title: 'Rubric scoring with weighted criteria',
  description:
    'Two jurors score three entries on design (weight 2) and usability (weight 1). Each ' +
    'juror vote is collapsed to a weighted mean, then averaged across jurors.',
  input: {
    scores: [
      {
        entryId: 'aurora',
        criterionKey: 'design',
        voterId: 'j1',
        rawValue: 9,
        weight: 2,
        excluded: false,
      },
      {
        entryId: 'aurora',
        criterionKey: 'usability',
        voterId: 'j1',
        rawValue: 7,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'aurora',
        criterionKey: 'design',
        voterId: 'j2',
        rawValue: 8,
        weight: 2,
        excluded: false,
      },
      {
        entryId: 'aurora',
        criterionKey: 'usability',
        voterId: 'j2',
        rawValue: 8,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'borealis',
        criterionKey: 'design',
        voterId: 'j1',
        rawValue: 6,
        weight: 2,
        excluded: false,
      },
      {
        entryId: 'borealis',
        criterionKey: 'usability',
        voterId: 'j1',
        rawValue: 9,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'borealis',
        criterionKey: 'design',
        voterId: 'j2',
        rawValue: 7,
        weight: 2,
        excluded: false,
      },
      {
        entryId: 'borealis',
        criterionKey: 'usability',
        voterId: 'j2',
        rawValue: 8,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'cascade',
        criterionKey: 'design',
        voterId: 'j1',
        rawValue: 5,
        weight: 2,
        excluded: false,
      },
      {
        entryId: 'cascade',
        criterionKey: 'usability',
        voterId: 'j1',
        rawValue: 5,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'cascade',
        criterionKey: 'design',
        voterId: 'j2',
        rawValue: 6,
        weight: 2,
        excluded: false,
      },
      {
        entryId: 'cascade',
        criterionKey: 'usability',
        voterId: 'j2',
        rawValue: 4,
        weight: 1,
        excluded: false,
      },
    ],
    config: {
      aggregator: 'weighted_mean',
      normalisation: false,
      tiebreakChain: [{ kind: 'mean' }, { kind: 'median' }, { kind: 'stddev' }],
    },
  },
  expect: 'aurora ranks first (strongest weighted design), then borealis, then cascade.',
};

/** Z-score normalisation: a harsh juror and a generous juror, normalised to their own scales. */
const zscoreNormalised: Example = {
  key: 'zscore-normalised',
  title: 'Z-score normalisation across differently-calibrated jurors',
  description:
    'One juror scores low across the board, another high. Z-score normalisation puts each ' +
    "juror's votes on their own scale before averaging, so calibration differences cancel.",
  input: {
    scores: [
      {
        entryId: 'aurora',
        criterionKey: 'overall',
        voterId: 'harsh',
        rawValue: 4,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'borealis',
        criterionKey: 'overall',
        voterId: 'harsh',
        rawValue: 3,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'cascade',
        criterionKey: 'overall',
        voterId: 'harsh',
        rawValue: 2,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'aurora',
        criterionKey: 'overall',
        voterId: 'generous',
        rawValue: 9,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'borealis',
        criterionKey: 'overall',
        voterId: 'generous',
        rawValue: 10,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'cascade',
        criterionKey: 'overall',
        voterId: 'generous',
        rawValue: 8,
        weight: 1,
        excluded: false,
      },
    ],
    config: {
      aggregator: 'zscore_mean',
      normalisation: true,
      tiebreakChain: [{ kind: 'mean' }],
    },
  },
  expect: "Ranking reflects each entry's relative standing per juror, not raw generosity.",
};

/** Pairwise comparisons resolved by Bradley-Terry. */
const pairwiseBradleyTerry: Example = {
  key: 'pairwise-bradley-terry',
  title: 'Pairwise judging via Bradley-Terry',
  description:
    'Jurors compare entries head-to-head. Bradley-Terry estimates a latent strength for ' +
    'each from the win/loss record, deterministically (fixed init, tolerance, iteration cap).',
  input: {
    scores: [],
    pairwise: [
      {
        voterId: 'j1',
        entryAId: 'aurora',
        entryBId: 'borealis',
        winnerEntryId: 'aurora',
        excluded: false,
      },
      {
        voterId: 'j2',
        entryAId: 'aurora',
        entryBId: 'cascade',
        winnerEntryId: 'aurora',
        excluded: false,
      },
      {
        voterId: 'j1',
        entryAId: 'borealis',
        entryBId: 'cascade',
        winnerEntryId: 'borealis',
        excluded: false,
      },
      {
        voterId: 'j2',
        entryAId: 'borealis',
        entryBId: 'aurora',
        winnerEntryId: 'aurora',
        excluded: false,
      },
      {
        voterId: 'j1',
        entryAId: 'cascade',
        entryBId: 'aurora',
        winnerEntryId: 'aurora',
        excluded: false,
      },
      {
        voterId: 'j2',
        entryAId: 'cascade',
        entryBId: 'borealis',
        winnerEntryId: 'borealis',
        excluded: false,
      },
    ],
    config: {
      aggregator: 'bradley_terry',
      normalisation: false,
      tiebreakChain: [],
    },
  },
  expect: 'aurora (beats everyone) first, borealis second, cascade last; strengths sum to 1.',
};

/** Approval / top-N pick counting. */
const approvalPicks: Example = {
  key: 'approval-picks',
  title: 'Approval (top-N pick counting)',
  description: 'Each juror picks the entries they approve of; the score is the pick count.',
  input: {
    scores: [],
    picks: [
      { voterId: 'j1', entryId: 'aurora', excluded: false },
      { voterId: 'j2', entryId: 'aurora', excluded: false },
      { voterId: 'j3', entryId: 'aurora', excluded: false },
      { voterId: 'j1', entryId: 'borealis', excluded: false },
      { voterId: 'j2', entryId: 'borealis', excluded: false },
      { voterId: 'j1', entryId: 'cascade', excluded: false },
    ],
    config: {
      aggregator: 'approval',
      normalisation: false,
      tiebreakChain: [],
    },
  },
  expect: 'aurora (3 picks), borealis (2), cascade (1).',
};

/** A deliberate tie broken by the chain (higher mean, then lower stddev). */
const tiebreak: Example = {
  key: 'tiebreak',
  title: 'Tied scores resolved by the tiebreak chain',
  description:
    'Two entries reach the same mean, but one has tighter (more consensual) scores. The ' +
    'chain breaks the tie by lower standard deviation.',
  input: {
    scores: [
      {
        entryId: 'steady',
        criterionKey: 'overall',
        voterId: 'j1',
        rawValue: 7,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'steady',
        criterionKey: 'overall',
        voterId: 'j2',
        rawValue: 7,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'split',
        criterionKey: 'overall',
        voterId: 'j1',
        rawValue: 4,
        weight: 1,
        excluded: false,
      },
      {
        entryId: 'split',
        criterionKey: 'overall',
        voterId: 'j2',
        rawValue: 10,
        weight: 1,
        excluded: false,
      },
    ],
    config: {
      aggregator: 'simple_mean',
      normalisation: false,
      tiebreakChain: [{ kind: 'mean' }, { kind: 'stddev' }],
    },
  },
  expect: 'Both average 7, but steady (stddev 0) outranks split (high stddev).',
};

export const EXAMPLES: readonly Example[] = [
  rubricWeighted,
  zscoreNormalised,
  pairwiseBradleyTerry,
  approvalPicks,
  tiebreak,
];

export function exampleByKey(key: string): Example | undefined {
  return EXAMPLES.find((e) => e.key === key);
}
