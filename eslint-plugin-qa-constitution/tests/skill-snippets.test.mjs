/**
 * Lint every TypeScript example in the skills. `npm run test:snippets`
 *
 * A skill is read by an agent and copied. An example that breaks a rule does not cause one bad test —
 * every session that loads the skill writes the same mistake, with the authority of "the skill said
 * so". The memory file has been held to the plugin's rules since it was written (memory-snippets);
 * the skills, which teach far more code, never were.
 *
 * What is linted: every ```ts / ```typescript block under .claude/skills/, with the plugin's smoke
 * config (all rules at error, the real tag whitelist). The run fails if no block is found at all,
 * because a parser that silently finds nothing would otherwise pass.
 *
 * Every block must parse as TypeScript, including the two kinds that are not linted:
 *  - Counter-examples, which teach by contrast and are meant to break rules. A block is one when
 *      1. its own first line is a comment that starts with a wrong-label (❌, BAD, WRONG,
 *         FORBIDDEN, ANTI-PATTERN), unless it starts with a right-label (✅, GOOD, CORRECT, FIX); or
 *      2. the prose line just above it labels it as wrong: the line starts with a wrong-label, or
 *         ends with "(BAD):", "(WRONG):" or ❌; or
 *      3. it sits under a heading or bold label that starts with a wrong-label (Bad / Wrong /
 *         Forbidden / Anti-pattern), or under a ❌ bullet — with no neutral prose in between once
 *         another block has intervened. ("### Bad" then a block, then "The fix:" then a block: only
 *         the first is skipped.)
 *    A wrong-label is the word itself followed by the end of the line, ":", "—", "–", "(", " - " or
 *    a closing "**", and not by a status code. So "### Bad — hard wait", "**Forbidden:**" and
 *    "// ❌ unsafe" are labels, and none of these is: "Bad request (400)", "Bad requests",
 *    "Bad-request matrix", "Forbidden — 403", "Forbidden: 403", "Wrong-tenant access",
 *    "Forbidden is what a zero-scope token gets:", "// 403 FORBIDDEN", "// DON'T share a token",
 *    "Avoid flaky tests", "This replaces the BAD version above:".
 *    Every counter-example is printed (COUNTER) with the line that labelled it, on every run.
 *  - Blocks marked `<!-- snippet-lint: skip — <reason> -->` on the line directly above the fence.
 *    The separator (em dash, en dash, hyphen or `--`) needs a space before it, so `skip-all` is
 *    not read as a reason. The reason must contain a word and must not be a placeholder: the
 *    template's own `<reason>`, or "reason", "TODO", "TBD", "FIXME", "WIP", "n/a", "none", also
 *    with trailing punctuation ("TODO.", "reason:", "TBD!").
 *    Every skip is printed with its reason on every run.
 *
 * Opt-outs inside a linted block:
 *  - `eslint-disable` comments are not hidden: each suppressed finding is printed, and one without
 *    a `-- reason` fails the run.
 *  - Inline rule configuration — `/* eslint <rule>: off *\/`, `/* eslint-env *\/`, `/* global *\/`
 *    — is a violation. It switches a rule off without leaving a suppressed finding behind, so it
 *    would hide a violation without a trace.
 *
 * Not checked: types. Snippets import modules that exist only in an adopting repository, so a real
 * `tsc` run cannot resolve them. Syntax IS checked: the TypeScript parser must accept the block.
 *
 * How a snippet becomes lintable:
 *  - Fences follow CommonMark: three or more backticks or tildes, any info string after the
 *    language (matched case-insensitively), closed by the same character at least as long. An
 *    unclosed fence fails the run.
 *  - Placeholders become identifiers: ALL-CAPS (`<RESOURCE>`, `<SUITE>`), lowercase or kebab
 *    (`<domain>`, `<base-url>`), a small set of PascalCase placeholder words (`<Resource>`,
 *    `<Entity>`…), and any `<Word>` glued to a following identifier (`Create<Resource>Schema`) or
 *    standing after a non-identifier (`/<id>`). A `<PascalType>` directly after an identifier is a
 *    real type argument and is left alone: `Promise<Job>`, `Partial<WorkerData>`, `test.extend<Pages>(`.
 *  - A fragment that does not parse on its own is retried inside a class body, then as object
 *    properties. Plain statements need no wrapper: the parser accepts top-level `await` and `return`.
 *  - A block written as a diff (`- old` / `+ new`) is linted as its "after" side.
 *  - The file name follows the block: a first-lines comment naming a path (`// config/env.ts`), a
 *    spec when it declares tests, a page object when it extends BasePage, a helper otherwise.
 *  - A test-body fragment is linted a second time inside a tagged test() wrapper (imports hoisted
 *    above it, line numbers mapped back). A fragment is a test body when it calls expect(),
 *    declares no function, class or export at top level, and either is linted as a helper or is
 *    linted as a spec only because of test.step(...) calls (a step is not a test, so on its own it
 *    gives the in-test rules nothing to attach to). Only the rules that need an enclosing test()
 *    are taken from that pass: no-conditional-in-test, no-try-catch-in-test,
 *    no-pom-instantiation-in-test. Not covered: a fragment that also declares a function at top
 *    level is a helper module, and its body is linted as one.
 */

