import js from '@eslint/js';
import tseslint from 'typescript-eslint';

/**
 * Lint config for the pure engine. The load-bearing rule is the no-restricted-imports
 * boundary: the engine must never import a DB, clock, RNG, HTTP, IO, or framework module.
 * It depends on nothing at runtime, so the allowlist is "relative paths only". The
 * structural test (no-code-execution.test.ts) is the belt-and-braces backstop.
 */
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'coverage/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.ts'],
    rules: {
      'no-restricted-syntax': [
        'error',
        {
          selector: "CallExpression[callee.name='eval']",
          message: 'No code execution in the engine (no eval).',
        },
        {
          selector: "NewExpression[callee.name='Function']",
          message: 'No code execution in the engine (no new Function).',
        },
        {
          selector: "MemberExpression[object.name='Math'][property.name='random']",
          message: 'The engine must be deterministic (no Math.random).',
        },
        {
          selector: "Identifier[name='Date']",
          message: 'The engine must be clock-free (no Date).',
        },
      ],
    },
  },
  {
    // Tests may use Date / fast-check randomness and import simple-statistics.
    files: ['src/**/*.test.ts'],
    rules: {
      'no-restricted-syntax': 'off',
    },
  },
);
