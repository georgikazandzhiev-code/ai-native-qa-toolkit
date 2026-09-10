#!/usr/bin/env node
/**
 * Version stamp. `npm run stamp` / `npm run stamp -- --check`
 *
 * `VERSION` is the canonical version of this toolkit. The problem it solves is not releasing —
 * it is knowing what a *consumer* has installed.
 *
 * The toolkit is adopted by copying `.claude/` into a team repository. Nothing in that copy
 * said which version it was, so a repo that installed in March and one that installed today
 * were indistinguishable: same skills, different gates, no way to tell which. Adoption was
 * measurable; currency was not. That is the same drift this repository checks everywhere else,
 * one level up — the toolkit measuring drift inside a repo while not measuring drift of
 * itself between installs.
 *
 * The stamp goes into `.claude/CLAUDE.md` because that is the one file every install
 * definitely takes: it is the constitution, it is always loaded, and an HTML comment in it is
 * invisible when rendered. A stamp in `package.json` or in a root `VERSION` would not travel,
 * because consumers copy `.claude/`, not the repository.
 *
 * `--check` verifies VERSION and the stamp agree and exits non-zero if they do not. A stamp
 * that disagrees with VERSION makes every install report the wrong version, which turns the
 * audit into an instrument that lies — worse than having no audit.
 *
 * Zero dependencies.
 */

import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const VERSION_FILE = join(ROOT, 'VERSION');
const CONSTITUTION = join(ROOT, '.claude', 'CLAUDE.md');

const STAMP_RE = /<!--\s*toolkit-version:\s*([0-9]+\.[0-9]+\.[0-9]+)\s*-->/;
const SEMVER_RE = /^[0-9]+\.[0-9]+\.[0-9]+$/;

export function readVersion() {
  if (!existsSync(VERSION_FILE)) return null;
  return readFileSync(VERSION_FILE, 'utf8').trim();
}

export function readStamp(md) {
  const m = md.match(STAMP_RE);
  return m ? m[1] : null;
}

/** Returns { errors } so validate.mjs can fold this into its own report. */
export function checkStamp() {
  const errors = [];
  const version = readVersion();

  if (version === null) {
    errors.push('VERSION is missing — nothing states which version of the toolkit this is');
    return { errors, version: null, stamp: null };
  }
  if (!SEMVER_RE.test(version)) {
    errors.push(`VERSION contains "${version}", which is not major.minor.patch`);
  }
  if (!existsSync(CONSTITUTION)) {
    errors.push('.claude/CLAUDE.md is missing — the version stamp has nowhere to live');
    return { errors, version, stamp: null };
  }

  const stamp = readStamp(readFileSync(CONSTITUTION, 'utf8'));
  if (stamp === null) {
    errors.push(
      '.claude/CLAUDE.md carries no `<!-- toolkit-version: x.y.z -->` stamp, so an install ' +
        'made from it cannot be dated. Run `npm run stamp`.'
    );
  } else if (stamp !== version) {
    errors.push(
      `VERSION says ${version} but the .claude/CLAUDE.md stamp says ${stamp}. Every install ` +
        `taken from this tree would report ${stamp}, so the audit would be wrong rather than ` +
        `absent. Run \`npm run stamp\`.`
    );
  }

  return { errors, version, stamp };
}

function write() {
  const version = readVersion();
  if (version === null) {
    console.error('VERSION is missing — create it first with the version to stamp');
    return 2;
  }
  if (!SEMVER_RE.test(version)) {
    console.error(`VERSION contains "${version}", which is not major.minor.patch`);
    return 2;
  }

  const md = readFileSync(CONSTITUTION, 'utf8');
  const line = `<!-- toolkit-version: ${version} -->`;
  let out;

  if (STAMP_RE.test(md)) {
    out = md.replace(STAMP_RE, line);
  } else {
    // Immediately after the H1, so it travels with the file and renders as nothing.
    const lines = md.split('\n');
    const h1 = lines.findIndex((l) => /^# /.test(l));
    const at = h1 < 0 ? 0 : h1 + 1;
    lines.splice(at, 0, '', line);
    out = lines.join('\n');
  }

  writeFileSync(CONSTITUTION, out);
  console.log('');
  console.log(`  stamped .claude/CLAUDE.md with toolkit-version ${version}`);
  console.log('');
  return 0;
}

function main(argv) {
  if (!argv.includes('--check')) return write();

  const { errors, version, stamp } = checkStamp();
  console.log('');
  console.log('Version stamp');
  console.log('');
  console.log(`  VERSION            ${version ?? '(missing)'}`);
  console.log(`  CLAUDE.md stamp    ${stamp ?? '(none)'}`);
  console.log('');
  if (errors.length) {
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log('');
    return 1;
  }
  console.log('  they agree — an install taken from this tree reports the right version');
  console.log('');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
