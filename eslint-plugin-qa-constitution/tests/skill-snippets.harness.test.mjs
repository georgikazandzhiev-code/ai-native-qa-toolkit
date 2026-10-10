/**
 * Tests for the skill-snippet lint itself. `npm run test:snippets-harness`
 *
 * The snippet lint decides what counts as a counter-example, what is a placeholder, where a fence
 * starts and ends, how a diff is read, when an opt-out is honoured and when a fragment is checked
 * as a test body. Each of those can go wrong in both directions: skip a good example that breaks a
 * rule (a gate that never fires), or lint a counter-example that is meant to be wrong (a gate that
 * cries wolf and gets switched off). The cases below cover the conditions the mutation sweep
 * (skill-snippets.mutation.test.mjs) breaks one at a time, and the whole script is run end to end
 * against throwaway skills trees with one planted defect each. Whether each listed condition has a
 * case is what the sweep measures; this file does not claim it on its own.
 *
 * Written after #59, where a new check shipped with a test for one of its branches and flagged
 * valid input; revised after this suite's first version claimed a case per branch while an
 * independent review found 14 of 20 mutants surviving it, and again after a second review found
 * six more conditions with no case. The cases marked [mutant] were added because a specific
 * mutation of the lint had survived, or to kill one listed in the sweep; each names what it catches.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { parse } from '@typescript-eslint/parser';

const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url));
// The lint under test. The mutation sweep points this at a mutated copy (SNIPPET_LINT) so it never
// has to edit the real file.
const SCRIPT = process.env.SNIPPET_LINT ?? join(PLUGIN_DIR, 'tests', 'skill-snippets.test.mjs');
const { snippets, isCounterExample, fillPlaceholders, afterSideOfDiff, skipReason, inlineConfig, virtualPath, stepsOnly, lintSnippet } =
  await import(pathToFileURL(SCRIPT).href);
const fence = (body, lang = 'typescript') => '```' + lang + '\n' + body + '\n```';

let failed = 0;
let count = 0;
const check = (name, ok, detail = '') => {
  count++;
  if (!ok) failed++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${String(detail).slice(0, 600)}`}`);
};
// A throw inside a case must FAIL that case, not crash the harness: the mutation sweep counts only
// failed cases as kills, and a crash would also hide every later case's result.
const block = (md, i = 0) => {
  try {
    return snippets(md)[i];
  } catch {
    return undefined;
  }
};
const counter = (md, i = 0) => {
  const b = block(md, i);
  return b ? isCounterExample(b) : 'error';
};
// Exact booleans: an error result must fail a case whichever way it expects.
const isBad = (md, i = 0) => counter(md, i) === true;
const isGood = (md, i = 0) => counter(md, i) === false;
const rulesOf = (res) => (res.real ?? []).map((m) => `${m.ruleId}@${m.line}`);

console.log('\nSkill-snippet lint — harness tests\n');

// ── fences ──
check('CRLF files: the block is found and carries no \\r [mutant: split on \\n only]', block('### Good\r\n\r\n```ts\r\nx();\r\n```\r\n')?.code === 'x();');
check('a fence indented inside a list item is dedented', block('1. Step\n   ```ts\n   const a = 1;\n   ```\n')?.code === 'const a = 1;');
check('an info string after the language is accepted (```ts title="a.ts")', snippets('```ts title="a.ts"\nx();\n```\n').length === 1);
check('tilde fences are accepted', snippets('~~~ts\nx();\n~~~\n').length === 1);
check('an upper-case language is accepted (```TS) [mutant: language not lower-cased]', block('```TS\nx();\n```\n')?.code === 'x();');
check('a ```` fence containing ``` is one block, and pairing stays in sync', snippets('````md\n```ts\nbad();\n```\n````\n\n```ts\ny();\n```\n').map((b) => b.code).join() === 'y();');
check('a ``` line does not close a ~~~ fence [mutant: closing fence of any character]',
  block('~~~ts\na();\n```\nstill inside\n~~~\n')?.code.includes('still inside') === true);
check('```js, ```bash and ```tsx blocks are not linted [mutant: language check removed]', snippets('```js\na();\n```\n```bash\nls\n```\n```tsx\n<A/>\n```\n').length === 0);
let threw = false;
try {
  snippets('```ts\nnever closed();\n');
} catch {
  threw = true;
}
check('an unclosed fence throws instead of silently dropping the rest of the file', threw);

// ── counter-example detection: the block's own first comment line ──
check('first comment ❌ → skipped', isBad(fence('// ❌ unsafe — no runtime check\nx();')));
for (const word of ['BAD', 'WRONG', 'FORBIDDEN', 'ANTI-PATTERN'])
  check(`first comment "// ${word} — x" → skipped [mutant: ${word} dropped from the wrong-labels]`, isBad(fence(`// ${word} — x\nx();`)));
check('first comment GOOD wins over a "### Bad" label [mutant: first-line GOOD ignored]', isGood('### Bad\n\n' + fence('// GOOD — replaces the BAD version above\nx();')));
check('first comment starting with BAD stays a counter-example even if it mentions a FIX [mutant: right-label anywhere on the line]',
  isBad(fence('// ❌ BAD — the FIX is in the next block\nx();')));
check('"// 403 FORBIDDEN — zero-scope token" is not a label (the word is not at the start)', isGood(fence('// 403 FORBIDDEN — zero-scope token\nx();')));
check('"// DON\'T share a token across tenants — one per test" is advice, not a label', isGood(fence("// DON'T share a token across tenants — one per test\nx();")));
check('"// FORBIDDEN (403) for a zero-scope token" is a status name, not a label', isGood(fence('// FORBIDDEN (403) for a zero-scope token\nx();')));
check('a code first line starting with a wrong-label word is not a comment label [mutant: comment check dropped]',
  isGood('### Good\n\n' + fence('bad();\nx();')));

// ── counter-example detection: the prose line just above ──
check('prose "Forbidden:" under a neutral heading → skipped [mutant: nearest-line wrong-label ignored]', isBad('### Aliasing\n\nForbidden:\n\n' + fence('x();')));
check('under "### Good", a block introduced by "never do THIS (BAD):" → skipped [mutant: prose tail label ignored]',
  isBad('### Good\n\n' + fence('a();') + '\n\nBut never do THIS (BAD):\n\n' + fence('b();'), 1));
check('"(BAD)" in the middle of a prose line does not label the block [mutant: tail label not anchored at the end]',
  isGood('### Good\n\n' + fence('a();') + '\n\nUnlike the (BAD) version above, this one waits:\n\n' + fence('b();'), 1));
check('"Fix (replaces the BAD call above):" directly under "### Bad", no block between → linted [mutant: nearest-line GOOD ignored]',
  isGood('### Bad\n\nFix (replaces the BAD call above):\n\n' + fence('x();')));
check('"Fix (replaces the BAD call above):" after a Bad block → linted', isGood('### Bad\n\n' + fence('a();') + '\n\nFix (replaces the BAD call above):\n\n' + fence('b();'), 1));
for (const prose of ['Forbidden is what a zero-scope token gets:', "Use the fixture instead — DON'T construct the POM:", 'This replaces the BAD version above:'])
  check(`prose "${prose}" is not a label → linted`, isGood(prose + '\n\n' + fence('x();')));

// ── counter-example detection: the label above ──
check('"### Bad" directly above → skipped', isBad('### Bad\n\n' + fence('x();')));
for (const label of ['### Wrong: cleanup inside the test', '### Forbidden — flattened', '### Anti-pattern', '### Antipatterns'])
  check(`"${label}" → skipped [mutant: its word dropped from the wrong-labels]`, isBad(label + '\n\n' + fence('x();')));
check('a bold label "**Bad:**" above explanatory prose → skipped [mutant: bold labels not recognised]', isBad('**Bad:**\n\nThis hides the cause.\n\n' + fence('x();')));
check('"### Bad", then explanatory prose, then the block → still skipped (no block in between)', isBad('### Bad\n\nThis hides the cause.\n\n' + fence('x();')));
check('"### Good" → linted', isGood('### Good\n\n' + fence('x();')));
check('a ❌ bullet introducing the block → skipped [mutant: ❌ dropped from the wrong-labels]', isBad('- ❌ Never do this:\n\n' + fence('x();')));
check('Bad block, neutral prose, next block → the next block is linted (label does not carry over) [mutant: fence crossing ignored]', isGood('### Bad\n\n' + fence('a();') + '\n\nThe web-first way:\n\n' + fence('b();'), 1));
check('Bad block directly followed by another block → both skipped', isBad('### Bad\n\n' + fence('a();') + '\n\n' + fence('b();'), 1));
check('a heading with a wrong-label in the middle ("### Not Bad: a default") is linted [mutant: label not anchored at the start]',
  isGood('### Not Bad: a default\n\n' + fence('x();')));
check('"## Bad request (400) tests" is not a counter-example label', isGood('## Bad request (400) tests\n\n' + fence('x();')));
check('"### Forbidden (403)" is not a counter-example label', isGood('### Forbidden (403)\n\n' + fence('x();')));
check('"### Forbidden — 403 for a zero-scope token" is not a label [mutant: status-code exemption removed]', isGood('### Forbidden — 403 for a zero-scope token\n\n' + fence('x();')));
check('"### Forbidden: 403" is not a label', isGood('### Forbidden: 403\n\n' + fence('x();')));
check('"### Bad requests (400)" is not a label [mutant: delimiter after the word not required]', isGood('### Bad requests (400)\n\n' + fence('x();')));
check('"### Bad-request matrix" is not a label [mutant: a glued hyphen counts as a delimiter]', isGood('### Bad-request matrix\n\n' + fence('x();')));
check('"### Wrong-tenant access returns 404 (BOLA)" is not a label', isGood('### Wrong-tenant access returns 404 (BOLA)\n\n' + fence('x();')));
check('"## Avoid flaky tests with web-first assertions" is not a label', isGood('## Avoid flaky tests with web-first assertions\n\n' + fence('x();')));
check('a label far above (past 30 lines of prose) is still found [mutant: walk cap lowered]', isBad('### Bad\n\n' + 'prose line\n'.repeat(30) + fence('x();')) === true);
check('an unlabelled block → linted', isGood('Some prose.\n\n' + fence('x();')));

// ── placeholders vs generics ──
const filled = fillPlaceholders(
  'const r = await apiRequest<APIError>({});\nconst p: Partial<WorkerData> = {};\nconst q: Promise<void> = f();\ntest.extend<Pages>({});\n' +
    'import { create<Resource>, Get<Resource>Schema } from "../<domain>/x";\nqase.suite(SUITES.API_<SUITE>);\nexport async function create<Resource><T = X>() {}'
);
check('real type arguments are left alone: apiRequest<APIError>(, Partial<WorkerData>, Promise<void>, test.extend<Pages>(',
  filled.includes('apiRequest<APIError>(') && filled.includes('Partial<WorkerData>') && filled.includes('Promise<void>') && filled.includes('test.extend<Pages>('), filled);
check('placeholders become identifiers: create<Resource>, Get<Resource>Schema, /<domain>/, API_<SUITE>, create<Resource><T>',
  filled.includes('createXResource,') && filled.includes('GetXResourceSchema') && filled.includes('/Xdomain/') && filled.includes('API_XSUITE') && filled.includes('createXResource<T = X>'), filled);
check('a PascalCase type word glued to an identifier is a placeholder: Get<Worker>Schema [mutant: glued words as types]',
  fillPlaceholders('Get<Worker>Schema') === 'GetXWorkerSchema');
check('a <Word> after a non-identifier is a placeholder: pages/app/<Page>.ts [mutant: no identifier check]',
  fillPlaceholders('pages/app/<Page>.ts') === 'pages/app/XPage.ts');
let parses = true;
try {
  parse(filled, { ecmaVersion: 2022, sourceType: 'module' });
} catch {
  parses = false;
}
check('the filled code parses as TypeScript (differential: the real parser decides)', parses);

// ── diffs ──
check('a diff block is linted as its "after" side [mutant: + not stripped]', afterSideOfDiff('- const a = process.env.X;\n+ const a = env.X;') === 'const a = env.X;');
check('a block with an occasional "- " line is not a diff', afterSideOfDiff('const a = 1;\nconst b = 2;\n- not a diff marker\nconst c = 3;\nconst d = 4;').includes('- not'));

// ── explicit skip ──
check('skip marker with an em-dash reason → honoured', skipReason('<!-- snippet-lint: skip — two files in one block -->') === 'two files in one block');
check('skip marker with an en dash, a hyphen or -- → honoured [mutant: em dash only]',
  ['–', '-', '--'].every((d) => skipReason(`<!-- snippet-lint: skip ${d} two files -->`) === 'two files'));
check('skip marker with no reason → NOT honoured', skipReason('<!-- snippet-lint: skip -->') === null);
check('skip marker with an empty or punctuation-only reason → NOT honoured [mutant: skip reason: any text]', [
  '<!-- snippet-lint: skip — -->',
  '<!-- snippet-lint: skip -- - -->',
  '<!-- snippet-lint: skip —   … -->',
  '<!-- snippet-lint: skip — ... -->',
].every((m) => skipReason(m) === null));
check('skip marker whose reason is a single letter → NOT honoured [mutant: one letter is a reason]', skipReason('<!-- snippet-lint: skip — x -->') === null);
check('skip marker copied from the template, "<reason>" → NOT honoured [mutant: angle-bracket placeholder accepted]',
  skipReason('<!-- snippet-lint: skip — <reason> -->') === null);
for (const word of ['reason', 'TODO', 'tbd'])
  check(`skip marker whose reason is "${word}" → NOT honoured [mutant: placeholder words accepted]`, skipReason(`<!-- snippet-lint: skip — ${word} -->`) === null);
check('skip marker whose reason is "TODO." → NOT honoured [mutant: placeholder trailing punctuation not stripped]',
  skipReason('<!-- snippet-lint: skip — TODO. -->') === null);
check('"skip-all" and "skip-next-block" are not a skip with a reason [mutant: separator glued to "skip"]',
  ['<!-- snippet-lint: skip-all -->', '<!-- snippet-lint: skip-next-block -->'].every((m) => skipReason(m) === null));
check('a skip marker belongs to the next block only (does not carry past a fence)',
  skipReason(block('<!-- snippet-lint: skip — two files -->\n' + fence('a();') + '\n\n' + fence('b();'), 1).nearest) === null);

// ── inline rule configuration ──
check('/* eslint <rule>: "off" */ is inline config, on its own line [mutant: inline config not detected]',
  inlineConfig('const a = 1;\n/* eslint qa-constitution/no-hard-waits: "off" */')?.line === 2);
