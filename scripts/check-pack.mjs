#!/usr/bin/env node
/**
 * Tarball guard. Asserts the published artifact contains ONLY built output plus licence
 * and docs — never the private parity oracle, tests, snapshots, or raw TypeScript source.
 * Runs in CI before publish and is safe to run locally (`npm run check:pack`).
 *
 * This is the mechanical backstop for the M5.5 rule: the legacy parity vectors and the
 * `__parity__` oracle must NEVER ship. If npm's `files` allowlist ever regresses, this
 * fails the build rather than leaking.
 */
import { execFileSync } from 'node:child_process';

const FORBIDDEN = [
  { label: 'parity oracle', re: /(^|\/)__parity__(\/|$)/i },
  { label: 'test file', re: /\.(test|spec)\.[cm]?[jt]sx?$/i },
  { label: 'snapshot', re: /(^|\/)__snapshots__(\/|$)|\.snap$/i },
  { label: 'TypeScript source outside dist', re: /^src\//i },
];

const REQUIRED = ['package.json', 'LICENSE', 'NOTICE', 'README.md', 'dist/index.js', 'dist/index.d.ts'];

const raw = execFileSync('npm', ['pack', '--dry-run', '--json'], { encoding: 'utf8' });
const files = JSON.parse(raw)[0].files.map((f) => f.path.replace(/^\.\//, ''));

const violations = [];
for (const file of files) {
  for (const { label, re } of FORBIDDEN) {
    if (re.test(file)) violations.push(`forbidden ${label}: ${file}`);
  }
}
for (const need of REQUIRED) {
  if (!files.includes(need)) violations.push(`missing required file: ${need}`);
}

if (violations.length > 0) {
  console.error('Tarball guard FAILED:');
  for (const v of violations) console.error(`  - ${v}`);
  console.error(`\nTarball contained ${files.length} files:`);
  for (const f of files) console.error(`  ${f}`);
  process.exit(1);
}

console.log(`Tarball guard PASSED: ${files.length} files, no parity/test/source leakage.`);
for (const f of files) console.log(`  ${f}`);
