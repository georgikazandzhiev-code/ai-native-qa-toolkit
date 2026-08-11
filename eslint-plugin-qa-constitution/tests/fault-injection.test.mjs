/**
 * Fault injection over the whole plugin. `node tests/fault-injection.test.mjs`
 *
 * A passing `RuleTester` suite proves a rule reports on a string of source handed straight to it.
 * It does not prove the rule still fires through the real ESLint CLI, on a real file, in the flat
 * config the gate actually uses, with the other fifteen rules loaded alongside it. Those are
 * different claims, and only the second is what "the gate blocks this" means.
 *
 * README.md and the CI workflow both used to state the suites were "fault-injected to prove they
 * bite". They were — by hand, once, in a session, with nothing left behind. That is an assertion
 * of evidence with no artifact, which is the one thing this repository exists to refuse. This
 * file is the artifact, and it runs on every push.
 *
 * Three assertions per rule:
 *
 *   1. BITES    — lint the known-bad tree with only this rule enabled. Expect >= 1 error.
 *   2. SILENT   — lint the compliant tree with only this rule enabled. Expect exactly 0.
 *   3. ATTRIBUTED — lint the known-bad tree again with the rule's visitor replaced by an empty
 *                   one, still registered under the same id. Expect exactly 0.
 *
 * (1) alone says an error appeared. (3) says it appeared *because this rule's visitor ran* rather
 * than from a parse failure, a leaked config layer, or another rule answering to the same id.
 * (2) is the one that matters most in practice: five of the six defects the eval harness had in
 * itself were rules firing on correct code, and a rule that cries wolf gets the entire gate
 * switched off within a week.
 *
 * What (3) does NOT prove, stated plainly: it replaces the visitor wholesale rather than
 * silencing `context.report` inside a running visitor, because ESLint 9 freezes the rule context
 * and a Proxy cannot lie about a non-configurable property. So (3) attributes the error to the
 * rule; it does not prove the rule's internal logic reached a particular branch. Per-branch
 * coverage is what the RuleTester suites in rules.test.js are for.
 *
 * A rule with no case in either tree FAILS here rather than being skipped, so a new rule cannot
 * reach main without something to catch and something to leave alone. GOVERNANCE.md § Change
 * classes makes that a requirement; this is where it is enforced.
 */

import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { fileURLToPath } from 'node:url';
import plugin from '../lib/index.js';

/**
 * Declared exemptions, never silent ones. A rule listed here is printed with its reason in every
 * run, so the gap stays visible instead of being absorbed by a skip.
 * Shape: { 'rule-id': 'why no static fixture can exercise it' }
 */
const EXEMPT = {};

/** Mirrors smoke/eslint.config.mjs — a fabricated tag must not pass the whitelist branch. */
const TAGS = [
  '@App-Critical',
  '@App-Smoke',
  '@App-Sanity',
  '@App-regression',
  '@App-API',
  '@App-Integration',
  '@App-E2E',
];

const CWD = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');
const BAD = 'smoke/tests/**/*.ts';
const GOOD = 'smoke/good/**/*.ts';

/** The rule, still registered under its id, with a visitor that observes nothing. */
function emptyVisitor(rule) {
  return { ...rule, create: () => ({}) };
}

function configWith(id, rule) {
  const entry =
    id === 'single-tag-on-test' ? ['error', { whitelist: TAGS }] : 'error';
  return [
    {
      files: ['**/*.ts'],
      languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
      plugins: { 'qa-constitution': { rules: { [id]: rule } } },
      rules: { [`qa-constitution/${id}`]: entry },
    },
  ];
}

async function lint(glob, id, rule) {
  const eslint = new ESLint({
    cwd: CWD,
    overrideConfigFile: true,
    overrideConfig: configWith(id, rule),
  });
  const results = await eslint.lintFiles([glob]);
  if (results.length === 0) throw new Error(`no files matched ${glob} — the fixture tree is gone`);

  const where = [];
  for (const r of results) {
    for (const m of r.messages) {
      // A fatal parse error is not a rule report. It would satisfy assertion 1 while proving
      // nothing, so it fails loudly instead.
      if (m.fatal) throw new Error(`parse error in ${r.filePath}:${m.line} — ${m.message}`);
      where.push(`${r.filePath.split(/[\\/]/).pop()}:${m.line}`);
    }
  }
  return where;
}

const ids = Object.keys(plugin.rules).sort();
const failures = [];
const rows = [];

for (const id of ids) {
  if (EXEMPT[id]) {
    rows.push({ id, status: 'EXEMPT', detail: EXEMPT[id] });
    continue;
  }

  const rule = plugin.rules[id];
  const bites = await lint(BAD, id, rule);
  const silent = await lint(GOOD, id, rule);
  const attributed = await lint(BAD, id, emptyVisitor(rule));

  if (bites.length === 0) {
    failures.push(
      `${id}: fires on nothing in smoke/tests/. Either the rule stopped reporting, or the ` +
        `known-bad tree has no case for it — add the case, do not drop the rule from this harness.`
    );
    rows.push({ id, status: 'NO BITE', detail: '0 errors on the known-bad tree' });
    continue;
  }
  if (silent.length > 0) {
    failures.push(
      `${id}: FALSE POSITIVE — reported ${silent.length} error(s) on the compliant tree at ` +
        `${silent.join(', ')}. Compliant code must lint clean; fix the rule, not the fixture, ` +
        `unless the fixture is genuinely non-compliant.`
    );
    rows.push({ id, status: 'FALSE +', detail: `${silent.length} on smoke/good/: ${silent.join(', ')}` });
    continue;
  }
  if (attributed.length > 0) {
    failures.push(
      `${id}: produced ${attributed.length} error(s) with an empty visitor, so the ` +
        `${bites.length} above are not attributable to this rule. Check for config leakage.`
    );
    rows.push({ id, status: 'LEAKS', detail: `${attributed.length} survived an empty visitor` });
    continue;
  }

  rows.push({ id, status: 'OK', detail: `bites ${bites.length} (${bites.join(', ')}), silent on good` });
}

const pad = Math.max(...rows.map((r) => r.id.length));
console.log('');
console.log('Fault injection — each rule must bite the bad tree, stay silent on the good one,');
console.log('and stop reporting when its visitor is emptied.');
console.log('');
for (const r of rows) {
  console.log(`  ${r.status.padEnd(8)} ${r.id.padEnd(pad)}  ${r.detail}`);
}
console.log('');

const verified = rows.filter((r) => r.status === 'OK').length;
const exempted = rows.filter((r) => r.status === 'EXEMPT').length;
console.log(
  `  ${ids.length} rules, ${verified} verified` + (exempted ? `, ${exempted} declared exemption(s)` : '')
);

if (failures.length) {
  console.log('');
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log('');
  process.exit(1);
}
console.log('  fault injection passed');
