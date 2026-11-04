#!/usr/bin/env node
/**
 * Fault injection for the constitution gate. `npm run test:constitution-gate`
 *
 * The gate is a hook: it runs in someone else's session, on their machine, and nothing shows when it
 * does nothing. So this suite asserts both directions — it bites on the writes the constitution
 * forbids, and it stays out of the way of the ones it allows. A case where the gate cries wolf is as
 * much a failure as one where it misses: a hook that blocks legitimate work gets switched off.
 *
 * Each case pipes a hook payload into the real script. The adopting repository is a throwaway folder
 * inside eslint-plugin-qa-constitution/, so it resolves ESLint and the parser from the plugin's own
 * node_modules the way a real repository resolves its own: run `npm ci` there first (CI's plugin job
 * does). The exploration record goes to a throwaway state folder, never the user's ~/.claude.
 */

import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = join(ROOT, '.claude', 'hooks', 'constitution-gate.mjs');
const PLUGIN = join(ROOT, 'eslint-plugin-qa-constitution');

if (!existsSync(join(PLUGIN, 'node_modules', 'eslint'))) {
  console.error('constitution-gate test: run `npm ci` in eslint-plugin-qa-constitution/ first — the fixture repository lints with its ESLint.');
  process.exit(1);
}

const repo = mkdtempSync(join(PLUGIN, '.gate-fixture-'));
const plain = mkdtempSync(join(tmpdir(), 'gate-plain-'));
const state = mkdtempSync(join(tmpdir(), 'gate-state-'));

const put = (dir, rel, text) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};

// An adopting repository: the plugin in package.json, three of its rules on, the layout rule included.
put(repo, 'package.json', JSON.stringify({ name: 'gate-fixture', private: true, type: 'module', devDependencies: { 'eslint-plugin-qa-constitution': 'file:..' } }));
put(
  repo,
  'eslint.config.mjs',
  `import tsParser from '@typescript-eslint/parser';
import qa from '../lib/index.js';
export default [
  { ignores: ['generated/**'] },
  {
    files: ['**/*.ts'],
    languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' },
    plugins: { qa },
    rules: { 'qa/no-hard-waits': 'error', 'qa/no-xpath': 'error', 'qa/standard-layout': 'error' },
  },
];
`
);
const LEGACY = `export async function openJobs(page) {\n  await page.waitForTimeout(500);\n  return page.getByRole('heading', { name: 'Jobs' });\n}\n`;
put(repo, 'helpers/app/legacy.ts', LEGACY);
// A Windows checkout: CRLF on disk, while the agent's Edit carries LF line ends.
put(repo, 'helpers/app/windows.ts', "export async function openWorkers(page) {\r\n  return page.getByRole('heading', { name: 'Workers' });\r\n}\r\n");
put(repo, 'pages/app/JobsPage.ts', `export class JobsPage {\n  constructor(page) {\n    this.page = page;\n  }\n}\n`);

// A repository that does not use the plugin, with a Next.js-style pages/ folder.
put(plain, 'package.json', JSON.stringify({ name: 'gate-plain', private: true }));

const env = { ...process.env, QA_GATE_STATE_DIR: state };
delete env.QA_GATE_ALLOW_PROTECTED;
delete env.QA_GATE_EXPLORE_MAX_AGE_MIN;

function run(mode, payload, extraEnv = {}, args = []) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const p = spawnSync(process.execPath, [GATE, mode, ...args], { cwd: payload?.cwd ?? repo, input: raw, encoding: 'utf8', env: { ...env, ...extraEnv } });
  let out = null;
  try {
    out = p.stdout.trim() ? JSON.parse(p.stdout) : null;
  } catch {
    out = { text: p.stdout };
  }
  return { code: p.status, out, stderr: p.stderr };
}

const writeCall = (cwd, file, content) => ({ tool_name: 'Write', cwd, tool_input: { file_path: join(cwd, file), content } });
const editCall = (cwd, file, old_string, new_string) => ({ tool_name: 'Edit', cwd, tool_input: { file_path: join(cwd, file), old_string, new_string } });
const shellCall = (cwd, command, tool = 'Bash') => ({ tool_name: tool, cwd, tool_input: { command } });
const denied = (r) => r.out?.hookSpecificOutput?.permissionDecision === 'deny';
const reason = (r) => r.out?.hookSpecificOutput?.permissionDecisionReason ?? '';

const SPEC = (body) => `import { test, expect } from '../../../../fixtures/pom/test-options';\n\ntest('lists jobs', { tag: '@api' }, async ({ page }) => {\n${body}\n});\n`;

