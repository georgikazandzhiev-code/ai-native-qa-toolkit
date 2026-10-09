#!/usr/bin/env node
/**
 * Fault injection for check 15, cross-references. `npm run test:xref`
 *
 * The claim check 15 makes is "files that point at each other still agree". It can be false
 * while the check stays green in four ways, and each is covered below: a skill cites a
 * constitution section that does not exist, a skill folder exists that the index does not
 * route to, the index routes to a skill that does not exist, and a persona is listed without a
 * command file behind it; a written skill is still labelled "(TBD)"; a link points at a file
 * that does not exist; a section name runs on past its end ("§ Verificationx"); the persona line
 * is missing altogether; and a link climbs out of `.claude/`, which works here and is dead in an
 * installed `~/.claude`; a link to `~/…`, which no Markdown viewer expands; and front matter that
 * strict YAML rejects: an unquoted ": ", " #" or trailing ":", a ": " on a continuation line, a
 * plain value that continues after a "#" comment line, a plain value that starts on the line after its key, a ": " after a dotted key, a quote that
 * never closes, text after a closing quote, and an unquoted ": " in a command file (a separate
 * call site from skills). Silent cases prove the check stays quiet on a correct reference, on a TBD
 * label for a skill not yet written, on a folded-block description, on a link to a real file, and on placeholders, code and
 * URLs, because a gate that fires on correct text gets switched off.
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
const BUG_HELPER = join('.claude', 'commands', 'bug-helper.md');

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
    name: 'a section name that runs on past a word boundary',
    // "Verification" is a real heading's prefix; "Verificationx" must not match it.
    break: (dir) =>
      edit(dir, PR_REVIEW, (md) => `${md}\n- See \`~/.claude/CLAUDE.md § Verificationx\`.\n`, 'append a run-on reference'),
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
    name: 'a link points at a file that does not exist',
    // The 416-link case: a skill copied out of a product repo still linking to its code.
    break: (dir) =>
      edit(dir, PR_REVIEW, (md) => `${md}\n- See [JobsPage](../../../pages/app/JobsPage.ts).\n`, 'append a dead link'),
    exit: 1,
    expect: 'links to ../../../pages/app/JobsPage.ts, which does not exist',
  },
  {
    name: 'a link that leaves .claude/',
    // Resolves in this repository, dead in an installed ~/.claude.
    break: (dir) =>
      edit(dir, PR_REVIEW, (md) => `${md}\n- See [the README](../../../README.md).\n`, 'append a link out of .claude'),
    exit: 1,
    expect: 'outside .claude/',
  },
  {
    // 21 of these shipped while `~` targets were exempt (October 2026).
    name: 'a link to ~/ (dead in every Markdown viewer)',
    break: (dir) =>
      edit(dir, PR_REVIEW, (md) => `${md}\n- See [the constitution](~/.claude/CLAUDE.md).\n`, 'append a ~ link'),
    exit: 1,
    expect: 'Markdown does not expand ~',
  },
  {
    name: 'front matter with an unquoted ": " (invalid YAML)',
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) => md.replace(/^description: (?:>-\n(?:  .*\n)+|.*\n)/m, 'description: Pre-push review: walks every changed file. Do NOT use for bugs.\n'),
        'make the description an unquoted value containing ": "'
      ),
    exit: 1,
    expect: 'front matter is not valid YAML',
  },
  {
    name: 'front matter with an unquoted " #" (cut off as a comment)',
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) => md.replace(/^description: (?:>-\n(?:  .*\n)+|.*\n)/m, 'description: Pre-push review #1 of every changed file. Do NOT use for bugs.\n'),
        'make the description an unquoted value containing " #"'
      ),
    exit: 1,
    expect: 'has an unquoted " #"',
  },
  {
    name: 'front matter with a trailing bare ":"',
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) => md.replace(/^description: (?:>-\n(?:  .*\n)+|.*\n)/m, 'description: Pre-push review of every changed file, in this order:\n'),
        'make the description an unquoted value ending in ":"'
      ),
    exit: 1,
    expect: 'has an unquoted trailing ":"',
  },
  {
    name: 'front matter with ": " on a continuation line',
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) => md.replace(/^description: (?:>-\n(?:  .*\n)+|.*\n)/m, 'description: Pre-push review of every changed file.\n  Triggers: review my PR.\n'),
        'make the description a plain value whose second line contains ": "'
      ),
    exit: 1,
    expect: 'on a continuation line',
  },
  {
    name: 'front matter with a plain value that continues after a "#" comment line',
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) => md.replace(/^description: (?:>-\n(?:  .*\n)+|.*\n)/m, 'description: Pre-push review of every changed file.\n  # note\n  Do NOT use for bugs.\n'),
        'put a comment-only line inside a plain description, with text after it'
      ),
    exit: 1,
    expect: 'continues after a "#" comment line',
  },
  {
    name: 'front matter with a plain value that starts on the line after its key',
    // The value's first line is not a key, so it must be read as the value, not skipped as a nested mapping.
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) => md.replace(/^description: (?:>-\n(?:  .*\n)+|.*\n)/m, 'description:\n  Pre-push review of every changed file.\n  Triggers: review my PR.\n'),
        'start the description on the next line, with ": " on its second line'
      ),
    exit: 1,
    expect: 'on a continuation line',
  },
  {
    name: 'front matter with an unquoted ": " after a dotted key',
    // Keys are not limited to letters, digits, "_" and "-"; a dotted key is still checked.
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) => md.replace(/^(description: )/m, 'review.scope: every changed file: specs and page objects\n$1'),
        'add a dotted key whose value contains ": "'
      ),
    exit: 1,
    expect: '`review.scope` has an unquoted ": "',
  },
  {
    name: 'front matter with a quote that never closes',
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) => md.replace(/^description: (?:>-\n(?:  .*\n)+|.*\n)/m, 'description: "Pre-push review: walks every changed file. Do NOT use for bugs.\n'),
        'open a quote in the description and never close it'
      ),
    exit: 1,
    expect: 'opens a quote that never closes',
  },
  {
    name: 'front matter with text after the closing quote',
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) => md.replace(/^description: (?:>-\n(?:  .*\n)+|.*\n)/m, 'description: "Pre-push review" of every changed file.\n'),
        'put text after the closing quote of the description'
      ),
    exit: 1,
    expect: 'has text after its closing quote',
  },
  {
    name: 'a command file with an unquoted ": "',
    // Commands are checked by a separate call site; a skill case does not reach it.
    break: (dir) =>
      edit(
        dir,
        BUG_HELPER,
        (md) => md.replace(/^description: .*\n/m, 'description: Bug helper: turns a failure into a Jira-ready bug report.\n'),
        'make the command description an unquoted value containing ": "'
      ),
    exit: 1,
    expect: 'commands/bug-helper.md: front matter is not valid YAML',
  },
  {
    name: 'front matter as a folded block stays silent',
    // The content line starts with one word and a colon, so it fails if block content is ever read as a key.
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) => md.replace(/^description: (?:>-\n(?:  .*\n)+|.*\n)/m, 'description: >-\n  Pre-push review: walks every changed file. Do NOT use for bugs.\n  Triggers: a: b #c\n'),
        'make the description a folded block containing ": " and " #"'
      ),
    exit: 0,
  },
  {
    name: 'a link to a real file stays silent',
    break: (dir) =>
      edit(dir, PR_REVIEW, (md) => `${md}\n- See [selectors](../selectors/SKILL.md#critical).\n`, 'append a valid link'),
    exit: 0,
  },
  {
    name: 'placeholders, code and URLs stay silent',
    break: (dir) =>
      edit(
        dir,
        PR_REVIEW,
        (md) =>
          `${md}\n- [\`<sibling>\`](../<sibling>/SKILL.md), \`[text](missing.md)\`, [docs](https://playwright.dev).\n` +
          '\n```md\n[example](not-here.md)\n```\n',
        'append exempt links'
      ),
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
    name: 'the persona line is missing',
    // Without the line the persona check used to skip itself silently.
    break: (dir) =>
      edit(dir, CONSTITUTION, (md) => md.replace(/^Personas available as slash commands:.*\n/m, ''), 'remove the persona line'),
    exit: 1,
    expect: 'no "Personas available as slash commands:" line',
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
