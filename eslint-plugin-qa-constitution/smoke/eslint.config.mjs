// Smoke config: every rule in the plugin at `error`, nothing else.
//
// Two fixture trees are linted with this config and they must produce opposite results:
//   smoke/tests/  the known-bad tree  — must be REJECTED, every rule firing at least once
//   smoke/good/   the compliant tree  — must PASS with zero errors
//
// The tag whitelist is passed explicitly rather than left empty so the whitelist branch of
// `single-tag-on-test` is exercised too. With no options the rule only requires *a* tag and
// accepts any string, which would let a fabricated tag through — the exact defect that produced
// 29 of the 41 false findings in the first pass of eval run 3.
import tsParser from '@typescript-eslint/parser';
import qa from '../lib/index.js';

const TAGS = [
  '@App-Critical',
  '@App-Smoke',
  '@App-Sanity',
  '@App-regression',
  '@App-API',
  '@App-Integration',
  '@App-E2E',
];

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
    plugins: { 'qa-constitution': qa },
    rules: {
      ...Object.fromEntries(Object.keys(qa.rules).map((r) => [`qa-constitution/${r}`, 'error'])),
      'qa-constitution/single-tag-on-test': ['error', { whitelist: TAGS }],
    },
  },
];
