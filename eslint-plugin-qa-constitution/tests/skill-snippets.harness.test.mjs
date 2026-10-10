/**
 * Tests for the skill-snippet lint itself. `npm run test:snippets-harness`
 *
 * The snippet lint decides what counts as a counter-example, what is a placeholder, where a fence
 * starts and ends, how a diff is read and when an opt-out is honoured. Each of those can go wrong
 * in both directions: skip a good example that breaks a rule (a gate that never fires), or lint a
 * counter-example that is meant to be wrong (a gate that cries wolf and gets switched off). So
 * every branch has a case here, and the whole script is run end to end against throwaway skills
 * trees with one planted defect each.
 *
 * Written after #59, where a new check shipped with a test for one of its branches and flagged
 * valid input; and revised after this suite's own first version claimed a case per branch while an
 * independent review found 14 of 20 mutants surviving it. The cases marked [mutant] were added
 * because a specific mutation of the lint had survived; each names what it now catches.
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
const { snippets, isCounterExample, fillPlaceholders, afterSideOfDiff, skipReason, virtualPath, lintSnippet } = await import(
  pathToFileURL(SCRIPT).href
);
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

console.log('\nSkill-snippet lint — harness tests\n');

// ── fences ──
check('CRLF files: the block is found and carries no \\r [mutant: split on \\n only]', block('### Good\r\n\r\n```ts\r\nx();\r\n```\r\n')?.code === 'x();');
check('a fence indented inside a list item is dedented', block('1. Step\n   ```ts\n   const a = 1;\n   ```\n')?.code === 'const a = 1;');
check('an info string after the language is accepted (```ts title="a.ts")', snippets('```ts title="a.ts"\nx();\n```\n').length === 1);
check('tilde fences are accepted', snippets('~~~ts\nx();\n~~~\n').length === 1);
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

// ── counter-example detection ──
check('first comment ❌/BAD → skipped', isBad(fence('// ❌ BAD — hard wait\nawait page.waitForTimeout(1);')));
check('first comment GOOD wins over a BAD word on the same line [mutant: RIGHT/WRONG order, RIGHT removed]', isGood('### Bad\n\n' + fence('// GOOD — replaces the BAD version above\nx();')));
check('"### Bad" directly above → skipped', isBad('### Bad\n\n' + fence('x();')));
check('"### Bad", then explanatory prose, then the block → still skipped (no block in between)', isBad('### Bad\n\nThis hides the cause.\n\n' + fence('x();')));
check('"### Good" → linted', isGood('### Good\n\n' + fence('x();')));
check('a ❌ bullet introducing the block → skipped', isBad('- ❌ Never do this:\n\n' + fence('x();')));
check('"Fix (replaces the BAD call above):" introducing the block → linted [mutant: RIGHT removed from prose check]', isGood('### Bad\n\n' + fence('a();') + '\n\nFix (replaces the BAD call above):\n\n' + fence('b();'), 1));
check('Bad block, neutral prose, next block → the next block is linted (label does not carry over) [mutant: fence crossing ignored]', isGood('### Bad\n\n' + fence('a();') + '\n\nThe web-first way:\n\n' + fence('b();'), 1));
check('under "### Good", a block introduced by "never do THIS (BAD):" → skipped [mutant: nearest BAD ignored]',
  isBad('### Good\n\n' + fence('a();') + '\n\nBut never do THIS (BAD):\n\n' + fence('b();'), 1));
check('Bad block directly followed by another block → both skipped', isBad('### Bad\n\n' + fence('a();') + '\n\n' + fence('b();'), 1));
check('"## Bad request (400) tests" is not a counter-example label', isGood('## Bad request (400) tests\n\n' + fence('x();')));
check('"### Forbidden (403)" is not a counter-example label', isGood('### Forbidden (403)\n\n' + fence('x();')));
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
check('skip marker with an empty or punctuation-only reason → NOT honoured', [
  '<!-- snippet-lint: skip — -->',
  '<!-- snippet-lint: skip -- - -->',
  '<!-- snippet-lint: skip —   … -->',
].every((m) => skipReason(m) === null));
check('a skip marker belongs to the next block only (does not carry past a fence)',
  skipReason(block('<!-- snippet-lint: skip — two files -->\n' + fence('a();') + '\n\n' + fence('b();'), 1).nearest) === null);

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
check('SILENT: the same hard wait under "### Bad" passes', r.code === 0, r.out);
r = run('<!-- snippet-lint: skip -->\n' + fence(HARD_WAIT));
check('BITES: a skip marker with no reason does not hide the defect', r.code === 1, r.out);
r = run('<!-- snippet-lint: skip — -->\n' + fence(HARD_WAIT));
check('BITES: a skip marker with an empty reason does not hide the defect', r.code === 1, r.out);
r = run('<!-- snippet-lint: skip — demo of a multi-file block -->\n' + fence('this is not { typescript'));
check('SILENT: a reasoned skip is honoured and printed', r.code === 0 && r.out.includes('SKIP') && r.out.includes('demo of a multi-file block'), r.out);
r = run('<!-- snippet-lint: skip — two files -->\n' + fence('foo bar') + '\n\n' + fence(HARD_WAIT));
check('BITES: a skip marker does not carry over to the next block', r.code === 1 && r.out.includes('no-hard-waits'), r.out);
r = run('Prose.\n\n' + fence('this is not { typescript'));
check('BITES: an unmarked block that does not parse fails the run', r.code === 1 && r.out.includes('PARSE'), r.out);
r = run('Prose.\n\n' + fence(CLEAN));
check('SILENT: a compliant example passes', r.code === 0, r.out);
r = run('### Good\n\n' + fence('/* eslint-disable */\n' + HARD_WAIT));
check('BITES: a bare eslint-disable does not hide a violation silently', r.code === 1 && r.out.includes('no "-- reason"'), r.out);
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
console.log(`  ${count} cases — every branch of the snippet lint behaves as specified`);
