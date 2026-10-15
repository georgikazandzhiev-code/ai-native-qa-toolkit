#!/usr/bin/env node
/**
 * Check 6, `.cursorignore`, in both states. `npm run test:cursorignore`
 *
 * Cursor is not a surface of this toolkit (#72), so the file is optional: a repository that ships
 * none must pass, with a "skipped" note rather than an error, the way checks 4 and 5 treat
 * `.cursor/mcp.json` and `.cursor/rules/`, unless it ships `.cursor/`: Cursor indexes that repository,
 * so the file is required there. A repository that does ship one still has it checked:
 * an ignore file that lets `node_modules` or `.env` into the index is worth a warning.
 *
 * Each case copies the working tree, changes the one file, runs the real validate.mjs and asserts
 * the exit code and the line it prints for check 6.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync, rmSync, cpSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKIP = new Set(['node_modules', '.git', 'coverage', 'playwright-report', 'test-results']);
const FILE = '.cursorignore';

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'cursorignore-'));
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !src.split(/[\\/]/).some((seg) => SKIP.has(seg)) });
  return dir;
}

const run = (dir) => {
  const p = spawnSync(process.execPath, [join('scripts', 'validate.mjs')], { cwd: dir, encoding: 'utf8' });
  return { code: p.status, lines: ((p.stdout ?? '') + (p.stderr ?? '')).split('\n').filter((l) => l.includes(FILE)) };
};

const write = (text) => (dir) => writeFileSync(join(dir, FILE), text);

const CASES = [
  { name: 'missing, no .cursor/: skipped, not an error', change: (dir) => { rmSync(join(dir, FILE), { force: true }); rmSync(join(dir, '.cursor'), { recursive: true, force: true }); }, exit: 0, says: ['not present — skipped'] },
  { name: 'missing while .cursor/ exists: an error', change: (dir) => { rmSync(join(dir, FILE), { force: true }); mkdirSync(join(dir, '.cursor'), { recursive: true }); }, exit: 1, says: ['missing — this repository ships .cursor/'] },
  { name: 'present and complete: nothing to say', change: write('node_modules/\n.env\n.env.*\n'), exit: 0, says: [] },
  { name: 'present without .env: a warning', change: write('node_modules/\n'), exit: 0, says: ['does not exclude .env'] },
  { name: 'present without node_modules: a warning', change: write('.env\n'), exit: 0, says: ['does not exclude node_modules'] },
  { name: 'present but empty: both warnings', change: write(''), exit: 0, says: ['does not exclude node_modules', 'does not exclude .env'] },
  { name: 'a comment naming .env excludes nothing', change: write('node_modules/\n# TODO add .env\n'), exit: 0, says: ['does not exclude .env'] },
  { name: 'a re-include of .env.example excludes nothing', change: write('node_modules/\n!.env.example\n'), exit: 0, says: ['does not exclude .env'] },
  { name: 'a re-include of node_modules excludes nothing', change: write('!node_modules/x\n.env\n'), exit: 0, says: ['does not exclude node_modules'] },
  { name: 'an indented comment naming .env excludes nothing', change: write('node_modules/\n   # .env\n'), exit: 0, says: ['does not exclude .env'] },
  { name: 'anchored and globbed patterns count', change: write('/node_modules/\n**/.env\n'), exit: 0, says: [] },
];

let failed = 0;
for (const c of CASES) {
  const dir = scaffold();
  try {
    c.change(dir);
    const { code, lines } = run(dir);
    const missing = c.says.filter((s) => !lines.some((l) => l.includes(s)));
    const extra = lines.length - c.says.length;
    const ok = code === c.exit && missing.length === 0 && extra === 0;
    if (!ok) failed++;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${c.name.padEnd(42)} exit ${code} (want ${c.exit})`);
    if (!ok) for (const l of lines) console.log(`         ${l.trim()}`);
    if (!ok && missing.length) console.log(`         missing: ${missing.join('; ')}`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('');
if (failed) {
  console.log(`  ${failed} case(s) did not behave as specified`);
  process.exit(1);
}
console.log(`  ${CASES.length} cases — a missing ${FILE} is skipped unless .cursor/ exists, a present one is still checked`);
