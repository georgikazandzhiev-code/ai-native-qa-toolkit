#!/usr/bin/env node
/**
 * Fault injection for check 13, constitution rule ownership. `npm run test:rules-owned`
 *
 * The claim check 13 makes is "every rule in the constitution is routed to a skill that
 * carries it". Two ways that claim can be false while the check stays green, and both are
 * covered below: a rule added to the constitution and routed nowhere, and a skill whose
 * Critical block has drifted away from the rule it owns.
 *
 * Each case copies the working tree, breaks one thing, runs the real validate.mjs, and asserts
 * the exit code. The whole tree is copied because validate.mjs reads the whole tree — a
 * hand-picked subset would test a repository shape that does not exist.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, unlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONSTITUTION = join('.claude', 'CLAUDE.md');
const TEST_STANDARDS = join('.claude', 'skills', 'test-standards', 'SKILL.md');

const SKIP = new Set(['node_modules', '.git', 'coverage', 'playwright-report', 'test-results']);

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'rule-owner-'));
  cpSync(ROOT, dir, {
    recursive: true,
    filter: (src) => !src.split(/[\\/]/).some((seg) => SKIP.has(seg)),
  });
  return dir;
}

const run = (dir) => {
  const p = spawnSync(process.execPath, [join('scripts', 'validate.mjs')], {
    cwd: dir,
    encoding: 'utf8',
  });
  return { code: p.status, out: (p.stdout ?? '') + (p.stderr ?? '') };
};

const CASES = [
  {
    name: 'untouched tree',
    break: () => {},
    exit: 0,
  },
  {
    name: 'a new MUST rule routed nowhere',
    break: (dir) => {
      const p = join(dir, CONSTITUTION);
      const md = readFileSync(p, 'utf8');
      // Insert a row into the MUST table, immediately after its header separator.
      const out = md.replace(
        /(### MUST[^\n]*\n\n\| Rule \| Requirement \|\n\|[^\n]*\|\n)/,
        '$1| **Brand New Rule** | Something nobody has routed to a skill yet |\n'
      );
      if (out === md) throw new Error('could not insert a MUST row — the table shape changed');
      writeFileSync(p, out);
    },
    exit: 1,
    expect: 'has no owner',
  },
  {
    name: 'a new WON\'T rule routed nowhere',
    break: (dir) => {
      const p = join(dir, CONSTITUTION);
      const md = readFileSync(p, 'utf8');
      const out = md.replace(
        /(### WON'T[^\n]*\n\n\| Rule \| Violation \|\n\|[^\n]*\|\n)/,
        '$1| **No Unrouted Forbidding** | A prohibition with no skill behind it |\n'
      );
      if (out === md) throw new Error("could not insert a WON'T row — the table shape changed");
      writeFileSync(p, out);
    },
    exit: 1,
    expect: 'has no owner',
  },
  {
    name: 'owning skill drifts away from its anchor',
    break: (dir) => {
      const p = join(dir, TEST_STANDARDS);
      const md = readFileSync(p, 'utf8');
      // waitForTimeout is the anchor for "No hard waits". Rename it only inside the Critical
      // block, which is exactly the drift the check exists to catch.
      const out = md.replace(/waitForTimeout/g, 'sleepForAWhile');
      if (out === md) throw new Error('anchor token not present to remove');
      writeFileSync(p, out);
    },
    exit: 1,
    expect: 'drifted apart',
  },
  {
    name: 'the constitution itself is gone',
    break: (dir) => unlinkSync(join(dir, CONSTITUTION)),
    exit: 1,
  },
];

console.log('');
console.log('Constitution rule ownership — fault injection');
console.log('');

let failed = 0;
for (const c of CASES) {
  const dir = scaffold();
  let broke = true;
  try {
    c.break(dir);
  } catch (e) {
    console.log(`  FAIL ${c.name.padEnd(48)} could not set up: ${e.message}`);
    failed++;
    broke = false;
  }
  if (broke) {
    const { code, out } = run(dir);
    const codeOk = code === c.exit;
    const textOk = !c.expect || out.includes(c.expect);
    const ok = codeOk && textOk;
    if (!ok) failed++;
    console.log(
      `  ${ok ? 'OK  ' : 'FAIL'} ${c.name.padEnd(48)} exit ${code} (want ${c.exit})` +
        (c.expect ? `  [expects "${c.expect}"${textOk ? '' : ' — MISSING'}]` : '')
    );
    if (!ok) {
      console.log(
        out
          .split('\n')
          .filter((l) => /✗|error|ERROR/.test(l))
          .slice(0, 6)
          .map((l) => `         ${l}`)
          .join('\n')
      );
    }
  }
  rmSync(dir, { recursive: true, force: true });
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
console.log(
  `  ${CASES.length} cases, ${blocking} blocking — an unrouted rule and a drifted anchor both fail the build`
);
console.log('');
