import tsParser from '@typescript-eslint/parser';
import playwright from 'eslint-plugin-playwright';
import qa from '../lib/index.js';

/**
 * Lint-gate eval config — CORRECTED after run 1.
 *
 * Run 1 was invalid. Three defects in the harness, all mine:
 *
 *  1. FABRICATED WHITELIST. I invented @App-Critical / @App-regression / @smoke instead of
 *     reading the real list out of the test-standards skill. 29 of 41 reported violations were
 *     my invention rejecting both arms — including the skill arm's @App-API and @App-E2E, which
 *     are BOTH valid. The whitelist below is now quoted from
 *     ~/.claude/skills/test-standards/SKILL.md § Tag whitelist.
 *
 *  2. MISSING PLUGIN. A generated file carried an eslint-disable for
 *     playwright/no-force-option. With that plugin unregistered, ESLint reports
 *     "Definition for rule not found" as an error — an artifact, not a violation.
 *     eslint-plugin-playwright is now registered with every rule OFF, so the directive
 *     resolves without adding any new check to the measurement.
 *
 *  3. NO SIZE NORMALISATION. Violations are also reported per 100 lines, because the arms
 *     produced files of very different length (420 vs 218 lines on case 1).
 *
 * The prompts still deliberately withhold the barrel path and the tag whitelist: those are
 * house conventions, and whether the skill transmits them is the thing being measured.
 */

const TAG_WHITELIST = [
  '@App-Critical',
  '@App-Smoke',
  '@App-Sanity',
  '@App-regression',
  '@App-API',
  '@App-Integration',
  '@App-E2E',
];

const QA_RULES = [
  'no-pom-instantiation-in-test',
  'require-strict-object',
  'schema-parse-idiom',
  'require-env-non-null',
  'no-xpath',
  'no-hard-waits',
  'no-page-evaluate',
  'no-conditional-in-test',
  'no-try-catch-in-test',
  'no-not-tothrow',
  'no-jsdoc-on-locator-getter',
  'commented-test-needs-ticket',
];

export default [
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
    plugins: { 'qa-constitution': qa, playwright },
    rules: {
      // every playwright rule off — registered only so disable directives resolve
      ...Object.fromEntries(Object.keys(playwright.rules).map((r) => [`playwright/${r}`, 'off'])),
      'qa-constitution/no-direct-playwright-import': [
        'error',
        { barrel: 'fixtures/pom/test-options', specPattern: '\\.spec\\.ts$' },
      ],
      'qa-constitution/single-tag-on-test': ['error', { whitelist: TAG_WHITELIST }],
      ...Object.fromEntries(QA_RULES.map((r) => [`qa-constitution/${r}`, 'error'])),
    },
  },
];
