/**
 * Mutation sweep for the skill-snippet lint. `npm run test:snippets-mutation`
 *
 * The harness (skill-snippets.harness.test.mjs) claims a case for every branch of the lint. This
 * file checks that claim instead of trusting it: each mutant below breaks one condition of the lint,
 * the harness runs against the broken copy, and the harness must fail. A mutant the harness does not
 * kill is a branch nothing tests.
 *
 * Why it exists: the harness's first version claimed "every branch was mutation-tested" after a few
 * hand-made mutations; an independent review then ran 20 mutants and 14 survived. A claim about test
 * strength is now a number this file recomputes on every run.
 *
 * It fails when:
 *  - any mutant survives (add a harness case that kills it — or, if no input can tell the mutant
 *    apart, the mutated code is unreachable: remove it), or
 *  - a mutant's target text no longer exists in the lint (the list has gone stale: update it).
 *
 * Each mutant is written to a copy inside tests/ (so it resolves the same node_modules) and the
 * harness is pointed at it with SNIPPET_LINT; the real lint file is never edited.
 */

import { readFileSync, writeFileSync, rmSync } from 'node:fs';
import { spawn } from 'node:child_process';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const DIR = fileURLToPath(new URL('..', import.meta.url));
const LINT = join(DIR, 'tests', 'skill-snippets.test.mjs');
// Per process, so two sweeps at once (two terminals, an IDE task) can't overwrite each other's copies.
const COPY = join(DIR, 'tests', `.mutant-skill-snippets-${process.pid}.test.mjs`);
const TIMEOUT_MS = 120_000; // a mutant that makes the lint loop must not hang CI
const HARNESS = join(DIR, 'tests', 'skill-snippets.harness.test.mjs');
const original = readFileSync(LINT, 'utf8');

const M = [
  ['CRLF: split on \\n only', String.raw`const lines = md.split(/\r?\n/);`, `const lines = md.split('\\n');`],
  ['language: js also linted', String.raw`if (/^(ts|typescript)$/.test(open.lang)) out.push`, String.raw`if (/^(ts|typescript|js)$/.test(open.lang)) out.push`],
  ['language check removed', String.raw`if (/^(ts|typescript)$/.test(open.lang)) out.push`, `if (true) out.push`],
  ['closing fence: any character', 'close[2][0] === open.char && ', ''],
  ['closing fence: any length', 'close[2].length >= open.len', 'true'],
  ['unclosed fence not reported', 'if (open) throw new Error', 'if (false) throw new Error'],
  ['list-indented fence not dedented', String.raw`open.buf.push(line.replace(new RegExp(` + '`^ {0,${open.indent}}`' + `), ''));`, 'open.buf.push(line);'],
  ['nearest line crosses fences', String.raw`    if (/^\s*(` + '`' + String.raw`{3,}|~{3,})/.test(lines[j])) break;`, String.raw`    if (/^\s*(` + '`' + String.raw`{3,}|~{3,})/.test(lines[j])) continue;`],
  ['fence crossing never recorded', 'crossed = true;', 'crossed = false;'],
  ['label walk capped at 1 line', 'n < 60', 'n < 1'],
  ['headings are not labels', String.raw`const LABEL_LINE = /^#{2,6} |`, 'const LABEL_LINE = /'],
  ['first-line GOOD ignored', '    if (RIGHT_WORD.test(first)) return false;\n', ''],
  ['first-line BAD ignored', '    if (WRONG_WORD.test(first)) return true;\n', ''],
  ['first-line BAD checked before GOOD', '    if (RIGHT_WORD.test(first)) return false;\n    if (WRONG_WORD.test(first)) return true;', '    if (WRONG_WORD.test(first)) return true;\n    if (RIGHT_WORD.test(first)) return false;'],
  ['neutral prose after a block keeps the label', '    if (crossed) return false;\n', ''],
  ['nearest-line GOOD ignored', '    if (RIGHT_LABEL.test(nearest) || RIGHT_WORD.test(nearest)) return false;\n', ''],
  ['nearest-line BAD ignored', '    if (WRONG_LABEL.test(nearest) || WRONG_WORD.test(nearest)) return true;\n', ''],
  ['HTTP status headings count as labels', String.raw`(?!\s+request\b|\s*\(\d{3}\))`, ''],
  ['skip marker: em dash only', '(?:—|–|--|-)', '(?:—)'],
  ['skip reason: any text', String.raw`return m && /[\p{L}\p{N}]/u.test(m[1]) ? m[1] : null;`, 'return m ? m[1] : null;'],
  ['skip marker read from the label', 'skipReason(block.nearest)', 'skipReason(block.label)'],
  ['built-in types treated as placeholders', '      !builtinType &&\n', ''],
  ['every <Word> after an identifier is a type', 'const typeArgument = afterIdentifier && glued === undefined && !placeholderWord;', 'const typeArgument = afterIdentifier && glued === undefined;'],
  ['glued words treated as types', 'afterIdentifier && glued === undefined && !placeholderWord', 'afterIdentifier && !placeholderWord'],
  ['no identifier check', 'afterIdentifier && glued === undefined && !placeholderWord', 'glued === undefined && !placeholderWord'],
  ['PascalCase placeholders ignored', ' || PASCAL_PLACEHOLDER.test(word))', ')'],
  ['diff: + not stripped', String.raw`.map((l) => l.replace(/^[+ ] /, ''))`, '.map((l) => l)'],
  ['diff: majority threshold removed', 'marked < lines.length / 2', 'false'],
  ['virtualPath: .test( counts as a test', String.raw`/(?<![.\w$])(?:test|it)`, '/(?:test|it)'],
  ['virtualPath: header path ignored', '  if (head) return head[1];\n', ''],
  ['class wrapper removed', '    [`class __Snippet {\\n${filled}\\n}`, 1],\n', ''],
  ['object wrapper removed', '    [`const __snippet = {\\n${filled}\\n};`, 1],\n', ''],
  ['line numbers not mapped back', 'line: m.line - shift', 'line: m.line'],
  ['eslint-plugin-playwright not registered', ' plugins: { playwright },', ''],
  ['reasonless eslint-disable accepted', 'else report.violations.push(`${rel}:${block.line} +${s.line}', 'else report.suppressed.push(`${rel}:${block.line} +${s.line}'],
  ['zero blocks found passes', 'if (found === 0) report.errors.push(', 'if (false) report.errors.push('],
];

