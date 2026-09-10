#!/usr/bin/env node
/**
 * Fault injection for the version stamp. `npm run test:stamp`
 *
 * The stamp is what `scripts/audit-installs.mjs` reads to answer "who is on the current
 * version". If VERSION and the stamp disagree, every install taken from that tree reports the
 * wrong number and the audit answers the question confidently and wrongly — which is worse
 * than not answering it, because a wrong answer closes the question.
 *
 * Each case builds the two files the check reads, breaks one thing, and asserts the exit code.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join('scripts', 'stamp-version.mjs');

function scaffold({ version, stamp }) {
  const dir = mkdtempSync(join(tmpdir(), 'version-stamp-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  mkdirSync(join(dir, '.claude'), { recursive: true });
  cpSync(join(ROOT, SCRIPT), join(dir, SCRIPT));

  if (version !== null) writeFileSync(join(dir, 'VERSION'), version + '\n');
  const body = [
    '# QA Automation — Global Constitution',
    '',
    ...(stamp === null ? [] : [`<!-- toolkit-version: ${stamp} -->`]),
    '',
    'Body text.',
    '',
  ].join('\n');
  writeFileSync(join(dir, '.claude', 'CLAUDE.md'), body);
  return dir;
}

const run = (dir, args = ['--check']) => {
  const p = spawnSync(process.execPath, [SCRIPT, ...args], { cwd: dir, encoding: 'utf8' });
  return { code: p.status, out: (p.stdout ?? '') + (p.stderr ?? '') };
};

const CASES = [
  { name: 'VERSION and stamp agree', version: '1.1.0', stamp: '1.1.0', exit: 0 },
  {
    name: 'VERSION bumped, stamp left behind — the audit would lie',
    version: '1.2.0',
    stamp: '1.1.0',
    exit: 1,
    expect: 'would report 1.1.0',
  },
  {
    name: 'no stamp at all — installs cannot be dated',
    version: '1.1.0',
    stamp: null,
    exit: 1,
    expect: 'no `<!-- toolkit-version',
  },
  {
    name: 'VERSION missing',
    version: null,
    stamp: '1.1.0',
    exit: 1,
    expect: 'VERSION is missing',
  },
  {
    name: 'VERSION is not semver',
    version: 'v1.1',
    stamp: '1.1.0',
    exit: 1,
    expect: 'not major.minor.patch',
  },
];

console.log('');
console.log('Version stamp — fault injection');
console.log('');

let failed = 0;
for (const c of CASES) {
  const dir = scaffold(c);
  const { code, out } = run(dir);
  rmSync(dir, { recursive: true, force: true });

  const codeOk = code === c.exit;
  const textOk = !c.expect || out.includes(c.expect);
  const ok = codeOk && textOk;
  if (!ok) failed++;
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${c.name.padEnd(56)} exit ${code} (want ${c.exit})` +
      (c.expect ? `  [${textOk ? 'msg ok' : 'MSG MISSING'}]` : '')
  );
  if (!ok) console.log(out.split('\n').map((l) => `         ${l}`).join('\n'));
}

// Writing must be idempotent: stamping twice must not add a second stamp, or the regex would
// match the stale one and the check would compare against the wrong number.
{
  const dir = scaffold({ version: '2.0.0', stamp: '1.1.0' });
  run(dir, []);
  run(dir, []);
  const md = readFileSync(join(dir, '.claude', 'CLAUDE.md'), 'utf8');
  const count = (md.match(/toolkit-version:/g) ?? []).length;
  const after = run(dir);
  rmSync(dir, { recursive: true, force: true });
  const ok = count === 1 && after.code === 0;
  if (!ok) failed++;
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${'stamping twice leaves exactly one stamp'.padEnd(56)} ` +
      `stamps ${count} (want 1), recheck exit ${after.code}`
  );
}

const blocking = CASES.filter((c) => c.exit === 1).length;
if (blocking < 3) {
  console.log('\n  the suite must contain at least three blocking cases');
  failed++;
}

console.log('');
if (failed) {
  console.log(`  ${failed} case(s) did not behave as specified`);
  process.exit(1);
}
console.log(`  ${CASES.length + 1} cases, ${blocking} blocking — a stale stamp cannot pass`);
console.log('');
