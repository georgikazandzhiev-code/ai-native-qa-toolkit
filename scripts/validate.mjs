#!/usr/bin/env node
/**
 * Toolkit self-validation. `npm run validate`
 *
 * Zero dependencies on purpose: this must run on a fresh clone before anything is installed.
 *
 * Why this exists: skill-creator's SKILL.md claims a postToolUse hook validates every skill
 * write. That hook was never present, so nothing checked anything — and the README's skill
 * count silently drifted from 25 to 28 while the file kept saying 25. Every check below
 * exists because the thing it checks has already drifted at least once.
 *
 * Exit 0 = clean. Exit 1 = at least one ERROR. Warnings never fail the run.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS = join(ROOT, '.claude', 'skills');

const errors = [];
const warnings = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const read = (p) => readFileSync(p, 'utf8');
const dirs = (p) => (existsSync(p) ? readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory()) : []);

/** Minimal YAML front-matter reader — enough for the flat keys a SKILL.md uses. */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out = {};
  let lastKey = null;
  for (const raw of m[1].split(/\r?\n/)) {
    if (!raw.trim() || raw.trim().startsWith('#')) continue;
    const nested = /^\s+([\w-]+):\s*(.*)$/.exec(raw);
    if (nested && lastKey) {
      out[lastKey] = out[lastKey] && typeof out[lastKey] === 'object' ? out[lastKey] : {};
      out[lastKey][nested[1]] = nested[2].trim();
      continue;
    }
    const top = /^([\w-]+):\s*(.*)$/.exec(raw);
    if (top) {
      lastKey = top[1];
      out[lastKey] = top[2].trim() === '' ? {} : top[2].trim();
    }
  }
  return out;
}

// ── 1 + 2 + 3. Skills: valid SKILL.md, unique names, required sections ──────────

const REQUIRED_SECTIONS = [
  '## Critical',
  '## Anti-patterns',
  '## Self-review checklist',
  '## Examples',
  '## Troubleshooting',
  '## See Also',
];
const CANONICAL_CATEGORIES = ['authoring', 'running', 'domain', 'cross-cutting'];
const MAX_SKILL_LINES = 380; // skill-creator's split threshold

const skillDirs = dirs(SKILLS);
const seenNames = new Map();

if (skillDirs.length === 0) err('skills', `no skill directories found under ${SKILLS}`);

for (const folder of skillDirs) {
  const file = join(SKILLS, folder, 'SKILL.md');
  const where = `skills/${folder}`;

  if (!existsSync(file)) {
    err(where, 'no SKILL.md');
    continue;
  }
  const text = read(file);
  const fm = frontmatter(text);

  if (!fm) {
    err(where, 'SKILL.md has no YAML front matter');
    continue;
  }

  // name present, matches folder, and unique
  if (!fm.name) err(where, 'front matter has no `name`');
  else {
    if (fm.name !== folder) err(where, `front-matter name "${fm.name}" does not match folder "${folder}"`);
    if (seenNames.has(fm.name)) err(where, `duplicate skill name "${fm.name}" (also in ${seenNames.get(fm.name)})`);
    else seenNames.set(fm.name, folder);
    if (!/^[a-z0-9-]+$/.test(fm.name)) err(where, `name "${fm.name}" must be lowercase letters, digits and hyphens only`);
    if (/anthropic|claude/i.test(fm.name)) err(where, `name "${fm.name}" may not contain "anthropic" or "claude"`);
  }

  // description is the discoverability gate
  const desc = typeof fm.description === 'string' ? fm.description : '';
  if (!desc) err(where, 'front matter has no `description` — the skill will never be selected');
  else {
    if (desc.length > 1024) err(where, `description is ${desc.length} chars, max 1024`);
    if (desc.length < 120) warn(where, `description is only ${desc.length} chars — likely too thin to trigger reliably`);
    if (!/Do NOT use for|Not for /i.test(desc)) warn(where, 'description has no "Do NOT use for X" disclaimer — expect false-positive triggering');
  }

  // category
  const cat = fm.metadata && typeof fm.metadata === 'object' ? fm.metadata.category : undefined;
  if (!cat) err(where, 'front matter has no `metadata.category`');
  else if (!CANONICAL_CATEGORIES.includes(cat)) {
    warn(where, `category "${cat}" is not canonical (${CANONICAL_CATEGORIES.join(' | ')}) — drift, fix on next touch`);
  }

  // required sections
  const missing = REQUIRED_SECTIONS.filter((s) => !text.includes(`\n${s}`) && !text.startsWith(s));
  if (missing.length) err(where, `missing required section(s): ${missing.join(', ')}`);

  // length threshold
  const lines = text.split(/\r?\n/).length;
  if (lines > MAX_SKILL_LINES) {
    warn(where, `SKILL.md is ${lines} lines (> ${MAX_SKILL_LINES}) — split catalogs into reference.md per the boundary rule`);
  }

  // cross-references must resolve
  for (const m of text.matchAll(/\]\(\.\.\/([a-z0-9-]+)\/SKILL\.md\)/g)) {
    if (!existsSync(join(SKILLS, m[1], 'SKILL.md'))) err(where, `See Also points at a skill that does not exist: ${m[1]}`);
  }
}

