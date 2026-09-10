#!/usr/bin/env node
/**
 * Which repositories have this toolkit, and which version. `npm run audit -- <path>...`
 *
 *   node scripts/audit-installs.mjs ~/Projects
 *   node scripts/audit-installs.mjs ~/Projects ~/work/client-a --json
 *
 * The unit adopted the toolkit by copying `.claude/` into each repository. That made adoption
 * real and currency invisible: a repo that installed in March and one that installed today
 * hold the same skill names and different gates, and nothing distinguished them. "Most of the
 * team uses it" and "most of the team is on the current version" are different claims, and
 * only the first was ever checkable.
 *
 * What this reports, per repository:
 *
 *   version        exact, from the `<!-- toolkit-version: -->` stamp in .claude/CLAUDE.md
 *   unstamped      installed before stamping existed — reported as unstamped, never guessed
 *   missing        which expected skills are absent
 *   plugin         whether the lint plugin came along, and its version
 *   gates          how many validate checks the install carries, if it took scripts/ too
 *
 * An install with no stamp is reported as `unstamped`, not as a guessed version. A number
 * invented from a fingerprint would be indistinguishable in the output from one that was
 * actually read, and this whole file exists because an unverifiable claim is worse than an
 * absent one. The observable facts are printed instead, which is what tells you what to
 * re-install.
 *
 * Read-only: opens files, writes nothing, changes nothing. Zero dependencies.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const STAMP_RE = /<!--\s*toolkit-version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*-->/;

/** How deep to look for repositories under each given path. */
const MAX_DEPTH = 3;
/** Never walked into: large, generated, or someone else's dependencies. */
const SKIP = new Set(['node_modules', '.git', 'dist', 'build', 'coverage', 'vendor', '.venv', '__pycache__']);

const read = (p) => readFileSync(p, 'utf8');
const isDir = (p) => existsSync(p) && statSync(p).isDirectory();

/** The skills this toolkit currently ships — the yardstick an install is measured against. */
function expectedSkills() {
  const dir = join(ROOT, '.claude', 'skills');
  return isDir(dir) ? readdirSync(dir).filter((d) => isDir(join(dir, d))).sort() : [];
}

function ownVersion() {
  const p = join(ROOT, 'VERSION');
  return existsSync(p) ? read(p).trim() : null;
}

/** Every directory under `root`, to MAX_DEPTH, that looks like a repository or holds .claude/. */
function candidates(root, depth = 0, out = []) {
  if (!isDir(root) || depth > MAX_DEPTH) return out;
  // The package layout has neither .claude nor .git, so `skills/` counts as a marker too.
  if (isDir(join(root, '.claude')) || isDir(join(root, '.git')) || isDir(join(root, 'skills')))
    out.push(root);
  for (const entry of readdirSync(root)) {
    if (SKIP.has(entry)) continue;
    const p = join(root, entry);
    try {
      if (isDir(p)) candidates(p, depth + 1, out);
    } catch {
      /* unreadable directory — a permission wall is not a finding */
    }
  }
  return out;
}

/**
 * Two layouts exist in the wild and the audit has to read both.
 *
 *   project    <repo>/.claude/skills/  + <repo>/.claude/CLAUDE.md   — installed into a repo
 *   package    <repo>/skills/          + <repo>/CLAUDE.md           — the distribution bundle
 *                                                                     that install.ps1 links
 *                                                                     into ~/.claude
 *
 * Assuming only the first is why the first run of this script reported "no installs found"
 * while a 28-skill install sat one directory away, symlinked into ~/.claude. A layout the
 * audit cannot see is an install the audit silently excludes, which is the same false-clean
 * result this repository checks for everywhere else.
 */
const LAYOUTS = [
  { kind: 'project', skills: ['.claude', 'skills'], constitution: ['.claude', 'CLAUDE.md'] },
  { kind: 'package', skills: ['skills'], constitution: ['CLAUDE.md'] },
];

