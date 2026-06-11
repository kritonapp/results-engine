import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * No-code-execution / purity structural proof (the public mirror of the app's §D4 test).
 * Belt-and-braces with the ESLint boundary:
 *   (a) the engine source contains NO code-execution, clock, or RNG construct
 *       (eval / new Function / Function() / dynamic import() / require() /
 *       Math.random / Date), and
 *   (b) the engine imports ONLY relative modules — it has ZERO runtime dependencies
 *       (the simple-statistics functions are vendored into ./stats).
 *
 * This is the auditable guarantee that a stored result can only ever be arithmetic over
 * its value-copied inputs: there is no path by which a formula or config could execute code.
 */

const SRC_DIR = dirname(fileURLToPath(import.meta.url));

/** Production engine sources: src/*.ts excluding tests. */
function engineSourceFiles(): string[] {
  return readdirSync(SRC_DIR)
    .filter((f) => f.endsWith('.ts') && !f.endsWith('.test.ts'))
    .map((f) => join(SRC_DIR, f));
}

/** Remove block and line comments so prose mentioning "eval"/"Date" doesn't match. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

const FORBIDDEN: { label: string; pattern: RegExp }[] = [
  { label: 'eval(', pattern: /\beval\s*\(/ },
  { label: 'new Function', pattern: /\bnew\s+Function\b/ },
  { label: 'Function(', pattern: /\bFunction\s*\(/ },
  { label: 'dynamic import()', pattern: /\bimport\s*\(/ },
  { label: 'require(', pattern: /\brequire\s*\(/ },
  { label: 'Math.random', pattern: /\bMath\s*\.\s*random\b/ },
  { label: 'Date (clock)', pattern: /\bDate\b/ },
];

describe('results engine purity (structural)', () => {
  it('finds engine source files', () => {
    expect(engineSourceFiles().length).toBeGreaterThan(0);
  });

  it('contains no code-execution, clock, or RNG construct', () => {
    for (const file of engineSourceFiles()) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const { label, pattern } of FORBIDDEN) {
        expect(pattern.test(code), `${file} must not contain ${label}`).toBe(false);
      }
    }
  });

  it('imports only relative modules — zero runtime dependencies', () => {
    const importRe = /\bfrom\s+['"]([^'"]+)['"]/g;
    for (const file of engineSourceFiles()) {
      const code = stripComments(readFileSync(file, 'utf8'));
      for (const match of code.matchAll(importRe)) {
        const spec = match[1];
        const ok = spec.startsWith('./') || spec.startsWith('../');
        expect(ok, `${file} imports a non-relative module '${spec}'`).toBe(true);
      }
    }
  });
});