console.log(`\nSkill-snippet lint — mutation sweep (${M.length} mutants)\n`);

/**
 * Run the harness against one lint copy. Resolves to:
 *   'passed'  — exit 0
 *   'killed'  — exit 1 AND the harness's own "N of M harness case(s) failed" line, with the first
 *               failing case named. Only this counts as a kill.
 *   'ERROR'   — anything else: a crash, an import error, a signal, a timeout. A harness that falls
 *               over proves nothing about the mutant, and used to be counted as a kill.
 */
function runHarness(copy) {
  return new Promise((resolve) => {
    let out = '';
    const p = spawn(process.execPath, [HARNESS], { cwd: DIR, env: { ...process.env, SNIPPET_LINT: copy } });
    p.stdout.on('data', (d) => (out += d));
    p.stderr.on('data', (d) => (out += d));
    const timer = setTimeout(() => p.kill(), TIMEOUT_MS);
    p.on('close', (code) => {
      clearTimeout(timer);
      const firstFail = /^\s*FAIL (.*)$/m.exec(out)?.[1] ?? '';
      if (code === 0) resolve({ verdict: 'passed' });
      else if (code === 1 && /harness case\(s\) failed/.test(out)) resolve({ verdict: 'killed', why: firstFail });
      else resolve({ verdict: 'ERROR', why: (out.trim().split('\n').pop() ?? '').slice(0, 160) || `exit ${code}` });
    });
  });
}

const copies = new Set();
const cleanUp = () => {
  for (const c of copies) rmSync(c, { force: true });
};
// Ctrl-C mid-run: remove the mutated copies before exiting (the harness children die with us).
process.on('SIGINT', () => {
  cleanUp();
  process.exit(130);
});

// Baseline: the harness must pass against an UNMUTATED copy, or every "kill" below is meaningless.
const baselineCopy = COPY.replace('.test.mjs', '-baseline.test.mjs');
copies.add(baselineCopy);
writeFileSync(baselineCopy, original);
const baseline = await runHarness(baselineCopy);
rmSync(baselineCopy, { force: true });
copies.delete(baselineCopy);
if (baseline.verdict !== 'passed') {
  console.log(`  ✗ the harness does not pass against the unmutated lint (${baseline.verdict}: ${baseline.why ?? ''})`);
  console.log('    — fix the harness first; no mutant result can be trusted until it does.\n');
  process.exit(1);
}

let killed = 0;
const problems = [];
const results = new Array(M.length);
try {
  // Four at a time: each harness run spawns ESLint several times, so serial runs take minutes.
  let next = 0;
  await Promise.all(
    Array.from({ length: 4 }, async () => {
      while (next < M.length) {
        const i = next++;
        const [, from, to] = M[i];
        if (!original.includes(from)) {
          results[i] = { verdict: 'STALE' };
          continue;
        }
        const copy = COPY.replace('.test.mjs', `-${i}.test.mjs`);
        copies.add(copy);
        writeFileSync(copy, original.replace(from, to));
        const r = await runHarness(copy);
        results[i] = r.verdict === 'passed' ? { verdict: 'SURVIVED' } : r;
      }
    })
  );
} finally {
  cleanUp();
}
M.forEach(([name], i) => {
  const { verdict, why } = results[i];
  console.log(`  ${verdict.padEnd(8)} ${name}${why ? `  ← ${why}` : ''}`);
  if (verdict === 'killed') killed++;
  else if (verdict === 'STALE') problems.push(`stale mutant "${name}": its target text is no longer in the lint`);
  else if (verdict === 'ERROR') problems.push(`mutant "${name}": the harness errored instead of failing a case — not counted as a kill`);
  else problems.push(`mutant "${name}" survived: no harness case notices it`);
});

console.log(`\n  ${killed} of ${M.length} mutants killed`);
if (problems.length) {
  for (const p of problems) console.log(`  ✗ ${p}`);
  console.log('');
  process.exit(1);
}
console.log('  every mutant is killed — each branch of the lint has a case that notices it breaking\n');