import { ESLint } from 'eslint';
import tsParser from '@typescript-eslint/parser';
import { readFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const PLUGIN_DIR = fileURLToPath(new URL('..', import.meta.url)).replace(/\\/g, '/');
// The skills tree to lint. Overridable (first argument) so the harness's own fault-injection suite
// can run it against a throwaway tree with one planted defect.
const SKILLS = process.argv[2] ?? fileURLToPath(new URL('../../.claude/skills', import.meta.url));

function mdFiles(dir) {
  return readdirSync(dir).flatMap((f) => {
    const p = join(dir, f);
    return statSync(p).isDirectory() ? mdFiles(p) : f.endsWith('.md') ? [p] : [];
  });
}

const LABEL_LINE = /^#{2,6} |^\s*\*\*[^*]+\*\*|^\s*(?:[-*] )?(?:❌|✅)/;

/**
 * Fenced ts/typescript blocks. Each carries:
 *   line    — the fence line (1-based)
 *   nearest — the nearest non-empty line above the fence, NOT crossing another fence ('' if none)
 *   label   — the nearest heading / bold label / ❌✅ line above, walking past earlier blocks
 *   crossed — whether that walk crossed another block (the label then belongs to a sibling first)
 * Throws on an unclosed fence: silently dropping the rest of a file is the failure this prevents.
 */
export function snippets(md) {
  const out = [];
  const lines = md.split(/\r?\n/);
  let open = null; // { char, len, indent, lang, line, buf }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (open) {
      const close = /^(\s*)(`{3,}|~{3,})\s*$/.exec(line);
      if (close && close[2][0] === open.char && close[2].length >= open.len) {
        if (/^(ts|typescript)$/.test(open.lang)) out.push({ line: open.line, code: open.buf.join('\n'), ...context(lines, open.line - 1) });
        open = null;
      } else {
        open.buf.push(line.replace(new RegExp(`^ {0,${open.indent}}`), ''));
      }
      continue;
    }
    const opener = /^(\s*)(`{3,}|~{3,})\s*([^\s`]*)/.exec(line);
    if (opener) open = { char: opener[2][0], len: opener[2].length, indent: opener[1].length, lang: opener[3].toLowerCase(), line: i + 1, buf: [] };
  }
  if (open) throw new Error(`unclosed code fence opened at line ${open.line}`);
  return out;
}

/** The context above the fence at index `fenceIdx`. */
function context(lines, fenceIdx) {
  let nearest = '';
  for (let j = fenceIdx - 1; j >= 0; j--) {
    if (/^\s*(`{3,}|~{3,})/.test(lines[j])) break;
    if (lines[j].trim()) {
      nearest = lines[j];
      break;
    }
  }
  let label = '';
  let crossed = false;
  let inFence = false;
  for (let j = fenceIdx - 1, n = 0; j >= 0 && n < 60; j--, n++) {
    if (/^\s*(`{3,}|~{3,})/.test(lines[j])) {
      inFence = !inFence;
      crossed = true;
      continue;
    }
    if (inFence || !lines[j].trim()) continue;
    if (LABEL_LINE.test(lines[j])) {
      label = lines[j];
      break;
    }
  }
  return { nearest, label, crossed };
}

// A wrong-label: the marker word at the START of a line, followed by a label delimiter and not by a
// status code. "Bad request (400)", "Bad-request", "Forbidden — 403" and "Forbidden is …" are HTTP
// status names or plain sentences, not labels.
const WRONG_START = String.raw`(?:❌|(?:Bad|Wrong|Forbidden|Anti-?patterns?)\s*(?:$|[:—–(]|-\s|\*\*)(?!\s*\d{3}\b))`;
const WRONG_LABEL = new RegExp(String.raw`^\s*(?:#{2,6}\s*|\*\*\s*|[-*]\s*)?` + WRONG_START, 'i');
const RIGHT_LABEL = /^\s*(?:#{2,6}\s*|\*\*\s*|[-*]\s*)?(?:✅|(?:Good|Correct|Fix|Fixed|Right|Do)\b)/i;
// The block's own first line, when it is a comment that starts with a label.
const COMMENT = String.raw`^\s*\/[/*]\**\s*`;
const WRONG_COMMENT = new RegExp(COMMENT + WRONG_START, 'i');
const RIGHT_COMMENT = new RegExp(COMMENT + String.raw`(?:✅|(?:GOOD|CORRECT|FIX|FIXED|RIGHT)\b)`, 'i');
// Prose that ends by labelling what follows: "But never do THIS (BAD):".
const WRONG_TAIL = /(?:\((?:❌|bad|wrong)\)|❌)\s*:?\s*$/i;
// A right-word anywhere in the prose line above makes the block linted: the loud direction.
const RIGHT_WORD = /✅|\b(?:GOOD|CORRECT|FIX|FIXED|RIGHT)\b/;

/**
 * The line that makes a block a counter-example, or null — see the header for the three rules.
 * (A first line can't start with both a right- and a wrong-label, so their order does not matter.)
 */
export function counterExampleCue({ code, nearest, label, crossed }) {
  const first = code.split(/\r?\n/).find((l) => l.trim()) ?? '';
  if (RIGHT_COMMENT.test(first)) return null;
  if (WRONG_COMMENT.test(first)) return first;
  if (nearest && nearest !== label) {
    if (RIGHT_LABEL.test(nearest) || RIGHT_WORD.test(nearest)) return null;
    if (WRONG_LABEL.test(nearest)) return nearest;
    if (WRONG_TAIL.test(nearest)) return nearest;
    // Neutral prose after an earlier block: this block is introduced afresh, not by the label.
    if (crossed) return null;
  }
  return WRONG_LABEL.test(label) ? label : null;
}

export const isCounterExample = (block) => counterExampleCue(block) !== null;

// Reasons that are a template left unfilled, not a reason.
const PLACEHOLDER_REASON = /^(?:reason|todo|tbd|fixme|wip|n\/a|none)$/i;

/** `<!-- snippet-lint: skip — <reason> -->` on the line directly above the fence; see the header. */
export function skipReason(nearest) {
  const m = /<!--\s*snippet-lint:\s*skip\s+(?:—|–|--|-)\s*(\S.*?)\s*-->/.exec(nearest ?? '');
  if (!m) return null;
  const reason = m[1];
  if (!/\p{L}{2}/u.test(reason)) return null;
  if (/^<[^>]*>$/.test(reason)) return null;
  if (PLACEHOLDER_REASON.test(reason.replace(/[\s.:;!?…-]+$/u, ''))) return null;
  return reason;
}

// An inline rule-config comment switches a rule off without leaving a suppressed finding behind.
// Any block comment whose first word is the directive `eslint`, `eslint-env`, `global` or `globals`
// matches, as ESLint reads it: the rule name may be bare, "double-quoted" or 'single-quoted'.
// `eslint-disable` / `eslint-enable` do not match (the word is not followed by a space): they leave
// suppressed findings, which are printed.
const INLINE_CONFIG = /\/\*\s*(?:eslint|eslint-env|globals?)(?=\s|\*\/)/;

/** The first inline rule-config comment in a block, as { line, text }, or null. */
export function inlineConfig(code) {
  const m = INLINE_CONFIG.exec(code);
  if (!m) return null;
  return { line: code.slice(0, m.index).split('\n').length, text: m[0] };
}

// PascalCase words the skills use as placeholders rather than types.
const PASCAL_PLACEHOLDER = /^(?:Resource|Resources|Entity|Discriminator|HumanReadable|Dependent|Referenced|Type|Name|Field|Flow)$/;

/** Placeholders → identifiers; real type arguments untouched. */
export function fillPlaceholders(code) {
  return code.replace(/<([A-Za-z][\w-]*)>(?=(\w)?)/g, (m, word, glued, offset, s) => {
    const afterIdentifier = /[\w$]/.test(s[offset - 1] ?? '');
    const builtinType = /^(?:void|string|number|boolean|bigint|symbol|object|unknown|never|any|null|undefined)$/.test(word);
    const placeholderWord =
      !builtinType &&
      (/-/.test(word) || /^[a-z]/.test(word) || (/^[A-Z][A-Z0-9_]+$/.test(word) && word.length > 1) || PASCAL_PLACEHOLDER.test(word));
    const typeArgument = afterIdentifier && glued === undefined && !placeholderWord;
    return typeArgument ? m : `X${word.replace(/-/g, '_')}`;
  });
}

/** A ```ts block written as a diff (`- old` / `+ new`) is linted as its "after" side. */
export function afterSideOfDiff(code) {
  const lines = code.split('\n').filter((l) => l.trim());
  const marked = lines.filter((l) => /^[+-] /.test(l)).length;
  if (marked === 0 || marked < lines.length / 2) return code;
  return code
    .split('\n')
    .filter((l) => !/^- /.test(l))
    .map((l) => l.replace(/^[+ ] /, ''))
    .join('\n');
}

const SPEC_PATH = 'tests/app/api/snippet/snippet.spec.ts';
// `(?<![.\w$])` so a `/re/.test(x)` call is not mistaken for a test declaration.
const TEST_CALL = /(?<![.\w$])(?:test|it)(?:\.\w+)?\s*\(/;
const HELPER_PATH = 'helpers/app/snippet.ts';

/** The path a snippet is linted as. */
export function virtualPath(code) {
  const head = /^\s*\/\/\s*([\w./-]+\.(?:ts|mts))\b/m.exec(code.split('\n').slice(0, 3).join('\n'));
  if (head) return head[1];
  if (TEST_CALL.test(code)) return SPEC_PATH;
  if (/extends\s+BasePage\b/.test(code)) return 'pages/app/SnippetPage.ts';
  return HELPER_PATH;
}

const FUNCTION_LIKE = new Set(['ArrowFunctionExpression', 'FunctionExpression', 'ClassExpression']);

/** A top-level statement that makes the fragment a helper module, not a test body. */
function declaresHelper(node) {
  if (node.type.startsWith('Export')) return true;
  if (node.type === 'FunctionDeclaration') return true;
  if (node.type === 'ClassDeclaration' || node.type === 'TSModuleDeclaration') return true;
  return node.type === 'VariableDeclaration' && node.declarations.some((d) => FUNCTION_LIKE.has(d.init?.type));
}

const TEST_OPEN = "test('snippet', { tag: '@App-API' }, async () => {";

/**
 * A test-body fragment wrapped in a tagged test(), its imports hoisted above the wrapper:
 * { src, map } where map[i] is the block line of wrapped line i + 1. Null when the fragment does
 * not call expect(), does not parse, or declares a helper at top level.
 */
export function asTestBody(code) {
  if (!/\bexpect\s*\(/.test(code)) return null;
  let ast;
  try {
    ast = tsParser.parse(code, { ecmaVersion: 2022, sourceType: 'module', loc: true });
  } catch {
    return null;
  }
  if (ast.body.some(declaresHelper)) return null;
  const imported = new Set();
  for (const n of ast.body) if (n.type === 'ImportDeclaration') for (let l = n.loc.start.line; l <= n.loc.end.line; l++) imported.add(l);
  const lines = code.split('\n');
  const rows = (isImport) => lines.flatMap((text, i) => (imported.has(i + 1) === isImport ? [[text, i + 1]] : []));
  const all = [...rows(true), [TEST_OPEN, 1], ...rows(false), ['});', lines.length]];
  return { src: all.map(([t]) => t).join('\n'), map: all.map(([, n]) => n) };
}

const IN_TEST_RULES = new Set(['qa-constitution/no-conditional-in-test', 'qa-constitution/no-try-catch-in-test', 'qa-constitution/no-pom-instantiation-in-test']);
const inTestRule = (m) => IN_TEST_RULES.has(m.ruleId);

// The smoke config, plus eslint-plugin-playwright registered (rules off): a snippet may carry an
// `eslint-disable` for one of its rules, and an unregistered rule in a directive is itself an error.
// Unused directives are not reported (the playwright rules are off here); suppressions are, below.
const { default: playwright } = await import('eslint-plugin-playwright');
// Per process, defensively: lintText never creates this folder, but parallel runs must not share a work dir.
const WORK_DIR = `.skill-snippets-${process.pid}`;
const eslint = new ESLint({
  cwd: PLUGIN_DIR,
  overrideConfigFile: 'smoke/eslint.config.mjs',
  overrideConfig: [
    { files: ['**/*.ts'], plugins: { playwright }, linterOptions: { reportUnusedDisableDirectives: 'off' } },
  ],
});
// Parse only, no rules: counter-examples and marked blocks must still be TypeScript.
const parser = new ESLint({
  cwd: PLUGIN_DIR,
  overrideConfigFile: true,
  allowInlineConfig: false,
  overrideConfig: [{ files: ['**/*.ts'], languageOptions: { parser: tsParser, ecmaVersion: 2022, sourceType: 'module' } }],
});

async function lintAs(engine, code, path) {
  const [r] = await engine.lintText(code, { filePath: join(PLUGIN_DIR, WORK_DIR, path) });
  const msgs = r?.messages ?? [];
  return { fatal: msgs.find((m) => m.fatal), real: msgs.filter((m) => !m.fatal), suppressed: r?.suppressedMessages ?? [] };
}

/** The block as linted (diff after-side, placeholders filled) and the wrappers tried in order. */
function prepare(code) {
  const filled = fillPlaceholders(afterSideOfDiff(code));
  const tries = [
    [filled, 0],
    [`class __Snippet {\n${filled}\n}`, 1],
    [`const __snippet = {\n${filled}\n};`, 1],
  ];
  return { filled, tries };
}

/** True when the only test-like calls in a block are test.step(...): steps, but no test or hook. */
export function stepsOnly(code) {
  const withoutSteps = code.replace(/(?<![.\w$])test\.step\s*\(/g, '');
  return withoutSteps !== code && !TEST_CALL.test(withoutSteps);
}

/** Second pass for a test-body fragment: the in-test rules, inside a synthetic test(). */
async function addTestBodyFindings(filled, path, res) {
  if (path !== HELPER_PATH && !(path === SPEC_PATH && stepsOnly(filled))) return;
  const wrapped = asTestBody(filled);
  if (!wrapped) return;
  const r = await lintAs(eslint, wrapped.src, SPEC_PATH);
  if (r.fatal) return;
  const back = (m) => ({ ...m, line: wrapped.map[m.line - 1] });
  res.real.push(...r.real.filter(inTestRule).map(back));
  res.suppressed.push(...r.suppressed.filter(inTestRule).map(back));
}

/**
 * Lint as written; if it does not parse, retry as class members, then as object-literal
 * properties (a `headers: tokens.full(),` fragment). Line numbers are mapped back to the block.
 */
export async function lintSnippet(code) {
  const { filled, tries } = prepare(code);
  const path = virtualPath(filled);
  let firstFatal = null;
  for (const [src, shift] of tries) {
    const { fatal, real, suppressed } = await lintAs(eslint, src, path);
    if (fatal) {
      firstFatal ??= fatal;
      continue;
    }
    const back = (m) => ({ ...m, line: m.line - shift });
    const res = { path, real: real.map(back), suppressed: suppressed.map(back) };
    await addTestBodyFindings(filled, path, res);
    const inline = inlineConfig(filled);
    if (inline)
      res.real.push({
        ruleId: 'snippet-lint/inline-config',
        line: inline.line,
        message: `"${inline.text}" is inline rule configuration, which is not an allowed opt-out — use eslint-disable with "-- reason", or a snippet-lint skip marker`,
      });
    return res;
  }
  return { path, parse: firstFatal };
}

/** Parse only (no rules), with the same wrappers: { parse } holds the error when no wrapper parses. */
export async function parseSnippet(code) {
  let firstFatal = null;
  for (const [src] of prepare(code).tries) {
    const { fatal } = await lintAs(parser, src, HELPER_PATH);
    if (!fatal) return {};
    firstFatal ??= fatal;
  }
  return { parse: firstFatal };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  mkdirSync(join(PLUGIN_DIR, WORK_DIR), { recursive: true });
  const report = { linted: 0, counter: [], marked: [], suppressed: [], parse: [], violations: [], errors: [] };
  const checkParses = async (rel, block, kind) => {
    const { parse } = await parseSnippet(block.code);
    if (parse) report.parse.push(`${rel}:${block.line} +${parse.line}  ${parse.message} (${kind}: parsed, not linted)`);
  };
  for (const file of mdFiles(SKILLS)) {
    const rel = relative(join(SKILLS, '..', '..'), file).replace(/\\/g, '/');
    let blocks;
    try {
      blocks = snippets(readFileSync(file, 'utf8'));
    } catch (e) {
      report.errors.push(`${rel}  ${e.message}`);
      continue;
    }
    for (const block of blocks) {
      const reason = skipReason(block.nearest);
      if (reason) {
        report.marked.push(`${rel}:${block.line}  ${reason}`);
        await checkParses(rel, block, 'marked skip');
        continue;
      }
      const cue = counterExampleCue(block);
      if (cue) {
        report.counter.push(`${rel}:${block.line}  ${cue.trim()}`);
        await checkParses(rel, block, 'counter-example');
        continue;
      }
      report.linted++;
      const res = await lintSnippet(block.code);
      if (res.parse) {
        report.parse.push(`${rel}:${block.line} +${res.parse.line}  ${res.parse.message}`);
        continue;
      }
      for (const s of res.suppressed.filter((m) => m.ruleId?.startsWith('qa-constitution/'))) {
        const why = s.suppressions?.map((x) => x.justification).find((j) => j && j.trim());
        if (why) report.suppressed.push(`${rel}:${block.line} +${s.line}  ${s.ruleId}  — ${why}`);
        else report.violations.push(`${rel}:${block.line} +${s.line}  ${s.ruleId} suppressed by an eslint-disable with no "-- reason"`);
      }
      if (res.real.length)
        report.violations.push(
          `${rel}:${block.line} (as ${res.path})\n` +
            res.real.map((m) => `      +${m.line}  ${(m.ruleId ?? 'eslint').replace('qa-constitution/', '')} — ${m.message}`).join('\n')
        );
    }
  }
  rmSync(join(PLUGIN_DIR, WORK_DIR), { recursive: true, force: true });
  console.log(
    `\nSkill snippets — ${report.linted} linted, ${report.counter.length} counter-examples (parsed, not linted), ${report.marked.length} marked skip, ${report.suppressed.length} suppressed with a reason\n`
  );
  // Every opt-out stays visible: counter-examples with the line that labelled them, explicit skips
  // and reasoned eslint-disables, every run.
  for (const c of report.counter) console.log(`  COUNTER  ${c}`);
  for (const m of report.marked) console.log(`  SKIP     ${m}`);
  for (const s of report.suppressed) console.log(`  DISABLED ${s}`);
  if (report.counter.length || report.marked.length || report.suppressed.length) console.log('');
  for (const e of report.errors) console.log(`  FENCE    ${e}`);
  for (const p of report.parse) console.log(`  PARSE    ${p}`);
  for (const v of report.violations) console.log(`  VIOLATES ${v}`);
  // Fail when no block was FOUND at all (linted, counter-example or marked): a fence parser that
  // silently finds nothing would otherwise pass. A tree whose blocks are all counter-examples is fine.
  const found = report.linted + report.counter.length + report.marked.length;
  if (found === 0) report.errors.push('no TypeScript block was linted — the fences were not found');
  const failed = report.errors.length + report.parse.length + report.violations.length;
  console.log('');
  if (failed) {
    if (found === 0) console.log('  no TypeScript block was linted — the fences were not found');
    console.log(`  ${failed} problem(s): skill snippets break the syntax or the rules the skills teach.`);
    process.exit(1);
  }
  console.log('  every skill snippet parses, and every linted one complies with the constitution it teaches');
}
