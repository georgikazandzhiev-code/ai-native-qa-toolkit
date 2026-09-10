#!/usr/bin/env node
/**
 * Vendored-skill provenance. `npm run skills:lock` / `--update` / `--verify-upstream`
 *
 * Parts of `.claude/skills/skill-creator/` are not original to this repository — the eval
 * harness, the grader agents and the viewer come from Anthropic's public skills repo under
 * Apache-2.0. Until this file existed, nothing recorded that. Three consequences, all real:
 *
 *   1. A local edit to vendored code was indistinguishable from upstream's own content, so
 *      the next re-vendor silently reverted it.
 *   2. Upstream could change and nobody would know which of our copies had gone stale.
 *   3. Apache-2.0 requires the licence and the attribution to travel with the copy. A public
 *      repository shipping it without either is a licence breach, and a bank's vendor review
 *      is exactly the audience that checks.
 *
 * Two verification modes, deliberately separate:
 *
 *   --verify           offline. Have OUR copies changed since the lock was written?
 *                      This is what CI gates on: no network, works on a fresh clone.
 *   --verify-upstream  online. Has UPSTREAM moved away from what we vendored?
 *                      Advisory, run on demand — a gate that needs the network is a gate
 *                      that fails when GitHub has a bad afternoon.
 *
 * Zero dependencies: node builtins only.
 */

import { createHash } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join, dirname, relative, posix } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const LOCK = join(ROOT, 'skills-lock.json');

/**
 * What is vendored, and from where.
 *
 * `paths` are repo-relative. Provenance is recorded as `filenameMatch` rather than
 * `byteVerified` where the upstream bytes have not been fetched and compared — claiming a
 * stronger provenance than was actually established is the failure this file exists to avoid.
 */
const VENDORED = {
  'skill-creator/eval-harness': {
    source: 'anthropics/skills',
    sourceType: 'github',
    upstreamPath: 'skills/skill-creator',
    license: 'Apache-2.0',
    copyright: 'Anthropic, PBC',
    provenance: 'filenameMatch',
    paths: [
      '.claude/skills/skill-creator/scripts',
      '.claude/skills/skill-creator/eval-viewer',
      '.claude/skills/skill-creator/agents',
      '.claude/skills/skill-creator/assets/eval_review.html',
    ],
    note:
      'SKILL.md, references/ and assets/SKILL-template.md are this repository\'s own work and ' +
      'are deliberately NOT tracked here — they carry the project\'s paired-rule pattern and ' +
      'boundary discipline, which upstream does not have.',
  },
};

const sha256 = (buf) => createHash('sha256').update(buf).digest('hex');

/** Every file under a path, repo-relative and POSIX-separated so hashes are OS-independent. */
function filesUnder(repoRelative) {
  const abs = join(ROOT, repoRelative);
  if (!existsSync(abs)) return [];
  if (statSync(abs).isFile()) return [repoRelative.split(/[\\/]/).join(posix.sep)];
  const out = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir).sort()) {
      const p = join(dir, entry);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(ROOT, p).split(/[\\/]/).join(posix.sep));
    }
  };
  walk(abs);
  return out.sort();
}

/**
 * Hash a vendored entry: one hash per file, plus a single tree hash over the sorted
 * `name:hash` lines. The tree hash makes the common case one comparison; the per-file map is
 * what lets a failure name the file instead of saying "something changed".
 */
function hashEntry(entry) {
  const files = {};
  for (const p of entry.paths.flatMap(filesUnder)) {
    files[p] = sha256(readFileSync(join(ROOT, p)));
  }
  const lines = Object.entries(files)
    .sort(([a], [b]) => (a < b ? -1 : 1))
    .map(([p, h]) => `${p}:${h}`)
    .join('\n');
  return { files, treeHash: sha256(Buffer.from(lines, 'utf8')), fileCount: Object.keys(files).length };
}

function build() {
  const out = { version: 1, generated: new Date().toISOString().slice(0, 10), vendored: {} };
  for (const [id, entry] of Object.entries(VENDORED)) {
    const { paths, ...meta } = entry;
    const { files, treeHash, fileCount } = hashEntry(entry);
    out.vendored[id] = { ...meta, paths, fileCount, treeHash, files };
  }
  return out;
}

/**
 * Offline verification. Returns { errors, warnings, checked } rather than printing, so
 * validate.mjs can fold the result into its own report instead of shelling out.
 */