check('/* eslint "<rule>": "off" */, the rule name double-quoted, is inline config [mutant: quoted rule name not detected]',
  inlineConfig('/* eslint "qa-constitution/no-hard-waits": "off" */\nx();') !== null);
check("/* eslint '<rule>': 'off' */, the rule name single-quoted, is inline config",
  inlineConfig("/* eslint 'qa-constitution/no-hard-waits': 'off' */\nx();") !== null);
check('/*eslint …*/ with no spaces inside the comment is inline config', inlineConfig('/*eslint qa-constitution/no-hard-waits:0*/\nx();') !== null);
check('/* eslint-env … */ is inline config [mutant: eslint-env not detected]', inlineConfig('/* eslint-env node */\nx();') !== null);
check('/* global … */ is inline config [mutant: global not detected]', inlineConfig('/* global page */\nx();') !== null);
check('eslint-disable / eslint-enable directives are not inline config [mutant: directive word not ended by a space]',
  ['/* eslint-disable */', '/* eslint-enable */', '// eslint-disable-next-line qa-constitution/no-hard-waits -- why', '/* eslint-disable qa-constitution/no-hard-waits -- why */']
    .every((c) => inlineConfig(c) === null));

// ── virtual paths ──
check('a header comment names the path (even after a ❌ line)', virtualPath('// ❌ BAD — drift\n// config/env.ts\nexport const env = 1;') === 'config/env.ts');
check('a block declaring tests is a spec', virtualPath("test('@App-API a', async () => {});").endsWith('.spec.ts'));
check('a regex .test(x) call is not a test declaration', virtualPath('const ok = /x/.test(name);').startsWith('helpers/'));
check('a block extending BasePage is a page object', virtualPath('class A extends BasePage {}').startsWith('pages/'));
check('anything else is a helper', virtualPath('export const x = 1;').startsWith('helpers/'));

