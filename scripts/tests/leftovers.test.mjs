#!/usr/bin/env node
/**
 * Fault injection for check 16, product leftovers. `npm run test:leftovers`
 *
 * The claim check 16 makes is "nothing from the product the skills were extracted from, and no
 * Cursor-only path, is back in what adopters install or read". It can be false in two ways while
 * staying green: a banned name gets in somewhere the check doesn't look, or the check fires on
 * ordinary QA writing and gets switched off. Both are covered: names from the product's vocabulary
 * in every scanned place and file type must fail the run and name the word they found, and the
 * QA phrases a pattern-based check would trip on, the README's documentation of the validator's
 * own Cursor checks, and recorded measurements must not. The vocabulary file itself is guarded too:
 * an empty or malformed list must fail rather than quietly ban nothing.
 *
 * Each case copies the working tree, plants one thing, runs the real validate.mjs and asserts the
 * exit code — the same harness as rule-ownership.test.mjs.
 */

import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync, rmSync, cpSync, appendFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SKILL = join('.claude', 'skills', 'test-standards', 'SKILL.md');
const VOCAB = join('scripts', 'product-vocabulary.json');
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

/** Append one line of prose to a file in the scaffold. */
const plant = (rel, line) => (dir) => appendFileSync(join(dir, rel), `\n${line}\n`);
/** Replace text in a JSON file in the scaffold, keeping it valid JSON. */
const plantJson = (rel, from, to) => (dir) => {
  const p = join(dir, rel);
  const json = readFileSync(p, 'utf8');
  const out = json.replace(from, to);
  if (out === json) throw new Error(`could not plant into ${rel} — its shape changed`);
  writeFileSync(p, out);
};
/** Rewrite the vocabulary list in the scaffold. */
const vocabulary = (edit) => (dir) => {
  const p = join(dir, VOCAB);
  const data = JSON.parse(readFileSync(p, 'utf8'));
  data.identifiers = edit(data.identifiers);
  writeFileSync(p, JSON.stringify(data, null, 2));
};

const bites = (name, rel, line, word) => ({ name, break: plant(rel, line), exit: 1, expect: `\`${word}\` is` });
const silent = (name, rel, line) => ({ name, break: plant(rel, line), exit: 0 });

