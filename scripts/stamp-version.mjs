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
 * The product-side testability constitutions travel the same way, one hop further: they are
 * copied into frontend and mobile repos as those repos' CLAUDE.md. They carry the same stamp, so
 * a product repo can tell which version of the testability rules it took, and a stale copy is
 * visible instead of silent.
 *
 * `--check` verifies VERSION and every stamp agree and exits non-zero if they do not. A stamp
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
/** Copied into product repos as their CLAUDE.md, so they carry the stamp too. Checked when present. */
const PRODUCT_CONSTITUTIONS = ['web-testability.md', 'mobile-testability.md'].map((f) =>
  join(ROOT, '.claude', 'constitutions', f)
);
const rel = (p) => p.slice(ROOT.length + 1).replace(/\\/g, '/');

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

  const products = [];
  for (const file of PRODUCT_CONSTITUTIONS) {
    if (!existsSync(file)) continue;
    const s = readStamp(readFileSync(file, 'utf8'));
    products.push({ file: rel(file), stamp: s });
    if (s === null) {
      errors.push(
        `${rel(file)} carries no \`<!-- toolkit-version: x.y.z -->\` stamp, so a product repo ` +
          `that copies it cannot tell which version of the testability rules it has. Run \`npm run stamp\`.`
      );
    } else if (s !== version) {
      errors.push(
        `VERSION says ${version} but the ${rel(file)} stamp says ${s}. Every product repo that ` +
          `copies it would report ${s}. Run \`npm run stamp\`.`
      );
    }
  }

  return { errors, version, stamp, products };
}

/** Put the stamp right after the H1, or replace the one already there. Idempotent. */
function stampText(md, line) {
  if (STAMP_RE.test(md)) return md.replace(STAMP_RE, line);
  const lines = md.split('\n');
  const h1 = lines.findIndex((l) => /^# /.test(l));
  const at = h1 < 0 ? 0 : h1 + 1;
  lines.splice(at, 0, '', line);
  return lines.join('\n');
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

  // Immediately after the H1, so it travels with the file and renders as nothing.
  const line = `<!-- toolkit-version: ${version} -->`;
  const targets = [CONSTITUTION, ...PRODUCT_CONSTITUTIONS.filter((f) => existsSync(f))];
  console.log('');
  for (const file of targets) {
    writeFileSync(file, stampText(readFileSync(file, 'utf8'), line));
    console.log(`  stamped ${rel(file)} with toolkit-version ${version}`);
  }
  console.log('');
  return 0;
}

function main(argv) {
  if (!argv.includes('--check')) return write();

  const { errors, version, stamp, products = [] } = checkStamp();
  console.log('');
  console.log('Version stamp');
  console.log('');
  console.log(`  VERSION            ${version ?? '(missing)'}`);
  console.log(`  CLAUDE.md stamp    ${stamp ?? '(none)'}`);
  for (const p of products) console.log(`  ${p.file.split('/').pop().padEnd(22)} ${p.stamp ?? '(none)'}`);
  console.log('');
  if (errors.length) {
    for (const e of errors) console.log(`  ✗ ${e}`);
    console.log('');
    return 1;
  }
  console.log('  they agree — an install or a product-repo copy taken from this tree reports the right version');
  console.log('');
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exit(main(process.argv.slice(2)));
}