// ── 4. MCP config ───────────────────────────────────────────────────────────────

const mcpPath = join(ROOT, '.cursor', 'mcp.json');
if (!existsSync(mcpPath)) {
  warn('.cursor/mcp.json', 'not present — skipped');
} else {
  const raw = read(mcpPath);
  if (raw.charCodeAt(0) === 0xfeff) err('.cursor/mcp.json', 'starts with a BOM — strict JSON parsers reject it');
  let mcp;
  try {
    mcp = JSON.parse(raw.replace(/^﻿/, ''));
  } catch (e) {
    err('.cursor/mcp.json', `invalid JSON: ${e.message}`);
  }
  if (mcp) {
    if (!mcp.mcpServers || typeof mcp.mcpServers !== 'object') {
      err('.cursor/mcp.json', 'no `mcpServers` object');
    } else {
      const names = Object.keys(mcp.mcpServers);
      if (names.length === 0) err('.cursor/mcp.json', '`mcpServers` is empty');
      for (const [name, srv] of Object.entries(mcp.mcpServers)) {
        const hasLaunch = typeof srv.command === 'string' || typeof srv.url === 'string';
        if (!hasLaunch) err('.cursor/mcp.json', `server "${name}" has neither \`command\` nor \`url\``);
        if (srv.args && !Array.isArray(srv.args)) err('.cursor/mcp.json', `server "${name}" \`args\` must be an array`);
        // a literal secret here would be committed; the env-substitution form is the safe one
        for (const [k, v] of Object.entries(srv.env ?? {})) {
          if (typeof v === 'string' && v.length > 12 && !v.includes('${env:')) {
            err('.cursor/mcp.json', `server "${name}" env ${k} looks like a literal secret — use \${env:${k}}`);
          }
        }
      }
    }
  }
}

// ── 5. Cursor rules ─────────────────────────────────────────────────────────────

const rulesDir = join(ROOT, '.cursor', 'rules');
if (!existsSync(rulesDir)) {
  warn('.cursor/rules', 'not present — skipped');
} else {
  const mdc = readdirSync(rulesDir).filter((f) => f.endsWith('.mdc'));
  if (mdc.length === 0) warn('.cursor/rules', 'no .mdc rule files');
  for (const f of mdc) {
    const text = read(join(rulesDir, f));
    const fm = frontmatter(text);
    if (!fm) {
      err(`.cursor/rules/${f}`, 'no YAML front matter');
      continue;
    }
    if (!fm.description && fm.alwaysApply !== 'true') {
      err(`.cursor/rules/${f}`, 'needs a `description` unless `alwaysApply: true`');
    }
    if (fm.globs === '' || (typeof fm.globs === 'object' && Object.keys(fm.globs).length === 0)) {
      warn(`.cursor/rules/${f}`, 'empty `globs` — the rule may never attach');
    }
  }
}