export function verifyLock() {
  const errors = [];
  const warnings = [];
  let checked = 0;

  if (!existsSync(LOCK)) {
    errors.push(
      'skills-lock.json is missing — vendored third-party code has no recorded provenance. ' +
        'Run `npm run skills:lock -- --update`.'
    );
    return { errors, warnings, checked };
  }

  const lock = JSON.parse(readFileSync(LOCK, 'utf8'));

  // An entry declared in this script but absent from the lock means someone added vendored
  // code and never recorded it. Silence here would defeat the whole file.
  for (const id of Object.keys(VENDORED)) {
    if (!lock.vendored?.[id]) {
      errors.push(`skills-lock.json: no entry for "${id}", which scripts/skills-lock.mjs declares as vendored`);
    }
  }
  // And the reverse: a lock entry with no declaration is a stale record.
  for (const id of Object.keys(lock.vendored ?? {})) {
    if (!VENDORED[id]) {
      warnings.push(`skills-lock.json: entry "${id}" is no longer declared as vendored — prune it`);
    }
  }

  for (const [id, entry] of Object.entries(VENDORED)) {
    const recorded = lock.vendored?.[id];
    if (!recorded) continue;
    checked++;

    const { files, treeHash, fileCount } = hashEntry(entry);

    if (fileCount === 0) {
      errors.push(`${id}: no files found under the declared paths — the vendored copy is gone`);
      continue;
    }
    if (treeHash === recorded.treeHash) continue;

    // Name what moved. "Something changed" sends people to `git diff` and a bad afternoon.
    const added = Object.keys(files).filter((p) => !(p in (recorded.files ?? {})));
    const removed = Object.keys(recorded.files ?? {}).filter((p) => !(p in files));
    const changed = Object.keys(files).filter(
      (p) => p in (recorded.files ?? {}) && files[p] !== recorded.files[p]
    );

    const detail = [
      changed.length ? `changed: ${changed.join(', ')}` : null,
      added.length ? `added: ${added.join(', ')}` : null,
      removed.length ? `removed: ${removed.join(', ')}` : null,
    ]
      .filter(Boolean)
      .join(' | ');

    errors.push(
      `${id}: vendored ${entry.license} code from ${entry.source} has been modified locally — ${detail}. ` +
        'Either revert it, or run `npm run skills:lock -- --update` and say in the entry note what was changed and why.'
    );
  }

  return { errors, warnings, checked };
}

/** Online check: has upstream moved? Advisory by design — never gates CI. */
async function verifyUpstream() {
  let stale = 0;
  for (const [id, entry] of Object.entries(VENDORED)) {
    if (entry.sourceType !== 'github') {
      console.log(`  ?  ${id}: sourceType "${entry.sourceType}" — no upstream fetch implemented`);
      continue;
    }
    const api = `https://api.github.com/repos/${entry.source}/commits?path=${encodeURIComponent(entry.upstreamPath)}&per_page=1`;
    try {
      const res = await fetch(api, { headers: { accept: 'application/vnd.github+json' } });
      if (!res.ok) {
        console.log(`  ?  ${id}: upstream returned HTTP ${res.status} — cannot compare`);
        continue;
      }
      const [head] = await res.json();
      const when = head?.commit?.author?.date?.slice(0, 10) ?? 'unknown';
      const lock = existsSync(LOCK) ? JSON.parse(readFileSync(LOCK, 'utf8')) : {};
      const vendoredOn = lock.vendored?.[id]?.upstreamSeen ?? lock.generated ?? 'unknown';
      const moved = when > vendoredOn;
      if (moved) stale++;
      console.log(
        `  ${moved ? '!' : 'OK'}  ${id}: upstream last touched ${when}, we recorded ${vendoredOn}` +
          (moved ? '  <- upstream has moved' : '')
      );
    } catch (e) {
      console.log(`  ?  ${id}: ${e.message}`);
    }
  }
  console.log('');
  console.log(
    stale
      ? `  ${stale} entr(ies) may be stale. Re-vendor deliberately, then --update.`
      : '  nothing appears stale'
  );
  return 0; // advisory: never fails the caller
}

async function main(argv) {
  if (argv.includes('--update')) {
    writeFileSync(LOCK, JSON.stringify(build(), null, 2) + '\n');
    const lock = JSON.parse(readFileSync(LOCK, 'utf8'));
    console.log('');
    console.log('Vendored skills — lock updated');
    console.log('');
    for (const [id, e] of Object.entries(lock.vendored)) {
      console.log(`  ${id}`);
      console.log(`    ${e.fileCount} file(s), ${e.license}, ${e.source}`);
      console.log(`    tree ${e.treeHash.slice(0, 16)}…`);
    }
    console.log('');
    console.log(`  written: ${relative(ROOT, LOCK)}`);
    console.log('');
    return 0;
  }

  if (argv.includes('--verify-upstream')) {
    console.log('');
    console.log('Vendored skills — upstream drift (advisory)');
    console.log('');
    return verifyUpstream();
  }

  const { errors, warnings, checked } = verifyLock();
  console.log('');
  console.log('Vendored skills — provenance');
  console.log('');
  console.log(`  ${checked} entr(ies) verified against skills-lock.json`);
  console.log('');
  for (const w of warnings) console.log(`  · ${w}`);
  if (warnings.length) console.log('');
  if (errors.length) {
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log('');
    return 1;
  }
  console.log('  every vendored file matches its recorded hash — OK');
  console.log('');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).then((c) => process.exit(c));
}

export { VENDORED, build, hashEntry };
