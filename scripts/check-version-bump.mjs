#!/usr/bin/env node
/**
 * Warn when a SKILL.md changed without its `version` changing. `npm run check:bump`
 *
 * Advisory, never blocking: a wording fix is a legitimate patch that someone may forget to
 * bump, and failing CI over it would train people to bump meaninglessly. What it prevents is
 * the version silently ceasing to describe the file — which is what makes eval history lie.
 *
 * Compares the working tree against a base ref (default: origin/main).
 */
import { execSync } from 'node:child_process';

const base = process.argv[2] ?? 'origin/main';
let changed;
try {
  changed = execSync(`git diff --name-only ${base}...HEAD -- ".claude/skills/*/SKILL.md"`, { encoding: 'utf8' })
    .split('\n').map((s) => s.trim()).filter(Boolean);
} catch {
  console.log(`  could not diff against ${base} — skipped (shallow clone or missing ref)`);
  process.exit(0);
}

if (changed.length === 0) {
  console.log('  no SKILL.md changed against ' + base);
  process.exit(0);
}

const stale = [];
for (const f of changed) {
  let before = '';
  try { before = execSync(`git show ${base}:${f}`, { encoding: 'utf8' }); } catch { continue; } // new file
  const after = execSync(`git show HEAD:${f}`, { encoding: 'utf8' });
  const v = (s) => (/^version:\s*(\S+)$/m.exec(s) ?? [])[1] ?? null;
  if (v(before) && v(before) === v(after)) stale.push(`${f.split('/')[2]} still at v${v(after)}`);
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
