# @kriton/results-engine

The pure, deterministic, independently-auditable results engine behind [Kriton](https://kriton.app)
awards judging. It is the **same code that runs in production**: the Kriton app depends on this
published package, so anyone can audit and reproduce how raw scores become ranked winners.

- **Pure and deterministic.** Inputs in, ranked results out. No database, clock, randomness, network,
  or filesystem. The same inputs always produce byte-identical output, regardless of input order.
- **No code execution, ever.** The formula language compiles to a serialisable typed AST evaluated
  against a fixed function registry. There is no `eval`, no `new Function`, no dynamic dispatch into
  arbitrary code (enforced by a structural test and a lint boundary).
- **Zero runtime dependencies.** The handful of statistical primitives are vendored and proven
  byte-identical to their upstream source, so the entire audit surface lives in this repository.
- **Reproducible by design.** Every Kriton result records the value-copied inputs, the frozen config,
  and the engine version that produced it, so a result stays verifiable forever, even after a juror is
  erased under GDPR.

```sh
npm install @kriton/results-engine
```

## Quick start

```ts
import { computeResults } from '@kriton/results-engine';

const output = computeResults({
  scores: [
    {
      entryId: 'a',
      criterionKey: 'design',
      voterId: 'j1',
      rawValue: 9,
      weight: 2,
      excluded: false,
    },
    {
      entryId: 'a',
      criterionKey: 'design',
      voterId: 'j2',
      rawValue: 8,
      weight: 2,
      excluded: false,
    },
    {
      entryId: 'b',
      criterionKey: 'design',
      voterId: 'j1',
      rawValue: 6,
      weight: 2,
      excluded: false,
    },
    {
      entryId: 'b',
      criterionKey: 'design',
      voterId: 'j2',
      rawValue: 7,
      weight: 2,
      excluded: false,
    },
  ],
  config: { aggregator: 'weighted_mean', normalisation: false, tiebreakChain: [{ kind: 'mean' }] },
});

output.results; // ranked entries with computedScore, rank, diagnostics
output.functionLibVersion; // the engine version that produced this (the reproducibility anchor)
```

## Poke at it

```sh
npx @kriton/results-engine demo          # list the synthetic examples
npx @kriton/results-engine demo all      # run them all, inputs -> ranked results
npx @kriton/results-engine demo tiebreak # run one
```

Each example is a made-up award category (criteria, weights, raw scores). Change a score, rerun, and
watch the ranking move, deterministically. The examples are also the regression goldens for this
package. (The real legacy judging vectors are **not** here; they stay private to the Kriton app.)

## The neutral, PII-free contract

The engine speaks in anonymous numbers, never tenant data. Identifiers (`entryId`, `voterId`,
`criterionKey`) are opaque, PII-free strings the engine never dereferences. There is no `org_id`, no
user, no database row in its vocabulary. The full input/output contract is exported as TypeScript
types from the package entry point.

| Mode                | `aggregator`                                                            | What it does                                                                                                                                                 |
| ------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Rubric / qualifying | `simple_mean`, `weighted_mean`, `median`, `trimmed_mean`, `zscore_mean` | Collapse each juror's per-criterion cells to a vote final (weighted by criterion weight), optionally Z-score normalise per juror, then reduce across jurors. |
| Pairwise            | `bradley_terry`                                                         | Estimate a latent strength per entry from head-to-head comparisons.                                                                                          |
| Top-N / approval    | `approval`                                                              | Count picks (or yes-votes) per entry.                                                                                                                        |

## Methodology

### Aggregation (score modes)

1. **Per-vote collapse (layer 1).** For each (entry, juror), collapse the per-criterion scores into a
   single vote final. `weighted_mean` (and friends) weight by criterion weight: `sum(value*weight) /
sum(weight)`. `simple_mean` uses equal weights.
2. **Z-score normalisation (optional).** When enabled (or with `zscore_mean`), each juror's vote
   finals are normalised to their own distribution, `(x - mean) / stddev`, so a harsh and a generous
   juror are put on the same scale before they are combined. A zero-variance series (a juror who gave
   identical scores) maps to all-zero rather than `NaN` (the determinism guard).
3. **Cross-juror reduce (layer 2).** Reduce the (possibly normalised) vote finals per entry by the
   chosen reducer: arithmetic mean, median, or trimmed mean (drop `k` from each tail).

### Standard deviation, median, quantiles

Population standard deviation (divides by `n`). Median and quantiles use linear interpolation
(R/numpy type 7). These four primitives are vendored verbatim from
[simple-statistics](https://github.com/simple-statistics/simple-statistics) v7.9.0 (ISC, see
[`NOTICE`](./NOTICE)); `src/stats.equivalence.test.ts` proves they are byte-identical to the upstream
implementation across a fuzz range, which is how a zero-dependency package keeps the maths unchanged.

### Bradley-Terry (pairwise)

Strengths are estimated by the standard minorisation-maximisation iteration `p_i <- W_i / sum_j n_ij /
(p_i + p_j)`, normalised to sum to 1 each step. Ties count as half a win to each side. It is
deterministic: a fixed uniform initialisation, a fixed tolerance (`1e-9`), a fixed iteration cap
(`1000`), and iteration over a canonically-sorted comparison list, so input order never changes the
result.

### Tiebreaks

Entries are ordered by computed score descending; entries sharing a score are then ordered by the
configured chain, for example higher mean, then higher median, then lower standard deviation (more
consensual), then a Chair's manual ordering. A stable entry-id fallback guarantees a total order.

### Determinism

All inputs are sorted by a stable key before any aggregation, all sorts are stable, and
floating-point summation uses compensated (Kahan-Babuska) addition. Reordering the inputs produces
byte-identical output. This is proven by the determinism golden, the reordered-invariance test, and a
`fast-check` property test in this repository.

### No code execution

Custom formulas (e.g. `mean(scores) * 0.6 + median(scores) * 0.4`) are tokenised and parsed into a
typed, JSON-serialisable AST. The evaluator walks that AST and dispatches function calls to a fixed
whitelist (`FUNCTION_REGISTRY`); an unknown function name is a validation error, never an attempt to
run anything. A structural test asserts the engine source contains no `eval`, `new Function`, dynamic
`import`, `require`, `Math.random`, or `Date`, and imports only relative modules.

## Verifying a Kriton result

Because each result freezes its value-copied inputs, its config, and the engine version, you can
recompute it independently and confirm it bit-for-bit, trusting only this open package.

```sh
npx @kriton/results-engine verify result-snapshot.json
```

It recomputes every category and prints `VERIFIED` (exit 0) or `MISMATCH` (exit 1, with a diff). The
snapshot format (`schemaVersion`, `functionLibVersion`, and per-category `input` + `claimedResults`)
is exported as the `VerifiableSnapshot` type, and `verifySnapshot()` exposes the same check
programmatically. If the snapshot was produced by an older engine version, install that exact version
to verify against it: each Kriton result names the version that computed it, and old versions stay
published, so historical results remain verifiable forever.

## Versioning

Semantic versioning. The package version **is** the engine's `function_lib_version`: any change to the
maths or semantics is a new version, and a breaking change is a major bump. Old results were computed
by, and stay verifiable with, the exact version recorded on them.

## Licence

[Apache-2.0](./LICENSE). Vendored third-party attribution in [`NOTICE`](./NOTICE).
