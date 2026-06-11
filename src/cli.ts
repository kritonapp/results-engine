#!/usr/bin/env node
import { readFileSync } from 'node:fs';
import { computeResults } from './compute.js';
import { FUNCTION_LIB_VERSION } from './contract.js';
import { EXAMPLES, exampleByKey, type Example } from './examples.js';
import { parseSnapshot, verifySnapshot } from './verify.js';

/**
 * The `@kriton/results-engine` CLI: two pokeable commands.
 *
 *   demo [key]        Run a synthetic example end-to-end and print inputs -> ranked
 *                     results. Omit the key to list the examples. Change a score in your
 *                     own input and watch the ranking move, deterministically.
 *   verify <file>     Independently recompute an exported Kriton result snapshot and
 *                     assert it matches what was claimed. Exits non-zero on any mismatch.
 *
 * No network, no state: it only runs the pure engine.
 */

function printResults(input: Parameters<typeof computeResults>[0]): void {
  const out = computeResults(input);
  for (const r of out.results) {
    const score = Number.isInteger(r.computedScore)
      ? String(r.computedScore)
      : r.computedScore.toFixed(6);
    console.log(`  #${r.rank}  ${r.entryId.padEnd(12)} score=${score}`);
  }
}

function runDemo(key: string | undefined): number {
  if (!key) {
    console.log(`@kriton/results-engine demo  (engine v${FUNCTION_LIB_VERSION})\n`);
    console.log('Examples (run `demo <key>`):');
    for (const e of EXAMPLES) {
      console.log(`  ${e.key.padEnd(24)} ${e.title}`);
    }
    console.log('\nOr `demo all` to run them all.');
    return 0;
  }

  const examples: Example[] =
    key === 'all'
      ? [...EXAMPLES]
      : (() => {
          const e = exampleByKey(key);
          if (!e) {
            console.error(`Unknown example '${key}'. Run \`demo\` to list them.`);
            return [];
          }
          return [e];
        })();

  if (examples.length === 0) return 1;

  for (const e of examples) {
    console.log(`\n=== ${e.title} (${e.key}) ===`);
    console.log(e.description);
    console.log(`aggregator: ${e.input.config.aggregator}`);
    console.log('results:');
    printResults(e.input);
    console.log(`expect: ${e.expect}`);
  }
  return 0;
}

function runVerify(file: string | undefined): number {
  if (!file) {
    console.error('Usage: verify <snapshot.json>');
    return 2;
  }
  let report;
  try {
    const snapshot = parseSnapshot(JSON.parse(readFileSync(file, 'utf8')));
    report = verifySnapshot(snapshot);
  } catch (e) {
    console.error(`Could not verify: ${(e as Error).message}`);
    return 2;
  }

  const v = report.functionLibVersion;
  console.log(`engine version: recorded ${v.recorded}, verifier ${v.verifier}`);
  if (!v.matches) {
    console.log(
      `  warning: versions differ. Verify with @kriton/results-engine@${v.recorded} for an exact-version check.`,
    );
  }
  for (const c of report.categories) {
    if (c.ok) {
      console.log(`  OK   ${c.categoryId}`);
    } else {
      console.log(`  FAIL ${c.categoryId}`);
      for (const m of c.mismatches) console.log(`         - ${m}`);
    }
  }
  console.log(
    report.ok ? '\nVERIFIED: results reproduce exactly.' : '\nMISMATCH: results do not reproduce.',
  );
  return report.ok ? 0 : 1;
}

function main(argv: readonly string[]): number {
  const [command, ...rest] = argv;
  switch (command) {
    case 'demo':
      return runDemo(rest[0]);
    case 'verify':
      return runVerify(rest[0]);
    case undefined:
    case 'help':
    case '--help':
    case '-h':
      console.log('Usage: kriton-results-engine <demo [key] | verify <file>>');
      return command === undefined ? 1 : 0;
    default:
      console.error(`Unknown command '${command}'. Try \`demo\` or \`verify\`.`);
      return 2;
  }
}

process.exit(main(process.argv.slice(2)));
