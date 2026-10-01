#!/usr/bin/env node
/**
 * Fault injection for check 15, cross-references. `npm run test:xref`
 *
 * The claim check 15 makes is "files that point at each other still agree". It can be false
 * while the check stays green in four ways, and each is covered below: a skill cites a
 * constitution section that does not exist, a skill folder exists that the index does not
 * route to, the index routes to a skill that does not exist, and a persona is listed without a
 * command file behind it; and a written skill is still labelled "(TBD)". Silent cases prove the
 * check stays quiet on a correct reference and on a TBD label for a skill not yet written,
 * because a gate that fires on correct text gets switched off.
 *
 * Each case copies the working tree, breaks one thing, runs the real validate.mjs, and asserts
 * the exit code and the message. The tree is copied whole, so the check runs against the
 * repository shape that actually exists.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const CONSTITUTION = join('.claude', 'CLAUDE.md');
const PR_REVIEW = join('.claude', 'skills', 'pr-review', 'SKILL.md');

const SKIP = new Set(['node_modules', '.git', 'coverage', 'playwright-report', 'test-results']);

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'xref-'));
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

const edit = (dir, rel, fn, what) => {
  const p = join(dir, rel);
  const before = readFileSync(p, 'utf8');
  const after = fn(before);
  if (after === before) throw new Error(`could not ${what} — the file shape changed`);
  writeFileSync(p, after);
};

const CASES = [
  {
    name: 'untouched tree',
    break: () => {},
    exit: 0,
  },
  {
    name: 'a skill cites a section the constitution lacks',
    // The exact drift that motivated the check: a section referred to by an old name.
    break: (dir) =>
      edit(dir, PR_REVIEW, (md) => `${md}\n- See \`~/.claude/CLAUDE.md § Routed Detail Index\`.\n`, 'append a stale reference'),
    exit: 1,
    expect: 'no such section or rule in the constitution',
  },
  {
    name: 'a correct section reference stays silent',
    break: (dir) =>
      edit(dir, PR_REVIEW, (md) => `${md}\n- See \`~/.claude/CLAUDE.md § Verification Standard\`.\n`, 'append a valid reference'),
    exit: 0,
  },
  {
    name: 'a written skill is still labelled TBD',
    break: (dir) =>
      edit(dir, PR_REVIEW, (md) => `${md}\n- **\`page-objects\`** *(TBD)* — POM structure.\n`, 'append a stale TBD label'),
    exit: 1,
    expect: 'marks skill "page-objects" as TBD, but it exists',
  },
  {
    name: 'a TBD label for an unwritten skill stays silent',
    break: (dir) =>
      edit(dir, PR_REVIEW, (md) => `${md}\n- **\`visual-regression\`** *(TBD)* — planned.\n`, 'append a valid TBD label'),
    exit: 0,
  },
  {
    name: 'a skill exists that the index does not route to',
    break: (dir) => {
      const d = join(dir, '.claude', 'skills', 'unrouted-skill');
      mkdirSync(d);
      // Copy a real skill so every other check passes and only routing is wrong.
      const src = readFileSync(join(dir, PR_REVIEW), 'utf8').replace(/^name: pr-review$/m, 'name: unrouted-skill');
      writeFileSync(join(d, 'SKILL.md'), src);
    },
    exit: 1,
    expect: 'is not in the Routed Skill Index',
  },
  {
    name: 'the index routes to a skill that does not exist',
    break: (dir) =>
      edit(
        dir,
        CONSTITUTION,
        (md) => md.replace(/(\| `common-tasks` \|[^\n]*\n)/, '$1| `ghost-skill` | Never written |\n'),
        'insert an index row'
      ),
    exit: 1,
    expect: 'which has no SKILL.md',
  },
  {
    name: 'a persona is listed with no command file',
    break: (dir) =>
      edit(
        dir,
        CONSTITUTION,
        (md) => md.replace(/^(Personas available as slash commands: )/m, '$1`/ghost-persona` (never written), '),
        'list a persona'
      ),
    exit: 1,
    expect: 'which has no file in .claude/commands',
  },
];

console.log('');
console.log('Cross-references — fault injection');
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
  `  ${CASES.length} cases, ${blocking} blocking — a stale reference and an index out of step with the disk both fail the build`
);
console.log('');
