#!/usr/bin/env node
/**
 * Fault injection for check 16, product leftovers. `npm run test:leftovers`
 *
 * The claim check 16 makes is "nothing from the product the skills were extracted from, and no
 * Cursor-only path, is back in what adopters install or read". It can be false in two ways while
 * staying green: a banned name gets in somewhere the check doesn't look, or the check fires on
 * ordinary QA writing and gets switched off. Both are covered: a banned token in each scanned place
 * and file type must fail the run and name the token, and the QA phrases a pattern-based check would
 * trip on, the README's documentation of the validator's own Cursor checks, and recorded
 * measurements must not. The vocabulary file itself is guarded too: a missing, empty or malformed
 * list must fail rather than quietly ban nothing.
 *
 * The vocabulary holds only SHA-256 digests, so this test never names the product: each case bans an
 * invented token (`zz…`) by adding its digest to the scaffold's vocabulary, then plants it. The
 * silent cases run against the real digests, so ordinary QA wording is checked against the real list.
 *
 * Each case copies the working tree, changes one thing, runs the real validate.mjs and asserts the
 * exit code and, where it bites, the message — the same harness as rule-ownership.test.mjs.
 */

import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, appendFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = join('.claude', 'skills', 'test-standards', 'SKILL.md');
const VOCAB = join('scripts', 'product-vocabulary.json');
const EVALS = join('.claude', 'skills', 'api-testing', 'evals');
const SKIP = new Set(['node_modules', '.git', 'coverage', 'playwright-report', 'test-results']);

function scaffold() {
  const dir = mkdtempSync(join(tmpdir(), 'leftovers-'));
  cpSync(ROOT, dir, { recursive: true, filter: (src) => !src.split(/[\\/]/).some((seg) => SKIP.has(seg)) });
  return dir;
}

const run = (dir) => {
  const p = spawnSync(process.execPath, [join('scripts', 'validate.mjs')], { cwd: dir, encoding: 'utf8' });
  return { code: p.status, out: (p.stdout ?? '') + (p.stderr ?? '') };
};

const sha = (t) => createHash('sha256').update(t).digest('hex');
const all = (...steps) => (dir) => steps.forEach((s) => s(dir));
/** Rewrite the scaffold's vocabulary file. */
const vocabulary = (edit) => (dir) => {
  const p = join(dir, VOCAB);
  const data = JSON.parse(readFileSync(p, 'utf8'));
  edit(data);
  writeFileSync(p, JSON.stringify(data, null, 2));
};
/** Ban invented tokens of one kind by adding their digests. */
const ban = (kind, ...tokens) => vocabulary((d) => d.sha256[kind].push(...tokens.map(sha)));
/** Append one line of prose to a file in the scaffold. */
const plant = (rel, line) => (dir) => appendFileSync(join(dir, rel), `\n${line}\n`);
/** Create a new file in the scaffold. */
const create = (rel, text) => (dir) => {
  mkdirSync(dirname(join(dir, rel)), { recursive: true });
  writeFileSync(join(dir, rel), text);
};
/** Replace text in a JSON file in the scaffold, keeping it valid JSON. */
const plantJson = (rel, from, to) => (dir) => {
  const p = join(dir, rel);
  const json = readFileSync(p, 'utf8');
  const out = json.replace(from, to);
  if (out === json) throw new Error(`could not plant into ${rel} — its shape changed`);
  writeFileSync(p, out);
};

const ID = 'ZzLeftoverPage';
/** Ban `word` as `kind`, plant `line` in `rel`: the run fails and names `word`. */
const bites = (name, rel, line, word, kind = 'identifiers', expect = `\`${word}\` is`) => ({
  name,
  break: all(ban(kind, word), plant(rel, line)),
  exit: 1,
  expect,
});
const silent = (name, rel, line, ...banned) => ({ name, break: all(ban('identifiers', ...banned), plant(rel, line)), exit: 0 });