// ── 6. .cursorignore ────────────────────────────────────────────────────────────

const ignorePath = join(ROOT, '.cursorignore');
if (!existsSync(ignorePath)) {
  err('.cursorignore', 'missing — generated trees and secrets will be indexed');
} else {
  const ig = read(ignorePath);
  for (const must of ['node_modules', '.env']) {
    if (!ig.includes(must)) warn('.cursorignore', `does not exclude ${must}`);
  }
}

// ── 7. README counts vs the filesystem ──────────────────────────────────────────
// This is the check that earned the whole script: the count said 25 while 28 shipped.

const readmePath = join(ROOT, 'README.md');
if (!existsSync(readmePath)) {
  err('README.md', 'missing');
} else {
  const readme = read(readmePath);
  const actualSkills = skillDirs.length;
  let claimsFound = 0;

  for (const m of readme.matchAll(/(\d+)\s+on-demand skills/g)) {
    claimsFound++;
    if (Number(m[1]) !== actualSkills) {
      err('README.md', `claims ${m[1]} on-demand skills, filesystem has ${actualSkills}`);
    }
  }
  for (const m of readme.matchAll(/\*\*(\d+)\s+ESLint rules\*\*/g)) {
    const pluginIndex = join(ROOT, 'eslint-plugin-qa-constitution', 'lib', 'index.js');
    if (existsSync(pluginIndex)) {
      const actualRules = [...read(pluginIndex).matchAll(/^rules\['[a-z-]+'\]/gm)].length;
      if (Number(m[1]) !== actualRules) {
        err('README.md', `claims ${m[1]} ESLint rules, plugin defines ${actualRules}`);
      }
    }
  }
  if (claimsFound === 0) warn('README.md', 'states no skill count — nothing to cross-check');

  // commands, if the README enumerates them
  const cmdDir = join(ROOT, '.claude', 'commands');
  if (existsSync(cmdDir)) {
    const actualCmds = readdirSync(cmdDir).filter((f) => f.endsWith('.md')).length;
    for (const m of readme.matchAll(/(\d+)\s+(?:slash )?commands/g)) {
      if (Number(m[1]) !== actualCmds) err('README.md', `claims ${m[1]} commands, filesystem has ${actualCmds}`);
    }
  }
}

// ── 8. Claims of tooling that must actually exist ───────────────────────────────
// skill-creator asserted a validation hook for months while no such file existed.

for (const folder of skillDirs) {
  const file = join(SKILLS, folder, 'SKILL.md');
  if (!existsSync(file)) continue;
  const text = read(file);
  for (const m of text.matchAll(/\]\((\.\.\/\.\.\/[^)]+\.(?:py|sh|mjs|cjs|js))\)/g)) {
    const target = join(SKILLS, folder, m[1]);
    if (!existsSync(target)) {
      err(`skills/${folder}`, `links to a script that does not exist: ${m[1]}`);
    }
  }
}

// ── report ──────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(3, ' ');
console.log('');
console.log(`Toolkit validation — ${skillDirs.length} skills, root ${basename(ROOT)}`);
console.log('');

if (warnings.length) {
  console.log(`WARNINGS (${warnings.length}) — do not fail the run:`);
  for (const w of warnings) console.log(`  · ${w}`);
  console.log('');
}

if (errors.length) {
  console.log(`ERRORS (${errors.length}):`);
  for (const e of errors) console.log(`  ✗ ${e}`);
  console.log('');
  console.log(`${pad(errors.length)} error(s), ${pad(warnings.length)} warning(s) — FAILED`);
  process.exit(1);
}

console.log(`  0 errors, ${warnings.length} warning(s) — OK`);
process.exit(0);
