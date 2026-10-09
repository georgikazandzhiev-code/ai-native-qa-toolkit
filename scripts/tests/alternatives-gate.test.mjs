#!/usr/bin/env node
/**
 * Fault injection for the alternatives gate. `npm run test:alternatives`
 *
 * The gate is a hook: it runs in someone else's session, on their machine, and nothing shows when
 * it does nothing. A gate that silently allows everything looks exactly like a gate that works on
 * a good day, so this suite asserts both directions — it bites on the questions the rule forbids,
 * and it stays out of the way of the ones it allows. A case where the gate cries wolf is as much a
 * failure as one where it misses: a hook that blocks legitimate work gets switched off.
 *
 * Each case pipes a hook payload into the real script, inside a throwaway git repository where the
 * `alt/...` branches a case needs actually exist (the gate asks git; it doesn't trust the text).
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const GATE = join(ROOT, '.claude', 'hooks', 'alternatives-gate.mjs');

// A hermetic repository with two built alternatives: alt/pr-split/one-pr and alt/pr-split/two-prs.
const dir = mkdtempSync(join(tmpdir(), 'alternatives-gate-'));
const config = join(dir, '.gitconfig-empty');
writeFileSync(config, '');
const env = { ...process.env, GIT_CONFIG_GLOBAL: config, GIT_CONFIG_NOSYSTEM: '1' };
const git = (...args) => {
  const p = spawnSync('git', ['-c', 'user.name=fixture', '-c', 'user.email=fixture@example.invalid', ...args], {
    cwd: dir,
    encoding: 'utf8',
    env,
  });
  if (p.status !== 0) throw new Error(`fixture setup: git ${args.join(' ')} failed\n${p.stderr}`);
};
git('init', '-q');
writeFileSync(join(dir, 'README.md'), 'fixture\n');
git('add', '-A');
git('commit', '-q', '-m', 'base');
git('branch', 'alt/pr-split/one-pr');
git('branch', 'alt/pr-split/two-prs');

const question = (text, ...options) => ({
  tool_name: 'AskUserQuestion',
  cwd: dir,
  tool_input: {
    questions: [{ question: text, header: 'Choice', multiSelect: false, options: options.map(([label, description]) => ({ label, description })) }],
  },
});
const finalMessage = (text, extra = {}) => ({ hook_event_name: 'Stop', cwd: dir, stop_hook_active: false, last_assistant_message: text, ...extra });

function run(mode, payload) {
  const raw = typeof payload === 'string' ? payload : JSON.stringify(payload);
  const p = spawnSync(process.execPath, [GATE, mode], { cwd: dir, input: raw, encoding: 'utf8', env });
  let out = null;
  try {
    out = p.stdout.trim() ? JSON.parse(p.stdout) : null;
  } catch {
    out = { unparseable: p.stdout };
  }
  return { code: p.status, out, stderr: p.stderr };
}

const denied = (r) => r.out?.hookSpecificOutput?.permissionDecision === 'deny';
const blocked = (r) => r.out?.decision === 'block';

const CASES = [
  // ── ask: the question tool ──
  {
    name: 'ask — an unbuilt choice is denied',
    mode: 'ask',
    payload: question('One PR or two?', ['One PR', 'everything together'], ['Two PRs', 'split by topic']),
    expect: 'deny',
  },
  {
    name: 'ask — offering two built alternatives is allowed',
    mode: 'ask',
    payload: question('Which do you keep?', ['One PR', 'alt/pr-split/one-pr'], ['Two PRs', 'alt/pr-split/two-prs']),
    expect: 'allow',
  },
  {
    name: 'ask — naming branches that do not exist is denied',
    mode: 'ask',
    payload: question('Which do you keep?', ['A', 'alt/pr-split/one-pr'], ['B', 'alt/pr-split/never-built']),
    expect: 'deny',
    mentions: 'alt/pr-split/never-built',
  },
  {
    name: 'ask — one built branch is not a choice',
    mode: 'ask',
    payload: question('Keep it?', ['Yes', 'alt/pr-split/one-pr'], ['No', 'drop it']),
    expect: 'deny',
  },
  {
    name: 'ask — [human-only: outward] is allowed',
    mode: 'ask',
    payload: question('Push the branch and open the PR? [human-only: outward]', ['Push', 'open it now'], ['Wait', 'not yet']),
    expect: 'allow',
  },
  {
    name: 'ask — [human-only: fact] is allowed',
    mode: 'ask',
    payload: question('Which ticket key goes in the marker? [human-only: fact]', ['QA-1', ''], ['QA-2', '']),
    expect: 'allow',
  },
  {
    name: 'ask — a marker with an unknown reason is denied',
    mode: 'ask',
    payload: question('A or B? [human-only: easier]', ['A', ''], ['B', '']),
    expect: 'deny',
    mentions: 'reason',
  },
  {
    name: 'ask — one bad question in a batch denies the call',
    mode: 'ask',
    payload: {
      ...question('Which do you keep?', ['One', 'alt/pr-split/one-pr'], ['Two', 'alt/pr-split/two-prs']),
      tool_input: {
        questions: [
          question('Which do you keep?', ['One', 'alt/pr-split/one-pr'], ['Two', 'alt/pr-split/two-prs']).tool_input.questions[0],
          question('Helper or inline?', ['Helper', ''], ['Inline', '']).tool_input.questions[0],
        ],
      },
    },
    expect: 'deny',
  },
  // ── stop: the final message ──
  {
    name: 'stop — "Shall I start?" on local work is blocked',
    mode: 'stop',
    payload: finalMessage('PR 3 is merged. The next step is the lint PR.\n\nShall I start it?'),
    expect: 'block',
  },
  {
    name: 'stop — "do you want … or …" is blocked',
    mode: 'stop',
    payload: finalMessage('Do you want me to do this in one PR or two?'),
    expect: 'block',
  },
  {
    name: 'stop — a report with no question is allowed',
    mode: 'stop',
    payload: finalMessage('Pushed to `lint-pr3-followups`. All nine suites pass.'),
    expect: 'allow',
  },
  {
    name: 'stop — a question that is not a choice is allowed',
    mode: 'stop',
    payload: finalMessage('Merged as #15. Did the lead leave any comments on the issue?'),
    expect: 'allow',
  },
  {
    name: 'stop — presenting two built alternatives is allowed',
    mode: 'stop',
    payload: finalMessage('Built both: `alt/pr-split/one-pr` and `alt/pr-split/two-prs`. Which one do you keep?'),
    expect: 'allow',
  },
  {
    name: 'stop — a marked outward question is allowed',
    mode: 'stop',
    payload: finalMessage('The branch is ready. Shall I push it and open the PR? [human-only: outward]'),
    expect: 'allow',
  },
  {
    name: 'stop — after one block it lets the agent stop (no loop)',
    mode: 'stop',
    payload: finalMessage('Shall I start it?', { stop_hook_active: true }),
    expect: 'allow',
  },
  // ── fails open ──
  { name: 'ask — unreadable input fails open', mode: 'ask', payload: 'not json', expect: 'allow' },
  { name: 'stop — no message field fails open', mode: 'stop', payload: { hook_event_name: 'Stop', cwd: dir }, expect: 'allow' },
];

console.log('');
console.log('Alternatives gate — fault injection');
console.log('');

let failed = 0;
for (const c of CASES) {
  const r = run(c.mode, c.payload);
  const verdict = denied(r) ? 'deny' : blocked(r) ? 'block' : r.out === null ? 'allow' : 'other';
  const reason = r.out?.hookSpecificOutput?.permissionDecisionReason ?? r.out?.reason ?? '';
  const ok = r.code === 0 && verdict === c.expect && (!c.mentions || reason.includes(c.mentions));
  if (!ok) failed++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${c.name.padEnd(58)} ${verdict.padEnd(5)} (want ${c.expect}), exit ${r.code}`);
  if (!ok) console.log(`         stdout: ${JSON.stringify(r.out)}\n         stderr: ${r.stderr}`);
}

rmSync(dir, { recursive: true, force: true });

const bites = CASES.filter((c) => c.expect !== 'allow').length;
const silent = CASES.length - bites;
if (bites < 5 || silent < 5) {
  console.log('\n  the suite must keep at least five cases that bite and five that stay silent');
  failed++;
}

console.log('');
if (failed) {
  console.log(`  ${failed} case(s) did not behave as specified`);
  process.exit(1);
}
console.log(`  ${CASES.length} cases: ${bites} that bite, ${silent} that stay silent`);
console.log('');