function inspect(repo, expected) {
  const layout = LAYOUTS.find((l) => isDir(join(repo, ...l.skills)));
  if (!layout) return null;

  const skillsDir = join(repo, ...layout.skills);
  const installed = readdirSync(skillsDir).filter((d) => isDir(join(skillsDir, d))).sort();
  // Only count it as this toolkit if it shares a meaningful part of the taxonomy. A lone
  // unrelated skill directory is somebody else's setup, not a stale install of ours.
  const shared = installed.filter((s) => expected.includes(s));
  if (shared.length < 3) return null;

  const constitution = join(repo, ...layout.constitution);
  let version = null;
  let hasConstitution = false;
  if (existsSync(constitution)) {
    hasConstitution = true;
    const m = read(constitution).match(STAMP_RE);
    version = m ? m[1] : null;
  }

  let plugin = null;
  const pluginPkg = join(repo, 'eslint-plugin-qa-constitution', 'package.json');
  if (existsSync(pluginPkg)) {
    try {
      plugin = JSON.parse(read(pluginPkg)).version ?? 'unknown';
    } catch {
      plugin = 'unparseable';
    }
  }

  let gates = null;
  const validate = join(repo, 'scripts', 'validate.mjs');
  if (existsSync(validate)) {
    const nums = [...read(validate).matchAll(/^\/\/ ── ([\d\s+]+)\./gm)].flatMap((m) =>
      (m[1].match(/\d+/g) ?? []).map(Number)
    );
    gates = nums.length ? Math.max(...nums) : 0;
  }

  return {
    repo,
    name: basename(repo),
    layout: layout.kind,
    version,
    hasConstitution,
    skills: installed.length,
    shared: shared.length,
    missing: expected.filter((s) => !installed.includes(s)),
    plugin,
    gates,
  };
}

function main(argv) {
  const asJson = argv.includes('--json');
  const roots = argv.filter((a) => !a.startsWith('--'));

  if (!roots.length) {
    console.error('usage: node scripts/audit-installs.mjs <path>... [--json]');
    console.error('  e.g. node scripts/audit-installs.mjs ~/Projects');
    return 2;
  }

  const expected = expectedSkills();
  const current = ownVersion();

  const seen = new Set();
  const found = [];
  for (const root of roots) {
    const abs = resolve(root);
    if (!isDir(abs)) {
      console.error(`  skipped: ${root} is not a directory`);
      continue;
    }
    for (const repo of candidates(abs)) {
      if (seen.has(repo)) continue;
      seen.add(repo);
      // A nested copy inside this very repository is not a separate install.
      if (resolve(repo) === resolve(ROOT)) continue;
      const info = inspect(repo, expected);
      if (info) found.push(info);
    }
  }

  found.sort((a, b) => (a.name < b.name ? -1 : 1));

  if (asJson) {
    console.log(JSON.stringify({ current, expectedSkills: expected.length, installs: found }, null, 2));
    return 0;
  }

  console.log('');
  console.log(`Toolkit installs — current version ${current ?? '(unknown)'}, ${expected.length} skills shipped`);
  console.log('');

  if (!found.length) {
    console.log('  no installs found under the given paths');
    console.log('');
    console.log('  An install is a repository with .claude/skills/ sharing at least three skill');
    console.log('  names with this toolkit. If you expected results, check the path.');
    console.log('');
    return 0;
  }

  const w = Math.max(12, ...found.map((f) => f.name.length));
  console.log(`  ${'repo'.padEnd(w)}  layout   version    skills  plugin  gates  status`);
  console.log(`  ${'-'.repeat(w)}  -------  ---------  ------  ------  -----  ------`);

  let stale = 0;
  let unstamped = 0;
  for (const f of found) {
    let status;
    if (f.version === null) {
      status = f.hasConstitution ? 'unstamped — predates versioning' : 'no CLAUDE.md';
      unstamped++;
    } else if (current && f.version !== current) {
      status = `behind (${f.version} < ${current})`;
      stale++;
    } else {
      status = 'current';
    }
    console.log(
      `  ${f.name.padEnd(w)}  ${f.layout.padEnd(7)}  ${(f.version ?? '—').padEnd(9)}  ` +
        `${String(f.skills).padStart(6)}  ${(f.plugin ?? '—').padEnd(6)}  ` +
        `${String(f.gates ?? '—').padStart(5)}  ${status}`
    );
  }

  console.log('');
  console.log(`  ${found.length} install(s): ${found.length - stale - unstamped} current, ${stale} behind, ${unstamped} unstamped`);

  const withGaps = found.filter((f) => f.missing.length);
  if (withGaps.length) {
    console.log('');
    console.log('  Missing skills — these installs would route a session to a skill that is not there:');
    for (const f of withGaps) {
      const shown = f.missing.slice(0, 6).join(', ');
      const more = f.missing.length > 6 ? `, +${f.missing.length - 6} more` : '';
      console.log(`    ${f.name}: ${shown}${more}`);
    }
  }

  console.log('');
  console.log('  Unstamped installs cannot be dated. Re-install from this tree and they will');
  console.log('  report a version from then on.');
  console.log('');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}

export { inspect, expectedSkills, candidates };
