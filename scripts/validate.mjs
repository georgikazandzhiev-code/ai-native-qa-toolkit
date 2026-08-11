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
const exempt = [];
const err = (where, msg) => errors.push(`${where}: ${msg}`);
const warn = (where, msg) => warnings.push(`${where}: ${msg}`);

const read = (p) => readFileSync(p, 'utf8');
const dirs = (p) => (existsSync(p) ? readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory()) : []);

/**
 * Minimal YAML front-matter reader — enough for the keys a SKILL.md uses.
 *
 * Handles block scalars (`>-`, `>`, `|`, `|-`). Reading `description: >-` as the literal
 * two-character value ">-" was a bug in this script: it reported a perfectly good
 * three-line description as "only 2 chars". Fixed after the first run flagged it.
 */
function frontmatter(text) {
  const m = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text);
  if (!m) return null;
  const out = {};
  const lines = m[1].split(/\r?\n/);
  let lastKey = null;

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    if (!raw.trim() || raw.trim().startsWith('#')) continue;

    const top = /^([\w-]+):\s*(.*)$/.exec(raw);
    if (top) {
      lastKey = top[1];
      const val = top[2].trim();

      // Block scalar: the value is the indented lines that follow.
      if (/^[|>][-+]?$/.test(val)) {
        const parts = [];
        while (i + 1 < lines.length && (/^\s{2,}\S/.test(lines[i + 1]) || lines[i + 1].trim() === '')) {
          parts.push(lines[++i].trim());
        }
        out[lastKey] = parts.join(' ').replace(/\s+/g, ' ').trim();
        continue;
      }
      out[lastKey] = val === '' ? {} : val;
      continue;
    }

    const nested = /^\s+([\w-]+):\s*(.*)$/.exec(raw);
    if (nested && lastKey) {
      out[lastKey] = out[lastKey] && typeof out[lastKey] === 'object' ? out[lastKey] : {};
      out[lastKey][nested[1]] = nested[2].trim();
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

  // version — required, so a regression compare has something to attribute a score to
  if (!fm.version) {
    err(where, 'front matter has no `version` — eval history cannot be attributed without one');
  } else if (!/^\d+\.\d+\.\d+$/.test(String(fm.version))) {
    err(where, `version "${fm.version}" is not major.minor.patch`);
  }

  // If a history file exists, its newest entry must name the version series the skill declares.
  //
  // major.minor only, deliberately. A patch is wording, examples and cross-references — by
  // definition it cannot change what the skill tells an agent to do, so a score recorded at
  // 1.2.0 still describes 1.2.1. Warning on that would push people to skip patch bumps to keep
  // the output quiet, which is the exact opposite of what the version exists for.
  const histFile = join(SKILLS, folder, 'evals', 'history.json');
  if (existsSync(histFile) && fm.version) {
    try {
      const h = JSON.parse(read(histFile));
      const entries = Array.isArray(h.entries) ? h.entries : [];
      const newest = entries.length ? entries[entries.length - 1].version : null;
      const series = (v) => String(v).split('.').slice(0, 2).join('.');
      if (newest && series(newest) !== series(fm.version)) {
        warn(where, `declares v${fm.version} but the newest eval history entry is v${newest} — bumped without re-measuring, or the measurement was not recorded`);
      }
    } catch (e) {
      err(where, `evals/history.json is not valid JSON: ${e.message}`);
    }
  }

  // category
  const cat = fm.metadata && typeof fm.metadata === 'object' ? fm.metadata.category : undefined;
  if (!cat) err(where, 'front matter has no `metadata.category`');
  else if (!CANONICAL_CATEGORIES.includes(cat)) {
    warn(where, `category "${cat}" is not canonical (${CANONICAL_CATEGORIES.join(' | ')}) — drift, fix on next touch`);
  }

  // Required sections. A skill may declare itself a catalog or a pointer and be held to a
  // reduced set — the template's "fill them or mark them explicitly absent" escape hatch.
  // Deliberately narrow so it cannot become a way to opt out of writing docs:
  //   · the opt-out must be declared in front matter, never inferred from size or shape
  //   · `## See Also` is still required — cross-references matter most in a pointer
  //   · every use is listed in the report, so the exemptions stay visible
  const structure = fm.metadata && typeof fm.metadata === 'object' ? fm.metadata.structure : undefined;
  const REDUCED = ['## See Also'];

  if (structure && !['catalog', 'pointer'].includes(structure)) {
    err(where, `metadata.structure "${structure}" is not recognised (catalog | pointer)`);
  }

  const applicable = structure ? REDUCED : REQUIRED_SECTIONS;
  const missing = applicable.filter((s) => !text.includes(`\n${s}`) && !text.startsWith(s));
  if (missing.length) {
    err(where, `missing required section(s): ${missing.join(', ')}${structure ? ` (structure: ${structure})` : ''}`);
  }
  if (structure) {
    if (!/^>\s|Why the full structure does not apply|structure: /m.test(text)) {
      warn(where, `declares metadata.structure "${structure}" but states no reason in the body — say why the full structure does not apply`);
    }
    exempt.push(`${folder} (${structure})`);
  }

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

// ── 7. Stated numbers vs recomputed facts, in every document ────────────────────
//
// This is the check that earned the whole script: the count said 25 while 28 shipped. It has
// since caught the same class of drift eight more times in a single day — the rule-suite count,
// the invalid-case count, how many rules fire end to end, a defect count that disagreed with its
// own table, and a coverage denominator of 28 in a repository shipping 26 skills. So it no
// longer trusts one file or one number: every fact here is recomputed from the filesystem and
// cross-checked against every document that states it.
//
// A number in prose is a claim. A number a script recomputes is a fact. Where the two can be
// connected they must be, and this is where the connection is made.

const cmdDir = join(ROOT, '.claude', 'commands');
const pluginIndex = join(ROOT, 'eslint-plugin-qa-constitution', 'lib', 'index.js');
const ruleTests = join(ROOT, 'eslint-plugin-qa-constitution', 'tests', 'rules.test.js');
const selfPath = fileURLToPath(import.meta.url);

const countIn = (path, re) => (existsSync(path) ? [...read(path).matchAll(re)].length : null);

/** The highest check number this script declares in its own section headers. */
function ownCheckCount() {
  const nums = [...read(selfPath).matchAll(/^\/\/ ── ([\d\s+]+)\./gm)].flatMap((m) =>
    (m[1].match(/\d+/g) ?? []).map(Number)
  );
  return nums.length ? Math.max(...nums) : null;
}

const FACTS = {
  skills: { value: skillDirs.length, of: 'skill directories under .claude/skills' },
  commands: {
    value: existsSync(cmdDir) ? readdirSync(cmdDir).filter((f) => f.endsWith('.md')).length : null,
    of: '.md files in .claude/commands',
  },
  lintRules: { value: countIn(pluginIndex, /^rules\['[a-z-]+'\]/gm), of: "rules['…'] in the plugin" },
  ruleSuites: { value: countIn(ruleTests, /^tester\.run\(/gm), of: 'tester.run( suites in rules.test.js' },
  invalidCases: {
    value: countIn(ruleTests, /errors:\s*(?:\[|\d)/g),
    of: 'invalid-case assertions in rules.test.js',
  },
  measured: {
    value: skillDirs.filter((d) => existsSync(join(SKILLS, d, 'evals', 'history.json'))).length,
    of: 'skills with an evals/history.json',
  },
  overLength: {
    value: skillDirs.filter((d) => {
      const f = join(SKILLS, d, 'SKILL.md');
      return existsSync(f) && read(f).split(/\r?\n/).length > MAX_SKILL_LINES;
    }).length,
    of: `skills whose SKILL.md exceeds ${MAX_SKILL_LINES} lines`,
  },
  validatorChecks: { value: ownCheckCount(), of: 'numbered check sections in this script' },
};

const WORDS = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
};
const asNumber = (token) =>
  /^\d+$/.test(token) ? Number(token) : (WORDS[token.toLowerCase()] ?? null);

/** Prose shapes that state a fact. Each must capture the number in group 1. */
const CLAIMS = [
  { fact: 'skills', re: /(\d+)\s+on-demand skills/g },
  { fact: 'lintRules', re: /\*\*(\d+)\s+ESLint rules\*\*/g },
  { fact: 'commands', re: /(\d+)\s+(?:slash )?commands\b/g },
  { fact: 'ruleSuites', re: /(\d+)\s+(?:`?RuleTester`?|plugin rule)\s+suites/g },
  { fact: 'invalidCases', re: /(\d+)\s+invalid-case assertions/g },
  { fact: 'validatorChecks', re: /\b([A-Za-z]+|\d+)\s+checks[:,]/g },
  { fact: 'overLength', re: /(\d+)\s+skills?\s+(?:are\s+|is\s+)?over the \d+-line budget/g },
];

/** "3 of 28 skills have recorded history" — both numbers, and they must agree with each other. */
const COVERAGE = /(\d+)\s+of\s+(\d+)\s+skills have recorded history/gi;

const DOCS = ['README.md', 'BENCHMARK.md', 'GOVERNANCE.md'];

if (!existsSync(join(ROOT, 'README.md'))) err('README.md', 'missing');

let skillCountStated = false;

for (const docName of DOCS) {
  const docPath = join(ROOT, docName);
  if (!existsSync(docPath)) continue;
  const text = read(docPath);

  for (const { fact, re } of CLAIMS) {
    const { value, of } = FACTS[fact];
    if (value === null) continue; // nothing to compare against — do not guess
    for (const m of text.matchAll(re)) {
      const stated = asNumber(m[1]);
      if (stated === null) {
        warn(docName, `states "${m[0].trim()}" — not a number this script can cross-check`);
        continue;
      }
      if (fact === 'skills') skillCountStated = true;
      if (stated !== value) {
        err(docName, `claims "${m[0].trim()}" but there are ${value} ${of}`);
      }
    }
  }

  for (const m of text.matchAll(COVERAGE)) {
    if (Number(m[1]) !== FACTS.measured.value) {
      err(docName, `claims ${m[1]} skills have recorded history, filesystem has ${FACTS.measured.value}`);
    }
    if (Number(m[2]) !== FACTS.skills.value) {
      err(
        docName,
        `states the coverage denominator as ${m[2]} while this repository ships ${FACTS.skills.value} skills — ` +
          `a denominator copied from the other repository`
      );
    }
  }

  // Every repo-relative link must resolve. Anchors and external URLs are skipped.
  for (const m of text.matchAll(/\]\(([^)#\s]+)(?:#[^)]*)?\)/g)) {
    const target = m[1];
    if (/^(?:https?:|mailto:)/.test(target)) continue;
    if (!existsSync(join(ROOT, target))) {
      err(docName, `links to a path that does not exist: ${target}`);
    }
  }
}

if (!skillCountStated) warn('README.md', 'states no skill count — nothing to cross-check');

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

// ── 9. Governance artifacts ─────────────────────────────────────────────────────
//
// Governance without an enforcement mechanism is advice, and a governance document nothing
// checks is the purest form of it. These are the parts of GOVERNANCE.md a script can hold to
// account: that it exists, that its rollout phases cannot advance on opinion, and that the
// review routing it describes is actually configured.

const govPath = join(ROOT, 'GOVERNANCE.md');
const ownersPath = join(ROOT, '.github', 'CODEOWNERS');
const prTemplatePath = join(ROOT, '.github', 'pull_request_template.md');

if (!existsSync(govPath)) {
  err('GOVERNANCE.md', 'missing — ownership, change classes and rollout gates are undefined');
} else {
  const gov = read(govPath);

  // A phase with no exit criterion advances on whoever is most confident that day; a phase with
  // no stop criterion cannot be rolled back once it is wrong.
  const phaseBlocks = gov.split(/^### (?=Phase )/gm).slice(1);
  if (phaseBlocks.length === 0) {
    err('GOVERNANCE.md', 'declares no "### Phase" rollout sections');
  }
  for (const block of phaseBlocks) {
    const title = block.split(/\r?\n/)[0].trim();
    if (!/^\*\*Exit:\*\*/m.test(block)) {
      err('GOVERNANCE.md', `"${title}" states no **Exit:** criterion — it would advance on opinion`);
    }
    if (!/^\*\*Stop:\*\*/m.test(block)) {
      err('GOVERNANCE.md', `"${title}" states no **Stop:** criterion — it could not be rolled back`);
    }
  }
}

if (!existsSync(ownersPath)) {
  err('.github/CODEOWNERS', 'missing — nothing routes review of a skill or a lint rule to anyone');
} else {
  const lines = read(ownersPath)
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  const MUST_ROUTE = ['/.claude/skills/', '/eslint-plugin-qa-constitution/', '/scripts/'];
  for (const path of MUST_ROUTE) {
    if (!lines.some((l) => l.startsWith(path))) {
      err('.github/CODEOWNERS', `no rule covers ${path} — changes there would need no named reviewer`);
    }
  }
  if (!lines.some((l) => /@[\w-]+/.test(l))) {
    err('.github/CODEOWNERS', 'names no owner — every rule needs an @handle or a @org/team');
  }
}

if (!existsSync(prTemplatePath)) {
  err(
    '.github/pull_request_template.md',
    'missing — GOVERNANCE.md § Change classes has no delivery mechanism without it'
  );
}

// ── 10. Session memory ──────────────────────────────────────────────────────────
//
// The constitution and an always-applied Cursor rule both route every session to this file, so a
// missing or malformed one is a broken route rather than a missing nicety. The cap is the point:
// a capture file with no drain becomes a landfill, and a landfill nobody reads is worse than no
// memory at all -- it carries the authority of "we learned this" while going unread.

const memoryPath = join(ROOT, '.claude', 'memories', 'learned_patterns.md');
const MAX_MEMORY_CASES = 12;

if (!existsSync(memoryPath)) {
  err('.claude/memories/learned_patterns.md', 'missing — the constitution and a Cursor rule both route to it');
} else {
  const mem = read(memoryPath);

  if (!/\*\*READ RULE/.test(mem)) err('memories/learned_patterns.md', 'states no READ RULE');
  if (!/\*\*WRITE RULE/.test(mem)) err('memories/learned_patterns.md', 'states no WRITE RULE');

  // Split on the case heading so each entry can be checked for its evidence label.
  const cases = mem.split(/^### .*Case #/m).slice(1);
  if (cases.length > MAX_MEMORY_CASES) {
    err(
      'memories/learned_patterns.md',
      `holds ${cases.length} cases, cap is ${MAX_MEMORY_CASES} — merge two or graduate one out ` +
        `(see its § 5) before adding another`
    );
  }
  for (const body of cases) {
    const title = body.substring(0, body.indexOf(String.fromCharCode(10))).trim();
    // An unlabelled entry is indistinguishable from a guess, which is the whole reason the
    // label exists. INFERRED is allowed; absent is not.
    if (!/\*\*Evidence:\*\*/.test(body)) {
      err('memories/learned_patterns.md', `case "${title}" carries no **Evidence:** label`);
    }
    if (!/\*\*Learned fix:\*\*/.test(body)) {
      warn('memories/learned_patterns.md', `case "${title}" records no **Learned fix:**`);
    }
  }
  if (cases.length === 0) {
    warn('memories/learned_patterns.md', 'records no cases yet — nothing has been captured');
  }
}

// ── report ──────────────────────────────────────────────────────────────────────

const pad = (n) => String(n).padStart(3, ' ');
console.log('');
console.log(`Toolkit validation — ${skillDirs.length} skills, root ${basename(ROOT)}`);
console.log('');

if (exempt.length) {
  console.log(`STRUCTURE EXEMPTIONS (${exempt.length}) — held to See Also only, by explicit declaration:`);
  for (const e of exempt) console.log(`  ~ ${e}`);
  console.log('');
}

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