const CASES = [
  { name: 'untouched tree', break: () => {}, exit: 0 },

  // Names from the product's vocabulary fail, whatever their form, and the message names them.
  bites('a PascalCase page object', SKILL, 'Open `SyntheticsPage` first.', 'SyntheticsPage'),
  bites('a lowercase-camel fixture', SKILL, 'Ask for `syntheticsPage` in the test.', 'syntheticsPage'),
  bites('a helper', SKILL, 'Call `cleanupProbesAndSynthetics()` after each test.', 'cleanupProbesAndSynthetics'),
  bites('a schema', SKILL, 'Parse it with `PauseSyntheticResponseSchema`.', 'PauseSyntheticResponseSchema'),
  bites('a suite key', SKILL, 'Report under `SUITES.API_SYNTHETICS`.', 'API_SYNTHETICS'),
  bites('a kebab-case test-id', SKILL, 'Click `register-probe-sheet`.', 'register-probe-sheet'),
  bites('a file name', SKILL, 'Load `http-synthetic.json`.', 'http-synthetic'),
  bites('a monitor-type code form', SKILL, 'Render the `monitorTypeGrid`.', 'monitorTypeGrid'),
  bites('a constant', SKILL, 'Read `MONITOR_TYPE_TITLES`.', 'MONITOR_TYPE_TITLES'),
  bites('a listed page object outside the vocabulary file', SKILL, 'Assert the `HealthState` badge.', 'HealthState'),
  bites("the product's stack", SKILL, 'Results arrive through JetStream.', 'JetStream'),
  bites('a skill this toolkit does not contain', join('.claude', 'commands', 'test-case-helper.md'), 'Load `master-context` first.', 'master-context'),
  bites('a Cursor rule path in .claude', SKILL, 'See `.cursor/rules/api-tests.mdc`.', '.cursor/rules'),
  bites('a Cursor tool name in the constitution', join('.claude', 'CLAUDE.md'), 'Use `AskQuestion` when unsure.', 'AskQuestion'),

  // Every scanned place is scanned, whatever the file type.
  bites('a hook script', join('.claude', 'hooks', 'alternatives-gate.mjs'), '// generalPurpose subagent', 'generalPurpose'),
  bites('the session memory', join('.claude', 'memories', 'learned_patterns.md'), 'Open `ProbesPage` before the grid loads.', 'ProbesPage'),
  bites('a template', join('templates', 'agentic-qa-ci.yml'), '# Waits for VictoriaMetrics to ingest.', 'VictoriaMetrics'),
  bites('the worked example', join('examples', 'README.md'), 'Start from `SyntheticsPage`.', 'SyntheticsPage'),
  bites('GOVERNANCE', 'GOVERNANCE.md', 'The ProbesPage example stays.', 'ProbesPage'),
  bites('the README', 'README.md', 'Charts render with FusionCharts.', 'FusionCharts'),
  bites('CONTRIBUTING', 'CONTRIBUTING.md', 'Start from the AlertsPage example.', 'AlertsPage'),
  {
    name: 'settings.json',
    break: plantJson(join('.claude', 'settings.json'), '"matcher": "AskUserQuestion"', '"matcher": "AskUserQuestion", "note": "see .cursor/rules/x.mdc"'),
    exit: 1,
    expect: '`.cursor/rules` is',
  },
  {
    name: 'eval prompts are guidance, so they are scanned',
    break: plantJson(join('.claude', 'skills', 'api-testing', 'evals', 'evals.json'), /"prompt": "/, '"prompt": "Use SyntheticsPage. '),
    exit: 1,
    expect: '`SyntheticsPage` is',
  },

  // The vocabulary list cannot quietly ban nothing.
  { name: 'an empty vocabulary fails', break: vocabulary(() => []), exit: 1, expect: 'has no `identifiers` list' },
  { name: 'a vocabulary that is not a list fails', break: vocabulary(() => 'SyntheticsPage'), exit: 1, expect: 'has no `identifiers` list' },
  { name: 'a vocabulary file that is not JSON fails', break: (dir) => writeFileSync(join(dir, VOCAB), '{ "identifiers": [ '), exit: 1, expect: 'is not valid JSON' },
  { name: 'a malformed vocabulary entry fails', break: vocabulary((v) => [...v, 'Probe(s)?']), exit: 1, expect: 'is not a plain identifier' },

  // Ordinary QA writing stays silent — including what a pattern-based check would trip on.
  silent('"synthetic data" and "Synthetic data"', SKILL, 'Synthetic data keeps the tests realistic; generate synthetic data with Faker.'),
  silent('QA compounds of "synthetic"', SKILL, 'Seed `synthetic-data` with `syntheticUser`, `SYNTHETIC_DATA_SEED`, `createSyntheticData()` and `SyntheticData`.'),
  silent('observability wording the product also used', SKILL, 'Datadog supports several monitor types; a synthetic-monitor check exposes synthetic-metrics; the monitoring-service team owns alerts.'),
  silent('QA compounds of "probe"', SKILL, 'Configure `healthProbe`, the `health-probe` test-id, `PROBE_TIMEOUT` and `probeCount`.'),
  silent('"probe" and "probes" as English', SKILL, 'Never probe the DOM; axe probes the page; HTTP probes check /healthz; never commit structure-probe tests.'),
  silent('Kubernetes probes', SKILL, 'Check the liveness and readiness probes: livenessProbe, readiness-probes.'),
  silent('other vendors and libraries', SKILL, 'Datadog Synthetics, New Relic Synthetics, the OpenTelemetry Collector and a React SyntheticEvent are all fine.'),
  silent('a list name inside a longer identifier is a different name', SKILL, 'The new helpers are `createProbeDataV2` and `newSyntheticsPage`.'),
  silent('bare words in prose are legal by design', SKILL, 'Every test creates two synthetics, assigns the probes list, sends POST /synthetics and edits probe.ts.'),
  silent('"monitor" as a verb', SKILL, 'Monitor the error rate after each release.'),
  silent('the toolkit\'s documented earlier `@App-*` tags', SKILL, 'An `@App-*` repo maps `@api` to `@App-API` until its move lands.'),
  silent('Cursor named as a forbidden browser tool', SKILL, 'Never use Cursor browser tools instead of npx playwright open.'),
  silent("the README documenting the validator's own Cursor checks", 'README.md', '| 5 | `.cursor/rules/*.mdc` have front matter |'),
  {
    name: 'a recorded measurement keeps the names it ran with',
    break: plantJson(join('.claude', 'skills', 'api-testing', 'evals', 'history.json'), '"note": "', '"note": "ran against SyntheticsPage and @App-API; '),
    exit: 0,
  },
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
    console.log(`  ${ok ? 'OK  ' : 'FAIL'} ${c.name.padEnd(56)} exit ${code} (want ${c.exit})${why}`);
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
console.log(`  ${CASES.length} cases — the product's names bite in every scanned place, and QA writing stays silent`);
