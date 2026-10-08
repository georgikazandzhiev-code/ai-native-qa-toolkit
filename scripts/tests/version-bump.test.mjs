#!/usr/bin/env node
/**
 * Fault injection for the version-bump reminder. `npm run test:bump`
 *
 * The reminder is advisory, so it must always exit 0 and always print its verdict. CI runs it
 * with `continue-on-error`, which means a crash does not fail the build — it just deletes the
 * warning. A branch that deleted a skill did exactly that: `git show HEAD:` on the deleted
 * SKILL.md threw before a single line was printed, and the unbumped edits beside it went
 * unreported.
 *
 * Each case builds a throwaway git repository, commits three skills as the base, applies one
 * branch's worth of changes, and asserts the exit code and what the reminder says.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join(ROOT, 'scripts', 'check-version-bump.mjs');

const skill = (name, version, body = 'Body.') =>
  ['---', `name: ${name}`, 'description: Fixture skill.', `version: ${version}`, '---', '', `# ${name}`, '', body, ''].join('\n');

const BASE = {
  alpha: skill('alpha', '1.0.0'),
  beta: skill('beta', '1.0.0'),
  gamma: skill('gamma', '1.0.0'),
};

/** Write each skill, or delete it when its content is null. */
function apply(dir, skills) {
  for (const [name, content] of Object.entries(skills)) {
    const folder = join(dir, '.claude', 'skills', name);
    if (content === null) {
      rmSync(folder, { recursive: true, force: true });
      continue;
    }
    mkdirSync(folder, { recursive: true });
    writeFileSync(join(folder, 'SKILL.md'), content);
  }
}

function scaffold(after) {
  const dir = mkdtempSync(join(tmpdir(), 'version-bump-'));
  // Hermetic: the developer's global and system git config (hooks, autocrlf, default branch)
  // must not decide what the fixture repository looks like.
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
  apply(dir, BASE);
  git('add', '-A', '.claude');
  git('commit', '-q', '-m', 'base');
  git('branch', 'base');
  apply(dir, after);
  git('add', '-A', '.claude');
  git('commit', '-q', '-m', 'branch');
  return { dir, env };
}

const run = ({ dir, env }) => {
  const p = spawnSync(process.execPath, [SCRIPT, 'base'], { cwd: dir, encoding: 'utf8', env });
  return { code: p.status, out: (p.stdout ?? '') + (p.stderr ?? '') };
};

const CASES = [
  {
    name: 'a skill deleted — nothing to bump, nothing to crash on',
    after: { alpha: null },
    expect: 'no SKILL.md changed',
  },
  {
    name: 'a skill deleted beside an unbumped edit — the warning still prints',
    after: { alpha: null, beta: skill('beta', '1.0.0', 'Edited body.') },
    expect: 'beta still at v1.0.0',
  },
  {
    name: 'edited without a bump',
    after: { beta: skill('beta', '1.0.0', 'Edited body.') },
    expect: 'beta still at v1.0.0',
  },
  {
    name: 'edited with a bump',
    after: { gamma: skill('gamma', '1.0.1', 'Edited body.') },
    expect: 'every changed skill bumped its version',
  },
  {
    name: 'a new skill — no base version to compare',
    after: { delta: skill('delta', '1.0.0') },
    expect: 'every changed skill bumped its version',
  },
];

console.log('');
console.log('Version bump reminder — fault injection');
console.log('');

let failed = 0;
for (const c of CASES) {
  const repo = scaffold(c.after);
  const { code, out } = run(repo);
  rmSync(repo.dir, { recursive: true, force: true });

  // Advisory means exit 0 in every case, the warning cases included.
  const codeOk = code === 0;
  const textOk = out.includes(c.expect);
  const ok = codeOk && textOk;
  if (!ok) failed++;
  console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${c.name.padEnd(68)} exit ${code} (want 0)  [${textOk ? 'msg ok' : 'MSG MISSING'}]`);
  if (!ok) console.log(out.split('\n').map((l) => `         ${l}`).join('\n'));
}

const warning = CASES.filter((c) => c.expect.includes('still at')).length;
if (warning < 2) {
  console.log('\n  the suite must contain at least two cases where the reminder warns');
  failed++;
}

console.log('');
if (failed) {
  console.log(`  ${failed} case(s) did not behave as specified`);
  process.exit(1);
}
console.log(`  ${CASES.length} cases, ${warning} that warn — a deleted skill cannot silence the reminder`);
console.log('');