// ── wrappers and line numbers ──
const shifted = await lintSnippet('private readonly x = 1;\nasync f() { await this.page.waitForTimeout(1); }');
check('a class-member fragment parses and reports on its own line numbers [mutant: line shift dropped]',
  !shifted.parse && shifted.real.some((m) => m.ruleId === 'qa-constitution/no-hard-waits' && m.line === 2), JSON.stringify(shifted.real?.map((m) => [m.ruleId, m.line])));
const obj = await lintSnippet('headers: tokens.full(),\nbaseUrl: appConfig.apiUrl,');
check('an object-property fragment parses (object wrapper)', !obj.parse, obj.parse?.message);
const stmts = await lintSnippet('const row = jobsPage.getRowByName(name);\nreturn row;');
check('statements, even with a top-level return, parse as written', !stmts.parse, stmts.parse?.message);

// ── test-body fragments: linted again inside a synthetic test() ──
const COND = 'const { status } = await f();\nif (status === 201) {\n  expect(status).toBe(201);\n}';
let res = await lintSnippet(COND);
check('an if in a test-body fragment is reported, on its own line [mutant: test-body pass removed]',
  rulesOf(res).includes('qa-constitution/no-conditional-in-test@2'), rulesOf(res));
res = await lintSnippet("import { expect } from '../fixtures/pom/test-options';\n" + COND);
check('imports are hoisted above the wrapper and lines map back [mutant: test-body lines not mapped back]',
  !res.parse && rulesOf(res).includes('qa-constitution/no-conditional-in-test@3'), rulesOf(res));
