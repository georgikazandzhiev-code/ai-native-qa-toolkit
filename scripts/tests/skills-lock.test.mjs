#!/usr/bin/env node
/**
 * Fault injection for the vendored-skill provenance check. `npm run test:lock`
 *
 * The claim skills-lock.json makes is "our copy of this third-party code is unmodified". The
 * only failure that matters is the check passing while that is false. Each case builds a
 * throwaway copy of the repo layout, breaks one thing, runs the real script, and asserts the
 * exit code — because the exit code is all CI reads.
 */

import { spawnSync } from 'node:child_process';
import {
  mkdtempSync, mkdirSync, writeFileSync, readFileSync, rmSync, cpSync, existsSync, unlinkSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SCRIPT = join('scripts', 'skills-lock.mjs');
const VENDORED_DIR = join('.claude', 'skills', 'skill-creator');

/** A temp repo carrying only what the script touches: itself, the vendored tree, the lock. */
function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'skills-lock-'));
  mkdirSync(join(dir, 'scripts'), { recursive: true });
  cpSync(join(ROOT, SCRIPT), join(dir, SCRIPT));
  cpSync(join(ROOT, VENDORED_DIR), join(dir, VENDORED_DIR), { recursive: true });
  cpSync(join(ROOT, 'skills-lock.json'), join(dir, 'skills-lock.json'));
  return dir;
}

const run = (dir) => {
  const p = spawnSync(process.execPath, [SCRIPT], { cwd: dir, encoding: 'utf8' });
  return { code: p.status, out: (p.stdout ?? '') + (p.stderr ?? '') };
};

const A_VENDORED_FILE = join(VENDORED_DIR, 'scripts', 'utils.py');
const OUR_OWN_FILE = join(VENDORED_DIR, 'SKILL.md');

const CASES = [
  {
    name: 'untouched vendored tree',
    break: () => {},
    exit: 0,
  },
  {
    name: 'a vendored file edited — must name the file',
    break: (dir) => {
      const p = join(dir, A_VENDORED_FILE);
      writeFileSync(p, readFileSync(p, 'utf8') + '\n# local tweak\n');
    },
    exit: 1,
    expect: 'utils.py',
  },
  {
    name: 'a vendored file deleted',
    break: (dir) => unlinkSync(join(dir, A_VENDORED_FILE)),
    exit: 1,
    expect: 'removed',
  },
  {
    name: 'a file added into a vendored directory',
    break: (dir) => writeFileSync(join(dir, VENDORED_DIR, 'scripts', 'extra.py'), '# ours\n'),
    exit: 1,
    expect: 'added',
  },
  {
    name: 'the whole vendored tree gone',
    break: (dir) => rmSync(join(dir, VENDORED_DIR, 'scripts'), { recursive: true, force: true }),
    exit: 1,
  },
  {
    name: 'skills-lock.json missing — provenance unrecorded is not provenance',
    break: (dir) => unlinkSync(join(dir, 'skills-lock.json')),
    exit: 1,
    expect: 'missing',
  },
  {
    name: 'lock entry removed while the script still declares it',
    break: (dir) => {
      const p = join(dir, 'skills-lock.json');
      const lock = JSON.parse(readFileSync(p, 'utf8'));
      lock.vendored = {};
      writeFileSync(p, JSON.stringify(lock, null, 2));
    },
    exit: 1,
    expect: 'no entry for',
  },
  {
    name: 'OUR OWN SKILL.md edited — must NOT fire, it is not vendored',
    break: (dir) => {
      const p = join(dir, OUR_OWN_FILE);
      writeFileSync(p, readFileSync(p, 'utf8') + '\n<!-- our own edit -->\n');
    },
    exit: 0,
  },
];

console.log('');
console.log('Vendored-skill provenance — fault injection');
console.log('');

let failed = 0;
for (const c of CASES) {
  const dir = scaffold();
  c.break(dir);
  const { code, out } = run(dir);
  rmSync(dir, { recursive: true, force: true });

  const codeOk = code === c.exit;
  const textOk = !c.expect || out.includes(c.expect);
  const ok = codeOk && textOk;
  if (!ok) failed++;
  console.log(
    `  ${ok ? 'OK  ' : 'FAIL'} ${c.name.padEnd(60)} exit ${code} (want ${c.exit})` +
      (c.expect ? `  [expects "${c.expect}"${textOk ? '' : ' — MISSING'}]` : '')
  );
  if (!ok) console.log(out.split('\n').map((l) => `         ${l}`).join('\n'));
}

// The last case is the false-positive net: a check that fires on our own files would be
// switched off inside a week. It must stay silent there, and at least half the suite must
// actually block, or the whole thing could be green on a neutered script.
const blocking = CASES.filter((c) => c.exit === 1).length;
if (blocking < 4) {
  console.log('\n  the suite must contain at least four blocking cases');
  failed++;
}

console.log('');
if (failed) {
  console.log(`  ${failed} case(s) did not behave as specified`);
  process.exit(1);
}
console.log(
  `  ${CASES.length} cases, ${blocking} blocking, and it stays silent on our own files`
);
console.log('');
