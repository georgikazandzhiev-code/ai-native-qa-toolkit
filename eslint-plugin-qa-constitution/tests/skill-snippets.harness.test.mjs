/**
 * Tests for the skill-snippet lint itself. `npm run test:snippets-harness`
 *
 * The snippet lint decides what counts as a counter-example, what is a placeholder, how a diff is
 * read and when an opt-out is honoured. Each of those is a place where it can go silently wrong in
 * both directions: skip a good example that breaks a rule (a gate that never fires), or lint a
 * counter-example that is meant to be wrong (a gate that cries wolf and gets switched off). So every
 * branch has a case here, and the whole script is run end to end against a throwaway skills tree
 * with one planted defect per case.
 *
 * Written after #59, where a new validator check shipped with a test for only one of its branches
 * and flagged valid input — the lesson is to test a check against every branch, not just against
 * the tree as it happens to be today.
 */

import { spawnSync } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from '@typescript-eslint/parser';
import {
  snippets,
  isCounterExample,
  fillPlaceholders,
  afterSideOfDiff,
  skipReason,
  virtualPath,
} from './skill-snippets.test.mjs';

const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url));
const SCRIPT = join(PLUGIN_DIR, 'tests', 'skill-snippets.test.mjs');
const fence = (body, lang = 'typescript') => '```' + lang + '\n' + body + '\n```';

