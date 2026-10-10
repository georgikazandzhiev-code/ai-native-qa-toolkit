/**
 * Mutation sweep for the skill-snippet lint. `npm run test:snippets-mutation`
 *
 * The harness (skill-snippets.harness.test.mjs) has cases for the lint's conditions. This file
 * checks that those cases notice a condition breaking instead of trusting it: each mutant below
 * breaks one condition of the lint, the harness runs against the broken copy, and the harness must
 * fail. A mutant the harness does not kill is a condition nothing tests.
 *
 * What a pass means: every mutant LISTED here is killed. It is not a proof that every branch of the
 * lint is tested — only the conditions on this list are. When a condition is added to the lint,
 * add its mutant here in the same change.
 *
 * Why it exists: the harness's first version claimed "every branch was mutation-tested" after a few
 * hand-made mutations; an independent review then ran 20 mutants and 14 survived, and a second
 * review found six more conditions (fence case, label words, bold labels, the start anchor, the
 * comment-line check) with no mutant at all. A claim about test strength is now a number this file
 * recomputes on every run.
 *
 * Left out on purpose: swapping the first-line right-label and wrong-label checks. Both are anchored
 * at the start of the comment, so no line matches both and the swap cannot change any result.
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
const TIMEOUT_MS = 180_000; // a mutant that makes the lint loop must not hang CI
const HARNESS = join(DIR, 'tests', 'skill-snippets.harness.test.mjs');
const original = readFileSync(LINT, 'utf8');
const BT = '`';

const M = [
  // fences
  ['CRLF: split on \\n only', String.raw`const lines = md.split(/\r?\n/);`, `const lines = md.split('\\n');`],
  ['language: js also linted', String.raw`if (/^(ts|typescript)$/.test(open.lang)) out.push`, String.raw`if (/^(ts|typescript|js)$/.test(open.lang)) out.push`],
  ['language check removed', String.raw`if (/^(ts|typescript)$/.test(open.lang)) out.push`, `if (true) out.push`],
  ['language not lower-cased', 'lang: opener[3].toLowerCase()', 'lang: opener[3]'],
  ['closing fence: any character', 'close[2][0] === open.char && ', ''],
  ['closing fence: any length', 'close[2].length >= open.len', 'true'],
  ['unclosed fence not reported', 'if (open) throw new Error', 'if (false) throw new Error'],
  ['list-indented fence not dedented', String.raw`open.buf.push(line.replace(new RegExp(` + '`^ {0,${open.indent}}`' + `), ''));`, 'open.buf.push(line);'],
  // context above the fence
  ['nearest line crosses fences', String.raw`    if (/^\s*(` + BT + String.raw`{3,}|~{3,})/.test(lines[j])) break;`, String.raw`    if (/^\s*(` + BT + String.raw`{3,}|~{3,})/.test(lines[j])) continue;`],
  ['fence crossing never recorded', 'crossed = true;', 'crossed = false;'],
  ['label walk capped at 1 line', 'n < 60', 'n < 1'],
  ['headings are not labels', String.raw`const LABEL_LINE = /^#{2,6} |`, 'const LABEL_LINE = /'],
  ['bold labels not recognised', String.raw`|^\s*\*\*[^*]+\*\*`, ''],
  // what a wrong-label is
  ['❌ dropped from the wrong-labels', '(?:❌|(?:Bad|Wrong', '(?:(?:Bad|Wrong'],
  ['Bad dropped from the wrong-labels', '(?:Bad|Wrong|Forbidden|Anti-?patterns?)', '(?:Wrong|Forbidden|Anti-?patterns?)'],
  ['Wrong dropped from the wrong-labels', '(?:Bad|Wrong|Forbidden|Anti-?patterns?)', '(?:Bad|Forbidden|Anti-?patterns?)'],
  ['Forbidden dropped from the wrong-labels', '(?:Bad|Wrong|Forbidden|Anti-?patterns?)', '(?:Bad|Wrong|Anti-?patterns?)'],
  ['Anti-pattern dropped from the wrong-labels', '(?:Bad|Wrong|Forbidden|Anti-?patterns?)', '(?:Bad|Wrong|Forbidden)'],
  ['delimiter after the word not required', String.raw`\s*(?:$|[:—–(]|-\s|\*\*)`, ''],
  ['a glued hyphen counts as a delimiter', String.raw`|-\s|`, '|-|'],
  ['status-code exemption removed', String.raw`(?!\s*\d{3}\b)`, ''],
  ['label not anchored at the start', 'new RegExp(String.raw`^\\s*(?:#{2,6}', 'new RegExp(String.raw`\\s*(?:#{2,6}'],
  ['comment check dropped (any first line)', "new RegExp(COMMENT + WRONG_START, 'i')", "new RegExp(WRONG_START, 'i')"],
  ['right-label anywhere on the first line', 'new RegExp(COMMENT + String.raw`(?:✅', 'new RegExp(String.raw`(?:✅'],
  ['tail label not anchored at the end', String.raw`\s*:?\s*$/i;`, '/i;'],
  // the order of the counter-example rules
  ['first-line GOOD ignored', '  if (RIGHT_COMMENT.test(first)) return null;\n', ''],
  ['first-line BAD ignored', '  if (WRONG_COMMENT.test(first)) return first;\n', ''],
  ['nearest-line GOOD ignored', '    if (RIGHT_LABEL.test(nearest) || RIGHT_WORD.test(nearest)) return null;\n', ''],
  ['nearest-line wrong-label ignored', '    if (WRONG_LABEL.test(nearest)) return nearest;\n', ''],
  ['prose tail label ignored', '    if (WRONG_TAIL.test(nearest)) return nearest;\n', ''],
  ['neutral prose after a block keeps the label', '    if (crossed) return null;\n', ''],
  ['counter-examples not printed', 'for (const c of report.counter) console.log(', 'for (const c of []) console.log('],
  ['counter-examples not parsed', "        await checkParses(rel, block, 'counter-example');\n", ''],
  // explicit skip
  ['skip marker: em dash only', '(?:—|–|--|-)', '(?:—)'],
  ['separator glued to "skip"', String.raw`skip\s+(?:`, String.raw`skip\s*(?:`],
  ['skip reason: any text', String.raw`  if (!/\p{L}{2}/u.test(reason)) return null;` + '\n', ''],
  ['one letter is a reason', String.raw`\p{L}{2}`, String.raw`\p{L}`],
  ['angle-bracket placeholder accepted', '  if (/^<[^>]*>$/.test(reason)) return null;\n', ''],
  ['placeholder words accepted', String.raw`  if (PLACEHOLDER_REASON.test(reason.replace(/[\s.:;!?…-]+$/u, ''))) return null;` + '\n', ''],
  ['placeholder trailing punctuation not stripped', String.raw`PLACEHOLDER_REASON.test(reason.replace(/[\s.:;!?…-]+$/u, ''))`, 'PLACEHOLDER_REASON.test(reason)'],
  ['skip marker read from the label', 'skipReason(block.nearest)', 'skipReason(block.label)'],
  ['marked blocks not parsed', "        await checkParses(rel, block, 'marked skip');\n", ''],
  // inline rule configuration
  ['inline config not detected', 'const INLINE_CONFIG = /', 'const INLINE_CONFIG = /(?!)/;\nconst UNUSED = /'],
  ['quoted rule name not detected', '(?:eslint|eslint-env|', String.raw`(?:eslint\s+[\w@/-]+\s*:|eslint-env|`],
  ['eslint-env not detected', '|eslint-env|', '|'],
  ['global not detected', '|globals?)(?=', ')(?='],
  ['directive word not ended by a space', String.raw`(?:eslint|eslint-env|globals?)(?=\s|\*\/)/`, '(?:eslint|eslint-env|globals?)/'],
  ['inline config not reported', '    if (inline)\n      res.real.push({', '    if (false)\n      res.real.push({'],
  // placeholders
  ['built-in types treated as placeholders', '      !builtinType &&\n', ''],
  ['every <Word> after an identifier is a type', 'const typeArgument = afterIdentifier && glued === undefined && !placeholderWord;', 'const typeArgument = afterIdentifier && glued === undefined;'],
  ['glued words treated as types', 'afterIdentifier && glued === undefined && !placeholderWord', 'afterIdentifier && !placeholderWord'],
  ['no identifier check', 'afterIdentifier && glued === undefined && !placeholderWord', 'glued === undefined && !placeholderWord'],
  ['PascalCase placeholders ignored', ' || PASCAL_PLACEHOLDER.test(word))', ')'],
  // diffs and paths
  ['diff: + not stripped', String.raw`.map((l) => l.replace(/^[+ ] /, ''))`, '.map((l) => l)'],
  ['diff: majority threshold removed', 'marked < lines.length / 2', 'false'],
  ['virtualPath: .test( counts as a test', String.raw`/(?<![.\w$])(?:test|it)`, '/(?:test|it)'],
  ['virtualPath: header path ignored', '  if (head) return head[1];\n', ''],
  // wrappers
  ['class wrapper removed', '    [`class __Snippet {\\n${filled}\\n}`, 1],\n', ''],
  ['object wrapper removed', '    [`const __snippet = {\\n${filled}\\n};`, 1],\n', ''],
  ['line numbers not mapped back', 'line: m.line - shift', 'line: m.line'],
  // test-body fragments
  ['test-body pass removed', '    await addTestBodyFindings(filled, path, res);\n', ''],
  ['test-body pass on any path', '  if (path !== HELPER_PATH && !(path === SPEC_PATH && stepsOnly(filled))) return;\n', ''],
  ['step-only fragments not wrapped', ' && !(path === SPEC_PATH && stepsOnly(filled))', ''],
  ['hooks counted as steps', ' && !TEST_CALL.test(withoutSteps)', ''],
  ['test-body pass without expect()', String.raw`  if (!/\bexpect\s*\(/.test(code)) return null;` + '\n', ''],
  ['exports not excluded', "  if (node.type.startsWith('Export')) return true;\n", ''],
  ['function declarations not excluded', "  if (node.type === 'FunctionDeclaration') return true;\n", ''],
  ['class declarations not excluded', "  if (node.type === 'ClassDeclaration' || node.type === 'TSModuleDeclaration') return true;\n", ''],
  ['arrow helpers not excluded', "  return node.type === 'VariableDeclaration' && node.declarations.some((d) => FUNCTION_LIKE.has(d.init?.type));", '  return false;'],
  ['test-body lines not mapped back', 'line: wrapped.map[m.line - 1]', 'line: m.line'],
  ['every rule kept from the test-body pass', 'res.real.push(...r.real.filter(inTestRule).map(back));', 'res.real.push(...r.real.map(back));'],
  ['test-body suppressions dropped', '  res.suppressed.push(...r.suppressed.filter(inTestRule).map(back));\n', ''],
  // the run
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
console.log('  every listed mutant is killed — each condition on the list has a harness case that notices it breaking\n');