const CASES = [
  { name: 'untouched tree', break: () => {}, exit: 0 },

  // A banned token fails in every form it takes, and the message names it.
  bites('a PascalCase page object', SKILL, `Open \`${ID}\` first.`, ID),
  bites('a lowercase-camel fixture', SKILL, 'Ask for `zzLeftoverPage` in the test.', 'zzLeftoverPage'),
  bites('a helper', SKILL, 'Call `cleanupZzLeftovers()` after each test.', 'cleanupZzLeftovers'),
  bites('a schema', SKILL, 'Parse it with `ZzLeftoverResponseSchema`.', 'ZzLeftoverResponseSchema'),
  bites('a suite key', SKILL, 'Report under `SUITES.API_ZZ_LEFTOVERS`.', 'API_ZZ_LEFTOVERS'),
  bites('a kebab-case test-id', SKILL, 'Click `register-zz-sheet`.', 'register-zz-sheet'),
  bites('a file name', SKILL, 'Load `http-zz-leftover.json`.', 'http-zz-leftover'),
  bites('a constant', SKILL, 'Read `ZZ_LEFTOVER_TITLES`.', 'ZZ_LEFTOVER_TITLES'),
  bites('a test-id written with a placeholder after a hyphen', SKILL, 'Click `zzprobe-view-{id}`.', 'zzprobe-view'),

  // Each kind carries its own message.
  bites('a page object or type', SKILL, 'Assert the `ZzState` badge.', 'ZzState', 'pageObjects', "`ZzState` is one of the original product's page objects or types"),
  bites("the product's stack", SKILL, 'Results arrive through ZzStream.', 'ZzStream', 'stack', "`ZzStream` is part of the original product's stack"),
  bites('a skill this toolkit does not contain', join('.claude', 'commands', 'test-case-helper.md'), 'Load `zz-context` first.', 'zz-context', 'skills', "point at the project's own CLAUDE.md or repo-context skill"),

  // Cursor-only paths and tool names, under .claude/ only.
  { name: 'a Cursor rule path in .claude', break: plant(SKILL, 'See `.cursor/rules/api-tests.mdc`.'), exit: 1, expect: '`.cursor/rules` is' },
  { name: 'a Cursor skills path in .claude', break: plant(SKILL, 'See `.cursor/skills/x`.'), exit: 1, expect: '`.cursor/skills` is' },
  { name: 'a Cursor hooks path in .claude', break: plant(SKILL, 'See `.cursor/hooks/x`.'), exit: 1, expect: '`.cursor/hooks` is' },
  { name: 'a skills-cursor folder in .claude', break: plant(SKILL, 'Copy it from `skills-cursor`.'), exit: 1, expect: '`skills-cursor` is' },
  { name: 'a .mdc file name in .claude', break: plant(SKILL, 'Edit `api-tests.mdc`.'), exit: 1, expect: '`.mdc` is' },
  { name: 'the migrate-to-skills command in .claude', break: plant(SKILL, 'Run `/migrate-to-skills`.'), exit: 1, expect: '`/migrate-to-skills` is' },
  { name: 'a Cursor tool name in the constitution', break: plant(join('.claude', 'CLAUDE.md'), 'Use `AskQuestion` when unsure.'), exit: 1, expect: '`AskQuestion` is' },
  { name: 'the Cursor fix message names the Claude Code equivalent', break: plant(SKILL, 'Use `AskQuestion`.'), exit: 1, expect: 'use the Claude Code equivalent' },

  // Every scanned place is scanned, whatever the file type.
  { name: 'a hook script (.mjs)', break: plant(join('.claude', 'hooks', 'alternatives-gate.mjs'), '// generalPurpose subagent'), exit: 1, expect: '`generalPurpose` is' },
  bites('a workflow script (.js)', join('.claude', 'workflows', 'review-pr.js'), `// Open ${ID} first.`, ID),
  bites('a shell script (.sh)', join('.claude', 'skills', 'k6-load-testing', 'scripts', 'run.sh'), '# Results arrive through ZzStream.', 'ZzStream', 'stack'),
  bites('a Python script (.py)', join('.claude', 'skills', 'skill-creator', 'scripts', 'utils.py'), `# ${ID}`, ID),
  bites('an HTML page (.html)', join('.claude', 'skills', 'skill-creator', 'eval-viewer', 'viewer.html'), `<!-- ${ID} -->`, ID),
  bites('a text file (.txt)', join('.claude', 'skills', 'skill-creator', 'LICENSE.txt'), ID, ID),
  { name: 'a Cursor rule file (.mdc) under .claude', break: all(ban('identifiers', ID), create(join('.claude', 'rules', 'x.mdc'), `Use ${ID}.\n`)), exit: 1, expect: `\`${ID}\` is` },
  bites('the session memory', join('.claude', 'memories', 'learned_patterns.md'), `Open \`${ID}\` before the grid loads.`, ID),
  bites('a template', join('templates', 'agentic-qa-ci.yml'), '# Waits for ZzStream to ingest.', 'ZzStream', 'stack'),
  bites('the worked example', join('examples', 'README.md'), `Start from \`${ID}\`.`, ID),
  bites('GOVERNANCE', 'GOVERNANCE.md', `The ${ID} example stays.`, ID),
  bites('the README', 'README.md', 'Results arrive through ZzStream.', 'ZzStream', 'stack'),
  bites('CONTRIBUTING', 'CONTRIBUTING.md', `Start from the ${ID} example.`, ID),
  {
    name: 'settings.json',
    break: plantJson(join('.claude', 'settings.json'), '"matcher": "AskUserQuestion"', '"matcher": "AskUserQuestion", "note": "see .cursor/rules/x.mdc"'),
    exit: 1,
    expect: '`.cursor/rules` is',
  },
  {
    name: 'eval prompts are guidance, so they are scanned',
    break: all(ban('identifiers', ID), plantJson(join(EVALS, 'evals.json'), /"prompt": "/, `"prompt": "Use ${ID}. `)),
    exit: 1,
    expect: `\`${ID}\` is`,
  },

  // The vocabulary cannot quietly ban nothing.
  { name: 'a missing vocabulary file fails', break: (dir) => rmSync(join(dir, VOCAB)), exit: 1, expect: 'has no `sha256.identifiers` list' },
  { name: 'a vocabulary file that is not JSON fails', break: create(VOCAB, '{ "sha256": [ '), exit: 1, expect: 'is not valid JSON' },
  { name: 'a sha256 field that is not an object fails', break: vocabulary((d) => { d.sha256 = 'x'; }), exit: 1, expect: 'has no `sha256.identifiers` list' },
  { name: 'an empty kind fails', break: vocabulary((d) => { d.sha256.identifiers = []; }), exit: 1, expect: 'has no `sha256.identifiers` list' },
  { name: 'a missing kind fails', break: vocabulary((d) => { delete d.sha256.stack; }), exit: 1, expect: 'has no `sha256.stack` list' },
  { name: 'a kind that is not a list fails', break: vocabulary((d) => { d.sha256.skills = sha('zz'); }), exit: 1, expect: 'has no `sha256.skills` list' },
  { name: 'an entry that is not a SHA-256 digest fails', break: vocabulary((d) => d.sha256.pageObjects.push('Zz(s)?')), exit: 1, expect: 'is not a SHA-256 hex digest' },
  { name: 'an upper-case digest fails', break: vocabulary((d) => d.sha256.pageObjects.push(sha('zz').toUpperCase())), exit: 1, expect: 'is not a SHA-256 hex digest' },

  // A banned name inside a longer token is a different name, by design.
  silent('a banned name with a hyphen after it', SKILL, 'Use the `zzprobe-data-loader` helper.', 'zzprobe'),
  silent('a banned name with a hyphen before it', SKILL, 'Set the `seed-zzprobe` field.', 'zzprobe'),
  silent('a banned name inside a longer identifier', SKILL, `The new helpers are \`createZzProbeV2\` and \`new${ID}\`.`, ID, 'createZzProbe'),

  // Ordinary QA writing stays silent against the real list — including what a pattern-based check would trip on.
  silent('"synthetic data" and "Synthetic data"', SKILL, 'Synthetic data keeps the tests realistic; generate synthetic data with Faker.'),
  silent('QA compounds of "synthetic"', SKILL, 'Seed `synthetic-data` with `syntheticUser`, `SYNTHETIC_DATA_SEED`, `createSyntheticData()` and `SyntheticData`.'),
  silent('observability wording', SKILL, 'Datadog supports several monitor types; a synthetic-monitor check exposes synthetic-metrics; the monitoring-service team owns alerts.'),
  silent('QA compounds of "probe"', SKILL, 'Configure `healthProbe`, the `health-probe` test-id, `PROBE_TIMEOUT` and `probeCount`.'),
  silent('"probe" and "probes" as English', SKILL, 'Never probe the DOM; axe probes the page; HTTP probes check /healthz; never commit structure-probe tests.'),
  silent('Kubernetes probes', SKILL, 'Check the liveness and readiness probes: livenessProbe, readiness-probes.'),
  silent('other vendors and libraries', SKILL, 'Datadog Synthetics, New Relic Synthetics, the OpenTelemetry Collector and a React SyntheticEvent are all fine.'),
  silent('bare words in prose are legal by design', SKILL, 'Every test creates two synthetics, assigns the probes list, sends POST /synthetics and edits probe.ts.'),
  silent('"monitor" as a verb', SKILL, 'Monitor the error rate after each release.'),
  silent("the toolkit's documented earlier `@App-*` tags", SKILL, 'An `@App-*` repo maps `@api` to `@App-API` until its move lands.'),
  silent('Cursor named as a forbidden browser tool', SKILL, 'Never use Cursor browser tools instead of npx playwright open.'),
  silent("the README documenting the validator's own Cursor checks", 'README.md', '| 5 | `.cursor/rules/*.mdc` have front matter |'),

  // Recorded measurements keep the names they ran with.
  { name: 'history.json is exempt', break: all(ban('identifiers', ID), plantJson(join(EVALS, 'history.json'), '"note": "', `"note": "ran against ${ID} and @App-API; `)), exit: 0 },
  { name: 'results.json is exempt', break: all(ban('identifiers', ID), plantJson(join(EVALS, 'results.json'), '"method": "', `"method": "ran against ${ID}; `)), exit: 0 },
  { name: 'lint-gate-results.json is exempt', break: all(ban('identifiers', ID), plantJson(join(EVALS, 'lint-gate-results.json'), '"method": "', `"method": "ran against ${ID}; `)), exit: 0 },
];

let failed = 0;
for (const c of CASES) {
  const dir = scaffold();
  try {
    c.break(dir);
    const { code, out } = run(dir);
    const ok = code === c.exit && (!c.expect || out.includes(c.expect));
    if (!ok) failed++;
    const why = ok ? '' : `  ← got exit ${code}${c.expect && !out.includes(c.expect) ? `, no "${c.expect}" in the output` : ''}`;
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${c.name.padEnd(60)} exit ${code} (want ${c.exit})${why}`);
    if (!ok && c.exit === 0) console.log(out.split('\n').filter((l) => l.includes('✗')).slice(0, 5).join('\n'));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

console.log('');
if (failed) {
  console.log(`  ${failed} case(s) did not behave as specified`);
  process.exit(1);
}
console.log(`  ${CASES.length} cases — a banned token bites in every scanned place and file type, and QA writing stays silent`);