res = await lintSnippet('const { body } = await f();\ntry {\n  expect(body).toBeTruthy();\n} catch {\n  expect(1).toBe(1);\n}');
check('a try/catch in a test-body fragment is reported', rulesOf(res).includes('qa-constitution/no-try-catch-in-test@2'), rulesOf(res));
res = await lintSnippet('const jobs = new JobsPage(page);\nawait expect(jobs.heading).toBeVisible();');
check('a page object built in a test-body fragment is reported', rulesOf(res).includes('qa-constitution/no-pom-instantiation-in-test@1'), rulesOf(res));
res = await lintSnippet('const a = await f();\nexpect(a).toBe(1);');
check('a clean test-body fragment stays clean', !res.parse && res.real.length === 0, rulesOf(res));
res = await lintSnippet('const a = await f();\nexpect(a).toBe(1);\nawait page.waitForTimeout(1);');
check('a finding from the as-written pass is not reported twice: only the in-test rules come from the wrapper [mutant: every rule kept from the test-body pass]',
  rulesOf(res).join() === 'qa-constitution/no-hard-waits@3', rulesOf(res));
res = await lintSnippet('const s = await f();\n// eslint-disable-next-line qa-constitution/no-conditional-in-test -- demo of a reasoned suppression\nif (s) {\n  expect(s).toBe(1);\n}');
check('a suppressed in-test finding is kept as suppressed, so it is printed [mutant: test-body suppressions dropped]',
  res.real?.length === 0 && res.suppressed?.some((m) => m.ruleId === 'qa-constitution/no-conditional-in-test'), JSON.stringify(res.suppressed?.map((m) => m.ruleId)));