// Cases run in order: the exploration cases depend on what the shell cases before them recorded.
const CASES = [
  // ── 3. the lint plugin, at write time ──
  { name: 'write — a new spec with a hard wait is denied', mode: 'write', payload: writeCall(repo, 'tests/app/api/jobs/list.spec.ts', SPEC("  await page.waitForTimeout(1000);\n  await expect(page.getByRole('heading')).toBeVisible();")), expect: 'deny', says: 'no-hard-waits' },
  { name: 'write — the same spec without it is allowed', mode: 'write', payload: writeCall(repo, 'tests/app/api/jobs/list.spec.ts', SPEC("  await expect(page.getByRole('heading')).toBeVisible();")), expect: 'allow' },
  { name: 'write — a spec outside the standard layout is denied', mode: 'write', payload: writeCall(repo, 'tests/app/ui/list.spec.ts', SPEC("  await expect(page.getByRole('heading')).toBeVisible();")), expect: 'deny', says: 'standard-layout' },
  { name: 'write — a file the config ignores is allowed', mode: 'write', payload: writeCall(repo, 'generated/client.ts', 'export const wait = (page) => page.waitForTimeout(5);\n'), expect: 'allow' },
  { name: 'edit — an unrelated edit to a file that already breaks a rule is allowed', mode: 'write', payload: editCall(repo, 'helpers/app/legacy.ts', "name: 'Jobs'", "name: 'Scheduled jobs'"), expect: 'allow' },
  { name: 'edit — an edit that adds a second hard wait is denied', mode: 'write', payload: editCall(repo, 'helpers/app/legacy.ts', '  return page', '  await page.waitForTimeout(500);\n  return page'), expect: 'deny', says: 'no-hard-waits' },
  {
    name: 'multiedit — XPath added by the second edit is denied',
    mode: 'write',
    payload: { tool_name: 'MultiEdit', cwd: repo, tool_input: { file_path: join(repo, 'helpers/app/legacy.ts'), edits: [{ old_string: 'openJobs', new_string: 'openJobList' }, { old_string: "return page.getByRole('heading', { name: 'Jobs' })", new_string: "return page.locator('//h1')" }] } },
    expect: 'deny',
    says: 'no-xpath',
  },
  { name: 'edit — a hard wait added across lines of a CRLF file is denied', mode: 'write', payload: editCall(repo, 'helpers/app/windows.ts', "(page) {\n  return page", '(page) {\n  await page.waitForTimeout(500);\n  return page'), expect: 'deny', says: 'no-hard-waits' },
  { name: 'edit — old text that is not in the file is left to the Edit tool', mode: 'write', payload: editCall(repo, 'helpers/app/legacy.ts', 'not in the file', 'page.waitForTimeout(1)'), expect: 'allow' },
  { name: 'write — a repository without the plugin is not linted', mode: 'write', payload: writeCall(plain, 'src/wait.ts', 'export const wait = (page) => page.waitForTimeout(5);\n'), expect: 'allow' },

  // ── 1. protected paths ──
  { name: 'write — the settings file is protected', mode: 'write', payload: writeCall(repo, '.claude/settings.json', '{}\n'), expect: 'deny', says: 'protected path' },
  { name: 'write — a hook script is protected, in a repository without the plugin too', mode: 'write', payload: writeCall(plain, '.claude/hooks/constitution-gate.mjs', 'process.exit(0);\n'), expect: 'deny', says: 'protected path' },
  { name: 'write — the local settings file is protected', mode: 'write', payload: writeCall(repo, '.claude/settings.local.json', '{}\n'), expect: 'deny', says: 'protected path' },
  { name: 'write — a skill under .claude/ is not protected', mode: 'write', payload: writeCall(plain, '.claude/skills/x/SKILL.md', '# x\n'), expect: 'allow' },
  { name: 'write — QA_GATE_ALLOW_PROTECTED=1 lets the agent write settings', mode: 'write', payload: writeCall(repo, '.claude/settings.json', '{}\n'), env: { QA_GATE_ALLOW_PROTECTED: '1' }, expect: 'allow' },
  { name: 'shell — a redirect into the settings file is denied', mode: 'shell', payload: shellCall(repo, 'echo {} > .claude/settings.json'), expect: 'deny', says: 'protected path' },
  { name: 'shell — Set-Content on a hook script is denied', mode: 'shell', payload: shellCall(repo, 'Set-Content -Path "$HOME\\.claude\\hooks\\constitution-gate.mjs" -Value ""', 'PowerShell'), expect: 'deny', says: 'protected path' },
  { name: 'shell — sed -i on a hook script is denied', mode: 'shell', payload: shellCall(repo, "sed -i 's/deny/allow/' ~/.claude/hooks/constitution-gate.mjs"), expect: 'deny', says: 'protected path' },
  { name: 'shell — reading a hook script is allowed, stderr redirect and all', mode: 'shell', payload: shellCall(repo, 'grep -n deny ~/.claude/hooks/constitution-gate.mjs 2>/dev/null'), expect: 'allow' },
  { name: 'shell — an ordinary command is allowed', mode: 'shell', payload: shellCall(repo, 'npx playwright test tests/app/api --reporter=line'), expect: 'allow' },
  { name: 'shell — an agent may not record an exploration it did not run', mode: 'shell', payload: shellCall(repo, 'node ~/.claude/hooks/constitution-gate.mjs explored'), expect: 'deny', says: 'an agent may not run it' },

  // ── 2. explore before generate ──
  { name: 'write — a new page object with no exploration recorded is denied', mode: 'write', payload: writeCall(repo, 'pages/app/WorkersPage.ts', 'export class WorkersPage {}\n'), expect: 'deny', says: 'Explore Before Generate' },
  { name: 'write — a new UI spec with no exploration recorded is denied', mode: 'write', payload: writeCall(repo, 'tests/app/e2e/jobs/create-job.spec.ts', SPEC("  await expect(page.getByRole('heading')).toBeVisible();")), expect: 'deny', says: 'Explore Before Generate' },
  { name: 'edit — an existing page object needs no exploration', mode: 'write', payload: editCall(repo, 'pages/app/JobsPage.ts', 'this.page = page;', 'this.page = page; // the jobs list'), expect: 'allow' },
  { name: 'write — a new page in a repository without the plugin needs none', mode: 'write', payload: writeCall(plain, 'pages/app/index.ts', 'export default function Home() {}\n'), expect: 'allow' },
  { name: 'shell — npx playwright open is allowed, and recorded', mode: 'shell', payload: shellCall(repo, 'npx playwright open --load-storage .auth/app/appMainUserSession.json https://app.example.invalid/workers'), expect: 'allow' },
  { name: 'write — after the exploration, the new page object is allowed', mode: 'write', payload: writeCall(repo, 'pages/app/WorkersPage.ts', 'export class WorkersPage {}\n'), expect: 'allow' },
  { name: 'write — an exploration older than the limit no longer counts', mode: 'write', payload: writeCall(repo, 'pages/app/RunStatsPage.ts', 'export class RunStatsPage {}\n'), env: { QA_GATE_EXPLORE_MAX_AGE_MIN: '0.000001' }, expect: 'deny', says: 'Explore Before Generate' },
  { name: 'write — the exploration is per repository', mode: 'write', payload: writeCall(repo, 'tests/app/functional/jobs/jobs-page.spec.ts', SPEC("  await expect(page.getByRole('heading')).toBeVisible();")), state: 'fresh', expect: 'deny', says: 'Explore Before Generate' },

  // ── fails open ──
  { name: 'write — unreadable input is allowed', mode: 'write', payload: 'not json', expect: 'allow' },
  { name: 'write — a payload with no file path is allowed', mode: 'write', payload: { tool_name: 'Write', cwd: repo, tool_input: {} }, expect: 'allow' },
];

