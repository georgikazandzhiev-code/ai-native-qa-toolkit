#!/usr/bin/env node
/**
 * Skill regression compare. `npm run eval:compare`
 *
 * Reads each skill's `evals/history.json`, compares the two most recent entries for the same
 * metric, and reports IMPROVED / REGRESSION / WITHIN NOISE / INSUFFICIENT DATA.
 *
 * Zero dependencies. Exit 1 only on a REGRESSION that clears the noise floor, so it can gate.
 *
 * Two things this deliberately refuses to do, both learned the hard way today:
 *
 *  1. It will not call a small delta an improvement. On 2026-08-11 the `selectors` score moved
 *     +1 after a fix — and the *baseline* moved +1 too, with nothing changed on its side. At two
 *     cases, ±1 is run-to-run variance. A tool that reports that as progress teaches you to
 *     trust noise.
 *
 *  2. It will not assume a direction. `expectations-met` goes up when things improve;
 *     `lint-gate-violations` goes down. Each metric declares its own direction, because
 *     hardcoding one silently inverts the verdict for the other.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));
const SKILLS = join(ROOT, '.claude', 'skills');

/** Direction and noise floor per metric. */
const METRICS = {
  'expectations-met': { better: 'higher', label: 'expectations met' },
  'lint-gate-violations': { better: 'lower', label: 'lint violations' },
  'mutation-score': { better: 'higher', label: 'mutation score' },
};

/**
 * Noise floor. Below five cases a delta of 1 is indistinguishable from variance, so demand
 * more before calling anything. This is a judgement encoded once, visibly, rather than
 * re-argued per result.
 */
function noiseFloor(cases) {
  if (!cases || cases < 3) return 2;
  if (cases < 5) return 1;
  return 0;
}

const read = (p) => JSON.parse(readFileSync(p, 'utf8'));
const dirs = (p) => (existsSync(p) ? readdirSync(p).filter((d) => statSync(join(p, d)).isDirectory()) : []);

function frontmatterVersion(skillDir) {
  const f = join(SKILLS, skillDir, 'SKILL.md');
  if (!existsSync(f)) return null;
  const m = /^version:\s*(\S+)$/m.exec(readFileSync(f, 'utf8'));
  return m ? m[1] : null;
}

const rows = [];
const problems = [];
let regressions = 0;

for (const skill of dirs(SKILLS)) {
  const hist = join(SKILLS, skill, 'evals', 'history.json');
  if (!existsSync(hist)) continue;

  let data;
  try {
    data = read(hist);
  } catch (e) {
    problems.push(`${skill}: history.json is not valid JSON — ${e.message}`);
    continue;
  }

  const declared = frontmatterVersion(skill);
  const entries = Array.isArray(data.entries) ? data.entries : [];
  if (entries.length === 0) {
    problems.push(`${skill}: history.json has no entries`);
    continue;
  }

  // The newest recorded version should match what the skill actually declares, or the
  // history is describing a version that no longer exists.
  const newestVersion = entries[entries.length - 1].version;
  if (declared && newestVersion !== declared) {
    problems.push(
      `${skill}: SKILL.md declares ${declared} but the newest history entry is ${newestVersion} — ` +
      `either the version was bumped without re-measuring, or the measurement was not recorded`
    );
  }

  // group by metric, compare the last two of each
  const byMetric = new Map();
  for (const e of entries) {
    if (!byMetric.has(e.metric)) byMetric.set(e.metric, []);
    byMetric.get(e.metric).push(e);
  }

  for (const [metric, list] of byMetric) {
    const spec = METRICS[metric];
    if (!spec) {
      problems.push(`${skill}: unknown metric "${metric}" — declare its direction in eval-compare.mjs`);
      continue;
    }

    const latest = list[list.length - 1];
    const prev = list.length > 1 ? list[list.length - 2] : null;

    // vs the baseline arm in the same run — the comparison that says whether the skill helps at all
    const vsBaseline =
      latest.baseline === undefined || latest.baseline === null
        ? null
        : spec.better === 'higher'
          ? latest.score - latest.baseline
          : latest.baseline - latest.score;

    let verdict, detail;
    if (!prev) {
      verdict = 'FIRST RUN';
      detail = 'no earlier measurement of this metric to compare against';
    } else {
      const delta = spec.better === 'higher' ? latest.score - prev.score : prev.score - latest.score;
      const floor = noiseFloor(Math.min(latest.cases ?? 0, prev.cases ?? 0));
      if (Math.abs(delta) <= floor) {
        verdict = 'WITHIN NOISE';
        detail = `${prev.version} → ${latest.version}: ${prev.score} → ${latest.score} ` +
                 `(delta ${delta >= 0 ? '+' : ''}${delta}, noise floor ±${floor} at ${latest.cases} case(s))`;
      } else if (delta > 0) {
        verdict = 'IMPROVED';
        detail = `${prev.version} → ${latest.version}: ${prev.score} → ${latest.score} (+${delta} beyond the ±${floor} floor)`;
      } else {
        verdict = 'REGRESSION';
        detail = `${prev.version} → ${latest.version}: ${prev.score} → ${latest.score} (${delta}, beyond the ±${floor} floor)`;
        regressions++;
      }
    }

    rows.push({
      skill, metric, spec, latest, verdict, detail, vsBaseline,
      note: latest.note ?? '',
    });
  }
}

// ── report ──────────────────────────────────────────────────────────────────────

const ICON = {
  IMPROVED: 'UP  ',
  REGRESSION: 'DOWN',
  'WITHIN NOISE': 'noise',
  'FIRST RUN': 'first',
};

console.log('');
console.log('Skill eval history — regression compare');
console.log('');

if (rows.length === 0) {
  console.log('  No skill has an evals/history.json yet. 25 of 28 skills are unmeasured;');
  console.log('  a claim about "the toolkit" is currently a claim about three of them.');
  console.log('');
  process.exit(0);
}

const measured = new Set(rows.map((r) => r.skill));
console.log(`  ${measured.size} of ${dirs(SKILLS).length} skills have recorded history.`);
console.log('');

for (const r of rows) {
  const v = frontmatterVersion(r.skill);
  console.log(`  ${r.skill}  v${v ?? '?'}  [${r.metric}, ${r.spec.better} is better]`);
  console.log(`    ${(ICON[r.verdict] ?? '').padEnd(6)} ${r.verdict}: ${r.detail}`);
  if (r.vsBaseline !== null) {
    const sign = r.vsBaseline > 0 ? 'ahead of' : r.vsBaseline < 0 ? 'BEHIND' : 'level with';
    console.log(`    vs baseline in the same run: ${sign} baseline by ${Math.abs(r.vsBaseline)}`);
  }
  if (r.note) console.log(`    note: ${r.note}`);
  console.log('');
}

if (problems.length) {
  console.log(`  BOOKKEEPING (${problems.length}) — history and declared versions disagree:`);
  for (const p of problems) console.log(`    ! ${p}`);
  console.log('');
}

// Anything still measured only against an LLM rubric is worth naming, since that metric
// tied twice today and its rubrics are known to measure competence rather than convention.
const rubricOnly = [...measured].filter(
  (s) => !rows.some((r) => r.skill === s && r.metric !== 'expectations-met')
);
if (rubricOnly.length) {
  console.log(`  Measured only by LLM rubric, no machine metric yet: ${rubricOnly.join(', ')}`);
  console.log('');
}

if (regressions > 0) {
  console.log(`  ${regressions} regression(s) beyond the noise floor — FAILED`);
  process.exit(1);
}
console.log('  no regressions beyond the noise floor — OK');
process.exit(0);