let failed = 0;
const check = (name, ok, detail = '') => {
  if (!ok) failed++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${name}${ok || !detail ? '' : `\n         ${detail}`}`);
};
const block = (md) => snippets(md)[0];

console.log('\nSkill-snippet lint — harness tests\n');

// ── counter-example detection, every branch ──
check('first comment ❌/BAD → skipped', isCounterExample(block(fence('// ❌ BAD — hard wait\nawait page.waitForTimeout(1);'))));
check('first comment GOOD under an Anti-patterns heading → linted', !isCounterExample(block('## Anti-patterns\n\n' + fence('// GOOD — web-first\nawait expect(x).toBeVisible();'))));
check('"### Bad" heading → skipped', isCounterExample(block('### Bad\n\n' + fence('x();'))));
check('"### Good" heading → linted', !isCounterExample(block('### Good\n\n' + fence('x();'))));
check('Good block right after a Bad block under "### Good" → linted', !isCounterExample(snippets('### Bad\n\n' + fence('a();') + '\n\n### Good\n\n' + fence('b();'))[1]));
check('❌ bullet introducing the block → skipped', isCounterExample(block('- ❌ Never do this:\n\n' + fence('x();'))));
check('"Fix:" line introducing the block → linted', !isCounterExample(block('**Fix:**\n\n' + fence('x();'))));
check('an unlabelled block → linted', !isCounterExample(block('Some prose.\n\n' + fence('x();'))));

// ── placeholders vs generics ──
const filled = fillPlaceholders('const r = await apiRequest<CreateJobResponse>({});\nconst p: Promise<void> = f();\nimport { create<Resource>, Get<Resource>Schema } from "../<domain>/x";\nexport async function create<Resource><T = X>() {}');
check('generic type arguments are left alone', filled.includes('apiRequest<CreateJobResponse>(') && filled.includes('Promise<void>'), filled);
check('placeholders become identifiers (glued, in lists, in paths, before a generic)', filled.includes('createXResource,') && filled.includes('GetXResourceSchema') && filled.includes('/Xdomain/') && filled.includes('createXResource<T = X>'), filled);
let parses = true;
try {
  parse(filled, { ecmaVersion: 2022, sourceType: 'module' });
} catch (e) {
  parses = false;
}
check('filled placeholders parse as TypeScript (differential: the real parser decides)', parses);

// ── diffs ──
check('a diff block is linted as its "after" side', afterSideOfDiff('- const a = process.env.X;\n+ const a = env.X;') === 'const a = env.X;');
check('a block with an occasional "- " line is not a diff', afterSideOfDiff('const a = 1;\nconst b = 2;\n- not a diff marker\nconst c = 3;\nconst d = 4;').includes('- not'));

// ── explicit skip ──
check('a skip marker with a reason is honoured', skipReason('<!-- snippet-lint: skip — two files in one block -->') === 'two files in one block');
check('a skip marker without a reason is NOT honoured', skipReason('<!-- snippet-lint: skip -->') === null);

// ── virtual paths ──
check('a header comment names the path', virtualPath('// config/env.ts\nexport const env = 1;') === 'config/env.ts');
check('a block declaring tests is a spec', virtualPath("test('@App-API a', async () => {});").endsWith('.spec.ts'));
check('a block extending BasePage is a page object', virtualPath('class A extends BasePage {}').startsWith('pages/'));
check('anything else is a helper', virtualPath('export const x = 1;').startsWith('helpers/'));

// ── end to end: plant one defect in a throwaway skills tree ──
const TMP = join(PLUGIN_DIR, '.snippet-harness');
const run = (md) => {
  rmSync(TMP, { recursive: true, force: true });
  mkdirSync(join(TMP, 'demo'), { recursive: true });
  writeFileSync(join(TMP, 'demo', 'SKILL.md'), md);
  const p = spawnSync(process.execPath, [SCRIPT, TMP], { cwd: PLUGIN_DIR, encoding: 'utf8' });
  return { code: p.status, out: p.stdout + p.stderr };
};
const HARD_WAIT = 'await page.waitForTimeout(2000);';
let r = run('### Good\n\n' + fence(HARD_WAIT));
check('BITES: a hard wait in an example presented as good fails the run', r.code === 1 && r.out.includes('no-hard-waits'), r.out);
r = run('### Bad\n\n' + fence(HARD_WAIT));
check('SILENT: the same hard wait under "### Bad" passes', r.code === 0, r.out);
r = run('<!-- snippet-lint: skip -->\n' + fence(HARD_WAIT));
check('BITES: a skip marker with no reason does not hide the defect', r.code === 1, r.out);
r = run('<!-- snippet-lint: skip — demo of a multi-file block -->\n' + fence('this is not { typescript'));
check('SILENT: a reasoned skip is honoured and printed', r.code === 0 && r.out.includes('SKIP') && r.out.includes('demo of a multi-file block'), r.out);
r = run('Prose.\n\n' + fence('this is not { typescript'));
check('BITES: an unmarked block that does not parse fails the run', r.code === 1 && r.out.includes('PARSE'), r.out);
// Each fragment wrapper has a case — a mutant that broke the object wrapper once survived the suite.
// Each fragment must need its own wrapper: a plain method also parses as an object-literal method,
// so a class FIELD is used (it only parses in a class). Statements need no wrapper at all — the
// parser takes top-level `await` and `return`, which is why the function wrapper was removed.
r = run('Prose.\n\n' + fence('private readonly heading = this.page.getByRole("heading", { name: "Jobs" });'));
check('SILENT: a class-member fragment parses (class wrapper)', r.code === 0, r.out);
r = run('Prose.\n\n' + fence('const row = jobsPage.getRowByName(name);\nreturn row;'));
check('SILENT: statements, even with a top-level return, parse as written', r.code === 0, r.out);
r = run('Prose.\n\n' + fence('headers: tokens.full(),\nbaseUrl: appConfig.apiUrl,'));
check('SILENT: an object-property fragment parses (object wrapper)', r.code === 0, r.out);
r = run('Prose.\n\n' + fence("test('@App-API creates a job', async ({ apiRequest }) => {\n  const { status } = await createJob(apiRequest, body, tokens.full());\n  expect(status).toBe(201);\n});"));
check('SILENT: a compliant example passes', r.code === 0, r.out);
rmSync(TMP, { recursive: true, force: true });

console.log('');
if (failed) {
  console.log(`  ${failed} harness case(s) failed`);
  process.exit(1);
}
console.log('  every branch of the snippet lint behaves as specified');
