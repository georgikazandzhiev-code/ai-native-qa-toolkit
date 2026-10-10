/**
 * Fault injection over the whole plugin. `node tests/fault-injection.test.mjs`
 *
 * A passing `RuleTester` suite proves a rule reports on a string of source handed straight to it.
 * It does not prove the rule still fires through the real ESLint CLI, on a real file, in the flat
 * config the gate actually uses, with the other sixteen rules loaded alongside it. Those are
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
 *
 * After the three per-rule assertions, a PINNED check lints chosen files of the known-bad tree
 * with the full smoke config and compares every report, rule and line, to a fixed list. "At least
 * one error" cannot tell a fix that holds from one that went too far; a pinned list can. A report
 * that appears, disappears or moves to another line fails the run.
 */

import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { readFileSync } from 'node:fs';
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

/**
 * Pinned files: path -> the exact reports expected on it, as { rule, at }, where `at` is text that
 * starts the reported line. Lines are found from that text, so editing the file's header comment
 * does not break the pin.
 */
const PINNED = {
  // test.step declares no test (lib/index.js, CONFIG_CALLS). Steps in hooks are setup and stay
  // silent under all four rules that ask "which test is this in?"; the untagged, assertion-free
  // test around a step is still reported by both test-level rules; and an if or a try/catch in a
  // step inside a test is still reported by the two in-test rules.
  'smoke/tests/app/ui/steps.spec.ts': [
    { rule: 'single-tag-on-test', at: "test('opens the seeded project'" },
    { rule: 'require-assertion-in-test', at: "test('opens the seeded project'" },
    { rule: 'no-conditional-in-test', at: '    if (response.status() === 409)' },
    { rule: 'no-try-catch-in-test', at: '    try { expect(response.status())' },
  ],
};

async function pinnedReports(file) {
  const eslint = new ESLint({ cwd: CWD, overrideConfigFile: 'smoke/eslint.config.mjs' });
  const [result] = await eslint.lintFiles([file]);
  if (!result) throw new Error(`${file} is gone — restore it or remove its pin`);
  return result.messages.map((m) => {
    if (m.fatal) throw new Error(`parse error in ${file}:${m.line} — ${m.message}`);
    // ruleId is null for a report from ESLint itself, such as an unused disable directive.
    return `${(m.ruleId ?? 'eslint').replace('qa-constitution/', '')}@${m.line}`;
  });
}

for (const [file, expected] of Object.entries(PINNED)) {
  const lines = readFileSync(`${CWD}${file}`, 'utf8').split(/\r?\n/);
  const want = expected.map(({ rule, at }) => {
    const hits = lines.flatMap((l, i) => (l.startsWith(at) ? [i + 1] : []));
    if (hits.length !== 1) throw new Error(`${file}: "${at}" starts ${hits.length} lines, expected exactly 1`);
    return `${rule}@${hits[0]}`;
  });
  const got = await pinnedReports(file);
  const missing = want.filter((w) => !got.includes(w));
  const extra = got.filter((g) => !want.includes(g));
  const name = file.split('/').pop();
  if (missing.length || extra.length) {
    failures.push(
      `${file}: the pinned reports changed.` +
        (missing.length ? ` Missing: ${missing.join(', ')}.` : '') +
        (extra.length ? ` Unexpected: ${extra.join(', ')}.` : '')
    );
    rows.push({ id: name, status: 'PIN FAIL', detail: `expected ${want.join(', ')}; got ${got.join(', ') || 'nothing'}` });
    continue;
  }
  rows.push({ id: name, status: 'PINNED', detail: `exactly ${got.join(', ')}` });
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
const pinned = Object.keys(PINNED).length;
const exempted = rows.filter((r) => r.status === 'EXEMPT').length;
console.log(
  `  ${ids.length} rules, ${verified} verified` +
    (exempted ? `, ${exempted} declared exemption(s)` : '') +
    `; ${pinned} pinned file(s)`
);

if (failures.length) {
  console.log('');
  for (const f of failures) console.log(`  FAIL  ${f}`);
  console.log('');
  process.exit(1);
}
console.log('  fault injection passed');