res = await lintSnippet('const s = await f();\nif (s) {\n  log(s);\n}');
check('a fragment with no expect() is a helper body: its if is not reported [mutant: test-body pass without expect()]',
  !rulesOf(res).some((r) => r.includes('no-conditional-in-test')), rulesOf(res));
res = await lintSnippet('async function check(x) {\n  if (x) {\n    expect(x).toBe(1);\n  }\n}');
check('a fragment declaring a function is a helper: its if is not reported [mutant: function declarations not excluded]',
  !rulesOf(res).some((r) => r.includes('no-conditional-in-test')), rulesOf(res));
res = await lintSnippet('const check = async (x) => {\n  if (x) {\n    expect(x).toBe(1);\n  }\n};');
check('a fragment declaring an arrow helper is a helper: its if is not reported [mutant: arrow helpers not excluded]',
  !rulesOf(res).some((r) => r.includes('no-conditional-in-test')), rulesOf(res));
res = await lintSnippet('class Poller {\n  async run(x) {\n    if (x) {\n      expect(x).toBe(1);\n    }\n  }\n}');
check('a fragment declaring a class is a helper: its if is not reported [mutant: class declarations not excluded]',
  !rulesOf(res).some((r) => r.includes('no-conditional-in-test')), rulesOf(res));
