import type { EntryResult, TiebreakRule } from './contract.js';

/**
 * Tiebreak chain resolution (Decision 5 / M5 §C6 + §G3). A pure pass over entries
 * that share an equal computed score: order them by the configured chain (e.g.
 * higher mean → higher median → lower stddev → manual). Deterministic — a stable
 * entry-id fallback guarantees a total order.
 *
 * The terminal `manual` link is resolved by a Chair-supplied ordering (`manualOrder`,
 * entryId → ordinal, D3) when present. Where `manual` is reached with entries still
 * tied and no ordering covers them, those entries keep a deterministic order and
 * carry a `manual` marker in `tiebreakApplied`, which the Chair tie-resolution flow
 * (§G3) surfaces and resolves.
 */

type ManualOrder = Readonly<Record<string, number>> | undefined;

const byId = (a: EntryResult, b: EntryResult) => a.entryId.localeCompare(b.entryId);

/** Compare two entries by a single rule; 0 if indistinguishable. */
function compareByRule(
  rule: TiebreakRule,
  a: EntryResult,
  b: EntryResult,
  manualOrder: ManualOrder,
): number {
  const da = a.diagnostics;
  const db = b.diagnostics;
  switch (rule.kind) {
    case 'mean':
      return da && db ? db.mean - da.mean : 0; // higher mean first
    case 'median':
      return da && db ? db.median - da.median : 0; // higher median first
    case 'stddev':
      return da && db ? da.stddev - db.stddev : 0; // lower stddev (consensus) first
    case 'manual': {
      const oa = manualOrder?.[a.entryId];
      const ob = manualOrder?.[b.entryId];
      if (oa === undefined || ob === undefined) return 0; // not (yet) resolved by the Chair
      return oa - ob; // lower ordinal wins
    }
  }
}

/** True if the chain leaves a and b indistinguishable across ALL links. */
function unresolved(
  chain: readonly TiebreakRule[],
  a: EntryResult,
  b: EntryResult,
  manualOrder: ManualOrder,
): boolean {
  return chain.every((rule) => compareByRule(rule, a, b, manualOrder) === 0);
}

function orderTiedGroup(
  group: EntryResult[],
  chain: readonly TiebreakRule[],
  manualOrder: ManualOrder,
): EntryResult[] {
  const ordered = [...group].sort((a, b) => {
    for (const rule of chain) {
      const d = compareByRule(rule, a, b, manualOrder);
      if (d !== 0) return d;
    }
    return byId(a, b);
  });

  const hasManual = chain.some((r) => r.kind === 'manual');
  const manualPending =
    hasManual && ordered.some((e, i) => i > 0 && unresolved(chain, ordered[i - 1], e, manualOrder));

  // Record the chain consulted; keep `manual` only while a Chair decision is pending.
  const applied: TiebreakRule[] = manualPending
    ? [...chain]
    : chain.filter((r) => r.kind !== 'manual');

  return ordered.map((e) => ({ ...e, tiebreakApplied: applied }));
}

/**
 * Resolve ties and assign sequential 1-based ranks. Entries are first ordered by
 * computed score descending; each group sharing a score is then ordered by the
 * tiebreak chain (with the Chair's manual ordering applied where present).
 */
export function resolveTiebreaks(
  entries: readonly EntryResult[],
  chain: readonly TiebreakRule[],
  manualOrder?: ManualOrder,
): EntryResult[] {
  const sorted = [...entries].sort(
    (a, b) => b.computedScore - a.computedScore || byId(a, b),
  );

  const out: EntryResult[] = [];
  let i = 0;
  while (i < sorted.length) {
    let j = i + 1;
    while (j < sorted.length && sorted[j].computedScore === sorted[i].computedScore) j += 1;
    const group = sorted.slice(i, j);
    out.push(...(group.length === 1 ? group : orderTiedGroup(group, chain, manualOrder)));
    i = j;
  }

  return out.map((e, idx) => ({ ...e, rank: idx + 1 }));
}