let failed = 0;
let freshState = null;
try {
  for (const c of CASES) {
    let extra = c.env ?? {};
    if (c.state === 'fresh') {
      freshState = mkdtempSync(join(tmpdir(), 'gate-state-'));
      extra = { ...extra, QA_GATE_STATE_DIR: freshState };
    }
    const r = run(c.mode, c.payload, extra);
    const got = denied(r) ? 'deny' : 'allow';
    const ok = r.code === 0 && got === c.expect && (!c.says || reason(r).includes(c.says));
    if (!ok) {
      failed++;
      console.error(`FAIL  ${c.name}\n      expected ${c.expect}${c.says ? ` naming "${c.says}"` : ''}, got ${got} (exit ${r.code})\n      ${reason(r) || r.stderr.trim() || '(no output)'}`);
    } else {
      console.log(`ok    ${c.name}`);
    }
  }

  // A person records their own exploration: the command works outside a hook, and the record counts.
  const person = spawnSync(process.execPath, [GATE, 'explored'], { cwd: join(repo, 'pages'), encoding: 'utf8', env: { ...env, QA_GATE_STATE_DIR: freshState } });
  const after = run('write', writeCall(repo, 'tests/app/functional/jobs/jobs-page.spec.ts', SPEC("  await expect(page.getByRole('heading')).toBeVisible();")), { QA_GATE_STATE_DIR: freshState });
  if (person.status !== 0 || !person.stdout.includes('Exploration recorded') || denied(after)) {
    failed++;
    console.error(`FAIL  explored — a person's record lets the new UI spec through\n      ${person.stdout}${person.stderr}${reason(after)}`);
  } else {
    console.log("ok    explored — a person's record lets the new UI spec through");
  }
} finally {
  rmSync(repo, { recursive: true, force: true });
  rmSync(plain, { recursive: true, force: true });
  rmSync(state, { recursive: true, force: true });
  if (freshState) rmSync(freshState, { recursive: true, force: true });
}

const total = CASES.length + 1;
if (failed) {
  console.error(`\n${failed} of ${total} constitution-gate cases failed.`);
  process.exit(1);
}
console.log(`\nAll ${total} constitution-gate cases pass: the gate bites on what the constitution forbids and stays out of the way of the rest.`);