res = await lintSnippet('export const LIMIT = 3;\nif (LIMIT) {\n  expect(LIMIT).toBe(3);\n}');
check('a fragment with a top-level export is a module, not a test body [mutant: exports not excluded]',
  !rulesOf(res).some((r) => r.includes('no-conditional-in-test')), rulesOf(res));
const STEP_COND = "await test.step('THEN: the job is listed', async () => {\n  const { status } = await f();\n  if (status === 200) {\n    expect(status).toBe(200);\n  }\n});";
check('a block whose only test-like calls are test.step(...) is steps only', stepsOnly(STEP_COND));
check('a block with a hook around its steps is not steps only [mutant: hooks counted as steps]',
  !stepsOnly("test.beforeAll(async () => {\n  await test.step('seed', async () => {});\n});"));
check('a block with no step is not steps only', !stepsOnly('const a = 1;'));
res = await lintSnippet(STEP_COND);
check('an if in a step-only fragment is reported: a step is not a test, so the fragment is a test body [mutant: step-only fragments not wrapped]',
  rulesOf(res).includes('qa-constitution/no-conditional-in-test@3'), rulesOf(res));
res = await lintSnippet("test.beforeAll(async () => {\n  await test.step('GIVEN: a seeded job', async () => {\n    const { status } = await f();\n    if (status !== 201) throw new Error('seed failed');\n    expect(status).toBe(201);\n  });\n});");
check('an if in a step inside a hook fragment is setup, and is not reported [mutant: hooks counted as steps]',
  !rulesOf(res).some((r) => r.includes('no-conditional-in-test')), rulesOf(res));
res = await lintSnippet('// helpers/app/poll.ts\nconst s = await f();\nif (s) {\n  expect(s).toBe(1);\n}');
check('a fragment whose header names a non-test file is not wrapped [mutant: test-body pass on any path]',
  !rulesOf(res).some((r) => r.includes('no-conditional-in-test')), rulesOf(res));

