#!/usr/bin/env node
/**
 * Warn when a SKILL.md changed without its `version` changing. `npm run check:bump`
 *
 * Advisory, never blocking: a wording fix is a legitimate patch that someone may forget to
 * bump, and failing CI over it would train people to bump meaninglessly. What it prevents is
 * the version silently ceasing to describe the file — which is what makes eval history lie.
 *
 * Compares the commits on HEAD against a base ref (default: origin/main), as `base...HEAD`:
 * committed changes only. An edit that is not committed yet is not seen, so commit first.
 */
import { execSync } from 'node:child_process';

const base = process.argv[2] ?? 'origin/main';

// stderr is captured, not inherited: `git show` on a path the base doesn't have is the expected
// "new skill" case, and its `fatal: path … exists on disk, but not in 'base'` used to leak
// straight into the report.
const git = (cmd) => execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });

/** One entry per changed SKILL.md: the path on the base side and the path on HEAD. */
let changed;
try {
  // --diff-filter=d leaves out deleted skills: there is no version left to bump, and
  // `git show HEAD:` on a deleted path throws, which used to take the whole report with it.
  // -M pairs a renamed skill with its old path. Without it, a rename-and-edit read as a new
  // skill and was skipped, so an unbumped edit got "every changed skill bumped its version".
  // Limit: a rename git can't pair (most of the file rewritten) still reads as a new skill.
  changed = git(`git diff --name-status -M --diff-filter=d ${base}...HEAD -- ".claude/skills/*/SKILL.md"`)
    .split('\n')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((line) => {
      const [status, first, second] = line.split('\t');
      return { status, before: first, after: second ?? first };
    });
} catch {
  console.log(`  could not diff against ${base} — skipped (shallow clone or missing ref)`);
  process.exit(0);
}

if (changed.length === 0) {
  console.log('  no SKILL.md changed against ' + base);
  process.exit(0);
}

const skillName = (path) => path.split('/')[2];
const v = (s) => (/^version:\s*(\S+)$/m.exec(s) ?? [])[1] ?? null;
const stale = [];
for (const f of changed) {
  // A pure move (R100) changed no byte of the file, so there is nothing new for a version to describe.
  if (f.status === 'R100') continue;
  let before = '';
  try { before = git(`git show ${base}:${f.before}`); } catch { continue; } // new file
  const after = git(`git show HEAD:${f.after}`);
  const label = f.before === f.after ? skillName(f.after) : `${skillName(f.after)} (renamed from ${skillName(f.before)})`;
  if (v(before) && v(before) === v(after)) stale.push(`${label} still at v${v(after)}`);
}

console.log(`  ${changed.length} SKILL.md changed against ${base}`);
if (stale.length) {
  console.log('');
  console.log('  Changed without a version bump:');
  for (const s of stale) console.log(`    ~ ${s}`);
  console.log('');
  console.log('  major: a rule changes meaning or is removed — previously correct output may now be wrong');
  console.log('  minor: a rule or section is added — nothing previously correct becomes incorrect');
  console.log('  patch: wording, examples, cross-references — no rule changes');
  console.log('');
  console.log('  Advisory only. But if the rules changed, the version has to move, or the eval');
  console.log('  history stops describing the file it claims to score.');
} else {
  console.log('  every changed skill bumped its version');
}
process.exit(0);