// ── end to end: plant one defect in a throwaway skills tree ──
// Per process: the mutation sweep runs several harnesses at once, and a shared folder let one run
// overwrite another's planted defect — which showed up as false kills.
const TMP = join(PLUGIN_DIR, `.snippet-harness-${process.pid}`);
const run = (md) => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, 'demo'), { recursive: true });
  writeFileSync(join(TMP, 'demo', 'SKILL.md'), md);
  const p = spawnSync(process.execPath, [SCRIPT, TMP], { cwd: PLUGIN_DIR, encoding: 'utf8' });
  return { code: p.status, out: p.stdout + p.stderr };
};
const HARD_WAIT = 'await page.waitForTimeout(2000);';
const CLEAN = "test('@App-API creates a job', async ({ apiRequest }) => {\n  const { status } = await createJob(apiRequest, body, tokens.full());\n  expect(status).toBe(201);\n});";
let r;
r = run('### Good\n\n' + fence(HARD_WAIT));
check('BITES: a hard wait in an example presented as good fails the run', r.code === 1 && r.out.includes('no-hard-waits'), r.out);
r = run('### Bad\n\n' + fence(HARD_WAIT));
check('SILENT: the same hard wait under "### Bad" passes, and the counter-example is printed with its label [mutant: counter-examples not printed]',
  r.code === 0 && /COUNTER\s+\S+SKILL\.md:3\s+### Bad/.test(r.out), r.out);
r = run('### Bad\n\n' + fence('this is not { typescript'));
check('BITES: a counter-example that does not parse fails the run [mutant: counter-examples not parsed]', r.code === 1 && r.out.includes('PARSE'), r.out);
r = run('### Bad requests (400)\n\n' + fence(HARD_WAIT));
check('BITES: a hard wait under a status-name heading ("### Bad requests (400)") is linted', r.code === 1 && r.out.includes('no-hard-waits'), r.out);
r = run('<!-- snippet-lint: skip -->\n' + fence(HARD_WAIT));
check('BITES: a skip marker with no reason does not hide the defect', r.code === 1, r.out);
r = run('<!-- snippet-lint: skip — -->\n' + fence(HARD_WAIT));
check('BITES: a skip marker with an empty reason does not hide the defect', r.code === 1, r.out);
r = run('<!-- snippet-lint: skip — <reason> -->\n' + fence(HARD_WAIT));
check('BITES: the template skip marker copied verbatim does not hide the defect', r.code === 1 && r.out.includes('no-hard-waits'), r.out);
r = run('<!-- snippet-lint: skip — demo of a multi-file block -->\n' + fence(HARD_WAIT));
check('SILENT: a reasoned skip is honoured and printed [mutant: skip marker read from the label]', r.code === 0 && r.out.includes('SKIP') && r.out.includes('demo of a multi-file block'), r.out);
r = run('<!-- snippet-lint: skip — demo of a multi-file block -->\n' + fence('this is not { typescript'));
check('BITES: a marked block that does not parse fails the run [mutant: marked blocks not parsed]', r.code === 1 && r.out.includes('PARSE'), r.out);
r = run('<!-- snippet-lint: skip — two files -->\n' + fence('foo();') + '\n\n' + fence(HARD_WAIT));
check('BITES: a skip marker does not carry over to the next block', r.code === 1 && r.out.includes('no-hard-waits'), r.out);
r = run('Prose.\n\n' + fence('this is not { typescript'));
check('BITES: an unmarked block that does not parse fails the run', r.code === 1 && r.out.includes('PARSE'), r.out);
r = run('Prose.\n\n' + fence(CLEAN));
check('SILENT: a compliant example passes', r.code === 0, r.out);
r = run('### Good\n\n' + fence(COND));
check('BITES: an if in a test-body fragment presented as good fails the run', r.code === 1 && r.out.includes('no-conditional-in-test'), r.out);
r = run('### Good\n\n' + fence(STEP_COND));
check('BITES: an if in a step-only fragment presented as good fails the run', r.code === 1 && r.out.includes('no-conditional-in-test'), r.out);
r = run('### Good\n\n' + fence('/* eslint-disable */\n' + HARD_WAIT));
check('BITES: a bare eslint-disable does not hide a violation silently', r.code === 1 && r.out.includes('no "-- reason"'), r.out);
r = run('### Good\n\n' + fence('/* eslint qa-constitution/no-hard-waits: "off" */\n' + HARD_WAIT));
check('BITES: an inline config comment switching one rule off fails the run [mutant: inline config not reported]',
  r.code === 1 && r.out.includes('inline-config'), r.out);
r = run('### Good\n\n' + fence("/* eslint qa-constitution/single-tag-on-test: 0, qa-constitution/require-assertion-in-test: 0 */\ntest('creates a job', async ({ apiRequest }) => {\n  await createJob(apiRequest, body, tokens.full());\n});"));
check('BITES: an inline config comment switching two rules off with ": 0" fails the run', r.code === 1 && r.out.includes('inline-config'), r.out);
r = run('### Good\n\n' + fence('/* eslint "qa-constitution/no-hard-waits": "off" */\n' + HARD_WAIT));
check('BITES: an inline config comment with a quoted rule name fails the run', r.code === 1 && r.out.includes('inline-config'), r.out);
r = run('### Good\n\n' + fence('// eslint-disable-next-line qa-constitution/no-hard-waits -- demo of a reasoned suppression\n' + HARD_WAIT));
check('SILENT: a reasoned eslint-disable passes and is printed as DISABLED', r.code === 0 && r.out.includes('DISABLED') && r.out.includes('demo of a reasoned suppression'), r.out);
r = run('### Good\n\n' + fence('// eslint-disable-next-line playwright/no-force-option -- Radix trigger\nawait page.getByRole("combobox").click({ force: true });'));
check('SILENT: a directive for an eslint-plugin-playwright rule is not an error [mutant: playwright not registered]', r.code === 0, r.out);
r = run('Just prose, no code.\n');
check('BITES: a run that lints no block at all fails (a parser that finds nothing must not pass)', r.code === 1 && r.out.includes('no TypeScript block was linted'), r.out);
r = run('Prose.\n\n```ts\nnever closed();\n');
check('BITES: an unclosed fence fails the run', r.code === 1 && r.out.includes('unclosed code fence'), r.out);
rmSync(TMP, { recursive: true, force: true });

console.log('');
if (failed) {
  console.log(`  ${failed} of ${count} harness case(s) failed`);
  process.exit(1);
}
console.log(`  ${count} of ${count} harness cases pass`);
